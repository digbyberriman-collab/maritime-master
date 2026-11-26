-- =================================================================
-- PLATFORM P3: disabled users get nothing (gap/01 F47, W7; Phase 2 spec
-- §A.7, CC-6, CC-7, CC-10; proposed D-122, D-138)
-- Tables: none new. Policies (redefined on public.profiles):
--   "Users can view their own profile", "Users can update their own profile",
--   "Users can view profiles in their company" (review round 5: initplans)
-- Helpers (live, redefined with the same signatures): user_belongs_to_company(),
--   get_user_company_id(), my_profile_id(), current_user_company_id(),
--   has_role(), has_any_role() (company-wide rows only, D-234),
--   legacy_profile_role()
-- Legacy capability helpers (live, redefined two-valued, D-233; review
--   round 6): hr_can_admin/edit/view(), payroll_can_admin/edit/view(),
--   legal_can_admin/edit/view(), medical_can_admin/edit/view(),
--   wellness_can_admin/edit/view(), med_fitness_can_view(),
--   hw_is_practitioner(), hr_can_write_crew_record(), frp_can_edit/view()
-- Legacy definers (live, redefined with a caller check, D-233):
--   performance_review_submit_self_assessment(),
--   performance_review_acknowledge(), disciplinary_record_acknowledge(),
--   pay_review_apply(), payroll_calculate_run(), gratuity_calculate_pool(),
--   legal_generate_alerts(), legal_attachment_path_allowed()
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
  -- D-233 (review round 6): the live legacy capability helpers and definers
  -- this file redefines, the helpers their bodies call and the tables the
  -- redefined definers read (HRIS rows 4-12, health row 15, legal row 18,
  -- the planner flags row 27).
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.hr_can_admin(uuid)', 'public.hr_can_edit(uuid)', 'public.hr_can_view(uuid)',
      'public.payroll_can_admin(uuid)', 'public.payroll_can_edit(uuid)', 'public.payroll_can_view(uuid)',
      'public.legal_can_admin(uuid)', 'public.legal_can_edit(uuid)', 'public.legal_can_view(uuid)',
      'public.medical_can_admin(uuid)', 'public.medical_can_edit(uuid)', 'public.medical_can_view(uuid)',
      'public.wellness_can_admin(uuid)', 'public.wellness_can_edit(uuid)', 'public.wellness_can_view(uuid)',
      'public.med_fitness_can_view(uuid)', 'public.hw_is_practitioner(uuid,text)', 'public.hr_can_write_crew_record(uuid)',
      'public.frp_can_edit(uuid)', 'public.frp_can_view(uuid)',
      'public.rbac_company_permission(uuid,text,public.permission_level)', 'public.user_has_module_access(uuid,text,public.permission_level)',
      'public.performance_review_submit_self_assessment(uuid,jsonb,text)', 'public.performance_review_acknowledge(uuid,text)',
      'public.disciplinary_record_acknowledge(uuid)', 'public.pay_review_apply(uuid)', 'public.payroll_calculate_run(uuid)',
      'public.gratuity_calculate_pool(uuid)', 'public.legal_generate_alerts(uuid)', 'public.legal_attachment_path_allowed(text)',
      'public.hr_company_settings_for(uuid)', 'public.hr_days_onboard(uuid,date,date,uuid,text[])',
      'public.fx_rate_for(uuid,character,character,date)', 'public.legal_request_type_label(text)'
    ]) AS f(sig)
    WHERE to_regprocedure(f.sig) IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.performance_reviews', 'public.disciplinary_records', 'public.pay_reviews', 'public.crew_compensation',
      'public.payroll_runs', 'public.payroll_lines', 'public.pay_periods', 'public.pay_grades', 'public.hr_company_settings',
      'public.gratuity_pools', 'public.gratuity_distributions', 'public.legal_requests', 'public.legal_form_submissions',
      'public.alerts', 'public.hw_practitioners', 'public.crew_assignments', 'public.user_permission_overrides'
    ]) AS t(rel)
    WHERE to_regclass(t.rel) IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs the live HRIS, health, legal and planner helpers, definers and tables it redefines (D-233): apply the HRIS, health and legal files (ledger rows 4-18) first';
  END IF;
  -- frp_can_edit / frp_can_view are redefined on row 27's body (Apply-queue
  -- order 5, check query E): refuse to run before it, so this file never
  -- carries the planner flags into a database that has not taken them.
  IF position('crew.edit_crew_profiles' IN pg_get_functiondef('public.frp_can_edit(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010000_platform_user_status needs the planner flags in frp_can_edit(): apply 20260927120000_wire_crew_flags_into_frp_access.sql first (ledger check query E)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- the seven live helpers (rule 6)

-- Each is LANGUAGE plpgsql with its SQL body unchanged inside
-- RETURN (...) (D-229; review round 5, rls-helper-per-row-slowdown):
-- about 680 policies call them per row, PostgreSQL 17 and earlier never
-- inline a SECURITY DEFINER SQL function and plan a nested SQL function
-- again on every call, while PL/pgSQL keeps its plans for the session.
-- profiles.user_id is unique, so every scalar subquery returns at most the
-- one row the SQL body returned.

-- 20260125160927_7551738f-…: the profile check, plus the active check.
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = _user_id AND company_id = _company_id
    ) AND public.user_is_active(_user_id)
  );
END;
$$;

-- 20260125160927_7551738f-…: the profile's company only for an active user.
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT company_id FROM public.profiles WHERE user_id = _user_id AND public.user_is_active(_user_id) LIMIT 1
  );
END;
$$;

-- 20260917175040_22d84f6b-…: the caller's profile id only while active.
CREATE OR REPLACE FUNCTION public.my_profile_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid() AND public.user_is_active(auth.uid()) LIMIT 1
  );
END;
$$;

-- 20260501203014_9658bc16-…: the user_roles-based company, only while
-- active, and only from a row that names the caller's own profile company
-- (CC-5, D-181: a row naming another company gives nothing anywhere; the
-- frp_* and storage policies compare it with the row's company).
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT ur.company_id
    FROM public.user_roles AS ur
    JOIN public.profiles AS p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND ur.company_id IS NOT NULL
      AND ur.company_id = p.company_id
      AND public.user_is_active(auth.uid())
    LIMIT 1
  );
END;
$$;

-- 20260127170354_8cbfc11b-…: the user_roles check (own company, CC-5 /
-- D-181), plus the active check: has_any_role with one role.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT public.has_any_role(_user_id, ARRAY[_role]::public.app_role[])
  );
END;
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
--
-- Company-wide rows only (D-234; review round 6,
-- vessel-scoped-user-role-company-wide): a row with a vessel_id confers its
-- role on that vessel only, and has_any_role() has no vessel to ask about,
-- so it counts a row only when ur.vessel_id IS NULL or the role is
-- company-wide by nature (superadmin, dpa, fleet_master, as
-- legacy_fleet_reach() treats RBAC). A vessel-scoped captain or purser
-- therefore no longer passes the legacy company-wide gates built on it
-- (hr_can_edit, wellness_can_edit, frp_can_edit, ...): fail closed (D-04).
-- The vessel-aware question is has_role_on_vessel_in_company()
-- (20261123010500).
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
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
           AND (ur.vessel_id IS NULL OR ur.role IN ('superadmin', 'dpa', 'fleet_master'))
       )
       AND public.user_is_active(_user_id)
  );
END;
$$;

-- 20260917174601_92aaeda7-…: the legacy profile role, NULL for an inactive
-- user, so the HR / legal / health helpers built on it deny too.
CREATE OR REPLACE FUNCTION public.legacy_profile_role(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT role::text FROM public.profiles WHERE user_id = _user_id AND public.user_is_active(_user_id) LIMIT 1
  );
END;
$$;

-- ---------------------------------------------------------------- legacy capability helpers are two-valued (D-233)

-- Review round 6 (inactive-helpers-null-fail-open). legacy_profile_role(),
-- my_profile_id() and get_user_company_id() above answer NULL for an
-- inactive user (D-122), and the live helpers below are OR-chains such as
-- has_any_role(u, ...) OR rbac_company_permission(u, ...) OR
-- legacy_profile_role(u) IN (...): false OR false OR NULL is NULL. A
-- policy treats NULL as deny, but a plpgsql definer that gates with
-- "IF NOT helper(auth.uid()) THEN RAISE" skips the RAISE on NULL, so a
-- disabled crew member ran pay_review_apply() on another company's pay
-- review. rbac_company_permission() and hw_is_practitioner() read no
-- status at all and answered TRUE for a disabled RBAC holder or
-- practitioner. Each helper is redefined with its live body unchanged
-- (the files named per helper; pg_get_functiondef on the harness replay)
-- inside RETURN coalesce((...), false), after an active check on the user
-- asked about (hr_can_write_crew_record decides on the caller, so it
-- checks auth.uid()): false for a NULL, unknown or inactive user, never
-- NULL. Same names, argument names and types; LANGUAGE plpgsql (D-229:
-- policies call them per row); STABLE SECURITY DEFINER with search_path
-- public, as live. user_is_active() answers about another user only to an
-- active caller of the same company (or no JWT), which every live call
-- site already is (they all pass auth.uid()).

-- 20260917190000_hris_review_fixes.sql
CREATE OR REPLACE FUNCTION public.hr_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.rbac_company_permission(_user_id, 'hr', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.hr_can_admin(_user_id)
    OR public.has_any_role(_user_id, ARRAY['fleet_master','captain','purser']::app_role[])
    OR public.rbac_company_permission(_user_id, 'hr', 'edit')
    OR public.legacy_profile_role(_user_id) = 'master'
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.hr_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['chief_officer','chief_engineer','hod']::app_role[])
    OR public.rbac_company_permission(_user_id, 'hr', 'view')
    OR public.legacy_profile_role(_user_id) IN ('chief_officer', 'chief_engineer')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.rbac_company_permission(_user_id, 'finance', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.payroll_can_admin(_user_id)
    OR public.has_any_role(_user_id, ARRAY['purser']::app_role[])
    OR public.rbac_company_permission(_user_id, 'finance', 'edit')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.payroll_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['fleet_master']::app_role[])
    OR public.rbac_company_permission(_user_id, 'finance', 'view')
  ), false);
END;
$$;

-- 20260919120000_legal_module.sql
CREATE OR REPLACE FUNCTION public.legal_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.rbac_company_permission(_user_id, 'legal', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.legal_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.legal_can_admin(_user_id)
    OR public.rbac_company_permission(_user_id, 'legal', 'edit')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.legal_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.legal_can_edit(_user_id)
    OR public.rbac_company_permission(_user_id, 'legal', 'view')
  ), false);
END;
$$;

-- 20260922094012_33f4cfaa-… (health phase 1)
CREATE OR REPLACE FUNCTION public.hw_is_practitioner(_user_id uuid, _discipline text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    SELECT EXISTS (
      SELECT 1
      FROM public.hw_practitioners pr
      JOIN public.profiles p ON p.id = pr.profile_id
      WHERE p.user_id = _user_id
        AND p.company_id = pr.company_id
        AND pr.is_active
        AND (_discipline IS NULL OR pr.discipline = _discipline)
        AND (pr.ended_on IS NULL OR pr.ended_on >= CURRENT_DATE)
    )
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.medical_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.rbac_company_permission(_user_id, 'medical', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.medical_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.medical_can_admin(_user_id)
    OR public.hw_is_practitioner(_user_id, 'medical')
    OR public.rbac_company_permission(_user_id, 'medical', 'edit')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.medical_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.medical_can_edit(_user_id)
    OR public.rbac_company_permission(_user_id, 'medical', 'view')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.wellness_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.rbac_company_permission(_user_id, 'wellness', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.wellness_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.wellness_can_admin(_user_id)
    OR public.medical_can_edit(_user_id)
    OR public.hw_is_practitioner(_user_id, NULL)
    OR public.has_any_role(_user_id, ARRAY['captain','purser']::app_role[])
    OR public.rbac_company_permission(_user_id, 'wellness', 'edit')
    OR public.legacy_profile_role(_user_id) = 'master'
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.wellness_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.wellness_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['fleet_master','chief_officer','chief_engineer','hod']::app_role[])
    OR public.rbac_company_permission(_user_id, 'wellness', 'view')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.med_fitness_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.medical_can_view(_user_id)
    OR public.hr_can_view(_user_id)
    OR public.has_any_role(_user_id, ARRAY['captain','fleet_master']::app_role[])
  ), false);
END;
$$;

-- 20260917174601_92aaeda7-… (HRIS phase 0): decides on the caller, so the
-- active check is on auth.uid() (an inactive caller no longer passes the
-- own-record branch either).
CREATE OR REPLACE FUNCTION public.hr_can_write_crew_record(_subject_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.user_is_active(auth.uid()), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    _subject_user_id = auth.uid()
    OR (
      public.hr_can_edit(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = _subject_user_id
          AND public.user_belongs_to_company(auth.uid(), p.company_id)
      )
    )
  ), false);
END;
$$;

-- 20260927120000_wire_crew_flags_into_frp_access.sql (ledger row 27; the
-- prerequisite block refuses to run before it): user_has_module_access()
-- reads no status, so a disabled RBAC holder of a crew.* flag answered TRUE.
CREATE OR REPLACE FUNCTION public.frp_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.has_any_role(_user_id, ARRAY['superadmin','dpa','fleet_master','captain','hod','purser']::app_role[])
    OR public.user_has_module_access(_user_id, 'crew.edit_crew_profiles', 'view')
    OR public.user_has_module_access(_user_id, 'crew.approve_leave', 'view')
  ), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.frp_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  RETURN coalesce((
    public.frp_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['chief_officer','chief_engineer','officer','crew']::app_role[])
    OR public.user_has_module_access(_user_id, 'crew.view_crew_profiles', 'view')
    OR public.user_has_module_access(_user_id, 'crew.see_crew_list', 'view')
    OR public.user_has_module_access(_user_id, 'crew.access_leave_records', 'view')
  ), false);
END;
$$;

-- ---------------------------------------------------------------- legacy definers check the caller (D-233)

-- The HRIS self-service definers compared r.profile_id <> my_profile_id():
-- NULL for an inactive caller (D-122) or a JWT without a profile, so the
-- RAISE was skipped and the caller wrote another company's review or
-- disciplinary record. Bodies of 20260917180528_f62cd68d-… (HRIS phase 3,
-- the Lovable copy of row 9), with an active-caller check first and
-- IS DISTINCT FROM; the same messages.
CREATE OR REPLACE FUNCTION public.performance_review_submit_self_assessment(p_review_id uuid, p_self_ratings jsonb, p_employee_comments text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.performance_reviews;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.user_is_active(auth.uid()), false) THEN RAISE EXCEPTION 'Review not found'; END IF;
  SELECT * INTO r FROM public.performance_reviews WHERE id = p_review_id;
  IF NOT FOUND OR r.profile_id IS DISTINCT FROM public.my_profile_id() THEN RAISE EXCEPTION 'Review not found'; END IF;
  IF r.status <> 'self_assessment' THEN RAISE EXCEPTION 'Review is not open for self-assessment'; END IF;
  UPDATE public.performance_reviews
  SET self_ratings = COALESCE(p_self_ratings, '[]'::jsonb),
      employee_comments = p_employee_comments,
      self_assessment_submitted_at = now(),
      status = 'in_review',
      updated_at = now()
  WHERE id = p_review_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.performance_review_acknowledge(p_review_id uuid, p_employee_comments text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.performance_reviews;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.user_is_active(auth.uid()), false) THEN RAISE EXCEPTION 'Review not found'; END IF;
  SELECT * INTO r FROM public.performance_reviews WHERE id = p_review_id;
  IF NOT FOUND OR r.profile_id IS DISTINCT FROM public.my_profile_id() THEN RAISE EXCEPTION 'Review not found'; END IF;
  IF r.status <> 'awaiting_acknowledgement' THEN RAISE EXCEPTION 'Review is not awaiting acknowledgement'; END IF;
  UPDATE public.performance_reviews
  SET employee_acknowledged_at = now(),
      employee_comments = COALESCE(p_employee_comments, employee_comments),
      status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_review_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.disciplinary_record_acknowledge(p_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.disciplinary_records;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.user_is_active(auth.uid()), false) THEN RAISE EXCEPTION 'Record not found'; END IF;
  SELECT * INTO r FROM public.disciplinary_records WHERE id = p_record_id;
  IF NOT FOUND OR r.profile_id IS DISTINCT FROM public.my_profile_id() THEN RAISE EXCEPTION 'Record not found'; END IF;
  UPDATE public.disciplinary_records SET acknowledged_by_crew_at = COALESCE(acknowledged_by_crew_at, now()), updated_at = now()
  WHERE id = p_record_id;
END;
$$;

-- The payroll definers trusted the role gate alone and never asked whose
-- row it was: an active payroll admin of company A applied company B's pay
-- review, ran B's payroll or split B's gratuity pool by id. Full live
-- bodies of 20260917180124_23c49cdb-… (HRIS phase 2, the Lovable copy of
-- row 8; pg_get_functiondef on the harness replay) with an active-caller
-- check first and, after the role gate and the row load, the row's company
-- against the caller's (get_user_company_id(): NULL for an inactive caller,
-- so IS DISTINCT FROM refuses), raising the existing not-found message.
-- recruitment_hire_candidate() and onboarding_start() are already
-- company-scoped by 20260917190000 (row 12) and are not redefined here.
CREATE OR REPLACE FUNCTION public.pay_review_apply(p_review_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.pay_reviews;
  prev public.crew_compensation;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.user_is_active(auth.uid()), false) THEN RAISE EXCEPTION 'Pay review not found'; END IF;
  SELECT * INTO r FROM public.pay_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pay review not found'; END IF;
  IF NOT public.payroll_can_admin(auth.uid()) THEN RAISE EXCEPTION 'Only payroll admins can apply pay reviews'; END IF;
  IF r.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Pay review not found'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Pay review must be approved before it is applied'; END IF;

  SELECT * INTO prev FROM public.crew_compensation
  WHERE profile_id = r.profile_id AND status = 'active' ORDER BY effective_from DESC LIMIT 1;

  INSERT INTO public.crew_compensation (
    company_id, profile_id, pay_grade_id, currency, base_salary_minor, pay_frequency, allowances,
    gratuity_points, gratuity_eligible, effective_from, status, reason, approved_by, approved_at, created_by
  ) VALUES (
    r.company_id, r.profile_id, prev.pay_grade_id, r.currency, r.proposed_base_minor,
    COALESCE(prev.pay_frequency, 'monthly'), COALESCE(prev.allowances, '[]'::jsonb),
    prev.gratuity_points, COALESCE(prev.gratuity_eligible, true), r.effective_date, 'active',
    'Pay review ' || r.reason, auth.uid(), now(), auth.uid()
  ) RETURNING id INTO new_id;

  UPDATE public.pay_reviews
  SET status = 'applied', applied_at = now(), previous_compensation_id = prev.id, new_compensation_id = new_id, updated_at = now()
  WHERE id = p_review_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_calculate_run(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run public.payroll_runs;
  period public.pay_periods;
  settings public.hr_company_settings;
  comp RECORD;
  d RECORD;
  v_base_period bigint;
  v_paid_days integer;
  v_ratio numeric(12,8);
  v_prorated bigint;
  v_allow bigint;
  v_allow_detail jsonb;
  v_grat bigint;
  v_gross bigint;
  v_net bigint;
  v_fx numeric;
  v_line_id uuid;
  v_count integer := 0;
  v_days_in integer;
  v_rounding integer;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.user_is_active(auth.uid()), false) THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;
  IF NOT public.payroll_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to calculate payroll';
  END IF;

  SELECT * INTO run FROM public.payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF run.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF run.status NOT IN ('draft', 'calculated') THEN
    RAISE EXCEPTION 'Payroll run % cannot be recalculated in status %', run.run_number, run.status;
  END IF;

  SELECT * INTO period FROM public.pay_periods WHERE id = run.pay_period_id;
  settings := public.hr_company_settings_for(run.company_id);
  v_days_in := period.end_date - period.start_date + 1;
  v_rounding := GREATEST(settings.rounding_minor, 1);

  -- Release gratuities previously attached to this run's lines, then rebuild.
  UPDATE public.gratuity_distributions SET payout_status = 'pending', payroll_line_id = NULL
  WHERE payroll_line_id IN (SELECT id FROM public.payroll_lines WHERE run_id = p_run_id) AND payout_status = 'in_payroll';
  DELETE FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'adjusted';

  FOR comp IN
    SELECT cc.*, p.user_id,
           (SELECT ca.vessel_id FROM public.crew_assignments ca
             WHERE ca.user_id = p.user_id AND ca.is_current ORDER BY ca.join_date DESC LIMIT 1) AS current_vessel_id
    FROM public.crew_compensation cc
    JOIN public.profiles p ON p.id = cc.profile_id
    WHERE cc.company_id = run.company_id
      AND cc.status = 'active'
      AND cc.effective_from <= period.end_date
      AND (cc.effective_to IS NULL OR cc.effective_to >= period.start_date)
      AND NOT EXISTS (SELECT 1 FROM public.payroll_lines pl WHERE pl.run_id = p_run_id AND pl.profile_id = cc.profile_id AND pl.status = 'adjusted')
  LOOP
    IF run.vessel_id IS NOT NULL AND comp.current_vessel_id IS DISTINCT FROM run.vessel_id THEN
      CONTINUE;
    END IF;

    SELECT * INTO d FROM public.hr_days_onboard(comp.profile_id, period.start_date, period.end_date, run.vessel_id, settings.unpaid_leave_codes);

    IF comp.pay_frequency = 'daily' THEN
      v_paid_days := d.days_onboard + CASE WHEN settings.travel_days_paid THEN d.days_travel ELSE 0 END;
      v_base_period := comp.base_salary_minor * v_days_in; -- reference only
      v_ratio := CASE WHEN v_days_in > 0 THEN v_paid_days::numeric / v_days_in ELSE 0 END;
      v_prorated := comp.base_salary_minor * v_paid_days;
    ELSE
      v_base_period := CASE comp.pay_frequency
        WHEN 'annual' THEN ROUND(comp.base_salary_minor / 12.0)
        WHEN 'weekly' THEN ROUND(comp.base_salary_minor * 52 / 12.0)
        ELSE comp.base_salary_minor END;
      v_paid_days := v_days_in - d.days_unpaid - CASE WHEN settings.travel_days_paid THEN 0 ELSE d.days_travel END;
      v_ratio := CASE WHEN v_days_in > 0 THEN v_paid_days::numeric / v_days_in ELSE 0 END;
      v_prorated := ROUND(v_base_period * v_ratio);
    END IF;

    -- Allowances
    v_allow := 0;
    v_allow_detail := '[]'::jsonb;
    IF jsonb_typeof(comp.allowances) = 'array' THEN
      SELECT COALESCE(SUM(amt), 0), COALESCE(jsonb_agg(jsonb_build_object('name', nm, 'amount_minor', amt)), '[]'::jsonb)
      INTO v_allow, v_allow_detail
      FROM (
        SELECT
          a->>'name' AS nm,
          CASE WHEN COALESCE((a->>'prorate')::boolean, true)
               THEN ROUND(COALESCE((a->>'amount_minor')::bigint, 0) * v_ratio)
               ELSE COALESCE((a->>'amount_minor')::bigint, 0) END AS amt
        FROM jsonb_array_elements(comp.allowances) a
        WHERE COALESCE((a->>'recurring')::boolean, true)
      ) x;
    END IF;

    -- Gratuities pending for this crew member whose pool period ended in the pay period
    SELECT COALESCE(SUM(gd.amount_minor + gd.adjustment_minor), 0) INTO v_grat
    FROM public.gratuity_distributions gd
    JOIN public.gratuity_pools gp ON gp.id = gd.pool_id
    WHERE gd.profile_id = comp.profile_id AND gd.payout_status = 'pending' AND NOT gd.excluded
      AND gp.status = 'approved' AND gp.currency = comp.currency
      AND gp.period_end BETWEEN period.start_date AND period.end_date;

    v_gross := v_prorated + v_allow + v_grat;
    v_net := (v_gross / v_rounding) * v_rounding;
    v_fx := public.fx_rate_for(run.company_id, comp.currency, run.currency, period.end_date);

    INSERT INTO public.payroll_lines (
      run_id, company_id, profile_id, compensation_id, pay_grade_id, vessel_id, currency, pay_frequency,
      days_in_period, days_onboard, days_leave_paid, days_travel, days_unpaid, days_paid, proration_ratio,
      base_period_minor, prorated_base_minor, allowances_minor, gratuity_minor, gross_minor, net_minor,
      fx_rate_to_run, net_run_currency_minor, breakdown, status
    ) VALUES (
      p_run_id, run.company_id, comp.profile_id, comp.id, comp.pay_grade_id, comp.current_vessel_id, comp.currency, comp.pay_frequency,
      v_days_in, d.days_onboard, d.days_leave_paid, d.days_travel, d.days_unpaid, v_paid_days, v_ratio,
      v_base_period, v_prorated, v_allow, v_grat, v_gross, v_net,
      v_fx, CASE WHEN v_fx IS NULL THEN NULL ELSE ROUND(v_net * v_fx) END,
      jsonb_build_object('allowances', v_allow_detail, 'days', d.source_summary, 'travel_days_paid', settings.travel_days_paid),
      'calculated'
    ) RETURNING id INTO v_line_id;

    UPDATE public.gratuity_distributions gd
    SET payout_status = 'in_payroll', payroll_line_id = v_line_id
    FROM public.gratuity_pools gp
    WHERE gp.id = gd.pool_id AND gd.profile_id = comp.profile_id AND gd.payout_status = 'pending' AND NOT gd.excluded
      AND gp.status = 'approved' AND gp.currency = comp.currency
      AND gp.period_end BETWEEN period.start_date AND period.end_date;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.payroll_runs SET
    status = 'calculated',
    calculated_at = now(),
    headcount = (SELECT COUNT(*) FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'excluded'),
    total_gross_minor = (SELECT COALESCE(SUM(COALESCE(ROUND(gross_minor * fx_rate_to_run), gross_minor)), 0) FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'excluded'),
    total_deductions_minor = (SELECT COALESCE(SUM(COALESCE(ROUND(deductions_minor * fx_rate_to_run), deductions_minor)), 0) FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'excluded'),
    total_net_minor = (SELECT COALESCE(SUM(COALESCE(net_run_currency_minor, net_minor)), 0) FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'excluded'),
    updated_at = now()
  WHERE id = p_run_id;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.gratuity_calculate_pool(p_pool_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pool public.gratuity_pools;
  settings public.hr_company_settings;
  comp RECORD;
  d RECORD;
  v_points numeric;
  v_weight numeric;
  v_total_weight numeric := 0;
  v_net bigint;
  v_allocated bigint := 0;
  v_count integer := 0;
  v_last_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.user_is_active(auth.uid()), false) THEN
    RAISE EXCEPTION 'Gratuity pool not found';
  END IF;
  IF NOT public.payroll_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to calculate gratuities';
  END IF;
  SELECT * INTO pool FROM public.gratuity_pools WHERE id = p_pool_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gratuity pool not found'; END IF;
  IF pool.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Gratuity pool not found'; END IF;
  IF pool.status NOT IN ('draft', 'calculated') THEN
    RAISE EXCEPTION 'Pool % cannot be recalculated in status %', pool.name, pool.status;
  END IF;
  settings := public.hr_company_settings_for(pool.company_id);
  v_net := pool.gross_amount_minor - pool.deductions_minor;

  -- Upsert participants
  FOR comp IN
    SELECT cc.profile_id, cc.gratuity_points, pg.gratuity_points AS grade_points
    FROM public.crew_compensation cc
    LEFT JOIN public.pay_grades pg ON pg.id = cc.pay_grade_id
    WHERE cc.company_id = pool.company_id AND cc.status = 'active' AND cc.gratuity_eligible
      AND cc.effective_from <= pool.period_end AND (cc.effective_to IS NULL OR cc.effective_to >= pool.period_start)
  LOOP
    SELECT * INTO d FROM public.hr_days_onboard(comp.profile_id, pool.period_start, pool.period_end, pool.vessel_id, settings.unpaid_leave_codes);
    IF d.days_onboard <= 0 THEN CONTINUE; END IF;
    v_points := COALESCE(comp.gratuity_points, comp.grade_points, settings.gratuity_default_points);
    v_weight := CASE pool.split_method
      WHEN 'equal' THEN 1
      WHEN 'points' THEN v_points
      WHEN 'days_weighted' THEN d.days_onboard
      ELSE v_points * d.days_onboard END;

    INSERT INTO public.gratuity_distributions (pool_id, company_id, profile_id, days_onboard, points, weight)
    VALUES (p_pool_id, pool.company_id, comp.profile_id, d.days_onboard, v_points, v_weight)
    ON CONFLICT (pool_id, profile_id) DO UPDATE
      SET days_onboard = EXCLUDED.days_onboard, points = EXCLUDED.points, weight = EXCLUDED.weight, updated_at = now();
  END LOOP;

  -- Drop participants no longer eligible (never touch paid rows)
  DELETE FROM public.gratuity_distributions gd
  WHERE gd.pool_id = p_pool_id AND gd.payout_status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_compensation cc
      WHERE cc.profile_id = gd.profile_id AND cc.status = 'active' AND cc.gratuity_eligible
    );

  SELECT COALESCE(SUM(weight), 0) INTO v_total_weight FROM public.gratuity_distributions WHERE pool_id = p_pool_id AND NOT excluded;

  UPDATE public.gratuity_distributions
  SET share_ratio = CASE WHEN excluded OR v_total_weight = 0 THEN 0 ELSE weight / v_total_weight END,
      amount_minor = CASE WHEN excluded OR v_total_weight = 0 THEN 0 ELSE FLOOR(v_net * (weight / v_total_weight)) END,
      updated_at = now()
  WHERE pool_id = p_pool_id AND payout_status IN ('pending', 'cancelled');

  -- Give rounding remainder to the largest share so the pool sums exactly.
  SELECT COALESCE(SUM(amount_minor), 0) INTO v_allocated FROM public.gratuity_distributions WHERE pool_id = p_pool_id AND NOT excluded;
  IF v_allocated < v_net AND v_total_weight > 0 THEN
    SELECT id INTO v_last_id FROM public.gratuity_distributions WHERE pool_id = p_pool_id AND NOT excluded ORDER BY weight DESC, created_at ASC LIMIT 1;
    UPDATE public.gratuity_distributions SET amount_minor = amount_minor + (v_net - v_allocated) WHERE id = v_last_id;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.gratuity_distributions WHERE pool_id = p_pool_id AND NOT excluded;
  UPDATE public.gratuity_pools SET status = 'calculated', calculated_at = now(), updated_at = now() WHERE id = p_pool_id;
  RETURN v_count;
END;
$$;

-- Legal (20260919120000_legal_module.sql). legal_generate_alerts(): a
-- signed-in caller sweeps their own company only; get_user_company_id() is
-- NULL for an inactive caller and the NULL company meant "every company",
-- so stop there, as hr_generate_alerts() does (the service role, with no
-- JWT, still sweeps p_company_id or every company). Full live body.
CREATE OR REPLACE FUNCTION public.legal_generate_alerts(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := p_company_id;
  r record;
  v_type text;
  v_severity public.alert_severity;
  v_title text;
  v_existing uuid;
  v_count integer := 0;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT public.legal_can_edit(v_uid) THEN
      RAISE EXCEPTION 'Only the legal team can generate legal alerts';
    END IF;
    v_company := public.get_user_company_id(v_uid);
    IF v_company IS NULL THEN RETURN 0; END IF;
  END IF;

  FOR r IN
    SELECT q.id, q.company_id, q.vessel_id, q.reference_number, q.request_type, q.priority, q.sla_deadline, q.assigned_to,
           EXTRACT(EPOCH FROM (q.sla_deadline - now())) / 3600.0 AS hours_left
    FROM public.legal_requests q
    WHERE q.status NOT IN ('completed', 'cancelled')
      AND q.sla_deadline IS NOT NULL
      AND (v_company IS NULL OR q.company_id = v_company)
      AND q.sla_deadline <= now() + interval '24 hours'
  LOOP
    IF r.hours_left < 0 THEN
      v_type := 'legal_sla_breached';
      v_severity := 'RED';
      v_title := r.reference_number || ': SLA breached ' ||
        CASE WHEN -r.hours_left >= 48 THEN floor(-r.hours_left / 24)::text || ' days ago'
             ELSE floor(-r.hours_left)::text || ' h ago' END;
    ELSE
      v_type := 'legal_sla_due';
      v_severity := 'ORANGE';
      v_title := r.reference_number || ': SLA due in ' || GREATEST(0, floor(r.hours_left))::text || ' h';
    END IF;

    -- A breach supersedes a due-soon alert for the same request.
    IF v_type = 'legal_sla_breached' THEN
      UPDATE public.alerts SET status = 'AUTO_DISMISSED', resolved_at = now(), updated_at = now()
      WHERE source_module = 'legal' AND alert_type = 'legal_sla_due' AND related_entity_id = r.id
        AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED');
    END IF;

    SELECT id INTO v_existing FROM public.alerts
    WHERE company_id = r.company_id AND alert_type = v_type AND related_entity_id = r.id
      AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.alerts SET title = v_title, severity_color = v_severity, due_at = r.sla_deadline, updated_at = now(),
        metadata = jsonb_build_object('priority', r.priority, 'request_type', r.request_type, 'hours_left', round(r.hours_left::numeric, 1))
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.alerts (company_id, vessel_id, alert_type, title, description, severity_color, status, source_module,
        related_entity_type, related_entity_id, due_at, owner_role, owner_user_id, assigned_to_user_id, metadata)
      VALUES (r.company_id, r.vessel_id, v_type, v_title,
        public.legal_request_type_label(r.request_type) || ' request, ' || r.priority || ' priority. SLA deadline ' || to_char(r.sla_deadline, 'DD Mon YYYY HH24:MI') || '.',
        v_severity, 'OPEN', 'legal', 'legal_request', r.id, r.sla_deadline, 'LEGAL', r.assigned_to, r.assigned_to,
        jsonb_build_object('priority', r.priority, 'request_type', r.request_type, 'hours_left', round(r.hours_left::numeric, 1)));
      v_count := v_count + 1;
    END IF;
  END LOOP;

  UPDATE public.alerts a SET status = 'AUTO_DISMISSED', resolved_at = now(), updated_at = now()
  WHERE a.source_module = 'legal'
    AND a.alert_type IN ('legal_sla_due', 'legal_sla_breached')
    AND a.status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    AND (v_company IS NULL OR a.company_id = v_company)
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_requests q
      WHERE q.id = a.related_entity_id
        AND q.status NOT IN ('completed', 'cancelled')
        AND q.sla_deadline <= now() + interval '24 hours'
    );

  RETURN v_count;
END;
$$;

-- The legal-documents storage predicate: false for an inactive caller, and
-- the folder's company compared with IS DISTINCT FROM (the caller's company
-- is NULL when inactive, and NULL <> x skipped the RETURN false). A path
-- with fewer than three folders (array_length() is NULL for none) is false.
CREATE OR REPLACE FUNCTION public.legal_attachment_path_allowed(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[] := storage.foldername(p_name);
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT coalesce(public.user_is_active(v_uid), false) OR coalesce(array_length(parts, 1), 0) < 3 THEN RETURN false; END IF;
  IF parts[1] IS DISTINCT FROM public.get_user_company_id(v_uid)::text THEN RETURN false; END IF;
  IF public.legal_can_edit(v_uid) THEN RETURN true; END IF;
  IF parts[2] = 'requests' THEN
    RETURN EXISTS (SELECT 1 FROM public.legal_requests r WHERE r.id::text = parts[3] AND r.submitted_by = v_uid);
  ELSIF parts[2] = 'submissions' THEN
    RETURN EXISTS (SELECT 1 FROM public.legal_form_submissions s WHERE s.id::text = parts[3] AND s.submitted_by = v_uid);
  END IF;
  RETURN false;
END;
$$;

-- The legacy triggers payroll_runs_guard_transitions() ("IF ... AND NOT
-- payroll_can_admin(auth.uid())") and profiles_guard_privileged_columns()
-- ("AND NOT hr_can_admin(auth.uid())") are unchanged: with the helpers
-- two-valued their gates close for an inactive caller
-- (p3_user_status/inactive_gates.test.sql).

-- ---------------------------------------------------------------- own-row profile policies (CC-7)

-- A disabled user reads no profile row, so every inline
-- "(SELECT company_id FROM profiles WHERE user_id = auth.uid())" in a policy
-- denies too.
--
-- The caller-only parts are initplans, computed once per statement
-- (D-229; review round 5): (SELECT auth.uid()) and
-- (SELECT public.user_is_active(auth.uid())). Same rows as the per-row
-- form (p3_access_rls/rls_perf.test.sql proves it on a seeded fleet).
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.user_is_active(auth.uid())));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.user_is_active(auth.uid())))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.user_is_active(auth.uid())));

-- The legacy company read (20260125160927_7551738f-…, "Users can view
-- profiles in their company": user_belongs_to_company(auth.uid(),
-- company_id), evaluated per row), redefined here with the caller's
-- company as an initplan (D-229; review round 5): company_id =
-- get_user_company_id(auth.uid()) holds exactly when
-- user_belongs_to_company(auth.uid(), company_id) does (profiles.user_id is
-- unique; a NULL company matches neither; an inactive caller gets NULL, so
-- nothing). Command and roles as live (FOR SELECT, no TO list).
DROP POLICY IF EXISTS "Users can view profiles in their company" ON public.profiles;
CREATE POLICY "Users can view profiles in their company" ON public.profiles
  FOR SELECT
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

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
--   The pending vessel placement (review round 3, D-204; the columns
--   fulfil_imported_assignment() and admin_may_act_on_user() trust):
--     a new profile with an imported_vessel_id,
--     unless the caller is a users-access admin
--     of that vessel (create-crew-member is the
--     service role; recruitment_hire_candidate
--     runs as the HR editor)                    profile_access_columns_locked
--     is_imported / imported_vessel_id on your
--     own row, or is_imported false -> true     profile_access_columns_locked
--     otherwise: users-access admin of the
--     company, admin_may_act_on_user() (read
--     from the OLD row, so a vessel-less target
--     needs an all-vessels admin) and
--     users-access admin of the old and the
--     new vessel                                profile_access_columns_locked
--     position, rank or joining_date while the
--     placement is pending (is_imported with an
--     imported_vessel_id): users-access admin
--     of the pending vessel                     profile_access_columns_locked
--   The invitation address (review round 3, D-206): an email change on a
--   profile with no login, a live invitation (pending / sent /
--   send_failed) or a login without sign-in evidence
--   (coalesce(last_login_at, auth last_sign_in_at)):
--     an administrator target (old or new role
--     dpa / shore_management, or
--     user_is_admin_target()): an all-vessels
--     users-access admin                        profile_access_columns_locked
--     who manages admins (under
--     lock_company_admin_managers())            manages_admins_required
--     anyone else: users-access admin who may
--     act on the person (admin_may_act_on_user) profile_access_columns_locked
--   and every allowed such change writes one permission_audit_log row
--   (scope_changed, high impact, the sha256 of the old and new address,
--   never the address). A signed-in person's own address change is not
--   limited here.
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
  v_live boolean := false;
  v_signed_in timestamptz;
  v_admin_target boolean;
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
    -- A pending vessel placement (D-184, D-204) is written by
    -- create-crew-member (service role), or by a users-access admin of
    -- that vessel: the live recruitment_hire_candidate() definer inserts
    -- the hired profile (is_imported, the vacancy's vessel) under the HR
    -- editor's session, so a hire onto a vessel needs the same right
    -- create-crew-member checks. is_imported without a vessel places
    -- nobody (fulfil_imported_assignment and admin_may_act_on_user need
    -- the vessel) and stays allowed.
    IF NEW.imported_vessel_id IS NOT NULL
       AND NOT public.has_capability_for(v_uid, 'admin.access.users_access.admin', NEW.company_id, NEW.imported_vessel_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'A pending vessel placement is written by create-crew-member only.';
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

  -- The pending vessel placement (D-184, D-204; review round 3,
  -- profile-imported-columns-unguarded): fulfil_imported_assignment() and
  -- admin_may_act_on_user() trust is_imported / imported_vessel_id, so
  -- they never change on your own row, never turn a profile imported, and
  -- otherwise need a users-access admin who may act on the person (read
  -- from the OLD row: a vessel-less target needs admin_scope_all()) and
  -- administers the old and the new vessel.
  IF NEW.is_imported IS DISTINCT FROM OLD.is_imported OR NEW.imported_vessel_id IS DISTINCT FROM OLD.imported_vessel_id THEN
    IF OLD.user_id IS NOT DISTINCT FROM v_uid THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'You cannot change your own pending vessel placement.';
    END IF;
    IF NOT coalesce(OLD.is_imported, false) AND NEW.is_imported IS TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'A pending vessel placement is written by create-crew-member only.';
    END IF;
    IF NOT (public.has_capability_for(v_uid, 'admin.access.users_access.admin', OLD.company_id)
            AND public.admin_may_act_on_user(v_uid, OLD.user_id, OLD.company_id, OLD.id)
            AND (OLD.imported_vessel_id IS NULL
                 OR public.has_capability_for(v_uid, 'admin.access.users_access.admin', OLD.company_id, OLD.imported_vessel_id))
            AND (NEW.imported_vessel_id IS NULL
                 OR public.has_capability_for(v_uid, 'admin.access.users_access.admin', OLD.company_id, NEW.imported_vessel_id))) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
        DETAIL = 'Only a users-access administrator of the vessels involved can change a pending vessel placement.';
    END IF;
  END IF;

  -- While a placement is pending, its position, rank and joining date are
  -- what fulfil_imported_assignment() writes into crew_assignments (the
  -- Master office included, D-198): a users-access admin of the pending
  -- vessel only. Other profiles keep their HR edits (rank feeds
  -- trg_profiles_sync_hw_person).
  IF coalesce(OLD.is_imported, false) AND OLD.imported_vessel_id IS NOT NULL
     AND (NEW.position IS DISTINCT FROM OLD.position OR NEW.rank IS DISTINCT FROM OLD.rank OR NEW.joining_date IS DISTINCT FROM OLD.joining_date)
     AND NOT public.has_capability_for(v_uid, 'admin.access.users_access.admin', OLD.company_id, OLD.imported_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
      DETAIL = 'Only a users-access administrator of the pending vessel can change the position, rank or joining date of a pending crew member.';
  END IF;

  -- The address an invitation goes to decides who gets the profile (D-121,
  -- D-206; review round 3, profile-email-unguarded). A change is an access
  -- change when the profile has no login, a live invitation, or a login
  -- with no sign-in evidence (coalesce(last_login_at, auth
  -- last_sign_in_at)); a signed-in person's own address change is not.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    IF to_regclass('public.user_invitations') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.user_invitations AS ui WHERE ui.profile_id = $1 AND ui.status IN (''pending'', ''sent'', ''send_failed''))'
        INTO v_live USING OLD.id;
    END IF;
    IF OLD.user_id IS NOT NULL THEN
      v_signed_in := coalesce(OLD.last_login_at, (SELECT u.last_sign_in_at FROM auth.users AS u WHERE u.id = OLD.user_id));
    END IF;
    IF OLD.user_id IS NULL OR coalesce(v_live, false) OR v_signed_in IS NULL THEN
      v_admin_target := OLD.role::text IN ('dpa', 'shore_management') OR NEW.role::text IN ('dpa', 'shore_management')
        OR (OLD.user_id IS NOT NULL AND public.user_is_admin_target(OLD.user_id, OLD.company_id));
      IF v_admin_target THEN
        PERFORM public.lock_company_admin_managers(OLD.company_id);
        IF NOT (public.has_capability_for(v_uid, 'admin.access.users_access.admin', OLD.company_id)
                AND public.admin_scope_all(v_uid, OLD.company_id)) THEN
          RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
            DETAIL = 'Only a users-access administrator of every vessel can change the address an administrator''s invitation goes to.';
        END IF;
        IF NOT public.user_manages_admins_for(v_uid, OLD.company_id) THEN
          RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'manages_admins_required',
            DETAIL = 'Only an administrator who manages administrators can change the address an administrator''s invitation goes to.';
        END IF;
      ELSIF NOT (public.has_capability_for(v_uid, 'admin.access.users_access.admin', OLD.company_id)
                 AND public.admin_may_act_on_user(v_uid, OLD.user_id, OLD.company_id, OLD.id)) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile_access_columns_locked',
          DETAIL = 'Only a users-access administrator of this person''s vessel can change the address an invitation goes to.';
      END IF;
      -- One audit row per allowed change; hashes only, never the address
      -- (audit_action_type has no email value: scope_changed).
      SELECT p.role::text INTO v_actor_role FROM public.profiles AS p WHERE p.user_id = v_uid;
      IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.permission_audit_log'::regclass AND attname = 'company_id' AND NOT attisdropped) THEN
        EXECUTE 'INSERT INTO public.permission_audit_log (actor_user_id, actor_role, action_type, target_user_id, before_state, after_state, is_high_impact, company_id)
                 VALUES ($1, $2, ''scope_changed'', $3, $4, $5, true, $6)'
          USING v_uid, coalesce(v_actor_role, 'unknown'), OLD.user_id,
                jsonb_build_object('profile_id', OLD.id, 'field', 'email',
                                   'email_sha256', encode(sha256(convert_to(lower(btrim(OLD.email)), 'UTF8')), 'hex')),
                jsonb_build_object('profile_id', OLD.id, 'field', 'email',
                                   'email_sha256', encode(sha256(convert_to(lower(btrim(NEW.email)), 'UTF8')), 'hex'), 'via', 'profiles'),
                OLD.company_id;
      ELSE
        INSERT INTO public.permission_audit_log (actor_user_id, actor_role, action_type, target_user_id, before_state, after_state, is_high_impact)
        VALUES (v_uid, coalesce(v_actor_role, 'unknown'), 'scope_changed', OLD.user_id,
                jsonb_build_object('profile_id', OLD.id, 'field', 'email',
                                   'email_sha256', encode(sha256(convert_to(lower(btrim(OLD.email)), 'UTF8')), 'hex')),
                jsonb_build_object('profile_id', OLD.id, 'field', 'email',
                                   'email_sha256', encode(sha256(convert_to(lower(btrim(NEW.email)), 'UTF8')), 'hex'), 'via', 'profiles'),
                true);
      END IF;
    END IF;
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
  IF p.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.crew_assignments ca
                                       WHERE ca.user_id = p.user_id AND ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)) THEN
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

-- D-233 (review round 6): the two-valued legacy helpers and the caller-checked
-- legacy definers keep their live grantees (authenticated: policies and the
-- src/modules/hris and src/modules/legal hooks; service_role), never PUBLIC
-- or anon.
REVOKE ALL ON FUNCTION public.hr_can_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_can_edit(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_can_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.payroll_can_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.payroll_can_edit(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.payroll_can_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legal_can_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legal_can_edit(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legal_can_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.medical_can_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.medical_can_edit(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.medical_can_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wellness_can_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wellness_can_edit(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wellness_can_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.med_fitness_can_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hw_is_practitioner(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_can_write_crew_record(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.frp_can_edit(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.frp_can_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.performance_review_submit_self_assessment(uuid, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.performance_review_acknowledge(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.disciplinary_record_acknowledge(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pay_review_apply(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.payroll_calculate_run(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gratuity_calculate_pool(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legal_generate_alerts(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legal_attachment_path_allowed(text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.hr_can_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_can_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legal_can_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legal_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legal_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.medical_can_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.medical_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.medical_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wellness_can_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wellness_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wellness_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.med_fitness_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hw_is_practitioner(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_can_write_crew_record(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.frp_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.frp_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.performance_review_submit_self_assessment(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.performance_review_acknowledge(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disciplinary_record_acknowledge(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_review_apply(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_calculate_run(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gratuity_calculate_pool(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legal_generate_alerts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.legal_attachment_path_allowed(text) TO authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.user_belongs_to_company(uuid, uuid) IS 'The user has a profile in the company and is active (D-122: disabled / deactivated profile, disabled / removed membership or auth ban -> false). Live helper redefined by 20261123010000_platform_user_status.';
COMMENT ON FUNCTION public.get_user_company_id(uuid) IS 'The profile''s company for an active user, else NULL (D-122).';
COMMENT ON FUNCTION public.my_profile_id() IS 'The caller''s profile id while active, else NULL (D-122).';
COMMENT ON FUNCTION public.current_user_company_id() IS 'The company of the caller''s active user_roles row that names their own profile company (CC-5, D-181), only while the caller is active (D-122).';
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS 'has_any_role(_user_id, ARRAY[_role]): an active, unexpired user_roles row with that role that counts in the holder''s own company (CC-5, D-181), for an active user only (D-122).';
COMMENT ON FUNCTION public.has_any_role(uuid, public.app_role[]) IS 'An active, unexpired, company-wide user_roles row with one of the roles, for an active user only (D-122), that names the holder''s profile company or no company (CC-5, D-181): a company-less superadmin row counts anywhere, another company-less row for the holder''s own company only, a row naming another company never. Company-wide means no vessel_id, or a superadmin / dpa / fleet_master row (D-234): a vessel-scoped row confers its role on that vessel only, so it never counts here (has_role_on_vessel_in_company() asks about a vessel). No caller probe guard (definers pass arbitrary ids).';
COMMENT ON FUNCTION public.legacy_profile_role(uuid) IS 'The legacy profiles.role for an active user, else NULL, so the HR / legal / health helpers built on it deny a disabled user (D-122).';
COMMENT ON FUNCTION public.profiles_guard_access_columns() IS 'Trigger (CC-6, W7; D-174): from a signed-in session without storm.access_engine, company_id / user_id / account_status never change (42501 profile_access_columns_locked: use admin-actions / set_membership_status), nor the invitation and sign-in bookkeeping (invitation_token, invitation_token_expires, invitation_count, last_invited_at, invited_at, last_login_at; your own row included) and a new profile starts with none of it; role never on your own row and otherwise needs users-access admin and an actor who may act on the target (vessel reach; an all-vessels admin for a dpa / shore_management role) (profile_access_columns_locked), a manager of admins when an administrator is involved (manages_admins_required), at most the caller''s rank (rank_exceeded), never dpa away from the last manager of admins (last_manager_of_admins, under lock_company_admin_managers), and is audited in permission_audit_log; a new dpa / shore_management profile needs an all-vessels users-access admin, a manager of admins and the rank check. Review round 3 (D-204, D-206): the pending vessel placement (is_imported, imported_vessel_id) is set on a new profile only by a users-access admin of that vessel (or the service role), never changes on your own row, never turns imported, and otherwise needs a users-access admin who may act on the person and administers the old and the new vessel; while a placement is pending its position, rank and joining_date need users-access admin of the pending vessel; an email change on a profile with no login, a live invitation or no sign-in evidence needs, for an administrator target, an all-vessels users-access admin who manages admins (manages_admins_required), else a users-access admin who may act on the person, and writes one scope_changed permission_audit_log row with sha256 hashes of the old and new address, never the address (all profile_access_columns_locked unless noted).';
COMMENT ON FUNCTION public.user_manages_admins_for(uuid, uuid) IS 'Whether the user manages admins in the company (non-legacy owner / manages_admins membership, legacy dpa, or a user_roles dpa / superadmin row of the company). Internal to set_membership_status (service role).';
COMMENT ON FUNCTION public.set_membership_status(uuid, text, uuid, text) IS 'gap/01 W7, F23: turns a user''s access off / on for an actor who is a users-access admin of their company and may act on the user (vessel reach, admin_may_act_on_user); no self, never the owner, manages-admins to change an admin, never the last manager of admins (serialised by lock_company_admin_managers), reason to disable; enabling restores a removed membership, except a withdrawn invitee, who is re-invited, not enabled (42501 invitation_withdrawn). Mirrors profiles.account_status and logs TOGGLE_ACCESS. Service role only (admin-actions).';
COMMENT ON FUNCTION public.hr_anonymize_profile(uuid, text) IS 'HRIS GDPR erasure (live body of 20260917190000) for an own-company users-access admin who may act on the person (42501 not_permitted; a user_roles row naming another company never opens it, CC-5 / D-181), with the W7 guards of set_membership_status under lock_company_admin_managers before the account is disabled (reason, no self, no owner, manages-admins for an administrator, never the last manager of admins); the disable runs under storm.access_engine and is logged as TOGGLE_ACCESS.';
COMMENT ON FUNCTION public.user_is_admin_target(uuid, uuid) IS 'W7: whether the user is an administrator of the company whatever their active state (dpa / shore_management profile, admin / owner membership, user_roles dpa / superadmin of the company or none, RBAC superadmin / dpa, a granted settings:admin override). Internal (service role; definers).';
COMMENT ON FUNCTION public.lock_company_admin_managers(uuid) IS 'W7 last-manager race: pg_advisory_xact_lock on admin_managers:<company>, taken by set_membership_status, the profile role-change guard and hr_anonymize_profile before their actor and last-manager checks. Relies on READ COMMITTED (PostgREST''s default); user_roles and the membership manages_admins / kind have no browser write path. No grant: definers only.';
COMMENT ON FUNCTION public.auth_user_id_for_email(text) IS 'The auth user id for an email address (case-insensitive), or NULL. Service role only (the invite path).';
COMMENT ON FUNCTION public.hr_can_admin(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (HR admin: a company-wide user_roles superadmin / dpa row (D-234), RBAC hr admin or the legacy dpa / shore_management profile role).';
COMMENT ON FUNCTION public.hr_can_edit(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (HR edit: hr_can_admin, a company-wide user_roles fleet_master / captain / purser row (D-234), RBAC hr edit or the legacy master profile role).';
COMMENT ON FUNCTION public.hr_can_view(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (HR view: hr_can_edit, a company-wide user_roles chief_officer / chief_engineer / hod row, RBAC hr view or the legacy chief officer / chief engineer profile role).';
COMMENT ON FUNCTION public.payroll_can_admin(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (payroll admin: a company-wide superadmin / dpa row, RBAC finance admin or the legacy dpa / shore_management profile role).';
COMMENT ON FUNCTION public.payroll_can_edit(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (payroll edit: payroll_can_admin, a company-wide purser row or RBAC finance edit).';
COMMENT ON FUNCTION public.payroll_can_view(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (payroll view: payroll_can_edit, a company-wide fleet_master row or RBAC finance view).';
COMMENT ON FUNCTION public.legal_can_admin(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (legal admin: a company-wide superadmin / dpa row, RBAC legal admin or the legacy dpa / shore_management profile role).';
COMMENT ON FUNCTION public.legal_can_edit(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (legal edit: legal_can_admin or RBAC legal edit).';
COMMENT ON FUNCTION public.legal_can_view(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (legal view: legal_can_edit or RBAC legal view).';
COMMENT ON FUNCTION public.medical_can_admin(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (medical admin: a company-wide superadmin / dpa row, RBAC medical admin or the legacy dpa / shore_management profile role).';
COMMENT ON FUNCTION public.medical_can_edit(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (medical edit: medical_can_admin, an active medical practitioner or RBAC medical edit).';
COMMENT ON FUNCTION public.medical_can_view(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (medical view: medical_can_edit or RBAC medical view).';
COMMENT ON FUNCTION public.wellness_can_admin(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (wellness admin: a company-wide superadmin / dpa row, RBAC wellness admin or the legacy dpa / shore_management profile role).';
COMMENT ON FUNCTION public.wellness_can_edit(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (wellness edit: wellness_can_admin, medical_can_edit, any active practitioner, a company-wide captain / purser row, RBAC wellness edit or the legacy master profile role).';
COMMENT ON FUNCTION public.wellness_can_view(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (wellness view: wellness_can_edit, a company-wide fleet_master / chief_officer / chief_engineer / hod row or RBAC wellness view).';
COMMENT ON FUNCTION public.med_fitness_can_view(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (medical fitness view: medical_can_view, hr_can_view or a company-wide captain / fleet_master row).';
COMMENT ON FUNCTION public.hw_is_practitioner(uuid, text) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (an active, unended hw_practitioners row of the user''s own company, of that discipline when given).';
COMMENT ON FUNCTION public.frp_can_edit(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (planner edit: a company-wide superadmin / dpa / fleet_master / captain / hod / purser row, or the crew.edit_crew_profiles / crew.approve_leave flags (row 27)).';
COMMENT ON FUNCTION public.frp_can_view(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false for a NULL, unknown or inactive user (D-122), never NULL; otherwise its live body unchanged (planner view: frp_can_edit, a company-wide chief_officer / chief_engineer / officer / crew row, or the crew.view_crew_profiles / crew.see_crew_list / crew.access_leave_records flags (row 27)).';
COMMENT ON FUNCTION public.hr_can_write_crew_record(uuid) IS 'Live helper redefined two-valued by 20261123010000 (D-233): false when the caller (auth.uid()) is missing or inactive (D-122), never NULL; otherwise the live body: the caller''s own record, or an HR editor (hr_can_edit) writing a record of a person of their own company.';
COMMENT ON FUNCTION public.performance_review_submit_self_assessment(uuid, jsonb, text) IS 'HRIS self-service (live body of 20260917180528, redefined by 20261123010000, D-233): an active caller submits the self-assessment of their own review only (r.profile_id IS DISTINCT FROM my_profile_id() raises Review not found, a profile-less or inactive caller included).';
COMMENT ON FUNCTION public.performance_review_acknowledge(uuid, text) IS 'HRIS self-service (live body of 20260917180528, redefined by 20261123010000, D-233): an active caller acknowledges their own review only (IS DISTINCT FROM my_profile_id(); Review not found otherwise, a profile-less or inactive caller included).';
COMMENT ON FUNCTION public.disciplinary_record_acknowledge(uuid) IS 'HRIS self-service (live body of 20260917180528, redefined by 20261123010000, D-233): an active caller acknowledges their own disciplinary record only (IS DISTINCT FROM my_profile_id(); Record not found otherwise, a profile-less or inactive caller included).';
COMMENT ON FUNCTION public.pay_review_apply(uuid) IS 'Payroll (live body of 20260917180124, redefined by 20261123010000, D-233): an active payroll admin applies an approved pay review of their own company only (the row''s company IS DISTINCT FROM get_user_company_id(auth.uid()) raises Pay review not found).';
COMMENT ON FUNCTION public.payroll_calculate_run(uuid) IS 'Payroll (live body of 20260917180124, redefined by 20261123010000, D-233): an active payroll editor calculates a draft or calculated run of their own company only (Payroll run not found otherwise).';
COMMENT ON FUNCTION public.gratuity_calculate_pool(uuid) IS 'Payroll (live body of 20260917180124, redefined by 20261123010000, D-233): an active payroll editor splits a draft or calculated gratuity pool of their own company only (Gratuity pool not found otherwise).';
COMMENT ON FUNCTION public.legal_generate_alerts(uuid) IS 'Legal SLA alerts (live body of 20260919120000_legal_module, redefined by 20261123010000, D-233): a signed-in legal editor sweeps their own company only and gets 0 when they have no company (an inactive caller included); without a JWT (the service role, the scheduler) p_company_id, or every company when NULL.';
COMMENT ON FUNCTION public.legal_attachment_path_allowed(text) IS 'Legal-documents storage predicate (live body of 20260919120000_legal_module, redefined by 20261123010000, D-233): false without an active caller or with fewer than three folders; the first folder must be the caller''s company (IS DISTINCT FROM); legal editors anything under it, others only their own request or submission folder.';
