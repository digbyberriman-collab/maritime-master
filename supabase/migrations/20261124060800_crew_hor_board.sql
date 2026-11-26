-- =================================================================
-- CREW X1-08: the vessel hours-of-rest board, the breach review, the
-- reminders and the breach report (Phase 3 wave 1, stream X1; gap/04 C40,
-- C41, C42, C43, C45, W6; DECISIONS D-01, D-04, D-120, D-128, D-229,
-- D-232, D-233, D-238, D-249, D-X1-14, D-X1-20, D-X1-23; X1 spec §6 060800;
-- platform plan contract 6, fleet operations R9)
-- Tables: work_rest_reminders, work_rest_breach_reports
-- View: work_rest_breach_reviews (security invoker; fleet operations R9)
-- RPCs: work_rest_vessel_board(), work_rest_month_stats(),
--   work_rest_vessel_breaches(), work_rest_review_breach(),
--   work_rest_remind(), work_rest_breach_report_recipients(),
--   work_rest_breach_report_create()
-- Sweep (service role, hr-daily-sweeper): work_rest_send_due_reminders()
-- Internal (service role): work_rest_board_member_ids(),
--   work_rest_role_label(), work_rest_is_fleet_hr(), work_rest_is_dpa(),
--   work_rest_report_recipient_kind(), work_rest_serious_breach_recipients(),
--   work_rest_due_members(), work_rest_reminder_emit()
-- Triggers: work_rest_serious_breach_notify (work_rest_non_conformities),
--   trg_work_rest_month_correction_guard (work_rest_monthly_submissions),
--   trg_work_rest_reminders_scope_guard, trg_work_rest_breach_reports_scope_guard
--   (the trg_ prefix keeps them out of 060700's engine-guard inventory)
-- TS mirror: src/modules/work-rest/types/db.pending.ts
-- =================================================================
--
-- Why. The vessel overview (WorkRestOverview) listed only the crew whose
-- assignment is current (T-144: a person who transferred out mid-month
-- vanished from the origin vessel's month), its review buttons wrote the
-- breach rows directly, and nothing reminded anyone. Here the board, the
-- breach list and the month statistics are gated definers that read every
-- person assigned to the vessel on any day of the month; breaches are
-- reviewed, reminders sent and breach reports created only through
-- definers; nothing is sent automatically except the reminders (never the
-- breach report, T-142).
--
-- Who.
--   board, breaches, review, remind   vessel.crew.hours_of_rest.approve
--                                     (a head of department reviews their
--                                     own department only; the final
--                                     approver every department)
--   month statistics                  vessel.crew.hours_of_rest.view
--   breach report, its recipients     vessel.crew.hours_of_rest.final_approve
-- An external viewer, an inactive or anonymous caller, another company and
-- an unknown vessel are refused (42501 / P0002). Nobody reviews their own
-- breach.
--
-- Membership (T-144, D-X1-20): anyone with a crew_assignments row on the
-- vessel overlapping any day of the month (joined on or before its last
-- day, left on or after its first day, or still current with no end),
-- ended and transferred-out people included; their month is the one on
-- this vessel. A former crew member (no assignment today and none to
-- come) keeps their month on the board until it is approved, with
-- "Former crew" and "submit on their behalf" (C43, the engine's
-- submit_on_behalf).
--
-- Expected days (C45, W6): days of the month up to the vessel's today on
-- which Hours of Rest runs for the vessel (crew and crew_hor on, from
-- enabled_from), covered by one of the person's assignments, and not a
-- planner leave day (any day code but F on board and T travel). The same
-- rule as lib/horDay.ts.
--
-- Breach review (W6, C42): open -> accepted (a justification, 22023
-- note_required), correction_requested (the month is reopened through the
-- engine and the crew member is told), dismissed (only after a correction
-- was requested, 22023 dismiss_needs_correction). A reviewed, superseded or
-- reported breach is not reviewed again. A month with a correction still
-- requested is not approved (trigger trg_work_rest_month_correction_guard,
-- 22023 correction_pending).
--
-- Reminders (C41): manual, one per person and vessel per day (22023
-- reminder_rate_limited); automatic from the daily sweep on the 1st for
-- last month, on the person's sign-off day, and N days before the cut-off
-- (vessel_work_rest_settings.reminder_days_before_lock), once per person,
-- vessel, month and kind. In-app only (D-249): the copy never promises
-- email.
--
-- Breach report (C42, D-X1-14, D-X1-23): the final approver selects
-- reviewed breaches of one vessel in a period (accepted or dismissed, 22023
-- breach_not_reviewed) and the recipients among the company's fleet HR and
-- DPA (22023 recipient_not_allowed); the breaches are flagged with the
-- report, the recipients are told in STORM with a link to the report page.
-- No PDF is stored in wave 1 (file_path stays NULL); the page rebuilds it
-- from the stored ids and logs the export.
--
-- Serious breaches (W6): a breach that becomes serious tells the Master and
-- fleet HR at once (trigger work_rest_serious_breach_notify).
--
-- Every notification is sent inside its own exception block (D-128): a
-- missing type or a fan-out problem never rolls back the action.
--
-- Nothing here is live (D-01): the client reads the tables, the view and
-- the RPCs through the pending shim, and falls back to the legacy overview
-- while the board RPC is missing. Apply in one sitting with
-- 20261124060700 (see that ledger row's go-live note).
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each trigger,
-- policy and constraint, CREATE OR REPLACE for every function and view.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.work_rest_month_transition(uuid,uuid,integer,integer,text,text,text)') IS NULL
     OR to_regprocedure('public.work_rest_hor_on(uuid,date)') IS NULL
     OR to_regprocedure('public.work_rest_department_on(uuid,uuid,date,date)') IS NULL
     OR to_regprocedure('public.work_rest_assignment_on(uuid,uuid,date,date)') IS NULL
     OR to_regprocedure('public.work_rest_month_refresh(uuid)') IS NULL
     OR to_regprocedure('public.work_rest_vessel_tz(uuid)') IS NULL
     OR to_regprocedure('public.work_rest_rules_for(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060800_crew_hor_board needs the hours-of-rest engine: apply 20261124060700_crew_hor_engine.sql first';
  END IF;
  IF to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_vessel_gate(text,uuid,text)') IS NULL
     OR to_regprocedure('public.crew_cap_vessel_ids(text)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL
     OR to_regclass('public.positions') IS NULL OR to_regclass('public.departments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060800_crew_hor_board needs the crew gate helpers and positions: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regprocedure('public.crew_caller_is_external()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060800_crew_hor_board needs crew_caller_is_external(): apply 20261124060200_crew_vessel_list.sql first';
  END IF;
  IF to_regprocedure('public.emit_notification_event(text,uuid,text,text,uuid,text,text,text,text,text,uuid,text,uuid,uuid[],text[],jsonb,text,text)') IS NULL
     OR to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_user_is_external(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.hr_can_edit(uuid)') IS NULL
     OR to_regprocedure('public.format_reference(text,uuid,uuid,date)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060800_crew_hor_board needs the platform notification, record, reach, HR and reference helpers: apply 20261123000300 to 20261123030000 first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- reminders (C41)

CREATE TABLE IF NOT EXISTS public.work_rest_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  crew_user_id uuid NOT NULL,
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  kind text NOT NULL,
  sent_by uuid NULL,
  sent_by_role_label text NULL,
  sent_on date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'in_app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_rest_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT work_rest_reminders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT work_rest_reminders_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT work_rest_reminders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT work_rest_reminders_crew_user_id_fkey FOREIGN KEY (crew_user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT work_rest_reminders_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT work_rest_reminders_kind_check CHECK (kind IN ('auto_month_start', 'sign_off', 'pre_cutoff', 'manual')),
  CONSTRAINT work_rest_reminders_channel_check CHECK (channel IN ('in_app')),
  CONSTRAINT work_rest_reminders_period_check CHECK (period_month BETWEEN 1 AND 12 AND period_year BETWEEN 2000 AND 2100),
  CONSTRAINT work_rest_reminders_role_label_check CHECK (sent_by_role_label IS NULL OR length(sent_by_role_label) BETWEEN 1 AND 60),
  CONSTRAINT work_rest_reminders_automatic_check CHECK (kind = 'manual' OR sent_by IS NULL)
);
-- One manual reminder per person and vessel a day; each automatic one once per person, vessel, month and kind.
CREATE UNIQUE INDEX IF NOT EXISTS work_rest_reminders_manual_daily ON public.work_rest_reminders (crew_user_id, vessel_id, sent_on) WHERE kind = 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS work_rest_reminders_automatic_once ON public.work_rest_reminders (crew_user_id, vessel_id, period_year, period_month, kind) WHERE kind <> 'manual';
CREATE INDEX IF NOT EXISTS idx_wr_reminders_vessel_period ON public.work_rest_reminders (vessel_id, period_year, period_month, sent_at DESC);

-- ---------------------------------------------------------------- breach reports (C42, D-X1-23)

CREATE TABLE IF NOT EXISTS public.work_rest_breach_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  reference text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  nc_ids uuid[] NOT NULL,
  recipient_user_ids uuid[] NOT NULL,
  file_path text NULL,
  notes text NULL,
  sent_by uuid NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_rest_breach_reports_pkey PRIMARY KEY (id),
  CONSTRAINT work_rest_breach_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT work_rest_breach_reports_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT work_rest_breach_reports_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT work_rest_breach_reports_reference_key UNIQUE (company_id, reference),
  CONSTRAINT work_rest_breach_reports_period_check CHECK (period_to >= period_from AND period_to - period_from <= 366),
  CONSTRAINT work_rest_breach_reports_nc_ids_check CHECK (cardinality(nc_ids) BETWEEN 1 AND 500),
  CONSTRAINT work_rest_breach_reports_recipients_check CHECK (cardinality(recipient_user_ids) BETWEEN 1 AND 50),
  CONSTRAINT work_rest_breach_reports_notes_check CHECK (notes IS NULL OR length(notes) <= 2000),
  CONSTRAINT work_rest_breach_reports_file_path_check CHECK (file_path IS NULL OR length(file_path) BETWEEN 1 AND 1024)
);
CREATE INDEX IF NOT EXISTS idx_wr_breach_reports_vessel ON public.work_rest_breach_reports (vessel_id, sent_at DESC);

-- A breach names the report that included it (060700 added the column).
ALTER TABLE public.work_rest_non_conformities DROP CONSTRAINT IF EXISTS work_rest_non_conformities_breach_report_id_fkey;
ALTER TABLE public.work_rest_non_conformities ADD CONSTRAINT work_rest_non_conformities_breach_report_id_fkey
  FOREIGN KEY (breach_report_id) REFERENCES public.work_rest_breach_reports(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- scope guards (every writer)

-- A reminder carries its vessel's company and the person's profile; the
-- person is a member of that company.
CREATE OR REPLACE FUNCTION public.work_rest_reminders_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_profile uuid;
  v_profile_company uuid;
BEGIN
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  SELECT p.id, p.company_id INTO v_profile, v_profile_company FROM public.profiles AS p WHERE p.user_id = NEW.crew_user_id;
  NEW.company_id := coalesce(NEW.company_id, v_company);
  NEW.profile_id := coalesce(NEW.profile_id, v_profile);
  IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company OR NEW.profile_id IS DISTINCT FROM v_profile
     OR v_profile_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'work_rest_reminder_scope_mismatch',
      DETAIL = 'A reminder names a vessel and a crew member of the same company.';
  END IF;
  RETURN NEW;
END;
$$;

-- A breach report carries its vessel's company.
CREATE OR REPLACE FUNCTION public.work_rest_breach_reports_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  NEW.company_id := coalesce(NEW.company_id, v_company);
  IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'work_rest_breach_report_scope_mismatch',
      DETAIL = 'A breach report belongs to its vessel''s company.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_rest_reminders_scope_guard ON public.work_rest_reminders;
CREATE TRIGGER trg_work_rest_reminders_scope_guard BEFORE INSERT OR UPDATE ON public.work_rest_reminders
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_reminders_scope_guard();
DROP TRIGGER IF EXISTS trg_work_rest_breach_reports_scope_guard ON public.work_rest_breach_reports;
CREATE TRIGGER trg_work_rest_breach_reports_scope_guard BEFORE INSERT OR UPDATE ON public.work_rest_breach_reports
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_breach_reports_scope_guard();
DROP TRIGGER IF EXISTS trg_work_rest_reminders_updated_at ON public.work_rest_reminders;
CREATE TRIGGER trg_work_rest_reminders_updated_at BEFORE UPDATE ON public.work_rest_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_work_rest_breach_reports_updated_at ON public.work_rest_breach_reports;
CREATE TRIGGER trg_work_rest_breach_reports_updated_at BEFORE UPDATE ON public.work_rest_breach_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- the review view (fleet operations R9)

-- The breach review state fleet operations reads (X5 agreement 6). Security
-- invoker: the reader sees the breaches the work_rest_non_conformities
-- policies show them, nothing more.
CREATE OR REPLACE VIEW public.work_rest_breach_reviews WITH (security_invoker = true) AS
SELECT n.id AS nc_id,
       n.vessel_id,
       n.crew_id,
       n.window_start,
       n.window_end,
       n.is_serious,
       n.deficit_hours,
       n.review_outcome,
       n.reviewed_by,
       n.reviewed_at,
       n.breach_report_id,
       n.superseded_at,
       n.breach_day,
       n.rule_code,
       n.severity
FROM public.work_rest_non_conformities AS n;

-- ---------------------------------------------------------------- helpers (internal)

-- The logins with a crew_assignments row on the vessel overlapping
-- p_from..p_to (the rule of work_rest_assignment_on), in the vessel's
-- company: the board's members (T-144). Internal.
CREATE OR REPLACE FUNCTION public.work_rest_board_member_ids(p_vessel_id uuid, p_from date, p_to date)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ca.user_id
  FROM public.crew_assignments AS ca
  JOIN public.vessels AS v ON v.id = ca.vessel_id
  JOIN public.profiles AS p ON p.user_id = ca.user_id AND p.company_id = v.company_id
  WHERE ca.vessel_id = p_vessel_id
    AND coalesce(ca.join_date, ca.start_date) IS NOT NULL
    AND coalesce(ca.join_date, ca.start_date) <= p_to
    AND CASE WHEN coalesce(ca.leave_date, ca.end_date) IS NOT NULL THEN coalesce(ca.leave_date, ca.end_date) >= p_from
             ELSE coalesce(ca.is_current, false) END
$$;

-- The words "Reminded 3 Nov by <role>" use: the person's position on the
-- vessel today (the catalogue name, else the title on the assignment),
-- else 'Fleet office' for someone with fleet reach, else 'Approver'.
-- Internal.
CREATE OR REPLACE FUNCTION public.work_rest_role_label(p_user_id uuid, p_vessel_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_title text;
  v_rank text;
  v_name text;
BEGIN
  IF p_user_id IS NULL OR p_vessel_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF v_company IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT nullif(btrim(ca.position), ''), nullif(btrim(ca.rank), '') INTO v_title, v_rank
  FROM public.crew_assignments AS ca
  WHERE ca.user_id = p_user_id AND ca.vessel_id = p_vessel_id
    AND coalesce(ca.join_date, ca.start_date) IS NOT NULL
    AND coalesce(ca.join_date, ca.start_date) <= current_date
    AND CASE WHEN coalesce(ca.leave_date, ca.end_date) IS NOT NULL THEN coalesce(ca.leave_date, ca.end_date) >= current_date
             ELSE coalesce(ca.is_current, false) END
  ORDER BY coalesce(ca.join_date, ca.start_date) DESC, ca.id
  LIMIT 1;
  IF v_title IS NOT NULL OR v_rank IS NOT NULL THEN
    SELECT pos.name INTO v_name FROM public.positions AS pos
    WHERE pos.id = coalesce(public.crew_position_for(v_company, p_vessel_id, v_title), public.crew_position_for(v_company, p_vessel_id, v_rank));
    RETURN left(coalesce(v_name, v_title, v_rank), 60);
  END IF;
  IF coalesce(public.fleet_reach_for(p_user_id, v_company), false) THEN
    RETURN 'Fleet office';
  END IF;
  RETURN 'Approver';
END;
$$;

-- Fleet HR of a company (D-X1-14): an active member of the company, not an
-- external viewer, with fleet reach and HR edit rights. Internal.
CREATE OR REPLACE FUNCTION public.work_rest_is_fleet_hr(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL OR public.user_is_active(p_user_id) IS NOT TRUE
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = p_user_id AND p.company_id = p_company_id)
     OR public.record_user_is_external(p_user_id, p_company_id) IS NOT FALSE THEN
    RETURN false;
  END IF;
  RETURN coalesce(public.fleet_reach_for(p_user_id, p_company_id), false) AND coalesce(public.hr_can_edit(p_user_id), false);
END;
$$;

-- The DPA of a company: an active member holding an active DPA membership
-- (is_dpa, or a legacy-managed membership of a dpa profile), not an
-- external viewer. The rule notification_recipients uses for 'dpa'.
-- Internal.
CREATE OR REPLACE FUNCTION public.work_rest_is_dpa(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL OR public.user_is_active(p_user_id) IS NOT TRUE
     OR public.record_user_is_external(p_user_id, p_company_id) IS NOT FALSE THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.account_memberships AS m
    JOIN public.profiles AS p ON p.user_id = m.user_id AND p.company_id = m.company_id
    WHERE m.user_id = p_user_id AND m.company_id = p_company_id AND m.status = 'active'
      AND (m.is_dpa OR (m.legacy_managed AND p.role::text = 'dpa')));
END;
$$;

-- Who may receive a breach report of the company (D-X1-14): 'dpa', else
-- 'fleet_hr', else NULL. Internal.
CREATE OR REPLACE FUNCTION public.work_rest_report_recipient_kind(p_user_id uuid, p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN public.work_rest_is_dpa(p_user_id, p_company_id) THEN 'dpa'
           WHEN public.work_rest_is_fleet_hr(p_user_id, p_company_id) THEN 'fleet_hr'
         END
$$;

-- Who hears of a serious breach on a vessel at once (W6, D-X1-14): the
-- Master (an assignment holding the Master office now, record_is_master)
-- and the company's fleet HR. The DPA hears through the breach report.
-- Internal.
CREATE OR REPLACE FUNCTION public.work_rest_serious_breach_recipients(p_vessel_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT u.user_id
  FROM (
    SELECT ca.user_id
    FROM public.crew_assignments AS ca
    WHERE ca.vessel_id = p_vessel_id AND coalesce(ca.is_current, false)
      AND coalesce(public.record_is_master(ca.user_id, p_vessel_id), false)
    UNION
    SELECT p.user_id
    FROM public.vessels AS v
    JOIN public.profiles AS p ON p.company_id = v.company_id AND p.user_id IS NOT NULL
    WHERE v.id = p_vessel_id AND public.work_rest_is_fleet_hr(p.user_id, v.company_id)
  ) AS u
  WHERE u.user_id IS NOT NULL AND public.user_is_active(u.user_id) IS TRUE
$$;

-- The people an automatic reminder of a month goes to: board members of
-- the vessel for that month (p_vessel_id NULL: every vessel whose
-- automatic reminders are on), active, with at least one expected day up
-- to p_upto (Hours of Rest on, assigned, not on leave), and whose month on
-- the vessel is not submitted (no row, draft or reopened). Internal (the
-- sweep).
CREATE OR REPLACE FUNCTION public.work_rest_due_members(p_vessel_id uuid, p_year integer, p_month integer, p_upto date)
RETURNS TABLE (vessel_id uuid, company_id uuid, profile_id uuid, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT make_date(p_year, p_month, 1) AS first_day,
           least((make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date, p_upto) AS last_day
  ),
  vs AS (
    SELECT v.id, v.company_id
    FROM public.vessels AS v
    LEFT JOIN public.vessel_work_rest_settings AS s ON s.vessel_id = v.id
    WHERE (p_vessel_id IS NULL OR v.id = p_vessel_id) AND coalesce(s.auto_reminders, true)
  ),
  spans AS (
    SELECT ca.vessel_id, ca.user_id, coalesce(ca.join_date, ca.start_date) AS d_from, coalesce(ca.leave_date, ca.end_date) AS d_to
    FROM public.crew_assignments AS ca
    JOIN vs ON vs.id = ca.vessel_id
    CROSS JOIN bounds AS b
    WHERE coalesce(ca.join_date, ca.start_date) IS NOT NULL
      AND coalesce(ca.join_date, ca.start_date) <= b.last_day
      AND CASE WHEN coalesce(ca.leave_date, ca.end_date) IS NOT NULL THEN coalesce(ca.leave_date, ca.end_date) >= b.first_day
               ELSE coalesce(ca.is_current, false) END
  ),
  vdays AS (
    SELECT vs.id AS vessel_id, g.d::date AS d
    FROM vs
    CROSS JOIN bounds AS b
    CROSS JOIN LATERAL generate_series(b.first_day, b.last_day, interval '1 day') AS g(d)
    WHERE b.last_day >= b.first_day AND vs.id IN (SELECT s.vessel_id FROM spans AS s)
      AND public.work_rest_hor_on(vs.id, g.d::date)
  ),
  expected AS (
    SELECT DISTINCT sp.vessel_id, sp.user_id
    FROM spans AS sp
    JOIN vdays AS vd ON vd.vessel_id = sp.vessel_id AND vd.d >= sp.d_from AND (sp.d_to IS NULL OR vd.d <= sp.d_to)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.crew_leave_entries AS l
      WHERE l.crew_id = sp.user_id AND l.date = vd.d
        AND nullif(upper(btrim(l.status_code)), '') IS NOT NULL AND upper(btrim(l.status_code)) NOT IN ('F', 'T'))
  )
  SELECT e.vessel_id, vs.company_id, p.id, p.user_id
  FROM expected AS e
  JOIN vs ON vs.id = e.vessel_id
  JOIN public.profiles AS p ON p.user_id = e.user_id AND p.company_id = vs.company_id
  WHERE public.user_is_active(p.user_id) IS TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.work_rest_monthly_submissions AS m
      WHERE m.crew_id = e.user_id AND m.vessel_id = e.vessel_id AND m.period_year = p_year AND m.period_month = p_month
        AND m.status NOT IN ('draft', 'reopened'))
$$;

-- Tells the crew member of one reminder row (hor_reminder, in-app,
-- personal link to their month on that vessel). No vessel on the event, so
-- a former crew member who no longer reaches the vessel still hears it.
-- Never raises (D-128). Returns the outbox id, NULL when it was not sent.
-- Internal.
CREATE OR REPLACE FUNCTION public.work_rest_reminder_emit(p_reminder_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_period date;
  v_label text;
  v_cutoff date;
  v_body text;
  v_link text;
  v_id uuid;
BEGIN
  SELECT w.*, v.code AS vessel_code, v.name AS vessel_name, coalesce(s.cutoff_day_of_month, 1) AS cutoff_day
  INTO r
  FROM public.work_rest_reminders AS w
  JOIN public.vessels AS v ON v.id = w.vessel_id
  LEFT JOIN public.vessel_work_rest_settings AS s ON s.vessel_id = w.vessel_id
  WHERE w.id = p_reminder_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_period := make_date(r.period_year, r.period_month, 1);
  v_label := to_char(v_period, 'FMMonth YYYY');
  v_cutoff := (v_period + interval '1 month')::date
              + (least(greatest(r.cutoff_day, 1), extract(day FROM (v_period + interval '2 months - 1 day'))::integer) - 1);
  v_body := CASE r.kind
    WHEN 'manual' THEN format('Enter and submit your hours of rest for %s on %s.%s', v_label, r.vessel_name,
                              CASE WHEN r.sent_by_role_label IS NOT NULL THEN format(' Sent by the %s.', r.sent_by_role_label) ELSE '' END)
    WHEN 'auto_month_start' THEN format('Your hours of rest for %s on %s are not submitted yet.', v_label, r.vessel_name)
    WHEN 'sign_off' THEN format('You sign off %s today. Submit your hours of rest for %s before you leave.', r.vessel_name, v_label)
    ELSE format('Submit your hours of rest for %s on %s by %s.', v_label, r.vessel_name, to_char(v_cutoff, 'FMDD Mon'))
  END;
  v_link := 'hours-of-rest?month=' || to_char(v_period, 'YYYY-MM')
            || CASE WHEN nullif(btrim(coalesce(r.vessel_code, '')), '') IS NOT NULL THEN '&vessel=' || lower(btrim(r.vessel_code)) ELSE '' END;
  BEGIN
    v_id := public.emit_notification_event(
      p_type_key => 'hor_reminder',
      p_company_id => r.company_id,
      p_title => left(format('Hours of rest for %s', v_label), 120),
      p_link_scope => 'personal',
      p_body => left(v_body, 280),
      p_severity => 'info',
      p_link_path => v_link,
      p_must_act_user_ids => ARRAY[r.crew_user_id],
      p_payload => jsonb_build_object('reminder_id', r.id, 'vessel_id', r.vessel_id, 'period', to_char(v_period, 'YYYY-MM'), 'kind', r.kind),
      p_dedupe_key => 'hor_reminder:' || r.id::text,
      p_module_key => 'crew_hor');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'work_rest_reminder_emit: hor_reminder not sent (%): %', SQLSTATE, SQLERRM;
    v_id := NULL;
  END;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- the board (C40, C43, C45)

-- The vessel's hours-of-rest board for one month: one entry per person
-- assigned to the vessel on any day of the month (T-144), with what the
-- card, the queues and the mini calendar need. Returns
--   {vessel_id, year, month, today, first_day, last_day,
--    hor: {off, from}, hod_step, can_final_approve, my_department_key,
--    members: [{profile_id, user_id, first_name, last_name, preferred_name,
--               avatar_url, position_name, position_text, department_key,
--               department_label, sort_order,
--               assignments: [{from, to}],
--               month: {submission_id, status, submitted_at, on_behalf,
--                       hod_signed, approved_at, locked_at},
--               days: {records, leave, breach, warning}   (days of the month),
--               counts: {expected, logged, missing, breach_days, unreviewed,
--                        blocking_unreviewed, low_unreviewed,
--                        awaiting_correction, serious_open},
--               still_aboard, former_crew, on_leave_all_month,
--               last_reminder: {kind, sent_on, sent_at, by_label} | null,
--               reminded_today}]}
-- Gate: hours_of_rest.approve on the vessel, no external viewer; 22023
-- month_required / month_in_future (after the vessel's current month).
CREATE OR REPLACE FUNCTION public.work_rest_vessel_board(p_vessel_id uuid, p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_tz text;
  v_today date;
  v_first date;
  v_last date;
  v_upto date;
  v_rules jsonb;
  v_final boolean;
  v_my_dept text;
  v_hor jsonb;
  v_members jsonb;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.hours_of_rest.approve', p_vessel_id,
                                       'You can''t see the hours of rest of this vessel''s crew.');
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see the hours of rest of this vessel''s crew.';
  END IF;
  IF p_year IS NULL OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 OR p_year NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'month_required', DETAIL = 'Choose a month.';
  END IF;
  v_tz := public.work_rest_vessel_tz(p_vessel_id);
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_first := make_date(p_year, p_month, 1);
  v_last := (v_first + interval '1 month - 1 day')::date;
  IF v_first > v_today THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'month_in_future', DETAIL = 'That month has not started yet.';
  END IF;
  v_upto := least(v_last, v_today);
  v_rules := public.work_rest_rules_for(p_vessel_id);
  v_final := coalesce(public.crew_vessel_cap('vessel.crew.hours_of_rest.final_approve', p_vessel_id), false);
  v_my_dept := public.work_rest_department_on(public.my_profile_id(), p_vessel_id, v_today, v_today);
  SELECT jsonb_build_object('off', coalesce(bool_or(NOT s.enabled), false),
                            'from', to_char(max(s.enabled_from) FILTER (WHERE s.enabled), 'YYYY-MM-DD'))
  INTO v_hor
  FROM public.vessel_module_settings AS s
  WHERE s.vessel_id = p_vessel_id AND s.module_key IN ('crew', 'crew_hor');

  WITH days AS (
    SELECT g.d::date AS d, public.work_rest_hor_on(p_vessel_id, g.d::date) AS hor_on
    FROM generate_series(v_first, v_last, interval '1 day') AS g(d)
  ),
  spans AS (
    SELECT ca.id, ca.user_id, coalesce(ca.join_date, ca.start_date) AS d_from, coalesce(ca.leave_date, ca.end_date) AS d_to,
           nullif(btrim(ca.position), '') AS position_text, nullif(btrim(ca.rank), '') AS rank_text, nullif(btrim(ca.department), '') AS department_text
    FROM public.crew_assignments AS ca
    WHERE ca.vessel_id = p_vessel_id
      AND coalesce(ca.join_date, ca.start_date) IS NOT NULL
      AND coalesce(ca.join_date, ca.start_date) <= v_last
      AND CASE WHEN coalesce(ca.leave_date, ca.end_date) IS NOT NULL THEN coalesce(ca.leave_date, ca.end_date) >= v_first
               ELSE coalesce(ca.is_current, false) END
  ),
  people AS (
    SELECT p.id AS profile_id, p.user_id, p.first_name, p.last_name, p.preferred_name, p.avatar_url,
           la.position_text, la.rank_text, coalesce(la.department_text, nullif(btrim(p.department), '')) AS department_text,
           coalesce(public.crew_position_for(v_company, p_vessel_id, la.position_text),
                    public.crew_position_for(v_company, p_vessel_id, la.rank_text)) AS pid
    FROM public.profiles AS p
    CROSS JOIN LATERAL (
      SELECT s.position_text, s.rank_text, s.department_text FROM spans AS s
      WHERE s.user_id = p.user_id ORDER BY s.d_from DESC, s.id LIMIT 1
    ) AS la
    WHERE p.company_id = v_company AND p.user_id IN (SELECT s.user_id FROM spans AS s)
  ),
  placed AS (
    SELECT pe.*, pos.name AS position_name,
           CASE WHEN pos.id IS NULL THEN NULL ELSE coalesce(pm.sort_order, pos.sort_order) END AS pos_sort,
           dep.key AS department_key, dep.label AS department_label, dep.sort_order AS department_sort
    FROM people AS pe
    LEFT JOIN public.positions AS pos ON pos.id = pe.pid
    LEFT JOIN public.position_manning AS pm ON pm.vessel_id = p_vessel_id AND pm.position_id = pe.pid
    LEFT JOIN LATERAL (
      SELECT d.key, d.label, d.sort_order
      FROM public.departments AS d
      WHERE d.key = pos.department_key
         OR (pos.department_key IS NULL AND d.is_active AND pe.department_text IS NOT NULL
             AND (d.key = public.record_normalise_office(pe.department_text)
                  OR public.record_normalise_office(d.label) = public.record_normalise_office(pe.department_text)))
      ORDER BY (d.key = pos.department_key) DESC NULLS LAST, d.sort_order
      LIMIT 1
    ) AS dep ON true
  ),
  facts AS (
    SELECT pl.*,
           m.id AS submission_id, m.status AS month_status, m.submitted_at, m.submitted_on_behalf_by, m.hod_signed_at, m.approved_at,
           m.locked_at, m.captain_reviewed_at,
           (SELECT coalesce(array_agg(DISTINCT extract(day FROM r.record_date)::integer ORDER BY extract(day FROM r.record_date)::integer), '{}')
            FROM public.work_rest_records AS r
            WHERE r.crew_id = pl.user_id AND r.vessel_id = p_vessel_id AND r.record_date BETWEEN v_first AND v_last) AS record_days,
           (SELECT coalesce(array_agg(DISTINCT extract(day FROM l.date)::integer ORDER BY extract(day FROM l.date)::integer), '{}')
            FROM public.crew_leave_entries AS l
            WHERE l.crew_id = pl.user_id AND l.date BETWEEN v_first AND v_last
              AND nullif(upper(btrim(l.status_code)), '') IS NOT NULL AND upper(btrim(l.status_code)) NOT IN ('F', 'T')) AS leave_days,
           (SELECT coalesce(array_agg(DISTINCT extract(day FROM n.breach_day)::integer ORDER BY extract(day FROM n.breach_day)::integer), '{}')
            FROM public.work_rest_non_conformities AS n
            WHERE n.crew_id = pl.user_id AND n.vessel_id = p_vessel_id AND n.superseded_at IS NULL
              AND n.breach_day BETWEEN v_first AND v_last) AS breach_days,
           (SELECT coalesce(array_agg(DISTINCT x.day ORDER BY x.day), '{}')
            FROM (
              SELECT extract(day FROM ((c.window_end - interval '1 minute') AT TIME ZONE v_tz))::integer AS day
              FROM public.work_rest_compliance_checks AS c
              WHERE m.id IS NOT NULL AND c.submission_id = m.id AND c.passes
                AND ((c.check_window = 'rolling_24h' AND c.rest_minutes < coalesce(c.threshold_minutes, 0) + (v_rules ->> 'warn_24h')::numeric * 60)
                  OR (c.check_window = 'rolling_7d' AND c.rest_minutes < coalesce(c.threshold_minutes, 0) + (v_rules ->> 'warn_7d')::numeric * 60))
            ) AS x) AS warning_days,
           (SELECT jsonb_build_object(
                     'unreviewed', count(*) FILTER (WHERE n.review_outcome IS NULL AND n.status = 'open'),
                     'blocking_unreviewed', count(*) FILTER (WHERE n.review_outcome IS NULL AND n.status = 'open' AND n.severity <> 'low'),
                     'low_unreviewed', count(*) FILTER (WHERE n.review_outcome IS NULL AND n.status = 'open' AND n.severity = 'low'),
                     'awaiting_correction', count(*) FILTER (WHERE n.review_outcome = 'correction_requested'),
                     'serious_open', count(*) FILTER (WHERE n.is_serious AND ((n.review_outcome IS NULL AND n.status = 'open')
                                                                             OR n.review_outcome = 'correction_requested')))
            FROM public.work_rest_non_conformities AS n
            WHERE n.crew_id = pl.user_id AND n.vessel_id = p_vessel_id AND n.superseded_at IS NULL
              AND n.breach_day BETWEEN v_first AND v_last) AS nc_counts,
           (SELECT count(*) FROM days AS dd
            WHERE dd.hor_on AND dd.d <= v_upto
              AND EXISTS (SELECT 1 FROM spans AS s WHERE s.user_id = pl.user_id AND dd.d >= s.d_from AND (s.d_to IS NULL OR dd.d <= s.d_to))) AS covered_days,
           (SELECT count(*) FROM days AS dd
            WHERE dd.hor_on AND dd.d <= v_upto
              AND EXISTS (SELECT 1 FROM spans AS s WHERE s.user_id = pl.user_id AND dd.d >= s.d_from AND (s.d_to IS NULL OR dd.d <= s.d_to))
              AND NOT EXISTS (SELECT 1 FROM public.crew_leave_entries AS l
                              WHERE l.crew_id = pl.user_id AND l.date = dd.d
                                AND nullif(upper(btrim(l.status_code)), '') IS NOT NULL AND upper(btrim(l.status_code)) NOT IN ('F', 'T'))) AS expected_days,
           (SELECT count(*) FROM days AS dd
            WHERE dd.hor_on AND dd.d <= v_upto
              AND EXISTS (SELECT 1 FROM spans AS s WHERE s.user_id = pl.user_id AND dd.d >= s.d_from AND (s.d_to IS NULL OR dd.d <= s.d_to))
              AND NOT EXISTS (SELECT 1 FROM public.crew_leave_entries AS l
                              WHERE l.crew_id = pl.user_id AND l.date = dd.d
                                AND nullif(upper(btrim(l.status_code)), '') IS NOT NULL AND upper(btrim(l.status_code)) NOT IN ('F', 'T'))
              AND NOT EXISTS (SELECT 1 FROM public.work_rest_records AS r WHERE r.crew_id = pl.user_id AND r.record_date = dd.d)) AS missing_days,
           EXISTS (SELECT 1 FROM spans AS s WHERE s.user_id = pl.user_id AND v_today >= s.d_from AND (s.d_to IS NULL OR v_today <= s.d_to)) AS still_aboard,
           coalesce(public.work_rest_assignment_on(pl.user_id, p_vessel_id, v_today, v_today), false)
             OR EXISTS (SELECT 1 FROM public.crew_assignments AS ca
                        WHERE ca.user_id = pl.user_id AND ca.vessel_id = p_vessel_id
                          AND coalesce(ca.join_date, ca.start_date) > v_today) AS on_vessel_now_or_later,
           EXISTS (SELECT 1 FROM public.work_rest_signatures AS g WHERE m.id IS NOT NULL AND g.submission_id = m.id AND g.signer_role = 'hod' AND g.stale_at IS NULL)
             OR coalesce(m.status IN ('hod_signed', 'hod_reviewed'), false) AS hod_signed,
           (SELECT jsonb_build_object('kind', w.kind, 'sent_on', to_char(w.sent_on, 'YYYY-MM-DD'), 'sent_at', w.sent_at, 'by_label', w.sent_by_role_label)
            FROM public.work_rest_reminders AS w
            WHERE w.crew_user_id = pl.user_id AND w.vessel_id = p_vessel_id AND w.period_year = p_year AND w.period_month = p_month
            ORDER BY w.sent_at DESC, w.id LIMIT 1) AS last_reminder,
           EXISTS (SELECT 1 FROM public.work_rest_reminders AS w
                   WHERE w.crew_user_id = pl.user_id AND w.vessel_id = p_vessel_id AND w.kind = 'manual' AND w.sent_on = v_today) AS reminded_today,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('from', to_char(s.d_from, 'YYYY-MM-DD'), 'to', to_char(s.d_to, 'YYYY-MM-DD')) ORDER BY s.d_from, s.id), '[]'::jsonb)
            FROM spans AS s WHERE s.user_id = pl.user_id) AS assignments
    FROM placed AS pl
    LEFT JOIN public.work_rest_monthly_submissions AS m
      ON m.crew_id = pl.user_id AND m.vessel_id = p_vessel_id AND m.period_year = p_year AND m.period_month = p_month
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'profile_id', f.profile_id,
           'user_id', f.user_id,
           'first_name', f.first_name,
           'last_name', f.last_name,
           'preferred_name', f.preferred_name,
           'avatar_url', f.avatar_url,
           'position_name', f.position_name,
           'position_text', coalesce(f.position_text, f.rank_text),
           'department_key', f.department_key,
           'department_label', f.department_label,
           'sort_order', f.pos_sort,
           'assignments', f.assignments,
           'month', jsonb_build_object(
             'submission_id', f.submission_id,
             'status', f.month_status,
             'submitted_at', f.submitted_at,
             'on_behalf', f.submitted_on_behalf_by IS NOT NULL,
             'hod_signed', f.hod_signed,
             'approved_at', coalesce(f.approved_at, f.captain_reviewed_at),
             'locked_at', f.locked_at),
           'days', jsonb_build_object(
             'records', to_jsonb(f.record_days),
             'leave', to_jsonb(f.leave_days),
             'breach', to_jsonb(f.breach_days),
             'warning', to_jsonb(ARRAY(SELECT x FROM unnest(f.warning_days) AS x WHERE x <> ALL (f.breach_days) ORDER BY x))),
           'counts', jsonb_build_object(
             'expected', f.expected_days,
             'logged', cardinality(f.record_days),
             'missing', f.missing_days,
             'breach_days', cardinality(f.breach_days),
             'unreviewed', coalesce((f.nc_counts ->> 'unreviewed')::integer, 0),
             'blocking_unreviewed', coalesce((f.nc_counts ->> 'blocking_unreviewed')::integer, 0),
             'low_unreviewed', coalesce((f.nc_counts ->> 'low_unreviewed')::integer, 0),
             'awaiting_correction', coalesce((f.nc_counts ->> 'awaiting_correction')::integer, 0),
             'serious_open', coalesce((f.nc_counts ->> 'serious_open')::integer, 0)),
           'still_aboard', f.still_aboard,
           'former_crew', NOT f.on_vessel_now_or_later,
           'on_leave_all_month', f.covered_days > 0 AND f.expected_days = 0 AND cardinality(f.record_days) = 0,
           'last_reminder', f.last_reminder,
           'reminded_today', f.reminded_today)
         ORDER BY f.department_sort NULLS LAST, f.department_key NULLS LAST, f.pos_sort NULLS LAST,
                  lower(coalesce(f.last_name, '')), lower(coalesce(f.first_name, '')), f.profile_id), '[]'::jsonb)
  INTO v_members
  FROM facts AS f;

  RETURN jsonb_build_object(
    'vessel_id', p_vessel_id,
    'year', p_year,
    'month', p_month,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'first_day', to_char(v_first, 'YYYY-MM-DD'),
    'last_day', to_char(v_last, 'YYYY-MM-DD'),
    'hor', coalesce(v_hor, jsonb_build_object('off', false, 'from', NULL)),
    'hod_step', coalesce(v_rules ->> 'hod_step', 'nudge'),
    'can_final_approve', v_final,
    'my_department_key', v_my_dept,
    'members', v_members);
END;
$$;

-- ---------------------------------------------------------------- month statistics (C44; read by the report page)

-- One row per month of the year up to the vessel's current month: the
-- board members, days logged, breach days, unreviewed breaches, serious
-- open, corrections awaited, and the months by state (not submitted:
-- no row, draft or reopened; awaiting approval: submitted or HoD signed;
-- approved; locked). Gate: hours_of_rest.view on the vessel, no external
-- viewer; 22023 year_required (a year after the current one has no rows).
CREATE OR REPLACE FUNCTION public.work_rest_month_stats(p_vessel_id uuid, p_year integer)
RETURNS TABLE (
  period_month integer,
  crew integer,
  days_logged integer,
  breach_days integer,
  unreviewed integer,
  serious_open integer,
  awaiting_correction integer,
  not_submitted integer,
  awaiting_approval integer,
  approved integer,
  locked integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_today date;
  v_upto integer;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.hours_of_rest.view', p_vessel_id,
                                       'You can''t see the hours of rest report of this vessel.');
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see the hours of rest report of this vessel.';
  END IF;
  IF p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'year_required', DETAIL = 'Choose a year.';
  END IF;
  v_today := (now() AT TIME ZONE public.work_rest_vessel_tz(p_vessel_id))::date;
  v_upto := CASE WHEN p_year < extract(year FROM v_today)::integer THEN 12
                 WHEN p_year = extract(year FROM v_today)::integer THEN extract(month FROM v_today)::integer
                 ELSE 0 END;

  RETURN QUERY
  WITH months AS (
    SELECT g.m::integer AS mo, make_date(p_year, g.m::integer, 1) AS first_day,
           (make_date(p_year, g.m::integer, 1) + interval '1 month - 1 day')::date AS last_day
    FROM generate_series(1, v_upto) AS g(m)
  ),
  members AS (
    SELECT DISTINCT mo.mo, ca.user_id
    FROM months AS mo
    JOIN public.crew_assignments AS ca
      ON ca.vessel_id = p_vessel_id
     AND coalesce(ca.join_date, ca.start_date) IS NOT NULL
     AND coalesce(ca.join_date, ca.start_date) <= mo.last_day
     AND CASE WHEN coalesce(ca.leave_date, ca.end_date) IS NOT NULL THEN coalesce(ca.leave_date, ca.end_date) >= mo.first_day
              ELSE coalesce(ca.is_current, false) END
    JOIN public.profiles AS p ON p.user_id = ca.user_id AND p.company_id = v_company
  ),
  states AS (
    SELECT mb.mo,
           CASE coalesce(s.status, 'draft')
             WHEN 'draft' THEN 'not_submitted' WHEN 'reopened' THEN 'not_submitted'
             WHEN 'submitted' THEN 'awaiting' WHEN 'crew_signed' THEN 'awaiting'
             WHEN 'hod_signed' THEN 'awaiting' WHEN 'hod_reviewed' THEN 'awaiting'
             WHEN 'approved' THEN 'approved' WHEN 'captain_reviewed' THEN 'approved'
             WHEN 'locked' THEN 'locked' ELSE 'not_submitted'
           END AS state
    FROM members AS mb
    LEFT JOIN public.work_rest_monthly_submissions AS s
      ON s.crew_id = mb.user_id AND s.vessel_id = p_vessel_id AND s.period_year = p_year AND s.period_month = mb.mo
  ),
  ncs AS (
    SELECT extract(month FROM n.breach_day)::integer AS mo, n.crew_id, n.breach_day, n.review_outcome, n.status, n.is_serious
    FROM public.work_rest_non_conformities AS n
    WHERE n.vessel_id = p_vessel_id AND n.superseded_at IS NULL
      AND n.breach_day BETWEEN make_date(p_year, 1, 1) AND make_date(p_year, 12, 31)
  )
  SELECT mo.mo,
         (SELECT count(*) FROM members AS mb WHERE mb.mo = mo.mo)::integer,
         (SELECT count(*) FROM public.work_rest_records AS r
          WHERE r.vessel_id = p_vessel_id AND r.record_date BETWEEN mo.first_day AND mo.last_day
            AND r.crew_id IN (SELECT mb.user_id FROM members AS mb WHERE mb.mo = mo.mo))::integer,
         (SELECT count(DISTINCT (n.crew_id, n.breach_day)) FROM ncs AS n WHERE n.mo = mo.mo)::integer,
         (SELECT count(*) FROM ncs AS n WHERE n.mo = mo.mo AND n.review_outcome IS NULL AND n.status = 'open')::integer,
         (SELECT count(*) FROM ncs AS n WHERE n.mo = mo.mo AND n.is_serious
            AND ((n.review_outcome IS NULL AND n.status = 'open') OR n.review_outcome = 'correction_requested'))::integer,
         (SELECT count(*) FROM ncs AS n WHERE n.mo = mo.mo AND n.review_outcome = 'correction_requested')::integer,
         (SELECT count(*) FROM states AS st WHERE st.mo = mo.mo AND st.state = 'not_submitted')::integer,
         (SELECT count(*) FROM states AS st WHERE st.mo = mo.mo AND st.state = 'awaiting')::integer,
         (SELECT count(*) FROM states AS st WHERE st.mo = mo.mo AND st.state = 'approved')::integer,
         (SELECT count(*) FROM states AS st WHERE st.mo = mo.mo AND st.state = 'locked')::integer
  FROM months AS mo
  ORDER BY mo.mo;
END;
$$;

-- ---------------------------------------------------------------- breaches (C42)

-- The vessel's live breaches whose day lies in p_from..p_to (at most a
-- year), serious first, then the newest day; p_only_open keeps those not
-- reviewed yet or awaiting a correction. Each row says whether the caller
-- may review it (not their own; the final approver every department, a
-- head of department their own). Gate: hours_of_rest.approve on the
-- vessel, no external viewer; 22023 range_required / range_invalid /
-- range_too_long.
CREATE OR REPLACE FUNCTION public.work_rest_vessel_breaches(p_vessel_id uuid, p_from date, p_to date, p_only_open boolean DEFAULT false)
RETURNS TABLE (
  nc_id uuid,
  profile_id uuid,
  crew_user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  position_name text,
  department_key text,
  department_label text,
  submission_id uuid,
  month_status text,
  breach_day date,
  rule_code text,
  rule_description text,
  severity text,
  is_serious boolean,
  measured_value numeric,
  threshold_value numeric,
  deficit_hours numeric,
  window_start timestamptz,
  window_end timestamptz,
  status text,
  review_outcome text,
  review_note text,
  reviewed_by uuid,
  reviewer_name text,
  reviewed_at timestamptz,
  breach_report_id uuid,
  can_review boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_uid uuid := auth.uid();
  v_today date;
  v_final boolean;
  v_my_dept text;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.hours_of_rest.approve', p_vessel_id,
                                       'You can''t review the hours of rest of this vessel''s crew.');
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t review the hours of rest of this vessel''s crew.';
  END IF;
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_required', DETAIL = 'Choose a start and an end date.';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_invalid', DETAIL = 'The end date is before the start date.';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_too_long', DETAIL = 'Choose a range of one year or less.';
  END IF;
  v_today := (now() AT TIME ZONE public.work_rest_vessel_tz(p_vessel_id))::date;
  v_final := coalesce(public.crew_vessel_cap('vessel.crew.hours_of_rest.final_approve', p_vessel_id), false);
  v_my_dept := public.work_rest_department_on(public.my_profile_id(), p_vessel_id, v_today, v_today);

  RETURN QUERY
  WITH live AS (
    SELECT n.*
    FROM public.work_rest_non_conformities AS n
    WHERE n.vessel_id = p_vessel_id AND n.superseded_at IS NULL AND n.breach_day BETWEEN p_from AND p_to
      AND (NOT coalesce(p_only_open, false)
           OR (n.review_outcome IS NULL AND n.status = 'open') OR n.review_outcome = 'correction_requested')
  ),
  persons AS (
    SELECT p.id AS profile_id, p.user_id, p.first_name, p.last_name, p.preferred_name,
           public.work_rest_department_on(p.id, p_vessel_id, p_from, p_to) AS dept_key
    FROM public.profiles AS p
    WHERE p.company_id = v_company AND p.user_id IN (SELECT l.crew_id FROM live AS l)
  ),
  named AS (
    SELECT pe.*, dep.label AS dept_label,
           (SELECT pos.name FROM public.positions AS pos
            WHERE pos.id = (
              SELECT coalesce(public.crew_position_for(v_company, p_vessel_id, nullif(btrim(ca.position), '')),
                              public.crew_position_for(v_company, p_vessel_id, nullif(btrim(ca.rank), '')))
              FROM public.crew_assignments AS ca
              WHERE ca.user_id = pe.user_id AND ca.vessel_id = p_vessel_id
              ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
              LIMIT 1)) AS pos_name
    FROM persons AS pe
    LEFT JOIN public.departments AS dep ON dep.key = pe.dept_key
  )
  SELECT l.id, nm.profile_id, l.crew_id, nm.first_name, nm.last_name, nm.preferred_name, nm.pos_name, nm.dept_key, nm.dept_label,
         l.submission_id, s.status, l.breach_day, l.rule_code, l.rule_description, l.severity, l.is_serious,
         l.measured_value, l.threshold_value, l.deficit_hours, l.window_start, l.window_end, l.status, l.review_outcome,
         l.review_note, l.reviewed_by,
         nullif(btrim(concat_ws(' ', rv.first_name, rv.last_name)), ''),
         l.reviewed_at, l.breach_report_id,
         (l.crew_id IS DISTINCT FROM v_uid
          AND l.breach_report_id IS NULL
          AND (v_final OR (v_my_dept IS NOT NULL AND v_my_dept = nm.dept_key)))
  FROM live AS l
  JOIN named AS nm ON nm.user_id = l.crew_id
  LEFT JOIN public.work_rest_monthly_submissions AS s ON s.id = l.submission_id
  LEFT JOIN public.profiles AS rv ON rv.user_id = l.reviewed_by
  ORDER BY l.is_serious DESC,
           ((l.review_outcome IS NULL AND l.status = 'open') OR l.review_outcome = 'correction_requested') DESC,
           l.breach_day DESC,
           lower(coalesce(nm.last_name, '')), lower(coalesce(nm.first_name, '')), l.rule_code, l.id;
END;
$$;

-- Reviews one breach (W6, C42): accepted with a justification,
-- correction_requested (the month is reopened through the engine when it
-- was submitted, HoD-signed, approved or locked, and the crew member is
-- told), or dismissed (only after a correction was requested). Gate:
-- hours_of_rest.approve on the breach's vessel for its department (a head
-- of department), or final_approve; never one's own breach; reopening an
-- approved or locked month needs final_approve. Refusals: P0002
-- breach_not_found; 42501 not_permitted / own_breach / out_of_department /
-- reopen_not_permitted; 22023 outcome_invalid / note_required /
-- note_too_long / dismiss_needs_correction / correction_already_requested
-- / already_reviewed / breach_superseded / breach_reported. Returns
-- {nc_id, review_outcome, status, month_status, reopened}.
CREATE OR REPLACE FUNCTION public.work_rest_review_breach(p_nc_id uuid, p_outcome text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev text := coalesce(current_setting('storm.crew_engine', true), '');
  v_nc public.work_rest_non_conformities%ROWTYPE;
  v_vessel uuid;
  v_company uuid;
  v_vessel_code text;
  v_profile uuid;
  v_profile_company uuid;
  v_month uuid;
  v_month_status text;
  v_state text;
  v_final boolean;
  v_approve boolean;
  v_today date;
  v_mine text;
  v_theirs text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_status text;
  v_reason text;
  v_reopened boolean := false;
  v_period date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('accepted', 'correction_requested', 'dismissed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'outcome_invalid', DETAIL = 'Accept the breach, request a correction or dismiss it.';
  END IF;
  IF p_nc_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'breach_not_found', DETAIL = 'This breach could not be found.';
  END IF;
  SELECT n.* INTO v_nc FROM public.work_rest_non_conformities AS n WHERE n.id = p_nc_id FOR UPDATE;
  IF v_nc.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'breach_not_found', DETAIL = 'This breach could not be found.';
  END IF;
  SELECT s.id, s.status, s.vessel_id INTO v_month, v_month_status, v_vessel
  FROM public.work_rest_monthly_submissions AS s WHERE s.id = v_nc.submission_id;
  v_vessel := coalesce(v_nc.vessel_id, v_vessel);
  SELECT v.company_id, v.code INTO v_company, v_vessel_code FROM public.vessels AS v WHERE v.id = v_vessel;
  v_approve := coalesce(public.crew_vessel_cap('vessel.crew.hours_of_rest.approve', v_vessel), false);
  v_final := coalesce(public.crew_vessel_cap('vessel.crew.hours_of_rest.final_approve', v_vessel), false);
  -- A breach the caller may not review reads as not found (another company, a vessel out of reach).
  IF v_company IS NULL OR (v_approve IS NOT TRUE AND v_final IS NOT TRUE) THEN
    IF v_company IS NOT NULL AND public.user_belongs_to_company(v_uid, v_company) IS TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted', DETAIL = 'You don''t have permission to review hours of rest breaches on this vessel.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'breach_not_found', DETAIL = 'This breach could not be found.';
  END IF;
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted', DETAIL = 'External viewers cannot review hours of rest.';
  END IF;
  IF v_nc.crew_id = v_uid THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'own_breach', DETAIL = 'Someone else reviews your own breaches.';
  END IF;
  SELECT p.id, p.company_id INTO v_profile, v_profile_company FROM public.profiles AS p WHERE p.user_id = v_nc.crew_id;
  IF v_profile_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'breach_not_found', DETAIL = 'This breach could not be found.';
  END IF;
  v_today := (now() AT TIME ZONE public.work_rest_vessel_tz(v_vessel))::date;
  IF v_final IS NOT TRUE THEN
    v_mine := public.work_rest_department_on(public.my_profile_id(), v_vessel, v_today, v_today);
    v_theirs := public.work_rest_department_on(v_profile, v_vessel, coalesce(v_nc.breach_day, v_today), coalesce(v_nc.breach_day, v_today));
    IF v_mine IS NULL OR v_theirs IS NULL OR v_mine IS DISTINCT FROM v_theirs THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'out_of_department',
        DETAIL = 'Heads of department review breaches of their own department only.';
    END IF;
  END IF;

  -- Where the breach is.
  IF v_nc.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'breach_superseded', DETAIL = 'The record was corrected and this breach no longer applies.';
  END IF;
  IF v_nc.breach_report_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'breach_reported', DETAIL = 'This breach is in a breach report and can no longer change.';
  END IF;
  IF coalesce(v_nc.review_outcome IN ('accepted', 'dismissed'), false)
     OR (v_nc.review_outcome IS NULL AND coalesce(v_nc.status, 'open') <> 'open') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_reviewed', DETAIL = 'This breach has been reviewed.';
  END IF;
  IF p_outcome = 'correction_requested' AND v_nc.review_outcome = 'correction_requested' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'correction_already_requested', DETAIL = 'A correction has already been requested for this breach.';
  END IF;
  IF p_outcome = 'dismissed' AND v_nc.review_outcome IS DISTINCT FROM 'correction_requested' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'dismiss_needs_correction',
      DETAIL = 'Dismiss a breach only after a correction was requested and the record checked. Accept it with a justification instead.';
  END IF;
  IF p_outcome = 'accepted' AND v_note IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'note_required', DETAIL = 'Give the justification, for example an emergency or a drill.';
  END IF;
  IF length(coalesce(v_note, '')) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'note_too_long', DETAIL = 'Keep the note to 2000 characters.';
  END IF;

  -- The month goes back to the crew member for a correction (through the engine).
  v_state := CASE coalesce(v_month_status, 'draft')
    WHEN 'crew_signed' THEN 'submitted' WHEN 'hod_reviewed' THEN 'hod_signed' WHEN 'captain_reviewed' THEN 'approved'
    ELSE coalesce(v_month_status, 'draft') END;
  PERFORM set_config('storm.crew_engine', 'on', true);
  IF p_outcome = 'correction_requested' AND v_month IS NOT NULL AND v_state IN ('submitted', 'hod_signed', 'approved', 'locked') THEN
    IF v_state IN ('approved', 'locked') AND v_final IS NOT TRUE THEN
      PERFORM set_config('storm.crew_engine', v_prev, true);
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'reopen_not_permitted',
        DETAIL = 'This month is approved. Only the final approver can send it back for a correction.';
    END IF;
    v_reason := left(format('Correction requested for %s: %s', to_char(v_nc.breach_day, 'FMDD Mon YYYY'),
                            coalesce(v_note, v_nc.rule_description, v_nc.rule_code)), 2000);
    UPDATE public.work_rest_signatures SET stale_at = now(), stale_reason = left(v_reason, 500)
    WHERE submission_id = v_month AND stale_at IS NULL;
    UPDATE public.work_rest_monthly_submissions AS s
    SET status = 'reopened',
        submitted_at = NULL, submitted_by = NULL, crew_signed_at = NULL,
        submitted_on_behalf_by = NULL, on_behalf_reason = NULL,
        hod_signed_at = NULL, hod_signed_by = NULL,
        approved_at = NULL, approved_by = NULL, captain_reviewed_at = NULL,
        locked_at = NULL, locked_by = NULL,
        reopened_at = now(), reopened_by = v_uid, reopen_reason = v_reason
    WHERE s.id = v_month;
    INSERT INTO public.work_rest_audit_log (submission_id, crew_id, actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (v_month, v_nc.crew_id, v_uid, CASE WHEN v_final THEN 'approver' ELSE 'hod' END, 'month_reopen', 'work_rest_monthly_submission', v_month,
            jsonb_build_object('status', v_month_status), jsonb_build_object('status', 'reopened'),
            jsonb_build_object('reason', v_reason, 'nc_id', v_nc.id, 'by', 'breach_review', 'vessel_id', v_vessel));
    v_reopened := true;
    v_month_status := 'reopened';
  END IF;

  v_status := CASE p_outcome WHEN 'accepted' THEN 'justified' WHEN 'correction_requested' THEN 'reviewed' ELSE 'dismissed' END;
  UPDATE public.work_rest_non_conformities AS n
  SET review_outcome = p_outcome,
      review_note = v_note,
      reviewed_by = v_uid,
      reviewer_id = v_uid,
      reviewed_at = now(),
      status = v_status,
      justification = CASE WHEN p_outcome = 'accepted' THEN v_note ELSE n.justification END
  WHERE n.id = v_nc.id;
  INSERT INTO public.work_rest_audit_log (submission_id, crew_id, actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (v_month, v_nc.crew_id, v_uid, CASE WHEN v_final THEN 'approver' ELSE 'hod' END, 'breach_reviewed', 'work_rest_non_conformity', v_nc.id,
          jsonb_build_object('status', v_nc.status, 'review_outcome', v_nc.review_outcome),
          jsonb_build_object('status', v_status, 'review_outcome', p_outcome),
          jsonb_strip_nulls(jsonb_build_object('note', v_note, 'rule_code', v_nc.rule_code, 'breach_day', v_nc.breach_day, 'vessel_id', v_vessel)));
  PERFORM set_config('storm.crew_engine', v_prev, true);
  IF v_month IS NOT NULL THEN
    PERFORM public.work_rest_month_refresh(v_month);
  END IF;

  -- The crew member hears of a correction (D-128: never rolls the review back).
  IF p_outcome = 'correction_requested' THEN
    BEGIN
      v_period := date_trunc('month', coalesce(v_nc.breach_day, v_today))::date;
      PERFORM public.emit_notification_event(
        p_type_key => 'hor_correction_requested',
        p_company_id => v_company,
        p_title => left(format('Check your hours of rest for %s', to_char(v_period, 'FMMonth YYYY')), 120),
        p_link_scope => 'personal',
        p_body => left(format('Check %s and submit the month again.%s', to_char(v_nc.breach_day, 'FMDD Mon'),
                              CASE WHEN v_note IS NOT NULL THEN ' ' || v_note ELSE '' END), 280),
        p_severity => 'warning',
        p_link_path => 'hours-of-rest?month=' || to_char(v_period, 'YYYY-MM')
                       || CASE WHEN nullif(btrim(coalesce(v_vessel_code, '')), '') IS NOT NULL THEN '&vessel=' || lower(btrim(v_vessel_code)) ELSE '' END,
        p_must_act_user_ids => ARRAY[v_nc.crew_id],
        p_payload => jsonb_build_object('nc_id', v_nc.id, 'vessel_id', v_vessel, 'period', to_char(v_period, 'YYYY-MM')),
        p_dedupe_key => 'hor_correction_requested:' || v_nc.id::text,
        p_module_key => 'crew_hor');
    EXCEPTION WHEN others THEN
      RAISE WARNING 'work_rest_review_breach: hor_correction_requested not sent (%): %', SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('nc_id', v_nc.id, 'review_outcome', p_outcome, 'status', v_status,
                            'month_status', v_month_status, 'reopened', v_reopened);
END;
$$;

-- ---------------------------------------------------------------- reminders (C41)

-- Reminds crew members of a month on the vessel (the board's Remind, one
-- or several): every id must be on the vessel's board for that month
-- (42501 not_on_board); a person already reminded today, or whose month is
-- already submitted, is skipped; when nobody is left, 22023
-- reminder_rate_limited ("Already reminded today.") or month_closed. Each
-- reminder is logged ("Reminded <date> by <role>") and tells the person in
-- STORM. Gate: hours_of_rest.approve on the vessel, no external viewer.
-- Returns {sent, sent_to, skipped: [{user_id, reason}], sent_on, by_label}.
CREATE OR REPLACE FUNCTION public.work_rest_remind(p_vessel_id uuid, p_crew_user_ids uuid[], p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_today date;
  v_first date;
  v_last date;
  v_ids uuid[];
  v_label text;
  v_user uuid;
  v_id uuid;
  v_sent uuid[] := ARRAY[]::uuid[];
  v_skipped jsonb := '[]'::jsonb;
  v_any_rate boolean := false;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.hours_of_rest.approve', p_vessel_id,
                                       'You don''t have permission to remind crew on this vessel.');
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'External viewers cannot remind crew.';
  END IF;
  IF p_year IS NULL OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 OR p_year NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'month_required', DETAIL = 'Choose a month.';
  END IF;
  IF p_crew_user_ids IS NULL OR cardinality(p_crew_user_ids) = 0 OR array_position(p_crew_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'crew_required', DETAIL = 'Choose who to remind.';
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_crew_user_ids) AS x;
  IF cardinality(v_ids) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_crew', DETAIL = 'Remind at most 200 people at a time.';
  END IF;
  v_today := (now() AT TIME ZONE public.work_rest_vessel_tz(p_vessel_id))::date;
  v_first := make_date(p_year, p_month, 1);
  v_last := (v_first + interval '1 month - 1 day')::date;
  IF v_first > v_today THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'month_in_future', DETAIL = 'That month has not started yet.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) AS x WHERE x NOT IN (SELECT public.work_rest_board_member_ids(p_vessel_id, v_first, v_last))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_on_board',
      DETAIL = 'Remind only crew on this vessel''s hours of rest board for that month.';
  END IF;
  v_label := public.work_rest_role_label(v_uid, p_vessel_id);

  FOREACH v_user IN ARRAY v_ids LOOP
    IF EXISTS (SELECT 1 FROM public.work_rest_monthly_submissions AS m
               WHERE m.crew_id = v_user AND m.vessel_id = p_vessel_id AND m.period_year = p_year AND m.period_month = p_month
                 AND m.status NOT IN ('draft', 'reopened')) THEN
      v_skipped := v_skipped || jsonb_build_object('user_id', v_user, 'reason', 'month_closed');
      CONTINUE;
    END IF;
    v_id := NULL;
    INSERT INTO public.work_rest_reminders (vessel_id, crew_user_id, period_year, period_month, kind, sent_by, sent_by_role_label, sent_on)
    VALUES (p_vessel_id, v_user, p_year, p_month, 'manual', v_uid, v_label, v_today)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('user_id', v_user, 'reason', 'reminder_rate_limited');
      v_any_rate := true;
      CONTINUE;
    END IF;
    PERFORM public.work_rest_reminder_emit(v_id);
    v_sent := v_sent || v_user;
  END LOOP;

  IF cardinality(v_sent) = 0 THEN
    IF v_any_rate THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reminder_rate_limited', DETAIL = 'Already reminded today.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'month_closed', DETAIL = 'Their month is already submitted.';
  END IF;
  RETURN jsonb_build_object('sent', cardinality(v_sent), 'sent_to', to_jsonb(v_sent), 'skipped', v_skipped,
                            'sent_on', to_char(v_today, 'YYYY-MM-DD'), 'by_label', v_label);
END;
$$;

-- The daily automatic reminders (C41; hr-daily-sweeper, D-232): on the
-- 1st for last month's months not submitted (auto_month_start), on a
-- person's sign-off day for the current month (sign_off), and
-- reminder_days_before_lock days before the cut-off day of the month
-- after (pre_cutoff; skipped for a person already reminded that day).
-- Only vessels whose automatic reminders are on (auto_reminders, on with
-- no settings row), only active people with an expected day in the month,
-- once per person, vessel, month and kind. Service role. Returns
-- {date, auto_month_start, sign_off, pre_cutoff, notified}.
CREATE OR REPLACE FUNCTION public.work_rest_send_due_reminders(p_today date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := coalesce(p_today, current_date);
  v_prev date := (date_trunc('month', coalesce(p_today, current_date)) - interval '1 month')::date;
  v_cur date := date_trunc('month', coalesce(p_today, current_date))::date;
  v_month date;
  v_cutoff date;
  r record;
  s record;
  v_id uuid;
  v_start integer := 0;
  v_signoff integer := 0;
  v_pre integer := 0;
  v_notified integer := 0;
BEGIN
  -- The 1st: last month, not submitted.
  IF extract(day FROM v_today) = 1 THEN
    FOR r IN SELECT * FROM public.work_rest_due_members(NULL, extract(year FROM v_prev)::integer, extract(month FROM v_prev)::integer, v_today - 1) LOOP
      v_id := NULL;
      INSERT INTO public.work_rest_reminders (company_id, vessel_id, profile_id, crew_user_id, period_year, period_month, kind, sent_on)
      VALUES (r.company_id, r.vessel_id, r.profile_id, r.user_id, extract(year FROM v_prev)::integer, extract(month FROM v_prev)::integer,
              'auto_month_start', v_today)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN
        v_start := v_start + 1;
        IF public.work_rest_reminder_emit(v_id) IS NOT NULL THEN v_notified := v_notified + 1; END IF;
      END IF;
    END LOOP;
  END IF;

  -- The sign-off day: the current month of a person whose assignment on the vessel ends today.
  FOR r IN
    SELECT d.* FROM public.work_rest_due_members(NULL, extract(year FROM v_cur)::integer, extract(month FROM v_cur)::integer, v_today) AS d
    WHERE EXISTS (SELECT 1 FROM public.crew_assignments AS ca
                  WHERE ca.user_id = d.user_id AND ca.vessel_id = d.vessel_id AND coalesce(ca.leave_date, ca.end_date) = v_today)
  LOOP
    v_id := NULL;
    INSERT INTO public.work_rest_reminders (company_id, vessel_id, profile_id, crew_user_id, period_year, period_month, kind, sent_on)
    VALUES (r.company_id, r.vessel_id, r.profile_id, r.user_id, extract(year FROM v_cur)::integer, extract(month FROM v_cur)::integer,
            'sign_off', v_today)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_signoff := v_signoff + 1;
      IF public.work_rest_reminder_emit(v_id) IS NOT NULL THEN v_notified := v_notified + 1; END IF;
    END IF;
  END LOOP;

  -- N days before the cut-off: the month whose cut-off (its day of the month after) is N days away.
  FOR s IN
    SELECT v.id AS vessel_id, greatest(coalesce(st.cutoff_day_of_month, 1), 1) AS cutoff_day, coalesce(st.reminder_days_before_lock, 3) AS days_before
    FROM public.vessels AS v
    LEFT JOIN public.vessel_work_rest_settings AS st ON st.vessel_id = v.id
    WHERE coalesce(st.auto_reminders, true) AND coalesce(st.reminder_days_before_lock, 3) >= 0
      AND EXISTS (SELECT 1 FROM public.crew_assignments AS ca WHERE ca.vessel_id = v.id)
  LOOP
    FOREACH v_month IN ARRAY ARRAY[v_prev, v_cur] LOOP
      v_cutoff := (v_month + interval '1 month')::date
                  + (least(s.cutoff_day, extract(day FROM (v_month + interval '2 months - 1 day'))::integer) - 1);
      IF v_cutoff - s.days_before <> v_today THEN
        CONTINUE;
      END IF;
      FOR r IN
        SELECT d.* FROM public.work_rest_due_members(s.vessel_id, extract(year FROM v_month)::integer, extract(month FROM v_month)::integer, v_today) AS d
        WHERE NOT EXISTS (SELECT 1 FROM public.work_rest_reminders AS w
                          WHERE w.crew_user_id = d.user_id AND w.vessel_id = d.vessel_id AND w.sent_on = v_today
                            AND w.period_year = extract(year FROM v_month)::integer AND w.period_month = extract(month FROM v_month)::integer)
      LOOP
        v_id := NULL;
        INSERT INTO public.work_rest_reminders (company_id, vessel_id, profile_id, crew_user_id, period_year, period_month, kind, sent_on)
        VALUES (r.company_id, r.vessel_id, r.profile_id, r.user_id, extract(year FROM v_month)::integer, extract(month FROM v_month)::integer,
                'pre_cutoff', v_today)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN
          v_pre := v_pre + 1;
          IF public.work_rest_reminder_emit(v_id) IS NOT NULL THEN v_notified := v_notified + 1; END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('date', to_char(v_today, 'YYYY-MM-DD'), 'auto_month_start', v_start, 'sign_off', v_signoff,
                            'pre_cutoff', v_pre, 'notified', v_notified);
END;
$$;

-- ---------------------------------------------------------------- breach reports (C42, D-X1-14, D-X1-23)

-- The people a breach report of the vessel may go to: the company's DPA and
-- fleet HR (kind 'dpa' or 'fleet_hr'), by name. Gate: final_approve on the
-- vessel, no external viewer.
CREATE OR REPLACE FUNCTION public.work_rest_breach_report_recipients(p_vessel_id uuid)
RETURNS TABLE (user_id uuid, profile_id uuid, first_name text, last_name text, preferred_name text, kind text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.hours_of_rest.final_approve', p_vessel_id,
                                       'Only the final approver sends hours of rest breach reports.');
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Only the final approver sends hours of rest breach reports.';
  END IF;
  RETURN QUERY
  SELECT x.user_id, x.profile_id, x.first_name, x.last_name, x.preferred_name, x.kind
  FROM (
    SELECT p.user_id, p.id AS profile_id, p.first_name, p.last_name, p.preferred_name,
           public.work_rest_report_recipient_kind(p.user_id, v_company) AS kind
    FROM public.profiles AS p
    WHERE p.company_id = v_company AND p.user_id IS NOT NULL
  ) AS x
  WHERE x.kind IS NOT NULL
  ORDER BY x.kind, lower(coalesce(x.last_name, '')), lower(coalesce(x.first_name, '')), x.user_id;
END;
$$;

-- Creates one consolidated breach report for the vessel (never automatic,
-- T-142): reviewed breaches (accepted or dismissed) of this vessel whose
-- day lies in the period, not reported before, and recipients among the
-- company's fleet HR and DPA. The breaches are flagged with the report;
-- the recipients are told in STORM with a link to the report page (no
-- email, D-249; no stored PDF in wave 1, D-X1-23). Gate: final_approve on
-- the vessel, no external viewer. Refusals 22023: range_required /
-- range_invalid / range_too_long, breaches_required / too_many_breaches,
-- recipients_required / too_many_recipients, breach_not_on_vessel,
-- breach_out_of_range, breach_superseded, breach_not_reviewed,
-- breach_already_reported, recipient_not_allowed, notes_too_long.
-- Returns {report_id, reference, nc_count, recipient_count}.
CREATE OR REPLACE FUNCTION public.work_rest_breach_report_create(
  p_vessel_id uuid,
  p_from date,
  p_to date,
  p_nc_ids uuid[],
  p_recipient_user_ids uuid[],
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev text := coalesce(current_setting('storm.crew_engine', true), '');
  v_company uuid;
  v_vessel_name text;
  v_ncs uuid[];
  v_recipients uuid[];
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_bad uuid;
  v_report uuid;
  v_reference text;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.hours_of_rest.final_approve', p_vessel_id,
                                       'Only the final approver sends hours of rest breach reports.');
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Only the final approver sends hours of rest breach reports.';
  END IF;
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_required', DETAIL = 'Choose the period of the report.';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_invalid', DETAIL = 'The end date is before the start date.';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_too_long', DETAIL = 'Choose a period of one year or less.';
  END IF;
  IF p_nc_ids IS NULL OR cardinality(p_nc_ids) = 0 OR array_position(p_nc_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'breaches_required', DETAIL = 'Choose the breaches to report.';
  END IF;
  IF p_recipient_user_ids IS NULL OR cardinality(p_recipient_user_ids) = 0 OR array_position(p_recipient_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'recipients_required', DETAIL = 'Choose who receives the report.';
  END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ncs FROM unnest(p_nc_ids) AS x;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_recipients FROM unnest(p_recipient_user_ids) AS x;
  IF cardinality(v_ncs) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_breaches', DETAIL = 'Report at most 500 breaches at a time.';
  END IF;
  IF cardinality(v_recipients) > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_recipients', DETAIL = 'Send a report to at most 50 people.';
  END IF;
  IF length(coalesce(v_notes, '')) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notes_too_long', DETAIL = 'Keep the notes to 2000 characters.';
  END IF;

  -- Every breach: of this vessel (an unknown or foreign id reads the same), in the period, live, reviewed, not reported.
  PERFORM 1 FROM public.work_rest_non_conformities AS n WHERE n.id = ANY (v_ncs) FOR UPDATE;
  SELECT x INTO v_bad FROM unnest(v_ncs) AS x
  WHERE NOT EXISTS (SELECT 1 FROM public.work_rest_non_conformities AS n WHERE n.id = x AND n.vessel_id = p_vessel_id) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'breach_not_on_vessel', DETAIL = 'Report breaches of this vessel only.', HINT = v_bad::text;
  END IF;
  SELECT n.id INTO v_bad FROM public.work_rest_non_conformities AS n
  WHERE n.id = ANY (v_ncs) AND (n.breach_day IS NULL OR n.breach_day NOT BETWEEN p_from AND p_to) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'breach_out_of_range', DETAIL = 'Every breach must fall in the period of the report.', HINT = v_bad::text;
  END IF;
  SELECT n.id INTO v_bad FROM public.work_rest_non_conformities AS n WHERE n.id = ANY (v_ncs) AND n.superseded_at IS NOT NULL LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'breach_superseded', DETAIL = 'A breach no longer applies: its record was corrected.', HINT = v_bad::text;
  END IF;
  SELECT n.id INTO v_bad FROM public.work_rest_non_conformities AS n
  WHERE n.id = ANY (v_ncs)
    AND NOT (coalesce(n.review_outcome IN ('accepted', 'dismissed'), false)
             OR (n.review_outcome IS NULL AND coalesce(n.status IN ('justified', 'accepted_by_captain', 'dismissed', 'corrected'), false)))
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'breach_not_reviewed', DETAIL = 'Review every breach before you report it.', HINT = v_bad::text;
  END IF;
  SELECT n.id INTO v_bad FROM public.work_rest_non_conformities AS n WHERE n.id = ANY (v_ncs) AND n.breach_report_id IS NOT NULL LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'breach_already_reported', DETAIL = 'A breach is already in another breach report.', HINT = v_bad::text;
  END IF;
  SELECT x INTO v_bad FROM unnest(v_recipients) AS x WHERE public.work_rest_report_recipient_kind(x, v_company) IS NULL LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'recipient_not_allowed',
      DETAIL = 'Send breach reports to the fleet HR or the DPA of the company only.', HINT = v_bad::text;
  END IF;

  v_reference := public.format_reference('HORBR', v_company, p_vessel_id, current_date);
  INSERT INTO public.work_rest_breach_reports (company_id, vessel_id, reference, period_from, period_to, nc_ids, recipient_user_ids, notes, sent_by)
  VALUES (v_company, p_vessel_id, v_reference, p_from, p_to, v_ncs, v_recipients, v_notes, v_uid)
  RETURNING id INTO v_report;

  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.work_rest_non_conformities SET breach_report_id = v_report WHERE id = ANY (v_ncs);
  INSERT INTO public.work_rest_audit_log (actor_id, actor_role, action, entity_type, entity_id, new_value, metadata)
  VALUES (v_uid, 'approver', 'breach_report_created', 'work_rest_breach_report', v_report,
          jsonb_build_object('reference', v_reference, 'nc_count', cardinality(v_ncs), 'recipient_count', cardinality(v_recipients)),
          jsonb_build_object('vessel_id', p_vessel_id, 'from', p_from, 'to', p_to));
  PERFORM set_config('storm.crew_engine', v_prev, true);

  -- The recipients hear in STORM (D-128: never rolls the report back).
  BEGIN
    SELECT v.name INTO v_vessel_name FROM public.vessels AS v WHERE v.id = p_vessel_id;
    PERFORM public.emit_notification_event(
      p_type_key => 'hor_breach_report',
      p_company_id => v_company,
      p_title => left(format('Hours of rest breach report %s', v_reference), 120),
      p_link_scope => 'vessel',
      p_vessel_id => p_vessel_id,
      p_body => left(format('%s: %s reviewed %s from %s to %s.', v_vessel_name, cardinality(v_ncs),
                            CASE WHEN cardinality(v_ncs) = 1 THEN 'breach' ELSE 'breaches' END,
                            to_char(p_from, 'FMDD Mon YYYY'), to_char(p_to, 'FMDD Mon YYYY')), 280),
      p_severity => 'warning',
      p_link_path => 'crew/hours-of-rest/report?year=' || to_char(p_to, 'YYYY') || '&report=' || v_report::text,
      p_must_act_user_ids => v_recipients,
      p_payload => jsonb_build_object('report_id', v_report, 'vessel_id', p_vessel_id),
      p_dedupe_key => 'hor_breach_report:' || v_report::text,
      p_module_key => 'crew_hor');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'work_rest_breach_report_create: hor_breach_report not sent (%): %', SQLSTATE, SQLERRM;
  END;

  RETURN jsonb_build_object('report_id', v_report, 'reference', v_reference, 'nc_count', cardinality(v_ncs),
                            'recipient_count', cardinality(v_recipients));
END;
$$;

-- ---------------------------------------------------------------- triggers on the engine's tables

-- A breach that is (or becomes) serious tells the Master and fleet HR at
-- once (W6, D-X1-14), one notice per person, rule and day. Never raises
-- (D-128).
CREATE OR REPLACE FUNCTION public.work_rest_serious_breach_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_vessel_name text;
  v_name text;
  v_recipients uuid[];
BEGIN
  IF NEW.is_serious IS NOT TRUE OR NEW.superseded_at IS NOT NULL OR NEW.vessel_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_serious IS TRUE THEN
    RETURN NULL;
  END IF;
  BEGIN
    SELECT v.company_id, v.name INTO v_company, v_vessel_name FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
    SELECT array_agg(x) INTO v_recipients
    FROM public.work_rest_serious_breach_recipients(NEW.vessel_id) AS x
    WHERE x IS DISTINCT FROM NEW.crew_id;
    IF v_company IS NULL OR coalesce(cardinality(v_recipients), 0) = 0 THEN
      RETURN NULL;
    END IF;
    SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
    INTO v_name FROM public.profiles AS p WHERE p.user_id = NEW.crew_id;
    PERFORM public.emit_notification_event(
      p_type_key => 'hor_serious_breach',
      p_company_id => v_company,
      p_title => left(format('Serious hours of rest breach: %s', coalesce(v_name, 'a crew member')), 120),
      p_link_scope => 'vessel',
      p_vessel_id => NEW.vessel_id,
      p_body => left(format('%s on %s: %s h of rest, minimum %s h.', coalesce(NEW.rule_description, NEW.rule_code),
                            to_char(NEW.breach_day, 'FMDD Mon'), trim_scale(NEW.measured_value), trim_scale(NEW.threshold_value)), 280),
      p_severity => 'critical',
      p_link_path => 'crew/hours-of-rest?month=' || to_char(coalesce(NEW.breach_day, current_date), 'YYYY-MM') || '&breaches=open',
      p_must_act_user_ids => v_recipients,
      p_payload => jsonb_build_object('nc_id', NEW.id, 'vessel_id', NEW.vessel_id),
      p_dedupe_key => format('hor_serious_breach:%s:%s:%s', NEW.crew_id, NEW.rule_code, coalesce(to_char(NEW.breach_day, 'YYYY-MM-DD'), NEW.id::text)),
      p_module_key => 'crew_hor');
  EXCEPTION WHEN others THEN
    RAISE WARNING 'work_rest_serious_breach_notify: hor_serious_breach not sent (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS work_rest_serious_breach_notify ON public.work_rest_non_conformities;
CREATE TRIGGER work_rest_serious_breach_notify AFTER INSERT OR UPDATE OF is_serious ON public.work_rest_non_conformities
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_serious_breach_notify();

-- A month with a correction still requested for one of its breaches is not
-- approved (W6): 22023 correction_pending. Every writer.
CREATE OR REPLACE FUNCTION public.work_rest_month_correction_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved', 'captain_reviewed') AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (SELECT 1 FROM public.work_rest_non_conformities AS n
                 WHERE n.submission_id = NEW.id AND n.superseded_at IS NULL AND n.review_outcome = 'correction_requested') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'correction_pending',
      DETAIL = 'A correction was requested for a breach of this month. Accept or dismiss it before approving the month.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_rest_month_correction_guard ON public.work_rest_monthly_submissions;
CREATE TRIGGER trg_work_rest_month_correction_guard BEFORE UPDATE OF status ON public.work_rest_monthly_submissions
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_month_correction_guard();

-- ---------------------------------------------------------------- row level security

ALTER TABLE public.work_rest_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_rest_breach_reports ENABLE ROW LEVEL SECURITY;

-- Approvers of the vessel read its reminder log; a crew member reads the
-- reminders sent to them. No browser writes (the definers write).
DROP POLICY IF EXISTS work_rest_reminders_select_scoped ON public.work_rest_reminders;
CREATE POLICY work_rest_reminders_select_scoped ON public.work_rest_reminders
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
         AND ((vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.hours_of_rest.approve'))
               AND NOT (SELECT public.crew_caller_is_external()))
              OR crew_user_id = (SELECT auth.uid())));

-- The final approvers of the vessel and the report's recipients read a
-- breach report. No browser writes.
DROP POLICY IF EXISTS work_rest_breach_reports_select_scoped ON public.work_rest_breach_reports;
CREATE POLICY work_rest_breach_reports_select_scoped ON public.work_rest_breach_reports
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
         AND NOT (SELECT public.crew_caller_is_external())
         AND (vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.hours_of_rest.final_approve'))
              OR (SELECT auth.uid()) = ANY (recipient_user_ids)));

-- ---------------------------------------------------------------- grants

REVOKE ALL ON public.work_rest_reminders, public.work_rest_breach_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_rest_reminders, public.work_rest_breach_reports TO authenticated;
GRANT ALL ON public.work_rest_reminders, public.work_rest_breach_reports TO service_role;
REVOKE ALL ON public.work_rest_breach_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_rest_breach_reviews TO authenticated, service_role;

-- Browser RPCs.
REVOKE ALL ON FUNCTION public.work_rest_vessel_board(uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_vessel_board(uuid, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_month_stats(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_month_stats(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_vessel_breaches(uuid, date, date, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_vessel_breaches(uuid, date, date, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_review_breach(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_review_breach(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_remind(uuid, uuid[], integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_remind(uuid, uuid[], integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_breach_report_recipients(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_breach_report_recipients(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_breach_report_create(uuid, date, date, uuid[], uuid[], text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_breach_report_create(uuid, date, date, uuid[], uuid[], text) TO authenticated, service_role;

-- The sweep (hr-daily-sweeper) and the internal helpers: the service role and the definers only.
REVOKE ALL ON FUNCTION public.work_rest_send_due_reminders(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_send_due_reminders(date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_board_member_ids(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_board_member_ids(uuid, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_role_label(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_role_label(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_is_fleet_hr(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_is_fleet_hr(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_is_dpa(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_is_dpa(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_report_recipient_kind(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_report_recipient_kind(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_serious_breach_recipients(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_serious_breach_recipients(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_due_members(uuid, integer, integer, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_due_members(uuid, integer, integer, date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_reminder_emit(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_reminder_emit(uuid) TO service_role;
-- Trigger functions: no grant.
REVOKE ALL ON FUNCTION public.work_rest_reminders_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_breach_reports_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_serious_breach_notify() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_month_correction_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.work_rest_reminders IS 'Hours-of-rest reminders (X1-08; gap/04 C41, W6): who was reminded of which month on which vessel, when, how (manual from the board, or the daily sweep on the 1st, the sign-off day and before the cut-off) and by whom ("Reminded <date> by <role>"). In-app only (D-249). One manual reminder per person and vessel a day; each automatic kind once per person, vessel and month. Read: the vessel''s hours-of-rest approvers and the person reminded; written by work_rest_remind and work_rest_send_due_reminders only.';
COMMENT ON TABLE public.work_rest_breach_reports IS 'Consolidated hours-of-rest breach reports (X1-08; gap/04 C42, W6, T-142; D-X1-14, D-X1-23): the reviewed breaches of one vessel in a period, sent in STORM by the final approver to the company''s fleet HR and DPA. Never automatic. file_path stays NULL in wave 1 (the PDF is rebuilt on demand from nc_ids and its download logged). Read: the vessel''s final approvers and the recipients; written by work_rest_breach_report_create only.';
COMMENT ON VIEW public.work_rest_breach_reviews IS 'The breach review state fleet operations reads (X5 agreement 6, R9): one row per work_rest_non_conformities row with its vessel, crew member, window, serious flag, deficit, review outcome and reviewer, breach report and superseded time. Security invoker: the work_rest_non_conformities policies apply.';
COMMENT ON COLUMN public.work_rest_reminders.sent_by_role_label IS 'The sender''s role on the vessel when reminded (the position name, ''Fleet office'' or ''Approver''); NULL for an automatic reminder.';
COMMENT ON COLUMN public.work_rest_reminders.sent_on IS 'The vessel''s day the reminder was sent on (the manual rate limit counts it).';
COMMENT ON COLUMN public.work_rest_breach_reports.reference IS 'The report number, format_reference(''HORBR'', company, vessel): HORBR-<vessel code>-<year>-<nnn>.';
COMMENT ON COLUMN public.work_rest_breach_reports.file_path IS 'Unused in wave 1 (D-X1-23): no PDF is stored until a narrowed storage prefix exists for it.';

COMMENT ON FUNCTION public.work_rest_board_member_ids(uuid, date, date) IS 'Internal: the logins with an assignment on the vessel overlapping the days, in its company (the board''s members, T-144).';
COMMENT ON FUNCTION public.work_rest_role_label(uuid, uuid) IS 'Internal: a person''s role words on a vessel today (position name, else the assignment title; Fleet office; Approver) for "Reminded <date> by <role>".';
COMMENT ON FUNCTION public.work_rest_is_fleet_hr(uuid, uuid) IS 'Internal: an active, non-external member of the company with fleet reach and HR edit rights (fleet HR, D-X1-14).';
COMMENT ON FUNCTION public.work_rest_is_dpa(uuid, uuid) IS 'Internal: an active, non-external member of the company with an active DPA membership (is_dpa, or a legacy dpa profile), as notification_recipients reads the dpa audience.';
COMMENT ON FUNCTION public.work_rest_report_recipient_kind(uuid, uuid) IS 'Internal: dpa, fleet_hr or NULL: who may receive a breach report of the company (D-X1-14).';
COMMENT ON FUNCTION public.work_rest_serious_breach_recipients(uuid) IS 'Internal: who hears of a serious breach on the vessel at once: the Master (record_is_master) and the company''s fleet HR (W6, D-X1-14).';
COMMENT ON FUNCTION public.work_rest_due_members(uuid, integer, integer, date) IS 'Internal (the sweep): the active board members of a month with an expected day up to the given day whose month is not submitted, on one vessel or every vessel with automatic reminders on.';
COMMENT ON FUNCTION public.work_rest_reminder_emit(uuid) IS 'Internal: sends hor_reminder for one reminder row (in-app, personal link, no vessel on the event); never raises (D-128).';
COMMENT ON FUNCTION public.work_rest_vessel_board(uuid, integer, integer) IS 'The vessel''s hours-of-rest board for a month (X1-08; gap/04 C40, C43, C45; T-144, D-X1-20): every person assigned on any day of the month, with their assignments, month state, recorded / leave / breach / near-limit days, expected and missing days, review counts, former crew, on leave all month and the last reminder. Gate: vessel.crew.hours_of_rest.approve, no external viewer (P0002 unknown vessel, 42501); 22023 month_required / month_in_future. Browser RPC.';
COMMENT ON FUNCTION public.work_rest_month_stats(uuid, integer) IS 'The vessel''s hours of rest per month of a year (X1-08 server for gap/04 C44): crew, days logged, breach days, unreviewed, serious open, corrections awaited and the months by state. Gate: vessel.crew.hours_of_rest.view, no external viewer; 22023 year_required. Browser RPC.';
COMMENT ON FUNCTION public.work_rest_vessel_breaches(uuid, date, date, boolean) IS 'The vessel''s live hours-of-rest breaches in a range of at most a year (X1-08; gap/04 C42): deficit, serious flag, review state and whether the caller may review each. Gate: vessel.crew.hours_of_rest.approve, no external viewer; 22023 range_required / range_invalid / range_too_long. Browser RPC.';
COMMENT ON FUNCTION public.work_rest_review_breach(uuid, text, text) IS 'Reviews one hours-of-rest breach (X1-08; gap/04 C42, W6): accepted (justification), correction_requested (reopens the month through the engine, tells the crew member: hor_correction_requested), dismissed (only after a correction). Gate: hours_of_rest.approve for the breach''s department, or final_approve; never one''s own; an approved month is sent back by the final approver only. Browser RPC.';
COMMENT ON FUNCTION public.work_rest_remind(uuid, uuid[], integer, integer) IS 'Reminds crew members on the vessel''s board of a month (X1-08; gap/04 C41): one manual reminder per person and vessel a day (22023 reminder_rate_limited), ids outside the board refused (42501 not_on_board), logged with the sender''s role, hor_reminder in-app. Gate: vessel.crew.hours_of_rest.approve. Browser RPC.';
COMMENT ON FUNCTION public.work_rest_send_due_reminders(date) IS 'The daily automatic hours-of-rest reminders (X1-08; gap/04 C41; D-232): the 1st for last month, the sign-off day, N days before the cut-off; vessels with auto_reminders on, active people with an expected day, months not submitted; once per kind. Returns counts. Service role (hr-daily-sweeper).';
COMMENT ON FUNCTION public.work_rest_breach_report_recipients(uuid) IS 'Who a breach report of the vessel may go to: the company''s DPA and fleet HR (D-X1-14). Gate: vessel.crew.hours_of_rest.final_approve, no external viewer. Browser RPC.';
COMMENT ON FUNCTION public.work_rest_breach_report_create(uuid, date, date, uuid[], uuid[], text) IS 'Creates a consolidated hours-of-rest breach report of the vessel (X1-08; gap/04 C42, T-142, D-X1-14, D-X1-23): reviewed breaches of the vessel in the period, recipients among fleet HR and the DPA, the breaches flagged, hor_breach_report in-app with a link to the report page. Never automatic. Gate: vessel.crew.hours_of_rest.final_approve. Browser RPC.';
COMMENT ON FUNCTION public.work_rest_serious_breach_notify() IS 'Trigger work_rest_serious_breach_notify (AFTER INSERT OR UPDATE OF is_serious on work_rest_non_conformities): a live breach that becomes serious sends hor_serious_breach to the Master and fleet HR, one per person, rule and day; never raises (D-128).';
COMMENT ON FUNCTION public.work_rest_month_correction_guard() IS 'Trigger trg_work_rest_month_correction_guard (BEFORE UPDATE OF status on work_rest_monthly_submissions): a month with a live breach awaiting a requested correction is not approved (22023 correction_pending). Every writer.';
COMMENT ON FUNCTION public.work_rest_reminders_scope_guard() IS 'Trigger: a reminder carries its vessel''s company and the crew member''s profile, both of that company (23514 work_rest_reminder_scope_mismatch).';
COMMENT ON FUNCTION public.work_rest_breach_reports_scope_guard() IS 'Trigger: a breach report carries its vessel''s company (23514 work_rest_breach_report_scope_mismatch).';
