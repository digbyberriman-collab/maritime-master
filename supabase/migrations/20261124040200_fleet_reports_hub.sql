-- =================================================================
-- FLEET OPERATIONS X5-03A: the reports hub's numbers
-- (gap/02 R1, R2, R14; DECISIONS C12, D-01, D-04, D-53, D-123;
-- X5 spec §2 X5-03A, D-X5-09, D-X5-11, D-X5-21, D-X5-22)
-- Functions (browser): fleet_report_trends, fleet_vessel_list
-- Functions (service role; the two above): fleet_report_gate_can_for,
--   fleet_report_scope_for, fleet_report_corrective_actions
-- TS mirrors: src/modules/reports/types/db.pending.ts (the jsonb and row
--   shapes), src/modules/reports/lib/trends.ts (the period rule);
--   src/test/reports/wiring.test.ts pins the nav role block between the
--   markers below against AuthContext's MODULE_ACCESS
-- =================================================================
--
-- Two server answers for the fleet reports hub (/fleet/reports) and the
-- fleet list report, so the browser never sums rows:
--
--   fleet_report_trends(p_vessel_ids, p_months, p_today)  monthly trends
--   fleet_vessel_list(p_vessel_ids, p_today)              one row per vessel
--
-- The hub's current-position tiles read fleet_dashboard_kpis (040100) and
-- the Vessel comparison report reads fleet_vessel_comparison (040100);
-- nothing here redefines them (D-120).
--
-- Vessels (D-X5-09, D-X5-22): fleet_counted_vessels_for(); NULL ids are
-- every counted vessel the caller reaches, explicit ids are reach-checked
-- (42501 vessel_out_of_reach) and not counted-filtered. Fleet-level items
-- (corrective actions with no vessel) are counted only with NULL ids and
-- fleet reach (D-X5-21).
--
-- Gates, per vessel, computed once (fleet_report_scope_for): the reports
-- rule itself (fleet_ops_can_for 'reports' view, the adaptor's
-- fleet.operations.fleet_reports.view) AND each series' own data rule,
-- the one the client adaptor uses for that data (D-04):
--
--   Incidents            vessel.safety.incidents.view  rbac('incidents', nav 'ism')
--   Corrective actions   vessel.safety.capa.view       (fleet_dashboard_tile_can_for)
--   Drills               vessel.safety.drills.view     (fleet_dashboard_tile_can_for)
--   Document expiries    the expiry sources' read areas (fleet_expiry_rows_for)
--   Active crew          vessel.crew.crew_list.view    (has_capability_for, PP1)
--   Certificates         fleet_ops_can 'certificates'
--
-- and the vessel module setting 'safety' for incidents, corrective actions
-- and drills (vessel_module_on_internal). A series with no vessel passing
-- its rule is 'no_access'; with its module off on every vessel that
-- passes, 'module_off'; never zeros it did not count. Inactive callers,
-- callers with no company and anon get nothing.
--
-- Definitions (gap/02 R1; the hub's "trend charts"):
--   Period           p_months 3, 6 or 12 (else 22023 invalid_period): the
--                    calendar months ending with p_today's month, oldest
--                    first (the current month is partial).
--   Incidents        incidents by incident_date (UTC day) in each month.
--   Corrective       opened: created_at (UTC day) in the month; closed:
--   actions          status Closed, by the verification date, else the
--                    completion date, else the last update (UTC day).
--                    Vessel through the incident, else the audit finding's
--                    audit; neither = fleet-level.
--   Drills           completed: carried out (an actual date, or status
--                    Completed; never Cancelled), by the actual day (UTC),
--                    else the scheduled day; overdue: scheduled in the
--                    month and still overdue today
--                    (fleet_dashboard_drill_overdue).
--   Document         looking ahead, not back: items expiring in each of
--   expiries         the p_months months starting with p_today's month
--                    (from p_today on), plus those already expired; the
--                    item types and muting of the dashboard's Document
--                    alerts (no insurance, no contracts, muted items never
--                    count). A renewed item's old expiry is gone from the
--                    registry, so a backward count would only show what is
--                    still expired: forward is the honest trend.
--   Vessel list      the vessel's particulars and fleet group, active crew
--                    (current crew of fleet_current_crew that are not
--                    planned joiners; pending placements count), and its
--                    vessel certificates: total, expired, expiring
--                    (expiring_soon + expiring; muted items not counted).
--
-- Nothing here is live (D-01): the client reads both RPCs through the
-- pending shim and shows "This report is not set up yet" while they are
-- missing. Applying it changes nothing users see today: no live table,
-- policy or function is touched.
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
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040200_fleet_reports_hub needs the fleet expiry engine: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.fleet_dashboard_tile_can_for(uuid,uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.fleet_dashboard_drill_overdue(text,timestamptz,date,date)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040200_fleet_reports_hub needs the fleet dashboard gates: apply 20261124040100_fleet_dashboard_kpis.sql first';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.vessel_module_on_internal(uuid,text,date)') IS NULL
     OR to_regprocedure('public.user_has_permission(uuid,text,public.permission_level,uuid)') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040200_fleet_reports_hub needs has_capability_for (20261123000400), vessel_module_on_internal (20261123000500) and the reach helpers (20261123000300, 20261123010000)';
  END IF;
  IF to_regclass('public.incidents') IS NULL OR to_regclass('public.corrective_actions') IS NULL
     OR to_regclass('public.audit_findings') IS NULL OR to_regclass('public.audits') IS NULL
     OR to_regclass('public.drills') IS NULL OR to_regclass('public.vessels') IS NULL
     OR to_regclass('public.fleet_groups') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040200_fleet_reports_hub needs the live safety, vessel and fleet group tables';
  END IF;
END
$$;

-- ---------------------------------------------------------------- report gates (internal)

-- Whether _user_id may read one report series' data on a vessel (NULL:
-- fleet-level data). The same rule the client adaptor applies to the key
-- (D-04; src/lib/permissions/adaptor.ts):
--   incidents           vessel.safety.incidents.view  rbac('incidents', nav 'ism')
--   crew_list           vessel.crew.crew_list.view    has_capability_for (PP1,
--                       parity-tested against the adaptor)
--   corrective_actions, drills: fleet_dashboard_tile_can_for (040100)
-- An rbac rule at view: full access (legacy dpa / shore_management, RBAC
-- superadmin / dpa), else the RBAC module at any level on the vessel
-- (user_has_permission), else canAccessModule(nav): RBAC fleet_master, the
-- nav module's RBAC view, or a legacy role of MODULE_ACCESS[nav]. False for
-- an inactive user, another company, an unknown gate, a vessel outside the
-- company or out of reach, and fleet-level data without fleet reach
-- (D-X5-21). Every gate is view-level, so an external viewer (D-123) passes
-- like anyone else. Internal (service role; the definers below).
CREATE OR REPLACE FUNCTION public.fleet_report_gate_can_for(_user_id uuid, _company_id uuid, _vessel_id uuid, _gate text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_role text;
  v_nav_roles text[];
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL OR _gate IS NULL
     OR _gate NOT IN ('incidents', 'crew_list', 'corrective_actions', 'drills') THEN
    RETURN false;
  END IF;
  IF _gate IN ('corrective_actions', 'drills') THEN
    RETURN coalesce(public.fleet_dashboard_tile_can_for(_user_id, _company_id, _vessel_id, _gate), false);
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

  IF _gate = 'crew_list' THEN
    RETURN coalesce(public.has_capability_for(_user_id, 'vessel.crew.crew_list.view', _company_id, _vessel_id), false);
  END IF;

  -- incidents. Full access (the adaptor's hasFullAccess).
  IF v_role IN ('dpa', 'shore_management') OR EXISTS (
       SELECT 1 FROM public.rbac_user_roles AS r JOIN public.roles AS ro ON ro.id = r.role_id
       WHERE r.user_id = _user_id AND r.is_active = true AND (r.valid_until IS NULL OR r.valid_until > now())
         AND lower(ro.name) IN ('superadmin', 'dpa')) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['view', 'edit', 'admin']) AS l(level)
             WHERE coalesce(public.user_has_permission(_user_id, 'incidents', l.level::public.permission_level, _vessel_id), false)) THEN
    RETURN true;
  END IF;
  -- canAccessModule('ism') at view: RBAC fleet_master, the nav module's RBAC view (its RBAC key is the nav id), a legacy role of MODULE_ACCESS.
  IF EXISTS (
       SELECT 1 FROM public.rbac_user_roles AS r JOIN public.roles AS ro ON ro.id = r.role_id
       WHERE r.user_id = _user_id AND r.is_active = true AND (r.valid_until IS NULL OR r.valid_until > now())
         AND lower(ro.name) = 'fleet_master') THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['view', 'edit', 'admin']) AS l(level)
             WHERE coalesce(public.user_has_permission(_user_id, 'ism', l.level::public.permission_level, _vessel_id), false)) THEN
    RETURN true;
  END IF;
  -- report-gate-nav-rules:start (MODULE_ACCESS in src/modules/auth/contexts/AuthContext.tsx; pinned by src/test/reports/wiring.test.ts)
  v_nav_roles := CASE _gate
    WHEN 'incidents' THEN ARRAY['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer']
  END;
  -- report-gate-nav-rules:end
  RETURN coalesce(v_role = ANY (v_nav_roles), false);
END;
$$;

-- ---------------------------------------------------------------- scope (internal)

-- The vessels a report read covers, and which of them each series may
-- count, as one row of arrays (never NULL; '{}' when none):
--   vessel_ids          fleet_counted_vessels_for() ∩ the reports gate
--   incidents           ∩ the incidents gate; incidents_on: and safety on
--   corrective_actions  ∩ the corrective-action gate; .._on: and safety on
--   drills              ∩ the drills gate; drills_on: and safety on
--   documents           ∩ any read area of the active expiry sources that
--                       are not insurance or contracts
--   certificates        ∩ fleet_ops_can 'certificates'
--   crew_list           ∩ the crew list gate
--   fleet_level         NULL ids, fleet reach and the reports rule at fleet
--                       level; fleet_corrective_actions: and the
--                       corrective-action gate at fleet level
-- Explicit ids out of reach raise 42501 vessel_out_of_reach (through
-- fleet_counted_vessels_for). An inactive user or another company: every
-- array empty, every flag false. Internal (service role; the definers below).
CREATE OR REPLACE FUNCTION public.fleet_report_scope_for(_user_id uuid, _company_id uuid, _vessel_ids uuid[], _today date)
RETURNS TABLE (
  vessel_ids uuid[], incidents uuid[], incidents_on uuid[], corrective_actions uuid[], corrective_actions_on uuid[],
  drills uuid[], drills_on uuid[], documents uuid[], certificates uuid[], crew_list uuid[],
  fleet_level boolean, fleet_corrective_actions boolean
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
    RETURN QUERY SELECT v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, false, false;
    RETURN;
  END IF;

  v_doc_areas := ARRAY(SELECT DISTINCT es.read_area FROM public.expiry_sources AS es
                       WHERE es.is_active AND es.item_type NOT IN ('insurance_policy', 'contract') ORDER BY 1);
  v_fleet := _vessel_ids IS NULL
             AND coalesce(public.fleet_ops_can_for(_user_id, _company_id, NULL, 'reports', 'view'), false);

  RETURN QUERY
    WITH vs AS (
      SELECT x AS id FROM public.fleet_counted_vessels_for(_user_id, _company_id, _vessel_ids) AS x
    ),
    rep AS (
      SELECT vs.id FROM vs WHERE coalesce(public.fleet_ops_can_for(_user_id, _company_id, vs.id, 'reports', 'view'), false)
    ),
    g AS (
      SELECT r.id,
             public.fleet_report_gate_can_for(_user_id, _company_id, r.id, 'incidents') AS inc,
             public.fleet_report_gate_can_for(_user_id, _company_id, r.id, 'corrective_actions') AS ca,
             public.fleet_report_gate_can_for(_user_id, _company_id, r.id, 'drills') AS drl,
             coalesce(public.vessel_module_on_internal(r.id, 'safety', v_today), false) AS safety_on,
             EXISTS (SELECT 1 FROM unnest(v_doc_areas) AS a(area)
                     WHERE coalesce(public.fleet_ops_can_for(_user_id, _company_id, r.id, a.area, 'view'), false)) AS doc,
             coalesce(public.fleet_ops_can_for(_user_id, _company_id, r.id, 'certificates', 'view'), false) AS cert,
             public.fleet_report_gate_can_for(_user_id, _company_id, r.id, 'crew_list') AS crew
      FROM rep AS r
    )
    SELECT coalesce(array_agg(g.id ORDER BY g.id), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.inc), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.inc AND g.safety_on), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.ca), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.ca AND g.safety_on), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.drl), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.drl AND g.safety_on), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.doc), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.cert), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.crew), v_none),
           v_fleet,
           v_fleet AND public.fleet_report_gate_can_for(_user_id, _company_id, NULL, 'corrective_actions')
    FROM g;
END;
$$;

-- ---------------------------------------------------------------- shared definitions (internal)

-- Every corrective action of the company with its vessel and its opened /
-- closed days: the vessel is the incident's, else the audit finding's
-- audit's (NULL for a company audit or an action with neither: a
-- fleet-level action); opened = created_at (UTC day); closed = status
-- Closed, on the verification date, else the completion date, else the last
-- update (UTC day); NULL while not closed. An action whose incident or
-- audit belongs to another company is left out. Internal (service role;
-- fleet_report_trends).
CREATE OR REPLACE FUNCTION public.fleet_report_corrective_actions(_company_id uuid)
RETURNS TABLE (id uuid, vessel_id uuid, opened_on date, closed_on date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.id,
         CASE WHEN ca.incident_id IS NOT NULL THEN i.vessel_id WHEN ca.finding_id IS NOT NULL THEN au.vessel_id END,
         (ca.created_at AT TIME ZONE 'UTC')::date,
         CASE WHEN lower(btrim(coalesce(ca.status, 'Open'))) = 'closed'
              THEN coalesce(ca.verified_date, ca.completion_date, (ca.updated_at AT TIME ZONE 'UTC')::date) END
  FROM public.corrective_actions AS ca
  LEFT JOIN public.incidents AS i ON i.id = ca.incident_id AND i.company_id = ca.company_id
  LEFT JOIN public.audit_findings AS af ON af.id = ca.finding_id
  LEFT JOIN public.audits AS au ON au.id = af.audit_id AND au.company_id = ca.company_id
  WHERE _company_id IS NOT NULL
    AND ca.company_id = _company_id
    AND (ca.incident_id IS NULL OR i.id IS NOT NULL)
    AND (ca.incident_id IS NOT NULL OR ca.finding_id IS NULL OR au.id IS NOT NULL)
$$;

-- ---------------------------------------------------------------- browser RPCs

-- The reports hub's monthly trends (gap/02 R1) as jsonb:
--   { vessels, today, months: ['yyyy-mm-01', … oldest first, p_months],
--     ahead: ['yyyy-mm-01', … p_months, starting with today's month],
--     incidents          { state, vessels, counts[] }            over months
--     corrective_actions { state, vessels, opened[], closed[] }  over months
--     drills             { state, vessels, completed[], overdue[] } over months
--     expiries           { state, vessels, expired, due[] }      over ahead }
-- state ok | no_access | module_off (incidents, corrective actions, drills:
-- the safety module off on every vessel that passes the rule); the other
-- keys only with ok. p_months 3 | 6 | 12, else 22023 invalid_period.
-- Vessels: NULL = the caller's counted vessels (plus fleet-level corrective
-- actions with fleet reach); explicit ids reach-checked (42501
-- vessel_out_of_reach). Inactive caller, no company or no JWT: every series
-- no_access.
CREATE OR REPLACE FUNCTION public.fleet_report_trends(p_vessel_ids uuid[] DEFAULT NULL, p_months integer DEFAULT 6, p_today date DEFAULT current_date)
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
  v_first date;
  v_this date := date_trunc('month', coalesce(p_today, current_date))::date;
  v_months date[];
  v_ahead date[];
  v_no jsonb := jsonb_build_object('state', 'no_access');
  v_off jsonb := jsonb_build_object('state', 'module_off');
  s record;
  v_incidents jsonb;
  v_ca jsonb;
  v_drills jsonb;
  v_expiries jsonb;
BEGIN
  IF p_months IS NULL OR p_months NOT IN (3, 6, 12) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_period', HINT = 'p_months is 3, 6 or 12';
  END IF;
  v_first := (v_this - make_interval(months => p_months - 1))::date;
  v_months := ARRAY(SELECT m::date FROM generate_series(v_first::timestamp, v_this::timestamp, interval '1 month') AS m ORDER BY 1);
  v_ahead := ARRAY(SELECT m::date FROM generate_series(v_this::timestamp, (v_this + make_interval(months => p_months - 1))::timestamp, interval '1 month') AS m ORDER BY 1);

  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('vessels', 0, 'today', v_today, 'months', to_jsonb(v_months), 'ahead', to_jsonb(v_ahead),
      'incidents', v_no, 'corrective_actions', v_no, 'drills', v_no, 'expiries', v_no);
  END IF;

  SELECT * INTO s FROM public.fleet_report_scope_for(v_uid, v_company, p_vessel_ids, v_today);

  -- Incidents per month.
  v_incidents := CASE
    WHEN cardinality(s.incidents) = 0 THEN v_no
    WHEN cardinality(s.incidents_on) = 0 THEN v_off
    ELSE jsonb_build_object(
      'state', 'ok',
      'vessels', cardinality(s.incidents_on),
      'counts', (SELECT jsonb_agg(coalesce(c.n, 0) ORDER BY m.month)
                 FROM unnest(v_months) AS m(month)
                 LEFT JOIN (
                   SELECT date_trunc('month', (i.incident_date AT TIME ZONE 'UTC'))::date AS month, count(*)::int AS n
                   FROM public.incidents AS i
                   WHERE i.company_id = v_company
                     AND i.vessel_id = ANY (s.incidents_on)
                     AND (i.incident_date AT TIME ZONE 'UTC')::date BETWEEN v_first AND v_today
                   GROUP BY 1
                 ) AS c ON c.month = m.month)) END;

  -- Corrective actions opened and closed per month.
  v_ca := CASE
    WHEN cardinality(s.corrective_actions) = 0 AND NOT s.fleet_corrective_actions THEN v_no
    WHEN cardinality(s.corrective_actions_on) = 0 AND NOT s.fleet_corrective_actions THEN v_off
    ELSE (
      WITH ca AS (
        SELECT x.* FROM public.fleet_report_corrective_actions(v_company) AS x
        WHERE (x.vessel_id IS NULL AND s.fleet_corrective_actions) OR x.vessel_id = ANY (s.corrective_actions_on)
      )
      SELECT jsonb_build_object(
        'state', 'ok',
        'vessels', cardinality(s.corrective_actions_on),
        'opened', jsonb_agg((SELECT count(*) FROM ca WHERE date_trunc('month', ca.opened_on)::date = m.month AND ca.opened_on <= v_today)::int ORDER BY m.month),
        'closed', jsonb_agg((SELECT count(*) FROM ca WHERE date_trunc('month', ca.closed_on)::date = m.month AND ca.closed_on <= v_today)::int ORDER BY m.month))
      FROM unnest(v_months) AS m(month)
    ) END;

  -- Drills completed and overdue per month.
  v_drills := CASE
    WHEN cardinality(s.drills) = 0 THEN v_no
    WHEN cardinality(s.drills_on) = 0 THEN v_off
    ELSE (
      WITH d AS (
        SELECT CASE WHEN lower(btrim(coalesce(dr.status, ''))) NOT IN ('cancelled', 'canceled')
                         AND (dr.drill_date_actual IS NOT NULL OR lower(btrim(coalesce(dr.status, ''))) = 'completed')
                    THEN coalesce((dr.drill_date_actual AT TIME ZONE 'UTC')::date, dr.drill_date_scheduled) END AS done_on,
               CASE WHEN public.fleet_dashboard_drill_overdue(dr.status, dr.drill_date_actual, dr.drill_date_scheduled, v_today)
                    THEN dr.drill_date_scheduled END AS overdue_on
        FROM public.drills AS dr
        JOIN public.vessels AS v ON v.id = dr.vessel_id AND v.company_id = v_company
        WHERE dr.vessel_id = ANY (s.drills_on)
      )
      SELECT jsonb_build_object(
        'state', 'ok',
        'vessels', cardinality(s.drills_on),
        'completed', jsonb_agg((SELECT count(*) FROM d WHERE date_trunc('month', d.done_on)::date = m.month AND d.done_on <= v_today)::int ORDER BY m.month),
        'overdue', jsonb_agg((SELECT count(*) FROM d WHERE date_trunc('month', d.overdue_on)::date = m.month)::int ORDER BY m.month))
      FROM unnest(v_months) AS m(month)
    ) END;

  -- Document expiries ahead (the Document alerts item types; muted never count).
  v_expiries := CASE
    WHEN cardinality(s.documents) = 0 THEN v_no
    ELSE (
      WITH e AS (
        SELECT r.expires_on, r.bucket
        FROM public.fleet_expiry_rows_for(v_uid, v_company, s.documents, NULL, false, v_today) AS r
        WHERE r.vessel_id = ANY (s.documents)
          AND r.item_type NOT IN ('insurance_policy', 'contract')
          AND NOT r.alerts_muted
          AND r.expires_on IS NOT NULL
          AND NOT r.no_expiry
      )
      SELECT jsonb_build_object(
        'state', 'ok',
        'vessels', cardinality(s.documents),
        'expired', (SELECT count(*) FROM e WHERE e.expires_on < v_today)::int,
        'due', jsonb_agg((SELECT count(*) FROM e WHERE e.expires_on >= v_today AND date_trunc('month', e.expires_on)::date = m.month)::int ORDER BY m.month))
      FROM unnest(v_ahead) AS m(month)
    ) END;

  RETURN jsonb_build_object(
    'vessels', cardinality(s.vessel_ids),
    'today', v_today,
    'months', to_jsonb(v_months),
    'ahead', to_jsonb(v_ahead),
    'incidents', v_incidents,
    'corrective_actions', v_ca,
    'drills', v_drills,
    'expiries', v_expiries);
END;
$$;

-- One row per vessel the caller may report on (the reports rule; NULL ids:
-- the counted vessels, explicit ids reach-checked, 42501
-- vessel_out_of_reach): particulars (type, flag, class, IMO, LOA, builder,
-- build year), the fleet group, whether it counts in fleet totals, active
-- crew (NULL without the crew list rule on that vessel) and its vessel
-- certificates (NULL without the certificates rule): total, expired,
-- expiring (muted items not counted). Ordered by name. Inactive caller, no
-- company or no JWT: no row (gap/02 R14; used by the Fleet list report).
CREATE OR REPLACE FUNCTION public.fleet_vessel_list(p_vessel_ids uuid[] DEFAULT NULL, p_today date DEFAULT current_date)
RETURNS TABLE (
  vessel_id uuid, vessel_name text, vessel_code text, vessel_type text, flag_state text, classification_society text,
  imo_number text, length_overall numeric, builder text, build_year integer, fleet_group_id uuid, fleet_group_name text,
  is_counted boolean, active_crew integer, certificates_total integer, certificates_expired integer, certificates_expiring integer
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
  v_today date := coalesce(p_today, current_date);
  s record;
BEGIN
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO s FROM public.fleet_report_scope_for(v_uid, v_company, p_vessel_ids, v_today);
  IF cardinality(s.vessel_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
    WITH crew AS (
      SELECT c.vessel_id, count(*)::int AS n
      FROM public.fleet_current_crew(s.crew_list) AS c
      WHERE cardinality(s.crew_list) > 0 AND NOT c.is_planned
      GROUP BY c.vessel_id
    ),
    certs AS (
      SELECT r.vessel_id,
             count(*)::int AS total,
             count(*) FILTER (WHERE NOT r.alerts_muted AND r.bucket = 'expired')::int AS expired,
             count(*) FILTER (WHERE NOT r.alerts_muted AND r.bucket IN ('expiring_soon', 'expiring'))::int AS expiring
      FROM public.fleet_expiry_rows_for(v_uid, v_company, s.certificates, ARRAY['vessel_certificates'], false, v_today) AS r
      WHERE cardinality(s.certificates) > 0 AND r.vessel_id = ANY (s.certificates)
      GROUP BY r.vessel_id
    )
    SELECT v.id,
           v.name::text,
           v.code::text,
           v.vessel_type::text,
           v.flag_state::text,
           v.classification_society::text,
           v.imo_number::text,
           v.length_overall::numeric,
           v.builder::text,
           v.build_year::integer,
           fg.id,
           fg.name::text,
           v.is_counted,
           CASE WHEN v.id = ANY (s.crew_list) THEN coalesce(crew.n, 0) END,
           CASE WHEN v.id = ANY (s.certificates) THEN coalesce(certs.total, 0) END,
           CASE WHEN v.id = ANY (s.certificates) THEN coalesce(certs.expired, 0) END,
           CASE WHEN v.id = ANY (s.certificates) THEN coalesce(certs.expiring, 0) END
    FROM public.vessels AS v
    LEFT JOIN public.fleet_groups AS fg ON fg.id = v.fleet_group_id AND fg.company_id = v.company_id
    LEFT JOIN crew ON crew.vessel_id = v.id
    LEFT JOIN certs ON certs.vessel_id = v.id
    WHERE v.id = ANY (s.vessel_ids) AND v.company_id = v_company
    ORDER BY v.name, v.id;
END;
$$;

-- ---------------------------------------------------------------- grants and comments

REVOKE ALL ON FUNCTION public.fleet_report_gate_can_for(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_scope_for(uuid, uuid, uuid[], date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_corrective_actions(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_trends(uuid[], integer, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_vessel_list(uuid[], date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fleet_report_gate_can_for(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_scope_for(uuid, uuid, uuid[], date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_corrective_actions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_trends(uuid[], integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_vessel_list(uuid[], date) TO authenticated;

COMMENT ON FUNCTION public.fleet_report_gate_can_for(uuid, uuid, uuid, text) IS 'Whether the user may read one fleet report series'' data on a vessel (NULL: fleet-level data, needs fleet reach): incidents = the adaptor''s rbac rule at view for incidents (nav ism): full access, the RBAC module, else canAccessModule(ism); crew_list = has_capability_for vessel.crew.crew_list.view; corrective_actions, drills = fleet_dashboard_tile_can_for (D-04). False when inactive, outside the company, out of reach or for an unknown gate. Internal (service role; the report definers).';
COMMENT ON FUNCTION public.fleet_report_scope_for(uuid, uuid, uuid[], date) IS 'The vessels a fleet report read covers (fleet_counted_vessels_for and the reports gate fleet_ops_can reports view; 42501 vessel_out_of_reach for explicit ids out of reach) and, per series, which of them it may count (incidents, corrective actions and drills, each with the safety module; expiry read areas; certificates; crew list), as arrays that are never NULL; fleet_level and fleet_corrective_actions only with NULL ids and fleet reach. Internal (service role; the report definers).';
COMMENT ON FUNCTION public.fleet_report_corrective_actions(uuid) IS 'Every corrective action of the company with its vessel (the incident''s, else the audit finding''s audit''s; NULL = fleet-level), its opened day (created_at, UTC) and its closed day (status Closed: verification date, else completion date, else the last update). Actions whose incident or audit is another company''s are left out. Internal (service role; fleet_report_trends).';
COMMENT ON FUNCTION public.fleet_report_trends(uuid[], integer, date) IS 'The fleet reports hub trends (gap/02 R1) as jsonb { vessels, today, months, ahead, incidents { counts }, corrective_actions { opened, closed }, drills { completed, overdue }, expiries { expired, due } }: the series over the p_months (3 | 6 | 12, else 22023 invalid_period) calendar months ending with today''s month, document expiries over the p_months months starting with it; each series state ok | no_access | module_off (safety off), never zeros it did not count. Vessels: NULL = the caller''s counted vessels plus fleet-level corrective actions with fleet reach; explicit ids reach-checked (42501 vessel_out_of_reach). Inactive caller, no company or no JWT: every series no_access.';
COMMENT ON FUNCTION public.fleet_vessel_list(uuid[], date) IS 'One row per vessel of the caller''s counted vessels or the explicit, reach-checked ids (42501 vessel_out_of_reach) that pass the reports rule (gap/02 R14): type, flag, class, IMO, LOA, builder, build year, fleet group, is_counted, active crew (current, not planned; NULL without vessel.crew.crew_list.view) and vessel certificates total / expired / expiring (NULL without the certificates read). Inactive caller, no company or no JWT: no row.';
