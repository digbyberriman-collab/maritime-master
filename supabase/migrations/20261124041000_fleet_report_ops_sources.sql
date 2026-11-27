-- =================================================================
-- FLEET OPERATIONS X5-10B: the operations reports' numbers
-- (gap/02 R7, R13, R17, R18, T-248; DECISIONS C12, D-01, D-04, D-123,
-- D-157; X5 spec §2 X5-10B, D-X5-09, D-X5-21, D-X5-22)
-- Functions (browser): fleet_report_overdue_drills, fleet_report_insurance,
--   fleet_report_audits, fleet_report_work_list
-- Functions (service role; the four above): fleet_report_ops_scope_for,
--   and the pure rules fleet_report_drill_interval_state,
--   fleet_report_audit_state
-- TS mirrors: src/modules/reports/types/db.pending.ts (the jsonb shapes),
--   src/modules/reports/lib/opsReports.ts (the interval and audit-state
--   rules; the cases tables of
--   supabase/tests/sql/fleet/report_ops_sources.test.sql are asserted by
--   src/test/reports/{overdueDrills,auditsSurveys}.test.tsx)
-- =================================================================
--
-- Four server answers for the fleet operations reports, so the browser
-- never sums rows or reads a safety, insurance or technical table directly:
--
--   fleet_report_overdue_drills(p_vessel_ids, p_today)     R7  Overdue drills
--   fleet_report_insurance(p_vessel_ids, p_today)          R13 Insurance
--   fleet_report_audits(p_vessel_ids, p_from, p_to, p_today)
--                                                          R17 Audits and surveys
--   fleet_report_work_list(p_vessel_ids, p_today)          R18 Work list
--
-- Vessels (D-X5-09, D-X5-22): fleet_counted_vessels_for(); NULL ids are
-- every counted vessel the caller reaches, explicit ids are reach-checked
-- (42501 vessel_out_of_reach, the whole read refused) and not
-- counted-filtered. Each vessel must also pass the reports rule
-- (fleet_ops_can_for 'reports' view, the route's
-- fleet.operations.fleet_reports.view). Then, per vessel and computed once
-- (fleet_report_ops_scope_for), each report's own data rule, the one the
-- client adaptor uses for the report's capability (D-04), and the vessel
-- module setting of that data:
--
--   R7  vessel.safety.drills.view           fleet_dashboard_tile_can_for
--                                           'drills' (040100); safety on
--   R13 vessel.management.office_insurance  fleet_ops_can_for 'insurance'
--       .view                               (040000); no module setting
--   R17 vessel.safety.audits_surveys.view   fleet_dashboard_tile_can_for
--                                           'audits_surveys'; safety on;
--       certificate surveys                 fleet_ops_can_for 'certificates'
--   R18 vessel.technical.tasks.view         fleet_dashboard_tile_can_for
--                                           'technical'; technical.jobs on
--                                           (a dotted key inherits
--                                           'technical', so either off turns
--                                           the work list off)
--
-- A vessel that fails its report's rule is listed with state 'no_access',
-- one whose module is off with 'module_off', and its numbers are NULL or
-- absent: never zeros the report did not count. Inactive callers, callers
-- with no company and anon get an empty answer.
--
-- Fleet-level items (D-X5-21): fleet insurance policies (vessel_id NULL) and
-- company audits (vessel_id NULL) are listed only for the default
-- fleet-wide read (NULL ids) by a caller with fleet reach who passes the
-- reports rule and the item's own rule at fleet level. An explicit vessel
-- list shows those vessels and nothing else.
--
-- Definitions:
--   R7 Overdue drills, one row per fact (kind):
--     missed     a scheduled drill not carried out by its date: status
--                Scheduled (or the legacy 'overdue'), no actual date,
--                scheduled before p_today (fleet_dashboard_drill_overdue,
--                the dashboard's overdue drills: the same rows)
--     lapsed     an active required drill type (category SOLAS_Required or
--                Company_Required) whose interval (minimum_frequency days)
--                has run out since the last drill of that type carried out
--                on the vessel: due day = last + interval, before p_today
--     due_soon   the same, due within the next 7 days (the due day itself
--                counts, 0 days left)
--     never      an active required drill type with no drill of that type
--                ever carried out on the vessel (no due day)
--   A drill is carried out when it has an actual date or status Completed
--   (never Cancelled), on its actual day (UTC), else its scheduled day.
--   Each interval row names the next drill of the type scheduled on or
--   after p_today, if any (fleet_report_drill_interval_state is the rule).
--   R13 Insurance: every policy the expiry engine lists (not archived or
--   cancelled; source insurance_policies), with its expiry bucket and
--   window from the engine (expiry_window_rules, insurance_policy), its
--   type, insurer, policy number, cover dates, status and whether a
--   certificate is on file. Amounts, premiums, contacts and notes are never
--   read.
--   R17 Audits and surveys over p_from .. p_to (default today - 365 ..
--   today + 90; p_from after p_to is 22023 invalid_period, more than 731
--   days 22023 period_too_long, checked before anything else):
--     audits     dated (actual start, else scheduled) inside the period, and
--                every overdue or in-progress audit whatever its date; state
--                (fleet_report_audit_state): done (Completed / Closed),
--                cancelled, in_progress, overdue (open and dated before
--                p_today), due; outcome, auditor (organisation and name, or
--                the lead auditor), findings: total, open (not Closed),
--                major and minor non-conformities, observations
--     surveys    vessel certificates (not superseded) whose next survey
--                falls inside the period: overdue when before p_today
--   R18 Work list, per vessel: jobs (maintenance_tasks through
--   equipment.vessel_id) by fleet_dashboard_job_state: open, overdue,
--   awaiting approval, due within 30 days (open, not overdue), high or
--   urgent open, completed in the last 30 days, and the open jobs by status
--   ("chips": overdue, awaiting approval, then the live status of the
--   rest); plus the overdue jobs, most overdue first (200 named, with the
--   total). Costs are not recorded on jobs, so there is no cost column.
--
-- Nothing here is live (D-01): the reports read these RPCs through the
-- pending shim; while they are missing each report says it is not set up
-- yet. Applying it changes nothing users see today: no live table, policy
-- or function is touched. Idempotent (D-12): CREATE OR REPLACE for every
-- function; the file refuses to run (55000) without the fleet expiry
-- engine (040000), the dashboard's gates (040100) and the platform helpers.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.fleet_counted_vessels_for(uuid,uuid,uuid[])') IS NULL
     OR to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_expiry_rows_for(uuid,uuid,uuid[],text[],boolean,date)') IS NULL
     OR to_regclass('public.expiry_sources') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124041000_fleet_report_ops_sources needs the fleet expiry engine and access helpers: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.fleet_dashboard_tile_can_for(uuid,uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.fleet_dashboard_drill_overdue(text,timestamptz,date,date)') IS NULL
     OR to_regprocedure('public.fleet_dashboard_job_state(text,date,date)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124041000_fleet_report_ops_sources needs the dashboard gates and rules: apply 20261124040100_fleet_dashboard_kpis.sql first';
  END IF;
  IF to_regprocedure('public.vessel_module_on_internal(uuid,text,date)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124041000_fleet_report_ops_sources needs vessel_module_on_internal (20261123000500) and the user status helpers (20261123010000)';
  END IF;
  IF to_regclass('public.drills') IS NULL OR to_regclass('public.drill_types') IS NULL
     OR to_regclass('public.insurance_policies') IS NULL OR to_regclass('public.audits') IS NULL
     OR to_regclass('public.audit_findings') IS NULL OR to_regclass('public.certificates') IS NULL
     OR to_regclass('public.maintenance_tasks') IS NULL OR to_regclass('public.equipment') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124041000_fleet_report_ops_sources needs the live drills, insurance, audit, certificate and technical tables';
  END IF;
END
$$;

-- ---------------------------------------------------------------- pure rules (internal; TS lib/opsReports.ts)

-- drill-interval-rules:start (mirrored by drillIntervalState in src/modules/reports/lib/opsReports.ts)
-- A required drill type's state on a vessel on a day (gap/02 R7): 'never'
-- (no drill of the type carried out), 'lapsed' (the due day, the last
-- drill + the interval in days, is before the day), 'due_soon' (due within
-- 7 days; the due day itself counts, 0 days left), else 'on_track'; NULL
-- for no interval (missing or under one day) or no day. Pure. Every
-- fleet_report_* function is a definer with a pinned search_path (X5-03A's
-- reports_hub invariant), the pure helpers included; they are executable
-- by the service role only.
CREATE OR REPLACE FUNCTION public.fleet_report_drill_interval_state(_last_done date, _frequency_days integer, _today date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _frequency_days IS NULL OR _frequency_days < 1 OR _today IS NULL THEN NULL
    WHEN _last_done IS NULL THEN 'never'
    WHEN _last_done + _frequency_days < _today THEN 'lapsed'
    WHEN _last_done + _frequency_days <= _today + 7 THEN 'due_soon'
    ELSE 'on_track'
  END
$$;
-- drill-interval-rules:end

-- audit-state-rules:start (mirrored by auditState in src/modules/reports/lib/opsReports.ts)
-- An audit's (or a survey's) state on a day (gap/02 R17) from its live
-- status and its date: 'cancelled' (Cancelled), 'done' (Completed or
-- Closed), 'in_progress' (In progress), 'overdue' (any other status, or
-- none, dated before the day), else 'due'. Status words compare
-- case-insensitively with spaces and dashes as underscores (the live values
-- are Planned, In_Progress, Completed, Closed). Pure.
CREATE OR REPLACE FUNCTION public.fleet_report_audit_state(_status text, _on date, _today date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.st IN ('cancelled', 'canceled') THEN 'cancelled'
    WHEN s.st IN ('completed', 'closed') THEN 'done'
    WHEN s.st = 'in_progress' THEN 'in_progress'
    WHEN _on IS NOT NULL AND _today IS NOT NULL AND _on < _today THEN 'overdue'
    ELSE 'due'
  END
  FROM (SELECT lower(regexp_replace(btrim(coalesce(_status, '')), '[[:space:]-]+', '_', 'g')) AS st) AS s
$$;
-- audit-state-rules:end

-- ---------------------------------------------------------------- scope (internal)

-- The vessels an operations report read covers and, per report, which of
-- them it may count, as one row of arrays (never NULL; '{}' when none):
--   vessel_ids        fleet_counted_vessels_for() ∩ the reports rule
--   drills            ∩ the drills gate; drills_on: and safety on (_today)
--   insurance         ∩ fleet_ops_can 'insurance' view
--   audits            ∩ the audits and surveys gate; audits_on: and safety on
--   certificates      ∩ fleet_ops_can 'certificates' view (survey dates)
--   technical         ∩ the jobs gate; technical_on: and technical.jobs on
--   fleet_insurance   NULL ids, and the reports and insurance rules at fleet
--                     level (fleet reach): fleet policies are listed
--   fleet_audits      NULL ids, and the reports and audits rules at fleet
--                     level: company audits are listed
-- Explicit ids out of reach raise 42501 vessel_out_of_reach (through
-- fleet_counted_vessels_for). An inactive user or another company: every
-- array empty, every flag false. Internal (service role; the report
-- definers).
CREATE OR REPLACE FUNCTION public.fleet_report_ops_scope_for(_user_id uuid, _company_id uuid, _vessel_ids uuid[], _today date)
RETURNS TABLE (
  vessel_ids uuid[], drills uuid[], drills_on uuid[], insurance uuid[], audits uuid[], audits_on uuid[],
  certificates uuid[], technical uuid[], technical_on uuid[], fleet_insurance boolean, fleet_audits boolean
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
  v_fleet boolean;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL
     OR NOT coalesce(public.user_is_active(_user_id), false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = _company_id) THEN
    RETURN QUERY SELECT v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, v_none, false, false;
    RETURN;
  END IF;

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
             coalesce(public.fleet_dashboard_tile_can_for(_user_id, _company_id, r.id, 'drills'), false) AS drl,
             coalesce(public.vessel_module_on_internal(r.id, 'safety', v_today), false) AS safety_on,
             coalesce(public.fleet_ops_can_for(_user_id, _company_id, r.id, 'insurance', 'view'), false) AS ins,
             coalesce(public.fleet_dashboard_tile_can_for(_user_id, _company_id, r.id, 'audits_surveys'), false) AS aud,
             coalesce(public.fleet_ops_can_for(_user_id, _company_id, r.id, 'certificates', 'view'), false) AS cert,
             coalesce(public.fleet_dashboard_tile_can_for(_user_id, _company_id, r.id, 'technical'), false) AS tech,
             coalesce(public.vessel_module_on_internal(r.id, 'technical.jobs', v_today), false) AS jobs_on
      FROM rep AS r
    )
    SELECT coalesce(array_agg(g.id ORDER BY g.id), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.drl), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.drl AND g.safety_on), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.ins), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.aud), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.aud AND g.safety_on), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.cert), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.tech), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.tech AND g.jobs_on), v_none),
           v_fleet AND coalesce(public.fleet_ops_can_for(_user_id, _company_id, NULL, 'insurance', 'view'), false),
           v_fleet AND coalesce(public.fleet_dashboard_tile_can_for(_user_id, _company_id, NULL, 'audits_surveys'), false)
    FROM g;
END;
$$;

-- ---------------------------------------------------------------- R7 overdue drills

-- The overdue drills report (gap/02 R7) as jsonb { today, required_types,
-- vessels [{ vessel_id, vessel_name, vessel_code, state ok | no_access |
-- module_off }], rows [{ kind missed | lapsed | due_soon | never,
-- vessel_id, drill_type_id, drill_type, category, frequency_days,
-- solas_reference, drill_id, drill_number, status, due_on, days_overdue
-- (p_today - due_on; NULL for never), last_done_on, next_scheduled_on }] }:
-- missed and lapsed first, most overdue first, then due soon (soonest
-- first), then never; by vessel and drill type within each. rows is [] when
-- no vessel is covered.
CREATE OR REPLACE FUNCTION public.fleet_report_overdue_drills(p_vessel_ids uuid[] DEFAULT NULL, p_today date DEFAULT current_date)
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
  s record;
  v_rows jsonb := '[]'::jsonb;
  v_vessels jsonb;
  v_types integer;
BEGIN
  SELECT count(*) INTO v_types FROM public.drill_types AS dt
  WHERE dt.is_active AND lower(btrim(coalesce(dt.category, ''))) IN ('solas_required', 'company_required')
    AND dt.minimum_frequency >= 1;

  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('today', v_today, 'required_types', v_types, 'vessels', '[]'::jsonb, 'rows', '[]'::jsonb);
  END IF;
  SELECT * INTO s FROM public.fleet_report_ops_scope_for(v_uid, v_company, p_vessel_ids, v_today);

  IF cardinality(s.drills_on) > 0 THEN
    WITH dr AS (
      SELECT d.id, d.vessel_id, d.drill_type_id, d.drill_number, d.status, d.drill_date_scheduled, d.drill_date_actual,
             lower(btrim(coalesce(d.status, ''))) AS st
      FROM public.drills AS d
      JOIN public.vessels AS v ON v.id = d.vessel_id AND v.company_id = v_company
      WHERE d.vessel_id = ANY (s.drills_on)
    ),
    done AS (
      SELECT dr.vessel_id, dr.drill_type_id,
             max(coalesce((dr.drill_date_actual AT TIME ZONE 'UTC')::date, dr.drill_date_scheduled)) AS last_done_on
      FROM dr
      WHERE dr.st NOT IN ('cancelled', 'canceled') AND (dr.drill_date_actual IS NOT NULL OR dr.st = 'completed')
      GROUP BY dr.vessel_id, dr.drill_type_id
    ),
    missed AS (
      -- A missed drill also says when its type was last carried out on that vessel.
      SELECT 'missed'::text AS kind, dr.vessel_id, dr.drill_type_id, dr.id AS drill_id, dr.drill_number, dr.status,
             dr.drill_date_scheduled AS due_on, done.last_done_on, NULL::date AS next_on
      FROM dr
      LEFT JOIN done ON done.vessel_id = dr.vessel_id AND done.drill_type_id = dr.drill_type_id
      WHERE public.fleet_dashboard_drill_overdue(dr.status, dr.drill_date_actual, dr.drill_date_scheduled, v_today)
    ),
    planned AS (
      SELECT dr.vessel_id, dr.drill_type_id, min(dr.drill_date_scheduled) AS next_on
      FROM dr
      WHERE dr.drill_date_actual IS NULL AND dr.st NOT IN ('completed', 'cancelled', 'canceled')
        AND dr.drill_date_scheduled >= v_today
      GROUP BY dr.vessel_id, dr.drill_type_id
    ),
    req AS (
      SELECT v.id AS vessel_id, dt.id AS drill_type_id, dt.minimum_frequency, done.last_done_on, planned.next_on,
             public.fleet_report_drill_interval_state(done.last_done_on, dt.minimum_frequency, v_today) AS istate
      FROM unnest(s.drills_on) AS v(id)
      CROSS JOIN public.drill_types AS dt
      LEFT JOIN done ON done.vessel_id = v.id AND done.drill_type_id = dt.id
      LEFT JOIN planned ON planned.vessel_id = v.id AND planned.drill_type_id = dt.id
      WHERE dt.is_active AND lower(btrim(coalesce(dt.category, ''))) IN ('solas_required', 'company_required')
        AND dt.minimum_frequency >= 1
    ),
    allrows AS (
      SELECT * FROM missed
      UNION ALL
      SELECT req.istate, req.vessel_id, req.drill_type_id, NULL::uuid, NULL::text, NULL::text,
             CASE WHEN req.last_done_on IS NOT NULL THEN req.last_done_on + req.minimum_frequency END,
             req.last_done_on, req.next_on
      FROM req
      WHERE req.istate IN ('lapsed', 'due_soon', 'never')
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'kind', a.kind, 'vessel_id', a.vessel_id, 'drill_type_id', a.drill_type_id,
             'drill_type', dt.drill_name, 'category', dt.category, 'frequency_days', dt.minimum_frequency,
             'solas_reference', nullif(btrim(coalesce(dt.solas_reference, '')), ''),
             'drill_id', a.drill_id, 'drill_number', nullif(btrim(coalesce(a.drill_number, '')), ''), 'status', a.status,
             'due_on', a.due_on, 'days_overdue', CASE WHEN a.due_on IS NOT NULL THEN v_today - a.due_on END,
             'last_done_on', a.last_done_on, 'next_scheduled_on', a.next_on)
           ORDER BY CASE a.kind WHEN 'due_soon' THEN 1 WHEN 'never' THEN 2 ELSE 0 END,
                    (v_today - a.due_on) DESC NULLS LAST, v.name, dt.drill_name, a.drill_number NULLS FIRST, a.vessel_id, a.drill_id), '[]'::jsonb)
      INTO v_rows
    FROM allrows AS a
    JOIN public.drill_types AS dt ON dt.id = a.drill_type_id
    JOIN public.vessels AS v ON v.id = a.vessel_id;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'vessel_id', v.id, 'vessel_name', v.name, 'vessel_code', v.code,
           'state', CASE WHEN NOT (v.id = ANY (s.drills)) THEN 'no_access'
                         WHEN NOT (v.id = ANY (s.drills_on)) THEN 'module_off'
                         ELSE 'ok' END)
         ORDER BY v.name, v.id), '[]'::jsonb)
    INTO v_vessels
  FROM public.vessels AS v
  WHERE v.id = ANY (s.vessel_ids) AND v.company_id = v_company;

  RETURN jsonb_build_object('today', v_today, 'required_types', v_types, 'vessels', v_vessels, 'rows', v_rows);
END;
$$;

-- ---------------------------------------------------------------- R13 insurance

-- The insurance report (gap/02 R13) as jsonb { today, vessels [{ vessel_id,
-- vessel_name, vessel_code, state ok | no_access }], fleet_level (fleet
-- policies are listed), rows [{ policy_id, vessel_id (NULL = a fleet
-- policy), policy_type, insurer, policy_number, coverage_start,
-- coverage_end, days_remaining, bucket, window_days, status,
-- certificate_on_file }] }: most urgent bucket first (expired, expiring
-- soon, expiring, valid), then by coverage end. Buckets and windows come
-- from the expiry engine (source insurance_policies).
CREATE OR REPLACE FUNCTION public.fleet_report_insurance(p_vessel_ids uuid[] DEFAULT NULL, p_today date DEFAULT current_date)
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
  s record;
  v_rows jsonb := '[]'::jsonb;
  v_vessels jsonb;
BEGIN
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('today', v_today, 'vessels', '[]'::jsonb, 'fleet_level', false, 'rows', '[]'::jsonb);
  END IF;
  SELECT * INTO s FROM public.fleet_report_ops_scope_for(v_uid, v_company, p_vessel_ids, v_today);

  IF cardinality(s.insurance) > 0 OR s.fleet_insurance THEN
    WITH pol AS (
      SELECT r.record_id, r.vessel_id, r.expires_on, r.days_remaining, r.bucket, r.window_days
      FROM public.fleet_expiry_rows_for(v_uid, v_company, s.insurance, ARRAY['insurance_policies'], s.fleet_insurance, v_today) AS r
      WHERE r.item_type = 'insurance_policy'
        AND (r.vessel_id = ANY (s.insurance) OR (r.vessel_id IS NULL AND s.fleet_insurance))
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'policy_id', ip.id, 'vessel_id', pol.vessel_id,
             'policy_type', nullif(btrim(coalesce(ip.policy_type, '')), ''),
             'insurer', nullif(btrim(coalesce(ip.insurer_name, '')), ''),
             'policy_number', nullif(btrim(coalesce(ip.policy_number, '')), ''),
             'coverage_start', ip.coverage_start_date, 'coverage_end', pol.expires_on,
             'days_remaining', pol.days_remaining, 'bucket', pol.bucket, 'window_days', pol.window_days,
             'status', ip.status,
             'certificate_on_file', nullif(btrim(coalesce(ip.certificate_url, '')), '') IS NOT NULL)
           ORDER BY CASE pol.bucket WHEN 'expired' THEN 0 WHEN 'expiring_soon' THEN 1 WHEN 'expiring' THEN 2 WHEN 'valid' THEN 3 ELSE 4 END,
                    pol.expires_on NULLS LAST, v.name NULLS FIRST, ip.policy_type, ip.id), '[]'::jsonb)
      INTO v_rows
    FROM pol
    JOIN public.insurance_policies AS ip ON ip.id = pol.record_id AND ip.company_id = v_company
    LEFT JOIN public.vessels AS v ON v.id = pol.vessel_id;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'vessel_id', v.id, 'vessel_name', v.name, 'vessel_code', v.code,
           'state', CASE WHEN v.id = ANY (s.insurance) THEN 'ok' ELSE 'no_access' END)
         ORDER BY v.name, v.id), '[]'::jsonb)
    INTO v_vessels
  FROM public.vessels AS v
  WHERE v.id = ANY (s.vessel_ids) AND v.company_id = v_company;

  RETURN jsonb_build_object('today', v_today, 'vessels', v_vessels, 'fleet_level', s.fleet_insurance, 'rows', v_rows);
END;
$$;

-- ---------------------------------------------------------------- R17 audits and surveys

-- The audits and surveys report (gap/02 R17) over p_from .. p_to as jsonb
-- { from, to, today, vessels [{ vessel_id, vessel_name, vessel_code, state
-- ok | no_access | module_off (audits), surveys_state ok | no_access }],
-- fleet_level (company audits are listed), rows [{ kind audit |
-- certificate_survey, id, vessel_id (NULL = a company audit), reference,
-- title, scope, status, state, outcome, scheduled_on, started_on,
-- ended_on, on_date, days (on_date - p_today), auditor_org, auditor_name,
-- lead_auditor, findings { total, open, major, minor, observations }
-- (NULL for a survey) }] }: overdue first (oldest first), then in
-- progress, then due (soonest first), then done and cancelled (most recent
-- first).
CREATE OR REPLACE FUNCTION public.fleet_report_audits(p_vessel_ids uuid[] DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_today date DEFAULT current_date)
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
  v_from date := coalesce(p_from, coalesce(p_today, current_date) - 365);
  v_to date := coalesce(p_to, coalesce(p_today, current_date) + 90);
  s record;
  v_rows jsonb := '[]'::jsonb;
  v_vessels jsonb;
BEGIN
  IF v_from > v_to THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_period', DETAIL = 'The period must start on or before its last day.';
  END IF;
  IF v_to - v_from + 1 > 731 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_too_long', DETAIL = 'Choose a period of at most 731 days.';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('from', v_from, 'to', v_to, 'today', v_today, 'vessels', '[]'::jsonb, 'fleet_level', false, 'rows', '[]'::jsonb);
  END IF;
  SELECT * INTO s FROM public.fleet_report_ops_scope_for(v_uid, v_company, p_vessel_ids, v_today);

  IF cardinality(s.audits_on) > 0 OR cardinality(s.certificates) > 0 OR s.fleet_audits THEN
    WITH au AS (
      SELECT a.id, a.vessel_id, a.audit_number, a.audit_type, a.audit_scope, a.status, a.overall_result,
             a.scheduled_date, a.actual_start_date, a.actual_end_date, a.external_auditor_org, a.external_auditor_name,
             a.lead_auditor_id,
             coalesce(a.actual_start_date, a.scheduled_date) AS on_date,
             public.fleet_report_audit_state(a.status, coalesce(a.actual_start_date, a.scheduled_date), v_today) AS state
      FROM public.audits AS a
      WHERE a.company_id = v_company
        AND (a.vessel_id = ANY (s.audits_on) OR (a.vessel_id IS NULL AND s.fleet_audits))
    ),
    aud AS (
      SELECT au.* FROM au WHERE au.on_date BETWEEN v_from AND v_to OR au.state IN ('overdue', 'in_progress')
    ),
    f AS (
      SELECT af.audit_id,
             count(*) AS total,
             count(*) FILTER (WHERE lower(btrim(coalesce(af.status, ''))) <> 'closed') AS open_n,
             count(*) FILTER (WHERE lower(btrim(coalesce(af.finding_type, ''))) = 'major_nc') AS major,
             count(*) FILTER (WHERE lower(btrim(coalesce(af.finding_type, ''))) = 'minor_nc') AS minor,
             count(*) FILTER (WHERE lower(btrim(coalesce(af.finding_type, ''))) = 'observation') AS observations
      FROM public.audit_findings AS af
      WHERE af.audit_id IN (SELECT aud.id FROM aud)
      GROUP BY af.audit_id
    ),
    rowsets AS (
      SELECT 'audit'::text AS kind, aud.id, aud.vessel_id, nullif(btrim(coalesce(aud.audit_number, '')), '') AS reference,
             nullif(btrim(coalesce(aud.audit_type, '')), '') AS title, nullif(btrim(coalesce(aud.audit_scope, '')), '') AS scope,
             aud.status, aud.state, nullif(btrim(coalesce(aud.overall_result, '')), '') AS outcome,
             aud.scheduled_date AS scheduled_on, aud.actual_start_date AS started_on, aud.actual_end_date AS ended_on, aud.on_date,
             nullif(btrim(coalesce(aud.external_auditor_org, '')), '') AS auditor_org,
             nullif(btrim(coalesce(aud.external_auditor_name, '')), '') AS auditor_name,
             nullif(btrim(coalesce(lp.first_name, '') || ' ' || coalesce(lp.last_name, '')), '') AS lead_auditor,
             jsonb_build_object('total', coalesce(f.total, 0), 'open', coalesce(f.open_n, 0), 'major', coalesce(f.major, 0),
                                'minor', coalesce(f.minor, 0), 'observations', coalesce(f.observations, 0)) AS findings
      FROM aud
      LEFT JOIN f ON f.audit_id = aud.id
      LEFT JOIN public.profiles AS lp ON lp.user_id = aud.lead_auditor_id AND lp.company_id = v_company
      UNION ALL
      SELECT 'certificate_survey'::text, c.id, c.vessel_id, nullif(btrim(coalesce(c.certificate_number, '')), ''),
             nullif(btrim(coalesce(c.certificate_name, '')), ''), nullif(btrim(coalesce(c.certificate_type, '')), ''),
             NULL::text, public.fleet_report_audit_state(NULL, c.next_survey_date, v_today), NULL::text,
             c.next_survey_date, NULL::date, NULL::date, c.next_survey_date,
             nullif(btrim(coalesce(c.issuing_authority, '')), ''), NULL::text, NULL::text, NULL::jsonb
      FROM public.certificates AS c
      WHERE c.company_id = v_company
        AND c.vessel_id = ANY (s.certificates)
        AND c.superseded_by IS NULL AND c.status IS DISTINCT FROM 'Superseded'
        AND c.next_survey_date BETWEEN v_from AND v_to
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'kind', r.kind, 'id', r.id, 'vessel_id', r.vessel_id, 'reference', r.reference, 'title', r.title, 'scope', r.scope,
             'status', r.status, 'state', r.state, 'outcome', r.outcome,
             'scheduled_on', r.scheduled_on, 'started_on', r.started_on, 'ended_on', r.ended_on, 'on_date', r.on_date,
             'days', r.on_date - v_today,
             'auditor_org', r.auditor_org, 'auditor_name', r.auditor_name, 'lead_auditor', r.lead_auditor,
             'findings', r.findings)
           ORDER BY CASE r.state WHEN 'overdue' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'due' THEN 2 ELSE 3 END,
                    CASE WHEN r.state IN ('overdue', 'in_progress', 'due') THEN r.on_date END ASC NULLS LAST,
                    r.on_date DESC, v.name NULLS FIRST, r.kind, r.reference NULLS LAST, r.id), '[]'::jsonb)
      INTO v_rows
    FROM rowsets AS r
    LEFT JOIN public.vessels AS v ON v.id = r.vessel_id;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'vessel_id', v.id, 'vessel_name', v.name, 'vessel_code', v.code,
           'state', CASE WHEN NOT (v.id = ANY (s.audits)) THEN 'no_access'
                         WHEN NOT (v.id = ANY (s.audits_on)) THEN 'module_off'
                         ELSE 'ok' END,
           'surveys_state', CASE WHEN v.id = ANY (s.certificates) THEN 'ok' ELSE 'no_access' END)
         ORDER BY v.name, v.id), '[]'::jsonb)
    INTO v_vessels
  FROM public.vessels AS v
  WHERE v.id = ANY (s.vessel_ids) AND v.company_id = v_company;

  RETURN jsonb_build_object('from', v_from, 'to', v_to, 'today', v_today, 'vessels', v_vessels,
                            'fleet_level', s.fleet_audits, 'rows', v_rows);
END;
$$;

-- ---------------------------------------------------------------- R18 work list

-- The work list report (gap/02 R18) as jsonb { today, vessels [{
-- vessel_id, vessel_name, vessel_code, state ok | no_access | module_off,
-- open, overdue, pending_approval, due_30, high_priority, completed_30,
-- statuses { overdue, pending_approval, <live status>: n } }] (NULL numbers
-- and statuses where not covered), totals (NULL when no vessel is covered)
-- { vessels_covered, open, overdue, pending_approval, due_30,
-- high_priority, completed_30 }, overdue { total, rows [{ job_id,
-- vessel_id, task_number, task_name, equipment_name, priority, status,
-- due_date, days_overdue }] (most overdue first, at most 200) } }. Costs
-- are not recorded on jobs.
CREATE OR REPLACE FUNCTION public.fleet_report_work_list(p_vessel_ids uuid[] DEFAULT NULL, p_today date DEFAULT current_date)
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
  s record;
  v_vessels jsonb;
  v_totals jsonb;
  v_overdue jsonb;
BEGIN
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('today', v_today, 'vessels', '[]'::jsonb, 'totals', NULL,
                              'overdue', jsonb_build_object('total', 0, 'rows', '[]'::jsonb));
  END IF;
  SELECT * INTO s FROM public.fleet_report_ops_scope_for(v_uid, v_company, p_vessel_ids, v_today);

  WITH jobs AS (
    SELECT e.vessel_id, mt.id AS job_id, mt.task_number, mt.task_name, e.equipment_name, mt.priority, mt.status, mt.due_date,
           (mt.actual_completion_date AT TIME ZONE 'UTC')::date AS completed_on,
           j.st,
           CASE WHEN j.st IN ('overdue', 'pending_approval') THEN j.st
                ELSE coalesce(nullif(lower(regexp_replace(btrim(coalesce(mt.status, '')), '[[:space:]-]+', '_', 'g')), ''), 'open') END AS chip,
           lower(btrim(coalesce(mt.priority, ''))) AS pr
    FROM public.equipment AS e
    JOIN public.vessels AS v ON v.id = e.vessel_id AND v.company_id = v_company
    JOIN public.maintenance_tasks AS mt ON mt.equipment_id = e.id
    CROSS JOIN LATERAL (SELECT public.fleet_dashboard_job_state(mt.status, mt.due_date, v_today) AS st) AS j
    WHERE e.vessel_id = ANY (s.technical_on)
  ),
  per AS (
    SELECT x.id AS vessel_id,
           count(j.job_id) FILTER (WHERE j.st <> 'closed') AS open_n,
           count(j.job_id) FILTER (WHERE j.st = 'overdue') AS overdue_n,
           count(j.job_id) FILTER (WHERE j.st = 'pending_approval') AS pending_n,
           count(j.job_id) FILTER (WHERE j.st = 'open' AND j.due_date <= v_today + 30) AS due_30_n,
           count(j.job_id) FILTER (WHERE j.st <> 'closed' AND j.pr IN ('high', 'urgent', 'critical')) AS high_n,
           count(j.job_id) FILTER (WHERE j.st = 'closed' AND lower(btrim(coalesce(j.status, ''))) = 'completed'
                                     AND j.completed_on BETWEEN v_today - 29 AND v_today) AS done_30_n
    FROM unnest(s.technical_on) AS x(id)
    LEFT JOIN jobs AS j ON j.vessel_id = x.id
    GROUP BY x.id
  ),
  chips AS (
    SELECT c.vessel_id, jsonb_object_agg(c.chip, c.n ORDER BY c.chip) AS statuses
    FROM (SELECT j.vessel_id, j.chip, count(*) AS n FROM jobs AS j WHERE j.st <> 'closed' GROUP BY j.vessel_id, j.chip) AS c
    GROUP BY c.vessel_id
  ),
  vrows AS (
    SELECT v.id, v.name, v.code, per.vessel_id AS covered_id, per.open_n, per.overdue_n, per.pending_n, per.due_30_n,
           per.high_n, per.done_30_n, chips.statuses
    FROM public.vessels AS v
    LEFT JOIN per ON per.vessel_id = v.id
    LEFT JOIN chips ON chips.vessel_id = v.id
    WHERE v.id = ANY (s.vessel_ids) AND v.company_id = v_company
  ),
  od AS (
    SELECT j.*, row_number() OVER (
             ORDER BY j.due_date, CASE j.pr WHEN 'urgent' THEN 0 WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                      j.task_number, j.job_id) AS rn,
           count(*) OVER () AS total
    FROM jobs AS j
    WHERE j.st = 'overdue'
  )
  SELECT
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
              'vessel_id', vr.id, 'vessel_name', vr.name, 'vessel_code', vr.code,
              'state', CASE WHEN NOT (vr.id = ANY (s.technical)) THEN 'no_access'
                            WHEN NOT (vr.id = ANY (s.technical_on)) THEN 'module_off'
                            ELSE 'ok' END,
              'open', vr.open_n, 'overdue', vr.overdue_n, 'pending_approval', vr.pending_n, 'due_30', vr.due_30_n,
              'high_priority', vr.high_n, 'completed_30', vr.done_30_n,
              'statuses', CASE WHEN vr.covered_id IS NULL THEN NULL ELSE coalesce(vr.statuses, '{}'::jsonb) END)
            ORDER BY vr.name, vr.id), '[]'::jsonb)
     FROM vrows AS vr),
    (SELECT CASE WHEN count(vr.covered_id) = 0 THEN NULL ELSE jsonb_build_object(
              'vessels_covered', count(vr.covered_id),
              'open', coalesce(sum(vr.open_n), 0), 'overdue', coalesce(sum(vr.overdue_n), 0),
              'pending_approval', coalesce(sum(vr.pending_n), 0), 'due_30', coalesce(sum(vr.due_30_n), 0),
              'high_priority', coalesce(sum(vr.high_n), 0), 'completed_30', coalesce(sum(vr.done_30_n), 0)) END
     FROM vrows AS vr),
    (SELECT jsonb_build_object(
              'total', coalesce(max(od.total), 0),
              'rows', coalesce(jsonb_agg(jsonb_build_object(
                'job_id', od.job_id, 'vessel_id', od.vessel_id, 'task_number', nullif(btrim(coalesce(od.task_number, '')), ''),
                'task_name', od.task_name, 'equipment_name', nullif(btrim(coalesce(od.equipment_name, '')), ''),
                'priority', nullif(btrim(coalesce(od.priority, '')), ''), 'status', od.status, 'due_date', od.due_date,
                'days_overdue', greatest(v_today - od.due_date, 0))
                ORDER BY od.rn) FILTER (WHERE od.rn <= 200), '[]'::jsonb))
     FROM od)
    INTO v_vessels, v_totals, v_overdue;

  RETURN jsonb_build_object('today', v_today, 'vessels', v_vessels, 'totals', v_totals, 'overdue', v_overdue);
END;
$$;

-- ---------------------------------------------------------------- grants and comments

REVOKE ALL ON FUNCTION public.fleet_report_drill_interval_state(date, integer, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_audit_state(text, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_ops_scope_for(uuid, uuid, uuid[], date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_overdue_drills(uuid[], date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_insurance(uuid[], date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_audits(uuid[], date, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_work_list(uuid[], date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fleet_report_drill_interval_state(date, integer, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_audit_state(text, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_ops_scope_for(uuid, uuid, uuid[], date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_overdue_drills(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_report_insurance(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_report_audits(uuid[], date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_report_work_list(uuid[], date) TO authenticated;

COMMENT ON FUNCTION public.fleet_report_drill_interval_state(date, integer, date) IS 'A required drill type''s state on a vessel on a day (gap/02 R7): never (no drill carried out), lapsed (last + interval before the day), due_soon (due within 7 days, the due day counting as 0), else on_track; NULL for no interval or no day. Pure; mirrored by drillIntervalState in src/modules/reports/lib/opsReports.ts. Internal (service role).';
COMMENT ON FUNCTION public.fleet_report_audit_state(text, date, date) IS 'An audit''s or survey''s state on a day (gap/02 R17): cancelled, done (Completed / Closed), in_progress, overdue (open and dated before the day), else due. Pure; mirrored by auditState in src/modules/reports/lib/opsReports.ts. Internal (service role).';
COMMENT ON FUNCTION public.fleet_report_ops_scope_for(uuid, uuid, uuid[], date) IS 'The vessels a fleet operations report read covers (fleet_counted_vessels_for and the reports gate; 42501 vessel_out_of_reach for explicit ids out of reach) and, per report, which of them it may count: drills / drills_on (vessel.safety.drills.view, safety on), insurance (fleet_ops_can insurance), audits / audits_on (vessel.safety.audits_surveys.view, safety on), certificates (fleet_ops_can certificates), technical / technical_on (vessel.technical.tasks.view, technical.jobs on), as arrays that are never NULL; fleet_insurance and fleet_audits only with NULL ids and the rules at fleet level (fleet reach). Internal (service role; the operations report definers).';
COMMENT ON FUNCTION public.fleet_report_overdue_drills(uuid[], date) IS 'The fleet overdue drills report (gap/02 R7) as jsonb { today, required_types, vessels, rows }: scheduled drills missed (the dashboard''s overdue drills), required drill types whose interval has lapsed or ends within 7 days since the last drill carried out, and required types never carried out, with category, interval, due day, days overdue, status and the next drill scheduled. Per vessel vessel.safety.drills.view and the safety module; no_access / module_off instead of zeros. Vessels: NULL = the caller''s counted vessels; explicit ids reach-checked (42501 vessel_out_of_reach).';
COMMENT ON FUNCTION public.fleet_report_insurance(uuid[], date) IS 'The fleet insurance report (gap/02 R13) as jsonb { today, vessels, fleet_level, rows }: every policy of the expiry engine (not archived or cancelled) with type, insurer, policy number, cover dates, the engine''s bucket and window, status and whether a certificate is on file; amounts, contacts and notes are never read. Per vessel fleet_ops_can insurance; fleet policies only for NULL ids with fleet reach and the insurance rule at fleet level. Vessels: NULL = the caller''s counted vessels; explicit ids reach-checked (42501 vessel_out_of_reach).';
COMMENT ON FUNCTION public.fleet_report_audits(uuid[], date, date, date) IS 'The fleet audits and surveys report (gap/02 R17) over p_from .. p_to (default today - 365 .. today + 90; 22023 invalid_period / period_too_long beyond 731 days) as jsonb { from, to, today, vessels, fleet_level, rows }: audits dated in the period and every overdue or in-progress audit, with type, scope, status, state, outcome, dates, auditor and findings (total, open, major, minor, observations); vessel certificates whose next survey falls in the period. Per vessel vessel.safety.audits_surveys.view and the safety module for audits, fleet_ops_can certificates for surveys; company audits only for NULL ids with fleet reach. Vessels: NULL = the caller''s counted vessels; explicit ids reach-checked (42501 vessel_out_of_reach).';
COMMENT ON FUNCTION public.fleet_report_work_list(uuid[], date) IS 'The fleet work list report (gap/02 R18) as jsonb { today, vessels, totals, overdue }: per vessel open, overdue, awaiting approval, due within 30 days, high or urgent and completed in the last 30 days jobs (fleet_dashboard_job_state) and the open jobs by status, plus the overdue jobs most overdue first (200 named, with the total); no cost column (jobs record no cost). Per vessel vessel.technical.tasks.view and the technical.jobs module setting; NULL numbers where not covered. Vessels: NULL = the caller''s counted vessels; explicit ids reach-checked (42501 vessel_out_of_reach).';
