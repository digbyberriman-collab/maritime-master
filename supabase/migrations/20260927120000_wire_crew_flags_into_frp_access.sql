-- Wire the crew.* Users & Access flags into real enforcement.
--
-- The Users & Access screen (src/modules/users-access) writes overrides keyed
-- by the dotted flag names seeded in migration 20260522163528 --
-- 'crew.see_crew_list', 'crew.view_crew_profiles', 'crew.edit_crew_profiles',
-- 'crew.approve_leave', and so on. Ticking one of those boxes inserts a row
-- into user_permission_overrides with exactly that module_key.
--
-- The only place in the schema that ever calls user_has_module_access() with
-- a 'crew'-prefixed key is frp_can_edit() / frp_can_view() (the leave and
-- rotation planner's access checks) -- and both check the bare key 'crew',
-- not any of the seventeen dotted flag keys the screen actually writes.
-- 'crew' is not a seeded module and no role_permissions or override row is
-- ever keyed that way, so
--   user_has_module_access(_user_id, 'crew', 'edit')
--   user_has_module_access(_user_id, 'crew', 'admin')
--   user_has_module_access(_user_id, 'crew', 'view')
-- are always false. That branch of the OR was dead from the day it was
-- written: ticking a crew.* flag in Users & Access changed nothing, on any
-- table, for anyone. This is the fix the audit's H-something finding
-- ("the crew.* flags are stored but enforced nowhere") is about.
--
-- Fix: check the flag keys the screen actually writes, not the key nothing
-- ever writes. This is purely additive -- the existing has_any_role() checks
-- are untouched, so nobody's current access changes. It only makes granting
-- crew.edit_crew_profiles / crew.view_crew_profiles / crew.see_crew_list
-- through Users & Access do what the screen has always implied it does.
--
-- What this does NOT fix, and is out of scope here: crew.view_medical,
-- crew.edit_medical and crew.access_employment_records gate fields
-- (medical_expiry, contract_start_date, contract_end_date,
-- employment_status, ...) that live as plain columns on the same
-- public.profiles row as name, rank and cabin -- and the current
-- "Users can view profiles in their company" SELECT policy exposes that
-- whole row, medical and employment fields included, to every company
-- member regardless of any flag. Postgres RLS is row-level, not
-- column-level, so closing that needs either column-level grants behind a
-- SECURITY DEFINER accessor or splitting those columns into their own
-- linked tables -- a schema change that touches everywhere profiles is read
-- and written, which is not something to do in the same pass as this fix.
-- Tracked as a follow-up; see docs/permissions/platforms/maritime-master.md
-- in the-bridge repo for the plan.
--
-- Likewise crew.view_appraisals / crew.conduct_appraisals have no backing
-- table in this schema at all (no appraisals feature exists yet), and the
-- payroll/expense/invoice approval flags (crew.approve_payroll and similar)
-- have no corresponding tables here either -- there is nothing yet to wire
-- them to.

CREATE OR REPLACE FUNCTION public.frp_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['superadmin','dpa','fleet_master','captain','hod','purser']::app_role[])
    OR public.user_has_module_access(_user_id, 'crew.edit_crew_profiles', 'view')
    OR public.user_has_module_access(_user_id, 'crew.approve_leave', 'view');
$$;

-- Viewer check: editors plus crew-level roles who may read the planner
CREATE OR REPLACE FUNCTION public.frp_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.frp_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['chief_officer','chief_engineer','officer','crew']::app_role[])
    OR public.user_has_module_access(_user_id, 'crew.view_crew_profiles', 'view')
    OR public.user_has_module_access(_user_id, 'crew.see_crew_list', 'view')
    OR public.user_has_module_access(_user_id, 'crew.access_leave_records', 'view');
$$;

COMMENT ON FUNCTION public.frp_can_edit(uuid) IS
  'Leave/rotation planner edit access: the named roles, or crew.edit_crew_profiles / crew.approve_leave granted through Users & Access. Previously checked the non-existent module key ''crew'' -- see migration 20260927120000.';
COMMENT ON FUNCTION public.frp_can_view(uuid) IS
  'Leave/rotation planner read access: frp_can_edit(), the named roles, or crew.view_crew_profiles / crew.see_crew_list / crew.access_leave_records granted through Users & Access. Previously checked the non-existent module key ''crew'' -- see migration 20260927120000.';
