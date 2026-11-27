-- =================================================================
-- CREW X1-11: the controlled transfer between vessels (one completion
-- definer) and the employment functions X1-11B builds on (Phase 3 wave 1,
-- stream X1; gap/04 C58, C57, C59, W8, W9; DECISIONS D-207, D-198, D-225,
-- D-246, D-X1-12, D-128, D-238; X1 spec §6 061100)
-- Tables: none new (crew_transfers and crew_movements are 060200's).
-- Columns: crew_contracts.probation_months, notice_during_probation_days,
--   notice_after_probation_days (C57: the probation length and the two
--   notice periods; backfilled from notice_period_days and the probation
--   end date)
-- Functions:
--   pure      crew_transfer_next (the W9 step rule; mirrored by
--             nextTransferStatus in src/modules/crew/lib/transfer.ts)
--   internal  crew_transfer_actor_check, crew_transfer_is_approver,
--             crew_transfer_fleet_hr, crew_transfer_review_snapshot,
--             crew_transfer_json, crew_transfer_apply,
--             crew_end_reason_label
--   RPCs      transfer_crew_options, transfer_crew_start,
--             transfer_crew_review, transfer_crew_acknowledge,
--             transfer_crew_submit, transfer_crew_decide,
--             transfer_crew_cancel, transfer_crew (the ONE completion
--             definer), transfer_crew_detail, crew_transfers_for_profile;
--             crew_end_employment, crew_vessel_employment_history,
--             crew_rehire_prefill
--   sweep     crew_transfers_complete_due (service role; hr-daily-sweeper
--             lists it, PR-X1-K)
-- TS mirror: src/modules/crew/types/db.pending.ts (the RPCs and the new
--   crew_contracts columns); src/modules/crew/lib/transfer.ts (the step
--   rule; supabase/tests/sql/crew/transfers.test.sql compares it case by
--   case through scripts/db/lib/load-ts.mjs)
-- =================================================================
--
-- Why. Today a vessel move is two browser writes (end the assignment, open
-- another; useCrew.transferCrew) or the admin-actions reallocate_vessel
-- edge action (D-191): nobody reviews the destination's requirements, the
-- person's open medical matters, their hours of rest or their open forms,
-- nothing asks for fleet approval, and a refusal half-way leaves the person
-- on no vessel or on two. gap/04 C58 and W9 ask for a controlled transfer:
-- the same or a new position, a pre-transfer review, an approval where the
-- vessel wants one, a notice to fleet HR and the DPA, an audit record, and
-- D-207 asks for the move as ONE definer that does everything or nothing.
--
-- The transfer (W9; crew_transfer_next, the TS mirror):
--   Draft -> Review -> Pending approval (only when either vessel's
--   vessel_crew_settings.transfer_requires_fleet_approval is on, D-X1-12)
--   -> Scheduled -> Completed; Cancelled from any state before Completed
--   (a declined approval cancels it with the reason).
-- * transfer_crew_start: the details (destination, the same or a new
--   position, sign-off and sign-on dates, notes). A draft or in-review
--   transfer the caller started for the same person and origin is started
--   again with the new details (its review and ticks are cleared); any
--   other open transfer of the person is refused (22023 transfer_open).
-- * transfer_crew_review: the pre-transfer review, stored in
--   gaps_snapshot: the destination's requirement gaps for the new position
--   (documents missing, expired or expiring by the sign-on date, through
--   the requirement engine's satisfier closure), the familiarisations that
--   open on joining, medical flags (an open consultation follow-up, a
--   fitness restriction, an open medical case when that table exists),
--   never clinical text, the last performance review, hours-of-rest
--   breaches in the last 30 days and joining with no rest day, the open
--   familiarisation forms and training applications. Acknowledgements of
--   items that still read the same are kept.
-- * transfer_crew_acknowledge: a tick (and an optional note) per item;
--   nothing blocks by default, but every item needs its tick to submit.
-- * transfer_crew_submit: Pending approval or Scheduled; fleet HR and the
--   DPA hear of it (crew_transfer_submitted).
-- * transfer_crew_decide: approve -> Scheduled, decline (with a reason) ->
--   Cancelled; crew_assignments.approve with fleet reach, never on a
--   transfer the decider submitted (four eyes).
-- * transfer_crew_cancel: before completion; a reason once submitted.
-- * transfer_crew (D-207, C58): the ONE completion definer, all or nothing.
--   It ends the origin assignment (leave date = sign-off, end_reason
--   'transfer'), inserts the destination assignment (the canonical
--   position name; the same rank for the same role, else the position
--   name; join date = sign-on), ends the origin terms and writes the
--   destination crew_assignment_terms with the assignment linked (X1-10's
--   AFTER INSERT trigger opens the required familiarisations), moves the
--   person's planner periods that start after the sign-off to the new
--   vessel, writes the transfer_out / transfer_in crew_movements, emits
--   crew_transfer_completed and marks the transfer completed. The two
--   crew_assignments writes are made as the caller WITHOUT
--   storm.access_engine, so the platform crew-assignment guard
--   (20261123010300) still decides (reach, the Master office, the company
--   rule); any refusal rolls the whole transfer back.
-- * crew_transfers_complete_due (service role, the daily sweep): completes
--   scheduled transfers on their sign-on date (each in its own
--   subtransaction: one failure never stops the others) and stamps
--   compliant_on_destination_at the first time the person's compliance
--   on the destination reads complete; returns the counts.
--
-- Who may act (D-207, D-198, D-246, D-225, D-X1-12):
-- * start, review, acknowledge, submit, complete: vessel.crew.
--   crew_assignments.assign on BOTH vessels (each in the caller's company
--   and reach; crew_vessel_gate: P0002 unknown vessel, 42501), no external
--   viewer; the person a member of that company (P0002 otherwise, D-246);
--   admin_may_act_on_user(actor, target, company, profile) (42501
--   out_of_reach, "You can only do this for people on the vessels you
--   administer."), and an administrator target needs a manager of
--   administrators (42501 manages_admins_required); a Master or Captain
--   (the origin assignment's office, or a Master or Captain position on
--   the destination) needs admin.access.users_access.admin of both vessels
--   (42501 master_transfer_refused, D-198); moving yourself needs it on the
--   destination (42501 self_transfer_refused). A pending placement (D-204,
--   D-225: no crew_assignments row yet) is refused with 22023
--   pending_placement_not_transferable, "Change the pending vessel on the
--   profile.", until the engine-written placement table (PR-X1-M).
-- * decide: vessel.crew.crew_assignments.approve at company level with
--   fleet reach (crew_transfer_is_approver).
-- * cancel: assign on either vessel, or an approver.
-- * read (transfer_crew_detail, crew_transfers_for_profile):
--   crew_assignments.view on either vessel, an approver, or the person.
--
-- Employment (X1-11B consumes these; W8, C57, C59):
-- * crew_end_employment: hris.employee_records.contracts_employment.edit on
--   the vessel plus admin_may_act_on_user; ends the current assignment on
--   the vessel (the guard decides as the caller) and the open terms;
--   expires (contract end, end of a temporary contract) or terminates
--   (every other reason) the active crew_contracts row; removes the
--   person's planner periods that start after the end date and trims the
--   one that runs past it; names the final hours-of-rest month in its
--   answer (the month the end date falls in, with that month's
--   submission state); emits crew_employment_ended (X5's TR11 clawback
--   watch reads it later). Reasons: contract_end, resignation, dismissal,
--   medical, end_of_temporary_contract, transfer_to_another_employer,
--   retirement, other (with a note).
-- * crew_vessel_employment_history: the vessel's ended assignments, with
--   the reason and the duration; contracts_employment.view with reach.
-- * crew_rehire_prefill: the Add crew re-hire prefill;
--   vessel.crew.crew_profiles.create on the vessel, and the person must be
--   of the vessel's (the caller's) company.
--
-- Notifications (D-128, D-238, D-249): every emit_notification_event call
-- sits in its own exception block, so a missing type or a fan-out problem
-- never rolls back the action; in-app only.
--
-- Idempotent (D-12): ADD COLUMN IF NOT EXISTS, named constraints dropped
-- before they are added (NOT VALID, then VALIDATE), backfills only where the
-- column is still empty, CREATE OR REPLACE for every function.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.crew_transfers') IS NULL OR to_regclass('public.crew_movements') IS NULL
     OR to_regprocedure('public.crew_vessel_members(uuid,date)') IS NULL
     OR to_regprocedure('public.crew_caller_is_external()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs crew_transfers, crew_movements and the crew list helpers: apply 20261124060200_crew_vessel_list.sql first';
  END IF;
  IF to_regprocedure('public.crew_vessel_gate(text,uuid,text)') IS NULL OR to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs the crew gate helpers and positions: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regclass('public.crew_assignment_terms') IS NULL OR to_regprocedure('public.crew_profile_visible(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs crew_assignment_terms: apply 20261124060300_crew_profile_details.sql first';
  END IF;
  IF to_regclass('public.vessel_crew_settings') IS NULL OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crew_certificates' AND column_name = 'profile_id') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs vessel_crew_settings and the crew document columns: apply 20261124060400_crew_document_catalogue.sql first';
  END IF;
  IF to_regprocedure('public.crew_requirement_row_satisfiers(uuid[])') IS NULL
     OR to_regprocedure('public.crew_compliance_summary_for(uuid[],date,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs the requirement engine: apply 20261124060600_crew_compliance.sql first';
  END IF;
  IF to_regprocedure('public.work_rest_is_fleet_hr(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs work_rest_is_fleet_hr: apply 20261124060800_crew_hor_board.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'frp_rotation_assignments' AND column_name = 'profile_id') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs the planner period store: apply 20261124060900_crew_planner_periods.sql first';
  END IF;
  IF to_regprocedure('public.familiarisation_required_on_terms()') IS NULL
     OR to_regprocedure('public.familiarisation_required_templates(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs the familiarisation engine: apply 20261124061000_crew_familiarisation.sql first';
  END IF;
  IF to_regprocedure('public.admin_may_act_on_user(uuid,uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_manages_admins_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_is_admin_target(uuid,uuid)') IS NULL
     OR to_regprocedure('public.crew_assignments_guard()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs the platform acting-on-a-person helpers and the crew-assignment guard: apply 20261123000400, 20261123010000 and 20261123010300 first';
  END IF;
  IF to_regprocedure('public.emit_notification_event(text,uuid,text,text,uuid,text,text,text,text,text,uuid,text,uuid,uuid[],text[],jsonb,text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs emit_notification_event: apply 20261123030000_platform_notification_outbox.sql first';
  END IF;
  IF to_regclass('public.crew_contracts') IS NULL OR to_regclass('public.performance_reviews') IS NULL
     OR to_regclass('public.med_consultations') IS NULL OR to_regclass('public.med_fitness_assessments') IS NULL
     OR to_regclass('public.hw_people') IS NULL OR to_regclass('public.development_applications') IS NULL
     OR to_regclass('public.work_rest_non_conformities') IS NULL OR to_regclass('public.work_rest_monthly_submissions') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124061100_crew_transfers_employment needs the legacy HR, health, training and hours-of-rest tables (20260917*, 20260919*, 20260501100000)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- crew_contracts: probation and the two notice periods (C57)

ALTER TABLE public.crew_contracts ADD COLUMN IF NOT EXISTS probation_months integer NULL;
ALTER TABLE public.crew_contracts ADD COLUMN IF NOT EXISTS notice_during_probation_days integer NULL;
ALTER TABLE public.crew_contracts ADD COLUMN IF NOT EXISTS notice_after_probation_days integer NULL;
ALTER TABLE public.crew_contracts DROP CONSTRAINT IF EXISTS crew_contracts_probation_months_check;
ALTER TABLE public.crew_contracts ADD CONSTRAINT crew_contracts_probation_months_check
  CHECK (probation_months IS NULL OR probation_months BETWEEN 0 AND 24) NOT VALID;
ALTER TABLE public.crew_contracts VALIDATE CONSTRAINT crew_contracts_probation_months_check;
ALTER TABLE public.crew_contracts DROP CONSTRAINT IF EXISTS crew_contracts_notice_during_probation_days_check;
ALTER TABLE public.crew_contracts ADD CONSTRAINT crew_contracts_notice_during_probation_days_check
  CHECK (notice_during_probation_days IS NULL OR notice_during_probation_days BETWEEN 0 AND 365) NOT VALID;
ALTER TABLE public.crew_contracts VALIDATE CONSTRAINT crew_contracts_notice_during_probation_days_check;
ALTER TABLE public.crew_contracts DROP CONSTRAINT IF EXISTS crew_contracts_notice_after_probation_days_check;
ALTER TABLE public.crew_contracts ADD CONSTRAINT crew_contracts_notice_after_probation_days_check
  CHECK (notice_after_probation_days IS NULL OR notice_after_probation_days BETWEEN 0 AND 365) NOT VALID;
ALTER TABLE public.crew_contracts VALIDATE CONSTRAINT crew_contracts_notice_after_probation_days_check;

-- Backfill only empty columns (a second run changes nothing): the single
-- legacy notice period is the notice after probation; the probation length
-- is the whole months from the start to the recorded probation end.
UPDATE public.crew_contracts
SET notice_after_probation_days = notice_period_days
WHERE notice_after_probation_days IS NULL AND notice_period_days BETWEEN 0 AND 365;
UPDATE public.crew_contracts AS c
SET probation_months = m.months
FROM (
  SELECT id, (extract(year FROM age(probation_end_date, start_date)) * 12 + extract(month FROM age(probation_end_date, start_date)))::integer AS months
  FROM public.crew_contracts
  WHERE probation_months IS NULL AND probation_end_date IS NOT NULL AND probation_end_date >= start_date
) AS m
WHERE c.id = m.id AND m.months BETWEEN 0 AND 24;

COMMENT ON COLUMN public.crew_contracts.probation_months IS 'Probation length in whole months, 0-24 (gap/04 C57); backfilled from probation_end_date - start_date. probation_end_date stays the legacy readers'' column.';
COMMENT ON COLUMN public.crew_contracts.notice_during_probation_days IS 'Notice period during probation, in days (0-365; gap/04 C57).';
COMMENT ON COLUMN public.crew_contracts.notice_after_probation_days IS 'Notice period after probation, in days (0-365; gap/04 C57); backfilled from notice_period_days, which stays for the legacy readers.';

-- ---------------------------------------------------------------- the step rule (pure; TS nextTransferStatus)

-- The state a transfer step leads to, or why it cannot be taken:
-- review (draft | review -> review), acknowledge (review -> review),
-- submit (review -> pending_approval when approval is required, else
-- scheduled; acknowledgements_missing until every item is ticked), approve
-- (pending_approval -> scheduled), decline (pending_approval -> cancelled),
-- cancel (any open state -> cancelled), complete (scheduled -> completed
-- from the sign-off date; transfer_not_due before it); illegal_transition
-- from any other state; unknown_action for any other action. Mirrored by
-- nextTransferStatus() in src/modules/crew/lib/transfer.ts (parity in
-- crew/transfers.test.sql).
CREATE OR REPLACE FUNCTION public.crew_transfer_next(
  p_status text,
  p_action text,
  p_requires_approval boolean,
  p_acknowledged boolean,
  p_due boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE p_action
    WHEN 'review' THEN CASE WHEN p_status IN ('draft', 'review') THEN 'review' ELSE 'illegal_transition' END
    WHEN 'acknowledge' THEN CASE WHEN p_status = 'review' THEN 'review' ELSE 'illegal_transition' END
    WHEN 'submit' THEN CASE
      WHEN p_status IS DISTINCT FROM 'review' THEN 'illegal_transition'
      WHEN p_acknowledged IS NOT TRUE THEN 'acknowledgements_missing'
      WHEN p_requires_approval IS TRUE THEN 'pending_approval'
      ELSE 'scheduled'
    END
    WHEN 'approve' THEN CASE WHEN p_status = 'pending_approval' THEN 'scheduled' ELSE 'illegal_transition' END
    WHEN 'decline' THEN CASE WHEN p_status = 'pending_approval' THEN 'cancelled' ELSE 'illegal_transition' END
    WHEN 'cancel' THEN CASE WHEN p_status IN ('draft', 'review', 'pending_approval', 'scheduled') THEN 'cancelled' ELSE 'illegal_transition' END
    WHEN 'complete' THEN CASE
      WHEN p_status IS DISTINCT FROM 'scheduled' THEN 'illegal_transition'
      WHEN p_due IS TRUE THEN 'completed'
      ELSE 'transfer_not_due'
    END
    ELSE 'unknown_action'
  END
$$;

-- The words of an end reason (notifications, contract termination reason).
CREATE OR REPLACE FUNCTION public.crew_end_reason_label(p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE p_reason
    WHEN 'contract_end' THEN 'Contract end'
    WHEN 'resignation' THEN 'Resignation'
    WHEN 'dismissal' THEN 'Dismissal'
    WHEN 'medical' THEN 'Medical'
    WHEN 'end_of_temporary_contract' THEN 'End of temporary contract'
    WHEN 'transfer_to_another_employer' THEN 'Transfer to another employer'
    WHEN 'retirement' THEN 'Retirement'
    WHEN 'transfer' THEN 'Transfer to another vessel'
    WHEN 'other' THEN 'Other'
  END
$$;

-- ---------------------------------------------------------------- internal helpers

-- The D-207 rule after the action's own capability check: the caller may
-- act on the person (admin_may_act_on_user over the person's structural
-- vessels: 42501 out_of_reach), and an administrator target needs a
-- manager of administrators (42501 manages_admins_required). Internal.
CREATE OR REPLACE FUNCTION public.crew_transfer_actor_check(p_profile_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user uuid;
  v_may boolean;
  v_admin_target boolean;
  v_manages boolean;
BEGIN
  SELECT p.user_id INTO v_user FROM public.profiles AS p WHERE p.id = p_profile_id;
  v_may := coalesce(public.admin_may_act_on_user(v_uid, v_user, p_company_id, p_profile_id), false);
  IF v_may IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'out_of_reach',
      DETAIL = 'You can only do this for people on the vessels you administer.';
  END IF;
  v_admin_target := v_user IS NOT NULL AND coalesce(public.user_is_admin_target(v_user, p_company_id), false);
  IF v_admin_target THEN
    v_manages := coalesce(public.user_manages_admins_for(v_uid, p_company_id), false);
    IF v_manages IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'manages_admins_required',
        DETAIL = 'Only an administrator who manages administrators can do this for an administrator.';
    END IF;
  END IF;
END;
$$;

-- A fleet approver of transfers in the company: crew_assignments.approve
-- at company level and fleet reach. False without a JWT or for an inactive
-- caller (has_capability_for). Internal.
CREATE OR REPLACE FUNCTION public.crew_transfer_is_approver(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_company_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN coalesce(public.has_capability_for(v_uid, 'vessel.crew.crew_assignments.approve', p_company_id, NULL), false)
     AND coalesce(public.fleet_reach_for(v_uid, p_company_id), false);
END;
$$;

-- The company's fleet HR logins (work_rest_is_fleet_hr, D-X1-14). Internal.
CREATE OR REPLACE FUNCTION public.crew_transfer_fleet_hr(p_company_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT p.user_id), '{}'::uuid[])
  FROM public.profiles AS p
  WHERE p.company_id = p_company_id AND p.user_id IS NOT NULL
    AND public.work_rest_is_fleet_hr(p.user_id, p_company_id)
$$;

-- The pre-transfer review of a transfer (W9; C58: receiving-vessel
-- compliance, open medical cases and restrictions, recent appraisals, HoR
-- breaches and fatigue, incomplete familiarisation and training): one
-- jsonb object {generated_at, sign_on_date, position, items[], counts}.
-- Each item {key, kind, severity danger | warning | info, title, detail,
-- fingerprint (md5 of title and detail)}. Medical items are flags only:
-- no diagnosis, note or text from the record. Internal.
CREATE OR REPLACE FUNCTION public.crew_transfer_review_snapshot(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  v_items jsonb := '[]'::jsonb;
  v_to_name text;
  v_from_name text;
  v_pos_name text;
  r record;
  v_n integer;
  v_serious integer;
  v_date date;
  v_status text;
  v_has_restriction boolean;
BEGIN
  SELECT * INTO t FROM public.crew_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT v.name INTO v_to_name FROM public.vessels AS v WHERE v.id = t.to_vessel_id;
  SELECT v.name INTO v_from_name FROM public.vessels AS v WHERE v.id = t.from_vessel_id;
  SELECT pos.name INTO v_pos_name FROM public.positions AS pos WHERE pos.id = t.to_position_id;

  -- 1. Destination document requirements for the new position, judged at the sign-on date.
  FOR r IN
    WITH rws AS (
      SELECT DISTINCT rr.id, rr.label, rr.sort_order
      FROM public.crew_requirement_rows AS rr
      JOIN public.crew_requirement_positions AS rp ON rp.row_id = rr.id AND rp.position_id = t.to_position_id
      WHERE rr.vessel_id = t.to_vessel_id AND rr.kind = 'document'
    ),
    sat AS (
      SELECT s.row_id, s.type_id FROM public.crew_requirement_row_satisfiers(ARRAY[t.to_vessel_id]) AS s
    ),
    held AS (
      SELECT rw.id AS row_id,
             count(c.id) AS docs,
             bool_or(c.no_expiry OR c.expiry_date IS NULL) AS open_ended,
             max(c.expiry_date) AS best_expiry
      FROM rws AS rw
      LEFT JOIN sat AS s ON s.row_id = rw.id
      LEFT JOIN public.crew_certificates AS c
        ON c.document_type_id = s.type_id AND c.profile_id = t.profile_id
       AND c.deleted_at IS NULL AND c.verification_status IS DISTINCT FROM 'rejected'
      GROUP BY rw.id
    )
    SELECT rw.id, rw.label, rw.sort_order, h.docs, h.open_ended, h.best_expiry
    FROM rws AS rw JOIN held AS h ON h.row_id = rw.id
    ORDER BY rw.sort_order, rw.label, rw.id
  LOOP
    IF coalesce(r.docs, 0) = 0 THEN
      v_items := v_items || jsonb_build_object('key', 'requirement:' || r.id, 'kind', 'requirement', 'severity', 'danger',
        'title', format('%s is missing', r.label),
        'detail', format('%s requires it of a %s. Nothing on file satisfies it.', v_to_name, coalesce(v_pos_name, 'crew member')));
    ELSIF r.open_ended THEN
      CONTINUE;
    ELSIF r.best_expiry < t.sign_on_date THEN
      v_items := v_items || jsonb_build_object('key', 'requirement:' || r.id, 'kind', 'requirement', 'severity', 'danger',
        'title', format('%s expires before joining', r.label),
        'detail', format('It expires on %s, before the sign-on date.', to_char(r.best_expiry, 'FMDD Mon YYYY')));
    ELSIF r.best_expiry < t.sign_on_date + 30 THEN
      v_items := v_items || jsonb_build_object('key', 'requirement:' || r.id, 'kind', 'requirement', 'severity', 'warning',
        'title', format('%s expires soon after joining', r.label),
        'detail', format('It expires on %s, within 30 days of the sign-on date.', to_char(r.best_expiry, 'FMDD Mon YYYY')));
    END IF;
  END LOOP;

  -- 2. Familiarisations the destination opens on joining (W11; X1-10's terms trigger opens them).
  SELECT count(*) INTO v_n
  FROM public.familiarisation_required_templates(t.to_vessel_id, t.to_position_id) AS ft(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.familiarization_records AS fr
    WHERE fr.template_id = ft.id AND fr.vessel_id = t.to_vessel_id AND fr.profile_id = t.profile_id
      AND fr.status = 'completed' AND coalesce(fr.actual_completion_date, fr.updated_at::date) > current_date - 365);
  IF v_n > 0 THEN
    v_items := v_items || jsonb_build_object('key', 'familiarisation_required', 'kind', 'familiarisation_required', 'severity', 'info',
      'title', format('%s familiarisation%s open on joining', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END),
      'detail', format('%s asks a %s to complete them after joining.', v_to_name, coalesce(v_pos_name, 'crew member')));
  END IF;

  -- 3. Medical flags (never clinical text): an open follow-up, a fitness restriction, an open case.
  SELECT count(*) INTO v_n
  FROM public.med_consultations AS mc
  JOIN public.hw_people AS hp ON hp.id = mc.person_id
  WHERE hp.profile_id = t.profile_id AND mc.company_id = t.company_id
    AND (mc.outcome IN ('monitoring', 'referred_physio', 'referred_shoreside', 'referred_specialist')
         OR (mc.follow_up_on IS NOT NULL AND mc.follow_up_on >= current_date));
  IF v_n > 0 THEN
    v_items := v_items || jsonb_build_object('key', 'medical:follow_up', 'kind', 'medical', 'severity', 'warning',
      'title', 'Open medical follow-up',
      'detail', 'A consultation still has a follow-up. Ask the medical officer whether it affects the transfer; the details stay in Health.');
  END IF;
  SELECT fa.status, (fa.status IN ('fit_with_restrictions', 'temporarily_unfit', 'unfit') OR nullif(btrim(coalesce(fa.restrictions, '')), '') IS NOT NULL)
  INTO v_status, v_has_restriction
  FROM public.med_fitness_assessments AS fa
  LEFT JOIN public.hw_people AS hp ON hp.id = fa.person_id
  WHERE (fa.profile_id = t.profile_id OR hp.profile_id = t.profile_id) AND fa.company_id = t.company_id
    AND (fa.expires_on IS NULL OR fa.expires_on >= current_date)
  ORDER BY fa.issued_on DESC NULLS LAST, fa.created_at DESC, fa.id
  LIMIT 1;
  IF coalesce(v_has_restriction, false) THEN
    v_items := v_items || jsonb_build_object('key', 'medical:restriction', 'kind', 'medical',
      'severity', CASE WHEN v_status IN ('temporarily_unfit', 'unfit') THEN 'danger' ELSE 'warning' END,
      'title', CASE WHEN v_status IN ('temporarily_unfit', 'unfit') THEN 'Not fit for duty on record' ELSE 'Fitness restriction on record' END,
      'detail', 'The latest fitness assessment carries a restriction. Check it with the medical officer before the transfer; the details stay in Health.');
  END IF;
  IF to_regclass('public.medical_cases') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT count(*) FROM public.medical_cases WHERE profile_id = $1 AND lower(coalesce(status::text, '''')) NOT IN (''closed'', ''resolved'', ''cancelled'')'
        INTO v_n USING t.profile_id;
      IF v_n > 0 THEN
        v_items := v_items || jsonb_build_object('key', 'medical:case', 'kind', 'medical', 'severity', 'warning',
          'title', 'Open medical case',
          'detail', 'A medical case is still open. Ask the medical officer before the transfer; the details stay in Health.');
      END IF;
    EXCEPTION WHEN undefined_column OR undefined_table OR invalid_text_representation THEN
      NULL;  -- another shape of medical_cases: no flag rather than a wrong one
    END;
  END IF;

  -- 4. The last completed performance review.
  SELECT max(coalesce(pr.completed_at, pr.updated_at))::date INTO v_date
  FROM public.performance_reviews AS pr
  WHERE pr.profile_id = t.profile_id AND pr.company_id = t.company_id AND pr.status = 'completed';
  v_items := v_items || jsonb_build_object('key', 'appraisal:last', 'kind', 'appraisal',
    'severity', CASE WHEN v_date IS NULL OR v_date < current_date - 365 THEN 'warning' ELSE 'info' END,
    'title', CASE WHEN v_date IS NULL THEN 'No performance review on record' ELSE format('Last performance review on %s', to_char(v_date, 'FMDD Mon YYYY')) END,
    'detail', CASE WHEN v_date IS NULL OR v_date < current_date - 365
                   THEN 'Consider a review on the current vessel before the person leaves it.'
                   ELSE 'Share it with the new vessel''s head of department.' END);

  -- 5. Hours of rest: breaches in the last 30 days, and joining with no rest day.
  IF t.user_id IS NOT NULL THEN
    SELECT count(*), count(*) FILTER (WHERE coalesce(nc.is_serious, false)) INTO v_n, v_serious
    FROM public.work_rest_non_conformities AS nc
    WHERE nc.crew_id = t.user_id AND nc.window_end >= now() - interval '30 days'
      AND nc.superseded_at IS NULL AND nc.review_outcome IS DISTINCT FROM 'dismissed';
    IF v_n > 0 THEN
      v_items := v_items || jsonb_build_object('key', 'hours_of_rest:breaches', 'kind', 'hours_of_rest',
        'severity', CASE WHEN v_serious > 0 THEN 'danger' ELSE 'warning' END,
        'title', format('%s hours-of-rest breach%s in the last 30 days', v_n, CASE WHEN v_n = 1 THEN '' ELSE 'es' END),
        'detail', CASE WHEN v_serious > 0 THEN format('%s of them serious. Plan rest before the first watch on the new vessel.', v_serious)
                       ELSE 'Plan rest before the first watch on the new vessel.' END);
    END IF;
  END IF;
  IF t.sign_on_date = t.sign_off_date THEN
    v_items := v_items || jsonb_build_object('key', 'rest_gap', 'kind', 'rest_gap', 'severity', 'warning',
      'title', 'No rest day between the vessels',
      'detail', format('They sign off %s and join %s on the same day.', coalesce(v_from_name, 'the vessel'), coalesce(v_to_name, 'the new vessel')));
  END IF;

  -- 6. Open familiarisation forms and training applications.
  SELECT count(*) INTO v_n
  FROM public.familiarization_records AS fr
  WHERE fr.profile_id = t.profile_id AND fr.status <> 'completed';
  IF v_n > 0 THEN
    v_items := v_items || jsonb_build_object('key', 'familiarisation:open', 'kind', 'familiarisation', 'severity', 'warning',
      'title', format('%s familiarisation form%s still open', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END),
      'detail', 'Finish or close them on their vessel before the person leaves it.');
  END IF;
  IF t.user_id IS NOT NULL THEN
    SELECT count(*) INTO v_n
    FROM public.development_applications AS da
    WHERE da.crew_member_id = t.user_id AND da.company_id = t.company_id
      AND da.status IN ('submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review', 'approved', 'discretionary_approved', 'enrolled');
    IF v_n > 0 THEN
      v_items := v_items || jsonb_build_object('key', 'training:open', 'kind', 'training', 'severity', 'info',
        'title', format('%s training application%s in progress', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END),
        'detail', 'They stay with the vessel they were raised on; tell its approvers about the move.');
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(i || jsonb_build_object('fingerprint', md5((i ->> 'title') || '|' || (i ->> 'detail'))) ORDER BY o), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(v_items) WITH ORDINALITY AS x(i, o);

  RETURN jsonb_build_object(
    'generated_at', now(),
    'sign_on_date', t.sign_on_date,
    'position', jsonb_build_object('id', t.to_position_id, 'name', v_pos_name),
    'items', v_items,
    'counts', jsonb_build_object(
      'danger', (SELECT count(*) FROM jsonb_array_elements(v_items) AS e WHERE e ->> 'severity' = 'danger'),
      'warning', (SELECT count(*) FROM jsonb_array_elements(v_items) AS e WHERE e ->> 'severity' = 'warning'),
      'info', (SELECT count(*) FROM jsonb_array_elements(v_items) AS e WHERE e ->> 'severity' = 'info'))
  );
END;
$$;

-- Every review item has an acknowledgement with the same fingerprint.
CREATE OR REPLACE FUNCTION public.crew_transfer_acknowledged(p_snapshot jsonb, p_items jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_snapshot IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p_snapshot -> 'items', '[]'::jsonb)) AS i
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) AS a
      WHERE a ->> 'key' = i ->> 'key' AND a ->> 'fingerprint' = i ->> 'fingerprint'))
$$;

-- A transfer as the wizard reads it, with what the caller may do (the same
-- rules the definers apply). Internal.
CREATE OR REPLACE FUNCTION public.crew_transfer_json(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  v_uid uuid := auth.uid();
  v_assign boolean;
  v_assign_any boolean;
  v_approver boolean;
  v_ack boolean;
  v_open boolean;
BEGIN
  SELECT * INTO t FROM public.crew_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_assign := coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.assign', t.from_vessel_id), false)
          AND coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.assign', t.to_vessel_id), false);
  v_assign_any := coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.assign', t.from_vessel_id), false)
              OR coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.assign', t.to_vessel_id), false);
  v_approver := public.crew_transfer_is_approver(t.company_id);
  v_ack := public.crew_transfer_acknowledged(t.gaps_snapshot, t.review_items);
  v_open := t.status IN ('draft', 'review', 'pending_approval', 'scheduled');
  RETURN jsonb_build_object(
    'id', t.id,
    'status', t.status,
    'company_id', t.company_id,
    'profile_id', t.profile_id,
    'user_id', t.user_id,
    'person', (SELECT jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name, 'preferred_name', p.preferred_name)
               FROM public.profiles AS p WHERE p.id = t.profile_id),
    'from_vessel', (SELECT jsonb_build_object('id', v.id, 'name', v.name, 'code', v.code) FROM public.vessels AS v WHERE v.id = t.from_vessel_id),
    'to_vessel', (SELECT jsonb_build_object('id', v.id, 'name', v.name, 'code', v.code) FROM public.vessels AS v WHERE v.id = t.to_vessel_id),
    'from_assignment_id', t.from_assignment_id,
    'to_assignment_id', t.to_assignment_id,
    'from_position', (SELECT jsonb_build_object('id', pos.id, 'name', pos.name) FROM public.positions AS pos WHERE pos.id = t.from_position_id),
    'to_position', (SELECT jsonb_build_object('id', pos.id, 'name', pos.name) FROM public.positions AS pos WHERE pos.id = t.to_position_id),
    'same_role', t.same_role,
    'sign_off_date', t.sign_off_date,
    'sign_on_date', t.sign_on_date,
    'requires_approval', t.requires_approval,
    'review', t.gaps_snapshot,
    'acknowledgements', t.review_items,
    'acknowledged', v_ack,
    'notes', t.notes,
    'created_at', t.created_at,
    'created_by_name', (SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
                        FROM public.profiles AS p WHERE p.user_id = t.created_by),
    'submitted_at', t.submitted_at,
    'submitted_by_name', (SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
                          FROM public.profiles AS p WHERE p.user_id = t.submitted_by),
    'approved_at', t.approved_at,
    'approved_by_name', (SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
                         FROM public.profiles AS p WHERE p.user_id = t.approved_by),
    'decline_reason', t.decline_reason,
    'cancelled_at', t.cancelled_at,
    'cancelled_by_name', (SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
                          FROM public.profiles AS p WHERE p.user_id = t.cancelled_by),
    'cancelled_reason', t.cancelled_reason,
    'completed_at', t.completed_at,
    'compliant_on_destination_at', t.compliant_on_destination_at,
    'rights', jsonb_build_object(
      'can_edit', v_assign AND t.status IN ('draft', 'review'),
      'can_submit', v_assign AND t.status = 'review' AND v_ack,
      'can_decide', v_approver AND t.status = 'pending_approval' AND t.submitted_by IS DISTINCT FROM v_uid,
      'can_cancel', v_open AND (v_assign_any OR v_approver),
      'can_complete', v_assign AND t.status = 'scheduled' AND t.sign_off_date <= current_date,
      'decide_block', CASE WHEN t.status = 'pending_approval' AND v_approver AND t.submitted_by = v_uid THEN 'own_submission' END
    )
  );
END;
$$;

-- The checks every transfer step shares (start, review, acknowledge,
-- submit, complete): assign on both vessels, no external viewer, the
-- person of the company, D-207. Returns the company. Internal.
CREATE OR REPLACE FUNCTION public.crew_transfer_gate(p_from_vessel_id uuid, p_to_vessel_id uuid, p_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_to_company uuid;
BEGIN
  IF p_from_vessel_id IS NOT DISTINCT FROM p_to_vessel_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'same_vessel', DETAIL = 'Choose another vessel to transfer to.', HINT = 'to_vessel_id';
  END IF;
  v_company := public.crew_vessel_gate('vessel.crew.crew_assignments.assign', p_from_vessel_id, 'You can''t transfer crew from this vessel.');
  v_to_company := public.crew_vessel_gate('vessel.crew.crew_assignments.assign', p_to_vessel_id, 'You can''t transfer crew to this vessel.');
  IF v_to_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t transfer crew to this vessel.';
  END IF;
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t transfer crew.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'person_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  PERFORM public.crew_transfer_actor_check(p_profile_id, v_company);
  RETURN v_company;
END;
$$;

-- Loads a transfer for a step (FOR UPDATE): P0002 when it does not exist,
-- belongs to another company or is invisible to the caller. Internal.
CREATE OR REPLACE FUNCTION public.crew_transfer_load(p_transfer_id uuid)
RETURNS public.crew_transfers
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  SELECT * INTO t FROM public.crew_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND OR t.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'transfer_not_found', DETAIL = 'This transfer could not be found.';
  END IF;
  RETURN t;
END;
$$;

-- The one completion (D-207, C58): everything or nothing. p_actor is the
-- signed-in caller (transfer_crew) or NULL (the sweep). The two
-- crew_assignments writes run without storm.access_engine, so the
-- platform guard decides as the caller (no JWT for the sweep: exempt, as
-- the service role always is). Internal; callers hold the transfer row
-- lock and have checked the gate.
CREATE OR REPLACE FUNCTION public.crew_transfer_apply(p_transfer_id uuid, p_actor uuid, p_today date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  a public.crew_assignments;
  v_pos public.positions;
  v_dept text;
  v_rank text;
  v_new uuid;
  v_ft public.crew_assignment_terms;
  v_inserted boolean;
  v_moved integer := 0;
  v_ended_terms integer := 0;
  v_prev text := current_setting('storm.crew_engine', true);
  v_next text;
  v_from_name text;
  v_to_name text;
  v_person text;
  v_must uuid[];
BEGIN
  SELECT * INTO t FROM public.crew_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'transfer_not_found', DETAIL = 'This transfer could not be found.';
  END IF;
  v_next := public.crew_transfer_next(t.status, 'complete', t.requires_approval, true, t.sign_off_date <= coalesce(p_today, current_date));
  IF v_next IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_next,
      DETAIL = CASE v_next WHEN 'transfer_not_due' THEN 'This transfer can be completed from its sign-off date.'
                           ELSE 'Only a scheduled transfer can be completed.' END;
  END IF;
  SELECT * INTO a FROM public.crew_assignments WHERE id = t.from_assignment_id FOR UPDATE;
  IF NOT FOUND OR a.vessel_id IS DISTINCT FROM t.from_vessel_id OR a.user_id IS DISTINCT FROM t.user_id
     OR NOT coalesce(a.is_current, false)
     OR (coalesce(a.leave_date, a.end_date) IS NOT NULL AND coalesce(a.leave_date, a.end_date) < t.sign_off_date) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'assignment_changed',
      DETAIL = 'The person''s assignment on the vessel changed after the transfer was planned. Cancel this transfer and start again.';
  END IF;
  SELECT * INTO v_pos FROM public.positions WHERE id = t.to_position_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_unknown', DETAIL = 'The new position is no longer available. Cancel this transfer and start again.';
  END IF;
  SELECT d.label INTO v_dept FROM public.departments AS d WHERE d.key = v_pos.department_key;
  v_rank := CASE WHEN t.same_role THEN coalesce(nullif(btrim(a.rank), ''), v_pos.name) ELSE v_pos.name END;

  PERFORM set_config('storm.crew_engine', 'on', true);

  -- 1. End the origin assignment at the sign-off (the guard decides as the caller).
  UPDATE public.crew_assignments
  SET leave_date = t.sign_off_date, end_date = t.sign_off_date, end_reason = 'transfer',
      updated_by = coalesce(p_actor, updated_by), updated_at = now()
  WHERE id = a.id;

  -- 2. The destination assignment from the sign-on (the guard decides as the caller).
  INSERT INTO public.crew_assignments (user_id, vessel_id, position, rank, department, join_date, start_date, is_current, notes, created_by, updated_by)
  VALUES (t.user_id, t.to_vessel_id, v_pos.name, v_rank, v_dept, t.sign_on_date, t.sign_on_date, true, t.notes, p_actor, p_actor)
  RETURNING id INTO v_new;

  -- 3. Terms: end the origin's open terms; the destination's (the trigger opens its familiarisations).
  SELECT * INTO v_ft FROM public.crew_assignment_terms
  WHERE profile_id = t.profile_id AND vessel_id = t.from_vessel_id AND end_date IS NULL
  ORDER BY start_date DESC, id LIMIT 1;
  UPDATE public.crew_assignment_terms
  SET end_date = t.sign_off_date, end_reason = 'transfer', end_notes = NULL, updated_by = coalesce(p_actor, updated_by)
  WHERE profile_id = t.profile_id AND vessel_id = t.from_vessel_id AND end_date IS NULL AND start_date <= t.sign_off_date;
  GET DIAGNOSTICS v_ended_terms = ROW_COUNT;
  INSERT INTO public.crew_assignment_terms AS x (
    company_id, profile_id, vessel_id, assignment_id, position_id, department_key, start_date, date_joining_vessel,
    contract_type_key, leave_method, leave_days_per_year, leave_ratio_on, leave_ratio_off, created_by, updated_by
  ) VALUES (
    t.company_id, t.profile_id, t.to_vessel_id, v_new, v_pos.id, v_pos.department_key, t.sign_on_date, t.sign_on_date,
    v_ft.contract_type_key, v_ft.leave_method, v_ft.leave_days_per_year, v_ft.leave_ratio_on, v_ft.leave_ratio_off, p_actor, p_actor
  )
  ON CONFLICT (profile_id, vessel_id, start_date) DO UPDATE SET
    assignment_id = EXCLUDED.assignment_id, position_id = EXCLUDED.position_id, department_key = EXCLUDED.department_key,
    date_joining_vessel = EXCLUDED.date_joining_vessel, end_date = NULL, end_reason = NULL, end_notes = NULL,
    updated_by = EXCLUDED.updated_by
  RETURNING (xmax = 0) INTO v_inserted;
  IF NOT v_inserted THEN
    -- An existing row was reused: no INSERT trigger fired, so open the familiarisations here (never fails the move).
    BEGIN
      PERFORM public.familiarisation_open_required(t.profile_id, t.to_vessel_id, v_pos.id, t.sign_on_date);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'crew_transfer_apply: required familiarisations not opened (%): %', SQLSTATE, SQLERRM;
    END;
  END IF;

  -- 4. Planner periods that start after the sign-off move with the person.
  UPDATE public.frp_rotation_assignments
  SET vessel_id = t.to_vessel_id
  WHERE profile_id = t.profile_id AND vessel_id = t.from_vessel_id AND start_date > t.sign_off_date;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- 5. The movements on both vessels.
  INSERT INTO public.crew_movements (company_id, vessel_id, profile_id, kind, occurred_on, source, source_id, created_by, updated_by)
  VALUES (t.company_id, t.from_vessel_id, t.profile_id, 'transfer_out', t.sign_off_date, 'transfer', t.id, p_actor, p_actor),
         (t.company_id, t.to_vessel_id, t.profile_id, 'transfer_in', t.sign_on_date, 'transfer', t.id, p_actor, p_actor);

  -- 6. Completed.
  UPDATE public.crew_transfers
  SET status = 'completed', completed_at = now(), to_assignment_id = v_new, updated_by = coalesce(p_actor, updated_by)
  WHERE id = t.id;

  -- 7. Fleet HR and the people who planned it hear of it (D-128: never fails the move).
  BEGIN
    SELECT v.name INTO v_from_name FROM public.vessels AS v WHERE v.id = t.from_vessel_id;
    SELECT v.name INTO v_to_name FROM public.vessels AS v WHERE v.id = t.to_vessel_id;
    SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
    INTO v_person FROM public.profiles AS p WHERE p.id = t.profile_id;
    v_must := ARRAY(
      SELECT DISTINCT u FROM unnest(public.crew_transfer_fleet_hr(t.company_id) || ARRAY[t.created_by, t.submitted_by, t.approved_by]) AS u
      WHERE u IS NOT NULL AND u IS DISTINCT FROM p_actor);
    PERFORM public.emit_notification_event(
      p_type_key := 'crew_transfer_completed',
      p_company_id := t.company_id,
      p_title := left(format('%s moved to %s', coalesce(v_person, 'A crew member'), coalesce(v_to_name, 'another vessel')), 120),
      p_link_scope := 'vessel',
      p_vessel_id := t.to_vessel_id,
      p_body := left(format('Signed off %s on %s; joins as %s on %s.', coalesce(v_from_name, 'the vessel'), to_char(t.sign_off_date, 'FMDD Mon YYYY'),
                            v_pos.name, to_char(t.sign_on_date, 'FMDD Mon YYYY')), 280),
      p_link_path := 'crew/list',
      p_must_act_user_ids := v_must,
      p_payload := jsonb_build_object('transfer_id', t.id, 'profile_id', t.profile_id, 'from_vessel_id', t.from_vessel_id, 'to_vessel_id', t.to_vessel_id),
      p_dedupe_key := 'crew_transfer_completed:' || t.id,
      p_module_key := 'crew'
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'crew_transfer_apply: crew_transfer_completed not emitted (%): %', SQLSTATE, SQLERRM;
  END;

  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);
  RETURN jsonb_build_object('transfer_id', t.id, 'to_assignment_id', v_new, 'terms_ended', v_ended_terms, 'periods_moved', v_moved);
END;
$$;

-- ---------------------------------------------------------------- RPCs: the transfer

-- What the wizard needs to start (gap/04 W9): the person, the origin (the
-- current assignment and its position), the destinations the caller may
-- transfer to (the company's other reachable vessels where the caller
-- holds crew_assignments.assign), each with whether fleet approval applies
-- and its positions, the person's open transfer (to resume it), and
-- `blocked` (a code and a sentence) when the person cannot be transferred
-- from here: pending_placement_not_transferable (D-225), not_on_vessel,
-- out_of_reach, manages_admins_required. Gate: assign on the origin, no
-- external viewer; P0002 for a person of another company.
CREATE OR REPLACE FUNCTION public.transfer_crew_options(p_profile_id uuid, p_from_vessel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_profile public.profiles;
  a public.crew_assignments;
  v_from_pos uuid;
  v_blocked jsonb;
  v_open uuid;
  v_from_approval boolean;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_assignments.assign', p_from_vessel_id, 'You can''t transfer crew from this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t transfer crew.';
  END IF;
  SELECT * INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_profile.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'person_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  SELECT ca.* INTO a
  FROM public.crew_assignments AS ca
  WHERE v_profile.user_id IS NOT NULL AND ca.user_id = v_profile.user_id AND ca.vessel_id = p_from_vessel_id
    AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
  ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
  LIMIT 1;
  IF a.id IS NULL THEN
    v_blocked := CASE
      WHEN coalesce(v_profile.is_imported, false) AND v_profile.imported_vessel_id = p_from_vessel_id
        THEN jsonb_build_object('code', 'pending_placement_not_transferable', 'message', 'Change the pending vessel on the profile.')
      ELSE jsonb_build_object('code', 'not_on_vessel', 'message', 'This person is not on this vessel''s crew.')
    END;
  END IF;
  -- The D-207 answer as a code (no exception for the wizard).
  IF v_blocked IS NULL AND NOT coalesce(public.admin_may_act_on_user(auth.uid(), v_profile.user_id, v_company, p_profile_id), false) THEN
    v_blocked := jsonb_build_object('code', 'out_of_reach', 'message', 'You can only do this for people on the vessels you administer.');
  END IF;
  IF v_blocked IS NULL AND v_profile.user_id IS NOT NULL AND coalesce(public.user_is_admin_target(v_profile.user_id, v_company), false)
     AND NOT coalesce(public.user_manages_admins_for(auth.uid(), v_company), false) THEN
    v_blocked := jsonb_build_object('code', 'manages_admins_required', 'message', 'Only an administrator who manages administrators can do this for an administrator.');
  END IF;
  v_from_pos := CASE WHEN a.id IS NULL THEN NULL
                     ELSE coalesce(public.crew_position_for(v_company, p_from_vessel_id, a.position), public.crew_position_for(v_company, p_from_vessel_id, a.rank)) END;
  SELECT t.id INTO v_open FROM public.crew_transfers AS t
  WHERE t.profile_id = p_profile_id AND t.status IN ('draft', 'review', 'pending_approval', 'scheduled')
  ORDER BY t.created_at DESC, t.id LIMIT 1;
  SELECT coalesce(s.transfer_requires_fleet_approval, false) INTO v_from_approval FROM public.vessel_crew_settings AS s WHERE s.vessel_id = p_from_vessel_id;

  RETURN jsonb_build_object(
    'person', jsonb_build_object('profile_id', v_profile.id, 'user_id', v_profile.user_id, 'first_name', v_profile.first_name,
                                 'last_name', v_profile.last_name, 'preferred_name', v_profile.preferred_name),
    'from', jsonb_build_object(
      'vessel_id', p_from_vessel_id,
      'vessel_name', (SELECT v.name FROM public.vessels AS v WHERE v.id = p_from_vessel_id),
      'assignment_id', a.id,
      'position_text', nullif(btrim(coalesce(nullif(btrim(a.position), ''), a.rank)), ''),
      'position_id', v_from_pos,
      'position_key', (SELECT pos.key FROM public.positions AS pos WHERE pos.id = v_from_pos),
      'join_date', coalesce(a.join_date, a.start_date),
      'is_master_office', coalesce(public.record_normalise_office(a.position) IN ('master', 'captain'), false)
                          OR coalesce(public.record_normalise_office(a.rank) IN ('master', 'captain'), false)),
    'destinations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'vessel_id', v.id, 'name', v.name, 'code', v.code,
               'requires_approval', coalesce(v_from_approval, false) OR coalesce(s.transfer_requires_fleet_approval, false),
               'positions', coalesce((
                 SELECT jsonb_agg(jsonb_build_object('id', x.id, 'key', x.key, 'name', x.name, 'department_key', x.department_key,
                                                     'department_label', x.dlabel, 'rank_tier', x.rank_tier) ORDER BY x.ord, x.sort, x.name)
                 FROM (
                   SELECT DISTINCT ON (pos.key) pos.id, pos.key, pos.name, pos.department_key, d.label AS dlabel, pos.rank_tier,
                          coalesce(pm.sort_order, pos.sort_order) AS sort, CASE WHEN coalesce(pm.is_listed, false) THEN 0 ELSE 1 END AS ord
                   FROM public.positions AS pos
                   JOIN public.departments AS d ON d.key = pos.department_key
                   LEFT JOIN public.position_manning AS pm ON pm.vessel_id = v.id AND pm.position_id = pos.id
                   WHERE pos.is_active AND (pos.company_id IS NULL OR (pos.company_id = v_company AND (pos.vessel_id IS NULL OR pos.vessel_id = v.id)))
                   ORDER BY pos.key, (pos.vessel_id IS NULL), (pos.company_id IS NULL), pos.id
                 ) AS x), '[]'::jsonb),
               'same_position_id', CASE WHEN a.id IS NULL THEN NULL
                                        ELSE coalesce(public.crew_position_for(v_company, v.id, a.position), public.crew_position_for(v_company, v.id, a.rank)) END
             ) ORDER BY v.name, v.id)
      FROM public.vessels AS v
      LEFT JOIN public.vessel_crew_settings AS s ON s.vessel_id = v.id
      WHERE v.company_id = v_company AND v.id <> p_from_vessel_id
        AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
        AND coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.assign', v.id), false)
    ), '[]'::jsonb),
    'open_transfer', CASE WHEN v_open IS NULL THEN NULL ELSE public.crew_transfer_json(v_open) END,
    'blocked', v_blocked
  );
END;
$$;

-- Starts (or restarts) a transfer in Draft (W9 step 1). p_to_position_id
-- NULL keeps the same role: the origin title's position as the destination
-- sees it (22023 position_required when it has none). Dates: sign-off
-- from 31 days ago to a year ahead and not before the origin join date,
-- sign-on on or after the sign-off and within 90 days of it. A draft or
-- in-review transfer the caller started for the person from this vessel is
-- started again with these details; any other open transfer of the person
-- is refused (22023 transfer_open). Gate: crew_transfer_gate (assign on
-- both vessels, D-246, D-207), the Master rule (D-198), moving yourself,
-- the pending placement (D-225). Returns the transfer (crew_transfer_json).
CREATE OR REPLACE FUNCTION public.transfer_crew_start(
  p_profile_id uuid,
  p_from_vessel_id uuid,
  p_to_vessel_id uuid,
  p_to_position_id uuid,
  p_sign_off_date date,
  p_sign_on_date date,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_profile public.profiles;
  a public.crew_assignments;
  v_from_pos uuid;
  v_to_pos uuid;
  v_to_key text;
  v_from_key text;
  v_master boolean;
  v_admin_from boolean;
  v_admin_to boolean;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_existing public.crew_transfers;
  v_id uuid;
  v_prev text := current_setting('storm.crew_engine', true);
BEGIN
  v_company := public.crew_transfer_gate(p_from_vessel_id, p_to_vessel_id, p_profile_id);
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;

  SELECT ca.* INTO a
  FROM public.crew_assignments AS ca
  WHERE v_profile.user_id IS NOT NULL AND ca.user_id = v_profile.user_id AND ca.vessel_id = p_from_vessel_id
    AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
  ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
  LIMIT 1;
  IF a.id IS NULL THEN
    IF coalesce(v_profile.is_imported, false) AND v_profile.imported_vessel_id = p_from_vessel_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pending_placement_not_transferable', DETAIL = 'Change the pending vessel on the profile.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_on_vessel', DETAIL = 'This person is not on this vessel''s crew.';
  END IF;

  -- Dates.
  IF p_sign_off_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'date_required', DETAIL = 'Enter the sign-off date.', HINT = 'sign_off_date';
  END IF;
  IF p_sign_on_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'date_required', DETAIL = 'Enter the sign-on date.', HINT = 'sign_on_date';
  END IF;
  IF p_sign_off_date < current_date - 31 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sign_off_too_early', DETAIL = 'The sign-off date can be at most 31 days ago.', HINT = 'sign_off_date';
  END IF;
  IF p_sign_off_date > current_date + 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sign_off_too_late', DETAIL = 'Plan the transfer within a year.', HINT = 'sign_off_date';
  END IF;
  IF p_sign_off_date < coalesce(a.join_date, a.start_date) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sign_off_before_join', DETAIL = 'The sign-off date is before they joined this vessel.', HINT = 'sign_off_date';
  END IF;
  IF p_sign_on_date < p_sign_off_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'dates_invalid', DETAIL = 'The sign-on date cannot be before the sign-off date.', HINT = 'sign_on_date';
  END IF;
  IF p_sign_on_date > p_sign_off_date + 90 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'gap_too_long', DETAIL = 'Sign on within 90 days of signing off.', HINT = 'sign_on_date';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notes_too_long', DETAIL = 'Keep the notes under 2,000 characters.', HINT = 'notes';
  END IF;

  -- The position: the same role, or a position the destination can see.
  v_from_pos := coalesce(public.crew_position_for(v_company, p_from_vessel_id, a.position), public.crew_position_for(v_company, p_from_vessel_id, a.rank));
  IF p_to_position_id IS NULL THEN
    v_to_pos := coalesce(public.crew_position_for(v_company, p_to_vessel_id, a.position), public.crew_position_for(v_company, p_to_vessel_id, a.rank));
    IF v_to_pos IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_required', DETAIL = 'Choose the position on the new vessel.', HINT = 'to_position_id';
    END IF;
  ELSE
    SELECT pos.id INTO v_to_pos FROM public.positions AS pos
    WHERE pos.id = p_to_position_id AND pos.is_active
      AND (pos.company_id IS NULL OR (pos.company_id = v_company AND (pos.vessel_id IS NULL OR pos.vessel_id = p_to_vessel_id)));
    IF v_to_pos IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_unknown', DETAIL = 'Choose a position from the new vessel''s list.', HINT = 'to_position_id';
    END IF;
  END IF;
  SELECT pos.key INTO v_to_key FROM public.positions AS pos WHERE pos.id = v_to_pos;
  SELECT pos.key INTO v_from_key FROM public.positions AS pos WHERE pos.id = v_from_pos;

  -- D-198: a Master or Captain (now, or on the destination) needs users-access admin of both vessels.
  v_master := coalesce(public.record_normalise_office(a.position) IN ('master', 'captain'), false)
           OR coalesce(public.record_normalise_office(a.rank) IN ('master', 'captain'), false)
           OR coalesce(v_to_key IN ('master', 'captain'), false);
  v_admin_from := coalesce(public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_company, p_from_vessel_id), false);
  v_admin_to := coalesce(public.has_capability_for(v_uid, 'admin.access.users_access.admin', v_company, p_to_vessel_id), false);
  IF v_master AND NOT (v_admin_from AND v_admin_to) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'master_transfer_refused',
      DETAIL = 'Only a users-access administrator of both vessels can transfer a Master.';
  END IF;
  IF v_profile.user_id = v_uid AND NOT v_admin_to THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'self_transfer_refused',
      DETAIL = 'Only a users-access administrator can move themselves to another vessel.';
  END IF;

  -- One open transfer per person: the caller's own draft or review from this vessel restarts.
  SELECT * INTO v_existing FROM public.crew_transfers AS t
  WHERE t.profile_id = p_profile_id AND t.status IN ('draft', 'review', 'pending_approval', 'scheduled')
  ORDER BY t.created_at DESC, t.id LIMIT 1
  FOR UPDATE;
  IF v_existing.id IS NOT NULL
     AND NOT (v_existing.status IN ('draft', 'review') AND v_existing.created_by = v_uid AND v_existing.from_vessel_id = p_from_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'transfer_open',
      DETAIL = 'This person already has a transfer in progress. Open it from their profile.';
  END IF;

  PERFORM set_config('storm.crew_engine', 'on', true);
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.crew_transfers
    SET to_vessel_id = p_to_vessel_id, from_assignment_id = a.id, from_position_id = v_from_pos, to_position_id = v_to_pos,
        same_role = (v_from_key IS NOT NULL AND v_from_key = v_to_key), sign_off_date = p_sign_off_date, sign_on_date = p_sign_on_date,
        status = 'draft', gaps_snapshot = NULL, review_items = '[]'::jsonb, notes = v_notes, updated_by = v_uid
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.crew_transfers (company_id, profile_id, user_id, from_vessel_id, to_vessel_id, from_assignment_id,
                                       from_position_id, to_position_id, same_role, sign_off_date, sign_on_date, status, notes,
                                       created_by, updated_by)
    VALUES (v_company, p_profile_id, v_profile.user_id, p_from_vessel_id, p_to_vessel_id, a.id, v_from_pos, v_to_pos,
            (v_from_key IS NOT NULL AND v_from_key = v_to_key), p_sign_off_date, p_sign_on_date, 'draft', v_notes, v_uid, v_uid)
    RETURNING id INTO v_id;
  END IF;
  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);
  RETURN public.crew_transfer_json(v_id);
END;
$$;

-- Runs the pre-transfer review (W9 step 2) and stores it in
-- gaps_snapshot: Draft or Review -> Review. Acknowledgements of items that
-- still read the same (same key and fingerprint) are kept. Gate as start.
-- Returns the transfer with its review.
CREATE OR REPLACE FUNCTION public.transfer_crew_review(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  v_next text;
  v_snapshot jsonb;
  v_kept jsonb;
  v_prev text := current_setting('storm.crew_engine', true);
BEGIN
  t := public.crew_transfer_load(p_transfer_id);
  PERFORM public.crew_transfer_gate(t.from_vessel_id, t.to_vessel_id, t.profile_id);
  v_next := public.crew_transfer_next(t.status, 'review', t.requires_approval, NULL, NULL);
  IF v_next IS DISTINCT FROM 'review' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_next, DETAIL = 'This transfer has moved past its review.';
  END IF;
  v_snapshot := public.crew_transfer_review_snapshot(t.id);
  SELECT coalesce(jsonb_agg(a), '[]'::jsonb) INTO v_kept
  FROM jsonb_array_elements(coalesce(t.review_items, '[]'::jsonb)) AS a
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot -> 'items') AS i
                WHERE i ->> 'key' = a ->> 'key' AND i ->> 'fingerprint' = a ->> 'fingerprint');
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_transfers
  SET status = 'review', gaps_snapshot = v_snapshot, review_items = v_kept, updated_by = auth.uid()
  WHERE id = t.id;
  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);
  RETURN public.crew_transfer_json(t.id);
END;
$$;

-- Records the acknowledgements (W9): p_items is an array of
-- {key, acknowledged: true, note?}; every key must be an item of the
-- review (22023 item_unknown), acknowledged must be true (22023
-- tick_required), a note at most 500 characters. The array replaces the
-- earlier ticks. Each stored tick keeps the item's fingerprint, the
-- caller and the time. Review only. Returns the transfer.
CREATE OR REPLACE FUNCTION public.transfer_crew_acknowledge(p_transfer_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  v_next text;
  v_uid uuid := auth.uid();
  v_acks jsonb := '[]'::jsonb;
  e jsonb;
  v_item jsonb;
  v_note text;
  v_prev text := current_setting('storm.crew_engine', true);
BEGIN
  t := public.crew_transfer_load(p_transfer_id);
  PERFORM public.crew_transfer_gate(t.from_vessel_id, t.to_vessel_id, t.profile_id);
  v_next := public.crew_transfer_next(t.status, 'acknowledge', t.requires_approval, NULL, NULL);
  IF v_next IS DISTINCT FROM 'review' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_next, DETAIL = 'Only a transfer in review takes acknowledgements.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid', DETAIL = 'The acknowledgements could not be read.';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_items) AS x LOOP
    IF jsonb_typeof(e) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid', DETAIL = 'The acknowledgements could not be read.';
    END IF;
    SELECT i INTO v_item FROM jsonb_array_elements(coalesce(t.gaps_snapshot -> 'items', '[]'::jsonb)) AS i WHERE i ->> 'key' = e ->> 'key';
    IF v_item IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'item_unknown', DETAIL = 'One of the items is not in this review. Run the review again.', HINT = e ->> 'key';
    END IF;
    IF (e -> 'acknowledged') IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'tick_required', DETAIL = 'Tick each item you acknowledge.', HINT = e ->> 'key';
    END IF;
    v_note := nullif(btrim(coalesce(e ->> 'note', '')), '');
    IF v_note IS NOT NULL AND length(v_note) > 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'note_too_long', DETAIL = 'Keep each note under 500 characters.', HINT = e ->> 'key';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_acks) AS k WHERE k ->> 'key' = e ->> 'key') THEN
      v_acks := v_acks || jsonb_build_object('key', e ->> 'key', 'fingerprint', v_item ->> 'fingerprint', 'acknowledged', true,
                                             'note', v_note, 'by', v_uid, 'at', now());
    END IF;
    v_item := NULL;
  END LOOP;
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_transfers SET review_items = v_acks, updated_by = v_uid WHERE id = t.id;
  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);
  RETURN public.crew_transfer_json(t.id);
END;
$$;

-- Submits the reviewed transfer (W9 step 3): Pending approval when either
-- vessel asks for fleet approval (D-X1-12), else Scheduled; every review
-- item needs its tick (22023 acknowledgements_missing). Fleet HR and the
-- DPA hear of it (crew_transfer_submitted; the link opens the person's
-- profile with the transfer). Gate as start. Returns the transfer.
CREATE OR REPLACE FUNCTION public.transfer_crew_submit(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  v_uid uuid := auth.uid();
  v_requires boolean;
  v_next text;
  v_person text;
  v_from_name text;
  v_to_name text;
  v_prev text := current_setting('storm.crew_engine', true);
BEGIN
  t := public.crew_transfer_load(p_transfer_id);
  PERFORM public.crew_transfer_gate(t.from_vessel_id, t.to_vessel_id, t.profile_id);
  SELECT coalesce(bool_or(s.transfer_requires_fleet_approval), false) INTO v_requires
  FROM public.vessel_crew_settings AS s WHERE s.vessel_id IN (t.from_vessel_id, t.to_vessel_id);
  v_next := public.crew_transfer_next(t.status, 'submit', v_requires, public.crew_transfer_acknowledged(t.gaps_snapshot, t.review_items), NULL);
  IF v_next NOT IN ('pending_approval', 'scheduled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_next,
      DETAIL = CASE v_next WHEN 'acknowledgements_missing' THEN 'Tick every review item before submitting.'
                           ELSE 'Only a transfer in review can be submitted.' END;
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_transfers
  SET status = v_next, requires_approval = v_requires, submitted_by = v_uid, submitted_at = now(), updated_by = v_uid
  WHERE id = t.id;
  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);

  BEGIN
    SELECT v.name INTO v_from_name FROM public.vessels AS v WHERE v.id = t.from_vessel_id;
    SELECT v.name INTO v_to_name FROM public.vessels AS v WHERE v.id = t.to_vessel_id;
    SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
    INTO v_person FROM public.profiles AS p WHERE p.id = t.profile_id;
    PERFORM public.emit_notification_event(
      p_type_key := 'crew_transfer_submitted',
      p_company_id := t.company_id,
      p_title := left(CASE WHEN v_next = 'pending_approval'
                           THEN format('Approve the transfer of %s', coalesce(v_person, 'a crew member'))
                           ELSE format('Transfer of %s scheduled', coalesce(v_person, 'a crew member')) END, 120),
      p_link_scope := 'vessel',
      p_vessel_id := t.from_vessel_id,
      p_body := left(format('%s to %s: signs off %s, joins %s.', coalesce(v_from_name, 'The vessel'), coalesce(v_to_name, 'another vessel'),
                            to_char(t.sign_off_date, 'FMDD Mon YYYY'), to_char(t.sign_on_date, 'FMDD Mon YYYY')), 280),
      p_severity := CASE WHEN v_next = 'pending_approval' THEN 'warning' ELSE 'info' END,
      p_link_path := format('crew/people/%s/personal?transfer=%s', t.profile_id, t.id),
      p_must_act_user_ids := ARRAY(SELECT u FROM unnest(public.crew_transfer_fleet_hr(t.company_id)) AS u WHERE u IS DISTINCT FROM v_uid),
      p_audience := ARRAY['dpa'],
      p_payload := jsonb_build_object('transfer_id', t.id, 'profile_id', t.profile_id, 'status', v_next),
      p_dedupe_key := 'crew_transfer_submitted:' || t.id,
      p_module_key := 'crew'
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'transfer_crew_submit: crew_transfer_submitted not emitted (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN public.crew_transfer_json(t.id);
END;
$$;

-- The fleet decision (D-X1-12): approve -> Scheduled, decline -> Cancelled
-- with the reason (22023 reason_required). vessel.crew.crew_assignments.
-- approve at company level with fleet reach (42501), no external viewer,
-- never the submitter (42501 own_submission). Returns the transfer.
CREATE OR REPLACE FUNCTION public.transfer_crew_decide(p_transfer_id uuid, p_decision text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  v_uid uuid := auth.uid();
  v_next text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_approver boolean;
  v_prev text := current_setting('storm.crew_engine', true);
BEGIN
  t := public.crew_transfer_load(p_transfer_id);
  v_approver := public.crew_transfer_is_approver(t.company_id);
  IF NOT v_approver OR public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Only a fleet approver decides a transfer.';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision_unknown', DETAIL = 'Choose approve or decline.';
  END IF;
  IF t.submitted_by = v_uid THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'own_submission', DETAIL = 'Another approver decides a transfer you submitted.';
  END IF;
  PERFORM public.crew_transfer_actor_check(t.profile_id, t.company_id);
  v_next := public.crew_transfer_next(t.status, p_decision, t.requires_approval, NULL, NULL);
  IF v_next NOT IN ('scheduled', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_next, DETAIL = 'Only a transfer waiting for approval can be decided.';
  END IF;
  IF p_decision = 'decline' AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required', DETAIL = 'Say why the transfer is declined.', HINT = 'reason';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long', DETAIL = 'Keep the reason under 2,000 characters.', HINT = 'reason';
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  IF p_decision = 'approve' THEN
    UPDATE public.crew_transfers SET status = 'scheduled', approved_by = v_uid, approved_at = now(), updated_by = v_uid WHERE id = t.id;
  ELSE
    UPDATE public.crew_transfers
    SET status = 'cancelled', decline_reason = v_reason, cancelled_by = v_uid, cancelled_at = now(), updated_by = v_uid
    WHERE id = t.id;
  END IF;
  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);
  RETURN public.crew_transfer_json(t.id);
END;
$$;

-- Cancels a transfer before completion; a reason once it was submitted
-- (pending approval or scheduled; 22023 reason_required). Assign on either
-- vessel, or a fleet approver; no external viewer. Returns the transfer.
CREATE OR REPLACE FUNCTION public.transfer_crew_cancel(p_transfer_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  v_uid uuid := auth.uid();
  v_next text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_may boolean;
  v_prev text := current_setting('storm.crew_engine', true);
BEGIN
  t := public.crew_transfer_load(p_transfer_id);
  v_may := coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.assign', t.from_vessel_id), false)
        OR coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.assign', t.to_vessel_id), false)
        OR public.crew_transfer_is_approver(t.company_id);
  IF NOT v_may OR public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t cancel this transfer.';
  END IF;
  v_next := public.crew_transfer_next(t.status, 'cancel', t.requires_approval, NULL, NULL);
  IF v_next IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = v_next, DETAIL = 'A completed or cancelled transfer cannot be cancelled.';
  END IF;
  IF t.status IN ('pending_approval', 'scheduled') AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required', DETAIL = 'Say why the transfer is cancelled.', HINT = 'reason';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long', DETAIL = 'Keep the reason under 2,000 characters.', HINT = 'reason';
  END IF;
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_transfers
  SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancelled_reason = v_reason, updated_by = v_uid
  WHERE id = t.id;
  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);
  RETURN public.crew_transfer_json(t.id);
END;
$$;

-- The ONE completion definer (D-207, C58): a scheduled transfer, from its
-- sign-off date (22023 transfer_not_due before it), by a holder of assign
-- on both vessels who may act on the person (crew_transfer_gate). Ends the
-- origin, opens the destination, terms, familiarisation, planner periods,
-- movements, the notice, all or nothing (crew_transfer_apply); the
-- crew-assignment guard decides as the caller. Returns the transfer.
CREATE OR REPLACE FUNCTION public.transfer_crew(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
BEGIN
  t := public.crew_transfer_load(p_transfer_id);
  PERFORM public.crew_transfer_gate(t.from_vessel_id, t.to_vessel_id, t.profile_id);
  PERFORM public.crew_transfer_apply(t.id, auth.uid(), current_date);
  RETURN public.crew_transfer_json(t.id);
END;
$$;

-- One transfer, for the wizard and the timeline: crew_assignments.view on
-- either vessel, a fleet approver, or the person; no external viewer.
-- P0002 for anything else.
CREATE OR REPLACE FUNCTION public.transfer_crew_detail(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.crew_transfers;
  v_may boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  SELECT * INTO t FROM public.crew_transfers WHERE id = p_transfer_id;
  v_may := FOUND AND t.company_id = public.get_user_company_id(auth.uid()) AND NOT public.crew_caller_is_external()
       AND (coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.view', t.from_vessel_id), false)
            OR coalesce(public.crew_vessel_cap('vessel.crew.crew_assignments.view', t.to_vessel_id), false)
            OR public.crew_transfer_is_approver(t.company_id)
            OR t.profile_id IS NOT DISTINCT FROM public.my_profile_id());
  IF NOT coalesce(v_may, false) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'transfer_not_found', DETAIL = 'This transfer could not be found.';
  END IF;
  RETURN public.crew_transfer_json(t.id);
END;
$$;

-- A person's transfers, newest first (X1-11B's Transfers list): those the
-- caller may read (as transfer_crew_detail). An array; empty when none.
CREATE OR REPLACE FUNCTION public.crew_transfers_for_profile(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_approver boolean;
  v_own boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  v_company := public.get_user_company_id(auth.uid());
  IF v_company IS NULL OR public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see crew transfers.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'person_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  v_approver := public.crew_transfer_is_approver(v_company);
  v_own := p_profile_id IS NOT DISTINCT FROM public.my_profile_id();
  RETURN coalesce((
    SELECT jsonb_agg(public.crew_transfer_json(t.id) ORDER BY t.created_at DESC, t.id)
    FROM public.crew_transfers AS t
    WHERE t.profile_id = p_profile_id AND t.company_id = v_company
      AND (v_own OR v_approver
           OR t.from_vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_assignments.view'))
           OR t.to_vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_assignments.view')))
  ), '[]'::jsonb);
END;
$$;

-- The daily sweep (PR-X1-K; hr-daily-sweeper): completes every scheduled
-- transfer whose sign-on date has come (each in its own subtransaction, so
-- one refusal never stops the others; the reason is logged as a warning),
-- then stamps compliant_on_destination_at on completed transfers of the
-- last year whose person's compliance on the destination first reads
-- complete. Without a user session only (42501 under a JWT). Returns
-- {"completed": n, "failed": n, "compliant_stamped": n}.
CREATE OR REPLACE FUNCTION public.crew_transfers_complete_due(p_today date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := coalesce(p_today, current_date);
  r record;
  v_done integer := 0;
  v_failed integer := 0;
  v_stamped integer := 0;
  v_prev text := current_setting('storm.crew_engine', true);
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_only',
      DETAIL = 'crew_transfers_complete_due runs without a user session (the daily sweep).';
  END IF;
  FOR r IN SELECT t.id FROM public.crew_transfers AS t WHERE t.status = 'scheduled' AND t.sign_on_date <= v_today ORDER BY t.sign_on_date, t.id LOOP
    BEGIN
      PERFORM public.crew_transfer_apply(r.id, NULL, v_today);
      v_done := v_done + 1;
    EXCEPTION WHEN others THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'crew_transfers_complete_due: transfer % not completed (%): %', r.id, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  PERFORM set_config('storm.crew_engine', 'on', true);
  FOR r IN
    SELECT t.id, t.to_vessel_id, t.profile_id FROM public.crew_transfers AS t
    WHERE t.status = 'completed' AND t.compliant_on_destination_at IS NULL AND t.completed_at > now() - interval '365 days'
  LOOP
    IF EXISTS (SELECT 1 FROM public.crew_compliance_summary_for(ARRAY[r.to_vessel_id], v_today, r.profile_id) AS s WHERE s.status = 'complete') THEN
      UPDATE public.crew_transfers SET compliant_on_destination_at = now() WHERE id = r.id;
      v_stamped := v_stamped + 1;
    END IF;
  END LOOP;
  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);
  RETURN jsonb_build_object('completed', v_done, 'failed', v_failed, 'compliant_stamped', v_stamped);
END;
$$;

-- ---------------------------------------------------------------- RPCs: employment (X1-11B)

-- Ends a person's employment on a vessel (gap/04 W8, C57).
-- hris.employee_records.contracts_employment.edit on the vessel, no
-- external viewer, the person of the vessel's company (P0002), D-207
-- (out_of_reach / manages_admins_required). p_reason is contract_end,
-- resignation, dismissal, medical, end_of_temporary_contract,
-- transfer_to_another_employer, retirement or other (with a note); the end
-- date within a year of today and not before the join date. The person
-- must hold a current assignment on the vessel (a pending placement:
-- 22023 pending_placement_not_ended, D-225) and have no open transfer from
-- or to it (22023 transfer_open). Effects, all or nothing: the assignment
-- ends (the guard decides as the caller), the open terms end, the active
-- contract expires (contract end, end of a temporary contract) or is
-- terminated, planner periods starting after the end date are removed and
-- one running past it is trimmed, crew_employment_ended is emitted. The
-- answer names the final hours-of-rest month and its submission state.
CREATE OR REPLACE FUNCTION public.crew_end_employment(p_profile_id uuid, p_vessel_id uuid, p_end_date date, p_reason text, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_profile public.profiles;
  a public.crew_assignments;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_terms integer := 0;
  v_contract public.crew_contracts;
  v_contract_status text;
  v_removed integer := 0;
  v_trimmed integer := 0;
  v_hor_status text;
  v_vessel_name text;
  v_person text;
  v_prev text := current_setting('storm.crew_engine', true);
BEGIN
  v_company := public.crew_vessel_gate('hris.employee_records.contracts_employment.edit', p_vessel_id, 'You can''t end employment on this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t end employment on this vessel.';
  END IF;
  SELECT * INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_profile.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'person_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  PERFORM public.crew_transfer_actor_check(p_profile_id, v_company);

  IF p_reason IS NULL OR p_reason NOT IN ('contract_end', 'resignation', 'dismissal', 'medical', 'end_of_temporary_contract',
                                          'transfer_to_another_employer', 'retirement', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_unknown', DETAIL = 'Choose why the employment ends.', HINT = 'reason';
  END IF;
  IF p_reason = 'other' AND v_notes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notes_required', DETAIL = 'Say why the employment ends.', HINT = 'notes';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notes_too_long', DETAIL = 'Keep the notes under 2,000 characters.', HINT = 'notes';
  END IF;
  IF p_end_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'date_required', DETAIL = 'Enter the end date.', HINT = 'end_date';
  END IF;
  IF p_end_date < current_date - 365 OR p_end_date > current_date + 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'end_date_out_of_range', DETAIL = 'Choose an end date within a year of today.', HINT = 'end_date';
  END IF;

  SELECT ca.* INTO a
  FROM public.crew_assignments AS ca
  WHERE v_profile.user_id IS NOT NULL AND ca.user_id = v_profile.user_id AND ca.vessel_id = p_vessel_id
    AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
  ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
  LIMIT 1
  FOR UPDATE;
  IF a.id IS NULL THEN
    IF coalesce(v_profile.is_imported, false) AND v_profile.imported_vessel_id = p_vessel_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pending_placement_not_ended', DETAIL = 'Change the pending vessel on the profile.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_on_vessel', DETAIL = 'This person is not on this vessel''s crew.';
  END IF;
  IF p_end_date < coalesce(a.join_date, a.start_date) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'end_before_join', DETAIL = 'The end date is before they joined this vessel.', HINT = 'end_date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crew_transfers AS t
             WHERE t.profile_id = p_profile_id AND t.status IN ('draft', 'review', 'pending_approval', 'scheduled')
               AND p_vessel_id IN (t.from_vessel_id, t.to_vessel_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'transfer_open', DETAIL = 'Cancel the open transfer of this person first.';
  END IF;

  PERFORM set_config('storm.crew_engine', 'on', true);
  -- The assignment (the guard decides as the caller).
  UPDATE public.crew_assignments
  SET leave_date = p_end_date, end_date = p_end_date, end_reason = p_reason, updated_by = v_uid, updated_at = now()
  WHERE id = a.id;
  -- The open terms on the vessel.
  UPDATE public.crew_assignment_terms
  SET end_date = p_end_date, end_reason = p_reason, end_notes = v_notes, updated_by = v_uid
  WHERE profile_id = p_profile_id AND vessel_id = p_vessel_id AND end_date IS NULL AND start_date <= p_end_date;
  GET DIAGNOSTICS v_terms = ROW_COUNT;
  -- The active contract for the vessel (or for no vessel).
  SELECT * INTO v_contract FROM public.crew_contracts AS c
  WHERE c.profile_id = p_profile_id AND c.company_id = v_company AND c.status = 'active'
    AND (c.vessel_id = p_vessel_id OR c.vessel_id IS NULL) AND c.start_date <= p_end_date
  ORDER BY (c.vessel_id IS NULL), c.start_date DESC, c.id
  LIMIT 1
  FOR UPDATE;
  IF v_contract.id IS NOT NULL THEN
    v_contract_status := CASE WHEN p_reason IN ('contract_end', 'end_of_temporary_contract') THEN 'expired' ELSE 'terminated' END;
    UPDATE public.crew_contracts
    SET status = v_contract_status,
        end_date = CASE WHEN end_date IS NULL OR end_date > p_end_date THEN p_end_date ELSE end_date END,
        terminated_at = CASE WHEN v_contract_status = 'terminated' THEN p_end_date ELSE terminated_at END,
        termination_reason = CASE WHEN v_contract_status = 'terminated' THEN public.crew_end_reason_label(p_reason) ELSE termination_reason END,
        updated_by = v_uid
    WHERE id = v_contract.id;
  END IF;
  -- Planner periods after the end date go; one running past it ends there.
  DELETE FROM public.frp_rotation_assignments
  WHERE profile_id = p_profile_id AND vessel_id = p_vessel_id AND start_date > p_end_date;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  UPDATE public.frp_rotation_assignments
  SET end_date = p_end_date, end_unknown = false
  WHERE profile_id = p_profile_id AND vessel_id = p_vessel_id AND start_date <= p_end_date AND (end_date > p_end_date OR end_unknown);
  GET DIAGNOSTICS v_trimmed = ROW_COUNT;
  PERFORM set_config('storm.crew_engine', coalesce(v_prev, ''), true);

  -- The final hours-of-rest month (named in the answer and the notice).
  IF v_profile.user_id IS NOT NULL THEN
    SELECT s.status INTO v_hor_status FROM public.work_rest_monthly_submissions AS s
    WHERE s.crew_id = v_profile.user_id AND s.vessel_id = p_vessel_id
      AND s.period_year = extract(year FROM p_end_date)::integer AND s.period_month = extract(month FROM p_end_date)::integer
    LIMIT 1;
  END IF;

  BEGIN
    SELECT v.name INTO v_vessel_name FROM public.vessels AS v WHERE v.id = p_vessel_id;
    v_person := nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(v_profile.preferred_name), ''), v_profile.first_name), v_profile.last_name)), '');
    PERFORM public.emit_notification_event(
      p_type_key := 'crew_employment_ended',
      p_company_id := v_company,
      p_title := left(format('%s left %s', coalesce(v_person, 'A crew member'), coalesce(v_vessel_name, 'the vessel')), 120),
      p_link_scope := 'vessel',
      p_vessel_id := p_vessel_id,
      p_body := left(format('%s on %s. Their hours of rest for %s are the final month.', public.crew_end_reason_label(p_reason),
                            to_char(p_end_date, 'FMDD Mon YYYY'), to_char(p_end_date, 'FMMonth YYYY')), 280),
      p_link_path := format('crew/people/%s', p_profile_id),
      p_must_act_user_ids := ARRAY(SELECT u FROM unnest(public.crew_transfer_fleet_hr(v_company)) AS u WHERE u IS DISTINCT FROM v_uid),
      p_payload := jsonb_build_object('profile_id', p_profile_id, 'vessel_id', p_vessel_id, 'assignment_id', a.id, 'reason', p_reason,
                                      'end_date', p_end_date),
      p_dedupe_key := format('crew_employment_ended:%s:%s', a.id, p_end_date),
      p_module_key := 'crew'
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'crew_end_employment: crew_employment_ended not emitted (%): %', SQLSTATE, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'assignment_id', a.id,
    'end_date', p_end_date,
    'reason', p_reason,
    'terms_ended', v_terms,
    'contract', CASE WHEN v_contract.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_contract.id, 'status', v_contract_status) END,
    'periods_removed', v_removed,
    'periods_trimmed', v_trimmed,
    'final_hor_month', CASE WHEN v_profile.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'year', extract(year FROM p_end_date)::integer, 'month', extract(month FROM p_end_date)::integer,
      'submission_status', coalesce(v_hor_status, 'none')) END
  );
END;
$$;

-- The vessel's employment history (gap/04 C59): every ended assignment of
-- a person of the vessel's company (the leave date has come or the row is
-- no longer current), newest end first, with the position and department
-- (crew_position_for; else the legacy department text), the dates, the
-- duration in days, the end reason and note (the terms', else the
-- assignment's), and where the person is now. p_department_key narrows
-- it. Gate: hris.employee_records.contracts_employment.view on the vessel,
-- no external viewer.
CREATE OR REPLACE FUNCTION public.crew_vessel_employment_history(p_vessel_id uuid, p_department_key text DEFAULT NULL)
RETURNS TABLE (
  assignment_id uuid,
  profile_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  position_text text,
  position_id uuid,
  position_name text,
  department_key text,
  department_label text,
  join_date date,
  leave_date date,
  duration_days integer,
  end_reason text,
  end_notes text,
  current_vessel_id uuid,
  current_vessel_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
BEGIN
  v_company := public.crew_vessel_gate('hris.employee_records.contracts_employment.view', p_vessel_id, 'You can''t see the employment history of this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see the employment history of this vessel.';
  END IF;
  RETURN QUERY
  WITH ended AS (
    SELECT ca.id, ca.user_id, ca.position, ca.rank, ca.department, coalesce(ca.join_date, ca.start_date) AS joined,
           coalesce(ca.leave_date, ca.end_date) AS left_on, ca.end_reason, p.id AS pid,
           coalesce(public.crew_position_for(v_company, p_vessel_id, ca.position), public.crew_position_for(v_company, p_vessel_id, ca.rank)) AS pos_id
    FROM public.crew_assignments AS ca
    JOIN public.profiles AS p ON p.user_id = ca.user_id AND p.company_id = v_company
    WHERE ca.vessel_id = p_vessel_id
      AND NOT public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
  ),
  shaped AS (
    SELECT e.*, pos.name AS pos_name,
           coalesce(pos.department_key, (
             SELECT d.key FROM public.departments AS d
             WHERE d.is_active AND (d.key = public.record_normalise_office(e.department)
                                    OR public.record_normalise_office(d.label) = public.record_normalise_office(e.department))
             ORDER BY d.sort_order LIMIT 1)) AS dep_key
    FROM ended AS e
    LEFT JOIN public.positions AS pos ON pos.id = e.pos_id
  )
  SELECT s.id, s.pid, s.user_id, p.first_name, p.last_name, p.preferred_name,
         nullif(btrim(coalesce(nullif(btrim(s.position), ''), s.rank)), ''),
         s.pos_id, s.pos_name, s.dep_key, d.label, s.joined, s.left_on,
         CASE WHEN s.left_on IS NOT NULL AND s.joined IS NOT NULL THEN (s.left_on - s.joined) END,
         coalesce(tm.end_reason, s.end_reason), tm.end_notes,
         cur.vessel_id, cur.vessel_name
  FROM shaped AS s
  JOIN public.profiles AS p ON p.id = s.pid
  LEFT JOIN public.departments AS d ON d.key = s.dep_key
  LEFT JOIN LATERAL (
    SELECT t.end_reason, t.end_notes FROM public.crew_assignment_terms AS t
    WHERE t.profile_id = s.pid AND t.vessel_id = p_vessel_id AND (t.assignment_id = s.id OR t.end_date = s.left_on)
    ORDER BY (t.assignment_id = s.id) DESC NULLS LAST, t.start_date DESC LIMIT 1
  ) AS tm ON true
  LEFT JOIN LATERAL (
    SELECT x.vessel_id, v.name AS vessel_name FROM public.crew_assignments AS x
    JOIN public.vessels AS v ON v.id = x.vessel_id
    WHERE x.user_id = s.user_id AND public.crew_assignment_is_current(x.is_current, x.leave_date, x.end_date)
    ORDER BY coalesce(x.join_date, x.start_date) DESC NULLS LAST, x.id LIMIT 1
  ) AS cur ON true
  WHERE p_department_key IS NULL OR s.dep_key = p_department_key
  ORDER BY s.left_on DESC NULLS LAST, lower(p.last_name), lower(p.first_name), s.id;
END;
$$;

-- The Add crew re-hire prefill (gap/04 W8: "Re-hire" from the history):
-- the person's names (the email only for a holder of crew_profiles.view on
-- the vessel or HR), whether they hold a login, their current vessel if
-- any (a re-hire is for people who are not on a crew), the last
-- assignment on any vessel of the company and the last employment terms.
-- Gate: vessel.crew.crew_profiles.create on the vessel, no external
-- viewer; P0002 for a person of another company.
CREATE OR REPLACE FUNCTION public.crew_rehire_prefill(p_profile_id uuid, p_vessel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_profile public.profiles;
  v_email boolean;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_profiles.create', p_vessel_id, 'You can''t add crew to this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t add crew to this vessel.';
  END IF;
  SELECT * INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_profile.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'person_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  v_email := coalesce(public.crew_vessel_cap('vessel.crew.crew_profiles.view', p_vessel_id), false)
          OR coalesce(public.hr_can_view(auth.uid()), false);
  RETURN jsonb_build_object(
    'profile_id', v_profile.id,
    'first_name', v_profile.first_name,
    'last_name', v_profile.last_name,
    'preferred_name', v_profile.preferred_name,
    'email', CASE WHEN v_email THEN v_profile.email END,
    'has_login', v_profile.user_id IS NOT NULL,
    'current', (
      SELECT jsonb_build_object('vessel_id', x.vessel_id, 'vessel_name', v.name)
      FROM public.crew_assignments AS x JOIN public.vessels AS v ON v.id = x.vessel_id
      WHERE v_profile.user_id IS NOT NULL AND x.user_id = v_profile.user_id
        AND public.crew_assignment_is_current(x.is_current, x.leave_date, x.end_date)
      ORDER BY coalesce(x.join_date, x.start_date) DESC NULLS LAST, x.id LIMIT 1),
    'last_assignment', (
      SELECT jsonb_build_object('assignment_id', x.id, 'vessel_id', x.vessel_id, 'vessel_name', v.name,
                                'position_text', nullif(btrim(coalesce(nullif(btrim(x.position), ''), x.rank)), ''),
                                'join_date', coalesce(x.join_date, x.start_date), 'leave_date', coalesce(x.leave_date, x.end_date),
                                'end_reason', x.end_reason)
      FROM public.crew_assignments AS x JOIN public.vessels AS v ON v.id = x.vessel_id AND v.company_id = v_company
      WHERE v_profile.user_id IS NOT NULL AND x.user_id = v_profile.user_id
      ORDER BY coalesce(x.leave_date, x.end_date) DESC NULLS FIRST, coalesce(x.join_date, x.start_date) DESC NULLS LAST, x.id LIMIT 1),
    'terms', (
      SELECT jsonb_build_object('position_id', t.position_id, 'department_key', t.department_key, 'contract_type_key', t.contract_type_key,
                                'leave_method', t.leave_method, 'leave_days_per_year', t.leave_days_per_year, 'leave_ratio_on', t.leave_ratio_on,
                                'leave_ratio_off', t.leave_ratio_off, 'place_of_embarkation', t.place_of_embarkation, 'start_date', t.start_date,
                                'end_date', t.end_date, 'end_reason', t.end_reason)
      FROM public.crew_assignment_terms AS t
      WHERE t.profile_id = v_profile.id AND t.company_id = v_company
      ORDER BY t.start_date DESC, t.id LIMIT 1)
  );
END;
$$;

-- ---------------------------------------------------------------- grants

-- Pure and internal: definers and the service role only.
REVOKE ALL ON FUNCTION public.crew_transfer_next(text, text, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_next(text, text, boolean, boolean, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.crew_end_reason_label(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_end_reason_label(text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_actor_check(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_actor_check(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_is_approver(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_is_approver(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_fleet_hr(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_fleet_hr(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_review_snapshot(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_review_snapshot(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_acknowledged(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_acknowledged(jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_json(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_json(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_gate(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_gate(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_load(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_load(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_transfer_apply(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfer_apply(uuid, uuid, date) TO service_role;

-- The browser RPCs.
REVOKE ALL ON FUNCTION public.transfer_crew_options(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew_options(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_crew_start(uuid, uuid, uuid, uuid, date, date, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew_start(uuid, uuid, uuid, uuid, date, date, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_crew_review(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew_review(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_crew_acknowledge(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew_acknowledge(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_crew_submit(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew_submit(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_crew_decide(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew_decide(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_crew_cancel(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew_cancel(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_crew(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_crew_detail(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_crew_detail(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_transfers_for_profile(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfers_for_profile(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_end_employment(uuid, uuid, date, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_end_employment(uuid, uuid, date, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_employment_history(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_employment_history(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_rehire_prefill(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_rehire_prefill(uuid, uuid) TO authenticated, service_role;

-- The sweep: the service role only (hr-daily-sweeper).
REVOKE ALL ON FUNCTION public.crew_transfers_complete_due(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_transfers_complete_due(date) TO service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.crew_transfer_next(text, text, boolean, boolean, boolean) IS 'The W9 transfer step rule (pure): review, acknowledge, submit (pending_approval when approval is required, else scheduled; acknowledgements_missing), approve, decline, cancel, complete (transfer_not_due before the sign-off date); illegal_transition / unknown_action. Mirrored by nextTransferStatus() in src/modules/crew/lib/transfer.ts.';
COMMENT ON FUNCTION public.crew_end_reason_label(text) IS 'The words of an employment end reason (W8), for notices and the contract termination reason. Pure.';
COMMENT ON FUNCTION public.crew_transfer_actor_check(uuid, uuid) IS 'Internal (D-207): raises 42501 out_of_reach unless admin_may_act_on_user(caller, person) and 42501 manages_admins_required for an administrator target without user_manages_admins_for.';
COMMENT ON FUNCTION public.crew_transfer_is_approver(uuid) IS 'Internal (D-X1-12): the caller holds vessel.crew.crew_assignments.approve at company level and fleet reach (a fleet approver of transfers).';
COMMENT ON FUNCTION public.crew_transfer_fleet_hr(uuid) IS 'Internal: the company''s fleet HR logins (work_rest_is_fleet_hr), the transfer and employment notices'' must-act list.';
COMMENT ON FUNCTION public.crew_transfer_review_snapshot(uuid) IS 'Internal (W9, C58): the pre-transfer review of a transfer: destination document requirement gaps for the new position at the sign-on date, familiarisations opening on joining, medical flags (no clinical text), the last performance review, hours-of-rest breaches in 30 days, no rest day, open familiarisation forms and training applications; each item with a fingerprint.';
COMMENT ON FUNCTION public.crew_transfer_acknowledged(jsonb, jsonb) IS 'Internal: every review item has a tick with the same key and fingerprint.';
COMMENT ON FUNCTION public.crew_transfer_json(uuid) IS 'Internal: a transfer as the wizard reads it (vessels, positions, dates, review, ticks, stamps with names) and the caller''s rights (can_edit, can_submit, can_decide, can_cancel, can_complete).';
COMMENT ON FUNCTION public.crew_transfer_gate(uuid, uuid, uuid) IS 'Internal: the shared transfer gate: two different vessels, vessel.crew.crew_assignments.assign on both (crew_vessel_gate), the same company, no external viewer, the person of that company (P0002), D-207. Returns the company.';
COMMENT ON FUNCTION public.crew_transfer_load(uuid) IS 'Internal: a transfer of the caller''s company, locked for the step (P0002 otherwise).';
COMMENT ON FUNCTION public.crew_transfer_apply(uuid, uuid, date) IS 'Internal: the one completion (D-207, C58), all or nothing: ends the origin assignment (end_reason transfer), inserts the destination assignment (canonical position), ends and writes the terms (the familiarisation trigger opens the required forms), moves planner periods after the sign-off, writes both movements, emits crew_transfer_completed, marks the transfer completed. The crew_assignments writes run as the caller (the platform guard decides).';
COMMENT ON FUNCTION public.transfer_crew_options(uuid, uuid) IS 'The transfer wizard''s start (gap/04 W9): the person, the origin assignment and position, the destinations the caller may transfer to (approval flag and positions), the person''s open transfer, and blocked (pending_placement_not_transferable, not_on_vessel, out_of_reach, manages_admins_required). Gate: vessel.crew.crew_assignments.assign on the origin, no external viewer.';
COMMENT ON FUNCTION public.transfer_crew_start(uuid, uuid, uuid, uuid, date, date, text) IS 'Starts (or restarts the caller''s own draft / review of) a transfer in Draft (W9; C58). Gate: assign on both vessels, the person of the company (D-246), D-207, a Master needs users-access admin of both vessels (D-198), moving yourself needs it on the destination; pending placement 22023 pending_placement_not_transferable (D-225); date, position and open-transfer refusals 22023 with HINT.';
COMMENT ON FUNCTION public.transfer_crew_review(uuid) IS 'Runs the pre-transfer review (crew_transfer_review_snapshot) into gaps_snapshot: Draft / Review -> Review; ticks of unchanged items kept. Gate as transfer_crew_start.';
COMMENT ON FUNCTION public.transfer_crew_acknowledge(uuid, jsonb) IS 'Stores the review ticks (each item: a tick and an optional note of at most 500 characters) on a transfer in Review; 22023 item_unknown / tick_required / note_too_long. Gate as transfer_crew_start.';
COMMENT ON FUNCTION public.transfer_crew_submit(uuid) IS 'Submits a reviewed transfer: Pending approval when either vessel asks for fleet approval (D-X1-12), else Scheduled; 22023 acknowledgements_missing until every item is ticked. Emits crew_transfer_submitted to fleet HR and the DPA. Gate as transfer_crew_start.';
COMMENT ON FUNCTION public.transfer_crew_decide(uuid, text, text) IS 'The fleet decision (D-X1-12): approve -> Scheduled, decline (reason required) -> Cancelled. vessel.crew.crew_assignments.approve with fleet reach; never the submitter (42501 own_submission).';
COMMENT ON FUNCTION public.transfer_crew_cancel(uuid, text) IS 'Cancels a transfer before completion (reason required once submitted). Assign on either vessel or a fleet approver.';
COMMENT ON FUNCTION public.transfer_crew(uuid) IS 'The ONE transfer completion definer (D-207, gap/04 C58): a scheduled transfer from its sign-off date, by a holder of assign on both vessels who may act on the person; crew_transfer_apply, all or nothing; the crew-assignment guard decides as the caller.';
COMMENT ON FUNCTION public.transfer_crew_detail(uuid) IS 'One transfer with the caller''s rights: crew_assignments.view on either vessel, a fleet approver, or the person; P0002 otherwise.';
COMMENT ON FUNCTION public.crew_transfers_for_profile(uuid) IS 'A person''s transfers the caller may read, newest first (X1-11B''s Transfers list).';
COMMENT ON FUNCTION public.crew_transfers_complete_due(date) IS 'Daily sweep (PR-X1-K, hr-daily-sweeper; service role, never under a JWT): completes scheduled transfers whose sign-on date has come (each alone; failures counted and logged) and stamps compliant_on_destination_at when the destination compliance first reads complete. Returns {completed, failed, compliant_stamped}.';
COMMENT ON FUNCTION public.crew_end_employment(uuid, uuid, date, text, text) IS 'Ends a person''s employment on a vessel (gap/04 W8, C57): contracts_employment.edit on the vessel plus D-207; ends the assignment (guard as the caller) and terms, expires or terminates the active contract, removes and trims planner periods, names the final hours-of-rest month, emits crew_employment_ended. Reasons: contract_end, resignation, dismissal, medical, end_of_temporary_contract, transfer_to_another_employer, retirement, other (note required).';
COMMENT ON FUNCTION public.crew_vessel_employment_history(uuid, text) IS 'The vessel''s employment history (gap/04 C59): ended assignments of the company''s people, position, department, dates, duration, end reason and note, where they are now; contracts_employment.view on the vessel, no external viewer.';
COMMENT ON FUNCTION public.crew_rehire_prefill(uuid, uuid) IS 'The Add crew re-hire prefill (gap/04 W8): names (email with crew_profiles.view or HR), login, current vessel, last assignment and last terms. Gate: vessel.crew.crew_profiles.create on the vessel; the person of the vessel''s company (P0002).';
