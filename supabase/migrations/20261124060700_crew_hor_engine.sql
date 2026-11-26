-- =================================================================
-- CREW X1-07: the hours-of-rest server engine, the month state machine,
-- the write guards (Phase 3 wave 1, stream X1; gap/04 C38, C39, C43, C45,
-- C46, W6; DECISIONS D-01, D-04, D-120, D-128, D-229, D-233, D-246,
-- D-X1-6, D-X1-9, D-X1-11, D-X1-20; X1 spec §6 060700; platform plan
-- contract 6)
-- Columns: vessel_work_rest_settings margins, serious thresholds, hod_step,
--   auto_reminders; work_rest_monthly_submissions signer columns and the
--   per-vessel month (D-X1-20); work_rest_non_conformities vessel, day,
--   serious flag, deficit and review columns (frozen for fleet R9);
--   work_rest_signatures stale_at / stale_reason, the 'company' role and
--   one live signature per role
-- RPCs: work_rest_save_day(), work_rest_fill_days(),
--   work_rest_month_transition()
-- Internal (service role): work_rest_rule_eval() and
--   work_rest_month_decide() (pure; TS lib/complianceEngine.ts and
--   lib/horMonth.ts, parity cases src/test/work-rest/fixtures/horCases.json),
--   work_rest_vessel_tz(), work_rest_rules_for(), work_rest_hor_on(),
--   work_rest_assignment_on(), work_rest_department_on(),
--   work_rest_day_gate(), work_rest_month_row(), work_rest_day_write(),
--   work_rest_recompute(), work_rest_month_refresh()
-- Triggers: work_rest_submissions_status_guard, work_rest_records_write_guard,
--   work_rest_blocks_write_guard, work_rest_non_conformities_write_guard,
--   work_rest_signatures_write_guard, work_rest_compliance_checks_write_guard,
--   work_rest_audit_log_write_guard
-- TS mirror: src/modules/work-rest/types/db.pending.ts; the client switch in
--   src/modules/work-rest/services/workRestService.ts
-- =================================================================
--
-- Why. Today the browser writes every hours-of-rest row: the day and its
-- blocks, the breaches it computed itself, the month status and the
-- signatures (workRestService, `supabase as any`). The platform policy
-- "Manage NCs" (20261123010500) lets a crew member delete their own
-- breaches. Here the server computes the breaches (D-X1-9), months move only
-- through the engine, and every signed-in direct write to the records,
-- blocks, breaches, signatures, compliance checks, audit log and the month's
-- status is refused. The work-rest policies of 20261123010500 are not
-- redefined (rule §0.2): the guards sit beside them.
--
-- The rules (work_rest_rule_eval; TS evaluateRules). One person, every
-- vessel's days together; a day is recorded when it has a record; its work
-- is the union of its work blocks; every other minute of a recorded day is
-- rest, and an unrecorded day is unknown, never rest. Consecutive recorded
-- days form a run; periods merge across midnight inside a run. Per recorded
-- day, on the vessel's local clock (1440-minute days, as the entry grid
-- shows them), counting only windows that are wholly recorded:
--   REST_24H_MIN        least rest in any 24 h window ending that day
--                       (end in (00:00, 24:00]) below the minimum (10 h);
--                       serious below serious_24h_h (4 h, critical), high
--                       when more than 2 h short, else medium
--   REST_7D_MIN         the same over 7 x 24 h (77 h); serious below
--                       serious_7d_h (50 h, critical), medium within the
--                       7-day warning margin (3 h), else high
--   REST_PERIODS_MAX    more rest periods touch the day than allowed (2)
--   REST_LONG_BLOCK_MIN no rest period touching the day lasts the long
--                       block (6 h), each period counted whole
--   REST_INTERVAL_MAX   a work period longer than the maximum interval
--                       (14 h), on the day it ends (the longest per day)
-- Least rest is exact (rest in a window is piecewise linear in its start:
-- the minimum is at a period boundary or an end of the day's range); ties
-- take the latest window. Warning: no breach and the least 24 h or 7-day
-- rest at or above the minimum but within the margin. Deficit = threshold
-- - measured, in hours to 2 decimals (null for the count and interval
-- rules).
--
-- Saving (work_rest_save_day, work_rest_fill_days): the own day needs
-- vessel.crew.hours_of_rest.create (crewCreates), someone else's day
-- hours_of_rest.edit on the vessel and the same department as the person
-- unless final_approve; the person must be a member of the vessel's company
-- (D-246) with an assignment on the vessel that day; Hours of Rest must be
-- on for the vessel that day (crew and crew_hor, C45); the day no later
-- than the vessel's tomorrow; a day already recorded on another vessel is
-- refused; the month on this vessel must be draft or reopened (22023
-- month_closed). Every breach whose day lies within a week of a saved day
-- is computed again and stored per person, rule and day, for days whose
-- month is open: a breach that is reviewed is never deleted (it gets
-- superseded_at when its breach disappears or its figures change), an
-- unreviewed one is updated or deleted. The day's summary columns, one
-- rolling_24h and one rolling_7d work_rest_compliance_checks row per day
-- (the windows the day was judged on) and the month's totals follow.
--
-- The month (work_rest_month_transition; TS horMonth.ts; W6, C43): one per
-- person and vessel (unique (crew_id, vessel_id, period_year, period_month),
-- D-X1-20). submit (the person, an assignment in the month; crew signs),
-- submit_on_behalf (final approver, the person has left the vessel, a
-- reason; company signs), hod_sign (approve, same department; hod signs;
-- refused when hod_step is off), approve (final approver; required HoD
-- signature under hod_step = required; every unreviewed breach but low
-- severity blocks; low ones and the nudge only warn; captain signs), lock
-- (final approver), reopen (final approver; a reason; the live signatures
-- are kept with stale_at). Who first (42501), then where (22023
-- illegal_transition), then the conditions (22023); never one's own month
-- except lock. Signatures stay attestations in work_rest_signatures (method
-- 'electronic', D-X1-6); every step writes work_rest_audit_log.
--
-- Nothing here is live (D-01): the client reads the new columns through the
-- pending shim and keeps today's legacy path (direct writes, breaches
-- computed in the browser) while the RPCs are missing (PGRST202, or a 42883
-- naming the called function); the ledger row carries the go-live note to
-- delete that path. Once applied, the legacy writes are refused, so this
-- file and 20261124060800 (the board) apply in one sitting.
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each trigger
-- and constraint, CREATE OR REPLACE for every function.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.work_rest_monthly_submissions') IS NULL OR to_regclass('public.work_rest_records') IS NULL
     OR to_regclass('public.work_rest_blocks') IS NULL OR to_regclass('public.work_rest_non_conformities') IS NULL
     OR to_regclass('public.work_rest_signatures') IS NULL OR to_regclass('public.work_rest_compliance_checks') IS NULL
     OR to_regclass('public.work_rest_audit_log') IS NULL OR to_regclass('public.vessel_work_rest_settings') IS NULL
     OR to_regclass('public.work_rest_rule_sets') IS NULL OR to_regclass('public.crew_leave_entries') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060700_crew_hor_engine needs the hours-of-rest tables: apply 20260501100000_work_rest_module.sql first';
  END IF;
  IF to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL
     OR to_regclass('public.positions') IS NULL OR to_regclass('public.departments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060700_crew_hor_engine needs the crew gate helpers and positions: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regprocedure('public.crew_caller_is_external()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060700_crew_hor_engine needs crew_caller_is_external(): apply 20261124060200_crew_vessel_list.sql first';
  END IF;
  IF to_regprocedure('public.vessel_module_on_internal(uuid,text,date)') IS NULL
     OR to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_normalise_office(text)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060700_crew_hor_engine needs the platform capability, module-settings and record helpers: apply 20261123000400 to 20261123020000 first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- vessel settings (C46, D-X1-11)

ALTER TABLE public.vessel_work_rest_settings
  ADD COLUMN IF NOT EXISTS warning_margin_24h_h numeric(4,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS warning_margin_7d_h numeric(5,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS serious_24h_h numeric(4,2) NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS serious_7d_h numeric(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS hod_step text NOT NULL DEFAULT 'nudge',
  ADD COLUMN IF NOT EXISTS auto_reminders boolean NOT NULL DEFAULT true;
ALTER TABLE public.vessel_work_rest_settings DROP CONSTRAINT IF EXISTS vessel_work_rest_settings_hod_step_check;
ALTER TABLE public.vessel_work_rest_settings ADD CONSTRAINT vessel_work_rest_settings_hod_step_check
  CHECK (hod_step IN ('off', 'nudge', 'required'));
ALTER TABLE public.vessel_work_rest_settings DROP CONSTRAINT IF EXISTS vessel_work_rest_settings_thresholds_check;
ALTER TABLE public.vessel_work_rest_settings ADD CONSTRAINT vessel_work_rest_settings_thresholds_check
  CHECK (warning_margin_24h_h BETWEEN 0 AND 24 AND warning_margin_7d_h BETWEEN 0 AND 168
     AND serious_24h_h BETWEEN 0 AND 24 AND serious_7d_h BETWEEN 0 AND 168);

COMMENT ON COLUMN public.vessel_work_rest_settings.warning_margin_24h_h IS 'Hours above the 24 h minimum that still read as a warning (default 1; gap/04 W6).';
COMMENT ON COLUMN public.vessel_work_rest_settings.warning_margin_7d_h IS 'Hours above the 7-day minimum that still read as a warning (default 3); a 7-day breach within it is medium, beyond it high.';
COMMENT ON COLUMN public.vessel_work_rest_settings.serious_24h_h IS 'A 24 h breach below this many hours of rest is serious (critical; default 4).';
COMMENT ON COLUMN public.vessel_work_rest_settings.serious_7d_h IS 'A 7-day breach below this many hours of rest is serious (critical; default 50).';
COMMENT ON COLUMN public.vessel_work_rest_settings.hod_step IS 'The head-of-department signature before approval: off, nudge (default: a reminder, approval allowed) or required (D-X1-11, T-148).';
COMMENT ON COLUMN public.vessel_work_rest_settings.auto_reminders IS 'Whether the daily sweep sends the automatic month reminders (C41, 20261124060800).';

-- ---------------------------------------------------------------- the month (C39, C43, D-X1-20)

ALTER TABLE public.work_rest_monthly_submissions
  ADD COLUMN IF NOT EXISTS submitted_by uuid NULL,
  ADD COLUMN IF NOT EXISTS submitted_on_behalf_by uuid NULL,
  ADD COLUMN IF NOT EXISTS on_behalf_reason text NULL,
  ADD COLUMN IF NOT EXISTS hod_signed_by uuid NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS locked_by uuid NULL;
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_submitted_by_fkey;
ALTER TABLE public.work_rest_monthly_submissions ADD CONSTRAINT work_rest_monthly_submissions_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_submitted_on_behalf_by_fkey;
ALTER TABLE public.work_rest_monthly_submissions ADD CONSTRAINT work_rest_monthly_submissions_submitted_on_behalf_by_fkey
  FOREIGN KEY (submitted_on_behalf_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_hod_signed_by_fkey;
ALTER TABLE public.work_rest_monthly_submissions ADD CONSTRAINT work_rest_monthly_submissions_hod_signed_by_fkey
  FOREIGN KEY (hod_signed_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_approved_by_fkey;
ALTER TABLE public.work_rest_monthly_submissions ADD CONSTRAINT work_rest_monthly_submissions_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_locked_by_fkey;
ALTER TABLE public.work_rest_monthly_submissions ADD CONSTRAINT work_rest_monthly_submissions_locked_by_fkey
  FOREIGN KEY (locked_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_on_behalf_reason_check;
ALTER TABLE public.work_rest_monthly_submissions ADD CONSTRAINT work_rest_monthly_submissions_on_behalf_reason_check
  CHECK (on_behalf_reason IS NULL OR length(on_behalf_reason) <= 2000) NOT VALID;
ALTER TABLE public.work_rest_monthly_submissions VALIDATE CONSTRAINT work_rest_monthly_submissions_on_behalf_reason_check;

-- The status list gains 'approved' (the engine's approval; captain_reviewed
-- stays for legacy rows). The inline CHECK of 20260501100000 is named by
-- Postgres; it is dropped by name and, in case the live database named it
-- otherwise, by its definition.
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_status_check;
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint AS con
    WHERE con.conrelid = 'public.work_rest_monthly_submissions'::regclass AND con.contype = 'c'
      AND con.conname <> 'work_rest_monthly_submissions_status_known'
      AND pg_get_constraintdef(con.oid) LIKE '%status%' AND pg_get_constraintdef(con.oid) LIKE '%captain_reviewed%'
  LOOP
    EXECUTE format('ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_status_known;
ALTER TABLE public.work_rest_monthly_submissions ADD CONSTRAINT work_rest_monthly_submissions_status_known
  CHECK (status IN ('draft', 'submitted', 'crew_signed', 'hod_reviewed', 'hod_signed', 'captain_reviewed', 'approved', 'locked', 'reopened')) NOT VALID;
ALTER TABLE public.work_rest_monthly_submissions VALIDATE CONSTRAINT work_rest_monthly_submissions_status_known;

-- A month row without a vessel (none can exist: the column is NOT NULL in
-- 20260501100000, but the live table was created by hand) takes the vessel
-- of its records.
UPDATE public.work_rest_monthly_submissions AS s
SET vessel_id = x.vessel_id
FROM (
  SELECT DISTINCT ON (r.submission_id) r.submission_id, r.vessel_id
  FROM public.work_rest_records AS r
  WHERE r.submission_id IS NOT NULL AND r.vessel_id IS NOT NULL
  ORDER BY r.submission_id, r.record_date DESC
) AS x
WHERE s.id = x.submission_id AND s.vessel_id IS NULL;

-- One month per person and vessel (D-X1-20): the unique on (crew_id,
-- period_year, period_month) becomes (crew_id, vessel_id, period_year,
-- period_month). Dropped by its Postgres name and by its columns.
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_crew_id_period_year_period_month_key;
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint AS con
    WHERE con.conrelid = 'public.work_rest_monthly_submissions'::regclass AND con.contype = 'u'
      AND con.conname <> 'work_rest_monthly_submissions_crew_vessel_period_key'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(con.conkey) AS k(n)
           JOIN pg_attribute AS a ON a.attrelid = con.conrelid AND a.attnum = k.n) = ARRAY['crew_id', 'period_month', 'period_year']
  LOOP
    EXECUTE format('ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;
ALTER TABLE public.work_rest_monthly_submissions DROP CONSTRAINT IF EXISTS work_rest_monthly_submissions_crew_vessel_period_key;
ALTER TABLE public.work_rest_monthly_submissions ADD CONSTRAINT work_rest_monthly_submissions_crew_vessel_period_key
  UNIQUE (crew_id, vessel_id, period_year, period_month);

COMMENT ON COLUMN public.work_rest_monthly_submissions.submitted_by IS 'Who submitted the month (the crew member, or the approver on their behalf). Engine only.';
COMMENT ON COLUMN public.work_rest_monthly_submissions.submitted_on_behalf_by IS 'The approver who submitted for a crew member who had left the vessel (C43). Engine only.';
COMMENT ON COLUMN public.work_rest_monthly_submissions.on_behalf_reason IS 'Why the month was submitted on the crew member''s behalf (C43). Engine only.';
COMMENT ON COLUMN public.work_rest_monthly_submissions.hod_signed_by IS 'The head of department who signed the month. Engine only.';
COMMENT ON COLUMN public.work_rest_monthly_submissions.approved_by IS 'The final approver (Master or delegate). Engine only.';
COMMENT ON COLUMN public.work_rest_monthly_submissions.approved_at IS 'When the month was approved. Engine only.';
COMMENT ON COLUMN public.work_rest_monthly_submissions.locked_by IS 'Who locked the month. Engine only.';

-- ---------------------------------------------------------------- breaches (C38, C42 columns; fleet R9 contract)

ALTER TABLE public.work_rest_non_conformities
  ADD COLUMN IF NOT EXISTS vessel_id uuid NULL,
  ADD COLUMN IF NOT EXISTS breach_day date NULL,
  ADD COLUMN IF NOT EXISTS is_serious boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deficit_hours numeric(5,2) NULL,
  ADD COLUMN IF NOT EXISTS review_outcome text NULL,
  ADD COLUMN IF NOT EXISTS review_note text NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid NULL,
  ADD COLUMN IF NOT EXISTS breach_report_id uuid NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz NULL;
ALTER TABLE public.work_rest_non_conformities DROP CONSTRAINT IF EXISTS work_rest_non_conformities_vessel_id_fkey;
ALTER TABLE public.work_rest_non_conformities ADD CONSTRAINT work_rest_non_conformities_vessel_id_fkey
  FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE;
ALTER TABLE public.work_rest_non_conformities DROP CONSTRAINT IF EXISTS work_rest_non_conformities_reviewed_by_fkey;
ALTER TABLE public.work_rest_non_conformities ADD CONSTRAINT work_rest_non_conformities_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.work_rest_non_conformities DROP CONSTRAINT IF EXISTS work_rest_non_conformities_review_outcome_check;
ALTER TABLE public.work_rest_non_conformities ADD CONSTRAINT work_rest_non_conformities_review_outcome_check
  CHECK (review_outcome IN ('accepted', 'correction_requested', 'dismissed'));
ALTER TABLE public.work_rest_non_conformities DROP CONSTRAINT IF EXISTS work_rest_non_conformities_review_note_check;
ALTER TABLE public.work_rest_non_conformities ADD CONSTRAINT work_rest_non_conformities_review_note_check
  CHECK (review_note IS NULL OR length(review_note) <= 2000);

CREATE INDEX IF NOT EXISTS idx_wr_nc_crew_day_live ON public.work_rest_non_conformities (crew_id, breach_day) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wr_nc_vessel_day ON public.work_rest_non_conformities (vessel_id, breach_day);

-- Legacy breaches (written by the browser, local times stored as UTC): the
-- vessel of their month, the day their window ends in, the serious flag
-- and the deficit by the default thresholds. Only empty columns are filled.
UPDATE public.work_rest_non_conformities AS n
SET vessel_id = s.vessel_id
FROM public.work_rest_monthly_submissions AS s
WHERE s.id = n.submission_id AND n.vessel_id IS NULL;
UPDATE public.work_rest_non_conformities
SET breach_day = ((window_end - interval '1 minute') AT TIME ZONE 'UTC')::date
WHERE breach_day IS NULL AND window_end IS NOT NULL;
UPDATE public.work_rest_non_conformities
SET deficit_hours = round(threshold_value - measured_value, 2)
WHERE deficit_hours IS NULL AND rule_code IN ('REST_24H_MIN', 'REST_7D_MIN', 'REST_LONG_BLOCK_MIN')
  AND threshold_value IS NOT NULL AND measured_value IS NOT NULL AND threshold_value - measured_value BETWEEN 0 AND 999;
UPDATE public.work_rest_non_conformities
SET is_serious = true
WHERE NOT is_serious AND superseded_at IS NULL
  AND ((rule_code = 'REST_24H_MIN' AND measured_value < 4) OR (rule_code = 'REST_7D_MIN' AND measured_value < 50));

COMMENT ON COLUMN public.work_rest_non_conformities.vessel_id IS 'The vessel of the day the breach belongs to.';
COMMENT ON COLUMN public.work_rest_non_conformities.breach_day IS 'The vessel-local day the breach belongs to (the day its window ends in). One live breach per person, rule and day.';
COMMENT ON COLUMN public.work_rest_non_conformities.is_serious IS 'Below the serious threshold (< 4 h in 24 h or < 50 h in 7 days by default; vessel_work_rest_settings). Frozen for fleet operations R9.';
COMMENT ON COLUMN public.work_rest_non_conformities.deficit_hours IS 'Hours short of the threshold (threshold - measured); null for the period count and the interval rule.';
COMMENT ON COLUMN public.work_rest_non_conformities.review_outcome IS 'The breach review: accepted (with a justification), correction_requested, dismissed (after a correction). Written by 20261124060800''s work_rest_review_breach. Frozen for fleet operations R9.';
COMMENT ON COLUMN public.work_rest_non_conformities.review_note IS 'The reviewer''s justification or note.';
COMMENT ON COLUMN public.work_rest_non_conformities.reviewed_by IS 'Who reviewed the breach.';
COMMENT ON COLUMN public.work_rest_non_conformities.breach_report_id IS 'The breach report that included it (20261124060800).';
COMMENT ON COLUMN public.work_rest_non_conformities.superseded_at IS 'When a reviewed breach stopped applying (the record was corrected); reviewed breaches are never deleted. Frozen for fleet operations R9.';

-- ---------------------------------------------------------------- signatures (D-X1-6)

ALTER TABLE public.work_rest_signatures
  ADD COLUMN IF NOT EXISTS stale_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stale_reason text NULL;
ALTER TABLE public.work_rest_signatures DROP CONSTRAINT IF EXISTS work_rest_signatures_stale_reason_check;
ALTER TABLE public.work_rest_signatures ADD CONSTRAINT work_rest_signatures_stale_reason_check
  CHECK (stale_reason IS NULL OR length(stale_reason) <= 500);
ALTER TABLE public.work_rest_signatures DROP CONSTRAINT IF EXISTS work_rest_signatures_signer_role_check;
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint AS con
    WHERE con.conrelid = 'public.work_rest_signatures'::regclass AND con.contype = 'c'
      AND con.conname <> 'work_rest_signatures_signer_role_known'
      AND pg_get_constraintdef(con.oid) LIKE '%signer_role%'
  LOOP
    EXECUTE format('ALTER TABLE public.work_rest_signatures DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;
ALTER TABLE public.work_rest_signatures DROP CONSTRAINT IF EXISTS work_rest_signatures_signer_role_known;
ALTER TABLE public.work_rest_signatures ADD CONSTRAINT work_rest_signatures_signer_role_known
  CHECK (signer_role IN ('crew', 'hod', 'captain', 'purser', 'dpa', 'company')) NOT VALID;
ALTER TABLE public.work_rest_signatures VALIDATE CONSTRAINT work_rest_signatures_signer_role_known;
-- One live signature per role: a reopened month keeps its earlier
-- signatures (stale_at set) and is signed again.
ALTER TABLE public.work_rest_signatures DROP CONSTRAINT IF EXISTS work_rest_signatures_submission_id_signer_role_key;
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint AS con
    WHERE con.conrelid = 'public.work_rest_signatures'::regclass AND con.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(con.conkey) AS k(n)
           JOIN pg_attribute AS a ON a.attrelid = con.conrelid AND a.attnum = k.n) = ARRAY['signer_role', 'submission_id']
  LOOP
    EXECUTE format('ALTER TABLE public.work_rest_signatures DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS work_rest_signatures_live_role ON public.work_rest_signatures (submission_id, signer_role) WHERE stale_at IS NULL;

COMMENT ON COLUMN public.work_rest_signatures.stale_at IS 'When the month was reopened after this signature; the signature stays as history (W6). Engine only.';
COMMENT ON COLUMN public.work_rest_signatures.stale_reason IS 'The reopen reason that made the signature stale.';

-- ---------------------------------------------------------------- the rules (pure; TS evaluateRules)

-- The rules over a person's recorded days (see the header). p_days: an
-- array of {date: 'YYYY-MM-DD', work: [[start, end], ...]} (local minutes;
-- clamped to 0..1440; a date given twice keeps the first); p_rules: the
-- hours of min_rest_24h, min_rest_7d, max_periods, min_long_block,
-- max_interval, warn_24h, warn_7d, serious_24h, serious_7d; p_from / p_to
-- limit the answered days (every given day is context). Returns
-- {days: [...], non_conformities: [...]} exactly as the TS engine does
-- (windows as local 'YYYY-MM-DDTHH:MM'). Pure; service role only.
CREATE OR REPLACE FUNCTION public.work_rest_rule_eval(p_days jsonb, p_rules jsonb, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  WITH rules AS (
    SELECT (p_rules ->> 'min_rest_24h')::numeric * 60 AS thr24,
           (p_rules ->> 'min_rest_7d')::numeric * 60 AS thr7,
           (p_rules ->> 'max_periods')::integer AS max_periods,
           (p_rules ->> 'min_long_block')::numeric * 60 AS long_min,
           (p_rules ->> 'max_interval')::numeric * 60 AS int_max,
           (p_rules ->> 'warn_24h')::numeric * 60 AS warn24,
           (p_rules ->> 'warn_7d')::numeric * 60 AS warn7,
           (p_rules ->> 'serious_24h')::numeric * 60 AS serious24,
           (p_rules ->> 'serious_7d')::numeric * 60 AS serious7,
           ((p_rules ->> 'min_rest_24h')::numeric - 2) * 60 AS high24,
           round((p_rules ->> 'min_rest_24h')::numeric, 2) AS min24_h,
           round((p_rules ->> 'min_rest_7d')::numeric, 2) AS min7_h,
           round((p_rules ->> 'min_long_block')::numeric, 2) AS long_h,
           round((p_rules ->> 'max_interval')::numeric, 2) AS int_h
  ),
  input AS (
    SELECT DISTINCT ON ((e ->> 'date')::date) (e ->> 'date')::date AS d, coalesce(e -> 'work', '[]'::jsonb) AS work
    FROM jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) WITH ORDINALITY AS t(e, n)
    WHERE e ? 'date'
    ORDER BY (e ->> 'date')::date, n
  ),
  days AS (
    SELECT i.d, i.work,
           (i.d - DATE '1970-01-01')::bigint AS dn,
           (i.d - DATE '1970-01-01')::bigint * 1440 AS d0,
           (i.d - DATE '1970-01-01')::bigint - row_number() OVER (ORDER BY i.d) AS grp
    FROM input AS i
  ),
  runs AS (
    SELECT grp, min(d0) AS rs, max(d0) + 1440 AS re FROM days GROUP BY grp
  ),
  raw AS (
    SELECT dy.grp,
           dy.d0 + greatest(0, least(1440, round((w ->> 0)::numeric)))::bigint AS s,
           dy.d0 + greatest(0, least(1440, round((w ->> 1)::numeric)))::bigint AS e
    FROM days AS dy
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(dy.work) = 'array' THEN dy.work ELSE '[]'::jsonb END) AS w
  ),
  ordered AS (
    SELECT grp, s, e,
           max(e) OVER (PARTITION BY grp ORDER BY s, e ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_max
    FROM raw WHERE e > s
  ),
  islands AS (
    SELECT grp, s, e, sum(CASE WHEN prev_max IS NULL OR s > prev_max THEN 1 ELSE 0 END) OVER (PARTITION BY grp ORDER BY s, e) AS isl
    FROM ordered
  ),
  work AS (
    SELECT grp, min(s) AS ws, max(e) AS we FROM islands GROUP BY grp, isl
  ),
  rest AS (
    SELECT x.grp, x.s, x.e
    FROM (
      SELECT ru.grp, coalesce(lag(w.we) OVER (PARTITION BY ru.grp ORDER BY w.ws), ru.rs) AS s, w.ws AS e
      FROM runs AS ru JOIN work AS w ON w.grp = ru.grp
      UNION ALL
      SELECT ru.grp, coalesce((SELECT max(w.we) FROM work AS w WHERE w.grp = ru.grp), ru.rs), ru.re
      FROM runs AS ru
    ) AS x
    WHERE x.e > x.s
  ),
  bounds AS (
    SELECT grp, ws AS b FROM work UNION SELECT grp, we FROM work
  ),
  -- The longest work period over the maximum interval, per day it ends in (ties: the latest end).
  intervals AS (
    SELECT DISTINCT ON (floor((w.we - 1) / 1440.0)) floor((w.we - 1) / 1440.0)::bigint AS dn, w.ws, w.we
    FROM work AS w, rules AS r
    WHERE (w.we - w.ws) > r.int_max
    ORDER BY floor((w.we - 1) / 1440.0), (w.we - w.ws) DESC, w.we DESC
  ),
  dayout AS (
    SELECT dy.d, dy.dn, dy.d0, dy.grp, ru.rs, ru.re,
           coalesce((SELECT sum(greatest(0, least(w.we, dy.d0 + 1440) - greatest(w.ws, dy.d0))) FROM work AS w WHERE w.grp = dy.grp), 0)::bigint AS work_min,
           (SELECT count(*) FROM rest AS x WHERE x.grp = dy.grp AND x.s < dy.d0 + 1440 AND x.e > dy.d0)::integer AS periods,
           coalesce((SELECT max(x.e - x.s) FROM rest AS x WHERE x.grp = dy.grp AND x.s < dy.d0 + 1440 AND x.e > dy.d0), 0)::bigint AS longest,
           w24.t AS t24, w24.rest AS m24, w7.t AS t7, w7.rest AS m7
    FROM days AS dy
    JOIN runs AS ru ON ru.grp = dy.grp
    LEFT JOIN LATERAL (
      SELECT c.t, (1440 - coalesce((SELECT sum(greatest(0, least(w.we, c.t + 1440) - greatest(w.ws, c.t))) FROM work AS w WHERE w.grp = dy.grp), 0))::bigint AS rest
      FROM (SELECT greatest(dy.d0 - 1439, ru.rs) AS lo, least(dy.d0, ru.re - 1440) AS hi) AS q
      CROSS JOIN LATERAL (
        SELECT q.lo AS t UNION SELECT q.hi
        UNION SELECT b.b FROM bounds AS b WHERE b.grp = dy.grp AND b.b > q.lo AND b.b < q.hi
        UNION SELECT b.b - 1440 FROM bounds AS b WHERE b.grp = dy.grp AND b.b - 1440 > q.lo AND b.b - 1440 < q.hi
      ) AS c
      WHERE q.lo <= q.hi
      ORDER BY 2, 1 DESC
      LIMIT 1
    ) AS w24 ON true
    LEFT JOIN LATERAL (
      SELECT c.t, (10080 - coalesce((SELECT sum(greatest(0, least(w.we, c.t + 10080) - greatest(w.ws, c.t))) FROM work AS w WHERE w.grp = dy.grp), 0))::bigint AS rest
      FROM (SELECT greatest(dy.d0 - 10079, ru.rs) AS lo, least(dy.d0 + 1440 - 10080, ru.re - 10080) AS hi) AS q
      CROSS JOIN LATERAL (
        SELECT q.lo AS t UNION SELECT q.hi
        UNION SELECT b.b FROM bounds AS b WHERE b.grp = dy.grp AND b.b > q.lo AND b.b < q.hi
        UNION SELECT b.b - 10080 FROM bounds AS b WHERE b.grp = dy.grp AND b.b - 10080 > q.lo AND b.b - 10080 < q.hi
      ) AS c
      WHERE q.lo <= q.hi
      ORDER BY 2, 1 DESC
      LIMIT 1
    ) AS w7 ON true
    WHERE (p_from IS NULL OR dy.d >= p_from) AND (p_to IS NULL OR dy.d <= p_to)
  ),
  ncs AS (
    SELECT o.d, 1 AS ord, 'REST_24H_MIN'::text AS code, o.t24 AS ws, o.t24 + 1440 AS we,
           round(o.m24 / 60.0, 2) AS measured, r.min24_h AS threshold, r.min24_h - round(o.m24 / 60.0, 2) AS deficit,
           CASE WHEN o.m24 < r.serious24 THEN 'critical' WHEN o.m24 < r.high24 THEN 'high' ELSE 'medium' END AS severity,
           (o.m24 < r.serious24) AS is_serious
    FROM dayout AS o, rules AS r WHERE o.m24 IS NOT NULL AND o.m24 < r.thr24
    UNION ALL
    SELECT o.d, 2, 'REST_7D_MIN', o.t7, o.t7 + 10080,
           round(o.m7 / 60.0, 2), r.min7_h, r.min7_h - round(o.m7 / 60.0, 2),
           CASE WHEN o.m7 < r.serious7 THEN 'critical' WHEN r.thr7 - o.m7 <= r.warn7 THEN 'medium' ELSE 'high' END,
           (o.m7 < r.serious7)
    FROM dayout AS o, rules AS r WHERE o.m7 IS NOT NULL AND o.m7 < r.thr7
    UNION ALL
    SELECT o.d, 3, 'REST_PERIODS_MAX', o.d0, o.d0 + 1440, o.periods::numeric, r.max_periods::numeric, NULL::numeric, 'medium', false
    FROM dayout AS o, rules AS r WHERE o.periods > r.max_periods
    UNION ALL
    SELECT o.d, 4, 'REST_LONG_BLOCK_MIN', o.d0, o.d0 + 1440,
           round(o.longest / 60.0, 2), r.long_h, r.long_h - round(o.longest / 60.0, 2), 'high', false
    FROM dayout AS o, rules AS r WHERE o.longest < r.long_min
    UNION ALL
    SELECT o.d, 5, 'REST_INTERVAL_MAX', iv.ws, iv.we, round((iv.we - iv.ws) / 60.0, 2), r.int_h, NULL::numeric, 'high', false
    FROM dayout AS o JOIN intervals AS iv ON iv.dn = o.dn, rules AS r
  )
  SELECT jsonb_build_object(
    'days', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'date', to_char(o.d, 'YYYY-MM-DD'),
               'work_minutes', o.work_min,
               'rest_minutes', 1440 - o.work_min,
               'rest_period_count', o.periods,
               'longest_rest_minutes', o.longest,
               'min_rest_24h', o.m24,
               'min_rest_7d', o.m7,
               'window_24h_start', CASE WHEN o.t24 IS NULL THEN NULL ELSE to_char(TIMESTAMP '1970-01-01 00:00' + o.t24 * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI') END,
               'window_24h_end', CASE WHEN o.t24 IS NULL THEN NULL ELSE to_char(TIMESTAMP '1970-01-01 00:00' + (o.t24 + 1440) * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI') END,
               'window_7d_start', CASE WHEN o.t7 IS NULL THEN NULL ELSE to_char(TIMESTAMP '1970-01-01 00:00' + o.t7 * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI') END,
               'window_7d_end', CASE WHEN o.t7 IS NULL THEN NULL ELSE to_char(TIMESTAMP '1970-01-01 00:00' + (o.t7 + 10080) * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI') END,
               'breach', EXISTS (SELECT 1 FROM ncs AS n WHERE n.d = o.d),
               'warning', NOT EXISTS (SELECT 1 FROM ncs AS n WHERE n.d = o.d)
                          AND ((o.m24 IS NOT NULL AND o.m24 >= r.thr24 AND o.m24 < r.thr24 + r.warn24)
                            OR (o.m7 IS NOT NULL AND o.m7 >= r.thr7 AND o.m7 < r.thr7 + r.warn7))
             ) ORDER BY o.d)
      FROM dayout AS o, rules AS r
    ), '[]'::jsonb),
    'non_conformities', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'day', to_char(n.d, 'YYYY-MM-DD'),
               'rule_code', n.code,
               'window_start', to_char(TIMESTAMP '1970-01-01 00:00' + n.ws * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI'),
               'window_end', to_char(TIMESTAMP '1970-01-01 00:00' + n.we * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI'),
               'measured', trim_scale(n.measured),
               'threshold', trim_scale(n.threshold),
               'deficit', trim_scale(n.deficit),
               'severity', n.severity,
               'is_serious', n.is_serious
             ) ORDER BY n.d, n.ord)
      FROM ncs AS n
    ), '[]'::jsonb)
  )
$$;

-- The rule wording (both writers use the same words; TS describeRule).
CREATE OR REPLACE FUNCTION public.work_rest_rule_text(p_code text, p_rules jsonb)
RETURNS TABLE (description text, correction text)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    CASE p_code
      WHEN 'REST_24H_MIN' THEN 'Rest below ' || trim_scale(round((p_rules ->> 'min_rest_24h')::numeric, 2)) || ' hours in a 24-hour period.'
      WHEN 'REST_7D_MIN' THEN 'Rolling 7-day rest below ' || trim_scale(round((p_rules ->> 'min_rest_7d')::numeric, 2)) || ' hours.'
      WHEN 'REST_PERIODS_MAX' THEN 'Rest split into more than ' || (p_rules ->> 'max_periods') || ' periods.'
      WHEN 'REST_LONG_BLOCK_MIN' THEN 'No rest period of at least ' || trim_scale(round((p_rules ->> 'min_long_block')::numeric, 2)) || ' hours.'
      WHEN 'REST_INTERVAL_MAX' THEN 'Gap between rest periods exceeds ' || trim_scale(round((p_rules ->> 'max_interval')::numeric, 2)) || ' hours.'
    END,
    CASE p_code
      WHEN 'REST_24H_MIN' THEN 'Reduce work hours or rearrange shifts so rest in any 24h period is ≥ ' || trim_scale(round((p_rules ->> 'min_rest_24h')::numeric, 2)) || 'h.'
      WHEN 'REST_7D_MIN' THEN 'Plan recovery rest days to bring the 7-day total to ≥ ' || trim_scale(round((p_rules ->> 'min_rest_7d')::numeric, 2)) || 'h.'
      WHEN 'REST_PERIODS_MAX' THEN 'Consolidate rest into ≤ ' || (p_rules ->> 'max_periods') || ' periods.'
      WHEN 'REST_LONG_BLOCK_MIN' THEN 'Provide one continuous rest period of ≥ ' || trim_scale(round((p_rules ->> 'min_long_block')::numeric, 2)) || 'h.'
      WHEN 'REST_INTERVAL_MAX' THEN 'Insert a rest break so the interval is ≤ ' || trim_scale(round((p_rules ->> 'max_interval')::numeric, 2)) || 'h.'
    END
$$;

-- ---------------------------------------------------------------- the month machine (pure; TS horMonth.ts)

-- Whether p_action may run on a month in p_status for the caller p_facts
-- describes (isOwn, canCreate, canApprove, canFinalApprove, sameDepartment,
-- inMonth, stillAboard, hodStep, hodSigned, blockingUnreviewed,
-- lowUnreviewed, missingDays, reason). Returns {ok, to, warnings} or
-- {ok: false, refusal, sqlstate}, exactly as decideMonthAction. Who is
-- checked first, then the state, then the conditions. Pure; service role.
CREATE OR REPLACE FUNCTION public.work_rest_month_decide(p_status text, p_action text, p_facts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_own boolean := coalesce((p_facts ->> 'isOwn')::boolean, false);
  v_create boolean := coalesce((p_facts ->> 'canCreate')::boolean, false);
  v_approve boolean := coalesce((p_facts ->> 'canApprove')::boolean, false);
  v_final boolean := coalesce((p_facts ->> 'canFinalApprove')::boolean, false);
  v_same boolean := coalesce((p_facts ->> 'sameDepartment')::boolean, false);
  v_in_month boolean := coalesce((p_facts ->> 'inMonth')::boolean, false);
  v_aboard boolean := coalesce((p_facts ->> 'stillAboard')::boolean, false);
  v_hod_step text := coalesce(p_facts ->> 'hodStep', 'nudge');
  v_hod_signed boolean := coalesce((p_facts ->> 'hodSigned')::boolean, false);
  v_blocking integer := coalesce((p_facts ->> 'blockingUnreviewed')::integer, 0);
  v_low integer := coalesce((p_facts ->> 'lowUnreviewed')::integer, 0);
  v_missing integer := coalesce((p_facts ->> 'missingDays')::integer, 0);
  v_reason text := btrim(coalesce(p_facts ->> 'reason', ''));
  v_state text;
  v_warnings jsonb := '[]'::jsonb;
  v_refusal text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('submit', 'submit_on_behalf', 'hod_sign', 'approve', 'lock', 'reopen') THEN
    RETURN jsonb_build_object('ok', false, 'refusal', 'action_unknown', 'sqlstate', '22023');
  END IF;

  -- Who.
  v_refusal := CASE p_action
    WHEN 'submit' THEN CASE WHEN NOT v_own THEN 'not_own_month' WHEN NOT v_create THEN 'not_permitted' END
    WHEN 'submit_on_behalf' THEN CASE WHEN NOT v_final THEN 'not_permitted' WHEN v_own THEN 'own_month' END
    WHEN 'hod_sign' THEN CASE WHEN NOT v_approve THEN 'not_permitted' WHEN v_own THEN 'own_month' WHEN NOT v_same THEN 'out_of_department' END
    WHEN 'approve' THEN CASE WHEN NOT v_final THEN 'not_permitted' WHEN v_own THEN 'own_month' END
    WHEN 'reopen' THEN CASE WHEN NOT v_final THEN 'not_permitted' WHEN v_own THEN 'own_month' END
    WHEN 'lock' THEN CASE WHEN NOT v_final THEN 'not_permitted' END
  END;
  IF v_refusal IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'refusal', v_refusal, 'sqlstate', '42501');
  END IF;

  -- Where the month is (legacy statuses read as the engine's).
  v_state := CASE coalesce(p_status, 'draft')
    WHEN 'draft' THEN 'draft' WHEN 'submitted' THEN 'submitted' WHEN 'hod_signed' THEN 'hod_signed'
    WHEN 'approved' THEN 'approved' WHEN 'locked' THEN 'locked' WHEN 'reopened' THEN 'reopened'
    WHEN 'crew_signed' THEN 'submitted' WHEN 'hod_reviewed' THEN 'hod_signed' WHEN 'captain_reviewed' THEN 'approved'
  END;
  IF v_state IS NULL OR NOT (
       (p_action IN ('submit', 'submit_on_behalf') AND v_state IN ('draft', 'reopened'))
    OR (p_action = 'hod_sign' AND v_state = 'submitted')
    OR (p_action = 'approve' AND v_state IN ('submitted', 'hod_signed'))
    OR (p_action = 'lock' AND v_state = 'approved')
    OR (p_action = 'reopen' AND v_state IN ('submitted', 'hod_signed', 'approved', 'locked'))) THEN
    RETURN jsonb_build_object('ok', false, 'refusal', 'illegal_transition', 'sqlstate', '22023');
  END IF;

  -- Conditions and warnings.
  IF p_action = 'submit' THEN
    IF NOT v_in_month THEN RETURN jsonb_build_object('ok', false, 'refusal', 'not_on_vessel', 'sqlstate', '22023'); END IF;
    IF v_missing > 0 THEN v_warnings := v_warnings || '"days_not_entered"'::jsonb; END IF;
  ELSIF p_action = 'submit_on_behalf' THEN
    IF v_aboard THEN RETURN jsonb_build_object('ok', false, 'refusal', 'still_on_vessel', 'sqlstate', '22023'); END IF;
    IF NOT v_in_month THEN RETURN jsonb_build_object('ok', false, 'refusal', 'not_on_vessel', 'sqlstate', '22023'); END IF;
    IF v_reason = '' THEN RETURN jsonb_build_object('ok', false, 'refusal', 'reason_required', 'sqlstate', '22023'); END IF;
    IF length(v_reason) > 2000 THEN RETURN jsonb_build_object('ok', false, 'refusal', 'reason_too_long', 'sqlstate', '22023'); END IF;
    IF v_missing > 0 THEN v_warnings := v_warnings || '"days_not_entered"'::jsonb; END IF;
  ELSIF p_action = 'hod_sign' THEN
    IF v_hod_step = 'off' THEN RETURN jsonb_build_object('ok', false, 'refusal', 'hod_step_off', 'sqlstate', '22023'); END IF;
  ELSIF p_action = 'approve' THEN
    IF v_hod_step = 'required' AND NOT v_hod_signed THEN
      RETURN jsonb_build_object('ok', false, 'refusal', 'hod_signature_required', 'sqlstate', '22023');
    END IF;
    IF v_blocking > 0 THEN RETURN jsonb_build_object('ok', false, 'refusal', 'breaches_unreviewed', 'sqlstate', '22023'); END IF;
    IF v_low > 0 THEN v_warnings := v_warnings || '"low_breaches_unreviewed"'::jsonb; END IF;
    IF v_hod_step = 'nudge' AND NOT v_hod_signed THEN v_warnings := v_warnings || '"hod_not_signed"'::jsonb; END IF;
  ELSIF p_action = 'reopen' THEN
    IF v_reason = '' THEN RETURN jsonb_build_object('ok', false, 'refusal', 'reason_required', 'sqlstate', '22023'); END IF;
    IF length(v_reason) > 2000 THEN RETURN jsonb_build_object('ok', false, 'refusal', 'reason_too_long', 'sqlstate', '22023'); END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'to', CASE p_action WHEN 'submit' THEN 'submitted' WHEN 'submit_on_behalf' THEN 'submitted' WHEN 'hod_sign' THEN 'hod_signed'
                        WHEN 'approve' THEN 'approved' WHEN 'lock' THEN 'locked' WHEN 'reopen' THEN 'reopened' END,
    'warnings', v_warnings);
END;
$$;

-- ---------------------------------------------------------------- helpers (internal)

-- The vessel's clock: vessel_work_rest_settings.timezone when it names a
-- zone Postgres knows, else UTC.
CREATE OR REPLACE FUNCTION public.work_rest_vessel_tz(p_vessel_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  SELECT nullif(btrim(s.timezone), '') INTO v_tz FROM public.vessel_work_rest_settings AS s WHERE s.vessel_id = p_vessel_id;
  IF v_tz IS NULL THEN
    RETURN 'UTC';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN others THEN
    RETURN 'UTC';
  END;
  RETURN v_tz;
END;
$$;

-- The rules of a vessel in hours (work_rest_rule_eval's p_rules) plus
-- hod_step and rule_set_id: the vessel's rule set (its own company's or a
-- global one), else the company's default, else the global default, else
-- the MLC defaults; margins, serious thresholds and the HoD step from
-- vessel_work_rest_settings (defaults 1 h, 3 h, 4 h, 50 h, nudge).
CREATE OR REPLACE FUNCTION public.work_rest_rules_for(p_vessel_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (SELECT ve.id, ve.company_id FROM public.vessels AS ve WHERE ve.id = p_vessel_id),
  s AS (SELECT st.* FROM public.vessel_work_rest_settings AS st WHERE st.vessel_id = p_vessel_id),
  rs AS (
    SELECT r.* FROM public.work_rest_rule_sets AS r, v
    WHERE r.id = (SELECT s.rule_set_id FROM s) AND (r.company_id IS NULL OR r.company_id = v.company_id)
    UNION ALL
    SELECT d.* FROM (
      SELECT r.* FROM public.work_rest_rule_sets AS r, v
      WHERE r.is_default AND (r.company_id IS NULL OR r.company_id = v.company_id) AND r.vessel_id IS NULL
      ORDER BY (r.company_id IS NULL), r.created_at, r.id
      LIMIT 1
    ) AS d
  ),
  pick AS (SELECT * FROM rs LIMIT 1)
  SELECT jsonb_build_object(
    'min_rest_24h', coalesce((SELECT min_rest_per_24h FROM pick), 10),
    'min_rest_7d', coalesce((SELECT min_rest_per_7d FROM pick), 77),
    'max_periods', coalesce((SELECT max_rest_periods_per_24h FROM pick), 2),
    'min_long_block', coalesce((SELECT min_long_rest_block FROM pick), 6),
    'max_interval', coalesce((SELECT max_interval_between_rest FROM pick), 14),
    'warn_24h', coalesce((SELECT warning_margin_24h_h FROM s), 1),
    'warn_7d', coalesce((SELECT warning_margin_7d_h FROM s), 3),
    'serious_24h', coalesce((SELECT serious_24h_h FROM s), 4),
    'serious_7d', coalesce((SELECT serious_7d_h FROM s), 50),
    'hod_step', coalesce((SELECT hod_step FROM s), 'nudge'),
    'rule_set_id', (SELECT id FROM pick))
$$;

-- Hours of Rest runs on the vessel that day: the crew module and crew_hor
-- are both on (on with no row; off when disabled or before enabled_from;
-- C45). The same rule as the client's horStartFrom.
CREATE OR REPLACE FUNCTION public.work_rest_hor_on(p_vessel_id uuid, p_on date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce(public.vessel_module_on_internal(p_vessel_id, 'crew', p_on), false)
     AND coalesce(public.vessel_module_on_internal(p_vessel_id, 'crew_hor', p_on), false);
END;
$$;

-- An assignment of the login to the vessel overlaps p_from..p_to: joined
-- (join date, else start date) on or before p_to, and left (leave date,
-- else end date, inclusive) on or after p_from, or still current with no
-- end. A row that is not current and has no end covers nothing.
CREATE OR REPLACE FUNCTION public.work_rest_assignment_on(p_user_id uuid, p_vessel_id uuid, p_from date, p_to date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crew_assignments AS ca
    WHERE ca.user_id = p_user_id AND ca.vessel_id = p_vessel_id
      AND coalesce(ca.join_date, ca.start_date) IS NOT NULL
      AND coalesce(ca.join_date, ca.start_date) <= p_to
      AND CASE WHEN coalesce(ca.leave_date, ca.end_date) IS NOT NULL THEN coalesce(ca.leave_date, ca.end_date) >= p_from
               ELSE coalesce(ca.is_current, false) END
  )
$$;

-- The department of a person on a vessel over p_from..p_to: their latest
-- joined assignment overlapping it, its position (else rank) matched to a
-- catalogue position, that position's department; else the assignment's or
-- profile's department text matched to a department by key or label. NULL
-- when there is no such assignment.
CREATE OR REPLACE FUNCTION public.work_rest_department_on(p_profile_id uuid, p_vessel_id uuid, p_from date, p_to date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH a AS (
    SELECT v.company_id, v.id AS vessel_id, ca.position, ca.rank,
           nullif(btrim(coalesce(nullif(btrim(ca.department), ''), p.department)), '') AS department_text
    FROM public.profiles AS p
    JOIN public.crew_assignments AS ca ON ca.user_id = p.user_id AND ca.vessel_id = p_vessel_id
    JOIN public.vessels AS v ON v.id = ca.vessel_id AND v.company_id = p.company_id
    WHERE p.id = p_profile_id
      AND coalesce(ca.join_date, ca.start_date) IS NOT NULL
      AND coalesce(ca.join_date, ca.start_date) <= p_to
      AND CASE WHEN coalesce(ca.leave_date, ca.end_date) IS NOT NULL THEN coalesce(ca.leave_date, ca.end_date) >= p_from
               ELSE coalesce(ca.is_current, false) END
    ORDER BY coalesce(ca.join_date, ca.start_date) DESC, ca.id
    LIMIT 1
  ),
  m AS (
    SELECT a.department_text,
           coalesce(public.crew_position_for(a.company_id, a.vessel_id, a.position), public.crew_position_for(a.company_id, a.vessel_id, a.rank)) AS pid
    FROM a
  )
  SELECT coalesce(pos.department_key, (
           SELECT d.key FROM public.departments AS d
           WHERE d.is_active AND m.department_text IS NOT NULL
             AND (d.key = public.record_normalise_office(m.department_text)
                  OR public.record_normalise_office(d.label) = public.record_normalise_office(m.department_text))
           ORDER BY d.sort_order LIMIT 1))::text
  FROM m
  LEFT JOIN public.positions AS pos ON pos.id = m.pid
$$;

-- The caller may save p_crew_user_id's day p_date on the vessel (see the
-- header): raises 42501 / P0002 / 22023 with a sentence, else returns the
-- person's profile id. Internal (work_rest_save_day, work_rest_fill_days).
CREATE OR REPLACE FUNCTION public.work_rest_day_gate(p_vessel_id uuid, p_crew_user_id uuid, p_date date)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_profile uuid;
  v_profile_company uuid;
  v_me uuid;
  v_today date;
  v_mine text;
  v_theirs text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_vessel_id IS NULL OR p_crew_user_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'day_required', DETAIL = 'Choose the vessel, the crew member and the day.';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  IF p_crew_user_id = v_uid THEN
    IF public.crew_vessel_cap('vessel.crew.hours_of_rest.create', p_vessel_id) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted', DETAIL = 'You don''t have permission to record hours of rest on this vessel.';
    END IF;
  ELSIF public.crew_vessel_cap('vessel.crew.hours_of_rest.edit', p_vessel_id) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted', DETAIL = 'You don''t have permission to change someone else''s hours of rest on this vessel.';
  END IF;
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted', DETAIL = 'External viewers cannot record hours of rest.';
  END IF;
  SELECT p.id, p.company_id INTO v_profile, v_profile_company FROM public.profiles AS p WHERE p.user_id = p_crew_user_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'crew_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  IF v_profile_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_in_company', DETAIL = 'This person is not in this vessel''s company.';
  END IF;
  IF p_crew_user_id <> v_uid AND public.crew_vessel_cap('vessel.crew.hours_of_rest.final_approve', p_vessel_id) IS NOT TRUE THEN
    SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = v_uid;
    v_mine := public.work_rest_department_on(v_me, p_vessel_id, (now() AT TIME ZONE public.work_rest_vessel_tz(p_vessel_id))::date, (now() AT TIME ZONE public.work_rest_vessel_tz(p_vessel_id))::date);
    v_theirs := public.work_rest_department_on(v_profile, p_vessel_id, p_date, p_date);
    IF v_mine IS NULL OR v_theirs IS NULL OR v_mine <> v_theirs THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'out_of_department',
        DETAIL = 'You can change hours of rest of your own department only.';
    END IF;
  END IF;
  v_today := (now() AT TIME ZONE public.work_rest_vessel_tz(p_vessel_id))::date;
  IF p_date > v_today + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'day_in_future', DETAIL = 'Hours of rest are recorded for days that have started.';
  END IF;
  IF public.work_rest_hor_on(p_vessel_id, p_date) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'hor_not_on', DETAIL = 'Hours of rest is not on for this vessel on that day.';
  END IF;
  IF public.work_rest_assignment_on(p_crew_user_id, p_vessel_id, p_date, p_date) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_on_vessel', DETAIL = 'There is no assignment to this vessel on that day.';
  END IF;
  RETURN v_profile;
END;
$$;

-- The month row of a person on a vessel (created as a draft when missing,
-- with the vessel's rule set). Internal; writes under the engine flag.
CREATE OR REPLACE FUNCTION public.work_rest_month_row(p_crew_user_id uuid, p_vessel_id uuid, p_year integer, p_month integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_prev text := coalesce(current_setting('storm.crew_engine', true), '');
BEGIN
  SELECT s.id INTO v_id FROM public.work_rest_monthly_submissions AS s
  WHERE s.crew_id = p_crew_user_id AND s.vessel_id = p_vessel_id AND s.period_year = p_year AND s.period_month = p_month;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  INSERT INTO public.work_rest_monthly_submissions (crew_id, vessel_id, period_year, period_month, status, rule_set_id)
  VALUES (p_crew_user_id, p_vessel_id, p_year, p_month, 'draft', (public.work_rest_rules_for(p_vessel_id) ->> 'rule_set_id')::uuid)
  ON CONFLICT (crew_id, vessel_id, period_year, period_month) DO NOTHING
  RETURNING id INTO v_id;
  PERFORM set_config('storm.crew_engine', v_prev, true);
  IF v_id IS NULL THEN
    SELECT s.id INTO v_id FROM public.work_rest_monthly_submissions AS s
    WHERE s.crew_id = p_crew_user_id AND s.vessel_id = p_vessel_id AND s.period_year = p_year AND s.period_month = p_month;
  END IF;
  RETURN v_id;
END;
$$;

-- The month totals of one month row: hours from its vessel's records,
-- open (unreviewed) breaches, compliant when no live breach. Internal.
CREATE OR REPLACE FUNCTION public.work_rest_month_refresh(p_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.crew_engine', true), '');
BEGIN
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.work_rest_monthly_submissions AS s
  SET total_work_hours = coalesce(x.work_min, 0) / 60.0,
      total_rest_hours = coalesce(x.rest_min, 0) / 60.0,
      open_non_conformities = (SELECT count(*) FROM public.work_rest_non_conformities AS n
                               WHERE n.submission_id = s.id AND n.superseded_at IS NULL AND n.review_outcome IS NULL AND n.status = 'open'),
      is_compliant = CASE WHEN coalesce(x.n, 0) = 0 THEN NULL
                          ELSE NOT EXISTS (SELECT 1 FROM public.work_rest_non_conformities AS n
                                           WHERE n.submission_id = s.id AND n.superseded_at IS NULL) END
  FROM (
    SELECT sum(r.total_work_minutes) AS work_min, sum(r.total_rest_minutes) AS rest_min, count(*) AS n
    FROM public.work_rest_records AS r
    JOIN public.work_rest_monthly_submissions AS m ON m.id = p_submission_id
    WHERE r.crew_id = m.crew_id AND r.vessel_id = m.vessel_id
      AND r.record_date >= make_date(m.period_year, m.period_month, 1)
      AND r.record_date < (make_date(m.period_year, m.period_month, 1) + interval '1 month')::date
  ) AS x
  WHERE s.id = p_submission_id;
  PERFORM set_config('storm.crew_engine', v_prev, true);
END;
$$;

-- Computes the person's breaches again for the days p_from..p_to (every
-- recorded day of the week before and the day after is context) and stores
-- them for the days whose month is open (see the header): each day's
-- summary columns and month link, its rolling_24h / rolling_7d compliance
-- checks, its breaches per rule (reviewed ones superseded, never deleted),
-- then the totals of the months touched. Each day is judged by its own
-- vessel's rules and stored in that vessel's time zone. Returns the counts.
-- Internal; writes under the engine flag.
CREATE OR REPLACE FUNCTION public.work_rest_recompute(p_crew_user_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.crew_engine', true), '');
  v_days jsonb;
  v_vessel uuid;
  v_rules jsonb;
  v_tz text;
  v_eval jsonb;
  v_day jsonb;
  v_nc jsonb;
  v_date date;
  v_record public.work_rest_records%ROWTYPE;
  v_month uuid;
  v_status text;
  v_months uuid[] := ARRAY[]::uuid[];
  v_keep uuid;
  v_text record;
  v_ws timestamptz;
  v_we timestamptz;
  v_d0 timestamptz;
  v_d1 timestamptz;
  e record;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_superseded integer := 0;
  v_deleted integer := 0;
  v_days_written integer := 0;
  v_rule text;
BEGIN
  IF p_crew_user_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RETURN jsonb_build_object('days', 0);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'date', to_char(r.record_date, 'YYYY-MM-DD'),
           'work', coalesce((SELECT jsonb_agg(jsonb_build_array(b.start_minute, b.end_minute) ORDER BY b.start_minute, b.end_minute)
                             FROM public.work_rest_blocks AS b WHERE b.record_id = r.id AND b.block_type = 'work'), '[]'::jsonb))
           ORDER BY r.record_date), '[]'::jsonb)
  INTO v_days
  FROM public.work_rest_records AS r
  WHERE r.crew_id = p_crew_user_id AND r.record_date BETWEEN p_from - 7 AND p_to + 1;

  PERFORM set_config('storm.crew_engine', 'on', true);
  FOR v_vessel IN
    SELECT DISTINCT r.vessel_id FROM public.work_rest_records AS r
    WHERE r.crew_id = p_crew_user_id AND r.record_date BETWEEN p_from AND p_to AND r.vessel_id IS NOT NULL
  LOOP
    v_rules := public.work_rest_rules_for(v_vessel);
    v_tz := public.work_rest_vessel_tz(v_vessel);
    v_eval := public.work_rest_rule_eval(v_days, v_rules, p_from, p_to);
    FOR v_day IN SELECT t.x FROM jsonb_array_elements(v_eval -> 'days') AS t(x) LOOP
      v_date := (v_day ->> 'date')::date;
      SELECT r.* INTO v_record FROM public.work_rest_records AS r WHERE r.crew_id = p_crew_user_id AND r.record_date = v_date;
      IF v_record.id IS NULL OR v_record.vessel_id IS DISTINCT FROM v_vessel THEN
        CONTINUE;
      END IF;
      v_month := public.work_rest_month_row(p_crew_user_id, v_vessel, extract(year FROM v_date)::integer, extract(month FROM v_date)::integer);
      SELECT s.status INTO v_status FROM public.work_rest_monthly_submissions AS s WHERE s.id = v_month;
      IF v_status IS NOT NULL AND v_status NOT IN ('draft', 'reopened') THEN
        CONTINUE;  -- a closed month keeps what it was submitted with
      END IF;
      IF NOT v_month = ANY (v_months) THEN
        v_months := v_months || v_month;
      END IF;
      v_days_written := v_days_written + 1;

      UPDATE public.work_rest_records AS r
      SET submission_id = v_month,
          total_work_minutes = (v_day ->> 'work_minutes')::integer,
          total_rest_minutes = (v_day ->> 'rest_minutes')::integer,
          longest_rest_minutes = (v_day ->> 'longest_rest_minutes')::integer,
          rest_period_count = (v_day ->> 'rest_period_count')::integer,
          is_compliant = NOT (v_day ->> 'breach')::boolean
      WHERE r.id = v_record.id;

      -- The windows the day was judged on.
      v_d0 := v_date::timestamp AT TIME ZONE v_tz;
      v_d1 := (v_date + 1)::timestamp AT TIME ZONE v_tz;
      DELETE FROM public.work_rest_compliance_checks AS c
      WHERE c.crew_id = p_crew_user_id AND c.check_window IN ('rolling_24h', 'rolling_7d') AND c.window_end > v_d0 AND c.window_end <= v_d1;
      IF v_day ->> 'min_rest_24h' IS NOT NULL THEN
        INSERT INTO public.work_rest_compliance_checks (crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes, threshold_minutes)
        VALUES (p_crew_user_id, v_month, 'rolling_24h',
                (v_day ->> 'window_24h_start')::timestamp AT TIME ZONE v_tz, (v_day ->> 'window_24h_end')::timestamp AT TIME ZONE v_tz,
                (v_day ->> 'min_rest_24h')::integer, 1440 - (v_day ->> 'min_rest_24h')::integer,
                (v_day ->> 'min_rest_24h')::numeric >= (v_rules ->> 'min_rest_24h')::numeric * 60,
                round((v_rules ->> 'min_rest_24h')::numeric * 60)::integer);
      END IF;
      IF v_day ->> 'min_rest_7d' IS NOT NULL THEN
        INSERT INTO public.work_rest_compliance_checks (crew_id, submission_id, check_window, window_start, window_end, rest_minutes, work_minutes, passes, threshold_minutes)
        VALUES (p_crew_user_id, v_month, 'rolling_7d',
                (v_day ->> 'window_7d_start')::timestamp AT TIME ZONE v_tz, (v_day ->> 'window_7d_end')::timestamp AT TIME ZONE v_tz,
                (v_day ->> 'min_rest_7d')::integer, 10080 - (v_day ->> 'min_rest_7d')::integer,
                (v_day ->> 'min_rest_7d')::numeric >= (v_rules ->> 'min_rest_7d')::numeric * 60,
                round((v_rules ->> 'min_rest_7d')::numeric * 60)::integer);
      END IF;

      -- The day's breaches, rule by rule.
      FOREACH v_rule IN ARRAY ARRAY['REST_24H_MIN', 'REST_7D_MIN', 'REST_PERIODS_MAX', 'REST_LONG_BLOCK_MIN', 'REST_INTERVAL_MAX'] LOOP
        SELECT t.n INTO v_nc FROM jsonb_array_elements(v_eval -> 'non_conformities') AS t(n)
        WHERE t.n ->> 'day' = v_day ->> 'date' AND t.n ->> 'rule_code' = v_rule;
        IF NOT FOUND THEN
          v_nc := NULL;
        END IF;
        v_keep := NULL;
        IF v_nc IS NOT NULL THEN
          v_ws := (v_nc ->> 'window_start')::timestamp AT TIME ZONE v_tz;
          v_we := (v_nc ->> 'window_end')::timestamp AT TIME ZONE v_tz;
          -- The live row with the same figures (reviewed first), else an unreviewed one to update.
          SELECT n.id INTO v_keep FROM public.work_rest_non_conformities AS n
          WHERE n.crew_id = p_crew_user_id AND n.breach_day = v_date AND n.rule_code = v_rule AND n.superseded_at IS NULL
            AND n.window_start = v_ws AND n.window_end = v_we
            AND n.measured_value = (v_nc ->> 'measured')::numeric AND n.threshold_value = (v_nc ->> 'threshold')::numeric
          ORDER BY (n.review_outcome IS NOT NULL OR n.status <> 'open') DESC, n.created_at, n.id
          LIMIT 1;
          IF v_keep IS NULL THEN
            SELECT n.id INTO v_keep FROM public.work_rest_non_conformities AS n
            WHERE n.crew_id = p_crew_user_id AND n.breach_day = v_date AND n.rule_code = v_rule AND n.superseded_at IS NULL
              AND n.review_outcome IS NULL AND n.status = 'open'
            ORDER BY n.created_at, n.id
            LIMIT 1;
          END IF;
          SELECT * INTO v_text FROM public.work_rest_rule_text(v_rule, v_rules);
          IF v_keep IS NULL THEN
            INSERT INTO public.work_rest_non_conformities (
              crew_id, submission_id, vessel_id, breach_day, rule_code, rule_description, severity, window_start, window_end,
              measured_value, threshold_value, suggested_correction, status, is_serious, deficit_hours)
            VALUES (
              p_crew_user_id, v_month, v_vessel, v_date, v_rule, v_text.description, v_nc ->> 'severity', v_ws, v_we,
              (v_nc ->> 'measured')::numeric, (v_nc ->> 'threshold')::numeric, v_text.correction, 'open',
              (v_nc ->> 'is_serious')::boolean, (v_nc ->> 'deficit')::numeric)
            RETURNING id INTO v_keep;
            v_inserted := v_inserted + 1;
          ELSE
            UPDATE public.work_rest_non_conformities AS n
            SET submission_id = v_month, vessel_id = v_vessel, rule_description = v_text.description,
                severity = v_nc ->> 'severity', window_start = v_ws, window_end = v_we,
                measured_value = (v_nc ->> 'measured')::numeric, threshold_value = (v_nc ->> 'threshold')::numeric,
                suggested_correction = v_text.correction, is_serious = (v_nc ->> 'is_serious')::boolean,
                deficit_hours = (v_nc ->> 'deficit')::numeric
            WHERE n.id = v_keep AND n.review_outcome IS NULL AND n.status = 'open'
              AND (n.submission_id, n.vessel_id, n.severity, n.window_start, n.window_end, n.measured_value, n.threshold_value, n.is_serious, n.deficit_hours, n.rule_description)
                  IS DISTINCT FROM (v_month, v_vessel, v_nc ->> 'severity', v_ws, v_we, (v_nc ->> 'measured')::numeric, (v_nc ->> 'threshold')::numeric,
                                    (v_nc ->> 'is_serious')::boolean, (v_nc ->> 'deficit')::numeric, v_text.description);
            IF FOUND THEN
              v_updated := v_updated + 1;
            END IF;
          END IF;
        END IF;
        -- Every other live row of the person, rule and day: superseded when reviewed, else deleted.
        FOR e IN
          SELECT n.id, (n.review_outcome IS NOT NULL OR n.status <> 'open') AS reviewed
          FROM public.work_rest_non_conformities AS n
          WHERE n.crew_id = p_crew_user_id AND n.breach_day = v_date AND n.rule_code = v_rule AND n.superseded_at IS NULL
            AND n.id IS DISTINCT FROM v_keep
        LOOP
          IF e.reviewed THEN
            UPDATE public.work_rest_non_conformities SET superseded_at = now() WHERE id = e.id;
            v_superseded := v_superseded + 1;
          ELSE
            DELETE FROM public.work_rest_non_conformities WHERE id = e.id;
            v_deleted := v_deleted + 1;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  PERFORM set_config('storm.crew_engine', v_prev, true);

  FOR v_month IN SELECT unnest(v_months) LOOP
    PERFORM public.work_rest_month_refresh(v_month);
  END LOOP;

  RETURN jsonb_build_object('days', v_days_written, 'inserted', v_inserted, 'updated', v_updated,
                            'superseded', v_superseded, 'deleted', v_deleted);
END;
$$;

-- Writes one day (the record, its work blocks, the month link) for a gated
-- caller: the blocks are validated (an array of at most 96 work periods
-- {start_minute, end_minute, category?, notes?} in whole minutes 0..1440,
-- end after start, not overlapping; rest blocks are not stored: unmarked
-- time is rest), the day must not be recorded on another vessel and its
-- month on this vessel must be open. Returns the record id. Internal.
CREATE OR REPLACE FUNCTION public.work_rest_day_write(p_vessel_id uuid, p_crew_user_id uuid, p_date date, p_blocks jsonb, p_note text, p_keep_note boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.crew_engine', true), '');
  v_month uuid;
  v_status text;
  v_record uuid;
  v_other uuid;
  v_blocks jsonb := coalesce(p_blocks, '[]'::jsonb);
  v_last integer := -1;
  b record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF jsonb_typeof(v_blocks) <> 'array' OR jsonb_array_length(v_blocks) > 96 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'blocks_invalid', DETAIL = 'A day holds at most 96 work periods.';
  END IF;
  FOR b IN
    SELECT x ->> 'block_type' AS kind, x ->> 'start_minute' AS s, x ->> 'end_minute' AS e,
           nullif(btrim(coalesce(x ->> 'category', '')), '') AS category, nullif(btrim(coalesce(x ->> 'notes', '')), '') AS notes
    FROM jsonb_array_elements(v_blocks) AS x
  LOOP
    IF coalesce(b.kind, 'work') <> 'work' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'blocks_invalid', DETAIL = 'Only work periods are recorded; the rest of the day counts as rest.';
    END IF;
    IF b.s IS NULL OR b.e IS NULL OR b.s !~ '^\d{1,4}$' OR b.e !~ '^\d{1,4}$'
       OR b.s::integer > 1440 OR b.e::integer > 1440 OR b.e::integer <= b.s::integer THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'blocks_invalid', DETAIL = 'Each work period needs a start and a later end within the day.';
    END IF;
    IF length(coalesce(b.category, '')) > 60 OR length(coalesce(b.notes, '')) > 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'blocks_invalid', DETAIL = 'Keep a category to 60 characters and a note to 500.';
    END IF;
  END LOOP;
  FOR b IN
    SELECT (x ->> 'start_minute')::integer AS s, (x ->> 'end_minute')::integer AS e
    FROM jsonb_array_elements(v_blocks) AS x ORDER BY 1, 2
  LOOP
    IF b.s < v_last THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'blocks_overlap', DETAIL = 'Work periods of a day must not overlap.';
    END IF;
    v_last := b.e;
  END LOOP;
  IF length(coalesce(v_note, '')) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'note_too_long', DETAIL = 'Keep the day''s note to 2000 characters.';
  END IF;

  SELECT r.id, r.vessel_id INTO v_record, v_other FROM public.work_rest_records AS r
  WHERE r.crew_id = p_crew_user_id AND r.record_date = p_date
  FOR UPDATE;
  IF v_record IS NOT NULL AND v_other IS DISTINCT FROM p_vessel_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'day_on_other_vessel', DETAIL = 'That day is recorded on another vessel.', HINT = v_other::text;
  END IF;
  v_month := public.work_rest_month_row(p_crew_user_id, p_vessel_id, extract(year FROM p_date)::integer, extract(month FROM p_date)::integer);
  SELECT s.status INTO v_status FROM public.work_rest_monthly_submissions AS s WHERE s.id = v_month FOR UPDATE;
  IF v_status NOT IN ('draft', 'reopened') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'month_closed',
      DETAIL = 'This month is submitted, approved or locked. Ask the approver to reopen it first.';
  END IF;

  PERFORM set_config('storm.crew_engine', 'on', true);
  IF v_record IS NULL THEN
    INSERT INTO public.work_rest_records (submission_id, crew_id, vessel_id, record_date, notes)
    VALUES (v_month, p_crew_user_id, p_vessel_id, p_date, v_note)
    RETURNING id INTO v_record;
  ELSE
    UPDATE public.work_rest_records
    SET submission_id = v_month, notes = CASE WHEN p_keep_note THEN notes ELSE v_note END
    WHERE id = v_record;
  END IF;
  DELETE FROM public.work_rest_blocks WHERE record_id = v_record;
  INSERT INTO public.work_rest_blocks (record_id, crew_id, block_type, category, start_minute, end_minute, notes, created_by)
  SELECT v_record, p_crew_user_id, 'work', nullif(btrim(coalesce(x ->> 'category', '')), ''),
         (x ->> 'start_minute')::integer, (x ->> 'end_minute')::integer, nullif(btrim(coalesce(x ->> 'notes', '')), ''), auth.uid()
  FROM jsonb_array_elements(v_blocks) AS x;
  PERFORM set_config('storm.crew_engine', v_prev, true);
  RETURN v_record;
END;
$$;

-- ---------------------------------------------------------------- RPCs

-- Saves one day of hours of rest (gate: work_rest_day_gate; write:
-- work_rest_day_write) and computes the breaches of the week around it
-- again. Returns {record_id, submission_id, date, day: the stored summary,
-- breaches: the live breaches of the day, changes: the counts}.
CREATE OR REPLACE FUNCTION public.work_rest_save_day(p_vessel_id uuid, p_crew_user_id uuid, p_date date, p_blocks jsonb, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.crew_engine', true), '');
  v_record uuid;
  v_changes jsonb;
  v_row public.work_rest_records%ROWTYPE;
BEGIN
  PERFORM public.work_rest_day_gate(p_vessel_id, p_crew_user_id, p_date);
  v_record := public.work_rest_day_write(p_vessel_id, p_crew_user_id, p_date, p_blocks, p_note, false);
  v_changes := public.work_rest_recompute(p_crew_user_id, p_date - 7, p_date + 7);
  SELECT r.* INTO v_row FROM public.work_rest_records AS r WHERE r.id = v_record;
  PERFORM set_config('storm.crew_engine', 'on', true);
  INSERT INTO public.work_rest_audit_log (submission_id, crew_id, actor_id, actor_role, action, entity_type, entity_id, new_value, metadata)
  VALUES (v_row.submission_id, p_crew_user_id, auth.uid(), CASE WHEN p_crew_user_id = auth.uid() THEN 'crew' ELSE 'editor' END,
          'day_saved', 'work_rest_record', v_record,
          jsonb_build_object('work_periods', jsonb_array_length(coalesce(p_blocks, '[]'::jsonb)), 'work_minutes', v_row.total_work_minutes),
          jsonb_build_object('date', p_date, 'vessel_id', p_vessel_id, 'changes', v_changes));
  PERFORM set_config('storm.crew_engine', v_prev, true);
  RETURN jsonb_build_object(
    'record_id', v_record,
    'submission_id', v_row.submission_id,
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'day', jsonb_build_object(
      'work_minutes', v_row.total_work_minutes, 'rest_minutes', v_row.total_rest_minutes,
      'longest_rest_minutes', v_row.longest_rest_minutes, 'rest_period_count', v_row.rest_period_count,
      'is_compliant', v_row.is_compliant),
    'breaches', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'rule_code', n.rule_code, 'severity', n.severity, 'is_serious', n.is_serious,
                                          'measured_value', n.measured_value, 'threshold_value', n.threshold_value,
                                          'deficit_hours', n.deficit_hours) ORDER BY n.rule_code)
      FROM public.work_rest_non_conformities AS n
      WHERE n.crew_id = p_crew_user_id AND n.breach_day = p_date AND n.superseded_at IS NULL), '[]'::jsonb),
    'changes', v_changes);
END;
$$;

-- Copies the work periods of one recorded day of the person (on any of
-- their vessels) onto up to 31 other days on this vessel, each passing the
-- same gate and write rules as a saved day (all or nothing; a refusal names
-- the day in HINT), within 62 days of each other; the target days keep
-- their notes. Returns {filled, dates, changes}.
CREATE OR REPLACE FUNCTION public.work_rest_fill_days(p_vessel_id uuid, p_crew_user_id uuid, p_source_date date, p_target_dates date[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.crew_engine', true), '');
  v_blocks jsonb;
  v_source uuid;
  v_target date;
  v_targets date[];
  v_changes jsonb;
  v_state text;
  v_msg text;
  v_detail text;
BEGIN
  IF p_source_date IS NULL OR p_target_dates IS NULL OR cardinality(p_target_dates) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'targets_invalid', DETAIL = 'Choose the day to copy and the days to fill.';
  END IF;
  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_targets FROM unnest(p_target_dates) AS t;
  IF array_position(p_target_dates, NULL) IS NOT NULL OR cardinality(v_targets) <> cardinality(p_target_dates)
     OR p_source_date = ANY (v_targets) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'targets_invalid', DETAIL = 'Fill each day once, and not the day you copy.';
  END IF;
  IF cardinality(v_targets) > 31 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_targets', DETAIL = 'Fill at most 31 days at a time.';
  END IF;
  IF v_targets[cardinality(v_targets)] - v_targets[1] > 62 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'fill_span_too_long', DETAIL = 'Fill days within about two months of each other.';
  END IF;
  -- The gate first (the caller learns nothing of a day they may not fill).
  FOREACH v_target IN ARRAY v_targets LOOP
    BEGIN
      PERFORM public.work_rest_day_gate(p_vessel_id, p_crew_user_id, v_target);
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      RAISE EXCEPTION USING ERRCODE = v_state, MESSAGE = v_msg, DETAIL = v_detail, HINT = to_char(v_target, 'YYYY-MM-DD');
    END;
  END LOOP;
  SELECT r.id INTO v_source FROM public.work_rest_records AS r WHERE r.crew_id = p_crew_user_id AND r.record_date = p_source_date;
  IF v_source IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'source_not_entered', DETAIL = 'The day to copy has no entry.';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('block_type', 'work', 'start_minute', b.start_minute, 'end_minute', b.end_minute,
                                               'category', b.category, 'notes', b.notes) ORDER BY b.start_minute, b.end_minute), '[]'::jsonb)
  INTO v_blocks
  FROM public.work_rest_blocks AS b WHERE b.record_id = v_source AND b.block_type = 'work';
  FOREACH v_target IN ARRAY v_targets LOOP
    BEGIN
      PERFORM public.work_rest_day_write(p_vessel_id, p_crew_user_id, v_target, v_blocks, NULL, true);
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      RAISE EXCEPTION USING ERRCODE = v_state, MESSAGE = v_msg, DETAIL = v_detail, HINT = to_char(v_target, 'YYYY-MM-DD');
    END;
  END LOOP;
  v_changes := public.work_rest_recompute(p_crew_user_id, v_targets[1] - 7, v_targets[cardinality(v_targets)] + 7);
  PERFORM set_config('storm.crew_engine', 'on', true);
  INSERT INTO public.work_rest_audit_log (crew_id, actor_id, actor_role, action, entity_type, metadata)
  VALUES (p_crew_user_id, auth.uid(), CASE WHEN p_crew_user_id = auth.uid() THEN 'crew' ELSE 'editor' END, 'days_filled', 'work_rest_record',
          jsonb_build_object('source', p_source_date, 'targets', to_jsonb(v_targets), 'vessel_id', p_vessel_id, 'changes', v_changes));
  PERFORM set_config('storm.crew_engine', v_prev, true);
  RETURN jsonb_build_object('filled', cardinality(v_targets), 'dates', to_jsonb(v_targets), 'changes', v_changes);
END;
$$;

-- Moves a person's month on a vessel (see the header; the decision is
-- work_rest_month_decide over the facts gathered here). Records the
-- signature of the step, the stamps, the audit row; reopen marks the live
-- signatures stale. Returns {submission_id, status, warnings, signature_id}.
CREATE OR REPLACE FUNCTION public.work_rest_month_transition(
  p_vessel_id uuid,
  p_crew_user_id uuid,
  p_year integer,
  p_month integer,
  p_action text,
  p_reason text DEFAULT NULL,
  p_signature_text text DEFAULT NULL
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
  v_profile uuid;
  v_profile_company uuid;
  v_me uuid;
  v_tz text;
  v_today date;
  v_first date;
  v_last date;
  v_month uuid;
  v_status text;
  v_rules jsonb;
  v_facts jsonb;
  v_decision jsonb;
  v_to text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_text text := nullif(btrim(coalesce(p_signature_text, '')), '');
  v_role text;
  v_signature uuid;
  v_agent text;
  v_mine text;
  v_theirs text;
  v_can_create boolean;
  v_can_approve boolean;
  v_can_final boolean;
  v_missing integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_vessel_id IS NULL OR p_crew_user_id IS NULL OR p_year IS NULL OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 OR p_year NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'month_required', DETAIL = 'Choose the vessel, the crew member and the month.';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  v_can_create := public.crew_vessel_cap('vessel.crew.hours_of_rest.create', p_vessel_id);
  v_can_approve := public.crew_vessel_cap('vessel.crew.hours_of_rest.approve', p_vessel_id);
  v_can_final := public.crew_vessel_cap('vessel.crew.hours_of_rest.final_approve', p_vessel_id);
  IF v_can_create IS NOT TRUE AND v_can_approve IS NOT TRUE AND v_can_final IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted', DETAIL = 'You don''t have permission to do that for this month.';
  END IF;
  IF public.crew_caller_is_external() IS NOT FALSE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted', DETAIL = 'External viewers cannot sign hours of rest.';
  END IF;
  SELECT p.id, p.company_id INTO v_profile, v_profile_company FROM public.profiles AS p WHERE p.user_id = p_crew_user_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'crew_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  IF v_profile_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_in_company', DETAIL = 'This person is not in this vessel''s company.';
  END IF;
  IF length(coalesce(v_text, '')) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signature_text_too_long', DETAIL = 'Keep the statement to 500 characters.';
  END IF;

  v_tz := public.work_rest_vessel_tz(p_vessel_id);
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_first := make_date(p_year, p_month, 1);
  v_last := (v_first + interval '1 month - 1 day')::date;
  IF v_first > v_today THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'month_in_future', DETAIL = 'That month has not started yet.';
  END IF;
  v_rules := public.work_rest_rules_for(p_vessel_id);

  v_month := public.work_rest_month_row(p_crew_user_id, p_vessel_id, p_year, p_month);
  SELECT s.status INTO v_status FROM public.work_rest_monthly_submissions AS s WHERE s.id = v_month FOR UPDATE;

  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = v_uid;
  v_mine := public.work_rest_department_on(v_me, p_vessel_id, v_today, v_today);
  v_theirs := public.work_rest_department_on(v_profile, p_vessel_id, v_first, v_last);
  SELECT count(*) INTO v_missing
  FROM generate_series(v_first, least(v_last, v_today), interval '1 day') AS g(day)
  WHERE public.work_rest_hor_on(p_vessel_id, g.day::date)
    AND public.work_rest_assignment_on(p_crew_user_id, p_vessel_id, g.day::date, g.day::date)
    AND NOT EXISTS (SELECT 1 FROM public.work_rest_records AS r WHERE r.crew_id = p_crew_user_id AND r.record_date = g.day::date)
    AND NOT EXISTS (SELECT 1 FROM public.crew_leave_entries AS l
                    WHERE l.crew_id = p_crew_user_id AND l.date = g.day::date
                      AND nullif(upper(btrim(l.status_code)), '') IS NOT NULL AND upper(btrim(l.status_code)) NOT IN ('F', 'T'));

  v_facts := jsonb_build_object(
    'isOwn', v_uid = p_crew_user_id,
    'canCreate', coalesce(v_can_create, false),
    'canApprove', coalesce(v_can_approve, false),
    'canFinalApprove', coalesce(v_can_final, false),
    'sameDepartment', v_mine IS NOT NULL AND v_theirs IS NOT NULL AND v_mine = v_theirs,
    'inMonth', coalesce(public.work_rest_assignment_on(p_crew_user_id, p_vessel_id, v_first, v_last), false),
    'stillAboard', coalesce(public.work_rest_assignment_on(p_crew_user_id, p_vessel_id, v_today, v_today), false),
    'hodStep', coalesce(v_rules ->> 'hod_step', 'nudge'),
    'hodSigned', EXISTS (SELECT 1 FROM public.work_rest_signatures AS g WHERE g.submission_id = v_month AND g.signer_role = 'hod' AND g.stale_at IS NULL)
                 OR v_status IN ('hod_signed', 'hod_reviewed'),
    'blockingUnreviewed', (SELECT count(*) FROM public.work_rest_non_conformities AS n
                           WHERE n.submission_id = v_month AND n.superseded_at IS NULL AND n.review_outcome IS NULL AND n.status = 'open' AND n.severity <> 'low'),
    'lowUnreviewed', (SELECT count(*) FROM public.work_rest_non_conformities AS n
                      WHERE n.submission_id = v_month AND n.superseded_at IS NULL AND n.review_outcome IS NULL AND n.status = 'open' AND n.severity = 'low'),
    'missingDays', v_missing,
    'reason', v_reason);
  v_decision := public.work_rest_month_decide(v_status, p_action, v_facts);
  IF NOT coalesce((v_decision ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION USING ERRCODE = v_decision ->> 'sqlstate', MESSAGE = v_decision ->> 'refusal',
      DETAIL = CASE v_decision ->> 'refusal'
        WHEN 'action_unknown' THEN 'That step is not part of the monthly sign-off.'
        WHEN 'not_own_month' THEN 'Only the crew member submits their own month. Submit on their behalf once they have left the vessel.'
        WHEN 'own_month' THEN 'Someone else signs off your own month.'
        WHEN 'not_permitted' THEN 'You don''t have permission to do that for this month.'
        WHEN 'out_of_department' THEN 'Heads of department sign months of their own department only.'
        WHEN 'illegal_transition' THEN 'This month is not at that step.'
        WHEN 'not_on_vessel' THEN 'There is no assignment to this vessel in that month.'
        WHEN 'still_on_vessel' THEN 'They are still on the vessel, so they submit the month themselves.'
        WHEN 'reason_required' THEN 'Give a reason.'
        WHEN 'reason_too_long' THEN 'Keep the reason to 2000 characters.'
        WHEN 'hod_step_off' THEN 'The head of department step is off on this vessel.'
        WHEN 'hod_signature_required' THEN 'The head of department signs the month before approval on this vessel.'
        WHEN 'breaches_unreviewed' THEN 'Review every breach before approving the month.'
      END;
  END IF;
  v_to := v_decision ->> 'to';
  v_role := CASE p_action WHEN 'submit' THEN 'crew' WHEN 'submit_on_behalf' THEN 'company' WHEN 'hod_sign' THEN 'hod' WHEN 'approve' THEN 'captain' END;
  BEGIN
    v_agent := left(current_setting('request.headers', true)::jsonb ->> 'user-agent', 500);
  EXCEPTION WHEN others THEN
    v_agent := NULL;
  END;

  PERFORM set_config('storm.crew_engine', 'on', true);
  IF p_action IN ('submit', 'submit_on_behalf') THEN
    -- A new cycle: any live signature left from before is history now.
    UPDATE public.work_rest_signatures SET stale_at = now(), stale_reason = 'Submitted again.'
    WHERE submission_id = v_month AND stale_at IS NULL;
  END IF;
  IF v_role IS NOT NULL THEN
    INSERT INTO public.work_rest_signatures (submission_id, signer_id, signer_role, signature_method, signature_payload, user_agent)
    VALUES (v_month, v_uid, v_role, 'electronic',
            jsonb_strip_nulls(jsonb_build_object(
              'statement', coalesce(v_text, CASE p_action
                WHEN 'submit' THEN 'I confirm these records of my hours of work and rest are accurate.'
                WHEN 'submit_on_behalf' THEN 'Submitted for the crew member, who has left the vessel.'
                WHEN 'hod_sign' THEN 'Reviewed as head of department.'
                WHEN 'approve' THEN 'Approved.' END),
              'action', p_action, 'period', to_char(v_first, 'YYYY-MM'), 'vessel_id', p_vessel_id,
              'reason', CASE WHEN p_action = 'submit_on_behalf' THEN v_reason END)),
            v_agent)
    RETURNING id INTO v_signature;
  END IF;
  IF p_action = 'reopen' THEN
    UPDATE public.work_rest_signatures SET stale_at = now(), stale_reason = left(v_reason, 500)
    WHERE submission_id = v_month AND stale_at IS NULL;
  END IF;

  UPDATE public.work_rest_monthly_submissions AS s
  SET status = v_to,
      submitted_at = CASE WHEN p_action IN ('submit', 'submit_on_behalf') THEN now() WHEN p_action = 'reopen' THEN NULL ELSE s.submitted_at END,
      submitted_by = CASE WHEN p_action IN ('submit', 'submit_on_behalf') THEN v_uid WHEN p_action = 'reopen' THEN NULL ELSE s.submitted_by END,
      crew_signed_at = CASE WHEN p_action = 'submit' THEN now() WHEN p_action IN ('submit_on_behalf', 'reopen') THEN NULL ELSE s.crew_signed_at END,
      submitted_on_behalf_by = CASE WHEN p_action = 'submit_on_behalf' THEN v_uid WHEN p_action IN ('submit', 'reopen') THEN NULL ELSE s.submitted_on_behalf_by END,
      on_behalf_reason = CASE WHEN p_action = 'submit_on_behalf' THEN v_reason WHEN p_action IN ('submit', 'reopen') THEN NULL ELSE s.on_behalf_reason END,
      hod_signed_at = CASE WHEN p_action = 'hod_sign' THEN now() WHEN p_action IN ('submit', 'submit_on_behalf', 'reopen') THEN NULL ELSE s.hod_signed_at END,
      hod_signed_by = CASE WHEN p_action = 'hod_sign' THEN v_uid WHEN p_action IN ('submit', 'submit_on_behalf', 'reopen') THEN NULL ELSE s.hod_signed_by END,
      approved_at = CASE WHEN p_action = 'approve' THEN now() WHEN p_action IN ('submit', 'submit_on_behalf', 'reopen') THEN NULL ELSE s.approved_at END,
      approved_by = CASE WHEN p_action = 'approve' THEN v_uid WHEN p_action IN ('submit', 'submit_on_behalf', 'reopen') THEN NULL ELSE s.approved_by END,
      captain_reviewed_at = CASE WHEN p_action = 'approve' THEN now() WHEN p_action IN ('submit', 'submit_on_behalf', 'reopen') THEN NULL ELSE s.captain_reviewed_at END,
      locked_at = CASE WHEN p_action = 'lock' THEN now() WHEN p_action IN ('submit', 'submit_on_behalf', 'reopen') THEN NULL ELSE s.locked_at END,
      locked_by = CASE WHEN p_action = 'lock' THEN v_uid WHEN p_action IN ('submit', 'submit_on_behalf', 'reopen') THEN NULL ELSE s.locked_by END,
      reopened_at = CASE WHEN p_action = 'reopen' THEN now() ELSE s.reopened_at END,
      reopened_by = CASE WHEN p_action = 'reopen' THEN v_uid ELSE s.reopened_by END,
      reopen_reason = CASE WHEN p_action = 'reopen' THEN v_reason ELSE s.reopen_reason END
  WHERE s.id = v_month;

  INSERT INTO public.work_rest_audit_log (submission_id, crew_id, actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (v_month, p_crew_user_id, v_uid, coalesce(v_role, 'approver'), 'month_' || p_action, 'work_rest_monthly_submission', v_month,
          jsonb_build_object('status', v_status), jsonb_build_object('status', v_to),
          jsonb_strip_nulls(jsonb_build_object('reason', v_reason, 'warnings', v_decision -> 'warnings', 'signature_id', v_signature,
                                               'vessel_id', p_vessel_id, 'period', to_char(v_first, 'YYYY-MM'))));
  PERFORM set_config('storm.crew_engine', v_prev, true);

  RETURN jsonb_build_object('submission_id', v_month, 'status', v_to, 'warnings', coalesce(v_decision -> 'warnings', '[]'::jsonb),
                            'signature_id', v_signature);
END;
$$;

-- ---------------------------------------------------------------- write guards (D-X1-9)

-- The month row's status, stamps, signer and summary columns belong to the
-- engine. A signed-in writer without storm.crew_engine = 'on' may only
-- insert a blank draft (no stamps, no totals) and change nothing after.
-- The service role and no-JWT maintenance are exempt, as are writes made
-- by other triggers (foreign-key actions).
CREATE OR REPLACE FUNCTION public.work_rest_submissions_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('storm.crew_engine', true) = 'on' OR pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft'
       OR NEW.submitted_at IS NOT NULL OR NEW.crew_signed_at IS NOT NULL OR NEW.hod_signed_at IS NOT NULL
       OR NEW.captain_reviewed_at IS NOT NULL OR NEW.locked_at IS NOT NULL OR NEW.reopened_at IS NOT NULL
       OR NEW.reopened_by IS NOT NULL OR NEW.reopen_reason IS NOT NULL OR NEW.submitted_by IS NOT NULL
       OR NEW.submitted_on_behalf_by IS NOT NULL OR NEW.on_behalf_reason IS NOT NULL OR NEW.hod_signed_by IS NOT NULL
       OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.locked_by IS NOT NULL
       OR coalesce(NEW.total_work_hours, 0) <> 0 OR coalesce(NEW.total_rest_hours, 0) <> 0
       OR coalesce(NEW.open_non_conformities, 0) <> 0 OR NEW.is_compliant IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'work_rest_engine_only',
        DETAIL = 'A month moves on only through STORM''s sign-off steps.', HINT = TG_TABLE_NAME;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'work_rest_engine_only',
      DETAIL = 'A month moves on only through STORM''s sign-off steps.', HINT = TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

-- Records, blocks, breaches, signatures, compliance checks and the audit
-- log are written by the engine only: a signed-in direct INSERT, UPDATE or
-- DELETE without storm.crew_engine = 'on' is refused. The service role,
-- no-JWT maintenance and writes made by other triggers (foreign-key
-- cascades) are exempt.
CREATE OR REPLACE FUNCTION public.work_rest_engine_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('storm.crew_engine', true) = 'on' OR pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'work_rest_engine_only',
    DETAIL = 'Hours of rest are saved through STORM''s hours-of-rest steps.', HINT = TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS work_rest_submissions_status_guard ON public.work_rest_monthly_submissions;
CREATE TRIGGER work_rest_submissions_status_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_rest_monthly_submissions
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_submissions_status_guard();
DROP TRIGGER IF EXISTS work_rest_records_write_guard ON public.work_rest_records;
CREATE TRIGGER work_rest_records_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_rest_records
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_engine_write_guard();
DROP TRIGGER IF EXISTS work_rest_blocks_write_guard ON public.work_rest_blocks;
CREATE TRIGGER work_rest_blocks_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_rest_blocks
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_engine_write_guard();
DROP TRIGGER IF EXISTS work_rest_non_conformities_write_guard ON public.work_rest_non_conformities;
CREATE TRIGGER work_rest_non_conformities_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_rest_non_conformities
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_engine_write_guard();
DROP TRIGGER IF EXISTS work_rest_signatures_write_guard ON public.work_rest_signatures;
CREATE TRIGGER work_rest_signatures_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_rest_signatures
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_engine_write_guard();
DROP TRIGGER IF EXISTS work_rest_compliance_checks_write_guard ON public.work_rest_compliance_checks;
CREATE TRIGGER work_rest_compliance_checks_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_rest_compliance_checks
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_engine_write_guard();
DROP TRIGGER IF EXISTS work_rest_audit_log_write_guard ON public.work_rest_audit_log;
CREATE TRIGGER work_rest_audit_log_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_rest_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.work_rest_engine_write_guard();

-- ---------------------------------------------------------------- grants

-- Browser RPCs.
REVOKE ALL ON FUNCTION public.work_rest_save_day(uuid, uuid, date, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_save_day(uuid, uuid, date, jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_fill_days(uuid, uuid, date, date[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_fill_days(uuid, uuid, date, date[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_month_transition(uuid, uuid, integer, integer, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_month_transition(uuid, uuid, integer, integer, text, text, text) TO authenticated, service_role;

-- Internal: the definers call them as their owner.
REVOKE ALL ON FUNCTION public.work_rest_rule_eval(jsonb, jsonb, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_rule_eval(jsonb, jsonb, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_rule_text(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_rule_text(text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_month_decide(text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_month_decide(text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_vessel_tz(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_vessel_tz(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_rules_for(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_rules_for(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_hor_on(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_hor_on(uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_assignment_on(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_assignment_on(uuid, uuid, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_department_on(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_department_on(uuid, uuid, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_day_gate(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_day_gate(uuid, uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_month_row(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_month_row(uuid, uuid, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_month_refresh(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_month_refresh(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_recompute(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_recompute(uuid, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.work_rest_day_write(uuid, uuid, date, jsonb, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_rest_day_write(uuid, uuid, date, jsonb, text, boolean) TO service_role;

-- Trigger functions: nobody calls them.
REVOKE ALL ON FUNCTION public.work_rest_submissions_status_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_rest_engine_write_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.work_rest_rule_eval(jsonb, jsonb, date, date) IS 'The hours-of-rest rules over a person''s recorded days (X1-07; gap/04 W6, C38, C46): 10 h in any 24 h, 77 h in any 7 days, at most 2 rest periods with one of 6 h, at most 14 h between rest periods; serious, deficit and warning; windows across day and month boundaries, only wholly recorded windows. Pure; the exact mirror of src/modules/work-rest/lib/complianceEngine.ts evaluateRules (parity: src/test/work-rest/fixtures/horCases.json). Service role.';
COMMENT ON FUNCTION public.work_rest_rule_text(text, jsonb) IS 'The description and suggested correction of a rule (TS describeRule). Pure; service role.';
COMMENT ON FUNCTION public.work_rest_month_decide(text, text, jsonb) IS 'The hours-of-rest month machine (X1-07; gap/04 C39, C43, W6): whether an action may run on a month for the caller the facts describe, and what follows. Pure; the exact mirror of src/modules/work-rest/lib/horMonth.ts decideMonthAction (parity: horCases.json months). Service role.';
COMMENT ON FUNCTION public.work_rest_vessel_tz(uuid) IS 'The vessel''s hours-of-rest clock (vessel_work_rest_settings.timezone when valid, else UTC). Internal.';
COMMENT ON FUNCTION public.work_rest_rules_for(uuid) IS 'The rules of a vessel in hours (rule set, margins, serious thresholds), its HoD step and rule set id. Internal.';
COMMENT ON FUNCTION public.work_rest_hor_on(uuid, date) IS 'Hours of Rest runs on the vessel that day: the crew and crew_hor modules on (C45). Internal.';
COMMENT ON FUNCTION public.work_rest_assignment_on(uuid, uuid, date, date) IS 'A login has an assignment to the vessel overlapping the days (ends inclusive). Internal.';
COMMENT ON FUNCTION public.work_rest_department_on(uuid, uuid, date, date) IS 'A person''s department on a vessel over the days, from their assignment''s position. Internal.';
COMMENT ON FUNCTION public.work_rest_day_gate(uuid, uuid, date) IS 'Who may save a person''s day on a vessel (own: hours_of_rest.create; another''s: edit and the same department unless final_approve; the person in the vessel''s company with an assignment that day; Hours of Rest on; no later than tomorrow). Raises, else returns the person''s profile id. Internal.';
COMMENT ON FUNCTION public.work_rest_month_row(uuid, uuid, integer, integer) IS 'A person''s month row on a vessel, created as a draft when missing (D-X1-20). Internal.';
COMMENT ON FUNCTION public.work_rest_month_refresh(uuid) IS 'Recomputes a month row''s totals, open breach count and compliance. Internal.';
COMMENT ON FUNCTION public.work_rest_recompute(uuid, date, date) IS 'Computes a person''s breaches again for the days and stores them for open months (reviewed breaches superseded, never deleted), with the day summaries, the compliance checks and the month totals. Internal.';
COMMENT ON FUNCTION public.work_rest_day_write(uuid, uuid, date, jsonb, text, boolean) IS 'Writes one validated day (record, work blocks, month link) for a gated caller; refuses a closed month and a day recorded on another vessel. Internal.';
COMMENT ON FUNCTION public.work_rest_save_day(uuid, uuid, date, jsonb, text) IS 'Saves one day of hours of rest and computes the breaches of the week around it (X1-07; gap/04 C37, C38). Browser RPC.';
COMMENT ON FUNCTION public.work_rest_fill_days(uuid, uuid, date, date[]) IS 'Copies one recorded day onto up to 31 days of the person on the vessel, all or nothing (X1-07; gap/04 C37). Browser RPC.';
COMMENT ON FUNCTION public.work_rest_month_transition(uuid, uuid, integer, integer, text, text, text) IS 'Moves a person''s hours-of-rest month on a vessel: submit, submit_on_behalf, hod_sign, approve, lock, reopen, with the step''s signature and audit (X1-07; gap/04 C39, C43, W6; D-X1-6, D-X1-11, D-X1-20). Browser RPC.';
COMMENT ON FUNCTION public.work_rest_submissions_status_guard() IS 'Trigger: a month''s status, stamps, signers and totals only through the engine (storm.crew_engine); signed-in writers may insert a blank draft only. Service role, no JWT and foreign-key actions exempt.';
COMMENT ON FUNCTION public.work_rest_engine_write_guard() IS 'Trigger: hours-of-rest records, blocks, breaches, signatures, compliance checks and audit rows only through the engine (storm.crew_engine). Service role, no JWT and foreign-key actions exempt.';
