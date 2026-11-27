-- =================================================================
-- FLEET OPERATIONS X5-02A: the fleet dashboard's numbers
-- (gap/02 D1, D3, D4, D6, D7, W9; DECISIONS D-01, D-04, D-82, D-123;
-- X5 spec §2 X5-02A, D-X5-09, D-X5-21, D-X5-22)
-- Functions (browser): fleet_dashboard_kpis, fleet_dashboard_panels,
--   fleet_vessel_comparison
-- Functions (service role; the three above): fleet_dashboard_tile_can_for,
--   fleet_dashboard_scope_for, fleet_dashboard_job_state,
--   fleet_dashboard_drill_overdue, fleet_dashboard_open_corrective_actions,
--   fleet_dashboard_hor_crew_days, fleet_dashboard_counts_for
-- TS mirrors: src/modules/dashboard/lib/fleetKpiRules.ts (tile → module
--   key, tile → capability key, the W9 red rule; its test pins the nav
--   role lists between the markers below against AuthContext's
--   MODULE_ACCESS); src/modules/dashboard/types/db.pending.ts (the jsonb
--   shapes)
-- =================================================================
--
-- One server answer per dashboard part, so the browser never sums rows
-- (gap/02 data model "Fleet KPIs"; the old FleetDashboardView summed
-- get_vessel_dashboard_summary, whose certs_expiring_90d drops expired
-- certificates and whose status filters match no live value):
--
--   fleet_dashboard_kpis(p_vessel_ids, p_today)          the KPI row (W9)
--   fleet_dashboard_panels(p_vessel_ids, p_limit, p_today) the ranked lists
--   fleet_vessel_comparison(p_vessel_ids, p_today)        one row per vessel
--
-- Vessels (D-X5-09, D-X5-22): fleet_counted_vessels_for(); NULL ids are
-- every counted vessel the caller reaches, explicit ids are reach-checked
-- (42501 vessel_out_of_reach) and not counted-filtered. Fleet-level items
-- (corrective actions with no vessel, fleet insurance, company audits) are
-- counted only with NULL ids (the default "All vessels") and fleet reach:
-- an explicit vessel list shows those vessels and nothing else.
--
-- Gates, per vessel, computed once (fleet_dashboard_scope_for): the
-- dashboard itself (fleet_ops_can_for 'dashboard' view) AND the tile's own
-- data rule, the one the client adaptor uses for that data (D-04):
--
--   Document alerts   the expiry sources' read areas (fleet_expiry_rows_for)
--   Hours of rest     vessel.crew.hours_of_rest.view (has_capability_for, PP1)
--   Safety            corrective actions vessel.safety.capa.view and drills
--                     vessel.safety.drills.view, each for its own part
--   Technical         vessel.technical.tasks.view
--   Panels            plus insurance (fleet_ops_can 'insurance'), surveys
--                     (vessel.safety.audits_surveys.view, 'certificates'),
--                     HESS (vessel.safety.safety_meetings.view)
--
-- and the vessel module setting of the tile (vessel_module_on_internal):
-- hours of rest 'crew_hor', safety 'safety', technical 'technical'. A tile
-- with no vessel passing its rule is 'no_access'; with its module off on
-- every vessel that passes, 'module_off'; never zeros it did not count.
-- Inactive callers, callers with no company and anon get nothing (every
-- tile 'no_access'; no comparison row).
--
-- Definitions (W9; gap/02 D3, D4, D6, D7):
--   Document alerts  vessel-attributed expiry items of every item type but
--                    insurance_policy and contract, alerts on (muted items
--                    never count): each item counts once, in its most
--                    urgent part: expired (vessel certificates; crew
--                    qualifications = crew_qualification, training_course;
--                    crew documents = every other type), else endorsement
--                    overdue, else expiring (expiring_soon + expiring, the
--                    per-type windows of expiry_window_rules).
--   Hours of rest    breach crew-days of the last 30 days, the R9 report's
--                    (D-380): X1's live, not dismissed non-conformities of
--                    any rule (day breach_day, else the UTC day of the
--                    minute before window_end; vessel the NC's, else its
--                    submission's, else the assignment covering the day)
--                    when X1's breach review columns exist, else a failing
--                    work_rest_compliance_checks row (window_start, UTC);
--                    passing within 60 minutes of threshold_minutes
--                    on a crew-day with no breach (near threshold); current,
--                    not planned crew with a login who joined before today
--                    and have no work_rest_records in the last 7 days (no
--                    entries); vessels with Hours of Rest on (logging). A
--                    check's vessel is its submission's, else the crew
--                    member's assignment covering window_start.
--   Safety           open corrective actions (status not Closed; vessel
--                    through the incident, else the audit finding's audit),
--                    of which overdue (due before today); drills Scheduled,
--                    not carried out, scheduled before today.
--   Technical        jobs (maintenance_tasks through equipment.vessel_id):
--                    overdue = open (not completed, cancelled or closed),
--                    not pending approval, due before today (or status
--                    Overdue); pending approval = status Pending approval
--                    (gap/06 J3; no live job carries it yet, so 0 until the
--                    Technical status machine lands).
--   Leave            not enabled (gap/02 D5, OPEN D-X5-O1).
--   Finance          hidden (G1).
--
-- Nothing here is live (D-01): the client reads all three RPCs through the
-- pending shim and shows "Not set up yet" while they are missing. Applying
-- it changes nothing users see today: no live table, policy or function is
-- touched.
--
-- Idempotent (D-12, D-55).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_counted_vessels_for(uuid,uuid,uuid[])') IS NULL
     OR to_regprocedure('public.fleet_current_crew(uuid[])') IS NULL
     OR to_regprocedure('public.fleet_expiry_rows_for(uuid,uuid,uuid[],text[],boolean,date)') IS NULL
     OR to_regclass('public.expiry_sources') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040100_fleet_dashboard_kpis needs the fleet expiry engine: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.vessel_module_on_internal(uuid,text,date)') IS NULL
     OR to_regprocedure('public.user_has_permission(uuid,text,public.permission_level,uuid)') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040100_fleet_dashboard_kpis needs has_capability_for (20261123000400), vessel_module_on_internal (20261123000500) and the reach helpers (20261123000300, 20261123010000)';
  END IF;
  IF to_regclass('public.corrective_actions') IS NULL OR to_regclass('public.incidents') IS NULL
     OR to_regclass('public.audit_findings') IS NULL OR to_regclass('public.audits') IS NULL
     OR to_regclass('public.drills') IS NULL OR to_regclass('public.drill_types') IS NULL
     OR to_regclass('public.maintenance_tasks') IS NULL OR to_regclass('public.equipment') IS NULL
     OR to_regclass('public.work_rest_compliance_checks') IS NULL OR to_regclass('public.work_rest_monthly_submissions') IS NULL
     OR to_regclass('public.work_rest_records') IS NULL OR to_regclass('public.certificates') IS NULL
     OR to_regclass('public.crew_assignments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040100_fleet_dashboard_kpis needs the live safety, technical, hours of rest, certificate and crew tables';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tile gates (internal)

-- Whether _user_id may read one dashboard tile's data on a vessel (NULL:
-- fleet-level data). The same rule the client adaptor applies to the key
-- (D-04; src/lib/permissions/adaptor.ts):
--   hours_of_rest       vessel.crew.hours_of_rest.view: has_capability_for
--                       (PP1, parity-tested against the adaptor)
--   corrective_actions  vessel.safety.capa.view            rbac('capa', nav 'ism')
--   drills              vessel.safety.drills.view          rbac('drills', nav 'ism')
--   safety_meetings     vessel.safety.safety_meetings.view rbac('meetings', nav 'ism')
--   audits_surveys      vessel.safety.audits_surveys.view  rbac('audits_surveys', nav 'ism')
--   technical           vessel.technical.tasks.view        rbac('maintenance', nav 'maintenance')
-- An rbac rule at view: full access (legacy dpa / shore_management, RBAC
-- superadmin / dpa), else the RBAC module at any level on the vessel
-- (user_has_permission), else canAccessModule(nav): RBAC fleet_master, the
-- nav module's RBAC view, or a legacy role of MODULE_ACCESS[nav]. False for
-- an inactive user, another company, an unknown gate, a vessel outside the
-- company or out of reach, and fleet-level data without fleet reach
-- (D-X5-21). Every gate is view-level, so an external viewer (D-123) passes
-- like anyone else. Internal (service role; the definers below).
CREATE OR REPLACE FUNCTION public.fleet_dashboard_tile_can_for(_user_id uuid, _company_id uuid, _vessel_id uuid, _gate text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_role text;
  v_module text;
  v_nav text;
  v_nav_roles text[];
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL OR _gate IS NULL
     OR _gate NOT IN ('hours_of_rest', 'corrective_actions', 'drills', 'safety_meetings', 'audits_surveys', 'technical') THEN
    RETURN false;
  END IF;
  IF NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  SELECT p.company_id, p.role::text INTO v_company, v_role FROM public.profiles AS p WHERE p.user_id = _user_id;
  IF v_company IS DISTINCT FROM _company_id THEN
    RETURN false;
  END IF;
  IF _vessel_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = _vessel_id AND v.company_id = _company_id) THEN
      RETURN false;
    END IF;
    IF NOT (coalesce(public.reach_vessel_for(_user_id, _vessel_id), false) OR coalesce(public.fleet_reach_for(_user_id, _company_id), false)) THEN
      RETURN false;
    END IF;
  ELSIF NOT coalesce(public.fleet_reach_for(_user_id, _company_id), false) THEN
    RETURN false;
  END IF;

  IF _gate = 'hours_of_rest' THEN
    RETURN coalesce(public.has_capability_for(_user_id, 'vessel.crew.hours_of_rest.view', _company_id, _vessel_id), false);
  END IF;

  -- Full access (the adaptor's hasFullAccess).
  IF v_role IN ('dpa', 'shore_management') OR EXISTS (
       SELECT 1 FROM public.rbac_user_roles AS r JOIN public.roles AS ro ON ro.id = r.role_id
       WHERE r.user_id = _user_id AND r.is_active = true AND (r.valid_until IS NULL OR r.valid_until > now())
         AND lower(ro.name) IN ('superadmin', 'dpa')) THEN
    RETURN true;
  END IF;

  v_module := CASE _gate
    WHEN 'corrective_actions' THEN 'capa'
    WHEN 'drills' THEN 'drills'
    WHEN 'safety_meetings' THEN 'meetings'
    WHEN 'audits_surveys' THEN 'audits_surveys'
    ELSE 'maintenance'
  END;
  v_nav := CASE WHEN _gate = 'technical' THEN 'maintenance' ELSE 'ism' END;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['view', 'edit', 'admin']) AS l(level)
             WHERE coalesce(public.user_has_permission(_user_id, v_module, l.level::public.permission_level, _vessel_id), false)) THEN
    RETURN true;
  END IF;

  -- canAccessModule(nav) at view: RBAC fleet_master, the nav module's RBAC view (its RBAC key is the nav id), a legacy role of MODULE_ACCESS.
  IF EXISTS (
       SELECT 1 FROM public.rbac_user_roles AS r JOIN public.roles AS ro ON ro.id = r.role_id
       WHERE r.user_id = _user_id AND r.is_active = true AND (r.valid_until IS NULL OR r.valid_until > now())
         AND lower(ro.name) = 'fleet_master') THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['view', 'edit', 'admin']) AS l(level)
             WHERE coalesce(public.user_has_permission(_user_id, v_nav, l.level::public.permission_level, _vessel_id), false)) THEN
    RETURN true;
  END IF;
  -- dashboard-tile-nav-rules:start (MODULE_ACCESS in src/modules/auth/contexts/AuthContext.tsx; pinned by src/test/dashboard/fleetKpiRules.test.ts)
  v_nav_roles := CASE v_nav
    WHEN 'ism' THEN ARRAY['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer']
    WHEN 'maintenance' THEN ARRAY['dpa', 'shore_management', 'master', 'chief_engineer']
  END;
  -- dashboard-tile-nav-rules:end
  RETURN coalesce(v_role = ANY (v_nav_roles), false);
END;
$$;

-- ---------------------------------------------------------------- scope (internal)

-- The vessels a dashboard read covers, and which of them each part may
-- count, as one row of arrays (never NULL; '{}' when none), so every part
-- uses one gate computation:
--   vessel_ids          fleet_counted_vessels_for() ∩ the dashboard gate
--   documents           ∩ any read area of the active expiry sources that
--                       are not insurance or contracts
--   insurance           ∩ fleet_ops_can 'insurance'
--   certificates        ∩ fleet_ops_can 'certificates' (survey dates)
--   hours_of_rest       ∩ the HoR gate; hours_of_rest_on: and crew_hor on
--   corrective_actions, drills, safety_meetings, audits_surveys: ∩ their gates
--   safety_on           dashboard vessels with the safety module on
--   technical           ∩ the jobs gate; technical_on: and technical on
--   fleet_level         NULL ids, fleet reach and the dashboard at fleet
--                       level; then fleet_insurance, fleet_corrective_actions
--                       and fleet_audits_surveys for the fleet-level items
-- Explicit ids out of reach raise 42501 vessel_out_of_reach (through
-- fleet_counted_vessels_for). An inactive user or another company: every
-- array empty, every flag false. Internal (service role; the definers below).
CREATE OR REPLACE FUNCTION public.fleet_dashboard_scope_for(_user_id uuid, _company_id uuid, _vessel_ids uuid[], _today date)
RETURNS TABLE (
  vessel_ids uuid[], documents uuid[], insurance uuid[], certificates uuid[], hours_of_rest uuid[], hours_of_rest_on uuid[],
  corrective_actions uuid[], drills uuid[], safety_meetings uuid[], audits_surveys uuid[], safety_on uuid[],
  technical uuid[], technical_on uuid[],
  fleet_level boolean, fleet_insurance boolean, fleet_corrective_actions boolean, fleet_audits_surveys boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_today date := coalesce(_today, current_date);
  v_none uuid[] := ARRAY[]::uuid[];
  v_doc_areas text[];
  v_fleet boolean;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL
     OR NOT coalesce(public.user_is_active(_user_id), false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = _company_id) THEN
    RETURN QUERY SELECT v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none,
                        false, false, false, false;
    RETURN;
  END IF;

  v_doc_areas := ARRAY(SELECT DISTINCT es.read_area FROM public.expiry_sources AS es
                       WHERE es.is_active AND es.item_type NOT IN ('insurance_policy', 'contract') ORDER BY 1);
  v_fleet := _vessel_ids IS NULL
             AND coalesce(public.fleet_ops_can_for(_user_id, _company_id, NULL, 'dashboard', 'view'), false);

  RETURN QUERY
    WITH vs AS (
      SELECT x AS id FROM public.fleet_counted_vessels_for(_user_id, _company_id, _vessel_ids) AS x
    ),
    dash AS (
      SELECT vs.id FROM vs WHERE coalesce(public.fleet_ops_can_for(_user_id, _company_id, vs.id, 'dashboard', 'view'), false)
    ),
    g AS (
      SELECT d.id,
             EXISTS (SELECT 1 FROM unnest(v_doc_areas) AS a(area)
                     WHERE coalesce(public.fleet_ops_can_for(_user_id, _company_id, d.id, a.area, 'view'), false)) AS doc,
             coalesce(public.fleet_ops_can_for(_user_id, _company_id, d.id, 'insurance', 'view'), false) AS ins,
             coalesce(public.fleet_ops_can_for(_user_id, _company_id, d.id, 'certificates', 'view'), false) AS cert,
             public.fleet_dashboard_tile_can_for(_user_id, _company_id, d.id, 'hours_of_rest') AS hor,
             coalesce(public.vessel_module_on_internal(d.id, 'crew_hor', v_today), false) AS hor_on,
             public.fleet_dashboard_tile_can_for(_user_id, _company_id, d.id, 'corrective_actions') AS ca,
             public.fleet_dashboard_tile_can_for(_user_id, _company_id, d.id, 'drills') AS drl,
             public.fleet_dashboard_tile_can_for(_user_id, _company_id, d.id, 'safety_meetings') AS hess,
             public.fleet_dashboard_tile_can_for(_user_id, _company_id, d.id, 'audits_surveys') AS aud,
             coalesce(public.vessel_module_on_internal(d.id, 'safety', v_today), false) AS safety_on,
             public.fleet_dashboard_tile_can_for(_user_id, _company_id, d.id, 'technical') AS tech,
             coalesce(public.vessel_module_on_internal(d.id, 'technical', v_today), false) AS tech_on
      FROM dash AS d
    )
    SELECT coalesce(array_agg(g.id ORDER BY g.id), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.doc), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.ins), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.cert), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.hor), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.hor AND g.hor_on), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.ca), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.drl), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.hess), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.aud), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.safety_on), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.tech), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.tech AND g.tech_on), v_none),
           v_fleet,
           v_fleet AND coalesce(public.fleet_ops_can_for(_user_id, _company_id, NULL, 'insurance', 'view'), false),
           v_fleet AND public.fleet_dashboard_tile_can_for(_user_id, _company_id, NULL, 'corrective_actions'),
           v_fleet AND public.fleet_dashboard_tile_can_for(_user_id, _company_id, NULL, 'audits_surveys')
    FROM g;
END;
$$;

-- ---------------------------------------------------------------- shared definitions (internal)

-- A job's dashboard state from its live status and due date: 'closed'
-- (completed, cancelled, closed), 'pending_approval' (Pending approval /
-- Awaiting approval, gap/06 J3), 'overdue' (open and due before _today, or
-- status Overdue), else 'open'. Status words compare case-insensitively
-- with spaces and dashes as underscores (the live values are Pending,
-- Scheduled, In_Progress, Completed, Overdue, Cancelled). Pure.
CREATE OR REPLACE FUNCTION public.fleet_dashboard_job_state(_status text, _due_date date, _today date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.st IN ('completed', 'cancelled', 'canceled', 'closed') THEN 'closed'
    WHEN s.st IN ('pending_approval', 'awaiting_approval') THEN 'pending_approval'
    WHEN s.st = 'overdue' OR (_due_date IS NOT NULL AND _today IS NOT NULL AND _due_date < _today) THEN 'overdue'
    ELSE 'open'
  END
  FROM (SELECT lower(regexp_replace(btrim(coalesce(_status, '')), '[[:space:]-]+', '_', 'g')) AS st) AS s
$$;

-- Whether a drill is overdue on _today: Scheduled (or the legacy
-- 'overdue'), not carried out (no actual date) and scheduled before _today.
-- Pure.
CREATE OR REPLACE FUNCTION public.fleet_dashboard_drill_overdue(_status text, _actual timestamptz, _scheduled date, _today date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(lower(btrim(_status)) IN ('scheduled', 'overdue') AND _actual IS NULL AND _scheduled < _today, false)
$$;

-- The company's open corrective actions (status not Closed; a NULL status
-- counts as open) with their vessel: the incident's, else the audit
-- finding's audit's (NULL for a company audit or an action with neither:
-- a fleet-level action). An action whose incident or audit belongs to
-- another company is left out. Internal (service role; the definers below).
CREATE OR REPLACE FUNCTION public.fleet_dashboard_open_corrective_actions(_company_id uuid)
RETURNS TABLE (id uuid, vessel_id uuid, action_number text, description text, action_type text, status text, due_date date, source text, source_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.id,
         CASE WHEN ca.incident_id IS NOT NULL THEN i.vessel_id WHEN ca.finding_id IS NOT NULL THEN au.vessel_id END,
         ca.action_number,
         left(ca.description, 240),
         ca.action_type,
         coalesce(ca.status, 'Open'),
         ca.due_date,
         CASE WHEN ca.incident_id IS NOT NULL THEN 'incident' WHEN ca.finding_id IS NOT NULL THEN 'audit_finding' ELSE 'none' END,
         coalesce(ca.incident_id, ca.finding_id)
  FROM public.corrective_actions AS ca
  LEFT JOIN public.incidents AS i ON i.id = ca.incident_id AND i.company_id = ca.company_id
  LEFT JOIN public.audit_findings AS af ON af.id = ca.finding_id
  LEFT JOIN public.audits AS au ON au.id = af.audit_id AND au.company_id = ca.company_id
  WHERE _company_id IS NOT NULL
    AND ca.company_id = _company_id
    AND lower(btrim(coalesce(ca.status, 'Open'))) <> 'closed'
    AND (ca.incident_id IS NULL OR i.id IS NOT NULL)
    AND (ca.incident_id IS NOT NULL OR ca.finding_id IS NULL OR au.id IS NOT NULL)
$$;

-- Hours of rest per crew-day of the company's crew from _from to _to
-- (D-380: the same breach crew-days as the R9 report,
-- fleet_report_hours_of_rest). breach: when X1's breach review columns
-- exist on work_rest_non_conformities (review_outcome, is_serious,
-- superseded_at, vessel_id, breach_day; information_schema, read through
-- EXECUTE because a function body may not name columns that are not there
-- yet), a live (not superseded), not dismissed non-conformity of any rule
-- that day, the day being breach_day, else the UTC day of the minute
-- before window_end (R9's key), the vessel the NC's own vessel, else its
-- submission's, else the vessel of the crew member's assignment covering
-- that day (the latest join first); otherwise the legacy rule: a failing
-- work_rest_compliance_checks row that day (window_start in UTC). near: a
-- passing check within 60 minutes of its threshold that day (vessel: the
-- check's submission's, else the assignment covering that day); a crew-day
-- with a breach is never near. Breach and near days are joined by vessel,
-- crew and day. Rows on vessels outside _vessel_ids are left out.
-- Internal (service role; fleet_dashboard_counts_for).
CREATE OR REPLACE FUNCTION public.fleet_dashboard_hor_crew_days(_company_id uuid, _vessel_ids uuid[], _from date, _to date)
RETURNS TABLE (vessel_id uuid, crew_id uuid, on_day date, breach boolean, near boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_review boolean;
BEGIN
  IF _company_id IS NULL OR cardinality(coalesce(_vessel_ids, ARRAY[]::uuid[])) = 0 OR _from IS NULL OR _to IS NULL THEN
    RETURN;
  END IF;
  v_review := (SELECT count(*) FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'work_rest_non_conformities'
                 AND column_name IN ('review_outcome', 'is_serious', 'superseded_at', 'vessel_id', 'breach_day')) = 5;

  IF v_review THEN
    RETURN QUERY EXECUTE $x$
      WITH nc AS (
        SELECT n.crew_id,
               coalesce(n.breach_day, ((n.window_end - interval '1 minute') AT TIME ZONE 'UTC')::date) AS on_day,
               n.vessel_id AS nc_vessel, sub.vessel_id AS sub_vessel
        FROM public.work_rest_non_conformities AS n
        JOIN public.profiles AS p ON p.user_id = n.crew_id AND p.company_id = $1
        LEFT JOIN public.work_rest_monthly_submissions AS sub ON sub.id = n.submission_id
        WHERE n.superseded_at IS NULL
          AND n.status IS DISTINCT FROM 'dismissed'
          AND n.review_outcome IS DISTINCT FROM 'dismissed'
          AND coalesce(n.breach_day, ((n.window_end - interval '1 minute') AT TIME ZONE 'UTC')::date) BETWEEN $3 AND $4
      ),
      br AS (
        SELECT DISTINCT x.vessel_id, x.crew_id, x.on_day
        FROM (
          SELECT k.crew_id, k.on_day,
                 coalesce(k.nc_vessel, k.sub_vessel, (
                   SELECT ca.vessel_id FROM public.crew_assignments AS ca
                   WHERE ca.user_id = k.crew_id
                     AND (coalesce(ca.join_date, ca.start_date) IS NULL OR coalesce(ca.join_date, ca.start_date) <= k.on_day)
                     AND (coalesce(ca.leave_date, ca.end_date) IS NULL OR coalesce(ca.leave_date, ca.end_date) >= k.on_day)
                   ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
                   LIMIT 1)) AS vessel_id
          FROM nc AS k
        ) AS x
        WHERE x.vessel_id = ANY ($2)
      ),
      chk AS (
        SELECT c.crew_id,
               (c.window_start AT TIME ZONE 'UTC')::date AS on_day,
               coalesce(sub.vessel_id, (
                 SELECT ca.vessel_id FROM public.crew_assignments AS ca
                 WHERE ca.user_id = c.crew_id
                   AND (coalesce(ca.join_date, ca.start_date) IS NULL OR coalesce(ca.join_date, ca.start_date) <= (c.window_start AT TIME ZONE 'UTC')::date)
                   AND (coalesce(ca.leave_date, ca.end_date) IS NULL OR coalesce(ca.leave_date, ca.end_date) >= (c.window_start AT TIME ZONE 'UTC')::date)
                 ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
                 LIMIT 1)) AS vessel_id
        FROM public.work_rest_compliance_checks AS c
        JOIN public.profiles AS p ON p.user_id = c.crew_id AND p.company_id = $1
        LEFT JOIN public.work_rest_monthly_submissions AS sub ON sub.id = c.submission_id
        WHERE c.passes AND c.threshold_minutes IS NOT NULL AND c.rest_minutes >= c.threshold_minutes
          AND c.rest_minutes - c.threshold_minutes <= 60
          AND c.window_start >= ($3::timestamp AT TIME ZONE 'UTC')
          AND c.window_start < (($4 + 1)::timestamp AT TIME ZONE 'UTC')
      ),
      nr AS (
        SELECT DISTINCT k.vessel_id, k.crew_id, k.on_day FROM chk AS k WHERE k.vessel_id = ANY ($2)
      )
      SELECT coalesce(b.vessel_id, n.vessel_id), coalesce(b.crew_id, n.crew_id), coalesce(b.on_day, n.on_day),
             b.crew_id IS NOT NULL, n.crew_id IS NOT NULL
      FROM br AS b
      FULL JOIN nr AS n ON n.vessel_id = b.vessel_id AND n.crew_id = b.crew_id AND n.on_day = b.on_day
    $x$ USING _company_id, _vessel_ids, _from, _to;
    RETURN;
  END IF;

  -- The legacy rule: a failing check is a breach crew-day.
  RETURN QUERY
    WITH chk AS (
      SELECT c.crew_id,
             (c.window_start AT TIME ZONE 'UTC')::date AS on_day,
             c.passes,
             c.rest_minutes,
             c.threshold_minutes,
             coalesce(sub.vessel_id, (
               SELECT ca.vessel_id FROM public.crew_assignments AS ca
               WHERE ca.user_id = c.crew_id
                 AND (coalesce(ca.join_date, ca.start_date) IS NULL OR coalesce(ca.join_date, ca.start_date) <= (c.window_start AT TIME ZONE 'UTC')::date)
                 AND (coalesce(ca.leave_date, ca.end_date) IS NULL OR coalesce(ca.leave_date, ca.end_date) >= (c.window_start AT TIME ZONE 'UTC')::date)
               ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
               LIMIT 1)) AS vessel_id
      FROM public.work_rest_compliance_checks AS c
      JOIN public.profiles AS p ON p.user_id = c.crew_id AND p.company_id = _company_id
      LEFT JOIN public.work_rest_monthly_submissions AS sub ON sub.id = c.submission_id
      WHERE c.window_start >= (_from::timestamp AT TIME ZONE 'UTC')
        AND c.window_start < ((_to + 1)::timestamp AT TIME ZONE 'UTC')
    )
    SELECT k.vessel_id, k.crew_id, k.on_day,
           bool_or(NOT k.passes),
           bool_or(k.passes AND k.threshold_minutes IS NOT NULL AND k.rest_minutes >= k.threshold_minutes
                   AND k.rest_minutes - k.threshold_minutes <= 60)
    FROM chk AS k
    WHERE k.vessel_id = ANY (_vessel_ids)
    GROUP BY k.vessel_id, k.crew_id, k.on_day;
END;
$$;

-- ---------------------------------------------------------------- counts (internal)

-- The dashboard counts per vessel of fleet_dashboard_scope_for(), plus one
-- row with vessel_id NULL for the fleet-level items when the scope has
-- them. A count is NULL where the part is not covered for that row (no
-- access, or its module off); *_covered / *_on say which. Insurance:
-- expired, and expiring within 90 days. expiring is split by source
-- (C-1, D-381): expiring_vessel_certificates (item type
-- vessel_certificate) + expiring_crew_items (every other type the tile
-- counts) = expiring. Internal (service role; the definers below).
-- The return type grew (C-1): drop before recreating (the definers below
-- are recreated after it).
DROP FUNCTION IF EXISTS public.fleet_dashboard_counts_for(uuid, uuid, uuid[], date);
CREATE OR REPLACE FUNCTION public.fleet_dashboard_counts_for(_user_id uuid, _company_id uuid, _vessel_ids uuid[], _today date)
RETURNS TABLE (
  vessel_id uuid,
  documents_covered boolean, expired_vessel_certificates integer, expired_crew_documents integer,
  expired_crew_qualifications integer, endorsements_overdue integer, expiring integer,
  insurance_covered boolean, insurance_expired integer, insurance_expiring integer,
  hours_of_rest_covered boolean, hours_of_rest_on boolean, breach_days integer, near_threshold integer, crew_without_entries integer,
  corrective_actions_covered boolean, drills_covered boolean, safety_on boolean,
  open_corrective_actions integer, overdue_corrective_actions integer, overdue_drills integer,
  technical_covered boolean, technical_on boolean, open_jobs integer, overdue_jobs integer, pending_approval integer,
  expiring_vessel_certificates integer, expiring_crew_items integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_today date := coalesce(_today, current_date);
  sc record;
  v_expiry uuid[];
BEGIN
  SELECT * INTO sc FROM public.fleet_dashboard_scope_for(_user_id, _company_id, _vessel_ids, v_today);
  IF cardinality(sc.vessel_ids) = 0 AND NOT sc.fleet_level THEN
    RETURN;
  END IF;
  v_expiry := ARRAY(SELECT DISTINCT x FROM unnest(sc.documents || sc.insurance) AS x);

  RETURN QUERY
    WITH v AS (
      SELECT x AS id FROM unnest(sc.vessel_ids) AS x
      UNION ALL
      SELECT NULL::uuid WHERE sc.fleet_level
    ),
    exp AS (
      SELECT r.vessel_id AS vid, r.item_type, r.bucket, r.endorsement_state, r.expires_on
      FROM public.fleet_expiry_rows_for(_user_id, _company_id, v_expiry, NULL, sc.fleet_insurance, v_today) AS r
      WHERE NOT r.alerts_muted
    ),
    doc AS (
      SELECT e.vid,
             count(*) FILTER (WHERE e.bucket = 'expired' AND e.item_type = 'vessel_certificate') AS exp_vessel,
             count(*) FILTER (WHERE e.bucket = 'expired' AND e.item_type NOT IN ('vessel_certificate', 'crew_qualification', 'training_course')) AS exp_crew_doc,
             count(*) FILTER (WHERE e.bucket = 'expired' AND e.item_type IN ('crew_qualification', 'training_course')) AS exp_qual,
             count(*) FILTER (WHERE e.bucket <> 'expired' AND e.endorsement_state = 'overdue') AS endorse,
             count(*) FILTER (WHERE e.bucket IN ('expiring_soon', 'expiring') AND e.endorsement_state IS DISTINCT FROM 'overdue') AS expiring_n,
             count(*) FILTER (WHERE e.bucket IN ('expiring_soon', 'expiring') AND e.endorsement_state IS DISTINCT FROM 'overdue'
                              AND e.item_type = 'vessel_certificate') AS expiring_vessel_n,
             count(*) FILTER (WHERE e.bucket IN ('expiring_soon', 'expiring') AND e.endorsement_state IS DISTINCT FROM 'overdue'
                              AND e.item_type <> 'vessel_certificate') AS expiring_crew_n
      FROM exp AS e
      WHERE e.vid = ANY (sc.documents) AND e.item_type NOT IN ('insurance_policy', 'contract')
      GROUP BY e.vid
    ),
    ins AS (
      SELECT e.vid,
             count(*) FILTER (WHERE e.bucket = 'expired') AS expired_n,
             count(*) FILTER (WHERE e.bucket <> 'expired' AND e.expires_on <= v_today + 90) AS expiring_n
      FROM exp AS e
      WHERE e.item_type = 'insurance_policy'
        AND (e.vid = ANY (sc.insurance) OR (e.vid IS NULL AND sc.fleet_insurance))
      GROUP BY e.vid
    ),
    hor AS (
      SELECT h.vessel_id AS vid,
             count(*) FILTER (WHERE h.breach) AS breach_n,
             count(*) FILTER (WHERE h.near AND NOT h.breach) AS near_n
      FROM public.fleet_dashboard_hor_crew_days(_company_id, sc.hours_of_rest_on, v_today - 29, v_today) AS h
      GROUP BY h.vessel_id
    ),
    quiet AS (
      SELECT cc.vessel_id AS vid, count(DISTINCT cc.user_id) AS n
      FROM public.fleet_current_crew(sc.hours_of_rest_on) AS cc
      WHERE NOT cc.is_planned AND NOT cc.pending_login AND cc.user_id IS NOT NULL
        AND (cc.join_date IS NULL OR cc.join_date < v_today)
        AND NOT EXISTS (SELECT 1 FROM public.work_rest_records AS r
                        WHERE r.crew_id = cc.user_id AND r.record_date BETWEEN v_today - 6 AND v_today)
      GROUP BY cc.vessel_id
    ),
    cas AS (
      SELECT a.vessel_id AS vid,
             count(*) AS open_n,
             count(*) FILTER (WHERE a.due_date < v_today) AS overdue_n
      FROM public.fleet_dashboard_open_corrective_actions(_company_id) AS a
      WHERE (a.vessel_id = ANY (sc.corrective_actions) AND a.vessel_id = ANY (sc.safety_on))
         OR (a.vessel_id IS NULL AND sc.fleet_corrective_actions)
      GROUP BY a.vessel_id
    ),
    drl AS (
      SELECT d.vessel_id AS vid, count(*) AS n
      FROM public.drills AS d
      WHERE d.vessel_id = ANY (sc.drills) AND d.vessel_id = ANY (sc.safety_on)
        AND public.fleet_dashboard_drill_overdue(d.status, d.drill_date_actual, d.drill_date_scheduled, v_today)
      GROUP BY d.vessel_id
    ),
    jobs AS (
      SELECT e.vessel_id AS vid,
             count(*) FILTER (WHERE j.st <> 'closed') AS open_n,
             count(*) FILTER (WHERE j.st = 'overdue') AS overdue_n,
             count(*) FILTER (WHERE j.st = 'pending_approval') AS pending_n
      FROM public.maintenance_tasks AS mt
      JOIN public.equipment AS e ON e.id = mt.equipment_id
      CROSS JOIN LATERAL (SELECT public.fleet_dashboard_job_state(mt.status, mt.due_date, v_today) AS st) AS j
      WHERE e.vessel_id = ANY (sc.technical_on)
      GROUP BY e.vessel_id
    ),
    flags AS (
      SELECT v.id,
             coalesce(v.id = ANY (sc.documents), false) AS doc_c,
             CASE WHEN v.id IS NULL THEN sc.fleet_insurance ELSE coalesce(v.id = ANY (sc.insurance), false) END AS ins_c,
             coalesce(v.id = ANY (sc.hours_of_rest), false) AS hor_c,
             coalesce(v.id = ANY (sc.hours_of_rest_on), false) AS hor_on,
             CASE WHEN v.id IS NULL THEN sc.fleet_corrective_actions ELSE coalesce(v.id = ANY (sc.corrective_actions), false) END AS ca_c,
             coalesce(v.id = ANY (sc.drills), false) AS drl_c,
             CASE WHEN v.id IS NULL THEN true ELSE coalesce(v.id = ANY (sc.safety_on), false) END AS safety_on,
             coalesce(v.id = ANY (sc.technical), false) AS tech_c,
             coalesce(v.id = ANY (sc.technical_on), false) AS tech_on
      FROM v
    )
    SELECT f.id,
           f.doc_c,
           CASE WHEN f.doc_c THEN coalesce(doc.exp_vessel, 0)::integer END,
           CASE WHEN f.doc_c THEN coalesce(doc.exp_crew_doc, 0)::integer END,
           CASE WHEN f.doc_c THEN coalesce(doc.exp_qual, 0)::integer END,
           CASE WHEN f.doc_c THEN coalesce(doc.endorse, 0)::integer END,
           CASE WHEN f.doc_c THEN coalesce(doc.expiring_n, 0)::integer END,
           f.ins_c,
           CASE WHEN f.ins_c THEN coalesce(ins.expired_n, 0)::integer END,
           CASE WHEN f.ins_c THEN coalesce(ins.expiring_n, 0)::integer END,
           f.hor_c,
           f.hor_on,
           CASE WHEN f.hor_on THEN coalesce(hor.breach_n, 0)::integer END,
           CASE WHEN f.hor_on THEN coalesce(hor.near_n, 0)::integer END,
           CASE WHEN f.hor_on THEN coalesce(quiet.n, 0)::integer END,
           f.ca_c,
           f.drl_c,
           f.safety_on,
           CASE WHEN f.ca_c AND f.safety_on THEN coalesce(cas.open_n, 0)::integer END,
           CASE WHEN f.ca_c AND f.safety_on THEN coalesce(cas.overdue_n, 0)::integer END,
           CASE WHEN f.drl_c AND f.safety_on THEN coalesce(drl.n, 0)::integer END,
           f.tech_c,
           f.tech_on,
           CASE WHEN f.tech_on THEN coalesce(jobs.open_n, 0)::integer END,
           CASE WHEN f.tech_on THEN coalesce(jobs.overdue_n, 0)::integer END,
           CASE WHEN f.tech_on THEN coalesce(jobs.pending_n, 0)::integer END,
           CASE WHEN f.doc_c THEN coalesce(doc.expiring_vessel_n, 0)::integer END,
           CASE WHEN f.doc_c THEN coalesce(doc.expiring_crew_n, 0)::integer END
    FROM flags AS f
    LEFT JOIN doc ON doc.vid = f.id
    LEFT JOIN ins ON ins.vid IS NOT DISTINCT FROM f.id
    LEFT JOIN hor ON hor.vid = f.id
    LEFT JOIN quiet ON quiet.vid = f.id
    LEFT JOIN cas ON cas.vid IS NOT DISTINCT FROM f.id
    LEFT JOIN drl ON drl.vid = f.id
    LEFT JOIN jobs ON jobs.vid = f.id;
END;
$$;

-- ---------------------------------------------------------------- browser RPCs

-- The fleet dashboard's KPI row (gap/02 W9; D3, D4, D6, D7) for the
-- caller's counted vessels (NULL) or the explicit, reach-checked ids (42501
-- vessel_out_of_reach). One jsonb:
--   { vessels, tiles: {
--       documents     { state ok | no_access, value, vessels,
--                       parts { expired_vessel_certificates, expired_crew_documents,
--                               expired_crew_qualifications, endorsements_overdue, expiring,
--                               expiring_vessel_certificates, expiring_crew_items } },
--                       (the last two split expiring by source and sum to it; C-1, D-381)
--       hours_of_rest { state ok | no_access | module_off, value (= breach_days), breach_days,
--                       near_threshold, crew_without_entries, vessels_logging, vessels_off },
--       safety        { state ok | no_access | module_off, value (= open + overdue drills), vessels,
--                       open_corrective_actions, overdue_corrective_actions, overdue_drills },
--       technical     { state ok | no_access | module_off, value (= overdue + pending approval), vessels,
--                       overdue_jobs, pending_approval, open_jobs },
--       leave         { state not_enabled },
--       finance       { state hidden } } }
-- A part the caller cannot count (no access to it on any vessel shown) is
-- null, never 0. An inactive caller, no company or no JWT: every tile
-- no_access, vessels 0.
CREATE OR REPLACE FUNCTION public.fleet_dashboard_kpis(p_vessel_ids uuid[] DEFAULT NULL, p_today date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_today date := coalesce(p_today, current_date);
  a record;
  v_no jsonb := jsonb_build_object('state', 'no_access');
  v_documents jsonb;
  v_hor jsonb;
  v_safety jsonb;
  v_technical jsonb;
BEGIN
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('vessels', 0, 'today', v_today, 'tiles', jsonb_build_object(
      'documents', v_no, 'hours_of_rest', v_no, 'safety', v_no, 'technical', v_no,
      'leave', jsonb_build_object('state', 'not_enabled'), 'finance', jsonb_build_object('state', 'hidden')));
  END IF;

  SELECT count(*) FILTER (WHERE c.vessel_id IS NOT NULL) AS vessels,
         count(*) FILTER (WHERE c.documents_covered) AS doc_n,
         sum(c.expired_vessel_certificates) AS exp_vessel,
         sum(c.expired_crew_documents) AS exp_crew_doc,
         sum(c.expired_crew_qualifications) AS exp_qual,
         sum(c.endorsements_overdue) AS endorse,
         sum(c.expiring) AS expiring_n,
         sum(c.expiring_vessel_certificates) AS expiring_vessel_n,
         sum(c.expiring_crew_items) AS expiring_crew_n,
         count(*) FILTER (WHERE c.hours_of_rest_covered) AS hor_access_n,
         count(*) FILTER (WHERE c.hours_of_rest_on) AS hor_on_n,
         sum(c.breach_days) AS breach_n,
         sum(c.near_threshold) AS near_n,
         sum(c.crew_without_entries) AS quiet_n,
         count(*) FILTER (WHERE c.corrective_actions_covered OR c.drills_covered) AS safety_access_n,
         count(*) FILTER (WHERE (c.corrective_actions_covered OR c.drills_covered) AND c.safety_on) AS safety_on_n,
         count(*) FILTER (WHERE c.vessel_id IS NOT NULL AND (c.corrective_actions_covered OR c.drills_covered) AND c.safety_on) AS safety_vessels,
         count(*) FILTER (WHERE c.corrective_actions_covered AND c.safety_on) AS ca_n,
         count(*) FILTER (WHERE c.drills_covered AND c.safety_on) AS drills_n,
         sum(c.open_corrective_actions) AS open_ca,
         sum(c.overdue_corrective_actions) AS overdue_ca,
         sum(c.overdue_drills) AS overdue_drl,
         count(*) FILTER (WHERE c.technical_covered) AS tech_access_n,
         count(*) FILTER (WHERE c.technical_on) AS tech_on_n,
         sum(c.overdue_jobs) AS overdue_jobs,
         sum(c.pending_approval) AS pending_n,
         sum(c.open_jobs) AS open_jobs
  INTO a
  FROM public.fleet_dashboard_counts_for(v_uid, v_company, p_vessel_ids, v_today) AS c;

  v_documents := CASE WHEN coalesce(a.doc_n, 0) = 0 THEN v_no ELSE jsonb_build_object(
    'state', 'ok',
    'value', coalesce(a.exp_vessel, 0) + coalesce(a.exp_crew_doc, 0) + coalesce(a.exp_qual, 0) + coalesce(a.endorse, 0) + coalesce(a.expiring_n, 0),
    'vessels', a.doc_n,
    'parts', jsonb_build_object(
      'expired_vessel_certificates', coalesce(a.exp_vessel, 0),
      'expired_crew_documents', coalesce(a.exp_crew_doc, 0),
      'expired_crew_qualifications', coalesce(a.exp_qual, 0),
      'endorsements_overdue', coalesce(a.endorse, 0),
      'expiring', coalesce(a.expiring_n, 0),
      'expiring_vessel_certificates', coalesce(a.expiring_vessel_n, 0),
      'expiring_crew_items', coalesce(a.expiring_crew_n, 0))) END;

  v_hor := CASE
    WHEN coalesce(a.hor_access_n, 0) = 0 THEN v_no
    WHEN coalesce(a.hor_on_n, 0) = 0 THEN jsonb_build_object('state', 'module_off', 'vessels_off', a.hor_access_n)
    ELSE jsonb_build_object(
      'state', 'ok',
      'value', coalesce(a.breach_n, 0),
      'breach_days', coalesce(a.breach_n, 0),
      'near_threshold', coalesce(a.near_n, 0),
      'crew_without_entries', coalesce(a.quiet_n, 0),
      'vessels_logging', a.hor_on_n,
      'vessels_off', a.hor_access_n - a.hor_on_n) END;

  v_safety := CASE
    WHEN coalesce(a.safety_access_n, 0) = 0 THEN v_no
    WHEN coalesce(a.safety_on_n, 0) = 0 THEN jsonb_build_object('state', 'module_off')
    ELSE jsonb_build_object(
      'state', 'ok',
      'value', coalesce(a.open_ca, 0) + coalesce(a.overdue_drl, 0),
      'vessels', a.safety_vessels,
      'open_corrective_actions', CASE WHEN a.ca_n > 0 THEN coalesce(a.open_ca, 0) END,
      'overdue_corrective_actions', CASE WHEN a.ca_n > 0 THEN coalesce(a.overdue_ca, 0) END,
      'overdue_drills', CASE WHEN a.drills_n > 0 THEN coalesce(a.overdue_drl, 0) END) END;

  v_technical := CASE
    WHEN coalesce(a.tech_access_n, 0) = 0 THEN v_no
    WHEN coalesce(a.tech_on_n, 0) = 0 THEN jsonb_build_object('state', 'module_off')
    ELSE jsonb_build_object(
      'state', 'ok',
      'value', coalesce(a.overdue_jobs, 0) + coalesce(a.pending_n, 0),
      'vessels', a.tech_on_n,
      'overdue_jobs', coalesce(a.overdue_jobs, 0),
      'pending_approval', coalesce(a.pending_n, 0),
      'open_jobs', coalesce(a.open_jobs, 0)) END;

  RETURN jsonb_build_object(
    'vessels', coalesce(a.vessels, 0),
    'today', v_today,
    'tiles', jsonb_build_object(
      'documents', v_documents,
      'hours_of_rest', v_hor,
      'safety', v_safety,
      'technical', v_technical,
      'leave', jsonb_build_object('state', 'not_enabled'),
      'finance', jsonb_build_object('state', 'hidden')));
END;
$$;

-- The fleet dashboard's ranked lists (gap/02 D9, D10, D12, D13) for the
-- caller's counted vessels (NULL) or the explicit, reach-checked ids, at
-- most p_limit (1..20, default 5; 22023 invalid_limit) items each, most
-- urgent first, with the full count ("n of m"):
--   expiry       { state, groups { vessel_certificates | crew_documents | crew_qualifications:
--                  { total, items [...] } } }: alert items (expired, endorsement
--                  overdue, expiring), alerts on, vessel-attributed
--   corrective_actions { state, total, overdue, items [... days_overdue] }  oldest due first
--   overdue_drills     { state, total, items [... days_overdue] }
--   hess               { state ok | not_tracked | no_access | module_off, total, items }:
--                      X2's safety_hess_status (vessel_id, next_due_on), due within 14 days
--                      or overdue; not_tracked while that view is missing
--   insurance          { state, total, items }: expired or expiring within 90 days (the
--                      expiry engine; fleet policies with NULL ids and fleet reach)
--   surveys            { state, total, items }: open audits and surveys scheduled before
--                      today + 90 (overdue ones included), certificate surveys due
--                      today .. today + 90
--   work_list          { state, vessels [{ vessel, open, overdue, pending_approval }] }
-- state: ok | no_access | module_off (as the KPI tiles). An inactive
-- caller, no company or no JWT: every part no_access.
CREATE OR REPLACE FUNCTION public.fleet_dashboard_panels(p_vessel_ids uuid[] DEFAULT NULL, p_limit integer DEFAULT 5, p_today date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_today date := coalesce(p_today, current_date);
  v_limit integer := coalesce(p_limit, 5);
  v_no jsonb := jsonb_build_object('state', 'no_access');
  sc record;
  v_safety_ca uuid[];
  v_safety_drills uuid[];
  v_hess_vessels uuid[];
  v_audit_vessels uuid[];
  v_expiry jsonb;
  v_ca jsonb;
  v_drills jsonb;
  v_hess jsonb;
  v_insurance jsonb;
  v_surveys jsonb;
  v_work jsonb;
BEGIN
  IF v_limit < 1 OR v_limit > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_limit', DETAIL = 'p_limit must be between 1 and 20';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('vessels', 0, 'today', v_today, 'expiry', v_no, 'corrective_actions', v_no, 'overdue_drills', v_no,
                              'hess', v_no, 'insurance', v_no, 'surveys', v_no, 'work_list', v_no);
  END IF;

  SELECT * INTO sc FROM public.fleet_dashboard_scope_for(v_uid, v_company, p_vessel_ids, v_today);
  v_safety_ca := ARRAY(SELECT x FROM unnest(sc.corrective_actions) AS x WHERE x = ANY (sc.safety_on));
  v_safety_drills := ARRAY(SELECT x FROM unnest(sc.drills) AS x WHERE x = ANY (sc.safety_on));
  v_hess_vessels := ARRAY(SELECT x FROM unnest(sc.safety_meetings) AS x WHERE x = ANY (sc.safety_on));
  v_audit_vessels := ARRAY(SELECT x FROM unnest(sc.audits_surveys) AS x WHERE x = ANY (sc.safety_on));

  -- Expiry groups (D9).
  IF cardinality(sc.documents) = 0 THEN
    v_expiry := v_no;
  ELSE
    WITH items AS (
      SELECT r.*,
             CASE WHEN r.item_type = 'vessel_certificate' THEN 'vessel_certificates'
                  WHEN r.item_type IN ('crew_qualification', 'training_course') THEN 'crew_qualifications'
                  ELSE 'crew_documents' END AS grp,
             CASE WHEN r.bucket = 'expired' THEN 0 WHEN r.endorsement_state = 'overdue' THEN 1
                  WHEN r.bucket = 'expiring_soon' THEN 2 ELSE 3 END AS urgency
      FROM public.fleet_expiry_rows_for(v_uid, v_company, sc.documents, NULL, false, v_today) AS r
      WHERE NOT r.alerts_muted
        AND r.vessel_id = ANY (sc.documents)
        AND r.item_type NOT IN ('insurance_policy', 'contract')
        AND (r.bucket IN ('expired', 'expiring_soon', 'expiring') OR r.endorsement_state = 'overdue')
    ),
    ranked AS (
      SELECT i.*,
             row_number() OVER (PARTITION BY i.grp ORDER BY i.urgency, i.days_remaining NULLS LAST, i.label, i.record_id) AS rn,
             count(*) OVER (PARTITION BY i.grp) AS total
      FROM items AS i
    ),
    agg AS (
      SELECT rk.grp,
             max(rk.total) AS total,
             jsonb_agg(jsonb_build_object(
               'source_key', rk.source_key, 'item_type', rk.item_type, 'record_id', rk.record_id,
               'vessel_id', rk.vessel_id, 'vessel_name', v.name, 'vessel_code', v.code,
               'person_name', CASE WHEN p.id IS NULL THEN NULL
                                   ELSE nullif(btrim(coalesce(nullif(btrim(p.preferred_name), ''), p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') END,
               'label', rk.label, 'detail', rk.detail, 'expires_on', rk.expires_on, 'days_remaining', rk.days_remaining,
               'bucket', rk.bucket, 'endorsement_due_on', rk.endorsement_due_on, 'endorsement_state', rk.endorsement_state,
               'link_scope', rk.link_scope, 'link_rel', rk.link_rel)
               ORDER BY rk.rn) FILTER (WHERE rk.rn <= v_limit) AS items
      FROM ranked AS rk
      LEFT JOIN public.vessels AS v ON v.id = rk.vessel_id
      LEFT JOIN public.profiles AS p ON p.id = rk.profile_id
      GROUP BY rk.grp
    )
    SELECT jsonb_build_object('state', 'ok', 'groups', jsonb_object_agg(g.grp, jsonb_build_object(
             'total', coalesce(agg.total, 0), 'items', coalesce(agg.items, '[]'::jsonb))))
    INTO v_expiry
    FROM (VALUES ('vessel_certificates'), ('crew_documents'), ('crew_qualifications')) AS g(grp)
    LEFT JOIN agg ON agg.grp = g.grp;
  END IF;

  -- Open corrective actions (D10).
  IF cardinality(sc.corrective_actions) = 0 AND NOT sc.fleet_corrective_actions THEN
    v_ca := v_no;
  ELSIF cardinality(v_safety_ca) = 0 AND NOT sc.fleet_corrective_actions THEN
    v_ca := jsonb_build_object('state', 'module_off');
  ELSE
    WITH open_ca AS (
      SELECT a.*, row_number() OVER (ORDER BY a.due_date NULLS LAST, a.action_number, a.id) AS rn
      FROM public.fleet_dashboard_open_corrective_actions(v_company) AS a
      WHERE a.vessel_id = ANY (v_safety_ca) OR (a.vessel_id IS NULL AND sc.fleet_corrective_actions)
    )
    SELECT jsonb_build_object(
             'state', 'ok',
             'total', count(*),
             'overdue', count(*) FILTER (WHERE o.due_date < v_today),
             'items', coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'action_number', o.action_number, 'description', o.description, 'action_type', o.action_type,
               'status', o.status, 'due_date', o.due_date, 'days_overdue', greatest(v_today - o.due_date, 0),
               'source', o.source, 'source_id', o.source_id,
               'vessel_id', o.vessel_id, 'vessel_name', v.name, 'vessel_code', v.code)
               ORDER BY o.rn) FILTER (WHERE o.rn <= v_limit), '[]'::jsonb))
    INTO v_ca
    FROM open_ca AS o
    LEFT JOIN public.vessels AS v ON v.id = o.vessel_id;
  END IF;

  -- Overdue drills (D10).
  IF cardinality(sc.drills) = 0 THEN
    v_drills := v_no;
  ELSIF cardinality(v_safety_drills) = 0 THEN
    v_drills := jsonb_build_object('state', 'module_off');
  ELSE
    WITH od AS (
      SELECT d.id, d.drill_number, d.vessel_id, d.drill_date_scheduled, dt.drill_name,
             row_number() OVER (ORDER BY d.drill_date_scheduled, d.drill_number, d.id) AS rn
      FROM public.drills AS d
      LEFT JOIN public.drill_types AS dt ON dt.id = d.drill_type_id
      WHERE d.vessel_id = ANY (v_safety_drills)
        AND public.fleet_dashboard_drill_overdue(d.status, d.drill_date_actual, d.drill_date_scheduled, v_today)
    )
    SELECT jsonb_build_object(
             'state', 'ok',
             'total', count(*),
             'items', coalesce(jsonb_agg(jsonb_build_object(
               'id', od.id, 'drill_number', od.drill_number, 'drill_type', od.drill_name,
               'scheduled_on', od.drill_date_scheduled, 'days_overdue', v_today - od.drill_date_scheduled,
               'vessel_id', od.vessel_id, 'vessel_name', v.name, 'vessel_code', v.code)
               ORDER BY od.rn) FILTER (WHERE od.rn <= v_limit), '[]'::jsonb))
    INTO v_drills
    FROM od
    LEFT JOIN public.vessels AS v ON v.id = od.vessel_id;
  END IF;

  -- HESS meetings due (D10): X2's safety_hess_status, when it exists (D-X5-10).
  IF cardinality(sc.safety_meetings) = 0 THEN
    v_hess := v_no;
  ELSIF cardinality(v_hess_vessels) = 0 THEN
    v_hess := jsonb_build_object('state', 'module_off');
  ELSIF to_regclass('public.safety_hess_status') IS NULL THEN
    v_hess := jsonb_build_object('state', 'not_tracked');
  ELSE
    BEGIN
      EXECUTE $q$
        WITH due AS (
          SELECT h.vessel_id, h.next_due_on::date AS next_due_on,
                 row_number() OVER (ORDER BY h.next_due_on::date, h.vessel_id) AS rn
          FROM public.safety_hess_status AS h
          WHERE h.vessel_id = ANY ($1) AND h.next_due_on IS NOT NULL AND h.next_due_on::date <= $2 + 14
        )
        SELECT jsonb_build_object('state', 'ok', 'total', count(*),
                 'items', coalesce(jsonb_agg(jsonb_build_object(
                   'vessel_id', due.vessel_id, 'vessel_name', v.name, 'vessel_code', v.code,
                   'next_due_on', due.next_due_on, 'days_remaining', due.next_due_on - $2)
                   ORDER BY due.rn) FILTER (WHERE due.rn <= $3), '[]'::jsonb))
        FROM due LEFT JOIN public.vessels AS v ON v.id = due.vessel_id
      $q$ INTO v_hess USING v_hess_vessels, v_today, v_limit;
    EXCEPTION WHEN undefined_column OR undefined_table OR undefined_function OR datatype_mismatch
                   OR invalid_text_representation OR cannot_coerce OR invalid_datetime_format THEN
      v_hess := jsonb_build_object('state', 'not_tracked');
    END;
  END IF;

  -- Insurance expiring within 90 days (D12).
  IF cardinality(sc.insurance) = 0 AND NOT sc.fleet_insurance THEN
    v_insurance := v_no;
  ELSE
    WITH pol AS (
      SELECT r.*, row_number() OVER (ORDER BY r.expires_on, r.label, r.record_id) AS rn
      FROM public.fleet_expiry_rows_for(v_uid, v_company, sc.insurance, ARRAY['insurance_policies'], sc.fleet_insurance, v_today) AS r
      WHERE NOT r.alerts_muted
        AND r.item_type = 'insurance_policy'
        AND r.expires_on IS NOT NULL AND r.expires_on <= v_today + 90
        AND (r.vessel_id = ANY (sc.insurance) OR (r.vessel_id IS NULL AND sc.fleet_insurance))
    )
    SELECT jsonb_build_object(
             'state', 'ok',
             'total', count(*),
             'items', coalesce(jsonb_agg(jsonb_build_object(
               'record_id', pol.record_id, 'label', pol.label, 'detail', pol.detail,
               'expires_on', pol.expires_on, 'days_remaining', pol.days_remaining, 'bucket', pol.bucket,
               'vessel_id', pol.vessel_id, 'vessel_name', v.name, 'vessel_code', v.code,
               'link_scope', pol.link_scope, 'link_rel', pol.link_rel)
               ORDER BY pol.rn) FILTER (WHERE pol.rn <= v_limit), '[]'::jsonb))
    INTO v_insurance
    FROM pol
    LEFT JOIN public.vessels AS v ON v.id = pol.vessel_id;
  END IF;

  -- Audits and surveys within 90 days (D12).
  IF cardinality(sc.audits_surveys) = 0 AND cardinality(sc.certificates) = 0 AND NOT sc.fleet_audits_surveys THEN
    v_surveys := v_no;
  ELSE
    WITH due AS (
      SELECT 'audit'::text AS kind, au.id, au.audit_number AS reference,
             btrim(concat_ws(' · ', nullif(btrim(au.audit_type), ''), nullif(btrim(au.audit_scope), ''))) AS label,
             au.vessel_id, au.scheduled_date AS due_on, au.status
      FROM public.audits AS au
      WHERE au.company_id = v_company
        AND (au.vessel_id = ANY (v_audit_vessels) OR (au.vessel_id IS NULL AND sc.fleet_audits_surveys))
        AND lower(btrim(coalesce(au.status, ''))) NOT IN ('completed', 'cancelled', 'canceled', 'closed')
        AND au.scheduled_date <= v_today + 90
      UNION ALL
      SELECT 'certificate_survey'::text, c.id, c.certificate_number, c.certificate_name, c.vessel_id, c.next_survey_date, c.status
      FROM public.certificates AS c
      WHERE c.company_id = v_company
        AND c.vessel_id = ANY (sc.certificates)
        AND c.superseded_by IS NULL AND c.status IS DISTINCT FROM 'Superseded'
        AND c.next_survey_date BETWEEN v_today AND v_today + 90
    ),
    ranked AS (
      SELECT d.*, row_number() OVER (ORDER BY d.due_on, d.kind, d.reference, d.id) AS rn FROM due AS d
    )
    SELECT jsonb_build_object(
             'state', 'ok',
             'total', count(*),
             'items', coalesce(jsonb_agg(jsonb_build_object(
               'kind', rk.kind, 'id', rk.id, 'reference', rk.reference, 'label', rk.label, 'status', rk.status,
               'due_on', rk.due_on, 'days_remaining', rk.due_on - v_today,
               'vessel_id', rk.vessel_id, 'vessel_name', v.name, 'vessel_code', v.code)
               ORDER BY rk.rn) FILTER (WHERE rk.rn <= v_limit), '[]'::jsonb))
    INTO v_surveys
    FROM ranked AS rk
    LEFT JOIN public.vessels AS v ON v.id = rk.vessel_id;
  END IF;

  -- Work list per vessel (D13).
  IF cardinality(sc.technical) = 0 THEN
    v_work := v_no;
  ELSIF cardinality(sc.technical_on) = 0 THEN
    v_work := jsonb_build_object('state', 'module_off');
  ELSE
    WITH per AS (
      SELECT x.id AS vessel_id,
             count(j.st) FILTER (WHERE j.st <> 'closed') AS open_n,
             count(j.st) FILTER (WHERE j.st = 'overdue') AS overdue_n,
             count(j.st) FILTER (WHERE j.st = 'pending_approval') AS pending_n
      FROM unnest(sc.technical_on) AS x(id)
      LEFT JOIN public.equipment AS e ON e.vessel_id = x.id
      LEFT JOIN public.maintenance_tasks AS mt ON mt.equipment_id = e.id
      LEFT JOIN LATERAL (SELECT public.fleet_dashboard_job_state(mt.status, mt.due_date, v_today) AS st WHERE mt.id IS NOT NULL) AS j ON true
      GROUP BY x.id
    )
    SELECT jsonb_build_object('state', 'ok', 'vessels', coalesce(jsonb_agg(jsonb_build_object(
             'vessel_id', per.vessel_id, 'vessel_name', v.name, 'vessel_code', v.code,
             'open', per.open_n, 'overdue', per.overdue_n, 'pending_approval', per.pending_n)
             ORDER BY per.overdue_n DESC, per.pending_n DESC, per.open_n DESC, v.name, per.vessel_id), '[]'::jsonb))
    INTO v_work
    FROM per
    JOIN public.vessels AS v ON v.id = per.vessel_id;
  END IF;

  RETURN jsonb_build_object(
    'vessels', cardinality(sc.vessel_ids),
    'today', v_today,
    'expiry', v_expiry,
    'corrective_actions', v_ca,
    'overdue_drills', v_drills,
    'hess', v_hess,
    'insurance', v_insurance,
    'surveys', v_surveys,
    'work_list', v_work);
END;
$$;

-- One row per vessel of the caller's counted vessels (NULL) or the
-- explicit, reach-checked ids, by name (gap/02 D15, R2 Vessel comparison):
--   documents     { value, expired, endorsements_overdue, expiring,
--                   expired_vessel_certificates, expired_crew_items,
--                   expiring_vessel_certificates, expiring_crew_items }
--                   (by source: vessel certificates, else the crew items;
--                   the pairs sum to expired / expiring; C-1, D-381)
--   safety        { open_corrective_actions, overdue_corrective_actions, overdue_drills }
--   technical     { open_jobs, overdue_jobs, pending_approval }
--   insurance     { expired, expiring }   (within 90 days)
--   hours_of_rest { breach_days, near_threshold, crew_without_entries }
-- A group is NULL where the caller cannot count it on that vessel (no
-- access, or its module off): the page shows "–", never 0. Within a group
-- a part the caller cannot count is null. Fleet-level items are not here
-- (they belong to no vessel). An inactive caller, no company or no JWT: no
-- row.
CREATE OR REPLACE FUNCTION public.fleet_vessel_comparison(p_vessel_ids uuid[] DEFAULT NULL, p_today date DEFAULT current_date)
RETURNS TABLE (
  vessel_id uuid, vessel_name text, vessel_code text,
  documents jsonb, safety jsonb, technical jsonb, insurance jsonb, hours_of_rest jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT c.vessel_id,
           v.name::text,
           v.code::text,
           CASE WHEN c.documents_covered THEN jsonb_build_object(
             'value', c.expired_vessel_certificates + c.expired_crew_documents + c.expired_crew_qualifications + c.endorsements_overdue + c.expiring,
             'expired', c.expired_vessel_certificates + c.expired_crew_documents + c.expired_crew_qualifications,
             'endorsements_overdue', c.endorsements_overdue,
             'expiring', c.expiring,
             'expired_vessel_certificates', c.expired_vessel_certificates,
             'expired_crew_items', c.expired_crew_documents + c.expired_crew_qualifications,
             'expiring_vessel_certificates', c.expiring_vessel_certificates,
             'expiring_crew_items', c.expiring_crew_items) END,
           CASE WHEN (c.corrective_actions_covered OR c.drills_covered) AND c.safety_on THEN jsonb_build_object(
             'open_corrective_actions', c.open_corrective_actions,
             'overdue_corrective_actions', c.overdue_corrective_actions,
             'overdue_drills', c.overdue_drills) END,
           CASE WHEN c.technical_on THEN jsonb_build_object(
             'open_jobs', c.open_jobs, 'overdue_jobs', c.overdue_jobs, 'pending_approval', c.pending_approval) END,
           CASE WHEN c.insurance_covered THEN jsonb_build_object(
             'expired', c.insurance_expired, 'expiring', c.insurance_expiring) END,
           CASE WHEN c.hours_of_rest_on THEN jsonb_build_object(
             'breach_days', c.breach_days, 'near_threshold', c.near_threshold, 'crew_without_entries', c.crew_without_entries) END
    FROM public.fleet_dashboard_counts_for(v_uid, v_company, p_vessel_ids, coalesce(p_today, current_date)) AS c
    JOIN public.vessels AS v ON v.id = c.vessel_id
    ORDER BY v.name, c.vessel_id;
END;
$$;

-- ---------------------------------------------------------------- grants and comments

REVOKE ALL ON FUNCTION public.fleet_dashboard_tile_can_for(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_dashboard_scope_for(uuid, uuid, uuid[], date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_dashboard_job_state(text, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_dashboard_drill_overdue(text, timestamptz, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_dashboard_open_corrective_actions(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_dashboard_hor_crew_days(uuid, uuid[], date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_dashboard_counts_for(uuid, uuid, uuid[], date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_dashboard_kpis(uuid[], date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_dashboard_panels(uuid[], integer, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_vessel_comparison(uuid[], date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fleet_dashboard_tile_can_for(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_scope_for(uuid, uuid, uuid[], date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_job_state(text, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_drill_overdue(text, timestamptz, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_open_corrective_actions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_hor_crew_days(uuid, uuid[], date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_counts_for(uuid, uuid, uuid[], date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_kpis(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_panels(uuid[], integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_vessel_comparison(uuid[], date) TO authenticated;

COMMENT ON FUNCTION public.fleet_dashboard_tile_can_for(uuid, uuid, uuid, text) IS 'Whether the user may read one fleet dashboard tile''s data on a vessel (NULL: fleet-level data, needs fleet reach): hours_of_rest = has_capability_for vessel.crew.hours_of_rest.view; corrective_actions, drills, safety_meetings, audits_surveys, technical = the adaptor''s rbac rule at view for capa, drills, meetings, audits_surveys (nav ism) and maintenance (nav maintenance): full access, the RBAC module, else canAccessModule(nav) (D-04). False when inactive, outside the company, out of reach or for an unknown gate. Internal (service role; the dashboard definers).';
COMMENT ON FUNCTION public.fleet_dashboard_scope_for(uuid, uuid, uuid[], date) IS 'The vessels a fleet dashboard read covers (fleet_counted_vessels_for and the dashboard gate; 42501 vessel_out_of_reach for explicit ids out of reach) and, per part, which of them it may count (expiry read areas, insurance, certificates, the tile gates of fleet_dashboard_tile_can_for, the crew_hor / safety / technical module settings), as arrays that are never NULL; fleet_level and its flags only with NULL ids and fleet reach. Internal (service role; the dashboard definers).';
COMMENT ON FUNCTION public.fleet_dashboard_job_state(text, date, date) IS 'A maintenance job''s dashboard state: closed (completed, cancelled, closed), pending_approval (gap/06 J3), overdue (open and due before today, or status Overdue), else open. Status words compare case-insensitively with spaces and dashes as underscores. Pure.';
COMMENT ON FUNCTION public.fleet_dashboard_drill_overdue(text, timestamptz, date, date) IS 'Whether a drill is overdue: status Scheduled (or the legacy overdue), no actual date, scheduled before today. Pure.';
COMMENT ON FUNCTION public.fleet_dashboard_open_corrective_actions(uuid) IS 'The company''s open corrective actions (status not Closed) with their vessel: the incident''s, else the audit finding''s audit''s; NULL = fleet-level (a company audit, or no incident and no finding). Actions whose incident or audit is another company''s are left out. Internal (service role; the dashboard definers).';
COMMENT ON FUNCTION public.fleet_dashboard_hor_crew_days(uuid, uuid[], date, date) IS 'Hours of rest per crew-day of the company''s crew on the given vessels (D-380, the R9 report''s breach days): breach = a live, not dismissed X1 non-conformity of any rule that day when X1''s breach review columns exist (day breach_day, else the UTC day before window_end; vessel the NC''s, else its submission''s, else the assignment covering the day), else a failing work_rest_compliance_checks row that day (window_start in UTC); near = a passing check within 60 minutes of its threshold, never on a breach crew-day. Internal (service role; fleet_dashboard_counts_for).';
COMMENT ON FUNCTION public.fleet_dashboard_counts_for(uuid, uuid, uuid[], date) IS 'The fleet dashboard counts per vessel of fleet_dashboard_scope_for (plus a vessel_id NULL row for fleet-level items with NULL ids and fleet reach): document alerts by part (expiring also split by source: vessel certificates and the crew items, C-1), insurance expired / expiring within 90 days, hours of rest breach days / near threshold / crew with no entries, open and overdue corrective actions, overdue drills, open / overdue / pending-approval jobs; a count is NULL where its part is not covered (no access or module off). Internal (service role; the dashboard definers).';
COMMENT ON FUNCTION public.fleet_dashboard_kpis(uuid[], date) IS 'The fleet dashboard KPI row (gap/02 W9; D3, D4, D6, D7) as jsonb { vessels, today, tiles { documents, hours_of_rest, safety, technical, leave (not_enabled), finance (hidden) } }: each tile state ok | no_access | module_off with its value and parts (null for a part the caller cannot count, never 0). Vessels: NULL = the caller''s counted vessels plus fleet-level items with fleet reach; explicit ids reach-checked (42501 vessel_out_of_reach). Inactive caller, no company or no JWT: every tile no_access.';
COMMENT ON FUNCTION public.fleet_dashboard_panels(uuid[], integer, date) IS 'The fleet dashboard ranked lists (gap/02 D9, D10, D12, D13) as jsonb: expiry groups (vessel certificates, crew documents, crew qualifications), open corrective actions, overdue drills, HESS meetings due (X2''s safety_hess_status (vessel_id, next_due_on) when it exists, else not_tracked), insurance expiring within 90 days, audits and surveys within 90 days and the work list per vessel; each with state, total and at most p_limit (1..20; 22023 invalid_limit) items, most urgent first. Same vessels and gates as fleet_dashboard_kpis.';
COMMENT ON FUNCTION public.fleet_vessel_comparison(uuid[], date) IS 'One row per vessel of the caller''s counted vessels or the explicit, reach-checked ids (gap/02 D15, R2): documents (by part, and by source: vessel certificates and the crew items, C-1), safety, technical, insurance and hours_of_rest as jsonb groups, NULL where the caller cannot count that group on that vessel (shown as a dash). Inactive caller, no company or no JWT: no row.';
