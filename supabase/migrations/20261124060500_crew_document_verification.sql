-- =================================================================
-- CREW X1-05: crew document verification, alerts off, renewal history
-- and the verifier and expiry notifications
-- (Phase 3 wave 1, stream X1; gap/04 C27, C28, C29, C30, W3, W4;
-- DECISIONS D-01, D-31, D-120, D-128, D-170, D-229, D-232, D-233, D-238,
-- D-239, D-249, D-X1-3; X1 spec §6 060500; platform plan PR-X1-E,
-- PR-X1-K)
-- Tables: crew_document_versions (C30: the replaced values of a renewed
--   document, read with the document's own visibility),
--   crew_document_expiry_notices (the expiry sweep's record of who was
--   told about which document at which stage; service only)
-- RPCs: crew_document_review_rights(), crew_document_verify(),
--   crew_document_mute(), crew_document_unmute(), crew_document_renew()
-- Service role: crew_document_expiry_sweep(date) (hr-daily-sweeper,
--   PR-X1-K), crew_document_verifiers(uuid), crew_document_verifier_check(),
--   crew_document_verifier_on(), crew_document_mute_check(),
--   crew_member_role_on(), crew_document_version_capture(),
--   crew_document_expiry_due(), crew_document_expiry_stage() and
--   crew_document_expiry_phrase() (pure)
-- Triggers: crew_certificates_review_notify (AFTER INSERT / UPDATE on
--   crew_certificates: crew_document_review_needed to the verifiers),
--   crew_document_versions_scope_guard, crew_document_expiry_notices_scope_guard
-- In place (rule §0.2, unapplied): 20261124060400's
--   crew_document_record_from_source now writes a version row through
--   crew_document_version_capture() when it renews a document (TR9)
-- TS mirror: src/modules/crew/types/db.pending.ts (tables, RPCs);
--   src/modules/crew/lib/verification.ts (the verifier rule, the note rule,
--   the material-change rule, the expiry notice stages)
-- =================================================================
--
-- Why. 060400 gave every crew document a verification status, alerts-off
-- columns and a guard that returns a reviewed document to unverified on a
-- material change, but nobody could decide a verification, turn alerts
-- off, keep the replaced values of a renewal, or be told that a document
-- waits for review or is about to expire. This file adds those decisions
-- and notices (gap/04 W3, W4).
--
-- Who may verify (crew_document_verifier_check; TS verifierDecision): an
-- active member of the person's company, never an external viewer, never
-- for their own documents (42501 own_document), who holds
-- vessel.crew.crew_certificates.approve on a vessel of the person's
-- structural set (current or planned assignment, or the pending
-- placement). On that vessel the Master (record_is_master, or a position of
-- the command tier), the Purser's office (department purser_office) and
-- anyone with fleet reach decide for every department; a head of
-- department (position tier hod) decides only for their own department
-- (42501 out_of_department); a holder outside the HoD tier is not bound to
-- a department. Anyone else: 42501 not_permitted.
--
-- Decisions (crew_document_verify): verified, conditionally_approved
-- (counts towards requirements, shown amber), rejected (never counts). A
-- note is required for the last two (22023 note_required): what the
-- condition is and until when, or why it was rejected. The reviewer, the
-- time and the note are stamped under storm.crew_engine (the guard refuses
-- these columns to anyone else); the owner's login gets
-- crew_document_decided with a personal link to /me/documents (a person
-- without a login gets nothing). Any later material change returns the
-- document to unverified (060400's guard).
--
-- Alerts off (crew_document_mute / _unmute; C28, T-160):
-- vessel.crew.expiry_alerts.edit on a vessel of the person's structural
-- set, never on one's own documents (42501 own_document), with a reason
-- (22023 reason_required). A muted document keeps its real state, leaves
-- the KPI counts (X5's engine reads alerts_muted) and is skipped by the
-- expiry sweep. Renewing a document turns its alerts back on.
--
-- Renewal (crew_document_renew; C30): the same gate as changing a document
-- (crew_document_may_write 'edit'). The document's current number, dates,
-- issuing country and office, file and verification become version n
-- (allocated under a row lock on the document), then the new values are
-- saved through crew_document_save (every field rule of the type applies;
-- the number, dates and file of the old period are cleared unless given),
-- the legacy file reference is cleared, alerts come back on, and the
-- guard resets verification. A renewal that changes nothing material is
-- refused (22023 renewal_unchanged) and leaves no version. TR9
-- (crew_document_record_from_source, 060400 edited in place) versions its
-- renewals the same way.
--
-- Notices (D-128: every emit sits in an exception block, so a missing type
-- or fan-out problem never rolls back the action; D-249: in-app only):
--   crew_document_review_needed  crew_certificates_review_notify, AFTER
--     INSERT / UPDATE: a signed-in write leaves a document unverified (an
--     upload, a material change, a renewal). Recipients: the verifiers of
--     the person on each structural vessel (crew_document_verifiers), the
--     writer left out by the fan-out. One outbox row per person, vessel and
--     day (dedupe key crew_document_review_needed:<profile>:<vessel>:<day>),
--     so each verifier gets at most one notice a day per person; the link
--     is the document's tab on the crew profile
--     (crew/people/<profile>/<tab>). Maintenance writes without a JWT
--     (backfills, imports) send nothing.
--   crew_document_decided  crew_document_verify, to the owner's login.
--     Dedupe crew_document_decided:<document>:<decision>:<day>.
--   crew_document_expiring  crew_document_expiry_sweep (service role,
--     daily through hr-daily-sweeper): the stages are window entry, 30
--     days, 7 days and the expiry day (crew_document_expiry_stage; a run
--     missed on the expiry day catches up for 7 days); each recipient is
--     told about each document once per stage and expiry date
--     (crew_document_expiry_notices). One digest per recipient and day for
--     each destination: the crew member's own documents (personal link
--     /me/documents) and, per vessel, the documents of the people a verifier
--     looks after (vessel link crew/compliance). Muted documents, removed
--     documents, documents a newer one of the same type replaces and people
--     with no current assignment or placement are skipped. Returns the
--     counts (D-232).
--
-- Nothing here is live (D-01): the client reads every object through the
-- pending shim and keeps the verification badges read-only, with verify,
-- alerts off and renew hidden behind a one-line notice, while the RPCs are
-- missing.
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each policy,
-- trigger and constraint, CREATE OR REPLACE for every function.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.crew_document_may_write(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.crew_document_file_readable(uuid,uuid)') IS NULL
     OR to_regprocedure('public.crew_document_save(uuid,uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.crew_document_visible_profile_ids()') IS NULL
     OR to_regprocedure('public.crew_document_legacy_key(text)') IS NULL
     OR to_regclass('public.crew_document_types') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'crew_certificates' AND column_name = 'verification_status') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060500_crew_document_verification needs the crew document catalogue: apply 20261124060400_crew_document_catalogue.sql first';
  END IF;
  IF to_regprocedure('public.crew_profile_structural_vessels(uuid)') IS NULL
     OR to_regprocedure('public.crew_vessel_members(uuid,date)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL
     OR to_regclass('public.positions') IS NULL
     OR to_regclass('public.departments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060500_crew_document_verification needs the crew positions, membership and profile helpers: apply 20261124060100 to 20261124060300 first';
  END IF;
  IF to_regprocedure('public.expiry_window_for(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060500_crew_document_verification needs expiry_window_for(): apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.emit_notification_event(text,uuid,text,text,uuid,text,text,text,text,text,uuid,text,uuid,uuid[],text[],jsonb,text,text)') IS NULL
     OR to_regclass('public.notification_outbox') IS NULL
     OR to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_user_is_external(uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_normalise_office(text)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060500_crew_document_verification needs the platform notification, record and capability helpers: apply 20261123000300 to 20261123030000 first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

-- The replaced values of a renewed document (C30). profile_id and
-- company_id are the document's (filled and checked by the scope guard), so
-- the read policy is the document's own predicate without a join.
CREATE TABLE IF NOT EXISTS public.crew_document_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  crew_document_id uuid NOT NULL,
  version_no integer NOT NULL,
  document_type_id uuid NULL,
  number text NULL,
  issue_date date NULL,
  expiry_date date NULL,
  no_expiry boolean NOT NULL DEFAULT false,
  issuing_country_code text NULL,
  issuing_office text NULL,
  file_path text NULL,
  file_url text NULL,
  file_name text NULL,
  file_mime text NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_by uuid NULL,
  verified_at timestamptz NULL,
  verification_note text NULL,
  reason text NULL,
  replaced_at timestamptz NOT NULL DEFAULT now(),
  replaced_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_document_versions_pkey PRIMARY KEY (id),
  CONSTRAINT crew_document_versions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_versions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_versions_crew_document_id_fkey FOREIGN KEY (crew_document_id) REFERENCES public.crew_certificates(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_versions_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES public.crew_document_types(id) ON DELETE SET NULL,
  CONSTRAINT crew_document_versions_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_document_versions_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_document_versions_document_version_key UNIQUE (crew_document_id, version_no),
  CONSTRAINT crew_document_versions_version_no_check CHECK (version_no >= 1),
  CONSTRAINT crew_document_versions_verification_status_check
    CHECK (verification_status IN ('unverified', 'verified', 'conditionally_approved', 'rejected')),
  CONSTRAINT crew_document_versions_country_check CHECK (issuing_country_code IS NULL OR issuing_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT crew_document_versions_text_lengths_check
    CHECK ((number IS NULL OR length(number) <= 200)
       AND (issuing_office IS NULL OR length(issuing_office) <= 200)
       AND (file_path IS NULL OR length(file_path) <= 512)
       AND (file_url IS NULL OR length(file_url) <= 2048)
       AND (file_name IS NULL OR length(file_name) <= 255)
       AND (file_mime IS NULL OR length(file_mime) <= 120)
       AND (verification_note IS NULL OR length(verification_note) <= 2000)
       AND (reason IS NULL OR length(reason) <= 500))
);
CREATE INDEX IF NOT EXISTS crew_document_versions_profile_idx ON public.crew_document_versions (profile_id);
CREATE INDEX IF NOT EXISTS crew_document_versions_company_idx ON public.crew_document_versions (company_id);

-- The expiry sweep's bookkeeping: recipient R was told about document D at
-- stage S of expiry date E. Written by crew_document_expiry_sweep only.
CREATE TABLE IF NOT EXISTS public.crew_document_expiry_notices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  crew_document_id uuid NOT NULL,
  expiry_date date NOT NULL,
  stage text NOT NULL,
  recipient_user_id uuid NOT NULL,
  outbox_id uuid NULL,
  notified_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_document_expiry_notices_pkey PRIMARY KEY (id),
  CONSTRAINT crew_document_expiry_notices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_expiry_notices_crew_document_id_fkey FOREIGN KEY (crew_document_id) REFERENCES public.crew_certificates(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_expiry_notices_recipient_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT crew_document_expiry_notices_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES public.notification_outbox(id) ON DELETE SET NULL,
  CONSTRAINT crew_document_expiry_notices_once_key UNIQUE (crew_document_id, expiry_date, stage, recipient_user_id),
  CONSTRAINT crew_document_expiry_notices_stage_check CHECK (stage IN ('window', 'd30', 'd7', 'expiry_day'))
);
CREATE INDEX IF NOT EXISTS crew_document_expiry_notices_company_idx ON public.crew_document_expiry_notices (company_id);

-- ---------------------------------------------------------------- integrity guards (every writer)

-- A version row belongs to its document's person and company (filled from
-- the document, 23514 otherwise) and never moves to another document or
-- number.
CREATE OR REPLACE FUNCTION public.crew_document_versions_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_company uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.crew_document_id IS DISTINCT FROM OLD.crew_document_id OR NEW.version_no IS DISTINCT FROM OLD.version_no) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_version_locked', DETAIL = 'A document version stays with its document and number.';
  END IF;
  SELECT cc.profile_id, cc.company_id INTO v_profile, v_company FROM public.crew_certificates AS cc WHERE cc.id = NEW.crew_document_id;
  IF v_profile IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_version_scope_mismatch', DETAIL = 'A document version needs its crew document.';
  END IF;
  NEW.profile_id := coalesce(NEW.profile_id, v_profile);
  NEW.company_id := coalesce(NEW.company_id, v_company);
  IF NEW.profile_id IS DISTINCT FROM v_profile OR NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_version_scope_mismatch', DETAIL = 'A document version belongs to its document''s crew member and company.';
  END IF;
  RETURN NEW;
END;
$$;

-- An expiry notice carries its document's company.
CREATE OR REPLACE FUNCTION public.crew_document_expiry_notices_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT cc.company_id INTO v_company FROM public.crew_certificates AS cc WHERE cc.id = NEW.crew_document_id;
  NEW.company_id := coalesce(NEW.company_id, v_company);
  IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_expiry_notice_scope_mismatch', DETAIL = 'An expiry notice belongs to its document''s company.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_document_versions_scope_guard ON public.crew_document_versions;
CREATE TRIGGER trg_crew_document_versions_scope_guard
  BEFORE INSERT OR UPDATE ON public.crew_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.crew_document_versions_scope_guard();
DROP TRIGGER IF EXISTS trg_crew_document_expiry_notices_scope_guard ON public.crew_document_expiry_notices;
CREATE TRIGGER trg_crew_document_expiry_notices_scope_guard
  BEFORE INSERT OR UPDATE ON public.crew_document_expiry_notices
  FOR EACH ROW EXECUTE FUNCTION public.crew_document_expiry_notices_scope_guard();
DROP TRIGGER IF EXISTS trg_crew_document_versions_updated_at ON public.crew_document_versions;
CREATE TRIGGER trg_crew_document_versions_updated_at
  BEFORE UPDATE ON public.crew_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_crew_document_expiry_notices_updated_at ON public.crew_document_expiry_notices;
CREATE TRIGGER trg_crew_document_expiry_notices_updated_at
  BEFORE UPDATE ON public.crew_document_expiry_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- the verifier rule (TS lib/verification.ts)

-- A person's position, rank tier and department on a vessel today, from
-- their crew list entry there (crew_vessel_members: assignment, planned or
-- pending placement): the position matched from the titles
-- (crew_position_for), else the department from the free text; no row when
-- the person is not on the vessel's crew. The same resolution as
-- crew_profile_summary. Internal (the X1 definers).
CREATE OR REPLACE FUNCTION public.crew_member_role_on(p_profile_id uuid, p_vessel_id uuid)
RETURNS TABLE (position_key text, rank_tier text, department_key text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH m AS (
    SELECT mb.department_text,
           coalesce(public.crew_position_for(v.company_id, v.id, mb.position_text),
                    public.crew_position_for(v.company_id, v.id, mb.rank_text)) AS pid
    FROM public.vessels AS v
    CROSS JOIN LATERAL public.crew_vessel_members(v.id, current_date) AS mb
    WHERE v.id = p_vessel_id AND mb.profile_id = p_profile_id
    LIMIT 1
  )
  SELECT pos.key::text, pos.rank_tier::text, dep.key::text
  FROM m
  LEFT JOIN public.positions AS pos ON pos.id = m.pid
  LEFT JOIN LATERAL (
    SELECT d.key
    FROM public.departments AS d
    WHERE d.key = pos.department_key
       OR (pos.department_key IS NULL AND d.is_active
           AND (d.key = public.record_normalise_office(m.department_text)
                OR public.record_normalise_office(d.label) = public.record_normalise_office(m.department_text)))
    ORDER BY (d.key = pos.department_key) DESC NULLS LAST, d.sort_order
    LIMIT 1
  ) AS dep ON true
$$;

-- Whether p_user may decide the verification of p_profile's documents on
-- one vessel: 'ok', 'out_of_department' (a head of department and another
-- department) or 'not_permitted' (no vessel.crew.crew_certificates.approve
-- there). The Master of the vessel (record_is_master, or a command-tier
-- position), the Purser's office (department purser_office) and fleet reach
-- decide for every department; the HoD tier only for its own department;
-- holders outside the HoD tier are not bound to a department. Internal.
CREATE OR REPLACE FUNCTION public.crew_document_verifier_on(p_user uuid, p_profile uuid, p_vessel uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_me uuid;
  v_tier text;
  v_department text;
  v_subject_department text;
BEGIN
  IF p_user IS NULL OR p_profile IS NULL OR p_vessel IS NULL THEN
    RETURN 'not_permitted';
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = p_vessel;
  IF v_company IS NULL
     OR NOT coalesce(public.has_capability_for(p_user, 'vessel.crew.crew_certificates.approve', v_company, p_vessel), false) THEN
    RETURN 'not_permitted';
  END IF;
  IF coalesce(public.record_is_master(p_user, p_vessel), false) OR coalesce(public.fleet_reach_for(p_user, v_company), false) THEN
    RETURN 'ok';
  END IF;
  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = p_user;
  SELECT r.rank_tier, r.department_key INTO v_tier, v_department FROM public.crew_member_role_on(v_me, p_vessel) AS r;
  IF v_tier = 'command' OR v_department = 'purser_office' OR v_tier IS DISTINCT FROM 'hod' THEN
    RETURN 'ok';
  END IF;
  SELECT r.department_key INTO v_subject_department FROM public.crew_member_role_on(p_profile, p_vessel) AS r;
  IF v_subject_department IS NOT NULL AND v_subject_department = v_department THEN
    RETURN 'ok';
  END IF;
  RETURN 'out_of_department';
END;
$$;

-- Whether p_user may decide the verification of p_profile's documents:
-- 'ok', 'own_document', 'out_of_department' or 'not_permitted' (TS
-- verifierDecision). Active, same company, no external viewer; never one's
-- own documents; 'ok' on any vessel of the person's structural set wins,
-- else 'out_of_department' when that was the reason on a vessel. Internal.
CREATE OR REPLACE FUNCTION public.crew_document_verifier_check(p_user uuid, p_profile uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_me uuid;
  v_subject_company uuid;
  v_answer text;
  v_best text := 'not_permitted';
  s record;
BEGIN
  IF p_user IS NULL OR p_profile IS NULL OR NOT coalesce(public.user_is_active(p_user), false) THEN
    RETURN 'not_permitted';
  END IF;
  SELECT p.company_id, p.id INTO v_company, v_me FROM public.profiles AS p WHERE p.user_id = p_user;
  SELECT p.company_id INTO v_subject_company FROM public.profiles AS p WHERE p.id = p_profile;
  IF v_company IS NULL OR v_subject_company IS DISTINCT FROM v_company
     OR coalesce(public.record_user_is_external(p_user, v_company), true) THEN
    RETURN 'not_permitted';
  END IF;
  IF p_profile IS NOT DISTINCT FROM v_me THEN
    RETURN 'own_document';
  END IF;
  FOR s IN SELECT x.vessel_id FROM public.crew_profile_structural_vessels(p_profile) AS x(vessel_id) LOOP
    v_answer := public.crew_document_verifier_on(p_user, p_profile, s.vessel_id);
    IF v_answer = 'ok' THEN
      RETURN 'ok';
    ELSIF v_answer = 'out_of_department' THEN
      v_best := 'out_of_department';
    END IF;
  END LOOP;
  RETURN v_best;
END;
$$;

-- The people who may verify p_profile's documents, one row each with the
-- vessel of the person's structural set where they may (the first by id
-- when several): active logins of the company who reach the vessel, no
-- external viewer, the person left out, crew_document_verifier_on 'ok'.
-- Internal (the review notice and the expiry sweep).
CREATE OR REPLACE FUNCTION public.crew_document_verifiers(p_profile_id uuid)
RETURNS TABLE (user_id uuid, vessel_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (u.user_id) u.user_id, s.vessel_id
  FROM public.profiles AS subj
  CROSS JOIN LATERAL public.crew_profile_structural_vessels(subj.id) AS s(vessel_id)
  JOIN public.profiles AS u ON u.company_id = subj.company_id AND u.user_id IS NOT NULL AND u.id IS DISTINCT FROM subj.id
  WHERE subj.id = p_profile_id
    AND public.user_is_active(u.user_id)
    AND public.reach_vessel_for(u.user_id, s.vessel_id)
    AND NOT coalesce(public.record_user_is_external(u.user_id, subj.company_id), true)
    AND public.crew_document_verifier_on(u.user_id, subj.id, s.vessel_id) = 'ok'
  ORDER BY u.user_id, s.vessel_id
$$;

-- Whether p_user may turn alerts off or on for p_profile's documents:
-- 'ok', 'own_document' or 'not_permitted'. Active, same company, no
-- external viewer, not one's own documents, and
-- vessel.crew.expiry_alerts.edit on a vessel of the person's structural set
-- (T-160: heads of department and officers, not only administrators).
-- Internal.
CREATE OR REPLACE FUNCTION public.crew_document_mute_check(p_user uuid, p_profile uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_me uuid;
  v_subject_company uuid;
BEGIN
  IF p_user IS NULL OR p_profile IS NULL OR NOT coalesce(public.user_is_active(p_user), false) THEN
    RETURN 'not_permitted';
  END IF;
  SELECT p.company_id, p.id INTO v_company, v_me FROM public.profiles AS p WHERE p.user_id = p_user;
  SELECT p.company_id INTO v_subject_company FROM public.profiles AS p WHERE p.id = p_profile;
  IF v_company IS NULL OR v_subject_company IS DISTINCT FROM v_company
     OR coalesce(public.record_user_is_external(p_user, v_company), true) THEN
    RETURN 'not_permitted';
  END IF;
  IF p_profile IS NOT DISTINCT FROM v_me THEN
    RETURN 'own_document';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.crew_profile_structural_vessels(p_profile) AS s(vessel_id)
    WHERE public.has_capability_for(p_user, 'vessel.crew.expiry_alerts.edit', v_company, s.vessel_id)
  ) THEN
    RETURN 'ok';
  END IF;
  RETURN 'not_permitted';
END;
$$;

-- ---------------------------------------------------------------- versions (C30)

-- Writes the document's current values as its next version (number
-- allocated under a row lock on the document, so two renewals never share
-- one) and returns the version number. The caller then applies the new
-- values. Internal (crew_document_renew, crew_document_record_from_source).
CREATE OR REPLACE FUNCTION public.crew_document_version_capture(p_document_id uuid, p_reason text, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.crew_certificates;
  v_no integer;
BEGIN
  SELECT * INTO v_doc FROM public.crew_certificates AS cc WHERE cc.id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;
  SELECT coalesce(max(v.version_no), 0) + 1 INTO v_no FROM public.crew_document_versions AS v WHERE v.crew_document_id = p_document_id;
  INSERT INTO public.crew_document_versions (
    company_id, profile_id, crew_document_id, version_no, document_type_id, number, issue_date, expiry_date, no_expiry,
    issuing_country_code, issuing_office, file_path, file_url, file_name, file_mime,
    verification_status, verified_by, verified_at, verification_note, reason, replaced_at, replaced_by)
  VALUES (
    v_doc.company_id, v_doc.profile_id, v_doc.id, v_no, v_doc.document_type_id, left(v_doc.certificate_number, 200), v_doc.issue_date, v_doc.expiry_date,
    coalesce(v_doc.no_expiry, false), v_doc.issuing_country_code, left(coalesce(v_doc.issuing_office, v_doc.issuing_authority), 200),
    v_doc.file_path, left(v_doc.file_url, 2048), left(v_doc.file_name, 255), v_doc.file_mime,
    v_doc.verification_status, v_doc.verified_by, v_doc.verified_at, v_doc.verification_note,
    left(coalesce(nullif(btrim(p_reason), ''), 'Renewed'), 500), now(),
    CASE WHEN EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = p_actor) THEN p_actor END);
  RETURN v_no;
END;
$$;

-- ---------------------------------------------------------------- expiry notice stages (TS expiryNoticeStage)

-- The notice stage of a document p_days_left days from its expiry with a
-- p_window-day warning window: 'window' (more than 30 days left, inside the
-- window), 'd30' (8 to 30), 'd7' (1 to 7), 'expiry_day' (the expiry day,
-- and up to 7 days after it, so a missed run catches up); NULL outside the
-- window, more than 7 days past expiry, or with no date. Pure.
CREATE OR REPLACE FUNCTION public.crew_document_expiry_stage(p_days_left integer, p_window integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_days_left IS NULL OR p_window IS NULL OR p_days_left < -7 OR p_days_left > greatest(p_window, 0) THEN NULL
    WHEN p_days_left <= 0 THEN 'expiry_day'
    WHEN p_days_left <= 7 THEN 'd7'
    WHEN p_days_left <= 30 THEN 'd30'
    ELSE 'window'
  END
$$;

-- The words for a document's days to expiry in a notice: "expires in 12
-- days", "expires tomorrow", "expires today", "expired yesterday",
-- "expired 3 days ago". Pure.
CREATE OR REPLACE FUNCTION public.crew_document_expiry_phrase(p_days_left integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_days_left IS NULL THEN 'has no expiry date'
    WHEN p_days_left > 1 THEN format('expires in %s days', p_days_left)
    WHEN p_days_left = 1 THEN 'expires tomorrow'
    WHEN p_days_left = 0 THEN 'expires today'
    WHEN p_days_left = -1 THEN 'expired yesterday'
    ELSE format('expired %s days ago', -p_days_left)
  END
$$;

-- ---------------------------------------------------------------- RPCs

-- What the caller may do about a person's document reviews (X1-05's tab
-- controls): verify (and why not: own_document, out_of_department,
-- not_permitted), turn alerts off or on, renew. A caller who may not read
-- the person's documents gets all false. Unknown or foreign person: P0002;
-- signed out or inactive: 42501. One row.
CREATE OR REPLACE FUNCTION public.crew_document_review_rights(p_profile_id uuid)
RETURNS TABLE (can_verify boolean, verify_block text, can_mute boolean, can_renew boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_verify text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_company IS NULL OR v_company IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  IF NOT coalesce(public.crew_document_file_readable(v_uid, p_profile_id), false) THEN
    RETURN QUERY SELECT false, 'not_permitted'::text, false, false;
    RETURN;
  END IF;
  v_verify := public.crew_document_verifier_check(v_uid, p_profile_id);
  RETURN QUERY SELECT
    v_verify = 'ok',
    CASE WHEN v_verify = 'ok' THEN NULL ELSE v_verify END,
    public.crew_document_mute_check(v_uid, p_profile_id) = 'ok',
    coalesce(public.crew_document_may_write(v_uid, p_profile_id, 'edit'), false);
END;
$$;

-- Decides a document's verification (gap/04 C27, W4; TS
-- lib/verification.ts): p_decision verified, conditionally_approved or
-- rejected (22023 decision_invalid); the verifier rule
-- (crew_document_verifier_check: 42501 own_document / out_of_department /
-- not_permitted); a note for conditional approval and rejection (22023
-- note_required), at most 2000 characters. Stamps the reviewer, the time and
-- the note under storm.crew_engine and tells the owner's login
-- (crew_document_decided, personal link documents; D-128). Unknown, foreign
-- or removed document: P0002. Returns the row.
CREATE OR REPLACE FUNCTION public.crew_document_verify(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS public.crew_certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.crew_certificates;
  v_row public.crew_certificates;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_check text;
  v_prev_flag text;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  IF v_decision NOT IN ('verified', 'conditionally_approved', 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision_invalid',
      DETAIL = 'Choose verified, conditionally approved or rejected.', HINT = 'decision';
  END IF;
  SELECT * INTO v_doc FROM public.crew_certificates AS cc WHERE cc.id = p_id FOR UPDATE;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL OR v_doc.company_id IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;
  v_check := public.crew_document_verifier_check(v_uid, v_doc.profile_id);
  IF v_check = 'own_document' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'own_document',
      DETAIL = 'You can''t verify your own documents. Someone else on board or in the office checks them.';
  ELSIF v_check = 'out_of_department' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'out_of_department',
      DETAIL = 'As a head of department you verify the documents of your own department only.';
  ELSIF v_check IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted',
      DETAIL = 'You don''t have permission to verify this person''s documents.';
  END IF;
  IF v_decision IN ('conditionally_approved', 'rejected') AND v_note IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'note_required',
      DETAIL = CASE v_decision WHEN 'rejected' THEN 'Say why the document is rejected, so it can be put right.'
                               ELSE 'Say what the condition is and until when it applies.' END,
      HINT = 'note';
  END IF;
  IF length(v_note) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the note to 2000 characters or fewer.', HINT = 'note';
  END IF;

  v_prev_flag := coalesce(current_setting('storm.crew_engine', true), '');
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_certificates AS cc
  SET verification_status = v_decision, verified_by = v_uid, verified_at = now(), verification_note = v_note, updated_by = v_uid
  WHERE cc.id = p_id AND cc.deleted_at IS NULL
  RETURNING * INTO v_row;
  PERFORM set_config('storm.crew_engine', v_prev_flag, true);
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;

  -- The owner's login hears the decision (D-128: never rolls the decision back).
  IF v_row.user_id IS NOT NULL THEN
    BEGIN
      v_label := coalesce((SELECT t.name FROM public.crew_document_types AS t WHERE t.id = v_row.document_type_id),
                          nullif(btrim(v_row.certificate_name), ''), 'document');
      PERFORM public.emit_notification_event(
        p_type_key => 'crew_document_decided',
        p_company_id => v_row.company_id,
        p_title => left(CASE v_decision
                          WHEN 'verified' THEN format('Your %s was verified', v_label)
                          WHEN 'conditionally_approved' THEN format('Your %s was approved with a condition', v_label)
                          ELSE format('Your %s was sent back', v_label) END, 120),
        p_link_scope => 'personal',
        p_body => left(CASE WHEN v_note IS NULL THEN 'Checked against the file and the details you entered.' ELSE v_note END, 280),
        p_severity => CASE v_decision WHEN 'verified' THEN 'success' ELSE 'warning' END,
        p_link_path => 'documents',
        p_must_act_user_ids => ARRAY[v_row.user_id],
        p_payload => jsonb_build_object('document_id', v_row.id, 'decision', v_decision),
        p_dedupe_key => format('crew_document_decided:%s:%s:%s', v_row.id, v_decision, to_char(current_date, 'YYYY-MM-DD')),
        p_module_key => 'crew');
    EXCEPTION WHEN others THEN
      RAISE WARNING 'crew_document_verify: crew_document_decided not sent (%): %', SQLSTATE, SQLERRM;
    END;
  END IF;
  RETURN v_row;
END;
$$;

-- Turns a document's alerts off (C28, T-160): crew_document_mute_check
-- (42501 own_document / not_permitted), a reason (22023 reason_required, at
-- most 500 characters). Muting again replaces the reason. The document keeps
-- its real state; KPIs and the expiry sweep leave it out. Unknown, foreign
-- or removed document: P0002. Returns the row.
CREATE OR REPLACE FUNCTION public.crew_document_mute(p_id uuid, p_reason text)
RETURNS public.crew_certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.crew_certificates;
  v_row public.crew_certificates;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_check text;
  v_prev_flag text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  SELECT * INTO v_doc FROM public.crew_certificates AS cc WHERE cc.id = p_id FOR UPDATE;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL OR v_doc.company_id IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;
  v_check := public.crew_document_mute_check(v_uid, v_doc.profile_id);
  IF v_check = 'own_document' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'own_document',
      DETAIL = 'You can''t turn off alerts for your own documents.';
  ELSIF v_check IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted',
      DETAIL = 'Turning alerts off needs the expiry alerts right on this person''s vessel.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required', DETAIL = 'Say why alerts are turned off for this document.', HINT = 'reason';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the reason to 500 characters or fewer.', HINT = 'reason';
  END IF;
  v_prev_flag := coalesce(current_setting('storm.crew_engine', true), '');
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_certificates AS cc
  SET alerts_muted = true, muted_by = v_uid, muted_at = now(), muted_reason = v_reason, updated_by = v_uid
  WHERE cc.id = p_id AND cc.deleted_at IS NULL
  RETURNING * INTO v_row;
  PERFORM set_config('storm.crew_engine', v_prev_flag, true);
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;
  RETURN v_row;
END;
$$;

-- Turns a document's alerts back on: the same gate as crew_document_mute;
-- clears who, when and why. A document whose alerts are on is returned
-- unchanged. Returns the row.
CREATE OR REPLACE FUNCTION public.crew_document_unmute(p_id uuid)
RETURNS public.crew_certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.crew_certificates;
  v_row public.crew_certificates;
  v_check text;
  v_prev_flag text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  SELECT * INTO v_doc FROM public.crew_certificates AS cc WHERE cc.id = p_id FOR UPDATE;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL OR v_doc.company_id IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;
  v_check := public.crew_document_mute_check(v_uid, v_doc.profile_id);
  IF v_check = 'own_document' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'own_document',
      DETAIL = 'You can''t change the alerts of your own documents.';
  ELSIF v_check IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted',
      DETAIL = 'Turning alerts on needs the expiry alerts right on this person''s vessel.';
  END IF;
  IF NOT v_doc.alerts_muted THEN
    RETURN v_doc;
  END IF;
  v_prev_flag := coalesce(current_setting('storm.crew_engine', true), '');
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_certificates AS cc
  SET alerts_muted = false, muted_by = NULL, muted_at = NULL, muted_reason = NULL, updated_by = v_uid
  WHERE cc.id = p_id AND cc.deleted_at IS NULL
  RETURNING * INTO v_row;
  PERFORM set_config('storm.crew_engine', v_prev_flag, true);
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;
  RETURN v_row;
END;
$$;

-- Renews a document (gap/04 C30, W3): the same gate as changing it
-- (crew_document_may_write 'edit'; 42501). p_payload holds the new values
-- with crew_document_save's keys (and an optional 'reason' for the version,
-- at most 500 characters): a new expiry date or the No-expiry tick is
-- required (22023 field_required); the number, dates, endorsement date and
-- file of the old period are cleared unless given; the issuing country and
-- office, notes and the type's details stay unless given. The current
-- values become the next version (crew_document_version_capture), the
-- legacy file reference is cleared, alerts come back on, the save applies
-- every field rule of the type and the guard resets verification. 22023
-- renewal_unchanged when nothing material changed (no version is kept).
-- Unknown, foreign or removed document: P0002. Returns the row.
CREATE OR REPLACE FUNCTION public.crew_document_renew(p_id uuid, p_payload jsonb)
RETURNS public.crew_certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.crew_certificates;
  v_row public.crew_certificates;
  v_version public.crew_document_versions;
  v_payload jsonb;
  v_reason text;
  v_schema jsonb;
  v_merged jsonb;
  v_no integer;
  v_prev_flag text;
  v_has_expiry boolean;
  v_no_expiry boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid', DETAIL = 'The document details could not be read.';
  END IF;
  SELECT * INTO v_doc FROM public.crew_certificates AS cc WHERE cc.id = p_id FOR UPDATE;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL OR v_doc.company_id IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;
  IF NOT coalesce(public.crew_document_may_write(v_uid, v_doc.profile_id, 'edit'), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted',
      DETAIL = 'You don''t have permission to renew this person''s documents.';
  END IF;

  IF p_payload ? 'reason' AND jsonb_typeof(p_payload -> 'reason') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'The reason could not be read.', HINT = 'reason';
  END IF;
  v_reason := nullif(btrim(coalesce(p_payload ->> 'reason', '')), '');
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the reason to 500 characters or fewer.', HINT = 'reason';
  END IF;
  v_payload := p_payload - 'reason';
  v_has_expiry := jsonb_typeof(v_payload -> 'expiry_date') = 'string' AND btrim(v_payload ->> 'expiry_date') <> '';
  v_no_expiry := jsonb_typeof(v_payload -> 'no_expiry') = 'boolean' AND (v_payload -> 'no_expiry') = 'true'::jsonb;
  IF NOT v_has_expiry AND NOT v_no_expiry THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required', DETAIL = 'Enter the new expiry date, or tick No expiry.', HINT = 'expiry_date';
  END IF;

  -- The old period's values are cleared unless the payload gives new ones.
  SELECT t.field_schema INTO v_schema FROM public.crew_document_types AS t WHERE t.id = v_doc.document_type_id;
  v_merged := jsonb_build_object('number', NULL, 'issue_date', NULL, 'expiry_date', NULL, 'no_expiry', false,
                                 'file_path', NULL, 'file_name', NULL, 'file_size', NULL, 'file_mime', NULL)
              || CASE WHEN coalesce(v_schema, '{}'::jsonb) ? 'endorsement_date' THEN jsonb_build_object('endorsement_due_date', NULL) ELSE '{}'::jsonb END
              || v_payload;

  v_no := public.crew_document_version_capture(p_id, coalesce(v_reason, 'Renewed'), v_uid);
  SELECT * INTO v_version FROM public.crew_document_versions AS v WHERE v.crew_document_id = p_id AND v.version_no = v_no;

  v_prev_flag := coalesce(current_setting('storm.crew_engine', true), '');
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_certificates AS cc
  SET file_url = NULL, alerts_muted = false, muted_by = NULL, muted_at = NULL, muted_reason = NULL, updated_by = v_uid
  WHERE cc.id = p_id;
  PERFORM set_config('storm.crew_engine', v_prev_flag, true);

  PERFORM public.crew_document_save(p_id, v_doc.profile_id, NULL, v_merged);

  SELECT * INTO v_row FROM public.crew_certificates AS cc WHERE cc.id = p_id;
  IF (v_row.certificate_number, v_row.issue_date, v_row.expiry_date, v_row.no_expiry, v_row.file_path, v_row.file_url)
     IS NOT DISTINCT FROM
     (v_version.number, v_version.issue_date, v_version.expiry_date, v_version.no_expiry, v_version.file_path, v_version.file_url) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'renewal_unchanged',
      DETAIL = 'Nothing changed. Enter the new document''s dates, number or file.', HINT = 'expiry_date';
  END IF;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------- the review notice (C27, T-139, T-163)

-- crew_certificates_review_notify (AFTER INSERT, UPDATE): a signed-in
-- write that leaves a document unverified (an upload, a material change,
-- a renewal; the guard's list of material columns) tells the person's
-- verifiers on each structural vessel: crew_document_review_needed, one
-- outbox row per person, vessel and day (each verifier at most one notice a
-- day per person), linked to the document's tab. The writer is left out by
-- the fan-out; a write without a JWT (maintenance, backfill) sends nothing;
-- any failure is a warning, never a rollback (D-128).
CREATE OR REPLACE FUNCTION public.crew_certificates_review_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day text := to_char(current_date, 'YYYY-MM-DD');
  v_key text;
  v_label text;
  v_tab text;
  v_person text;
  v_loaded boolean := false;
  v_users uuid[];
  v_vessels uuid[];
  v_verifiers uuid[];
  s record;
BEGIN
  IF v_uid IS NULL OR NEW.profile_id IS NULL OR NEW.company_id IS NULL OR NEW.deleted_at IS NOT NULL
     OR NEW.verification_status IS DISTINCT FROM 'unverified' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.verification_status = 'unverified' AND OLD.deleted_at IS NULL
     AND (NEW.certificate_number, NEW.issue_date, NEW.expiry_date, NEW.no_expiry, NEW.issuing_country_code,
          NEW.document_type_id, NEW.file_path, NEW.file_url, NEW.certificate_type)
         IS NOT DISTINCT FROM
         (OLD.certificate_number, OLD.issue_date, OLD.expiry_date, OLD.no_expiry, OLD.issuing_country_code,
          OLD.document_type_id, OLD.file_path, OLD.file_url, OLD.certificate_type) THEN
    RETURN NULL;
  END IF;
  BEGIN
    FOR s IN SELECT x.vessel_id FROM public.crew_profile_structural_vessels(NEW.profile_id) AS x(vessel_id) ORDER BY x.vessel_id LOOP
      v_key := format('crew_document_review_needed:%s:%s:%s', NEW.profile_id, s.vessel_id, v_day);
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.notification_outbox AS o WHERE o.company_id = NEW.company_id AND o.dedupe_key = v_key);
      IF NOT v_loaded THEN
        -- Once per write, and only when some vessel still needs today's notice.
        SELECT coalesce(array_agg(v.user_id ORDER BY v.user_id), ARRAY[]::uuid[]), coalesce(array_agg(v.vessel_id ORDER BY v.user_id), ARRAY[]::uuid[])
          INTO v_users, v_vessels
        FROM public.crew_document_verifiers(NEW.profile_id) AS v;
        SELECT coalesce(t.name, nullif(btrim(NEW.certificate_name), ''), 'document'), coalesce(c.tab, 'qualifications')
          INTO v_label, v_tab
        FROM (SELECT 1) AS one
        LEFT JOIN public.crew_document_types AS t ON t.id = NEW.document_type_id
        LEFT JOIN public.crew_document_categories AS c ON c.key = t.category_key;
        SELECT nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), '')
          INTO v_person
        FROM public.profiles AS p WHERE p.id = NEW.profile_id;
        v_loaded := true;
      END IF;
      -- Each verifier is listed with one vessel, so they hear of the person once a day.
      SELECT coalesce(array_agg(x.u), ARRAY[]::uuid[]) INTO v_verifiers
      FROM unnest(v_users, v_vessels) AS x(u, vv) WHERE x.vv = s.vessel_id;
      CONTINUE WHEN cardinality(v_verifiers) = 0;
      BEGIN
        PERFORM public.emit_notification_event(
          p_type_key => 'crew_document_review_needed',
          p_company_id => NEW.company_id,
          p_title => left(format('Check %s for %s', v_label, coalesce(v_person, 'a crew member')), 120),
          p_link_scope => 'vessel',
          p_vessel_id => s.vessel_id,
          p_body => left(format('%s was added or changed and waits for verification.', v_label), 280),
          p_severity => 'info',
          p_link_path => format('crew/people/%s/%s', NEW.profile_id, v_tab),
          p_must_act_user_ids => v_verifiers,
          p_payload => jsonb_build_object('document_id', NEW.id, 'profile_id', NEW.profile_id),
          p_dedupe_key => v_key,
          p_module_key => 'crew');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'crew_certificates_review_notify: crew_document_review_needed not sent (%): %', SQLSTATE, SQLERRM;
      END;
    END LOOP;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'crew_certificates_review_notify: the verifiers could not be found (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_certificates_review_notify ON public.crew_certificates;
CREATE TRIGGER trg_crew_certificates_review_notify
  AFTER INSERT OR UPDATE ON public.crew_certificates
  FOR EACH ROW EXECUTE FUNCTION public.crew_certificates_review_notify();

-- ---------------------------------------------------------------- the expiry sweep (W3; D-232; PR-X1-K)

-- The documents at a notice stage on p_today (crew_document_expiry_stage on
-- the window of the type, expiry_window_for): the latest document of each
-- person, type and issuing country (as expiry_src_crew_documents picks it),
-- not removed, with an expiry date, with the person's login and name,
-- whether alerts are off and whether the person has a current assignment or
-- placement. Internal (crew_document_expiry_sweep).
CREATE OR REPLACE FUNCTION public.crew_document_expiry_due(p_today date)
RETURNS TABLE (
  document_id uuid, profile_id uuid, company_id uuid, user_id uuid, expiry_date date, days_left integer,
  stage text, label text, person text, alerts_muted boolean, current_crew boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (cc.profile_id,
                        coalesce(cc.document_type_id::text, 'legacy:' || coalesce(public.crew_document_legacy_key(cc.certificate_type), '')
                                                            || ':' || coalesce(public.crew_document_legacy_key(cc.certificate_name), '')),
                        coalesce(cc.issuing_country_code, ''))
           cc.id, cc.profile_id, cc.company_id, cc.document_type_id, cc.expiry_date, cc.no_expiry, cc.alerts_muted,
           coalesce(t.name, nullif(btrim(cc.certificate_name), ''), nullif(btrim(cc.certificate_type), ''), 'Crew document') AS label,
           coalesce(t.expiry_item_type, 'crew_qualification') AS item_type
    FROM public.crew_certificates AS cc
    LEFT JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
    WHERE cc.deleted_at IS NULL AND cc.profile_id IS NOT NULL AND cc.company_id IS NOT NULL
      AND (cc.expiry_date IS NOT NULL OR cc.no_expiry)
    ORDER BY cc.profile_id,
             coalesce(cc.document_type_id::text, 'legacy:' || coalesce(public.crew_document_legacy_key(cc.certificate_type), '')
                                                 || ':' || coalesce(public.crew_document_legacy_key(cc.certificate_name), '')),
             coalesce(cc.issuing_country_code, ''),
             cc.no_expiry DESC, cc.expiry_date DESC NULLS LAST, cc.updated_at DESC, cc.id
  ),
  staged AS (
    SELECT l.*, (l.expiry_date - p_today) AS left_days,
           public.crew_document_expiry_stage(l.expiry_date - p_today, public.expiry_window_for(l.company_id, l.item_type, l.document_type_id)) AS notice_stage
    FROM latest AS l
    WHERE NOT l.no_expiry AND l.expiry_date IS NOT NULL
  )
  SELECT s.id, s.profile_id, s.company_id, p.user_id, s.expiry_date, s.left_days, s.notice_stage, s.label,
         coalesce(nullif(btrim(concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name)), ''), 'A crew member'),
         s.alerts_muted,
         EXISTS (SELECT 1 FROM public.crew_profile_structural_vessels(s.profile_id))
  FROM staged AS s
  JOIN public.profiles AS p ON p.id = s.profile_id AND p.company_id = s.company_id
  WHERE s.notice_stage IS NOT NULL
$$;

-- Daily, through hr-daily-sweeper (service role). For every document of
-- crew_document_expiry_due that is not muted and whose person has a current
-- assignment or placement, each recipient not yet told about the document
-- at that stage and expiry date gets it in their digest of the day.
-- Recipients: the crew member's login (personal digest, link documents) and
-- the person's verifiers (one digest per vessel, link crew/compliance). One
-- digest per recipient, destination and day (dedupe
-- crew_document_expiring:<vessel|me>:<user>:<day>); a digest that went out
-- earlier today is not added to (its documents wait for tomorrow). Every
-- emit sits in an exception block (D-128): a failed digest records nothing,
-- so the next run tries again. Returns the counts: due, muted, ended,
-- digests, notices, already_sent, failed (D-232).
CREATE OR REPLACE FUNCTION public.crew_document_expiry_sweep(p_today date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := coalesce(p_today, current_date);
  v_day text := to_char(coalesce(p_today, current_date), 'YYYY-MM-DD');
  v_due integer := 0;
  v_muted integer := 0;
  v_ended integer := 0;
  v_digests integer := 0;
  v_notices integer := 0;
  v_already integer := 0;
  v_failed integer := 0;
  v_count integer;
  v_key text;
  v_id uuid;
  v_title text;
  v_body text;
  v_first jsonb;
  r record;
BEGIN
  SELECT count(*) FILTER (WHERE d.alerts_muted),
         count(*) FILTER (WHERE NOT d.alerts_muted AND NOT d.current_crew),
         count(*) FILTER (WHERE NOT d.alerts_muted AND d.current_crew)
    INTO v_muted, v_ended, v_due
  FROM public.crew_document_expiry_due(v_today) AS d;

  FOR r IN
    WITH due AS (
      SELECT d.* FROM public.crew_document_expiry_due(v_today) AS d WHERE NOT d.alerts_muted AND d.current_crew
    ),
    staff AS (
      SELECT p.profile_id, v.user_id, v.vessel_id
      FROM (SELECT DISTINCT due.profile_id FROM due) AS p
      CROSS JOIN LATERAL public.crew_document_verifiers(p.profile_id) AS v
    ),
    recipients AS (
      SELECT d.document_id, d.profile_id, d.company_id, d.expiry_date, d.days_left, d.stage, d.label, d.person,
             d.user_id AS recipient, NULL::uuid AS vessel_id
      FROM due AS d WHERE d.user_id IS NOT NULL
      UNION ALL
      SELECT d.document_id, d.profile_id, d.company_id, d.expiry_date, d.days_left, d.stage, d.label, d.person,
             st.user_id, st.vessel_id
      FROM due AS d JOIN staff AS st ON st.profile_id = d.profile_id
    ),
    pending AS (
      SELECT x.* FROM recipients AS x
      WHERE NOT EXISTS (
        SELECT 1 FROM public.crew_document_expiry_notices AS n
        WHERE n.crew_document_id = x.document_id AND n.expiry_date = x.expiry_date AND n.stage = x.stage AND n.recipient_user_id = x.recipient)
    )
    SELECT x.recipient, x.vessel_id, x.company_id, count(*) AS n, min(x.days_left) AS soonest,
           jsonb_agg(jsonb_build_object('document_id', x.document_id, 'profile_id', x.profile_id, 'expiry_date', x.expiry_date,
                                        'stage', x.stage, 'days_left', x.days_left, 'label', x.label, 'person', x.person)
                     ORDER BY x.days_left, x.label, x.document_id) AS items
    FROM pending AS x
    GROUP BY x.recipient, x.vessel_id, x.company_id
    ORDER BY x.company_id, x.recipient, x.vessel_id NULLS FIRST
  LOOP
    v_key := format('crew_document_expiring:%s:%s:%s', coalesce(r.vessel_id::text, 'me'), r.recipient, v_day);
    IF EXISTS (SELECT 1 FROM public.notification_outbox AS o WHERE o.company_id = r.company_id AND o.dedupe_key = v_key) THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;
    v_first := r.items -> 0;
    v_title := CASE
      WHEN r.n = 1 AND r.vessel_id IS NULL THEN format('Your %s %s', v_first ->> 'label', public.crew_document_expiry_phrase((v_first ->> 'days_left')::integer))
      WHEN r.n = 1 THEN format('%s: %s %s', v_first ->> 'person', v_first ->> 'label', public.crew_document_expiry_phrase((v_first ->> 'days_left')::integer))
      WHEN r.vessel_id IS NULL THEN format('%s of your documents need renewing', r.n)
      ELSE format('%s crew documents need renewing', r.n)
    END;
    SELECT string_agg(CASE WHEN r.vessel_id IS NULL THEN (e.i ->> 'label') ELSE (e.i ->> 'person') || ', ' || (e.i ->> 'label') END
                      || ' ' || public.crew_document_expiry_phrase((e.i ->> 'days_left')::integer), '; ' ORDER BY e.ord)
      INTO v_body
    FROM jsonb_array_elements(r.items) WITH ORDINALITY AS e(i, ord)
    WHERE e.ord <= 3;
    IF r.n > 3 THEN
      v_body := v_body || format('; and %s more', r.n - 3);
    END IF;
    BEGIN
      v_id := public.emit_notification_event(
        p_type_key => 'crew_document_expiring',
        p_company_id => r.company_id,
        p_title => left(v_title, 120),
        p_link_scope => CASE WHEN r.vessel_id IS NULL THEN 'personal' ELSE 'vessel' END,
        p_vessel_id => r.vessel_id,
        p_body => left(v_body || '.', 280),
        p_severity => CASE WHEN r.soonest <= 0 THEN 'critical' WHEN r.soonest <= 7 THEN 'warning' ELSE 'info' END,
        p_link_path => CASE WHEN r.vessel_id IS NULL THEN 'documents' ELSE 'crew/compliance' END,
        p_must_act_user_ids => ARRAY[r.recipient],
        p_payload => jsonb_build_object('documents', r.items),
        p_dedupe_key => v_key,
        p_module_key => 'crew');
      IF v_id IS NOT NULL THEN
        INSERT INTO public.crew_document_expiry_notices (company_id, crew_document_id, expiry_date, stage, recipient_user_id, outbox_id, notified_on)
        SELECT r.company_id, (e.i ->> 'document_id')::uuid, (e.i ->> 'expiry_date')::date, e.i ->> 'stage', r.recipient, v_id, v_today
        FROM jsonb_array_elements(r.items) AS e(i)
        ON CONFLICT (crew_document_id, expiry_date, stage, recipient_user_id) DO NOTHING;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_notices := v_notices + v_count;
        v_digests := v_digests + 1;
      END IF;
    EXCEPTION WHEN others THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'crew_document_expiry_sweep: crew_document_expiring not sent (%): %', SQLSTATE, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('due', v_due, 'muted', v_muted, 'ended', v_ended, 'digests', v_digests,
                            'notices', v_notices, 'already_sent', v_already, 'failed', v_failed);
END;
$$;

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.crew_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_document_expiry_notices ENABLE ROW LEVEL SECURITY;

-- Versions read with their document's visibility (the predicate of
-- crew_documents_select_scoped: the caller's own profile or the documents
-- set, hoisted, D-229), while the document itself is not removed. No
-- browser write policy: crew_document_version_capture writes.
DROP POLICY IF EXISTS crew_document_versions_select_scoped ON public.crew_document_versions;
CREATE POLICY crew_document_versions_select_scoped ON public.crew_document_versions
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
         AND (profile_id = (SELECT public.my_profile_id())
              OR profile_id IN (SELECT public.crew_document_visible_profile_ids()))
         AND crew_document_id IN (SELECT cc.id FROM public.crew_certificates AS cc WHERE cc.deleted_at IS NULL));

-- The sweep's bookkeeping: the service role only.
DROP POLICY IF EXISTS crew_document_expiry_notices_service ON public.crew_document_expiry_notices;
CREATE POLICY crew_document_expiry_notices_service ON public.crew_document_expiry_notices
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------- grants

REVOKE ALL ON public.crew_document_versions, public.crew_document_expiry_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_document_versions TO authenticated;
GRANT ALL ON public.crew_document_versions, public.crew_document_expiry_notices TO service_role;

-- Browser RPCs.
REVOKE ALL ON FUNCTION public.crew_document_review_rights(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_review_rights(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_verify(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_verify(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_mute(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_mute(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_unmute(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_unmute(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_renew(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_renew(uuid, jsonb) TO authenticated, service_role;

-- Internal: the service role (the sweeper) and the definers only.
REVOKE ALL ON FUNCTION public.crew_document_expiry_sweep(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_expiry_sweep(date) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_expiry_due(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_expiry_due(date) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_verifiers(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_verifiers(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_verifier_check(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_verifier_check(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_verifier_on(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_verifier_on(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_mute_check(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_mute_check(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_member_role_on(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_member_role_on(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_version_capture(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_version_capture(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_expiry_stage(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_expiry_stage(integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_expiry_phrase(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_expiry_phrase(integer) TO service_role;
-- Trigger functions: no grant.
REVOKE ALL ON FUNCTION public.crew_certificates_review_notify() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_versions_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_expiry_notices_scope_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.crew_document_versions IS 'Earlier versions of a crew document (gap/04 C30; X1-05): the number, dates, issuing country and office, file and verification a renewal replaced, numbered per document under a row lock. Read with the document''s own visibility (the person, HR viewers, crew_profiles.view + crew_certificates.view on the person''s vessel) while the document is not removed; written only by crew_document_version_capture() (crew_document_renew, TR9 renewals).';
COMMENT ON TABLE public.crew_document_expiry_notices IS 'Expiry sweep bookkeeping (gap/04 W3; X1-05): recipient R was told about crew document D at stage S (window, d30, d7, expiry_day) of expiry date E, in the digest outbox row named. Service role only; written by crew_document_expiry_sweep().';
COMMENT ON FUNCTION public.crew_member_role_on(uuid, uuid) IS 'Internal: a person''s position key, rank tier and department on a vessel today, from their crew list entry there (crew_vessel_members + crew_position_for, as crew_profile_summary resolves them); no row when they are not on its crew.';
COMMENT ON FUNCTION public.crew_document_verifier_on(uuid, uuid, uuid) IS 'Internal: may the user decide the verification of the person''s documents on this vessel: ok, out_of_department (a head of department, another department) or not_permitted (no vessel.crew.crew_certificates.approve there). The Master, the Purser''s office and fleet reach decide for every department; the HoD tier only for its own.';
COMMENT ON FUNCTION public.crew_document_verifier_check(uuid, uuid) IS 'Internal (TS verifierDecision): ok, own_document, out_of_department or not_permitted for the user and the person''s documents: active, same company, no external viewer, never one''s own, crew_document_verifier_on over the person''s structural vessels.';
COMMENT ON FUNCTION public.crew_document_verifiers(uuid) IS 'Internal: the active logins of the company who may verify the person''s documents (crew_document_verifier_on ok on a vessel of the person''s structural set, reach, no external viewer, not the person), one row each with that vessel.';
COMMENT ON FUNCTION public.crew_document_mute_check(uuid, uuid) IS 'Internal: ok, own_document or not_permitted for turning a person''s document alerts off or on: active, same company, no external viewer, not one''s own, vessel.crew.expiry_alerts.edit on a vessel of the person''s structural set (T-160).';
COMMENT ON FUNCTION public.crew_document_version_capture(uuid, text, uuid) IS 'Internal: writes the crew document''s current values as its next version (numbered under a row lock on the document) and returns the number; the caller then applies the new values (crew_document_renew, crew_document_record_from_source).';
COMMENT ON FUNCTION public.crew_document_expiry_stage(integer, integer) IS 'Pure (TS expiryNoticeStage): the expiry notice stage of a document with p_days_left days to expiry and a p_window-day window: window (over 30 days, inside the window), d30, d7, expiry_day (0 to 7 days past); NULL outside.';
COMMENT ON FUNCTION public.crew_document_expiry_phrase(integer) IS 'Pure: the words for a document''s days to expiry in a notice (expires in 12 days, expires today, expired 3 days ago).';
COMMENT ON FUNCTION public.crew_document_review_rights(uuid) IS 'What the caller may do about a person''s document reviews: verify (and why not: own_document, out_of_department, not_permitted), turn alerts off or on, renew; all false for a caller who may not read the person''s documents. P0002 unknown or foreign person.';
COMMENT ON FUNCTION public.crew_document_verify(uuid, text, text) IS 'Decides a crew document''s verification (gap/04 C27, W4): verified, conditionally_approved or rejected (22023 decision_invalid); 42501 own_document / out_of_department / not_permitted (crew_document_verifier_check); a note for conditional approval and rejection (22023 note_required). Stamps reviewer, time and note under storm.crew_engine; emits crew_document_decided to the owner''s login (personal link documents; D-128). Returns the row.';
COMMENT ON FUNCTION public.crew_document_mute(uuid, text) IS 'Turns a crew document''s alerts off (gap/04 C28, T-160): vessel.crew.expiry_alerts.edit on the person''s vessel, never one''s own (42501 own_document / not_permitted); a reason (22023 reason_required). The real state stays; KPIs and the expiry sweep leave it out. Returns the row.';
COMMENT ON FUNCTION public.crew_document_unmute(uuid) IS 'Turns a crew document''s alerts back on: the gate of crew_document_mute; clears who, when and why. Returns the row.';
COMMENT ON FUNCTION public.crew_document_renew(uuid, jsonb) IS 'Renews a crew document (gap/04 C30): crew_document_may_write edit (42501); a new expiry date or the No-expiry tick (22023 field_required); the current values become the next version, the old period''s number, dates and file are cleared unless given, alerts come back on, crew_document_save applies the type''s rules and the guard resets verification; 22023 renewal_unchanged when nothing material changed. Returns the row.';
COMMENT ON FUNCTION public.crew_certificates_review_notify() IS 'Trigger AFTER INSERT / UPDATE on crew_certificates (gap/04 C27, T-139, T-163): a signed-in write that leaves a document unverified emits crew_document_review_needed to the person''s verifiers, one outbox row per person, vessel and day, linked to the document''s tab; no JWT, no notice; failures are warnings (D-128).';
COMMENT ON FUNCTION public.crew_document_expiry_due(date) IS 'Internal (crew_document_expiry_sweep): the crew documents at a notice stage on the day (the latest of each person, type and issuing country, not removed, with an expiry date), with the person''s login and name, alerts off and whether the person has a current assignment or placement.';
COMMENT ON FUNCTION public.crew_document_expiry_sweep(date) IS 'Daily expiry notices (gap/04 W3; D-232; PR-X1-K, hr-daily-sweeper; service role): window entry, 30 days, 7 days and the expiry day (7 days of catch-up), once per recipient, stage and expiry date; one digest per recipient, destination and day for the crew member (personal) and the person''s verifiers (per vessel); muted, removed and replaced documents and people without a current assignment skipped. Returns the counts.';
COMMENT ON FUNCTION public.crew_document_versions_scope_guard() IS 'Trigger: a document version carries its document''s person and company (filled; 23514 crew_document_version_scope_mismatch) and never moves to another document or number (23514 crew_document_version_locked).';
COMMENT ON FUNCTION public.crew_document_expiry_notices_scope_guard() IS 'Trigger: an expiry notice carries its document''s company (filled; 23514 crew_document_expiry_notice_scope_mismatch).';
