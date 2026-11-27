-- =================================================================
-- FLEET OPERATIONS X5-07A: training core (catalogue rules, the
-- application state machine on the server, narrowed RLS, RPC-only status
-- writes, numbering on the counter, completion -> qualification)
-- (gap/02 TR4, TR5, TR6, TR9, TR10 data, W3, X4 training; DECISIONS D-01,
-- D-55, D-120, D-128, D-157, D-193, D-238, D-249; X5 spec §2 X5-07A,
-- D-X5-05, D-X5-06, D-X5-07, D-X5-19, D-X5-20, D-X5-21, D-X5-23, D-X5-25;
-- platform-prep plan contract 3 (TR9))
-- Live tables changed: development_courses (rule columns, named CHECKs,
--   browser write policies replaced by definers), development_applications
--   (lifecycle columns, the status CHECK, per-company numbering, guard and
--   audit triggers, the SELECT and UPDATE policies), program_settings
--   (policy columns, the browser write policy replaced by a definer),
--   fleet_training_participants (policies pinned to the company)
-- Table: development_application_events (append-only history)
-- Functions (browser): development_transition, development_course_save,
--   development_course_archive, development_settings_save,
--   development_course_promote; RLS helpers development_reviewer_for,
--   development_application_company
-- Functions (service role): development_transition_target,
--   development_action_actors, development_vessel_role_for,
--   development_applicant_department,
--   development_actor_roles_for, development_application_log,
--   development_application_number_for, development_record_qualification,
--   development_application_notify, development_audit
-- Triggers: development_applications_guard, development_applications_audit,
--   development_application_events_guard; generate_dev_application_number()
--   redefined (the one build-out definition, D-120) and the legacy
--   trg_dev_application_number recreated without its WHEN clause (D-379)
-- TS mirrors: src/modules/development/types/db.pending.ts (columns, rows,
--   RPCs); src/modules/development/lib/applicationMachine.ts (the states x
--   actions table and the actor table, copied between the machine-table and
--   actor-table markers of supabase/tests/sql/fleet/training_transitions.test.sql
--   and pinned by src/test/development/applicationMachine.test.ts);
--   lib/courseSchema.ts (development_course_save), lib/settingsSchema.ts
--   (development_settings_save and the program_settings column defaults)
-- =================================================================
--
-- Training application (gap/02 W3). The statuses are exactly (D-X5-25):
--   draft, submitted, hod_review, captain_purser_review, purser_review,
--   captain_review, approved, discretionary_approved, enrolled, completed,
--   reimbursed, closed, returned, rejected, cancelled, voided.
-- captain_purser_review is the final review (the live client writes it on
-- HOD approval and the live CHECK refuses it, so HOD approval fails today);
-- submitted, purser_review and captain_review stay for existing rows and
-- behave as their stage (submitted = HOD review; purser_review and
-- captain_review = final review).
--
-- Machine (lib/applicationMachine.ts; '!' = refused with 22023 and that
-- message; edit_fields keeps the status):
--
--   status \ action        submit      hod_approve / hod_return         final_approve(_discretionary) / return   reject     cancel     enrol     complete   reimburse   close    void     edit_fields
--   draft                  hod_review  !invalid_transition               !invalid_transition                      !inv       cancelled  !inv      !inv       !inv        !inv     voided   !inv
--   returned               hod_review  !inv                              !inv                                     !inv       cancelled  !inv      !inv       !inv        !inv     voided   !inv
--   submitted, hod_review  !inv        captain_purser_review / returned  !inv                                     rejected   cancelled  !inv      !inv       !inv        !inv     voided   (same)
--   final review (3)       !inv        !inv                              approved | discretionary_approved / returned rejected cancelled !inv  !inv       !inv        !inv     voided   (same)
--   approved, discr.       !inv        !inv                              !inv                                     !inv       cancelled  enrolled  completed  !inv        !inv     voided   (same)
--   enrolled               !inv        !inv                              !inv                                     !inv       cancelled  !inv      completed  !inv        !inv     voided   (same)
--   completed              !inv        !inv                              !inv                                     !inv       !inv       !inv      !inv       reimbursed  closed   voided   !inv
--   reimbursed             !inv        ...                                                                                                                      closed   voided   !inv
--   rejected, cancelled,   !application_final for every action but void (voided)
--   closed
--   voided                 !application_voided for every action
--
-- final_approve completes the final review by the company's
-- program_settings.final_approval_mode (D-X5-06): 'both' (default) needs the
-- Captain's and the Purser's approval, from two different people; 'either'
-- needs one. Until then the status stays and the approver's decision is
-- recorded. final_approve_discretionary is the Captain's, with a
-- justification, and ends as discretionary_approved.
--
-- Who may act (development_action_actors; the caller's roles on the
-- application from development_actor_roles_for; nobody reviews their own
-- application: the applicant holds the applicant role only):
--   applicant        the crew member (crew_member_id = auth.uid())
--   hod              fleet_hod_covers(user, vessel, the applicant's
--                    department: of their current assignment on the vessel,
--                    else their profile's): a user_roles hod row on the
--                    vessel or company-wide for that department or all
--   captain          record_is_master(user, vessel), or a captain role on
--                    the vessel (user_roles captain, or RBAC role captain)
--   purser           a purser role on the vessel (user_roles purser, or RBAC
--                    role purser)
--   training_editor  fleet_ops_can(company, vessel, 'training', 'edit')
--   training_admin   fleet_ops_can(company, NULL, 'training', 'admin')
--   submit: applicant; hod_approve, hod_return: hod; final_approve, return:
--   captain or purser; final_approve_discretionary: captain; reject: hod at
--   the HOD stage, captain or purser at the final stage; cancel: the
--   applicant before approval, captain / purser / training admin after
--   (reason required); enrol, complete: applicant, captain, purser, training
--   editors and admins; reimburse, close: captain, purser, training admin;
--   void: captain, purser, training admin (reason required); edit_fields:
--   hod, captain, purser, training editors and admins (an approver's
--   correction, logged as a field diff and sent to the applicant).
--
-- Every transition (D-X5-23) writes one development_application_events row
-- (actor, the role acted in, from / to status, comment, field diff,
-- payload), stamps stage_entered_at when the status changes, and notifies
-- (guarded emits, D-128; in-app only, D-249): the next actor
-- (training_application_action_needed: the HODs covering the applicant at
-- the HOD stage, the Captains and Pursers still to decide at the final
-- stage, on the vessel's Crew Training page; the training admins and the
-- company's active HR viewers (hr_can_view, W3 "completion notifies HR",
-- D-383) once completed, on Fleet Training) and the applicant when someone else acted
-- (training_application_updated, personal Training). A type that is not
-- seeded, or a failed fan-out, never rolls back the transition.
--
-- complete (TR9, platform-prep plan contract 3, D-X5-07): the course's
-- qualification is written once per application. When the course names a
-- crew document type (qualification_document_type_id) and
-- to_regprocedure finds X1's crew_document_record_from_source(uuid, uuid,
-- date, date, text, uuid), it is called (source 'training', reference the
-- application) through EXECUTE; otherwise a legacy crew_certificates row is
-- written (the applicant's login, the course's qualification_label or its
-- name, issue = completed_on, expiry = completed_on + valid_for_months,
-- the provider). The record id is kept in qualification_record_id.
--
-- Guard (BEFORE INSERT OR UPDATE OR DELETE on development_applications,
-- every role, the service role and the table owner included): outside the
-- transaction-local flag storm.fleet_tx = 'on' (set only by the definers
-- here)
--   - an insert is a draft with no decisions, reviews, outcome or
--     completion columns, on a vessel of its company; stage_entered_at is
--     stamped;
--   - status, the hod_* / captain_* / purser_* review columns, the
--     discretionary flag and justification, submitted_at, denial_reason,
--     the reject / void / cancel columns, the completion columns,
--     qualification_record_id, stage_entered_at and the reporting /
--     clawback / reimbursement columns never change;
--   - the content changes only while the application is a draft or
--     returned (the applicant's edit window; RLS lets only the applicant
--     write it), and the vessel stays in the company;
--   - only a draft is deleted (no browser policy deletes; a draft is
--     cancelled instead).
-- id, company_id, crew_member_id, application_number and created_at never
-- change. A referential cascade passes (pg_trigger_depth() > 1). Refusals
-- are 42501 development_applications_guarded.
--
-- RLS (D-157, D-X5-21):
--   development_applications SELECT: active members of the row's company
--     who are the applicant, a named reviewer (hod / captain / purser
--     reviewer id), a reviewer of the vessel for that applicant
--     (development_reviewer_for: its Captain, its Purser, or an HOD covering
--     the applicant's department) or a training viewer who reaches the
--     vessel (fleet_ops_can training view). Replaces the live company-only
--     "Company members can view applications" (vessel data with personal
--     finance fields). The applicant keeps reading their own applications
--     after leaving the vessel (a personal record).
--   development_applications UPDATE: the applicant only, while draft or
--     returned (content only, the guard enforces). Replaces "Authorized
--     users can update applications" (reviewers act through
--     development_transition). The live crew INSERT policy is kept (the
--     guard forces a draft).
--   development_application_events SELECT: active members of the company
--     who can read the application.
--   development_courses, program_settings: the live browser write policies
--     are dropped (development_course_save / _archive / _promote,
--     development_settings_save write them); the company read policies stay.
--   fleet_training_participants: read by the participant (active, in the
--     application's company) and by readers of the application; written by
--     fleet training editors of the application's company
--     (fleet_ops_can(company, NULL, 'training', 'edit')).
--
-- Numbering: generate_dev_application_number() (the live trigger function,
-- redefined here once, D-120) takes the sequence from
-- next_reference_value('dev_app:<company>') (one upsert, so concurrent
-- inserts serialise on the counter row instead of reading the same
-- MAX()+1, gap/00 §7), seeded from the company's current maximum so
-- numbers continue (CDA-YYYYMMDD-NNNN). application_number is unique per
-- company (it was globally unique while numbered per company). The legacy
-- trigger trg_dev_application_number is recreated without its WHEN clause
-- (D-379): a browser caller's supplied number is replaced by the counter
-- value; only STORM's definers and non-browser roles (service, owner
-- import) keep a number they give. The guard keeps the number locked on
-- UPDATE.
--
-- Live behaviour once applied (owner's apply session; ledger row 7):
--   - every status change goes through development_transition; the client
--     keeps today's submit and cancel-own-draft writes only while the RPC is
--     missing (D-X5-20), so that fallback switches off by itself;
--   - HODs, Captains and Pursers no longer edit applications directly; HOD
--     approval works (it failed on the old CHECK);
--   - company members who are none of applicant, reviewer or training
--     viewer stop reading other people's applications;
--   - course and settings edits go through the definers (training admins).
--
-- Idempotent (D-12, D-55): columns ADD IF NOT EXISTS, CHECKs, FKs and the
-- unique key dropped and added, the counter seed takes the greater value,
-- tables IF NOT EXISTS, indexes IF NOT EXISTS, policies and triggers
-- dropped and created, functions CREATE OR REPLACE.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.development_courses') IS NULL OR to_regclass('public.development_applications') IS NULL
     OR to_regclass('public.program_settings') IS NULL OR to_regclass('public.fleet_training_participants') IS NULL
     OR to_regclass('public.development_audit_log') IS NULL OR to_regclass('public.crew_certificates') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040600_fleet_training_core needs the live development tables (20260214184755, 20260611052722) and crew_certificates';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'development_applications' AND column_name = 'purser_decision')
     OR to_regprocedure('public.generate_dev_application_number()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040600_fleet_training_core needs the purser review columns (20260611052722) and generate_dev_application_number()';
  END IF;
  IF to_regclass('public.reference_counters') IS NULL OR to_regprocedure('public.next_reference_value(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040600_fleet_training_core needs next_reference_value() (20260925192821)';
  END IF;
  IF to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_ops_can(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_hod_covers(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040600_fleet_training_core needs the fleet access helpers: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL OR to_regprocedure('public.record_user_is_external(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040600_fleet_training_core needs record_is_master() and record_user_is_external(): apply 20261123020100 first';
  END IF;
  IF to_regprocedure('public.emit_notification_event(text,uuid,text,text,uuid,text,text,text,text,text,uuid,text,uuid,uuid[],text[],jsonb,text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040600_fleet_training_core needs the notification outbox: apply 20261123030000 first';
  END IF;
  IF to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.user_belongs_to_company(uuid,uuid)') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040600_fleet_training_core needs the reach and status helpers (20261123000300, 20261123010000) and update_updated_at_column()';
  END IF;
END
$$;

-- ---------------------------------------------------------------- development_courses: the catalogue rules (TR7 data, TR8, TR9)

ALTER TABLE public.development_courses
  ADD COLUMN IF NOT EXISTS valid_for_months integer,
  ADD COLUMN IF NOT EXISTS renew_from_months integer,
  ADD COLUMN IF NOT EXISTS applies_to_departments text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS applies_to_positions text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_note text,
  ADD COLUMN IF NOT EXISTS pathway text,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'catalogue',
  ADD COLUMN IF NOT EXISTS proposed_by uuid,
  ADD COLUMN IF NOT EXISTS proposed_from_application_id uuid,
  ADD COLUMN IF NOT EXISTS qualification_label text,
  ADD COLUMN IF NOT EXISTS qualification_document_type_id uuid;

ALTER TABLE public.development_courses
  DROP CONSTRAINT IF EXISTS development_courses_valid_for_months_check,
  DROP CONSTRAINT IF EXISTS development_courses_renew_from_months_check,
  DROP CONSTRAINT IF EXISTS development_courses_origin_check,
  DROP CONSTRAINT IF EXISTS development_courses_rule_text_check,
  DROP CONSTRAINT IF EXISTS development_courses_applies_to_check,
  DROP CONSTRAINT IF EXISTS development_courses_proposed_by_fkey,
  DROP CONSTRAINT IF EXISTS development_courses_proposed_from_application_fkey;
ALTER TABLE public.development_courses
  ADD CONSTRAINT development_courses_valid_for_months_check CHECK (valid_for_months IS NULL OR valid_for_months BETWEEN 1 AND 600),
  ADD CONSTRAINT development_courses_renew_from_months_check CHECK (
    renew_from_months IS NULL OR (valid_for_months IS NOT NULL AND renew_from_months >= 0 AND renew_from_months < valid_for_months)),
  ADD CONSTRAINT development_courses_origin_check CHECK (origin IN ('catalogue', 'proposed')),
  ADD CONSTRAINT development_courses_rule_text_check CHECK (
    (renewal_note IS NULL OR length(renewal_note) <= 2000)
    AND (pathway IS NULL OR length(pathway) <= 120)
    AND (qualification_label IS NULL OR length(qualification_label) <= 200)),
  ADD CONSTRAINT development_courses_applies_to_check CHECK (
    cardinality(applies_to_departments) <= 50 AND cardinality(applies_to_positions) <= 50),
  ADD CONSTRAINT development_courses_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD CONSTRAINT development_courses_proposed_from_application_fkey FOREIGN KEY (proposed_from_application_id)
    REFERENCES public.development_applications(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_development_courses_proposal ON public.development_courses (proposed_from_application_id)
  WHERE proposed_from_application_id IS NOT NULL;

COMMENT ON COLUMN public.development_courses.valid_for_months IS 'How long the qualification a completion grants is valid (gap/02 TR7, TR9): 1-600 months; NULL = no expiry. complete writes expiry = completed_on + valid_for_months.';
COMMENT ON COLUMN public.development_courses.renew_from_months IS 'How many months before expiry a renewal may start (TR7): 0 <= renew_from_months < valid_for_months.';
COMMENT ON COLUMN public.development_courses.applies_to_departments IS 'Departments the course is for (TR7); empty = every department.';
COMMENT ON COLUMN public.development_courses.applies_to_positions IS 'Positions the course is for (TR7); empty = every position.';
COMMENT ON COLUMN public.development_courses.is_mandatory IS 'Mandatory for the departments and positions it applies to (TR7).';
COMMENT ON COLUMN public.development_courses.origin IS 'catalogue (created by a training admin) | proposed (promoted from a crew proposal, development_course_promote; TR8).';
COMMENT ON COLUMN public.development_courses.proposed_by IS 'The crew member whose custom application was promoted into the catalogue (TR8).';
COMMENT ON COLUMN public.development_courses.proposed_from_application_id IS 'The custom application this course was promoted from (TR8); one course per application.';
COMMENT ON COLUMN public.development_courses.qualification_label IS 'The qualification a completion grants, as text (the legacy fallback, D-X5-05): the name of the crew_certificates row written on completion when the course names no crew document type.';
COMMENT ON COLUMN public.development_courses.qualification_document_type_id IS 'The crew document type a completion records (platform-prep plan contract 3, TR9): X1''s crew_document_types id, no FK across blocks; development_course_save checks it against crew_document_types (refused while that table is missing).';

-- ---------------------------------------------------------------- development_applications: lifecycle columns (TR4, TR5, TR6, TR9)

ALTER TABLE public.development_applications
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS qualification_record_id uuid,
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz;

-- The status vocabulary (D-X5-25), named and idempotent.
ALTER TABLE public.development_applications DROP CONSTRAINT IF EXISTS development_applications_status_check;
ALTER TABLE public.development_applications
  ADD CONSTRAINT development_applications_status_check CHECK (status IN (
    'draft', 'submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review', 'approved',
    'discretionary_approved', 'enrolled', 'completed', 'reimbursed', 'closed', 'returned', 'rejected', 'cancelled', 'voided'));

ALTER TABLE public.development_applications
  DROP CONSTRAINT IF EXISTS development_applications_outcome_text_check,
  DROP CONSTRAINT IF EXISTS development_applications_rejected_by_fkey,
  DROP CONSTRAINT IF EXISTS development_applications_voided_by_fkey,
  DROP CONSTRAINT IF EXISTS development_applications_cancelled_by_fkey,
  DROP CONSTRAINT IF EXISTS development_applications_qualification_record_fkey;
ALTER TABLE public.development_applications
  ADD CONSTRAINT development_applications_outcome_text_check CHECK (
    (void_reason IS NULL OR length(void_reason) <= 2000) AND (cancel_reason IS NULL OR length(cancel_reason) <= 2000)),
  ADD CONSTRAINT development_applications_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD CONSTRAINT development_applications_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD CONSTRAINT development_applications_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD CONSTRAINT development_applications_qualification_record_fkey FOREIGN KEY (qualification_record_id)
    REFERENCES public.crew_certificates(id) ON DELETE SET NULL;

-- Numbers are per company (the sequence always was): unique per company,
-- not across tenants.
ALTER TABLE public.development_applications DROP CONSTRAINT IF EXISTS development_applications_application_number_key;
ALTER TABLE public.development_applications DROP CONSTRAINT IF EXISTS development_applications_company_number_key;
ALTER TABLE public.development_applications
  ADD CONSTRAINT development_applications_company_number_key UNIQUE (company_id, application_number);

CREATE INDEX IF NOT EXISTS idx_dev_apps_stage ON public.development_applications (company_id, status, stage_entered_at);

COMMENT ON COLUMN public.development_applications.rejected_at IS 'When the application was rejected (W3 Rejected; the reason is the live denial_reason). Written only by development_transition.';
COMMENT ON COLUMN public.development_applications.voided_at IS 'When the application was voided as entered in error (TR6, T-201): hidden from registers and totals, never deleted. Written only by development_transition.';
COMMENT ON COLUMN public.development_applications.void_reason IS 'Why it was voided (required, up to 2000).';
COMMENT ON COLUMN public.development_applications.cancelled_at IS 'When it was cancelled (W3: the applicant before approval, the Captain, Purser or a training admin after, with a reason).';
COMMENT ON COLUMN public.development_applications.cancel_reason IS 'Why it was cancelled (required after approval, up to 2000).';
COMMENT ON COLUMN public.development_applications.qualification_record_id IS 'The crew_certificates row completion wrote (TR9; X1''s crew_document_record_from_source or the legacy row); one per application.';
COMMENT ON COLUMN public.development_applications.stage_entered_at IS 'When the application entered its current status (stamped on insert and on every status change); "awaiting approval > 7 days" reads it (TR1).';

-- ---------------------------------------------------------------- program_settings: policy columns (TR10, D-X5-06, D-X5-19)

ALTER TABLE public.program_settings
  ADD COLUMN IF NOT EXISTS final_approval_mode text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS mileage_rate_per_mile numeric(10,4),
  ADD COLUMN IF NOT EXISTS mileage_rate_per_km numeric(10,4),
  ADD COLUMN IF NOT EXISTS fx_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS category_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.program_settings
  DROP CONSTRAINT IF EXISTS program_settings_final_approval_mode_check,
  DROP CONSTRAINT IF EXISTS program_settings_mileage_check,
  DROP CONSTRAINT IF EXISTS program_settings_json_check;
ALTER TABLE public.program_settings
  ADD CONSTRAINT program_settings_final_approval_mode_check CHECK (final_approval_mode IN ('both', 'either')),
  ADD CONSTRAINT program_settings_mileage_check CHECK (
    (mileage_rate_per_mile IS NULL OR mileage_rate_per_mile BETWEEN 0 AND 1000)
    AND (mileage_rate_per_km IS NULL OR mileage_rate_per_km BETWEEN 0 AND 1000)),
  ADD CONSTRAINT program_settings_json_check CHECK (jsonb_typeof(fx_overrides) = 'object' AND jsonb_typeof(category_labels) = 'object');

COMMENT ON COLUMN public.program_settings.final_approval_mode IS 'Final training approval (D-X5-06, OQ4): both = the Captain and the Purser (two people), either = one of them.';
COMMENT ON COLUMN public.program_settings.mileage_rate_per_mile IS 'Travel reimbursed per mile driven (TR10); NULL = not reimbursed by distance.';
COMMENT ON COLUMN public.program_settings.mileage_rate_per_km IS 'Travel reimbursed per kilometre driven (TR10); NULL = not reimbursed by distance.';
COMMENT ON COLUMN public.program_settings.fx_overrides IS 'Exchange-rate overrides to USD by ISO 4217 code ({"EUR": 1.08}); a code not listed uses the rate typed on the application (TR10).';
COMMENT ON COLUMN public.program_settings.category_labels IS 'The account''s labels for the four fixed categories (D-X5-19, OQ14): keys fleet_organised, mandatory, professional, extracurricular; clawback exemptions stay on the keys.';

-- ---------------------------------------------------------------- development_application_events (D-X5-23, TR5)

CREATE TABLE IF NOT EXISTS public.development_application_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  application_id uuid NOT NULL,
  actor_user_id uuid,
  actor_profile_id uuid,
  actor_role text,
  action text NOT NULL,
  from_status text,
  to_status text,
  comment text,
  field_diff jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.development_application_events
  DROP CONSTRAINT IF EXISTS development_application_events_pkey,
  DROP CONSTRAINT IF EXISTS development_application_events_company_fkey,
  DROP CONSTRAINT IF EXISTS development_application_events_vessel_fkey,
  DROP CONSTRAINT IF EXISTS development_application_events_application_fkey,
  DROP CONSTRAINT IF EXISTS development_application_events_action_check,
  DROP CONSTRAINT IF EXISTS development_application_events_status_check,
  DROP CONSTRAINT IF EXISTS development_application_events_from_status_check,
  DROP CONSTRAINT IF EXISTS development_application_events_to_status_check,
  DROP CONSTRAINT IF EXISTS development_application_events_role_check,
  DROP CONSTRAINT IF EXISTS development_application_events_text_check;
ALTER TABLE public.development_application_events
  ADD CONSTRAINT development_application_events_pkey PRIMARY KEY (id),
  ADD CONSTRAINT development_application_events_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD CONSTRAINT development_application_events_vessel_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  ADD CONSTRAINT development_application_events_application_fkey FOREIGN KEY (application_id) REFERENCES public.development_applications(id) ON DELETE CASCADE,
  ADD CONSTRAINT development_application_events_action_check CHECK (action IN (
    'created', 'submit', 'hod_approve', 'hod_return', 'final_approve', 'final_approve_discretionary', 'return', 'reject',
    'cancel', 'enrol', 'complete', 'reimburse', 'close', 'void', 'edit_fields', 'course_promoted')),
  ADD CONSTRAINT development_application_events_from_status_check CHECK (
    from_status IS NULL OR from_status IN ('draft', 'submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review', 'approved',
      'discretionary_approved', 'enrolled', 'completed', 'reimbursed', 'closed', 'returned', 'rejected', 'cancelled', 'voided')),
  ADD CONSTRAINT development_application_events_to_status_check CHECK (
    to_status IS NULL OR to_status IN ('draft', 'submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review', 'approved',
      'discretionary_approved', 'enrolled', 'completed', 'reimbursed', 'closed', 'returned', 'rejected', 'cancelled', 'voided')),
  ADD CONSTRAINT development_application_events_role_check CHECK (
    actor_role IS NULL OR actor_role IN ('applicant', 'hod', 'captain', 'purser', 'training_editor', 'training_admin')),
  ADD CONSTRAINT development_application_events_text_check CHECK (
    (comment IS NULL OR length(comment) <= 2000)
    AND (field_diff IS NULL OR jsonb_typeof(field_diff) = 'object')
    AND jsonb_typeof(payload) = 'object' AND length(payload::text) <= 8000);

CREATE INDEX IF NOT EXISTS idx_development_application_events_application ON public.development_application_events (application_id, created_at);
CREATE INDEX IF NOT EXISTS idx_development_application_events_company ON public.development_application_events (company_id, created_at DESC);

-- ---------------------------------------------------------------- pure machine helpers (service role; TS mirrors)

-- The machine (lib/applicationMachine.ts transitionTarget): the status a
-- (status, action) pair leads to, or '!' and the refusal (22023 message).
-- edit_fields keeps the status; final_approve is shown completing the final
-- review (until the final-approval rule is met the status stays).
CREATE OR REPLACE FUNCTION public.development_transition_target(p_status text, p_action text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_status = 'voided' THEN
    RETURN '!application_voided';
  END IF;
  IF p_status IN ('rejected', 'cancelled', 'closed') THEN
    RETURN CASE WHEN p_action = 'void' THEN 'voided' ELSE '!application_final' END;
  END IF;
  RETURN CASE
    WHEN p_action = 'void' THEN 'voided'
    WHEN p_action = 'submit' AND p_status IN ('draft', 'returned') THEN 'hod_review'
    WHEN p_action = 'hod_approve' AND p_status IN ('submitted', 'hod_review') THEN 'captain_purser_review'
    WHEN p_action = 'hod_return' AND p_status IN ('submitted', 'hod_review') THEN 'returned'
    WHEN p_action = 'final_approve' AND p_status IN ('captain_purser_review', 'purser_review', 'captain_review') THEN 'approved'
    WHEN p_action = 'final_approve_discretionary' AND p_status IN ('captain_purser_review', 'purser_review', 'captain_review') THEN 'discretionary_approved'
    WHEN p_action = 'return' AND p_status IN ('captain_purser_review', 'purser_review', 'captain_review') THEN 'returned'
    WHEN p_action = 'reject' AND p_status IN ('submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review') THEN 'rejected'
    WHEN p_action = 'cancel' AND p_status IN ('draft', 'returned', 'submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review',
                                               'approved', 'discretionary_approved', 'enrolled') THEN 'cancelled'
    WHEN p_action = 'enrol' AND p_status IN ('approved', 'discretionary_approved') THEN 'enrolled'
    WHEN p_action = 'complete' AND p_status IN ('approved', 'discretionary_approved', 'enrolled') THEN 'completed'
    WHEN p_action = 'reimburse' AND p_status = 'completed' THEN 'reimbursed'
    WHEN p_action = 'close' AND p_status IN ('completed', 'reimbursed') THEN 'closed'
    WHEN p_action = 'edit_fields' AND p_status IN ('submitted', 'hod_review', 'captain_purser_review', 'purser_review', 'captain_review',
                                                    'approved', 'discretionary_approved', 'enrolled') THEN p_status
    ELSE '!invalid_transition'
  END;
END;
$$;

-- Who may take the action in that status (lib/applicationMachine.ts
-- actionActors; the actor-table markers of the SQL test), in the order the
-- definer picks the role it acts in. Empty when the pair is refused.
CREATE OR REPLACE FUNCTION public.development_action_actors(p_action text, p_status text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_hod_stage boolean := p_status IN ('submitted', 'hod_review');
  v_final_stage boolean := p_status IN ('captain_purser_review', 'purser_review', 'captain_review');
BEGIN
  IF left(public.development_transition_target(p_status, p_action), 1) = '!' THEN
    RETURN '{}'::text[];
  END IF;
  RETURN CASE p_action
    WHEN 'submit' THEN ARRAY['applicant']
    WHEN 'hod_approve' THEN ARRAY['hod']
    WHEN 'hod_return' THEN ARRAY['hod']
    WHEN 'final_approve' THEN ARRAY['captain', 'purser']
    WHEN 'final_approve_discretionary' THEN ARRAY['captain']
    WHEN 'return' THEN ARRAY['captain', 'purser']
    WHEN 'reject' THEN CASE WHEN v_hod_stage THEN ARRAY['hod'] WHEN v_final_stage THEN ARRAY['captain', 'purser'] ELSE '{}'::text[] END
    WHEN 'cancel' THEN CASE WHEN p_status IN ('approved', 'discretionary_approved', 'enrolled') THEN ARRAY['captain', 'purser', 'training_admin']
                            ELSE ARRAY['applicant'] END
    WHEN 'enrol' THEN ARRAY['applicant', 'captain', 'purser', 'training_editor', 'training_admin']
    WHEN 'complete' THEN ARRAY['applicant', 'captain', 'purser', 'training_editor', 'training_admin']
    WHEN 'reimburse' THEN ARRAY['captain', 'purser', 'training_admin']
    WHEN 'close' THEN ARRAY['captain', 'purser', 'training_admin']
    WHEN 'void' THEN ARRAY['captain', 'purser', 'training_admin']
    WHEN 'edit_fields' THEN ARRAY['hod', 'captain', 'purser', 'training_editor', 'training_admin']
    ELSE '{}'::text[]
  END;
END;
$$;

-- ---------------------------------------------------------------- roles on an application (service role; RLS helpers for the browser)

-- Whether _user_id holds the vessel's captain or purser office: an active
-- member of the vessel's company who reaches it (reach or fleet reach) and
-- is no external viewer, and (captain) the vessel's Master
-- (record_is_master), or an active, unexpired user_roles row of that role
-- in the company (on the vessel, or company-wide), or an active RBAC role
-- of that name on the vessel (or not bound to a vessel). Unknown ids, an
-- unknown role, an inactive user: false.
CREATE OR REPLACE FUNCTION public.development_vessel_role_for(_user_id uuid, _vessel_id uuid, _role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF _user_id IS NULL OR _vessel_id IS NULL OR _role IS NULL OR _role NOT IN ('captain', 'purser') THEN
    RETURN false;
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = _vessel_id;
  IF v_company IS NULL THEN
    RETURN false;
  END IF;
  IF NOT coalesce(public.user_is_active(_user_id), false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = v_company)
     OR public.record_user_is_external(_user_id, v_company)
     OR NOT (coalesce(public.reach_vessel_for(_user_id, _vessel_id), false) OR coalesce(public.fleet_reach_for(_user_id, v_company), false)) THEN
    RETURN false;
  END IF;
  IF _role = 'captain' AND coalesce(public.record_is_master(_user_id, _vessel_id), false) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
           SELECT 1 FROM public.user_roles AS ur
           WHERE ur.user_id = _user_id AND ur.role::text = _role
             AND coalesce(ur.is_active, false) AND (ur.expires_at IS NULL OR ur.expires_at > now())
             AND ur.company_id = v_company
             AND (ur.vessel_id IS NULL OR ur.vessel_id = _vessel_id))
      OR EXISTS (
           SELECT 1 FROM public.rbac_user_roles AS r
           JOIN public.roles AS ro ON ro.id = r.role_id
           WHERE r.user_id = _user_id AND coalesce(r.is_active, false)
             AND (r.valid_from IS NULL OR r.valid_from <= now()) AND (r.valid_until IS NULL OR r.valid_until > now())
             AND lower(ro.name) = _role
             AND (r.vessel_id IS NULL OR r.vessel_id = _vessel_id));
END;
$$;

-- The applicant's department on the vessel: the department of their
-- current assignment there, else their profile's department; NULL when
-- neither is set (then only an HOD of every department covers them).
-- Internal.
CREATE OR REPLACE FUNCTION public.development_applicant_department(_applicant_id uuid, _vessel_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _applicant_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN coalesce(
    (SELECT nullif(btrim(ca.department), '') FROM public.crew_assignments AS ca
     WHERE ca.user_id = _applicant_id AND ca.vessel_id = _vessel_id AND ca.is_current
     ORDER BY ca.join_date DESC NULLS LAST, ca.id LIMIT 1),
    (SELECT nullif(btrim(p.department), '') FROM public.profiles AS p WHERE p.user_id = _applicant_id));
END;
$$;

-- RLS helper of the development_applications SELECT policy: whether the
-- caller reviews applications of _applicant_id on _vessel_id (the vessel's
-- Captain or Purser, or an HOD covering the applicant's department).
-- Caller-only (false when a signed-in caller asks about anyone else, so it
-- discloses nobody's offices); false for the applicant themselves, an
-- inactive user and NULL ids.
CREATE OR REPLACE FUNCTION public.development_reviewer_for(_user_id uuid, _vessel_id uuid, _applicant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept text;
BEGIN
  IF _user_id IS NULL OR _vessel_id IS NULL OR _applicant_id IS NULL OR _user_id = _applicant_id THEN
    RETURN false;
  END IF;
  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;
  IF NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  IF coalesce(public.development_vessel_role_for(_user_id, _vessel_id, 'captain'), false)
     OR coalesce(public.development_vessel_role_for(_user_id, _vessel_id, 'purser'), false) THEN
    RETURN true;
  END IF;
  v_dept := public.development_applicant_department(_applicant_id, _vessel_id);
  RETURN coalesce(public.fleet_hod_covers(_user_id, _vessel_id, v_dept), false);
END;
$$;

-- RLS helper of the fleet_training_participants policies: the company of
-- an application, only when it is the caller's own company (NULL
-- otherwise, and for an inactive caller), so it discloses nothing.
CREATE OR REPLACE FUNCTION public.development_application_company(_application_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF _application_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT a.company_id INTO v_company FROM public.development_applications AS a WHERE a.id = _application_id;
  IF v_company IS NULL OR (auth.uid() IS NOT NULL AND v_company IS DISTINCT FROM public.get_user_company_id(auth.uid())) THEN
    RETURN NULL;
  END IF;
  RETURN v_company;
END;
$$;

-- The roles _user_id holds on the application (the actor table's words):
-- the applicant holds 'applicant' only (nobody reviews their own
-- application); anyone else: hod, captain, purser, training_editor,
-- training_admin as they hold them. Inactive, another company: none.
CREATE OR REPLACE FUNCTION public.development_actor_roles_for(_user_id uuid, _application public.development_applications)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles text[] := '{}'::text[];
  v_dept text;
BEGIN
  IF _user_id IS NULL OR _application.id IS NULL THEN
    RETURN v_roles;
  END IF;
  IF NOT coalesce(public.user_is_active(_user_id), false) OR public.get_user_company_id(_user_id) IS DISTINCT FROM _application.company_id THEN
    RETURN v_roles;
  END IF;
  IF _user_id = _application.crew_member_id THEN
    RETURN ARRAY['applicant'];
  END IF;
  v_dept := public.development_applicant_department(_application.crew_member_id, _application.vessel_id);
  IF coalesce(public.fleet_hod_covers(_user_id, _application.vessel_id, v_dept), false) THEN
    v_roles := v_roles || 'hod'::text;
  END IF;
  IF coalesce(public.development_vessel_role_for(_user_id, _application.vessel_id, 'captain'), false) THEN
    v_roles := v_roles || 'captain'::text;
  END IF;
  IF coalesce(public.development_vessel_role_for(_user_id, _application.vessel_id, 'purser'), false) THEN
    v_roles := v_roles || 'purser'::text;
  END IF;
  IF coalesce(public.fleet_ops_can_for(_user_id, _application.company_id, _application.vessel_id, 'training', 'edit'), false) THEN
    v_roles := v_roles || 'training_editor'::text;
  END IF;
  IF coalesce(public.fleet_ops_can_for(_user_id, _application.company_id, NULL, 'training', 'admin'), false) THEN
    v_roles := v_roles || 'training_admin'::text;
  END IF;
  RETURN v_roles;
END;
$$;

-- ---------------------------------------------------------------- numbering (gap/00 §7: no MAX()+1)

-- The next application number of the company: CDA-YYYYMMDD-NNNN with the
-- sequence from the counter 'dev_app:<company>'. The counter is seeded once
-- from the company's highest existing number (ON CONFLICT DO NOTHING, so
-- two first inserts seed it once), then next_reference_value() serialises
-- every caller on the counter row: no two inserts read the same value.
CREATE OR REPLACE FUNCTION public.development_application_number_for(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope text;
  v_seq integer;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'company_required';
  END IF;
  v_scope := 'dev_app:' || _company_id::text;
  IF NOT EXISTS (SELECT 1 FROM public.reference_counters AS rc WHERE rc.scope = v_scope) THEN
    INSERT INTO public.reference_counters (scope, next_value)
    SELECT v_scope, coalesce(max(substring(a.application_number FROM '^CDA-[0-9]{8}-([0-9]{1,9})$')::integer), 0) + 1
    FROM public.development_applications AS a
    WHERE a.company_id = _company_id
    ON CONFLICT (scope) DO NOTHING;
  END IF;
  v_seq := public.next_reference_value(v_scope);
  RETURN 'CDA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- The live trigger function, redefined here once (D-120), and its trigger
-- recreated without the legacy WHEN clause (D-379): every insert passes
-- through it. A number the caller supplies is kept only for STORM's own
-- definers (storm.fleet_tx = 'on') and for non-browser roles (the service
-- role, the owner's import, no-JWT maintenance); a browser caller
-- (authenticated or anon) always gets the next counter value, so a crew
-- member cannot take a number ahead of the counter and block every later
-- application of the company on the unique key.
CREATE OR REPLACE FUNCTION public.generate_dev_application_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.application_number, '') <> ''
     AND (coalesce(current_setting('storm.fleet_tx', true), '') = 'on'
          OR coalesce(auth.role(), '') NOT IN ('authenticated', 'anon')) THEN
    RETURN NEW;
  END IF;
  NEW.application_number := public.development_application_number_for(NEW.company_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_application_number ON public.development_applications;
CREATE TRIGGER trg_dev_application_number
  BEFORE INSERT ON public.development_applications
  FOR EACH ROW EXECUTE FUNCTION public.generate_dev_application_number();

-- Seed the counters from today's numbers (greater value wins on a re-run).
INSERT INTO public.reference_counters (scope, next_value)
SELECT 'dev_app:' || a.company_id::text,
       coalesce(max(substring(a.application_number FROM '^CDA-[0-9]{8}-([0-9]{1,9})$')::integer), 0) + 1
FROM public.development_applications AS a
GROUP BY a.company_id
ON CONFLICT (scope) DO UPDATE SET next_value = greatest(public.reference_counters.next_value, EXCLUDED.next_value), updated_at = now();

-- ---------------------------------------------------------------- guards and audit (every role)

CREATE OR REPLACE FUNCTION public.development_applications_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag boolean := coalesce(current_setting('storm.fleet_tx', true), '') = 'on';
  v_lifecycle text[] := ARRAY[
    'status', 'submitted_at', 'stage_entered_at',
    'hod_reviewer_id', 'hod_reviewed_at', 'hod_decision', 'hod_comments',
    'purser_reviewer_id', 'purser_reviewed_at', 'purser_decision', 'purser_comments',
    'captain_reviewer_id', 'captain_reviewed_at', 'captain_decision', 'captain_comments',
    'is_discretionary', 'discretionary_justification', 'denial_reason',
    'rejected_at', 'rejected_by', 'voided_at', 'voided_by', 'void_reason', 'cancelled_at', 'cancelled_by', 'cancel_reason',
    'completed_at', 'completion_certificate_url', 'qualification_record_id',
    'suggested_alternative_course_id', 'suggested_alternative_notes',
    'reimbursement_total_usd', 'upfront_payment_by_inkfish', 'clawback_end_date', 'reported_to_fleet_at',
    'actual_tuition_usd', 'actual_accommodation_usd', 'actual_travel_usd', 'actual_food_per_diem_usd'];
  v_changed text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_flag OR pg_trigger_depth() > 1 OR OLD.status = 'draft' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'development_applications_guarded', DETAIL = 'Only a draft application is deleted; void it instead.';
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
                           OR NEW.crew_member_id IS DISTINCT FROM OLD.crew_member_id
                           OR NEW.application_number IS DISTINCT FROM OLD.application_number
                           OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'development_applications_guarded', DETAIL = 'An application never changes its id, company, applicant, number or creation time.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'development_applications_guarded', DETAIL = 'An application''s vessel belongs to its company.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_flag THEN
      NEW.stage_entered_at := coalesce(NEW.stage_entered_at, now());
      RETURN NEW;
    END IF;
    IF coalesce(NEW.status, 'draft') <> 'draft'
       OR NEW.submitted_at IS NOT NULL
       OR NEW.hod_reviewer_id IS NOT NULL OR NEW.hod_reviewed_at IS NOT NULL OR NEW.hod_decision IS NOT NULL OR NEW.hod_comments IS NOT NULL
       OR NEW.purser_reviewer_id IS NOT NULL OR NEW.purser_reviewed_at IS NOT NULL OR NEW.purser_decision IS NOT NULL OR NEW.purser_comments IS NOT NULL
       OR NEW.captain_reviewer_id IS NOT NULL OR NEW.captain_reviewed_at IS NOT NULL OR NEW.captain_decision IS NOT NULL OR NEW.captain_comments IS NOT NULL
       OR coalesce(NEW.is_discretionary, false) OR NEW.discretionary_justification IS NOT NULL OR NEW.denial_reason IS NOT NULL
       OR NEW.rejected_at IS NOT NULL OR NEW.rejected_by IS NOT NULL OR NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL
       OR NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.cancel_reason IS NOT NULL
       OR NEW.completed_at IS NOT NULL OR NEW.completion_certificate_url IS NOT NULL OR NEW.qualification_record_id IS NOT NULL
       OR NEW.suggested_alternative_course_id IS NOT NULL OR NEW.suggested_alternative_notes IS NOT NULL
       OR coalesce(NEW.reimbursement_total_usd, 0) <> 0 OR coalesce(NEW.upfront_payment_by_inkfish, 0) <> 0
       OR NEW.clawback_end_date IS NOT NULL OR NEW.reported_to_fleet_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'development_applications_guarded', DETAIL = 'An application starts as a draft with no decisions; only development_transition() moves it on.';
    END IF;
    NEW.status := 'draft';
    NEW.stage_entered_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE
  IF v_flag THEN
    RETURN NEW;
  END IF;
  SELECT k INTO v_changed
  FROM unnest(v_lifecycle) AS k
  WHERE (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k)
  LIMIT 1;
  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'development_applications_guarded',
      DETAIL = format('Only development_transition() changes %s.', v_changed);
  END IF;
  IF OLD.status NOT IN ('draft', 'returned') AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'development_applications_guarded',
      DETAIL = 'A submitted application is changed by its approvers through development_transition(); the applicant edits a draft or a returned one.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_development_applications_guard ON public.development_applications;
CREATE TRIGGER trg_development_applications_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.development_applications
  FOR EACH ROW EXECUTE FUNCTION public.development_applications_guard();

-- One history row (D-X5-23) with the caller as actor. Internal: the
-- definers and the audit trigger.
CREATE OR REPLACE FUNCTION public.development_application_log(
  _application public.development_applications,
  _action text,
  _from_status text,
  _to_status text,
  _actor_role text,
  _comment text,
  _field_diff jsonb,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.development_application_events (company_id, vessel_id, application_id, actor_user_id, actor_profile_id, actor_role,
                                                     action, from_status, to_status, comment, field_diff, payload)
  VALUES (_application.company_id, _application.vessel_id, _application.id, v_uid,
          (SELECT p.id FROM public.profiles AS p WHERE p.user_id = v_uid), _actor_role,
          _action, _from_status, _to_status, left(_comment, 2000), _field_diff, coalesce(_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN v_id;
END;
$$;

-- The 'created' history row of every new application (the definers log
-- their own transitions).
CREATE OR REPLACE FUNCTION public.development_applications_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.development_application_log(NEW, 'created', NULL, NEW.status,
    CASE WHEN auth.uid() IS NOT DISTINCT FROM NEW.crew_member_id THEN 'applicant' END, NULL, NULL,
    jsonb_build_object('application_number', NEW.application_number, 'course_name', NEW.course_name));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_development_applications_audit ON public.development_applications;
CREATE TRIGGER trg_development_applications_audit
  AFTER INSERT ON public.development_applications
  FOR EACH ROW EXECUTE FUNCTION public.development_applications_audit();

-- Events: inserted only under the flag; never updated or deleted (a
-- cascade of the application, vessel or company excepted).
CREATE OR REPLACE FUNCTION public.development_application_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('storm.fleet_tx', true) = 'on' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'development_application_events_guarded', DETAIL = 'Application history is written only by the development definers.';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'development_application_events_guarded', DETAIL = 'Application history is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_development_application_events_guard ON public.development_application_events;
CREATE TRIGGER trg_development_application_events_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.development_application_events
  FOR EACH ROW EXECUTE FUNCTION public.development_application_events_guard();

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.development_application_events ENABLE ROW LEVEL SECURITY;

-- Applications: the applicant, a named reviewer, a reviewer of the vessel
-- for that applicant, or a training viewer who reaches the vessel; active
-- members of the row's company only.
DROP POLICY IF EXISTS "Company members can view applications" ON public.development_applications;
DROP POLICY IF EXISTS development_applications_select ON public.development_applications;
CREATE POLICY development_applications_select ON public.development_applications
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.user_is_active(auth.uid()))
    AND (
      crew_member_id = (SELECT auth.uid())
      OR (SELECT auth.uid()) IN (hod_reviewer_id, captain_reviewer_id, purser_reviewer_id)
      OR public.development_reviewer_for((SELECT auth.uid()), vessel_id, crew_member_id)
      OR public.fleet_ops_can(company_id, vessel_id, 'training', 'view')
    )
  );

-- The applicant edits their own draft or returned application (the guard
-- keeps it to content); reviewers act through development_transition().
DROP POLICY IF EXISTS "Authorized users can update applications" ON public.development_applications;
DROP POLICY IF EXISTS development_applications_update_own ON public.development_applications;
CREATE POLICY development_applications_update_own ON public.development_applications
  FOR UPDATE TO authenticated
  USING (
    crew_member_id = (SELECT auth.uid())
    AND (SELECT public.user_is_active(auth.uid()))
    AND company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND status IN ('draft', 'returned')
  )
  WITH CHECK (
    crew_member_id = (SELECT auth.uid())
    AND (SELECT public.user_is_active(auth.uid()))
    AND company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND status IN ('draft', 'returned')
  );

-- History: whoever can read the application.
DROP POLICY IF EXISTS development_application_events_select ON public.development_application_events;
CREATE POLICY development_application_events_select ON public.development_application_events
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND EXISTS (SELECT 1 FROM public.development_applications AS a WHERE a.id = application_id)
  );

REVOKE ALL ON public.development_application_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.development_application_events TO authenticated;
GRANT ALL ON public.development_application_events TO service_role;

-- Catalogue and settings: written by the definers only (the company read
-- policies stay).
DROP POLICY IF EXISTS "Fleet admin can insert courses" ON public.development_courses;
DROP POLICY IF EXISTS "Fleet admin can update courses" ON public.development_courses;
DROP POLICY IF EXISTS "Fleet admin can delete courses" ON public.development_courses;
DROP POLICY IF EXISTS "Fleet admin can manage program settings" ON public.program_settings;
REVOKE INSERT, UPDATE, DELETE ON public.development_courses FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.program_settings FROM anon, authenticated;

-- Participants of a fleet-organised training: read by the participant and
-- by readers of the application; written by fleet training editors of the
-- application's company (the live policies had no company pin).
DROP POLICY IF EXISTS "Company members can view participants" ON public.fleet_training_participants;
DROP POLICY IF EXISTS "Fleet admin can manage participants" ON public.fleet_training_participants;
DROP POLICY IF EXISTS "Fleet admin can update participants" ON public.fleet_training_participants;
DROP POLICY IF EXISTS "Fleet admin can delete participants" ON public.fleet_training_participants;
DROP POLICY IF EXISTS fleet_training_participants_select ON public.fleet_training_participants;
DROP POLICY IF EXISTS fleet_training_participants_insert ON public.fleet_training_participants;
DROP POLICY IF EXISTS fleet_training_participants_update ON public.fleet_training_participants;
DROP POLICY IF EXISTS fleet_training_participants_delete ON public.fleet_training_participants;
CREATE POLICY fleet_training_participants_select ON public.fleet_training_participants
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_is_active(auth.uid()))
    AND public.development_application_company(application_id) = (SELECT public.get_user_company_id(auth.uid()))
    AND (
      crew_member_id = (SELECT auth.uid())
      OR EXISTS (SELECT 1 FROM public.development_applications AS a WHERE a.id = application_id)
    )
  );
CREATE POLICY fleet_training_participants_insert ON public.fleet_training_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), public.development_application_company(application_id))
    AND public.fleet_ops_can(public.development_application_company(application_id), NULL::uuid, 'training', 'edit')
    AND public.user_belongs_to_company(crew_member_id, public.development_application_company(application_id))
  );
CREATE POLICY fleet_training_participants_update ON public.fleet_training_participants
  FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), public.development_application_company(application_id))
    AND public.fleet_ops_can(public.development_application_company(application_id), NULL::uuid, 'training', 'edit')
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), public.development_application_company(application_id))
    AND public.fleet_ops_can(public.development_application_company(application_id), NULL::uuid, 'training', 'edit')
    AND public.user_belongs_to_company(crew_member_id, public.development_application_company(application_id))
  );
CREATE POLICY fleet_training_participants_delete ON public.fleet_training_participants
  FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), public.development_application_company(application_id))
    AND public.fleet_ops_can(public.development_application_company(application_id), NULL::uuid, 'training', 'edit')
  );

-- ---------------------------------------------------------------- completion -> qualification (TR9, contract 3)

-- Writes the course's qualification for a completed application, once:
-- an existing qualification_record_id is returned as is. X1's
-- crew_document_record_from_source when the course names a crew document
-- type and the function exists (EXECUTE; it is idempotent per source and
-- reference), else a legacy crew_certificates row. Expiry = completed_on +
-- the course's valid_for_months (NULL: no expiry). Internal.
CREATE OR REPLACE FUNCTION public.development_record_qualification(_application public.development_applications, _completed_on date, _certificate_number text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course public.development_courses;
  v_expiry date;
  v_label text;
  v_profile uuid;
  v_id uuid;
BEGIN
  IF _application.qualification_record_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.crew_certificates AS c WHERE c.id = _application.qualification_record_id) THEN
    RETURN _application.qualification_record_id;
  END IF;
  IF _application.course_id IS NOT NULL THEN
    SELECT * INTO v_course FROM public.development_courses AS c WHERE c.id = _application.course_id AND c.company_id = _application.company_id;
  END IF;
  v_expiry := CASE WHEN v_course.valid_for_months IS NOT NULL THEN (_completed_on + make_interval(months => v_course.valid_for_months))::date END;
  v_label := left(coalesce(nullif(btrim(v_course.qualification_label), ''), nullif(btrim(v_course.name), ''), _application.course_name), 200);

  IF v_course.qualification_document_type_id IS NOT NULL
     AND to_regprocedure('public.crew_document_record_from_source(uuid,uuid,date,date,text,uuid)') IS NOT NULL THEN
    SELECT p.id INTO v_profile FROM public.profiles AS p WHERE p.user_id = _application.crew_member_id;
    EXECUTE 'SELECT public.crew_document_record_from_source($1, $2, $3, $4, $5, $6)'
      INTO v_id
      USING v_profile, v_course.qualification_document_type_id, _completed_on, v_expiry, 'training'::text, _application.id;
    RETURN v_id;
  END IF;

  INSERT INTO public.crew_certificates (user_id, certificate_type, certificate_name, certificate_number, issue_date, expiry_date,
                                        issuing_authority, notes, created_by, updated_by)
  VALUES (_application.crew_member_id, 'Training', v_label, nullif(btrim(coalesce(_certificate_number, '')), ''), _completed_on, v_expiry,
          nullif(btrim(coalesce(_application.course_provider, '')), ''),
          left('Recorded on completion of training application ' || _application.application_number, 500),
          auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- notifications (X4; PR-08 types, D-128, D-238, D-249)

-- After a transition: the next actor (training_application_action_needed)
-- and, when someone else acted, the applicant (training_application_updated).
-- Each emit is guarded: an unknown type or a failed fan-out is a WARNING
-- and never rolls the transition back. Returns {next, admins, applicant}.
CREATE OR REPLACE FUNCTION public.development_application_notify(_application public.development_applications, _action text, _event_id uuid, _mode text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.development_applications := _application;
  v_uid uuid := auth.uid();
  v_dept text;
  v_next uuid[] := '{}'::uuid[];
  v_admins uuid[] := '{}'::uuid[];
  v_name text;
  v_stage text;
  v_status_label text;
  v_applicant boolean := false;
  v_detail text;
BEGIN
  SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
  INTO v_name
  FROM public.profiles AS p WHERE p.user_id = a.crew_member_id;
  v_dept := public.development_applicant_department(a.crew_member_id, a.vessel_id);

  IF a.status IN ('submitted', 'hod_review') AND _action <> 'edit_fields' THEN
    v_stage := 'HOD';
    SELECT coalesce(array_agg(DISTINCT ur.user_id), '{}'::uuid[]) INTO v_next
    FROM public.user_roles AS ur
    JOIN public.profiles AS p ON p.user_id = ur.user_id AND p.company_id = a.company_id
    WHERE ur.role::text = 'hod' AND ur.user_id IS DISTINCT FROM a.crew_member_id
      AND public.fleet_hod_covers(ur.user_id, a.vessel_id, v_dept);
  ELSIF a.status IN ('captain_purser_review', 'purser_review', 'captain_review') AND _action IN ('hod_approve', 'final_approve', 'final_approve_discretionary') THEN
    v_stage := 'final';
    SELECT coalesce(array_agg(DISTINCT c.user_id), '{}'::uuid[]) INTO v_next
    FROM (
      SELECT ur.user_id, ur.role::text AS role FROM public.user_roles AS ur
      WHERE ur.company_id = a.company_id AND ur.role::text IN ('captain', 'purser')
      UNION
      SELECT r.user_id, lower(ro.name) FROM public.rbac_user_roles AS r JOIN public.roles AS ro ON ro.id = r.role_id
      WHERE lower(ro.name) IN ('captain', 'purser') AND (r.vessel_id IS NULL OR r.vessel_id = a.vessel_id)
      UNION
      SELECT ca.user_id, 'captain' FROM public.crew_assignments AS ca WHERE ca.vessel_id = a.vessel_id AND ca.is_current
    ) AS c
    WHERE c.user_id IS DISTINCT FROM a.crew_member_id
      AND c.user_id IS DISTINCT FROM a.captain_reviewer_id AND c.user_id IS DISTINCT FROM a.purser_reviewer_id
      AND ((c.role = 'captain' AND (_mode = 'either' OR a.captain_decision IS NULL OR a.captain_decision NOT IN ('approved', 'discretionary_approved')))
           OR (c.role = 'purser' AND (_mode = 'either' OR a.purser_decision IS NULL OR a.purser_decision <> 'approved')))
      AND public.development_vessel_role_for(c.user_id, a.vessel_id, c.role);
  ELSIF a.status = 'completed' AND _action = 'complete' THEN
    SELECT coalesce(array_agg(DISTINCT p.user_id), '{}'::uuid[]) INTO v_admins
    FROM public.profiles AS p
    WHERE p.company_id = a.company_id AND p.user_id IS NOT NULL AND p.user_id IS DISTINCT FROM a.crew_member_id
      AND (((p.role::text IN ('dpa', 'shore_management')
             OR EXISTS (SELECT 1 FROM public.rbac_user_roles AS r WHERE r.user_id = p.user_id AND coalesce(r.is_active, false)))
            AND public.fleet_ops_can_for(p.user_id, a.company_id, NULL, 'training', 'admin'))
           -- W3 "completion notifies HR" (D-383): HR viewers of the same
           -- company, active, alongside the training admins.
           OR (public.user_is_active(p.user_id) AND public.hr_can_view(p.user_id)));
  END IF;

  IF cardinality(v_next) > 0 THEN
    BEGIN
      PERFORM public.emit_notification_event(
        'training_application_action_needed', a.company_id, left('Training application to review: ' || a.course_name, 120), 'vessel', a.vessel_id,
        left(concat_ws(' · ', v_name, a.application_number) || CASE WHEN v_stage = 'HOD' THEN '. Waiting for the head of department.' ELSE '. Waiting for the final approval.' END, 280),
        'info', 'crew/training', NULL, NULL, a.id, a.application_number, NULL, v_next, '{}'::text[],
        jsonb_build_object('application_id', a.id, 'status', a.status, 'stage', v_stage),
        'dta:' || _event_id::text || ':next', 'crew_training');
    EXCEPTION WHEN others THEN
      RAISE WARNING 'training_application_action_needed not emitted for application %: %', a.id, SQLERRM;
    END;
  END IF;

  IF cardinality(v_admins) > 0 THEN
    BEGIN
      PERFORM public.emit_notification_event(
        'training_application_action_needed', a.company_id, left('Training completed: ' || a.course_name, 120), 'fleet', NULL,
        left(concat_ws(' · ', v_name, a.application_number) || '. Ready for reimbursement or closing.', 280),
        'info', 'training/applications', NULL, NULL, a.id, a.application_number, NULL, v_admins, '{}'::text[],
        jsonb_build_object('application_id', a.id, 'status', a.status, 'stage', 'training_admin'),
        'dta:' || _event_id::text || ':admins', NULL);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'training_application_action_needed (admins) not emitted for application %: %', a.id, SQLERRM;
    END;
  END IF;

  IF v_uid IS DISTINCT FROM a.crew_member_id THEN
    v_status_label := CASE a.status
      WHEN 'hod_review' THEN 'waiting for the head of department'
      WHEN 'submitted' THEN 'waiting for the head of department'
      WHEN 'captain_purser_review' THEN 'waiting for the final approval'
      WHEN 'purser_review' THEN 'waiting for the final approval'
      WHEN 'captain_review' THEN 'waiting for the final approval'
      WHEN 'approved' THEN 'approved'
      WHEN 'discretionary_approved' THEN 'approved (discretionary)'
      WHEN 'enrolled' THEN 'enrolled'
      WHEN 'completed' THEN 'completed'
      WHEN 'reimbursed' THEN 'reimbursed'
      WHEN 'closed' THEN 'closed'
      WHEN 'returned' THEN 'returned to you for changes'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'voided' THEN 'voided'
      ELSE a.status
    END;
    v_detail := CASE WHEN _action = 'edit_fields' THEN 'An approver corrected some details.' ELSE 'It is now ' || v_status_label || '.' END;
    BEGIN
      PERFORM public.emit_notification_event(
        'training_application_updated', a.company_id, left('Your training application: ' || a.course_name, 120), 'personal', NULL,
        left(a.application_number || '. ' || v_detail, 280), 'info', 'training', NULL, NULL, a.id, a.application_number, NULL,
        ARRAY[a.crew_member_id], '{}'::text[],
        jsonb_build_object('application_id', a.id, 'status', a.status, 'action', _action),
        'dta:' || _event_id::text || ':applicant', NULL);
      v_applicant := true;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'training_application_updated not emitted for application %: %', a.id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('next', cardinality(v_next), 'admins', cardinality(v_admins), 'applicant', v_applicant);
END;
$$;

-- ---------------------------------------------------------------- the transition (W3, TR4, TR5, TR6, TR9)

-- Moves an application along the machine. p_action is one of submit,
-- hod_approve, hod_return, final_approve, final_approve_discretionary,
-- return, reject, cancel, enrol, complete, reimburse, close, void,
-- edit_fields; p_payload carries role ('captain' | 'purser', when the
-- caller holds both offices), comment, reason, justification, completed_on,
-- certificate_number, evidence_path, fields (edit_fields). Order of checks:
-- the caller (42501 not_permitted), the action (22023 unknown_action), the
-- application in the caller's company that the caller may act on or read
-- (P0002 application_not_found), the optional expected updated_at (22023
-- stale_application), the machine (22023 invalid_transition |
-- application_final | application_voided), the caller's role (42501
-- not_permitted; 22023 role_required, already_decided, same_approver), the
-- payload (22023 comment_required, reason_required,
-- justification_required, completed_on_required, completed_on_invalid,
-- completed_on_in_future, text_too_long, evidence_path_invalid,
-- fields_required, field_not_editable, field_invalid, nothing_changed).
-- One event row, a stamped stage, the notifications. Returns
-- {id, status, from_status, action, actor_role, event_id, updated_at,
-- stage_entered_at, qualification_record_id, notified}.
CREATE OR REPLACE FUNCTION public.development_transition(
  p_application_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
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
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  a public.development_applications;
  n public.development_applications;
  v_target text;
  v_allowed text[];
  v_roles text[];
  v_role text;
  v_want_role text;
  v_mode text;
  v_comment text;
  v_reason text;
  v_justification text;
  v_completed_on date;
  v_certificate text;
  v_evidence text;
  v_fields jsonb;
  v_diff jsonb;
  v_key text;
  v_new_status text;
  v_discretionary boolean;
  v_other_ok boolean;
  v_qualification uuid;
  v_event uuid;
  v_notified jsonb;
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_rows integer;
  v_clawback integer;
  v_editable text[] := ARRAY[
    'course_name', 'course_provider', 'course_description', 'course_url', 'course_location', 'course_start_date', 'course_end_date',
    'course_duration_days', 'course_duration_hours', 'category', 'estimated_tuition_usd', 'estimated_travel_usd', 'estimated_travel_route',
    'estimated_accommodation_usd', 'estimated_accommodation_nights', 'estimated_accommodation_nightly_rate', 'estimated_food_per_diem_usd',
    'leave_days_accrued', 'neutral_days_accrued', 'application_currency', 'exchange_rate_to_usd', 'tuition_local_amount',
    'travel_local_amount', 'accommodation_local_amount'];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('submit', 'hod_approve', 'hod_return', 'final_approve', 'final_approve_discretionary', 'return', 'reject',
                                           'cancel', 'enrol', 'complete', 'reimburse', 'close', 'void', 'edit_fields') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unknown_action';
  END IF;
  IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid';
  END IF;

  SELECT * INTO a FROM public.development_applications AS x WHERE x.id = p_application_id AND x.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'application_not_found';
  END IF;
  v_roles := public.development_actor_roles_for(v_uid, a);
  IF cardinality(v_roles) = 0 AND NOT coalesce(public.fleet_ops_can_for(v_uid, a.company_id, a.vessel_id, 'training', 'view'), false) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'application_not_found';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND a.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stale_application', DETAIL = 'Someone changed this application since you opened it.';
  END IF;

  v_target := public.development_transition_target(a.status, p_action);
  IF left(v_target, 1) = '!' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = substr(v_target, 2);
  END IF;

  -- The role the caller acts in.
  v_allowed := public.development_action_actors(p_action, a.status);
  v_want_role := nullif(btrim(coalesce(v_payload ->> 'role', '')), '');
  IF v_want_role IS NOT NULL THEN
    IF NOT (v_want_role = ANY (v_allowed)) OR NOT (v_want_role = ANY (v_roles)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
    END IF;
    v_role := v_want_role;
  ELSE
    SELECT r INTO v_role FROM unnest(v_allowed) WITH ORDINALITY AS t(r, o) WHERE r = ANY (v_roles) ORDER BY o LIMIT 1;
    IF v_role IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
    END IF;
    IF p_action IN ('final_approve', 'return', 'reject') AND v_role IN ('captain', 'purser')
       AND 'captain' = ANY (v_roles) AND 'purser' = ANY (v_roles) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'role_required', DETAIL = 'Say whether you act as the Captain or the Purser.';
    END IF;
  END IF;

  -- The payload.
  v_comment := nullif(btrim(coalesce(v_payload ->> 'comment', '')), '');
  v_reason := nullif(btrim(coalesce(v_payload ->> 'reason', v_payload ->> 'comment', '')), '');
  v_justification := nullif(btrim(coalesce(v_payload ->> 'justification', '')), '');
  IF coalesce(length(v_comment), 0) > 2000 OR coalesce(length(v_reason), 0) > 2000 OR coalesce(length(v_justification), 0) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'text_too_long';
  END IF;
  IF p_action IN ('hod_return', 'return') AND v_comment IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'comment_required';
  END IF;
  IF (p_action IN ('reject', 'void') OR (p_action = 'cancel' AND v_role <> 'applicant')) AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required';
  END IF;
  IF p_action = 'final_approve_discretionary' AND v_justification IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'justification_required';
  END IF;
  IF p_action = 'complete' THEN
    IF nullif(btrim(coalesce(v_payload ->> 'completed_on', '')), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'completed_on_required';
    END IF;
    IF (v_payload ->> 'completed_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'completed_on_invalid';
    END IF;
    BEGIN
      v_completed_on := (v_payload ->> 'completed_on')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'completed_on_invalid';
    END;
    IF v_completed_on > current_date + 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'completed_on_in_future';
    END IF;
    v_certificate := nullif(btrim(coalesce(v_payload ->> 'certificate_number', '')), '');
    v_evidence := nullif(btrim(coalesce(v_payload ->> 'evidence_path', '')), '');
    IF coalesce(length(v_certificate), 0) > 120 OR coalesce(length(v_evidence), 0) > 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'text_too_long';
    END IF;
    IF v_evidence IS NOT NULL AND v_evidence ~ '(^/)|(\.\.)|(//)|(\\)|(^[A-Za-z][A-Za-z0-9+.-]*:)|([[:cntrl:]])' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'evidence_path_invalid';
    END IF;
  END IF;

  SELECT coalesce(ps.final_approval_mode, 'both') INTO v_mode FROM public.program_settings AS ps WHERE ps.company_id = a.company_id;
  v_mode := coalesce(v_mode, 'both');

  PERFORM set_config('storm.fleet_tx', 'on', true);

  IF p_action = 'submit' THEN
    UPDATE public.development_applications SET
      status = v_target, submitted_at = now(), stage_entered_at = now(),
      hod_reviewer_id = NULL, hod_reviewed_at = NULL, hod_decision = NULL, hod_comments = NULL,
      purser_reviewer_id = NULL, purser_reviewed_at = NULL, purser_decision = NULL, purser_comments = NULL,
      captain_reviewer_id = NULL, captain_reviewed_at = NULL, captain_decision = NULL, captain_comments = NULL,
      is_discretionary = false, discretionary_justification = NULL, denial_reason = NULL
    WHERE id = a.id;
  ELSIF p_action IN ('hod_approve', 'hod_return') THEN
    UPDATE public.development_applications SET
      status = v_target, stage_entered_at = now(),
      hod_reviewer_id = v_uid, hod_reviewed_at = now(),
      hod_decision = CASE WHEN p_action = 'hod_approve' THEN 'approved' ELSE 'returned' END,
      hod_comments = v_comment
    WHERE id = a.id;
  ELSIF p_action IN ('final_approve', 'final_approve_discretionary') THEN
    IF (v_role = 'captain' AND coalesce(a.captain_decision IN ('approved', 'discretionary_approved'), false))
       OR (v_role = 'purser' AND coalesce(a.purser_decision = 'approved', false)) THEN
      PERFORM set_config('storm.fleet_tx', v_prev, true);
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_decided';
    END IF;
    IF v_mode = 'both' AND ((v_role = 'captain' AND a.purser_reviewer_id = v_uid AND a.purser_decision = 'approved')
                            OR (v_role = 'purser' AND a.captain_reviewer_id = v_uid AND a.captain_decision IN ('approved', 'discretionary_approved'))) THEN
      PERFORM set_config('storm.fleet_tx', v_prev, true);
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'same_approver', DETAIL = 'The second approval comes from someone else.';
    END IF;
    v_discretionary := coalesce(a.is_discretionary, false) OR p_action = 'final_approve_discretionary';
    v_other_ok := CASE v_role
      WHEN 'captain' THEN coalesce(a.purser_decision = 'approved', false)
      ELSE coalesce(a.captain_decision IN ('approved', 'discretionary_approved'), false)
    END;
    v_new_status := CASE
      WHEN v_mode = 'either' OR v_other_ok THEN CASE WHEN v_discretionary THEN 'discretionary_approved' ELSE 'approved' END
      ELSE a.status
    END;
    IF v_role = 'captain' THEN
      UPDATE public.development_applications SET
        status = v_new_status,
        stage_entered_at = CASE WHEN v_new_status IS DISTINCT FROM a.status THEN now() ELSE stage_entered_at END,
        captain_reviewer_id = v_uid, captain_reviewed_at = now(),
        captain_decision = CASE WHEN p_action = 'final_approve_discretionary' THEN 'discretionary_approved' ELSE 'approved' END,
        captain_comments = coalesce(v_comment, captain_comments),
        is_discretionary = v_discretionary,
        discretionary_justification = CASE WHEN p_action = 'final_approve_discretionary' THEN v_justification ELSE discretionary_justification END
      WHERE id = a.id;
    ELSE
      UPDATE public.development_applications SET
        status = v_new_status,
        stage_entered_at = CASE WHEN v_new_status IS DISTINCT FROM a.status THEN now() ELSE stage_entered_at END,
        purser_reviewer_id = v_uid, purser_reviewed_at = now(), purser_decision = 'approved',
        purser_comments = coalesce(v_comment, purser_comments)
      WHERE id = a.id;
    END IF;
  ELSIF p_action = 'return' THEN
    IF v_role = 'captain' THEN
      UPDATE public.development_applications SET status = v_target, stage_entered_at = now(),
        captain_reviewer_id = v_uid, captain_reviewed_at = now(), captain_decision = 'returned', captain_comments = v_comment
      WHERE id = a.id;
    ELSE
      UPDATE public.development_applications SET status = v_target, stage_entered_at = now(),
        purser_reviewer_id = v_uid, purser_reviewed_at = now(), purser_decision = 'returned', purser_comments = v_comment
      WHERE id = a.id;
    END IF;
  ELSIF p_action = 'reject' THEN
    UPDATE public.development_applications SET status = v_target, stage_entered_at = now(),
      denial_reason = v_reason, rejected_at = now(), rejected_by = v_uid
    WHERE id = a.id;
  ELSIF p_action = 'cancel' THEN
    UPDATE public.development_applications SET status = v_target, stage_entered_at = now(),
      cancelled_at = now(), cancelled_by = v_uid, cancel_reason = v_reason
    WHERE id = a.id;
  ELSIF p_action = 'enrol' THEN
    UPDATE public.development_applications SET status = v_target, stage_entered_at = now() WHERE id = a.id;
  ELSIF p_action = 'complete' THEN
    v_qualification := public.development_record_qualification(a, v_completed_on, v_certificate);
    PERFORM set_config('storm.fleet_tx', 'on', true);
    UPDATE public.development_applications SET status = v_target, stage_entered_at = now(),
      completed_at = (v_completed_on::timestamp AT TIME ZONE 'UTC'),
      completion_certificate_url = coalesce(v_evidence, completion_certificate_url),
      qualification_record_id = v_qualification
    WHERE id = a.id;
  ELSIF p_action = 'reimburse' THEN
    SELECT ps.clawback_months INTO v_clawback FROM public.program_settings AS ps WHERE ps.company_id = a.company_id;
    UPDATE public.development_applications SET status = v_target, stage_entered_at = now(),
      clawback_end_date = CASE
        WHEN clawback_end_date IS NULL AND category IN ('professional', 'extracurricular') AND coalesce(v_clawback, 12) > 0
          THEN (current_date + make_interval(months => coalesce(v_clawback, 12)))::date
        ELSE clawback_end_date
      END
    WHERE id = a.id;
  ELSIF p_action = 'close' THEN
    UPDATE public.development_applications SET status = v_target, stage_entered_at = now() WHERE id = a.id;
  ELSIF p_action = 'void' THEN
    UPDATE public.development_applications SET status = v_target, stage_entered_at = now(),
      voided_at = now(), voided_by = v_uid, void_reason = v_reason
    WHERE id = a.id;
  ELSIF p_action = 'edit_fields' THEN
    v_fields := v_payload -> 'fields';
    IF v_fields IS NULL OR jsonb_typeof(v_fields) <> 'object' OR v_fields = '{}'::jsonb THEN
      PERFORM set_config('storm.fleet_tx', v_prev, true);
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'fields_required';
    END IF;
    SELECT k INTO v_key FROM jsonb_object_keys(v_fields) AS k WHERE NOT (k = ANY (v_editable)) LIMIT 1;
    IF v_key IS NOT NULL THEN
      PERFORM set_config('storm.fleet_tx', v_prev, true);
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_not_editable', HINT = v_key;
    END IF;
    BEGIN
      n := jsonb_populate_record(a, v_fields);
    EXCEPTION WHEN others THEN
      PERFORM set_config('storm.fleet_tx', v_prev, true);
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid';
    END;
    IF nullif(btrim(coalesce(n.course_name, '')), '') IS NULL OR length(n.course_name) > 200
       OR coalesce(length(n.course_provider), 0) > 200 OR coalesce(length(n.course_location), 0) > 200
       OR coalesce(length(n.course_url), 0) > 500 OR coalesce(length(n.course_description), 0) > 4000
       OR coalesce(length(n.estimated_travel_route), 0) > 200
       OR n.category NOT IN ('fleet_organised', 'mandatory', 'professional', 'extracurricular')
       OR (n.course_start_date IS NOT NULL AND n.course_end_date IS NOT NULL AND n.course_end_date < n.course_start_date)
       OR coalesce(n.course_duration_days, 0) < 0 OR coalesce(n.course_duration_hours, 0) < 0
       OR coalesce(n.estimated_tuition_usd, 0) < 0 OR coalesce(n.estimated_travel_usd, 0) < 0
       OR coalesce(n.estimated_accommodation_usd, 0) < 0 OR coalesce(n.estimated_accommodation_nights, 0) < 0
       OR coalesce(n.estimated_accommodation_nightly_rate, 0) < 0 OR coalesce(n.estimated_food_per_diem_usd, 0) < 0
       OR coalesce(n.leave_days_accrued, 0) < 0 OR coalesce(n.neutral_days_accrued, 0) < 0
       OR coalesce(n.exchange_rate_to_usd, 1) <= 0
       OR coalesce(n.tuition_local_amount, 0) < 0 OR coalesce(n.travel_local_amount, 0) < 0 OR coalesce(n.accommodation_local_amount, 0) < 0
       OR coalesce(n.application_currency, 'USD') !~ '^[A-Z]{3}$' THEN
      PERFORM set_config('storm.fleet_tx', v_prev, true);
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid';
    END IF;
    SELECT jsonb_object_agg(k, jsonb_build_object('from', to_jsonb(a) -> k, 'to', to_jsonb(n) -> k) ORDER BY k) INTO v_diff
    FROM unnest(v_editable) AS k
    WHERE (to_jsonb(n) -> k) IS DISTINCT FROM (to_jsonb(a) -> k);
    IF v_diff IS NULL THEN
      PERFORM set_config('storm.fleet_tx', v_prev, true);
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'nothing_changed';
    END IF;
    UPDATE public.development_applications SET
      course_name = btrim(n.course_name), course_provider = n.course_provider, course_description = n.course_description,
      course_url = n.course_url, course_location = n.course_location, course_start_date = n.course_start_date,
      course_end_date = n.course_end_date, course_duration_days = n.course_duration_days, course_duration_hours = n.course_duration_hours,
      category = n.category, estimated_tuition_usd = n.estimated_tuition_usd, estimated_travel_usd = n.estimated_travel_usd,
      estimated_travel_route = n.estimated_travel_route, estimated_accommodation_usd = n.estimated_accommodation_usd,
      estimated_accommodation_nights = n.estimated_accommodation_nights,
      estimated_accommodation_nightly_rate = n.estimated_accommodation_nightly_rate,
      estimated_food_per_diem_usd = n.estimated_food_per_diem_usd, leave_days_accrued = n.leave_days_accrued,
      neutral_days_accrued = n.neutral_days_accrued, application_currency = n.application_currency,
      exchange_rate_to_usd = n.exchange_rate_to_usd, tuition_local_amount = n.tuition_local_amount,
      travel_local_amount = n.travel_local_amount, accommodation_local_amount = n.accommodation_local_amount
    WHERE id = a.id;
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    PERFORM set_config('storm.fleet_tx', v_prev, true);
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'application_not_updated';
  END IF;

  SELECT * INTO n FROM public.development_applications AS x WHERE x.id = a.id;
  v_event := public.development_application_log(
    n, p_action, a.status, n.status, v_role,
    CASE WHEN p_action IN ('reject', 'cancel', 'void') THEN v_reason
         WHEN p_action = 'final_approve_discretionary' THEN coalesce(v_comment, v_justification)
         ELSE v_comment END,
    v_diff,
    jsonb_strip_nulls(jsonb_build_object(
      'mode', CASE WHEN p_action IN ('final_approve', 'final_approve_discretionary') THEN v_mode END,
      'justification', CASE WHEN p_action = 'final_approve_discretionary' THEN v_justification END,
      'completed_on', v_completed_on, 'certificate_number', v_certificate, 'evidence_path', v_evidence,
      'qualification_record_id', v_qualification,
      'qualification_source', CASE WHEN p_action = 'complete' THEN
        CASE WHEN EXISTS (SELECT 1 FROM public.development_courses AS c WHERE c.id = a.course_id AND c.qualification_document_type_id IS NOT NULL)
                  AND to_regprocedure('public.crew_document_record_from_source(uuid,uuid,date,date,text,uuid)') IS NOT NULL
             THEN 'crew_document' ELSE 'legacy_certificate' END END)));
  PERFORM set_config('storm.fleet_tx', v_prev, true);

  v_notified := public.development_application_notify(n, p_action, v_event, v_mode);

  RETURN jsonb_build_object(
    'id', n.id, 'status', n.status, 'from_status', a.status, 'action', p_action, 'actor_role', v_role,
    'event_id', v_event, 'updated_at', n.updated_at, 'stage_entered_at', n.stage_entered_at,
    'qualification_record_id', n.qualification_record_id, 'notified', v_notified);
END;
$$;

-- ---------------------------------------------------------------- catalogue and settings definers (training admins; TR7, TR8, TR10)

-- The caller's company once they are a fleet training admin there
-- (fleet_ops_can_for training admin: fleet reach plus the adaptor's
-- fleet.operations.fleet_training.admin rule); 42501 not_permitted
-- otherwise. Internal.
CREATE OR REPLACE FUNCTION public.development_admin_gate()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL OR NOT coalesce(public.fleet_ops_can_for(v_uid, v_company, NULL, 'training', 'admin'), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  RETURN v_company;
END;
$$;

-- One development_audit_log row for a catalogue or settings change (the
-- live audit table). Internal.
CREATE OR REPLACE FUNCTION public.development_audit(_company_id uuid, _action text, _details jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.development_audit_log (company_id, actor_id, action, details)
  VALUES (_company_id, auth.uid(), _action, coalesce(_details, '{}'::jsonb));
END;
$$;

-- Creates (no id) or updates (id, optional expected_updated_at) a catalogue
-- course with its rules (lib/courseSchema.ts mirrors the checks). Keys:
-- id, expected_updated_at, catalogue_number, name, department,
-- sub_section, category, format, duration_description, renewal_period,
-- reimbursement_summary, notes, contact_person, over_4k_rule,
-- requires_fleet_doctor_agreement, tags, valid_for_months,
-- renew_from_months, applies_to_departments, applies_to_positions,
-- is_mandatory, renewal_note, pathway, qualification_label,
-- qualification_document_type_id. Refusals 22023 field_unknown /
-- field_required / field_invalid (HINT names the field), stale_course,
-- qualification_type_not_found, qualification_types_not_set_up; P0002
-- course_not_found. Training admins. Returns the course.
CREATE OR REPLACE FUNCTION public.development_course_save(p_course jsonb)
RETURNS public.development_courses
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.development_admin_gate();
  v_uid uuid := auth.uid();
  c jsonb := coalesce(p_course, '{}'::jsonb);
  v_old public.development_courses;
  v_row public.development_courses;
  v_key text;
  v_id uuid;
  v_name text;
  v_department text;
  v_category text;
  v_format text;
  v_valid integer;
  v_renew integer;
  v_type uuid;
  v_text_limits jsonb := '{"sub_section": 120, "duration_description": 200, "renewal_period": 120, "reimbursement_summary": 2000,
                           "notes": 4000, "contact_person": 120, "renewal_note": 2000, "pathway": 120, "qualification_label": 200}'::jsonb;
  v_lists text[] := ARRAY['tags', 'applies_to_departments', 'applies_to_positions'];
  v_flags text[] := ARRAY['over_4k_rule', 'requires_fleet_doctor_agreement', 'is_mandatory'];
  v_known text[] := ARRAY['id', 'expected_updated_at', 'catalogue_number', 'name', 'department', 'sub_section', 'category', 'format',
    'duration_description', 'renewal_period', 'reimbursement_summary', 'notes', 'contact_person', 'over_4k_rule',
    'requires_fleet_doctor_agreement', 'tags', 'valid_for_months', 'renew_from_months', 'applies_to_departments',
    'applies_to_positions', 'is_mandatory', 'renewal_note', 'pathway', 'qualification_label', 'qualification_document_type_id'];
  v_lim record;
BEGIN
  IF jsonb_typeof(c) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'course';
  END IF;
  SELECT k INTO v_key FROM jsonb_object_keys(c) AS k WHERE NOT (k = ANY (v_known)) LIMIT 1;
  IF v_key IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_unknown', HINT = v_key;
  END IF;

  IF nullif(c ->> 'id', '') IS NOT NULL THEN
    BEGIN
      v_id := (c ->> 'id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'course_not_found';
    END;
    SELECT * INTO v_old FROM public.development_courses AS x WHERE x.id = v_id AND x.company_id = v_company FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'course_not_found';
    END IF;
    IF nullif(c ->> 'expected_updated_at', '') IS NOT NULL AND v_old.updated_at IS DISTINCT FROM (c ->> 'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stale_course', DETAIL = 'Someone changed this course since you opened it.';
    END IF;
  END IF;

  v_name := btrim(coalesce(c ->> 'name', v_old.name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required', HINT = 'name';
  ELSIF length(v_name) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'name';
  END IF;
  v_department := btrim(coalesce(c ->> 'department', v_old.department, ''));
  IF v_department = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required', HINT = 'department';
  ELSIF length(v_department) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'department';
  END IF;
  v_category := coalesce(c ->> 'category', v_old.category);
  IF v_category IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required', HINT = 'category';
  ELSIF v_category NOT IN ('fleet_organised', 'mandatory', 'professional', 'extracurricular') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'category';
  END IF;
  v_format := CASE WHEN c ? 'format' THEN nullif(c ->> 'format', '') ELSE v_old.format END;
  IF v_format IS NOT NULL AND v_format NOT IN ('in_person', 'online', 'onboard', 'blended', 'online_in_person') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'format';
  END IF;
  FOR v_lim IN SELECT key, value::integer AS max FROM jsonb_each_text(v_text_limits) LOOP
    IF c ? v_lim.key AND jsonb_typeof(c -> v_lim.key) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = v_lim.key;
    END IF;
    IF length(btrim(coalesce(c ->> v_lim.key, ''))) > v_lim.max THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = v_lim.key;
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY v_flags LOOP
    IF c ? v_key AND jsonb_typeof(c -> v_key) <> 'boolean' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = v_key;
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY v_lists LOOP
    IF c ? v_key THEN
      IF jsonb_typeof(c -> v_key) <> 'array' OR jsonb_array_length(c -> v_key) > 50
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(c -> v_key) AS e
                    WHERE jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = '' OR length(e #>> '{}') > 80) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = v_key;
      END IF;
    END IF;
  END LOOP;
  IF c ? 'catalogue_number' AND jsonb_typeof(c -> 'catalogue_number') <> 'null'
     AND (jsonb_typeof(c -> 'catalogue_number') <> 'number' OR (c ->> 'catalogue_number') !~ '^[0-9]{1,6}$' OR (c ->> 'catalogue_number')::integer < 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'catalogue_number';
  END IF;
  IF c ? 'valid_for_months' AND jsonb_typeof(c -> 'valid_for_months') <> 'null'
     AND (jsonb_typeof(c -> 'valid_for_months') <> 'number' OR (c ->> 'valid_for_months') !~ '^[0-9]{1,3}$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'valid_for_months';
  END IF;
  IF c ? 'renew_from_months' AND jsonb_typeof(c -> 'renew_from_months') <> 'null'
     AND (jsonb_typeof(c -> 'renew_from_months') <> 'number' OR (c ->> 'renew_from_months') !~ '^[0-9]{1,3}$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'renew_from_months';
  END IF;
  v_valid := CASE WHEN c ? 'valid_for_months' THEN (c ->> 'valid_for_months')::integer ELSE v_old.valid_for_months END;
  v_renew := CASE WHEN c ? 'renew_from_months' THEN (c ->> 'renew_from_months')::integer ELSE v_old.renew_from_months END;
  IF v_valid IS NOT NULL AND v_valid NOT BETWEEN 1 AND 600 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'valid_for_months';
  END IF;
  IF v_renew IS NOT NULL AND (v_valid IS NULL OR v_renew < 0 OR v_renew >= v_valid) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'renew_from_months';
  END IF;

  IF c ? 'qualification_document_type_id' THEN
    IF nullif(c ->> 'qualification_document_type_id', '') IS NULL THEN
      v_type := NULL;
    ELSE
      BEGIN
        v_type := (c ->> 'qualification_document_type_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'qualification_document_type_id';
      END;
    END IF;
  ELSE
    v_type := v_old.qualification_document_type_id;
  END IF;
  IF v_type IS NOT NULL AND v_type IS DISTINCT FROM v_old.qualification_document_type_id THEN
    IF to_regclass('public.crew_document_types') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'qualification_types_not_set_up', DETAIL = 'Crew document types are not set up yet; name the qualification as text.';
    END IF;
    EXECUTE 'SELECT t.id FROM public.crew_document_types AS t WHERE t.id = $1 AND (t.company_id IS NULL OR t.company_id = $2)'
      INTO v_type USING v_type, v_company;
    IF v_type IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'qualification_type_not_found';
    END IF;
  END IF;

  IF v_old.id IS NULL THEN
    INSERT INTO public.development_courses (
      company_id, catalogue_number, name, department, sub_section, category, format, duration_description, renewal_period,
      reimbursement_summary, notes, contact_person, over_4k_rule, requires_fleet_doctor_agreement, status, created_by, tags,
      valid_for_months, renew_from_months, applies_to_departments, applies_to_positions, is_mandatory, renewal_note, pathway,
      origin, qualification_label, qualification_document_type_id)
    VALUES (
      v_company, (c ->> 'catalogue_number')::integer, v_name, v_department, nullif(btrim(coalesce(c ->> 'sub_section', '')), ''), v_category, v_format,
      nullif(btrim(coalesce(c ->> 'duration_description', '')), ''), nullif(btrim(coalesce(c ->> 'renewal_period', '')), ''),
      nullif(btrim(coalesce(c ->> 'reimbursement_summary', '')), ''), nullif(btrim(coalesce(c ->> 'notes', '')), ''),
      nullif(btrim(coalesce(c ->> 'contact_person', '')), ''), coalesce((c ->> 'over_4k_rule')::boolean, false),
      coalesce((c ->> 'requires_fleet_doctor_agreement')::boolean, false), 'active', v_uid,
      coalesce(ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(c -> 'tags') AS e), '{}'::text[]),
      v_valid, v_renew,
      coalesce(ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(c -> 'applies_to_departments') AS e), '{}'::text[]),
      coalesce(ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(c -> 'applies_to_positions') AS e), '{}'::text[]),
      coalesce((c ->> 'is_mandatory')::boolean, false), nullif(btrim(coalesce(c ->> 'renewal_note', '')), ''),
      nullif(btrim(coalesce(c ->> 'pathway', '')), ''), 'catalogue', nullif(btrim(coalesce(c ->> 'qualification_label', '')), ''), v_type)
    RETURNING * INTO v_row;
    PERFORM public.development_audit(v_company, 'course_created', jsonb_build_object('course_id', v_row.id, 'name', v_row.name));
  ELSE
    UPDATE public.development_courses AS x SET
      catalogue_number = CASE WHEN c ? 'catalogue_number' THEN (c ->> 'catalogue_number')::integer ELSE x.catalogue_number END,
      name = v_name, department = v_department, category = v_category, format = v_format,
      sub_section = CASE WHEN c ? 'sub_section' THEN nullif(btrim(coalesce(c ->> 'sub_section', '')), '') ELSE x.sub_section END,
      duration_description = CASE WHEN c ? 'duration_description' THEN nullif(btrim(coalesce(c ->> 'duration_description', '')), '') ELSE x.duration_description END,
      renewal_period = CASE WHEN c ? 'renewal_period' THEN nullif(btrim(coalesce(c ->> 'renewal_period', '')), '') ELSE x.renewal_period END,
      reimbursement_summary = CASE WHEN c ? 'reimbursement_summary' THEN nullif(btrim(coalesce(c ->> 'reimbursement_summary', '')), '') ELSE x.reimbursement_summary END,
      notes = CASE WHEN c ? 'notes' THEN nullif(btrim(coalesce(c ->> 'notes', '')), '') ELSE x.notes END,
      contact_person = CASE WHEN c ? 'contact_person' THEN nullif(btrim(coalesce(c ->> 'contact_person', '')), '') ELSE x.contact_person END,
      over_4k_rule = CASE WHEN c ? 'over_4k_rule' THEN (c ->> 'over_4k_rule')::boolean ELSE x.over_4k_rule END,
      requires_fleet_doctor_agreement = CASE WHEN c ? 'requires_fleet_doctor_agreement' THEN (c ->> 'requires_fleet_doctor_agreement')::boolean ELSE x.requires_fleet_doctor_agreement END,
      tags = CASE WHEN c ? 'tags' THEN ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(c -> 'tags') AS e) ELSE x.tags END,
      valid_for_months = v_valid, renew_from_months = v_renew,
      applies_to_departments = CASE WHEN c ? 'applies_to_departments' THEN ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(c -> 'applies_to_departments') AS e) ELSE x.applies_to_departments END,
      applies_to_positions = CASE WHEN c ? 'applies_to_positions' THEN ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(c -> 'applies_to_positions') AS e) ELSE x.applies_to_positions END,
      is_mandatory = CASE WHEN c ? 'is_mandatory' THEN (c ->> 'is_mandatory')::boolean ELSE x.is_mandatory END,
      renewal_note = CASE WHEN c ? 'renewal_note' THEN nullif(btrim(coalesce(c ->> 'renewal_note', '')), '') ELSE x.renewal_note END,
      pathway = CASE WHEN c ? 'pathway' THEN nullif(btrim(coalesce(c ->> 'pathway', '')), '') ELSE x.pathway END,
      qualification_label = CASE WHEN c ? 'qualification_label' THEN nullif(btrim(coalesce(c ->> 'qualification_label', '')), '') ELSE x.qualification_label END,
      qualification_document_type_id = v_type
    WHERE x.id = v_old.id
    RETURNING * INTO v_row;
    PERFORM public.development_audit(v_company, 'course_updated', jsonb_build_object('course_id', v_row.id, 'name', v_row.name));
  END IF;
  RETURN v_row;
END;
$$;

-- Archives (p_archived true) or restores a catalogue course; archived
-- courses leave the crew catalogue, applications keep them. Training
-- admins. Returns the course.
CREATE OR REPLACE FUNCTION public.development_course_archive(p_course_id uuid, p_archived boolean DEFAULT true)
RETURNS public.development_courses
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.development_admin_gate();
  v_row public.development_courses;
BEGIN
  UPDATE public.development_courses AS x
  SET status = CASE WHEN coalesce(p_archived, true) THEN 'archived' ELSE 'active' END
  WHERE x.id = p_course_id AND x.company_id = v_company
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'course_not_found';
  END IF;
  PERFORM public.development_audit(v_company, CASE WHEN coalesce(p_archived, true) THEN 'course_archived' ELSE 'course_restored' END,
                                   jsonb_build_object('course_id', v_row.id, 'name', v_row.name));
  RETURN v_row;
END;
$$;

-- Saves the company's programme settings (lib/settingsSchema.ts mirrors
-- the checks): any of accommodation_cap_per_night_usd, food_per_diem_usd,
-- professional_split_threshold_usd (0..1,000,000), clawback_months
-- (0..120), eligibility_service_days, probation_default_days,
-- anniversary_window_days (0..3650), online_neutral_threshold_hours
-- (0..1000), business_class_flights_allowed, final_approval_mode (both |
-- either), mileage_rate_per_mile, mileage_rate_per_km (null or 0..1000),
-- fx_overrides ({ISO code: rate > 0}, up to 50), category_labels ({category
-- key: 1..60 characters}), expected_updated_at. Refusals 22023
-- field_unknown / field_invalid (HINT), stale_settings. Training admins.
-- Returns the settings row (created with the column defaults when the
-- company has none).
CREATE OR REPLACE FUNCTION public.development_settings_save(p_settings jsonb)
RETURNS public.program_settings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.development_admin_gate();
  s jsonb := coalesce(p_settings, '{}'::jsonb);
  v_old public.program_settings;
  v_row public.program_settings;
  v_key text;
  v_num record;
  v_known text[] := ARRAY['expected_updated_at', 'accommodation_cap_per_night_usd', 'food_per_diem_usd', 'professional_split_threshold_usd',
    'clawback_months', 'eligibility_service_days', 'probation_default_days', 'online_neutral_threshold_hours', 'anniversary_window_days',
    'business_class_flights_allowed', 'final_approval_mode', 'mileage_rate_per_mile', 'mileage_rate_per_km', 'fx_overrides', 'category_labels'];
  v_ranges jsonb := '{"accommodation_cap_per_night_usd": [0, 1000000, false], "food_per_diem_usd": [0, 1000000, false],
                      "professional_split_threshold_usd": [0, 1000000, false], "clawback_months": [0, 120, true],
                      "eligibility_service_days": [0, 3650, true], "probation_default_days": [0, 3650, true],
                      "anniversary_window_days": [0, 3650, true], "online_neutral_threshold_hours": [0, 1000, false],
                      "mileage_rate_per_mile": [0, 1000, false], "mileage_rate_per_km": [0, 1000, false]}'::jsonb;
BEGIN
  IF jsonb_typeof(s) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'settings';
  END IF;
  SELECT k INTO v_key FROM jsonb_object_keys(s) AS k WHERE NOT (k = ANY (v_known)) LIMIT 1;
  IF v_key IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_unknown', HINT = v_key;
  END IF;
  FOR v_num IN SELECT key, value FROM jsonb_each(v_ranges) LOOP
    IF s ? v_num.key THEN
      IF jsonb_typeof(s -> v_num.key) = 'null' AND v_num.key IN ('mileage_rate_per_mile', 'mileage_rate_per_km') THEN
        CONTINUE;
      END IF;
      IF jsonb_typeof(s -> v_num.key) <> 'number'
         OR (s ->> v_num.key)::numeric < (v_num.value ->> 0)::numeric OR (s ->> v_num.key)::numeric > (v_num.value ->> 1)::numeric
         OR ((v_num.value ->> 2)::boolean AND (s ->> v_num.key)::numeric <> trunc((s ->> v_num.key)::numeric)) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = v_num.key;
      END IF;
    END IF;
  END LOOP;
  IF s ? 'business_class_flights_allowed' AND jsonb_typeof(s -> 'business_class_flights_allowed') <> 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'business_class_flights_allowed';
  END IF;
  IF s ? 'final_approval_mode' AND coalesce(s ->> 'final_approval_mode', '') NOT IN ('both', 'either') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'final_approval_mode';
  END IF;
  IF s ? 'fx_overrides' AND (jsonb_typeof(s -> 'fx_overrides') <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(s -> 'fx_overrides')) > 50
       OR EXISTS (SELECT 1 FROM jsonb_each(s -> 'fx_overrides') AS e
                  WHERE e.key !~ '^[A-Z]{3}$' OR jsonb_typeof(e.value) <> 'number'
                     OR (e.value #>> '{}')::numeric <= 0 OR (e.value #>> '{}')::numeric > 1000000)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'fx_overrides';
  END IF;
  IF s ? 'category_labels' AND (jsonb_typeof(s -> 'category_labels') <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_each(s -> 'category_labels') AS e
                  WHERE e.key NOT IN ('fleet_organised', 'mandatory', 'professional', 'extracurricular')
                     OR jsonb_typeof(e.value) <> 'string' OR btrim(e.value #>> '{}') = '' OR length(btrim(e.value #>> '{}')) > 60)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = 'category_labels';
  END IF;

  INSERT INTO public.program_settings (company_id) VALUES (v_company) ON CONFLICT (company_id) DO NOTHING;
  SELECT * INTO v_old FROM public.program_settings AS x WHERE x.company_id = v_company FOR UPDATE;
  IF nullif(s ->> 'expected_updated_at', '') IS NOT NULL AND v_old.updated_at IS DISTINCT FROM (s ->> 'expected_updated_at')::timestamptz THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stale_settings', DETAIL = 'Someone changed these settings since you opened them.';
  END IF;

  UPDATE public.program_settings AS x SET
    accommodation_cap_per_night_usd = coalesce((s ->> 'accommodation_cap_per_night_usd')::numeric, x.accommodation_cap_per_night_usd),
    food_per_diem_usd = coalesce((s ->> 'food_per_diem_usd')::numeric, x.food_per_diem_usd),
    professional_split_threshold_usd = coalesce((s ->> 'professional_split_threshold_usd')::numeric, x.professional_split_threshold_usd),
    clawback_months = coalesce((s ->> 'clawback_months')::integer, x.clawback_months),
    eligibility_service_days = coalesce((s ->> 'eligibility_service_days')::integer, x.eligibility_service_days),
    probation_default_days = coalesce((s ->> 'probation_default_days')::integer, x.probation_default_days),
    online_neutral_threshold_hours = coalesce((s ->> 'online_neutral_threshold_hours')::numeric, x.online_neutral_threshold_hours),
    anniversary_window_days = coalesce((s ->> 'anniversary_window_days')::integer, x.anniversary_window_days),
    business_class_flights_allowed = coalesce((s ->> 'business_class_flights_allowed')::boolean, x.business_class_flights_allowed),
    final_approval_mode = coalesce(s ->> 'final_approval_mode', x.final_approval_mode),
    mileage_rate_per_mile = CASE WHEN s ? 'mileage_rate_per_mile' THEN (s ->> 'mileage_rate_per_mile')::numeric ELSE x.mileage_rate_per_mile END,
    mileage_rate_per_km = CASE WHEN s ? 'mileage_rate_per_km' THEN (s ->> 'mileage_rate_per_km')::numeric ELSE x.mileage_rate_per_km END,
    fx_overrides = coalesce(s -> 'fx_overrides', x.fx_overrides),
    category_labels = CASE WHEN s ? 'category_labels'
      THEN (SELECT coalesce(jsonb_object_agg(e.key, to_jsonb(btrim(e.value #>> '{}'))), '{}'::jsonb) FROM jsonb_each(s -> 'category_labels') AS e)
      ELSE x.category_labels END,
    updated_by = auth.uid()
  WHERE x.company_id = v_company
  RETURNING * INTO v_row;
  PERFORM public.development_audit(v_company, 'settings_saved', jsonb_build_object('keys', to_jsonb(ARRAY(SELECT k FROM jsonb_object_keys(s) AS k WHERE k <> 'expected_updated_at' ORDER BY k))));
  RETURN v_row;
END;
$$;

-- Promotes a crew member's custom application into the catalogue (TR8):
-- a new active course (origin 'proposed', proposed_by the applicant,
-- proposed_from_application_id) from the application's course, the
-- applicant's department, and the application linked to it; once per
-- application (a second call returns the same course). Refused for an
-- application that is not a custom course (22023 not_a_proposal) or was
-- voided (application_voided). Training admins. Returns the course.
CREATE OR REPLACE FUNCTION public.development_course_promote(p_application_id uuid)
RETURNS public.development_courses
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.development_admin_gate();
  v_uid uuid := auth.uid();
  a public.development_applications;
  v_row public.development_courses;
  v_dept text;
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
BEGIN
  SELECT * INTO a FROM public.development_applications AS x WHERE x.id = p_application_id AND x.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'application_not_found';
  END IF;
  SELECT * INTO v_row FROM public.development_courses AS c WHERE c.proposed_from_application_id = a.id;
  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;
  IF a.status = 'voided' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'application_voided';
  END IF;
  IF NOT coalesce(a.is_custom_course, false) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_a_proposal';
  END IF;
  v_dept := public.development_applicant_department(a.crew_member_id, a.vessel_id);
  INSERT INTO public.development_courses (company_id, name, department, category, notes, status, created_by, origin, proposed_by,
                                          proposed_from_application_id, qualification_label)
  VALUES (v_company, left(btrim(a.course_name), 200), left(coalesce(v_dept, 'All'), 80), a.category, left(a.course_description, 4000), 'active', v_uid,
          'proposed', a.crew_member_id, a.id, NULL)
  RETURNING * INTO v_row;
  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.development_applications SET course_id = v_row.id WHERE id = a.id;
  PERFORM public.development_application_log(a, 'course_promoted', a.status, a.status, 'training_admin', NULL, NULL,
                                             jsonb_build_object('course_id', v_row.id));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  PERFORM public.development_audit(v_company, 'course_promoted', jsonb_build_object('course_id', v_row.id, 'application_id', a.id));
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------- grants

REVOKE ALL ON FUNCTION public.development_transition_target(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_action_actors(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_vessel_role_for(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_applicant_department(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_reviewer_for(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_application_company(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_actor_roles_for(uuid, public.development_applications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_application_number_for(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_dev_application_number() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_applications_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_application_log(public.development_applications, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_applications_audit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_application_events_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_record_qualification(public.development_applications, date, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_application_notify(public.development_applications, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_transition(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_admin_gate() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_audit(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_course_save(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_course_archive(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_settings_save(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.development_course_promote(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.development_transition_target(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_action_actors(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_vessel_role_for(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_applicant_department(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_reviewer_for(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.development_application_company(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.development_actor_roles_for(uuid, public.development_applications) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_application_number_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_application_log(public.development_applications, text, text, text, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_record_qualification(public.development_applications, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_application_notify(public.development_applications, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_admin_gate() TO service_role;
GRANT EXECUTE ON FUNCTION public.development_audit(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.development_transition(uuid, text, jsonb, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.development_course_save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.development_course_archive(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.development_settings_save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.development_course_promote(uuid) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.development_application_events IS 'Append-only history of training applications (D-X5-23, gap/02 TR5, W3): actor (login and profile), the role acted in, action, from / to status, comment, the field diff of an approver''s correction, payload. Read: active members of the company who can read the application. Inserted only by the development definers and the creation trigger (storm.fleet_tx), never updated or deleted (trg_development_application_events_guard).';
COMMENT ON FUNCTION public.development_transition_target(text, text) IS 'The training application machine (gap/02 W3; lib/applicationMachine.ts transitionTarget): the status a (status, action) pair leads to, the same status for edit_fields, or ! and the refusal (invalid_transition, application_final, application_voided). Internal.';
COMMENT ON FUNCTION public.development_action_actors(text, text) IS 'Who may take the action in that status (lib/applicationMachine.ts actionActors): applicant, hod, captain, purser, training_editor, training_admin, in the order the definer picks; empty when refused. Internal.';
COMMENT ON FUNCTION public.development_vessel_role_for(uuid, uuid, text) IS 'Whether the user holds the vessel''s captain (the Master, record_is_master, or a captain role) or purser office (a purser role: user_roles in the company, on the vessel or company-wide, or RBAC on the vessel); active, of the company, reaching the vessel, no external viewer. Internal.';
COMMENT ON FUNCTION public.development_applicant_department(uuid, uuid) IS 'The applicant''s department on the vessel (current assignment there, else the profile); the HOD scope reads it. Internal.';
COMMENT ON FUNCTION public.development_reviewer_for(uuid, uuid, uuid) IS 'RLS helper (development_applications SELECT): whether the caller reviews applications of that applicant on that vessel (its Captain or Purser, or an HOD covering the applicant''s department). Caller-only; false for the applicant, an inactive user and NULL ids.';
COMMENT ON FUNCTION public.development_application_company(uuid) IS 'RLS helper (fleet_training_participants): the application''s company when it is the caller''s own, NULL otherwise.';
COMMENT ON FUNCTION public.development_actor_roles_for(uuid, public.development_applications) IS 'The roles the user holds on the application: applicant only for the applicant; otherwise hod, captain, purser, training_editor, training_admin as held. Internal.';
COMMENT ON FUNCTION public.development_application_number_for(uuid) IS 'The company''s next application number (CDA-YYYYMMDD-NNNN) from the counter dev_app:<company> (next_reference_value), seeded once from the highest existing number. Internal (generate_dev_application_number).';
COMMENT ON FUNCTION public.generate_dev_application_number() IS 'Trigger trg_dev_application_number (BEFORE INSERT, every row, no WHEN clause; D-379): numbers a new application from the company counter (development_application_number_for); no MAX()+1. A number supplied by a browser caller (authenticated / anon) is replaced by the counter value; STORM''s definers (storm.fleet_tx) and non-browser roles (service, owner import) keep theirs.';
COMMENT ON FUNCTION public.development_applications_guard() IS 'Trigger (every role): outside storm.fleet_tx an application starts as a draft with no decisions on a vessel of its company, its status and review / outcome / completion columns never change, its content changes only while draft or returned, only a draft is deleted; id, company, applicant, number and creation time never change (42501 development_applications_guarded).';
COMMENT ON FUNCTION public.development_application_log(public.development_applications, text, text, text, text, text, jsonb, jsonb) IS 'Writes one development_application_events row with auth.uid() as actor. Internal.';
COMMENT ON FUNCTION public.development_applications_audit() IS 'Trigger: the created event of every new application.';
COMMENT ON FUNCTION public.development_application_events_guard() IS 'Trigger: application history is inserted only by the definers (storm.fleet_tx) and never updated or deleted (a cascade excepted).';
COMMENT ON FUNCTION public.development_record_qualification(public.development_applications, date, text) IS 'TR9 (platform-prep plan contract 3): writes the qualification of a completed application once: X1''s crew_document_record_from_source when the course names a crew document type and the function exists, else a legacy crew_certificates row; expiry = completed_on + valid_for_months. Internal.';
COMMENT ON FUNCTION public.development_application_notify(public.development_applications, text, uuid, text) IS 'After a transition: training_application_action_needed to the next actor (HODs, the Captains / Pursers still to decide, training admins and the company''s active HR viewers once completed, D-383) and training_application_updated to the applicant when someone else acted; guarded emits (D-128), in-app only (D-249). Internal.';
COMMENT ON FUNCTION public.development_transition(uuid, text, jsonb, timestamptz) IS 'Moves a training application along the machine (gap/02 W3, TR4-TR6, TR9): submit, hod_approve, hod_return, final_approve (both | either), final_approve_discretionary, return, reject, cancel, enrol, complete (writes the qualification), reimburse, close, void, edit_fields; actor rules per action, the optional expected updated_at, one event row, the stage stamp and the notifications. Returns the new state as jsonb.';
COMMENT ON FUNCTION public.development_admin_gate() IS 'The caller''s company once they are a fleet training admin there (fleet_ops_can_for training admin); 42501 not_permitted otherwise. Internal.';
COMMENT ON FUNCTION public.development_audit(uuid, text, jsonb) IS 'Writes one development_audit_log row for a catalogue or settings change. Internal.';
COMMENT ON FUNCTION public.development_course_save(jsonb) IS 'Creates or updates a catalogue course with its rules (gap/02 TR7, TR9; lib/courseSchema.ts): valid for and renew from months, departments and positions, mandatory, pathway, renewal note, the qualification as a crew document type (checked against crew_document_types) or a label. Training admins.';
COMMENT ON FUNCTION public.development_course_archive(uuid, boolean) IS 'Archives or restores a catalogue course. Training admins.';
COMMENT ON FUNCTION public.development_settings_save(jsonb) IS 'Saves the company''s training programme settings (gap/02 TR10; lib/settingsSchema.ts): caps and per diem, split threshold, clawback, eligibility, final approval mode, mileage rates, FX overrides, category labels. Training admins.';
COMMENT ON FUNCTION public.development_course_promote(uuid) IS 'Adds a crew member''s custom course to the catalogue (gap/02 TR8): origin proposed, linked both ways, once per application. Training admins.';
