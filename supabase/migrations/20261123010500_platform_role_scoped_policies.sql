-- =================================================================
-- PLATFORM P3 follow-up: legacy app-role policies scoped to the row's
-- company (gap/01 F6, CC-5; Phase 2 security rules; proposed D-124)
-- Tables: none new. Columns: none.
-- Helper: has_role_in_company() (authenticated; RLS predicate, rule 11);
--   the live single-role overload redefined on the same rule
-- Policies (legacy names, recreated with the same command and roles):
--   crew_change_dates_insert / _update; crew_import_write_privileged /
--   _update_privileged (service role); crew_tasks "Officers can create
--   tasks"; destinations_update; fleet_groups "DPA and Superadmin can manage
--   fleet groups"; flight_bookings "Flight bookings viewable by request
--   owner and staff", "Travel agents and DPA can manage bookings";
--   flight_requests "Authorized users can manage flight requests", "Users
--   can view own flight requests"; hours_of_rest_records "Users can manage
--   own rest records", "Users can view own rest records"; leave_requests
--   "Authorized users can manage leave requests", "Users can view own leave
--   requests"; medical_reports "DPA and Captain can manage medical
--   reports", "Medical reports visible to authorized users"; modules "Only
--   admins can modify modules" (service role); notification_logs "Users can
--   view own notifications"; planner_periods "DPA and Captain can manage
--   planner periods"; support_tickets "Users can view their own support
--   tickets"; training_courses "Admins can insert / update / delete
--   training courses" (service role); trip_suggestions suggestions_delete /
--   suggestions_update; vessel_work_rest_settings "Admins manage vessel
--   work/rest settings"; work_rest_audit_log "View audit log";
--   work_rest_blocks "Manage blocks via record", "View blocks via record
--   visibility"; work_rest_compliance_checks "System manages compliance
--   checks", "View own compliance checks"; work_rest_monthly_submissions
--   "Authorized update of submission", "Crew create own submission", "Crew
--   view own submission"; work_rest_non_conformities "Manage NCs", "View
--   own NCs"; work_rest_notes "Manage own notes", "View notes";
--   work_rest_records "Crew manage own records", "Crew view own records";
--   work_rest_rule_sets "Admins manage rule sets"; work_rest_signatures
--   "View signatures"
-- Data: legacy user_roles rows without a company (other than superadmin)
--   are given their user's profile company.
-- TS mirror: none (RLS only; scripts/db/contract-map.json lists the helper
--   as not mirrored)
-- =================================================================
--
-- has_role() / has_any_role() answer "does the user hold this app role in
-- any user_roles row", whatever company that row names. About forty legacy
-- policies used them as their only gate, so a user_roles row of company A
-- opened company B's medical reports, flight bookings, rest records and
-- planner (the cross-tenant finding of the Phase 2 review). The write path
-- that let a tenant admin mint such rows is closed in
-- 20261123010100_platform_access_rls.sql; this file closes the read side
-- for rows that already exist: every policy whose only role gate was
-- has_role / has_any_role (with no company, vessel or own-row scope around
-- it) now asks has_role_in_company() about the row's company:
--
--   company_id column          -> company_id
--   vessel_id column           -> the vessel's company (subquery on vessels,
--                                 under the caller's RLS)
--   crew / recipient column    -> user_company_for_admin(<column>): the
--                                 person's company when the caller is in it
--   parent record              -> the parent's company (flight_bookings via
--                                 flight_requests; work-rest notes and
--                                 signatures via their submission's vessel)
--
-- Own-row branches (crew_id = auth.uid(), author_id = auth.uid(), …) stay
-- as they were. Global catalogs without a company (modules,
-- training_courses) and the company-less crew_import staging table are
-- written by the service role only; their read policies are unchanged.
--
-- A legacy user_roles row with no company counts only for a superadmin
-- (platform staff). Rows of other roles without a company are given their
-- user's profile company first, so a legitimate holder keeps their access
-- in their own company (legacy_user_admin and user_manages_admins_for
-- already treat them as own-company rows).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.user_is_active(uuid)') IS NULL OR to_regprocedure('public.user_company_for_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010500_platform_role_scoped_policies needs user_is_active() and user_company_for_admin(): apply 20261123000300 and 20261123000400 first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_select_admin') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010500_platform_role_scoped_policies needs the closed user_roles write path: apply 20261123010100_platform_access_rls.sql first';
  END IF;
  IF to_regclass('public.user_roles') IS NULL OR to_regclass('public.medical_reports') IS NULL OR to_regclass('public.flight_requests') IS NULL
     OR to_regclass('public.work_rest_monthly_submissions') IS NULL OR to_regclass('public.vessel_work_rest_settings') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123010500_platform_role_scoped_policies needs the live user_roles, medical_reports, flight_requests and work / rest tables';
  END IF;
END
$$;

-- ---------------------------------------------------------------- legacy rows without a company

-- One row per (user, role, vessel), so duplicates cannot collide on the
-- unique (user_id, role, company_id, vessel_id) key; a row that already
-- exists for the company is left as it is.
UPDATE public.user_roles AS ur
SET company_id = p.company_id
FROM public.profiles AS p,
     (SELECT DISTINCT ON (r.user_id, r.role, r.vessel_id) r.id
        FROM public.user_roles AS r
       WHERE r.company_id IS NULL AND r.role::text <> 'superadmin'
       ORDER BY r.user_id, r.role, r.vessel_id, r.id) AS pick
WHERE pick.id = ur.id
  AND p.user_id = ur.user_id
  AND p.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles AS o
    WHERE o.user_id = ur.user_id AND o.role = ur.role AND o.company_id = p.company_id
      AND o.vessel_id IS NOT DISTINCT FROM ur.vessel_id
  );

-- ---------------------------------------------------------------- has_role_in_company

-- Does the user hold one of the app roles in that company? An active,
-- unexpired user_roles row with one of the roles that names the company
-- (and the user's profile is in that company), or a superadmin row with no
-- company (platform staff); and the user is active. False for a NULL
-- company, and false when a signed-in caller asks about anyone but
-- themselves (no probing; policies pass auth.uid()).
CREATE OR REPLACE FUNCTION public.has_role_in_company(_user_id uuid, _roles public.app_role[], _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND _company_id IS NOT NULL
     AND _roles IS NOT NULL
     AND (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_roles AS ur
       WHERE ur.user_id = _user_id
         AND ur.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > now())
         AND ur.role = ANY (_roles)
         AND (
           (ur.company_id = _company_id
            AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = _company_id))
           OR (ur.company_id IS NULL AND ur.role = 'superadmin')
         )
     )
     AND public.user_is_active(_user_id)
$$;

-- The live single-role overload (20260127170354_8cbfc11b-…, used by no
-- policy or function today) is redefined once here on the same rule, so
-- the name means one thing: active users, the user's own company, the
-- platform superadmin, no probing of others.
CREATE OR REPLACE FUNCTION public.has_role_in_company(_user_id uuid, _role public.app_role, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_company(_user_id, ARRAY[_role]::public.app_role[], _company_id)
$$;

REVOKE ALL ON FUNCTION public.has_role_in_company(uuid, public.app_role[], uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_role_in_company(uuid, public.app_role, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role_in_company(uuid, public.app_role[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role_in_company(uuid, public.app_role, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_role_in_company(uuid, public.app_role, uuid) IS 'Live single-role overload: has_role_in_company(_user_id, ARRAY[_role], _company_id).';
COMMENT ON FUNCTION public.has_role_in_company(uuid, public.app_role[], uuid) IS 'RLS predicate (rule 11, CC-5): an active, unexpired user_roles row with one of the roles naming that company (the user''s own profile company), or a company-less superadmin row; active users only. False for a NULL company and for a signed-in caller asking about someone else. Replaces the unscoped has_role / has_any_role gates of the legacy policies.';

-- ---------------------------------------------------------------- crew_change_dates (vessel)

DROP POLICY IF EXISTS crew_change_dates_insert ON public.crew_change_dates;
CREATE POLICY crew_change_dates_insert ON public.crew_change_dates
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master', 'captain']::public.app_role[],
          (SELECT v.company_id FROM public.vessels AS v WHERE v.id = crew_change_dates.vessel_id))
  );

DROP POLICY IF EXISTS crew_change_dates_update ON public.crew_change_dates;
CREATE POLICY crew_change_dates_update ON public.crew_change_dates
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master', 'captain']::public.app_role[],
          (SELECT v.company_id FROM public.vessels AS v WHERE v.id = crew_change_dates.vessel_id))
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master', 'captain']::public.app_role[],
          (SELECT v.company_id FROM public.vessels AS v WHERE v.id = crew_change_dates.vessel_id))
  );

-- ---------------------------------------------------------------- crew_import (no company: service role writes)

DROP POLICY IF EXISTS crew_import_write_privileged ON public.crew_import;
CREATE POLICY crew_import_write_privileged ON public.crew_import
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS crew_import_update_privileged ON public.crew_import;
CREATE POLICY crew_import_update_privileged ON public.crew_import
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------- crew_tasks (company)

DROP POLICY IF EXISTS "Officers can create tasks" ON public.crew_tasks;
CREATE POLICY "Officers can create tasks" ON public.crew_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    AND public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'chief_officer', 'chief_engineer']::public.app_role[], company_id)
  );

-- ---------------------------------------------------------------- destinations (company)

DROP POLICY IF EXISTS destinations_update ON public.destinations;
CREATE POLICY destinations_update ON public.destinations
  FOR UPDATE TO authenticated
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::public.app_role[], company_id) OR created_by = auth.uid())
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::public.app_role[], company_id) OR created_by = auth.uid());

-- ---------------------------------------------------------------- fleet_groups (company)

DROP POLICY IF EXISTS "DPA and Superadmin can manage fleet groups" ON public.fleet_groups;
CREATE POLICY "DPA and Superadmin can manage fleet groups" ON public.fleet_groups
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa']::public.app_role[], company_id))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa']::public.app_role[], company_id));

-- ---------------------------------------------------------------- flight_requests (company) and flight_bookings (via the request)

DROP POLICY IF EXISTS "Authorized users can manage flight requests" ON public.flight_requests;
CREATE POLICY "Authorized users can manage flight requests" ON public.flight_requests
  FOR ALL
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[], company_id))
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[], company_id));

DROP POLICY IF EXISTS "Users can view own flight requests" ON public.flight_requests;
CREATE POLICY "Users can view own flight requests" ON public.flight_requests
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'travel_agent']::public.app_role[], company_id));

DROP POLICY IF EXISTS "Flight bookings viewable by request owner and staff" ON public.flight_bookings;
CREATE POLICY "Flight bookings viewable by request owner and staff" ON public.flight_bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.flight_requests AS fr
      WHERE fr.id = flight_bookings.flight_request_id
        AND (fr.crew_id = auth.uid()
             OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'travel_agent']::public.app_role[], fr.company_id))
    )
  );

DROP POLICY IF EXISTS "Travel agents and DPA can manage bookings" ON public.flight_bookings;
CREATE POLICY "Travel agents and DPA can manage bookings" ON public.flight_bookings
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'travel_agent']::public.app_role[],
           (SELECT fr.company_id FROM public.flight_requests AS fr WHERE fr.id = flight_bookings.flight_request_id)))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'travel_agent']::public.app_role[],
           (SELECT fr.company_id FROM public.flight_requests AS fr WHERE fr.id = flight_bookings.flight_request_id)));

-- ---------------------------------------------------------------- hours_of_rest_records (vessel, else crew)

DROP POLICY IF EXISTS "Users can manage own rest records" ON public.hours_of_rest_records;
CREATE POLICY "Users can manage own rest records" ON public.hours_of_rest_records
  FOR ALL
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = hours_of_rest_records.vessel_id), public.user_company_for_admin(hours_of_rest_records.crew_id))))
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = hours_of_rest_records.vessel_id), public.user_company_for_admin(hours_of_rest_records.crew_id))));

DROP POLICY IF EXISTS "Users can view own rest records" ON public.hours_of_rest_records;
CREATE POLICY "Users can view own rest records" ON public.hours_of_rest_records
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = hours_of_rest_records.vessel_id), public.user_company_for_admin(hours_of_rest_records.crew_id))));

-- ---------------------------------------------------------------- leave_requests (vessel, else crew)

DROP POLICY IF EXISTS "Authorized users can manage leave requests" ON public.leave_requests;
CREATE POLICY "Authorized users can manage leave requests" ON public.leave_requests
  FOR UPDATE
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = leave_requests.vessel_id), public.user_company_for_admin(leave_requests.crew_id))))
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = leave_requests.vessel_id), public.user_company_for_admin(leave_requests.crew_id))));

DROP POLICY IF EXISTS "Users can view own leave requests" ON public.leave_requests;
CREATE POLICY "Users can view own leave requests" ON public.leave_requests
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = leave_requests.vessel_id), public.user_company_for_admin(leave_requests.crew_id))));

-- ---------------------------------------------------------------- medical_reports (vessel, else crew)

DROP POLICY IF EXISTS "DPA and Captain can manage medical reports" ON public.medical_reports;
CREATE POLICY "DPA and Captain can manage medical reports" ON public.medical_reports
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = medical_reports.vessel_id), public.user_company_for_admin(medical_reports.crew_id))))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = medical_reports.vessel_id), public.user_company_for_admin(medical_reports.crew_id))));

DROP POLICY IF EXISTS "Medical reports visible to authorized users" ON public.medical_reports;
CREATE POLICY "Medical reports visible to authorized users" ON public.medical_reports
  FOR SELECT
  USING (
    public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
      coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = medical_reports.vessel_id), public.user_company_for_admin(medical_reports.crew_id)))
    OR crew_id = auth.uid()
  );

-- ---------------------------------------------------------------- modules (global catalog: service role writes)

DROP POLICY IF EXISTS "Only admins can modify modules" ON public.modules;
CREATE POLICY "Only admins can modify modules" ON public.modules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------- notification_logs (recipient's company)

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification_logs;
CREATE POLICY "Users can view own notifications" ON public.notification_logs
  FOR SELECT
  USING (recipient_user_id = auth.uid()
         OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa']::public.app_role[], public.user_company_for_admin(notification_logs.recipient_user_id)));

-- ---------------------------------------------------------------- planner_periods (vessel)

DROP POLICY IF EXISTS "DPA and Captain can manage planner periods" ON public.planner_periods;
CREATE POLICY "DPA and Captain can manage planner periods" ON public.planner_periods
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           (SELECT v.company_id FROM public.vessels AS v WHERE v.id = planner_periods.vessel_id)))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           (SELECT v.company_id FROM public.vessels AS v WHERE v.id = planner_periods.vessel_id)));

-- ---------------------------------------------------------------- support_tickets (company)

DROP POLICY IF EXISTS "Users can view their own support tickets" ON public.support_tickets;
CREATE POLICY "Users can view their own support tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['dpa', 'superadmin']::public.app_role[], company_id));

-- ---------------------------------------------------------------- training_courses (global catalog: service role writes)

DROP POLICY IF EXISTS "Admins can insert training courses" ON public.training_courses;
CREATE POLICY "Admins can insert training courses" ON public.training_courses
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update training courses" ON public.training_courses;
CREATE POLICY "Admins can update training courses" ON public.training_courses
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can delete training courses" ON public.training_courses;
CREATE POLICY "Admins can delete training courses" ON public.training_courses
  FOR DELETE TO service_role
  USING (true);

-- ---------------------------------------------------------------- trip_suggestions (company)

DROP POLICY IF EXISTS suggestions_delete ON public.trip_suggestions;
CREATE POLICY suggestions_delete ON public.trip_suggestions
  FOR DELETE TO authenticated
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::public.app_role[], company_id));

DROP POLICY IF EXISTS suggestions_update ON public.trip_suggestions;
CREATE POLICY suggestions_update ON public.trip_suggestions
  FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::public.app_role[], company_id))
  WITH CHECK (submitted_by = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::public.app_role[], company_id));

-- ---------------------------------------------------------------- work / rest (vessel, crew or the parent submission)

DROP POLICY IF EXISTS "Admins manage vessel work/rest settings" ON public.vessel_work_rest_settings;
CREATE POLICY "Admins manage vessel work/rest settings" ON public.vessel_work_rest_settings
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           (SELECT v.company_id FROM public.vessels AS v WHERE v.id = vessel_work_rest_settings.vessel_id)))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           (SELECT v.company_id FROM public.vessels AS v WHERE v.id = vessel_work_rest_settings.vessel_id)));

DROP POLICY IF EXISTS "Admins manage rule sets" ON public.work_rest_rule_sets;
CREATE POLICY "Admins manage rule sets" ON public.work_rest_rule_sets
  FOR ALL
  USING (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           coalesce(company_id, (SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_rule_sets.vessel_id))))
  WITH CHECK (public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain']::public.app_role[],
           coalesce(company_id, (SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_rule_sets.vessel_id))));

DROP POLICY IF EXISTS "Authorized update of submission" ON public.work_rest_monthly_submissions;
CREATE POLICY "Authorized update of submission" ON public.work_rest_monthly_submissions
  FOR UPDATE
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_monthly_submissions.vessel_id), public.user_company_for_admin(work_rest_monthly_submissions.crew_id))))
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_monthly_submissions.vessel_id), public.user_company_for_admin(work_rest_monthly_submissions.crew_id))));

DROP POLICY IF EXISTS "Crew create own submission" ON public.work_rest_monthly_submissions;
CREATE POLICY "Crew create own submission" ON public.work_rest_monthly_submissions
  FOR INSERT
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_monthly_submissions.vessel_id), public.user_company_for_admin(work_rest_monthly_submissions.crew_id))));

DROP POLICY IF EXISTS "Crew view own submission" ON public.work_rest_monthly_submissions;
CREATE POLICY "Crew view own submission" ON public.work_rest_monthly_submissions
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_monthly_submissions.vessel_id), public.user_company_for_admin(work_rest_monthly_submissions.crew_id))));

DROP POLICY IF EXISTS "Crew manage own records" ON public.work_rest_records;
CREATE POLICY "Crew manage own records" ON public.work_rest_records
  FOR ALL
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_records.vessel_id), public.user_company_for_admin(work_rest_records.crew_id))))
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_records.vessel_id), public.user_company_for_admin(work_rest_records.crew_id))));

DROP POLICY IF EXISTS "Crew view own records" ON public.work_rest_records;
CREATE POLICY "Crew view own records" ON public.work_rest_records
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.vessels AS v WHERE v.id = work_rest_records.vessel_id), public.user_company_for_admin(work_rest_records.crew_id))));

DROP POLICY IF EXISTS "Manage blocks via record" ON public.work_rest_blocks;
CREATE POLICY "Manage blocks via record" ON public.work_rest_blocks
  FOR ALL
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_blocks.crew_id)))
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'purser', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_blocks.crew_id)));

DROP POLICY IF EXISTS "View blocks via record visibility" ON public.work_rest_blocks;
CREATE POLICY "View blocks via record visibility" ON public.work_rest_blocks
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           public.user_company_for_admin(work_rest_blocks.crew_id)));

DROP POLICY IF EXISTS "System manages compliance checks" ON public.work_rest_compliance_checks;
CREATE POLICY "System manages compliance checks" ON public.work_rest_compliance_checks
  FOR ALL
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_compliance_checks.crew_id)))
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_compliance_checks.crew_id)));

DROP POLICY IF EXISTS "View own compliance checks" ON public.work_rest_compliance_checks;
CREATE POLICY "View own compliance checks" ON public.work_rest_compliance_checks
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           public.user_company_for_admin(work_rest_compliance_checks.crew_id)));

DROP POLICY IF EXISTS "Manage NCs" ON public.work_rest_non_conformities;
CREATE POLICY "Manage NCs" ON public.work_rest_non_conformities
  FOR ALL
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_non_conformities.crew_id)))
  WITH CHECK (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[], public.user_company_for_admin(work_rest_non_conformities.crew_id)));

DROP POLICY IF EXISTS "View own NCs" ON public.work_rest_non_conformities;
CREATE POLICY "View own NCs" ON public.work_rest_non_conformities
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
           public.user_company_for_admin(work_rest_non_conformities.crew_id)));

DROP POLICY IF EXISTS "View audit log" ON public.work_rest_audit_log;
CREATE POLICY "View audit log" ON public.work_rest_audit_log
  FOR SELECT
  USING (crew_id = auth.uid() OR public.has_role_in_company(auth.uid(),
           ARRAY['superadmin', 'dpa', 'captain', 'hod', 'auditor_flag', 'auditor_class']::public.app_role[],
           coalesce(public.user_company_for_admin(work_rest_audit_log.crew_id),
                    (SELECT v.company_id FROM public.work_rest_monthly_submissions AS s JOIN public.vessels AS v ON v.id = s.vessel_id
                      WHERE s.id = work_rest_audit_log.submission_id))));

DROP POLICY IF EXISTS "Manage own notes" ON public.work_rest_notes;
CREATE POLICY "Manage own notes" ON public.work_rest_notes
  FOR ALL
  USING (author_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.work_rest_monthly_submissions AS s JOIN public.vessels AS v ON v.id = s.vessel_id WHERE s.id = work_rest_notes.submission_id),
                    (SELECT v.company_id FROM public.work_rest_records AS r JOIN public.vessels AS v ON v.id = r.vessel_id WHERE r.id = work_rest_notes.record_id))))
  WITH CHECK (author_id = auth.uid() OR public.has_role_in_company(auth.uid(), ARRAY['superadmin', 'dpa', 'captain', 'hod']::public.app_role[],
           coalesce((SELECT v.company_id FROM public.work_rest_monthly_submissions AS s JOIN public.vessels AS v ON v.id = s.vessel_id WHERE s.id = work_rest_notes.submission_id),
                    (SELECT v.company_id FROM public.work_rest_records AS r JOIN public.vessels AS v ON v.id = r.vessel_id WHERE r.id = work_rest_notes.record_id))));

DROP POLICY IF EXISTS "View notes" ON public.work_rest_notes;
CREATE POLICY "View notes" ON public.work_rest_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_rest_monthly_submissions AS s
      WHERE s.id = work_rest_notes.submission_id
        AND (s.crew_id = auth.uid()
             OR public.has_role_in_company(auth.uid(),
                  ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
                  (SELECT v.company_id FROM public.vessels AS v WHERE v.id = s.vessel_id)))
    )
  );

DROP POLICY IF EXISTS "View signatures" ON public.work_rest_signatures;
CREATE POLICY "View signatures" ON public.work_rest_signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.work_rest_monthly_submissions AS s
      WHERE s.id = work_rest_signatures.submission_id
        AND (s.crew_id = auth.uid()
             OR public.has_role_in_company(auth.uid(),
                  ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'purser', 'hod', 'chief_officer', 'chief_engineer', 'auditor_flag', 'auditor_class']::public.app_role[],
                  (SELECT v.company_id FROM public.vessels AS v WHERE v.id = s.vessel_id)))
    )
  );
