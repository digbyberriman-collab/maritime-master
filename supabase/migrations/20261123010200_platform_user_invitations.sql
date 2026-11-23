-- =================================================================
-- PLATFORM P3: honest invitations (gap/01 F46, W2; gap/03 B7; Phase 2 spec
-- §A.9; proposed D-121)
-- Tables: user_invitations (one live row per profile)
-- Helpers: reserve_invitation_attempt() (service role; the edge functions
--   reserve the attempt number before generating a link),
--   record_invitation_send() (service role; the edge functions record every
--   send outcome), revoke_invitation() (users-access admins),
--   expire_invitations() (service role; for a later cron),
--   invitation_withdraw_access() (internal to revoke / expire)
-- TS mirror: src/modules/auth/types/db.pending.ts (AuthPendingTables
--   user_invitations, AuthPendingFunctions revoke_invitation),
--   src/modules/auth/services/invitations.ts
-- =================================================================
--
-- There was no invitations table: invite state lived on profiles
-- (account_status, invited_at, last_invited_at, invitation_count,
-- invitation_token*), and the old flow stamped 'invited' even when the
-- email failed. user_invitations records every attempt honestly (status
-- pending | sent | send_failed | accepted | expired | revoked, attempts,
-- the last error as a stable code, never provider text or an address) and
-- keeps the legacy profile columns in step: a profile becomes 'invited'
-- only after a send that worked.
--
-- Legacy 'invited' profiles are backfilled as pending with
-- last_error_code 'legacy_unverified' (the old flow cannot prove it sent
-- anything; the UI says "Sent before delivery tracking — resend to
-- confirm"); those who have signed in since are accepted. Sign-in evidence
-- is coalesce(profiles.last_login_at, auth.users.last_sign_in_at): nothing
-- wrote last_login_at before Phase 2, auth records every sign-in.
-- record_session_start() (file 3) marks a live invitation accepted at the
-- first sign-in.
--
-- Ending a live invitation that was never accepted (revoke, expiry) also
-- withdraws the access it opened (gap/01 W2 row 8): a profile that is
-- still invited and has never signed in goes back to not_invited, and the
-- legacy-managed membership of that login that was never accepted is
-- removed, so the invitee gets nothing even with a link already emailed
-- or a password reset (user_is_active() is false; my_account_status() and
-- record_session_start() answer 'disabled'). A sent invitation
-- (record_invitation_send) restores both. Active, disabled and
-- deactivated profiles keep their state.
--
-- Attempt numbers (D-146 idempotency keys invite:<profile>:<attempt>): the
-- edge reserves the next number with reserve_invitation_attempt() before
-- it generates any link (cooldown 5 minutes after a send, 30 seconds after
-- a failed attempt, under the profile lock, so a double click or two
-- concurrent requests send once); record_invitation_send() then records
-- the outcome of that attempt without counting it again. Numbers stay
-- monotonic across revoke and re-invite (the maximum over all the
-- profile's rows and the legacy invitation_count).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.account_memberships') IS NULL OR to_regprocedure('public.user_is_active(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010200_platform_user_invitations needs account_memberships and user_is_active(): apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.has_capability(text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010200_platform_user_invitations needs has_capability(): apply 20261123000400_platform_capabilities.sql first';
  END IF;
  IF to_regprocedure('public.profiles_guard_access_columns()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010200_platform_user_invitations needs the profile access guard: apply 20261123010000_platform_user_status.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- table

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  user_id uuid NULL,
  membership_id uuid NULL,
  kind text NOT NULL DEFAULT 'crew',
  status text NOT NULL DEFAULT 'pending',
  send_attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NULL,
  last_sent_at timestamptz NULL,
  last_error_code text NULL,
  provider_message_id text NULL,
  expires_at timestamptz NULL,
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  revoked_by uuid NULL,
  invited_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT user_invitations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT user_invitations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT user_invitations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT user_invitations_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.account_memberships(id) ON DELETE SET NULL,
  CONSTRAINT user_invitations_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT user_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT user_invitations_kind_check CHECK (kind IN ('owner', 'admin', 'shore', 'crew', 'external')),
  CONSTRAINT user_invitations_status_check CHECK (status IN ('pending', 'sent', 'send_failed', 'accepted', 'expired', 'revoked')),
  CONSTRAINT user_invitations_send_attempts_check CHECK (send_attempts >= 0),
  CONSTRAINT user_invitations_last_error_code_check CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT user_invitations_provider_message_id_check CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_live_key ON public.user_invitations (profile_id) WHERE status IN ('pending', 'sent', 'send_failed');
CREATE INDEX IF NOT EXISTS idx_user_invitations_company_status ON public.user_invitations (company_id, status);
CREATE INDEX IF NOT EXISTS idx_user_invitations_user ON public.user_invitations (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- Grants first (rule 4): reads only; every write goes through the definers.
REVOKE ALL ON TABLE public.user_invitations FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_invitations TO authenticated;
GRANT ALL ON TABLE public.user_invitations TO service_role;

DROP TRIGGER IF EXISTS trg_user_invitations_updated_at ON public.user_invitations;
CREATE TRIGGER trg_user_invitations_updated_at
  BEFORE UPDATE ON public.user_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS user_invitations_select ON public.user_invitations;
CREATE POLICY user_invitations_select ON public.user_invitations
  FOR SELECT TO authenticated
  USING (public.has_capability('admin.access.users_access.view', company_id));

-- ---------------------------------------------------------------- record_invitation_send (service role)

-- The edge functions record every send attempt with the outcome they
-- actually got. Refusals: 22023 outcome_invalid, error_code_invalid (a
-- send_failed needs a stable snake_case code), kind_invalid,
-- profile_without_company; P0002 profile_not_found; 42501
-- inviter_not_member (p_invited_by is not an active member of the
-- profile's company); 23505 user_linked_elsewhere (p_user_id belongs to
-- another profile, or the profile has another login). Upserts the profile's
-- live row; a sent invitation also stamps the legacy profile columns
-- (account_status 'invited' unless active / disabled / deactivated,
-- last_invited_at, invited_at, invitation_count) and brings back a
-- legacy-managed membership a revoke or expiry removed, under
-- storm.access_engine; a failed one never does (it only links the login
-- when given). The attempt count is the reserved one
-- (reserve_invitation_attempt): an update keeps it (at least 1); a new
-- live row (no reservation) takes the next number. A failed send with
-- 'provider_duplicate' on a row already sent keeps it sent (the provider
-- refused a duplicate of an email that went out: never a downgrade).
CREATE OR REPLACE FUNCTION public.record_invitation_send(
  p_profile_id uuid,
  p_outcome text,
  p_error_code text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_invited_by uuid DEFAULT NULL,
  p_kind text DEFAULT 'crew',
  p_expires_at timestamptz DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS public.user_invitations
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_sent boolean;
  v_duplicate boolean;
  v_user uuid;
  v_membership uuid;
  v_next integer;
  v_result public.user_invitations;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent', 'send_failed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'outcome_invalid';
  END IF;
  v_sent := p_outcome = 'sent';
  v_duplicate := NOT v_sent AND p_error_code = 'provider_duplicate';
  IF NOT v_sent AND (p_error_code IS NULL OR p_error_code !~ '^[a-z][a-z0-9_]{0,63}$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'error_code_invalid';
  END IF;
  IF coalesce(p_kind, 'crew') NOT IN ('owner', 'admin', 'shore', 'crew', 'external') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'kind_invalid';
  END IF;
  IF p_provider_message_id IS NOT NULL AND length(p_provider_message_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'provider_message_id_invalid';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found';
  END IF;
  IF v_profile.company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'profile_without_company';
  END IF;
  IF p_invited_by IS NOT NULL AND NOT (
    EXISTS (SELECT 1 FROM public.profiles AS i WHERE i.user_id = p_invited_by AND i.company_id = v_profile.company_id)
    AND public.user_is_active(p_invited_by)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'inviter_not_member';
  END IF;
  IF p_user_id IS NOT NULL AND (
    (v_profile.user_id IS NOT NULL AND v_profile.user_id <> p_user_id)
    OR EXISTS (SELECT 1 FROM public.profiles AS o WHERE o.user_id = p_user_id AND o.id <> v_profile.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'user_linked_elsewhere';
  END IF;
  v_user := coalesce(v_profile.user_id, p_user_id);

  PERFORM set_config('storm.access_engine', 'on', true);

  IF v_sent THEN
    UPDATE public.profiles
    SET account_status = CASE
          WHEN lower(coalesce(account_status, '')) IN ('active', 'disabled', 'deactivated') THEN account_status
          ELSE 'invited'
        END,
        last_invited_at = now(),
        invited_at = coalesce(invited_at, now()),
        invitation_count = coalesce(invitation_count, 0) + 1,
        user_id = coalesce(user_id, p_user_id)
    WHERE id = v_profile.id;
  ELSIF v_profile.user_id IS NULL AND p_user_id IS NOT NULL THEN
    UPDATE public.profiles SET user_id = p_user_id WHERE id = v_profile.id;
  END IF;

  -- A sent invitation brings back the legacy membership a revoke or an
  -- expiry removed (the profile sync never does, file 3).
  IF v_sent AND v_user IS NOT NULL AND lower(coalesce(v_profile.account_status, '')) NOT IN ('disabled', 'deactivated') THEN
    UPDATE public.account_memberships
    SET status = 'active', removed_at = NULL
    WHERE company_id = v_profile.company_id AND user_id = v_user AND legacy_managed AND status = 'removed';
  END IF;

  SELECT greatest(coalesce(max(ui.send_attempts), 0), coalesce(v_profile.invitation_count, 0)) + 1
    INTO v_next
  FROM public.user_invitations AS ui
  WHERE ui.profile_id = v_profile.id;

  SELECT m.id INTO v_membership
  FROM public.account_memberships AS m
  WHERE m.company_id = v_profile.company_id
    AND ((v_user IS NOT NULL AND m.user_id = v_user) OR m.profile_id = v_profile.id)
  ORDER BY (m.user_id IS NOT DISTINCT FROM v_user) DESC, m.created_at
  LIMIT 1;

  INSERT INTO public.user_invitations AS ui (
    company_id, profile_id, user_id, membership_id, kind, status, send_attempts,
    last_attempt_at, last_sent_at, last_error_code, provider_message_id, expires_at, invited_by
  ) VALUES (
    v_profile.company_id, v_profile.id, v_user, v_membership, coalesce(p_kind, 'crew'), p_outcome, v_next,
    now(), CASE WHEN v_sent THEN now() END, CASE WHEN v_sent THEN NULL ELSE p_error_code END,
    p_provider_message_id, coalesce(p_expires_at, now() + interval '7 days'), p_invited_by
  )
  ON CONFLICT (profile_id) WHERE status IN ('pending', 'sent', 'send_failed') DO UPDATE
  SET status = CASE WHEN v_duplicate AND ui.status = 'sent' THEN 'sent' ELSE EXCLUDED.status END,
      send_attempts = greatest(ui.send_attempts, 1),
      last_attempt_at = now(),
      last_sent_at = CASE WHEN EXCLUDED.status = 'sent' THEN now() ELSE ui.last_sent_at END,
      last_error_code = CASE WHEN v_duplicate AND ui.status = 'sent' THEN ui.last_error_code ELSE EXCLUDED.last_error_code END,
      provider_message_id = CASE WHEN v_duplicate AND ui.status = 'sent' THEN ui.provider_message_id ELSE EXCLUDED.provider_message_id END,
      expires_at = CASE WHEN v_duplicate AND ui.status = 'sent' THEN ui.expires_at ELSE EXCLUDED.expires_at END,
      user_id = coalesce(EXCLUDED.user_id, ui.user_id),
      membership_id = coalesce(EXCLUDED.membership_id, ui.membership_id),
      kind = EXCLUDED.kind,
      invited_by = coalesce(EXCLUDED.invited_by, ui.invited_by)
  RETURNING * INTO v_result;

  PERFORM set_config('storm.access_engine', '', true);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------- reserve_invitation_attempt (service role)

-- Called by the edge functions before they generate a link, so one
-- idempotency key (invite:<profile>:<attempt>, D-146) only ever carries one
-- payload. Under the profile lock and the live row lock (a live 'pending'
-- row with this file's defaults is created when there is none):
--   unknown profile (or no company)     {"ok": false, "code": "not_found"}
--   disabled / deactivated profile      {"ok": false, "code": "disabled"}
--   inside the cooldown                 {"ok": false, "code": "cooldown", "retry_after_seconds": n}
--     until = max(last_sent_at + 5 min, last_attempt_at + 30 s after a
--     failed attempt, else + 5 min)
--   otherwise the next attempt number   {"ok": true, "invitation_id": <uuid>, "attempt": n}
--     n = greatest(max(send_attempts) over all the profile's rows,
--     invitation_count) + 1, stamped on the live row with last_attempt_at.
-- p_invited_by is kept on a new row only when it is an active member of
-- the profile's company; 22023 kind_invalid for a kind outside the
-- membership vocabulary.
CREATE OR REPLACE FUNCTION public.reserve_invitation_attempt(p_profile_id uuid, p_invited_by uuid DEFAULT NULL, p_kind text DEFAULT 'crew')
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_live public.user_invitations;
  v_membership uuid;
  v_inviter uuid;
  v_until timestamptz;
  v_attempt integer;
BEGIN
  IF coalesce(p_kind, 'crew') NOT IN ('owner', 'admin', 'shore', 'crew', 'external') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'kind_invalid';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_profile.company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF lower(coalesce(v_profile.account_status, '')) IN ('disabled', 'deactivated') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'disabled');
  END IF;

  SELECT * INTO v_live FROM public.user_invitations
  WHERE profile_id = v_profile.id AND status IN ('pending', 'sent', 'send_failed')
  FOR UPDATE;
  IF NOT FOUND THEN
    v_inviter := CASE
      WHEN p_invited_by IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.profiles AS i WHERE i.user_id = p_invited_by AND i.company_id = v_profile.company_id)
           AND public.user_is_active(p_invited_by)
      THEN p_invited_by
    END;
    SELECT m.id INTO v_membership
    FROM public.account_memberships AS m
    WHERE m.company_id = v_profile.company_id
      AND ((v_profile.user_id IS NOT NULL AND m.user_id = v_profile.user_id) OR m.profile_id = v_profile.id)
    ORDER BY (m.user_id IS NOT DISTINCT FROM v_profile.user_id) DESC, m.created_at
    LIMIT 1;
    INSERT INTO public.user_invitations (company_id, profile_id, user_id, membership_id, kind, status, send_attempts, expires_at, invited_by)
    VALUES (v_profile.company_id, v_profile.id, v_profile.user_id, v_membership, coalesce(p_kind, 'crew'), 'pending', 0, now() + interval '7 days', v_inviter)
    RETURNING * INTO v_live;
  END IF;

  v_until := greatest(
    v_live.last_sent_at + interval '5 minutes',
    v_live.last_attempt_at + CASE WHEN v_live.status = 'send_failed' THEN interval '30 seconds' ELSE interval '5 minutes' END
  );
  IF v_until IS NOT NULL AND v_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'cooldown',
                              'retry_after_seconds', greatest(1, ceil(extract(epoch FROM v_until - now())))::integer);
  END IF;

  SELECT greatest(coalesce(max(ui.send_attempts), 0), coalesce(v_profile.invitation_count, 0)) + 1
    INTO v_attempt
  FROM public.user_invitations AS ui
  WHERE ui.profile_id = v_profile.id;

  UPDATE public.user_invitations
  SET send_attempts = v_attempt, last_attempt_at = now()
  WHERE id = v_live.id;

  RETURN jsonb_build_object('ok', true, 'invitation_id', v_live.id, 'attempt', v_attempt);
END;
$$;

-- ---------------------------------------------------------------- revoke / expire

-- Withdraws the access an ended, never-accepted invitation opened (revoke,
-- expiry), under storm.access_engine: a profile still 'invited' with no
-- sign-in evidence (coalesce(last_login_at, auth last_sign_in_at)) goes
-- back to 'not_invited' (with the JWT claims suspended for that one
-- statement, as record_session_start does for the legacy guard, D-141),
-- and the legacy-managed membership of the login that was never accepted
-- is removed. Active, disabled and deactivated profiles are left alone.
-- Internal to revoke_invitation() and expire_invitations().
CREATE OR REPLACE FUNCTION public.invitation_withdraw_access(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.user_invitations;
  v_profile public.profiles;
  v_state text;
  v_signed_in timestamptz;
  v_user uuid;
  v_engine text := current_setting('storm.access_engine', true);
  v_claims text;
  v_sub text;
BEGIN
  SELECT * INTO v_inv FROM public.user_invitations WHERE id = p_invitation_id;
  IF NOT FOUND OR v_inv.accepted_at IS NOT NULL OR v_inv.status NOT IN ('revoked', 'expired') THEN
    RETURN;
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_inv.profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_state := lower(coalesce(v_profile.account_status, 'active'));
  IF v_state NOT IN ('invited', 'not_invited') THEN
    RETURN;
  END IF;
  v_signed_in := coalesce(v_profile.last_login_at,
                          (SELECT u.last_sign_in_at FROM auth.users AS u WHERE u.id = v_profile.user_id));
  v_user := coalesce(v_inv.user_id, v_profile.user_id);

  PERFORM set_config('storm.access_engine', 'on', true);
  IF v_state = 'invited' AND v_signed_in IS NULL THEN
    v_claims := current_setting('request.jwt.claims', true);
    v_sub := current_setting('request.jwt.claim.sub', true);
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    UPDATE public.profiles SET account_status = 'not_invited' WHERE id = v_profile.id AND account_status = 'invited';
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  END IF;
  IF v_user IS NOT NULL THEN
    UPDATE public.account_memberships
    SET status = 'removed', removed_at = now()
    WHERE company_id = v_inv.company_id AND user_id = v_user AND legacy_managed
      AND accepted_at IS NULL AND status <> 'removed';
  END IF;
  PERFORM set_config('storm.access_engine', coalesce(v_engine, ''), true);
END;
$$;

-- A users-access admin of the invitation's company revokes a live
-- invitation and withdraws the access it opened when it was never
-- accepted (invitation_withdraw_access). 42501 not_permitted (inactive
-- caller, no capability there); P0002 invitation_not_found /
-- invitation_not_live.
CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id uuid)
RETURNS public.user_invitations
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.user_invitations;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  SELECT * INTO v_inv FROM public.user_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'invitation_not_found';
  END IF;
  IF NOT public.has_capability('admin.access.users_access.admin', v_inv.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF v_inv.status NOT IN ('pending', 'sent', 'send_failed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'invitation_not_live';
  END IF;
  UPDATE public.user_invitations
  SET status = 'revoked', revoked_at = now(), revoked_by = v_uid
  WHERE id = v_inv.id
  RETURNING * INTO v_inv;
  PERFORM public.invitation_withdraw_access(v_inv.id);
  RETURN v_inv;
END;
$$;

-- Live invitations past expires_at become expired, and the access each
-- opened is withdrawn when it was never accepted; returns the count. For a
-- later cron (owner action, spec §G 6; not scheduled in Phase 2).
CREATE OR REPLACE FUNCTION public.expire_invitations()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_id uuid;
BEGIN
  WITH expired AS (
    UPDATE public.user_invitations
    SET status = 'expired'
    WHERE status IN ('pending', 'sent', 'send_failed')
      AND expires_at IS NOT NULL
      AND expires_at < now()
    RETURNING id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM expired;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM public.invitation_withdraw_access(v_id);
  END LOOP;
  RETURN coalesce(array_length(v_ids, 1), 0);
END;
$$;

-- ---------------------------------------------------------------- backfill (legacy invited profiles)

-- Profiles marked invited by the old flow and without any invitation row:
-- pending + legacy_unverified, or accepted (at the sign-in) when they have
-- signed in since: coalesce(profiles.last_login_at, auth last_sign_in_at).
INSERT INTO public.user_invitations (
  company_id, profile_id, user_id, membership_id, kind, status, send_attempts,
  last_attempt_at, last_sent_at, last_error_code, expires_at, accepted_at
)
SELECT p.company_id, p.id, p.user_id,
       (SELECT m.id FROM public.account_memberships AS m
         WHERE m.company_id = p.company_id AND ((p.user_id IS NOT NULL AND m.user_id = p.user_id) OR m.profile_id = p.id)
         ORDER BY m.created_at LIMIT 1),
       CASE WHEN p.role::text IN ('dpa', 'shore_management') THEN 'admin' ELSE 'crew' END,
       CASE WHEN s.signed_in_at IS NOT NULL THEN 'accepted' ELSE 'pending' END,
       greatest(coalesce(p.invitation_count, 0), 0),
       p.last_invited_at,
       p.last_invited_at,
       CASE WHEN s.signed_in_at IS NOT NULL THEN NULL ELSE 'legacy_unverified' END,
       coalesce(p.invitation_token_expires, p.last_invited_at + interval '7 days'),
       s.signed_in_at
FROM public.profiles AS p
LEFT JOIN auth.users AS u ON u.id = p.user_id
CROSS JOIN LATERAL (SELECT coalesce(p.last_login_at, u.last_sign_in_at) AS signed_in_at) AS s
WHERE p.account_status = 'invited'
  AND p.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_invitations AS ui WHERE ui.profile_id = p.id);

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.record_invitation_send(uuid, text, text, text, uuid, text, timestamptz, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_invitation_attempt(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invitation_withdraw_access(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_invitations() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_invitation_send(uuid, text, text, text, uuid, text, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_attempt(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_invitations() TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.user_invitations IS 'Honest invitations (gap/01 F46; D-121): one live row (pending | sent | send_failed) per profile, then accepted | expired | revoked. send_attempts, last_attempt_at, last_sent_at, last_error_code (stable codes only, never provider text or addresses). No email column (the profile holds it). Read: users-access viewers of the company. Writes: record_invitation_send (service role), revoke_invitation, expire_invitations, record_session_start.';
COMMENT ON COLUMN public.user_invitations.last_error_code IS 'Stable snake_case code of the last failed attempt (e.g. provider_rejected, not_configured, legacy_unverified); NULL after a successful send.';
COMMENT ON FUNCTION public.record_invitation_send(uuid, text, text, text, uuid, text, timestamptz, uuid) IS 'Records one invitation send outcome (sent | send_failed with a code) on the profile''s live row for the reserved attempt (not counted again); only a sent invitation stamps profiles.account_status invited and restores a removed legacy membership (under storm.access_engine); provider_duplicate never downgrades a sent row. Service role only (send-invitation, bulk-invite, admin-actions).';
COMMENT ON FUNCTION public.reserve_invitation_attempt(uuid, uuid, text) IS 'D-146: reserves the next invitation attempt number before a link is generated, under the profile and live-row locks: {ok, invitation_id, attempt} or {ok: false, code: not_found | disabled | cooldown (retry_after_seconds)}. Cooldown 5 min after a send, 30 s after a failed attempt. Service role only.';
COMMENT ON FUNCTION public.invitation_withdraw_access(uuid) IS 'Internal to revoke / expire: for an ended, never-accepted invitation, a still-invited profile without sign-in evidence -> not_invited and the never-accepted legacy membership -> removed (under storm.access_engine). Active / disabled profiles untouched.';
COMMENT ON FUNCTION public.revoke_invitation(uuid) IS 'A users-access admin of the invitation''s company revokes a live invitation and withdraws the access it opened when never accepted (42501 not_permitted; P0002 invitation_not_found / invitation_not_live).';
COMMENT ON FUNCTION public.expire_invitations() IS 'Live invitations past expires_at -> expired, access withdrawn when never accepted; returns the count. Service role (a later cron).';
