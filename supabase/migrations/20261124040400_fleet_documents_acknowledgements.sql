-- =================================================================
-- FLEET OPERATIONS X5-05A: fleet document acknowledgements
-- (gap/02 FD6 data, FD7 manual, FD8 data, FD9, X4, W1; DECISIONS C7,
-- D-01, D-04, D-55, D-120, D-128, D-162, D-238, D-249; X5 spec §2 X5-05A,
-- X5-05B; D-X5-04, D-X5-15, D-X5-17, D-X5-21)
-- Tables: fleet_document_acknowledgements, fleet_document_signer_rules,
--   fleet_document_reminders
-- Functions (browser): fleet_document_vessel_documents,
--   fleet_document_ack_status, fleet_document_summary,
--   fleet_document_my_pending, fleet_document_acknowledge,
--   fleet_document_acknowledge_witnessed, fleet_document_remind,
--   fleet_document_set_signer_rule; fleet_document_ack_reader_for (the RLS
--   helper of the three tables)
-- Functions (service role): fleet_document_ack_rows (the one state core),
--   fleet_document_ack_due_at, fleet_document_ack_blocked_reason,
--   fleet_document_ack_state (pure), fleet_document_vessel_pairs,
--   fleet_document_person_department, fleet_document_is_senior,
--   fleet_document_in_signer_set, fleet_document_hod_on_vessel,
--   fleet_document_file_readable (the storage read-hook predicate, PR-07)
-- Triggers: fleet_document_acknowledgements_guard,
--   fleet_document_signer_rules_guard, fleet_document_reminders_guard,
--   fleet_documents_after_publish (carry forward, notify)
-- TS mirrors: src/modules/documents/types/db.pending.ts (rows and RPCs),
--   src/modules/documents/lib/ackState.ts (the state rule; the SQL test
--   supabase/tests/sql/fleet/documents_acks.test.sql copies its table
--   between the ack-state-table markers and src/test/documents/
--   ackState.test.ts pins the copy)
-- =================================================================
--
-- Who must read and acknowledge a published fleet document (gap/02 W1):
-- one state per person x current version x targeted vessel, computed, never
-- stored. Only acknowledgements are stored (append-only), with the
-- vessel's signer rules and the reminders sent.
--
-- The state rule (fleet_document_ack_rows, the one state core that the
-- status, summary, my-pending and vessel-list RPCs and X5-09's sweep read):
--   people     the current crew of each targeted vessel (fleet_current_crew:
--              current assignments, login-less placements, planned joiners)
--              x the document's published version, for documents that need
--              an acknowledgement. A targeted vessel: 'selected' -> a target
--              vessel that is not archived or Sold; 'all_including_future' ->
--              every counted active vessel of the company (one added later
--              too), as fleet_document_visible() reads it.
--   acknowledged  an acknowledgement row for that version on that vessel
--              (self, witnessed, or carried forward from the version a minor
--              version superseded)
--   blocked    no_login (the profile has no login) | suspended (the login is
--              not active, user_is_active) | not_in_signer_set (the vessel's
--              signer rule for the type, else its rule for every type, else
--              everyone with a login)
--   overdue    now > due_at; due_at = the later of the version's publish time
--              and the person's join date on the vessel (start of the day,
--              UTC), plus the document's ack_due_days (D-X5-04). A planned
--              joiner is pending from publication and due from the join date.
--   pending    otherwise
--   not_required  history only: an acknowledgement of someone no longer on
--              the vessel's crew (or of a vessel no longer targeted), and
--              every row of a withdrawn document (read when the document is
--              asked for by id)
-- Precedence: not_required, acknowledged, blocked, overdue, pending
-- (fleet_document_ack_state, pure, mirrored by lib/ackState.ts).
--
-- Major and minor versions (D-X5-04): publishing a minor version copies the
-- acknowledgements of the version it supersedes as 'carried_forward'
-- (acknowledged_at kept); a major version starts everyone at pending. The
-- copy is done by the AFTER UPDATE trigger on fleet_documents that fires
-- when fleet_document_publish() moves current_version_id, i.e. the moment a
-- version's state becomes published (the version rows are updated first in
-- the same transaction, so the trigger sees both versions and the new
-- document state).
--
-- Readers (RLS on the three tables; the RPCs filter their rows the same way):
--   documents viewers with fleet reach (fleet_ops_can documents view, NULL
--   vessel): every row; the vessel's Master (record_is_master): that
--   vessel's rows; a head of department (fleet_hod_covers): rows of people
--   of their department on that vessel; each person: their own rows.
--   fleet_document_ack_reader_for() decides; it is active-aware (D-157).
-- No browser write policy: acknowledgements, signer rules and reminders are
-- written only by the definers below; the guard triggers refuse every other
-- write for every role (the transaction-local flag storm.fleet_tx).
--
-- Writes (D-X5-15: domain definers, no record kind):
--   fleet_document_acknowledge(version, vessel)            the caller, for
--     themselves, while pending or overdue (22023 not_required | blocked |
--     already_acknowledged)
--   fleet_document_acknowledge_witnessed(version, vessel, profile)  the
--     vessel's Master, or the person's HoD, on a shared device; records the
--     witness; allowed while pending, overdue, or blocked for no login or a
--     suspended login (the reason it exists), never for someone outside the
--     signer set
--   fleet_document_remind(document, vessel, profile) -> jsonb  documents
--     editors any vessel; the Master their vessel; a HoD their department;
--     one reminder per person per document per 24 hours (any kind), the
--     rest counted as skipped; one guarded emit per vessel; logged
--   fleet_document_set_signer_rule(vessel, type, rule, positions, people)
--     documents admins, or the vessel's Master; NULL rule clears it
--
-- Notifications (D-128, D-162, D-238, D-249): every emit is in its own
-- BEGIN ... EXCEPTION block, so a missing type or a fan-out problem never
-- rolls back the publish, the acknowledgement or the reminder. Publish:
-- one fleet_document_published per targeted vessel with that vessel's
-- pending people's logins as must-act users (link_scope vessel, path
-- safety/fleet-documents?doc=<document_id>, module safety, dedupe
-- fdp:<version>:<vessel>). Remind: one fleet_document_ack_reminder per
-- vessel. In-app only: nothing here sends or promises an email (D-249).
-- The due-soon, overdue and digest types are X5-09's sweep.
--
-- Files (D-X5-17, PR-07): fleet_document_file_readable(user, document) is
-- the predicate the storage read hook (storage_path_read_hooks(),
-- 20261123020300) asks for <company>/fleet/documents/fleet_document/<id>/…:
-- library editors (any state), library readers (non-drafts) and the people
-- a published document is visible to (fleet_document_visible). The hook
-- passes the document, not the file: those people could open any file
-- stored for the document if they knew its path, but RLS shows them only
-- the published version's path (fleet_document_versions).
--
-- Nothing here is live (D-01): the client reads through the pending shim
-- and shows "Acknowledgements are not set up yet" while it is missing.
-- Applying it changes nothing users see today: no live table, policy or
-- function is touched; it adds a trigger to fleet_documents (040300, not
-- live either).
--
-- Idempotent (D-12, D-55): tables IF NOT EXISTS, CHECKs dropped and added,
-- indexes IF NOT EXISTS, policies and triggers dropped and created,
-- functions CREATE OR REPLACE.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.fleet_documents') IS NULL OR to_regclass('public.fleet_document_versions') IS NULL
     OR to_regprocedure('public.fleet_document_visible(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040400_fleet_documents_acknowledgements needs the fleet document library: apply 20261124040300_fleet_documents_library.sql first';
  END IF;
  IF to_regprocedure('public.fleet_current_crew(uuid[])') IS NULL OR to_regprocedure('public.fleet_hod_covers(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040400_fleet_documents_acknowledgements needs the fleet access helpers: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL OR to_regprocedure('public.record_normalise_office(text)') IS NULL
     OR to_regprocedure('public.record_user_is_external(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040400_fleet_documents_acknowledgements needs the record engine helpers: apply 20261123020000 and 20261123020100 first';
  END IF;
  IF to_regprocedure('public.emit_notification_event(text,uuid,text,text,uuid,text,text,text,text,text,uuid,text,uuid,uuid[],text[],jsonb,text,text)') IS NULL
     OR to_regprocedure('public.storage_path_read_hooks()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040400_fleet_documents_acknowledgements needs the notification outbox and the storage read hooks: apply 20261123030000 and 20261123020300 first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- fleet_document_acknowledgements (FD6, FD9)

-- One acknowledgement per person x version x vessel. Append-only (no
-- updated_at: the guard refuses every update). The subject is the profile
-- (most crew have no login); user_id is the subject's own login when they
-- signed it themselves (self; copied for carried_forward), NULL for a
-- witnessed one; recorded_by is the login that made the call (the person,
-- the witness, or the publisher of a minor version). A witness's profile is
-- kept while their witnessed rows exist (NO ACTION).
CREATE TABLE IF NOT EXISTS public.fleet_document_acknowledgements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  user_id uuid NULL,
  method text NOT NULL,
  witnessed_by_profile_id uuid NULL,
  carried_from_version_id uuid NULL,
  recorded_by uuid NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  request_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_document_acknowledgements_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_document_acknowledgements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_acknowledgements_document_fkey FOREIGN KEY (document_id, company_id) REFERENCES public.fleet_documents (id, company_id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_acknowledgements_version_fkey FOREIGN KEY (version_id, document_id) REFERENCES public.fleet_document_versions (id, document_id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_acknowledgements_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_acknowledgements_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_acknowledgements_witness_fkey FOREIGN KEY (witnessed_by_profile_id) REFERENCES public.profiles(id),
  CONSTRAINT fleet_document_acknowledgements_carried_from_fkey FOREIGN KEY (carried_from_version_id) REFERENCES public.fleet_document_versions(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_acknowledgements_person_key UNIQUE (version_id, vessel_id, profile_id)
);

ALTER TABLE public.fleet_document_acknowledgements
  DROP CONSTRAINT IF EXISTS fleet_document_acknowledgements_method_check,
  ADD CONSTRAINT fleet_document_acknowledgements_method_check CHECK (method IN ('self', 'witnessed', 'carried_forward')),
  -- A witnessed acknowledgement names its witness, and the witness is not the subject.
  DROP CONSTRAINT IF EXISTS fleet_document_acknowledgements_witness_check,
  ADD CONSTRAINT fleet_document_acknowledgements_witness_check CHECK (
    (method <> 'witnessed' OR witnessed_by_profile_id IS NOT NULL)
    AND (witnessed_by_profile_id IS NULL OR witnessed_by_profile_id <> profile_id)),
  -- A self acknowledgement is signed by a login; a carried one names its source version.
  DROP CONSTRAINT IF EXISTS fleet_document_acknowledgements_signer_check,
  ADD CONSTRAINT fleet_document_acknowledgements_signer_check CHECK (
    (method <> 'self' OR user_id IS NOT NULL)
    AND ((method = 'carried_forward') = (carried_from_version_id IS NOT NULL))
    AND (carried_from_version_id IS NULL OR carried_from_version_id <> version_id)),
  DROP CONSTRAINT IF EXISTS fleet_document_acknowledgements_request_meta_check,
  ADD CONSTRAINT fleet_document_acknowledgements_request_meta_check CHECK (jsonb_typeof(request_meta) = 'object' AND length(request_meta::text) <= 2000);

CREATE INDEX IF NOT EXISTS idx_fleet_document_acks_document ON public.fleet_document_acknowledgements (document_id, vessel_id);
CREATE INDEX IF NOT EXISTS idx_fleet_document_acks_profile ON public.fleet_document_acknowledgements (profile_id);
CREATE INDEX IF NOT EXISTS idx_fleet_document_acks_company ON public.fleet_document_acknowledgements (company_id, vessel_id);

-- ---------------------------------------------------------------- fleet_document_signer_rules (FD8)

-- Who can sign a vessel's fleet documents: one rule per vessel and document
-- type, plus one for every type (type_id NULL); without a rule everyone
-- with a login signs. A deleted type or vessel takes its rules with it.
CREATE TABLE IF NOT EXISTS public.fleet_document_signer_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  type_id uuid NULL,
  rule text NOT NULL,
  positions text[] NOT NULL DEFAULT '{}'::text[],
  profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_document_signer_rules_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_document_signer_rules_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_signer_rules_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_signer_rules_type_fkey FOREIGN KEY (type_id, company_id) REFERENCES public.fleet_document_types (id, company_id) ON DELETE CASCADE
);

ALTER TABLE public.fleet_document_signer_rules
  DROP CONSTRAINT IF EXISTS fleet_document_signer_rules_rule_check,
  ADD CONSTRAINT fleet_document_signer_rules_rule_check CHECK (rule IN ('all_crew_with_login', 'hod_and_above', 'positions', 'named_people')),
  -- Positions only for 'positions' (1-100), people only for 'named_people' (1-500).
  DROP CONSTRAINT IF EXISTS fleet_document_signer_rules_lists_check,
  ADD CONSTRAINT fleet_document_signer_rules_lists_check CHECK (
    (CASE WHEN rule = 'positions' THEN cardinality(positions) BETWEEN 1 AND 100 ELSE cardinality(positions) = 0 END)
    AND (CASE WHEN rule = 'named_people' THEN cardinality(profile_ids) BETWEEN 1 AND 500 ELSE cardinality(profile_ids) = 0 END));

CREATE UNIQUE INDEX IF NOT EXISTS fleet_document_signer_rules_type_key ON public.fleet_document_signer_rules (vessel_id, type_id) WHERE type_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_document_signer_rules_all_types_key ON public.fleet_document_signer_rules (vessel_id) WHERE type_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_document_signer_rules_company ON public.fleet_document_signer_rules (company_id);

-- ---------------------------------------------------------------- fleet_document_reminders (FD7)

-- The reminders sent (manual from fleet_document_remind; due_soon, overdue
-- and digest from X5-09's sweep): who sent it, to how many, how many were
-- skipped by the 24-hour rule, and the profiles reminded (the rate limit
-- reads them). vessel_id NULL: every targeted vessel; profile_id NULL:
-- everyone outstanding. Append-only.
CREATE TABLE IF NOT EXISTS public.fleet_document_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  document_id uuid NOT NULL,
  vessel_id uuid NULL,
  profile_id uuid NULL,
  kind text NOT NULL,
  sent_by uuid NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  recipient_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_document_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_document_reminders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_reminders_document_fkey FOREIGN KEY (document_id, company_id) REFERENCES public.fleet_documents (id, company_id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_reminders_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_reminders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE public.fleet_document_reminders
  DROP CONSTRAINT IF EXISTS fleet_document_reminders_kind_check,
  ADD CONSTRAINT fleet_document_reminders_kind_check CHECK (kind IN ('manual', 'due_soon', 'overdue', 'digest')),
  DROP CONSTRAINT IF EXISTS fleet_document_reminders_counts_check,
  ADD CONSTRAINT fleet_document_reminders_counts_check CHECK (
    recipient_count >= 0 AND skipped_count >= 0 AND recipient_count = cardinality(recipient_profile_ids)),
  -- A manual reminder names its sender.
  DROP CONSTRAINT IF EXISTS fleet_document_reminders_sender_check,
  ADD CONSTRAINT fleet_document_reminders_sender_check CHECK (kind <> 'manual' OR sent_by IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_fleet_document_reminders_document ON public.fleet_document_reminders (document_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_document_reminders_company ON public.fleet_document_reminders (company_id, sent_at DESC);

-- ---------------------------------------------------------------- guards (every role)

-- Acknowledgements: inserted only by the definers (storm.fleet_tx), with a
-- vessel, subject and witness of the row's company; never updated; deleted
-- only by a referential cascade (the company, document, vessel or profile
-- deleted).
CREATE OR REPLACE FUNCTION public.fleet_document_acknowledgements_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_acknowledgements_guarded', DETAIL = 'An acknowledgement is kept.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_acknowledgements_guarded', DETAIL = 'An acknowledgement never changes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = NEW.profile_id AND p.company_id = NEW.company_id)
     OR (NEW.witnessed_by_profile_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = NEW.witnessed_by_profile_id AND p.company_id = NEW.company_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_acknowledgements_guarded', DETAIL = 'The vessel, the person and the witness belong to the document''s company.';
  END IF;
  IF current_setting('storm.fleet_tx', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_acknowledgements_guarded', DETAIL = 'Acknowledgements are written only by the fleet document definers.';
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_document_acknowledgements_guard ON public.fleet_document_acknowledgements;
CREATE TRIGGER trg_fleet_document_acknowledgements_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_document_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.fleet_document_acknowledgements_guard();

-- Signer rules: written only by fleet_document_set_signer_rule (a
-- referential cascade excepted); the vessel is of the row's company.
CREATE OR REPLACE FUNCTION public.fleet_document_signer_rules_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
                           OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id OR NEW.type_id IS DISTINCT FROM OLD.type_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_signer_rules_guarded', DETAIL = 'A signer rule never changes its vessel or document type.';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_signer_rules_guarded', DETAIL = 'A signer rule''s vessel belongs to its company.';
  END IF;
  IF current_setting('storm.fleet_tx', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_signer_rules_guarded', DETAIL = 'Only fleet_document_set_signer_rule() changes who can sign.';
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_document_signer_rules_guard ON public.fleet_document_signer_rules;
CREATE TRIGGER trg_fleet_document_signer_rules_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_document_signer_rules
  FOR EACH ROW EXECUTE FUNCTION public.fleet_document_signer_rules_guard();

DROP TRIGGER IF EXISTS trg_fleet_document_signer_rules_updated_at ON public.fleet_document_signer_rules;
CREATE TRIGGER trg_fleet_document_signer_rules_updated_at
  BEFORE UPDATE ON public.fleet_document_signer_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reminders: inserted only by the definers; never updated or deleted (a
-- referential cascade excepted).
CREATE OR REPLACE FUNCTION public.fleet_document_reminders_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_reminders_guarded', DETAIL = 'A reminder''s vessel belongs to its company.';
    END IF;
    IF current_setting('storm.fleet_tx', true) = 'on' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_reminders_guarded', DETAIL = 'Reminders are logged only by the fleet document definers.';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_reminders_guarded', DETAIL = 'The reminder log is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_document_reminders_guard ON public.fleet_document_reminders;
CREATE TRIGGER trg_fleet_document_reminders_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_document_reminders
  FOR EACH ROW EXECUTE FUNCTION public.fleet_document_reminders_guard();

-- ---------------------------------------------------------------- the state rule (pure; lib/ackState.ts mirrors it)

-- due_at: the later of the version's publish time and the person's join
-- date (00:00 UTC that day), plus the document's days (UTC day arithmetic,
-- so the answer never depends on the session's time zone).
CREATE OR REPLACE FUNCTION public.fleet_document_ack_due_at(p_published_at timestamptz, p_join_date date, p_due_days integer)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_published_at IS NULL OR p_due_days IS NULL THEN NULL
    ELSE ((greatest(p_published_at, (p_join_date::timestamp AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC') + make_interval(days => p_due_days)) AT TIME ZONE 'UTC'
  END
$$;

-- Why a person cannot sign, first reason first: no login, a login that is
-- not active, outside the vessel's signer set. NULL: they can sign.
CREATE OR REPLACE FUNCTION public.fleet_document_ack_blocked_reason(p_has_login boolean, p_active boolean, p_in_signer_set boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT coalesce(p_has_login, false) THEN 'no_login'
    WHEN NOT coalesce(p_active, false) THEN 'suspended'
    WHEN NOT coalesce(p_in_signer_set, false) THEN 'not_in_signer_set'
  END
$$;

-- The state of one person x version x vessel (see the header).
CREATE OR REPLACE FUNCTION public.fleet_document_ack_state(
  p_document_status text,
  p_on_crew boolean,
  p_acknowledged boolean,
  p_has_login boolean,
  p_active boolean,
  p_in_signer_set boolean,
  p_due_at timestamptz,
  p_now timestamptz
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_document_status IS DISTINCT FROM 'published' OR NOT coalesce(p_on_crew, false) THEN 'not_required'
    WHEN coalesce(p_acknowledged, false) THEN 'acknowledged'
    WHEN public.fleet_document_ack_blocked_reason(p_has_login, p_active, p_in_signer_set) IS NOT NULL THEN 'blocked'
    WHEN p_due_at IS NOT NULL AND p_now IS NOT NULL AND p_now > p_due_at THEN 'overdue'
    ELSE 'pending'
  END
$$;

-- ---------------------------------------------------------------- internal helpers (service role)

-- The (document, vessel) pairs the company's published and withdrawn
-- documents that need an acknowledgement target, limited to _vessel_ids
-- when given: 'selected' -> a target vessel not archived or Sold;
-- 'all_including_future' -> every counted active vessel (also one added
-- after publishing). The same reading as fleet_document_visible().
CREATE OR REPLACE FUNCTION public.fleet_document_vessel_pairs(_company_id uuid, _document_id uuid, _vessel_ids uuid[])
RETURNS TABLE (document_id uuid, vessel_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, ve.id
  FROM public.fleet_documents AS d
  JOIN public.vessels AS ve ON ve.company_id = d.company_id
  WHERE d.company_id = _company_id
    AND d.status IN ('published', 'withdrawn')
    AND (_document_id IS NULL OR d.id = _document_id)
    AND (_vessel_ids IS NULL OR ve.id = ANY (_vessel_ids))
    AND public.vessel_in_reachable_state(ve.lifecycle_status, ve.status)
    AND CASE d.target_mode
          WHEN 'all_including_future' THEN ve.is_counted AND ve.lifecycle_status = 'active'
          ELSE EXISTS (SELECT 1 FROM public.fleet_document_vessel_targets AS t WHERE t.document_id = d.id AND t.vessel_id = ve.id)
        END
$$;

-- A person's department on a vessel, as fleet_current_crew() reads it: the
-- current assignment's (else, for someone who left, their latest assignment
-- there), else the profile's. NULL when none is set.
CREATE OR REPLACE FUNCTION public.fleet_document_person_department(_profile_id uuid, _vessel_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT nullif(btrim(ca.department), '')
       FROM public.crew_assignments AS ca
       JOIN public.profiles AS p ON p.user_id = ca.user_id
      WHERE p.id = _profile_id AND ca.vessel_id = _vessel_id
      ORDER BY (ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)) DESC,
               coalesce(ca.join_date, ca.start_date) DESC NULLS LAST
      LIMIT 1),
    (SELECT nullif(btrim(p.department), '') FROM public.profiles AS p WHERE p.id = _profile_id))
$$;

-- Whether _user_id is a head of department on the vessel, for any
-- department: fleet_hod_covers()'s rule without the department match.
CREATE OR REPLACE FUNCTION public.fleet_document_hod_on_vessel(_user_id uuid, _vessel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF _user_id IS NULL OR _vessel_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = _vessel_id;
  IF v_company IS NULL
     OR NOT coalesce(public.user_is_active(_user_id), false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = v_company)
     OR public.record_user_is_external(_user_id, v_company)
     OR NOT (coalesce(public.reach_vessel_for(_user_id, _vessel_id), false) OR coalesce(public.fleet_reach_for(_user_id, v_company), false)) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = 'hod'
      AND coalesce(ur.is_active, false)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND (ur.company_id IS NULL OR ur.company_id = v_company)
      AND (ur.vessel_id = _vessel_id OR (ur.vessel_id IS NULL AND ur.company_id = v_company)));
END;
$$;

-- Whether a crew member counts as head of department or above for the
-- 'hod_and_above' signer rule: the Master by office (position or rank
-- master / captain) or a senior office (chief officer / mate, chief
-- engineer, purser, chief steward(ess)); a legacy profile role master /
-- chief officer / chief engineer; an active user_roles row (captain, hod,
-- purser, chief officer, chief engineer, fleet master) on the vessel or
-- company-wide; or, once the crew position catalogue exists (X1's
-- 20261124060100, D-X5-10: guarded EXECUTE on the agreed names), a
-- position of rank tier command or hod.
CREATE OR REPLACE FUNCTION public.fleet_document_is_senior(_vessel_id uuid, _profile_id uuid, _user_id uuid, _position text, _rank text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_offices text[] := ARRAY[public.record_normalise_office(_position), public.record_normalise_office(_rank)];
  v_tier boolean := false;
BEGIN
  IF _vessel_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = _vessel_id;
  IF v_company IS NULL THEN
    RETURN false;
  END IF;
  IF v_offices && ARRAY['master', 'captain', 'chief_officer', 'chief_mate', 'chief_engineer', 'purser', 'chief_stewardess', 'chief_steward'] THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles AS p
             WHERE p.id = _profile_id AND p.company_id = v_company AND p.role::text IN ('master', 'chief_officer', 'chief_engineer')) THEN
    RETURN true;
  END IF;
  IF _user_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.user_roles AS ur
       WHERE ur.user_id = _user_id
         AND ur.role::text IN ('captain', 'hod', 'purser', 'chief_officer', 'chief_engineer', 'fleet_master')
         AND coalesce(ur.is_active, false)
         AND (ur.expires_at IS NULL OR ur.expires_at > now())
         AND (ur.company_id IS NULL OR ur.company_id = v_company)
         AND (ur.vessel_id = _vessel_id OR (ur.vessel_id IS NULL AND ur.company_id = v_company))) THEN
    RETURN true;
  END IF;
  IF to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NOT NULL AND to_regclass('public.positions') IS NOT NULL
     AND coalesce(nullif(btrim(coalesce(_position, '')), ''), nullif(btrim(coalesce(_rank, '')), '')) IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.positions AS p WHERE p.id = public.crew_position_for($1, $2, $3) AND p.rank_tier IN (''command'', ''hod''))'
      INTO v_tier
      USING v_company, _vessel_id, coalesce(nullif(btrim(coalesce(_position, '')), ''), _rank);
  END IF;
  RETURN coalesce(v_tier, false);
END;
$$;

-- Whether a crew member is in the vessel's signer set for a document type:
-- the vessel's rule for the type, else its rule for every type, else
-- everyone ('all_crew_with_login'; a missing login is its own blocked
-- reason). 'positions' compares normalised office names with the person's
-- position or rank; 'named_people' lists profiles.
CREATE OR REPLACE FUNCTION public.fleet_document_in_signer_set(_vessel_id uuid, _type_id uuid, _profile_id uuid, _user_id uuid, _position text, _rank text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT sr.rule, sr.positions, sr.profile_ids INTO r
  FROM public.fleet_document_signer_rules AS sr
  WHERE sr.vessel_id = _vessel_id AND (sr.type_id = _type_id OR sr.type_id IS NULL)
  ORDER BY (sr.type_id IS NULL)
  LIMIT 1;
  IF NOT FOUND OR r.rule = 'all_crew_with_login' THEN
    RETURN true;
  END IF;
  IF r.rule = 'named_people' THEN
    RETURN _profile_id = ANY (r.profile_ids);
  END IF;
  IF r.rule = 'positions' THEN
    RETURN EXISTS (
      SELECT 1 FROM unnest(r.positions) AS x(p)
      WHERE public.record_normalise_office(x.p) IS NOT NULL
        AND public.record_normalise_office(x.p) IN (public.record_normalise_office(_position), public.record_normalise_office(_rank)));
  END IF;
  RETURN coalesce(public.fleet_document_is_senior(_vessel_id, _profile_id, _user_id, _position, _rank), false);
END;
$$;

-- The one acknowledgement state core (D-X5-04; spec critic change 13). One
-- row per person x current version x targeted vessel for the company's
-- published documents that need an acknowledgement (withdrawn ones too when
-- _document_id names one), limited to _document_id / _vessel_ids when
-- given, at _now. History rows (state not_required): acknowledgements of
-- the current version by people no longer on that vessel's crew. No caller
-- check: the browser RPCs below filter the rows to the caller's readership.
CREATE OR REPLACE FUNCTION public.fleet_document_ack_rows(_company_id uuid, _document_id uuid, _vessel_ids uuid[], _now timestamptz)
RETURNS TABLE (
  document_id uuid,
  version_id uuid,
  vessel_id uuid,
  profile_id uuid,
  user_id uuid,
  person_name text,
  "position" text,
  department text,
  has_login boolean,
  on_crew boolean,
  is_planned boolean,
  join_date date,
  state text,
  due_at timestamptz,
  blocked_reason text,
  acknowledged_at timestamptz,
  method text,
  witnessed_by_profile_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_now timestamptz := coalesce(_now, now());
  v_vessels uuid[];
BEGIN
  IF _company_id IS NULL THEN
    RETURN;
  END IF;
  v_vessels := ARRAY(
    SELECT DISTINCT pr.vessel_id
    FROM public.fleet_document_vessel_pairs(_company_id, _document_id, _vessel_ids) AS pr
    JOIN public.fleet_documents AS d ON d.id = pr.document_id
    WHERE d.ack_required AND (d.status = 'published' OR _document_id IS NOT NULL));

  RETURN QUERY
  WITH docs AS (
    SELECT d.id, d.type_id, d.status, d.ack_due_days, d.current_version_id, ver.published_at
    FROM public.fleet_documents AS d
    JOIN public.fleet_document_versions AS ver ON ver.id = d.current_version_id AND ver.document_id = d.id
    WHERE d.company_id = _company_id
      AND d.ack_required
      AND (d.status = 'published' OR (d.status = 'withdrawn' AND _document_id IS NOT NULL))
      AND (_document_id IS NULL OR d.id = _document_id)
  ),
  pairs AS (
    SELECT pr.document_id, pr.vessel_id
    FROM public.fleet_document_vessel_pairs(_company_id, _document_id, _vessel_ids) AS pr
    WHERE pr.document_id IN (SELECT docs.id FROM docs)
  ),
  crew AS (
    SELECT DISTINCT ON (c.vessel_id, c.profile_id) c.vessel_id, c.profile_id, c.user_id, c."position", c.rank, c.department, c.join_date, c.is_planned
    FROM public.fleet_current_crew(v_vessels) AS c
    ORDER BY c.vessel_id, c.profile_id, c.is_planned, c.join_date DESC NULLS LAST
  ),
  people AS (
    SELECT d.id AS document_id, d.current_version_id AS version_id, pa.vessel_id, c.profile_id, c.user_id, c."position", c.rank,
           c.department, c.join_date, c.is_planned, d.status, d.type_id,
           public.fleet_document_ack_due_at(d.published_at, c.join_date, d.ack_due_days) AS due_at
    FROM pairs AS pa
    JOIN docs AS d ON d.id = pa.document_id
    JOIN crew AS c ON c.vessel_id = pa.vessel_id
  ),
  current_rows AS (
    SELECT pe.*, a.acknowledged_at, a.method, a.witnessed_by_profile_id, (a.id IS NOT NULL) AS acknowledged,
           (pe.user_id IS NOT NULL) AS has_login,
           (pe.user_id IS NOT NULL AND coalesce(public.user_is_active(pe.user_id), false)) AS active
    FROM people AS pe
    LEFT JOIN public.fleet_document_acknowledgements AS a
      ON a.version_id = pe.version_id AND a.vessel_id = pe.vessel_id AND a.profile_id = pe.profile_id
  ),
  judged AS (
    SELECT cr.*,
           CASE WHEN cr.acknowledged OR NOT cr.has_login OR NOT cr.active THEN true
                ELSE coalesce(public.fleet_document_in_signer_set(cr.vessel_id, cr.type_id, cr.profile_id, cr.user_id, cr."position", cr.rank), false)
           END AS in_set
    FROM current_rows AS cr
  )
  SELECT j.document_id, j.version_id, j.vessel_id, j.profile_id, j.user_id,
         nullif(btrim(concat_ws(' ', pf.first_name, pf.last_name)), ''),
         j."position", j.department, j.has_login, true, j.is_planned, j.join_date,
         public.fleet_document_ack_state(j.status, true, j.acknowledged, j.has_login, j.active, j.in_set, j.due_at, v_now),
         j.due_at,
         CASE WHEN j.acknowledged OR j.status <> 'published' THEN NULL
              ELSE public.fleet_document_ack_blocked_reason(j.has_login, j.active, j.in_set) END,
         j.acknowledged_at, j.method, j.witnessed_by_profile_id
  FROM judged AS j
  JOIN public.profiles AS pf ON pf.id = j.profile_id
  UNION ALL
  SELECT a.document_id, a.version_id, a.vessel_id, a.profile_id, a.user_id,
         nullif(btrim(concat_ws(' ', pf.first_name, pf.last_name)), ''),
         coalesce(nullif(btrim(pf."position"), ''), nullif(btrim(pf.rank), '')), public.fleet_document_person_department(a.profile_id, a.vessel_id),
         (pf.user_id IS NOT NULL), false, false, NULL::date,
         'not_required', NULL::timestamptz, NULL::text,
         a.acknowledged_at, a.method, a.witnessed_by_profile_id
  FROM public.fleet_document_acknowledgements AS a
  JOIN docs AS d ON d.id = a.document_id AND d.current_version_id = a.version_id
  JOIN public.profiles AS pf ON pf.id = a.profile_id
  WHERE a.company_id = _company_id
    AND (_vessel_ids IS NULL OR a.vessel_id = ANY (_vessel_ids))
    AND NOT EXISTS (SELECT 1 FROM people AS pe WHERE pe.document_id = a.document_id AND pe.vessel_id = a.vessel_id AND pe.profile_id = a.profile_id);
END;
$$;

-- ---------------------------------------------------------------- readership (RLS helper; browser executes it inside the policies)

-- Whether _user_id may read acknowledgement data of the vessel (and of the
-- person, when _profile_id is given): an active member of the vessel's
-- company who is a documents viewer with fleet reach; with a vessel, the
-- person themselves, the vessel's Master, or a head of department covering
-- the person's department (any HoD of the vessel when no person is named).
-- A signed-in caller asks only about themselves; NULL ids: false. The
-- policies call it with auth.uid().
CREATE OR REPLACE FUNCTION public.fleet_document_ack_reader_for(_user_id uuid, _vessel_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF _user_id IS NULL OR (v_uid IS NOT NULL AND v_uid IS DISTINCT FROM _user_id) THEN
    RETURN false;
  END IF;
  IF NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.user_id = _user_id;
  IF v_company IS NULL THEN
    RETURN false;
  END IF;
  IF _vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = _vessel_id AND v.company_id = v_company) THEN
    RETURN false;
  END IF;
  IF coalesce(public.fleet_ops_can_for(_user_id, v_company, NULL, 'documents', 'view'), false) THEN
    RETURN true;
  END IF;
  IF _vessel_id IS NULL THEN
    RETURN false;
  END IF;
  IF _profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = _profile_id AND p.user_id = _user_id) THEN
    RETURN true;
  END IF;
  IF coalesce(public.record_is_master(_user_id, _vessel_id), false) THEN
    RETURN true;
  END IF;
  IF _profile_id IS NULL THEN
    RETURN coalesce(public.fleet_document_hod_on_vessel(_user_id, _vessel_id), false);
  END IF;
  RETURN coalesce(public.fleet_hod_covers(_user_id, _vessel_id, public.fleet_document_person_department(_profile_id, _vessel_id)), false);
END;
$$;

-- ---------------------------------------------------------------- storage read-hook predicate (PR-07; D-X5-17)

-- Whether _user_id may read the files stored for the fleet document
-- (storage_path_read_hooks(): documents / fleet_document, path segment 5):
-- library editors in every state, library readers when it is not a draft,
-- and the people a published document is visible to through a vessel it
-- targets. Inactive users, unknown documents: false. Service only: the
-- storage gate (a definer) calls it.
CREATE OR REPLACE FUNCTION public.fleet_document_file_readable(p_user_id uuid, p_document_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
BEGIN
  IF p_user_id IS NULL OR p_document_id IS NULL OR NOT coalesce(public.user_is_active(p_user_id), false) THEN
    RETURN false;
  END IF;
  SELECT fd.company_id, fd.status INTO d FROM public.fleet_documents AS fd WHERE fd.id = p_document_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF coalesce(public.fleet_ops_can_for(p_user_id, d.company_id, NULL, 'documents', 'edit'), false) THEN
    RETURN true;
  END IF;
  IF d.status <> 'draft' AND coalesce(public.fleet_ops_can_for(p_user_id, d.company_id, NULL, 'documents', 'view'), false) THEN
    RETURN true;
  END IF;
  RETURN coalesce(public.fleet_document_visible(p_user_id, p_document_id), false);
END;
$$;

-- ---------------------------------------------------------------- RLS (read only)

ALTER TABLE public.fleet_document_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_document_signer_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_document_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_document_acknowledgements_select ON public.fleet_document_acknowledgements;
CREATE POLICY fleet_document_acknowledgements_select ON public.fleet_document_acknowledgements
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND public.fleet_document_ack_reader_for(auth.uid(), vessel_id, profile_id)
  );

DROP POLICY IF EXISTS fleet_document_signer_rules_select ON public.fleet_document_signer_rules;
CREATE POLICY fleet_document_signer_rules_select ON public.fleet_document_signer_rules
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND public.fleet_document_ack_reader_for(auth.uid(), vessel_id, NULL)
  );

DROP POLICY IF EXISTS fleet_document_reminders_select ON public.fleet_document_reminders;
CREATE POLICY fleet_document_reminders_select ON public.fleet_document_reminders
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND public.fleet_document_ack_reader_for(auth.uid(), vessel_id, profile_id)
  );

REVOKE ALL ON public.fleet_document_acknowledgements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_document_signer_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_document_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_document_acknowledgements, public.fleet_document_signer_rules, public.fleet_document_reminders TO authenticated;
GRANT ALL ON public.fleet_document_acknowledgements, public.fleet_document_signer_rules, public.fleet_document_reminders TO service_role;

-- ---------------------------------------------------------------- browser reads

-- The documents published to one vessel (FD9; the vessel Safety › Fleet
-- documents page), grouped by section and type, each with its published
-- version (label, kind, dates, what changed, the file to open) and the
-- caller's own acknowledgement state on that vessel: state, due date,
-- blocked reason, when and how acknowledged; NULL state when the caller is
-- not on the vessel's crew (caller_on_crew says which) or the document
-- needs no acknowledgement. The caller must be an active member of the
-- vessel's company who reaches it (reach or fleet reach), else 42501
-- vessel_out_of_reach (an archived or Sold vessel included).
CREATE OR REPLACE FUNCTION public.fleet_document_vessel_documents(p_vessel_id uuid)
RETURNS TABLE (
  document_id uuid,
  section_id uuid,
  section_name text,
  section_order integer,
  type_id uuid,
  type_name text,
  type_order integer,
  title text,
  description text,
  ack_required boolean,
  ack_due_days integer,
  version_id uuid,
  version_no integer,
  version_label text,
  version_kind text,
  effective_date date,
  published_at timestamptz,
  change_summary text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  caller_on_crew boolean,
  state text,
  due_at timestamptz,
  blocked_reason text,
  acknowledged_at timestamptz,
  method text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_me uuid;
  v_on_crew boolean;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL OR p_vessel_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = v_company
                      AND public.vessel_in_reachable_state(v.lifecycle_status, v.status))
     OR NOT (coalesce(public.reach_vessel_for(v_uid, p_vessel_id), false) OR coalesce(public.fleet_reach_for(v_uid, v_company), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
  END IF;
  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = v_uid AND p.company_id = v_company;
  v_on_crew := EXISTS (SELECT 1 FROM public.fleet_current_crew(ARRAY[p_vessel_id]) AS c WHERE c.profile_id = v_me);

  RETURN QUERY
  WITH mine AS (
    SELECT r.document_id, r.state, r.due_at, r.blocked_reason, r.acknowledged_at, r.method
    FROM public.fleet_document_ack_rows(v_company, NULL, ARRAY[p_vessel_id], now()) AS r
    WHERE r.profile_id = v_me AND r.on_crew
  )
  SELECT d.id, s.id, s.name, s.sort_order, t.id, t.name, t.sort_order, d.title, d.description, d.ack_required, d.ack_due_days,
         ver.id, ver.version_no, ver.version_label, ver.version_kind, ver.effective_date, ver.published_at, ver.change_summary,
         ver.file_name, ver.mime_type, ver.size_bytes, ver.storage_path,
         v_on_crew, m.state, m.due_at, m.blocked_reason, m.acknowledged_at, m.method
  FROM public.fleet_document_vessel_pairs(v_company, NULL, ARRAY[p_vessel_id]) AS pr
  JOIN public.fleet_documents AS d ON d.id = pr.document_id AND d.status = 'published'
  JOIN public.fleet_document_versions AS ver ON ver.id = d.current_version_id AND ver.document_id = d.id AND ver.state = 'published'
  JOIN public.fleet_document_types AS t ON t.id = d.type_id
  JOIN public.fleet_document_sections AS s ON s.id = t.section_id
  LEFT JOIN mine AS m ON m.document_id = d.id
  ORDER BY s.sort_order, lower(s.name), t.sort_order, lower(t.name), lower(d.title), d.id;
END;
$$;

-- Acknowledgement rows (FD6) for one document (NULL: every published
-- document) and the vessels given (NULL: every vessel the rows cover),
-- filtered to the caller's readership (see the header). Explicit vessels
-- must be of the caller's company and reached (42501 vessel_out_of_reach);
-- an unknown or foreign document is P0002 document_not_found.
CREATE OR REPLACE FUNCTION public.fleet_document_ack_status(p_document_id uuid DEFAULT NULL, p_vessel_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  document_id uuid,
  version_id uuid,
  vessel_id uuid,
  profile_id uuid,
  person_name text,
  "position" text,
  department text,
  has_login boolean,
  on_crew boolean,
  is_planned boolean,
  join_date date,
  state text,
  due_at timestamptz,
  blocked_reason text,
  acknowledged_at timestamptz,
  method text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_me uuid;
  v_fleet boolean;
  v_id uuid;
  v_vessels uuid[];
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fleet_documents AS d WHERE d.id = p_document_id AND d.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found';
  END IF;
  v_fleet := coalesce(public.fleet_ops_can_for(v_uid, v_company, NULL, 'documents', 'view'), false);
  IF p_vessel_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY array_remove(p_vessel_ids, NULL) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = v_id AND v.company_id = v_company)
         OR NOT (coalesce(public.reach_vessel_for(v_uid, v_id), false) OR coalesce(public.fleet_reach_for(v_uid, v_company), false)) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
      END IF;
    END LOOP;
    v_vessels := array_remove(p_vessel_ids, NULL);
  ELSIF NOT v_fleet THEN
    -- Not a library reader: only vessels the caller reaches can hold their rows.
    v_vessels := ARRAY(SELECT v.id FROM public.vessels AS v WHERE v.company_id = v_company AND coalesce(public.reach_vessel_for(v_uid, v.id), false));
  END IF;
  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = v_uid AND p.company_id = v_company;

  RETURN QUERY
  SELECT r.document_id, r.version_id, r.vessel_id, r.profile_id, r.person_name, r."position", r.department, r.has_login, r.on_crew,
         r.is_planned, r.join_date, r.state, r.due_at, r.blocked_reason, r.acknowledged_at, r.method
  FROM public.fleet_document_ack_rows(v_company, p_document_id, v_vessels, now()) AS r
  WHERE v_fleet
     OR r.profile_id = v_me
     OR coalesce(public.record_is_master(v_uid, r.vessel_id), false)
     OR coalesce(public.fleet_hod_covers(v_uid, r.vessel_id, r.department), false)
  ORDER BY r.document_id, r.vessel_id, r.person_name NULLS LAST, r.profile_id;
END;
$$;

-- Counts per document x vessel (FD2 acknowledged column, FD6): people who
-- acknowledged, are pending, overdue or blocked, and can sign now (pending
-- plus overdue: the people who still need to and are able to). History
-- rows (not_required) are not counted. The caller's readership applies, so
-- a head of department counts their department only.
CREATE OR REPLACE FUNCTION public.fleet_document_summary(p_vessel_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  document_id uuid,
  version_id uuid,
  vessel_id uuid,
  acknowledged bigint,
  pending bigint,
  overdue bigint,
  blocked bigint,
  can_sign bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT s.document_id, s.version_id, s.vessel_id,
         count(*) FILTER (WHERE s.state = 'acknowledged'),
         count(*) FILTER (WHERE s.state = 'pending'),
         count(*) FILTER (WHERE s.state = 'overdue'),
         count(*) FILTER (WHERE s.state = 'blocked'),
         count(*) FILTER (WHERE s.state IN ('pending', 'overdue'))
  FROM public.fleet_document_ack_status(NULL, p_vessel_ids) AS s
  WHERE s.state <> 'not_required'
  GROUP BY s.document_id, s.version_id, s.vessel_id
  ORDER BY s.document_id, s.vessel_id;
END;
$$;

-- The caller's own outstanding acknowledgements (FD9; the vessel home's and
-- the fleet dashboard's "To acknowledge" card): pending and overdue rows of
-- the caller on the given vessel (which must be of their company and
-- reached, 42501 vessel_out_of_reach), else on every vessel whose crew they
-- are on; overdue first, then by due date.
CREATE OR REPLACE FUNCTION public.fleet_document_my_pending(p_vessel_id uuid DEFAULT NULL)
RETURNS TABLE (
  document_id uuid,
  version_id uuid,
  vessel_id uuid,
  vessel_name text,
  vessel_code text,
  title text,
  section text,
  type_name text,
  version_label text,
  due_at timestamptz,
  state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_me uuid;
  v_vessels uuid[];
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = v_uid AND p.company_id = v_company;
  IF p_vessel_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = v_company)
       OR NOT (coalesce(public.reach_vessel_for(v_uid, p_vessel_id), false) OR coalesce(public.fleet_reach_for(v_uid, v_company), false)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
    END IF;
    v_vessels := ARRAY[p_vessel_id];
  ELSE
    -- The vessels whose crew the caller is on (fleet_current_crew's sources, for this one person).
    v_vessels := ARRAY(
      SELECT ca.vessel_id FROM public.crew_assignments AS ca
      JOIN public.vessels AS v ON v.id = ca.vessel_id AND v.company_id = v_company
      WHERE ca.user_id = v_uid AND ca.is_current AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
      UNION
      SELECT p.imported_vessel_id FROM public.profiles AS p
      JOIN public.vessels AS v ON v.id = p.imported_vessel_id AND v.company_id = v_company
      WHERE p.id = v_me);
  END IF;
  IF cardinality(v_vessels) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.document_id, r.version_id, r.vessel_id, ve.name, ve.code, d.title, s.name, t.name, ver.version_label, r.due_at, r.state
  FROM public.fleet_document_ack_rows(v_company, NULL, v_vessels, now()) AS r
  JOIN public.fleet_documents AS d ON d.id = r.document_id
  JOIN public.fleet_document_versions AS ver ON ver.id = r.version_id
  JOIN public.fleet_document_types AS t ON t.id = d.type_id
  JOIN public.fleet_document_sections AS s ON s.id = t.section_id
  JOIN public.vessels AS ve ON ve.id = r.vessel_id
  WHERE r.profile_id = v_me AND r.state IN ('pending', 'overdue')
  ORDER BY (r.state = 'overdue') DESC, r.due_at NULLS LAST, lower(d.title), r.vessel_id;
END;
$$;

-- ---------------------------------------------------------------- browser writes

-- The caller acknowledges the version on the vessel for themselves (W1
-- "Acknowledge (self)"). The version must be of the caller's company
-- (P0002 version_not_found) and the vessel of their company and reached
-- (42501 vessel_out_of_reach). Refused unless the caller's row is pending
-- or overdue: 22023 not_required (a superseded version, a withdrawn
-- document, a document that needs no acknowledgement, or not on the
-- vessel's crew), blocked (DETAIL names the reason), already_acknowledged.
-- Returns the acknowledgement written.
CREATE OR REPLACE FUNCTION public.fleet_document_acknowledge(p_version_id uuid, p_vessel_id uuid)
RETURNS public.fleet_document_acknowledgements
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_document uuid;
  v_me uuid;
  r record;
  a public.fleet_document_acknowledgements;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  SELECT ver.document_id INTO v_document FROM public.fleet_document_versions AS ver WHERE ver.id = p_version_id AND ver.company_id = v_company;
  IF v_document IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'version_not_found';
  END IF;
  IF p_vessel_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = v_company)
     OR NOT (coalesce(public.reach_vessel_for(v_uid, p_vessel_id), false) OR coalesce(public.fleet_reach_for(v_uid, v_company), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
  END IF;
  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = v_uid AND p.company_id = v_company;
  -- Serialise with a publish or withdrawal of the document.
  PERFORM 1 FROM public.fleet_documents AS d WHERE d.id = v_document FOR SHARE;

  SELECT * INTO r FROM public.fleet_document_ack_rows(v_company, v_document, ARRAY[p_vessel_id], now()) AS x
  WHERE x.profile_id = v_me AND x.version_id = p_version_id AND x.on_crew;
  IF NOT FOUND OR r.state = 'not_required' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_required';
  END IF;
  IF r.state = 'acknowledged' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_acknowledged';
  END IF;
  IF r.state = 'blocked' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'blocked', DETAIL = r.blocked_reason;
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.fleet_document_acknowledgements (company_id, document_id, version_id, vessel_id, profile_id, user_id, method, recorded_by, request_meta)
  VALUES (v_company, v_document, p_version_id, p_vessel_id, v_me, v_uid, 'self', v_uid,
          jsonb_build_object('state', r.state, 'due_at', r.due_at))
  ON CONFLICT (version_id, vessel_id, profile_id) DO NOTHING
  RETURNING * INTO a;
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_acknowledged';
  END IF;
  RETURN a;
END;
$$;

-- The vessel's Master, or the person's head of department, records that a
-- crew member read and acknowledged the version on a shared device (W1
-- "Record a witnessed acknowledgement"; D-X5-04): the witness is recorded.
-- The caller must be the Master or a HoD on the vessel (42501
-- not_permitted), and a HoD must cover the person's department (42501
-- not_permitted); a person not of the company is P0002 profile_not_found;
-- the caller cannot witness themselves (22023 witness_is_subject).
-- Allowed while the person is pending, overdue, or blocked for no login or
-- a suspended login; refused 22023 not_required | already_acknowledged |
-- blocked (outside the signer set).
CREATE OR REPLACE FUNCTION public.fleet_document_acknowledge_witnessed(p_version_id uuid, p_vessel_id uuid, p_profile_id uuid)
RETURNS public.fleet_document_acknowledgements
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_document uuid;
  v_me uuid;
  v_master boolean;
  r record;
  a public.fleet_document_acknowledgements;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  SELECT ver.document_id INTO v_document FROM public.fleet_document_versions AS ver WHERE ver.id = p_version_id AND ver.company_id = v_company;
  IF v_document IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'version_not_found';
  END IF;
  IF p_vessel_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = v_company)
     OR NOT (coalesce(public.reach_vessel_for(v_uid, p_vessel_id), false) OR coalesce(public.fleet_reach_for(v_uid, v_company), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
  END IF;
  v_master := coalesce(public.record_is_master(v_uid, p_vessel_id), false);
  IF NOT (v_master OR coalesce(public.fleet_document_hod_on_vessel(v_uid, p_vessel_id), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_profile_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found';
  END IF;
  SELECT p.id INTO v_me FROM public.profiles AS p WHERE p.user_id = v_uid AND p.company_id = v_company;
  IF v_me = p_profile_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'witness_is_subject';
  END IF;
  PERFORM 1 FROM public.fleet_documents AS d WHERE d.id = v_document FOR SHARE;

  SELECT * INTO r FROM public.fleet_document_ack_rows(v_company, v_document, ARRAY[p_vessel_id], now()) AS x
  WHERE x.profile_id = p_profile_id AND x.version_id = p_version_id AND x.on_crew;
  IF NOT v_master AND NOT (FOUND AND coalesce(public.fleet_hod_covers(v_uid, p_vessel_id, r.department), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF r.document_id IS NULL OR r.state = 'not_required' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_required';
  END IF;
  IF r.state = 'acknowledged' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_acknowledged';
  END IF;
  IF r.state = 'blocked' AND r.blocked_reason NOT IN ('no_login', 'suspended') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'blocked', DETAIL = r.blocked_reason;
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.fleet_document_acknowledgements (company_id, document_id, version_id, vessel_id, profile_id, user_id, method,
                                                      witnessed_by_profile_id, recorded_by, request_meta)
  VALUES (v_company, v_document, p_version_id, p_vessel_id, p_profile_id, NULL, 'witnessed', v_me, v_uid,
          jsonb_build_object('state', r.state, 'due_at', r.due_at, 'blocked_reason', r.blocked_reason, 'witness_role', CASE WHEN v_master THEN 'master' ELSE 'hod' END))
  ON CONFLICT (version_id, vessel_id, profile_id) DO NOTHING
  RETURNING * INTO a;
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  IF a.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_acknowledged';
  END IF;
  RETURN a;
END;
$$;

-- Reminds the people who still have to acknowledge a published document
-- (W1 "Remind"; FD7): every outstanding person (pending or overdue, with a
-- login; never the caller) of the vessel given (NULL: every targeted
-- vessel), or one person.
-- Who: documents editors with fleet reach, any vessel; the vessel's Master,
-- that vessel; a head of department, their department on that vessel
-- (Master and HoD must name the vessel: 22023 vessel_required; anyone else
-- 42501 not_permitted). One reminder per person per document per 24 hours,
-- whatever its kind; the others are counted as skipped. One guarded emit of
-- fleet_document_ack_reminder per vessel (D-128; in-app only, D-249); a
-- person whose vessel's emit failed is counted as failed and stays
-- remindable. Logged in fleet_document_reminders when anyone was sent or
-- skipped. Returns {reminder_id, sent, skipped, failed, vessels}.
-- Refused: P0002 document_not_found | profile_not_found, 22023
-- not_published | ack_not_required.
CREATE OR REPLACE FUNCTION public.fleet_document_remind(p_document_id uuid, p_vessel_id uuid DEFAULT NULL, p_profile_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  d public.fleet_documents;
  v_label text;
  v_editor boolean;
  v_master boolean := false;
  v_reminder uuid := gen_random_uuid();
  v_sent uuid[] := '{}'::uuid[];
  v_skipped integer := 0;
  v_failed integer := 0;
  v_vessels integer := 0;
  r record;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  SELECT * INTO d FROM public.fleet_documents AS x WHERE x.id = p_document_id AND x.company_id = v_company FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found';
  END IF;
  v_editor := coalesce(public.fleet_ops_can_for(v_uid, v_company, NULL, 'documents', 'edit'), false);
  IF p_vessel_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = v_company)
       OR NOT (coalesce(public.reach_vessel_for(v_uid, p_vessel_id), false) OR coalesce(public.fleet_reach_for(v_uid, v_company), false)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
    END IF;
    v_master := coalesce(public.record_is_master(v_uid, p_vessel_id), false);
  END IF;
  IF NOT v_editor THEN
    IF p_vessel_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.company_id = v_company
                      AND (coalesce(public.record_is_master(v_uid, v.id), false) OR coalesce(public.fleet_document_hod_on_vessel(v_uid, v.id), false))) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_required';
      END IF;
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
    END IF;
    IF NOT (v_master OR coalesce(public.fleet_document_hod_on_vessel(v_uid, p_vessel_id), false)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
    END IF;
  END IF;
  IF p_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found';
  END IF;
  IF d.status <> 'published' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_published';
  END IF;
  IF NOT d.ack_required THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ack_not_required';
  END IF;
  SELECT ver.version_label INTO v_label FROM public.fleet_document_versions AS ver WHERE ver.id = d.current_version_id;
  -- One reminder run per document at a time (the 24-hour rule reads the log).
  PERFORM pg_advisory_xact_lock(hashtext('fleet_document_remind:' || d.id::text));

  FOR r IN
    WITH outstanding AS (
      SELECT x.vessel_id, x.profile_id, x.user_id
      FROM public.fleet_document_ack_rows(v_company, d.id, CASE WHEN p_vessel_id IS NULL THEN NULL ELSE ARRAY[p_vessel_id] END, now()) AS x
      WHERE x.state IN ('pending', 'overdue') AND x.user_id IS NOT NULL AND x.user_id IS DISTINCT FROM v_uid
        AND (p_profile_id IS NULL OR x.profile_id = p_profile_id)
        AND (v_editor OR v_master OR coalesce(public.fleet_hod_covers(v_uid, x.vessel_id, x.department), false))
    ),
    marked AS (
      SELECT o.*, EXISTS (
        SELECT 1 FROM public.fleet_document_reminders AS fr
        WHERE fr.document_id = d.id AND fr.sent_at > now() - interval '24 hours' AND o.profile_id = ANY (fr.recipient_profile_ids)) AS recent
      FROM outstanding AS o
    )
    SELECT m.vessel_id,
           array_agg(m.profile_id) FILTER (WHERE NOT m.recent) AS profiles,
           array_agg(DISTINCT m.user_id) FILTER (WHERE NOT m.recent) AS users,
           count(*) FILTER (WHERE m.recent) AS skipped
    FROM marked AS m
    GROUP BY m.vessel_id
    ORDER BY m.vessel_id
  LOOP
    v_skipped := v_skipped + r.skipped::integer;
    CONTINUE WHEN r.profiles IS NULL;
    BEGIN
      PERFORM public.emit_notification_event(
        'fleet_document_ack_reminder', v_company, left('Reminder: acknowledge ' || d.title, 120), 'vessel', r.vessel_id,
        'Open it in Safety, Fleet documents, read it and acknowledge it.', 'info',
        'safety/fleet-documents?doc=' || d.id::text, NULL, NULL, d.id, v_label, NULL, r.users, '{}'::text[],
        jsonb_build_object('document_id', d.id, 'version_id', d.current_version_id, 'reminder_id', v_reminder),
        'fdr:' || v_reminder::text || ':' || r.vessel_id::text, 'safety');
      v_sent := v_sent || r.profiles;
      v_vessels := v_vessels + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'fleet_document_ack_reminder not emitted for document % vessel %: %', d.id, r.vessel_id, SQLERRM;
      v_failed := v_failed + cardinality(r.profiles);
    END;
  END LOOP;

  IF cardinality(v_sent) > 0 OR v_skipped > 0 THEN
    PERFORM set_config('storm.fleet_tx', 'on', true);
    INSERT INTO public.fleet_document_reminders (id, company_id, document_id, vessel_id, profile_id, kind, sent_by, recipient_count, skipped_count, recipient_profile_ids)
    VALUES (v_reminder, v_company, d.id, p_vessel_id, p_profile_id, 'manual', v_uid, cardinality(v_sent), v_skipped, v_sent);
    PERFORM set_config('storm.fleet_tx', v_prev, true);
  END IF;
  RETURN jsonb_build_object(
    'reminder_id', CASE WHEN cardinality(v_sent) > 0 OR v_skipped > 0 THEN v_reminder END,
    'sent', cardinality(v_sent), 'skipped', v_skipped, 'failed', v_failed, 'vessels', v_vessels);
END;
$$;

-- Sets who can sign a vessel's fleet documents (W1 "Choose who can sign";
-- FD8), for one document type or for every type (p_type_id NULL):
-- 'all_crew_with_login', 'hod_and_above', 'positions' (1-100 position
-- names, each up to 80 characters) or 'named_people' (1-500 profiles of
-- the company). A NULL rule removes the rule (the default applies again).
-- Who: documents admins with fleet reach, or the vessel's Master (42501
-- not_permitted). Refused: 42501 vessel_out_of_reach, 22023
-- vessel_archived | invalid_rule | positions_required | too_many_positions
-- | position_too_long | positions_not_expected | people_required |
-- too_many_people | people_not_expected, P0002 type_not_found |
-- profile_not_found. Returns the rule (the removed one for a NULL rule;
-- NULL when there was none).
CREATE OR REPLACE FUNCTION public.fleet_document_set_signer_rule(
  p_vessel_id uuid,
  p_type_id uuid,
  p_rule text,
  p_positions text[] DEFAULT NULL,
  p_profile_ids uuid[] DEFAULT NULL
)
RETURNS public.fleet_document_signer_rules
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_positions text[] := ARRAY(SELECT DISTINCT btrim(x) FROM unnest(coalesce(p_positions, '{}'::text[])) AS x WHERE nullif(btrim(x), '') IS NOT NULL ORDER BY 1);
  v_people uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_profile_ids, '{}'::uuid[])) AS x WHERE x IS NOT NULL ORDER BY 1);
  s public.fleet_document_signer_rules;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_vessel_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND v.company_id = v_company)
     OR NOT (coalesce(public.reach_vessel_for(v_uid, p_vessel_id), false) OR coalesce(public.fleet_reach_for(v_uid, v_company), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
  END IF;
  IF NOT (coalesce(public.fleet_ops_can_for(v_uid, v_company, NULL, 'documents', 'admin'), false)
          OR coalesce(public.record_is_master(v_uid, p_vessel_id), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = p_vessel_id AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_archived';
  END IF;
  IF p_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fleet_document_types AS t WHERE t.id = p_type_id AND t.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'type_not_found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fleet_document_signer_rule:' || p_vessel_id::text || ':' || coalesce(p_type_id::text, '*')));

  IF p_rule IS NULL THEN
    PERFORM set_config('storm.fleet_tx', 'on', true);
    DELETE FROM public.fleet_document_signer_rules AS sr
    WHERE sr.vessel_id = p_vessel_id AND sr.type_id IS NOT DISTINCT FROM p_type_id
    RETURNING * INTO s;
    PERFORM set_config('storm.fleet_tx', v_prev, true);
    RETURN s;
  END IF;
  IF p_rule NOT IN ('all_crew_with_login', 'hod_and_above', 'positions', 'named_people') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_rule';
  END IF;
  IF p_rule = 'positions' THEN
    IF cardinality(v_positions) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'positions_required';
    END IF;
    IF cardinality(v_positions) > 100 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_positions';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_positions) AS x WHERE length(x) > 80) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_too_long';
    END IF;
  ELSIF cardinality(v_positions) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'positions_not_expected';
  END IF;
  IF p_rule = 'named_people' THEN
    IF cardinality(v_people) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'people_required';
    END IF;
    IF cardinality(v_people) > 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_people';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_people) AS x
               WHERE NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = x AND p.company_id = v_company)) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found';
    END IF;
  ELSIF cardinality(v_people) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'people_not_expected';
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.fleet_document_signer_rules AS sr
  SET rule = p_rule, positions = v_positions, profile_ids = v_people, updated_by = v_uid
  WHERE sr.vessel_id = p_vessel_id AND sr.type_id IS NOT DISTINCT FROM p_type_id
  RETURNING * INTO s;
  IF s.id IS NULL THEN
    INSERT INTO public.fleet_document_signer_rules (company_id, vessel_id, type_id, rule, positions, profile_ids, created_by, updated_by)
    VALUES (v_company, p_vessel_id, p_type_id, p_rule, v_positions, v_people, v_uid, v_uid)
    RETURNING * INTO s;
  END IF;
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN s;
END;
$$;

-- ---------------------------------------------------------------- publish trigger (carry forward, notify)

-- When fleet_document_publish() moves a document to a new published
-- version: a minor version carries the acknowledgements of the version it
-- superseded forward (method carried_forward, acknowledged_at kept); then,
-- when the document needs an acknowledgement, one fleet_document_published
-- per targeted vessel to that vessel's pending people with a login (must-act
-- users; the publisher is never notified), each emit guarded (D-128).
CREATE OR REPLACE FUNCTION public.fleet_documents_after_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_kind text;
  v_label text;
  v_section text;
  r record;
BEGIN
  IF NEW.status <> 'published' OR NEW.current_version_id IS NULL OR NEW.current_version_id IS NOT DISTINCT FROM OLD.current_version_id THEN
    RETURN NULL;
  END IF;
  SELECT ver.version_kind, ver.version_label INTO v_kind, v_label
  FROM public.fleet_document_versions AS ver WHERE ver.id = NEW.current_version_id;

  IF OLD.current_version_id IS NOT NULL AND v_kind = 'minor' THEN
    PERFORM set_config('storm.fleet_tx', 'on', true);
    INSERT INTO public.fleet_document_acknowledgements (company_id, document_id, version_id, vessel_id, profile_id, user_id, method,
                                                        witnessed_by_profile_id, carried_from_version_id, recorded_by, acknowledged_at, request_meta)
    SELECT a.company_id, a.document_id, NEW.current_version_id, a.vessel_id, a.profile_id, a.user_id, 'carried_forward',
           a.witnessed_by_profile_id, a.version_id, auth.uid(), a.acknowledged_at,
           jsonb_build_object('carried_from_acknowledgement_id', a.id, 'carried_from_method', a.method)
    FROM public.fleet_document_acknowledgements AS a
    WHERE a.version_id = OLD.current_version_id AND a.document_id = NEW.id
    ON CONFLICT (version_id, vessel_id, profile_id) DO NOTHING;
    PERFORM set_config('storm.fleet_tx', v_prev, true);
  END IF;

  IF NOT NEW.ack_required THEN
    RETURN NULL;
  END IF;
  SELECT s.name INTO v_section
  FROM public.fleet_document_types AS t JOIN public.fleet_document_sections AS s ON s.id = t.section_id
  WHERE t.id = NEW.type_id;
  FOR r IN
    SELECT x.vessel_id, array_agg(DISTINCT x.user_id) AS users
    FROM public.fleet_document_ack_rows(NEW.company_id, NEW.id, NULL, now()) AS x
    WHERE x.state IN ('pending', 'overdue') AND x.user_id IS NOT NULL
    GROUP BY x.vessel_id
    ORDER BY x.vessel_id
  LOOP
    BEGIN
      PERFORM public.emit_notification_event(
        'fleet_document_published', NEW.company_id, left('New document to acknowledge: ' || NEW.title, 120), 'vessel', r.vessel_id,
        left(concat_ws(' · ', v_section, 'Version ' || v_label) || '. Open it in Safety, Fleet documents, read it and acknowledge it.', 280), 'info',
        'safety/fleet-documents?doc=' || NEW.id::text, NULL, NULL, NEW.id, v_label, NULL, r.users, '{}'::text[],
        jsonb_build_object('document_id', NEW.id, 'version_id', NEW.current_version_id, 'version_kind', v_kind),
        'fdp:' || NEW.current_version_id::text || ':' || r.vessel_id::text, 'safety');
    EXCEPTION WHEN others THEN
      RAISE WARNING 'fleet_document_published not emitted for document % vessel %: %', NEW.id, r.vessel_id, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_documents_after_publish ON public.fleet_documents;
CREATE TRIGGER trg_fleet_documents_after_publish
  AFTER UPDATE OF current_version_id ON public.fleet_documents
  FOR EACH ROW
  WHEN (NEW.status = 'published' AND NEW.current_version_id IS DISTINCT FROM OLD.current_version_id)
  EXECUTE FUNCTION public.fleet_documents_after_publish();

-- ---------------------------------------------------------------- grants

REVOKE ALL ON FUNCTION public.fleet_document_acknowledgements_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_signer_rules_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_reminders_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_documents_after_publish() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_ack_due_at(timestamptz, date, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_ack_blocked_reason(boolean, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_ack_state(text, boolean, boolean, boolean, boolean, boolean, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_vessel_pairs(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_person_department(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_hod_on_vessel(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_is_senior(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_in_signer_set(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_ack_rows(uuid, uuid, uuid[], timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_ack_reader_for(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_file_readable(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_vessel_documents(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_ack_status(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_summary(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_my_pending(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_acknowledge(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_acknowledge_witnessed(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_remind(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_set_signer_rule(uuid, uuid, text, text[], uuid[]) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fleet_document_ack_due_at(timestamptz, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_ack_blocked_reason(boolean, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_ack_state(text, boolean, boolean, boolean, boolean, boolean, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_vessel_pairs(uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_person_department(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_hod_on_vessel(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_is_senior(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_in_signer_set(uuid, uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_ack_rows(uuid, uuid, uuid[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_file_readable(uuid, uuid) TO service_role;
-- The policies run the reader check as the reader (and service-role jobs ask it about anyone).
GRANT EXECUTE ON FUNCTION public.fleet_document_ack_reader_for(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_vessel_documents(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_ack_status(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_summary(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_my_pending(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_acknowledge(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_acknowledge_witnessed(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_remind(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_set_signer_rule(uuid, uuid, text, text[], uuid[]) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.fleet_document_acknowledgements IS 'Acknowledgements of fleet document versions (gap/02 FD6, FD9, W1; D-X5-04): one per person (profile) x version x vessel, method self | witnessed (witness recorded) | carried_forward (a minor version kept the previous one''s). Read: documents viewers with fleet reach, the vessel''s Master, the person''s HoD, the person (fleet_document_ack_reader_for). Append-only; written only by fleet_document_acknowledge / _acknowledge_witnessed and the publish trigger (trg_fleet_document_acknowledgements_guard, every role).';
COMMENT ON TABLE public.fleet_document_signer_rules IS 'Who can sign a vessel''s fleet documents (gap/02 FD8): per vessel and document type (or every type): all crew with a login | HoD and above | positions | named people; without a rule everyone with a login. Read like the acknowledgements (vessel level). Written only by fleet_document_set_signer_rule (trg_fleet_document_signer_rules_guard).';
COMMENT ON TABLE public.fleet_document_reminders IS 'The fleet document reminders sent (gap/02 FD7): manual (fleet_document_remind) or automatic (due_soon, overdue, digest: the daily sweep), sender, recipients and the ones skipped by the 24-hour rule. Read like the acknowledgements. Append-only (trg_fleet_document_reminders_guard).';
COMMENT ON FUNCTION public.fleet_document_ack_rows(uuid, uuid, uuid[], timestamptz) IS 'The one fleet document acknowledgement state core (D-X5-04): person x current version x targeted vessel -> acknowledged | blocked (no_login, suspended, not_in_signer_set) | overdue | pending, plus not_required history; due_at = later of publish and join date + ack_due_days. Internal: no caller check (the browser RPCs filter by readership).';
COMMENT ON FUNCTION public.fleet_document_ack_state(text, boolean, boolean, boolean, boolean, boolean, timestamptz, timestamptz) IS 'Pure: the acknowledgement state of one row (not_required, acknowledged, blocked, overdue, pending in that precedence). Mirrored by src/modules/documents/lib/ackState.ts.';
COMMENT ON FUNCTION public.fleet_document_ack_due_at(timestamptz, date, integer) IS 'Pure: the acknowledgement due time, the later of the version''s publish time and the join date (00:00 UTC) plus the days, in UTC days.';
COMMENT ON FUNCTION public.fleet_document_ack_blocked_reason(boolean, boolean, boolean) IS 'Pure: no_login | suspended | not_in_signer_set, the first that applies; NULL when the person can sign.';
COMMENT ON FUNCTION public.fleet_document_vessel_pairs(uuid, uuid, uuid[]) IS 'Internal: the (document, vessel) pairs the company''s published and withdrawn fleet documents target (selected: targets not archived; all_including_future: counted active vessels).';
COMMENT ON FUNCTION public.fleet_document_person_department(uuid, uuid) IS 'Internal: a person''s department on a vessel (the current assignment''s, else the profile''s).';
COMMENT ON FUNCTION public.fleet_document_hod_on_vessel(uuid, uuid) IS 'Internal: the user is an active head of department on the vessel for any department (fleet_hod_covers without the department match).';
COMMENT ON FUNCTION public.fleet_document_is_senior(uuid, uuid, uuid, text, text) IS 'Internal: the crew member is HoD or above for the hod_and_above signer rule (Master or senior office, legacy role, user_roles row, or the crew position catalogue''s command / hod tier when present).';
COMMENT ON FUNCTION public.fleet_document_in_signer_set(uuid, uuid, uuid, uuid, text, text) IS 'Internal: the crew member is in the vessel''s signer set for the document type (type rule, else all-types rule, else everyone).';
COMMENT ON FUNCTION public.fleet_document_ack_reader_for(uuid, uuid, uuid) IS 'RLS helper: the user may read the vessel''s (and the person''s) acknowledgement data: documents viewer with fleet reach; the person; the vessel''s Master; the HoD covering the person''s department. Active-aware; a signed-in caller asks about themselves only.';
COMMENT ON FUNCTION public.fleet_document_file_readable(uuid, uuid) IS 'Storage read-hook predicate (PR-07, D-X5-17): the user may read the fleet document''s files (library editors any state, readers non-drafts, people the published document is visible to). Service only: storage_path_allowed calls it.';
COMMENT ON FUNCTION public.fleet_document_vessel_documents(uuid) IS 'The fleet documents published to a vessel with their published version and the caller''s own acknowledgement state there; the caller reaches the vessel (42501 vessel_out_of_reach).';
COMMENT ON FUNCTION public.fleet_document_ack_status(uuid, uuid[]) IS 'Acknowledgement rows of a document (or all) on the vessels given (or all), filtered to the caller''s readership; P0002 document_not_found, 42501 vessel_out_of_reach.';
COMMENT ON FUNCTION public.fleet_document_summary(uuid[]) IS 'Acknowledgement counts per document x vessel (acknowledged, pending, overdue, blocked, can sign = pending + overdue) over the caller''s readership.';
COMMENT ON FUNCTION public.fleet_document_my_pending(uuid) IS 'The caller''s own pending and overdue fleet document acknowledgements on the vessel given, else on every vessel whose crew they are on.';
COMMENT ON FUNCTION public.fleet_document_acknowledge(uuid, uuid) IS 'The caller acknowledges a fleet document version on a vessel for themselves; 22023 not_required | blocked | already_acknowledged.';
COMMENT ON FUNCTION public.fleet_document_acknowledge_witnessed(uuid, uuid, uuid) IS 'The vessel''s Master or the person''s HoD records a witnessed acknowledgement (shared device; also for crew without a login or with a suspended one).';
COMMENT ON FUNCTION public.fleet_document_remind(uuid, uuid, uuid) IS 'Reminds the outstanding people of a published fleet document (editors any vessel, Master own vessel, HoD own department); one per person per 24 hours; in-app; logged. Returns {reminder_id, sent, skipped, failed, vessels}.';
COMMENT ON FUNCTION public.fleet_document_set_signer_rule(uuid, uuid, text, text[], uuid[]) IS 'Sets (or with a NULL rule removes) who can sign a vessel''s fleet documents of a type or of every type; documents admins or the vessel''s Master.';
COMMENT ON FUNCTION public.fleet_documents_after_publish() IS 'Trigger: on a new published version, a minor version carries the previous version''s acknowledgements forward; then one guarded fleet_document_published emit per targeted vessel to its pending people (D-128).';
COMMENT ON FUNCTION public.fleet_document_acknowledgements_guard() IS 'Trigger: acknowledgements are inserted only by the definers (storm.fleet_tx) with a vessel, person and witness of the company, never updated, deleted only by a referential cascade. Every role.';
COMMENT ON FUNCTION public.fleet_document_signer_rules_guard() IS 'Trigger: signer rules are written only by fleet_document_set_signer_rule (a cascade excepted); the vessel is of the row''s company.';
COMMENT ON FUNCTION public.fleet_document_reminders_guard() IS 'Trigger: the reminder log is inserted only by the definers and never updated or deleted (a cascade excepted).';
