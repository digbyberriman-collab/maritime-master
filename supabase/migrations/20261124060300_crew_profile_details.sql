-- =================================================================
-- CREW X1-03: the routed crew profile's server side: personal details,
-- languages, employment terms, profile visibility and the profile RPCs
-- (Phase 3 wave 1, stream X1; gap/04 C16, C17, C19, C20, C21, W1, T-68;
-- DECISIONS D-X1-2, D-X1-13, D-X1-19, D-01, D-199, D-225, D-229, D-233,
-- D-246; X1 spec §3 "Profile visibility", §6 060300)
-- Tables: crew_personal_details (one row per person: identity, contact,
--   address, phones as dial code + national number, biography),
--   crew_languages (mother tongue + three more, with proficiency),
--   crew_assignment_terms (the employment terms crew_assignments cannot
--   carry: contract type, review date, leave allowance, embarkation)
-- Columns: crew_next_of_kin.phone_dial_code, mobile_dial_code,
--   mobile_number, country_code (T-68)
-- Visibility: crew_profile_visible() (one argument), the caller-only set
--   crew_visible_profile_ids(), internal crew_profile_structural_vessels()
--   and crew_profile_can_edit()
-- RPCs: crew_profile_resolve(), crew_profile_summary(),
--   crew_personal_details_save(), crew_languages_save(),
--   crew_onboarding_save(), crew_find_duplicates()
-- Internal: crew_personal_field_groups(), crew_personal_details_apply(),
--   crew_phone_split(), crew_country_from_text(),
--   crew_profile_details_backfill() (the seed)
-- Triggers: crew_personal_details_scope_guard(),
--   crew_languages_scope_guard(), crew_assignment_terms_scope_guard()
-- TS mirror: src/modules/crew/types/db.pending.ts (tables, columns, RPCs);
--   src/modules/crew/lib/phone.ts (crew_phone_split, asserted case by case
--   in src/test/crew/phone.test.ts and
--   supabase/tests/sql/crew/profile_details.test.sql);
--   src/modules/crew/lib/personalDetailsSchema.ts (the field rules and
--   field groups of crew_personal_field_groups)
-- =================================================================
--
-- Why. A crew member's profile is spread over three modals today and the
-- wider field set of the reference (title, middle name, work email, dual
-- nationality, residency, height, weight, marital status, children,
-- languages, biography, address, repatriation airport) has nowhere to
-- live. gap/04 C17 keeps it out of profiles on purpose: profiles is read
-- company-wide (doc 01 F32), so the new personal data goes into its own
-- table, read only by the people who may see the person.
--
-- Who may see a person (crew_profile_visible / crew_visible_profile_ids),
-- an active caller of the person's company and one of:
-- * the person themselves (my_profile_id());
-- * a holder of vessel.crew.crew_profiles.view on a vessel of the person's
--   structural set: a current or planned assignment on it (D-227, D-X1-4:
--   is_current and the leave or end date unset or after today), or their
--   pending placement (D-199, D-225: imported to it, no current assignment
--   for the login), the vessel being of the person's company (D-246);
-- * a legacy HR viewer of the company (hr_can_view).
-- External viewers (account_memberships.kind external) see only their own
-- profile (crew_caller_is_external, as the crew list).
--
-- Who may change what (crew_personal_details_save, crew_languages_save):
-- * self fields (address, phones, repatriation airport, height, weight,
--   marital status, children, biography) and the languages: the person
--   themselves, or an editor;
-- * identity fields (title, names, sex, date and place of birth,
--   nationalities, residency, work email, crew number, usual place of
--   embarkation): an editor only: hr_can_edit, or
--   vessel.crew.crew_profiles.edit on a vessel of the person's structural
--   set (crew_profile_can_edit). The names stay on profiles (every module
--   reads them there) and are written there by the same definer.
-- Unknown keys are refused (22023 field_unknown), so a payload can never
-- reach a column this file does not list (company_id, the stamps).
--
-- Onboarding (crew_onboarding_save, used by Add Crew in X1-03B): a holder
-- of vessel.crew.crew_profiles.create on the vessel stores the employment
-- terms of a person who is on that vessel's crew (a current assignment or
-- the pending placement of the caller's company; 42501 otherwise) and
-- fills their personal details. A creator who is not an editor fills
-- blanks only: an identity field that already has a value needs an editor
-- (42501 crew_identity_locked). assignment_id is an advisory link to the
-- current assignment when there is one (no trigger on the shared
-- crew_assignments, D-X1-2): readers match terms to an assignment by
-- person, vessel and dates.
--
-- Duplicates (crew_find_duplicates, Add Crew): crew_profiles.create on the
-- vessel; the people of the caller's company with the same email, or the
-- same first and last name (with the date of birth when given), and the
-- vessel they are on.
--
-- Reads. crew_personal_details and crew_languages: profile_id IN
-- (SELECT crew_visible_profile_ids()), hoisted once per statement (D-229).
-- crew_assignment_terms: the person's own rows, or vessel data for holders
-- of crew_profiles.view on the vessel (crew_cap_vessel_ids), or legacy HR
-- viewers of the company; never an external viewer (but their own). No
-- browser write policy on any of them: every write is a definer above.
--
-- Backfill (crew_profile_details_backfill, run once at the end, idempotent):
-- a crew_personal_details row per profile with something to carry over:
-- date of birth (1900 to today), place of birth, the phone split into dial
-- code and national number (crew_phone_split; an unreadable number is left
-- behind), nationality text to an ISO code by name, demonym or code
-- (crew_country_from_text; an ambiguous or unknown text is left behind),
-- gender to sex (male / female / other only) and the embarkation port.
-- profiles keeps its columns (legacy readers); the profile page reads the
-- new row.
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each policy,
-- trigger and constraint, CREATE OR REPLACE for every function, the
-- backfill ON CONFLICT DO NOTHING.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.ref_countries') IS NULL
     OR to_regclass('public.ref_languages') IS NULL
     OR to_regclass('public.departments') IS NULL
     OR to_regclass('public.contract_types') IS NULL
     OR to_regclass('public.positions') IS NULL
     OR to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_cap_vessel_ids(text)') IS NULL
     OR to_regprocedure('public.crew_vessel_gate(text,uuid,text)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060300_crew_profile_details needs the crew reference data and gate helpers: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regprocedure('public.crew_vessel_members(uuid,date)') IS NULL
     OR to_regprocedure('public.crew_status_decide(boolean,text,text,text)') IS NULL
     OR to_regprocedure('public.crew_caller_is_external()') IS NULL
     OR to_regclass('public.crew_transfers') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060300_crew_profile_details needs the crew membership and status helpers: apply 20261124060200_crew_vessel_list.sql first';
  END IF;
  IF to_regprocedure('public.my_profile_id()') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.vessel_company_of(uuid)') IS NULL
     OR position('user_is_active' IN pg_get_functiondef('public.hr_can_view(uuid)'::regprocedure)) = 0
     OR position('user_is_active' IN pg_get_functiondef('public.hr_can_edit(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060300_crew_profile_details needs the active-aware company and HR helpers: apply 20261123010000_platform_user_status.sql and 20261123010500_platform_role_scoped_policies.sql first';
  END IF;
  IF to_regclass('public.crew_next_of_kin') IS NULL OR to_regclass('public.audit_logs') IS NULL OR to_regclass('public.crew_leave_entries') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060300_crew_profile_details needs crew_next_of_kin (legacy 20260917110000), audit_logs and crew_leave_entries';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.crew_personal_details (
  profile_id uuid NOT NULL,
  company_id uuid NOT NULL,
  crew_number text NULL,
  title text NULL,
  middle_name text NULL,
  work_email text NULL,
  sex text NULL,
  date_of_birth date NULL,
  place_of_birth text NULL,
  nationality_code text NULL,
  dual_nationality_code text NULL,
  residency_country_code text NULL,
  place_of_embarkation text NULL,
  height_cm integer NULL,
  weight_kg integer NULL,
  marital_status text NULL,
  has_children text NULL,
  biography text NULL,
  address_line1 text NULL,
  address_line2 text NULL,
  city text NULL,
  region text NULL,
  postal_code text NULL,
  country_code text NULL,
  repatriation_airport text NULL,
  phone_dial_code text NULL,
  phone_number text NULL,
  mobile_dial_code text NULL,
  mobile_number text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_personal_details_pkey PRIMARY KEY (profile_id),
  CONSTRAINT crew_personal_details_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT crew_personal_details_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_personal_details_nationality_code_fkey FOREIGN KEY (nationality_code) REFERENCES public.ref_countries(iso2),
  CONSTRAINT crew_personal_details_dual_nationality_code_fkey FOREIGN KEY (dual_nationality_code) REFERENCES public.ref_countries(iso2),
  CONSTRAINT crew_personal_details_residency_country_code_fkey FOREIGN KEY (residency_country_code) REFERENCES public.ref_countries(iso2),
  CONSTRAINT crew_personal_details_country_code_fkey FOREIGN KEY (country_code) REFERENCES public.ref_countries(iso2),
  CONSTRAINT crew_personal_details_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_personal_details_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_personal_details_crew_number_check CHECK (crew_number IS NULL OR length(btrim(crew_number)) BETWEEN 1 AND 20),
  CONSTRAINT crew_personal_details_title_check CHECK (title IS NULL OR title IN ('mr', 'mrs', 'ms', 'miss', 'dr', 'capt', 'mx')),
  CONSTRAINT crew_personal_details_middle_name_check CHECK (middle_name IS NULL OR length(btrim(middle_name)) BETWEEN 1 AND 50),
  CONSTRAINT crew_personal_details_work_email_check CHECK (work_email IS NULL OR (length(work_email) <= 254 AND work_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  CONSTRAINT crew_personal_details_sex_check CHECK (sex IS NULL OR sex IN ('male', 'female', 'other', 'undisclosed')),
  CONSTRAINT crew_personal_details_date_of_birth_check CHECK (date_of_birth IS NULL OR date_of_birth >= DATE '1900-01-01'),
  CONSTRAINT crew_personal_details_place_of_birth_check CHECK (place_of_birth IS NULL OR length(btrim(place_of_birth)) BETWEEN 1 AND 120),
  CONSTRAINT crew_personal_details_place_of_embarkation_check CHECK (place_of_embarkation IS NULL OR length(btrim(place_of_embarkation)) BETWEEN 1 AND 120),
  CONSTRAINT crew_personal_details_height_cm_check CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250),
  CONSTRAINT crew_personal_details_weight_kg_check CHECK (weight_kg IS NULL OR weight_kg BETWEEN 30 AND 250),
  CONSTRAINT crew_personal_details_marital_status_check CHECK (marital_status IS NULL OR marital_status IN
    ('single', 'married', 'living_with_partner', 'divorced', 'widowed', 'separated', 'domestic_partnership', 'undisclosed')),
  CONSTRAINT crew_personal_details_has_children_check CHECK (has_children IS NULL OR has_children IN ('yes', 'no', 'undisclosed')),
  CONSTRAINT crew_personal_details_biography_check CHECK (biography IS NULL OR length(biography) BETWEEN 1 AND 2000),
  CONSTRAINT crew_personal_details_address_line1_check CHECK (address_line1 IS NULL OR length(btrim(address_line1)) BETWEEN 1 AND 120),
  CONSTRAINT crew_personal_details_address_line2_check CHECK (address_line2 IS NULL OR length(btrim(address_line2)) BETWEEN 1 AND 120),
  CONSTRAINT crew_personal_details_city_check CHECK (city IS NULL OR length(btrim(city)) BETWEEN 1 AND 80),
  CONSTRAINT crew_personal_details_region_check CHECK (region IS NULL OR length(btrim(region)) BETWEEN 1 AND 80),
  CONSTRAINT crew_personal_details_postal_code_check CHECK (postal_code IS NULL OR length(btrim(postal_code)) BETWEEN 1 AND 20),
  CONSTRAINT crew_personal_details_repatriation_airport_check CHECK (repatriation_airport IS NULL OR repatriation_airport ~ '^[A-Z]{3}$'),
  CONSTRAINT crew_personal_details_phone_dial_code_check CHECK (phone_dial_code IS NULL OR phone_dial_code ~ '^[0-9]{1,4}$'),
  CONSTRAINT crew_personal_details_mobile_dial_code_check CHECK (mobile_dial_code IS NULL OR mobile_dial_code ~ '^[0-9]{1,4}$'),
  CONSTRAINT crew_personal_details_phone_number_check CHECK (phone_number IS NULL OR phone_number ~ '^[0-9][0-9 ]{2,18}[0-9]$'),
  CONSTRAINT crew_personal_details_mobile_number_check CHECK (mobile_number IS NULL OR mobile_number ~ '^[0-9][0-9 ]{2,18}[0-9]$'),
  CONSTRAINT crew_personal_details_phone_pair_check CHECK (phone_dial_code IS NULL OR phone_number IS NOT NULL),
  CONSTRAINT crew_personal_details_mobile_pair_check CHECK (mobile_dial_code IS NULL OR mobile_number IS NOT NULL)
);
-- One crew number per company, whatever its letter case (D-X1-13: optional free text).
CREATE UNIQUE INDEX IF NOT EXISTS crew_personal_details_crew_number_key
  ON public.crew_personal_details (company_id, upper(btrim(crew_number))) WHERE crew_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS crew_personal_details_company_idx ON public.crew_personal_details (company_id);

CREATE TABLE IF NOT EXISTS public.crew_languages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  slot integer NOT NULL,
  language_code text NOT NULL,
  proficiency text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_languages_pkey PRIMARY KEY (id),
  CONSTRAINT crew_languages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_languages_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT crew_languages_language_code_fkey FOREIGN KEY (language_code) REFERENCES public.ref_languages(code),
  CONSTRAINT crew_languages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_languages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_languages_slot_check CHECK (slot BETWEEN 1 AND 4),
  CONSTRAINT crew_languages_proficiency_check CHECK (proficiency IS NULL OR proficiency IN ('basic', 'conversational', 'advanced', 'fluent')),
  -- Slot 1 is the mother tongue (no proficiency); slots 2-4 carry one.
  CONSTRAINT crew_languages_slot_proficiency_check CHECK ((slot = 1) = (proficiency IS NULL)),
  CONSTRAINT crew_languages_profile_slot_key UNIQUE (profile_id, slot),
  CONSTRAINT crew_languages_profile_language_key UNIQUE (profile_id, language_code)
);
CREATE INDEX IF NOT EXISTS crew_languages_company_idx ON public.crew_languages (company_id);

CREATE TABLE IF NOT EXISTS public.crew_assignment_terms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  assignment_id uuid NULL,
  position_id uuid NULL,
  department_key text NULL,
  start_date date NOT NULL,
  date_joining_vessel date NULL,
  review_date date NULL,
  contract_type_key text NULL,
  leave_method text NULL,
  leave_days_per_year numeric(5,2) NULL,
  leave_ratio_on integer NULL,
  leave_ratio_off integer NULL,
  place_of_embarkation text NULL,
  end_date date NULL,
  end_reason text NULL,
  end_notes text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_assignment_terms_pkey PRIMARY KEY (id),
  CONSTRAINT crew_assignment_terms_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_assignment_terms_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT crew_assignment_terms_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT crew_assignment_terms_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.crew_assignments(id) ON DELETE SET NULL,
  CONSTRAINT crew_assignment_terms_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE SET NULL,
  CONSTRAINT crew_assignment_terms_department_key_fkey FOREIGN KEY (department_key) REFERENCES public.departments(key),
  CONSTRAINT crew_assignment_terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_assignment_terms_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT crew_assignment_terms_joining_check CHECK (date_joining_vessel IS NULL OR date_joining_vessel >= start_date),
  CONSTRAINT crew_assignment_terms_review_check CHECK (review_date IS NULL OR review_date >= start_date),
  CONSTRAINT crew_assignment_terms_contract_type_key_check CHECK (contract_type_key IS NULL OR (contract_type_key ~ '^[a-z][a-z0-9_]*$' AND length(contract_type_key) <= 40)),
  CONSTRAINT crew_assignment_terms_leave_method_check CHECK (leave_method IS NULL OR leave_method IN ('days_per_year', 'ratio', 'none')),
  CONSTRAINT crew_assignment_terms_leave_days_check CHECK (leave_days_per_year IS NULL OR leave_days_per_year BETWEEN 0 AND 365),
  CONSTRAINT crew_assignment_terms_leave_ratio_on_check CHECK (leave_ratio_on IS NULL OR leave_ratio_on BETWEEN 1 AND 99),
  CONSTRAINT crew_assignment_terms_leave_ratio_off_check CHECK (leave_ratio_off IS NULL OR leave_ratio_off BETWEEN 1 AND 99),
  -- The allowance columns follow the method: days for days_per_year, both ratio parts for ratio, nothing otherwise.
  CONSTRAINT crew_assignment_terms_leave_shape_check CHECK (
    (leave_method = 'days_per_year' AND leave_days_per_year IS NOT NULL AND leave_ratio_on IS NULL AND leave_ratio_off IS NULL)
    OR (leave_method = 'ratio' AND leave_days_per_year IS NULL AND leave_ratio_on IS NOT NULL AND leave_ratio_off IS NOT NULL)
    OR (coalesce(leave_method, 'none') = 'none' AND leave_days_per_year IS NULL AND leave_ratio_on IS NULL AND leave_ratio_off IS NULL)
  ),
  CONSTRAINT crew_assignment_terms_place_of_embarkation_check CHECK (place_of_embarkation IS NULL OR length(btrim(place_of_embarkation)) BETWEEN 1 AND 120),
  CONSTRAINT crew_assignment_terms_end_date_check CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT crew_assignment_terms_end_reason_check CHECK (end_reason IS NULL OR end_reason IN
    ('contract_end', 'resignation', 'dismissal', 'medical', 'end_of_temporary_contract', 'transfer_to_another_employer', 'retirement', 'transfer', 'other')),
  CONSTRAINT crew_assignment_terms_end_shape_check CHECK ((end_reason IS NULL AND end_notes IS NULL) OR end_date IS NOT NULL),
  CONSTRAINT crew_assignment_terms_end_notes_check CHECK (end_notes IS NULL OR length(end_notes) BETWEEN 1 AND 2000),
  CONSTRAINT crew_assignment_terms_profile_vessel_start_key UNIQUE (profile_id, vessel_id, start_date)
);
CREATE INDEX IF NOT EXISTS crew_assignment_terms_vessel_idx ON public.crew_assignment_terms (vessel_id);
CREATE INDEX IF NOT EXISTS crew_assignment_terms_company_idx ON public.crew_assignment_terms (company_id);
CREATE INDEX IF NOT EXISTS crew_assignment_terms_assignment_idx ON public.crew_assignment_terms (assignment_id) WHERE assignment_id IS NOT NULL;

-- Next of kin phones as dial code + national number, and the address country as a code (gap/04 C20, T-68).
ALTER TABLE public.crew_next_of_kin ADD COLUMN IF NOT EXISTS phone_dial_code text NULL;
ALTER TABLE public.crew_next_of_kin ADD COLUMN IF NOT EXISTS mobile_dial_code text NULL;
ALTER TABLE public.crew_next_of_kin ADD COLUMN IF NOT EXISTS mobile_number text NULL;
ALTER TABLE public.crew_next_of_kin ADD COLUMN IF NOT EXISTS country_code text NULL;
ALTER TABLE public.crew_next_of_kin DROP CONSTRAINT IF EXISTS crew_next_of_kin_phone_dial_code_check;
ALTER TABLE public.crew_next_of_kin ADD CONSTRAINT crew_next_of_kin_phone_dial_code_check
  CHECK (phone_dial_code IS NULL OR phone_dial_code ~ '^[0-9]{1,4}$') NOT VALID;
ALTER TABLE public.crew_next_of_kin VALIDATE CONSTRAINT crew_next_of_kin_phone_dial_code_check;
ALTER TABLE public.crew_next_of_kin DROP CONSTRAINT IF EXISTS crew_next_of_kin_mobile_dial_code_check;
ALTER TABLE public.crew_next_of_kin ADD CONSTRAINT crew_next_of_kin_mobile_dial_code_check
  CHECK (mobile_dial_code IS NULL OR mobile_dial_code ~ '^[0-9]{1,4}$') NOT VALID;
ALTER TABLE public.crew_next_of_kin VALIDATE CONSTRAINT crew_next_of_kin_mobile_dial_code_check;
ALTER TABLE public.crew_next_of_kin DROP CONSTRAINT IF EXISTS crew_next_of_kin_mobile_number_check;
ALTER TABLE public.crew_next_of_kin ADD CONSTRAINT crew_next_of_kin_mobile_number_check
  CHECK (mobile_number IS NULL OR mobile_number ~ '^[0-9][0-9 ]{2,18}[0-9]$') NOT VALID;
ALTER TABLE public.crew_next_of_kin VALIDATE CONSTRAINT crew_next_of_kin_mobile_number_check;
ALTER TABLE public.crew_next_of_kin DROP CONSTRAINT IF EXISTS crew_next_of_kin_country_code_fkey;
ALTER TABLE public.crew_next_of_kin ADD CONSTRAINT crew_next_of_kin_country_code_fkey
  FOREIGN KEY (country_code) REFERENCES public.ref_countries(iso2) NOT VALID;
ALTER TABLE public.crew_next_of_kin VALIDATE CONSTRAINT crew_next_of_kin_country_code_fkey;
COMMENT ON COLUMN public.crew_next_of_kin.phone_dial_code IS 'International dial code of phone_primary, digits only (T-68): phone_primary keeps the national number once the next-of-kin form writes the pair; legacy rows keep their full text.';
COMMENT ON COLUMN public.crew_next_of_kin.mobile_dial_code IS 'International dial code of mobile_number, digits only (T-68).';
COMMENT ON COLUMN public.crew_next_of_kin.mobile_number IS 'Mobile national number, digits and spaces, without the dial code (T-68).';
COMMENT ON COLUMN public.crew_next_of_kin.country_code IS 'ISO 3166-1 alpha-2 country of the address (ref_countries); the legacy country text stays for old rows.';

COMMENT ON TABLE public.crew_personal_details IS 'One row per person (profiles.id): the identity, contact and address fields the crew profile adds to profiles (gap/04 C17, C20, C21; T-68 phones as dial code + national number; D-X1-13 crew number, optional, unique per company). Kept apart from profiles so the wider personal data is read only by people who may see the person (crew_visible_profile_ids). Written only through crew_personal_details_save() and crew_onboarding_save().';
COMMENT ON TABLE public.crew_languages IS 'A person''s languages (gap/04 C17): slot 1 the mother tongue, slots 2-4 with a proficiency (basic, conversational, advanced, fluent). Read as crew_personal_details; replaced as a whole through crew_languages_save().';
COMMENT ON TABLE public.crew_assignment_terms IS 'Employment terms of a person on a vessel that crew_assignments cannot carry (D-X1-2): position and department, start, date joining the vessel, review date, contract type, leave allowance (days a year, an on:off ratio or none), place of embarkation and the end. assignment_id is an advisory link (no trigger on the shared crew_assignments); readers match by person, vessel and dates. Written by X1 definers only (crew_onboarding_save; the employment slices).';

-- ---------------------------------------------------------------- integrity guards (every writer)

-- A details or language row names a person of its own company.
CREATE OR REPLACE FUNCTION public.crew_personal_details_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = NEW.profile_id AND p.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_profile_scope_mismatch',
      DETAIL = 'A crew record must belong to the person''s own company.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crew_languages_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = NEW.profile_id AND p.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_profile_scope_mismatch',
      DETAIL = 'A crew record must belong to the person''s own company.';
  END IF;
  RETURN NEW;
END;
$$;

-- Terms: the person and the vessel of the row's company; the position one
-- the vessel can see (STORM's, the company's, or the vessel's own).
CREATE OR REPLACE FUNCTION public.crew_assignment_terms_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = NEW.profile_id AND p.company_id = NEW.company_id)
     OR NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = NEW.vessel_id AND v.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_terms_scope_mismatch',
      DETAIL = 'Employment terms must name a person and a vessel of the same company.';
  END IF;
  IF NEW.position_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.positions AS pos
    WHERE pos.id = NEW.position_id
      AND (pos.company_id IS NULL OR pos.company_id = NEW.company_id)
      AND (pos.vessel_id IS NULL OR pos.vessel_id = NEW.vessel_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_terms_scope_mismatch',
      DETAIL = 'The position is not available on this vessel.';
  END IF;
  IF NEW.assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crew_assignments AS ca
    JOIN public.profiles AS p ON p.id = NEW.profile_id
    WHERE ca.id = NEW.assignment_id AND ca.vessel_id = NEW.vessel_id AND ca.user_id IS NOT DISTINCT FROM p.user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_terms_scope_mismatch',
      DETAIL = 'The linked assignment is not this person''s on this vessel.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crew_personal_details_scope_guard ON public.crew_personal_details;
CREATE TRIGGER crew_personal_details_scope_guard BEFORE INSERT OR UPDATE ON public.crew_personal_details
  FOR EACH ROW EXECUTE FUNCTION public.crew_personal_details_scope_guard();
DROP TRIGGER IF EXISTS crew_languages_scope_guard ON public.crew_languages;
CREATE TRIGGER crew_languages_scope_guard BEFORE INSERT OR UPDATE ON public.crew_languages
  FOR EACH ROW EXECUTE FUNCTION public.crew_languages_scope_guard();
DROP TRIGGER IF EXISTS crew_assignment_terms_scope_guard ON public.crew_assignment_terms;
CREATE TRIGGER crew_assignment_terms_scope_guard BEFORE INSERT OR UPDATE ON public.crew_assignment_terms
  FOR EACH ROW EXECUTE FUNCTION public.crew_assignment_terms_scope_guard();
DROP TRIGGER IF EXISTS update_crew_personal_details_updated_at ON public.crew_personal_details;
CREATE TRIGGER update_crew_personal_details_updated_at BEFORE UPDATE ON public.crew_personal_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_crew_languages_updated_at ON public.crew_languages;
CREATE TRIGGER update_crew_languages_updated_at BEFORE UPDATE ON public.crew_languages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_crew_assignment_terms_updated_at ON public.crew_assignment_terms;
CREATE TRIGGER update_crew_assignment_terms_updated_at BEFORE UPDATE ON public.crew_assignment_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- pure helpers (backfill and parity)

-- A legacy phone text split into an international dial code and the
-- national number (digits only), or no row when it cannot be read. Mirrored
-- by splitLegacyPhone() in src/modules/crew/lib/phone.ts (same cases):
-- * "+" or "00" first: international; "(0)" (a written trunk prefix) is
--   dropped; the longest ref_countries dial code that starts the digits is
--   the dial code (+1 876 is Jamaica, +1 212 the United States); no known
--   code: no row;
-- * otherwise a national number without a dial code;
-- * the national part must keep 4 to 20 digits.
CREATE OR REPLACE FUNCTION public.crew_phone_split(p_raw text)
RETURNS TABLE (dial_code text, national_number text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_text text := btrim(coalesce(p_raw, ''));
  v_intl boolean;
  v_digits text;
  v_code text;
BEGIN
  IF v_text = '' THEN
    RETURN;
  END IF;
  v_intl := v_text ~ '^(\+|00)';
  v_digits := regexp_replace(replace(v_text, '(0)', ''), '[^0-9]', '', 'g');
  IF v_text ~ '^00' THEN
    v_digits := substr(v_digits, 3);
  END IF;
  IF v_intl THEN
    SELECT c.dial_code INTO v_code
    FROM public.ref_countries AS c
    WHERE c.dial_code IS NOT NULL AND v_digits LIKE c.dial_code || '%'
    ORDER BY length(c.dial_code) DESC, c.dial_code
    LIMIT 1;
    IF v_code IS NULL THEN
      RETURN;
    END IF;
    v_digits := substr(v_digits, length(v_code) + 1);
  END IF;
  IF length(v_digits) NOT BETWEEN 4 AND 20 THEN
    RETURN;
  END IF;
  dial_code := v_code;
  national_number := v_digits;
  RETURN NEXT;
END;
$$;

-- A free-text nationality or country to its ISO code: the country's name,
-- sort name, demonym, alpha-2 or alpha-3 code (any case), or one of a few
-- common spellings (UK, English, USA, Holland, …). NULL when nothing or
-- more than one country matches.
CREATE OR REPLACE FUNCTION public.crew_country_from_text(p_text text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH t AS (SELECT lower(btrim(coalesce(p_text, ''))) AS k),
  aliases (k, iso2) AS (
    VALUES ('uk', 'GB'), ('u.k.', 'GB'), ('great britain', 'GB'), ('britain', 'GB'), ('england', 'GB'), ('english', 'GB'),
           ('scotland', 'GB'), ('scottish', 'GB'), ('wales', 'GB'), ('welsh', 'GB'), ('northern ireland', 'GB'),
           ('northern irish', 'GB'), ('usa', 'US'), ('u.s.', 'US'), ('u.s.a.', 'US'), ('america', 'US'),
           ('united states of america', 'US'), ('holland', 'NL'), ('the netherlands', 'NL'), ('kiwi', 'NZ')
  ),
  hits AS (
    SELECT c.iso2
    FROM public.ref_countries AS c, t
    WHERE t.k <> '' AND c.is_active
      AND (lower(c.name) = t.k OR lower(c.sort_name) = t.k OR lower(c.demonym) = t.k OR lower(c.iso2) = t.k OR lower(c.iso3) = t.k)
    UNION
    SELECT a.iso2 FROM aliases AS a, t WHERE a.k = t.k
  )
  SELECT CASE WHEN (SELECT count(*) FROM hits) = 1 THEN (SELECT h.iso2 FROM hits AS h) END
$$;

-- The personal-details fields a payload may carry and who may change them
-- (mirrored by PERSONAL_FIELD_GROUP in src/modules/crew/lib/personalDetailsSchema.ts):
-- 'identity' needs an editor; 'self' the person or an editor; 'name'
-- fields are identity fields stored on profiles.
CREATE OR REPLACE FUNCTION public.crew_personal_field_groups()
RETURNS TABLE (field text, field_group text, stored_on text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  VALUES
    ('first_name', 'identity', 'profiles'), ('last_name', 'identity', 'profiles'), ('preferred_name', 'identity', 'profiles'),
    ('title', 'identity', 'details'), ('middle_name', 'identity', 'details'), ('work_email', 'identity', 'details'),
    ('crew_number', 'identity', 'details'), ('sex', 'identity', 'details'), ('date_of_birth', 'identity', 'details'),
    ('place_of_birth', 'identity', 'details'), ('nationality_code', 'identity', 'details'),
    ('dual_nationality_code', 'identity', 'details'), ('residency_country_code', 'identity', 'details'),
    ('place_of_embarkation', 'identity', 'details'),
    ('height_cm', 'self', 'details'), ('weight_kg', 'self', 'details'), ('marital_status', 'self', 'details'),
    ('has_children', 'self', 'details'), ('biography', 'self', 'details'),
    ('address_line1', 'self', 'details'), ('address_line2', 'self', 'details'), ('city', 'self', 'details'),
    ('region', 'self', 'details'), ('postal_code', 'self', 'details'), ('country_code', 'self', 'details'),
    ('repatriation_airport', 'self', 'details'), ('phone_dial_code', 'self', 'details'), ('phone_number', 'self', 'details'),
    ('mobile_dial_code', 'self', 'details'), ('mobile_number', 'self', 'details')
$$;

-- ---------------------------------------------------------------- visibility (X1 spec §3)

-- The vessels of a person's structural set (internal): their current and
-- planned assignments (D-227 at today) and their pending placement (no
-- current assignment for the login), each a vessel of the person's own
-- company (D-246). Mirrored set-wise by crew_visible_profile_ids().
CREATE OR REPLACE FUNCTION public.crew_profile_structural_vessels(p_profile_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ca.vessel_id
  FROM public.profiles AS p
  JOIN public.crew_assignments AS ca ON ca.user_id = p.user_id
  JOIN public.vessels AS v ON v.id = ca.vessel_id AND v.company_id = p.company_id
  WHERE p.id = p_profile_id
    AND coalesce(ca.is_current, false)
    AND NOT coalesce(coalesce(ca.leave_date, ca.end_date) <= current_date, false)
  UNION
  SELECT p.imported_vessel_id
  FROM public.profiles AS p
  JOIN public.vessels AS v ON v.id = p.imported_vessel_id AND v.company_id = p.company_id
  WHERE p.id = p_profile_id
    AND coalesce(p.is_imported, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_assignments AS x
      WHERE p.user_id IS NOT NULL AND x.user_id = p.user_id
        AND coalesce(x.is_current, false)
        AND NOT coalesce(coalesce(x.leave_date, x.end_date) <= current_date, false)
    )
$$;

-- The caller may see the person (X1 spec §3): an active caller of the
-- person's company who is the person, or (not an external viewer) a legacy
-- HR viewer, or a holder of vessel.crew.crew_profiles.view on a vessel of
-- the person's structural set. False without a JWT, for an inactive
-- caller (get_user_company_id answers NULL), an unknown or foreign profile.
-- One argument, so the D-233 inventory probes it with the caller.
CREATE OR REPLACE FUNCTION public.crew_profile_visible(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_subject_company uuid;
BEGIN
  IF v_uid IS NULL OR p_profile_id IS NULL THEN
    RETURN false;
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RETURN false;
  END IF;
  SELECT p.company_id INTO v_subject_company FROM public.profiles AS p WHERE p.id = p_profile_id;
  IF v_subject_company IS DISTINCT FROM v_company THEN
    RETURN false;
  END IF;
  IF p_profile_id = public.my_profile_id() THEN
    RETURN true;
  END IF;
  IF public.crew_caller_is_external() THEN
    RETURN false;
  END IF;
  IF public.hr_can_view(v_uid) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.crew_profile_structural_vessels(p_profile_id) AS s(vessel_id)
    WHERE public.crew_vessel_cap('vessel.crew.crew_profiles.view', s.vessel_id)
  );
END;
$$;

-- Caller-only set (D-229): every profile crew_profile_visible() answers
-- true for, computed once per statement. Policies use
-- `profile_id IN (SELECT public.crew_visible_profile_ids())`.
CREATE OR REPLACE FUNCTION public.crew_visible_profile_ids()
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
  v_vessels uuid[];
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
  SELECT coalesce(array_agg(x), ARRAY[]::uuid[]) INTO v_vessels FROM public.crew_cap_vessel_ids('vessel.crew.crew_profiles.view') AS x;
  IF cardinality(v_vessels) = 0 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id
    FROM public.profiles AS p
    JOIN public.crew_assignments AS ca ON ca.user_id = p.user_id
    WHERE p.company_id = v_company
      AND ca.vessel_id = ANY (v_vessels)
      AND coalesce(ca.is_current, false)
      AND NOT coalesce(coalesce(ca.leave_date, ca.end_date) <= current_date, false)
      AND p.id IS DISTINCT FROM v_me
    UNION
    SELECT p.id
    FROM public.profiles AS p
    WHERE p.company_id = v_company
      AND coalesce(p.is_imported, false)
      AND p.imported_vessel_id = ANY (v_vessels)
      AND p.id IS DISTINCT FROM v_me
      AND NOT EXISTS (
        SELECT 1 FROM public.crew_assignments AS x
        WHERE p.user_id IS NOT NULL AND x.user_id = p.user_id
          AND coalesce(x.is_current, false)
          AND NOT coalesce(coalesce(x.leave_date, x.end_date) <= current_date, false)
      );
END;
$$;

-- The caller may change the person's identity fields (internal): an active
-- caller of the person's company, not an external viewer, who is a legacy
-- HR editor or holds vessel.crew.crew_profiles.edit on a vessel of the
-- person's structural set. False otherwise. One argument (D-233 probe).
CREATE OR REPLACE FUNCTION public.crew_profile_can_edit(p_profile_id uuid)
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
  IF v_uid IS NULL OR p_profile_id IS NULL THEN
    RETURN false;
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_profile_id AND p.company_id = v_company) THEN
    RETURN false;
  END IF;
  IF public.crew_caller_is_external() THEN
    RETURN false;
  END IF;
  IF public.hr_can_edit(v_uid) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.crew_profile_structural_vessels(p_profile_id) AS s(vessel_id)
    WHERE public.crew_vessel_cap('vessel.crew.crew_profiles.edit', s.vessel_id)
  );
END;
$$;

-- ---------------------------------------------------------------- the writer (internal)

-- Applies a personal-details payload (keys of crew_personal_field_groups()
-- only; the caller's gate decided who may send which) to the person's row
-- and their names on profiles. Merge semantics: a key present sets the
-- field (null clears it), a key absent leaves it. Text is trimmed (blank
-- is null), codes are upper-cased, the work email lower-cased, dial codes
-- lose a leading "+". With p_fill_only, an identity field that already has
-- a value is refused (42501 crew_identity_locked): a crew creator who is
-- not an editor fills blanks only. Every refusal is 22023 with a sentence
-- in DETAIL and the field in HINT. Writes one audit_logs row listing the
-- fields that changed (names of fields only, never values). Returns the row.
CREATE OR REPLACE FUNCTION public.crew_personal_details_apply(
  p_profile_id uuid,
  p_payload jsonb,
  p_actor uuid,
  p_fill_only boolean DEFAULT false
)
RETURNS public.crew_personal_details
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_old public.crew_personal_details;
  v_new public.crew_personal_details;
  v_exists boolean;
  v_key text;
  v_details jsonb;
  v_first text;
  v_last text;
  v_preferred text;
  v_changed text[] := ARRAY[]::text[];
  v_constraint text;
  v_field text;
BEGIN
  SELECT * INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_profile.company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid', DETAIL = 'The details could not be read.';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.crew_personal_field_groups() AS g WHERE g.field = v_key) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_unknown', DETAIL = format('There is no field called "%s".', v_key), HINT = v_key;
    END IF;
  END LOOP;

  SELECT * INTO v_old FROM public.crew_personal_details AS d WHERE d.profile_id = p_profile_id FOR UPDATE;
  v_exists := FOUND;
  IF NOT v_exists THEN
    v_old.profile_id := p_profile_id;
    v_old.company_id := v_profile.company_id;
  END IF;

  -- Fill-only callers may not overwrite an identity field that has a value.
  IF p_fill_only THEN
    FOR v_key IN
      SELECT g.field FROM public.crew_personal_field_groups() AS g
      WHERE g.field_group = 'identity' AND p_payload ? g.field
    LOOP
      IF (CASE WHEN v_key IN ('first_name', 'last_name', 'preferred_name') THEN to_jsonb(v_profile) ELSE to_jsonb(v_old) END) ->> v_key IS NOT NULL
         AND ((CASE WHEN v_key IN ('first_name', 'last_name', 'preferred_name') THEN to_jsonb(v_profile) ELSE to_jsonb(v_old) END) -> v_key)
             IS DISTINCT FROM (p_payload -> v_key) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_identity_locked',
          DETAIL = 'Only HR or a crew editor of this person''s vessel can change details that are already recorded.', HINT = v_key;
      END IF;
    END LOOP;
  END IF;

  -- Normalise the text the client sent (trim, blank -> null; codes upper,
  -- email lower; dial codes without "+"), then merge it into the row.
  v_details := '{}'::jsonb;
  FOR v_key IN SELECT g.field FROM public.crew_personal_field_groups() AS g WHERE g.stored_on = 'details' AND p_payload ? g.field LOOP
    IF jsonb_typeof(p_payload -> v_key) = 'string' THEN
      v_details := v_details || jsonb_build_object(v_key, CASE
        WHEN v_key IN ('nationality_code', 'dual_nationality_code', 'residency_country_code', 'country_code', 'repatriation_airport')
          THEN to_jsonb(nullif(upper(btrim(p_payload ->> v_key)), ''))
        WHEN v_key = 'work_email' THEN to_jsonb(nullif(lower(btrim(p_payload ->> v_key)), ''))
        WHEN v_key IN ('phone_dial_code', 'mobile_dial_code') THEN to_jsonb(nullif(regexp_replace(btrim(p_payload ->> v_key), '^\+', ''), ''))
        WHEN v_key IN ('phone_number', 'mobile_number') THEN to_jsonb(nullif(regexp_replace(btrim(p_payload ->> v_key), '\s+', ' ', 'g'), ''))
        WHEN v_key = 'biography' THEN to_jsonb(nullif(btrim(p_payload ->> v_key), ''))
        ELSE to_jsonb(nullif(btrim(p_payload ->> v_key), ''))
      END);
    ELSE
      v_details := v_details || jsonb_build_object(v_key, p_payload -> v_key);
    END IF;
  END LOOP;
  BEGIN
    v_new := jsonb_populate_record(v_old, v_details);
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
                 OR numeric_value_out_of_range OR invalid_parameter_value OR data_exception THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'One of the values could not be read. Check the dates and numbers.';
  END;
  IF v_new.date_of_birth IS NOT NULL AND v_new.date_of_birth > current_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'The date of birth cannot be in the future.', HINT = 'date_of_birth';
  END IF;
  v_new.profile_id := p_profile_id;
  v_new.company_id := v_profile.company_id;
  v_new.updated_by := p_actor;

  -- The names (identity, stored on profiles).
  v_first := v_profile.first_name;
  v_last := v_profile.last_name;
  v_preferred := v_profile.preferred_name;
  IF p_payload ? 'first_name' THEN
    v_first := btrim(coalesce(p_payload ->> 'first_name', ''));
    IF length(v_first) NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Enter a first name of up to 50 characters.', HINT = 'first_name';
    END IF;
  END IF;
  IF p_payload ? 'last_name' THEN
    v_last := btrim(coalesce(p_payload ->> 'last_name', ''));
    IF length(v_last) NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Enter a last name of up to 50 characters.', HINT = 'last_name';
    END IF;
  END IF;
  IF p_payload ? 'preferred_name' THEN
    v_preferred := nullif(btrim(coalesce(p_payload ->> 'preferred_name', '')), '');
    IF length(v_preferred) > 50 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Keep the preferred name to 50 characters.', HINT = 'preferred_name';
    END IF;
  END IF;

  -- What changed (field names only).
  SELECT coalesce(array_agg(g.field ORDER BY g.field), ARRAY[]::text[]) INTO v_changed
  FROM public.crew_personal_field_groups() AS g
  WHERE g.stored_on = 'details' AND p_payload ? g.field
    AND (to_jsonb(v_old) -> g.field) IS DISTINCT FROM (to_jsonb(v_new) -> g.field);
  IF v_first IS DISTINCT FROM v_profile.first_name THEN v_changed := v_changed || 'first_name'::text; END IF;
  IF v_last IS DISTINCT FROM v_profile.last_name THEN v_changed := v_changed || 'last_name'::text; END IF;
  IF v_preferred IS DISTINCT FROM v_profile.preferred_name THEN v_changed := v_changed || 'preferred_name'::text; END IF;

  BEGIN
    IF v_exists THEN
      UPDATE public.crew_personal_details AS d SET
        crew_number = v_new.crew_number, title = v_new.title, middle_name = v_new.middle_name, work_email = v_new.work_email,
        sex = v_new.sex, date_of_birth = v_new.date_of_birth, place_of_birth = v_new.place_of_birth,
        nationality_code = v_new.nationality_code, dual_nationality_code = v_new.dual_nationality_code,
        residency_country_code = v_new.residency_country_code, place_of_embarkation = v_new.place_of_embarkation,
        height_cm = v_new.height_cm, weight_kg = v_new.weight_kg, marital_status = v_new.marital_status,
        has_children = v_new.has_children, biography = v_new.biography, address_line1 = v_new.address_line1,
        address_line2 = v_new.address_line2, city = v_new.city, region = v_new.region, postal_code = v_new.postal_code,
        country_code = v_new.country_code, repatriation_airport = v_new.repatriation_airport,
        phone_dial_code = v_new.phone_dial_code, phone_number = v_new.phone_number,
        mobile_dial_code = v_new.mobile_dial_code, mobile_number = v_new.mobile_number,
        updated_by = p_actor
      WHERE d.profile_id = p_profile_id
      RETURNING d.* INTO v_new;
    ELSE
      INSERT INTO public.crew_personal_details (
        profile_id, company_id, crew_number, title, middle_name, work_email, sex, date_of_birth, place_of_birth,
        nationality_code, dual_nationality_code, residency_country_code, place_of_embarkation, height_cm, weight_kg,
        marital_status, has_children, biography, address_line1, address_line2, city, region, postal_code, country_code,
        repatriation_airport, phone_dial_code, phone_number, mobile_dial_code, mobile_number, created_by, updated_by
      ) VALUES (
        p_profile_id, v_profile.company_id, v_new.crew_number, v_new.title, v_new.middle_name, v_new.work_email, v_new.sex,
        v_new.date_of_birth, v_new.place_of_birth, v_new.nationality_code, v_new.dual_nationality_code,
        v_new.residency_country_code, v_new.place_of_embarkation, v_new.height_cm, v_new.weight_kg, v_new.marital_status,
        v_new.has_children, v_new.biography, v_new.address_line1, v_new.address_line2, v_new.city, v_new.region,
        v_new.postal_code, v_new.country_code, v_new.repatriation_airport, v_new.phone_dial_code, v_new.phone_number,
        v_new.mobile_dial_code, v_new.mobile_number, p_actor, p_actor
      )
      RETURNING * INTO v_new;
    END IF;
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      v_field := CASE v_constraint
        WHEN 'crew_personal_details_phone_pair_check' THEN 'phone_number'
        WHEN 'crew_personal_details_mobile_pair_check' THEN 'mobile_number'
        WHEN 'crew_personal_details_date_of_birth_check' THEN 'date_of_birth'
        ELSE substring(v_constraint FROM '^crew_personal_details_(.+)_check$')
      END;
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', HINT = coalesce(v_field, ''),
        DETAIL = CASE v_field
          WHEN 'crew_number' THEN 'Keep the crew number to 20 characters.'
          WHEN 'work_email' THEN 'Enter a valid work email address.'
          WHEN 'date_of_birth' THEN 'Enter a date of birth from 1900 onwards.'
          WHEN 'height_cm' THEN 'Height is between 100 and 250 cm.'
          WHEN 'weight_kg' THEN 'Weight is between 30 and 250 kg.'
          WHEN 'biography' THEN 'Keep the biography to 2,000 characters.'
          WHEN 'repatriation_airport' THEN 'Use the airport''s three-letter IATA code, for example LHR.'
          WHEN 'phone_dial_code' THEN 'A dial code is 1 to 4 digits.'
          WHEN 'mobile_dial_code' THEN 'A dial code is 1 to 4 digits.'
          WHEN 'phone_number' THEN 'Enter the phone number (4 to 20 digits) after its dial code.'
          WHEN 'mobile_number' THEN 'Enter the mobile number (4 to 20 digits) after its dial code.'
          ELSE 'One of the values is not allowed. Check the field and try again.'
        END;
    WHEN unique_violation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'crew_number_taken', HINT = 'crew_number',
        DETAIL = 'Another crew member of this company already has this crew number.';
    WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      v_field := substring(v_constraint FROM '^crew_personal_details_(.+)_fkey$');
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'country_unknown', HINT = coalesce(v_field, ''),
        DETAIL = 'Choose a country from the list.';
  END;

  IF v_first IS DISTINCT FROM v_profile.first_name OR v_last IS DISTINCT FROM v_profile.last_name
     OR v_preferred IS DISTINCT FROM v_profile.preferred_name THEN
    UPDATE public.profiles SET first_name = v_first, last_name = v_last, preferred_name = v_preferred, updated_by = p_actor
    WHERE id = p_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
    END IF;
  END IF;

  IF cardinality(v_changed) > 0 THEN
    INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_user_id, changed_fields, new_values)
    VALUES ('crew_profile', p_profile_id, CASE WHEN v_exists THEN 'UPDATE' ELSE 'CREATE' END, p_actor,
            to_jsonb(v_changed), jsonb_build_object('via', 'crew_personal_details'));
  END IF;
  RETURN v_new;
END;
$$;

-- ---------------------------------------------------------------- RPCs

-- The profile id behind a profile URL (D-X1-19): p_ref is a profiles.id or
-- a legacy login id (profiles.user_id), so old /crew/work-rest/:crewId
-- style links keep working. Answers only for a person the caller may see
-- (crew_profile_visible); anything else, an unknown id included, is P0002
-- profile_not_found, so the mapping of ids never leaks. The vessel is the
-- page's scope: P0002 vessel_not_found for one outside the caller's
-- company (vessel_company_of answers only the caller's company).
CREATE OR REPLACE FUNCTION public.crew_profile_resolve(p_vessel_id uuid, p_ref uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_vessel_id IS NULL OR p_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ref_required';
  END IF;
  IF public.vessel_company_of(p_vessel_id) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  SELECT p.id INTO v_id FROM public.profiles AS p WHERE p.id = p_ref;
  IF v_id IS NULL THEN
    SELECT p.id INTO v_id FROM public.profiles AS p WHERE p.user_id = p_ref;
  END IF;
  IF v_id IS NULL OR NOT public.crew_profile_visible(v_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  RETURN v_id;
END;
$$;

-- The profile header (gap/04 C16) for a person seen from a vessel's crew:
-- names, crew number, position and department (crew_position_for, as the
-- crew list), the status on this vessel today (crew_status_decide, as the
-- list) when they are on its crew, the login state, the previous and next
-- person in the vessel's rank order (among those the caller may see), the
-- caller's rights on the person (own, may edit identity fields, may edit
-- self fields) and the profile tabs the caller may open (X1 spec §4):
-- personal, contact, documents, stcw, qualifications, training and
-- activity for anyone who may see the person; hours-of-rest with
-- vessel.crew.hours_of_rest.view on the vessel (own always); employment
-- with hris.employee_records.contracts_employment.view and medical with
-- health.personnel_medical.crew_medical_records.view on the vessel.
-- Gate: P0002 vessel_not_found outside the caller's company, P0002
-- profile_not_found unless crew_profile_visible.
CREATE OR REPLACE FUNCTION public.crew_profile_summary(p_profile_id uuid, p_vessel_id uuid)
RETURNS TABLE (
  profile_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  avatar_url text,
  crew_number text,
  position_id uuid,
  position_name text,
  position_text text,
  department_key text,
  department_label text,
  rank_tier text,
  on_vessel boolean,
  placement_kind text,
  assignment_id uuid,
  join_date date,
  leave_date date,
  status text,
  status_detail text,
  transfer_vessel_id uuid,
  leave_code text,
  login_state text,
  prev_profile_id uuid,
  prev_name text,
  next_profile_id uuid,
  next_name text,
  member_index integer,
  member_count integer,
  is_own boolean,
  can_edit boolean,
  can_edit_self boolean,
  tabs text[]
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
  v_profile public.profiles;
  v_own boolean;
  v_all_members boolean;
  v_editor boolean;
  v_tabs text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF p_vessel_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ref_required';
  END IF;
  v_company := public.vessel_company_of(p_vessel_id);
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'vessel_not_found', DETAIL = 'This vessel could not be found.';
  END IF;
  IF NOT public.crew_profile_visible(p_profile_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  SELECT * INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id;
  v_own := p_profile_id = public.my_profile_id();
  v_editor := public.crew_profile_can_edit(p_profile_id);
  -- Everyone on the vessel's crew is visible to a crew_profiles.view holder
  -- on the vessel and to a legacy HR viewer; anyone else steps through
  -- nobody but themselves.
  v_all_members := NOT public.crew_caller_is_external()
    AND (public.crew_vessel_cap('vessel.crew.crew_profiles.view', p_vessel_id) OR public.hr_can_view(v_uid));
  v_tabs := ARRAY['personal', 'contact', 'documents', 'stcw', 'qualifications', 'training', 'activity'];
  IF v_own OR public.crew_vessel_cap('vessel.crew.hours_of_rest.view', p_vessel_id) THEN
    v_tabs := v_tabs || 'hours-of-rest'::text;
  END IF;
  IF public.crew_vessel_cap('hris.employee_records.contracts_employment.view', p_vessel_id) THEN
    v_tabs := v_tabs || 'employment'::text;
  END IF;
  IF public.crew_vessel_cap('health.personnel_medical.crew_medical_records.view', p_vessel_id) THEN
    v_tabs := v_tabs || 'medical'::text;
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT m.*,
           coalesce(public.crew_position_for(v_company, p_vessel_id, m.position_text),
                    public.crew_position_for(v_company, p_vessel_id, m.rank_text)) AS pid
    FROM public.crew_vessel_members(p_vessel_id, current_date) AS m
  ),
  ranked AS (
    SELECT mb.profile_id AS pid_profile,
           row_number() OVER (ORDER BY coalesce(pm.sort_order, pos.sort_order) NULLS LAST, lower(p.last_name), lower(p.first_name), mb.profile_id) AS n,
           concat_ws(' ', coalesce(nullif(btrim(p.preferred_name), ''), p.first_name), p.last_name) AS display_name
    FROM members AS mb
    JOIN public.profiles AS p ON p.id = mb.profile_id
    LEFT JOIN public.positions AS pos ON pos.id = mb.pid
    LEFT JOIN public.position_manning AS pm ON pm.vessel_id = p_vessel_id AND pm.position_id = mb.pid
    WHERE v_all_members OR mb.profile_id = p_profile_id
  ),
  me AS (
    SELECT r.n FROM ranked AS r WHERE r.pid_profile = p_profile_id
  ),
  subject AS (
    SELECT mb.* FROM members AS mb WHERE mb.profile_id = p_profile_id
  ),
  elsewhere AS (
    -- The person's current assignment on another vessel of the company, if any.
    SELECT nullif(btrim(ca.position), '') AS position_text,
           nullif(btrim(ca.rank), '') AS rank_text,
           nullif(btrim(ca.department), '') AS department_text
    FROM public.crew_assignments AS ca
    JOIN public.vessels AS v ON v.id = ca.vessel_id AND v.company_id = v_company
    WHERE v_profile.user_id IS NOT NULL AND ca.user_id = v_profile.user_id
      AND coalesce(ca.is_current, false)
      AND NOT coalesce(coalesce(ca.leave_date, ca.end_date) <= current_date, false)
    ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
    LIMIT 1
  ),
  titles AS (
    -- On the vessel: the assignment's titles; else the current assignment
    -- elsewhere; else the profile's.
    SELECT coalesce((SELECT s.position_text FROM subject AS s), (SELECT e.position_text FROM elsewhere AS e),
                    nullif(btrim(v_profile.position), ''), nullif(btrim(v_profile.rank), '')) AS position_text,
           coalesce((SELECT s.rank_text FROM subject AS s), (SELECT e.rank_text FROM elsewhere AS e), nullif(btrim(v_profile.rank), '')) AS rank_text,
           coalesce((SELECT s.department_text FROM subject AS s), (SELECT e.department_text FROM elsewhere AS e), nullif(btrim(v_profile.department), '')) AS department_text,
           (SELECT s.pid FROM subject AS s) AS pid
  ),
  resolved AS (
    SELECT t.*,
           coalesce(t.pid, public.crew_position_for(v_company, p_vessel_id, t.position_text), public.crew_position_for(v_company, p_vessel_id, t.rank_text)) AS resolved_pid
    FROM titles AS t
  ),
  transfer AS (
    SELECT CASE WHEN tr.to_vessel_id = p_vessel_id THEN 'transfer_in' ELSE 'transfer_out' END AS direction,
           CASE WHEN tr.to_vessel_id = p_vessel_id THEN tr.from_vessel_id ELSE tr.to_vessel_id END AS other_vessel
    FROM public.crew_transfers AS tr
    WHERE tr.company_id = v_company AND tr.profile_id = p_profile_id AND tr.status = 'scheduled'
      AND (tr.from_vessel_id = p_vessel_id OR tr.to_vessel_id = p_vessel_id)
      AND current_date BETWEEN tr.sign_off_date AND tr.sign_on_date
    ORDER BY tr.sign_on_date, tr.id
    LIMIT 1
  ),
  day_code AS (
    SELECT nullif(upper(btrim(coalesce(e.status_code, ''))), '') AS code
    FROM public.crew_leave_entries AS e
    WHERE v_profile.user_id IS NOT NULL AND e.crew_id = v_profile.user_id AND e.date = current_date AND e.company_id = v_company
    LIMIT 1
  )
  SELECT v_profile.id,
         v_profile.user_id,
         v_profile.first_name,
         v_profile.last_name,
         v_profile.preferred_name,
         v_profile.avatar_url,
         (SELECT d.crew_number FROM public.crew_personal_details AS d WHERE d.profile_id = p_profile_id),
         pos.id,
         pos.name,
         rs.position_text,
         dep.key,
         dep.label,
         pos.rank_tier,
         s.profile_id IS NOT NULL,
         s.placement_kind,
         s.assignment_id,
         s.join_date,
         s.leave_date,
         st.status,
         CASE st.status
           WHEN 'on_transfer' THEN (SELECT x.direction FROM transfer AS x)
           WHEN 'pending' THEN s.placement_kind
           WHEN 'on_leave' THEN 'leave'
           ELSE NULL
         END,
         CASE WHEN st.status = 'on_transfer' THEN (SELECT x.other_vessel FROM transfer AS x) ELSE NULL END,
         CASE WHEN s.profile_id IS NOT NULL THEN (SELECT dc.code FROM day_code AS dc) ELSE NULL END,
         CASE
           WHEN v_profile.user_id IS NULL THEN 'pending_login'
           WHEN lower(btrim(coalesce(v_profile.account_status, ''))) IN ('disabled', 'deactivated') THEN 'disabled'
           ELSE 'active'
         END,
         prev.pid_profile,
         prev.display_name,
         nxt.pid_profile,
         nxt.display_name,
         (SELECT me.n::integer FROM me),
         CASE WHEN EXISTS (SELECT 1 FROM me) THEN (SELECT count(*)::integer FROM ranked) ELSE NULL END,
         v_own,
         v_editor,
         v_own OR v_editor,
         v_tabs
  FROM resolved AS rs
  LEFT JOIN subject AS s ON true
  LEFT JOIN public.positions AS pos ON pos.id = rs.resolved_pid
  LEFT JOIN LATERAL (
    SELECT d.key, d.label
    FROM public.departments AS d
    WHERE d.key = pos.department_key
       OR (pos.department_key IS NULL AND d.is_active
           AND (d.key = public.record_normalise_office(rs.department_text)
                OR public.record_normalise_office(d.label) = public.record_normalise_office(rs.department_text)))
    ORDER BY (d.key = pos.department_key) DESC NULLS LAST, d.sort_order
    LIMIT 1
  ) AS dep ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN s.profile_id IS NULL THEN NULL
                ELSE public.crew_status_decide(EXISTS (SELECT 1 FROM transfer), s.placement_kind, (SELECT dc.code FROM day_code AS dc), NULL)
           END AS status
  ) AS st ON true
  LEFT JOIN ranked AS prev ON prev.n = (SELECT me.n - 1 FROM me)
  LEFT JOIN ranked AS nxt ON nxt.n = (SELECT me.n + 1 FROM me);
END;
$$;

-- Saves personal details (gap/04 C17, C20, C21): a payload of
-- crew_personal_field_groups() keys. The person may change their self
-- fields (contact, address, phones, height, weight, marital status,
-- children, biography); identity fields need an editor
-- (crew_profile_can_edit: hr_can_edit or crew_profiles.edit on a vessel of
-- the person's structural set). P0002 profile_not_found unless the caller
-- may see the person; 42501 crew_identity_locked / crew_profile_edit_refused
-- with a sentence; 22023 field_unknown, field_invalid, crew_number_taken,
-- country_unknown, nothing_to_save. Returns the row.
CREATE OR REPLACE FUNCTION public.crew_personal_details_save(p_profile_id uuid, p_payload jsonb)
RETURNS public.crew_personal_details
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_own boolean;
  v_editor boolean;
  v_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT public.crew_profile_visible(p_profile_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid', DETAIL = 'The details could not be read.';
  END IF;
  IF p_payload = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'nothing_to_save', DETAIL = 'There is nothing to save.';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.crew_personal_field_groups() AS g WHERE g.field = v_key) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_unknown', DETAIL = format('There is no field called "%s".', v_key), HINT = v_key;
    END IF;
  END LOOP;
  v_own := p_profile_id = public.my_profile_id();
  v_editor := public.crew_profile_can_edit(p_profile_id);
  IF EXISTS (SELECT 1 FROM public.crew_personal_field_groups() AS g WHERE g.field_group = 'identity' AND p_payload ? g.field)
     AND NOT v_editor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_identity_locked',
      DETAIL = 'Only HR or a crew editor of this person''s vessel can change names, dates of birth, nationalities and crew numbers.';
  END IF;
  IF NOT (v_own OR v_editor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_profile_edit_refused',
      DETAIL = 'You can change your own contact details. Changing someone else''s needs crew editing rights on their vessel.';
  END IF;
  RETURN public.crew_personal_details_apply(p_profile_id, p_payload, v_uid, false);
END;
$$;

-- Replaces a person's languages (gap/04 C17) in one go: p_rows is an array
-- of at most four {slot, language_code, proficiency}: slot 1 the mother
-- tongue (no proficiency), slots 2-4 with one of basic, conversational,
-- advanced, fluent; slots and languages distinct; a mother tongue whenever
-- any language is given; [] clears them. Gate as the self fields of
-- crew_personal_details_save (the person or an editor). 22023
-- languages_invalid, too_many_languages, mother_tongue_required,
-- proficiency_required, language_unknown, field_unknown. Returns the rows.
CREATE OR REPLACE FUNCTION public.crew_languages_save(p_profile_id uuid, p_rows jsonb)
RETURNS SETOF public.crew_languages
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_row jsonb;
  v_key text;
  v_slot integer;
  v_code text;
  v_prof text;
  v_slots integer[] := ARRAY[]::integer[];
  v_codes text[] := ARRAY[]::text[];
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_signed_in', DETAIL = 'Sign in to continue.';
  END IF;
  IF NOT public.crew_profile_visible(p_profile_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'profile_not_found', DETAIL = 'This crew member could not be found.';
  END IF;
  IF NOT (p_profile_id = public.my_profile_id() OR public.crew_profile_can_edit(p_profile_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_profile_edit_refused',
      DETAIL = 'You can change your own languages. Changing someone else''s needs crew editing rights on their vessel.';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'languages_invalid', DETAIL = 'The languages could not be read.';
  END IF;
  IF jsonb_array_length(p_rows) > 4 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'too_many_languages', DETAIL = 'Record up to four languages.';
  END IF;
  SELECT p.company_id INTO v_company FROM public.profiles AS p WHERE p.id = p_profile_id FOR UPDATE;

  -- Validate every row before writing anything.
  FOR v_row IN SELECT e FROM jsonb_array_elements(p_rows) AS e LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'languages_invalid', DETAIL = 'The languages could not be read.';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_row) LOOP
      IF v_key NOT IN ('slot', 'language_code', 'proficiency') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_unknown', DETAIL = format('There is no field called "%s".', v_key), HINT = v_key;
      END IF;
    END LOOP;
    IF coalesce(jsonb_typeof(v_row -> 'slot'), '') <> 'number' OR coalesce(v_row ->> 'slot', '') !~ '^[1-4]$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'languages_invalid', DETAIL = 'Each language needs a place from 1 to 4.';
    END IF;
    v_slot := (v_row ->> 'slot')::integer;
    v_code := lower(btrim(coalesce(v_row ->> 'language_code', '')));
    v_prof := nullif(btrim(coalesce(v_row ->> 'proficiency', '')), '');
    IF v_code = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'languages_invalid', DETAIL = 'Choose a language for each row.', HINT = format('slot_%s', v_slot);
    END IF;
    IF v_slot = ANY (v_slots) OR v_code = ANY (v_codes) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'languages_invalid', DETAIL = 'Each language can be listed once.', HINT = format('slot_%s', v_slot);
    END IF;
    IF v_slot = 1 AND v_prof IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'languages_invalid', DETAIL = 'The mother tongue has no proficiency level.', HINT = 'slot_1';
    END IF;
    IF v_slot > 1 AND (v_prof IS NULL OR v_prof NOT IN ('basic', 'conversational', 'advanced', 'fluent')) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'proficiency_required', DETAIL = 'Choose how well they speak each further language.', HINT = format('slot_%s', v_slot);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ref_languages AS l WHERE l.code = v_code AND l.is_active) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'language_unknown', DETAIL = 'Choose a language from the list.', HINT = format('slot_%s', v_slot);
    END IF;
    v_slots := v_slots || v_slot;
    v_codes := v_codes || v_code;
  END LOOP;
  IF cardinality(v_slots) > 0 AND NOT (1 = ANY (v_slots)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'mother_tongue_required', DETAIL = 'Start with the mother tongue.', HINT = 'slot_1';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_array(l.slot, l.language_code, l.proficiency) ORDER BY l.slot), '[]'::jsonb) INTO v_before
  FROM public.crew_languages AS l WHERE l.profile_id = p_profile_id;
  DELETE FROM public.crew_languages AS l WHERE l.profile_id = p_profile_id;
  INSERT INTO public.crew_languages (company_id, profile_id, slot, language_code, proficiency, created_by, updated_by)
  SELECT v_company, p_profile_id, (e ->> 'slot')::integer, lower(btrim(e ->> 'language_code')),
         CASE WHEN (e ->> 'slot')::integer = 1 THEN NULL ELSE nullif(btrim(coalesce(e ->> 'proficiency', '')), '') END,
         v_uid, v_uid
  FROM jsonb_array_elements(p_rows) AS e;
  SELECT coalesce(jsonb_agg(jsonb_build_array(l.slot, l.language_code, l.proficiency) ORDER BY l.slot), '[]'::jsonb) INTO v_after
  FROM public.crew_languages AS l WHERE l.profile_id = p_profile_id;
  IF v_before IS DISTINCT FROM v_after THEN
    INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_user_id, changed_fields, new_values)
    VALUES ('crew_profile', p_profile_id, 'UPDATE', v_uid, '["languages"]'::jsonb, jsonb_build_object('via', 'crew_languages'));
  END IF;
  RETURN QUERY SELECT l.* FROM public.crew_languages AS l WHERE l.profile_id = p_profile_id ORDER BY l.slot;
END;
$$;

-- Add Crew's second step (X1-03B; gap/04 W1): stores the employment terms
-- of a person on the vessel's crew and fills their personal details. Gate:
-- vessel.crew.crew_profiles.create on the vessel (crew_vessel_gate: P0002
-- unknown vessel, 42501), no external viewer; the profile must be of the
-- vessel's company and on its crew (a current assignment on it, or the
-- pending placement imported to it; 42501 crew_onboarding_refused). p_terms
-- keys: start_date (required), position_id, department_key,
-- date_joining_vessel, review_date, contract_type_key, leave_method,
-- leave_days_per_year, leave_ratio_on, leave_ratio_off,
-- place_of_embarkation; the end fields are the employment slices'. One row
-- per person, vessel and start date (a second save updates it).
-- assignment_id links the current assignment when there is one (advisory,
-- D-X1-2). p_personal (optional) is a crew_personal_details_save payload;
-- a creator who is not an editor fills blanks only. Returns the terms row.
CREATE OR REPLACE FUNCTION public.crew_onboarding_save(p_profile_id uuid, p_vessel_id uuid, p_terms jsonb, p_personal jsonb DEFAULT NULL)
RETURNS public.crew_assignment_terms
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_profile public.profiles;
  v_assignment uuid;
  v_key text;
  v_start date;
  v_joining date;
  v_review date;
  v_position uuid;
  v_department text;
  v_contract text;
  v_method text;
  v_days numeric;
  v_on integer;
  v_off integer;
  v_port text;
  v_row public.crew_assignment_terms;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_profiles.create', p_vessel_id, 'You can''t add crew to this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t add crew to this vessel.';
  END IF;
  SELECT * INTO v_profile FROM public.profiles AS p WHERE p.id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_profile.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_onboarding_refused', DETAIL = 'This person is not on this vessel''s crew.';
  END IF;
  SELECT ca.id INTO v_assignment
  FROM public.crew_assignments AS ca
  WHERE v_profile.user_id IS NOT NULL AND ca.user_id = v_profile.user_id AND ca.vessel_id = p_vessel_id
    AND coalesce(ca.is_current, false)
    AND NOT coalesce(coalesce(ca.leave_date, ca.end_date) <= current_date, false)
  ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
  LIMIT 1;
  IF v_assignment IS NULL AND NOT (coalesce(v_profile.is_imported, false) AND v_profile.imported_vessel_id = p_vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_onboarding_refused', DETAIL = 'This person is not on this vessel''s crew.';
  END IF;

  IF p_terms IS NULL OR jsonb_typeof(p_terms) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payload_invalid', DETAIL = 'The employment details could not be read.';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_terms) LOOP
    IF v_key NOT IN ('start_date', 'position_id', 'department_key', 'date_joining_vessel', 'review_date', 'contract_type_key',
                     'leave_method', 'leave_days_per_year', 'leave_ratio_on', 'leave_ratio_off', 'place_of_embarkation') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_unknown', DETAIL = format('There is no field called "%s".', v_key), HINT = v_key;
    END IF;
  END LOOP;
  BEGIN
    v_start := nullif(btrim(coalesce(p_terms ->> 'start_date', '')), '')::date;
    v_joining := nullif(btrim(coalesce(p_terms ->> 'date_joining_vessel', '')), '')::date;
    v_review := nullif(btrim(coalesce(p_terms ->> 'review_date', '')), '')::date;
    v_position := nullif(btrim(coalesce(p_terms ->> 'position_id', '')), '')::uuid;
    v_days := nullif(btrim(coalesce(p_terms ->> 'leave_days_per_year', '')), '')::numeric;
    v_on := nullif(btrim(coalesce(p_terms ->> 'leave_ratio_on', '')), '')::integer;
    v_off := nullif(btrim(coalesce(p_terms ->> 'leave_ratio_off', '')), '')::integer;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
                 OR numeric_value_out_of_range OR data_exception THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'One of the values could not be read. Check the dates and numbers.';
  END;
  v_department := nullif(lower(btrim(coalesce(p_terms ->> 'department_key', ''))), '');
  v_contract := nullif(lower(btrim(coalesce(p_terms ->> 'contract_type_key', ''))), '');
  v_method := nullif(btrim(coalesce(p_terms ->> 'leave_method', '')), '');
  v_port := nullif(btrim(coalesce(p_terms ->> 'place_of_embarkation', '')), '');
  IF v_start IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'start_date_required', DETAIL = 'Enter the start date.', HINT = 'start_date';
  END IF;
  IF v_joining IS NOT NULL AND v_joining < v_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'The date joining the vessel cannot be before the start date.', HINT = 'date_joining_vessel';
  END IF;
  IF v_review IS NOT NULL AND v_review < v_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'The review date cannot be before the start date.', HINT = 'review_date';
  END IF;
  IF v_position IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.positions AS pos
    WHERE pos.id = v_position AND pos.is_active
      AND (pos.company_id IS NULL OR pos.company_id = v_company)
      AND (pos.vessel_id IS NULL OR pos.vessel_id = p_vessel_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'position_unknown', DETAIL = 'Choose a position from this vessel''s list.', HINT = 'position_id';
  END IF;
  IF v_department IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments AS d WHERE d.key = v_department AND d.is_active) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'department_unknown', DETAIL = 'Choose a department from the list.', HINT = 'department_key';
  END IF;
  IF v_contract IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_types AS ct
    WHERE ct.key = v_contract AND ct.is_active AND (ct.company_id IS NULL OR ct.company_id = v_company)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'contract_type_unknown', DETAIL = 'Choose a contract type from the list.', HINT = 'contract_type_key';
  END IF;
  IF v_method IS NOT NULL AND v_method NOT IN ('days_per_year', 'ratio', 'none') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'Choose how leave is earned: days a year, a ratio or none.', HINT = 'leave_method';
  END IF;
  IF (v_method = 'days_per_year' AND (v_days IS NULL OR v_on IS NOT NULL OR v_off IS NOT NULL))
     OR (v_method = 'ratio' AND (v_on IS NULL OR v_off IS NULL OR v_days IS NOT NULL))
     OR (coalesce(v_method, 'none') = 'none' AND (v_days IS NOT NULL OR v_on IS NOT NULL OR v_off IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'leave_allowance_invalid',
      DETAIL = 'Give days a year for that method, both parts of a ratio for a ratio, and nothing for none.', HINT = 'leave_method';
  END IF;

  BEGIN
    INSERT INTO public.crew_assignment_terms AS t (
      company_id, profile_id, vessel_id, assignment_id, position_id, department_key, start_date, date_joining_vessel,
      review_date, contract_type_key, leave_method, leave_days_per_year, leave_ratio_on, leave_ratio_off,
      place_of_embarkation, created_by, updated_by
    ) VALUES (
      v_company, p_profile_id, p_vessel_id, v_assignment, v_position, v_department, v_start, v_joining,
      v_review, v_contract, v_method, v_days, v_on, v_off, v_port, v_uid, v_uid
    )
    ON CONFLICT (profile_id, vessel_id, start_date) DO UPDATE SET
      assignment_id = coalesce(EXCLUDED.assignment_id, t.assignment_id),
      position_id = EXCLUDED.position_id,
      department_key = EXCLUDED.department_key,
      date_joining_vessel = EXCLUDED.date_joining_vessel,
      review_date = EXCLUDED.review_date,
      contract_type_key = EXCLUDED.contract_type_key,
      leave_method = EXCLUDED.leave_method,
      leave_days_per_year = EXCLUDED.leave_days_per_year,
      leave_ratio_on = EXCLUDED.leave_ratio_on,
      leave_ratio_off = EXCLUDED.leave_ratio_off,
      place_of_embarkation = EXCLUDED.place_of_embarkation,
      updated_by = EXCLUDED.updated_by
    RETURNING t.* INTO v_row;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'field_invalid', DETAIL = 'One of the employment details is not allowed. Check the dates and the leave allowance.';
  END;

  IF p_personal IS NOT NULL AND p_personal <> '{}'::jsonb THEN
    PERFORM public.crew_personal_details_apply(p_profile_id, p_personal, v_uid, NOT public.crew_profile_can_edit(p_profile_id));
  END IF;
  RETURN v_row;
END;
$$;

-- Possible duplicates before Add Crew saves (gap/04 W1): people of the
-- caller's company with the same email (match 'email'), or the same first
-- and last name (case and spaces ignored) with the same date of birth
-- ('name_dob') or, when no date of birth is given or recorded, the name
-- alone ('name'); with the vessel they are on (current assignment, else
-- pending placement), if any. Gate as Add Crew: crew_profiles.create on
-- the vessel, no external viewer. At most 20 rows, strongest match first.
CREATE OR REPLACE FUNCTION public.crew_find_duplicates(p_vessel_id uuid, p_email text, p_first text, p_last text, p_dob date DEFAULT NULL)
RETURNS TABLE (
  profile_id uuid,
  first_name text,
  last_name text,
  vessel_id uuid,
  vessel_name text,
  match_kind text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_first text := nullif(lower(regexp_replace(btrim(coalesce(p_first, '')), '\s+', ' ', 'g')), '');
  v_last text := nullif(lower(regexp_replace(btrim(coalesce(p_last, '')), '\s+', ' ', 'g')), '');
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_profiles.create', p_vessel_id, 'You can''t add crew to this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t add crew to this vessel.';
  END IF;
  IF v_email IS NULL AND (v_first IS NULL OR v_last IS NULL) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT p.id, p.first_name, p.last_name,
           CASE
             WHEN v_email IS NOT NULL AND lower(btrim(p.email)) = v_email THEN 'email'
             WHEN p_dob IS NOT NULL AND coalesce(d.date_of_birth, p.date_of_birth) = p_dob THEN 'name_dob'
             ELSE 'name'
           END AS match_kind
    FROM public.profiles AS p
    LEFT JOIN public.crew_personal_details AS d ON d.profile_id = p.id
    WHERE p.company_id = v_company
      AND (
        (v_email IS NOT NULL AND lower(btrim(p.email)) = v_email)
        OR (v_first IS NOT NULL AND v_last IS NOT NULL
            AND lower(regexp_replace(btrim(p.first_name), '\s+', ' ', 'g')) = v_first
            AND lower(regexp_replace(btrim(p.last_name), '\s+', ' ', 'g')) = v_last
            AND (p_dob IS NULL OR coalesce(d.date_of_birth, p.date_of_birth) IS NULL OR coalesce(d.date_of_birth, p.date_of_birth) = p_dob))
      )
  )
  SELECT c.id, c.first_name, c.last_name, sv.vessel_id, v.name, c.match_kind
  FROM candidates AS c
  LEFT JOIN LATERAL (
    SELECT s.vessel_id FROM public.crew_profile_structural_vessels(c.id) AS s(vessel_id) ORDER BY s.vessel_id LIMIT 1
  ) AS sv ON true
  LEFT JOIN public.vessels AS v ON v.id = sv.vessel_id
  ORDER BY CASE c.match_kind WHEN 'email' THEN 0 WHEN 'name_dob' THEN 1 ELSE 2 END, lower(c.last_name), lower(c.first_name), c.id
  LIMIT 20;
END;
$$;

-- ---------------------------------------------------------------- backfill (service role; the seed)

-- One crew_personal_details row per profile with something to carry over
-- from profiles (see the header). Idempotent: an existing row is never
-- touched. Returns the rows added.
CREATE OR REPLACE FUNCTION public.crew_profile_details_backfill()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH src AS (
    SELECT p.id AS profile_id,
           p.company_id,
           CASE WHEN p.date_of_birth BETWEEN DATE '1900-01-01' AND current_date THEN p.date_of_birth END AS date_of_birth,
           nullif(left(btrim(coalesce(p.place_of_birth, '')), 120), '') AS place_of_birth,
           public.crew_country_from_text(p.nationality) AS nationality_code,
           CASE lower(btrim(coalesce(p.gender, '')))
             WHEN 'male' THEN 'male' WHEN 'm' THEN 'male'
             WHEN 'female' THEN 'female' WHEN 'f' THEN 'female'
             WHEN 'other' THEN 'other'
           END AS sex,
           nullif(left(btrim(coalesce(p.embarkation_port, '')), 120), '') AS place_of_embarkation,
           ph.dial_code AS phone_dial_code,
           ph.national_number AS phone_number
    FROM public.profiles AS p
    LEFT JOIN LATERAL public.crew_phone_split(p.phone) AS ph ON true
    WHERE p.company_id IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.crew_personal_details (
      profile_id, company_id, date_of_birth, place_of_birth, nationality_code, sex, place_of_embarkation, phone_dial_code, phone_number
    )
    SELECT s.profile_id, s.company_id, s.date_of_birth, s.place_of_birth, s.nationality_code, s.sex, s.place_of_embarkation,
           s.phone_dial_code, s.phone_number
    FROM src AS s
    WHERE coalesce(s.date_of_birth::text, s.place_of_birth, s.nationality_code, s.sex, s.place_of_embarkation, s.phone_number) IS NOT NULL
    ON CONFLICT (profile_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM ins;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.crew_personal_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_assignment_terms ENABLE ROW LEVEL SECURITY;

-- The person and the people who may see them (crew_visible_profile_ids,
-- hoisted once per statement, D-229).
DROP POLICY IF EXISTS crew_personal_details_select_visible ON public.crew_personal_details;
CREATE POLICY crew_personal_details_select_visible ON public.crew_personal_details
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company((SELECT auth.uid()), company_id)
    AND profile_id IN (SELECT public.crew_visible_profile_ids())
  );

DROP POLICY IF EXISTS crew_languages_select_visible ON public.crew_languages;
CREATE POLICY crew_languages_select_visible ON public.crew_languages
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company((SELECT auth.uid()), company_id)
    AND profile_id IN (SELECT public.crew_visible_profile_ids())
  );

-- Terms are vessel data: the person's own rows; else crew_profiles.view on
-- the vessel (reach included) or a legacy HR viewer; never an external
-- viewer (but their own rows).
DROP POLICY IF EXISTS crew_assignment_terms_select_scoped ON public.crew_assignment_terms;
CREATE POLICY crew_assignment_terms_select_scoped ON public.crew_assignment_terms
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company((SELECT auth.uid()), company_id)
    AND (
      profile_id = (SELECT public.my_profile_id())
      OR (
        NOT (SELECT public.crew_caller_is_external())
        AND (
          vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_profiles.view'))
          OR (SELECT public.hr_can_view((SELECT auth.uid())))
        )
      )
    )
  );

-- ---------------------------------------------------------------- grants

-- Reads only for the browser (writes go through the definers); nothing for anon.
REVOKE ALL ON TABLE public.crew_personal_details, public.crew_languages, public.crew_assignment_terms FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crew_personal_details, public.crew_languages, public.crew_assignment_terms TO authenticated;
GRANT ALL ON TABLE public.crew_personal_details, public.crew_languages, public.crew_assignment_terms TO service_role;

-- Trigger functions: nobody calls them.
REVOKE ALL ON FUNCTION public.crew_personal_details_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_languages_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_assignment_terms_scope_guard() FROM PUBLIC, anon, authenticated, service_role;

-- The visibility helpers the policies call, and the RPCs.
REVOKE ALL ON FUNCTION public.crew_profile_visible(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_profile_visible(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_visible_profile_ids() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_visible_profile_ids() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_profile_resolve(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_profile_resolve(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_profile_summary(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_profile_summary(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_personal_details_save(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_personal_details_save(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_languages_save(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_languages_save(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_onboarding_save(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_onboarding_save(uuid, uuid, jsonb, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_find_duplicates(uuid, text, text, text, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_find_duplicates(uuid, text, text, text, date) TO authenticated, service_role;

-- Internal: definers (and the service role) only.
REVOKE ALL ON FUNCTION public.crew_profile_structural_vessels(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_profile_structural_vessels(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_profile_can_edit(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_profile_can_edit(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crew_personal_field_groups() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_personal_field_groups() TO service_role;
REVOKE ALL ON FUNCTION public.crew_personal_details_apply(uuid, jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_personal_details_apply(uuid, jsonb, uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.crew_phone_split(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_phone_split(text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_country_from_text(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_country_from_text(text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_profile_details_backfill() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_profile_details_backfill() TO service_role;

COMMENT ON FUNCTION public.crew_profile_visible(uuid) IS 'X1 profile visibility (X1 spec §3): an active caller of the person''s company who is the person, or (not an external viewer) a legacy HR viewer, or a holder of vessel.crew.crew_profiles.view on a vessel of the person''s structural set (current or planned assignment, or pending placement). False without a JWT, for an inactive caller, an unknown or foreign profile.';
COMMENT ON FUNCTION public.crew_visible_profile_ids() IS 'X1 caller-only set (D-229): every profile crew_profile_visible() answers true for, once per statement. Policies use profile_id IN (SELECT public.crew_visible_profile_ids()). Empty without a JWT or for an inactive caller; only their own for an external viewer.';
COMMENT ON FUNCTION public.crew_profile_structural_vessels(uuid) IS 'Internal: the vessels of a person''s structural set: current and planned assignments (D-227 at today) and the pending placement (no current assignment for the login), each of the person''s own company (D-246).';
COMMENT ON FUNCTION public.crew_profile_can_edit(uuid) IS 'Internal: the caller may change the person''s identity fields: an active caller of the person''s company, not an external viewer, holding hr_can_edit or vessel.crew.crew_profiles.edit on a vessel of the person''s structural set.';
COMMENT ON FUNCTION public.crew_personal_field_groups() IS 'The personal-details fields a payload may carry, with their group (identity: an editor; self: the person or an editor) and where they are stored (profiles for the names). Mirrored by PERSONAL_FIELD_GROUP in src/modules/crew/lib/personalDetailsSchema.ts.';
COMMENT ON FUNCTION public.crew_personal_details_apply(uuid, jsonb, uuid, boolean) IS 'Internal writer of crew_personal_details_save() and crew_onboarding_save(): merges a payload into the person''s row (and the names into profiles), normalised; 22023 with a DETAIL sentence and the field in HINT; fill-only callers may not overwrite a recorded identity field (42501 crew_identity_locked). One audit_logs row with the changed field names.';
COMMENT ON FUNCTION public.crew_phone_split(text) IS 'Internal, pure over ref_countries: a legacy phone text as (dial code, national digits) by the longest known dial code after + or 00; a national number without a code; no row when unreadable. Mirrored by splitLegacyPhone() in src/modules/crew/lib/phone.ts.';
COMMENT ON FUNCTION public.crew_country_from_text(text) IS 'Internal: a free-text nationality or country to its ISO alpha-2 code by name, sort name, demonym, alpha-2 / alpha-3 code or a few common spellings; NULL when none or more than one matches.';
COMMENT ON FUNCTION public.crew_profile_details_backfill() IS 'Seed (service role, idempotent): a crew_personal_details row per profile with something to carry over (date and place of birth, phone split, nationality code, sex, embarkation port). Never touches an existing row. Returns the rows added.';
COMMENT ON FUNCTION public.crew_profile_resolve(uuid, uuid) IS 'The profiles.id behind a profile URL (D-X1-19): a profiles.id or a legacy login id, answered only for a person the caller may see (crew_profile_visible); P0002 profile_not_found otherwise (no id mapping leaks), P0002 vessel_not_found for a vessel outside the caller''s company.';
COMMENT ON FUNCTION public.crew_profile_summary(uuid, uuid) IS 'The crew profile header (gap/04 C16): names, crew number, position and department, status on the vessel today, login state, previous and next person in the vessel''s rank order among those the caller may see, the caller''s rights (own, can_edit identity, can_edit_self) and the tabs the caller may open (X1 spec §4). P0002 unless the caller may see the person and the vessel is the caller''s company''s.';
COMMENT ON FUNCTION public.crew_personal_details_save(uuid, jsonb) IS 'Saves personal details (gap/04 C17, C20, C21): self fields by the person or an editor, identity fields (names, title, sex, birth, nationalities, residency, work email, crew number, embarkation) by an editor only (hr_can_edit or crew_profiles.edit on a structural vessel). Unknown keys refused (22023 field_unknown). Returns the row.';
COMMENT ON FUNCTION public.crew_languages_save(uuid, jsonb) IS 'Replaces a person''s languages atomically (gap/04 C17): up to four, slot 1 the mother tongue, slots 2-4 with a proficiency. Gate: the person or an editor. Returns the rows.';
COMMENT ON FUNCTION public.crew_onboarding_save(uuid, uuid, jsonb, jsonb) IS 'Add Crew''s second step (X1-03B; gap/04 W1): stores the employment terms of a person on the vessel''s crew (current assignment or pending placement of the caller''s company) and fills their personal details (blanks only for a non-editor). Gate: vessel.crew.crew_profiles.create on the vessel, no external viewer. assignment_id is an advisory link (D-X1-2). Returns the terms row.';
COMMENT ON FUNCTION public.crew_find_duplicates(uuid, text, text, text, date) IS 'Possible duplicates before Add Crew saves (gap/04 W1): people of the caller''s company with the same email, or the same name (and date of birth when both are known), with the vessel they are on. Gate: vessel.crew.crew_profiles.create on the vessel, no external viewer.';
COMMENT ON FUNCTION public.crew_personal_details_scope_guard() IS 'Trigger crew_personal_details_scope_guard (every writer): the row names a person of its own company (23514 crew_profile_scope_mismatch).';
COMMENT ON FUNCTION public.crew_languages_scope_guard() IS 'Trigger crew_languages_scope_guard (every writer): the row names a person of its own company (23514 crew_profile_scope_mismatch).';
COMMENT ON FUNCTION public.crew_assignment_terms_scope_guard() IS 'Trigger crew_assignment_terms_scope_guard (every writer): person and vessel of the row''s company, a position the vessel can see, and a linked assignment that is the person''s on that vessel (23514 crew_terms_scope_mismatch).';

-- ---------------------------------------------------------------- seed

SELECT public.crew_profile_details_backfill();
