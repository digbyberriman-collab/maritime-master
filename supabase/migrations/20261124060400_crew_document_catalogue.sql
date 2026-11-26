-- =================================================================
-- CREW X1-04: the crew document catalogue and the crew-document server:
-- document types, satisfaction rules, the expiry state of every crew
-- document, scoped read policies, the TR9 provider and the storage
-- predicates of the crew-document prefix
-- (Phase 3 wave 1, stream X1; gap/04 C23, C26, C29, C34, W3; gap/02 TR9
-- provider half; DECISIONS C5, D-01, D-31, D-55, D-120, D-128, D-159,
-- D-229, D-233, D-X1-3, D-X1-7, D-X1-18, D-X1-22; X1 spec §6 060400;
-- platform plan §1 contracts 3, 4, 7 and 8)
-- Tables: crew_document_categories (37, each on one profile tab),
--   crew_document_types (206 STORM-authored system types plus tenant
--   types), crew_document_type_satisfies (107 system rules: combined
--   certificates, higher supersedes lower, accepted equivalents),
--   crew_document_type_legacy_map (the 41 legacy certificate strings),
--   vessel_crew_settings (C13 typed settings: passenger ship, crew uploads,
--   transfer approval; one row per vessel, written by X1-06)
-- Legacy table crew_certificates (the crew documents): user_id nullable
--   (no-login crew hold documents), the document columns (person, type,
--   issuing country and office, no-expiry tick, endorsement date, crew
--   report passport, file, verification, alerts, source, details, soft
--   delete), the guard and the passport mirror, scoped read policies
-- View: expiry_src_crew_documents (the X5 expiry source contract), with its
--   expiry_sources row; X5's two legacy crew sources set inactive
-- RPCs: crew_documents_for_profile(), crew_document_rights(),
--   crew_document_save(), crew_document_delete(),
--   crew_document_issuing_suggestions()
-- Service role: crew_document_record_from_source() (TR9, X5 contract),
--   crew_document_file_readable() / crew_document_file_writable() (the
--   storage predicates of 20261124000100), crew_document_may_write(),
--   crew_document_type_satisfiers(), crew_document_type_for_legacy(),
--   crew_document_legacy_key(), crew_document_passport_mirror(),
--   crew_document_catalogue_backfill() (the seed)
-- Caller-only RLS set: crew_document_visible_profile_ids()
-- TS mirror: src/modules/crew/types/db.pending.ts (tables, columns, RPCs);
--   src/modules/crew/lib/documentState.ts (the state rules of
--   crew_documents_for_profile, on src/lib/records/expiry.ts; the D-31
--   boundary table of src/test/lib/records/expiry.test.ts, asserted here and
--   in src/test/crew/documentState.test.ts); src/modules/crew/lib/
--   documentTabs.ts (category -> tab and the legacy strings, parsed from this
--   file by src/test/crew/documentState.test.ts);
--   src/modules/crew/lib/crewDocumentSchema.ts (the save rules)
-- =================================================================
--
-- Why. Crew documents today are free-text rows of crew_certificates picked
-- from about forty hard-coded names, their status is written once at save
-- and goes stale, a person without a login can hold no document (user_id
-- NOT NULL), and the live SELECT policy "Users can view crew certificates in
-- their company" (20260127161741) lets every member of the company read
-- every crew document, passports included. This file gives documents a
-- catalogue (gap/04 C23), computes their state at read (C29, W3), scopes who
-- may read them, and makes crew_certificates the one crew document store,
-- keyed on profiles.id.
--
-- Who may read a person's documents (crew_document_visible_profile_ids,
-- crew_document_file_readable): an active caller of the person's company
-- who is the person, or (no external viewer) a legacy HR viewer
-- (hr_can_view), or a holder of vessel.crew.crew_profiles.view and of
-- vessel.crew.crew_certificates.view on vessels of the person's structural
-- set (a current or planned assignment, or the pending placement; X1 spec
-- §3). The company-wide legacy read policy is dropped; the legacy write
-- policies (hr_can_write_crew_record: the person or an HR editor) stay.
--
-- Who may add or change one (crew_document_may_write, crew_document_save):
-- a legacy HR editor (hr_can_edit), a holder of
-- vessel.crew.crew_certificates.create (adding) or .edit (changing) on a
-- vessel of the person's structural set, or the person themselves when
-- crew uploads are on for one of their vessels (vessel_crew_settings) and
-- they hold vessel.crew.crew_certificates.view_own there. External viewers
-- never write. Removing (crew_document_delete) is a soft delete by the
-- person who added it within 24 hours, or by an editor with a reason.
--
-- State (crew_documents_for_profile; TS documentState.ts; W3, D-31): a
-- document without a file is 'not_uploaded'; otherwise one with neither an
-- expiry date nor the "No expiry" tick is 'missing_date' (missing data,
-- never Valid); otherwise its bucket from expiry_bucket() with the window of
-- expiry_window_for(company, the type's expiry item type, the type): the
-- company's rule, else passports 270 days and everything else 90. The
-- bucket is returned on its own as well (NULL only for a missing date), the
-- alerts-off flag is an overlay (the real state stays visible), and the
-- endorsement state comes from expiry_endorsement_state() (30 days).
--
-- Integrity (crew_certificates_guard, every writer): the person, login and
-- company fill each other in before the RLS check, a document belongs to
-- its person's company (23514), and a material change (number, dates, the
-- tick, issuing country, type, file) returns a reviewed document to
-- 'unverified', the certificates module's legacy writer included (C27,
-- T-139). Signed-in writers outside the X1 definers (storm.crew_engine)
-- change only the legacy columns: every new column, verification, alerts and
-- removal included, is the definers' (42501 crew_document_engine_only), and
-- a reviewed or removed document is never hard-deleted (42501
-- crew_document_delete_refused). The service role and no-JWT maintenance
-- are exempt. The legacy status column is no longer read: the state is
-- computed.
--
-- Expiry after issue. Enforced by the guard for every new row and every
-- change of either date (22023 crew_document_dates_invalid), not by a CHECK:
-- live rows written before this file may hold reversed dates, and a CHECK
-- would make those rows impossible to change, anonymisation included.
--
-- Passports (C26). A passport is a document of an item-type 'passport'
-- type; at most one per person is "Use this passport in crew report"
-- (partial unique index; 22023 crew_report_passport_exists from the save).
-- crew_certificates_passport_sync mirrors that passport into
-- profiles.passport_number / passport_expiry / passport_country for the
-- legacy readers, and clears them when the flagged passport is removed or
-- unflagged (the profiles guards leave these columns free).
--
-- TR9 (platform plan contract 3): crew_document_record_from_source() is
-- what X5's training completion calls as owner: it creates the person's
-- document of the qualification type, or renews the latest one (later
-- expiry wins; the replaced number and file move to details.replaced until
-- X1-05's versions), idempotent per (source, source reference).
--
-- Fleet expiry (contract 8). expiry_src_crew_documents follows X5's source
-- view contract over every document of a person (the latest per type and
-- issuing country), plus the profile's passport or visa date for a person
-- who has no such document yet, so passports typed into the legacy HRIS
-- forms stay visible. A document with a missing date is not an expiry item
-- (it reads 'missing_date' on the profile). The registry row is added and
-- X5's crew_certificates_legacy and profile_identity_legacy rows are set
-- inactive (data rows; no X5 object is redefined, D-120).
--
-- Backfill (crew_document_catalogue_backfill, run once at the end,
-- idempotent): person and company from profiles.user_id; the type from the
-- legacy map (certificate type, then name), else an exact match on a type's
-- name, code or abbreviation; a passport document from profiles.passport_*
-- when none of the person's passport documents is that passport, and the
-- crew report flag on the one that matches the profile (else the latest);
-- passports from crew_travel_documents rows of type passport for people with
-- none; a visa document from profiles.visa_expiry when none matches.
--
-- Nothing here is live (D-01): the client reads every object through the
-- pending shim (src/modules/crew/types/db.pending.ts) and falls back to the
-- person's legacy rows, read-only, while the RPCs are missing.
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each policy,
-- trigger and constraint, CREATE OR REPLACE for every function and view,
-- seeds ON CONFLICT, the backfill guarded by NOT EXISTS.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.expiry_bucket(date,integer,date,boolean)') IS NULL
     OR to_regprocedure('public.expiry_window_for(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.expiry_endorsement_state(date,date,integer)') IS NULL
     OR to_regclass('public.expiry_sources') IS NULL
     OR to_regprocedure('public.fleet_current_crew(uuid[])') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060400_crew_document_catalogue needs the fleet expiry engine (expiry_bucket, expiry_window_for, expiry_endorsement_state, expiry_sources, fleet_current_crew): apply 20261124040000_fleet_expiry_engine.sql first';
  END IF;
  IF to_regclass('public.ref_countries') IS NULL
     OR to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_cap_vessel_ids(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060400_crew_document_catalogue needs the crew reference data and gate helpers: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regprocedure('public.crew_caller_is_external()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060400_crew_document_catalogue needs crew_caller_is_external(): apply 20261124060200_crew_vessel_list.sql first';
  END IF;
  IF to_regprocedure('public.crew_visible_profile_ids()') IS NULL
     OR to_regprocedure('public.crew_profile_structural_vessels(uuid)') IS NULL
     OR to_regprocedure('public.crew_country_from_text(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060400_crew_document_catalogue needs the crew profile visibility helpers: apply 20261124060300_crew_profile_details.sql first';
  END IF;
  IF to_regprocedure('public.my_profile_id()') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.has_capability_for(uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_user_is_external(uuid,uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL
     OR position('user_is_active' IN pg_get_functiondef('public.hr_can_view(uuid)'::regprocedure)) = 0
     OR position('user_is_active' IN pg_get_functiondef('public.hr_can_edit(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060400_crew_document_catalogue needs the active-aware platform helpers: apply 20261123000400, 20261123010000 and 20261123020000 first';
  END IF;
  IF to_regclass('public.crew_certificates') IS NULL OR to_regclass('public.crew_travel_documents') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'passport_number')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'visa_expiry') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060400_crew_document_catalogue needs the live crew_certificates and crew_travel_documents tables and profiles.passport_* / visa_*';
  END IF;
END
$$;

-- ---------------------------------------------------------------- pure helper (seed, backfill, guard; TS documentTabs.legacyDocumentKey)

-- The normalised key of a legacy certificate string: lower case, '&' read
-- as 'and', every run of other characters one underscore, no leading or
-- trailing one; NULL for a blank or NULL text.
CREATE OR REPLACE FUNCTION public.crew_document_legacy_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT nullif(replace(btrim(regexp_replace(replace(lower(coalesce(p_text, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g')), ' ', '_'), '')
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.crew_document_categories (
  key text NOT NULL,
  label text NOT NULL,
  tab text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_document_categories_pkey PRIMARY KEY (key),
  CONSTRAINT crew_document_categories_key_check CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT crew_document_categories_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  CONSTRAINT crew_document_categories_tab_check CHECK (tab IN ('documents', 'stcw', 'qualifications'))
);

CREATE TABLE IF NOT EXISTS public.crew_document_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  category_key text NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  code text NULL,
  abbreviation text NULL,
  stcw_reference text NULL,
  field_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_validity_months integer NULL,
  endorsement_interval_months integer NULL,
  expiry_item_type text NOT NULL,
  is_identity boolean NOT NULL DEFAULT false,
  is_medical_fitness boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1000,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_document_types_pkey PRIMARY KEY (id),
  CONSTRAINT crew_document_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_types_category_key_fkey FOREIGN KEY (category_key) REFERENCES public.crew_document_categories(key) ON UPDATE CASCADE,
  CONSTRAINT crew_document_types_key_check CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT crew_document_types_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT crew_document_types_code_check CHECK (code IS NULL OR code ~ '^[A-Z0-9][A-Z0-9-]{0,23}$'),
  CONSTRAINT crew_document_types_abbreviation_check CHECK (abbreviation IS NULL OR length(btrim(abbreviation)) BETWEEN 1 AND 24),
  CONSTRAINT crew_document_types_stcw_reference_check CHECK (stcw_reference IS NULL OR length(btrim(stcw_reference)) BETWEEN 1 AND 60),
  -- Which optional fields the add form shows, each 'optional' or 'required'.
  CONSTRAINT crew_document_types_field_schema_check CHECK (
    jsonb_typeof(field_schema) = 'object'
    AND (field_schema - ARRAY['issuing_office', 'endorsement_date', 'capacity', 'limitations', 'visa_type', 'entries', 'grade']::text[]) = '{}'::jsonb
    AND NOT jsonb_path_exists(field_schema, '$.* ? (@ != "optional" && @ != "required")')),
  CONSTRAINT crew_document_types_validity_check CHECK (default_validity_months IS NULL OR default_validity_months BETWEEN 0 AND 240),
  CONSTRAINT crew_document_types_endorsement_check CHECK (
    endorsement_interval_months IS NULL OR (endorsement_interval_months BETWEEN 1 AND 120 AND field_schema ? 'endorsement_date')),
  -- X5's frozen item-type vocabulary (platform plan contract 4: 'medical').
  CONSTRAINT crew_document_types_expiry_item_type_check CHECK (
    expiry_item_type IN ('passport', 'visa', 'crew_document', 'crew_qualification', 'medical', 'work_authorisation')),
  CONSTRAINT crew_document_types_fitness_check CHECK (NOT is_medical_fitness OR expiry_item_type = 'medical'),
  CONSTRAINT crew_document_types_passport_check CHECK (expiry_item_type <> 'passport' OR is_identity)
);

-- One key per scope (system rows and each company), one code per system row.
CREATE UNIQUE INDEX IF NOT EXISTS crew_document_types_scope_key
  ON public.crew_document_types ((coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), key);
CREATE UNIQUE INDEX IF NOT EXISTS crew_document_types_system_code
  ON public.crew_document_types (code) WHERE company_id IS NULL AND code IS NOT NULL;
CREATE INDEX IF NOT EXISTS crew_document_types_category_idx ON public.crew_document_types (category_key, sort_order);
CREATE INDEX IF NOT EXISTS crew_document_types_company_idx ON public.crew_document_types (company_id) WHERE company_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crew_document_type_satisfies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  type_id uuid NOT NULL,
  satisfies_type_id uuid NOT NULL,
  kind text NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_document_type_satisfies_pkey PRIMARY KEY (id),
  CONSTRAINT crew_document_type_satisfies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_type_satisfies_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.crew_document_types(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_type_satisfies_satisfies_type_id_fkey FOREIGN KEY (satisfies_type_id) REFERENCES public.crew_document_types(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_type_satisfies_kind_check CHECK (kind IN ('supersedes', 'component', 'equivalent')),
  CONSTRAINT crew_document_type_satisfies_distinct_check CHECK (type_id <> satisfies_type_id),
  CONSTRAINT crew_document_type_satisfies_pair_key UNIQUE (type_id, satisfies_type_id)
);
CREATE INDEX IF NOT EXISTS crew_document_type_satisfies_target_idx ON public.crew_document_type_satisfies (satisfies_type_id);

CREATE TABLE IF NOT EXISTS public.crew_document_type_legacy_map (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  legacy_key text NOT NULL,
  legacy_label text NULL,
  document_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_document_type_legacy_map_pkey PRIMARY KEY (id),
  CONSTRAINT crew_document_type_legacy_map_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_type_legacy_map_type_fkey FOREIGN KEY (document_type_id) REFERENCES public.crew_document_types(id) ON DELETE CASCADE,
  CONSTRAINT crew_document_type_legacy_map_key_check CHECK (legacy_key ~ '^[a-z0-9][a-z0-9_]{0,119}$'),
  CONSTRAINT crew_document_type_legacy_map_label_check CHECK (legacy_label IS NULL OR length(legacy_label) <= 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS crew_document_type_legacy_map_scope_key
  ON public.crew_document_type_legacy_map ((coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), legacy_key);

CREATE TABLE IF NOT EXISTS public.vessel_crew_settings (
  vessel_id uuid NOT NULL,
  company_id uuid NOT NULL,
  is_passenger_ship boolean NOT NULL DEFAULT false,
  crew_uploads_enabled boolean NOT NULL DEFAULT false,
  transfer_requires_fleet_approval boolean NOT NULL DEFAULT false,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vessel_crew_settings_pkey PRIMARY KEY (vessel_id),
  CONSTRAINT vessel_crew_settings_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT vessel_crew_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS vessel_crew_settings_company_idx ON public.vessel_crew_settings (company_id);

-- ---------------------------------------------------------------- crew_certificates: the crew documents (legacy table)

-- A person without a login holds documents too (D-199): the subject is
-- profile_id; user_id stays for the legacy readers and writers.
ALTER TABLE public.crew_certificates ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS company_id uuid NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS profile_id uuid NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS document_type_id uuid NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS issuing_country_code text NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS issuing_office text NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS no_expiry boolean NOT NULL DEFAULT false;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS endorsement_due_date date NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS use_in_crew_report boolean NOT NULL DEFAULT false;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS file_path text NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS file_mime text NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS verified_by uuid NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS verified_at timestamptz NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS verification_note text NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS alerts_muted boolean NOT NULL DEFAULT false;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS muted_by uuid NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS muted_at timestamptz NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS muted_reason text NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS external_ref text NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;
ALTER TABLE public.crew_certificates ADD COLUMN IF NOT EXISTS deleted_reason text NULL;

ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_subject_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_subject_check
  CHECK (user_id IS NOT NULL OR profile_id IS NOT NULL) NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_subject_check;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_company_id_fkey;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_company_id_fkey;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_profile_id_fkey;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_profile_id_fkey;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_document_type_id_fkey;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_document_type_id_fkey
  FOREIGN KEY (document_type_id) REFERENCES public.crew_document_types(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_document_type_id_fkey;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_issuing_country_code_fkey;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_issuing_country_code_fkey
  FOREIGN KEY (issuing_country_code) REFERENCES public.ref_countries(iso2) NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_issuing_country_code_fkey;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_verified_by_fkey;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_verified_by_fkey
  FOREIGN KEY (verified_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_verified_by_fkey;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_muted_by_fkey;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_muted_by_fkey
  FOREIGN KEY (muted_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_muted_by_fkey;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_deleted_by_fkey;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_deleted_by_fkey
  FOREIGN KEY (deleted_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_deleted_by_fkey;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_verification_status_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_verification_status_check
  CHECK (verification_status IN ('unverified', 'verified', 'conditionally_approved', 'rejected')) NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_verification_status_check;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_source_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_source_check
  CHECK (source IN ('manual', 'import', 'registry', 'training')) NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_source_check;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_no_expiry_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_no_expiry_check
  CHECK (NOT (no_expiry AND expiry_date IS NOT NULL)) NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_no_expiry_check;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_issuing_country_code_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_issuing_country_code_check
  CHECK (issuing_country_code IS NULL OR issuing_country_code ~ '^[A-Z]{2}$') NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_issuing_country_code_check;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_text_lengths_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_text_lengths_check
  CHECK ((issuing_office IS NULL OR length(issuing_office) <= 120)
     AND (file_path IS NULL OR length(file_path) <= 512)
     AND (file_mime IS NULL OR length(file_mime) <= 120)
     AND (verification_note IS NULL OR length(verification_note) <= 2000)
     AND (muted_reason IS NULL OR length(muted_reason) <= 500)
     AND (external_ref IS NULL OR length(external_ref) <= 200)
     AND (deleted_reason IS NULL OR length(deleted_reason) <= 500)) NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_text_lengths_check;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_details_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_details_check
  CHECK (jsonb_typeof(details) = 'object') NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_details_check;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_mute_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_mute_check
  CHECK (NOT alerts_muted OR muted_at IS NOT NULL) NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_mute_check;
ALTER TABLE public.crew_certificates DROP CONSTRAINT IF EXISTS crew_certificates_deleted_check;
ALTER TABLE public.crew_certificates ADD CONSTRAINT crew_certificates_deleted_check
  CHECK (deleted_reason IS NULL OR deleted_at IS NOT NULL) NOT VALID;
ALTER TABLE public.crew_certificates VALIDATE CONSTRAINT crew_certificates_deleted_check;

-- One crew-report passport per person (C26); one document per person and
-- external reference of a source (TR9 renewals, imports).
CREATE UNIQUE INDEX IF NOT EXISTS crew_certificates_crew_report_passport_key
  ON public.crew_certificates (profile_id) WHERE use_in_crew_report AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crew_certificates_source_ref_key
  ON public.crew_certificates (profile_id, source, external_ref) WHERE external_ref IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crew_certificates_profile_type_idx ON public.crew_certificates (profile_id, document_type_id);
CREATE INDEX IF NOT EXISTS crew_certificates_company_idx ON public.crew_certificates (company_id);

COMMENT ON COLUMN public.crew_certificates.profile_id IS 'The person (profiles.id; X1-04): every crew document keys on it, a person without a login included. Filled from user_id by crew_certificates_guard for legacy writers.';
COMMENT ON COLUMN public.crew_certificates.company_id IS 'The person''s company, filled by crew_certificates_guard; the RESTRICTIVE crew_documents_tenant_pin compares it with the caller''s.';
COMMENT ON COLUMN public.crew_certificates.document_type_id IS 'The catalogue type (crew_document_types); NULL for a legacy row no rule could classify (the long tail for manual review, gap/04).';
COMMENT ON COLUMN public.crew_certificates.no_expiry IS 'The "No expiry" tick (D-31): with it the document never expires; without it and without a date the expiry is missing data.';
COMMENT ON COLUMN public.crew_certificates.use_in_crew_report IS 'The crew-report passport (C26): at most one per person; mirrored into profiles.passport_* by crew_certificates_passport_sync.';
COMMENT ON COLUMN public.crew_certificates.file_path IS 'Storage path in the documents bucket, <company>/crew/<profile_id>/documents/<uuid>-<name> (D-X1-18); read through signed URLs.';
COMMENT ON COLUMN public.crew_certificates.verification_status IS 'unverified, verified, conditionally_approved, rejected (C27). Set by the X1 definers only; a material change returns it to unverified.';
COMMENT ON COLUMN public.crew_certificates.alerts_muted IS 'Alerts off (C28): the document keeps its real state but raises no alert and leaves KPI counts. Set by the X1 definers only (X1-05).';
COMMENT ON COLUMN public.crew_certificates.source IS 'Where the document came from: manual, import (backfill, CSV), registry (an external register), training (a completed course, TR9).';
COMMENT ON COLUMN public.crew_certificates.details IS 'The type''s optional fields (capacity, limitations, visa_type, entries, grade) and server bookkeeping (source_refs of TR9, the replaced values of a renewal).';
COMMENT ON COLUMN public.crew_certificates.deleted_at IS 'Soft delete (W3): removed documents are kept, hidden from the browser.';
COMMENT ON COLUMN public.crew_certificates.status IS 'Legacy, no longer read: the state is computed at read (crew_documents_for_profile, expiry_src_crew_documents).';

COMMENT ON TABLE public.crew_document_categories IS 'Crew document categories (gap/04 C23; T-185): about 35 STORM-authored groups, each on one profile tab (documents, stcw, qualifications); medical certificates are documents. Global; read by active signed-in users; seeded by 20261124060400.';
COMMENT ON TABLE public.crew_document_types IS 'Crew document types (gap/04 C23): STORM-authored system rows (company_id NULL, ids md5(''storm.crew_document_type.'' || key)) and tenant rows, each with its category, code and abbreviation (search), STCW or convention reference, field_schema (the optional fields the add form shows), default validity, endorsement interval, the X5 expiry item type and is_medical_fitness (ENG1 or an accepted equivalent, read by X5''s medical grid). Tenant types are added by X1-06.';
COMMENT ON TABLE public.crew_document_type_satisfies IS 'Satisfaction rules (gap/04 C34): holding type_id satisfies a requirement for satisfies_type_id as a component of a combined certificate (T-159), a higher certificate (supersedes, T-53) or an accepted equivalent (T-326, T-185). System rows (company_id NULL) and tenant rows; the requirement engine (X1-06) follows chains through crew_document_type_satisfiers().';
COMMENT ON TABLE public.crew_document_type_legacy_map IS 'Legacy certificate strings (crew_certificates.certificate_type / certificate_name, normalised by crew_document_legacy_key()) to a document type: the system rows cover every MARITIME_CERTIFICATE_TYPES entry; tenant rows map a company''s own strings. Read by the backfill and the guard (service only).';
COMMENT ON TABLE public.vessel_crew_settings IS 'Typed crew settings per vessel (gap/04 C13): passenger ship (adds the STCW V/2 requirements, X1-06), crew uploads (crew may add their own documents, X1-04), transfers need fleet approval (D-X1-12). One row per vessel, created on first save by crew_vessel_settings_save() (X1-06); no row reads as all off. Read with vessel.crew.crew_list.view on the vessel.';

-- ---------------------------------------------------------------- integrity guards (every writer)

-- A tenant type names its company; a company never edits a system row
-- through a company id (a system row has company_id NULL and stays so).
CREATE OR REPLACE FUNCTION public.crew_document_types_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_type_scope_locked',
      DETAIL = 'A document type keeps its owner.';
  END IF;
  RETURN NEW;
END;
$$;

-- A rule links types of its own scope: a system rule two system types, a
-- company rule system types or that company's.
CREATE OR REPLACE FUNCTION public.crew_document_type_satisfies_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.crew_document_types AS t
    WHERE t.id IN (NEW.type_id, NEW.satisfies_type_id)
      AND t.company_id IS NOT NULL
      AND t.company_id IS DISTINCT FROM NEW.company_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_rule_scope_mismatch',
      DETAIL = 'A satisfaction rule links document types of its own company or STORM''s.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crew_document_type_legacy_map_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.crew_document_types AS t
    WHERE t.id = NEW.document_type_id AND t.company_id IS NOT NULL AND t.company_id IS DISTINCT FROM NEW.company_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_legacy_scope_mismatch',
      DETAIL = 'A legacy mapping points at a document type of its own company or STORM''s.';
  END IF;
  RETURN NEW;
END;
$$;

-- The settings row carries its vessel's company.
CREATE OR REPLACE FUNCTION public.vessel_crew_settings_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_company;
  END IF;
  IF v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'vessel_crew_settings_scope_mismatch',
      DETAIL = 'Crew settings belong to the vessel''s own company.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_document_types_scope_guard ON public.crew_document_types;
CREATE TRIGGER trg_crew_document_types_scope_guard
  BEFORE UPDATE ON public.crew_document_types
  FOR EACH ROW EXECUTE FUNCTION public.crew_document_types_scope_guard();
DROP TRIGGER IF EXISTS trg_crew_document_type_satisfies_scope_guard ON public.crew_document_type_satisfies;
CREATE TRIGGER trg_crew_document_type_satisfies_scope_guard
  BEFORE INSERT OR UPDATE ON public.crew_document_type_satisfies
  FOR EACH ROW EXECUTE FUNCTION public.crew_document_type_satisfies_scope_guard();
DROP TRIGGER IF EXISTS trg_crew_document_type_legacy_map_scope_guard ON public.crew_document_type_legacy_map;
CREATE TRIGGER trg_crew_document_type_legacy_map_scope_guard
  BEFORE INSERT OR UPDATE ON public.crew_document_type_legacy_map
  FOR EACH ROW EXECUTE FUNCTION public.crew_document_type_legacy_map_scope_guard();
DROP TRIGGER IF EXISTS trg_vessel_crew_settings_scope_guard ON public.vessel_crew_settings;
CREATE TRIGGER trg_vessel_crew_settings_scope_guard
  BEFORE INSERT OR UPDATE ON public.vessel_crew_settings
  FOR EACH ROW EXECUTE FUNCTION public.vessel_crew_settings_scope_guard();

DROP TRIGGER IF EXISTS trg_crew_document_categories_updated_at ON public.crew_document_categories;
CREATE TRIGGER trg_crew_document_categories_updated_at
  BEFORE UPDATE ON public.crew_document_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_crew_document_types_updated_at ON public.crew_document_types;
CREATE TRIGGER trg_crew_document_types_updated_at
  BEFORE UPDATE ON public.crew_document_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_crew_document_type_satisfies_updated_at ON public.crew_document_type_satisfies;
CREATE TRIGGER trg_crew_document_type_satisfies_updated_at
  BEFORE UPDATE ON public.crew_document_type_satisfies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_crew_document_type_legacy_map_updated_at ON public.crew_document_type_legacy_map;
CREATE TRIGGER trg_crew_document_type_legacy_map_updated_at
  BEFORE UPDATE ON public.crew_document_type_legacy_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_vessel_crew_settings_updated_at ON public.vessel_crew_settings;
CREATE TRIGGER trg_vessel_crew_settings_updated_at
  BEFORE UPDATE ON public.vessel_crew_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- catalogue lookups (internal)

-- The type a legacy certificate string maps to (internal): the company's
-- mapping, else the system one, for the certificate type, then the name.
CREATE OR REPLACE FUNCTION public.crew_document_type_for_legacy(p_company_id uuid, p_type text, p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.document_type_id
  FROM public.crew_document_type_legacy_map AS m
  JOIN public.crew_document_types AS t ON t.id = m.document_type_id
  WHERE m.legacy_key IN (public.crew_document_legacy_key(p_type), public.crew_document_legacy_key(p_name))
    AND (m.company_id IS NULL OR m.company_id = p_company_id)
    AND (t.company_id IS NULL OR t.company_id = p_company_id)
  ORDER BY (m.legacy_key = public.crew_document_legacy_key(p_type)) DESC, (m.company_id IS NOT NULL) DESC
  LIMIT 1
$$;

-- Every type whose holder satisfies a requirement for p_type_id in the
-- company (internal; X1-06's requirement engine): the rules of STORM and of
-- the company, followed through chains (a master's certificate covers the
-- chief mate's, which covers the officer of the watch's), at most six steps,
-- each type once at its shortest depth, with the kind of the rule that
-- reached it.
CREATE OR REPLACE FUNCTION public.crew_document_type_satisfiers(p_type_id uuid, p_company_id uuid)
RETURNS TABLE (type_id uuid, kind text, depth integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE chain(type_id, kind, depth, path) AS (
    SELECT s.type_id, s.kind, 1, ARRAY[p_type_id, s.type_id]
    FROM public.crew_document_type_satisfies AS s
    WHERE s.satisfies_type_id = p_type_id AND (s.company_id IS NULL OR s.company_id = p_company_id)
    UNION ALL
    SELECT s.type_id, c.kind, c.depth + 1, c.path || s.type_id
    FROM chain AS c
    JOIN public.crew_document_type_satisfies AS s ON s.satisfies_type_id = c.type_id
    WHERE (s.company_id IS NULL OR s.company_id = p_company_id)
      AND c.depth < 6
      AND NOT s.type_id = ANY (c.path)
  )
  SELECT DISTINCT ON (c.type_id) c.type_id, c.kind, c.depth
  FROM chain AS c
  JOIN public.crew_document_types AS t ON t.id = c.type_id
  WHERE t.company_id IS NULL OR t.company_id = p_company_id
  ORDER BY c.type_id, c.depth
$$;

-- ---------------------------------------------------------------- read and write rights (X1 spec §3)

-- The caller-only set of profiles whose documents the caller may read
-- (D-229; the read policy and the storage predicate's set form): an active
-- caller's own profile; then, unless the caller is an external viewer,
-- every profile of the company for a legacy HR viewer, else the profiles
-- of the company with a structural vessel where the caller holds
-- vessel.crew.crew_profiles.view and one where they hold
-- vessel.crew.crew_certificates.view. Empty without a JWT or for an
-- inactive caller. Policies use it as
-- `profile_id IN (SELECT public.crew_document_visible_profile_ids())`.
CREATE OR REPLACE FUNCTION public.crew_document_visible_profile_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_me uuid;
  v_profile_vessels uuid[];
  v_cert_vessels uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RETURN;
  END IF;
  v_me := public.my_profile_id();
  IF v_me IS NOT NULL THEN
    RETURN NEXT v_me;
  END IF;
  IF public.crew_caller_is_external() THEN
    RETURN;
  END IF;
  IF public.hr_can_view(v_uid) THEN
    RETURN QUERY SELECT p.id FROM public.profiles AS p WHERE p.company_id = v_company AND p.id IS DISTINCT FROM v_me;
    RETURN;
  END IF;
  SELECT coalesce(array_agg(x), ARRAY[]::uuid[]) INTO v_profile_vessels FROM public.crew_cap_vessel_ids('vessel.crew.crew_profiles.view') AS x;
  SELECT coalesce(array_agg(x), ARRAY[]::uuid[]) INTO v_cert_vessels FROM public.crew_cap_vessel_ids('vessel.crew.crew_certificates.view') AS x;
  IF cardinality(v_profile_vessels) = 0 OR cardinality(v_cert_vessels) = 0 THEN
    RETURN;
  END IF;
  -- The structural set of every person of the company, set-wise
  -- (crew_profile_structural_vessels): current or planned assignments on a
  -- vessel of their company, else the pending placement.
  RETURN QUERY
    WITH structural AS (
      SELECT p.id AS profile_id, ca.vessel_id
      FROM public.profiles AS p
      JOIN public.crew_assignments AS ca ON ca.user_id = p.user_id
      JOIN public.vessels AS v ON v.id = ca.vessel_id AND v.company_id = p.company_id
      WHERE p.company_id = v_company
        AND coalesce(ca.is_current, false)
        AND NOT coalesce(coalesce(ca.leave_date, ca.end_date) <= current_date, false)
      UNION
      SELECT p.id, p.imported_vessel_id
      FROM public.profiles AS p
      JOIN public.vessels AS v ON v.id = p.imported_vessel_id AND v.company_id = p.company_id
      WHERE p.company_id = v_company
        AND coalesce(p.is_imported, false)
        AND NOT EXISTS (
          SELECT 1 FROM public.crew_assignments AS x
          WHERE p.user_id IS NOT NULL AND x.user_id = p.user_id
            AND coalesce(x.is_current, false)
            AND NOT coalesce(coalesce(x.leave_date, x.end_date) <= current_date, false)
        )
    )
    SELECT s.profile_id
    FROM structural AS s
    WHERE s.profile_id IS DISTINCT FROM v_me
    GROUP BY s.profile_id
    HAVING bool_or(s.vessel_id = ANY (v_profile_vessels)) AND bool_or(s.vessel_id = ANY (v_cert_vessels));
END;
$$;

-- Whether p_user may read p_profile's documents and their files (the
-- storage predicate of 20261124000100, and the RPC gate with auth.uid()):
-- the same rule as crew_document_visible_profile_ids() for an arbitrary
-- user. Internal (service role; definers pass the caller).
CREATE OR REPLACE FUNCTION public.crew_document_file_readable(p_user uuid, p_profile uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_me uuid;
  v_subject_company uuid;
BEGIN
  IF p_user IS NULL OR p_profile IS NULL OR NOT coalesce(public.user_is_active(p_user), false) THEN
    RETURN false;
  END IF;
  SELECT p.company_id, p.id INTO v_company, v_me FROM public.profiles AS p WHERE p.user_id = p_user;
  SELECT p.company_id INTO v_subject_company FROM public.profiles AS p WHERE p.id = p_profile;
  IF v_company IS NULL OR v_subject_company IS DISTINCT FROM v_company THEN
    RETURN false;
  END IF;
  IF p_profile IS NOT DISTINCT FROM v_me THEN
    RETURN true;
  END IF;
  IF coalesce(public.record_user_is_external(p_user, v_company), true) THEN
    RETURN false;
  END IF;
  IF coalesce(public.hr_can_view(p_user), false) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
           SELECT 1 FROM public.crew_profile_structural_vessels(p_profile) AS s(vessel_id)
           WHERE public.has_capability_for(p_user, 'vessel.crew.crew_profiles.view', v_company, s.vessel_id))
     AND EXISTS (
           SELECT 1 FROM public.crew_profile_structural_vessels(p_profile) AS s(vessel_id)
           WHERE public.has_capability_for(p_user, 'vessel.crew.crew_certificates.view', v_company, s.vessel_id));
END;
$$;

-- Whether p_user may add (p_action 'create'), change ('edit') or remove
-- ('delete') a document of p_profile: an active user of the person's
-- company, no external viewer, who is a legacy HR editor, or holds
-- vessel.crew.crew_certificates.create (adding) or .edit (changing,
-- removing) on a vessel of the person's structural set; for adding and
-- changing also the person themselves when crew uploads are on for one of
-- their vessels where they hold vessel.crew.crew_certificates.view_own
-- (removing their own documents beyond the uploader's 24 hours stays an
-- editor's). Internal (service role).
CREATE OR REPLACE FUNCTION public.crew_document_may_write(p_user uuid, p_profile uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_me uuid;
  v_subject_company uuid;
BEGIN
  IF p_user IS NULL OR p_profile IS NULL OR p_action IS NULL OR p_action NOT IN ('create', 'edit', 'delete')
     OR NOT coalesce(public.user_is_active(p_user), false) THEN
    RETURN false;
  END IF;
  SELECT p.company_id, p.id INTO v_company, v_me FROM public.profiles AS p WHERE p.user_id = p_user;
  SELECT p.company_id INTO v_subject_company FROM public.profiles AS p WHERE p.id = p_profile;
  IF v_company IS NULL OR v_subject_company IS DISTINCT FROM v_company THEN
    RETURN false;
  END IF;
  IF coalesce(public.record_user_is_external(p_user, v_company), true) THEN
    RETURN false;
  END IF;
  IF coalesce(public.hr_can_edit(p_user), false) THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.crew_profile_structural_vessels(p_profile) AS s(vessel_id)
    WHERE public.has_capability_for(p_user, 'vessel.crew.crew_certificates.' || CASE p_action WHEN 'delete' THEN 'edit' ELSE p_action END, v_company, s.vessel_id)
  ) THEN
    RETURN true;
  END IF;
  RETURN p_action <> 'delete' AND p_profile IS NOT DISTINCT FROM v_me AND EXISTS (
    SELECT 1
    FROM public.crew_profile_structural_vessels(p_profile) AS s(vessel_id)
    JOIN public.vessel_crew_settings AS vcs ON vcs.vessel_id = s.vessel_id AND vcs.crew_uploads_enabled
    WHERE public.has_capability_for(p_user, 'vessel.crew.crew_certificates.view_own', v_company, s.vessel_id)
  );
END;
$$;

-- The storage predicate for writes under <company>/crew/<profile>/documents/
-- (20261124000100's gate calls it for INSERT, UPDATE and DELETE): p_user may
-- add or change a document of the person. Internal (service role).
CREATE OR REPLACE FUNCTION public.crew_document_file_writable(p_user uuid, p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.crew_document_may_write(p_user, p_profile, 'create'), false)
      OR coalesce(public.crew_document_may_write(p_user, p_profile, 'edit'), false)
$$;

-- ---------------------------------------------------------------- the guard and the passport mirror (every writer)

-- crew_certificates_guard (BEFORE INSERT, UPDATE, DELETE). For every
-- writer: the person, login and company fill each other in (legacy writers
-- send the login only); a document belongs to its person's company
-- (23514 crew_document_scope_mismatch); a legacy row names its type
-- through the legacy map when it has none; expiry not before issue on a new
-- row or a changed date (22023 crew_document_dates_invalid); a material
-- change returns a reviewed document to unverified (unless the X1 engine
-- decides the verification in the same write). For a signed-in writer
-- outside storm.crew_engine: the person and company of the caller's own
-- company only (42501 crew_document_scope_refused), the subject never moves
-- (42501 crew_document_subject_locked), every new column keeps its value
-- or default (42501 crew_document_engine_only), and only an unreviewed,
-- not removed document may be hard-deleted (42501
-- crew_document_delete_refused; foreign-key cascades exempt). The service
-- role and no-JWT maintenance skip the caller rules.
CREATE OR REPLACE FUNCTION public.crew_certificates_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_engine boolean := coalesce(current_setting('storm.crew_engine', true), '') = 'on';
  v_caller_rules boolean;
  v_profile_id uuid;
  v_profile_user uuid;
  v_profile_company uuid;
  v_new_cols jsonb;
  v_old_cols jsonb;
  v_material boolean;
  c_engine_cols CONSTANT text[] := ARRAY[
    'document_type_id', 'issuing_country_code', 'issuing_office', 'no_expiry', 'endorsement_due_date', 'use_in_crew_report',
    'file_path', 'file_mime', 'verification_status', 'verified_by', 'verified_at', 'verification_note', 'alerts_muted',
    'muted_by', 'muted_at', 'muted_reason', 'source', 'external_ref', 'details', 'deleted_at', 'deleted_by', 'deleted_reason'];
  c_defaults CONSTANT jsonb := jsonb_build_object(
    'document_type_id', NULL, 'issuing_country_code', NULL, 'issuing_office', NULL, 'no_expiry', false,
    'endorsement_due_date', NULL, 'use_in_crew_report', false, 'file_path', NULL, 'file_mime', NULL,
    'verification_status', 'unverified', 'verified_by', NULL, 'verified_at', NULL, 'verification_note', NULL,
    'alerts_muted', false, 'muted_by', NULL, 'muted_at', NULL, 'muted_reason', NULL, 'source', 'manual',
    'external_ref', NULL, 'details', '{}'::jsonb, 'deleted_at', NULL, 'deleted_by', NULL, 'deleted_reason', NULL);
BEGIN
  v_caller_rules := v_uid IS NOT NULL AND NOT v_engine;

  IF TG_OP = 'DELETE' THEN
    IF v_caller_rules AND pg_trigger_depth() = 1
       AND (OLD.verification_status IS DISTINCT FROM 'unverified' OR OLD.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_document_delete_refused',
        DETAIL = 'A reviewed or removed document is kept. Remove it from the crew profile instead.';
    END IF;
    RETURN OLD;
  END IF;

  -- The caller's own columns, before this trigger fills anything.
  IF v_caller_rules THEN
    SELECT coalesce(jsonb_object_agg(k, to_jsonb(NEW) -> k), '{}'::jsonb) INTO v_new_cols FROM unnest(c_engine_cols) AS k;
    IF TG_OP = 'INSERT' THEN
      v_old_cols := c_defaults;
    ELSE
      SELECT coalesce(jsonb_object_agg(k, to_jsonb(OLD) -> k), '{}'::jsonb) INTO v_old_cols FROM unnest(c_engine_cols) AS k;
      IF (OLD.profile_id IS NOT NULL AND NEW.profile_id IS DISTINCT FROM OLD.profile_id)
         OR (OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id)
         OR (OLD.company_id IS NOT NULL AND NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_document_subject_locked',
          DETAIL = 'A document stays with its crew member.';
      END IF;
    END IF;
    IF v_new_cols IS DISTINCT FROM v_old_cols THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_document_engine_only',
        DETAIL = 'Document details, verification, alerts and removal are saved through the crew profile.';
    END IF;
  END IF;

  -- The subject: person, login and company fill each other in.
  IF NEW.profile_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT p.id, p.company_id INTO v_profile_id, v_profile_company FROM public.profiles AS p WHERE p.user_id = NEW.user_id;
    NEW.profile_id := v_profile_id;
    v_profile_user := NEW.user_id;
  ELSIF NEW.profile_id IS NOT NULL THEN
    SELECT p.id, p.user_id, p.company_id INTO v_profile_id, v_profile_user, v_profile_company FROM public.profiles AS p WHERE p.id = NEW.profile_id;
    IF NEW.user_id IS NULL THEN
      NEW.user_id := v_profile_user;
    ELSIF NEW.user_id IS DISTINCT FROM v_profile_user THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_subject_mismatch',
        DETAIL = 'The document''s login and person do not match.';
    END IF;
  END IF;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_subject_unknown',
      DETAIL = 'A crew document needs a crew member.';
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_profile_company;
  END IF;
  IF NEW.company_id IS NULL OR NEW.company_id IS DISTINCT FROM v_profile_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_document_scope_mismatch',
      DETAIL = 'A crew document must belong to the person''s own company.';
  END IF;
  IF v_caller_rules AND NEW.company_id IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_document_scope_refused',
      DETAIL = 'You can only keep documents of your own company''s crew.';
  END IF;

  -- A legacy row names its type through the legacy map.
  IF NEW.document_type_id IS NULL
     AND (TG_OP = 'INSERT' OR NEW.certificate_type IS DISTINCT FROM OLD.certificate_type OR NEW.certificate_name IS DISTINCT FROM OLD.certificate_name) THEN
    NEW.document_type_id := public.crew_document_type_for_legacy(NEW.company_id, NEW.certificate_type, NEW.certificate_name);
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.issue_date IS DISTINCT FROM OLD.issue_date OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date)
     AND NEW.issue_date IS NOT NULL AND NEW.expiry_date IS NOT NULL AND NEW.expiry_date < NEW.issue_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'crew_document_dates_invalid',
      DETAIL = 'The expiry date cannot be before the issue date.', HINT = 'expiry_date';
  END IF;

  -- A material change returns a reviewed document to unverified (C27, T-139).
  IF TG_OP = 'UPDATE' THEN
    v_material := (NEW.certificate_number, NEW.issue_date, NEW.expiry_date, NEW.no_expiry, NEW.issuing_country_code,
                   NEW.document_type_id, NEW.file_path, NEW.file_url, NEW.certificate_type)
                  IS DISTINCT FROM
                  (OLD.certificate_number, OLD.issue_date, OLD.expiry_date, OLD.no_expiry, OLD.issuing_country_code,
                   OLD.document_type_id, OLD.file_path, OLD.file_url, OLD.certificate_type);
    IF v_material AND NEW.verification_status IS DISTINCT FROM 'unverified'
       AND NOT (v_engine AND NEW.verification_status IS DISTINCT FROM OLD.verification_status) THEN
      NEW.verification_status := 'unverified';
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
      NEW.verification_note := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_certificates_guard ON public.crew_certificates;
CREATE TRIGGER trg_crew_certificates_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.crew_certificates
  FOR EACH ROW EXECUTE FUNCTION public.crew_certificates_guard();

-- Mirrors the person's crew-report passport into profiles.passport_number,
-- passport_expiry and passport_country (the country's name; left as typed
-- when it already names the same country), writing only what differs;
-- with p_clear and no flagged passport left, clears the three columns.
-- Internal (the passport sync trigger; service role).
CREATE OR REPLACE FUNCTION public.crew_document_passport_mirror(p_profile_id uuid, p_clear boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number text;
  v_expiry date;
  v_code text;
  v_found boolean;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN;
  END IF;
  SELECT nullif(btrim(cc.certificate_number), ''), cc.expiry_date, cc.issuing_country_code
    INTO v_number, v_expiry, v_code
  FROM public.crew_certificates AS cc
  WHERE cc.profile_id = p_profile_id AND cc.use_in_crew_report AND cc.deleted_at IS NULL
  LIMIT 1;
  v_found := FOUND;
  IF v_found THEN
    -- A number written differently (spaces, case) is the same number: the profile keeps its spelling.
    UPDATE public.profiles AS p
    SET passport_number = CASE WHEN upper(regexp_replace(coalesce(p.passport_number, ''), '\s', '', 'g')) = upper(regexp_replace(coalesce(v_number, ''), '\s', '', 'g'))
                               THEN p.passport_number ELSE v_number END,
        passport_expiry = v_expiry,
        passport_country = CASE WHEN public.crew_country_from_text(p.passport_country) IS NOT DISTINCT FROM v_code THEN p.passport_country
                                ELSE (SELECT rc.name FROM public.ref_countries AS rc WHERE rc.iso2 = v_code) END
    WHERE p.id = p_profile_id
      AND (upper(regexp_replace(coalesce(p.passport_number, ''), '\s', '', 'g')) IS DISTINCT FROM upper(regexp_replace(coalesce(v_number, ''), '\s', '', 'g'))
           OR p.passport_expiry IS DISTINCT FROM v_expiry
           OR public.crew_country_from_text(p.passport_country) IS DISTINCT FROM v_code);
  ELSIF p_clear THEN
    UPDATE public.profiles AS p
    SET passport_number = NULL, passport_expiry = NULL, passport_country = NULL
    WHERE p.id = p_profile_id
      AND (p.passport_number IS NOT NULL OR p.passport_expiry IS NOT NULL OR p.passport_country IS NOT NULL);
  END IF;
END;
$$;

-- crew_certificates_passport_sync (AFTER INSERT, UPDATE, DELETE): when the
-- flagged passport is added, changed, unflagged or removed, re-mirror the
-- person's crew-report passport into profiles (C26).
CREATE OR REPLACE FUNCTION public.crew_certificates_passport_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_flagged boolean := false;
  v_old_flagged boolean := false;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_flagged := NEW.use_in_crew_report AND NEW.deleted_at IS NULL;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_flagged := OLD.use_in_crew_report AND OLD.deleted_at IS NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND v_new_flagged AND v_old_flagged
     AND (NEW.certificate_number, NEW.expiry_date, NEW.issuing_country_code, NEW.profile_id)
         IS NOT DISTINCT FROM (OLD.certificate_number, OLD.expiry_date, OLD.issuing_country_code, OLD.profile_id) THEN
    RETURN NULL;
  END IF;
  IF v_new_flagged THEN
    PERFORM public.crew_document_passport_mirror(NEW.profile_id, false);
  END IF;
  IF v_old_flagged AND (NOT v_new_flagged OR OLD.profile_id IS DISTINCT FROM NEW.profile_id) THEN
    PERFORM public.crew_document_passport_mirror(OLD.profile_id, true);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_certificates_passport_sync ON public.crew_certificates;
CREATE TRIGGER trg_crew_certificates_passport_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.crew_certificates
  FOR EACH ROW EXECUTE FUNCTION public.crew_certificates_passport_sync();

-- ---------------------------------------------------------------- the fleet expiry source (X5 contract, D-X5-01)

-- One row per expiry item of a person (X5's source-view contract): the
-- latest document of each type and issuing country (a no-expiry one wins,
-- then the latest expiry), removed documents and documents with a missing
-- date left out; plus the profile's passport or visa date for a person with
-- no document of that item type yet (the legacy HRIS forms still write
-- profiles.passport_* / visa_*; record_id is then the profile, the number is
-- never read). The vessel is the person's current one (fleet_current_crew);
-- the link opens the document's tab on the crew profile. Read only by X5's
-- definers (fleet_expiry_rows_for), never by the browser.
CREATE OR REPLACE VIEW public.expiry_src_crew_documents WITH (security_invoker = true) AS
WITH crew AS (
  SELECT DISTINCT ON (c.profile_id) c.profile_id, c.vessel_id
  FROM public.fleet_current_crew(NULL) AS c
  ORDER BY c.profile_id, c.is_planned, c.join_date DESC NULLS LAST, c.vessel_id
),
docs AS (
  SELECT DISTINCT ON (cc.profile_id,
                      coalesce(cc.document_type_id::text, 'legacy:' || coalesce(public.crew_document_legacy_key(cc.certificate_type), '')
                                                          || ':' || coalesce(public.crew_document_legacy_key(cc.certificate_name), '')),
                      coalesce(cc.issuing_country_code, ''))
         cc.id, cc.profile_id, cc.company_id, cc.document_type_id, cc.certificate_name, cc.certificate_number,
         cc.issuing_country_code, cc.expiry_date, cc.no_expiry, cc.endorsement_due_date, cc.alerts_muted,
         t.name AS type_name, coalesce(t.expiry_item_type, 'crew_qualification') AS item_type, coalesce(cat.tab, 'qualifications') AS tab
  FROM public.crew_certificates AS cc
  LEFT JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
  LEFT JOIN public.crew_document_categories AS cat ON cat.key = t.category_key
  WHERE cc.deleted_at IS NULL
    AND cc.profile_id IS NOT NULL
    AND cc.company_id IS NOT NULL
    AND (cc.expiry_date IS NOT NULL OR cc.no_expiry)
  ORDER BY cc.profile_id,
           coalesce(cc.document_type_id::text, 'legacy:' || coalesce(public.crew_document_legacy_key(cc.certificate_type), '')
                                               || ':' || coalesce(public.crew_document_legacy_key(cc.certificate_name), '')),
           coalesce(cc.issuing_country_code, ''),
           cc.no_expiry DESC, cc.expiry_date DESC NULLS LAST, cc.updated_at DESC, cc.id
),
items AS (
  SELECT d.id AS record_id, d.profile_id, d.company_id, d.item_type,
         coalesce(d.type_name, d.certificate_name)::text AS label,
         (CASE WHEN d.item_type IN ('passport', 'visa') THEN (SELECT rc.name FROM public.ref_countries AS rc WHERE rc.iso2 = d.issuing_country_code)
               ELSE nullif(btrim(d.certificate_number), '') END)::text AS detail,
         d.document_type_id AS certificate_type_id, d.expiry_date AS expires_on, d.no_expiry, d.endorsement_due_date AS endorsement_due_on,
         d.alerts_muted, d.tab
  FROM docs AS d
  UNION ALL
  SELECT p.id, p.id, p.company_id, 'passport', 'Passport', nullif(btrim(p.passport_country), ''),
         NULL::uuid, p.passport_expiry, false, NULL::date, false, 'documents'
  FROM public.profiles AS p
  WHERE p.passport_expiry IS NOT NULL AND p.company_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_certificates AS x
      JOIN public.crew_document_types AS xt ON xt.id = x.document_type_id
      WHERE x.profile_id = p.id AND x.deleted_at IS NULL AND xt.expiry_item_type = 'passport')
  UNION ALL
  SELECT p.id, p.id, p.company_id, 'visa', 'Visa', nullif(btrim(p.visa_status), ''),
         NULL::uuid, p.visa_expiry, false, NULL::date, false, 'documents'
  FROM public.profiles AS p
  WHERE p.visa_expiry IS NOT NULL AND p.company_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_certificates AS x
      JOIN public.crew_document_types AS xt ON xt.id = x.document_type_id
      WHERE x.profile_id = p.id AND x.deleted_at IS NULL AND xt.expiry_item_type = 'visa')
)
SELECT 'crew_documents'::text AS source_key,
       i.item_type::text AS item_type,
       i.record_id,
       i.company_id,
       crew.vessel_id,
       i.profile_id,
       i.label,
       i.detail,
       i.certificate_type_id,
       i.expires_on,
       i.no_expiry,
       i.endorsement_due_on,
       i.alerts_muted,
       (CASE WHEN crew.vessel_id IS NULL THEN 'workspace' ELSE 'vessel' END)::text AS link_scope,
       (CASE WHEN crew.vessel_id IS NULL THEN 'hris/employee-records' ELSE 'crew/people/' || i.profile_id::text || '/' || i.tab END)::text AS link_rel
FROM items AS i
LEFT JOIN crew ON crew.profile_id = i.profile_id;

-- ---------------------------------------------------------------- RPCs

-- A person's documents with their state (gap/04 C24, C29, W3; TS
-- documentState.ts). Gate: an active signed-in caller of the person's
-- company who may read the person's documents (crew_document_file_readable:
-- the person, HR viewers, crew_profiles.view + crew_certificates.view on a
-- vessel of the person; externals only their own). P0002 for an unknown or
-- foreign person, 42501 otherwise. Removed documents are left out. Per
-- document: the type and its tab, the fields, the file, verification and
-- alerts, the window (expiry_window_for), bucket, days left, endorsement
-- state and state (not_uploaded > missing_date > bucket), and whether the
-- caller may change or remove it.
CREATE OR REPLACE FUNCTION public.crew_documents_for_profile(p_profile_id uuid)
RETURNS TABLE (
  id uuid, profile_id uuid, user_id uuid,
  document_type_id uuid, type_key text, type_name text, type_code text, type_abbreviation text, stcw_reference text,
  category_key text, category_label text, tab text, expiry_item_type text, is_identity boolean, is_medical_fitness boolean,
  field_schema jsonb, legacy_type text, legacy_name text,
  number text, issuing_country_code text, issuing_office text, issuing_authority text,
  issue_date date, expiry_date date, no_expiry boolean, endorsement_due_date date, use_in_crew_report boolean,
  details jsonb, notes text,
  has_file boolean, file_path text, file_url text, file_name text, file_mime text, file_size integer,
  verification_status text, verified_by uuid, verified_by_name text, verified_at timestamptz, verification_note text,
  alerts_muted boolean, muted_by uuid, muted_at timestamptz, muted_reason text,
  source text, created_by uuid, created_at timestamptz, updated_at timestamptz,
  window_days integer, bucket text, days_remaining integer, endorsement_state text, state text,
  can_edit boolean, can_delete boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_can_edit boolean;
  v_can_remove boolean;
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
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted',
      DETAIL = 'You don''t have permission to see this person''s documents.';
  END IF;
  v_can_edit := coalesce(public.crew_document_may_write(v_uid, p_profile_id, 'edit'), false);
  v_can_remove := coalesce(public.crew_document_may_write(v_uid, p_profile_id, 'delete'), false);

  RETURN QUERY
  WITH base AS (
    SELECT cc.*, t.key AS t_key, t.name AS t_name, t.code AS t_code, t.abbreviation AS t_abbreviation, t.stcw_reference AS t_stcw,
           t.category_key AS t_category, cat.label AS cat_label, cat.sort_order AS cat_sort, t.sort_order AS t_sort,
           coalesce(cat.tab, 'qualifications') AS t_tab,
           coalesce(t.expiry_item_type, 'crew_qualification') AS t_item, coalesce(t.is_identity, false) AS t_identity,
           coalesce(t.is_medical_fitness, false) AS t_fitness, coalesce(t.field_schema, '{}'::jsonb) AS t_schema,
           (cc.file_path IS NOT NULL OR nullif(btrim(cc.file_url), '') IS NOT NULL) AS t_has_file,
           public.expiry_window_for(v_company, coalesce(t.expiry_item_type, 'crew_qualification'), cc.document_type_id) AS t_window
    FROM public.crew_certificates AS cc
    LEFT JOIN public.crew_document_types AS t ON t.id = cc.document_type_id
    LEFT JOIN public.crew_document_categories AS cat ON cat.key = t.category_key
    WHERE cc.profile_id = p_profile_id AND cc.deleted_at IS NULL
  ),
  scored AS (
    SELECT b.*,
           CASE WHEN b.expiry_date IS NULL AND NOT b.no_expiry THEN NULL
                ELSE public.expiry_bucket(b.expiry_date, b.t_window, current_date, b.no_expiry) END AS t_bucket
    FROM base AS b
  )
  SELECT s.id, s.profile_id, s.user_id,
         s.document_type_id, s.t_key, s.t_name, s.t_code, s.t_abbreviation, s.t_stcw,
         s.t_category, s.cat_label, s.t_tab, s.t_item, s.t_identity, s.t_fitness,
         s.t_schema, s.certificate_type, s.certificate_name,
         s.certificate_number, s.issuing_country_code, s.issuing_office, s.issuing_authority,
         s.issue_date, s.expiry_date, s.no_expiry, s.endorsement_due_date, s.use_in_crew_report,
         s.details, s.notes,
         s.t_has_file, s.file_path, s.file_url, s.file_name, s.file_mime, s.file_size,
         s.verification_status, s.verified_by,
         (SELECT nullif(btrim(concat_ws(' ', coalesce(vp.preferred_name, vp.first_name), vp.last_name)), '') FROM public.profiles AS vp WHERE vp.user_id = s.verified_by),
         s.verified_at, s.verification_note,
         s.alerts_muted, s.muted_by, s.muted_at, s.muted_reason,
         s.source, s.created_by, s.created_at, s.updated_at,
         s.t_window,
         s.t_bucket,
         CASE WHEN s.no_expiry OR s.expiry_date IS NULL THEN NULL ELSE s.expiry_date - current_date END,
         public.expiry_endorsement_state(s.endorsement_due_date, current_date, 30),
         CASE WHEN NOT s.t_has_file THEN 'not_uploaded' WHEN s.t_bucket IS NULL THEN 'missing_date' ELSE s.t_bucket END,
         v_can_edit,
         v_can_remove OR coalesce(s.created_by = v_uid AND s.created_at > now() - interval '24 hours', false)
  FROM scored AS s
  ORDER BY s.cat_sort NULLS LAST, s.t_sort NULLS LAST, coalesce(s.t_name, s.certificate_name), s.no_expiry DESC, s.expiry_date DESC NULLS LAST, s.id;
END;
$$;

-- What the caller may do with a person's documents (X1-04B's tabs and
-- /me/documents): read them, add one, change one; whether they are the
-- person and whether crew uploads are on for one of the person's vessels.
-- An unknown or foreign person: P0002; an inactive or signed-out caller:
-- 42501. One row.
CREATE OR REPLACE FUNCTION public.crew_document_rights(p_profile_id uuid)
RETURNS TABLE (can_view boolean, can_add boolean, can_edit boolean, is_own boolean, uploads_enabled boolean)
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
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_company IS NULL OR v_company IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  RETURN QUERY SELECT
    coalesce(public.crew_document_file_readable(v_uid, p_profile_id), false),
    coalesce(public.crew_document_may_write(v_uid, p_profile_id, 'create'), false),
    coalesce(public.crew_document_may_write(v_uid, p_profile_id, 'edit'), false),
    coalesce(p_profile_id = public.my_profile_id(), false),
    EXISTS (SELECT 1 FROM public.crew_profile_structural_vessels(p_profile_id) AS s(vessel_id)
            JOIN public.vessel_crew_settings AS vcs ON vcs.vessel_id = s.vessel_id
            WHERE vcs.crew_uploads_enabled);
END;
$$;

-- Adds (p_id NULL) or changes a crew document (gap/04 C24, C25, C26;
-- TS crewDocumentSchema.ts). Gate: crew_document_may_write(caller, person,
-- 'create' | 'edit'); P0002 for an unknown or foreign person, document or
-- type. p_payload holds the fields to set (absent keys keep their value on
-- a change, null clears): number, issue_date, expiry_date, no_expiry,
-- issuing_country_code, use_in_crew_report, file_path, file_name,
-- file_size, file_mime, notes, and the type's field_schema keys
-- issuing_office, endorsement_due_date (schema key endorsement_date),
-- capacity, limitations, visa_type, entries, grade. Refusals, 22023 with a
-- sentence in DETAIL and the field in HINT: field_unknown, field_invalid,
-- field_required (the type's required fields; a passport's issuing country
-- and issue date; an expiry date or the No-expiry tick),
-- crew_report_passport_exists, file_path_invalid, document_type_inactive.
-- The tick clears the expiry date; a date clears the tick. Returns the row.
CREATE OR REPLACE FUNCTION public.crew_document_save(p_id uuid, p_profile_id uuid, p_document_type_id uuid, p_payload jsonb)
RETURNS public.crew_certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_old public.crew_certificates;
  v_row public.crew_certificates;
  v_type public.crew_document_types;
  v_type_id uuid;
  v_key text;
  v_field text;
  v_schema_key text;
  v_prev_flag text;
  c_core CONSTANT text[] := ARRAY['number', 'issue_date', 'expiry_date', 'no_expiry', 'issuing_country_code', 'use_in_crew_report',
                                  'file_path', 'file_name', 'file_size', 'file_mime', 'notes'];
  c_schema CONSTANT text[] := ARRAY['issuing_office', 'endorsement_due_date', 'capacity', 'limitations', 'visa_type', 'entries', 'grade'];
  c_details CONSTANT text[] := ARRAY['capacity', 'limitations', 'visa_type', 'entries', 'grade'];
  c_file CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9][A-Za-z0-9._-]{0,199}$';
  -- the merged values
  v_number text;
  v_issue date;
  v_expiry date;
  v_no_expiry boolean;
  v_country text;
  v_office text;
  v_endorse date;
  v_report boolean;
  v_file_path text;
  v_file_name text;
  v_file_size integer;
  v_file_mime text;
  v_notes text;
  v_details jsonb;
  v_value text;
  v_parts text[];
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
  SELECT * INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_profile.company_id IS NULL OR v_profile.company_id IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.crew_certificates AS cc WHERE cc.id = p_id FOR UPDATE;
    IF NOT FOUND OR v_old.deleted_at IS NOT NULL OR v_old.profile_id IS DISTINCT FROM p_profile_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
    END IF;
  END IF;
  IF NOT coalesce(public.crew_document_may_write(v_uid, p_profile_id, CASE WHEN p_id IS NULL THEN 'create' ELSE 'edit' END), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted',
      DETAIL = CASE WHEN p_id IS NULL THEN 'You don''t have permission to add documents for this person.'
                    ELSE 'You don''t have permission to change this person''s documents.' END;
  END IF;

  -- The type: the one given, else the document's own.
  v_type_id := coalesce(p_document_type_id, v_old.document_type_id);
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required', DETAIL = 'Choose the document type.', HINT = 'document_type_id';
  END IF;
  SELECT * INTO v_type FROM public.crew_document_types AS t
  WHERE t.id = v_type_id AND (t.company_id IS NULL OR t.company_id = v_profile.company_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_type_not_found', DETAIL = 'This document type could not be found.';
  END IF;
  IF NOT v_type.is_active AND v_type_id IS DISTINCT FROM v_old.document_type_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'document_type_inactive', DETAIL = 'This document type is no longer offered.', HINT = 'document_type_id';
  END IF;

  -- Only the fields of this type.
  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    IF v_key = ANY (c_core) THEN
      CONTINUE;
    END IF;
    v_schema_key := CASE v_key WHEN 'endorsement_due_date' THEN 'endorsement_date' ELSE v_key END;
    IF NOT (v_key = ANY (c_schema)) OR NOT (v_type.field_schema ? v_schema_key) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_unknown',
        DETAIL = format('A %s has no field called "%s".', v_type.name, v_key), HINT = v_key;
    END IF;
  END LOOP;

  -- Start from the document (or nothing), keep only the fields this type has.
  v_number := v_old.certificate_number;
  v_issue := v_old.issue_date;
  v_expiry := v_old.expiry_date;
  v_no_expiry := coalesce(v_old.no_expiry, false);
  v_country := v_old.issuing_country_code;
  v_office := CASE WHEN v_type.field_schema ? 'issuing_office' THEN v_old.issuing_office END;
  v_endorse := CASE WHEN v_type.field_schema ? 'endorsement_date' THEN v_old.endorsement_due_date END;
  v_report := coalesce(v_old.use_in_crew_report, false) AND v_type.expiry_item_type = 'passport';
  v_file_path := v_old.file_path;
  v_file_name := v_old.file_name;
  v_file_size := v_old.file_size;
  v_file_mime := v_old.file_mime;
  v_notes := v_old.notes;
  v_details := coalesce(v_old.details, '{}'::jsonb);
  FOREACH v_key IN ARRAY c_details LOOP
    IF NOT (v_type.field_schema ? v_key) THEN
      v_details := v_details - v_key;
    END IF;
  END LOOP;

  -- Read the payload (text trimmed, blank is null).
  BEGIN
    FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
      v_field := v_key;
      v_value := CASE WHEN jsonb_typeof(p_payload -> v_key) = 'null' THEN NULL
                      WHEN jsonb_typeof(p_payload -> v_key) = 'string' THEN nullif(btrim(p_payload ->> v_key), '')
                      ELSE p_payload ->> v_key END;
      CASE v_key
        WHEN 'number' THEN v_number := v_value;
        WHEN 'issue_date' THEN v_issue := v_value::date;
        WHEN 'expiry_date' THEN v_expiry := v_value::date;
        WHEN 'no_expiry' THEN v_no_expiry := coalesce(v_value::boolean, false);
        WHEN 'issuing_country_code' THEN v_country := upper(v_value);
        WHEN 'use_in_crew_report' THEN v_report := coalesce(v_value::boolean, false);
        WHEN 'file_path' THEN v_file_path := v_value;
        WHEN 'file_name' THEN v_file_name := v_value;
        WHEN 'file_size' THEN v_file_size := v_value::integer;
        WHEN 'file_mime' THEN v_file_mime := lower(v_value);
        WHEN 'notes' THEN v_notes := v_value;
        WHEN 'issuing_office' THEN v_office := v_value;
        WHEN 'endorsement_due_date' THEN v_endorse := v_value::date;
        ELSE
          IF v_value IS NULL THEN
            v_details := v_details - v_key;
          ELSE
            v_details := v_details || jsonb_build_object(v_key, CASE WHEN v_key = 'entries' THEN lower(v_value) ELSE v_value END);
          END IF;
      END CASE;
    END LOOP;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
                 OR numeric_value_out_of_range OR invalid_parameter_value OR data_exception THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'This value could not be read. Check the dates and numbers.', HINT = v_field;
  END;

  -- The No-expiry tick and the expiry date exclude each other.
  IF p_payload ? 'no_expiry' AND v_no_expiry AND p_payload ? 'expiry_date' AND v_expiry IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid',
      DETAIL = 'A document with no expiry has no expiry date.', HINT = 'expiry_date';
  END IF;
  IF v_no_expiry AND (p_payload ? 'no_expiry' OR NOT (p_payload ? 'expiry_date')) THEN
    v_expiry := NULL;
  ELSIF v_expiry IS NOT NULL THEN
    v_no_expiry := false;
  END IF;

  -- Values.
  IF length(v_number) > 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the number to 60 characters or fewer.', HINT = 'number';
  END IF;
  IF v_issue IS NOT NULL AND (v_issue > current_date OR v_issue < DATE '1900-01-01') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'The issue date cannot be in the future.', HINT = 'issue_date';
  END IF;
  IF v_expiry IS NOT NULL AND (v_expiry > DATE '2200-12-31' OR v_expiry < DATE '1900-01-01') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Check the expiry date.', HINT = 'expiry_date';
  END IF;
  IF v_issue IS NOT NULL AND v_expiry IS NOT NULL AND v_expiry < v_issue THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'The expiry date cannot be before the issue date.', HINT = 'expiry_date';
  END IF;
  IF v_country IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ref_countries AS rc WHERE rc.iso2 = v_country) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Choose the issuing country from the list.', HINT = 'issuing_country_code';
  END IF;
  IF length(v_office) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the issuing office to 120 characters or fewer.', HINT = 'issuing_office';
  END IF;
  IF length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the notes to 2000 characters or fewer.', HINT = 'notes';
  END IF;
  IF length(v_details ->> 'capacity') > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the capacity to 120 characters or fewer.', HINT = 'capacity';
  END IF;
  IF length(v_details ->> 'limitations') > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the limitations to 500 characters or fewer.', HINT = 'limitations';
  END IF;
  IF length(v_details ->> 'visa_type') > 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the visa type to 60 characters or fewer.', HINT = 'visa_type';
  END IF;
  IF length(v_details ->> 'grade') > 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the grade to 60 characters or fewer.', HINT = 'grade';
  END IF;
  IF v_details ? 'entries' AND (v_details ->> 'entries') NOT IN ('single', 'double', 'multiple') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Entries are single, double or multiple.', HINT = 'entries';
  END IF;
  IF v_report AND v_type.expiry_item_type <> 'passport' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Only a passport can be used in the crew report.', HINT = 'use_in_crew_report';
  END IF;
  IF v_file_path IS NOT NULL AND v_file_path IS DISTINCT FROM v_old.file_path THEN
    v_parts := string_to_array(v_file_path, '/');
    IF coalesce(array_length(v_parts, 1), 0) <> 5
       OR v_parts[1] <> v_profile.company_id::text OR v_parts[2] <> 'crew' OR v_parts[3] <> p_profile_id::text
       OR v_parts[4] <> 'documents' OR v_parts[5] !~ c_file OR position('..' IN v_file_path) > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_path_invalid',
        DETAIL = 'The file must be uploaded to this person''s documents folder.', HINT = 'file_path';
    END IF;
  END IF;
  IF length(v_file_name) > 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the file name to 255 characters or fewer.', HINT = 'file_name';
  END IF;
  IF v_file_size IS NOT NULL AND (v_file_size < 0 OR v_file_size > 52428800) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'A file can be up to 50 MB.', HINT = 'file_size';
  END IF;
  IF v_file_mime IS NOT NULL AND (length(v_file_mime) > 120 OR v_file_mime !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'The file type could not be read.', HINT = 'file_mime';
  END IF;

  -- Required fields.
  IF v_type.expiry_item_type = 'passport' AND v_country IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required', DETAIL = 'Enter the issuing country.', HINT = 'issuing_country_code';
  END IF;
  IF v_type.expiry_item_type = 'passport' AND v_issue IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required', DETAIL = 'Enter the issue date.', HINT = 'issue_date';
  END IF;
  IF v_expiry IS NULL AND NOT v_no_expiry THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required', DETAIL = 'Enter the expiry date, or tick No expiry.', HINT = 'expiry_date';
  END IF;
  FOR v_schema_key IN SELECT k FROM jsonb_each_text(v_type.field_schema) AS e(k, v) WHERE e.v = 'required' LOOP
    IF (v_schema_key = 'issuing_office' AND v_office IS NULL)
       OR (v_schema_key = 'endorsement_date' AND v_endorse IS NULL)
       OR (v_schema_key = ANY (c_details) AND (v_details ->> v_schema_key) IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_required',
        DETAIL = format('Enter the %s.', replace(CASE v_schema_key WHEN 'endorsement_date' THEN 'endorsement date' WHEN 'visa_type' THEN 'visa type' ELSE v_schema_key END, '_', ' ')),
        HINT = CASE v_schema_key WHEN 'endorsement_date' THEN 'endorsement_due_date' ELSE v_schema_key END;
    END IF;
  END LOOP;
  IF v_report AND EXISTS (
    SELECT 1 FROM public.crew_certificates AS x
    WHERE x.profile_id = p_profile_id AND x.use_in_crew_report AND x.deleted_at IS NULL AND x.id IS DISTINCT FROM p_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'crew_report_passport_exists',
      DETAIL = 'Another passport is already used in the crew report. Turn it off there first.', HINT = 'use_in_crew_report';
  END IF;

  v_prev_flag := coalesce(current_setting('storm.crew_engine', true), '');
  PERFORM set_config('storm.crew_engine', 'on', true);
  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.crew_certificates (
        user_id, profile_id, company_id, certificate_type, certificate_name, certificate_number, issuing_authority,
        issue_date, expiry_date, file_name, file_size, notes, status, created_by, updated_by,
        document_type_id, issuing_country_code, issuing_office, no_expiry, endorsement_due_date, use_in_crew_report,
        file_path, file_mime, source, details)
      VALUES (
        v_profile.user_id, p_profile_id, v_profile.company_id, v_type.name, v_type.name, v_number, v_office,
        v_issue, v_expiry, v_file_name, v_file_size, v_notes, 'Valid', v_uid, v_uid,
        v_type.id, v_country, v_office, v_no_expiry, v_endorse, v_report,
        v_file_path, v_file_mime, 'manual', v_details)
      RETURNING * INTO v_row;
    ELSE
      UPDATE public.crew_certificates AS cc
      SET certificate_type = v_type.name, certificate_name = v_type.name, certificate_number = v_number, issuing_authority = v_office,
          issue_date = v_issue, expiry_date = v_expiry, file_name = v_file_name, file_size = v_file_size, notes = v_notes,
          updated_by = v_uid, document_type_id = v_type.id, issuing_country_code = v_country, issuing_office = v_office,
          no_expiry = v_no_expiry, endorsement_due_date = v_endorse, use_in_crew_report = v_report,
          file_path = v_file_path, file_mime = v_file_mime, details = v_details
      WHERE cc.id = p_id AND cc.deleted_at IS NULL
      RETURNING * INTO v_row;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
      END IF;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'crew_report_passport_exists',
      DETAIL = 'Another passport is already used in the crew report. Turn it off there first.', HINT = 'use_in_crew_report';
  END;
  PERFORM set_config('storm.crew_engine', v_prev_flag, true);
  RETURN v_row;
END;
$$;

-- Removes a document (soft delete, W3): the person who added it, within 24
-- hours and while they may still read it, or a document editor of the
-- person (crew_document_may_write 'delete': HR editors and holders of
-- crew_certificates.edit, not the person's own uploads), who gives a reason
-- (22023 reason_required). Unknown, foreign or already removed: P0002. Returns the
-- id. The crew-report flag goes with it (the profile's passport columns are
-- cleared by the passport mirror).
CREATE OR REPLACE FUNCTION public.crew_document_delete(p_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.crew_certificates;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_uploader boolean;
  v_editor boolean;
  v_prev_flag text;
  v_id uuid;
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
  v_editor := coalesce(public.crew_document_may_write(v_uid, v_doc.profile_id, 'delete'), false);
  v_uploader := coalesce(v_doc.created_by = v_uid AND v_doc.created_at > now() - interval '24 hours', false)
                AND coalesce(public.crew_document_file_readable(v_uid, v_doc.profile_id), false);
  IF NOT (v_editor OR v_uploader) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_document_delete_refused',
      DETAIL = 'Only the person who added this document, within 24 hours, or a crew document editor can remove it.';
  END IF;
  IF NOT v_uploader AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required', DETAIL = 'Say why this document is being removed.', HINT = 'reason';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the reason to 500 characters or fewer.', HINT = 'reason';
  END IF;
  v_prev_flag := coalesce(current_setting('storm.crew_engine', true), '');
  PERFORM set_config('storm.crew_engine', 'on', true);
  UPDATE public.crew_certificates AS cc
  SET deleted_at = now(), deleted_by = v_uid, deleted_reason = v_reason, use_in_crew_report = false, updated_by = v_uid
  WHERE cc.id = p_id AND cc.deleted_at IS NULL
  RETURNING cc.id INTO v_id;
  PERFORM set_config('storm.crew_engine', v_prev_flag, true);
  IF v_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_not_found', DETAIL = 'This document could not be found.';
  END IF;
  RETURN v_id;
END;
$$;

-- Issuing offices already used for a type in the caller's company, most used
-- first, at most 20 (T-170). Gate: a caller who may add documents somewhere
-- (an HR editor, crew_certificates.create on a reached vessel, or their own
-- uploads); P0002 for an unknown or foreign type.
CREATE OR REPLACE FUNCTION public.crew_document_issuing_suggestions(p_document_type_id uuid)
RETURNS TABLE (issuing_office text, uses integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT coalesce(public.user_is_active(v_uid), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'Your account is not active.';
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF NOT EXISTS (SELECT 1 FROM public.crew_document_types AS t WHERE t.id = p_document_type_id AND (t.company_id IS NULL OR t.company_id = v_company)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_type_not_found', DETAIL = 'This document type could not be found.';
  END IF;
  IF NOT (coalesce(public.hr_can_edit(v_uid), false)
          OR EXISTS (SELECT 1 FROM public.crew_cap_vessel_ids('vessel.crew.crew_certificates.create'))
          OR coalesce(public.crew_document_may_write(v_uid, public.my_profile_id(), 'create'), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You don''t have permission to add crew documents.';
  END IF;
  RETURN QUERY
    SELECT max(x.office)::text, count(*)::integer
    FROM (
      SELECT btrim(coalesce(nullif(btrim(cc.issuing_office), ''), cc.issuing_authority)) AS office
      FROM public.crew_certificates AS cc
      WHERE cc.company_id = v_company AND cc.document_type_id = p_document_type_id AND cc.deleted_at IS NULL
    ) AS x
    WHERE x.office IS NOT NULL AND x.office <> ''
    GROUP BY lower(x.office)
    ORDER BY count(*) DESC, max(x.office)
    LIMIT 20;
END;
$$;

-- TR9 (platform plan contract 3): records a qualification from another
-- engine, today X5's completed course (p_source 'training'). Service role
-- only; X5's definer calls it as owner. The person and the type must belong
-- to one company (a system type is allowed) and, under a JWT, the caller
-- must be active and of that company (42501). Idempotent per (p_source,
-- p_source_ref): a reference already recorded returns its document. Else
-- the person's latest document of the type is renewed when the new expiry
-- is later (or both have none and the issue is later): new dates, the tick
-- from a missing expiry, the replaced number and file kept in
-- details.replaced (X1-05 versions them), verification reset by the guard;
-- otherwise a new document is created. Returns the document id. 22023
-- source_invalid / source_ref_required / field_invalid; P0002 for an
-- unknown person or type.
CREATE OR REPLACE FUNCTION public.crew_document_record_from_source(
  p_profile_id uuid, p_document_type_id uuid, p_issue_date date, p_expiry_date date, p_source text, p_source_ref uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_type public.crew_document_types;
  v_ref text;
  v_doc public.crew_certificates;
  v_id uuid;
  v_prev_flag text;
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('training', 'import', 'registry') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'source_invalid', DETAIL = 'The source must be training, import or registry.';
  END IF;
  IF p_source_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'source_ref_required', DETAIL = 'A source reference is required.';
  END IF;
  IF p_issue_date IS NOT NULL AND p_expiry_date IS NOT NULL AND p_expiry_date < p_issue_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'The expiry date cannot be before the issue date.', HINT = 'expiry_date';
  END IF;
  SELECT * INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_profile.company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  IF v_uid IS NOT NULL AND (NOT coalesce(public.user_is_active(v_uid), false)
                            OR public.get_user_company_id(v_uid) IS DISTINCT FROM v_profile.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can only record documents for your own company''s crew.';
  END IF;
  SELECT * INTO v_type FROM public.crew_document_types AS t
  WHERE t.id = p_document_type_id AND (t.company_id IS NULL OR t.company_id = v_profile.company_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'document_type_not_found', DETAIL = 'This document type could not be found.';
  END IF;

  v_ref := p_source || ':' || p_source_ref::text;
  SELECT cc.id INTO v_id FROM public.crew_certificates AS cc
  WHERE cc.profile_id = p_profile_id AND cc.deleted_at IS NULL AND cc.details -> 'source_refs' ? v_ref
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT * INTO v_doc FROM public.crew_certificates AS cc
  WHERE cc.profile_id = p_profile_id AND cc.document_type_id = v_type.id AND cc.deleted_at IS NULL
  ORDER BY cc.no_expiry DESC, cc.expiry_date DESC NULLS LAST, cc.updated_at DESC, cc.id
  LIMIT 1
  FOR UPDATE;

  v_prev_flag := coalesce(current_setting('storm.crew_engine', true), '');
  PERFORM set_config('storm.crew_engine', 'on', true);
  IF v_doc.id IS NULL THEN
    INSERT INTO public.crew_certificates (
      user_id, profile_id, company_id, certificate_type, certificate_name, issue_date, expiry_date, status, created_by, updated_by,
      document_type_id, no_expiry, source, external_ref, details)
    VALUES (
      v_profile.user_id, p_profile_id, v_profile.company_id, v_type.name, v_type.name, p_issue_date, p_expiry_date, 'Valid', v_uid, v_uid,
      v_type.id, p_expiry_date IS NULL, p_source, p_source_ref::text, jsonb_build_object('source_refs', jsonb_build_array(v_ref)))
    RETURNING id INTO v_id;
  ELSIF (p_expiry_date IS NOT NULL AND NOT v_doc.no_expiry AND (v_doc.expiry_date IS NULL OR p_expiry_date > v_doc.expiry_date))
        OR (p_expiry_date IS NULL AND NOT v_doc.no_expiry)
        OR (p_expiry_date IS NULL AND v_doc.no_expiry AND p_issue_date IS NOT NULL AND (v_doc.issue_date IS NULL OR p_issue_date > v_doc.issue_date)) THEN
    UPDATE public.crew_certificates AS cc
    SET issue_date = p_issue_date, expiry_date = p_expiry_date, no_expiry = p_expiry_date IS NULL,
        certificate_number = NULL, file_path = NULL, file_url = NULL, file_name = NULL, file_size = NULL, file_mime = NULL,
        source = p_source, external_ref = p_source_ref::text, updated_by = v_uid,
        details = jsonb_set(
          cc.details || jsonb_build_object('replaced', jsonb_build_object(
            'number', cc.certificate_number, 'issue_date', cc.issue_date, 'expiry_date', cc.expiry_date,
            'file_path', cc.file_path, 'file_url', cc.file_url, 'file_name', cc.file_name, 'replaced_at', now())),
          '{source_refs}', coalesce(cc.details -> 'source_refs', '[]'::jsonb) || to_jsonb(v_ref))
    WHERE cc.id = v_doc.id
    RETURNING cc.id INTO v_id;
  ELSE
    -- An older or equal completion: recorded, nothing changes.
    UPDATE public.crew_certificates AS cc
    SET details = jsonb_set(cc.details, '{source_refs}', coalesce(cc.details -> 'source_refs', '[]'::jsonb) || to_jsonb(v_ref))
    WHERE cc.id = v_doc.id
    RETURNING cc.id INTO v_id;
  END IF;
  PERFORM set_config('storm.crew_engine', v_prev_flag, true);
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- backfill (service role; the seed)

-- Carries the legacy crew documents into the catalogue (gap/04
-- implementation notes, migration order 2 to 4). Idempotent: every step
-- skips what an earlier run did. Returns the counts.
CREATE OR REPLACE FUNCTION public.crew_document_catalogue_backfill()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_passport uuid := md5('storm.crew_document_type.passport')::uuid;
  v_visa uuid := md5('storm.crew_document_type.visa')::uuid;
  v_subjects integer;
  v_mapped integer;
  v_matched integer;
  v_profile_passports integer;
  v_flagged integer;
  v_travel_passports integer;
  v_travel_flagged integer;
  v_visas integer;
BEGIN
  -- 1. The person and the company, from the login.
  UPDATE public.crew_certificates AS cc
  SET profile_id = p.id, company_id = p.company_id
  FROM public.profiles AS p
  WHERE p.user_id = cc.user_id AND p.company_id IS NOT NULL
    AND (cc.profile_id IS NULL OR cc.company_id IS NULL);
  GET DIAGNOSTICS v_subjects = ROW_COUNT;

  -- 2. The type: the legacy map (type, then name) ...
  UPDATE public.crew_certificates AS cc
  SET document_type_id = m.type_id
  FROM (
    SELECT x.id, public.crew_document_type_for_legacy(x.company_id, x.certificate_type, x.certificate_name) AS type_id
    FROM public.crew_certificates AS x
    WHERE x.document_type_id IS NULL AND x.company_id IS NOT NULL
  ) AS m
  WHERE m.id = cc.id AND m.type_id IS NOT NULL;
  GET DIAGNOSTICS v_mapped = ROW_COUNT;
  -- ... else exactly one system type whose name, code or abbreviation is the certificate's name or type.
  UPDATE public.crew_certificates AS cc
  SET document_type_id = m.type_id
  FROM (
    SELECT x.id, min(t.id::text)::uuid AS type_id
    FROM public.crew_certificates AS x
    JOIN public.crew_document_types AS t
      ON t.company_id IS NULL AND t.is_active
     AND (public.crew_document_legacy_key(x.certificate_name) IN (public.crew_document_legacy_key(t.name), public.crew_document_legacy_key(t.code), public.crew_document_legacy_key(t.abbreviation))
          OR public.crew_document_legacy_key(x.certificate_type) IN (public.crew_document_legacy_key(t.name), public.crew_document_legacy_key(t.code)))
    WHERE x.document_type_id IS NULL AND x.company_id IS NOT NULL
    GROUP BY x.id
    HAVING count(DISTINCT t.id) = 1
  ) AS m
  WHERE m.id = cc.id;
  GET DIAGNOSTICS v_matched = ROW_COUNT;

  -- 3. The profile's passport, unless one of the person's passport
  --    documents is that passport (same number, or same expiry when the
  --    profile has no number).
  INSERT INTO public.crew_certificates (
    user_id, profile_id, company_id, certificate_type, certificate_name, certificate_number, expiry_date, status,
    document_type_id, issuing_country_code, no_expiry, use_in_crew_report, source, external_ref)
  SELECT p.user_id, p.id, p.company_id, 'Passport', 'Passport', nullif(btrim(p.passport_number), ''), p.passport_expiry, 'Valid',
         v_passport, public.crew_country_from_text(p.passport_country), false,
         NOT EXISTS (SELECT 1 FROM public.crew_certificates AS f WHERE f.profile_id = p.id AND f.use_in_crew_report AND f.deleted_at IS NULL),
         'import', 'profile:passport'
  FROM public.profiles AS p
  WHERE p.company_id IS NOT NULL
    AND (nullif(btrim(p.passport_number), '') IS NOT NULL OR p.passport_expiry IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_certificates AS x
      JOIN public.crew_document_types AS t ON t.id = x.document_type_id AND t.expiry_item_type = 'passport'
      WHERE x.profile_id = p.id AND x.deleted_at IS NULL
        AND ((nullif(btrim(p.passport_number), '') IS NOT NULL
              AND upper(regexp_replace(coalesce(x.certificate_number, ''), '\s', '', 'g')) = upper(regexp_replace(p.passport_number, '\s', '', 'g')))
             OR (nullif(btrim(p.passport_number), '') IS NULL AND x.expiry_date IS NOT DISTINCT FROM p.passport_expiry)
             OR (x.source = 'import' AND x.external_ref = 'profile:passport')));
  GET DIAGNOSTICS v_profile_passports = ROW_COUNT;

  -- 4. One crew-report passport per person: the one matching the profile, else the latest.
  WITH pick AS (
    SELECT DISTINCT ON (x.profile_id) x.id
    FROM public.crew_certificates AS x
    JOIN public.crew_document_types AS t ON t.id = x.document_type_id AND t.expiry_item_type = 'passport'
    JOIN public.profiles AS p ON p.id = x.profile_id
    WHERE x.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.crew_certificates AS f WHERE f.profile_id = x.profile_id AND f.use_in_crew_report AND f.deleted_at IS NULL)
    ORDER BY x.profile_id,
             (nullif(btrim(p.passport_number), '') IS NOT NULL
              AND upper(regexp_replace(coalesce(x.certificate_number, ''), '\s', '', 'g')) = upper(regexp_replace(p.passport_number, '\s', '', 'g'))) DESC,
             x.expiry_date DESC NULLS LAST, x.created_at DESC, x.id
  )
  UPDATE public.crew_certificates AS cc SET use_in_crew_report = true FROM pick WHERE pick.id = cc.id;
  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  -- 5. Passports from travel documents (type passport) for people with none.
  INSERT INTO public.crew_certificates (
    user_id, profile_id, company_id, certificate_type, certificate_name, certificate_number, issue_date, expiry_date, status,
    document_type_id, issuing_country_code, no_expiry, source, external_ref)
  SELECT p.user_id, p.id, p.company_id, 'Passport', 'Passport',
         left(nullif(btrim(coalesce(td.extracted_data ->> 'document_number', td.extracted_data ->> 'passport_number')), ''), 60),
         td.valid_from, CASE WHEN td.valid_from IS NOT NULL AND td.valid_until < td.valid_from THEN NULL ELSE td.valid_until END, 'Valid',
         v_passport, public.crew_country_from_text(coalesce(td.extracted_data ->> 'issuing_country', td.extracted_data ->> 'nationality')),
         false, 'import', 'travel:' || td.id::text
  FROM public.crew_travel_documents AS td
  JOIN public.profiles AS p ON p.user_id = td.crew_member_id AND p.company_id = td.company_id
  WHERE td.document_type = 'passport'
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_certificates AS x
      JOIN public.crew_document_types AS t ON t.id = x.document_type_id AND t.expiry_item_type = 'passport'
      WHERE x.profile_id = p.id AND x.deleted_at IS NULL AND NOT (x.source = 'import' AND x.external_ref LIKE 'travel:%'))
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_certificates AS x
      WHERE x.profile_id = p.id AND x.source = 'import' AND x.external_ref = 'travel:' || td.id::text);
  GET DIAGNOSTICS v_travel_passports = ROW_COUNT;
  WITH pick AS (
    SELECT DISTINCT ON (x.profile_id) x.id
    FROM public.crew_certificates AS x
    WHERE x.deleted_at IS NULL AND x.source = 'import' AND x.external_ref LIKE 'travel:%'
      AND NOT EXISTS (SELECT 1 FROM public.crew_certificates AS f WHERE f.profile_id = x.profile_id AND f.use_in_crew_report AND f.deleted_at IS NULL)
    ORDER BY x.profile_id, x.expiry_date DESC NULLS LAST, x.id
  )
  UPDATE public.crew_certificates AS cc SET use_in_crew_report = true FROM pick WHERE pick.id = cc.id;
  GET DIAGNOSTICS v_travel_flagged = ROW_COUNT;

  -- 6. The profile's visa date, unless a visa document has that expiry.
  INSERT INTO public.crew_certificates (
    user_id, profile_id, company_id, certificate_type, certificate_name, expiry_date, status, document_type_id, no_expiry,
    source, external_ref, details)
  SELECT p.user_id, p.id, p.company_id, 'Visa', 'Visa', p.visa_expiry, 'Valid', v_visa, false, 'import', 'profile:visa',
         CASE WHEN nullif(btrim(p.visa_status), '') IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('visa_type', left(btrim(p.visa_status), 60)) END
  FROM public.profiles AS p
  WHERE p.company_id IS NOT NULL AND p.visa_expiry IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_certificates AS x
      JOIN public.crew_document_types AS t ON t.id = x.document_type_id AND t.expiry_item_type = 'visa'
      WHERE x.profile_id = p.id AND x.deleted_at IS NULL
        AND (x.expiry_date IS NOT DISTINCT FROM p.visa_expiry OR (x.source = 'import' AND x.external_ref = 'profile:visa')));
  GET DIAGNOSTICS v_visas = ROW_COUNT;

  RETURN jsonb_build_object(
    'subjects', v_subjects, 'mapped', v_mapped, 'matched', v_matched,
    'profile_passports', v_profile_passports, 'flagged', v_flagged,
    'travel_passports', v_travel_passports, 'travel_flagged', v_travel_flagged, 'profile_visas', v_visas);
END;
$$;

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.crew_document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_document_type_satisfies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_document_type_legacy_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_crew_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_certificates ENABLE ROW LEVEL SECURITY;

-- The global categories: active signed-in users (D-55: never USING (true)).
DROP POLICY IF EXISTS crew_document_categories_read ON public.crew_document_categories;
CREATE POLICY crew_document_categories_read ON public.crew_document_categories
  FOR SELECT TO authenticated
  USING ((SELECT public.user_is_active((SELECT auth.uid()))));

-- Types and rules: STORM's rows for active users, a company's for its members.
DROP POLICY IF EXISTS crew_document_types_read ON public.crew_document_types;
CREATE POLICY crew_document_types_read ON public.crew_document_types
  FOR SELECT TO authenticated
  USING ((company_id IS NULL AND (SELECT public.user_is_active((SELECT auth.uid()))))
         OR company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))));
DROP POLICY IF EXISTS crew_document_type_satisfies_read ON public.crew_document_type_satisfies;
CREATE POLICY crew_document_type_satisfies_read ON public.crew_document_type_satisfies
  FOR SELECT TO authenticated
  USING ((company_id IS NULL AND (SELECT public.user_is_active((SELECT auth.uid()))))
         OR company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))));

-- The legacy map: the service role only (no browser grant either).
DROP POLICY IF EXISTS crew_document_type_legacy_map_service ON public.crew_document_type_legacy_map;
CREATE POLICY crew_document_type_legacy_map_service ON public.crew_document_type_legacy_map
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Vessel crew settings: holders of the crew list on the vessel (no browser write policy; X1-06 writes).
DROP POLICY IF EXISTS vessel_crew_settings_read ON public.vessel_crew_settings;
CREATE POLICY vessel_crew_settings_read ON public.vessel_crew_settings
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company((SELECT auth.uid()), company_id)
         AND vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_list.view')));

-- Crew documents. The live company-wide read (20260127161741, defined by no
-- build-out file) is replaced by the scoped read; the RESTRICTIVE pin keeps
-- every read and write of a signed-in caller inside their company. The
-- legacy write policies ("Crew or HR can insert / update / delete crew
-- certificates", hr_can_write_crew_record) stay as they are.
DROP POLICY IF EXISTS "Users can view crew certificates in their company" ON public.crew_certificates;
DROP POLICY IF EXISTS crew_documents_select_scoped ON public.crew_certificates;
CREATE POLICY crew_documents_select_scoped ON public.crew_certificates
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (profile_id = (SELECT public.my_profile_id())
              OR profile_id IN (SELECT public.crew_document_visible_profile_ids())));
DROP POLICY IF EXISTS crew_documents_tenant_pin ON public.crew_certificates;
CREATE POLICY crew_documents_tenant_pin ON public.crew_certificates
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))))
  WITH CHECK (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))));

-- ---------------------------------------------------------------- grants

REVOKE ALL ON public.crew_document_categories, public.crew_document_types, public.crew_document_type_satisfies,
  public.crew_document_type_legacy_map, public.vessel_crew_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_document_categories, public.crew_document_types, public.crew_document_type_satisfies,
  public.vessel_crew_settings TO authenticated;
GRANT ALL ON public.crew_document_categories, public.crew_document_types, public.crew_document_type_satisfies,
  public.crew_document_type_legacy_map, public.vessel_crew_settings TO service_role;
REVOKE ALL ON public.expiry_src_crew_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.expiry_src_crew_documents TO service_role;

-- Browser RPCs and the RLS set.
REVOKE ALL ON FUNCTION public.crew_documents_for_profile(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_documents_for_profile(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_rights(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_rights(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_save(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_save(uuid, uuid, uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_delete(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_delete(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_issuing_suggestions(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_issuing_suggestions(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_visible_profile_ids() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_visible_profile_ids() TO authenticated, service_role;

-- Internal: the service role (X5's definer, the storage gate, the definers) only.
REVOKE ALL ON FUNCTION public.crew_document_record_from_source(uuid, uuid, date, date, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_record_from_source(uuid, uuid, date, date, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_file_readable(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_file_readable(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_file_writable(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_file_writable(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_may_write(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_may_write(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_type_satisfiers(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_type_satisfiers(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_type_for_legacy(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_type_for_legacy(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_legacy_key(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_legacy_key(text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_passport_mirror(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_passport_mirror(uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.crew_document_catalogue_backfill() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_document_catalogue_backfill() TO service_role;
-- Trigger functions: no grant.
REVOKE ALL ON FUNCTION public.crew_certificates_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_certificates_passport_sync() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_types_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_type_satisfies_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_document_type_legacy_map_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_crew_settings_scope_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON VIEW public.expiry_src_crew_documents IS 'Expiry source crew_documents (D-X5-01 contract; X1-04): the latest crew document of each type and issuing country per person (removed documents and missing dates left out; the type''s expiry item type), plus the profile''s passport / visa date for a person with no such document; vessel from fleet_current_crew(); link to the document''s tab on the crew profile. Definers only.';
COMMENT ON FUNCTION public.crew_document_legacy_key(text) IS 'Normalised key of a legacy certificate string: lower case, & as and, runs of other characters one underscore (pure; TS legacyDocumentKey in src/modules/crew/lib/documentTabs.ts).';
COMMENT ON FUNCTION public.crew_document_type_for_legacy(uuid, text, text) IS 'Internal: the document type a legacy certificate type or name maps to (crew_document_type_legacy_map; the company''s rows first, the type before the name).';
COMMENT ON FUNCTION public.crew_document_type_satisfiers(uuid, uuid) IS 'Internal (X1-06): every document type whose holder satisfies a requirement for the type in the company, through STORM''s and the company''s rules and their chains (six steps at most), with the kind of the reaching rule and the depth.';
COMMENT ON FUNCTION public.crew_document_visible_profile_ids() IS 'X1 caller-only RLS set (D-229): the profiles whose documents the caller may read: their own, every profile of the company for a legacy HR viewer, else people with a structural vessel where the caller holds vessel.crew.crew_profiles.view and one where they hold vessel.crew.crew_certificates.view; external viewers only their own; empty without a JWT or for an inactive caller.';
COMMENT ON FUNCTION public.crew_document_file_readable(uuid, uuid) IS 'Storage and RPC predicate (PR-X1-F, D-X1-18): whether the user may read the person''s documents and files; the rule of crew_document_visible_profile_ids() for any user. Internal (service role; 20261124000100''s gate and the X1 definers).';
COMMENT ON FUNCTION public.crew_document_file_writable(uuid, uuid) IS 'Storage predicate (PR-X1-F, D-X1-18): whether the user may add or change a document of the person (crew_document_may_write create or edit). Internal (service role; 20261124000100''s gate).';
COMMENT ON FUNCTION public.crew_document_may_write(uuid, uuid, text) IS 'Internal: whether the user may add (create), change (edit) or remove (delete) a document of the person: active, same company, no external viewer, and a legacy HR editor, or vessel.crew.crew_certificates.create / .edit (delete: .edit) on a vessel of the person''s structural set, or (create, edit) the person with crew uploads on for one of their vessels and view_own there.';
COMMENT ON FUNCTION public.crew_certificates_guard() IS 'Trigger (every writer): fills the person, login and company from each other, keeps a document in its person''s company (23514), names a legacy row''s type through the legacy map, refuses an expiry before the issue date on a new row or changed date (22023 crew_document_dates_invalid) and returns a reviewed document to unverified on a material change. Signed-in writers outside storm.crew_engine: own company only, the subject never moves, the new columns stay the X1 definers'' (42501 crew_document_engine_only), and a reviewed or removed document is never hard-deleted (42501 crew_document_delete_refused).';
COMMENT ON FUNCTION public.crew_document_passport_mirror(uuid, boolean) IS 'Internal: mirrors the person''s crew-report passport into profiles.passport_number, passport_expiry and passport_country (only what differs), or clears them with p_clear when no flagged passport is left.';
COMMENT ON FUNCTION public.crew_certificates_passport_sync() IS 'Trigger AFTER INSERT / UPDATE / DELETE on crew_certificates: re-mirrors the crew-report passport into profiles when it is added, changed, unflagged or removed (gap/04 C26).';
COMMENT ON FUNCTION public.crew_documents_for_profile(uuid) IS 'A person''s documents with their state (gap/04 C24, C29, W3; TS documentState.ts): type and tab, fields, file, verification, alerts, window (expiry_window_for), bucket, days left, endorsement state and state (not_uploaded > missing_date > bucket), and the caller''s edit / remove rights. Gate: crew_document_file_readable (P0002 unknown or foreign person, 42501 otherwise).';
COMMENT ON FUNCTION public.crew_document_rights(uuid) IS 'What the caller may do with a person''s documents: view, add, change, whether it is their own profile and whether crew uploads are on for one of the person''s vessels (P0002 unknown or foreign person).';
COMMENT ON FUNCTION public.crew_document_save(uuid, uuid, uuid, jsonb) IS 'Adds or changes a crew document (gap/04 C24, C25, C26): crew_document_may_write create / edit; the type''s field_schema decides the fields (22023 field_unknown / field_invalid / field_required with the field in HINT); passports need the issuing country and issue date; an expiry date or the No-expiry tick; one crew-report passport per person (22023 crew_report_passport_exists); the file under <company>/crew/<profile>/documents/ (22023 file_path_invalid). Returns the row.';
COMMENT ON FUNCTION public.crew_document_delete(uuid, text) IS 'Removes a crew document (soft, W3): the person who added it within 24 hours, or a document editor with a reason (22023 reason_required); 42501 crew_document_delete_refused; P0002 unknown, foreign or removed. Returns the id.';
COMMENT ON FUNCTION public.crew_document_issuing_suggestions(uuid) IS 'Issuing offices already used for the type in the caller''s company, most used first, at most 20 (T-170). Gate: an HR editor, crew_certificates.create on a reached vessel, or the caller''s own uploads.';
COMMENT ON FUNCTION public.crew_document_record_from_source(uuid, uuid, date, date, text, uuid) IS 'TR9 provider (platform plan contract 3; X5 calls it as owner): records a qualification from another engine (training, import, registry): idempotent per source and reference; renews the person''s latest document of the type when the new expiry is later (the replaced number and file in details.replaced; verification reset), else creates one. Person and type of one company; a signed-in caller active and of that company. Service role only.';
COMMENT ON FUNCTION public.crew_document_catalogue_backfill() IS 'The seed (service role, idempotent): person and company from the login, the type from the legacy map or an exact name / code match, a passport document from profiles.passport_* (and the crew-report flag), passports from crew_travel_documents, a visa document from profiles.visa_expiry. Returns the counts.';
COMMENT ON FUNCTION public.crew_document_types_scope_guard() IS 'Trigger: a document type keeps its owner (23514 crew_document_type_scope_locked).';
COMMENT ON FUNCTION public.crew_document_type_satisfies_scope_guard() IS 'Trigger: a satisfaction rule links types of its own company or STORM''s (23514 crew_document_rule_scope_mismatch).';
COMMENT ON FUNCTION public.crew_document_type_legacy_map_scope_guard() IS 'Trigger: a legacy mapping points at a type of its own company or STORM''s (23514 crew_document_legacy_scope_mismatch).';
COMMENT ON FUNCTION public.vessel_crew_settings_scope_guard() IS 'Trigger: a vessel''s crew settings carry its company (filled; 23514 vessel_crew_settings_scope_mismatch).';

-- ---------------------------------------------------------------- seeds (STORM wording, D-07)

-- 37 categories, each on one profile tab (T-185: medical certificates are documents, never qualifications).
INSERT INTO public.crew_document_categories (key, label, tab, sort_order, is_active) VALUES
  ('passports', 'Passports', 'documents', 10, true),
  ('seafarer_identity', 'Seafarer identity and record books', 'documents', 20, true),
  ('visas', 'Visas', 'documents', 30, true),
  ('work_permits', 'Work and residence permits', 'documents', 40, true),
  ('medical_fitness', 'Medical fitness', 'documents', 50, true),
  ('health_records', 'Vaccinations and health tests', 'documents', 60, true),
  ('identity_other', 'Other identity documents', 'documents', 70, true),
  ('licences', 'Driving licences', 'documents', 80, true),
  ('other_documents', 'Other documents', 'documents', 90, true),
  ('stcw_basic', 'Basic safety (STCW VI/1)', 'stcw', 110, true),
  ('stcw_survival_craft', 'Survival craft and rescue boats (STCW VI/2)', 'stcw', 120, true),
  ('stcw_fire', 'Advanced fire fighting (STCW VI/3)', 'stcw', 130, true),
  ('stcw_medical', 'Medical first aid and care (STCW VI/4)', 'stcw', 140, true),
  ('stcw_security', 'Security (STCW VI/5 and VI/6)', 'stcw', 150, true),
  ('stcw_passenger', 'Passenger ships (STCW V/2)', 'stcw', 160, true),
  ('stcw_special_ships', 'Tankers, gas-fuelled ships and polar waters (STCW V)', 'stcw', 170, true),
  ('stcw_navigation', 'Navigation equipment and bridge', 'stcw', 180, true),
  ('stcw_leadership', 'Leadership and resource management', 'stcw', 190, true),
  ('stcw_engineering', 'Engineering and high voltage', 'stcw', 195, true),
  ('coc_deck', 'Deck certificates of competency', 'qualifications', 210, true),
  ('coc_deck_yacht', 'Deck certificates of competency (yachts)', 'qualifications', 220, true),
  ('coc_engineering', 'Engineering certificates of competency', 'qualifications', 230, true),
  ('coc_engineering_yacht', 'Engineering certificates of competency (yachts)', 'qualifications', 240, true),
  ('coc_electro', 'Electro-technical certificates', 'qualifications', 250, true),
  ('radio', 'Radio and GMDSS', 'qualifications', 260, true),
  ('flag_endorsements', 'Flag state endorsements', 'qualifications', 270, true),
  ('ratings', 'Ratings certificates', 'qualifications', 280, true),
  ('dynamic_positioning', 'Dynamic positioning', 'qualifications', 290, true),
  ('diving', 'Diving', 'qualifications', 300, true),
  ('tenders_watersports', 'Tenders, powerboats and watersports', 'qualifications', 310, true),
  ('helicopter_offshore', 'Helicopter and offshore safety', 'qualifications', 320, true),
  ('culinary', 'Culinary and food safety', 'qualifications', 330, true),
  ('interior', 'Interior and hospitality', 'qualifications', 340, true),
  ('wellness', 'Spa, beauty and wellness', 'qualifications', 350, true),
  ('technical_trades', 'Technical trades and safe working', 'qualifications', 360, true),
  ('security_services', 'Security services', 'qualifications', 370, true),
  ('other_qualifications', 'Other qualifications', 'qualifications', 390, true)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, tab = EXCLUDED.tab, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- 206 system types (company_id NULL). Ids are md5('storm.crew_document_type.' || key), the same on every database and in the fixtures.
-- Columns: key, category, name, code, abbreviation, STCW / convention reference, field_schema, default validity (months),
-- endorsement interval (months), expiry item type (X5 vocabulary), identity document, medical fitness (ENG1 or an accepted equivalent).
INSERT INTO public.crew_document_types (id, company_id, category_key, key, name, code, abbreviation, stcw_reference, field_schema,
  default_validity_months, endorsement_interval_months, expiry_item_type, is_identity, is_medical_fitness, is_active, sort_order)
SELECT md5('storm.crew_document_type.' || v.key)::uuid, NULL, v.category_key, v.key, v.name, v.code, v.abbreviation, v.stcw_reference,
       v.field_schema::jsonb, v.validity, v.endorse, v.item_type, v.is_identity, v.is_medical_fitness, true, v.sort_order
FROM (VALUES
  ('passport', 'passports', 'Passport', 'PASSPORT', 'PP', NULL, '{"issuing_office":"optional"}', 120::integer, NULL::integer, 'passport', true, false, 10),
  ('emergency_travel_document', 'passports', 'Emergency travel document', 'ETD', 'ETD', NULL, '{"issuing_office":"optional"}', 12::integer, NULL::integer, 'passport', true, false, 20),
  ('refugee_travel_document', 'passports', 'Refugee or stateless travel document', 'RTD', 'RTD', NULL, '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'passport', true, false, 30),
  ('seafarer_discharge_book', 'seafarer_identity', 'Seafarer''s discharge book', 'SDB', 'Discharge book', NULL, '{"issuing_office":"optional"}', 120::integer, NULL::integer, 'crew_document', false, false, 10),
  ('seafarer_identity_document', 'seafarer_identity', 'Seafarer identity document', 'SID', 'SID', 'ILO C185', '{"issuing_office":"optional"}', 120::integer, NULL::integer, 'crew_document', true, false, 20),
  ('sea_service_record_book', 'seafarer_identity', 'Sea service record book', 'SSRB', 'Record book', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_document', false, false, 30),
  ('merchant_mariner_credential', 'seafarer_identity', 'Merchant mariner credential (United States)', 'MMC', 'MMC', NULL, '{"capacity":"optional","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_document', false, false, 40),
  ('transport_worker_credential', 'seafarer_identity', 'Transport worker identification credential (United States)', 'TWIC', 'TWIC', NULL, '{}', 60::integer, NULL::integer, 'crew_document', false, false, 50),
  ('visa', 'visas', 'Visa', 'VISA', 'Visa', NULL, '{"visa_type":"required","entries":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'visa', false, false, 10),
  ('visa_schengen', 'visas', 'Schengen visa', 'VISA-SCHENGEN', 'Schengen', NULL, '{"visa_type":"optional","entries":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'visa', false, false, 20),
  ('visa_us_crew', 'visas', 'United States crew visa (C1/D)', 'VISA-C1D', 'C1/D', NULL, '{"entries":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'visa', false, false, 30),
  ('visa_us_visitor', 'visas', 'United States visitor visa (B1/B2)', 'VISA-B1B2', 'B1/B2', NULL, '{"entries":"optional","issuing_office":"optional"}', 120::integer, NULL::integer, 'visa', false, false, 40),
  ('visa_us_esta', 'visas', 'United States travel authorisation (ESTA)', 'ESTA', 'ESTA', NULL, '{}', 24::integer, NULL::integer, 'visa', false, false, 50),
  ('visa_australia_crew', 'visas', 'Australian maritime crew visa', 'VISA-AU-MCV', 'MCV', NULL, '{"entries":"optional"}', 36::integer, NULL::integer, 'visa', false, false, 60),
  ('visa_uk', 'visas', 'United Kingdom visa', 'VISA-UK', 'UK visa', NULL, '{"visa_type":"optional","entries":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'visa', false, false, 70),
  ('visa_canada', 'visas', 'Canadian visa or travel authorisation (eTA)', 'VISA-CA', 'eTA', NULL, '{"visa_type":"optional","entries":"optional"}', 60::integer, NULL::integer, 'visa', false, false, 80),
  ('visa_uae', 'visas', 'United Arab Emirates visa', 'VISA-AE', 'UAE visa', NULL, '{"visa_type":"optional","entries":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'visa', false, false, 90),
  ('visa_new_zealand', 'visas', 'New Zealand visa', 'VISA-NZ', 'NZ visa', NULL, '{"visa_type":"optional","entries":"optional"}', NULL::integer, NULL::integer, 'visa', false, false, 100),
  ('visa_transit', 'visas', 'Transit visa', 'VISA-TRANSIT', 'Transit', NULL, '{"entries":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'visa', false, false, 110),
  ('work_permit', 'work_permits', 'Work permit', 'WORK-PERMIT', 'Work permit', NULL, '{"limitations":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'work_authorisation', false, false, 10),
  ('residence_permit', 'work_permits', 'Residence permit', 'RESIDENCE', 'Residence', NULL, '{"limitations":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'work_authorisation', false, false, 20),
  ('right_to_work_document', 'work_permits', 'Right to work document', 'RTW', 'RTW', NULL, '{"limitations":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'work_authorisation', false, false, 30),
  ('eng1', 'medical_fitness', 'ENG1 seafarer medical certificate', 'ENG1', 'ENG1', 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 10),
  ('seafarer_medical', 'medical_fitness', 'Seafarer medical certificate (STCW and MLC)', 'SEA-MED', 'Seafarer medical', 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 20),
  ('seafarer_medical_us', 'medical_fitness', 'Seafarer medical certificate (United States)', 'MED-US', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 30),
  ('seafarer_medical_australia', 'medical_fitness', 'Seafarer medical certificate (Australia)', 'MED-AU', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 40),
  ('seafarer_medical_bahamas', 'medical_fitness', 'Seafarer medical certificate (Bahamas)', 'MED-BS', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 50),
  ('seafarer_medical_cayman', 'medical_fitness', 'Seafarer medical certificate (Cayman Islands)', 'MED-KY', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 60),
  ('seafarer_medical_isle_of_man', 'medical_fitness', 'Seafarer medical certificate (Isle of Man)', 'MED-IM', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 70),
  ('seafarer_medical_liberia', 'medical_fitness', 'Seafarer medical certificate (Liberia)', 'MED-LR', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 80),
  ('seafarer_medical_malta', 'medical_fitness', 'Seafarer medical certificate (Malta)', 'MED-MT', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 90),
  ('seafarer_medical_marshall_islands', 'medical_fitness', 'Seafarer medical certificate (Marshall Islands)', 'MED-MH', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 100),
  ('seafarer_medical_panama', 'medical_fitness', 'Seafarer medical certificate (Panama)', 'MED-PA', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 110),
  ('seafarer_medical_netherlands', 'medical_fitness', 'Seafarer medical certificate (Netherlands)', 'MED-NL', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 120),
  ('seafarer_medical_norway', 'medical_fitness', 'Seafarer medical certificate (Norway)', 'MED-NO', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 130),
  ('seafarer_medical_france', 'medical_fitness', 'Seafarer medical certificate (France)', 'MED-FR', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 140),
  ('seafarer_medical_new_zealand', 'medical_fitness', 'Seafarer medical certificate (New Zealand)', 'MED-NZ', NULL, 'STCW I/9; MLC A1.2', '{"limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'medical', false, true, 150),
  ('ml5', 'medical_fitness', 'ML5 medical report (small vessels)', 'ML5', 'ML5', NULL, '{"limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'medical', false, false, 160),
  ('diving_medical', 'medical_fitness', 'Recreational diving medical', 'DIVE-MED', 'Dive medical', NULL, '{"limitations":"optional"}', 12::integer, NULL::integer, 'medical', false, false, 170),
  ('commercial_diving_medical', 'medical_fitness', 'Commercial diver medical', 'DIVE-MED-COM', 'Diver medical', NULL, '{"limitations":"optional","issuing_office":"optional"}', 12::integer, NULL::integer, 'medical', false, false, 180),
  ('yellow_fever_certificate', 'health_records', 'Yellow fever vaccination certificate', 'YELLOW-FEVER', 'ICVP', 'IHR 2005', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'medical', false, false, 10),
  ('vaccination_record', 'health_records', 'Vaccination record', 'VACCINATION', 'Vaccinations', NULL, '{}', NULL::integer, NULL::integer, 'medical', false, false, 20),
  ('drug_alcohol_test', 'health_records', 'Drug and alcohol test', 'DRUG-ALCOHOL', 'D&A test', NULL, '{"issuing_office":"optional"}', 12::integer, NULL::integer, 'medical', false, false, 30),
  ('hearing_test', 'health_records', 'Hearing test', 'HEARING', 'Audiometry', NULL, '{}', 24::integer, NULL::integer, 'medical', false, false, 40),
  ('eyesight_test', 'health_records', 'Eyesight and colour vision test', 'EYESIGHT', 'Colour vision', NULL, '{"limitations":"optional"}', 24::integer, NULL::integer, 'medical', false, false, 50),
  ('national_identity_card', 'identity_other', 'National identity card', 'NATIONAL-ID', 'ID card', NULL, '{"issuing_office":"optional"}', 120::integer, NULL::integer, 'crew_document', true, false, 10),
  ('birth_certificate', 'identity_other', 'Birth certificate', 'BIRTH-CERT', 'Birth cert', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_document', false, false, 20),
  ('police_clearance', 'identity_other', 'Police clearance certificate', 'POLICE-CHECK', 'Police check', NULL, '{"issuing_office":"optional"}', 12::integer, NULL::integer, 'crew_document', false, false, 30),
  ('driving_licence', 'licences', 'Driving licence', 'DRIVING', 'Driving', NULL, '{"grade":"optional","issuing_office":"optional"}', 120::integer, NULL::integer, 'crew_document', false, false, 10),
  ('international_driving_permit', 'licences', 'International driving permit', 'IDP', 'IDP', NULL, '{"grade":"optional"}', 12::integer, NULL::integer, 'crew_document', false, false, 20),
  ('reference_letter', 'other_documents', 'Reference letter', 'REFERENCE', 'Reference', NULL, '{}', NULL::integer, NULL::integer, 'crew_document', false, false, 10),
  ('sea_service_testimonial', 'other_documents', 'Sea service testimonial', 'SEA-SERVICE', 'Testimonial', NULL, '{"capacity":"optional"}', NULL::integer, NULL::integer, 'crew_document', false, false, 20),
  ('curriculum_vitae', 'other_documents', 'Curriculum vitae', 'CV', 'CV', NULL, '{}', NULL::integer, NULL::integer, 'crew_document', false, false, 30),
  ('other_document', 'other_documents', 'Other document', 'OTHER-DOC', 'Other', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_document', false, false, 40),
  ('stcw_basic_safety', 'stcw_basic', 'Basic safety training (combined certificate)', 'STCW-BST', 'BST', 'STCW A-VI/1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('stcw_pst', 'stcw_basic', 'Personal survival techniques', 'STCW-PST', 'PST', 'STCW A-VI/1-1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('stcw_fpff', 'stcw_basic', 'Fire prevention and fire fighting', 'STCW-FPFF', 'FPFF', 'STCW A-VI/1-2', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('stcw_efa', 'stcw_basic', 'Elementary first aid', 'STCW-EFA', 'EFA', 'STCW A-VI/1-3', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('stcw_pssr', 'stcw_basic', 'Personal safety and social responsibilities', 'STCW-PSSR', 'PSSR', 'STCW A-VI/1-4', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('stcw_basic_safety_refresher', 'stcw_basic', 'Basic safety refresher (survival and fire fighting)', 'STCW-BST-R', 'BST refresher', 'STCW A-VI/1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('stcw_pscrb', 'stcw_survival_craft', 'Proficiency in survival craft and rescue boats', 'STCW-PSCRB', 'PSCRB', 'STCW A-VI/2-1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('stcw_pscrb_refresher', 'stcw_survival_craft', 'Survival craft and rescue boats refresher', 'STCW-PSCRB-R', 'PSCRB refresher', 'STCW A-VI/2-1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('stcw_frb', 'stcw_survival_craft', 'Proficiency in fast rescue boats', 'STCW-FRB', 'FRB', 'STCW A-VI/2-2', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('stcw_aff', 'stcw_fire', 'Advanced fire fighting', 'STCW-AFF', 'AFF', 'STCW A-VI/3', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('stcw_aff_refresher', 'stcw_fire', 'Advanced fire fighting refresher', 'STCW-AFF-R', 'AFF refresher', 'STCW A-VI/3', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('stcw_mfa', 'stcw_medical', 'Medical first aid', 'STCW-MFA', 'MFA', 'STCW A-VI/4-1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('stcw_medical_care', 'stcw_medical', 'Medical care on board', 'STCW-MC', 'Medical care', 'STCW A-VI/4-2', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('ship_captain_medical', 'stcw_medical', 'Ship captain''s medical training', 'SCMT', 'Captain medical', 'STCW A-VI/4-2', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('stcw_psa', 'stcw_security', 'Proficiency in security awareness', 'STCW-PSA', 'PSA', 'STCW A-VI/6-1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('stcw_pdsd', 'stcw_security', 'Proficiency in designated security duties', 'STCW-PDSD', 'PDSD', 'STCW A-VI/6-2', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('stcw_sso', 'stcw_security', 'Ship security officer', 'STCW-SSO', 'SSO', 'STCW A-VI/5', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('company_security_officer', 'stcw_security', 'Company security officer', 'CSO', 'CSO', 'ISPS Code', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('stcw_crowd_management', 'stcw_passenger', 'Crowd management', 'STCW-CM', 'Crowd', 'STCW A-V/2-1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('stcw_passenger_service_safety', 'stcw_passenger', 'Safety training for passenger service staff', 'STCW-PSST', 'Passenger safety', 'STCW A-V/2-2', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('stcw_crisis_management', 'stcw_passenger', 'Crisis management and human behaviour', 'STCW-CMHB', 'Crisis', 'STCW A-V/2-3', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('stcw_passenger_hull_integrity', 'stcw_passenger', 'Passenger safety, cargo safety and hull integrity', 'STCW-PSCSHI', 'Hull integrity', 'STCW A-V/2-4', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('stcw_passenger_combined', 'stcw_passenger', 'Passenger ship training (combined certificate)', 'STCW-V2', 'Passenger ship', 'STCW A-V/2', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('stcw_oil_chemical_basic', 'stcw_special_ships', 'Basic oil and chemical tanker cargo operations', 'STCW-BOCT', 'Tanker basic', 'STCW A-V/1-1-1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('stcw_gas_basic', 'stcw_special_ships', 'Basic liquefied gas tanker cargo operations', 'STCW-BLGT', 'Gas tanker basic', 'STCW A-V/1-2-1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('stcw_igf_basic', 'stcw_special_ships', 'Basic training for ships under the IGF Code', 'STCW-IGF-B', 'IGF basic', 'STCW A-V/3-1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('stcw_igf_advanced', 'stcw_special_ships', 'Advanced training for ships under the IGF Code', 'STCW-IGF-A', 'IGF advanced', 'STCW A-V/3-2', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('stcw_polar_basic', 'stcw_special_ships', 'Basic training for ships in polar waters', 'STCW-POLAR-B', 'Polar basic', 'STCW A-V/4-1', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('stcw_polar_advanced', 'stcw_special_ships', 'Advanced training for ships in polar waters', 'STCW-POLAR-A', 'Polar advanced', 'STCW A-V/4-2', '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('stcw_ecdis', 'stcw_navigation', 'ECDIS generic training', 'STCW-ECDIS', 'ECDIS', 'STCW A-II/1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('ecdis_type_specific', 'stcw_navigation', 'ECDIS type-specific training', 'ECDIS-TS', 'ECDIS type', 'ISM Code 6.3', '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('stcw_radar_arpa', 'stcw_navigation', 'Radar, ARPA and bridge teamwork', 'STCW-RADAR', 'Radar/ARPA', 'STCW A-II/1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('stcw_nav_equipment_operational', 'stcw_navigation', 'Navigation aids and equipment simulator (operational level)', 'STCW-NAV-O', 'Nav sim (op)', 'STCW A-II/1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('stcw_nav_equipment_management', 'stcw_navigation', 'Navigation aids and equipment simulator (management level)', 'STCW-NAV-M', 'Nav sim (mgmt)', 'STCW A-II/2', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('bridge_resource_management', 'stcw_navigation', 'Bridge resource management', 'BRM', 'BRM', 'STCW A-II/1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('stcw_leadership_operational', 'stcw_leadership', 'Leadership and teamworking (operational level)', 'STCW-LEAD-O', 'Leadership (op)', 'STCW A-II/1; A-III/1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('stcw_leadership_management', 'stcw_leadership', 'Leadership and managerial skills (management level)', 'STCW-LEAD-M', 'Leadership (mgmt)', 'STCW A-II/2; A-III/2', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('engine_resource_management', 'stcw_leadership', 'Engine room resource management', 'ERM', 'ERM', 'STCW A-III/1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('high_voltage_operational', 'stcw_engineering', 'High voltage (operational level)', 'HV-O', 'HV (op)', 'STCW A-III/1', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('high_voltage_management', 'stcw_engineering', 'High voltage (management level)', 'HV-M', 'HV (mgmt)', 'STCW A-III/2', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('approved_engine_course', 'stcw_engineering', 'Approved engine course', 'AEC', 'AEC', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('approved_engine_course_2', 'stcw_engineering', 'Approved engine course, part 2', 'AEC-2', 'AEC 2', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('coc_master_unlimited', 'coc_deck', 'Master (unlimited)', 'COC-MASTER', 'Master', 'STCW II/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('coc_chief_mate_unlimited', 'coc_deck', 'Chief mate (unlimited)', 'COC-CM', 'Chief mate', 'STCW II/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('coc_oow_deck_unlimited', 'coc_deck', 'Officer of the watch, deck (unlimited)', 'COC-OOW', 'OOW', 'STCW II/1', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('coc_master_3000', 'coc_deck', 'Master (under 3000 GT)', 'COC-M3000', 'Master <3000', 'STCW II/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('coc_chief_mate_3000', 'coc_deck', 'Chief mate (under 3000 GT)', 'COC-CM3000', 'Chief mate <3000', 'STCW II/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('coc_master_500_near_coastal', 'coc_deck', 'Master (under 500 GT, near coastal)', 'COC-M500NC', 'Master <500 NC', 'STCW II/3', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('coc_oow_500_near_coastal', 'coc_deck', 'Officer of the watch (under 500 GT, near coastal)', 'COC-OOW500NC', 'OOW <500 NC', 'STCW II/3', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 70),
  ('coc_master_yacht_3000', 'coc_deck_yacht', 'Master (yachts under 3000 GT)', 'COC-MY3000', 'Master Y <3000', 'STCW II/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('coc_master_yacht_500', 'coc_deck_yacht', 'Master (yachts under 500 GT)', 'COC-MY500', 'Master Y <500', 'STCW II/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('coc_chief_mate_yacht_3000', 'coc_deck_yacht', 'Chief mate (yachts under 3000 GT)', 'COC-CMY3000', 'Chief mate Y', 'STCW II/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('coc_oow_yacht_3000', 'coc_deck_yacht', 'Officer of the watch (yachts under 3000 GT)', 'COC-OOWY', 'OOW Y', 'STCW II/1', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('coc_master_yacht_200', 'coc_deck_yacht', 'Master (yachts under 200 GT)', 'COC-MY200', 'Master Y <200', 'STCW II/3', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('yachtmaster_ocean', 'coc_deck_yacht', 'Yachtmaster Ocean', 'YM-OCEAN', 'YM Ocean', NULL, '{"limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', NULL::integer, 60::integer, 'crew_qualification', false, false, 60),
  ('yachtmaster_offshore', 'coc_deck_yacht', 'Yachtmaster Offshore', 'YM-OFFSHORE', 'YM Offshore', NULL, '{"limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', NULL::integer, 60::integer, 'crew_qualification', false, false, 70),
  ('yachtmaster_coastal', 'coc_deck_yacht', 'Yachtmaster Coastal', 'YM-COASTAL', 'YM Coastal', NULL, '{"limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', NULL::integer, 60::integer, 'crew_qualification', false, false, 80),
  ('day_skipper', 'coc_deck_yacht', 'Day skipper', 'DAY-SKIPPER', 'Day skipper', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 90),
  ('boatmaster_licence', 'coc_deck_yacht', 'Boatmaster licence', 'BOATMASTER', 'Boatmaster', NULL, '{"limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 100),
  ('coc_chief_engineer_unlimited', 'coc_engineering', 'Chief engineer (unlimited)', 'COC-CE', 'Chief engineer', 'STCW III/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('coc_second_engineer_unlimited', 'coc_engineering', 'Second engineer (unlimited)', 'COC-2E', 'Second engineer', 'STCW III/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('coc_eoow_unlimited', 'coc_engineering', 'Officer of the watch, engineering (unlimited)', 'COC-EOOW', 'OICEW', 'STCW III/1', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('coc_chief_engineer_3000kw', 'coc_engineering', 'Chief engineer (under 3000 kW)', 'COC-CE3000', 'CE <3000 kW', 'STCW III/3', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('coc_second_engineer_3000kw', 'coc_engineering', 'Second engineer (under 3000 kW)', 'COC-2E3000', '2E <3000 kW', 'STCW III/3', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('marine_engine_operator', 'coc_engineering', 'Marine engine operator licence', 'MEOL', 'MEOL', NULL, '{"limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('coc_engineer_yacht_y1', 'coc_engineering_yacht', 'Chief engineer (yachts, Y1)', 'COC-Y1', 'Y1', 'STCW III/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('coc_engineer_yacht_y2', 'coc_engineering_yacht', 'Chief engineer (yachts, Y2)', 'COC-Y2', 'Y2', 'STCW III/2', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('coc_engineer_yacht_y3', 'coc_engineering_yacht', 'Second engineer (yachts, Y3)', 'COC-Y3', 'Y3', 'STCW III/3', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('coc_engineer_yacht_y4', 'coc_engineering_yacht', 'Engineer officer of the watch (yachts, Y4)', 'COC-Y4', 'Y4', 'STCW III/1', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('small_vessel_chief_engineer', 'coc_engineering_yacht', 'Small vessel chief engineer', 'COC-SVCE', 'SV chief engineer', 'STCW III/3', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('coc_electro_technical_officer', 'coc_electro', 'Electro-technical officer', 'COC-ETO', 'ETO', 'STCW III/6', '{"capacity":"required","limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('electro_technical_rating', 'coc_electro', 'Electro-technical rating', 'ETR', 'ETR', 'STCW III/7', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('gmdss_goc', 'radio', 'GMDSS general operator certificate', 'GMDSS-GOC', 'GOC', 'STCW IV/2', '{"limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('gmdss_roc', 'radio', 'GMDSS restricted operator certificate', 'GMDSS-ROC', 'ROC', 'STCW IV/2', '{"limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('gmdss_lrc', 'radio', 'Long range radio certificate', 'LRC', 'LRC', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('gmdss_src', 'radio', 'Short range radio certificate (VHF)', 'SRC', 'SRC', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('flag_endorsement', 'flag_endorsements', 'Flag state endorsement', 'CEC', 'CEC', 'STCW I/10', '{"capacity":"required","limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 10),
  ('flag_endorsement_bahamas', 'flag_endorsements', 'Bahamas flag state endorsement', 'CEC-BS', 'CEC', 'STCW I/10', '{"capacity":"required","limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 20),
  ('flag_endorsement_cayman', 'flag_endorsements', 'Cayman Islands flag state endorsement', 'CEC-KY', 'CEC', 'STCW I/10', '{"capacity":"required","limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 30),
  ('flag_endorsement_isle_of_man', 'flag_endorsements', 'Isle of Man flag state endorsement', 'CEC-IM', 'CEC', 'STCW I/10', '{"capacity":"required","limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 40),
  ('flag_endorsement_liberia', 'flag_endorsements', 'Liberia flag state endorsement', 'CEC-LR', 'CEC', 'STCW I/10', '{"capacity":"required","limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 50),
  ('flag_endorsement_malta', 'flag_endorsements', 'Malta flag state endorsement', 'CEC-MT', 'CEC', 'STCW I/10', '{"capacity":"required","limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 60),
  ('flag_endorsement_marshall_islands', 'flag_endorsements', 'Marshall Islands flag state endorsement', 'CEC-MH', 'CEC', 'STCW I/10', '{"capacity":"required","limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 70),
  ('flag_endorsement_panama', 'flag_endorsements', 'Panama flag state endorsement', 'CEC-PA', 'CEC', 'STCW I/10', '{"capacity":"required","limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 80),
  ('gmdss_endorsement', 'flag_endorsements', 'GMDSS radio operator endorsement', 'CEC-GMDSS', 'GMDSS endorsement', 'STCW I/10; IV/2', '{"limitations":"optional","endorsement_date":"optional","issuing_office":"optional"}', 60::integer, 60::integer, 'crew_qualification', false, false, 90),
  ('rating_navigational_watch', 'ratings', 'Navigational watch rating', 'NWR', 'NWR', 'STCW II/4', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('rating_able_seafarer_deck', 'ratings', 'Able seafarer deck', 'AB-DECK', 'AB deck', 'STCW II/5', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('rating_engine_watch', 'ratings', 'Engine room watch rating', 'ERWR', 'ERWR', 'STCW III/4', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('rating_able_seafarer_engine', 'ratings', 'Able seafarer engine', 'AB-ENGINE', 'AB engine', 'STCW III/5', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('efficient_deck_hand', 'ratings', 'Efficient deck hand', 'EDH', 'EDH', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('yacht_rating', 'ratings', 'Yacht rating certificate', 'YACHT-RATING', 'Yacht rating', 'STCW II/4', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('dp_induction', 'dynamic_positioning', 'Dynamic positioning induction', 'DP-INDUCTION', 'DP induction', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('dp_simulator', 'dynamic_positioning', 'Dynamic positioning simulator', 'DP-SIMULATOR', 'DP simulator', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('dp_operator_limited', 'dynamic_positioning', 'Dynamic positioning operator (limited)', 'DPO-LIMITED', 'DPO limited', NULL, '{"limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('dp_operator_unlimited', 'dynamic_positioning', 'Dynamic positioning operator (unlimited)', 'DPO-UNLIMITED', 'DPO unlimited', NULL, '{"issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('dive_open_water', 'diving', 'Open water diver', 'DIVE-OW', 'Open water', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('dive_advanced', 'diving', 'Advanced open water diver', 'DIVE-AOW', 'Advanced diver', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('dive_rescue', 'diving', 'Rescue diver', 'DIVE-RESCUE', 'Rescue diver', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('dive_master', 'diving', 'Divemaster', 'DIVE-MASTER', 'Divemaster', NULL, '{"grade":"optional","endorsement_date":"optional","issuing_office":"optional"}', NULL::integer, 12::integer, 'crew_qualification', false, false, 40),
  ('dive_instructor', 'diving', 'Dive instructor', 'DIVE-INSTRUCTOR', 'Dive instructor', NULL, '{"grade":"optional","endorsement_date":"optional","issuing_office":"optional"}', NULL::integer, 12::integer, 'crew_qualification', false, false, 50),
  ('dive_enriched_air', 'diving', 'Enriched air (nitrox) diver', 'DIVE-NITROX', 'Nitrox', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('dive_commercial', 'diving', 'Commercial diver', 'DIVE-COMMERCIAL', 'Commercial diver', NULL, '{"grade":"optional","limitations":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 70),
  ('dive_other', 'diving', 'Diving qualification (other)', 'DIVE-OTHER', 'Diving', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 80),
  ('emergency_oxygen_provider', 'diving', 'Emergency oxygen provider', 'OXYGEN', 'Oxygen provider', NULL, '{"issuing_office":"optional"}', 24::integer, NULL::integer, 'crew_qualification', false, false, 90),
  ('powerboat_level_2', 'tenders_watersports', 'Powerboat handling, level 2', 'POWERBOAT-2', 'PB2', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('advanced_powerboat', 'tenders_watersports', 'Advanced powerboat', 'POWERBOAT-ADV', 'Advanced PB', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('tender_operator', 'tenders_watersports', 'Tender operator', 'TENDER', 'Tender', NULL, '{"limitations":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('international_certificate_of_competence', 'tenders_watersports', 'International certificate of competence (pleasure craft)', 'ICC', 'ICC', NULL, '{"limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('personal_watercraft_licence', 'tenders_watersports', 'Personal watercraft licence', 'PWC', 'PWC', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('personal_watercraft_instructor', 'tenders_watersports', 'Personal watercraft instructor', 'PWC-INSTRUCTOR', 'PWC instructor', NULL, '{"endorsement_date":"optional","issuing_office":"optional"}', NULL::integer, 12::integer, 'crew_qualification', false, false, 60),
  ('watersports_instructor', 'tenders_watersports', 'Watersports instructor', 'WATERSPORTS', 'Watersports', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 70),
  ('lifeguard', 'tenders_watersports', 'Lifeguard', 'LIFEGUARD', 'Lifeguard', NULL, '{"issuing_office":"optional"}', 24::integer, NULL::integer, 'crew_qualification', false, false, 80),
  ('huet', 'helicopter_offshore', 'Helicopter underwater escape training', 'HUET', 'HUET', NULL, '{"issuing_office":"optional"}', 48::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('bosiet', 'helicopter_offshore', 'Basic offshore safety induction and emergency training', 'BOSIET', 'BOSIET', NULL, '{"issuing_office":"optional"}', 48::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('foet', 'helicopter_offshore', 'Further offshore emergency training', 'FOET', 'FOET', NULL, '{"issuing_office":"optional"}', 48::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('helicopter_landing_officer', 'helicopter_offshore', 'Helicopter landing officer', 'HLO', 'HLO', NULL, '{"issuing_office":"optional"}', 48::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('helideck_assistant', 'helicopter_offshore', 'Helideck assistant', 'HDA', 'HDA', NULL, '{"issuing_office":"optional"}', 48::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('helideck_fire_fighting', 'helicopter_offshore', 'Helideck fire fighting', 'HELI-FIRE', 'Helideck fire', NULL, '{"issuing_office":"optional"}', 48::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('ships_cook', 'culinary', 'Ship''s cook certificate', 'SHIPS-COOK', 'Ship cook', 'MLC A3.2', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('food_hygiene_level_2', 'culinary', 'Food safety and hygiene, level 2', 'FOOD-L2', 'Food safety L2', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('food_hygiene_level_3', 'culinary', 'Food safety and hygiene, level 3', 'FOOD-L3', 'Food safety L3', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('food_safety_level_4', 'culinary', 'Food safety management, level 4', 'FOOD-L4', 'Food safety L4', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('allergen_awareness', 'culinary', 'Allergen awareness', 'ALLERGEN', 'Allergens', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('culinary_qualification', 'culinary', 'Culinary qualification', 'CULINARY', 'Culinary', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('wine_level_1', 'interior', 'Wine knowledge, level 1', 'WINE-1', 'Wine L1', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('wine_level_2', 'interior', 'Wine knowledge, level 2', 'WINE-2', 'Wine L2', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('wine_level_3', 'interior', 'Wine knowledge, level 3', 'WINE-3', 'Wine L3', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('sommelier', 'interior', 'Sommelier qualification', 'SOMMELIER', 'Sommelier', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('barista', 'interior', 'Barista', 'BARISTA', 'Barista', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('silver_service', 'interior', 'Silver service', 'SILVER-SERVICE', 'Silver service', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('mixology', 'interior', 'Bar and mixology', 'MIXOLOGY', 'Mixology', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 70),
  ('yacht_interior_course', 'interior', 'Yacht interior crew course', 'INTERIOR', 'Interior course', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 80),
  ('floristry', 'interior', 'Floristry', 'FLORISTRY', 'Floristry', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 90),
  ('laundry_fabric_care', 'interior', 'Laundry and fabric care', 'LAUNDRY', 'Laundry', NULL, '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 100),
  ('massage_therapy', 'wellness', 'Massage therapy', 'MASSAGE', 'Massage', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('beauty_therapy', 'wellness', 'Beauty therapy', 'BEAUTY', 'Beauty', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('fitness_instructor', 'wellness', 'Fitness instructor', 'FITNESS', 'Fitness', NULL, '{"grade":"optional","endorsement_date":"optional","issuing_office":"optional"}', NULL::integer, 12::integer, 'crew_qualification', false, false, 30),
  ('yoga_instructor', 'wellness', 'Yoga instructor', 'YOGA', 'Yoga', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('hairdressing', 'wellness', 'Hairdressing', 'HAIR', 'Hair', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('welding', 'technical_trades', 'Welding certificate', 'WELDING', 'Welding', NULL, '{"grade":"optional","limitations":"optional","issuing_office":"optional"}', 24::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('refrigeration', 'technical_trades', 'Refrigeration and air conditioning (F-gas)', 'F-GAS', 'F-gas', NULL, '{"grade":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('electrical_installation', 'technical_trades', 'Electrical installation qualification', 'ELECTRICAL', 'Electrical', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('crane_operator', 'technical_trades', 'Crane and davit operator', 'CRANE', 'Crane', NULL, '{"limitations":"optional","issuing_office":"optional"}', 60::integer, NULL::integer, 'crew_qualification', false, false, 40),
  ('working_at_height', 'technical_trades', 'Working at height', 'HEIGHT', 'Height', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 50),
  ('confined_space_entry', 'technical_trades', 'Confined space entry', 'CONFINED', 'Confined space', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 60),
  ('manual_handling', 'technical_trades', 'Manual handling', 'MANUAL-HANDLING', 'Manual handling', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 70),
  ('maritime_security_operative', 'security_services', 'Maritime security operative', 'MSO', 'MSO', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('close_protection', 'security_services', 'Close protection', 'CLOSE-PROTECTION', 'Close protection', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('first_aid_at_work', 'other_qualifications', 'First aid at work', 'FIRST-AID', 'First aid', NULL, '{"issuing_office":"optional"}', 36::integer, NULL::integer, 'crew_qualification', false, false, 10),
  ('ism_internal_auditor', 'other_qualifications', 'ISM internal auditor', 'ISM-AUDITOR', 'ISM auditor', 'ISM Code', '{"issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 20),
  ('maritime_english', 'other_qualifications', 'Maritime English', 'MARITIME-ENGLISH', 'English', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 30),
  ('other_certificate', 'other_qualifications', 'Other certificate', 'OTHER-CERT', 'Other', NULL, '{"grade":"optional","issuing_office":"optional"}', NULL::integer, NULL::integer, 'crew_qualification', false, false, 40)
) AS v(key, category_key, name, code, abbreviation, stcw_reference, field_schema, validity, endorse, item_type, is_identity, is_medical_fitness, sort_order)
ON CONFLICT (id) DO UPDATE SET category_key = EXCLUDED.category_key, key = EXCLUDED.key, name = EXCLUDED.name, code = EXCLUDED.code,
  abbreviation = EXCLUDED.abbreviation, stcw_reference = EXCLUDED.stcw_reference, field_schema = EXCLUDED.field_schema,
  default_validity_months = EXCLUDED.default_validity_months, endorsement_interval_months = EXCLUDED.endorsement_interval_months,
  expiry_item_type = EXCLUDED.expiry_item_type, is_identity = EXCLUDED.is_identity, is_medical_fitness = EXCLUDED.is_medical_fitness,
  is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order;

-- 107 system satisfaction rules: (type, satisfies, kind). Holding <type> satisfies a requirement for <satisfies>.
-- component: a combined certificate covers each module (T-159); supersedes: a higher certificate covers a lower one (T-53);
-- equivalent: an accepted equivalent (T-185, T-326). The requirement engine (X1-06) follows chains (crew_document_type_satisfiers).
INSERT INTO public.crew_document_type_satisfies (id, company_id, type_id, satisfies_type_id, kind)
SELECT md5('storm.crew_document_type_satisfies.' || v.a || '>' || v.b)::uuid, NULL,
       md5('storm.crew_document_type.' || v.a)::uuid, md5('storm.crew_document_type.' || v.b)::uuid, v.kind
FROM (VALUES
  ('stcw_basic_safety', 'stcw_pst', 'component'),
  ('stcw_basic_safety', 'stcw_fpff', 'component'),
  ('stcw_basic_safety', 'stcw_efa', 'component'),
  ('stcw_basic_safety', 'stcw_pssr', 'component'),
  ('stcw_basic_safety_refresher', 'stcw_pst', 'component'),
  ('stcw_basic_safety_refresher', 'stcw_fpff', 'component'),
  ('stcw_pscrb_refresher', 'stcw_pscrb', 'component'),
  ('stcw_aff_refresher', 'stcw_aff', 'component'),
  ('stcw_passenger_combined', 'stcw_crowd_management', 'component'),
  ('stcw_passenger_combined', 'stcw_passenger_service_safety', 'component'),
  ('stcw_passenger_combined', 'stcw_crisis_management', 'component'),
  ('stcw_passenger_combined', 'stcw_passenger_hull_integrity', 'component'),
  ('bosiet', 'huet', 'component'),
  ('stcw_sso', 'stcw_pdsd', 'supersedes'),
  ('stcw_sso', 'stcw_psa', 'supersedes'),
  ('stcw_pdsd', 'stcw_psa', 'supersedes'),
  ('stcw_aff', 'stcw_fpff', 'supersedes'),
  ('stcw_medical_care', 'stcw_mfa', 'supersedes'),
  ('stcw_medical_care', 'stcw_efa', 'supersedes'),
  ('stcw_mfa', 'stcw_efa', 'supersedes'),
  ('stcw_igf_advanced', 'stcw_igf_basic', 'supersedes'),
  ('stcw_polar_advanced', 'stcw_polar_basic', 'supersedes'),
  ('stcw_nav_equipment_management', 'stcw_nav_equipment_operational', 'supersedes'),
  ('stcw_leadership_management', 'stcw_leadership_operational', 'supersedes'),
  ('high_voltage_management', 'high_voltage_operational', 'supersedes'),
  ('approved_engine_course_2', 'approved_engine_course', 'supersedes'),
  ('marine_engine_operator', 'approved_engine_course_2', 'supersedes'),
  ('foet', 'bosiet', 'supersedes'),
  ('coc_master_unlimited', 'coc_chief_mate_unlimited', 'supersedes'),
  ('coc_master_unlimited', 'coc_master_3000', 'supersedes'),
  ('coc_master_unlimited', 'coc_master_yacht_3000', 'supersedes'),
  ('coc_chief_mate_unlimited', 'coc_oow_deck_unlimited', 'supersedes'),
  ('coc_chief_mate_unlimited', 'coc_chief_mate_3000', 'supersedes'),
  ('coc_chief_mate_unlimited', 'coc_chief_mate_yacht_3000', 'supersedes'),
  ('coc_oow_deck_unlimited', 'coc_oow_500_near_coastal', 'supersedes'),
  ('coc_oow_deck_unlimited', 'coc_oow_yacht_3000', 'supersedes'),
  ('coc_master_3000', 'coc_chief_mate_3000', 'supersedes'),
  ('coc_master_3000', 'coc_master_500_near_coastal', 'supersedes'),
  ('coc_master_3000', 'coc_master_yacht_3000', 'supersedes'),
  ('coc_master_500_near_coastal', 'coc_oow_500_near_coastal', 'supersedes'),
  ('coc_master_yacht_3000', 'coc_master_yacht_500', 'supersedes'),
  ('coc_master_yacht_3000', 'coc_chief_mate_yacht_3000', 'supersedes'),
  ('coc_chief_mate_yacht_3000', 'coc_oow_yacht_3000', 'supersedes'),
  ('coc_master_yacht_500', 'coc_master_yacht_200', 'supersedes'),
  ('yachtmaster_ocean', 'yachtmaster_offshore', 'supersedes'),
  ('yachtmaster_offshore', 'yachtmaster_coastal', 'supersedes'),
  ('yachtmaster_coastal', 'day_skipper', 'supersedes'),
  ('coc_chief_engineer_unlimited', 'coc_second_engineer_unlimited', 'supersedes'),
  ('coc_chief_engineer_unlimited', 'coc_chief_engineer_3000kw', 'supersedes'),
  ('coc_chief_engineer_unlimited', 'coc_engineer_yacht_y1', 'supersedes'),
  ('coc_second_engineer_unlimited', 'coc_eoow_unlimited', 'supersedes'),
  ('coc_second_engineer_unlimited', 'coc_second_engineer_3000kw', 'supersedes'),
  ('coc_chief_engineer_3000kw', 'coc_second_engineer_3000kw', 'supersedes'),
  ('coc_eoow_unlimited', 'coc_engineer_yacht_y4', 'supersedes'),
  ('coc_engineer_yacht_y1', 'coc_engineer_yacht_y2', 'supersedes'),
  ('coc_engineer_yacht_y2', 'coc_engineer_yacht_y3', 'supersedes'),
  ('coc_engineer_yacht_y3', 'coc_engineer_yacht_y4', 'supersedes'),
  ('coc_engineer_yacht_y4', 'approved_engine_course_2', 'supersedes'),
  ('coc_electro_technical_officer', 'electro_technical_rating', 'supersedes'),
  ('gmdss_goc', 'gmdss_roc', 'supersedes'),
  ('gmdss_goc', 'gmdss_lrc', 'supersedes'),
  ('gmdss_lrc', 'gmdss_src', 'supersedes'),
  ('gmdss_roc', 'gmdss_src', 'supersedes'),
  ('rating_able_seafarer_deck', 'rating_navigational_watch', 'supersedes'),
  ('rating_able_seafarer_engine', 'rating_engine_watch', 'supersedes'),
  ('dp_operator_unlimited', 'dp_operator_limited', 'supersedes'),
  ('dp_operator_limited', 'dp_simulator', 'supersedes'),
  ('dp_simulator', 'dp_induction', 'supersedes'),
  ('dive_instructor', 'dive_master', 'supersedes'),
  ('dive_master', 'dive_rescue', 'supersedes'),
  ('dive_rescue', 'dive_advanced', 'supersedes'),
  ('dive_advanced', 'dive_open_water', 'supersedes'),
  ('advanced_powerboat', 'powerboat_level_2', 'supersedes'),
  ('food_safety_level_4', 'food_hygiene_level_3', 'supersedes'),
  ('food_hygiene_level_3', 'food_hygiene_level_2', 'supersedes'),
  ('wine_level_3', 'wine_level_2', 'supersedes'),
  ('wine_level_2', 'wine_level_1', 'supersedes'),
  ('ship_captain_medical', 'stcw_medical_care', 'equivalent'),
  ('stcw_medical_care', 'ship_captain_medical', 'equivalent'),
  ('seafarer_medical', 'eng1', 'equivalent'),
  ('eng1', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_us', 'eng1', 'equivalent'),
  ('seafarer_medical_us', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_australia', 'eng1', 'equivalent'),
  ('seafarer_medical_australia', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_bahamas', 'eng1', 'equivalent'),
  ('seafarer_medical_bahamas', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_cayman', 'eng1', 'equivalent'),
  ('seafarer_medical_cayman', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_isle_of_man', 'eng1', 'equivalent'),
  ('seafarer_medical_isle_of_man', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_liberia', 'eng1', 'equivalent'),
  ('seafarer_medical_liberia', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_malta', 'eng1', 'equivalent'),
  ('seafarer_medical_malta', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_marshall_islands', 'eng1', 'equivalent'),
  ('seafarer_medical_marshall_islands', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_panama', 'eng1', 'equivalent'),
  ('seafarer_medical_panama', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_netherlands', 'eng1', 'equivalent'),
  ('seafarer_medical_netherlands', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_norway', 'eng1', 'equivalent'),
  ('seafarer_medical_norway', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_france', 'eng1', 'equivalent'),
  ('seafarer_medical_france', 'seafarer_medical', 'equivalent'),
  ('seafarer_medical_new_zealand', 'eng1', 'equivalent'),
  ('seafarer_medical_new_zealand', 'seafarer_medical', 'equivalent')
) AS v(a, b, kind)
ON CONFLICT (id) DO UPDATE SET type_id = EXCLUDED.type_id, satisfies_type_id = EXCLUDED.satisfies_type_id, kind = EXCLUDED.kind;

-- 41 legacy strings: every MARITIME_CERTIFICATE_TYPES entry of src/modules/certificates/hooks/useCrewCertificates.ts,
-- normalised by crew_document_legacy_key(). "Master 3000 GT" and "Master 500 GT" map to the yacht certificates (the product's fleet).
INSERT INTO public.crew_document_type_legacy_map (id, company_id, legacy_key, legacy_label, document_type_id)
SELECT md5('storm.crew_document_legacy.' || public.crew_document_legacy_key(v.label))::uuid, NULL, public.crew_document_legacy_key(v.label), v.label,
       md5('storm.crew_document_type.' || v.type_key)::uuid
FROM (VALUES
  ('STCW Basic Safety Training (VI/1)', 'stcw_basic_safety'),
  ('STCW Proficiency in Survival Craft (VI/2)', 'stcw_pscrb'),
  ('STCW Advanced Firefighting (VI/3)', 'stcw_aff'),
  ('STCW Medical First Aid (VI/4)', 'stcw_mfa'),
  ('STCW Medical Care (VI/4)', 'stcw_medical_care'),
  ('STCW Security Awareness (VI/6)', 'stcw_psa'),
  ('STCW Crowd Management', 'stcw_crowd_management'),
  ('STCW Crisis Management', 'stcw_crisis_management'),
  ('STCW Ship Security Officer', 'stcw_sso'),
  ('Master Unlimited', 'coc_master_unlimited'),
  ('Master 3000 GT', 'coc_master_yacht_3000'),
  ('Master 500 GT', 'coc_master_yacht_500'),
  ('Chief Mate Unlimited', 'coc_chief_mate_unlimited'),
  ('OOW Unlimited', 'coc_oow_deck_unlimited'),
  ('Chief Engineer Unlimited', 'coc_chief_engineer_unlimited'),
  ('Second Engineer Unlimited', 'coc_second_engineer_unlimited'),
  ('OICEW', 'coc_eoow_unlimited'),
  ('Electro-Technical Officer', 'coc_electro_technical_officer'),
  ('Yacht Master Offshore', 'yachtmaster_offshore'),
  ('Yacht Master Ocean', 'yachtmaster_ocean'),
  ('ENG1 Medical Certificate', 'eng1'),
  ('ML5 Medical Certificate', 'ml5'),
  ('PADI Diving Medical', 'diving_medical'),
  ('Drug & Alcohol Test', 'drug_alcohol_test'),
  ('HUET (Helicopter Underwater Escape Training)', 'huet'),
  ('BOSIET', 'bosiet'),
  ('Fast Rescue Boat', 'stcw_frb'),
  ('Tender Operator', 'tender_operator'),
  ('PWC License', 'personal_watercraft_licence'),
  ('Diving Certification', 'dive_other'),
  ('Lifeguard Certification', 'lifeguard'),
  ('Flag State Endorsement', 'flag_endorsement'),
  ('GMDSS Radio Operator', 'gmdss_goc'),
  ('Long Range Certificate', 'gmdss_lrc'),
  ('Short Range Certificate', 'gmdss_src'),
  ('Passport', 'passport'),
  ('Seamans Book', 'seafarer_discharge_book'),
  ('Visa', 'visa'),
  ('Food Safety Certificate', 'food_hygiene_level_2'),
  ('Wine Certification', 'wine_level_1'),
  ('Other', 'other_certificate')
) AS v(label, type_key)
ON CONFLICT (id) DO UPDATE SET legacy_key = EXCLUDED.legacy_key, legacy_label = EXCLUDED.legacy_label, document_type_id = EXCLUDED.document_type_id;

-- ---------------------------------------------------------------- the fleet expiry registry (X5's expiry_sources: data rows only)

-- Crew documents feed the fleet expiry engine through expiry_src_crew_documents;
-- X5's two legacy crew sources are replaced by it (the backfill below moves
-- their passports and visas into documents; the view keeps a profile's
-- passport or visa date for a person with no such document yet).
INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, sort_order, is_active, owner_doc)
VALUES ('crew_documents', 'crew_document', 'Crew documents', 'expiry_src_crew_documents', 'crew_documents', 25, true, 'gap/04')
ON CONFLICT (source_key) DO UPDATE SET item_type = EXCLUDED.item_type, label = EXCLUDED.label, view_name = EXCLUDED.view_name,
  read_area = EXCLUDED.read_area, sort_order = EXCLUDED.sort_order, owner_doc = EXCLUDED.owner_doc;
UPDATE public.expiry_sources SET is_active = false
WHERE source_key IN ('crew_certificates_legacy', 'profile_identity_legacy') AND is_active;

-- ---------------------------------------------------------------- backfill (once; idempotent)

SELECT public.crew_document_catalogue_backfill();
