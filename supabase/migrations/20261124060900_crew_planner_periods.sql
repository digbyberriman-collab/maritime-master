-- =================================================================
-- CREW X1-09: the planner server: one period store, the leave types,
-- multi-period leave requests, the On/Off toggle and manning by day
-- (Phase 3 wave 1, stream X1; gap/04 C4, C47, C48, C50, C51, C52, W7;
-- DECISIONS D-X1-4, D-X1-10, D-X1-16, D-01, D-128, D-230; X1 spec §6 060900)
-- Tables: leave_types (the 14 STORM leave types, one list for the dialog
--   and the legend), crew_leave_request_periods (the periods of a leave
--   request, T-71), crew_leave_settings (the vessel's leave approval
--   step)
-- Columns: frp_rotation_assignments (the one period store: person, leave
--   type, end unknown, request, rotation plan, approval, sick on board),
--   crew_leave_entries (which period wrote a day code and the code it
--   replaced), crew_leave_requests (the person's profile)
-- Functions: pure rules (planner_leave_type_for_rotation,
--   planner_rotation_type_for_leave, planner_periods_overlap,
--   planner_open_horizon, planner_manning_band, planner_leave_decide_check);
--   internals (planner_gate, planner_person_company, planner_periods_parse,
--   planner_period_write, planner_reflow_open, planner_person_materialise,
--   planner_day_locked, planner_is_department_hod, planner_manning_rows,
--   planner_request_create); RPCs (planner_period_upsert,
--   planner_period_delete, planner_add_leave, crew_leave_request_submit,
--   crew_leave_request_decide, crew_toggle_onboard, vessel_manning_by_day,
--   planner_leave_settings_save); the daily sweep frp_periods_extend_open
-- Triggers: frp_rotation_assignments_status_guard (engine-only columns;
--   fills the person and the leave type), frp_periods_materialise
--   (confirmed periods -> day codes), crew_leave_entries_source_guard (a
--   manual day code owns its day), crew_leave_requests_status_guard
--   (status and reviewer columns are the engine's), and the scope guards
--   of the two new subject tables
-- TS mirror: src/modules/rotation-planner/types/db.pending.ts; the pure
--   rules in src/modules/rotation-planner/lib/{leaveTypes,periods,manning}.ts
--   (supabase/tests/sql/crew/planner_periods.test.sql evaluates the TS
--   functions through scripts/db/lib/load-ts.mjs and compares them with
--   the SQL rules case by case)
-- =================================================================
--
-- Why. The planner keeps two stores today: bars in frp_rotation_assignments
-- (the rotation planner) and day codes in crew_leave_entries (the leave
-- planner, the leave calculator, hr_days_onboard, payroll). Leave requests
-- carry one period and their approval writes day codes from the browser.
-- gap/04 W7 makes the bars the one store: a confirmed period writes its day
-- codes through a trigger (so the calculator and payroll read what they
-- read today, unchanged), a request has one or more periods (T-71) and its
-- approval creates confirmed periods, and the manning check reads periods.
--
-- The period store. A period is a frp_rotation_assignments row with a
-- person (profile_id, keyed on profiles.id: most crew have no login), a
-- leave type (leave_types.key), a start and an end, or "end unknown". An
-- end-unknown period ends the day before the person's next confirmed
-- period; its stored end_date is how far it has been written to day codes
-- (today + 30, never past the day before the next period, never before its
-- start), and frp_periods_extend_open() moves that horizon on each day
-- (hr-daily-sweeper, PR-X1-K). Two confirmed periods of one person overlap
-- when they cover a common day (planner_periods_overlap): an end-unknown
-- period never overlaps a later one (it simply ends there). The engine
-- refuses an overlap (22023 period_overlap, the other period named) unless
-- the caller asks to replace, and replacing only trims, splits or removes
-- rotation-leave periods, never another leave type (gap/04 W7).
--
-- Day codes. frp_periods_materialise recomputes the person's day codes over
-- the days a changed confirmed period covered or covers: on each day the
-- confirmed period with the latest start governs; its leave type's day
-- code is written with the period's id (crew_leave_entries.source_period_id)
-- and the code the day carried before (replaced_code); a day no longer
-- governed by its period gets its replaced code back, or loses its row. A
-- day in a locked month (crew_leave_locked_months, company-wide or the
-- period's vessel) is never written or cleared. People without a login
-- have no day codes (crew_leave_entries.crew_id is a login). Existing
-- legacy bars are not written on apply: a legacy bar writes day codes the
-- first time a confirmed bar of it changes. A manual day code painted over
-- a period's day belongs to the painter (crew_leave_entries_source_guard).
--
-- Leave types (gap/04 C51, W7): On board F, Sick on board F (flagged on
-- the period), Rotation leave R, Holiday L, Medical M, Emergency E (new),
-- Crew development CD, Paid parental PPL, Compassionate CL, Unpaid U,
-- Travel T, Neutral N, Pre-boarding quarantine Q, Other O (new). Pending is
-- a request status, never a type. The two new codes widen the day-code
-- CHECKs of crew_leave_entries and crew_leave_requests; the leave
-- calculator reads E and O as neutral (its default) and hr_days_onboard as
-- paid leave. balance_effect says what a day does to the leave balance
-- (accrues, deducts, neutral, or per the vessel's leave policy flag, which
-- policy_flag names), as the calculator reads it today. tone_key is a
-- design token name (the client maps it to classes), never a colour value.
-- needs_approval marks personal leave (holiday, medical, emergency, crew
-- development, parental, compassionate, unpaid, other): a planner writes it
-- directly only with leave approval (D-X1-10); otherwise it goes through
-- Add leave as a request.
--
-- Leave requests (gap/04 C50, C52, W7). Pending -> Approved (its periods
-- become confirmed periods tagged with the request) / Declined (a reason)
-- / Cancelled (by the requester while pending; by an approver while
-- pending or after approval, when its periods are removed and their day
-- codes reversed). The vessel's HoD step (crew_leave_settings.hod_step):
-- off (no HoD review), nudge (the default: the head of the requester's
-- department may review first; the approver decides either way) or
-- required (final approval waits for the HoD review, except for the
-- Master and fleet approvers). No one decides their own request.
-- crew_leave_request_submit is the crew self-service request (the caller's
-- own assignment on the vessel); planner_add_leave is the planner's Add
-- leave: saved Approved, with the approver recorded, for a holder of
-- hris.leave_rotation.leave_requests.approve on the vessel (D-X1-10),
-- otherwise a pending request. Leave for a person without a login is
-- added by an approver only (a request names a login, crew_id).
--
-- The On/Off toggle (gap/04 C4). Off ends the person's On board period the
-- day before and writes a leave period (Rotation leave, from today, end
-- unknown by default) and a disembark movement; On ends the current leave
-- the day before and writes an embark movement (crew_movements, source
-- toggle).
--
-- Manning by day (gap/04 C48, W7, D-X1-16). For each day and position:
-- aboard = people with an On board or Sick on board period on the vessel,
-- or an assignment on the vessel covering the day and no period at all;
-- qualified = aboard and compliant for the position (the requirement
-- engine of 060600 today, and no requirement satisfied today expiring
-- before the day); the band is critical (qualified < min), at_minimum
-- (qualified = min > 0), overmanned (aboard > max) or normal.
--
-- Access. Planner writes need vessel.crew.crew_scheduling.edit on the
-- vessel; leave approval hris.leave_rotation.leave_requests.approve with
-- reach to the request's vessel; manning vessel.crew.crew_scheduling.view.
-- External viewers and inactive callers are refused; a person or request of
-- another company reads as unknown (P0002). leave_types reads for active
-- users; crew_leave_request_periods (they name the leave type, medical or
-- compassionate included) by the requester and by the vessel's schedulers
-- (crew_scheduling.view) and leave approvers, not external viewers, in the
-- company (D-377; the legacy company-wide reads of crew_leave_requests,
-- crew_leave_entries and frp_rotation_assignments are unchanged here and
-- open for the owner, D-378); crew_leave_settings with crew_scheduling.view
-- on the vessel. The status
-- and approval columns of frp_rotation_assignments and the status and
-- reviewer columns of crew_leave_requests change only under the X1 engine
-- flag (storm.crew_engine) for signed-in writers; a legacy planner writer
-- keeps its draft bars and the geometry of bars (the D-01 fallback), the
-- service role and no-JWT maintenance are exempt.
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each policy,
-- trigger and constraint, CREATE OR REPLACE for every function, seeds ON
-- CONFLICT DO NOTHING, backfills only where the column is still empty.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.crew_vessel_gate(text,uuid,text)') IS NULL
     OR to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_cap_vessel_ids(text)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL
     OR to_regclass('public.position_manning') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060900_crew_planner_periods needs the crew gate helpers and positions: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regprocedure('public.crew_vessel_members(uuid,date)') IS NULL
     OR to_regprocedure('public.crew_caller_is_external()') IS NULL
     OR to_regclass('public.crew_movements') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060900_crew_planner_periods needs crew_vessel_members() and crew_movements: apply 20261124060200_crew_vessel_list.sql first';
  END IF;
  IF to_regprocedure('public.crew_member_role_on(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060900_crew_planner_periods needs crew_member_role_on(): apply 20261124060500_crew_document_verification.sql first';
  END IF;
  IF to_regprocedure('public.crew_compliance_summary_for(uuid[],date,uuid)') IS NULL
     OR to_regclass('public.crew_requirement_positions') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060900_crew_planner_periods needs the requirement engine: apply 20261124060600_crew_compliance.sql first';
  END IF;
  IF to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR position('user_is_active' IN pg_get_functiondef('public.get_user_company_id(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060900_crew_planner_periods needs the platform capability, reach and active-aware helpers: apply 20261123000400, 20261123010000 and 20261123020100 first';
  END IF;
  IF to_regclass('public.frp_rotation_assignments') IS NULL OR to_regclass('public.crew_leave_entries') IS NULL
     OR to_regclass('public.crew_leave_requests') IS NULL OR to_regclass('public.crew_leave_locked_months') IS NULL
     OR to_regclass('public.frp_planner_audit_log') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060900_crew_planner_periods needs the legacy planner and leave tables (20260215080527, 20260501210000, 20260617195850)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- leave types (gap/04 C51, W7)

CREATE TABLE IF NOT EXISTS public.leave_types (
  key text NOT NULL,
  label text NOT NULL,
  day_code text NOT NULL,
  tone_key text NOT NULL,
  balance_effect text NOT NULL,
  policy_flag text NULL,
  counts_on_board boolean NOT NULL DEFAULT false,
  is_leave boolean NOT NULL DEFAULT true,
  needs_approval boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_types_pkey PRIMARY KEY (key),
  CONSTRAINT leave_types_key_check CHECK (key ~ '^[a-z][a-z0-9_]*$' AND length(key) <= 40),
  CONSTRAINT leave_types_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  CONSTRAINT leave_types_day_code_check CHECK (day_code IN ('F', 'Q', 'L', 'T', 'CD', 'M', 'PPL', 'CL', 'N', 'U', 'R', 'E', 'O')),
  CONSTRAINT leave_types_tone_key_check CHECK (tone_key IN ('success', 'info', 'warning', 'critical', 'orange', 'purple', 'cyan', 'amber', 'pink', 'indigo', 'teal', 'muted')),
  CONSTRAINT leave_types_balance_effect_check CHECK (balance_effect IN ('accrues', 'deducts', 'neutral', 'policy')),
  CONSTRAINT leave_types_policy_flag_check CHECK (policy_flag IS NULL OR policy_flag IN ('sick_affects_balance', 'training_affects_balance', 'unpaid_affects_balance')),
  CONSTRAINT leave_types_policy_pair_check CHECK ((balance_effect = 'policy') = (policy_flag IS NOT NULL)),
  CONSTRAINT leave_types_on_board_check CHECK (NOT (counts_on_board AND is_leave)),
  CONSTRAINT leave_types_approval_check CHECK (NOT needs_approval OR is_leave),
  CONSTRAINT leave_types_sort_order_check CHECK (sort_order BETWEEN 0 AND 10000)
);

COMMENT ON TABLE public.leave_types IS 'The leave types of the planner (gap/04 C51, W7): one STORM list for the Add leave dialog, the legend, the manning grid and the day codes the period store writes (day_code; Sick on board writes F and flags the period). balance_effect says what a day does to the leave balance (accrues, deducts, neutral, or per the vessel''s leave policy flag named in policy_flag); counts_on_board marks the types that put a person aboard (On board, Sick on board); needs_approval marks personal leave that a planner writes only with leave approval. tone_key is a design token name, never a colour value. Read by every active signed-in user; written by the service role only.';

INSERT INTO public.leave_types (key, label, day_code, tone_key, balance_effect, policy_flag, counts_on_board, is_leave, needs_approval, sort_order)
VALUES
  ('on_board', 'On board', 'F', 'success', 'accrues', NULL, true, false, false, 10),
  ('sick_on_board', 'Sick on board', 'F', 'pink', 'accrues', NULL, true, false, false, 20),
  ('rotation', 'Rotation leave', 'R', 'teal', 'neutral', NULL, false, true, false, 30),
  ('holiday', 'Holiday (annual leave)', 'L', 'info', 'deducts', NULL, false, true, true, 40),
  ('medical', 'Medical / sick leave', 'M', 'critical', 'policy', 'sick_affects_balance', false, true, true, 50),
  ('emergency', 'Emergency leave', 'E', 'orange', 'neutral', NULL, false, true, true, 60),
  ('crew_development', 'Crew development / training', 'CD', 'cyan', 'policy', 'training_affects_balance', false, true, true, 70),
  ('paid_parental', 'Paid parental leave', 'PPL', 'purple', 'neutral', NULL, false, true, true, 80),
  ('compassionate', 'Compassionate leave', 'CL', 'indigo', 'neutral', NULL, false, true, true, 90),
  ('unpaid', 'Unpaid leave', 'U', 'warning', 'policy', 'unpaid_affects_balance', false, true, true, 100),
  ('travel', 'Travel', 'T', 'amber', 'neutral', NULL, false, false, false, 110),
  ('neutral', 'Neutral leave', 'N', 'muted', 'neutral', NULL, false, true, false, 120),
  ('pbq', 'Pre-boarding quarantine (PBQ)', 'Q', 'muted', 'accrues', NULL, false, false, false, 130),
  ('other', 'Other', 'O', 'muted', 'neutral', NULL, false, true, true, 140)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------- the day codes widen (E, O) on the two leave tables

ALTER TABLE public.crew_leave_entries
  ADD COLUMN IF NOT EXISTS source_period_id uuid NULL,
  ADD COLUMN IF NOT EXISTS replaced_code varchar(4) NULL;
ALTER TABLE public.crew_leave_entries DROP CONSTRAINT IF EXISTS crew_leave_entries_status_code_check;
ALTER TABLE public.crew_leave_entries
  ADD CONSTRAINT crew_leave_entries_status_code_check
  CHECK (status_code IN ('F', 'Q', 'L', 'T', 'CD', 'M', 'PPL', 'CL', 'N', 'U', 'R', 'E', 'O')) NOT VALID;
ALTER TABLE public.crew_leave_entries VALIDATE CONSTRAINT crew_leave_entries_status_code_check;
ALTER TABLE public.crew_leave_entries DROP CONSTRAINT IF EXISTS crew_leave_entries_replaced_code_check;
ALTER TABLE public.crew_leave_entries
  ADD CONSTRAINT crew_leave_entries_replaced_code_check
  CHECK (replaced_code IS NULL OR replaced_code IN ('F', 'Q', 'L', 'T', 'CD', 'M', 'PPL', 'CL', 'N', 'U', 'R', 'E', 'O')) NOT VALID;
ALTER TABLE public.crew_leave_entries VALIDATE CONSTRAINT crew_leave_entries_replaced_code_check;
ALTER TABLE public.crew_leave_entries DROP CONSTRAINT IF EXISTS crew_leave_entries_replaced_needs_source_check;
ALTER TABLE public.crew_leave_entries
  ADD CONSTRAINT crew_leave_entries_replaced_needs_source_check
  CHECK (replaced_code IS NULL OR source_period_id IS NOT NULL) NOT VALID;
ALTER TABLE public.crew_leave_entries VALIDATE CONSTRAINT crew_leave_entries_replaced_needs_source_check;
CREATE INDEX IF NOT EXISTS crew_leave_entries_source_period_idx ON public.crew_leave_entries (source_period_id) WHERE source_period_id IS NOT NULL;

ALTER TABLE public.crew_leave_requests
  ADD COLUMN IF NOT EXISTS profile_id uuid NULL;
ALTER TABLE public.crew_leave_requests DROP CONSTRAINT IF EXISTS crew_leave_requests_leave_type_check;
ALTER TABLE public.crew_leave_requests
  ADD CONSTRAINT crew_leave_requests_leave_type_check
  CHECK (leave_type IN ('F', 'Q', 'L', 'T', 'CD', 'M', 'PPL', 'CL', 'N', 'U', 'R', 'E', 'O')) NOT VALID;
ALTER TABLE public.crew_leave_requests VALIDATE CONSTRAINT crew_leave_requests_leave_type_check;

UPDATE public.crew_leave_requests AS r
SET profile_id = p.id
FROM public.profiles AS p
WHERE r.profile_id IS NULL AND p.user_id = r.crew_id AND p.company_id = r.company_id;

ALTER TABLE public.crew_leave_requests DROP CONSTRAINT IF EXISTS crew_leave_requests_profile_id_fkey;
ALTER TABLE public.crew_leave_requests
  ADD CONSTRAINT crew_leave_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS crew_leave_requests_profile_idx ON public.crew_leave_requests (profile_id);

-- ---------------------------------------------------------------- the period store (frp_rotation_assignments)

ALTER TABLE public.frp_rotation_assignments
  ADD COLUMN IF NOT EXISTS profile_id uuid NULL,
  ADD COLUMN IF NOT EXISTS leave_type_key text NULL,
  ADD COLUMN IF NOT EXISTS end_unknown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_id uuid NULL,
  ADD COLUMN IF NOT EXISTS rotation_plan_id uuid NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS is_sick_on_board boolean NOT NULL DEFAULT false;

-- Legacy rotation types to leave types (planner bars written before this
-- file): on board, yard and temporary cover put a person aboard; the
-- legacy "leave" and "standby" bars are rotation leave; work from home
-- and "no crew" are neutral; training is crew development; "to be
-- confirmed" has no type (it writes no day codes). Pure; mirrored by
-- leaveTypeKeyForRotation in src/modules/rotation-planner/lib/leaveTypes.ts.
CREATE OR REPLACE FUNCTION public.planner_leave_type_for_rotation(p_rotation_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE p_rotation_type
    WHEN 'onboard' THEN 'on_board'
    WHEN 'yard' THEN 'on_board'
    WHEN 'temp_cover' THEN 'on_board'
    WHEN 'training' THEN 'crew_development'
    WHEN 'leave' THEN 'rotation'
    WHEN 'standby' THEN 'rotation'
    WHEN 'travel' THEN 'travel'
    WHEN 'wfh' THEN 'neutral'
    WHEN 'no_crew' THEN 'neutral'
  END
$$;

-- The legacy rotation type an engine period shows to the legacy planner and
-- to hr_days_onboard's bar fallback: aboard types onboard, travel travel,
-- crew development training, neutral and unpaid no_crew (hr_days_onboard
-- counts N and U days as unpaid), every other leave type leave. Pure;
-- mirrored by rotationTypeForLeaveType.
CREATE OR REPLACE FUNCTION public.planner_rotation_type_for_leave(p_leave_type_key text)
RETURNS public.frp_rotation_type
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT (CASE p_leave_type_key
    WHEN 'on_board' THEN 'onboard'
    WHEN 'sick_on_board' THEN 'onboard'
    WHEN 'pbq' THEN 'onboard'
    WHEN 'travel' THEN 'travel'
    WHEN 'crew_development' THEN 'training'
    WHEN 'neutral' THEN 'no_crew'
    WHEN 'unpaid' THEN 'no_crew'
    ELSE 'leave'
  END)::public.frp_rotation_type
$$;

UPDATE public.frp_rotation_assignments AS a
SET profile_id = p.id
FROM public.profiles AS p
WHERE a.profile_id IS NULL AND a.crew_user_id IS NOT NULL AND p.user_id = a.crew_user_id AND p.company_id = a.company_id;

UPDATE public.frp_rotation_assignments AS a
SET leave_type_key = public.planner_leave_type_for_rotation(a.rotation_type::text)
WHERE a.leave_type_key IS NULL AND public.planner_leave_type_for_rotation(a.rotation_type::text) IS NOT NULL;

ALTER TABLE public.frp_rotation_assignments DROP CONSTRAINT IF EXISTS frp_rotation_assignments_profile_id_fkey;
ALTER TABLE public.frp_rotation_assignments
  ADD CONSTRAINT frp_rotation_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.frp_rotation_assignments DROP CONSTRAINT IF EXISTS frp_rotation_assignments_leave_type_key_fkey;
ALTER TABLE public.frp_rotation_assignments
  ADD CONSTRAINT frp_rotation_assignments_leave_type_key_fkey FOREIGN KEY (leave_type_key) REFERENCES public.leave_types(key) ON UPDATE CASCADE;
ALTER TABLE public.frp_rotation_assignments DROP CONSTRAINT IF EXISTS frp_rotation_assignments_request_id_fkey;
ALTER TABLE public.frp_rotation_assignments
  ADD CONSTRAINT frp_rotation_assignments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.crew_leave_requests(id) ON DELETE SET NULL;
ALTER TABLE public.frp_rotation_assignments DROP CONSTRAINT IF EXISTS frp_rotation_assignments_approved_by_fkey;
ALTER TABLE public.frp_rotation_assignments
  ADD CONSTRAINT frp_rotation_assignments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.frp_rotation_assignments DROP CONSTRAINT IF EXISTS frp_rotation_assignments_approval_pair_check;
ALTER TABLE public.frp_rotation_assignments
  ADD CONSTRAINT frp_rotation_assignments_approval_pair_check CHECK (approved_by IS NULL OR approved_at IS NOT NULL) NOT VALID;
ALTER TABLE public.frp_rotation_assignments VALIDATE CONSTRAINT frp_rotation_assignments_approval_pair_check;
ALTER TABLE public.frp_rotation_assignments DROP CONSTRAINT IF EXISTS frp_rotation_assignments_sick_flag_check;
ALTER TABLE public.frp_rotation_assignments
  ADD CONSTRAINT frp_rotation_assignments_sick_flag_check CHECK (is_sick_on_board = (leave_type_key IS NOT DISTINCT FROM 'sick_on_board')) NOT VALID;
ALTER TABLE public.frp_rotation_assignments VALIDATE CONSTRAINT frp_rotation_assignments_sick_flag_check;
-- (vessel_id, start_date, end_date) is indexed since 20260617195850 (idx_frp_rot_vessel_range).
CREATE INDEX IF NOT EXISTS frp_rotation_assignments_profile_range_idx ON public.frp_rotation_assignments (profile_id, start_date, end_date) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS frp_rotation_assignments_request_idx ON public.frp_rotation_assignments (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS frp_rotation_assignments_open_idx ON public.frp_rotation_assignments (profile_id) WHERE end_unknown;

-- ---------------------------------------------------------------- request periods and the vessel's leave settings

CREATE TABLE IF NOT EXISTS public.crew_leave_request_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  request_id uuid NOT NULL,
  leave_type_key text NOT NULL,
  start_date date NOT NULL,
  end_date date NULL,
  end_unknown boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_leave_request_periods_pkey PRIMARY KEY (id),
  CONSTRAINT crew_leave_request_periods_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_leave_request_periods_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.crew_leave_requests(id) ON DELETE CASCADE,
  CONSTRAINT crew_leave_request_periods_leave_type_key_fkey FOREIGN KEY (leave_type_key) REFERENCES public.leave_types(key) ON UPDATE CASCADE,
  CONSTRAINT crew_leave_request_periods_dates_check CHECK (
    (end_unknown AND end_date IS NULL) OR (NOT end_unknown AND end_date IS NOT NULL AND end_date >= start_date)
  ),
  CONSTRAINT crew_leave_request_periods_sort_order_check CHECK (sort_order BETWEEN 0 AND 20)
);
CREATE UNIQUE INDEX IF NOT EXISTS crew_leave_request_periods_request_sort_key ON public.crew_leave_request_periods (request_id, sort_order);

CREATE TABLE IF NOT EXISTS public.crew_leave_settings (
  vessel_id uuid NOT NULL,
  company_id uuid NOT NULL,
  hod_step text NOT NULL DEFAULT 'nudge',
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_leave_settings_pkey PRIMARY KEY (vessel_id),
  CONSTRAINT crew_leave_settings_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT crew_leave_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_leave_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_leave_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_leave_settings_hod_step_check CHECK (hod_step IN ('off', 'nudge', 'required'))
);

COMMENT ON TABLE public.crew_leave_request_periods IS 'The periods of a crew leave request (gap/04 C50, T-71): each period has its own leave type, start and end (or end unknown) and becomes its own confirmed planner period when the request is approved. The request row keeps the first period''s day code and the overall span for legacy readers. Read by members of its company who are the requester (crew_id / profile_id), or who hold vessel.crew.crew_scheduling.view or hris.leave_rotation.leave_requests.approve on the request''s vessel and are not external viewers (D-377); never company-wide; written only by the planner definers.';
COMMENT ON TABLE public.crew_leave_settings IS 'A vessel''s leave approval settings (gap/04 C52, W7): hod_step off (no head-of-department review), nudge (the default: the head of the requester''s department may review first, the approver decides either way) or required (final approval waits for the review, except for the Master and fleet approvers). Read with vessel.crew.crew_scheduling.view on the vessel; written by planner_leave_settings_save.';

-- ---------------------------------------------------------------- pure rules (TS mirrors in lib/periods.ts and lib/manning.ts)

-- Two periods overlap when a day is covered by both. A NULL end is "end
-- unknown": such a period ends the day before the next period of the
-- person, so it never overlaps a period that starts after it. Mirrored by
-- rangesOverlap in src/modules/rotation-planner/lib/periods.ts.
CREATE OR REPLACE FUNCTION public.planner_periods_overlap(p_a_start date, p_a_end date, p_b_start date, p_b_end date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_a_start IS NULL OR p_b_start IS NULL THEN false
    WHEN p_a_start = p_b_start THEN true
    WHEN p_a_start < p_b_start THEN p_a_end IS NOT NULL AND p_a_end >= p_b_start
    ELSE p_b_end IS NOT NULL AND p_b_end >= p_a_start
  END
$$;

-- How far an end-unknown period is written to day codes: today + 30 days,
-- never past the day before the person's next period, never before its own
-- start. Mirrored by openHorizon in lib/periods.ts.
CREATE OR REPLACE FUNCTION public.planner_open_horizon(p_start date, p_next_start date, p_today date)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_next_start IS NOT NULL AND p_next_start > p_start THEN least(greatest(p_today + 30, p_start), p_next_start - 1)
    ELSE greatest(p_today + 30, p_start)
  END
$$;

-- The manning band of a position on a day (gap/04 W7, D-X1-16), first
-- match wins: critical (qualified below a minimum above zero), at_minimum
-- (qualified at that minimum), overmanned (aboard above the maximum, when
-- one is set), normal. Mirrored by manningBand in lib/manning.ts.
CREATE OR REPLACE FUNCTION public.planner_manning_band(p_aboard integer, p_qualified integer, p_min integer, p_max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_min, 0) > 0 AND coalesce(p_qualified, 0) < p_min THEN 'critical'
    WHEN coalesce(p_min, 0) > 0 AND coalesce(p_qualified, 0) = p_min THEN 'at_minimum'
    WHEN p_max IS NOT NULL AND coalesce(p_aboard, 0) > p_max THEN 'overmanned'
    ELSE 'normal'
  END
$$;

-- May this decision be taken on a leave request (gap/04 C52, W7)? 'ok' or
-- '<sqlstate>:<refusal>'. hod_review: a pending request, the vessel's HoD
-- step not off, the head of the requester's department, once; approve: a
-- pending request, a leave approver, after the HoD review when the step is
-- required (the Master and fleet approvers never wait); decline: a pending
-- request, an approver (or the department's head when the step is on) with
-- a reason; cancel: the requester while pending, an approver while pending
-- or approved (with a reason unless it is their own). Nobody decides their
-- own request. Pure; mirrored by leaveDecisionCheck in lib/periods.ts.
CREATE OR REPLACE FUNCTION public.planner_leave_decide_check(
  p_decision text,
  p_status text,
  p_is_owner boolean,
  p_is_approver boolean,
  p_is_hod boolean,
  p_is_master_or_fleet boolean,
  p_hod_step text,
  p_hod_reviewed boolean,
  p_has_reason boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_decision IS NULL OR p_decision NOT IN ('hod_review', 'approve', 'decline', 'cancel') THEN '22023:decision_invalid'
    WHEN p_decision = 'hod_review' THEN CASE
      WHEN p_status IS DISTINCT FROM 'pending' THEN '22023:illegal_transition'
      WHEN coalesce(p_hod_step, 'nudge') = 'off' THEN '22023:hod_step_off'
      WHEN coalesce(p_is_owner, false) THEN '42501:own_request'
      WHEN NOT coalesce(p_is_hod, false) THEN '42501:not_department_hod'
      WHEN coalesce(p_hod_reviewed, false) THEN '22023:already_reviewed'
      ELSE 'ok' END
    WHEN p_decision = 'approve' THEN CASE
      WHEN p_status IS DISTINCT FROM 'pending' THEN '22023:illegal_transition'
      WHEN coalesce(p_is_owner, false) THEN '42501:own_request'
      WHEN NOT coalesce(p_is_approver, false) THEN '42501:not_permitted'
      WHEN coalesce(p_hod_step, 'nudge') = 'required' AND NOT coalesce(p_hod_reviewed, false)
           AND NOT coalesce(p_is_master_or_fleet, false) THEN '22023:hod_review_pending'
      ELSE 'ok' END
    WHEN p_decision = 'decline' THEN CASE
      WHEN p_status IS DISTINCT FROM 'pending' THEN '22023:illegal_transition'
      WHEN coalesce(p_is_owner, false) THEN '42501:own_request'
      WHEN NOT (coalesce(p_is_approver, false) OR (coalesce(p_is_hod, false) AND coalesce(p_hod_step, 'nudge') <> 'off')) THEN '42501:not_permitted'
      WHEN NOT coalesce(p_has_reason, false) THEN '22023:reason_required'
      ELSE 'ok' END
    ELSE CASE
      WHEN p_status IS NULL OR p_status NOT IN ('pending', 'approved') THEN '22023:illegal_transition'
      WHEN p_status = 'pending' AND coalesce(p_is_owner, false) THEN 'ok'
      WHEN p_status = 'approved' AND coalesce(p_is_owner, false) AND NOT coalesce(p_is_approver, false) THEN '42501:ask_approver'
      WHEN NOT coalesce(p_is_approver, false) THEN '42501:not_permitted'
      WHEN NOT coalesce(p_is_owner, false) AND NOT coalesce(p_has_reason, false) THEN '22023:reason_required'
      ELSE 'ok' END
  END
$$;

-- ---------------------------------------------------------------- guards (every writer; engine-only columns for signed-in writers)

-- frp_rotation_assignments (BEFORE INSERT / UPDATE / DELETE).
-- * Every writer: the person is filled from the login and the login from
--   the person; the period, its vessel and its person belong to one
--   company (23514 planner_period_scope_mismatch); the leave type follows
--   the legacy rotation type when none is given, and the legacy rotation
--   type follows an engine-set leave type; is_sick_on_board follows the
--   type; the version counts updates; the actor columns are stamped
--   (D-230).
-- * A signed-in writer without storm.crew_engine = 'on' (the legacy
--   planner, the D-01 fallback) may create and delete draft bars and move
--   any bar's dates, vessel, lane, person, label, colour and notes; the
--   status, the leave type (it follows the rotation type of a draft), end
--   unknown, the request, the rotation plan and the approval columns are
--   the engine's (42501 planner_engine_only), and only a draft is deleted.
-- * The service role and no-JWT maintenance are exempt from the second
--   part (D-132 style).
CREATE OR REPLACE FUNCTION public.frp_rotation_assignments_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signed boolean := auth.uid() IS NOT NULL;
  v_engine boolean := coalesce(current_setting('storm.crew_engine', true), '') = 'on';
  v_from_rotation boolean := false;
  v_profile_company uuid;
  v_profile_user uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_signed AND NOT v_engine AND OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'planner_engine_only',
        DETAIL = 'A confirmed period is removed in the planner, or by cancelling its leave request.';
    END IF;
    RETURN OLD;
  END IF;

  IF v_signed AND NOT v_engine THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status IS DISTINCT FROM 'draft' OR NEW.end_unknown OR NEW.request_id IS NOT NULL OR NEW.rotation_plan_id IS NOT NULL
         OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'planner_engine_only',
          DETAIL = 'Periods are confirmed through STORM''s planner steps.';
      END IF;
      NEW.leave_type_key := public.planner_leave_type_for_rotation(NEW.rotation_type::text);
      v_from_rotation := true;
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.end_unknown IS DISTINCT FROM OLD.end_unknown
         OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.rotation_plan_id IS DISTINCT FROM OLD.rotation_plan_id
         OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
         OR NEW.leave_type_key IS DISTINCT FROM OLD.leave_type_key THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'planner_engine_only',
          DETAIL = 'Periods are confirmed through STORM''s planner steps.';
      END IF;
      IF NEW.rotation_type IS DISTINCT FROM OLD.rotation_type THEN
        IF OLD.status IS DISTINCT FROM 'draft' THEN
          RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'planner_engine_only',
            DETAIL = 'The type of a confirmed period changes in the planner.';
        END IF;
        NEW.leave_type_key := public.planner_leave_type_for_rotation(NEW.rotation_type::text);
        v_from_rotation := true;
      END IF;
    END IF;
  END IF;

  IF NEW.leave_type_key IS NULL THEN
    NEW.leave_type_key := public.planner_leave_type_for_rotation(NEW.rotation_type::text);
  ELSIF NOT v_from_rotation AND (TG_OP = 'INSERT' OR NEW.leave_type_key IS DISTINCT FROM OLD.leave_type_key) THEN
    NEW.rotation_type := public.planner_rotation_type_for_leave(NEW.leave_type_key);
  END IF;
  NEW.is_sick_on_board := NEW.leave_type_key IS NOT DISTINCT FROM 'sick_on_board';

  IF NEW.profile_id IS NULL AND NEW.crew_user_id IS NOT NULL THEN
    SELECT p.id INTO NEW.profile_id FROM public.profiles AS p WHERE p.user_id = NEW.crew_user_id AND p.company_id = NEW.company_id;
  END IF;
  IF NEW.profile_id IS NOT NULL THEN
    SELECT p.company_id, p.user_id INTO v_profile_company, v_profile_user FROM public.profiles AS p WHERE p.id = NEW.profile_id;
    IF v_profile_company IS DISTINCT FROM NEW.company_id
       OR (NEW.crew_user_id IS NOT NULL AND NEW.crew_user_id IS DISTINCT FROM v_profile_user) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'planner_period_scope_mismatch',
        DETAIL = 'A planner period names a person of its own company.';
    END IF;
    NEW.crew_user_id := coalesce(NEW.crew_user_id, v_profile_user);
  END IF;
  IF NEW.vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'planner_period_scope_mismatch',
      DETAIL = 'A planner period names a vessel of its own company.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.version := coalesce(OLD.version, 1) + 1;
    NEW.updated_at := now();
    NEW.created_by := OLD.created_by;
    NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  ELSE
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
    NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

-- crew_leave_entries (BEFORE INSERT / UPDATE): the period columns are
-- written by the materialiser only (storm.crew_materialise); a signed-in
-- writer's day code is a manual code that owns its day (an insert carries
-- no period; changing a period's day detaches it, so cancelling the period
-- leaves the painted code). The service role and no-JWT maintenance are
-- exempt.
CREATE OR REPLACE FUNCTION public.crew_leave_entries_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('storm.crew_materialise', true) = 'on' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.source_period_id := NULL;
    NEW.replaced_code := NULL;
  ELSIF NEW.status_code IS DISTINCT FROM OLD.status_code
        OR NEW.source_period_id IS DISTINCT FROM OLD.source_period_id
        OR NEW.replaced_code IS DISTINCT FROM OLD.replaced_code THEN
    NEW.source_period_id := NULL;
    NEW.replaced_code := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- crew_leave_requests (BEFORE INSERT / UPDATE / DELETE).
-- * Every writer: the person's profile is filled from the login; the
--   request, its vessel and its person belong to one company (23514
--   leave_request_scope_mismatch).
-- * A signed-in writer without storm.crew_engine = 'on' (the legacy
--   requests page) may raise a pending request and edit it while it is
--   pending; the status and the reviewer, HoD and cancellation columns are
--   the engine's, a decided request is not edited and only a pending one
--   is deleted (42501 leave_request_engine_only).
CREATE OR REPLACE FUNCTION public.crew_leave_requests_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signed boolean := auth.uid() IS NOT NULL;
  v_engine boolean := coalesce(current_setting('storm.crew_engine', true), '') = 'on';
  v_company uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_signed AND NOT v_engine AND OLD.status NOT IN ('draft', 'pending') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'leave_request_engine_only',
        DETAIL = 'A decided leave request is cancelled, not deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.profile_id IS NULL AND NEW.crew_id IS NOT NULL THEN
    SELECT p.id INTO NEW.profile_id FROM public.profiles AS p WHERE p.user_id = NEW.crew_id;
  END IF;
  IF NEW.profile_id IS NOT NULL THEN
    SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.id = NEW.profile_id;
    IF v_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'leave_request_scope_mismatch',
        DETAIL = 'A leave request names a person of its own company.';
    END IF;
  END IF;
  IF NEW.vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'leave_request_scope_mismatch',
      DETAIL = 'A leave request names a vessel of its own company.';
  END IF;

  IF v_signed AND NOT v_engine THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status NOT IN ('draft', 'pending') OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
         OR NEW.hod_reviewed_by IS NOT NULL OR NEW.hod_reviewed_at IS NOT NULL OR NEW.cancellation_reason IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'leave_request_engine_only',
          DETAIL = 'Leave requests are decided through STORM''s approval steps.';
      END IF;
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
         OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.hod_reviewed_by IS DISTINCT FROM OLD.hod_reviewed_by
         OR NEW.hod_reviewed_at IS DISTINCT FROM OLD.hod_reviewed_at OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'leave_request_engine_only',
          DETAIL = 'Leave requests are decided through STORM''s approval steps.';
      END IF;
      IF OLD.status NOT IN ('draft', 'pending')
         AND (NEW.leave_type IS DISTINCT FROM OLD.leave_type OR NEW.start_date IS DISTINCT FROM OLD.start_date
              OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.crew_id IS DISTINCT FROM OLD.crew_id
              OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'leave_request_engine_only',
          DETAIL = 'A decided leave request is not edited; cancel it and ask again.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- crew_leave_request_periods (BEFORE INSERT / UPDATE): a period carries its
-- request's company and never moves to another request.
CREATE OR REPLACE FUNCTION public.crew_leave_request_periods_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'leave_request_period_locked',
      DETAIL = 'A request period stays with its request.';
  END IF;
  SELECT r.company_id INTO v_company FROM public.crew_leave_requests AS r WHERE r.id = NEW.request_id;
  NEW.company_id := coalesce(NEW.company_id, v_company);
  IF NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'leave_request_period_scope_mismatch',
      DETAIL = 'A request period carries its request''s company.';
  END IF;
  RETURN NEW;
END;
$$;

-- crew_leave_settings (BEFORE INSERT / UPDATE): the row carries its vessel's company.
CREATE OR REPLACE FUNCTION public.crew_leave_settings_scope_guard()
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
  IF NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_leave_settings_scope_mismatch',
      DETAIL = 'Leave settings carry their vessel''s company.';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- materialisation (confirmed periods -> day codes)

-- Is the day in a locked leave month (company-wide, or the vessel's)?
CREATE OR REPLACE FUNCTION public.planner_day_locked(p_company_id uuid, p_vessel_id uuid, p_day date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crew_leave_locked_months AS lm
    WHERE lm.company_id = p_company_id
      AND lm.year = extract(year FROM p_day)::integer
      AND lm.month = extract(month FROM p_day)::integer
      AND (lm.vessel_id IS NULL OR lm.vessel_id IS NOT DISTINCT FROM p_vessel_id)
  )
$$;

-- Recompute a person's day codes from the confirmed periods over a range
-- (one row per day in crew_leave_entries): the period with the latest
-- start covering a day governs it; a governed day takes the period's day
-- code (keeping the code it had before as replaced_code); a day owned by a
-- period that no longer governs it gets its replaced code back, or loses
-- its row. Locked months are left as they are. People without a login have
-- no day codes. Internal (the materialise trigger); returns the rows
-- written or released.
CREATE OR REPLACE FUNCTION public.planner_person_materialise(p_profile_id uuid, p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_company uuid;
  v_prev text := current_setting('storm.crew_materialise', true);
  v_released integer := 0;
  v_deleted integer := 0;
  v_written integer := 0;
BEGIN
  IF p_profile_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RETURN 0;
  END IF;
  SELECT p.user_id, p.company_id INTO v_user, v_company FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF v_user IS NULL OR v_company IS NULL THEN
    RETURN 0;
  END IF;
  PERFORM set_config('storm.crew_materialise', 'on', true);

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.planner_gov (day date PRIMARY KEY, period_id uuid, vessel_id uuid, day_code text) ON COMMIT DROP;
  TRUNCATE pg_temp.planner_gov;
  INSERT INTO pg_temp.planner_gov (day, period_id, vessel_id, day_code)
  SELECT DISTINCT ON (g.d) g.d::date, a.id, a.vessel_id, lt.day_code
  FROM generate_series(p_from, p_to, interval '1 day') AS g(d)
  JOIN public.frp_rotation_assignments AS a
    ON a.profile_id = p_profile_id
   AND a.status IN ('confirmed', 'complete')
   AND g.d::date BETWEEN a.start_date AND a.end_date
  JOIN public.leave_types AS lt ON lt.key = a.leave_type_key
  ORDER BY g.d, a.start_date DESC, a.id;

  -- Release the days a period owns but no longer governs (restore the code it replaced).
  UPDATE public.crew_leave_entries AS e
  SET status_code = e.replaced_code, source_period_id = NULL, replaced_code = NULL
  WHERE e.crew_id = v_user AND e.date BETWEEN p_from AND p_to
    AND e.source_period_id IS NOT NULL AND e.replaced_code IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_temp.planner_gov AS g WHERE g.day = e.date AND g.period_id = e.source_period_id)
    AND NOT public.planner_day_locked(v_company, e.vessel_id, e.date);
  GET DIAGNOSTICS v_released = ROW_COUNT;
  DELETE FROM public.crew_leave_entries AS e
  WHERE e.crew_id = v_user AND e.date BETWEEN p_from AND p_to
    AND e.source_period_id IS NOT NULL AND e.replaced_code IS NULL
    AND NOT EXISTS (SELECT 1 FROM pg_temp.planner_gov AS g WHERE g.day = e.date AND g.period_id = e.source_period_id)
    AND NOT public.planner_day_locked(v_company, e.vessel_id, e.date);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Write the governed days.
  INSERT INTO public.crew_leave_entries AS e (crew_id, date, status_code, company_id, vessel_id, source_period_id, replaced_code)
  SELECT v_user, g.day, g.day_code, v_company, g.vessel_id, g.period_id, NULL
  FROM pg_temp.planner_gov AS g
  WHERE NOT public.planner_day_locked(v_company, g.vessel_id, g.day)
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_leave_entries AS x
      WHERE x.crew_id = v_user AND x.date = g.day AND public.planner_day_locked(v_company, x.vessel_id, x.date)
    )
  ON CONFLICT (crew_id, date) DO UPDATE SET
    status_code = EXCLUDED.status_code,
    company_id = EXCLUDED.company_id,
    vessel_id = EXCLUDED.vessel_id,
    replaced_code = CASE WHEN e.source_period_id IS NULL THEN e.status_code ELSE e.replaced_code END,
    source_period_id = EXCLUDED.source_period_id
  WHERE e.source_period_id IS DISTINCT FROM EXCLUDED.source_period_id
     OR e.status_code IS DISTINCT FROM EXCLUDED.status_code
     OR e.vessel_id IS DISTINCT FROM EXCLUDED.vessel_id;
  GET DIAGNOSTICS v_written = ROW_COUNT;

  PERFORM set_config('storm.crew_materialise', coalesce(v_prev, ''), true);
  RETURN v_released + v_deleted + v_written;
END;
$$;

-- AFTER INSERT / UPDATE / DELETE on frp_rotation_assignments: recompute the
-- day codes of the person (and of the earlier person, when a period moved
-- to someone else) over the days the period covered and covers, when a
-- confirmed period is involved. SECURITY DEFINER: the day codes are the
-- engine's, whoever changed the period (the planner editor, the approver,
-- the daily sweep).
CREATE OR REPLACE FUNCTION public.frp_periods_materialise()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_on boolean := TG_OP <> 'INSERT' AND OLD.status IN ('confirmed', 'complete') AND OLD.profile_id IS NOT NULL;
  v_new_on boolean := TG_OP <> 'DELETE' AND NEW.status IN ('confirmed', 'complete') AND NEW.profile_id IS NOT NULL;
BEGIN
  IF NOT v_old_on AND NOT v_new_on THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND v_old_on AND v_new_on
     AND NEW.profile_id = OLD.profile_id AND NEW.status = OLD.status
     AND NEW.leave_type_key IS NOT DISTINCT FROM OLD.leave_type_key
     AND NEW.start_date = OLD.start_date AND NEW.end_date = OLD.end_date
     AND NEW.vessel_id IS NOT DISTINCT FROM OLD.vessel_id THEN
    RETURN NULL;
  END IF;
  IF v_old_on AND v_new_on AND NEW.profile_id = OLD.profile_id THEN
    PERFORM public.planner_person_materialise(NEW.profile_id, least(OLD.start_date, NEW.start_date), greatest(OLD.end_date, NEW.end_date));
    RETURN NULL;
  END IF;
  IF v_old_on THEN
    PERFORM public.planner_person_materialise(OLD.profile_id, OLD.start_date, OLD.end_date);
  END IF;
  IF v_new_on THEN
    PERFORM public.planner_person_materialise(NEW.profile_id, NEW.start_date, NEW.end_date);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS frp_rotation_assignments_status_guard ON public.frp_rotation_assignments;
CREATE TRIGGER frp_rotation_assignments_status_guard BEFORE INSERT OR UPDATE OR DELETE ON public.frp_rotation_assignments
  FOR EACH ROW EXECUTE FUNCTION public.frp_rotation_assignments_status_guard();
DROP TRIGGER IF EXISTS frp_periods_materialise ON public.frp_rotation_assignments;
CREATE TRIGGER frp_periods_materialise AFTER INSERT OR UPDATE OR DELETE ON public.frp_rotation_assignments
  FOR EACH ROW EXECUTE FUNCTION public.frp_periods_materialise();
DROP TRIGGER IF EXISTS crew_leave_entries_source_guard ON public.crew_leave_entries;
CREATE TRIGGER crew_leave_entries_source_guard BEFORE INSERT OR UPDATE ON public.crew_leave_entries
  FOR EACH ROW EXECUTE FUNCTION public.crew_leave_entries_source_guard();
DROP TRIGGER IF EXISTS crew_leave_requests_status_guard ON public.crew_leave_requests;
CREATE TRIGGER crew_leave_requests_status_guard BEFORE INSERT OR UPDATE OR DELETE ON public.crew_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.crew_leave_requests_status_guard();
DROP TRIGGER IF EXISTS crew_leave_request_periods_scope_guard ON public.crew_leave_request_periods;
CREATE TRIGGER crew_leave_request_periods_scope_guard BEFORE INSERT OR UPDATE ON public.crew_leave_request_periods
  FOR EACH ROW EXECUTE FUNCTION public.crew_leave_request_periods_scope_guard();
DROP TRIGGER IF EXISTS crew_leave_settings_scope_guard ON public.crew_leave_settings;
CREATE TRIGGER crew_leave_settings_scope_guard BEFORE INSERT OR UPDATE ON public.crew_leave_settings
  FOR EACH ROW EXECUTE FUNCTION public.crew_leave_settings_scope_guard();
DROP TRIGGER IF EXISTS update_leave_types_updated_at ON public.leave_types;
CREATE TRIGGER update_leave_types_updated_at BEFORE UPDATE ON public.leave_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_crew_leave_request_periods_updated_at ON public.crew_leave_request_periods;
CREATE TRIGGER update_crew_leave_request_periods_updated_at BEFORE UPDATE ON public.crew_leave_request_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_crew_leave_settings_updated_at ON public.crew_leave_settings;
CREATE TRIGGER update_crew_leave_settings_updated_at BEFORE UPDATE ON public.crew_leave_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- internal helpers of the planner definers

-- The planner RPC gate: a signed-in caller, a known vessel (P0002), the key
-- on it (42501 with the sentence) and no external viewer. Returns the
-- vessel's company.
CREATE OR REPLACE FUNCTION public.planner_gate(p_key text, p_vessel_id uuid, p_detail text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  v_company := public.crew_vessel_gate(p_key, p_vessel_id, p_detail);
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = p_detail;
  END IF;
  RETURN v_company;
END;
$$;

-- The person a planner write names: a profile of the vessel's company
-- (P0002 person_not_found for an unknown or another company's person, so
-- no id leaks). Returns their login (NULL without one).
CREATE OR REPLACE FUNCTION public.planner_person_company(p_profile_id uuid, p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT p.user_id INTO v_user FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'person_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  RETURN v_user;
END;
$$;

-- Is the user the head of the person's department on the vessel (the
-- caller's crew list entry there is of the HoD tier and in the person's
-- department)? Internal.
CREATE OR REPLACE FUNCTION public.planner_is_department_hod(p_user_id uuid, p_profile_id uuid, p_vessel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_tier text;
  v_department text;
  v_subject_department text;
BEGIN
  IF p_user_id IS NULL OR p_profile_id IS NULL OR p_vessel_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = p_user_id;
  IF v_me IS NULL OR v_me = p_profile_id THEN
    RETURN false;
  END IF;
  SELECT r.rank_tier, r.department_key INTO v_tier, v_department FROM public.crew_member_role_on(v_me, p_vessel_id) AS r;
  IF v_tier IS DISTINCT FROM 'hod' OR v_department IS NULL THEN
    RETURN false;
  END IF;
  SELECT r.department_key INTO v_subject_department FROM public.crew_member_role_on(p_profile_id, p_vessel_id) AS r;
  RETURN v_subject_department IS NOT NULL AND v_subject_department = v_department;
END;
$$;

-- The periods of a leave request or Add leave (a jsonb array of 1 to 10
-- objects {leave_type_key, start_date, end_date?, end_unknown?}), checked
-- and in order: an active leave type (22023 leave_type_unknown), a start,
-- an end on or after it or end unknown and no end (22023 period_invalid /
-- period_dates_invalid), every date within two years of today (22023
-- period_out_of_range) and no two periods overlapping (22023
-- periods_overlap); HINT names the period (1-based). Internal; mirrored by
-- validatePeriodsInput in lib/periods.ts.
CREATE OR REPLACE FUNCTION public.planner_periods_parse(p_periods jsonb)
RETURNS TABLE (ord integer, leave_type_key text, start_date date, end_date date, end_unknown boolean)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_item jsonb;
  v_n integer;
  v_i integer := 0;
  v_key text;
  v_start date;
  v_end date;
  v_open boolean;
  v_starts date[] := ARRAY[]::date[];
  v_ends date[] := ARRAY[]::date[];
  v_j integer;
BEGIN
  IF p_periods IS NULL OR jsonb_typeof(p_periods) <> 'array' OR jsonb_array_length(p_periods) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'periods_required', DETAIL = 'Add at least one period.';
  END IF;
  v_n := jsonb_array_length(p_periods);
  IF v_n > 10 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'periods_too_many', DETAIL = 'A request holds at most 10 periods.';
  END IF;
  FOR v_item IN SELECT e FROM jsonb_array_elements(p_periods) AS e LOOP
    v_i := v_i + 1;
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_invalid', HINT = v_i::text;
    END IF;
    v_key := v_item ->> 'leave_type_key';
    IF v_key IS NULL OR NOT EXISTS (SELECT 1 FROM public.leave_types AS lt WHERE lt.key = v_key AND lt.is_active) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'leave_type_unknown', DETAIL = 'Choose a leave type.', HINT = v_i::text;
    END IF;
    v_open := coalesce((v_item ->> 'end_unknown')::boolean, false);
    BEGIN
      v_start := (v_item ->> 'start_date')::date;
      v_end := (v_item ->> 'end_date')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_invalid', DETAIL = 'A date is not valid.', HINT = v_i::text;
    END;
    IF v_start IS NULL OR (v_open AND v_end IS NOT NULL) OR (NOT v_open AND v_end IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_invalid', DETAIL = 'Give a start and an end, or tick End unknown.', HINT = v_i::text;
    END IF;
    IF v_end IS NOT NULL AND v_end < v_start THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_dates_invalid', DETAIL = 'The end is before the start.', HINT = v_i::text;
    END IF;
    IF v_start < current_date - 731 OR v_start > current_date + 731 OR (v_end IS NOT NULL AND v_end > current_date + 731) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_out_of_range', DETAIL = 'Periods fall within two years of today.', HINT = v_i::text;
    END IF;
    FOR v_j IN 1 .. coalesce(array_length(v_starts, 1), 0) LOOP
      IF public.planner_periods_overlap(v_starts[v_j], v_ends[v_j], v_start, v_end) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'periods_overlap', DETAIL = format('Periods %s and %s overlap.', v_j, v_i), HINT = v_i::text;
      END IF;
    END LOOP;
    v_starts := v_starts || v_start;
    v_ends := v_ends || v_end;
    ord := v_i;
    leave_type_key := v_key;
    start_date := v_start;
    end_date := v_end;
    end_unknown := v_open;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Move the written horizon of the person's end-unknown periods
-- (planner_open_horizon): never past the day before their next period.
-- Each changed row re-materialises through the trigger. Internal (the
-- planner definers after a write; the daily sweep). Returns the rows moved.
CREATE OR REPLACE FUNCTION public.planner_reflow_open(p_profile_id uuid, p_today date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.frp_rotation_assignments AS a
  SET end_date = x.horizon
  FROM (
    SELECT o.id,
           public.planner_open_horizon(o.start_date,
             (SELECT min(b.start_date) FROM public.frp_rotation_assignments AS b
              WHERE b.profile_id = o.profile_id AND b.id <> o.id AND b.status IN ('confirmed', 'complete')
                AND b.leave_type_key IS NOT NULL AND b.start_date > o.start_date),
             coalesce(p_today, current_date)) AS horizon
    FROM public.frp_rotation_assignments AS o
    WHERE o.end_unknown AND o.status IN ('confirmed', 'complete')
      AND (p_profile_id IS NULL OR o.profile_id = p_profile_id)
      AND o.profile_id IS NOT NULL
  ) AS x
  WHERE a.id = x.id AND a.end_date IS DISTINCT FROM x.horizon;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Write one confirmed period (insert, or update p_id) for the person on the
-- vessel, after the overlap rules: an overlapping confirmed period of the
-- person (any vessel) refuses the write (22023 period_overlap, DETAIL
-- naming it, HINT its id) unless p_replace and it is rotation leave, which
-- is trimmed, split or removed around the new period (planReplace in
-- lib/periods.ts). Then the person's end-unknown periods are reflowed and
-- the change is logged in frp_planner_audit_log. Internal; the caller has
-- gated, checked the person and the dates, and set storm.crew_engine.
CREATE OR REPLACE FUNCTION public.planner_period_write(
  p_vessel_id uuid,
  p_company_id uuid,
  p_profile_id uuid,
  p_id uuid,
  p_leave_type_key text,
  p_start date,
  p_end date,
  p_end_unknown boolean,
  p_notes text,
  p_replace boolean,
  p_request_id uuid,
  p_approved boolean,
  p_actor uuid
)
RETURNS public.frp_rotation_assignments
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_open boolean := coalesce(p_end_unknown, false);
  v_end date := CASE WHEN coalesce(p_end_unknown, false) THEN NULL ELSE p_end END;
  v_label text;
  v_user uuid;
  v_next date;
  v_store_end date;
  v_old public.frp_rotation_assignments;
  v_row public.frp_rotation_assignments;
  r public.frp_rotation_assignments;
  v_other_label text;
BEGIN
  PERFORM set_config('storm.crew_engine', 'on', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('storm.planner.' || p_profile_id::text, 0));
  SELECT lt.label INTO v_label FROM public.leave_types AS lt WHERE lt.key = p_leave_type_key;
  SELECT p.user_id INTO v_user FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.frp_rotation_assignments AS a WHERE a.id = p_id FOR UPDATE;
  END IF;

  FOR r IN
    SELECT a.* FROM public.frp_rotation_assignments AS a
    WHERE a.profile_id = p_profile_id AND a.status IN ('confirmed', 'complete') AND a.leave_type_key IS NOT NULL
      AND a.id IS DISTINCT FROM p_id
    ORDER BY a.start_date, a.id
    FOR UPDATE
  LOOP
    CONTINUE WHEN NOT public.planner_periods_overlap(r.start_date, CASE WHEN r.end_unknown THEN NULL ELSE r.end_date END, p_start, v_end);
    IF NOT coalesce(p_replace, false) OR r.leave_type_key IS DISTINCT FROM 'rotation' THEN
      SELECT lt.label INTO v_other_label FROM public.leave_types AS lt WHERE lt.key = r.leave_type_key;
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_overlap',
        DETAIL = format('It overlaps %s from %s%s.', coalesce(lower(v_other_label), 'another period'), to_char(r.start_date, 'FMDD Mon YYYY'),
                        CASE WHEN r.end_unknown THEN ' (end unknown)' ELSE ' to ' || to_char(r.end_date, 'FMDD Mon YYYY') END),
        HINT = r.id::text;
    END IF;
    -- Replace rotation leave around the new period.
    IF r.start_date < p_start THEN
      IF NOT r.end_unknown AND NOT v_open AND r.end_date > v_end THEN
        INSERT INTO public.frp_rotation_assignments (company_id, vessel_id, profile_id, crew_user_id, start_date, end_date, end_unknown,
                                                     leave_type_key, status, label, notes, rotation_plan_id, approved_by, approved_at)
        VALUES (r.company_id, r.vessel_id, r.profile_id, r.crew_user_id, v_end + 1, r.end_date, false,
                r.leave_type_key, r.status, r.label, r.notes, r.rotation_plan_id, r.approved_by, r.approved_at);
      END IF;
      UPDATE public.frp_rotation_assignments SET end_date = p_start - 1, end_unknown = false WHERE id = r.id;
    ELSIF v_open THEN
      DELETE FROM public.frp_rotation_assignments WHERE id = r.id;
    ELSIF r.end_unknown THEN
      UPDATE public.frp_rotation_assignments SET start_date = v_end + 1, end_date = greatest(r.end_date, v_end + 1) WHERE id = r.id;
    ELSIF r.end_date <= v_end THEN
      DELETE FROM public.frp_rotation_assignments WHERE id = r.id;
    ELSE
      UPDATE public.frp_rotation_assignments SET start_date = v_end + 1 WHERE id = r.id;
    END IF;
  END LOOP;

  IF v_open THEN
    SELECT min(b.start_date) INTO v_next FROM public.frp_rotation_assignments AS b
    WHERE b.profile_id = p_profile_id AND b.id IS DISTINCT FROM p_id AND b.status IN ('confirmed', 'complete')
      AND b.leave_type_key IS NOT NULL AND b.start_date > p_start;
    v_store_end := public.planner_open_horizon(p_start, v_next, current_date);
  ELSE
    v_store_end := v_end;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.frp_rotation_assignments (company_id, vessel_id, profile_id, crew_user_id, start_date, end_date, end_unknown,
                                                 leave_type_key, status, label, notes, request_id, approved_by, approved_at)
    VALUES (p_company_id, p_vessel_id, p_profile_id, v_user, p_start, v_store_end, v_open,
            p_leave_type_key, 'confirmed', v_label, p_notes, p_request_id,
            CASE WHEN p_approved THEN p_actor END, CASE WHEN p_approved THEN now() END)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.frp_rotation_assignments AS a
    SET vessel_id = p_vessel_id, profile_id = p_profile_id, crew_user_id = v_user, crew_name_raw = NULL,
        start_date = p_start, end_date = v_store_end, end_unknown = v_open,
        leave_type_key = p_leave_type_key, status = 'confirmed', label = v_label, notes = p_notes,
        request_id = coalesce(p_request_id, a.request_id),
        approved_by = CASE WHEN p_approved THEN p_actor ELSE a.approved_by END,
        approved_at = CASE WHEN p_approved THEN now() ELSE a.approved_at END
    WHERE a.id = p_id
    RETURNING * INTO v_row;
  END IF;

  PERFORM public.planner_reflow_open(p_profile_id, current_date);
  IF v_old.profile_id IS NOT NULL AND v_old.profile_id IS DISTINCT FROM p_profile_id THEN
    PERFORM public.planner_reflow_open(v_old.profile_id, current_date);
  END IF;
  SELECT * INTO v_row FROM public.frp_rotation_assignments AS a WHERE a.id = v_row.id;

  INSERT INTO public.frp_planner_audit_log (company_id, entity_type, entity_id, action, old_value, new_value, changed_by)
  VALUES (p_company_id, 'planner_period', v_row.id, CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,
          CASE WHEN p_id IS NULL THEN NULL ELSE jsonb_build_object('profile_id', v_old.profile_id, 'vessel_id', v_old.vessel_id,
            'leave_type_key', v_old.leave_type_key, 'start_date', v_old.start_date, 'end_date', v_old.end_date,
            'end_unknown', v_old.end_unknown, 'status', v_old.status) END,
          jsonb_build_object('profile_id', v_row.profile_id, 'vessel_id', v_row.vessel_id, 'leave_type_key', v_row.leave_type_key,
            'start_date', v_row.start_date, 'end_date', v_row.end_date, 'end_unknown', v_row.end_unknown,
            'request_id', v_row.request_id, 'approved', coalesce(p_approved, false), 'replace', coalesce(p_replace, false)),
          p_actor);
  RETURN v_row;
END;
$$;

-- A leave request with its periods (pending, or approved by the actor),
-- for a person with a login. Internal (crew_leave_request_submit,
-- planner_add_leave); the caller has gated, checked and parsed. Returns
-- the request id.
CREATE OR REPLACE FUNCTION public.planner_request_create(
  p_company_id uuid,
  p_vessel_id uuid,
  p_profile_id uuid,
  p_user_id uuid,
  p_periods jsonb,
  p_note text,
  p_approved_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_code text;
  v_from date;
  v_to date;
BEGIN
  PERFORM set_config('storm.crew_engine', 'on', true);
  SELECT lt.day_code INTO v_code
  FROM public.planner_periods_parse(p_periods) AS pp JOIN public.leave_types AS lt ON lt.key = pp.leave_type_key
  ORDER BY pp.ord LIMIT 1;
  SELECT min(pp.start_date), max(coalesce(pp.end_date, pp.start_date)) INTO v_from, v_to FROM public.planner_periods_parse(p_periods) AS pp;
  INSERT INTO public.crew_leave_requests (crew_id, profile_id, leave_type, start_date, end_date, notes, status, company_id, vessel_id,
                                          submitted_at, reviewed_at, reviewed_by)
  VALUES (p_user_id, p_profile_id, v_code, v_from, v_to, p_note,
          CASE WHEN p_approved_by IS NULL THEN 'pending' ELSE 'approved' END,
          p_company_id, p_vessel_id, now(),
          CASE WHEN p_approved_by IS NULL THEN NULL ELSE now() END, p_approved_by)
  RETURNING id INTO v_id;
  INSERT INTO public.crew_leave_request_periods (company_id, request_id, leave_type_key, start_date, end_date, end_unknown, sort_order)
  SELECT p_company_id, v_id, pp.leave_type_key, pp.start_date, pp.end_date, pp.end_unknown, pp.ord - 1
  FROM public.planner_periods_parse(p_periods) AS pp;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- RPCs: the planner's periods

-- Create or change a confirmed planner period (gap/04 C47, W7): the
-- timeline's bars, the manning grid's painting. Gate:
-- vessel.crew.crew_scheduling.edit on the vessel; a leave type that needs
-- approval (personal leave) also needs hris.leave_rotation.leave_requests.
-- approve there (42501 leave_approval_required; D-X1-10). The person is of
-- the vessel's company (P0002); a changed period is on this vessel (P0002
-- period_not_found), not from a leave request (22023 period_from_request:
-- change the request), and unchanged since the caller read it when
-- p_expected_version is given (22023 period_changed). Dates: a start, an end
-- on or after it or end unknown (22023 period_invalid / period_dates_invalid),
-- within two years of today (22023 period_out_of_range); notes up to 2000
-- characters (22023 notes_too_long). Overlaps: 22023 period_overlap unless
-- p_replace, which only replaces rotation leave. Returns the row.
CREATE OR REPLACE FUNCTION public.planner_period_upsert(
  p_vessel_id uuid,
  p_id uuid,
  p_profile_id uuid,
  p_leave_type_key text,
  p_start date,
  p_end date,
  p_end_unknown boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_replace boolean DEFAULT false,
  p_expected_version integer DEFAULT NULL
)
RETURNS public.frp_rotation_assignments
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_type public.leave_types;
  v_old public.frp_rotation_assignments;
  v_old_needs boolean := false;
  v_open boolean := coalesce(p_end_unknown, false);
BEGIN
  v_company := public.planner_gate('vessel.crew.crew_scheduling.edit', p_vessel_id, 'You don''t have permission to change this vessel''s planner.');
  SELECT * INTO v_type FROM public.leave_types AS lt WHERE lt.key = p_leave_type_key AND lt.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'leave_type_unknown', DETAIL = 'Choose a leave type.';
  END IF;
  PERFORM public.planner_person_company(p_profile_id, v_company);
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.frp_rotation_assignments AS a WHERE a.id = p_id AND a.company_id = v_company FOR UPDATE;
    IF NOT FOUND OR v_old.vessel_id IS DISTINCT FROM p_vessel_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'period_not_found', DETAIL = 'This period could not be found on this vessel.';
    END IF;
    IF v_old.request_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_from_request',
        DETAIL = 'This period comes from an approved leave request: cancel or change the request instead.';
    END IF;
    IF p_expected_version IS NOT NULL AND v_old.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_changed',
        DETAIL = 'Someone changed this period after you opened it. Reload and try again.';
    END IF;
    SELECT coalesce(lt.needs_approval, false) INTO v_old_needs FROM public.leave_types AS lt WHERE lt.key = v_old.leave_type_key;
  END IF;
  IF (v_type.needs_approval OR coalesce(v_old_needs, false))
     AND NOT public.crew_vessel_cap('hris.leave_rotation.leave_requests.approve', p_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'leave_approval_required',
      DETAIL = 'Leave of this type needs an approver: add it with Add leave.';
  END IF;
  IF p_start IS NULL OR (v_open AND p_end IS NOT NULL) OR (NOT v_open AND p_end IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_invalid', DETAIL = 'Give a start and an end, or tick End unknown.';
  END IF;
  IF p_end IS NOT NULL AND p_end < p_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_dates_invalid', DETAIL = 'The end is before the start.';
  END IF;
  IF p_start < current_date - 731 OR p_start > current_date + 731 OR (p_end IS NOT NULL AND p_end > current_date + 731) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_out_of_range', DETAIL = 'Periods fall within two years of today.';
  END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notes_too_long', DETAIL = 'Notes hold up to 2,000 characters.';
  END IF;
  RETURN public.planner_period_write(p_vessel_id, v_company, p_profile_id, p_id, p_leave_type_key, p_start, p_end, v_open,
                                     nullif(btrim(coalesce(p_notes, '')), ''), p_replace, NULL, v_type.needs_approval, v_uid);
END;
$$;

-- Remove a confirmed (or draft) planner period of the vessel: the gate of
-- planner_period_upsert (personal leave also needs leave approval); a
-- period from a leave request is removed by cancelling the request (22023
-- period_from_request). Its day codes are reversed by the trigger and the
-- person's end-unknown periods reflowed. Returns the id.
CREATE OR REPLACE FUNCTION public.planner_period_delete(p_vessel_id uuid, p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_old public.frp_rotation_assignments;
  v_needs boolean := false;
BEGIN
  v_company := public.planner_gate('vessel.crew.crew_scheduling.edit', p_vessel_id, 'You don''t have permission to change this vessel''s planner.');
  SELECT * INTO v_old FROM public.frp_rotation_assignments AS a WHERE a.id = p_id AND a.company_id = v_company FOR UPDATE;
  IF NOT FOUND OR v_old.vessel_id IS DISTINCT FROM p_vessel_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'period_not_found', DETAIL = 'This period could not be found on this vessel.';
  END IF;
  IF v_old.request_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_from_request',
      DETAIL = 'This period comes from an approved leave request: cancel the request instead.';
  END IF;
  SELECT coalesce(lt.needs_approval, false) INTO v_needs FROM public.leave_types AS lt WHERE lt.key = v_old.leave_type_key;
  IF coalesce(v_needs, false) AND NOT public.crew_vessel_cap('hris.leave_rotation.leave_requests.approve', p_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'leave_approval_required',
      DETAIL = 'Leave of this type is removed by an approver.';
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  IF v_old.profile_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('storm.planner.' || v_old.profile_id::text, 0));
  END IF;
  DELETE FROM public.frp_rotation_assignments WHERE id = p_id;
  IF v_old.profile_id IS NOT NULL THEN
    PERFORM public.planner_reflow_open(v_old.profile_id, current_date);
  END IF;
  INSERT INTO public.frp_planner_audit_log (company_id, entity_type, entity_id, action, old_value, new_value, changed_by)
  VALUES (v_company, 'planner_period', p_id, 'delete',
          jsonb_build_object('profile_id', v_old.profile_id, 'vessel_id', v_old.vessel_id, 'leave_type_key', v_old.leave_type_key,
            'start_date', v_old.start_date, 'end_date', v_old.end_date, 'end_unknown', v_old.end_unknown, 'status', v_old.status),
          NULL, v_uid);
  RETURN p_id;
END;
$$;

-- ---------------------------------------------------------------- RPCs: leave

-- Add leave from the planner (gap/04 C50, T-71, D-X1-10): one or more
-- periods for a crew member of the vessel's company. Gate:
-- vessel.crew.crew_scheduling.edit or hris.leave_rotation.leave_requests.
-- approve on the vessel (42501), no external viewer. A leave approver's
-- entry for someone else is saved Approved with the approver recorded: a
-- request (when the person has a login) and its confirmed periods
-- (p_replace replaces rotation leave, as planner_period_upsert). Anyone
-- else's entry, and an approver's own, is a pending request; a pending
-- request needs a login (22023 request_needs_login). The periods follow
-- planner_periods_parse; the note is up to 2000 characters. Returns the
-- request (NULL for approved leave of a person without a login), its
-- status and the period ids.
CREATE OR REPLACE FUNCTION public.planner_add_leave(
  p_vessel_id uuid,
  p_profile_id uuid,
  p_periods jsonb,
  p_note text DEFAULT NULL,
  p_replace boolean DEFAULT false
)
RETURNS TABLE (request_id uuid, status text, period_ids uuid[])
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_user uuid;
  v_approver boolean;
  v_planner boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_request uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_row public.frp_rotation_assignments;
  pp record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  v_approver := public.crew_vessel_cap('hris.leave_rotation.leave_requests.approve', p_vessel_id);
  v_planner := public.crew_vessel_cap('vessel.crew.crew_scheduling.edit', p_vessel_id);
  IF NOT (v_approver OR v_planner) OR public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You don''t have permission to add leave on this vessel.';
  END IF;
  v_user := public.planner_person_company(p_profile_id, v_company);
  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notes_too_long', DETAIL = 'Notes hold up to 2,000 characters.';
  END IF;
  PERFORM 1 FROM public.planner_periods_parse(p_periods);
  PERFORM set_config('storm.crew_engine', 'on', true);

  IF v_approver AND v_user IS DISTINCT FROM v_uid THEN
    IF v_user IS NOT NULL THEN
      v_request := public.planner_request_create(v_company, p_vessel_id, p_profile_id, v_user, p_periods, v_note, v_uid);
    END IF;
    FOR pp IN SELECT * FROM public.planner_periods_parse(p_periods) ORDER BY ord LOOP
      v_row := public.planner_period_write(p_vessel_id, v_company, p_profile_id, NULL, pp.leave_type_key, pp.start_date, pp.end_date,
                                           pp.end_unknown, v_note, p_replace, v_request, true, v_uid);
      v_ids := v_ids || v_row.id;
    END LOOP;
    request_id := v_request;
    status := 'approved';
    period_ids := v_ids;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'request_needs_login',
      DETAIL = 'Leave for a crew member without a sign-in is added by a leave approver.';
  END IF;
  v_request := public.planner_request_create(v_company, p_vessel_id, p_profile_id, v_user, p_periods, v_note, NULL);
  request_id := v_request;
  status := 'pending';
  period_ids := ARRAY[]::uuid[];
  RETURN NEXT;
END;
$$;

-- A crew member's own leave request (gap/04 C50, W7 crew self-service):
-- the caller (signed in, active, of the vessel's company, no external
-- viewer) is on the vessel's crew through an assignment, joined or planned
-- (42501 not_on_vessel_crew otherwise); one or more periods of leave types
-- that are leave (22023 leave_type_not_requestable, HINT the period), as
-- planner_periods_parse; a note up to 2000 characters. Saved pending.
-- Returns the request row.
CREATE OR REPLACE FUNCTION public.crew_leave_request_submit(p_vessel_id uuid, p_periods jsonb, p_note text DEFAULT NULL)
RETURNS public.crew_leave_requests
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_profile uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_bad integer;
  v_id uuid;
  v_row public.crew_leave_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  IF public.get_user_company_id(v_uid) IS DISTINCT FROM v_company OR public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can request leave on a vessel you are assigned to.';
  END IF;
  SELECT p.id INTO v_profile FROM public.profiles AS p WHERE p.user_id = v_uid AND p.company_id = v_company;
  IF v_profile IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.crew_vessel_members(p_vessel_id, current_date) AS m
       WHERE m.profile_id = v_profile AND m.placement_kind IN ('assignment', 'planned')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_on_vessel_crew', DETAIL = 'You can request leave on a vessel you are assigned to.';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notes_too_long', DETAIL = 'Notes hold up to 2,000 characters.';
  END IF;
  SELECT pp.ord INTO v_bad
  FROM public.planner_periods_parse(p_periods) AS pp JOIN public.leave_types AS lt ON lt.key = pp.leave_type_key
  WHERE NOT lt.is_leave ORDER BY pp.ord LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'leave_type_not_requestable', DETAIL = 'Choose a type of leave for each period.', HINT = v_bad::text;
  END IF;
  v_id := public.planner_request_create(v_company, p_vessel_id, v_profile, v_uid, p_periods, v_note, NULL);
  SELECT * INTO v_row FROM public.crew_leave_requests AS r WHERE r.id = v_id;
  RETURN v_row;
END;
$$;

-- Decide a leave request (gap/04 C52, W7): hod_review, approve, decline or
-- cancel, by planner_leave_decide_check (refusals 22023 / 42501 with the
-- sentence). P0002 for an unknown request or one of another company;
-- 22023 request_vessel_unknown for a legacy request without a vessel. The
-- caller is a leave approver when they hold hris.leave_rotation.
-- leave_requests.approve on the request's vessel (reach included) and are
-- no external viewer; the HoD is the head of the requester's department on
-- it. Approval creates the request's periods as confirmed periods tagged
-- with it (one period from the request row for a legacy request), after
-- the overlap rules (p_replace replaces rotation leave); cancelling an
-- approved request removes them (their day codes reversed). Stamps the
-- reviewer, the HoD review or the reason. Returns the request row.
CREATE OR REPLACE FUNCTION public.crew_leave_request_decide(
  p_request_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL,
  p_replace boolean DEFAULT false
)
RETURNS public.crew_leave_requests
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.crew_leave_requests;
  v_company uuid;
  v_profile uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_owner boolean;
  v_approver boolean := false;
  v_hod boolean := false;
  v_master_fleet boolean := false;
  v_step text := 'nudge';
  v_check text;
  v_type text;
  v_row public.frp_rotation_assignments;
  v_removed integer := 0;
  pp record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  SELECT * INTO v_req FROM public.crew_leave_requests AS r WHERE r.id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_company IS NULL OR v_req.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'request_not_found', DETAIL = 'This leave request could not be found.';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long', DETAIL = 'A reason holds up to 2,000 characters.';
  END IF;
  v_owner := v_req.crew_id = v_uid;
  v_profile := coalesce(v_req.profile_id, (SELECT p.id FROM public.profiles AS p WHERE p.user_id = v_req.crew_id));
  IF v_req.vessel_id IS NULL THEN
    IF NOT (v_owner AND p_decision = 'cancel' AND v_req.status = 'pending') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'request_vessel_unknown',
        DETAIL = 'This request names no vessel; ask the crew member to request again from their vessel.';
    END IF;
  ELSE
    v_approver := public.crew_vessel_cap('hris.leave_rotation.leave_requests.approve', v_req.vessel_id) AND NOT public.crew_caller_is_external();
    v_hod := public.planner_is_department_hod(v_uid, v_profile, v_req.vessel_id) AND NOT public.crew_caller_is_external();
    v_master_fleet := coalesce(public.record_is_master(v_uid, v_req.vessel_id), false) OR coalesce(public.fleet_reach_for(v_uid, v_company), false);
    SELECT s.hod_step INTO v_step FROM public.crew_leave_settings AS s WHERE s.vessel_id = v_req.vessel_id;
    v_step := coalesce(v_step, 'nudge');
  END IF;

  v_check := public.planner_leave_decide_check(p_decision, v_req.status, v_owner, v_approver, v_hod, v_master_fleet, v_step,
                                               v_req.hod_reviewed_at IS NOT NULL, v_reason IS NOT NULL);
  IF v_check <> 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = split_part(v_check, ':', 1), MESSAGE = split_part(v_check, ':', 2),
      DETAIL = CASE split_part(v_check, ':', 2)
        WHEN 'decision_invalid' THEN 'Choose approve, decline or cancel.'
        WHEN 'illegal_transition' THEN 'This request has already been decided.'
        WHEN 'hod_step_off' THEN 'This vessel has no head-of-department review for leave.'
        WHEN 'own_request' THEN 'You can''t decide your own leave request.'
        WHEN 'not_department_hod' THEN 'Only the head of the crew member''s department reviews this request first.'
        WHEN 'already_reviewed' THEN 'The head of department has already reviewed this request.'
        WHEN 'not_permitted' THEN 'You don''t have permission to decide leave on this vessel.'
        WHEN 'hod_review_pending' THEN 'The head of the crew member''s department reviews this request first.'
        WHEN 'reason_required' THEN 'Give a reason.'
        WHEN 'ask_approver' THEN 'Approved leave is cancelled by a leave approver.'
      END;
  END IF;

  PERFORM set_config('storm.crew_engine', 'on', true);
  IF p_decision = 'hod_review' THEN
    UPDATE public.crew_leave_requests SET hod_reviewed_by = v_uid, hod_reviewed_at = now() WHERE id = p_request_id;
  ELSIF p_decision = 'approve' THEN
    IF v_profile IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'person_not_found', DETAIL = 'This crew member could not be found.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.crew_leave_request_periods AS x WHERE x.request_id = p_request_id) THEN
      FOR pp IN SELECT x.* FROM public.crew_leave_request_periods AS x WHERE x.request_id = p_request_id ORDER BY x.sort_order LOOP
        v_row := public.planner_period_write(v_req.vessel_id, v_req.company_id, v_profile, NULL, pp.leave_type_key, pp.start_date, pp.end_date,
                                             pp.end_unknown, v_req.notes, p_replace, p_request_id, true, v_uid);
      END LOOP;
    ELSE
      SELECT lt.key INTO v_type FROM public.leave_types AS lt WHERE lt.day_code = v_req.leave_type AND lt.is_active ORDER BY lt.sort_order LIMIT 1;
      v_row := public.planner_period_write(v_req.vessel_id, v_req.company_id, v_profile, NULL, v_type, v_req.start_date, v_req.end_date,
                                           false, v_req.notes, p_replace, p_request_id, true, v_uid);
    END IF;
    UPDATE public.crew_leave_requests SET status = 'approved', reviewed_by = v_uid, reviewed_at = now() WHERE id = p_request_id;
  ELSIF p_decision = 'decline' THEN
    UPDATE public.crew_leave_requests SET status = 'declined', reviewed_by = v_uid, reviewed_at = now(), cancellation_reason = v_reason
    WHERE id = p_request_id;
  ELSE
    IF v_req.status = 'approved' THEN
      IF v_profile IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('storm.planner.' || v_profile::text, 0));
      END IF;
      DELETE FROM public.frp_rotation_assignments AS a WHERE a.request_id = p_request_id;
      GET DIAGNOSTICS v_removed = ROW_COUNT;
      IF v_profile IS NOT NULL THEN
        PERFORM public.planner_reflow_open(v_profile, current_date);
      END IF;
      -- A request approved by the legacy requests page wrote its day codes
      -- directly and has no periods: reverse those codes as that page did
      -- (the request's code over its dates, painted codes only, locked
      -- months left alone).
      IF v_removed = 0 AND NOT EXISTS (SELECT 1 FROM public.crew_leave_request_periods AS x WHERE x.request_id = p_request_id) THEN
        DELETE FROM public.crew_leave_entries AS e
        WHERE e.crew_id = v_req.crew_id AND e.date BETWEEN v_req.start_date AND v_req.end_date
          AND e.status_code = v_req.leave_type AND e.source_period_id IS NULL
          AND NOT public.planner_day_locked(v_req.company_id, e.vessel_id, e.date);
        GET DIAGNOSTICS v_removed = ROW_COUNT;
      END IF;
    END IF;
    UPDATE public.crew_leave_requests SET status = 'cancelled', reviewed_by = v_uid, reviewed_at = now(), cancellation_reason = v_reason
    WHERE id = p_request_id;
  END IF;

  INSERT INTO public.frp_planner_audit_log (company_id, entity_type, entity_id, action, old_value, new_value, changed_by)
  VALUES (v_req.company_id, 'leave_request', p_request_id, p_decision,
          jsonb_build_object('status', v_req.status),
          jsonb_build_object('status', (SELECT r.status FROM public.crew_leave_requests AS r WHERE r.id = p_request_id),
                             'periods_removed', v_removed, 'replace', coalesce(p_replace, false)),
          v_uid);
  SELECT * INTO v_req FROM public.crew_leave_requests AS r WHERE r.id = p_request_id;
  RETURN v_req;
END;
$$;

-- The vessel's leave approval step (crew_leave_settings.hod_step: off,
-- nudge or required; 22023 hod_step_invalid). Gate: hris.leave_rotation.
-- leave_requests.approve on the vessel. Returns the row.
CREATE OR REPLACE FUNCTION public.planner_leave_settings_save(p_vessel_id uuid, p_hod_step text)
RETURNS public.crew_leave_settings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_row public.crew_leave_settings;
BEGIN
  v_company := public.planner_gate('hris.leave_rotation.leave_requests.approve', p_vessel_id, 'Leave approvers set how leave is approved on this vessel.');
  IF p_hod_step IS NULL OR p_hod_step NOT IN ('off', 'nudge', 'required') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'hod_step_invalid', DETAIL = 'Choose off, nudge or required.';
  END IF;
  INSERT INTO public.crew_leave_settings AS s (vessel_id, company_id, hod_step, created_by, updated_by)
  VALUES (p_vessel_id, v_company, p_hod_step, v_uid, v_uid)
  ON CONFLICT (vessel_id) DO UPDATE SET hod_step = EXCLUDED.hod_step, updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------- RPC: the On/Off toggle (gap/04 C4)

-- Toggle a crew member of the vessel (an assignment on it on the day) off
-- or on. Gate: vessel.crew.crew_scheduling.edit on the vessel; the person
-- of its company (P0002); on its crew on p_start through an assignment
-- (22023 person_not_on_vessel); p_start within 31 days of today (22023
-- date_out_of_range). Off: a leave type that is not on board (22023
-- leave_type_invalid; personal leave needs leave approval, 42501), not
-- already off that day (22023 already_off); an On board period covering the
-- day ends the day before (or goes, when it starts that day); a leave
-- period from p_start (to p_end, or end unknown) and a disembark movement.
-- On: the leave covering the day (22023 not_on_leave) ends the day before
-- (or goes); an embark movement. Movements carry source 'toggle' and the
-- period. Returns the direction, the period and the movement.
CREATE OR REPLACE FUNCTION public.crew_toggle_onboard(
  p_vessel_id uuid,
  p_profile_id uuid,
  p_direction text,
  p_leave_type_key text DEFAULT 'rotation',
  p_start date DEFAULT current_date,
  p_end date DEFAULT NULL,
  p_end_unknown boolean DEFAULT NULL
)
RETURNS TABLE (direction text, period_id uuid, movement_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_day date := coalesce(p_start, current_date);
  v_type public.leave_types;
  v_open boolean;
  v_cur public.frp_rotation_assignments;
  v_row public.frp_rotation_assignments;
  v_movement uuid;
  v_period uuid;
BEGIN
  v_company := public.planner_gate('vessel.crew.crew_scheduling.edit', p_vessel_id, 'You don''t have permission to change this vessel''s planner.');
  IF p_direction IS NULL OR p_direction NOT IN ('off', 'on') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'direction_invalid', DETAIL = 'Choose on or off.';
  END IF;
  PERFORM public.planner_person_company(p_profile_id, v_company);
  IF v_day < current_date - 31 OR v_day > current_date + 31 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'date_out_of_range', DETAIL = 'Choose a day within a month of today.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crew_vessel_members(p_vessel_id, v_day) AS m
                 WHERE m.profile_id = p_profile_id AND m.placement_kind = 'assignment') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'person_not_on_vessel',
      DETAIL = 'Only crew assigned to this vessel on that day can be toggled on or off.';
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('storm.planner.' || p_profile_id::text, 0));

  -- The period governing the day (the latest start covering it).
  SELECT a.* INTO v_cur
  FROM public.frp_rotation_assignments AS a
  WHERE a.profile_id = p_profile_id AND a.status IN ('confirmed', 'complete') AND a.leave_type_key IS NOT NULL
    AND a.start_date <= v_day
    AND (a.end_date >= v_day
         OR (a.end_unknown AND NOT EXISTS (SELECT 1 FROM public.frp_rotation_assignments AS b
                                           WHERE b.profile_id = a.profile_id AND b.id <> a.id AND b.status IN ('confirmed', 'complete')
                                             AND b.leave_type_key IS NOT NULL AND b.start_date > a.start_date AND b.start_date <= v_day)))
  ORDER BY a.start_date DESC, a.id
  LIMIT 1
  FOR UPDATE;

  IF p_direction = 'off' THEN
    SELECT * INTO v_type FROM public.leave_types AS lt WHERE lt.key = coalesce(p_leave_type_key, 'rotation') AND lt.is_active;
    IF NOT FOUND OR v_type.counts_on_board THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'leave_type_invalid', DETAIL = 'Choose a type of time off.';
    END IF;
    IF v_type.needs_approval AND NOT public.crew_vessel_cap('hris.leave_rotation.leave_requests.approve', p_vessel_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'leave_approval_required',
        DETAIL = 'Leave of this type needs an approver: add it with Add leave.';
    END IF;
    IF v_cur.id IS NOT NULL AND NOT (SELECT lt.counts_on_board FROM public.leave_types AS lt WHERE lt.key = v_cur.leave_type_key) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_off', DETAIL = 'This crew member is already off on that day.';
    END IF;
    v_open := coalesce(p_end_unknown, p_end IS NULL);
    IF (v_open AND p_end IS NOT NULL) OR (NOT v_open AND p_end IS NULL) OR (p_end IS NOT NULL AND p_end < v_day) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_invalid', DETAIL = 'Give an end on or after the start, or tick End unknown.';
    END IF;
    IF p_end IS NOT NULL AND p_end > current_date + 731 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'period_out_of_range', DETAIL = 'Periods fall within two years of today.';
    END IF;
    IF v_cur.id IS NOT NULL THEN
      IF v_cur.start_date >= v_day THEN
        DELETE FROM public.frp_rotation_assignments WHERE id = v_cur.id;
      ELSE
        UPDATE public.frp_rotation_assignments SET end_date = v_day - 1, end_unknown = false WHERE id = v_cur.id;
      END IF;
    END IF;
    v_row := public.planner_period_write(p_vessel_id, v_company, p_profile_id, NULL, v_type.key, v_day, p_end, v_open,
                                         NULL, false, NULL, v_type.needs_approval, v_uid);
    v_period := v_row.id;
    INSERT INTO public.crew_movements (company_id, vessel_id, profile_id, kind, occurred_on, source, source_id, created_by, updated_by)
    VALUES (v_company, p_vessel_id, p_profile_id, 'disembark', v_day, 'toggle', v_period, v_uid, v_uid)
    RETURNING id INTO v_movement;
  ELSE
    IF v_cur.id IS NULL OR (SELECT lt.counts_on_board FROM public.leave_types AS lt WHERE lt.key = v_cur.leave_type_key) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_on_leave', DETAIL = 'There is no time off on that day to end.';
    END IF;
    v_period := v_cur.id;
    IF v_cur.start_date >= v_day THEN
      DELETE FROM public.frp_rotation_assignments WHERE id = v_cur.id;
    ELSE
      UPDATE public.frp_rotation_assignments SET end_date = v_day - 1, end_unknown = false WHERE id = v_cur.id;
    END IF;
    PERFORM public.planner_reflow_open(p_profile_id, current_date);
    INSERT INTO public.crew_movements (company_id, vessel_id, profile_id, kind, occurred_on, source, source_id, created_by, updated_by)
    VALUES (v_company, p_vessel_id, p_profile_id, 'embark', v_day, 'toggle', v_period, v_uid, v_uid)
    RETURNING id INTO v_movement;
    INSERT INTO public.frp_planner_audit_log (company_id, entity_type, entity_id, action, old_value, new_value, changed_by)
    VALUES (v_company, 'planner_period', v_cur.id, 'toggle_on',
            jsonb_build_object('start_date', v_cur.start_date, 'end_date', v_cur.end_date, 'end_unknown', v_cur.end_unknown),
            jsonb_build_object('ended_on', v_day - 1), v_uid);
  END IF;

  direction := p_direction;
  period_id := v_period;
  movement_id := v_movement;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------- RPC: the vessel's periods (the timeline's read)

-- The planner periods of a vessel that touch a range (gap/04 C47, C48):
-- confirmed periods and legacy draft bars, with the effective end of an
-- end-unknown period (NULL while no later period bounds it) and the
-- person's names. Gate: vessel.crew.crew_scheduling.view on the vessel, no
-- external viewer (the legacy frp_rotation_assignments read policy answers
-- only for holders of a company role row, so the planner reads here);
-- 22023 range_required / range_invalid / range_too_long (two years at
-- most). Ordered by person, then start.
CREATE OR REPLACE FUNCTION public.planner_vessel_periods(p_vessel_id uuid, p_from date, p_to date)
RETURNS TABLE (
  id uuid,
  vessel_id uuid,
  profile_id uuid,
  crew_user_id uuid,
  crew_name_raw text,
  first_name text,
  last_name text,
  preferred_name text,
  leave_type_key text,
  status text,
  start_date date,
  end_date date,
  end_unknown boolean,
  effective_end date,
  request_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  is_sick_on_board boolean,
  notes text,
  version integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  v_company := public.planner_gate('vessel.crew.crew_scheduling.view', p_vessel_id, 'You don''t have permission to view this vessel''s planner.');
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_required', DETAIL = 'Choose a start and an end.';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_invalid', DETAIL = 'The end is before the start.';
  END IF;
  IF p_to - p_from > 731 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_too_long', DETAIL = 'Choose at most two years.';
  END IF;
  RETURN QUERY
  SELECT x.id, x.vessel_id, x.profile_id, x.crew_user_id, x.crew_name_raw, x.first_name, x.last_name, x.preferred_name,
         x.leave_type_key, x.status, x.start_date, x.end_date, x.end_unknown, x.effective_end, x.request_id, x.approved_by,
         x.approved_at, x.is_sick_on_board, x.notes, x.version, x.updated_at
  FROM (
    SELECT a.id, a.vessel_id, a.profile_id, a.crew_user_id, a.crew_name_raw, p.first_name, p.last_name, p.preferred_name,
           a.leave_type_key, a.status::text AS status, a.start_date, a.end_date, a.end_unknown,
           CASE WHEN a.end_unknown THEN
             (SELECT min(b.start_date) - 1 FROM public.frp_rotation_assignments AS b
              WHERE b.profile_id = a.profile_id AND b.id <> a.id AND b.status IN ('confirmed', 'complete')
                AND b.leave_type_key IS NOT NULL AND b.start_date > a.start_date)
           ELSE a.end_date END AS effective_end,
           a.request_id, a.approved_by, a.approved_at, a.is_sick_on_board, a.notes, a.version, a.updated_at
    FROM public.frp_rotation_assignments AS a
    LEFT JOIN public.profiles AS p ON p.id = a.profile_id
    WHERE a.vessel_id = p_vessel_id AND a.company_id = v_company AND a.start_date <= p_to
  ) AS x
  WHERE x.effective_end IS NULL OR x.effective_end >= p_from
  ORDER BY x.last_name NULLS LAST, x.first_name NULLS LAST, x.profile_id, x.start_date, x.id;
END;
$$;

-- ---------------------------------------------------------------- manning by day (gap/04 C48, W7)

-- The manning rows of a vessel over a range (one row per day and position;
-- positions listed on the vessel, every position held by someone aboard,
-- and a NULL position for titles that map to none). Internal: the caller
-- gated the vessel and checked the range (vessel_manning_by_day).
CREATE OR REPLACE FUNCTION public.planner_manning_rows(p_vessel_id uuid, p_company_id uuid, p_from date, p_to date)
RETURNS TABLE (
  day date,
  position_id uuid,
  position_key text,
  position_name text,
  department_key text,
  sort_order integer,
  aboard integer,
  qualified integer,
  min_on_board integer,
  max_on_board integer,
  short_by integer,
  band text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH
  days AS (
    SELECT g::date AS day FROM generate_series(p_from, p_to, interval '1 day') AS g
  ),
  -- Assignments on the vessel touching the range: current ones (D-227) and ended ones (for past days).
  asg AS MATERIALIZED (
    SELECT p.id AS profile_id,
           coalesce(ca.join_date, ca.start_date) AS a_from,
           coalesce(ca.leave_date, ca.end_date) AS a_to,
           nullif(btrim(ca.position), '') AS position_text,
           nullif(btrim(ca.rank), '') AS rank_text
    FROM public.crew_assignments AS ca
    JOIN public.profiles AS p ON p.user_id = ca.user_id AND p.company_id = p_company_id
    WHERE ca.vessel_id = p_vessel_id
      AND (coalesce(ca.is_current, false) OR coalesce(ca.leave_date, ca.end_date) IS NOT NULL)
      AND (coalesce(ca.join_date, ca.start_date) IS NULL OR coalesce(ca.join_date, ca.start_date) <= p_to)
      AND (coalesce(ca.leave_date, ca.end_date) IS NULL OR coalesce(ca.leave_date, ca.end_date) > p_from)
  ),
  -- Confirmed periods of those people (any vessel) and of anyone on this vessel, with the effective end (NULL: open).
  per AS MATERIALIZED (
    SELECT a.id, a.profile_id, a.vessel_id, a.start_date, lt.counts_on_board,
           CASE WHEN a.end_unknown THEN
             (SELECT min(b.start_date) - 1 FROM public.frp_rotation_assignments AS b
              WHERE b.profile_id = a.profile_id AND b.id <> a.id AND b.status IN ('confirmed', 'complete')
                AND b.leave_type_key IS NOT NULL AND b.start_date > a.start_date)
           ELSE a.end_date END AS eff_end
    FROM public.frp_rotation_assignments AS a
    JOIN public.leave_types AS lt ON lt.key = a.leave_type_key
    WHERE a.status IN ('confirmed', 'complete') AND a.profile_id IS NOT NULL AND a.company_id = p_company_id
      AND a.start_date <= p_to
      AND (a.vessel_id = p_vessel_id OR a.profile_id IN (SELECT asg.profile_id FROM asg))
  ),
  people AS (
    SELECT asg.profile_id FROM asg
    UNION
    SELECT per.profile_id FROM per WHERE per.vessel_id = p_vessel_id AND per.counts_on_board
  ),
  pd AS (
    SELECT pe.profile_id, d.day,
           (SELECT x.vessel_id = p_vessel_id AND x.counts_on_board
            FROM per AS x
            WHERE x.profile_id = pe.profile_id AND x.start_date <= d.day AND (x.eff_end IS NULL OR x.eff_end >= d.day)
            ORDER BY x.start_date DESC, x.id
            LIMIT 1) AS period_aboard,
           EXISTS (SELECT 1 FROM asg AS y
                   WHERE y.profile_id = pe.profile_id AND (y.a_from IS NULL OR y.a_from <= d.day) AND (y.a_to IS NULL OR d.day < y.a_to)) AS assigned
    FROM people AS pe CROSS JOIN days AS d
  ),
  aboard AS (
    SELECT pd.profile_id, pd.day FROM pd WHERE coalesce(pd.period_aboard, pd.assigned)
  ),
  pos_of AS (
    SELECT pe.profile_id,
           coalesce(
             (SELECT coalesce(public.crew_position_for(p_company_id, p_vessel_id, y.position_text),
                              public.crew_position_for(p_company_id, p_vessel_id, y.rank_text))
              FROM asg AS y WHERE y.profile_id = pe.profile_id ORDER BY y.a_from DESC NULLS LAST LIMIT 1),
             (SELECT coalesce(public.crew_position_for(p_company_id, p_vessel_id, nullif(btrim(p.position), '')),
                              public.crew_position_for(p_company_id, p_vessel_id, nullif(btrim(p.rank), '')))
              FROM public.profiles AS p WHERE p.id = pe.profile_id)
           ) AS position_id
    FROM (SELECT DISTINCT aboard.profile_id FROM aboard) AS pe
  ),
  comp AS MATERIALIZED (
    SELECT s.profile_id, s.status, s.next_expiry
    FROM public.crew_compliance_summary_for(ARRAY[p_vessel_id], current_date, NULL) AS s
  ),
  req_pos AS (
    SELECT DISTINCT rp.position_id FROM public.crew_requirement_positions AS rp WHERE rp.vessel_id = p_vessel_id
  ),
  qual AS (
    SELECT a.profile_id, a.day, po.position_id,
           CASE
             WHEN c.profile_id IS NOT NULL THEN c.status IN ('complete', 'expiring') AND (c.next_expiry IS NULL OR c.next_expiry >= a.day)
             ELSE po.position_id IS NULL OR NOT EXISTS (SELECT 1 FROM req_pos AS r WHERE r.position_id = po.position_id)
           END AS is_qualified
    FROM aboard AS a
    JOIN pos_of AS po ON po.profile_id = a.profile_id
    LEFT JOIN comp AS c ON c.profile_id = a.profile_id
  ),
  listed AS (
    SELECT pm.position_id, pm.min_on_board, pm.max_on_board, pm.sort_order
    FROM public.position_manning AS pm
    WHERE pm.vessel_id = p_vessel_id AND pm.is_listed
  ),
  all_pos AS (
    SELECT listed.position_id FROM listed
    UNION
    SELECT qual.position_id FROM qual
  ),
  counts AS (
    SELECT q.day, q.position_id, count(*)::integer AS n_aboard, (count(*) FILTER (WHERE q.is_qualified))::integer AS n_qualified
    FROM qual AS q
    GROUP BY q.day, q.position_id
  )
  SELECT d.day, ap.position_id, pos.key, pos.name, pos.department_key, coalesce(l.sort_order, pos.sort_order),
         coalesce(c.n_aboard, 0), coalesce(c.n_qualified, 0), coalesce(l.min_on_board, 0), l.max_on_board,
         greatest(coalesce(l.min_on_board, 0) - coalesce(c.n_qualified, 0), 0),
         public.planner_manning_band(coalesce(c.n_aboard, 0), coalesce(c.n_qualified, 0), coalesce(l.min_on_board, 0), l.max_on_board)
  FROM days AS d
  CROSS JOIN all_pos AS ap
  LEFT JOIN counts AS c ON c.day = d.day AND c.position_id IS NOT DISTINCT FROM ap.position_id
  LEFT JOIN listed AS l ON l.position_id = ap.position_id
  LEFT JOIN public.positions AS pos ON pos.id = ap.position_id
  ORDER BY d.day, coalesce(l.sort_order, pos.sort_order) NULLS LAST, pos.name NULLS LAST, ap.position_id
$$;

-- Manning by day (gap/04 C48, W7): for each day of the range and each
-- position (listed on the vessel or held by someone aboard; a NULL
-- position for unmatched titles), who is aboard, how many of them are
-- qualified, the vessel's minimum and maximum, how many are missing and
-- the band (planner_manning_band). Gate: vessel.crew.crew_scheduling.view
-- on the vessel (P0002 unknown vessel, 42501), no external viewer; 22023
-- range_required / range_invalid / range_too_long (400 days at most).
CREATE OR REPLACE FUNCTION public.vessel_manning_by_day(p_vessel_id uuid, p_from date, p_to date)
RETURNS TABLE (
  day date,
  position_id uuid,
  position_key text,
  position_name text,
  department_key text,
  sort_order integer,
  aboard integer,
  qualified integer,
  min_on_board integer,
  max_on_board integer,
  short_by integer,
  band text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  v_company := public.planner_gate('vessel.crew.crew_scheduling.view', p_vessel_id, 'You don''t have permission to view this vessel''s planner.');
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_required', DETAIL = 'Choose a start and an end.';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_invalid', DETAIL = 'The end is before the start.';
  END IF;
  IF p_to - p_from >= 400 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_too_long', DETAIL = 'Choose at most 400 days.';
  END IF;
  RETURN QUERY SELECT * FROM public.planner_manning_rows(p_vessel_id, v_company, p_from, p_to);
END;
$$;

-- ---------------------------------------------------------------- the daily sweep (PR-X1-K, hr-daily-sweeper)

-- Moves every end-unknown period's written horizon on (today + 30, never
-- past the day before the person's next period), which writes the new days
-- to day codes through the trigger. Service role only (D-232: returns the
-- periods moved).
CREATE OR REPLACE FUNCTION public.frp_periods_extend_open(p_today date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('storm.crew_engine', 'on', true);
  RETURN public.planner_reflow_open(NULL, coalesce(p_today, current_date));
END;
$$;

-- ---------------------------------------------------------------- RLS, grants, comments

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_leave_request_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_leave_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_types_select_active ON public.leave_types;
CREATE POLICY leave_types_select_active ON public.leave_types
  FOR SELECT TO authenticated
  USING ((SELECT public.user_is_active((SELECT auth.uid()))));

-- A request's periods name its leave types (medical, compassionate ...):
-- read by the requester and by the vessel's schedulers and leave approvers
-- (not external viewers), never company-wide (D-377).
DROP POLICY IF EXISTS crew_leave_request_periods_select_request ON public.crew_leave_request_periods;
DROP POLICY IF EXISTS crew_leave_request_periods_select_scoped ON public.crew_leave_request_periods;
CREATE POLICY crew_leave_request_periods_select_scoped ON public.crew_leave_request_periods
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.crew_leave_requests AS r
      WHERE r.id = request_id
        AND (r.crew_id = (SELECT auth.uid())
             OR r.profile_id = (SELECT public.my_profile_id())
             OR ((r.vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_scheduling.view'))
                  OR r.vessel_id IN (SELECT public.crew_cap_vessel_ids('hris.leave_rotation.leave_requests.approve')))
                 AND NOT (SELECT public.crew_caller_is_external())))
    )
  );

DROP POLICY IF EXISTS crew_leave_settings_select_scheduling ON public.crew_leave_settings;
CREATE POLICY crew_leave_settings_select_scheduling ON public.crew_leave_settings
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
    AND vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_scheduling.view'))
    AND NOT (SELECT public.crew_caller_is_external())
  );

REVOKE ALL ON TABLE public.leave_types, public.crew_leave_request_periods, public.crew_leave_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.leave_types, public.crew_leave_request_periods, public.crew_leave_settings TO authenticated;
GRANT ALL ON TABLE public.leave_types, public.crew_leave_request_periods, public.crew_leave_settings TO service_role;

-- Browser RPCs.
REVOKE ALL ON FUNCTION public.planner_period_upsert(uuid, uuid, uuid, text, date, date, boolean, text, boolean, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_period_upsert(uuid, uuid, uuid, text, date, date, boolean, text, boolean, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.planner_period_delete(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_period_delete(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.planner_add_leave(uuid, uuid, jsonb, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_add_leave(uuid, uuid, jsonb, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_leave_request_submit(uuid, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_leave_request_submit(uuid, jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_leave_request_decide(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_leave_request_decide(uuid, text, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.planner_leave_settings_save(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_leave_settings_save(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_toggle_onboard(uuid, uuid, text, text, date, date, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_toggle_onboard(uuid, uuid, text, text, date, date, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.planner_vessel_periods(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_vessel_periods(uuid, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_manning_by_day(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vessel_manning_by_day(uuid, date, date) TO authenticated, service_role;
-- The sweep, the pure rules and the internals: the service role (definers call them as owner).
REVOKE ALL ON FUNCTION public.frp_periods_extend_open(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.frp_periods_extend_open(date) TO service_role;
REVOKE ALL ON FUNCTION public.planner_leave_type_for_rotation(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_leave_type_for_rotation(text) TO service_role;
REVOKE ALL ON FUNCTION public.planner_rotation_type_for_leave(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_rotation_type_for_leave(text) TO service_role;
REVOKE ALL ON FUNCTION public.planner_periods_overlap(date, date, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_periods_overlap(date, date, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.planner_open_horizon(date, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_open_horizon(date, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.planner_manning_band(integer, integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_manning_band(integer, integer, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.planner_leave_decide_check(text, text, boolean, boolean, boolean, boolean, text, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_leave_decide_check(text, text, boolean, boolean, boolean, boolean, text, boolean, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.planner_day_locked(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_day_locked(uuid, uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.planner_person_materialise(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_person_materialise(uuid, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.planner_gate(text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_gate(text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.planner_person_company(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_person_company(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.planner_is_department_hod(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_is_department_hod(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.planner_periods_parse(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_periods_parse(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.planner_reflow_open(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_reflow_open(uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.planner_period_write(uuid, uuid, uuid, uuid, text, date, date, boolean, text, boolean, uuid, boolean, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_period_write(uuid, uuid, uuid, uuid, text, date, date, boolean, text, boolean, uuid, boolean, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.planner_request_create(uuid, uuid, uuid, uuid, jsonb, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_request_create(uuid, uuid, uuid, uuid, jsonb, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.planner_manning_rows(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planner_manning_rows(uuid, uuid, date, date) TO service_role;
-- Trigger functions: no grant.
REVOKE ALL ON FUNCTION public.frp_rotation_assignments_status_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.frp_periods_materialise() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_leave_entries_source_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_leave_requests_status_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_leave_request_periods_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_leave_settings_scope_guard() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON COLUMN public.frp_rotation_assignments.profile_id IS 'The person of the period (profiles.id; filled from crew_user_id). The period store keys on the person, so crew without a login have periods (X1-09).';
COMMENT ON COLUMN public.frp_rotation_assignments.leave_type_key IS 'The period''s leave type (leave_types.key). Engine writes set it and the legacy rotation_type follows; a legacy draft takes it from its rotation type.';
COMMENT ON COLUMN public.frp_rotation_assignments.end_unknown IS 'End unknown: the period ends the day before the person''s next period; end_date is how far it is written to day codes (today + 30, frp_periods_extend_open).';
COMMENT ON COLUMN public.frp_rotation_assignments.request_id IS 'The leave request whose approval created the period; cancelling the request removes it.';
COMMENT ON COLUMN public.frp_rotation_assignments.rotation_plan_id IS 'The rotation plan that generated the period (Build rotation, X1 wave 2); no table yet.';
COMMENT ON COLUMN public.crew_leave_entries.source_period_id IS 'The confirmed planner period that wrote this day code (frp_rotation_assignments.id; X1-09). NULL for a code painted by hand.';
COMMENT ON COLUMN public.crew_leave_entries.replaced_code IS 'The code the day carried before its period wrote it; restored when the period no longer covers the day.';
COMMENT ON COLUMN public.crew_leave_requests.profile_id IS 'The person of the request (profiles.id; filled from crew_id).';

COMMENT ON FUNCTION public.planner_leave_type_for_rotation(text) IS 'Pure (TS leaveTypeKeyForRotation): the leave type of a legacy rotation type: onboard, yard, temp_cover on_board; training crew_development; leave, standby rotation; travel travel; wfh, no_crew neutral; tbc none.';
COMMENT ON FUNCTION public.planner_rotation_type_for_leave(text) IS 'Pure (TS rotationTypeForLeaveType): the legacy rotation type an engine period shows: aboard types and PBQ onboard, travel travel, crew development training, neutral and unpaid no_crew, other leave leave.';
COMMENT ON FUNCTION public.planner_periods_overlap(date, date, date, date) IS 'Pure (TS rangesOverlap): two periods share a day; a NULL end is end unknown, which ends before the next period and so never overlaps a later one.';
COMMENT ON FUNCTION public.planner_open_horizon(date, date, date) IS 'Pure (TS openHorizon): how far an end-unknown period is written to day codes: today + 30, never past the day before the next period, never before its start.';
COMMENT ON FUNCTION public.planner_manning_band(integer, integer, integer, integer) IS 'Pure (TS manningBand): critical (qualified below a minimum above zero), at_minimum (qualified at it), overmanned (aboard above a set maximum), normal; first match wins (D-X1-16).';
COMMENT ON FUNCTION public.planner_leave_decide_check(text, text, boolean, boolean, boolean, boolean, text, boolean, boolean) IS 'Pure (TS leaveDecisionCheck): ok, or <sqlstate>:<refusal> for a leave request decision (hod_review, approve, decline, cancel) from the status, owner, approver, department HoD, Master or fleet approver, the vessel''s HoD step, the HoD review and the reason.';
COMMENT ON FUNCTION public.planner_day_locked(uuid, uuid, date) IS 'Internal: the day is in a locked leave month of the company (company-wide or the vessel''s).';
COMMENT ON FUNCTION public.planner_person_materialise(uuid, date, date) IS 'Internal (frp_periods_materialise): recompute a person''s day codes over a range from their confirmed periods (latest start governs; replaced codes restored; locked months untouched; no login, no codes). Returns the rows written or released.';
COMMENT ON FUNCTION public.frp_periods_materialise() IS 'Trigger AFTER INSERT / UPDATE / DELETE on frp_rotation_assignments (gap/04 W7): a change to a confirmed period recomputes the person''s day codes over the days it covered and covers (planner_person_materialise), so the leave calculator and payroll read what the periods say.';
COMMENT ON FUNCTION public.frp_rotation_assignments_status_guard() IS 'Trigger BEFORE INSERT / UPDATE / DELETE on frp_rotation_assignments: fills the person, the leave type, the legacy rotation type and the sick flag, keeps the period, vessel and person in one company (23514 planner_period_scope_mismatch), stamps the version and actors; for a signed-in writer without storm.crew_engine = ''on'' the status, leave type, end unknown, request, rotation plan and approval columns are the engine''s and only drafts are deleted (42501 planner_engine_only). Service role and no-JWT maintenance exempt.';
COMMENT ON FUNCTION public.crew_leave_entries_source_guard() IS 'Trigger BEFORE INSERT / UPDATE on crew_leave_entries: only the materialiser (storm.crew_materialise) writes source_period_id / replaced_code; a signed-in writer''s code is manual and owns its day. Service role and no-JWT maintenance exempt.';
COMMENT ON FUNCTION public.crew_leave_requests_status_guard() IS 'Trigger BEFORE INSERT / UPDATE / DELETE on crew_leave_requests: fills the person, keeps the request, vessel and person in one company (23514 leave_request_scope_mismatch); for a signed-in writer without storm.crew_engine = ''on'' only a pending request is raised, edited or deleted and the status and reviewer columns are the engine''s (42501 leave_request_engine_only).';
COMMENT ON FUNCTION public.crew_leave_request_periods_scope_guard() IS 'Trigger: a request period carries its request''s company (23514 leave_request_period_scope_mismatch) and never moves (23514 leave_request_period_locked).';
COMMENT ON FUNCTION public.crew_leave_settings_scope_guard() IS 'Trigger: leave settings carry their vessel''s company (23514 crew_leave_settings_scope_mismatch).';
COMMENT ON FUNCTION public.planner_gate(text, uuid, text) IS 'Internal: the planner RPC gate (crew_vessel_gate and no external viewer); returns the vessel''s company.';
COMMENT ON FUNCTION public.planner_person_company(uuid, uuid) IS 'Internal: the person is a profile of the company (P0002 person_not_found otherwise); returns their login or NULL.';
COMMENT ON FUNCTION public.planner_is_department_hod(uuid, uuid, uuid) IS 'Internal: the user''s crew list entry on the vessel is of the HoD tier and in the person''s department (never for themselves).';
COMMENT ON FUNCTION public.planner_periods_parse(jsonb) IS 'Internal (TS validatePeriodsInput): the 1 to 10 periods of a request or Add leave, checked (22023 periods_required / periods_too_many / period_invalid / leave_type_unknown / period_dates_invalid / period_out_of_range / periods_overlap, HINT the period).';
COMMENT ON FUNCTION public.planner_reflow_open(uuid, date) IS 'Internal: move the written horizon of end-unknown periods (one person, or all with NULL) to planner_open_horizon; returns the periods moved.';
COMMENT ON FUNCTION public.planner_period_write(uuid, uuid, uuid, uuid, text, date, date, boolean, text, boolean, uuid, boolean, uuid) IS 'Internal: write one confirmed period after the overlap rules (22023 period_overlap unless replacing rotation leave, which is trimmed, split or removed), reflow the person''s end-unknown periods and log the change.';
COMMENT ON FUNCTION public.planner_request_create(uuid, uuid, uuid, uuid, jsonb, text, uuid) IS 'Internal: a leave request (pending, or approved by the actor) with its periods; returns its id.';
COMMENT ON FUNCTION public.planner_manning_rows(uuid, uuid, date, date) IS 'Internal (vessel_manning_by_day): the manning rows of a vessel over a range.';
COMMENT ON FUNCTION public.planner_period_upsert(uuid, uuid, uuid, text, date, date, boolean, text, boolean, integer) IS 'Create or change a confirmed planner period (gap/04 C47, W7). vessel.crew.crew_scheduling.edit on the vessel (personal leave also needs leave approval, 42501 leave_approval_required); the person of its company (P0002); not a period from a request (22023 period_from_request); 22023 period_changed for a stale version; the date rules; 22023 period_overlap unless p_replace (rotation leave only). Returns the row.';
COMMENT ON FUNCTION public.planner_period_delete(uuid, uuid) IS 'Remove a planner period of the vessel (the gate of planner_period_upsert; 22023 period_from_request). Its day codes are reversed. Returns the id.';
COMMENT ON FUNCTION public.planner_add_leave(uuid, uuid, jsonb, text, boolean) IS 'Add leave (gap/04 C50, T-71, D-X1-10): one or more periods for a crew member; saved Approved (approver recorded, periods confirmed) for a leave approver adding someone else''s leave, a pending request otherwise (22023 request_needs_login without a login). Gate: crew_scheduling.edit or leave approval on the vessel. Returns the request, the status and the period ids.';
COMMENT ON FUNCTION public.crew_leave_request_submit(uuid, jsonb, text) IS 'A crew member''s own leave request with one or more periods (gap/04 C50): on the vessel''s crew through an assignment (42501 not_on_vessel_crew), leave types only (22023 leave_type_not_requestable). Saved pending. Returns the row.';
COMMENT ON FUNCTION public.crew_leave_request_decide(uuid, text, text, boolean) IS 'Decide a leave request (gap/04 C52): hod_review, approve (creates its periods; p_replace replaces rotation leave), decline (a reason) or cancel (after approval its periods are removed and their day codes reversed), by planner_leave_decide_check. P0002 unknown or foreign request. Returns the row.';
COMMENT ON FUNCTION public.planner_leave_settings_save(uuid, text) IS 'Set the vessel''s leave HoD step (off, nudge, required; 22023 hod_step_invalid). Gate: leave approval on the vessel. Returns the row.';
COMMENT ON FUNCTION public.crew_toggle_onboard(uuid, uuid, text, text, date, date, boolean) IS 'The On/Off toggle (gap/04 C4): Off ends the On board period and writes a leave period (Rotation leave, end unknown by default) and a disembark movement; On ends the current leave and writes an embark movement. Gate: crew_scheduling.edit; an assigned crew member of the vessel (22023 person_not_on_vessel). Returns the direction, the period and the movement.';
COMMENT ON FUNCTION public.planner_vessel_periods(uuid, date, date) IS 'The planner periods of a vessel touching a range (gap/04 C47, C48): confirmed periods and legacy draft bars with the effective end of an end-unknown period and the person''s names. Gate: vessel.crew.crew_scheduling.view, no external viewer; at most two years (22023 range_too_long).';
COMMENT ON FUNCTION public.vessel_manning_by_day(uuid, date, date) IS 'Manning by day (gap/04 C48, W7): per day and position aboard, qualified (the requirement engine today, projected by the earliest expiry), minimum, maximum, short by and band. Gate: vessel.crew.crew_scheduling.view, no external viewer; at most 400 days (22023 range_too_long).';
COMMENT ON FUNCTION public.frp_periods_extend_open(date) IS 'Daily sweep (PR-X1-K, hr-daily-sweeper; D-232; service role): move every end-unknown period''s written horizon to today + 30 (never past the day before the next period). Returns the periods moved.';
