-- =================================================================
-- PLATFORM P3: honest invitations (gap/01 F46, W2; gap/03 B7; Phase 2 spec
-- §A.9; proposed D-121)
-- Tables: user_invitations (one live row per profile)
-- Helpers: record_invitation_send() (service role; the edge functions
--   record every send outcome), revoke_invitation() (users-access admins),
--   expire_invitations() (service role; for a later cron)
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
-- confirm"); those who have signed in since are accepted.
-- record_session_start() (file 3) marks a live invitation accepted at the
-- first sign-in.
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
-- last_invited_at, invited_at, invitation_count) under storm.access_engine;
-- a failed one never does (it only links the login when given).
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
  v_user uuid;
  v_membership uuid;
  v_result public.user_invitations;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent', 'send_failed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'outcome_invalid';
  END IF;
  v_sent := p_outcome = 'sent';
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
    v_profile.company_id, v_profile.id, v_user, v_membership, coalesce(p_kind, 'crew'), p_outcome, 1,
    now(), CASE WHEN v_sent THEN now() END, CASE WHEN v_sent THEN NULL ELSE p_error_code END,
    p_provider_message_id, coalesce(p_expires_at, now() + interval '7 days'), p_invited_by
  )
  ON CONFLICT (profile_id) WHERE status IN ('pending', 'sent', 'send_failed') DO UPDATE
  SET status = EXCLUDED.status,
      send_attempts = ui.send_attempts + 1,
      last_attempt_at = now(),
      last_sent_at = CASE WHEN EXCLUDED.status = 'sent' THEN now() ELSE ui.last_sent_at END,
      last_error_code = EXCLUDED.last_error_code,
      provider_message_id = EXCLUDED.provider_message_id,
      expires_at = EXCLUDED.expires_at,
      user_id = coalesce(EXCLUDED.user_id, ui.user_id),
      membership_id = coalesce(EXCLUDED.membership_id, ui.membership_id),
      kind = EXCLUDED.kind,
      invited_by = coalesce(EXCLUDED.invited_by, ui.invited_by)
  RETURNING * INTO v_result;

  PERFORM set_config('storm.access_engine', '', true);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------- revoke / expire

-- A users-access admin of the invitation's company revokes a live
-- invitation. 42501 not_permitted (inactive caller, no capability there);
-- P0002 invitation_not_found / invitation_not_live.
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
  RETURN v_inv;
END;
$$;

-- Live invitations past expires_at become expired; returns the count. For
-- a later cron (owner action, spec §G 6; not scheduled in Phase 2).
CREATE OR REPLACE FUNCTION public.expire_invitations()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.user_invitations
  SET status = 'expired'
  WHERE status IN ('pending', 'sent', 'send_failed')
    AND expires_at IS NOT NULL
    AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------- backfill (legacy invited profiles)

-- Profiles marked invited by the old flow and without any invitation row:
-- pending + legacy_unverified (or accepted when they have signed in since).
INSERT INTO public.user_invitations (
  company_id, profile_id, user_id, membership_id, kind, status, send_attempts,
  last_attempt_at, last_sent_at, last_error_code, expires_at, accepted_at
)
SELECT p.company_id, p.id, p.user_id,
       (SELECT m.id FROM public.account_memberships AS m
         WHERE m.company_id = p.company_id AND ((p.user_id IS NOT NULL AND m.user_id = p.user_id) OR m.profile_id = p.id)
         ORDER BY m.created_at LIMIT 1),
       CASE WHEN p.role::text IN ('dpa', 'shore_management') THEN 'admin' ELSE 'crew' END,
       CASE WHEN p.last_login_at IS NOT NULL THEN 'accepted' ELSE 'pending' END,
       greatest(coalesce(p.invitation_count, 0), 0),
       p.last_invited_at,
       p.last_invited_at,
       CASE WHEN p.last_login_at IS NOT NULL THEN NULL ELSE 'legacy_unverified' END,
       coalesce(p.invitation_token_expires, p.last_invited_at + interval '7 days'),
       p.last_login_at
FROM public.profiles AS p
WHERE p.account_status = 'invited'
  AND p.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_invitations AS ui WHERE ui.profile_id = p.id);

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.record_invitation_send(uuid, text, text, text, uuid, text, timestamptz, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_invitations() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_invitation_send(uuid, text, text, text, uuid, text, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_invitations() TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.user_invitations IS 'Honest invitations (gap/01 F46; D-121): one live row (pending | sent | send_failed) per profile, then accepted | expired | revoked. send_attempts, last_attempt_at, last_sent_at, last_error_code (stable codes only, never provider text or addresses). No email column (the profile holds it). Read: users-access viewers of the company. Writes: record_invitation_send (service role), revoke_invitation, expire_invitations, record_session_start.';
COMMENT ON COLUMN public.user_invitations.last_error_code IS 'Stable snake_case code of the last failed attempt (e.g. provider_rejected, not_configured, legacy_unverified); NULL after a successful send.';
COMMENT ON FUNCTION public.record_invitation_send(uuid, text, text, text, uuid, text, timestamptz, uuid) IS 'Records one invitation send outcome (sent | send_failed with a code) on the profile''s live row; only a sent invitation stamps profiles.account_status invited (under storm.access_engine). Service role only (send-invitation, bulk-invite, admin-actions).';
COMMENT ON FUNCTION public.revoke_invitation(uuid) IS 'A users-access admin of the invitation''s company revokes a live invitation (42501 not_permitted; P0002 invitation_not_found / invitation_not_live).';
COMMENT ON FUNCTION public.expire_invitations() IS 'Live invitations past expires_at -> expired; returns the count. Service role (a later cron).';
