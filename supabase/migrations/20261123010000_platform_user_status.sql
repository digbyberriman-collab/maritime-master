-- =================================================================
-- PLATFORM P3: disabled users get nothing (gap/01 F47, W7; Phase 2 spec
-- §A.7, CC-6, CC-7, CC-10; proposed D-122, D-138)
-- Tables: none new. Policies (redefined on public.profiles):
--   "Users can view their own profile", "Users can update their own profile"
-- Helpers (live, redefined with the same signatures): user_belongs_to_company(),
--   get_user_company_id(), my_profile_id(), current_user_company_id(),
--   has_role(), has_any_role(), legacy_profile_role()
-- New: profiles_guard_access_columns() + trg_profiles_guard_access_columns,
--   set_membership_status(), auth_user_id_for_email(), user_is_admin_target()
--   (service role), lock_company_admin_managers() (no grant)
-- Redefined (live, same signature): hr_anonymize_profile() (the W7 guards
--   and the audit row around its account_status write)
-- TS mirror: src/modules/auth/services/accountStatus.ts (a disabled user
--   reads no profile row: the status comes from my_account_status() /
--   record_session_start()); the edge functions call set_membership_status
--   and auth_user_id_for_email with the service client
-- =================================================================
--
-- Every existing policy that calls one of the seven live helpers (about 680
-- call sites of user_belongs_to_company, ~190 of has_role / has_any_role)
-- now denies a disabled or deactivated profile, a disabled or removed
-- membership and a banned auth user, even while the access token is still
-- valid: each helper's latest live body is kept verbatim and AND-ed with
-- public.user_is_active() (20261123000300_platform_account_memberships.sql,
-- which reads the tables directly, so nothing here recurses).
--
-- About 48 live policies read the caller's company through an inline
-- subquery on profiles. RLS applies inside policy subqueries, so redefining
-- the two own-row profiles policies closes all of them at once: a disabled
-- user reads no profile row at all, not even their own. The client and the
-- edge helper learn the status from my_account_status() /
-- record_session_start() instead (file 3).
--
-- has_role() / has_any_role() count a user_roles row only in the holder's
-- own company (CC-5, D-181; review round 2): a row naming another company
-- never counts anywhere, so the legacy policies and definers built on them
-- stop honouring foreign rows.
--
-- Privileged profile columns (CC-6, W7): from a signed-in session,
-- company_id, user_id and account_status never change directly (access is
-- turned off and on through admin-actions / set_membership_status, which
-- carry the W7 guards, the reason and the audit row); role never changes
-- on your own row, and on someone else's row needs users-access admin in
-- their company, a manager of admins when an administrator is involved,
-- never a rank above your own, never the last manager of admins losing
-- dpa, and is audited (permission_audit_log). This phase's definers set
-- storm.access_engine (rule 13); the service role (no JWT) is not limited
-- here.
--
-- Rule 5: the redefined helpers were executable by PUBLIC (anon included);
-- they are now granted to authenticated and service_role only. An anon
-- request against a table whose policy calls one of them is refused with
-- 42501 instead of returning no rows (fail closed either way).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.user_is_active(uuid)') IS NULL OR to_regclass('public.account_memberships') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs user_is_active(uuid) and account_memberships: apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.admin_scope_all(uuid,uuid)') IS NULL
     OR to_regprocedure('public.admin_may_act_on_user(uuid,uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs has_capability_for(), admin_scope_all() and admin_may_act_on_user(): apply 20261123000400_platform_capabilities.sql first';
  END IF;
  IF to_regprocedure('public.invitation_withdrawn_for(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs invitation_withdrawn_for(): apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regclass('public.admin_action_log') IS NULL OR to_regclass('public.user_roles') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs public.admin_action_log and public.user_roles';
  END IF;
  -- Legacy Apply-queue rows 12 and 23 (spec §0.1, §G 1).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'trg_profiles_guard_privileged_columns' AND NOT tgisinternal) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs trg_profiles_guard_privileged_columns: apply 20260917190000_hris_review_fixes.sql first (ledger check query A)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Service role can create companies')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert their own profile' AND with_check LIKE '%company_id IS NULL%') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs the signup backstop: apply 20260919170100_signup_backstop.sql first (ledger check query D)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- the seven live helpers (rule 6)

-- 20260125160927_7551738f-…: the profile check, plus the active check.
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND company_id = _company_id
  ) AND public.user_is_active(_user_id)
$$;

-- 20260125160927_7551738f-…: the profile's company only for an active user.
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id AND public.user_is_active(_user_id) LIMIT 1
$$;

-- 20260917175040_22d84f6b-…: the caller's profile id only while active.
CREATE OR REPLACE FUNCTION public.my_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() AND public.user_is_active(auth.uid()) LIMIT 1
$$;

-- 20260501203014_9658bc16-…: the user_roles-based company, only while
-- active, and only from a row that names the caller's own profile company
-- (CC-5, D-181: a row naming another company gives nothing anywhere; the
-- frp_* and storage policies compare it with the row's company).
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.company_id
  FROM public.user_roles AS ur
  JOIN public.profiles AS p ON p.user_id = ur.user_id
  WHERE ur.user_id = auth.uid()
    AND ur.is_active = true
    AND ur.company_id IS NOT NULL
    AND ur.company_id = p.company_id
    AND public.user_is_active(auth.uid())
  LIMIT 1
$$;

-- 20260127170354_8cbfc11b-…: the user_roles check (own company, CC-5 /
-- D-181), plus the active check: has_any_role with one role.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_role(_user_id, ARRAY[_role]::public.app_role[])
$$;

-- 20260127170354_8cbfc11b-…: the user_roles check, plus the active check.
-- Only a row that counts in the holder's own company (CC-5, D-181): an
-- active, unexpired row with one of the roles that names the holder's
-- profile company, or a company-less row (a superadmin row counts
-- anywhere; any other company-less row counts for the holder's own
-- profile company only, which is what 20261123010500 then writes into it).
-- A row naming another company never counts, so the ~190 legacy call sites
-- (policies AND-ed with user_belongs_to_company, and the company-blind
-- hr_*, payroll_*, wellness_*, legal_*, medical, logbook, frp_* and form
-- definers) answer for the holder's own company only. No caller probe
-- guard: hr_can_admin(_user_id), payroll_can_*(_user_id) and others pass
-- arbitrary ids.
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND _roles IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.user_roles AS ur
       JOIN public.profiles AS p ON p.user_id = ur.user_id
       WHERE ur.user_id = _user_id
         AND ur.role = ANY (_roles)
         AND ur.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > now())
         AND (
           (ur.company_id IS NOT NULL AND p.company_id IS NOT NULL AND ur.company_id = p.company_id)
           OR (ur.company_id IS NULL AND (ur.role = 'superadmin' OR p.company_id IS NOT NULL))
         )
     )
     AND public.user_is_active(_user_id)
$$;

-- 20260917174601_92aaeda7-…: the legacy profile role, NULL for an inactive
-- user, so the HR / legal / health helpers built on it deny too.
CREATE OR REPLACE FUNCTION public.legacy_profile_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = _user_id AND public.user_is_active(_user_id) LIMIT 1
$$;

-- ---------------------------------------------------------------- own-row profile policies (CC-7)

-- A disabled user reads no profile row, so every inline
-- "(SELECT company_id FROM profiles WHERE user_id = auth.uid())" in a policy
-- denies too.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.user_is_active(auth.uid()));

-- ---------------------------------------------------------------- privileged profile columns (CC-6)

-- trg_profiles_guard_access_columns. With a JWT caller and storm.access_engine
-- off (42501 with a stable MESSAGE):
--   company_id / user_id never change           profile_access_columns_locked
--   account_status never changes                profile_access_columns_locked
--                                               (DETAIL: use admin-actions /
--                                               set_membership_status)
--   the invitation and sign-in bookkeeping      profile_access_columns_locked
--     (invitation_token, invitation_token_expires, invitation_count,
--     last_invited_at, invited_at, last_login_at) never changes, your own
--     row included: the engine writes it (record_session_start,
--     record_invitation_send, invitation_withdraw_access; D-174, D-176,
--     D-183); a new profile starts with no token, no sign-in and count 0
--   role: never on your own row, and otherwise
--     users-access admin of the row's company   profile_access_columns_locked
--     an actor who may act on the target (every
--     vessel of the target in the actor's reach,
--     or an all-vessels admin; a dpa /
--     shore_management role, which is fleet-wide,
--     needs an all-vessels admin; gap/01 F23)   profile_access_columns_locked
--     a manager of admins there when the old or
--     new role is dpa / shore_management or the
--     target's membership is admin / owner      manages_admins_required
--     the new role's legacy rank (dpa 90, shore
--     management 80, master 60, chief officer /
--     chief engineer 50, crew 10) at most the
--     caller's user_role_rank()                 rank_exceeded
--     never dpa away from the last active
--     manager of admins of the company          last_manager_of_admins
--       (serialised per company by lock_company_admin_managers())
--   and every allowed role change writes one permission_audit_log row
--   (actor = the caller, the target, old and new role, the company);
--   a new dpa / shore_management profile needs users-access admin over all
--   vessels, a manager of admins and the rank check in its company.
-- No JWT (SQL editor, cron, the service-role client) or the engine flag:
-- allowed. The legacy guard (row 12) still applies on top.
CREATE OR REPLACE FUNCTION public.profiles_guard_access_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_rank integer;
  v_kind text;
  v_actor_role text;
BEGIN
  IF v_uid IS NULL OR current_setting('storm.access_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_new_rank := CASE NEW.role::text
    WHEN 'dpa' THEN 90
    WHEN 'shore_management' THEN 80
    WHEN 'master' THEN 60
    WHEN 'chief_officer' THEN 50
    WHEN 'chief_engineer' THEN 50
    WHEN 'crew' THEN 10
    ELSE 0
  END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.invitation_token IS NOT NULL OR NEW.invitation_token_expires IS NOT NULL OR NEW.last_login_at IS NOT NULL
       OR coalesce(NEW.invitation_count, 0) <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'Invitation and sign-in bookkeeping is written by the access engine only.';
    END IF;
    IF NEW.role::text IN ('dpa', 'shore_management') THEN
      IF NOT public.has_capability_for(v_uid, 'admin.access.users_access.admin', NEW.company_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
          DETAIL = 'Only a users-access administrator of the company can create an administrator profile.';
      END IF;
      IF NOT public.admin_scope_all(v_uid, NEW.company_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
          DETAIL = 'Only an administrator of every vessel can create a fleet-wide administrator profile.';
      END IF;
      IF NOT public.user_manages_admins_for(v_uid, NEW.company_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'manages_admins_required',
          DETAIL = 'Only an administrator who manages administrators can create an administrator profile.';
      END IF;
      IF v_new_rank > public.user_role_rank(v_uid) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'rank_exceeded',
          DETAIL = 'You cannot create a profile with a role ranked above your own.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
      DETAIL = 'The company and the login of a profile are not changed from a signed-in session.';
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
      DETAIL = 'use admin-actions / set_membership_status';
  END IF;

  IF NEW.invitation_token IS DISTINCT FROM OLD.invitation_token
     OR NEW.invitation_token_expires IS DISTINCT FROM OLD.invitation_token_expires
     OR NEW.invitation_count IS DISTINCT FROM OLD.invitation_count
     OR NEW.last_invited_at IS DISTINCT FROM OLD.last_invited_at
     OR NEW.invited_at IS DISTINCT FROM OLD.invited_at
     OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
      DETAIL = 'Invitation and sign-in bookkeeping is written by the access engine only.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.user_id IS NOT DISTINCT FROM v_uid THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'You cannot change your own role.';
    END IF;
    -- W7 checks run one at a time per company (last-manager race).
    PERFORM public.lock_company_admin_managers(OLD.company_id);
    IF NOT public.has_capability_for(v_uid, 'admin.access.users_access.admin', OLD.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'Only a users-access administrator of the company can change a role.';
    END IF;
    IF NOT public.admin_may_act_on_user(v_uid, OLD.user_id, OLD.company_id, OLD.id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'You can only change the role of people on the vessels you administer.';
    END IF;
    IF NEW.role::text IN ('dpa', 'shore_management') AND NOT public.admin_scope_all(v_uid, OLD.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'Only an administrator of every vessel can give a fleet-wide administrator role.';
    END IF;
    IF OLD.user_id IS NOT NULL THEN
      SELECT m.kind INTO v_kind FROM public.account_memberships AS m WHERE m.user_id = OLD.user_id AND m.company_id = OLD.company_id;
    END IF;
    IF (OLD.role::text IN ('dpa', 'shore_management') OR NEW.role::text IN ('dpa', 'shore_management') OR coalesce(v_kind IN ('admin', 'owner'), false))
       AND NOT public.user_manages_admins_for(v_uid, OLD.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'manages_admins_required',
        DETAIL = 'Only an administrator who manages administrators can change an administrator''s role.';
    END IF;
    IF v_new_rank > public.user_role_rank(v_uid) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'rank_exceeded',
        DETAIL = 'You cannot give a role ranked above your own.';
    END IF;
    -- Never dpa away from the last active member who manages admins (the
    -- same rule as set_membership_status).
    IF OLD.role::text = 'dpa' AND NEW.role::text <> 'dpa' AND OLD.user_id IS NOT NULL
       AND public.user_manages_admins_for(OLD.user_id, OLD.company_id) AND NOT EXISTS (
         SELECT 1
         FROM public.profiles AS o
         WHERE o.company_id = OLD.company_id
           AND o.user_id IS NOT NULL
           AND o.user_id <> OLD.user_id
           AND public.user_is_active(o.user_id)
           AND public.user_manages_admins_for(o.user_id, OLD.company_id)
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'last_manager_of_admins',
        DETAIL = 'The company needs at least one active administrator who manages administrators.';
    END IF;

    -- The audit row. permission_audit_log.company_id arrives with
    -- 20261123010100_platform_access_rls.sql (the next file), hence the
    -- column check.
    SELECT p.role::text INTO v_actor_role FROM public.profiles AS p WHERE p.user_id = v_uid;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.permission_audit_log'::regclass AND attname = 'company_id' AND NOT attisdropped) THEN
      EXECUTE 'INSERT INTO public.permission_audit_log (actor_user_id, actor_role, action_type, target_user_id, before_state, after_state, is_high_impact, company_id)
               VALUES ($1, $2, ''role_assigned'', $3, $4, $5, true, $6)'
        USING v_uid, coalesce(v_actor_role, 'unknown'), OLD.user_id,
              jsonb_build_object('profile_id', OLD.id, 'profile_role', OLD.role::text),
              jsonb_build_object('profile_id', OLD.id, 'profile_role', NEW.role::text, 'via', 'profiles'),
              OLD.company_id;
    ELSE
      INSERT INTO public.permission_audit_log (actor_user_id, actor_role, action_type, target_user_id, before_state, after_state, is_high_impact)
      VALUES (v_uid, coalesce(v_actor_role, 'unknown'), 'role_assigned', OLD.user_id,
              jsonb_build_object('profile_id', OLD.id, 'profile_role', OLD.role::text),
              jsonb_build_object('profile_id', OLD.id, 'profile_role', NEW.role::text, 'via', 'profiles'),
              true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_access_columns ON public.profiles;
CREATE TRIGGER trg_profiles_guard_access_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_access_columns();

-- ---------------------------------------------------------------- set_membership_status (gap/01 W7, CC-10)

-- Who "manages admins" in a company: a non-legacy active membership that is
-- the owner or has manages_admins, the legacy profile role dpa, or an
-- active, unexpired user_roles dpa / superadmin row of that company (or of
-- no company). Internal to set_membership_status.
CREATE OR REPLACE FUNCTION public.user_manages_admins_for(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _company_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = _company_id)
     AND (
       EXISTS (
         SELECT 1 FROM public.account_memberships AS m
         WHERE m.user_id = _user_id AND m.company_id = _company_id
           AND NOT m.legacy_managed AND m.status = 'active'
           AND (m.valid_from IS NULL OR m.valid_from <= now())
           AND (m.valid_until IS NULL OR m.valid_until > now())
           AND (m.kind = 'owner' OR m.manages_admins))
       OR EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.role::text = 'dpa')
       OR EXISTS (
         SELECT 1 FROM public.user_roles AS ur
         WHERE ur.user_id = _user_id
           AND ur.is_active = true
           AND ur.role::text IN ('dpa', 'superadmin')
           AND (ur.expires_at IS NULL OR ur.expires_at > now())
           AND (ur.company_id IS NULL OR ur.company_id = _company_id))
     )
$$;

-- Whether the user is, or is about to be, an administrator of the company
-- (the W7 "an administrator is involved" test for overrides, RBAC roles and
-- invitations), whatever their active state, so a disabled administrator
-- still counts: a dpa / shore_management profile there; an admin / owner
-- membership there; a user_roles dpa / superadmin row naming it or no
-- company; an rbac_user_roles superadmin / dpa row; a granted settings:admin
-- override (rows counted whatever their own active / expiry state: being
-- an administrator target only ever asks for more). NULL -> false.
-- Internal (service role; definers).
CREATE OR REPLACE FUNCTION public.user_is_admin_target(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _company_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles AS p
            WHERE p.user_id = _user_id AND p.company_id = _company_id AND p.role::text IN ('dpa', 'shore_management'))
    OR EXISTS (SELECT 1 FROM public.account_memberships AS m
               WHERE m.user_id = _user_id AND m.company_id = _company_id AND m.kind IN ('admin', 'owner'))
    OR EXISTS (SELECT 1 FROM public.user_roles AS ur
               WHERE ur.user_id = _user_id AND ur.role::text IN ('dpa', 'superadmin')
                 AND (ur.company_id IS NULL OR ur.company_id = _company_id))
    OR EXISTS (SELECT 1 FROM public.rbac_user_roles AS r JOIN public.roles AS ro ON ro.id = r.role_id
               WHERE r.user_id = _user_id AND ro.name IN ('superadmin', 'dpa'))
    OR EXISTS (SELECT 1 FROM public.user_permission_overrides AS o
               WHERE o.user_id = _user_id AND o.module_key = 'settings' AND o.permission = 'admin'::public.permission_level AND o.is_granted)
  )
$$;

-- Serialises the W7 "never the last manager of admins" checks of one
-- company: set_membership_status, a profile role change
-- (profiles_guard_access_columns) and hr_anonymize_profile take this
-- transaction-level advisory lock before their actor and last-manager
-- checks, so two concurrent disables of the company's last two managers
-- run one after the other and the second sees the first. It relies on
-- READ COMMITTED (PostgREST's default): every later statement of the
-- caller reads a snapshot taken after the lock. user_roles and the
-- membership's manages_admins / kind have no browser write path (file 8,
-- file 3), so those are the only paths. NULL company: no lock.
CREATE OR REPLACE FUNCTION public.lock_company_admin_managers(_company uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _company IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('admin_managers:' || _company::text, 0));
  END IF;
END;
$$;

-- Turns a user's access off or on (the edge function admin-actions calls it
-- with the service client after assertCapability, then applies the auth
-- ban). Refusals (stable codes in MESSAGE): 22023 status_invalid,
-- actor_required, user_required, reason_required; 42501 self_change_refused,
-- not_permitted (no users-access admin in the target's company, an
-- unknown target, or a target on a vessel outside a vessel-scoped actor's
-- reach, gap/01 F23), owner_membership_locked, membership_removed,
-- invitation_withdrawn, manages_admins_required, last_manager_of_admins;
-- P0002 membership_not_found. The W7 checks run under
-- lock_company_admin_managers() of the target's company. Enabling a
-- removed membership makes it active again, except for an invitee whose
-- invitation was withdrawn (a revoked or expired invitation removed it,
-- 20261123010200; the profile is invited / not_invited or
-- invitation_withdrawn_for() holds): that invitee is re-invited, not
-- enabled (invitation_withdrawn). Disabling a removed membership is
-- refused (membership_removed). Under storm.access_engine it sets the
-- membership status and disabled_at / by / reason (cleared on enable),
-- mirrors the legacy profiles.account_status ('disabled'; 'active' again
-- only from disabled / deactivated, so an invited user stays invited) and
-- writes one admin_action_log row (TOGGLE_ACCESS, no email). Returns the
-- membership.
CREATE OR REPLACE FUNCTION public.set_membership_status(p_user_id uuid, p_status text, p_actor uuid, p_reason text DEFAULT NULL)
RETURNS public.account_memberships
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_membership public.account_memberships;
  v_result public.account_memberships;
  v_disable boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_target_admin boolean;
  v_new_profile_status text;
  v_new_membership_status text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('active', 'disabled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'status_invalid';
  END IF;
  IF p_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'actor_required';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'user_required';
  END IF;
  v_disable := p_status = 'disabled';
  IF p_actor = p_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'self_change_refused';
  END IF;
  IF v_disable AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND OR v_profile.company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  -- One W7 change per company at a time (the last-manager race): the actor
  -- checks below then see a concurrent disable of the actor, and the
  -- last-manager check reads a snapshot taken after the lock.
  PERFORM public.lock_company_admin_managers(v_profile.company_id);
  -- The actor must be a users-access admin of the target's company (this is
  -- also the same-company rule); an unknown target answers the same.
  IF NOT public.has_capability_for(p_actor, 'admin.access.users_access.admin', v_profile.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  -- A vessel-scoped admin acts only on users of the vessels they reach.
  IF NOT public.admin_may_act_on_user(p_actor, p_user_id, v_profile.company_id, v_profile.id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;

  SELECT * INTO v_membership FROM public.account_memberships
  WHERE user_id = p_user_id AND company_id = v_profile.company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'membership_not_found';
  END IF;
  IF v_membership.kind = 'owner' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'owner_membership_locked';
  END IF;
  -- An invitee whose invitation was withdrawn is re-invited, not enabled.
  IF NOT v_disable AND v_membership.status = 'removed'
     AND (lower(coalesce(v_profile.account_status, 'active')) IN ('invited', 'not_invited')
          OR public.invitation_withdrawn_for(p_user_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'invitation_withdrawn';
  END IF;
  IF v_membership.status = 'removed' AND v_disable THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'membership_removed';
  END IF;

  v_target_admin := v_membership.kind = 'admin' OR v_profile.role::text IN ('dpa', 'shore_management');
  IF v_target_admin AND NOT public.user_manages_admins_for(p_actor, v_profile.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'manages_admins_required';
  END IF;

  -- Never the last active member who manages admins.
  IF v_disable AND public.user_manages_admins_for(p_user_id, v_profile.company_id) AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS o
    WHERE o.company_id = v_profile.company_id
      AND o.user_id IS NOT NULL
      AND o.user_id <> p_user_id
      AND public.user_is_active(o.user_id)
      AND public.user_manages_admins_for(o.user_id, v_profile.company_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'last_manager_of_admins';
  END IF;

  v_new_profile_status := CASE
    WHEN v_disable THEN 'disabled'
    WHEN lower(coalesce(v_profile.account_status, 'active')) IN ('disabled', 'deactivated') THEN 'active'
    ELSE v_profile.account_status
  END;
  v_new_membership_status := CASE
    WHEN v_disable THEN 'disabled'
    WHEN v_membership.status IN ('disabled', 'removed') THEN 'active'
    ELSE v_membership.status
  END;

  PERFORM set_config('storm.access_engine', 'on', true);

  -- The legacy column first: its sync trigger keeps a legacy-managed
  -- membership in step; the membership row is then stamped either way.
  IF v_new_profile_status IS DISTINCT FROM v_profile.account_status THEN
    UPDATE public.profiles SET account_status = v_new_profile_status WHERE id = v_profile.id;
  END IF;

  UPDATE public.account_memberships
  SET status = v_new_membership_status,
      disabled_at = CASE WHEN v_disable THEN coalesce(disabled_at, now()) END,
      disabled_by = CASE WHEN v_disable THEN p_actor END,
      disabled_reason = CASE WHEN v_disable THEN v_reason END,
      removed_at = CASE WHEN v_new_membership_status = 'removed' THEN removed_at END
  WHERE id = v_membership.id
  RETURNING * INTO v_result;

  INSERT INTO public.admin_action_log (actor_user_id, action_type, target_user_id, target_crew_id, before_json, after_json, reason)
  VALUES (
    p_actor, 'TOGGLE_ACCESS', p_user_id, v_profile.id,
    jsonb_build_object('account_status', v_profile.account_status, 'membership_status', v_membership.status),
    jsonb_build_object('account_status', v_new_profile_status, 'membership_status', v_result.status, 'via', 'set_membership_status'),
    v_reason
  );

  PERFORM set_config('storm.access_engine', '', true);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------- hr_anonymize_profile (live, redefined once here, D-120)

-- The live body of 20260917190000_hris_review_fixes.sql (the definition the
-- replay ends with), verbatim except the first refusal now carries SQLSTATE
-- 42501, plus: once the profile is loaded and before any write, the caller
-- must be a users-access admin of the profile's company
-- (has_capability('admin.access.users_access.admin'), so a user_roles row
-- naming another company never opens it, CC-5 / D-181) who may act on that
-- person (admin_may_act_on_user, gap/01 F23), both 42501 not_permitted;
-- then, under lock_company_admin_managers(), the W7 guards of
-- set_membership_status (reason from p_reason, never yourself, never the
-- owner, a manager of admins for an administrator target, never the last
-- manager of admins); the account_status write runs under
-- storm.access_engine (the access guard refuses it from a session
-- otherwise) and is logged in admin_action_log as TOGGLE_ACCESS with the
-- reason.
CREATE OR REPLACE FUNCTION public.hr_anonymize_profile(p_profile_id uuid, p_reason text DEFAULT 'GDPR erasure')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
  v_tag text;
  v_reason text;
  v_kind text;
  v_engine text;
BEGIN
  IF NOT public.hr_can_admin(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only HR admins can anonymise records';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF p.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Profile not found'; END IF;
  -- Own-company users-access admin who may act on this person (CC-5,
  -- D-181; gap/01 F23), before any write.
  IF NOT public.has_capability('admin.access.users_access.admin', p.company_id)
     OR NOT public.admin_may_act_on_user(auth.uid(), p.user_id, p.company_id, p.id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.crew_assignments ca WHERE ca.user_id = p.user_id AND ca.is_current) THEN
    RAISE EXCEPTION 'Crew member still has a current assignment';
  END IF;
  -- Imported crew have no login and therefore no crew_assignments row; an
  -- active contract is the equivalent signal that they are still on board.
  IF EXISTS (
    SELECT 1 FROM public.crew_contracts c
    WHERE c.profile_id = p_profile_id AND c.status = 'active'
      AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Crew member still has an active contract';
  END IF;

  v_tag := 'ANON-' || LEFT(REPLACE(p_profile_id::text, '-', ''), 8);

  -- W7 guards (set_membership_status): a reason, never yourself, never the
  -- owner, a manager of admins for an administrator, never the last
  -- manager of admins (20261123010000), one per company at a time.
  PERFORM public.lock_company_admin_managers(p.company_id);
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long';
  END IF;
  IF p.user_id IS NOT NULL AND p.user_id = auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'self_change_refused';
  END IF;
  IF p.user_id IS NOT NULL THEN
    SELECT m.kind INTO v_kind FROM public.account_memberships AS m WHERE m.user_id = p.user_id AND m.company_id = p.company_id;
  END IF;
  IF v_kind = 'owner' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'owner_membership_locked';
  END IF;
  IF (coalesce(v_kind = 'admin', false) OR p.role::text IN ('dpa', 'shore_management'))
     AND NOT public.user_manages_admins_for(auth.uid(), p.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'manages_admins_required';
  END IF;
  IF p.user_id IS NOT NULL AND public.user_manages_admins_for(p.user_id, p.company_id) AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS o
    WHERE o.company_id = p.company_id
      AND o.user_id IS NOT NULL
      AND o.user_id <> p.user_id
      AND public.user_is_active(o.user_id)
      AND public.user_manages_admins_for(o.user_id, p.company_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'last_manager_of_admins';
  END IF;

  -- The account_status write is an access change: under the engine flag
  -- (profiles_guard_access_columns refuses it otherwise) and logged as
  -- TOGGLE_ACCESS with the reason.
  v_engine := current_setting('storm.access_engine', true);
  PERFORM set_config('storm.access_engine', 'on', true);
  UPDATE public.profiles SET
    first_name = 'Former', last_name = 'Crew ' || v_tag, preferred_name = NULL,
    email = v_tag || '@anonymised.local', phone = NULL, date_of_birth = NULL, gender = NULL,
    nationality = NULL, passport_number = NULL, passport_expiry = NULL, visa_status = NULL, visa_expiry = NULL,
    medical_expiry = NULL, emergency_contact_name = NULL, emergency_contact_phone = NULL, notes = NULL,
    avatar_url = NULL, cabin = NULL, status = 'inactive', account_status = 'disabled', updated_at = now()
  WHERE id = p_profile_id;
  PERFORM set_config('storm.access_engine', coalesce(v_engine, ''), true);
  INSERT INTO public.admin_action_log (actor_user_id, action_type, target_user_id, target_crew_id, before_json, after_json, reason)
  VALUES (
    auth.uid(), 'TOGGLE_ACCESS', p.user_id, p.id,
    jsonb_build_object('account_status', p.account_status),
    jsonb_build_object('account_status', 'disabled', 'via', 'hr_anonymize_profile'),
    v_reason
  );

  DELETE FROM public.crew_next_of_kin WHERE profile_id = p_profile_id;
  DELETE FROM public.crew_bank_details WHERE profile_id = p_profile_id;
  DELETE FROM public.crew_work_authorisations WHERE profile_id = p_profile_id;
  UPDATE public.crew_contracts SET notes = NULL, document_path = NULL, document_name = NULL, updated_at = now() WHERE profile_id = p_profile_id;
  UPDATE public.performance_reviews SET strengths = NULL, development_areas = NULL, training_needs = NULL, career_aspirations = NULL,
    summary = NULL, reviewer_comments = NULL, employee_comments = NULL, ratings = '[]'::jsonb, self_ratings = '[]'::jsonb,
    document_path = NULL, updated_at = now() WHERE profile_id = p_profile_id;
  DELETE FROM public.performance_review_welfare_notes
    WHERE review_id IN (SELECT id FROM public.performance_reviews WHERE profile_id = p_profile_id);
  UPDATE public.crew_objectives SET description = NULL, notes = NULL, updated_at = now() WHERE profile_id = p_profile_id;
  UPDATE public.disciplinary_records SET description = '[anonymised]', investigation_notes = NULL, witness_statements = NULL,
    outcome = NULL, appeal_notes = NULL, document_path = NULL, document_name = NULL, updated_at = now() WHERE profile_id = p_profile_id;
  IF p.user_id IS NOT NULL THEN
    DELETE FROM public.crew_attachments WHERE user_id = p.user_id;
    UPDATE public.crew_certificates SET file_url = NULL, file_name = NULL, notes = NULL, certificate_number = NULL WHERE user_id = p.user_id;
  END IF;

  UPDATE public.hr_record_metadata
  SET lifecycle_status = 'anonymized', anonymized_at = now(), anonymized_by = auth.uid(), updated_at = now()
  WHERE profile_id = p_profile_id OR (p.user_id IS NOT NULL AND user_id = p.user_id);

  -- gdpr_requests is keyed on a login (subject_user_id → profiles.user_id);
  -- imported crew have none, so their erasure is recorded in audit_logs only.
  IF p.user_id IS NOT NULL THEN
    INSERT INTO public.gdpr_requests (company_id, subject_user_id, request_type, status, requested_by, requested_at, processed_by, processed_at, deadline_date, response_notes)
    VALUES (p.company_id, p.user_id, 'erasure', 'completed', auth.uid(), now(), auth.uid(), now(), CURRENT_DATE, p_reason);
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_user_id, new_values)
  VALUES ('crew_profile', p_profile_id, 'ANONYMIZE', auth.uid(),
          jsonb_build_object('reason', p_reason, 'had_login', p.user_id IS NOT NULL));
END;
$$;

-- The auth user id for an email address (exact, case-insensitive), or NULL;
-- replaces the 200-row listUsers scan of the invite path (gap/01 F46).
CREATE OR REPLACE FUNCTION public.auth_user_id_for_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM auth.users AS u
  WHERE nullif(btrim(coalesce(p_email, '')), '') IS NOT NULL
    AND lower(u.email) = lower(btrim(p_email))
  ORDER BY u.created_at NULLS LAST, u.id
  LIMIT 1
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.user_belongs_to_company(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_company_id(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_profile_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_user_company_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legacy_profile_role(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.profiles_guard_access_columns() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_manages_admins_for(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_membership_status(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.auth_user_id_for_email(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_anonymize_profile(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_is_admin_target(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lock_company_admin_managers(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.user_belongs_to_company(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_company_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_profile_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legacy_profile_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_manages_admins_for(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_membership_status(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_id_for_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_anonymize_profile(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_admin_target(uuid, uuid) TO service_role;
-- lock_company_admin_managers: no grant (only this file's definers call it).

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.user_belongs_to_company(uuid, uuid) IS 'The user has a profile in the company and is active (D-122: disabled / deactivated profile, disabled / removed membership or auth ban -> false). Live helper redefined by 20261123010000_platform_user_status.';
COMMENT ON FUNCTION public.get_user_company_id(uuid) IS 'The profile''s company for an active user, else NULL (D-122).';
COMMENT ON FUNCTION public.my_profile_id() IS 'The caller''s profile id while active, else NULL (D-122).';
COMMENT ON FUNCTION public.current_user_company_id() IS 'The company of the caller''s active user_roles row that names their own profile company (CC-5, D-181), only while the caller is active (D-122).';
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS 'has_any_role(_user_id, ARRAY[_role]): an active, unexpired user_roles row with that role that counts in the holder''s own company (CC-5, D-181), for an active user only (D-122).';
COMMENT ON FUNCTION public.has_any_role(uuid, public.app_role[]) IS 'An active, unexpired user_roles row with one of the roles, for an active user only (D-122), that names the holder''s profile company or no company (CC-5, D-181): a company-less superadmin row counts anywhere, another company-less row for the holder''s own company only, a row naming another company never. No caller probe guard (definers pass arbitrary ids).';
COMMENT ON FUNCTION public.legacy_profile_role(uuid) IS 'The legacy profiles.role for an active user, else NULL, so the HR / legal / health helpers built on it deny a disabled user (D-122).';
COMMENT ON FUNCTION public.profiles_guard_access_columns() IS 'Trigger (CC-6, W7; D-174): from a signed-in session without storm.access_engine, company_id / user_id / account_status never change (42501 profile_access_columns_locked: use admin-actions / set_membership_status), nor the invitation and sign-in bookkeeping (invitation_token, invitation_token_expires, invitation_count, last_invited_at, invited_at, last_login_at; your own row included) and a new profile starts with none of it; role never on your own row and otherwise needs users-access admin and an actor who may act on the target (vessel reach; an all-vessels admin for a dpa / shore_management role) (profile_access_columns_locked), a manager of admins when an administrator is involved (manages_admins_required), at most the caller''s rank (rank_exceeded), never dpa away from the last manager of admins (last_manager_of_admins, under lock_company_admin_managers), and is audited in permission_audit_log; a new dpa / shore_management profile needs an all-vessels users-access admin, a manager of admins and the rank check.';
COMMENT ON FUNCTION public.user_manages_admins_for(uuid, uuid) IS 'Whether the user manages admins in the company (non-legacy owner / manages_admins membership, legacy dpa, or a user_roles dpa / superadmin row of the company). Internal to set_membership_status (service role).';
COMMENT ON FUNCTION public.set_membership_status(uuid, text, uuid, text) IS 'gap/01 W7, F23: turns a user''s access off / on for an actor who is a users-access admin of their company and may act on the user (vessel reach, admin_may_act_on_user); no self, never the owner, manages-admins to change an admin, never the last manager of admins (serialised by lock_company_admin_managers), reason to disable; enabling restores a removed membership, except a withdrawn invitee, who is re-invited, not enabled (42501 invitation_withdrawn). Mirrors profiles.account_status and logs TOGGLE_ACCESS. Service role only (admin-actions).';
COMMENT ON FUNCTION public.hr_anonymize_profile(uuid, text) IS 'HRIS GDPR erasure (live body of 20260917190000) for an own-company users-access admin who may act on the person (42501 not_permitted; a user_roles row naming another company never opens it, CC-5 / D-181), with the W7 guards of set_membership_status under lock_company_admin_managers before the account is disabled (reason, no self, no owner, manages-admins for an administrator, never the last manager of admins); the disable runs under storm.access_engine and is logged as TOGGLE_ACCESS.';
COMMENT ON FUNCTION public.user_is_admin_target(uuid, uuid) IS 'W7: whether the user is an administrator of the company whatever their active state (dpa / shore_management profile, admin / owner membership, user_roles dpa / superadmin of the company or none, RBAC superadmin / dpa, a granted settings:admin override). Internal (service role; definers).';
COMMENT ON FUNCTION public.lock_company_admin_managers(uuid) IS 'W7 last-manager race: pg_advisory_xact_lock on admin_managers:<company>, taken by set_membership_status, the profile role-change guard and hr_anonymize_profile before their actor and last-manager checks. Relies on READ COMMITTED (PostgREST''s default); user_roles and the membership manages_admins / kind have no browser write path. No grant: definers only.';
COMMENT ON FUNCTION public.auth_user_id_for_email(text) IS 'The auth user id for an email address (case-insensitive), or NULL. Service role only (the invite path).';
