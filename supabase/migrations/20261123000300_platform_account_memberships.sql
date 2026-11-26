-- =================================================================
-- PLATFORM P2: account memberships, vessel and fleet reach, the
-- disabled-user status (gap/01 F11, F22–F24, F47, F50, C16, C17, C19;
-- DECISIONS D-26; Phase 2 spec §A.3; proposed D-122, D-123, D-136)
-- Tables: account_memberships, account_membership_vessels
-- Helpers: user_is_active(), my_account_status(), record_session_start(),
--   invitation_withdrawn_for(), legacy_all_vessels(), legacy_fleet_reach(),
--   vessel_in_reachable_state(), crew_assignment_is_current(),
--   crew_assignment_holds_office() (D-217, D-227),
--   internal reach_vessels_for() / reach_vessel_for() / fleet_reach_for(),
--   public user_vessel_reach() / user_can_reach_vessel() /
--   user_has_fleet_reach(); triggers trg_profiles_sync_membership,
--   trg_account_membership_vessels_company
-- TS mirror: src/modules/auth/types/db.pending.ts (AuthPendingTables,
--   AuthPendingFunctions), src/app/router/membershipReach.ts (legacyReach,
--   membershipReach, vesselInReachableState), src/modules/auth/services/
--   accountStatus.ts (my_account_status / record_session_start)
-- Parity: supabase/tests/fixtures/reach-cases.json (22 users), asserted by
--   supabase/tests/sql/p2_reach and p2_memberships
-- =================================================================
--
-- One membership per user per company (profiles hold one company per user
-- today). Reach = every reachable vessel of the company when vessel_scope
-- is 'all', plus the membership's vessel rows valid now, plus the user's
-- current crew assignments (not for 'external'); fleet reach = fleet_access.
--
-- Legacy-managed rows (the backfill and the profile sync) are evaluated
-- live from the D-26 legacy sources (profiles.role, RBAC roles, crew
-- assignments), so applying this file changes nobody's reach and nothing
-- goes stale while the legacy writers still write those sources. X6 turns a
-- row non-legacy when an admin edits it in the new Users & Access.
--
-- Disabled users get nothing: every helper starts with user_is_active(),
-- which reads profiles, account_memberships and auth.users directly (never
-- user_belongs_to_company / get_user_company_id / has_role / has_any_role /
-- legacy_profile_role, which 20261123010000_platform_user_status.sql
-- redefines on top of it).
--
-- Two layers of reach helpers (CC-3, D-136): the internal reach_*_for
-- functions (service role only) answer for any user, for definers that
-- evaluate someone other than the caller; the public user_* helpers add
-- the caller rule (no JWT, yourself, or a users-access viewer who may view
-- the target: admin_may_view_user(), gap/01 F23 / D-194; review round 5,
-- reach-helpers-ignore-f23-scope).
--
-- A crew assignment counts as current only while is_current is set and
-- its leave date (else end date) has not come (crew_assignment_is_current,
-- the D-217 rule the guard already used; review round 5,
-- stale-is-current-keeps-reach): the legacy normaliser flips is_current
-- only when a row is written, and crew_assignments_end_stale()
-- (20261123010300) sweeps the rest. The Master office also waits for the
-- join date (crew_assignment_holds_office, D-227); reach of a planned
-- assignment stays as legacy.
--
-- Helpers that policies call are LANGUAGE plpgsql (D-229): PostgreSQL 17
-- and earlier never inline a SECURITY DEFINER SQL function and re-plan a
-- nested non-inlined SQL function on every call, while PL/pgSQL keeps its
-- plans for the session (review round 5, rls-helper-per-row-slowdown).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessels' AND column_name = 'lifecycle_status') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000300_platform_account_memberships needs vessels.lifecycle_status: apply 20261123000100_platform_vessel_tenancy.sql first';
  END IF;
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.crew_assignments') IS NULL
     OR to_regclass('public.rbac_user_roles') IS NULL OR to_regclass('public.roles') IS NULL OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000300_platform_account_memberships needs profiles, crew_assignments, rbac_user_roles, roles and auth.users';
  END IF;
  -- Legacy Apply-queue rows 12 and 23 are hard prerequisites (spec §0.1,
  -- §G 1): the backfill and the profile sync trust profiles.role and
  -- profiles.company_id, which those files stop users from setting freely.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'trg_profiles_guard_privileged_columns' AND NOT tgisinternal) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000300_platform_account_memberships needs trg_profiles_guard_privileged_columns: apply 20260917190000_hris_review_fixes.sql first (ledger check query A)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Service role can create companies')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert their own profile' AND with_check LIKE '%company_id IS NULL%') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000300_platform_account_memberships needs the signup backstop: apply 20260919170100_signup_backstop.sql first (ledger check query D)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.account_memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NULL,
  profile_id uuid NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  legacy_managed boolean NOT NULL DEFAULT false,
  fleet_access boolean NOT NULL DEFAULT false,
  vessel_scope text NOT NULL DEFAULT 'assigned',
  is_dpa boolean NOT NULL DEFAULT false,
  manages_admins boolean NOT NULL DEFAULT false,
  users_access_level text NOT NULL DEFAULT 'none',
  job_role_key text NULL,
  valid_from timestamptz NULL,
  valid_until timestamptz NULL,
  invited_by uuid NULL,
  invited_at timestamptz NULL,
  accepted_at timestamptz NULL,
  disabled_at timestamptz NULL,
  disabled_by uuid NULL,
  disabled_reason text NULL,
  removed_at timestamptz NULL,
  last_active_at timestamptz NULL,
  source text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_memberships_pkey PRIMARY KEY (id),
  CONSTRAINT account_memberships_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT account_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT account_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT account_memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT account_memberships_disabled_by_fkey FOREIGN KEY (disabled_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT account_memberships_kind_check CHECK (kind IN ('owner', 'admin', 'shore', 'crew', 'external')),
  CONSTRAINT account_memberships_status_check CHECK (status IN ('invited', 'active', 'disabled', 'removed')),
  CONSTRAINT account_memberships_vessel_scope_check CHECK (vessel_scope IN ('all', 'assigned')),
  CONSTRAINT account_memberships_users_access_level_check CHECK (users_access_level IN ('none', 'read', 'write')),
  CONSTRAINT account_memberships_source_check CHECK (source IN ('backfill', 'profile_sync', 'invite', 'admin', 'platform')),
  CONSTRAINT account_memberships_identity_check CHECK (user_id IS NOT NULL OR profile_id IS NOT NULL),
  CONSTRAINT account_memberships_external_check CHECK (kind <> 'external' OR (valid_until IS NOT NULL AND vessel_scope = 'assigned' AND NOT fleet_access)),
  CONSTRAINT account_memberships_owner_check CHECK (kind <> 'owner' OR (vessel_scope = 'all' AND fleet_access)),
  CONSTRAINT account_memberships_dpa_check CHECK (NOT is_dpa OR kind IN ('owner', 'admin')),
  CONSTRAINT account_memberships_window_check CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until),
  CONSTRAINT account_memberships_disabled_reason_length CHECK (disabled_reason IS NULL OR length(disabled_reason) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_memberships_company_user_key ON public.account_memberships (company_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_memberships_company_profile_key ON public.account_memberships (company_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_memberships_one_owner_key ON public.account_memberships (company_id) WHERE kind = 'owner' AND status <> 'removed';
CREATE INDEX IF NOT EXISTS idx_account_memberships_user ON public.account_memberships (user_id);

CREATE TABLE IF NOT EXISTS public.account_membership_vessels (
  membership_id uuid NOT NULL,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  valid_from timestamptz NULL,
  valid_until timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_membership_vessels_pkey PRIMARY KEY (membership_id, vessel_id),
  CONSTRAINT account_membership_vessels_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.account_memberships(id) ON DELETE CASCADE,
  CONSTRAINT account_membership_vessels_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT account_membership_vessels_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT account_membership_vessels_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT account_membership_vessels_window_check CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until)
);

CREATE INDEX IF NOT EXISTS idx_account_membership_vessels_vessel ON public.account_membership_vessels (vessel_id);
-- Reach reads the current crew assignments of one user per vessel (per row
-- in RLS); the live table has no index on user_id.
CREATE INDEX IF NOT EXISTS idx_crew_assignments_user_current ON public.crew_assignments (user_id, vessel_id) WHERE is_current;

ALTER TABLE public.account_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_membership_vessels ENABLE ROW LEVEL SECURITY;

-- Grants first (rule 4): reads only; writes go through the definers of this
-- phase and X6's later RPCs, never a client path to your own membership.
REVOKE ALL ON TABLE public.account_memberships FROM anon, authenticated;
REVOKE ALL ON TABLE public.account_membership_vessels FROM anon, authenticated;
GRANT SELECT ON TABLE public.account_memberships TO authenticated;
GRANT SELECT ON TABLE public.account_membership_vessels TO authenticated;
GRANT ALL ON TABLE public.account_memberships TO service_role;
GRANT ALL ON TABLE public.account_membership_vessels TO service_role;

-- ---------------------------------------------------------------- the active-user check

-- True iff the user has a profile whose account_status is not disabled /
-- deactivated, no membership in the profile's company is disabled or
-- removed or (a non-legacy one) outside its valid_from / valid_until window
-- (an external viewer's access ends with the window, C17), and auth has no
-- ban in force and no soft delete (auth.users.deleted_at: a GoTrue soft
-- delete leaves issued tokens valid until they expire; review round 4,
-- user-is-active-ignores-soft-delete). Legacy-managed rows have no window, so nobody's access
-- changes when this file is applied. An invitation past its expiry grants
-- nothing (D-228; review round 5, expired-invitation-still-accepted): a
-- profile still 'invited' whose membership was never accepted and whose
-- newest invitation (by login or by profile) is still live (pending,
-- sent, send_failed), never accepted and past expires_at is not active,
-- whether or not an expiry job has run (a resend writes a new expiry, so
-- it works again). NULL → false. Asked about another
-- user, a signed-in caller gets the truth only for an active member of
-- their own company (no cross-tenant probing); without a JWT (SQL editor,
-- cron, the service-role client) it answers for anyone.
--
-- LANGUAGE plpgsql (D-229): every policy and helper calls it, often per
-- row, and PL/pgSQL caches its plans for the session where a nested SQL
-- function is planned again on every call. The first statement is the
-- original SQL body unchanged; the invitation lookup is static SQL behind
-- to_regclass (planned only once user_invitations exists, then cached;
-- 20261123010200_platform_user_invitations.sql creates the table and its
-- (profile_id, created_at) index) and runs only for an 'invited' profile.
CREATE OR REPLACE FUNCTION public.user_is_active(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active boolean;
  v_expired boolean;
BEGIN
  v_active := (
    WITH state AS (
      SELECT p.user_id,
             p.company_id,
             (lower(coalesce(p.account_status, 'active')) NOT IN ('disabled', 'deactivated')
              AND NOT EXISTS (
                SELECT 1 FROM public.account_memberships AS m
                WHERE m.user_id = p.user_id AND m.company_id = p.company_id
                  AND (m.status IN ('disabled', 'removed')
                       OR (NOT m.legacy_managed AND (
                             (m.valid_from IS NOT NULL AND m.valid_from > now())
                          OR (m.valid_until IS NOT NULL AND m.valid_until <= now())))))
              AND NOT EXISTS (
                SELECT 1 FROM auth.users AS u
                WHERE u.id = p.user_id
                  AND (u.deleted_at IS NOT NULL
                       OR (u.banned_until IS NOT NULL AND u.banned_until > now())))
             ) AS active
      FROM public.profiles AS p
      WHERE p.user_id = _user_id OR p.user_id = auth.uid()
    )
    SELECT coalesce((
      SELECT t.active AND (
        auth.uid() IS NULL
        OR t.user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM state AS c WHERE c.user_id = auth.uid() AND c.active AND c.company_id = t.company_id)
      )
      FROM state AS t
      WHERE t.user_id = _user_id
    ), false)
  );
  IF NOT v_active OR to_regclass('public.user_invitations') IS NULL THEN
    RETURN v_active;
  END IF;
  -- D-228: the target, and a signed-in caller asking about someone else
  -- (their own activity is part of the answer above), with an expired,
  -- never-accepted invitation get nothing.
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.user_id IN (_user_id, v_uid)
      AND lower(coalesce(p.account_status, 'active')) = 'invited'
      AND NOT EXISTS (
        SELECT 1 FROM public.account_memberships AS m
        WHERE m.user_id = p.user_id AND m.company_id = p.company_id AND m.accepted_at IS NOT NULL)
      AND EXISTS (
        SELECT 1
        FROM (SELECT ui.status, ui.accepted_at, ui.expires_at
                FROM public.user_invitations AS ui
               WHERE ui.user_id = p.user_id OR ui.profile_id = p.id
               ORDER BY ui.created_at DESC, ui.id DESC
               LIMIT 1) AS newest
        WHERE newest.status IN ('pending', 'sent', 'send_failed')
          AND newest.accepted_at IS NULL
          AND newest.expires_at < now())
  ) INTO v_expired;
  RETURN NOT coalesce(v_expired, false);
END;
$$;

-- Whether the user's access was withdrawn with their invitation:
--   - the profile is neither invited nor active (e.g. not_invited after a
--     revoke) and the newest invitation of the user (by login or by
--     profile) is revoked or expired and was never accepted; or
--   - (D-228; review round 5) the profile is still 'invited', its
--     membership was never accepted, and the newest invitation is still
--     live (pending, sent, send_failed), never accepted and past
--     expires_at: an expiry no job has recorded yet withdraws the access
--     too (user_is_active() says the same).
-- False until 20261123010200_platform_user_invitations.sql creates the
-- table (read through EXECUTE behind to_regclass). Internal:
-- my_account_status() and record_session_start() answer 'disabled' for it
-- (D-141 vocabulary).
CREATE OR REPLACE FUNCTION public.invitation_withdrawn_for(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_company uuid;
  v_status text;
  v_withdrawn boolean := false;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT p.id, p.company_id, lower(coalesce(p.account_status, 'active')) INTO v_profile_id, v_company, v_status
  FROM public.profiles AS p WHERE p.user_id = _user_id;
  IF NOT FOUND OR v_status = 'active' OR to_regclass('public.user_invitations') IS NULL THEN
    RETURN false;
  END IF;
  IF v_status = 'invited' THEN
    IF EXISTS (SELECT 1 FROM public.account_memberships AS m
               WHERE m.user_id = _user_id AND m.company_id = v_company AND m.accepted_at IS NOT NULL) THEN
      RETURN false;
    END IF;
    EXECUTE 'SELECT ui.status IN (''pending'', ''sent'', ''send_failed'') AND ui.accepted_at IS NULL AND ui.expires_at < now()
               FROM public.user_invitations AS ui
              WHERE ui.user_id = $1 OR ui.profile_id = $2
              ORDER BY ui.created_at DESC, ui.id DESC
              LIMIT 1'
      INTO v_withdrawn
      USING _user_id, v_profile_id;
    RETURN coalesce(v_withdrawn, false);
  END IF;
  EXECUTE 'SELECT ui.status IN (''revoked'', ''expired'') AND ui.accepted_at IS NULL
             FROM public.user_invitations AS ui
            WHERE ui.user_id = $1 OR ui.profile_id = $2
            ORDER BY ui.created_at DESC, ui.id DESC
            LIMIT 1'
    INTO v_withdrawn
    USING _user_id, v_profile_id;
  RETURN coalesce(v_withdrawn, false);
END;
$$;

-- The caller's own status: works for a disabled user (that is its purpose).
-- 'disabled' also when the access was withdrawn with a revoked or expired
-- invitation that was never accepted (invitation_withdrawn_for()).
CREATE OR REPLACE FUNCTION public.my_account_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()) THEN 'no_profile'
    WHEN public.user_is_active(auth.uid()) AND NOT public.invitation_withdrawn_for(auth.uid()) THEN 'active'
    ELSE 'disabled'
  END
$$;

-- ---------------------------------------------------------------- legacy rules (D-26)

-- Legacy profiles.role dpa / shore_management: every vessel of the company.
CREATE OR REPLACE FUNCTION public.legacy_all_vessels(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.user_id = _user_id AND p.role::text IN ('dpa', 'shore_management')
  )
$$;

-- D-26 fleet reach: legacy dpa / shore_management, or an active, in-date
-- RBAC role that is fleet-wide (no vessel, default scope fleet) or named
-- superadmin / dpa / fleet_master (FLEET_RBAC_ROLES).
CREATE OR REPLACE FUNCTION public.legacy_fleet_reach(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.legacy_all_vessels(_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.rbac_user_roles AS ur
        JOIN public.roles AS r ON r.id = ur.role_id
        WHERE ur.user_id = _user_id
          AND ur.is_active = true
          AND (ur.valid_until IS NULL OR ur.valid_until > now())
          AND ((ur.vessel_id IS NULL AND r.default_scope = 'fleet') OR r.name IN ('superadmin', 'dpa', 'fleet_master'))
      )
$$;

-- A vessel counts for reach only while not archived and with a set status
-- that is not Sold (legacy parity: the client's .neq('status','Sold') drops
-- a NULL status too).
CREATE OR REPLACE FUNCTION public.vessel_in_reachable_state(_lifecycle_status text, _status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT _lifecycle_status IS DISTINCT FROM 'archived' AND _status IS NOT NULL AND _status <> 'Sold'
$$;

-- ---------------------------------------------------------------- current crew assignments (D-217, D-227)

-- Whether a crew_assignments row counts as current (D-217; review round 5,
-- stale-is-current-keeps-reach): is_current is set and the leave date
-- (else the end date) has not come. The legacy normaliser
-- (trg_crew_assignments_normalise_dates) applies the same rule, but only
-- when a row is written, so a row whose leave date passed later still
-- says is_current until crew_assignments_end_stale() (20261123010300)
-- sweeps it. Every reader of "current" in the build-out asks this; the
-- callers keep a plain is_current conjunct beside it so the planner can
-- use idx_crew_assignments_user_current. LANGUAGE plpgsql: the ACL rule's
-- SET search_path blocks SQL inlining, and a nested SQL function would be
-- planned again on every call (D-229). STABLE (current_date). Internal:
-- definers call it, nothing is granted.
CREATE OR REPLACE FUNCTION public.crew_assignment_is_current(_is_current boolean, _leave date, _end date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN coalesce(_is_current, false) AND NOT coalesce(coalesce(_leave, _end) <= current_date, false);
END;
$$;

-- Whether a crew_assignments row holds its office now (D-227): current
-- (crew_assignment_is_current) and joined: the join date (else the start
-- date) has come. The Master office (record_is_master, the office slots of
-- record_slot_eligible) starts on the join date; vessel reach of a planned
-- assignment stays as legacy (VesselAccessSection allows a future start).
-- Internal: definers call it, nothing is granted.
CREATE OR REPLACE FUNCTION public.crew_assignment_holds_office(_is_current boolean, _join date, _start date, _leave date, _end date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN public.crew_assignment_is_current(_is_current, _leave, _end)
     AND NOT coalesce(coalesce(_join, _start) > current_date, false);
END;
$$;

-- ---------------------------------------------------------------- internal reach (service role; definers)

-- The vessels the user reaches, for any user (no caller rule, CC-3).
-- Empty unless user_is_active(); only the membership in the profile's
-- company, active and inside its window, counts (no membership → empty).
-- A crew assignment counts while crew_assignment_is_current() (D-217).
CREATE OR REPLACE FUNCTION public.reach_vessels_for(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT p.company_id, m.id AS membership_id, m.kind, m.legacy_managed, m.vessel_scope
    FROM public.profiles AS p
    JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
    WHERE p.user_id = _user_id
      AND m.status = 'active'
      AND (m.valid_from IS NULL OR m.valid_from <= now())
      AND (m.valid_until IS NULL OR m.valid_until > now())
      AND public.user_is_active(_user_id)
  )
  SELECT v.id
  FROM me
  JOIN public.vessels AS v ON v.company_id = me.company_id
  WHERE public.vessel_in_reachable_state(v.lifecycle_status, v.status)
    AND (
      (me.legacy_managed AND public.legacy_all_vessels(_user_id))
      OR (NOT me.legacy_managed AND me.vessel_scope = 'all')
      OR (NOT me.legacy_managed AND EXISTS (
            SELECT 1 FROM public.account_membership_vessels AS mv
            WHERE mv.membership_id = me.membership_id AND mv.vessel_id = v.id
              AND (mv.valid_from IS NULL OR mv.valid_from <= now())
              AND (mv.valid_until IS NULL OR mv.valid_until > now())))
      OR ((me.legacy_managed OR me.kind <> 'external') AND EXISTS (
            SELECT 1 FROM public.crew_assignments AS ca
            WHERE ca.user_id = _user_id AND ca.vessel_id = v.id
              AND ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)))
    )
  ORDER BY v.created_at, v.id
$$;

-- One vessel: the same predicates as reach_vessels_for, written as an
-- EXISTS on the vessel (index hits only; RLS calls it per row).
CREATE OR REPLACE FUNCTION public.reach_vessel_for(_user_id uuid, _vessel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _vessel_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.vessels AS v
    JOIN public.profiles AS p ON p.user_id = _user_id AND p.company_id = v.company_id
    JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
    WHERE v.id = _vessel_id
      AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
      AND m.status = 'active'
      AND (m.valid_from IS NULL OR m.valid_from <= now())
      AND (m.valid_until IS NULL OR m.valid_until > now())
      AND public.user_is_active(_user_id)
      AND (
        (m.legacy_managed AND p.role::text IN ('dpa', 'shore_management'))
        OR (NOT m.legacy_managed AND m.vessel_scope = 'all')
        OR (NOT m.legacy_managed AND EXISTS (
              SELECT 1 FROM public.account_membership_vessels AS mv
              WHERE mv.membership_id = m.id AND mv.vessel_id = v.id
                AND (mv.valid_from IS NULL OR mv.valid_from <= now())
                AND (mv.valid_until IS NULL OR mv.valid_until > now())))
        OR ((m.legacy_managed OR m.kind <> 'external') AND EXISTS (
              SELECT 1 FROM public.crew_assignments AS ca
              WHERE ca.user_id = _user_id AND ca.vessel_id = v.id
                AND ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)))
      )
  )
$$;

-- Fleet reach, for any user: active user; active, in-window membership in
-- the profile's company (and = _company_id when given); legacy-managed →
-- legacy_fleet_reach(), else fleet_access.
CREATE OR REPLACE FUNCTION public.fleet_reach_for(_user_id uuid, _company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.account_memberships AS m ON m.user_id = p.user_id AND m.company_id = p.company_id
    WHERE p.user_id = _user_id
      AND (_company_id IS NULL OR p.company_id = _company_id)
      AND m.status = 'active'
      AND (m.valid_from IS NULL OR m.valid_from <= now())
      AND (m.valid_until IS NULL OR m.valid_until > now())
      AND public.user_is_active(_user_id)
      AND CASE WHEN m.legacy_managed THEN public.legacy_fleet_reach(_user_id) ELSE m.fleet_access END
  )
$$;

-- ---------------------------------------------------------------- public reach (caller rule)

-- Caller rule, shared by the three public helpers: no JWT (SQL editor,
-- cron, the service-role client), the caller asking about themselves, or a
-- users-access viewer who may view the target: admin_may_view_user(<the
-- target>, <the target's profile company>) (gap/01 F23 / D-194; review
-- round 5, reach-helpers-ignore-f23-scope), which asks
-- has_capability('admin.access.users_access.view', company) and
-- admin_may_act_on_user(), so a vessel-scoped viewer gets answers only for
-- the users of the vessels they reach. admin_may_view_user arrives with
-- 20261123000400_platform_capabilities.sql and is called through EXECUTE
-- behind to_regprocedure, so before that file only self and no-JWT callers
-- get an answer. It reads the internal reach_vessels_for(), never these
-- helpers, so nothing recurses. Anyone else gets nothing; unknown ids get
-- nothing (false or empty).

CREATE OR REPLACE FUNCTION public.user_vessel_reach(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_allowed boolean := false;
  v_company uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  IF v_caller IS NULL OR v_caller = _user_id THEN
    v_allowed := true;
  ELSIF to_regprocedure('public.admin_may_view_user(uuid,uuid,uuid)') IS NOT NULL THEN
    SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.user_id = _user_id;
    IF v_company IS NOT NULL THEN
      EXECUTE 'SELECT public.admin_may_view_user($1, $2, NULL)' INTO v_allowed USING _user_id, v_company;
    END IF;
  END IF;
  IF coalesce(v_allowed, false) THEN
    RETURN QUERY SELECT r FROM public.reach_vessels_for(_user_id) AS r;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_reach_vessel(_user_id uuid, _vessel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_allowed boolean := false;
  v_company uuid;
BEGIN
  IF _user_id IS NULL OR _vessel_id IS NULL THEN RETURN false; END IF;
  IF v_caller IS NULL OR v_caller = _user_id THEN
    v_allowed := true;
  ELSIF to_regprocedure('public.admin_may_view_user(uuid,uuid,uuid)') IS NOT NULL THEN
    SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.user_id = _user_id;
    IF v_company IS NOT NULL THEN
      EXECUTE 'SELECT public.admin_may_view_user($1, $2, NULL)' INTO v_allowed USING _user_id, v_company;
    END IF;
  END IF;
  RETURN coalesce(v_allowed, false) AND public.reach_vessel_for(_user_id, _vessel_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_fleet_reach(_user_id uuid, _company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_allowed boolean := false;
  v_company uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF v_caller IS NULL OR v_caller = _user_id THEN
    v_allowed := true;
  ELSIF to_regprocedure('public.admin_may_view_user(uuid,uuid,uuid)') IS NOT NULL THEN
    SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.user_id = _user_id;
    IF v_company IS NOT NULL THEN
      EXECUTE 'SELECT public.admin_may_view_user($1, $2, NULL)' INTO v_allowed USING _user_id, v_company;
    END IF;
  END IF;
  RETURN coalesce(v_allowed, false) AND public.fleet_reach_for(_user_id, _company_id);
END;
$$;

-- ---------------------------------------------------------------- sign-in bookkeeping

-- Same answer as my_account_status(). For an active user it also records
-- the sign-in, under storm.access_engine (rule 13): profiles.last_login_at
-- (at most every 5 minutes, F50), profiles.account_status 'invited' →
-- 'active' (the first sign-in after an invitation, CC-19), the membership's
-- accepted_at (once) and last_active_at, and, once
-- 20261123010200_platform_user_invitations.sql exists, the caller's live
-- invitations (by user id or by profile) that are not past expires_at →
-- accepted. A disabled user, a user
-- whose access was withdrawn with a revoked or expired invitation
-- (invitation_withdrawn_for()) or a user without a profile writes nothing. The bookkeeping sits in its own
-- block: if it fails, the status is still answered (with a WARNING), so a
-- bookkeeping problem never blocks a sign-in.
--
-- An invitation past its expiry is never accepted (D-228; review round 5,
-- expired-invitation-still-accepted): before the active check, once
-- user_invitations exists, the caller's live (pending, sent, send_failed),
-- never-accepted rows past expires_at become 'expired' under
-- storm.access_engine, and invitation_withdraw_access(id, expires_at)
-- withdraws the access each opened, counting only sign-in evidence from
-- before the expiry (this sign-in is already in auth.users
-- last_sign_in_at) or an accepted membership. The answer is then
-- 'disabled' for an invitee whose access that withdrew; an accepted member
-- whose re-invite expired keeps their access.
CREATE OR REPLACE FUNCTION public.record_session_start()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_company uuid;
  v_account_status text;
  v_last_login timestamptz;
  v_claims text;
  v_sub text;
  v_engine text;
  v_expired record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'no_profile';
  END IF;
  SELECT p.id, p.company_id, p.account_status, p.last_login_at
    INTO v_profile_id, v_company, v_account_status, v_last_login
  FROM public.profiles AS p
  WHERE p.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN 'no_profile';
  END IF;

  -- D-228: expire the caller's live invitations past expires_at and
  -- withdraw the access they opened (evidence before the expiry only).
  -- If this fails, nothing of it is kept and the answer still fails
  -- closed: user_is_active() denies a live invitation past its expiry.
  IF to_regclass('public.user_invitations') IS NOT NULL THEN
    BEGIN
      v_engine := current_setting('storm.access_engine', true);
      PERFORM set_config('storm.access_engine', 'on', true);
      FOR v_expired IN EXECUTE
        'UPDATE public.user_invitations SET status = ''expired''
          WHERE status IN (''pending'', ''sent'', ''send_failed'') AND accepted_at IS NULL
            AND expires_at IS NOT NULL AND expires_at < now() AND (user_id = $1 OR profile_id = $2)
          RETURNING id, expires_at'
        USING v_uid, v_profile_id
      LOOP
        IF to_regprocedure('public.invitation_withdraw_access(uuid,timestamptz)') IS NOT NULL THEN
          EXECUTE 'SELECT public.invitation_withdraw_access($1, $2)' USING v_expired.id, v_expired.expires_at;
        END IF;
      END LOOP;
      PERFORM set_config('storm.access_engine', coalesce(v_engine, ''), true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'record_session_start_expiry_failed' USING DETAIL = 'SQLSTATE ' || SQLSTATE;
    END;
  END IF;

  IF NOT public.user_is_active(v_uid) OR public.invitation_withdrawn_for(v_uid) THEN
    RETURN 'disabled';
  END IF;

  BEGIN
    PERFORM set_config('storm.access_engine', 'on', true);

    IF v_last_login IS NULL OR v_last_login < now() - interval '5 minutes' THEN
      UPDATE public.profiles SET last_login_at = now() WHERE id = v_profile_id;
    END IF;

    IF v_account_status = 'invited' THEN
      -- The live guard trg_profiles_guard_privileged_columns (legacy row 12)
      -- predates the engine flag and lets only HR admins change
      -- account_status while a JWT is set. This one statement (the caller's
      -- own row, invited → active only) runs without the claims, as the
      -- service role would; the claims are restored right after (and by the
      -- block's rollback if anything fails).
      v_claims := current_setting('request.jwt.claims', true);
      v_sub := current_setting('request.jwt.claim.sub', true);
      PERFORM set_config('request.jwt.claims', '', true);
      PERFORM set_config('request.jwt.claim.sub', '', true);
      UPDATE public.profiles SET account_status = 'active' WHERE id = v_profile_id AND account_status = 'invited';
      PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
      PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    END IF;

    UPDATE public.account_memberships
    SET accepted_at = coalesce(accepted_at, now()),
        last_active_at = now()
    WHERE user_id = v_uid
      AND company_id = v_company
      AND (accepted_at IS NULL OR last_active_at IS NULL OR last_active_at < now() - interval '5 minutes');

    IF to_regclass('public.user_invitations') IS NOT NULL THEN
      -- Never a row past its expiry (D-228): those were expired above.
      EXECUTE 'UPDATE public.user_invitations SET status = ''accepted'', accepted_at = now()
               WHERE status IN (''pending'', ''sent'', ''send_failed'') AND (user_id = $1 OR profile_id = $2)
                 AND (expires_at IS NULL OR expires_at >= now())'
        USING v_uid, v_profile_id;
    END IF;

    PERFORM set_config('storm.access_engine', '', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'record_session_start_bookkeeping_failed' USING DETAIL = 'SQLSTATE ' || SQLSTATE;
  END;
  RETURN 'active';
END;
$$;

-- ---------------------------------------------------------------- triggers

-- trg_account_membership_vessels_company: company_id comes from the
-- membership (a client value is overwritten) and the vessel must belong to
-- that company.
CREATE OR REPLACE FUNCTION public.account_membership_vessels_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT m.company_id INTO v_company FROM public.account_memberships AS m WHERE m.id = NEW.membership_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'membership_not_found';
  END IF;
  NEW.company_id := v_company;
  IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'membership_vessel_company_mismatch',
      DETAIL = 'A membership can only list vessels of its own company.';
  END IF;
  RETURN NEW;
END;
$$;

-- trg_profiles_sync_membership: keeps the legacy-managed membership of a
-- profile with a login in step with profiles.role / account_status /
-- company_id / user_id. A row an admin made non-legacy is never touched.
-- Values: kind admin for dpa / shore_management (else crew), is_dpa and
-- manages_admins for dpa, vessel_scope all for dpa / shore_management,
-- fleet_access = legacy_fleet_reach() at sync time (legacy rows are
-- evaluated live, the flag is informational), status disabled for a
-- disabled / deactivated profile (else active). A company or login change
-- marks the old legacy row removed. A removed row stays removed on a later
-- profile update (a revoked or expired invitation removes it,
-- 20261123010200): only a sent invitation (record_invitation_send),
-- set_membership_status, or the profile moving (back) into the company
-- (a company or login change, which only the service role can make) bring
-- it back.
CREATE OR REPLACE FUNCTION public.account_memberships_sync_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := NEW.role::text;
  v_status text;
  v_profile_id uuid;
  v_moved boolean := TG_OP = 'INSERT' OR OLD.company_id IS DISTINCT FROM NEW.company_id OR OLD.user_id IS DISTINCT FROM NEW.user_id;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND OLD.company_id IS NOT NULL
     AND (OLD.company_id IS DISTINCT FROM NEW.company_id OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    UPDATE public.account_memberships AS m
    SET status = 'removed',
        removed_at = coalesce(m.removed_at, now()),
        profile_id = CASE WHEN m.company_id IS NOT DISTINCT FROM NEW.company_id THEN NULL ELSE m.profile_id END
    WHERE m.company_id = OLD.company_id AND m.user_id = OLD.user_id AND m.legacy_managed;
  END IF;

  IF NEW.user_id IS NULL OR NEW.company_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_status := CASE WHEN lower(coalesce(NEW.account_status, 'active')) IN ('disabled', 'deactivated') THEN 'disabled' ELSE 'active' END;
  -- The profile key may still be held by another row of the company (a
  -- previous login of this profile): then this row carries no profile id.
  v_profile_id := CASE
    WHEN EXISTS (SELECT 1 FROM public.account_memberships AS m
                 WHERE m.company_id = NEW.company_id AND m.profile_id = NEW.id AND m.user_id IS DISTINCT FROM NEW.user_id)
    THEN NULL ELSE NEW.id END;

  INSERT INTO public.account_memberships AS m
    (company_id, user_id, profile_id, kind, status, legacy_managed, fleet_access, vessel_scope, is_dpa, manages_admins, disabled_at, source)
  VALUES (
    NEW.company_id, NEW.user_id, v_profile_id,
    CASE WHEN v_role IN ('dpa', 'shore_management') THEN 'admin' ELSE 'crew' END,
    v_status, true, public.legacy_fleet_reach(NEW.user_id),
    CASE WHEN v_role IN ('dpa', 'shore_management') THEN 'all' ELSE 'assigned' END,
    v_role = 'dpa', v_role = 'dpa',
    CASE WHEN v_status = 'disabled' THEN now() END,
    'profile_sync'
  )
  ON CONFLICT (company_id, user_id) WHERE user_id IS NOT NULL DO UPDATE
  SET profile_id = coalesce(EXCLUDED.profile_id, m.profile_id),
      kind = EXCLUDED.kind,
      status = CASE WHEN m.status = 'removed' AND NOT v_moved THEN 'removed' ELSE EXCLUDED.status END,
      fleet_access = EXCLUDED.fleet_access,
      vessel_scope = EXCLUDED.vessel_scope,
      is_dpa = EXCLUDED.is_dpa,
      manages_admins = EXCLUDED.manages_admins,
      disabled_at = CASE WHEN EXCLUDED.status = 'disabled' THEN coalesce(m.disabled_at, now()) END,
      disabled_by = CASE WHEN EXCLUDED.status = 'disabled' THEN m.disabled_by END,
      disabled_reason = CASE WHEN EXCLUDED.status = 'disabled' THEN m.disabled_reason END,
      removed_at = CASE WHEN m.status = 'removed' AND NOT v_moved THEN m.removed_at END,
      source = CASE WHEN m.source = 'backfill' THEN 'backfill' ELSE 'profile_sync' END
  WHERE m.legacy_managed;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------- backfill (legacy-managed rows)

-- Every profile with a login and a company, values as the sync trigger
-- computes them. Profiles without a login (imported crew) get no membership
-- in Phase 2: they cannot sign in (X6's invite flow creates 'invited' rows).
-- user_roles superadmin is not migrated to platform staff here (gap/01 F3).
-- Then accepted_at from the sign-in evidence (review round 2, D-120).
INSERT INTO public.account_memberships
  (company_id, user_id, profile_id, kind, status, legacy_managed, fleet_access, vessel_scope, is_dpa, manages_admins, disabled_at, source)
SELECT p.company_id, p.user_id, p.id,
       CASE WHEN p.role::text IN ('dpa', 'shore_management') THEN 'admin' ELSE 'crew' END,
       CASE WHEN lower(coalesce(p.account_status, 'active')) IN ('disabled', 'deactivated') THEN 'disabled' ELSE 'active' END,
       true,
       public.legacy_fleet_reach(p.user_id),
       CASE WHEN p.role::text IN ('dpa', 'shore_management') THEN 'all' ELSE 'assigned' END,
       p.role::text = 'dpa',
       p.role::text = 'dpa',
       CASE WHEN lower(coalesce(p.account_status, 'active')) IN ('disabled', 'deactivated') THEN now() END,
       'backfill'
FROM public.profiles AS p
WHERE p.user_id IS NOT NULL
  AND p.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.account_memberships AS m WHERE m.company_id = p.company_id AND m.profile_id = p.id)
ON CONFLICT (company_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;

-- Sign-in evidence before the apply (coalesce(profiles.last_login_at, auth
-- last_sign_in_at): nothing wrote last_login_at before Phase 2, auth records
-- every sign-in) makes a legacy-managed membership accepted, so
-- membership.accepted_at is honest for pre-apply sign-ins and a later
-- revoke or expiry of a re-invite never withdraws a signed-in user's
-- access (20261123010200 invitation_withdraw_access). Only rows still
-- without accepted_at (idempotent, D-12).
UPDATE public.account_memberships AS m
SET accepted_at = coalesce(p.last_login_at, u.last_sign_in_at)
FROM public.profiles AS p
LEFT JOIN auth.users AS u ON u.id = p.user_id
WHERE m.legacy_managed
  AND m.accepted_at IS NULL
  AND p.user_id = m.user_id
  AND p.company_id = m.company_id
  AND coalesce(p.last_login_at, u.last_sign_in_at) IS NOT NULL;

DROP TRIGGER IF EXISTS trg_profiles_sync_membership ON public.profiles;
CREATE TRIGGER trg_profiles_sync_membership
  AFTER INSERT OR UPDATE OF user_id, company_id, role, account_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.account_memberships_sync_from_profile();

DROP TRIGGER IF EXISTS trg_account_membership_vessels_company ON public.account_membership_vessels;
CREATE TRIGGER trg_account_membership_vessels_company
  BEFORE INSERT OR UPDATE ON public.account_membership_vessels
  FOR EACH ROW EXECUTE FUNCTION public.account_membership_vessels_company();

DROP TRIGGER IF EXISTS trg_account_memberships_updated_at ON public.account_memberships;
CREATE TRIGGER trg_account_memberships_updated_at
  BEFORE UPDATE ON public.account_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_account_membership_vessels_updated_at ON public.account_membership_vessels;
CREATE TRIGGER trg_account_membership_vessels_updated_at
  BEFORE UPDATE ON public.account_membership_vessels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- policies (own rows; admin reads come with file 4)

DROP POLICY IF EXISTS account_memberships_select_own ON public.account_memberships;
CREATE POLICY account_memberships_select_own ON public.account_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()));

DROP POLICY IF EXISTS account_membership_vessels_select ON public.account_membership_vessels;
CREATE POLICY account_membership_vessels_select ON public.account_membership_vessels
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.account_memberships AS m WHERE m.id = membership_id AND m.user_id = auth.uid())
    AND public.user_is_active(auth.uid())
  );

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.user_is_active(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_account_status() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invitation_withdrawn_for(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_session_start() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legacy_all_vessels(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legacy_fleet_reach(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_in_reachable_state(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_assignment_is_current(boolean, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_assignment_holds_office(boolean, date, date, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reach_vessels_for(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reach_vessel_for(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_reach_for(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_vessel_reach(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_can_reach_vessel(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_has_fleet_reach(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.account_membership_vessels_company() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.account_memberships_sync_from_profile() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.user_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_account_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_withdrawn_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_session_start() TO authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_all_vessels(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.legacy_fleet_reach(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vessel_in_reachable_state(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reach_vessels_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reach_vessel_for(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_reach_for(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_vessel_reach(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_reach_vessel(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_fleet_reach(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.account_memberships IS 'One membership per user per company (gap/01 F22, C16, C17, C19; D-123): kind owner | admin | shore | crew | external, status invited | active | disabled | removed, fleet_access, vessel_scope all | assigned. legacy_managed rows (backfill, profile sync) are evaluated live from the D-26 sources. Read: own row (active users), users-access viewers of the company (file 4). No client writes: definers and X6 RPCs only.';
COMMENT ON TABLE public.account_membership_vessels IS 'The vessels a non-legacy membership with vessel_scope assigned reaches, each with an optional validity window. company_id is stamped from the membership (trg_account_membership_vessels_company); the vessel must be of that company. Read: own membership (active users), users-access viewers (file 4). No client writes.';
COMMENT ON COLUMN public.account_memberships.legacy_managed IS 'True for backfilled / profile-synced rows: reach and fleet access come live from profiles.role, RBAC roles and crew assignments (D-26), not from the stored flags. X6 sets it false when an admin edits the row.';
COMMENT ON COLUMN public.account_memberships.fleet_access IS 'May open the Fleet view (non-legacy rows). For legacy rows it records legacy_fleet_reach() at the last sync.';
COMMENT ON COLUMN public.account_memberships.vessel_scope IS 'all = every reachable vessel of the company; assigned = the membership vessel rows valid now plus current crew assignments (not for external).';
COMMENT ON COLUMN public.account_memberships.is_dpa IS 'DECISIONS C19: DPA is a flag on the membership (legacy dpa profiles).';
COMMENT ON COLUMN public.account_memberships.valid_until IS 'End of the membership window; required for external viewers (C17).';

COMMENT ON FUNCTION public.user_is_active(uuid) IS 'D-122: profile not disabled / deactivated, no disabled / removed membership in the profile''s company and no non-legacy membership outside its valid_from / valid_until window (C17), no auth ban in force and no auth soft delete (auth.users.deleted_at); and (D-228) not a still-invited profile with a never-accepted membership whose newest invitation is live, never accepted and past expires_at. Signed-in callers get the truth about themselves and active members of their own company only; no JWT: anyone. Reads the tables directly (file 7 builds the legacy helpers on it). plpgsql (D-229): policies call it per row.';
COMMENT ON FUNCTION public.my_account_status() IS 'The caller''s status: active | disabled | no_profile (D-141). disabled also when the access was withdrawn with a revoked or expired invitation that was never accepted. Works for a disabled user (the sign-in screen uses it).';
COMMENT ON FUNCTION public.invitation_withdrawn_for(uuid) IS 'Internal (service role; definers): the profile is neither invited nor active and the user''s newest invitation is revoked or expired and was never accepted; or (D-228) the profile is still invited, its membership never accepted, and the newest invitation is live, never accepted and past expires_at. False before user_invitations exists.';
COMMENT ON FUNCTION public.record_session_start() IS 'Called by the client after sign-in: first (D-228) the caller''s live invitations past expires_at become expired and invitation_withdraw_access(id, expires_at) withdraws the access they opened (sign-in evidence from before the expiry, or an accepted membership, keeps it); then the same answer as my_account_status(); for an active user records last_login_at (5-minute throttle), invited -> active, membership accepted_at / last_active_at and accepted invitations not past their expiry (once user_invitations exists), under storm.access_engine.';
COMMENT ON FUNCTION public.legacy_all_vessels(uuid) IS 'D-26: legacy profiles.role dpa / shore_management reach every vessel of the company. Internal (service role; definers).';
COMMENT ON FUNCTION public.legacy_fleet_reach(uuid) IS 'D-26 fleet reach: legacy dpa / shore_management, or an active in-date RBAC role that is fleet-wide or named superadmin / dpa / fleet_master. Internal (service role; definers).';
COMMENT ON FUNCTION public.vessel_in_reachable_state(text, text) IS 'A vessel counts for reach while lifecycle_status is not archived and status is set and not Sold (legacy parity).';
COMMENT ON FUNCTION public.reach_vessels_for(uuid) IS 'Internal reach (CC-3, D-136): the vessels the user reaches, for any user; no caller rule. A crew assignment counts while crew_assignment_is_current() (is_current and the leave date, else end date, not come; D-217). Service role only; definers evaluating other users call it.';
COMMENT ON FUNCTION public.reach_vessel_for(uuid, uuid) IS 'Internal reach of one vessel (same predicates as reach_vessels_for, as an EXISTS; crew assignments by crew_assignment_is_current(), D-217). Service role only.';
COMMENT ON FUNCTION public.crew_assignment_is_current(boolean, date, date) IS 'D-217: a crew_assignments row counts as current while is_current is set and coalesce(leave_date, end_date) has not come (the legacy normaliser''s rule, applied on read; crew_assignments_end_stale() sweeps the stored flag). plpgsql STABLE (D-229). Internal: no grant.';
COMMENT ON FUNCTION public.crew_assignment_holds_office(boolean, date, date, date, date) IS 'D-227: a crew_assignments row holds its office (the Master office, slot offices) while crew_assignment_is_current() and coalesce(join_date, start_date) has come. Reach of a planned assignment stays as legacy. plpgsql STABLE (D-229). Internal: no grant.';
COMMENT ON FUNCTION public.fleet_reach_for(uuid, uuid) IS 'Internal fleet reach for any user (in _company_id when given): legacy rows by D-26, others by fleet_access. Service role only.';
COMMENT ON FUNCTION public.user_vessel_reach(uuid) IS 'The vessels a user reaches, for the user themselves, a users-access viewer who may view the target (admin_may_view_user, gap/01 F23 / D-194: a vessel-scoped viewer only for the users of the vessels they reach), or a caller without a JWT; nothing for anyone else or an unknown id.';
COMMENT ON FUNCTION public.user_can_reach_vessel(uuid, uuid) IS 'Whether a user reaches a vessel; caller rule as user_vessel_reach (yourself, no JWT, or a users-access viewer who may view the target: admin_may_view_user, gap/01 F23 / D-194). RLS calls it with auth.uid().';
COMMENT ON FUNCTION public.user_has_fleet_reach(uuid, uuid) IS 'Whether a user has fleet reach (in _company_id when given); caller rule as user_vessel_reach (yourself, no JWT, or a users-access viewer who may view the target: admin_may_view_user, gap/01 F23 / D-194).';
COMMENT ON FUNCTION public.account_membership_vessels_company() IS 'Trigger: stamps company_id from the membership and refuses a vessel of another company (membership_vessel_company_mismatch).';
COMMENT ON FUNCTION public.account_memberships_sync_from_profile() IS 'Trigger trg_profiles_sync_membership: upserts the legacy-managed membership of a profile with a login; never touches a non-legacy row; a company or login change removes the old legacy row; a removed row is not set active again by a later profile update (record_invitation_send sent, set_membership_status or a move back into the company restore it).';
