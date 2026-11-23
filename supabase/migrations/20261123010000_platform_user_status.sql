-- =================================================================
-- PLATFORM P3: disabled users get nothing (gap/01 F47, W7; Phase 2 spec
-- §A.7, CC-6, CC-7, CC-10; proposed D-122, D-138)
-- Tables: none new. Policies (redefined on public.profiles):
--   "Users can view their own profile", "Users can update their own profile"
-- Helpers (live, redefined with the same signatures): user_belongs_to_company(),
--   get_user_company_id(), my_profile_id(), current_user_company_id(),
--   has_role(), has_any_role(), legacy_profile_role()
-- New: profiles_guard_access_columns() + trg_profiles_guard_access_columns,
--   set_membership_status(), auth_user_id_for_email() (service role)
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
-- Privileged profile columns (CC-6): role, account_status, company_id and
-- user_id are never changed from a signed-in session on your own row, and
-- role / account_status on someone else's row need users-access admin in
-- their company. This phase's definers set storm.access_engine (rule 13);
-- the service role (no JWT) is not limited here.
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
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs has_capability_for(uuid,text,uuid,uuid): apply 20261123000400_platform_capabilities.sql first';
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

-- 20260501203014_9658bc16-…: the user_roles-based company, only while active.
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND is_active = true
    AND public.user_is_active(auth.uid())
  LIMIT 1
$$;

-- 20260127170354_8cbfc11b-…: the user_roles check, plus the active check.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  ) AND public.user_is_active(_user_id)
$$;

-- 20260127170354_8cbfc11b-…: the user_roles check, plus the active check.
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = ANY(_roles)
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  ) AND public.user_is_active(_user_id)
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
-- off: company_id / user_id never change; role / account_status never change
-- on your own row and need users-access admin in the row's company
-- otherwise; a new dpa / shore_management profile needs the same in its
-- company. No JWT (SQL editor, cron, the service-role client) or the engine
-- flag: allowed. The legacy guard (row 12) still applies on top.
CREATE OR REPLACE FUNCTION public.profiles_guard_access_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR current_setting('storm.access_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role::text IN ('dpa', 'shore_management')
       AND NOT public.has_capability_for(v_uid, 'admin.access.users_access.admin', NEW.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'Only a users-access administrator of the company can create an administrator profile.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
      DETAIL = 'The company and the login of a profile are not changed from a signed-in session.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    IF OLD.user_id IS NOT DISTINCT FROM v_uid THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'You cannot change your own role or account status.';
    END IF;
    IF NOT public.has_capability_for(v_uid, 'admin.access.users_access.admin', OLD.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'Only a users-access administrator of the company can change a role or an account status.';
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

-- Turns a user's access off or on (the edge function admin-actions calls it
-- with the service client after assertCapability, then applies the auth
-- ban). Refusals (stable codes in MESSAGE): 22023 status_invalid,
-- actor_required, user_required, reason_required; 42501 self_change_refused,
-- not_permitted (no users-access admin in the target's company, or an
-- unknown target), owner_membership_locked, membership_removed,
-- manages_admins_required, last_manager_of_admins; P0002
-- membership_not_found. Under storm.access_engine it sets the membership
-- status and disabled_at / by / reason (cleared on enable), mirrors the
-- legacy profiles.account_status ('disabled'; 'active' again only from
-- disabled / deactivated, so an invited user stays invited) and writes one
-- admin_action_log row (TOGGLE_ACCESS, no email). Returns the membership.
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
  -- The actor must be a users-access admin of the target's company (this is
  -- also the same-company rule); an unknown target answers the same.
  IF NOT public.has_capability_for(p_actor, 'admin.access.users_access.admin', v_profile.company_id) THEN
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
  IF v_membership.status = 'removed' THEN
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
    WHEN v_membership.status = 'disabled' THEN 'active'
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
      disabled_reason = CASE WHEN v_disable THEN v_reason END
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

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.user_belongs_to_company(uuid, uuid) IS 'The user has a profile in the company and is active (D-122: disabled / deactivated profile, disabled / removed membership or auth ban -> false). Live helper redefined by 20261123010000_platform_user_status.';
COMMENT ON FUNCTION public.get_user_company_id(uuid) IS 'The profile''s company for an active user, else NULL (D-122).';
COMMENT ON FUNCTION public.my_profile_id() IS 'The caller''s profile id while active, else NULL (D-122).';
COMMENT ON FUNCTION public.current_user_company_id() IS 'The company of the caller''s active user_roles row, only while the caller is active (D-122).';
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS 'An active, unexpired user_roles row with that role, for an active user only (D-122).';
COMMENT ON FUNCTION public.has_any_role(uuid, public.app_role[]) IS 'An active, unexpired user_roles row with one of the roles, for an active user only (D-122).';
COMMENT ON FUNCTION public.legacy_profile_role(uuid) IS 'The legacy profiles.role for an active user, else NULL, so the HR / legal / health helpers built on it deny a disabled user (D-122).';
COMMENT ON FUNCTION public.profiles_guard_access_columns() IS 'Trigger (CC-6): from a signed-in session without storm.access_engine, company_id / user_id never change, role / account_status never change on your own row and need users-access admin otherwise, and a new dpa / shore_management profile needs users-access admin (42501 profile_access_columns_locked).';
COMMENT ON FUNCTION public.user_manages_admins_for(uuid, uuid) IS 'Whether the user manages admins in the company (non-legacy owner / manages_admins membership, legacy dpa, or a user_roles dpa / superadmin row of the company). Internal to set_membership_status (service role).';
COMMENT ON FUNCTION public.set_membership_status(uuid, text, uuid, text) IS 'gap/01 W7: turns a user''s access off / on for an actor who is a users-access admin of their company; no self, never the owner, manages-admins to change an admin, never the last manager of admins, reason to disable. Mirrors profiles.account_status and logs TOGGLE_ACCESS. Service role only (admin-actions).';
COMMENT ON FUNCTION public.auth_user_id_for_email(text) IS 'The auth user id for an email address (case-insensitive), or NULL. Service role only (the invite path).';
