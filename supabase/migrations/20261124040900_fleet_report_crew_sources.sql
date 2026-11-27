-- =================================================================
-- FLEET OPERATIONS X5-10A: the crew reports' numbers
-- (gap/02 R5, R9, R10, R11; DECISIONS C12, D-01, D-04, D-31, D-123,
-- D-157; X5 spec §2 X5-10A, agreements 5 and 6, D-X5-09, D-X5-10,
-- D-X5-21, D-X5-22; platform plan contracts 5 and 6)
-- Functions (browser): fleet_report_crew_qualifications,
--   fleet_report_hours_of_rest, fleet_report_contracts
-- Functions (service role; the three above): fleet_report_crew_scope_for,
--   fleet_report_hor_vessel_on, and the pure rules
--   fleet_report_agreement_state, fleet_report_agreement_awaiting,
--   fleet_report_contract_bucket
-- TS mirrors: src/modules/reports/types/db.pending.ts (the jsonb shapes),
--   src/modules/reports/lib/crewReports.ts (the agreement and bucket rules;
--   the cases tables of supabase/tests/sql/fleet/report_crew_sources.test.sql
--   are asserted by src/test/reports/{agreements,contractsEnding}.test.tsx)
-- =================================================================
--
-- Three server answers for the fleet crew reports, so the browser never
-- sums rows or reads a crew table directly:
--
--   fleet_report_crew_qualifications(p_vessel_ids)          R5 Crew qualifications
--   fleet_report_hours_of_rest(p_vessel_ids, p_from, p_to, p_today)
--                                                           R9 Hours of rest
--   fleet_report_contracts(p_vessel_ids, p_mode, p_today)   R10 Agreements,
--                                                           R11 Contracts ending
--
-- Vessels (D-X5-09, D-X5-22): fleet_counted_vessels_for(); NULL ids are
-- every counted vessel the caller reaches, explicit ids are reach-checked
-- (42501 vessel_out_of_reach, the whole read refused) and not
-- counted-filtered. Each vessel must also pass the reports rule
-- (fleet_ops_can_for 'reports' view, the route's
-- fleet.operations.fleet_reports.view). Then, per vessel and computed once
-- (fleet_report_crew_scope_for), each report's own data rule, the one the
-- client adaptor uses for the report's capability (D-04):
--
--   R5  vessel.crew.crew_compliance.view  has_capability_for (PP1); never an
--                                         external viewer (X1's rule); the
--                                         vessel's crew module on
--   R9  vessel.crew.hours_of_rest.view    fleet_dashboard_tile_can_for
--                                         (040100); the crew and crew_hor
--                                         modules on (X1's work_rest_hor_on)
--   R10 hris.employee_records             fleet_ops_can_for 'hr' view
--   R11  .contracts_employment.view       (the HR domain rule, 040000)
--
-- A vessel that fails its report's rule is listed with state 'no_access',
-- one whose module is off with 'module_off', and its numbers are NULL:
-- never zeros the report did not count. Inactive callers, callers with no
-- company and anon get an empty answer.
--
-- R5 (agreement 5, contract 5): X1's crew_compliance_for_vessels(uuid[])
-- holds the requirement engine. It refuses the whole call when any id is
-- one the caller may not read, so this wrapper passes it only the vessels
-- that pass the R5 rule above, and only when to_regprocedure finds it
-- (EXECUTE, D-X5-10). While it is missing the answer is
-- { state: 'not_set_up' } and the page says "Crew qualification
-- requirements are not set up yet" (never zeros). The person rows are
-- X1's frozen summary columns, less the login id.
--
-- R9 (agreement 6, contract 6). Breaches, by the source the build has:
--   * X1's breach review columns present (work_rest_non_conformities
--     review_outcome, is_serious, superseded_at, vessel_id and breach_day,
--     checked in information_schema; read through EXECUTE): every live
--     breach (superseded_at IS NULL, not dismissed) on its breach_day;
--     serious = is_serious; unreviewed = review_outcome IS NULL.
--   * otherwise the legacy sources: a breach crew-day is a failing
--     work_rest_compliance_checks row (window_start's UTC day), serious when
--     it has < 4 h rest in a 24-hour or daily window or < 50 h in a 7-day
--     window; unreviewed = an 'open' legacy non-conformity (the UTC day
--     its window ends in).
-- A row's vessel: the breach's own vessel (X1), else its month's vessel,
-- else the vessel of the crew member's assignment covering that day
-- (X5-02A's attribution, fleet_report_hor_vessel_on). Counts:
--   breach days        distinct crew-days with a breach
--   serious days       distinct crew-days with a serious breach
--   unreviewed         breach rows not yet reviewed
--   crew-days logged   distinct crew-days with a work_rest_records row
--   per 100 crew-days  breach days x 100 / crew-days logged (1 decimal;
--                      NULL when nothing was logged)
--   months not         crew-months that ended inside the period and before
--   submitted          p_today, where the person logged a day on the vessel
--                      or has a month row there, and no month row on that
--                      vessel is past draft / reopened
--   vessels logging    covered vessels with a logged day in the period
--   emerging issues    people with breaches on two or more days in the
--                      period, most first (25 named, with the total)
--   heat map           per vessel and day: crew logging, crew in breach,
--                      serious, unreviewed (days with none of them left out)
-- The period: p_from .. p_to inclusive (default the 30 days ending
-- p_today); p_from after p_to is 22023 invalid_period, more than 366 days
-- 22023 period_too_long (checked before anything else).
--
-- R10 / R11 (crew_contracts; wages and terms are never read). A contract's
-- vessel is the person's current vessel (fleet_current_crew over the
-- company's vessels: current before planned, the latest join), else the
-- contract's own vessel; a contract with neither is listed only for a
-- fleet-wide read (NULL ids) by a caller with fleet reach and the HR rule
-- at fleet level. p_mode 'agreements': every draft or active contract with
-- its agreement state (fleet_report_agreement_state): signed (both
-- parties signed), draft (status draft, no SEA reference, nobody signed),
-- otherwise not_signed, with who is awaited (crew, company or both).
-- p_mode 'ending': active contracts with an end date on or before
-- p_today + 90, in buckets (fleet_report_contract_bucket): ended (before
-- p_today: still marked active), d30, d60, d90; with whether a renewal is
-- drafted (a draft contract of the same person that supersedes it or
-- starts on or after it). Any other mode: 22023 invalid_mode.
--
-- Nothing here is live (D-01): the reports read these RPCs through the
-- pending shim; while they are missing each report says it is not set up
-- yet. Idempotent (D-12): CREATE OR REPLACE for every function; the file
-- refuses to run (55000) without the fleet expiry engine (040000), the
-- dashboard's hours-of-rest gate (040100) and the platform helpers.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.fleet_counted_vessels_for(uuid,uuid,uuid[])') IS NULL
     OR to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_current_crew(uuid[])') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040900_fleet_report_crew_sources needs the fleet expiry engine and access helpers: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.fleet_dashboard_tile_can_for(uuid,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040900_fleet_report_crew_sources needs the dashboard tile gates: apply 20261124040100_fleet_dashboard_kpis.sql first';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.vessel_module_on_internal(uuid,text,date)') IS NULL
     OR to_regprocedure('public.record_user_is_external(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040900_fleet_report_crew_sources needs has_capability_for (20261123000400), vessel_module_on_internal (20261123000500), record_user_is_external (20261123020000) and the user status helpers (20261123010000)';
  END IF;
  IF to_regclass('public.work_rest_records') IS NULL OR to_regclass('public.work_rest_compliance_checks') IS NULL
     OR to_regclass('public.work_rest_non_conformities') IS NULL OR to_regclass('public.work_rest_monthly_submissions') IS NULL
     OR to_regclass('public.crew_contracts') IS NULL OR to_regclass('public.crew_assignments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040900_fleet_report_crew_sources needs the live hours-of-rest, contract and crew assignment tables';
  END IF;
END
$$;

-- ---------------------------------------------------------------- pure rules (internal; TS lib/crewReports.ts)

-- agreement-rules:start (mirrored by agreementState / agreementAwaiting in src/modules/reports/lib/crewReports.ts)
-- An agreement's state (gap/02 R10): signed when both parties signed;
-- draft when the contract is a draft with no SEA reference and no
-- signature; otherwise not yet signed (issued: active, referenced or
-- signed by one party). Pure. Every fleet_report_* function is a definer
-- with a pinned search_path (X5-03A's reports_hub invariant), the pure
-- helpers included; they are executable by the service role only.
CREATE OR REPLACE FUNCTION public.fleet_report_agreement_state(_status text, _sea_reference text, _signed_by_crew_at timestamptz, _signed_by_company_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _signed_by_crew_at IS NOT NULL AND _signed_by_company_at IS NOT NULL THEN 'signed'
    WHEN _status = 'draft' AND nullif(btrim(coalesce(_sea_reference, '')), '') IS NULL
         AND _signed_by_crew_at IS NULL AND _signed_by_company_at IS NULL THEN 'draft'
    ELSE 'not_signed'
  END
$$;

-- Who a not-yet-signed agreement waits for: 'both', 'crew' (the company
-- signed) or 'company' (the crew member signed); NULL for a signed or draft
-- agreement. Pure.
CREATE OR REPLACE FUNCTION public.fleet_report_agreement_awaiting(_status text, _sea_reference text, _signed_by_crew_at timestamptz, _signed_by_company_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.fleet_report_agreement_state(_status, _sea_reference, _signed_by_crew_at, _signed_by_company_at) <> 'not_signed' THEN NULL
    WHEN _signed_by_crew_at IS NULL AND _signed_by_company_at IS NULL THEN 'both'
    WHEN _signed_by_crew_at IS NULL THEN 'crew'
    ELSE 'company'
  END
$$;
-- agreement-rules:end

-- contract-bucket-rules:start (mirrored by contractBucket in src/modules/reports/lib/crewReports.ts)
-- A contract end date's bucket on a day (gap/02 R11): 'ended' before the
-- day (the contract is still marked active), 'd30' up to 30 days ahead
-- (the end day itself counts as 0 days), 'd60' up to 60, 'd90' up to 90;
-- NULL for no end date or later. Pure.
CREATE OR REPLACE FUNCTION public.fleet_report_contract_bucket(_end_date date, _today date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _end_date IS NULL OR _today IS NULL THEN NULL
    WHEN _end_date < _today THEN 'ended'
    WHEN _end_date <= _today + 30 THEN 'd30'
    WHEN _end_date <= _today + 60 THEN 'd60'
    WHEN _end_date <= _today + 90 THEN 'd90'
  END
$$;
-- contract-bucket-rules:end

-- ---------------------------------------------------------------- shared helpers (internal)

-- The vessel of a crew member's assignment covering a day (the latest join
-- first): X5-02A's hours-of-rest attribution for a check or a breach whose
-- month names no vessel (fleet_dashboard_hor_crew_days). Internal (service
-- role; the hours-of-rest report).
CREATE OR REPLACE FUNCTION public.fleet_report_hor_vessel_on(_crew_id uuid, _day date)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.vessel_id
  FROM public.crew_assignments AS ca
  WHERE ca.user_id = _crew_id
    AND _day IS NOT NULL
    AND (coalesce(ca.join_date, ca.start_date) IS NULL OR coalesce(ca.join_date, ca.start_date) <= _day)
    AND (coalesce(ca.leave_date, ca.end_date) IS NULL OR coalesce(ca.leave_date, ca.end_date) >= _day)
  ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
  LIMIT 1
$$;

-- The vessels a crew report read covers and, per report, which of them it
-- may count, as one row of arrays (never NULL; '{}' when none):
--   vessel_ids        fleet_counted_vessels_for() ∩ the reports rule
--   hours_of_rest     ∩ the HoR gate (fleet_dashboard_tile_can_for)
--   hours_of_rest_on  and the crew and crew_hor modules on (_today)
--   hr                ∩ fleet_ops_can 'hr' view
--   compliance        ∩ vessel.crew.crew_compliance.view, never an external viewer
--   compliance_on     and the crew module on (_today)
--   fleet_hr          NULL ids, and the reports and HR rules at fleet level
--                     (fleet reach): contracts with no vessel are listed
-- Explicit ids out of reach raise 42501 vessel_out_of_reach (through
-- fleet_counted_vessels_for). An inactive user or another company: every
-- array empty, the flag false. Internal (service role; the report definers).
CREATE OR REPLACE FUNCTION public.fleet_report_crew_scope_for(_user_id uuid, _company_id uuid, _vessel_ids uuid[], _today date)
RETURNS TABLE (
  vessel_ids uuid[], hours_of_rest uuid[], hours_of_rest_on uuid[], hr uuid[], compliance uuid[], compliance_on uuid[], fleet_hr boolean
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
  v_external boolean;
  v_fleet_hr boolean;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL
     OR NOT coalesce(public.user_is_active(_user_id), false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = _company_id) THEN
    RETURN QUERY SELECT v_none, v_none, v_none, v_none, v_none, v_none, false;
    RETURN;
  END IF;

  v_external := coalesce(public.record_user_is_external(_user_id, _company_id), false);
  v_fleet_hr := _vessel_ids IS NULL
                AND coalesce(public.fleet_ops_can_for(_user_id, _company_id, NULL, 'reports', 'view'), false)
                AND coalesce(public.fleet_ops_can_for(_user_id, _company_id, NULL, 'hr', 'view'), false);

  RETURN QUERY
    WITH vs AS (
      SELECT x AS id FROM public.fleet_counted_vessels_for(_user_id, _company_id, _vessel_ids) AS x
    ),
    rep AS (
      SELECT vs.id FROM vs WHERE coalesce(public.fleet_ops_can_for(_user_id, _company_id, vs.id, 'reports', 'view'), false)
    ),
    g AS (
      SELECT r.id,
             coalesce(public.fleet_dashboard_tile_can_for(_user_id, _company_id, r.id, 'hours_of_rest'), false) AS hor,
             coalesce(public.vessel_module_on_internal(r.id, 'crew', v_today), false) AS crew_on,
             coalesce(public.vessel_module_on_internal(r.id, 'crew_hor', v_today), false) AS hor_on,
             coalesce(public.fleet_ops_can_for(_user_id, _company_id, r.id, 'hr', 'view'), false) AS hr_ok,
             (NOT v_external AND coalesce(public.has_capability_for(_user_id, 'vessel.crew.crew_compliance.view', _company_id, r.id), false)) AS comp
      FROM rep AS r
    )
    SELECT coalesce(array_agg(g.id ORDER BY g.id), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.hor), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.hor AND g.crew_on AND g.hor_on), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.hr_ok), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.comp), v_none),
           coalesce(array_agg(g.id ORDER BY g.id) FILTER (WHERE g.comp AND g.crew_on), v_none),
           v_fleet_hr
    FROM g;
END;
$$;

-- ---------------------------------------------------------------- R5 crew qualifications

-- The crew qualifications report (gap/02 R5; agreement 5): X1's compliance
-- summary of every crew member on the vessels the caller may read it on,
-- as jsonb { state ok | not_set_up, today, vessels [{ vessel_id,
-- vessel_name, vessel_code, state ok | no_access | module_off }], rows
-- [X1's frozen summary columns, less user_id] }. rows is [] while X1's
-- function is missing (state not_set_up) or no vessel is covered.
CREATE OR REPLACE FUNCTION public.fleet_report_crew_qualifications(p_vessel_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_today date := current_date;
  v_ready boolean := to_regprocedure('public.crew_compliance_for_vessels(uuid[])') IS NOT NULL;
  s record;
  v_rows jsonb := '[]'::jsonb;
  v_vessels jsonb;
BEGIN
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('state', CASE WHEN v_ready THEN 'ok' ELSE 'not_set_up' END, 'today', v_today,
                              'vessels', '[]'::jsonb, 'rows', '[]'::jsonb);
  END IF;
  SELECT * INTO s FROM public.fleet_report_crew_scope_for(v_uid, v_company, p_vessel_ids, v_today);

  IF v_ready AND cardinality(s.compliance_on) > 0 THEN
    EXECUTE $x$
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'vessel_id', r.vessel_id, 'profile_id', r.profile_id,
               'first_name', r.first_name, 'last_name', r.last_name, 'preferred_name', r.preferred_name,
               'position_name', r.position_name, 'position_text', r.position_text,
               'department_key', r.department_key, 'rank_tier', r.rank_tier, 'sort_order', r.sort_order,
               'placement_kind', r.placement_kind,
               'required', r.required, 'met', r.met, 'expiring', r.expiring, 'expired', r.expired, 'missing', r.missing,
               'conditional', r.conditional, 'muted', r.muted,
               'docs_required', r.docs_required, 'docs_met', r.docs_met,
               'stcw_required', r.stcw_required, 'stcw_met', r.stcw_met,
               'quals_required', r.quals_required, 'quals_met', r.quals_met,
               'fam_required', r.fam_required, 'fam_met', r.fam_met,
               'status', r.status, 'next_expiry', r.next_expiry, 'issues', coalesce(r.issues, '[]'::jsonb))
             ORDER BY r.vessel_id, r.sort_order NULLS LAST, r.last_name, r.first_name, r.profile_id), '[]'::jsonb)
      FROM public.crew_compliance_for_vessels($1) AS r
      WHERE r.company_id = $2
    $x$ INTO v_rows USING s.compliance_on, v_company;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'vessel_id', v.id, 'vessel_name', v.name, 'vessel_code', v.code,
           'state', CASE WHEN NOT (v.id = ANY (s.compliance)) THEN 'no_access'
                         WHEN NOT (v.id = ANY (s.compliance_on)) THEN 'module_off'
                         ELSE 'ok' END)
         ORDER BY v.name, v.id), '[]'::jsonb)
    INTO v_vessels
  FROM public.vessels AS v
  WHERE v.id = ANY (s.vessel_ids) AND v.company_id = v_company;

  RETURN jsonb_build_object('state', CASE WHEN v_ready THEN 'ok' ELSE 'not_set_up' END, 'today', v_today,
                            'vessels', v_vessels, 'rows', v_rows);
END;
$$;

-- ---------------------------------------------------------------- R9 hours of rest

-- The hours-of-rest report (gap/02 R9, T-292; agreement 6) over p_from ..
-- p_to as jsonb { vessels, from, to, today, source breach_review |
-- compliance_checks, totals (NULL when no vessel is covered) { vessels_covered,
-- vessels_logging, crew_days, breach_days, serious_days, unreviewed,
-- months_not_submitted, rate_per_100 }, per_vessel [{ vessel_id,
-- vessel_name, vessel_code, state ok | no_access | module_off, crew_logging,
-- crew_days, breach_days, serious_days, unreviewed, months_not_submitted,
-- rate_per_100, last_entry }] (NULL numbers where not covered), heat
-- [{ vessel_id, day, logged, breaches, serious, unreviewed }], emerging
-- { total, rows [{ profile_id, person_name, position, vessel_id,
-- breach_days, serious_days, unreviewed, last_breach }] } }.
CREATE OR REPLACE FUNCTION public.fleet_report_hours_of_rest(p_vessel_ids uuid[] DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_today date DEFAULT current_date)
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
  v_to date := coalesce(p_to, coalesce(p_today, current_date));
  v_from date := coalesce(p_from, coalesce(p_to, coalesce(p_today, current_date)) - 29);
  v_review boolean;
  s record;
  v_breach jsonb := '[]'::jsonb;
  v_unrev jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF v_from > v_to THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_period', DETAIL = 'The period must start on or before its last day.';
  END IF;
  IF v_to - v_from + 1 > 366 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_too_long', DETAIL = 'Choose a period of at most 366 days.';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('vessels', 0, 'from', v_from, 'to', v_to, 'today', v_today, 'source', NULL,
                              'totals', NULL, 'per_vessel', '[]'::jsonb, 'heat', '[]'::jsonb,
                              'emerging', jsonb_build_object('total', 0, 'rows', '[]'::jsonb));
  END IF;
  SELECT * INTO s FROM public.fleet_report_crew_scope_for(v_uid, v_company, p_vessel_ids, v_today);

  v_review := (SELECT count(*) FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'work_rest_non_conformities'
                 AND column_name IN ('review_outcome', 'is_serious', 'superseded_at', 'vessel_id', 'breach_day')) = 5;

  IF cardinality(s.hours_of_rest_on) > 0 THEN
    IF v_review THEN
      -- X1's breach list (contract 6): live, not dismissed; one row per crew-day, and the unreviewed rows.
      EXECUTE $x$
        WITH nc AS (
          SELECT n.crew_id,
                 coalesce(n.breach_day, ((n.window_end - interval '1 minute') AT TIME ZONE 'UTC')::date) AS day,
                 n.vessel_id AS nc_vessel, sub.vessel_id AS sub_vessel,
                 n.is_serious, n.review_outcome IS NULL AS unreviewed
          FROM public.work_rest_non_conformities AS n
          JOIN public.profiles AS p ON p.user_id = n.crew_id AND p.company_id = $1
          LEFT JOIN public.work_rest_monthly_submissions AS sub ON sub.id = n.submission_id
          WHERE n.superseded_at IS NULL
            AND n.status IS DISTINCT FROM 'dismissed'
            AND n.review_outcome IS DISTINCT FROM 'dismissed'
            AND coalesce(n.breach_day, ((n.window_end - interval '1 minute') AT TIME ZONE 'UTC')::date) BETWEEN $3 AND $4
        ),
        inr AS (
          SELECT x.crew_id, x.day, x.is_serious, x.unreviewed,
                 coalesce(x.nc_vessel, x.sub_vessel, public.fleet_report_hor_vessel_on(x.crew_id, x.day)) AS vessel_id
          FROM nc AS x
        )
        SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('crew_id', b.crew_id, 'vessel_id', b.vessel_id, 'day', b.day, 'serious', b.serious)), '[]'::jsonb)
                FROM (SELECT i.crew_id, i.vessel_id, i.day, bool_or(i.is_serious) AS serious
                      FROM inr AS i WHERE i.vessel_id = ANY ($2) GROUP BY i.crew_id, i.vessel_id, i.day) AS b),
               (SELECT coalesce(jsonb_agg(jsonb_build_object('crew_id', u.crew_id, 'vessel_id', u.vessel_id, 'day', u.day)), '[]'::jsonb)
                FROM inr AS u WHERE u.unreviewed AND u.vessel_id = ANY ($2))
      $x$ INTO v_breach, v_unrev USING v_company, s.hours_of_rest_on, v_from, v_to;
    ELSE
      -- The legacy rule: a failing check is a breach crew-day; < 4 h in 24 h or < 50 h in 7 days is serious.
      SELECT coalesce(jsonb_agg(jsonb_build_object('crew_id', b.crew_id, 'vessel_id', b.vessel_id, 'day', b.day, 'serious', b.serious)), '[]'::jsonb)
        INTO v_breach
      FROM (
        SELECT k.crew_id, k.vessel_id, k.day,
               bool_or((k.check_window IN ('rolling_24h', 'daily') AND k.rest_minutes < 240)
                       OR (k.check_window = 'rolling_7d' AND k.rest_minutes < 3000)) AS serious
        FROM (
          SELECT c.crew_id, (c.window_start AT TIME ZONE 'UTC')::date AS day, c.check_window, c.rest_minutes,
                 coalesce(sub.vessel_id, public.fleet_report_hor_vessel_on(c.crew_id, (c.window_start AT TIME ZONE 'UTC')::date)) AS vessel_id
          FROM public.work_rest_compliance_checks AS c
          JOIN public.profiles AS p ON p.user_id = c.crew_id AND p.company_id = v_company
          LEFT JOIN public.work_rest_monthly_submissions AS sub ON sub.id = c.submission_id
          WHERE NOT c.passes
            AND c.window_start >= (v_from::timestamp AT TIME ZONE 'UTC')
            AND c.window_start < ((v_to + 1)::timestamp AT TIME ZONE 'UTC')
        ) AS k
        WHERE k.vessel_id = ANY (s.hours_of_rest_on)
        GROUP BY k.crew_id, k.vessel_id, k.day
      ) AS b;

      SELECT coalesce(jsonb_agg(jsonb_build_object('crew_id', u.crew_id, 'vessel_id', u.vessel_id, 'day', u.day)), '[]'::jsonb)
        INTO v_unrev
      FROM (
        SELECT n.crew_id, ((n.window_end - interval '1 minute') AT TIME ZONE 'UTC')::date AS day,
               coalesce(sub.vessel_id, public.fleet_report_hor_vessel_on(n.crew_id, ((n.window_end - interval '1 minute') AT TIME ZONE 'UTC')::date)) AS vessel_id
        FROM public.work_rest_non_conformities AS n
        JOIN public.profiles AS p ON p.user_id = n.crew_id AND p.company_id = v_company
        LEFT JOIN public.work_rest_monthly_submissions AS sub ON sub.id = n.submission_id
        WHERE n.status = 'open'
          AND ((n.window_end - interval '1 minute') AT TIME ZONE 'UTC')::date BETWEEN v_from AND v_to
      ) AS u
      WHERE u.vessel_id = ANY (s.hours_of_rest_on);
    END IF;
  END IF;

  WITH br AS (
    SELECT x.crew_id, x.vessel_id, x.day, x.serious
    FROM jsonb_to_recordset(v_breach) AS x(crew_id uuid, vessel_id uuid, day date, serious boolean)
  ),
  un AS (
    SELECT x.crew_id, x.vessel_id, x.day
    FROM jsonb_to_recordset(v_unrev) AS x(crew_id uuid, vessel_id uuid, day date)
  ),
  logged AS (
    SELECT DISTINCT r.vessel_id, r.crew_id, r.record_date AS day
    FROM public.work_rest_records AS r
    JOIN public.profiles AS p ON p.user_id = r.crew_id AND p.company_id = v_company
    WHERE r.vessel_id = ANY (s.hours_of_rest_on) AND r.record_date BETWEEN v_from AND v_to
  ),
  last_entry AS (
    SELECT r.vessel_id, max(r.record_date) AS last
    FROM public.work_rest_records AS r
    JOIN public.profiles AS p ON p.user_id = r.crew_id AND p.company_id = v_company
    WHERE r.vessel_id = ANY (s.hours_of_rest_on) AND r.record_date <= v_to
    GROUP BY r.vessel_id
  ),
  due AS (
    SELECT g.m::date AS m_start, (g.m + interval '1 month' - interval '1 day')::date AS m_end
    FROM generate_series(date_trunc('month', v_from::timestamp), date_trunc('month', v_to::timestamp), interval '1 month') AS g(m)
    WHERE (g.m + interval '1 month' - interval '1 day')::date BETWEEN v_from AND v_to
      AND (g.m + interval '1 month' - interval '1 day')::date < v_today
  ),
  crew_months AS (
    SELECT r.vessel_id, r.crew_id, d.m_start
    FROM due AS d
    JOIN public.work_rest_records AS r ON r.record_date BETWEEN d.m_start AND d.m_end
    JOIN public.profiles AS p ON p.user_id = r.crew_id AND p.company_id = v_company
    WHERE r.vessel_id = ANY (s.hours_of_rest_on)
    UNION
    SELECT sub.vessel_id, sub.crew_id, d.m_start
    FROM due AS d
    JOIN public.work_rest_monthly_submissions AS sub
      ON sub.period_year = extract(year FROM d.m_start)::int AND sub.period_month = extract(month FROM d.m_start)::int
    JOIN public.profiles AS p ON p.user_id = sub.crew_id AND p.company_id = v_company
    WHERE sub.vessel_id = ANY (s.hours_of_rest_on)
  ),
  not_submitted AS (
    SELECT cm.vessel_id, cm.crew_id, cm.m_start
    FROM crew_months AS cm
    WHERE NOT EXISTS (
      SELECT 1 FROM public.work_rest_monthly_submissions AS sub
      WHERE sub.crew_id = cm.crew_id AND sub.vessel_id = cm.vessel_id
        AND sub.period_year = extract(year FROM cm.m_start)::int AND sub.period_month = extract(month FROM cm.m_start)::int
        AND sub.status NOT IN ('draft', 'reopened'))
  ),
  pv AS (
    SELECT v.id, v.name, v.code,
           CASE WHEN NOT (v.id = ANY (s.hours_of_rest)) THEN 'no_access'
                WHEN NOT (v.id = ANY (s.hours_of_rest_on)) THEN 'module_off'
                ELSE 'ok' END AS state,
           (SELECT count(DISTINCT l.crew_id) FROM logged AS l WHERE l.vessel_id = v.id) AS crew_logging,
           (SELECT count(*) FROM logged AS l WHERE l.vessel_id = v.id) AS crew_days,
           (SELECT count(*) FROM br AS b WHERE b.vessel_id = v.id) AS breach_days,
           (SELECT count(*) FROM br AS b WHERE b.vessel_id = v.id AND b.serious) AS serious_days,
           (SELECT count(*) FROM un AS u WHERE u.vessel_id = v.id) AS unreviewed,
           (SELECT count(*) FROM not_submitted AS ns WHERE ns.vessel_id = v.id) AS months_not_submitted,
           (SELECT le.last FROM last_entry AS le WHERE le.vessel_id = v.id) AS last_entry
    FROM public.vessels AS v
    WHERE v.id = ANY (s.vessel_ids) AND v.company_id = v_company
  ),
  lg_d AS (SELECT l.vessel_id, l.day, count(DISTINCT l.crew_id) AS n FROM logged AS l GROUP BY l.vessel_id, l.day),
  br_d AS (SELECT b.vessel_id, b.day, count(*) AS n, count(*) FILTER (WHERE b.serious) AS serious FROM br AS b GROUP BY b.vessel_id, b.day),
  un_d AS (SELECT u.vessel_id, u.day, count(*) AS n FROM un AS u GROUP BY u.vessel_id, u.day),
  keys AS (
    SELECT lg_d.vessel_id, lg_d.day FROM lg_d
    UNION SELECT br_d.vessel_id, br_d.day FROM br_d
    UNION SELECT un_d.vessel_id, un_d.day FROM un_d
  ),
  people AS (
    SELECT b.crew_id, count(*) AS breach_days, count(*) FILTER (WHERE b.serious) AS serious_days, max(b.day) AS last_breach,
           (array_agg(b.vessel_id ORDER BY b.day DESC, b.vessel_id))[1] AS vessel_id
    FROM br AS b
    GROUP BY b.crew_id
    HAVING count(*) >= 2
  ),
  tot AS (
    SELECT coalesce(sum(pv.crew_days), 0) AS crew_days, coalesce(sum(pv.breach_days), 0) AS breach_days
    FROM pv WHERE pv.state = 'ok'
  )
  SELECT jsonb_build_object(
           'vessels', cardinality(s.vessel_ids),
           'from', v_from, 'to', v_to, 'today', v_today,
           'source', CASE WHEN v_review THEN 'breach_review' ELSE 'compliance_checks' END,
           'totals', CASE WHEN cardinality(s.hours_of_rest_on) = 0 THEN NULL ELSE jsonb_build_object(
             'vessels_covered', cardinality(s.hours_of_rest_on),
             'vessels_logging', (SELECT count(*) FROM pv WHERE pv.state = 'ok' AND pv.crew_days > 0),
             'crew_days', (SELECT tot.crew_days FROM tot),
             'breach_days', (SELECT tot.breach_days FROM tot),
             'serious_days', (SELECT coalesce(sum(pv.serious_days), 0) FROM pv WHERE pv.state = 'ok'),
             'unreviewed', (SELECT coalesce(sum(pv.unreviewed), 0) FROM pv WHERE pv.state = 'ok'),
             'months_not_submitted', (SELECT coalesce(sum(pv.months_not_submitted), 0) FROM pv WHERE pv.state = 'ok'),
             'rate_per_100', (SELECT CASE WHEN tot.crew_days > 0 THEN round(tot.breach_days * 100.0 / tot.crew_days, 1) END FROM tot)) END,
           'per_vessel', (SELECT coalesce(jsonb_agg(jsonb_build_object(
               'vessel_id', pv.id, 'vessel_name', pv.name, 'vessel_code', pv.code, 'state', pv.state,
               'crew_logging', CASE WHEN pv.state = 'ok' THEN pv.crew_logging END,
               'crew_days', CASE WHEN pv.state = 'ok' THEN pv.crew_days END,
               'breach_days', CASE WHEN pv.state = 'ok' THEN pv.breach_days END,
               'serious_days', CASE WHEN pv.state = 'ok' THEN pv.serious_days END,
               'unreviewed', CASE WHEN pv.state = 'ok' THEN pv.unreviewed END,
               'months_not_submitted', CASE WHEN pv.state = 'ok' THEN pv.months_not_submitted END,
               'rate_per_100', CASE WHEN pv.state = 'ok' AND pv.crew_days > 0 THEN round(pv.breach_days * 100.0 / pv.crew_days, 1) END,
               'last_entry', CASE WHEN pv.state = 'ok' THEN pv.last_entry END)
             ORDER BY pv.name, pv.id), '[]'::jsonb) FROM pv),
           'heat', (SELECT coalesce(jsonb_agg(jsonb_build_object(
               'vessel_id', k.vessel_id, 'day', k.day,
               'logged', coalesce(lg_d.n, 0), 'breaches', coalesce(br_d.n, 0), 'serious', coalesce(br_d.serious, 0),
               'unreviewed', coalesce(un_d.n, 0))
             ORDER BY k.vessel_id, k.day), '[]'::jsonb)
             FROM keys AS k
             LEFT JOIN lg_d ON lg_d.vessel_id = k.vessel_id AND lg_d.day = k.day
             LEFT JOIN br_d ON br_d.vessel_id = k.vessel_id AND br_d.day = k.day
             LEFT JOIN un_d ON un_d.vessel_id = k.vessel_id AND un_d.day = k.day),
           'emerging', jsonb_build_object(
             'total', (SELECT count(*) FROM people),
             'rows', (SELECT coalesce(jsonb_agg(e.item ORDER BY e.breach_days DESC, e.serious_days DESC, e.last_breach DESC, e.profile_id), '[]'::jsonb)
                      FROM (
                        SELECT pe.breach_days, pe.serious_days, pe.last_breach, p.id AS profile_id,
                               jsonb_build_object(
                                 'profile_id', p.id,
                                 'person_name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                                 'position', coalesce(
                                   (SELECT nullif(btrim(ca.position), '') FROM public.crew_assignments AS ca
                                    WHERE ca.user_id = pe.crew_id AND ca.vessel_id = pe.vessel_id
                                    ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id LIMIT 1),
                                   nullif(btrim(coalesce(p.position, '')), '')),
                                 'vessel_id', pe.vessel_id,
                                 'breach_days', pe.breach_days,
                                 'serious_days', pe.serious_days,
                                 'unreviewed', (SELECT count(*) FROM un AS u WHERE u.crew_id = pe.crew_id),
                                 'last_breach', pe.last_breach) AS item
                        FROM people AS pe
                        JOIN public.profiles AS p ON p.user_id = pe.crew_id AND p.company_id = v_company
                        ORDER BY pe.breach_days DESC, pe.serious_days DESC, pe.last_breach DESC, p.id
                        LIMIT 25
                      ) AS e)))
    INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------- R10 / R11 contracts

-- The agreements (p_mode 'agreements', gap/02 R10) or contracts ending
-- (p_mode 'ending', R11) report as jsonb { mode, today, vessels [{ vessel_id,
-- vessel_name, vessel_code, state ok | no_access }], unassigned (contracts
-- with no vessel are listed), rows [{ contract_id, profile_id, person_name,
-- position, department, vessel_id, contract_type, contract_number,
-- sea_reference, status, start_date, end_date, signed_by_crew_at,
-- signed_by_company_at, agreement_state, awaiting, days_left, bucket,
-- renewal_drafted }] }. Wages and terms are never read.
CREATE OR REPLACE FUNCTION public.fleet_report_contracts(p_vessel_ids uuid[] DEFAULT NULL, p_mode text DEFAULT 'agreements', p_today date DEFAULT current_date)
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
  v_company_vessels uuid[];
  v_vessels jsonb;
  v_rows jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('agreements', 'ending') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_mode', DETAIL = 'Choose agreements or ending.';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('mode', p_mode, 'today', v_today, 'vessels', '[]'::jsonb, 'unassigned', false, 'rows', '[]'::jsonb);
  END IF;
  SELECT * INTO s FROM public.fleet_report_crew_scope_for(v_uid, v_company, p_vessel_ids, v_today);
  v_company_vessels := ARRAY(SELECT v.id FROM public.vessels AS v WHERE v.company_id = v_company);

  WITH crew AS (
    SELECT DISTINCT ON (c.profile_id) c.profile_id, c.vessel_id
    FROM public.fleet_current_crew(v_company_vessels) AS c
    ORDER BY c.profile_id, c.is_planned, c.join_date DESC NULLS LAST, c.vessel_id
  ),
  k AS (
    SELECT cc.id, cc.profile_id, cc.contract_type, cc.contract_number, cc.sea_reference, cc.status,
           cc.start_date, cc.end_date, cc.signed_by_crew_at, cc.signed_by_company_at, cc.supersedes_contract_id,
           coalesce(nullif(btrim(coalesce(cc.position, '')), ''), nullif(btrim(coalesce(p.position, '')), '')) AS position,
           coalesce(nullif(btrim(coalesce(cc.department, '')), ''), nullif(btrim(coalesce(p.department, '')), '')) AS department,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') AS person_name,
           coalesce(crew.vessel_id, CASE WHEN cc.vessel_id = ANY (v_company_vessels) THEN cc.vessel_id END) AS at_vessel
    FROM public.crew_contracts AS cc
    JOIN public.profiles AS p ON p.id = cc.profile_id AND p.company_id = v_company
    LEFT JOIN crew ON crew.profile_id = cc.profile_id
    WHERE cc.company_id = v_company
      AND CASE p_mode
            WHEN 'agreements' THEN cc.status IN ('draft', 'active')
            ELSE cc.status = 'active' AND cc.end_date IS NOT NULL AND cc.end_date <= v_today + 90
          END
  ),
  shown AS (
    SELECT k.* FROM k
    WHERE (k.at_vessel IS NOT NULL AND k.at_vessel = ANY (s.hr))
       OR (k.at_vessel IS NULL AND s.fleet_hr)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'contract_id', x.id, 'profile_id', x.profile_id, 'person_name', x.person_name,
           'position', x.position, 'department', x.department, 'vessel_id', x.at_vessel,
           'contract_type', x.contract_type, 'contract_number', nullif(btrim(coalesce(x.contract_number, '')), ''),
           'sea_reference', nullif(btrim(coalesce(x.sea_reference, '')), ''), 'status', x.status,
           'start_date', x.start_date, 'end_date', x.end_date,
           'signed_by_crew_at', x.signed_by_crew_at, 'signed_by_company_at', x.signed_by_company_at,
           'agreement_state', public.fleet_report_agreement_state(x.status, x.sea_reference, x.signed_by_crew_at, x.signed_by_company_at),
           'awaiting', public.fleet_report_agreement_awaiting(x.status, x.sea_reference, x.signed_by_crew_at, x.signed_by_company_at),
           'days_left', CASE WHEN x.end_date IS NOT NULL THEN x.end_date - v_today END,
           'bucket', public.fleet_report_contract_bucket(x.end_date, v_today),
           'renewal_drafted', EXISTS (
             SELECT 1 FROM public.crew_contracts AS d
             WHERE d.profile_id = x.profile_id AND d.company_id = v_company AND d.id <> x.id AND d.status = 'draft'
               AND (d.supersedes_contract_id = x.id OR d.start_date >= x.start_date)))
         ORDER BY x.end_date NULLS LAST, x.person_name NULLS LAST, x.id), '[]'::jsonb)
    INTO v_rows
  FROM shown AS x;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'vessel_id', v.id, 'vessel_name', v.name, 'vessel_code', v.code,
           'state', CASE WHEN v.id = ANY (s.hr) THEN 'ok' ELSE 'no_access' END)
         ORDER BY v.name, v.id), '[]'::jsonb)
    INTO v_vessels
  FROM public.vessels AS v
  WHERE v.id = ANY (s.vessel_ids) AND v.company_id = v_company;

  RETURN jsonb_build_object('mode', p_mode, 'today', v_today, 'vessels', v_vessels, 'unassigned', s.fleet_hr, 'rows', v_rows);
END;
$$;

-- ---------------------------------------------------------------- grants and comments

REVOKE ALL ON FUNCTION public.fleet_report_agreement_state(text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_agreement_awaiting(text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_contract_bucket(date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_hor_vessel_on(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_crew_scope_for(uuid, uuid, uuid[], date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_crew_qualifications(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_hours_of_rest(uuid[], date, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_report_contracts(uuid[], text, date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fleet_report_agreement_state(text, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_agreement_awaiting(text, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_contract_bucket(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_hor_vessel_on(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_crew_scope_for(uuid, uuid, uuid[], date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_report_crew_qualifications(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_report_hours_of_rest(uuid[], date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_report_contracts(uuid[], text, date) TO authenticated;

COMMENT ON FUNCTION public.fleet_report_agreement_state(text, text, timestamptz, timestamptz) IS 'An agreement''s state (gap/02 R10): signed (both parties signed), draft (status draft, no SEA reference, nobody signed), else not_signed. Pure; mirrored by agreementState in src/modules/reports/lib/crewReports.ts. Internal (service role).';
COMMENT ON FUNCTION public.fleet_report_agreement_awaiting(text, text, timestamptz, timestamptz) IS 'Who a not-yet-signed agreement waits for: both, crew (the company signed) or company (the crew member signed); NULL when signed or a draft. Pure; mirrored by agreementAwaiting. Internal (service role).';
COMMENT ON FUNCTION public.fleet_report_contract_bucket(date, date) IS 'A contract end date''s bucket on a day (gap/02 R11): ended (before the day), d30, d60, d90 (the end day counts as 0 days); NULL for no end date or later. Pure; mirrored by contractBucket. Internal (service role).';
COMMENT ON FUNCTION public.fleet_report_hor_vessel_on(uuid, date) IS 'The vessel of the crew member''s assignment covering the day (the latest join first): X5-02A''s hours-of-rest attribution for a check or breach whose month names no vessel. Internal (service role; fleet_report_hours_of_rest).';
COMMENT ON FUNCTION public.fleet_report_crew_scope_for(uuid, uuid, uuid[], date) IS 'The vessels a fleet crew report read covers (fleet_counted_vessels_for and the reports gate; 42501 vessel_out_of_reach for explicit ids out of reach) and, per report, which of them it may count: hours_of_rest (fleet_dashboard_tile_can_for) and hours_of_rest_on (crew and crew_hor on), hr (fleet_ops_can hr view), compliance (vessel.crew.crew_compliance.view, never an external viewer) and compliance_on (crew on), as arrays that are never NULL; fleet_hr only with NULL ids and the reports and HR rules at fleet level. Internal (service role; the crew report definers).';
COMMENT ON FUNCTION public.fleet_report_crew_qualifications(uuid[]) IS 'The fleet crew qualifications report (gap/02 R5; X5 agreement 5) as jsonb { state ok | not_set_up, today, vessels [{ vessel_id, vessel_name, vessel_code, state ok | no_access | module_off }], rows }: X1''s crew_compliance_for_vessels() summary rows (frozen columns, less user_id) for the vessels that pass vessel.crew.crew_compliance.view (no external viewer) with the crew module on, called through to_regprocedure and EXECUTE (not_set_up while it is missing). Vessels: NULL = the caller''s counted vessels; explicit ids reach-checked (42501 vessel_out_of_reach). Inactive caller, no company or no JWT: no vessels, no rows.';
COMMENT ON FUNCTION public.fleet_report_hours_of_rest(uuid[], date, date, date) IS 'The fleet hours-of-rest report (gap/02 R9, T-292; X5 agreement 6) over p_from .. p_to (default the 30 days ending p_today; 22023 invalid_period when p_from is after p_to, period_too_long beyond 366 days) as jsonb { vessels, from, to, today, source, totals, per_vessel, heat, emerging }: breach days, serious breach days and unreviewed breaches from X1''s breach review columns when they exist (information_schema, EXECUTE), else failing compliance checks (< 4 h in 24 h or < 50 h in 7 days serious) and open legacy non-conformities; crew-days logged, months not submitted, vessels logging, breaches per 100 crew-days, the vessel x day heat map and people with breaches on two or more days. Per vessel the HoR gate (vessel.crew.hours_of_rest.view) and the crew and crew_hor modules; NULL numbers where not covered. Vessels: NULL = the caller''s counted vessels; explicit ids reach-checked (42501 vessel_out_of_reach).';
COMMENT ON FUNCTION public.fleet_report_contracts(uuid[], text, date) IS 'The fleet agreements (p_mode agreements, gap/02 R10: draft and active contracts with their agreement state and who is awaited) or contracts ending (p_mode ending, R11: active contracts ending by p_today + 90, bucketed ended / d30 / d60 / d90, with renewal_drafted) report as jsonb { mode, today, vessels, unassigned, rows }; 22023 invalid_mode otherwise. A contract''s vessel is the person''s current vessel, else its own; one with neither only for a fleet-wide read with fleet reach and the HR rule. Per vessel the HR rule (fleet_ops_can hr view). Wages and terms are never read. Vessels: NULL = the caller''s counted vessels; explicit ids reach-checked (42501 vessel_out_of_reach).';
