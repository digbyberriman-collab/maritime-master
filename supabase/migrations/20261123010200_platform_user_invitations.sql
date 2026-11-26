-- =================================================================
-- PLATFORM P3: honest invitations (gap/01 F46, W2; gap/03 B7; Phase 2 spec
-- §A.9; proposed D-121)
-- Tables: user_invitations (one live row per profile)
-- Helpers: reserve_invitation_attempt() (service role; the edge functions
--   reserve the attempt number before generating a link),
--   record_invitation_send() (service role; the edge functions record every
--   send outcome), revoke_invitation() (users-access admins),
--   expire_invitations() (service role; for a later cron),
--   invitation_withdraw_access() (internal to revoke / expire and, with an
--   evidence cut-off, record_session_start; D-228),
--   fulfil_imported_assignment() (service role; D-184) and its profile
--   trigger trg_profiles_fulfil_imported_assignment,
--   invitation_login_state() (service role; D-205)
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
-- withdraws the access it opened (gap/01 W2 row 8): the legacy
-- invitation_token is cleared, and, without sign-in evidence, a profile
-- that is still invited goes back to not_invited and the legacy-managed
-- membership of that login that was never accepted is removed, so the
-- invitee gets nothing even with a link already emailed or a password
-- reset (user_is_active() is false; my_account_status() and
-- record_session_start() answer 'disabled'). A user who has signed in
-- keeps their membership. A sent invitation (record_invitation_send)
-- restores both. Active, disabled and deactivated profiles keep their
-- state. A vessel-scoped admin revokes only invitations of people on the
-- vessels they reach, and an administrator's invitation needs a manager
-- of admins (gap/01 F23, W7).
--
-- Imported crew (D-184): a profile created with an imported vessel and no
-- login gets its crew assignment when a login is linked
-- (fulfil_imported_assignment()), so vessel reach always comes from
-- crew_assignments (D-26).
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
  IF to_regprocedure('public.has_capability(text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.admin_may_act_on_user(uuid,uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.admin_may_view_user(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010200_platform_user_invitations needs has_capability(), admin_may_act_on_user() and admin_may_view_user(): apply 20261123000400_platform_capabilities.sql first';
  END IF;
  IF to_regprocedure('public.vessel_in_reachable_state(text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010200_platform_user_invitations needs vessel_in_reachable_state(): apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.profiles_guard_access_columns()') IS NULL
     OR to_regprocedure('public.user_is_admin_target(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_manages_admins_for(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010200_platform_user_invitations needs the profile access guard, user_is_admin_target() and user_manages_admins_for(): apply 20261123010000_platform_user_status.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'imported_vessel_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'joining_date') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010200_platform_user_invitations needs the live profiles.imported_vessel_id and profiles.joining_date';
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
-- The newest invitation of a profile (user_is_active(), D-228: by login or
-- by profile, newest first).
CREATE INDEX IF NOT EXISTS idx_user_invitations_profile_newest ON public.user_invitations (profile_id, created_at DESC, id DESC);

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
  USING (public.admin_may_view_user(user_id, company_id, profile_id));

-- ---------------------------------------------------------------- fulfil_imported_assignment (service role; D-184)

-- An imported crew member (create-crew-member, the CSV import) waits on
-- profiles.imported_vessel_id until a login is linked; vessel reach comes
-- from crew_assignments only (D-26). Called when a login is linked
-- (record_invitation_send, and the AFTER UPDATE OF user_id trigger below
-- for every other link path), under the profile row lock:
--   'none'          nothing changes: no profile, no login, not imported, no
--                   imported vessel, or the user already has a current
--                   assignment (crew_assignment_is_current(), D-217: a row
--                   whose leave date has come no longer counts; an existing
--                   crew member is never re-pointed from a stale
--                   imported_vessel_id)
--   'not_eligible'  the imported vessel is not a vessel of the profile's
--                   company, or it is Sold or archived; or the position
--                   (normalised as crew_assignments_guard does) is Master
--                   or Captain and p_actor is not a users-access admin of
--                   the vessel (D-198: the engine flag never appoints a
--                   Master on its own; review round 3,
--                   profile-imported-columns-unguarded): nothing is
--                   written, the profile is left as it is (still pending)
--   'created'       one current assignment is written under
--                   storm.access_engine (position = the profile's position,
--                   else its rank, else 'Crew'; join_date = joining_date,
--                   else today; created_by = p_actor when that is a member of
--                   the company), then imported_vessel_id is cleared and
--                   is_imported set false
--   'exists'        as 'created' when a current row for that user and vessel
--                   is already there (nothing inserted)
CREATE OR REPLACE FUNCTION public.fulfil_imported_assignment(p_profile_id uuid, p_actor uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_vessel public.vessels;
  v_actor uuid;
  v_engine text := current_setting('storm.access_engine', true);
  v_inserted integer;
  v_position text;
  v_office text;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN 'none';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_profile.user_id IS NULL OR NOT coalesce(v_profile.is_imported, false) OR v_profile.imported_vessel_id IS NULL THEN
    RETURN 'none';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crew_assignments AS ca
             WHERE ca.user_id = v_profile.user_id AND ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)) THEN
    RETURN 'none';
  END IF;
  SELECT * INTO v_vessel FROM public.vessels WHERE id = v_profile.imported_vessel_id;
  IF NOT FOUND OR v_profile.company_id IS NULL OR v_vessel.company_id IS DISTINCT FROM v_profile.company_id
     OR NOT public.vessel_in_reachable_state(v_vessel.lifecycle_status, v_vessel.status) THEN
    RETURN 'not_eligible';
  END IF;
  -- The Master office (D-198): only a users-access admin of the vessel
  -- appoints one, whatever the profile columns say.
  v_position := coalesce(nullif(btrim(v_profile.position), ''), nullif(btrim(v_profile.rank), ''), 'Crew');
  v_office := btrim(regexp_replace(translate(btrim(v_position), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_');
  IF v_office IN ('master', 'captain')
     AND NOT (p_actor IS NOT NULL AND public.has_capability_for(p_actor, 'admin.access.users_access.admin', v_profile.company_id, v_vessel.id)) THEN
    RETURN 'not_eligible';
  END IF;
  v_actor := CASE
    WHEN p_actor IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles AS a WHERE a.user_id = p_actor AND a.company_id = v_profile.company_id)
    THEN p_actor
  END;

  PERFORM set_config('storm.access_engine', 'on', true);
  INSERT INTO public.crew_assignments (user_id, vessel_id, position, join_date, is_current, created_by)
  SELECT v_profile.user_id, v_vessel.id, v_position,
         coalesce(v_profile.joining_date, current_date), true, v_actor
  WHERE NOT EXISTS (
    SELECT 1 FROM public.crew_assignments AS ca
    WHERE ca.user_id = v_profile.user_id AND ca.vessel_id = v_vessel.id
      AND ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  UPDATE public.profiles SET imported_vessel_id = NULL, is_imported = false WHERE id = v_profile.id;
  PERFORM set_config('storm.access_engine', coalesce(v_engine, ''), true);
  RETURN CASE WHEN v_inserted > 0 THEN 'created' ELSE 'exists' END;
END;
$$;

-- trg_profiles_fulfil_imported_assignment: every other path that links a
-- login to an imported profile (the edge D-01 fallback, the service role)
-- gets the assignment too. The actor is the inviter that
-- record_invitation_send names in the transaction-local storm.fulfil_actor
-- (a well-formed uuid only; else none). The inner UPDATE never sets
-- user_id, so the trigger does not recurse.
CREATE OR REPLACE FUNCTION public.profiles_fulfil_imported_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := current_setting('storm.fulfil_actor', true);
BEGIN
  PERFORM public.fulfil_imported_assignment(
    NEW.id,
    CASE WHEN v_actor ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN v_actor::uuid END
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_fulfil_imported_assignment ON public.profiles;
CREATE TRIGGER trg_profiles_fulfil_imported_assignment
  AFTER UPDATE OF user_id ON public.profiles
  FOR EACH ROW
  WHEN (OLD.user_id IS NULL AND NEW.user_id IS NOT NULL AND NEW.is_imported AND NEW.imported_vessel_id IS NOT NULL)
  EXECUTE FUNCTION public.profiles_fulfil_imported_assignment();

-- ---------------------------------------------------------------- invitation_login_state (service role; D-205)

-- Whether a login found for an invitee (auth_user_id_for_email, or the user
-- the auth API returns for an address already registered) may be adopted
-- by this profile (D-205: an invitation adopts only a login STORM created;
-- review round 3, invite-adopts-foreign-login). First match wins:
--   'unknown'           either id NULL, no such profile, or no auth.users
--                       row for p_user_id
--   'linked'            the profile already carries this login
--   'linked_elsewhere'  the profile carries another login, or another
--                       profile carries this one
--   'email_mismatch'    the login's address is not the profile's
--                       (lower(btrim(...)); a NULL on either side counts as
--                       a mismatch)
--   'storm_invited'     an invitation row of this profile already carries
--                       the login, or the login is an untouched invite
--                       login: invited_at set, never signed in, no
--                       password, no identity other than email
--   'unused_orphan'     never confirmed and never signed in (the edge may
--                       delete it and invite afresh)
--   'foreign'           anything else (confirmed, a password, a sign-in,
--                       or another provider): never adopted
-- Reads no address out (the answer is a word). Service role only (the edge
-- functions; record_invitation_send asks the same question).
CREATE OR REPLACE FUNCTION public.invitation_login_state(p_profile_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_user auth.users;
BEGIN
  IF p_profile_id IS NULL OR p_user_id IS NULL THEN
    RETURN 'unknown';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN 'unknown';
  END IF;
  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN 'unknown';
  END IF;
  IF v_profile.user_id = p_user_id THEN
    RETURN 'linked';
  END IF;
  IF v_profile.user_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.profiles AS o WHERE o.user_id = p_user_id AND o.id <> v_profile.id) THEN
    RETURN 'linked_elsewhere';
  END IF;
  IF v_user.email IS NULL OR v_profile.email IS NULL
     OR lower(btrim(v_user.email::text)) <> lower(btrim(v_profile.email::text)) THEN
    RETURN 'email_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_invitations AS ui WHERE ui.profile_id = p_profile_id AND ui.user_id = p_user_id)
     OR (v_user.invited_at IS NOT NULL
         AND v_user.last_sign_in_at IS NULL
         AND coalesce(v_user.encrypted_password, '') = ''
         AND NOT EXISTS (SELECT 1 FROM auth.identities AS i WHERE i.user_id = v_user.id AND i.provider <> 'email')) THEN
    RETURN 'storm_invited';
  END IF;
  IF v_user.email_confirmed_at IS NULL AND v_user.last_sign_in_at IS NULL THEN
    RETURN 'unused_orphan';
  END IF;
  RETURN 'foreign';
END;
$$;

-- ---------------------------------------------------------------- record_invitation_send (service role)

-- The edge functions record every send attempt with the outcome they
-- actually got. Refusals: 22023 outcome_invalid, error_code_invalid (a
-- send_failed needs a stable snake_case code), kind_invalid,
-- profile_without_company; P0002 profile_not_found; 42501
-- inviter_not_member (p_invited_by is not an active member of the
-- profile's company); 42501 inviter_out_of_reach (p_invited_by may not act
-- on the invitee: admin_may_act_on_user() on the locked profile, before
-- any login is linked; D-207) and 42501 manages_admins_required (an
-- administrator target: a dpa / shore_management profile, an admin /
-- owner invitation, or a login that user_is_admin_target(); the inviter
-- does not manage admins; W7), both only when p_invited_by is given (the
-- service role / ops pass NULL); 23505 user_linked_elsewhere (p_user_id
-- belongs to another profile, or the profile has another login); and, when
-- p_user_id links a login to a profile that has none yet (D-205; review
-- round 3, invite-adopts-foreign-login): 42501 login_email_mismatch (the
-- login's address is not the profile's) and 42501 login_not_invited (any
-- invitation_login_state() other than storm_invited: a login STORM did not
-- create is never adopted). Nothing is written on a refusal. Upserts the profile's
-- live row; a sent invitation also stamps the legacy profile columns
-- (account_status 'invited' unless disabled / deactivated, or active and
-- the person has joined: a sign-in on the profile or the login, or an
-- accepted membership of the login in the profile's company, D-236;
-- last_invited_at, invited_at, invitation_count) and brings back a
-- legacy-managed membership a revoke or expiry removed, under
-- storm.access_engine; a failed one never does (it only links the login
-- when given). The attempt count is the reserved one
-- (reserve_invitation_attempt): an update keeps it (at least 1); a new
-- live row (no reservation) takes the next number, computed in bigint and
-- clamped at 2147483647 (as is the invitation_count stamp), so it never
-- raises. A failed send with 'provider_duplicate' on a row already sent
-- keeps it sent (the provider refused a duplicate of an email that went
-- out: never a downgrade). A given p_invited_by who is no users-access
-- admin of the pending vessel of a Master / Captain placement (is_imported,
-- imported_vessel_id, no current assignment of the login) is refused before
-- any write (42501 master_needs_admin; review round 4): a NULL inviter
-- (service role, ops) links without fulfilling, and only an all-vessels
-- admin (admin_scope_all) finishes such a placement. Once a login is linked (the sent branch, or a
-- failed send that links p_user_id) an imported profile's vessel becomes
-- its crew assignment: fulfil_imported_assignment(profile, p_invited_by)
-- (D-184).
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
  v_next bigint;
  v_result public.user_invitations;
  v_state text;
  v_office text;
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
  -- The inviter may act on the person (D-207, gap/01 F23, W7), asked of the
  -- locked profile before any login is linked.
  IF p_invited_by IS NOT NULL THEN
    IF NOT public.admin_may_act_on_user(p_invited_by, v_profile.user_id, v_profile.company_id, v_profile.id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'inviter_out_of_reach',
        DETAIL = 'The inviter cannot act on this person.';
    END IF;
    IF (v_profile.role::text IN ('dpa', 'shore_management')
        OR coalesce(p_kind, 'crew') IN ('admin', 'owner')
        OR (v_profile.user_id IS NOT NULL AND public.user_is_admin_target(v_profile.user_id, v_profile.company_id)))
       AND NOT public.user_manages_admins_for(p_invited_by, v_profile.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'manages_admins_required',
        DETAIL = 'Only an administrator who manages administrators can invite an administrator.';
    END IF;
    -- A pending Master / Captain placement (review round 4,
    -- master-placement-stranded-after-link; D-198, D-204): only a
    -- users-access admin of the pending vessel invites it, so the login is
    -- never linked without the assignment fulfil_imported_assignment()
    -- would then refuse (normalised as it does: position, else rank, else
    -- Crew). Before any write.
    IF coalesce(v_profile.is_imported, false) AND v_profile.imported_vessel_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.crew_assignments AS ca
                       WHERE ca.user_id = coalesce(v_profile.user_id, p_user_id)
                         AND ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)) THEN
      v_office := btrim(regexp_replace(translate(btrim(coalesce(nullif(btrim(v_profile.position), ''), nullif(btrim(v_profile.rank), ''), 'Crew')),
                                                 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_');
      IF v_office IN ('master', 'captain')
         AND NOT public.has_capability_for(p_invited_by, 'admin.access.users_access.admin', v_profile.company_id, v_profile.imported_vessel_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'master_needs_admin',
          DETAIL = 'Only a users-access administrator of this vessel can invite a Master.';
      END IF;
    END IF;
  END IF;
  IF p_user_id IS NOT NULL AND (
    (v_profile.user_id IS NOT NULL AND v_profile.user_id <> p_user_id)
    OR EXISTS (SELECT 1 FROM public.profiles AS o WHERE o.user_id = p_user_id AND o.id <> v_profile.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'user_linked_elsewhere';
  END IF;
  -- A login is adopted only when STORM created it for this profile (D-205).
  IF p_user_id IS NOT NULL AND v_profile.user_id IS NULL THEN
    v_state := public.invitation_login_state(v_profile.id, p_user_id);
    IF v_state = 'email_mismatch' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'login_email_mismatch',
        DETAIL = 'That login''s address is not the address this invitation goes to.';
    END IF;
    IF v_state IS DISTINCT FROM 'storm_invited' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'login_not_invited',
        DETAIL = 'That login was not created by a STORM invitation.';
    END IF;
  END IF;
  v_user := coalesce(v_profile.user_id, p_user_id);

  PERFORM set_config('storm.access_engine', 'on', true);
  -- The inviter, for the assignment a linked login fulfils (the trigger
  -- trg_profiles_fulfil_imported_assignment reads it).
  PERFORM set_config('storm.fulfil_actor', coalesce(p_invited_by::text, ''), true);

  IF v_sent THEN
    -- D-236 (review round 6, expired-invite-active-default-profile): a sent
    -- invitation stamps 'invited' unless the person has joined, whatever
    -- the stored status ('active' is the column default, so an importer- or
    -- webhook-created profile reads active without ever signing in).
    -- Joined: a sign-in on the profile or the login, or an accepted
    -- membership of the login in the profile's company. Disabled and
    -- deactivated profiles keep their status. The D-228 machinery
    -- (user_is_active, invitation_withdrawn_for, invitation_withdraw_access,
    -- record_session_start, expire_invitations) then covers the invitee.
    UPDATE public.profiles
    SET account_status = CASE
          WHEN lower(coalesce(account_status, '')) IN ('disabled', 'deactivated') THEN account_status
          WHEN lower(coalesce(account_status, '')) = 'active'
               AND (v_profile.last_login_at IS NOT NULL
                    OR EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = v_user AND u.last_sign_in_at IS NOT NULL)
                    OR EXISTS (SELECT 1 FROM public.account_memberships AS m
                                WHERE m.user_id = v_user AND m.company_id = v_profile.company_id AND m.accepted_at IS NOT NULL))
            THEN account_status
          ELSE 'invited'
        END,
        last_invited_at = now(),
        invited_at = coalesce(invited_at, now()),
        invitation_count = least(coalesce(invitation_count, 0)::bigint + 1, 2147483647)::integer,
        user_id = coalesce(user_id, p_user_id)
    WHERE id = v_profile.id;
    IF v_user IS NOT NULL THEN
      PERFORM public.fulfil_imported_assignment(v_profile.id, p_invited_by);
    END IF;
  ELSIF v_profile.user_id IS NULL AND p_user_id IS NOT NULL THEN
    UPDATE public.profiles SET user_id = p_user_id WHERE id = v_profile.id;
    PERFORM public.fulfil_imported_assignment(v_profile.id, p_invited_by);
  END IF;
  PERFORM set_config('storm.fulfil_actor', '', true);

  -- A sent invitation brings back the legacy membership a revoke or an
  -- expiry removed (the profile sync never does, file 3).
  IF v_sent AND v_user IS NOT NULL AND lower(coalesce(v_profile.account_status, '')) NOT IN ('disabled', 'deactivated') THEN
    UPDATE public.account_memberships
    SET status = 'active', removed_at = NULL
    WHERE company_id = v_profile.company_id AND user_id = v_user AND legacy_managed AND status = 'removed';
  END IF;

  SELECT least(greatest(coalesce(max(ui.send_attempts), 0)::bigint, coalesce(v_profile.invitation_count, 0)::bigint) + 1, 2147483647)
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
    v_profile.company_id, v_profile.id, v_user, v_membership, coalesce(p_kind, 'crew'), p_outcome, v_next::integer,
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
--   p_invited_by given and it may not   {"ok": false, "code": "forbidden"}
--     act on the person (admin_may_act_on_user(); D-207, gap/01 F23)
--   p_invited_by given, an administrator {"ok": false, "code": "manages_admins_required"}
--     target (a dpa / shore_management profile, an admin / owner kind, or
--     a login that user_is_admin_target()) and the inviter does not
--     manage admins (W7)
--   p_invited_by given, a pending        {"ok": false, "code": "master_needs_admin"}
--     Master / Captain placement (is_imported, imported_vessel_id set, the
--     login has no current assignment; position, else rank, else Crew,
--     normalised) and the inviter is no users-access admin of that vessel
--     (review round 4, D-198, D-204)
--     (both before the counter, the cooldown or any write; NULL is the
--     service role / ops and is not limited)
--   the next number would pass          {"ok": false, "code": "counter_exhausted"}
--     2147483647 (computed in bigint, never raises; nothing is written)
--   inside the cooldown                 {"ok": false, "code": "cooldown", "retry_after_seconds": n}
--     until = max(last_sent_at + 5 min, last_attempt_at + 30 s after a
--     failed attempt, else + 5 min)
--   otherwise the next attempt number   {"ok": true, "invitation_id": <uuid>, "attempt": n}
--     n = greatest(max(send_attempts) over all the profile's rows,
--     invitation_count) + 1, stamped on the live row with last_attempt_at.
-- p_invited_by is kept on a new row only when it is an active member of
-- the profile's company (always true once the checks above passed); 22023
-- kind_invalid for a kind outside the membership vocabulary.
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
  v_attempt bigint;
  v_office text;
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
  -- The inviter may act on the person (D-207; defence in depth behind the
  -- edge's own check), before the counter, the cooldown or any write.
  IF p_invited_by IS NOT NULL THEN
    IF NOT public.admin_may_act_on_user(p_invited_by, v_profile.user_id, v_profile.company_id, v_profile.id) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
    END IF;
    IF (v_profile.role::text IN ('dpa', 'shore_management')
        OR coalesce(p_kind, 'crew') IN ('admin', 'owner')
        OR (v_profile.user_id IS NOT NULL AND public.user_is_admin_target(v_profile.user_id, v_profile.company_id)))
       AND NOT public.user_manages_admins_for(p_invited_by, v_profile.company_id) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'manages_admins_required');
    END IF;
    -- A pending Master / Captain placement needs a users-access admin of the
    -- pending vessel (review round 4; record_invitation_send's rule).
    IF coalesce(v_profile.is_imported, false) AND v_profile.imported_vessel_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.crew_assignments AS ca
                       WHERE ca.user_id = v_profile.user_id AND ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)) THEN
      v_office := btrim(regexp_replace(translate(btrim(coalesce(nullif(btrim(v_profile.position), ''), nullif(btrim(v_profile.rank), ''), 'Crew')),
                                                 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '[^a-z0-9]+', '_', 'g'), '_');
      IF v_office IN ('master', 'captain')
         AND NOT public.has_capability_for(p_invited_by, 'admin.access.users_access.admin', v_profile.company_id, v_profile.imported_vessel_id) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'master_needs_admin');
      END IF;
    END IF;
  END IF;
  -- The next attempt number, in bigint: a counter at the integer ceiling
  -- answers counter_exhausted instead of raising (a new live row starts at
  -- 0, so the maximum is the same before and after it is created).
  SELECT greatest(coalesce(max(ui.send_attempts), 0)::bigint, coalesce(v_profile.invitation_count, 0)::bigint) + 1
    INTO v_attempt
  FROM public.user_invitations AS ui
  WHERE ui.profile_id = v_profile.id;
  IF v_attempt > 2147483647 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'counter_exhausted');
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

  UPDATE public.user_invitations
  SET send_attempts = v_attempt::integer, last_attempt_at = now()
  WHERE id = v_live.id;

  RETURN jsonb_build_object('ok', true, 'invitation_id', v_live.id, 'attempt', v_attempt);
END;
$$;

-- ---------------------------------------------------------------- revoke / expire

-- Withdraws the access an ended, never-accepted invitation opened (revoke,
-- expiry), under storm.access_engine, for a profile that is still invited
-- or not_invited (active, disabled and deactivated profiles are left
-- alone), with the JWT claims suspended for the profile writes (as
-- record_session_start does for the legacy guard, D-141):
--   - the legacy profiles.invitation_token / invitation_token_expires are
--     cleared, whatever the sign-in evidence (accept-invitation must never
--     claim an ended invitation);
--   - without sign-in evidence (coalesce(last_login_at, auth
--     last_sign_in_at)) a still-invited profile goes back to 'not_invited'
--     and the legacy-managed membership of that login that was never
--     accepted is removed. A user with sign-in evidence keeps their
--     membership (gap/01 W2 row 8): the withdrawal only undoes access the
--     invitation itself opened.
--   - with a cut-off (D-228; review round 5,
--     expired-invitation-still-accepted: record_session_start passes the
--     invitation's expires_at, because auth.users.last_sign_in_at already
--     holds the sign-in being refused), only evidence from before it
--     counts: coalesce(last_login_at, auth last_sign_in_at) < the cut-off,
--     or an accepted membership of that login.
--   - the cut-off is _evidence_before when given, else the invitation's
--     own expires_at when that has passed (D-235; review round 6,
--     expire-revoke-withdraw-no-cutoff): every caller, the daily sweep
--     (expire_invitations, hr-daily-sweeper) and an admin's Revoke on a
--     past-expiry live row included, gets the D-228 cut-off, so a sign-in
--     made after the expiry (a password-reset session that skipped
--     record_session_start) never keeps the access. An invitation revoked
--     before its expiry keeps the plain rule: any sign-in evidence keeps
--     the membership (gap/01 W2 row 8).
-- Internal to revoke_invitation(), expire_invitations() (one argument)
-- and record_session_start() (two).
DROP FUNCTION IF EXISTS public.invitation_withdraw_access(uuid);
CREATE OR REPLACE FUNCTION public.invitation_withdraw_access(p_invitation_id uuid, _evidence_before timestamptz DEFAULT NULL)
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
  v_cutoff timestamptz := _evidence_before;
BEGIN
  SELECT * INTO v_inv FROM public.user_invitations WHERE id = p_invitation_id;
  IF NOT FOUND OR v_inv.accepted_at IS NOT NULL OR v_inv.status NOT IN ('revoked', 'expired') THEN
    RETURN;
  END IF;
  -- D-235: an invitation past its expiry counts only evidence from before
  -- the expiry, whoever ends it (the sweep, Revoke, a later caller).
  IF v_cutoff IS NULL AND v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    v_cutoff := v_inv.expires_at;
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
  IF v_cutoff IS NOT NULL THEN
    -- Only evidence from before the cut-off (D-228, D-235), or an accepted
    -- membership of that login.
    IF NOT coalesce(v_signed_in < v_cutoff, false) THEN
      v_signed_in := NULL;
    END IF;
    IF v_signed_in IS NULL AND v_user IS NOT NULL THEN
      SELECT m.accepted_at INTO v_signed_in
      FROM public.account_memberships AS m
      WHERE m.company_id = v_inv.company_id AND m.user_id = v_user AND m.accepted_at IS NOT NULL
      ORDER BY m.accepted_at
      LIMIT 1;
    END IF;
  END IF;

  PERFORM set_config('storm.access_engine', 'on', true);
  v_claims := current_setting('request.jwt.claims', true);
  v_sub := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.profiles
  SET invitation_token = NULL, invitation_token_expires = NULL
  WHERE id = v_profile.id AND (invitation_token IS NOT NULL OR invitation_token_expires IS NOT NULL);
  IF v_state = 'invited' AND v_signed_in IS NULL THEN
    UPDATE public.profiles SET account_status = 'not_invited' WHERE id = v_profile.id AND account_status = 'invited';
  END IF;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  IF v_user IS NOT NULL AND v_signed_in IS NULL THEN
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
-- caller, no capability there, or an invitee on a vessel outside a
-- vessel-scoped admin's reach: admin_may_act_on_user on the invitation's
-- profile, which may have no login yet; gap/01 F23), 42501
-- manages_admins_required (an admin / owner invitation, an administrator
-- target or a dpa / shore_management profile needs a manager of admins;
-- W7); P0002 invitation_not_found / invitation_not_live.
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
  v_profile public.profiles;
  v_target uuid;
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
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_inv.profile_id;
  v_target := coalesce(v_inv.user_id, v_profile.user_id);
  IF NOT public.admin_may_act_on_user(v_uid, v_target, v_inv.company_id, v_inv.profile_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF (v_inv.kind IN ('admin', 'owner')
      OR public.user_is_admin_target(v_target, v_inv.company_id)
      OR coalesce(v_profile.role::text IN ('dpa', 'shore_management'), false))
     AND NOT public.user_manages_admins_for(v_uid, v_inv.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'manages_admins_required';
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
-- opened is withdrawn when it was never accepted, counting only sign-in
-- evidence from before each invitation's expiry (D-228, D-235:
-- invitation_withdraw_access applies the cut-off itself); returns the
-- count. Run daily by hr-daily-sweeper (service role).
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
REVOKE ALL ON FUNCTION public.invitation_withdraw_access(uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_invitations() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fulfil_imported_assignment(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invitation_login_state(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.profiles_fulfil_imported_assignment() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_invitation_send(uuid, text, text, text, uuid, text, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_attempt(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_invitations() TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfil_imported_assignment(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invitation_login_state(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.user_invitations IS 'Honest invitations (gap/01 F46; D-121): one live row (pending | sent | send_failed) per profile, then accepted | expired | revoked. send_attempts, last_attempt_at, last_sent_at, last_error_code (stable codes only, never provider text or addresses). No email column (the profile holds it). Read: users-access viewers of the company. Writes: record_invitation_send (service role), revoke_invitation, expire_invitations, record_session_start.';
COMMENT ON COLUMN public.user_invitations.last_error_code IS 'Stable snake_case code of the last failed attempt (e.g. provider_rejected, not_configured, legacy_unverified); NULL after a successful send.';
COMMENT ON FUNCTION public.record_invitation_send(uuid, text, text, text, uuid, text, timestamptz, uuid) IS 'Records one invitation send outcome (sent | send_failed with a code) on the profile''s live row for the reserved attempt (not counted again); only a sent invitation stamps profiles.account_status invited (unless disabled / deactivated, or active and the person has joined: a sign-in on the profile or the login, or an accepted membership in the profile''s company; D-236) and restores a removed legacy membership (under storm.access_engine); provider_duplicate never downgrades a sent row. A given p_invited_by must be a member who may act on the invitee (42501 inviter_not_member, inviter_out_of_reach; D-207) and manage admins for an administrator target (42501 manages_admins_required), and be a users-access admin of the pending vessel of a Master / Captain placement (42501 master_needs_admin, DETAIL Only a users-access administrator of this vessel can invite a Master.; review round 4, D-198, D-204); a login linked to a profile without one must be one STORM created for it (invitation_login_state storm_invited; 42501 login_email_mismatch, login_not_invited; D-205). Nothing is written on a refusal. Service role only (send-invitation, bulk-invite, admin-actions).';
COMMENT ON FUNCTION public.reserve_invitation_attempt(uuid, uuid, text) IS 'D-146: reserves the next invitation attempt number before a link is generated, under the profile and live-row locks: {ok, invitation_id, attempt} or {ok: false, code: not_found | disabled | forbidden (a given p_invited_by may not act on the person, D-207) | manages_admins_required (an administrator target and an inviter who does not manage admins, W7) | master_needs_admin (a pending Master / Captain placement and an inviter who is no users-access admin of the pending vessel; review round 4) | counter_exhausted (the next number would pass 2147483647; computed in bigint, never raises) | cooldown (retry_after_seconds)}. Cooldown 5 min after a send, 30 s after a failed attempt. Service role only.';
COMMENT ON FUNCTION public.invitation_login_state(uuid, uuid) IS 'D-205: whether a login may be adopted by the profile, first match wins: unknown (NULL id, no profile, no auth user) | linked | linked_elsewhere | email_mismatch (lower(btrim) addresses differ; NULL counts as a mismatch) | storm_invited (an invitation row of the profile carries the login, or invited_at set, never signed in, no password, no non-email identity) | unused_orphan (never confirmed, never signed in) | foreign. Only storm_invited is adoptable. Service role only.';
COMMENT ON FUNCTION public.invitation_withdraw_access(uuid, timestamptz) IS 'Internal to revoke / expire / record_session_start: for an ended, never-accepted invitation of a still invited / not_invited profile, the legacy invitation_token / invitation_token_expires are cleared (whatever the sign-in evidence); without sign-in evidence the still-invited profile -> not_invited and the never-accepted legacy membership -> removed (under storm.access_engine, JWT claims suspended). With a cut-off only sign-in evidence older than it, or an accepted membership, keeps the access (D-228); the cut-off is _evidence_before (record_session_start passes expires_at), else the invitation''s own expires_at once it has passed (D-235: the daily sweep and Revoke get it too). Active / disabled profiles untouched.';
COMMENT ON FUNCTION public.revoke_invitation(uuid) IS 'A users-access admin of the invitation''s company who may act on the invitee (vessel reach, gap/01 F23) revokes a live invitation and withdraws the access it opened when never accepted; on a row already past its expiry only sign-in evidence from before the expiry keeps the access (D-228, D-235) (42501 not_permitted; 42501 manages_admins_required for an admin / owner invitation, an administrator target or a dpa / shore_management profile, W7; P0002 invitation_not_found / invitation_not_live).';
COMMENT ON FUNCTION public.fulfil_imported_assignment(uuid, uuid) IS 'D-184: once a login is linked, an imported profile''s imported_vessel_id becomes one current crew_assignments row (position, else rank, else Crew; join_date = joining_date, else today) under storm.access_engine, then imported_vessel_id is cleared and is_imported set false. Returns created | exists | none (not imported, no login, or already a current crew member: nothing changes) | not_eligible (a vessel of another company, Sold or archived; or a Master / Captain position without p_actor being a users-access admin of the vessel, D-198: nothing written, profile untouched and still pending). Service role only (record_invitation_send, the profile trigger, the edge).';
COMMENT ON FUNCTION public.profiles_fulfil_imported_assignment() IS 'Trigger trg_profiles_fulfil_imported_assignment (AFTER UPDATE OF user_id, a login newly linked to an imported profile with an imported vessel): fulfil_imported_assignment(NEW.id, the inviter named in storm.fulfil_actor).';
COMMENT ON FUNCTION public.expire_invitations() IS 'Live invitations past expires_at -> expired, access withdrawn when never accepted, counting only sign-in evidence from before each expiry (D-228, D-235); returns the count. Service role (hr-daily-sweeper, daily).';
