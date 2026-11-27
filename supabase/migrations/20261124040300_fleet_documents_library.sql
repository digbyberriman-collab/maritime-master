-- =================================================================
-- FLEET OPERATIONS X5-04A: the fleet document library
-- (gap/02 FD1, FD2, FD4, FD5, FD10, W1; DECISIONS C7, D-01, D-04,
-- D-55, D-120, D-123, D-157; X5 spec §2 X5-04A, D-X5-03, D-X5-15,
-- D-X5-17, D-X5-21, D-X5-23)
-- Tables: fleet_document_sections, fleet_document_types, fleet_documents,
--   fleet_document_versions, fleet_document_vessel_targets,
--   fleet_document_events
-- Functions (browser): fleet_document_section_save,
--   fleet_document_sections_reorder, fleet_document_section_delete,
--   fleet_document_type_save, fleet_document_type_delete,
--   fleet_document_create, fleet_document_update,
--   fleet_document_add_version, fleet_document_set_targets,
--   fleet_document_publish, fleet_document_withdraw,
--   fleet_document_delete_draft; fleet_document_visible (the RLS helper
--   of the library policies)
-- Functions (service role): fleet_document_gate, fleet_document_log
-- Triggers: fleet_documents_guard, fleet_document_versions_guard,
--   fleet_document_vessel_targets_guard, fleet_document_events_guard
-- TS mirrors: src/modules/documents/types/db.pending.ts (rows and RPCs),
--   src/modules/documents/lib/fleetDocumentMachine.ts (the states x
--   actions table; supabase/tests/sql/fleet/documents_library.test.sql
--   copies it between its machine-table markers and
--   src/test/documents/fleetDocumentMachine.test.ts pins the copy)
-- =================================================================
--
-- The documents the company publishes to its vessels (gap/02 W1): a
-- company-owned taxonomy of sections and document types, documents with a
-- crew-facing title, numbered versions (one file each, in the private
-- records bucket), vessel targets, and an append-only event log. These are
-- their own tables (D-X5-03, amends gap/02's data model): the live
-- `documents` register (now at /fleet/documents/register) and its
-- `document_categories` seed are not touched.
--
-- Document lifecycle (lib/fleetDocumentMachine.ts):
--
--   state \ action  edit_details  add_version  set_targets  publish    withdraw           delete_draft
--   draft           draft         draft        draft        published  not_published      (deleted)
--   published       published     published    published    published  withdrawn          document_published
--   withdrawn       document_withdrawn for every action;   withdraw:   already_withdrawn
--
--   A document starts as a draft (fleet_document_create). Publishing names
--   one of its draft versions: that version becomes the published one and
--   the version published before it (if any) becomes superseded, kept
--   read-only. Publishing needs a live file and, in 'selected' mode, at
--   least one target vessel that is not archived, and refuses a stale
--   updated_at (optimistic concurrency). Withdrawing (with a reason)
--   removes the document from every vessel and keeps it for audit; it is
--   final. Only a document that was never published is deleted; anything
--   else is withdrawn. Version states: draft -> published -> superseded;
--   at most one draft and one published version per document.
--
-- Acknowledgement effect of a publish (recorded in the event payload; the
-- acknowledgement rows are X5-05A's, 20261124040400): 'none' when the
-- document needs no acknowledgement, 'fresh' for its first version,
-- 'carry_forward' for a minor version (acknowledgements of the version it
-- supersedes carry over) and 'reset' for a major one (everyone signs again).
--
-- Visibility (RLS; no browser write policy anywhere):
--   sections, types                  active members of the row's company
--   documents, versions, targets,    fleet_ops_can(company, NULL, 'documents',
--   events                           'view') - fleet reach plus the documents
--                                    view rule (D-X5-21); drafts and draft
--                                    versions need 'edit'
--   documents, versions (published)  also fleet_document_visible(): the person
--                                    reaches a vessel the document targets
--                                    ('all_including_future': any counted
--                                    vessel of the company, also one added
--                                    after publishing)
-- So a vessel-scoped RBAC documents holder without fleet reach reads no
-- library rows: only the published documents of the vessels they reach,
-- like the crew. Inactive users get nothing (get_user_company_id() is NULL
-- for them, D-157). Targets and events are for library readers only.
--
-- Writes: only the definers below. Each takes the caller's company
-- (get_user_company_id), checks fleet_ops_can(company, NULL, 'documents',
-- 'edit') (deleting a section or a type: 'admin', the catalogue's delete
-- action), validates every id against that company (an unknown or foreign
-- row is P0002 *_not_found, a foreign vessel 42501 vessel_out_of_reach),
-- refuses business rules with 22023 and a stable snake_case message the
-- client maps to a sentence, and writes one fleet_document_events row per
-- change (D-X5-23).
--
-- Guards (BEFORE INSERT OR UPDATE OR DELETE, every role, the service role
-- and the table owner included): status, state, current_version_id and the
-- published_* / withdrawn_* / superseded_at columns change only inside the
-- definers (the transaction-local flag storm.fleet_tx is 'on'); an insert
-- with a non-initial status, a content change of a non-draft row and a
-- delete of a non-draft row are refused the same way (42501
-- <table>_guarded); targets are written only by the definers; events are
-- append-only (inserted by the definers, never updated or deleted). A
-- referential cascade (the company or a vessel deleted) passes: it runs
-- one trigger level down (pg_trigger_depth() > 1), never from a client
-- statement.
--
-- Files (D-X5-17; C7): a version's file is a live records-bucket object of
-- the company registered at
-- <company>/fleet/documents/fleet_document/<document_id>/<uuid>-<name>
-- (register_file_object, 20261123020300), used by no other version.
-- Reads go through the storage read hook storage_path_read_hooks() names
-- for that path (PP4, PR-07, D-382), whose answer is final: its predicate
-- fleet_document_file_readable(uuid, uuid, text) is asked about the file
-- itself (library editors any file, library readers the files of versions
-- that are not drafts, the people the published document is visible to
-- only the published version's file), so knowing a path opens nothing it
-- does not allow; the vessel-folder variant of the path is refused. It is
-- defined with the vessel Fleet Documents page (X5-05A); until it is in the
-- database the bucket's generic path rule applies (fleet reach). Deleting a
-- draft soft-removes its files.
--
-- Notifications: none here (D-128, D-238). fleet_document_published is
-- emitted by X5-05A's publish trigger once the acknowledgement tables exist.
--
-- Nothing here is live (D-01): the client reads through the pending shim
-- and shows "Fleet documents are not set up yet" while the tables are
-- missing. Applying it changes nothing users see today: no live table,
-- policy or function is touched.
--
-- Idempotent (D-12, D-55): tables IF NOT EXISTS, constraints dropped and
-- added (CHECKs) or created with the table (keys), indexes IF NOT EXISTS,
-- policies and triggers dropped and created, functions CREATE OR REPLACE.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.fleet_ops_can_for(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.fleet_ops_can(uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040300_fleet_documents_library needs the fleet access helpers: apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regclass('public.file_objects') IS NULL OR to_regprocedure('public.storage_path_read_hooks()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040300_fleet_documents_library needs the record files and the storage read hooks: apply 20261123020300_platform_record_files.sql first';
  END IF;
  IF to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.vessel_in_reachable_state(text,text)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040300_fleet_documents_library needs the reach helpers (20261123000300, 20261123010000) and update_updated_at_column()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessels' AND column_name = 'is_counted')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessels' AND column_name = 'lifecycle_status') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040300_fleet_documents_library needs vessels.is_counted and vessels.lifecycle_status: apply 20261123000100_platform_vessel_tenancy.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- fleet_document_sections (FD1, FD10)

CREATE TABLE IF NOT EXISTS public.fleet_document_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_document_sections_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_document_sections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  -- the composite key the types reference, so a type's section is always of its company
  CONSTRAINT fleet_document_sections_id_company_key UNIQUE (id, company_id)
);

ALTER TABLE public.fleet_document_sections
  DROP CONSTRAINT IF EXISTS fleet_document_sections_name_check,
  ADD CONSTRAINT fleet_document_sections_name_check CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 80);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_document_sections_name_key ON public.fleet_document_sections (company_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_fleet_document_sections_order ON public.fleet_document_sections (company_id, sort_order);

-- ---------------------------------------------------------------- fleet_document_types (FD1, FD5, FD10)

-- The section key is NO ACTION (checked at the end of the statement), not
-- RESTRICT: a section holding types is never deleted on its own (the
-- definer deletes its empty types first), and deleting the company still
-- cascades to both tables in one statement.
CREATE TABLE IF NOT EXISTS public.fleet_document_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  section_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  ack_required_default boolean NOT NULL DEFAULT true,
  ack_due_days_default integer NOT NULL DEFAULT 14,
  version_kind_default text NOT NULL DEFAULT 'major',
  hide_when_empty boolean NOT NULL DEFAULT false,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_document_types_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_document_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_types_section_fkey FOREIGN KEY (section_id, company_id) REFERENCES public.fleet_document_sections (id, company_id),
  CONSTRAINT fleet_document_types_id_company_key UNIQUE (id, company_id)
);

ALTER TABLE public.fleet_document_types
  DROP CONSTRAINT IF EXISTS fleet_document_types_name_check,
  ADD CONSTRAINT fleet_document_types_name_check CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 80),
  DROP CONSTRAINT IF EXISTS fleet_document_types_ack_due_days_default_check,
  ADD CONSTRAINT fleet_document_types_ack_due_days_default_check CHECK (ack_due_days_default BETWEEN 1 AND 365),
  DROP CONSTRAINT IF EXISTS fleet_document_types_version_kind_default_check,
  ADD CONSTRAINT fleet_document_types_version_kind_default_check CHECK (version_kind_default IN ('major', 'minor'));

CREATE UNIQUE INDEX IF NOT EXISTS fleet_document_types_name_key ON public.fleet_document_types (section_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_fleet_document_types_company ON public.fleet_document_types (company_id, section_id, sort_order);

-- ---------------------------------------------------------------- fleet_documents (FD2, FD4)

CREATE TABLE IF NOT EXISTS public.fleet_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  type_id uuid NOT NULL,
  title text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'draft',
  target_mode text NOT NULL DEFAULT 'selected',
  ack_required boolean NOT NULL DEFAULT true,
  ack_due_days integer NOT NULL DEFAULT 14,
  current_version_id uuid NULL,
  published_at timestamptz NULL,
  published_by uuid NULL,
  withdrawn_at timestamptz NULL,
  withdrawn_by uuid NULL,
  withdrawn_reason text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_documents_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT fleet_documents_type_fkey FOREIGN KEY (type_id, company_id) REFERENCES public.fleet_document_types (id, company_id),
  CONSTRAINT fleet_documents_id_company_key UNIQUE (id, company_id)
);

ALTER TABLE public.fleet_documents
  DROP CONSTRAINT IF EXISTS fleet_documents_status_check,
  ADD CONSTRAINT fleet_documents_status_check CHECK (status IN ('draft', 'published', 'withdrawn')),
  DROP CONSTRAINT IF EXISTS fleet_documents_target_mode_check,
  ADD CONSTRAINT fleet_documents_target_mode_check CHECK (target_mode IN ('all_including_future', 'selected')),
  DROP CONSTRAINT IF EXISTS fleet_documents_title_check,
  ADD CONSTRAINT fleet_documents_title_check CHECK (title = btrim(title) AND length(title) BETWEEN 1 AND 160),
  DROP CONSTRAINT IF EXISTS fleet_documents_description_check,
  ADD CONSTRAINT fleet_documents_description_check CHECK (description IS NULL OR (description = btrim(description) AND length(description) BETWEEN 1 AND 2000)),
  DROP CONSTRAINT IF EXISTS fleet_documents_ack_due_days_check,
  ADD CONSTRAINT fleet_documents_ack_due_days_check CHECK (ack_due_days BETWEEN 1 AND 365),
  DROP CONSTRAINT IF EXISTS fleet_documents_withdrawn_reason_check,
  ADD CONSTRAINT fleet_documents_withdrawn_reason_check CHECK (withdrawn_reason IS NULL OR (withdrawn_reason = btrim(withdrawn_reason) AND length(withdrawn_reason) BETWEEN 1 AND 500)),
  -- The lifecycle columns agree with the status (W1).
  DROP CONSTRAINT IF EXISTS fleet_documents_lifecycle_check,
  ADD CONSTRAINT fleet_documents_lifecycle_check CHECK (
    (status = 'draft' AND current_version_id IS NULL AND published_at IS NULL AND published_by IS NULL
       AND withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdrawn_reason IS NULL)
    OR (status = 'published' AND current_version_id IS NOT NULL AND published_at IS NOT NULL
       AND withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdrawn_reason IS NULL)
    OR (status = 'withdrawn' AND current_version_id IS NOT NULL AND published_at IS NOT NULL
       AND withdrawn_at IS NOT NULL AND withdrawn_reason IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_fleet_documents_company ON public.fleet_documents (company_id, status);
CREATE INDEX IF NOT EXISTS idx_fleet_documents_type ON public.fleet_documents (type_id);

-- ---------------------------------------------------------------- fleet_document_versions (FD4)

-- file_object_id is NO ACTION: a version's file is soft-removed, never
-- deleted while the version exists. storage_path, file_name, mime_type and
-- size_bytes are copied from the file object, so crew (who cannot read
-- file_objects) can open and describe the file.
CREATE TABLE IF NOT EXISTS public.fleet_document_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_no integer NOT NULL,
  version_label text NOT NULL,
  version_kind text NOT NULL DEFAULT 'major',
  effective_date date NOT NULL DEFAULT current_date,
  file_object_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  change_summary text NULL,
  published_at timestamptz NULL,
  published_by uuid NULL,
  superseded_at timestamptz NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_document_versions_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_document_versions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_versions_document_fkey FOREIGN KEY (document_id, company_id) REFERENCES public.fleet_documents (id, company_id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_versions_file_object_fkey FOREIGN KEY (file_object_id) REFERENCES public.file_objects (id),
  CONSTRAINT fleet_document_versions_id_document_key UNIQUE (id, document_id),
  CONSTRAINT fleet_document_versions_number_key UNIQUE (document_id, version_no)
);

ALTER TABLE public.fleet_document_versions
  DROP CONSTRAINT IF EXISTS fleet_document_versions_version_no_check,
  ADD CONSTRAINT fleet_document_versions_version_no_check CHECK (version_no > 0),
  DROP CONSTRAINT IF EXISTS fleet_document_versions_version_label_check,
  ADD CONSTRAINT fleet_document_versions_version_label_check CHECK (version_label = btrim(version_label) AND length(version_label) BETWEEN 1 AND 40),
  DROP CONSTRAINT IF EXISTS fleet_document_versions_version_kind_check,
  ADD CONSTRAINT fleet_document_versions_version_kind_check CHECK (version_kind IN ('major', 'minor')),
  DROP CONSTRAINT IF EXISTS fleet_document_versions_state_check,
  ADD CONSTRAINT fleet_document_versions_state_check CHECK (state IN ('draft', 'published', 'superseded')),
  DROP CONSTRAINT IF EXISTS fleet_document_versions_change_summary_check,
  ADD CONSTRAINT fleet_document_versions_change_summary_check CHECK (change_summary IS NULL OR (change_summary = btrim(change_summary) AND length(change_summary) BETWEEN 1 AND 1000)),
  DROP CONSTRAINT IF EXISTS fleet_document_versions_file_check,
  ADD CONSTRAINT fleet_document_versions_file_check CHECK (length(file_name) BETWEEN 1 AND 255 AND size_bytes > 0 AND length(storage_path) BETWEEN 1 AND 512),
  DROP CONSTRAINT IF EXISTS fleet_document_versions_lifecycle_check,
  ADD CONSTRAINT fleet_document_versions_lifecycle_check CHECK (
    (state = 'draft' AND published_at IS NULL AND published_by IS NULL AND superseded_at IS NULL)
    OR (state = 'published' AND published_at IS NOT NULL AND superseded_at IS NULL)
    OR (state = 'superseded' AND published_at IS NOT NULL AND superseded_at IS NOT NULL));

-- One draft and one published version per document; a file serves one version; labels unique per document.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_document_versions_one_draft ON public.fleet_document_versions (document_id) WHERE state = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS fleet_document_versions_one_published ON public.fleet_document_versions (document_id) WHERE state = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS fleet_document_versions_file_key ON public.fleet_document_versions (file_object_id);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_document_versions_label_key ON public.fleet_document_versions (document_id, lower(version_label));
CREATE INDEX IF NOT EXISTS idx_fleet_document_versions_company ON public.fleet_document_versions (company_id, state);

-- The document's current version is one of its own versions (added once
-- both tables exist; a foreign key cannot be added IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_documents_current_version_fkey' AND conrelid = 'public.fleet_documents'::regclass) THEN
    ALTER TABLE public.fleet_documents
      ADD CONSTRAINT fleet_documents_current_version_fkey FOREIGN KEY (current_version_id, id) REFERENCES public.fleet_document_versions (id, document_id);
  END IF;
END
$$;

-- ---------------------------------------------------------------- fleet_document_vessel_targets (FD3 data)

-- The vessels a 'selected' document is published to. A deleted vessel takes
-- its target rows with it (a referential cascade passes the guard).
CREATE TABLE IF NOT EXISTS public.fleet_document_vessel_targets (
  document_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  company_id uuid NOT NULL,
  added_by uuid NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_document_vessel_targets_pkey PRIMARY KEY (document_id, vessel_id),
  CONSTRAINT fleet_document_vessel_targets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_vessel_targets_document_fkey FOREIGN KEY (document_id, company_id) REFERENCES public.fleet_documents (id, company_id) ON DELETE CASCADE,
  CONSTRAINT fleet_document_vessel_targets_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fleet_document_vessel_targets_vessel ON public.fleet_document_vessel_targets (vessel_id);
CREATE INDEX IF NOT EXISTS idx_fleet_document_vessel_targets_company ON public.fleet_document_vessel_targets (company_id);

-- ---------------------------------------------------------------- fleet_document_events (D-X5-23)

-- Append-only. document_id and version_id carry no foreign key: the
-- history of a deleted draft stays. Taxonomy events (sections, types) have
-- no document.
CREATE TABLE IF NOT EXISTS public.fleet_document_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  document_id uuid NULL,
  version_id uuid NULL,
  vessel_id uuid NULL,
  actor_user_id uuid NULL,
  action text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  comment text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_document_events_pkey PRIMARY KEY (id),
  CONSTRAINT fleet_document_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE
);

ALTER TABLE public.fleet_document_events
  DROP CONSTRAINT IF EXISTS fleet_document_events_action_check,
  ADD CONSTRAINT fleet_document_events_action_check CHECK (action IN (
    'section_created', 'section_renamed', 'sections_reordered', 'section_deleted',
    'type_created', 'type_updated', 'type_deleted',
    'document_created', 'details_updated', 'version_added', 'version_replaced', 'targets_set',
    'published', 'withdrawn', 'draft_deleted')),
  DROP CONSTRAINT IF EXISTS fleet_document_events_from_status_check,
  ADD CONSTRAINT fleet_document_events_from_status_check CHECK (from_status IS NULL OR from_status IN ('draft', 'published', 'withdrawn')),
  DROP CONSTRAINT IF EXISTS fleet_document_events_to_status_check,
  ADD CONSTRAINT fleet_document_events_to_status_check CHECK (to_status IS NULL OR to_status IN ('draft', 'published', 'withdrawn')),
  DROP CONSTRAINT IF EXISTS fleet_document_events_comment_check,
  ADD CONSTRAINT fleet_document_events_comment_check CHECK (comment IS NULL OR length(comment) <= 2000),
  DROP CONSTRAINT IF EXISTS fleet_document_events_payload_check,
  ADD CONSTRAINT fleet_document_events_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  -- A document event names its document; a taxonomy event has none.
  DROP CONSTRAINT IF EXISTS fleet_document_events_subject_check,
  ADD CONSTRAINT fleet_document_events_subject_check CHECK (
    (action IN ('section_created', 'section_renamed', 'sections_reordered', 'section_deleted', 'type_created', 'type_updated', 'type_deleted'))
    = (document_id IS NULL));

CREATE INDEX IF NOT EXISTS idx_fleet_document_events_company ON public.fleet_document_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_document_events_document ON public.fleet_document_events (document_id, created_at);

-- ---------------------------------------------------------------- guards (every role)

-- Documents: the lifecycle columns move only inside the definers; a new
-- row starts as a draft; a published or withdrawn row keeps its content
-- and is never deleted; a row never changes its id or company.
CREATE OR REPLACE FUNCTION public.fleet_documents_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_documents_guarded', DETAIL = 'A fleet document never changes its id or company.';
  END IF;
  IF current_setting('storm.fleet_tx', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- A referential cascade (the company deleted) runs one trigger level down.
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_documents_guarded', DETAIL = 'A published or withdrawn fleet document is withdrawn, never deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft' OR NEW.current_version_id IS NOT NULL OR NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL
       OR NEW.withdrawn_at IS NOT NULL OR NEW.withdrawn_by IS NOT NULL OR NEW.withdrawn_reason IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_documents_guarded', DETAIL = 'A fleet document starts as a draft; only fleet_document_publish() publishes it.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.current_version_id IS DISTINCT FROM OLD.current_version_id
     OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_by IS DISTINCT FROM OLD.published_by
     OR NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at OR NEW.withdrawn_by IS DISTINCT FROM OLD.withdrawn_by
     OR NEW.withdrawn_reason IS DISTINCT FROM OLD.withdrawn_reason THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_documents_guarded', DETAIL = 'Only the fleet document definers change a document''s status.';
  END IF;
  IF OLD.status <> 'draft' AND (NEW.type_id, NEW.title, NEW.description, NEW.target_mode, NEW.ack_required, NEW.ack_due_days)
                               IS DISTINCT FROM (OLD.type_id, OLD.title, OLD.description, OLD.target_mode, OLD.ack_required, OLD.ack_due_days) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_documents_guarded', DETAIL = 'A published fleet document changes only through fleet_document_update().';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_documents_guard ON public.fleet_documents;
CREATE TRIGGER trg_fleet_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_documents
  FOR EACH ROW EXECUTE FUNCTION public.fleet_documents_guard();

-- Versions: the state columns move only inside the definers; a new version
-- is a draft whose file is a live object of its company stored for its
-- document; a published or superseded version is read-only and never
-- deleted; identity columns never change.
CREATE OR REPLACE FUNCTION public.fleet_document_versions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
                           OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.version_no IS DISTINCT FROM OLD.version_no) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_versions_guarded', DETAIL = 'A version never changes its id, company, document or number.';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.file_object_id IS DISTINCT FROM OLD.file_object_id)
     AND NOT EXISTS (SELECT 1 FROM public.file_objects AS f
                     WHERE f.id = NEW.file_object_id AND f.company_id = NEW.company_id AND f.vessel_id IS NULL
                       AND f.module_key = 'documents' AND f.entity_type = 'fleet_document' AND f.entity_id = NEW.document_id
                       AND f.storage_path = NEW.storage_path) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_versions_guarded', DETAIL = 'A version''s file is a records object stored for its own document.';
  END IF;
  IF current_setting('storm.fleet_tx', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    IF OLD.state <> 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_versions_guarded', DETAIL = 'A published or superseded version is kept.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state IS DISTINCT FROM 'draft' OR NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL OR NEW.superseded_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_versions_guarded', DETAIL = 'A version starts as a draft; only fleet_document_publish() publishes it.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.published_by IS DISTINCT FROM OLD.published_by OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_versions_guarded', DETAIL = 'Only fleet_document_publish() changes a version''s state.';
  END IF;
  IF OLD.state <> 'draft' AND (NEW.version_label, NEW.version_kind, NEW.effective_date, NEW.file_object_id, NEW.storage_path,
                               NEW.file_name, NEW.mime_type, NEW.size_bytes, NEW.change_summary)
                              IS DISTINCT FROM (OLD.version_label, OLD.version_kind, OLD.effective_date, OLD.file_object_id, OLD.storage_path,
                               OLD.file_name, OLD.mime_type, OLD.size_bytes, OLD.change_summary) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_versions_guarded', DETAIL = 'A published or superseded version is read-only.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_document_versions_guard ON public.fleet_document_versions;
CREATE TRIGGER trg_fleet_document_versions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.fleet_document_versions_guard();

-- Targets: written only by fleet_document_set_targets() (and removed by a
-- referential cascade); the vessel is always one of the row's company.
CREATE OR REPLACE FUNCTION public.fleet_document_vessel_targets_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_vessel_targets_guarded', DETAIL = 'A target vessel belongs to the document''s company.';
  END IF;
  IF current_setting('storm.fleet_tx', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_vessel_targets_guarded', DETAIL = 'Only fleet_document_set_targets() changes a document''s vessels.';
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_document_vessel_targets_guard ON public.fleet_document_vessel_targets;
CREATE TRIGGER trg_fleet_document_vessel_targets_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_document_vessel_targets
  FOR EACH ROW EXECUTE FUNCTION public.fleet_document_vessel_targets_guard();

-- Events: inserted only by the definers; never updated or deleted (a
-- referential cascade of the deleted company excepted).
CREATE OR REPLACE FUNCTION public.fleet_document_events_guard()
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
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_events_guarded', DETAIL = 'Fleet document history is written only by the fleet document definers.';
  END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'fleet_document_events_guarded', DETAIL = 'Fleet document history is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_document_events_guard ON public.fleet_document_events;
CREATE TRIGGER trg_fleet_document_events_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_document_events
  FOR EACH ROW EXECUTE FUNCTION public.fleet_document_events_guard();

-- updated_at (events are append-only and have none).
DROP TRIGGER IF EXISTS trg_fleet_document_sections_updated_at ON public.fleet_document_sections;
CREATE TRIGGER trg_fleet_document_sections_updated_at
  BEFORE UPDATE ON public.fleet_document_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_fleet_document_types_updated_at ON public.fleet_document_types;
CREATE TRIGGER trg_fleet_document_types_updated_at
  BEFORE UPDATE ON public.fleet_document_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_fleet_documents_updated_at ON public.fleet_documents;
CREATE TRIGGER trg_fleet_documents_updated_at
  BEFORE UPDATE ON public.fleet_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_fleet_document_versions_updated_at ON public.fleet_document_versions;
CREATE TRIGGER trg_fleet_document_versions_updated_at
  BEFORE UPDATE ON public.fleet_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_fleet_document_vessel_targets_updated_at ON public.fleet_document_vessel_targets;
CREATE TRIGGER trg_fleet_document_vessel_targets_updated_at
  BEFORE UPDATE ON public.fleet_document_vessel_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- visibility helpers

-- Whether the published document is visible to _user_id as a member of a
-- vessel it targets: the user is active, of the document's company, and
-- reaches (reach or fleet reach) a targeted vessel that is not archived or
-- Sold - for 'all_including_future' any counted active vessel of the
-- company, also one added after publishing. A draft or withdrawn document,
-- an unknown id or another company: false. A signed-in caller may ask only
-- about themselves (any other user id answers false); the service role
-- (no JWT) asks about anyone. The library policies call it with
-- auth.uid(); X5-05A's storage read-hook predicate reuses it.
CREATE OR REPLACE FUNCTION public.fleet_document_visible(p_user_id uuid, p_document_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  d record;
  v_fleet boolean;
BEGIN
  IF p_user_id IS NULL OR p_document_id IS NULL THEN
    RETURN false;
  END IF;
  IF v_uid IS NOT NULL AND v_uid IS DISTINCT FROM p_user_id THEN
    RETURN false;
  END IF;
  IF NOT coalesce(public.user_is_active(p_user_id), false) THEN
    RETURN false;
  END IF;
  SELECT fd.company_id, fd.status, fd.target_mode INTO d FROM public.fleet_documents AS fd WHERE fd.id = p_document_id;
  IF NOT FOUND OR d.status IS DISTINCT FROM 'published' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = p_user_id AND p.company_id = d.company_id) THEN
    RETURN false;
  END IF;
  v_fleet := coalesce(public.fleet_reach_for(p_user_id, d.company_id), false);
  IF d.target_mode = 'all_including_future' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.vessels AS v
      WHERE v.company_id = d.company_id
        AND v.is_counted
        AND v.lifecycle_status = 'active'
        AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
        AND (v_fleet OR coalesce(public.reach_vessel_for(p_user_id, v.id), false)));
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.fleet_document_vessel_targets AS t
    JOIN public.vessels AS v ON v.id = t.vessel_id AND v.company_id = d.company_id
    WHERE t.document_id = p_document_id
      AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
      AND (v_fleet OR coalesce(public.reach_vessel_for(p_user_id, t.vessel_id), false)));
END;
$$;

-- ---------------------------------------------------------------- RLS (read only)

ALTER TABLE public.fleet_document_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_document_vessel_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_document_events ENABLE ROW LEVEL SECURITY;

-- The taxonomy: active members of the row's company (crew group their
-- vessel's documents by it). get_user_company_id() is NULL for an inactive
-- caller (D-157); computed once per statement.
DROP POLICY IF EXISTS fleet_document_sections_select ON public.fleet_document_sections;
CREATE POLICY fleet_document_sections_select ON public.fleet_document_sections
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS fleet_document_types_select ON public.fleet_document_types;
CREATE POLICY fleet_document_types_select ON public.fleet_document_types
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

-- Documents: library editors every state; library readers (fleet reach and
-- documents view) published and withdrawn ones; anyone a published
-- document is visible to (a targeted vessel they reach). The two access
-- answers are about the caller's own company and are computed once.
DROP POLICY IF EXISTS fleet_documents_select ON public.fleet_documents;
CREATE POLICY fleet_documents_select ON public.fleet_documents
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (
      (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'documents', 'edit'))
      OR (status <> 'draft' AND (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'documents', 'view')))
      OR (status = 'published' AND public.fleet_document_visible(auth.uid(), id))
    )
  );

-- Versions: the same, by version state (a non-draft version always belongs
-- to a published or withdrawn document); the people a document is visible
-- to read its published version only.
DROP POLICY IF EXISTS fleet_document_versions_select ON public.fleet_document_versions;
CREATE POLICY fleet_document_versions_select ON public.fleet_document_versions
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (
      (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'documents', 'edit'))
      OR (state <> 'draft' AND (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'documents', 'view')))
      OR (state = 'published' AND public.fleet_document_visible(auth.uid(), document_id))
    )
  );

-- Targets: library editors; library readers for documents that are not drafts.
DROP POLICY IF EXISTS fleet_document_vessel_targets_select ON public.fleet_document_vessel_targets;
CREATE POLICY fleet_document_vessel_targets_select ON public.fleet_document_vessel_targets
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (
      (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'documents', 'edit'))
      OR ((SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'documents', 'view'))
          AND EXISTS (SELECT 1 FROM public.fleet_documents AS d WHERE d.id = document_id AND d.status <> 'draft'))
    )
  );

-- Events: library editors; library readers for taxonomy events and the
-- history of documents that are not drafts.
DROP POLICY IF EXISTS fleet_document_events_select ON public.fleet_document_events;
CREATE POLICY fleet_document_events_select ON public.fleet_document_events
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (
      (SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'documents', 'edit'))
      OR ((SELECT public.fleet_ops_can(public.get_user_company_id(auth.uid()), NULL::uuid, 'documents', 'view'))
          AND (document_id IS NULL OR EXISTS (SELECT 1 FROM public.fleet_documents AS d WHERE d.id = document_id AND d.status <> 'draft')))
    )
  );

REVOKE ALL ON public.fleet_document_sections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_document_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_document_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_document_vessel_targets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_document_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_document_sections, public.fleet_document_types, public.fleet_documents,
  public.fleet_document_versions, public.fleet_document_vessel_targets, public.fleet_document_events TO authenticated;
GRANT ALL ON public.fleet_document_sections, public.fleet_document_types, public.fleet_documents,
  public.fleet_document_versions, public.fleet_document_vessel_targets, public.fleet_document_events TO service_role;

-- ---------------------------------------------------------------- internal helpers (service role)

-- The caller's company, once the caller may act on the library at _level
-- ('edit' or 'admin'): an active member with fleet reach and the documents
-- rule (fleet_ops_can_for, D-X5-21). Otherwise 42501 not_permitted.
CREATE OR REPLACE FUNCTION public.fleet_document_gate(_level text)
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
  IF v_uid IS NULL OR _level IS NULL OR _level NOT IN ('edit', 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL OR NOT coalesce(public.fleet_ops_can_for(v_uid, v_company, NULL, 'documents', _level), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  RETURN v_company;
END;
$$;

-- One history row (D-X5-23), with the caller as actor. Internal: the
-- definers call it after their change.
CREATE OR REPLACE FUNCTION public.fleet_document_log(
  _company_id uuid,
  _document_id uuid,
  _version_id uuid,
  _action text,
  _from_status text,
  _to_status text,
  _comment text,
  _payload jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
BEGIN
  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.fleet_document_events (company_id, document_id, version_id, actor_user_id, action, from_status, to_status, comment, payload)
  VALUES (_company_id, _document_id, _version_id, auth.uid(), _action, _from_status, _to_status, left(_comment, 2000), coalesce(_payload, '{}'::jsonb));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
END;
$$;

-- ---------------------------------------------------------------- taxonomy definers (FD1, FD10)

-- Adds a section (p_id NULL; placed last) or renames one. Name: trimmed,
-- 1-80 characters, unique in the company (case-insensitive).
CREATE OR REPLACE FUNCTION public.fleet_document_section_save(p_id uuid, p_name text)
RETURNS public.fleet_document_sections
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_name text := btrim(coalesce(p_name, ''));
  s public.fleet_document_sections;
  v_old text;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'name_required';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'name_too_long';
  END IF;
  IF p_id IS NULL THEN
    BEGIN
      INSERT INTO public.fleet_document_sections (company_id, name, sort_order, created_by, updated_by)
      VALUES (v_company, v_name,
              coalesce((SELECT max(x.sort_order) FROM public.fleet_document_sections AS x WHERE x.company_id = v_company), 0) + 1,
              v_uid, v_uid)
      RETURNING * INTO s;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_name_taken';
    END;
    PERFORM public.fleet_document_log(v_company, NULL, NULL, 'section_created', NULL, NULL, NULL,
      jsonb_build_object('section_id', s.id, 'name', s.name));
    RETURN s;
  END IF;

  SELECT * INTO s FROM public.fleet_document_sections WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'section_not_found';
  END IF;
  IF s.name = v_name THEN
    RETURN s;
  END IF;
  v_old := s.name;
  BEGIN
    UPDATE public.fleet_document_sections SET name = v_name, updated_by = v_uid WHERE id = p_id RETURNING * INTO s;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_name_taken';
  END;
  PERFORM public.fleet_document_log(v_company, NULL, NULL, 'section_renamed', NULL, NULL, NULL,
    jsonb_build_object('section_id', s.id, 'name', s.name, 'previous_name', v_old));
  RETURN s;
END;
$$;

-- Puts the company's sections in the order given: every section of the
-- company exactly once (else 22023 reorder_mismatch). Returns the sections
-- in their new order.
CREATE OR REPLACE FUNCTION public.fleet_document_sections_reorder(p_ids uuid[])
RETURNS SETOF public.fleet_document_sections
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_changed integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0
     OR (SELECT count(DISTINCT x) FROM unnest(p_ids) AS x WHERE x IS NOT NULL) <> cardinality(p_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reorder_mismatch';
  END IF;
  PERFORM 1 FROM public.fleet_document_sections WHERE company_id = v_company ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT s.id FROM public.fleet_document_sections AS s WHERE s.company_id = v_company EXCEPT SELECT unnest(p_ids))
     OR EXISTS (SELECT unnest(p_ids) EXCEPT SELECT s.id FROM public.fleet_document_sections AS s WHERE s.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reorder_mismatch';
  END IF;
  UPDATE public.fleet_document_sections AS s
  SET sort_order = o.ord::integer, updated_by = v_uid
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
  WHERE s.id = o.id AND s.company_id = v_company AND s.sort_order IS DISTINCT FROM o.ord::integer;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed > 0 THEN
    PERFORM public.fleet_document_log(v_company, NULL, NULL, 'sections_reordered', NULL, NULL, NULL,
      jsonb_build_object('order', to_jsonb(p_ids)));
  END IF;
  RETURN QUERY
    SELECT * FROM public.fleet_document_sections WHERE company_id = v_company ORDER BY sort_order, lower(name), id;
END;
$$;

-- Deletes a section and its empty types. Refused while any of its types
-- holds a document, whatever its state (22023 section_in_use; W1 delete
-- rules). Needs documents admin. Returns the deleted section.
CREATE OR REPLACE FUNCTION public.fleet_document_section_delete(p_id uuid)
RETURNS public.fleet_document_sections
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.fleet_document_gate('admin');
  s public.fleet_document_sections;
  v_types integer;
BEGIN
  SELECT * INTO s FROM public.fleet_document_sections WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'section_not_found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_documents AS d JOIN public.fleet_document_types AS t ON t.id = d.type_id WHERE t.section_id = p_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_in_use';
  END IF;
  BEGIN
    DELETE FROM public.fleet_document_types WHERE section_id = p_id AND company_id = v_company;
    GET DIAGNOSTICS v_types = ROW_COUNT;
    DELETE FROM public.fleet_document_sections WHERE id = p_id AND company_id = v_company RETURNING * INTO s;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_in_use';
  END;
  PERFORM public.fleet_document_log(v_company, NULL, NULL, 'section_deleted', NULL, NULL, NULL,
    jsonb_build_object('section_id', s.id, 'name', s.name, 'types_deleted', v_types));
  RETURN s;
END;
$$;

-- Adds a document type to a section (p_id NULL; placed last in it) or
-- changes one: its name (trimmed, 1-80, unique in its section), section
-- (moves it, placed last there), acknowledgement defaults (required, days
-- 1-365), version kind default (major | minor) and whether vessels hide it
-- while it holds nothing published. On a change a NULL keeps the value; on
-- create a NULL takes the table default (true, 14, major, false). The
-- defaults apply to documents created afterwards.
CREATE OR REPLACE FUNCTION public.fleet_document_type_save(
  p_id uuid,
  p_section_id uuid,
  p_name text,
  p_ack_required_default boolean DEFAULT NULL,
  p_ack_due_days_default integer DEFAULT NULL,
  p_version_kind_default text DEFAULT NULL,
  p_hide_when_empty boolean DEFAULT NULL
)
RETURNS public.fleet_document_types
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  t public.fleet_document_types;
  n public.fleet_document_types;
  v_section uuid;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF v_name IS NOT NULL AND length(v_name) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'name_too_long';
  END IF;
  IF p_ack_due_days_default IS NOT NULL AND p_ack_due_days_default NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_ack_due_days';
  END IF;
  IF p_version_kind_default IS NOT NULL AND p_version_kind_default NOT IN ('major', 'minor') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_version_kind';
  END IF;
  IF p_section_id IS NOT NULL THEN
    SELECT s.id INTO v_section FROM public.fleet_document_sections AS s WHERE s.id = p_section_id AND s.company_id = v_company FOR SHARE;
    IF v_section IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'section_not_found';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'name_required';
    END IF;
    IF v_section IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_required';
    END IF;
    BEGIN
      INSERT INTO public.fleet_document_types (company_id, section_id, name, sort_order, ack_required_default, ack_due_days_default,
                                               version_kind_default, hide_when_empty, created_by, updated_by)
      VALUES (v_company, v_section, v_name,
              coalesce((SELECT max(x.sort_order) FROM public.fleet_document_types AS x WHERE x.section_id = v_section), 0) + 1,
              coalesce(p_ack_required_default, true), coalesce(p_ack_due_days_default, 14),
              coalesce(p_version_kind_default, 'major'), coalesce(p_hide_when_empty, false), v_uid, v_uid)
      RETURNING * INTO n;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'type_name_taken';
    END;
    PERFORM public.fleet_document_log(v_company, NULL, NULL, 'type_created', NULL, NULL, NULL,
      jsonb_build_object('type_id', n.id, 'section_id', n.section_id, 'name', n.name));
    RETURN n;
  END IF;

  SELECT * INTO t FROM public.fleet_document_types WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'type_not_found';
  END IF;
  IF v_name IS NOT NULL AND v_name IS DISTINCT FROM t.name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(t.name, v_name));
  END IF;
  IF v_section IS NOT NULL AND v_section IS DISTINCT FROM t.section_id THEN
    v_changes := v_changes || jsonb_build_object('section_id', jsonb_build_array(t.section_id, v_section));
  END IF;
  IF p_ack_required_default IS NOT NULL AND p_ack_required_default IS DISTINCT FROM t.ack_required_default THEN
    v_changes := v_changes || jsonb_build_object('ack_required_default', jsonb_build_array(t.ack_required_default, p_ack_required_default));
  END IF;
  IF p_ack_due_days_default IS NOT NULL AND p_ack_due_days_default IS DISTINCT FROM t.ack_due_days_default THEN
    v_changes := v_changes || jsonb_build_object('ack_due_days_default', jsonb_build_array(t.ack_due_days_default, p_ack_due_days_default));
  END IF;
  IF p_version_kind_default IS NOT NULL AND p_version_kind_default IS DISTINCT FROM t.version_kind_default THEN
    v_changes := v_changes || jsonb_build_object('version_kind_default', jsonb_build_array(t.version_kind_default, p_version_kind_default));
  END IF;
  IF p_hide_when_empty IS NOT NULL AND p_hide_when_empty IS DISTINCT FROM t.hide_when_empty THEN
    v_changes := v_changes || jsonb_build_object('hide_when_empty', jsonb_build_array(t.hide_when_empty, p_hide_when_empty));
  END IF;
  IF v_changes = '{}'::jsonb THEN
    RETURN t;
  END IF;
  BEGIN
    UPDATE public.fleet_document_types SET
      name = coalesce(v_name, name),
      section_id = coalesce(v_section, section_id),
      sort_order = CASE WHEN v_section IS NOT NULL AND v_section IS DISTINCT FROM t.section_id
                        THEN coalesce((SELECT max(x.sort_order) FROM public.fleet_document_types AS x WHERE x.section_id = v_section), 0) + 1
                        ELSE sort_order END,
      ack_required_default = coalesce(p_ack_required_default, ack_required_default),
      ack_due_days_default = coalesce(p_ack_due_days_default, ack_due_days_default),
      version_kind_default = coalesce(p_version_kind_default, version_kind_default),
      hide_when_empty = coalesce(p_hide_when_empty, hide_when_empty),
      updated_by = v_uid
    WHERE id = p_id
    RETURNING * INTO n;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'type_name_taken';
  END;
  PERFORM public.fleet_document_log(v_company, NULL, NULL, 'type_updated', NULL, NULL, NULL,
    jsonb_build_object('type_id', n.id, 'section_id', n.section_id, 'name', n.name, 'changes', v_changes));
  RETURN n;
END;
$$;

-- Deletes a document type that holds no document in any state (22023
-- type_in_use otherwise; W1). Needs documents admin. Returns the deleted type.
CREATE OR REPLACE FUNCTION public.fleet_document_type_delete(p_id uuid)
RETURNS public.fleet_document_types
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.fleet_document_gate('admin');
  t public.fleet_document_types;
BEGIN
  SELECT * INTO t FROM public.fleet_document_types WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'type_not_found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_documents AS d WHERE d.type_id = p_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'type_in_use';
  END IF;
  BEGIN
    DELETE FROM public.fleet_document_types WHERE id = p_id AND company_id = v_company RETURNING * INTO t;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'type_in_use';
  END;
  PERFORM public.fleet_document_log(v_company, NULL, NULL, 'type_deleted', NULL, NULL, NULL,
    jsonb_build_object('type_id', t.id, 'section_id', t.section_id, 'name', t.name));
  RETURN t;
END;
$$;

-- ---------------------------------------------------------------- document definers (FD2, FD4; W1)

-- Starts a document as a draft in a type of the caller's company: the
-- crew-facing title (trimmed, 1-160), an optional description (blank =
-- none, up to 2000), and the acknowledgement settings (NULL = the type's
-- defaults; days 1-365). Targets start empty in 'selected' mode.
CREATE OR REPLACE FUNCTION public.fleet_document_create(
  p_type_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_ack_required boolean DEFAULT NULL,
  p_ack_due_days integer DEFAULT NULL
)
RETURNS public.fleet_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  t public.fleet_document_types;
  d public.fleet_documents;
BEGIN
  SELECT * INTO t FROM public.fleet_document_types WHERE id = p_type_id AND company_id = v_company FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'type_not_found';
  END IF;
  IF v_title = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'title_required';
  END IF;
  IF length(v_title) > 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'title_too_long';
  END IF;
  IF v_description IS NOT NULL AND length(v_description) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'description_too_long';
  END IF;
  IF p_ack_due_days IS NOT NULL AND p_ack_due_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_ack_due_days';
  END IF;
  PERFORM set_config('storm.fleet_tx', 'on', true);
  INSERT INTO public.fleet_documents (company_id, type_id, title, description, status, target_mode, ack_required, ack_due_days, created_by, updated_by)
  VALUES (v_company, t.id, v_title, v_description, 'draft', 'selected',
          coalesce(p_ack_required, t.ack_required_default), coalesce(p_ack_due_days, t.ack_due_days_default), v_uid, v_uid)
  RETURNING * INTO d;
  PERFORM public.fleet_document_log(v_company, d.id, NULL, 'document_created', NULL, 'draft', NULL,
    jsonb_build_object('type_id', d.type_id, 'title', d.title));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN d;
END;
$$;

-- Changes a draft or published document's details (machine action
-- edit_details): type (of the company), title, description ('' clears it)
-- and acknowledgement settings; a NULL keeps the value. Refused for a
-- withdrawn document (22023 document_withdrawn) and on a stale updated_at
-- (22023 stale_document; p_expected_updated_at is required). A change to a
-- published document applies to its vessels at once; the acknowledgement
-- settings apply to versions published afterwards.
CREATE OR REPLACE FUNCTION public.fleet_document_update(
  p_document_id uuid,
  p_expected_updated_at timestamptz,
  p_type_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_ack_required boolean DEFAULT NULL,
  p_ack_due_days integer DEFAULT NULL
)
RETURNS public.fleet_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  d public.fleet_documents;
  n public.fleet_documents;
  v_title text := CASE WHEN p_title IS NULL THEN NULL ELSE btrim(p_title) END;
  v_description text := CASE WHEN p_description IS NULL THEN NULL ELSE nullif(btrim(p_description), '') END;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO d FROM public.fleet_documents WHERE id = p_document_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found';
  END IF;
  IF d.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_withdrawn';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected_updated_at_required';
  END IF;
  IF d.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stale_document';
  END IF;
  IF v_title IS NOT NULL AND v_title = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'title_required';
  END IF;
  IF v_title IS NOT NULL AND length(v_title) > 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'title_too_long';
  END IF;
  IF v_description IS NOT NULL AND length(v_description) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'description_too_long';
  END IF;
  IF p_ack_due_days IS NOT NULL AND p_ack_due_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_ack_due_days';
  END IF;
  IF p_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fleet_document_types AS t WHERE t.id = p_type_id AND t.company_id = v_company) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'type_not_found';
  END IF;

  IF p_type_id IS NOT NULL AND p_type_id IS DISTINCT FROM d.type_id THEN
    v_changes := v_changes || jsonb_build_object('type_id', jsonb_build_array(d.type_id, p_type_id));
  END IF;
  IF v_title IS NOT NULL AND v_title IS DISTINCT FROM d.title THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_array(d.title, v_title));
  END IF;
  IF p_description IS NOT NULL AND v_description IS DISTINCT FROM d.description THEN
    v_changes := v_changes || jsonb_build_object('description', true);
  END IF;
  IF p_ack_required IS NOT NULL AND p_ack_required IS DISTINCT FROM d.ack_required THEN
    v_changes := v_changes || jsonb_build_object('ack_required', jsonb_build_array(d.ack_required, p_ack_required));
  END IF;
  IF p_ack_due_days IS NOT NULL AND p_ack_due_days IS DISTINCT FROM d.ack_due_days THEN
    v_changes := v_changes || jsonb_build_object('ack_due_days', jsonb_build_array(d.ack_due_days, p_ack_due_days));
  END IF;
  IF v_changes = '{}'::jsonb THEN
    RETURN d;
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.fleet_documents SET
    type_id = coalesce(p_type_id, type_id),
    title = coalesce(v_title, title),
    description = CASE WHEN p_description IS NULL THEN description ELSE v_description END,
    ack_required = coalesce(p_ack_required, ack_required),
    ack_due_days = coalesce(p_ack_due_days, ack_due_days),
    updated_by = v_uid
  WHERE id = d.id
  RETURNING * INTO n;
  PERFORM public.fleet_document_log(v_company, d.id, NULL, 'details_updated', d.status, n.status, NULL, jsonb_build_object('changes', v_changes));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Adds the next version of a draft or published document (machine action
-- add_version), or replaces the file and details of its draft version when
-- it has one (at most one draft per document). The file is a live records
-- object of the company stored at
-- <company>/fleet/documents/fleet_document/<document_id>/… and used by no
-- other version (P0002 file_not_found for an unknown or foreign file;
-- 22023 file_removed, file_not_for_document, file_in_use). Label: trimmed,
-- up to 40 characters, unique in the document, 'v<number>' when blank.
-- Kind: major | minor, the type's default when NULL. Effective date:
-- today when NULL. Change summary: up to 1000. Returns the version.
CREATE OR REPLACE FUNCTION public.fleet_document_add_version(
  p_document_id uuid,
  p_file_object_id uuid,
  p_version_label text DEFAULT NULL,
  p_version_kind text DEFAULT NULL,
  p_effective_date date DEFAULT NULL,
  p_change_summary text DEFAULT NULL
)
RETURNS public.fleet_document_versions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  d public.fleet_documents;
  f public.file_objects;
  v public.fleet_document_versions;
  v_draft public.fleet_document_versions;
  v_label text := nullif(btrim(coalesce(p_version_label, '')), '');
  v_kind text;
  v_summary text := nullif(btrim(coalesce(p_change_summary, '')), '');
  v_no integer;
BEGIN
  SELECT * INTO d FROM public.fleet_documents WHERE id = p_document_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found';
  END IF;
  IF d.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_withdrawn';
  END IF;
  SELECT * INTO f FROM public.file_objects WHERE id = p_file_object_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'file_not_found';
  END IF;
  IF f.removed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_removed';
  END IF;
  IF f.bucket <> 'records' OR f.vessel_id IS NOT NULL OR f.module_key <> 'documents' OR f.entity_type <> 'fleet_document' OR f.entity_id <> d.id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_not_for_document';
  END IF;
  IF v_label IS NOT NULL AND length(v_label) > 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_label_too_long';
  END IF;
  IF v_summary IS NOT NULL AND length(v_summary) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'change_summary_too_long';
  END IF;
  v_kind := coalesce(p_version_kind, (SELECT t.version_kind_default FROM public.fleet_document_types AS t WHERE t.id = d.type_id), 'major');
  IF v_kind NOT IN ('major', 'minor') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_version_kind';
  END IF;

  SELECT * INTO v_draft FROM public.fleet_document_versions WHERE document_id = d.id AND state = 'draft' FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.fleet_document_versions AS x
             WHERE x.file_object_id = f.id AND (v_draft.id IS NULL OR x.id <> v_draft.id)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_in_use';
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  IF v_draft.id IS NOT NULL THEN
    BEGIN
      UPDATE public.fleet_document_versions SET
        version_label = coalesce(v_label, 'v' || version_no),
        version_kind = v_kind,
        effective_date = coalesce(p_effective_date, current_date),
        file_object_id = f.id,
        storage_path = f.storage_path,
        file_name = f.original_name,
        mime_type = f.mime_type,
        size_bytes = f.size_bytes,
        change_summary = v_summary,
        updated_by = v_uid
      WHERE id = v_draft.id
      RETURNING * INTO v;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_label_taken';
    END;
    PERFORM public.fleet_document_log(v_company, d.id, v.id, 'version_replaced', d.status, d.status, NULL,
      jsonb_build_object('version_no', v.version_no, 'version_label', v.version_label, 'version_kind', v.version_kind,
                         'file_object_id', v.file_object_id, 'previous_file_object_id', v_draft.file_object_id));
  ELSE
    v_no := coalesce((SELECT max(x.version_no) FROM public.fleet_document_versions AS x WHERE x.document_id = d.id), 0) + 1;
    BEGIN
      INSERT INTO public.fleet_document_versions (company_id, document_id, version_no, version_label, version_kind, effective_date,
                                                  file_object_id, storage_path, file_name, mime_type, size_bytes, state, change_summary,
                                                  created_by, updated_by)
      VALUES (v_company, d.id, v_no, coalesce(v_label, 'v' || v_no), v_kind, coalesce(p_effective_date, current_date),
              f.id, f.storage_path, f.original_name, f.mime_type, f.size_bytes, 'draft', v_summary, v_uid, v_uid)
      RETURNING * INTO v;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_label_taken';
    END;
    PERFORM public.fleet_document_log(v_company, d.id, v.id, 'version_added', d.status, d.status, NULL,
      jsonb_build_object('version_no', v.version_no, 'version_label', v.version_label, 'version_kind', v.version_kind, 'file_object_id', v.file_object_id));
  END IF;
  -- The document changed (its versions): a publish prepared before this is stale.
  UPDATE public.fleet_documents SET updated_by = v_uid WHERE id = d.id;
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN v;
END;
$$;

-- Sets where a draft or published document is published (machine action
-- set_targets): 'all_including_future' (every counted vessel of the
-- company, also ones added later; p_vessel_ids must be empty) or
-- 'selected' with at least one vessel id (22023 targets_required), each a
-- vessel of the company (42501 vessel_out_of_reach) that is not archived or
-- Sold (22023 vessel_archived). Refused for a withdrawn document. A call
-- that changes nothing writes nothing. Returns the document.
CREATE OR REPLACE FUNCTION public.fleet_document_set_targets(p_document_id uuid, p_target_mode text, p_vessel_ids uuid[] DEFAULT NULL)
RETURNS public.fleet_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  d public.fleet_documents;
  n public.fleet_documents;
  v_ids uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_vessel_ids, '{}'::uuid[])) AS x WHERE x IS NOT NULL ORDER BY x);
  v_id uuid;
  v_added uuid[];
  v_removed uuid[];
BEGIN
  SELECT * INTO d FROM public.fleet_documents WHERE id = p_document_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found';
  END IF;
  IF d.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_withdrawn';
  END IF;
  IF p_target_mode IS NULL OR p_target_mode NOT IN ('all_including_future', 'selected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_target_mode';
  END IF;
  IF p_target_mode = 'all_including_future' AND cardinality(v_ids) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessels_not_expected';
  END IF;
  IF p_target_mode = 'selected' THEN
    IF cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'targets_required';
    END IF;
    FOREACH v_id IN ARRAY v_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = v_id AND v.company_id = v_company) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = v_id AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'vessel_archived';
      END IF;
    END LOOP;
  END IF;

  v_added := ARRAY(SELECT x FROM unnest(v_ids) AS x
                   EXCEPT SELECT t.vessel_id FROM public.fleet_document_vessel_targets AS t WHERE t.document_id = d.id);
  v_removed := ARRAY(SELECT t.vessel_id FROM public.fleet_document_vessel_targets AS t WHERE t.document_id = d.id
                     EXCEPT SELECT x FROM unnest(v_ids) AS x);
  IF d.target_mode = p_target_mode AND cardinality(v_added) = 0 AND cardinality(v_removed) = 0 THEN
    RETURN d;
  END IF;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  DELETE FROM public.fleet_document_vessel_targets WHERE document_id = d.id AND vessel_id = ANY (v_removed);
  INSERT INTO public.fleet_document_vessel_targets (document_id, vessel_id, company_id, added_by)
  SELECT d.id, x, v_company, v_uid FROM unnest(v_added) AS x
  ON CONFLICT (document_id, vessel_id) DO NOTHING;
  UPDATE public.fleet_documents SET target_mode = p_target_mode, updated_by = v_uid WHERE id = d.id RETURNING * INTO n;
  PERFORM public.fleet_document_log(v_company, d.id, NULL, 'targets_set', d.status, n.status, NULL,
    jsonb_build_object('target_mode', p_target_mode, 'previous_target_mode', d.target_mode,
                       'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed), 'vessel_count', cardinality(v_ids)));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Publishes one of the document's draft versions (machine action publish;
-- draft or published -> published). Refused without the caller's last
-- seen updated_at or on a stale one (22023 expected_updated_at_required,
-- stale_document), for a withdrawn document, for a version that is already
-- published or superseded (22023 version_already_published,
-- version_superseded), when the version's file has been removed (22023
-- file_missing) and, in 'selected' mode, when no target vessel is left
-- that is not archived (22023 targets_required). The version published
-- before becomes superseded. The acknowledgement effect is recorded in the
-- event payload (none | fresh | carry_forward | reset). Returns the
-- document.
CREATE OR REPLACE FUNCTION public.fleet_document_publish(p_document_id uuid, p_version_id uuid, p_expected_updated_at timestamptz)
RETURNS public.fleet_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  d public.fleet_documents;
  n public.fleet_documents;
  v public.fleet_document_versions;
  v_superseded uuid;
  v_effect text;
BEGIN
  SELECT * INTO d FROM public.fleet_documents WHERE id = p_document_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found';
  END IF;
  IF d.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_withdrawn';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected_updated_at_required';
  END IF;
  IF d.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stale_document';
  END IF;
  SELECT * INTO v FROM public.fleet_document_versions WHERE id = p_version_id AND document_id = d.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'version_not_found';
  END IF;
  IF v.state = 'published' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_already_published';
  END IF;
  IF v.state = 'superseded' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_superseded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.file_objects AS f WHERE f.id = v.file_object_id AND f.removed_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_missing';
  END IF;
  IF d.target_mode = 'selected' AND NOT EXISTS (
       SELECT 1 FROM public.fleet_document_vessel_targets AS t JOIN public.vessels AS ve ON ve.id = t.vessel_id
       WHERE t.document_id = d.id AND public.vessel_in_reachable_state(ve.lifecycle_status, ve.status)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'targets_required';
  END IF;

  v_superseded := d.current_version_id;
  v_effect := CASE
    WHEN NOT d.ack_required THEN 'none'
    WHEN v_superseded IS NULL THEN 'fresh'
    WHEN v.version_kind = 'minor' THEN 'carry_forward'
    ELSE 'reset'
  END;

  PERFORM set_config('storm.fleet_tx', 'on', true);
  IF v_superseded IS NOT NULL THEN
    UPDATE public.fleet_document_versions SET state = 'superseded', superseded_at = now(), updated_by = v_uid
    WHERE id = v_superseded AND state = 'published';
  END IF;
  UPDATE public.fleet_document_versions SET state = 'published', published_at = now(), published_by = v_uid, updated_by = v_uid
  WHERE id = v.id
  RETURNING * INTO v;
  UPDATE public.fleet_documents SET
    status = 'published',
    current_version_id = v.id,
    published_at = now(),
    published_by = v_uid,
    updated_by = v_uid
  WHERE id = d.id
  RETURNING * INTO n;
  PERFORM public.fleet_document_log(v_company, d.id, v.id, 'published', d.status, 'published', NULL,
    jsonb_build_object('version_no', v.version_no, 'version_label', v.version_label, 'version_kind', v.version_kind,
                       'superseded_version_id', v_superseded, 'ack_effect', v_effect, 'target_mode', n.target_mode));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Withdraws a published document from every vessel with a reason
-- (trimmed, 1-500; 22023 reason_required, reason_too_long); final. A draft
-- is deleted instead (22023 not_published); a withdrawn one is refused
-- (22023 already_withdrawn). Returns the document.
CREATE OR REPLACE FUNCTION public.fleet_document_withdraw(p_document_id uuid, p_reason text)
RETURNS public.fleet_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  v_reason text := btrim(coalesce(p_reason, ''));
  d public.fleet_documents;
  n public.fleet_documents;
BEGIN
  SELECT * INTO d FROM public.fleet_documents WHERE id = p_document_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found';
  END IF;
  IF d.status = 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_published';
  END IF;
  IF d.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'already_withdrawn';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long';
  END IF;
  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.fleet_documents SET
    status = 'withdrawn', withdrawn_at = now(), withdrawn_by = v_uid, withdrawn_reason = v_reason, updated_by = v_uid
  WHERE id = d.id
  RETURNING * INTO n;
  PERFORM public.fleet_document_log(v_company, d.id, d.current_version_id, 'withdrawn', d.status, 'withdrawn', v_reason, '{}'::jsonb);
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN n;
END;
$$;

-- Deletes a document that was never published, with its draft version
-- and targets, and soft-removes its files (removal reason draft_deleted;
-- files on legal hold are kept). A published one is withdrawn instead
-- (22023 document_published); a withdrawn one is kept (22023
-- document_withdrawn). The history row stays. Returns the deleted row.
CREATE OR REPLACE FUNCTION public.fleet_document_delete_draft(p_document_id uuid)
RETURNS public.fleet_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.fleet_document_gate('edit');
  v_prev text := coalesce(current_setting('storm.fleet_tx', true), '');
  d public.fleet_documents;
  v_files integer;
BEGIN
  SELECT * INTO d FROM public.fleet_documents WHERE id = p_document_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found';
  END IF;
  IF d.status = 'published' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_published';
  END IF;
  IF d.status = 'withdrawn' OR d.published_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_withdrawn';
  END IF;
  PERFORM set_config('storm.fleet_tx', 'on', true);
  UPDATE public.file_objects SET removed_at = now(), removed_by = v_uid, removal_reason = 'draft_deleted'
  WHERE company_id = v_company AND vessel_id IS NULL AND module_key = 'documents' AND entity_type = 'fleet_document'
    AND entity_id = d.id AND removed_at IS NULL AND NOT legal_hold;
  GET DIAGNOSTICS v_files = ROW_COUNT;
  DELETE FROM public.fleet_documents WHERE id = d.id RETURNING * INTO d;
  PERFORM public.fleet_document_log(v_company, d.id, NULL, 'draft_deleted', 'draft', NULL, NULL,
    jsonb_build_object('title', d.title, 'type_id', d.type_id, 'files_removed', v_files));
  PERFORM set_config('storm.fleet_tx', v_prev, true);
  RETURN d;
END;
$$;

-- ---------------------------------------------------------------- grants

REVOKE ALL ON FUNCTION public.fleet_documents_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_versions_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_vessel_targets_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_events_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_visible(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_gate(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_log(uuid, uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_section_save(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_sections_reorder(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_section_delete(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_type_save(uuid, uuid, text, boolean, integer, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_type_delete(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_create(uuid, text, text, boolean, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_update(uuid, timestamptz, uuid, text, text, boolean, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_add_version(uuid, uuid, text, text, date, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_set_targets(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_publish(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_withdraw(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_document_delete_draft(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- The policies run fleet_document_visible as the reader (and service-role
-- jobs ask it about anyone).
GRANT EXECUTE ON FUNCTION public.fleet_document_visible(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_gate(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_log(uuid, uuid, uuid, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_document_section_save(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_sections_reorder(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_section_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_type_save(uuid, uuid, text, boolean, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_type_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_create(uuid, text, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_update(uuid, timestamptz, uuid, text, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_add_version(uuid, uuid, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_set_targets(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_publish(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_withdraw(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_document_delete_draft(uuid) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.fleet_document_sections IS 'Sections of the company''s fleet document library (gap/02 FD1, FD10; D-X5-03): name (1-80, unique per company, case-insensitive) and order. Read: active members of the company. Written only by fleet_document_section_save / _sections_reorder / _section_delete.';
COMMENT ON TABLE public.fleet_document_types IS 'Document types in a section (gap/02 FD1, FD5, FD10): name (unique in the section), acknowledgement defaults (required, due days 1-365), version kind default (major | minor), hide on vessels while empty. Read: active members of the company. Written only by fleet_document_type_save / _type_delete (refused while it holds a document).';
COMMENT ON TABLE public.fleet_documents IS 'A document the company publishes to its vessels (gap/02 FD2, FD4, W1; D-X5-03): type, crew-facing title, status draft -> published -> withdrawn, target mode (all_including_future | selected), acknowledgement settings, current version. Read: fleet library readers (fleet reach + documents view; drafts need edit) and, when published, people of a targeted vessel (fleet_document_visible). Status and lifecycle columns change only inside the fleet_document_* definers (trg_fleet_documents_guard, every role).';
COMMENT ON TABLE public.fleet_document_versions IS 'Numbered versions of a fleet document (gap/02 FD4): label, major | minor, effective date, one records-bucket file (copied path, name, type, size), state draft -> published -> superseded; one draft and one published per document. Read like the document; crew of targeted vessels read the published version only. State changes only inside fleet_document_publish (trg_fleet_document_versions_guard).';
COMMENT ON TABLE public.fleet_document_vessel_targets IS 'The vessels a selected-mode fleet document is published to (gap/02 FD3). Read: fleet library readers (drafts: editors). Written only by fleet_document_set_targets (trg_fleet_document_vessel_targets_guard); the vessel is of the document''s company.';
COMMENT ON TABLE public.fleet_document_events IS 'Append-only history of the fleet document library (D-X5-23): actor, action, from / to status, comment, payload; taxonomy events have no document. Read: fleet library readers (drafts: editors). Inserted only by the fleet_document_* definers, never updated or deleted (trg_fleet_document_events_guard).';
COMMENT ON FUNCTION public.fleet_document_visible(uuid, uuid) IS 'Whether a published fleet document is visible to the user through a vessel it targets (all_including_future: any counted active vessel of the company, including later ones; selected: a target vessel not archived) that the user reaches. Inactive users, drafts, withdrawn documents, other companies: false. A signed-in caller asks about themselves only. The library policies call it.';
COMMENT ON FUNCTION public.fleet_document_gate(text) IS 'The caller''s company once they may act on the fleet document library at edit or admin (fleet_ops_can_for documents, fleet reach); 42501 not_permitted otherwise. Internal.';
COMMENT ON FUNCTION public.fleet_document_log(uuid, uuid, uuid, text, text, text, text, jsonb) IS 'Writes one fleet_document_events row with auth.uid() as actor. Internal: the fleet_document_* definers.';
COMMENT ON FUNCTION public.fleet_document_section_save(uuid, text) IS 'Adds (p_id NULL, placed last) or renames a fleet document section of the caller''s company; documents edit with fleet reach; 22023 name_required | name_too_long | section_name_taken, P0002 section_not_found.';
COMMENT ON FUNCTION public.fleet_document_sections_reorder(uuid[]) IS 'Orders the caller''s company''s fleet document sections: every section exactly once (22023 reorder_mismatch); returns them in order.';
COMMENT ON FUNCTION public.fleet_document_section_delete(uuid) IS 'Deletes a fleet document section and its empty types; documents admin; 22023 section_in_use while a type holds a document.';
COMMENT ON FUNCTION public.fleet_document_type_save(uuid, uuid, text, boolean, integer, text, boolean) IS 'Adds (p_id NULL) or changes a fleet document type: name, section, acknowledgement defaults, version kind default, hide when empty; NULL keeps a value. 22023 name_required | name_too_long | section_required | invalid_ack_due_days | invalid_version_kind | type_name_taken.';
COMMENT ON FUNCTION public.fleet_document_type_delete(uuid) IS 'Deletes an empty fleet document type; documents admin; 22023 type_in_use.';
COMMENT ON FUNCTION public.fleet_document_create(uuid, text, text, boolean, integer) IS 'Starts a fleet document as a draft in a type of the caller''s company (title 1-160, description up to 2000, acknowledgement settings defaulting to the type''s).';
COMMENT ON FUNCTION public.fleet_document_update(uuid, timestamptz, uuid, text, text, boolean, integer) IS 'Changes a draft or published fleet document''s type, title, description and acknowledgement settings; refused when withdrawn or on a stale updated_at.';
COMMENT ON FUNCTION public.fleet_document_add_version(uuid, uuid, text, text, date, text) IS 'Adds the next draft version of a fleet document (or replaces its draft version) with a live records file stored for the document; label auto v<n>; kind defaults to the type''s.';
COMMENT ON FUNCTION public.fleet_document_set_targets(uuid, text, uuid[]) IS 'Sets a fleet document''s target mode and vessels (selected: at least one vessel of the company that is not archived); refused when withdrawn.';
COMMENT ON FUNCTION public.fleet_document_publish(uuid, uuid, timestamptz) IS 'Publishes a draft version of a fleet document (draft or published -> published); the previous version is superseded. Refused on a stale updated_at, without a live file, or without targets in selected mode. Records the acknowledgement effect (none | fresh | carry_forward | reset).';
COMMENT ON FUNCTION public.fleet_document_withdraw(uuid, text) IS 'Withdraws a published fleet document from every vessel with a reason (1-500); final.';
COMMENT ON FUNCTION public.fleet_document_delete_draft(uuid) IS 'Deletes a never-published fleet document with its draft version and targets and soft-removes its files; a published document is withdrawn instead.';
COMMENT ON FUNCTION public.fleet_documents_guard() IS 'Trigger: a fleet document''s status and lifecycle columns change only inside the fleet_document_* definers (storm.fleet_tx); it starts as a draft; a published or withdrawn row keeps its content and is never deleted. Every role.';
COMMENT ON FUNCTION public.fleet_document_versions_guard() IS 'Trigger: a version''s state changes only inside fleet_document_publish; it starts as a draft with a records file stored for its document; published and superseded versions are read-only and kept. Every role.';
COMMENT ON FUNCTION public.fleet_document_vessel_targets_guard() IS 'Trigger: fleet document targets are written only by fleet_document_set_targets (a referential cascade excepted); the vessel is of the row''s company.';
COMMENT ON FUNCTION public.fleet_document_events_guard() IS 'Trigger: fleet document history is inserted only by the definers and never updated or deleted (a cascade of the deleted company excepted).';
