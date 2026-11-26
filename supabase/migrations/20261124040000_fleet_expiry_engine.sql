-- =================================================================
-- FLEET OPERATIONS X5-01A: the expiry engine and the fleet access helpers
-- (gap/02 X2, X3; DECISIONS C5, D-31, D-55, D-120, D-123; X5 spec §2
-- X5-01A, D-X5-01, D-X5-02, D-X5-09, D-X5-21, D-X5-22)
-- Tables: expiry_window_rules (per-company warning windows), expiry_sources
--   (the service-only registry of expiry source views)
-- Views: expiry_src_vessel_certificates, expiry_src_insurance_policies,
--   expiry_src_crew_certificates, expiry_src_profile_identity,
--   expiry_src_work_authorisations, expiry_src_training_records,
--   expiry_src_medical_fitness, expiry_src_crew_contracts (definers only)
-- Functions (browser): expiry_days_remaining, expiry_bucket,
--   expiry_endorsement_state, expiry_default_window, expiry_window_for,
--   set_expiry_window_rule, clear_expiry_window_rule, fleet_ops_can,
--   fleet_expiry_items, fleet_expiry_summary
-- Functions (service role; definers): fleet_ops_can_for,
--   fleet_counted_vessels_for, fleet_current_crew, fleet_hod_covers,
--   fleet_expiry_rows_for
-- TS mirrors: src/lib/records/expiry.ts (expiry_bucket; the EXP1 table in
--   src/test/lib/records/expiry.test.ts is the shared fixture),
--   src/modules/fleet/lib/expiryWindows.ts (expiry_default_window,
--   expiry_window_for), src/modules/fleet/lib/endorsement.ts
--   (expiry_endorsement_state), src/modules/fleet/lib/fleetOpsAccess.ts
--   (fleet_ops_can's area rules, pinned against the useCan adaptor)
-- =================================================================
--
-- One expiry engine for the whole fleet (gap/02 X2). Every expiring item
-- (vessel certificates, insurance, crew documents and qualifications,
-- passports and visas, work authorisations, medical fitness, contracts)
-- reaches the fleet through a source view with one fixed column contract,
-- listed in the registry expiry_sources (D-X5-01):
--
--   source_key text, item_type text, record_id uuid, company_id uuid,
--   vessel_id uuid NULL, profile_id uuid NULL, label text, detail text,
--   certificate_type_id uuid NULL, expires_on date NULL, no_expiry boolean,
--   endorsement_due_on date NULL, alerts_muted boolean,
--   link_scope text ('vessel' | 'fleet' | 'workspace'), link_rel text
--
-- link_rel is relative to the scope root with no leading slash (a vessel
-- page under /v/<code>/, a fleet page under /fleet/; for 'workspace' its
-- first segment names the workspace, hris or health). Crew rows take their
-- vessel from fleet_current_crew() (one vessel per person: the vessel they
-- are on, else the one they are joining; NULL when they have no current
-- vessel). A source view is read only by the definers below: no grant to
-- the browser. fleet_expiry_items() unions the active registry rows whose
-- view name passes the name pattern again and exists (to_regclass), quoted
-- with format('%I'), so a later stream adds its source as a registry row
-- plus its own view and deactivates the legacy rows it replaces; nobody
-- redefines a function of this file (D-120). X1 (block 06) adds
-- expiry_src_crew_documents and sets crew_certificates_legacy and
-- profile_identity_legacy inactive (X5 spec §0.3 agreement 2).
--
-- Buckets (C5, D-31) are window-relative: expired, expiring_soon (30 days
-- or fewer, never earlier than the window), expiring (inside the window),
-- valid, no_expiry. An item is valid through its expiry date: on that day
-- it is expiring_soon with 0 days left. Windows come only from
-- expiry_window_rules: a rule for the item's certificate_type_id (under its
-- item type) wins over the item type's rule, else the default (passport
-- 270, everything else 90).
--
-- FROZEN at the X5-01A merge (X1-04 builds on them; X5 spec §6 risk 1):
--   expiry_bucket(date, integer, date, boolean DEFAULT false) RETURNS text
--   expiry_window_for(uuid, text, uuid DEFAULT NULL) RETURNS integer
--   expiry_endorsement_state(date, date, integer DEFAULT 30) RETURNS text
--   fleet_current_crew(uuid[]) and its columns
--   the item types: vessel_certificate, insurance_policy, passport, visa,
--     crew_document, crew_qualification, medical, vaccination,
--     work_authorisation, contract, training_course
--   the source-view column contract above
--
-- Fleet access (D-X5-21): fleet_ops_can(company, vessel, area, level) is
-- false for an inactive caller and outside the company; with a vessel, the
-- vessel must be in the company and reached (reach_vessel_for or fleet
-- reach); with no vessel (fleet-level data) the caller needs fleet reach in
-- the company. Then legacy full access (legacy dpa / shore_management, RBAC
-- superadmin / dpa) answers true; otherwise the area's rule, which is the
-- rule the client adaptor uses for the same data (D-04;
-- src/modules/fleet/lib/fleetOpsAccess.ts pins each against it). An
-- external viewer (D-123) never passes edit or admin.
--
-- Counted vessels (gap/02 X3, §7.13; D-X5-09, D-X5-22): NULL vessel ids
-- mean every counted vessel the caller reaches (is_counted, lifecycle
-- active, a set status other than Sold); explicit ids are reach-checked,
-- not counted-filtered, and an archived or foreign id is refused (42501
-- vessel_out_of_reach), so the vessel home of an uncounted vessel works.
--
-- Nothing here is live (D-01): the client reads every object through the
-- pending shim (src/modules/fleet/types/db.pending.ts) and degrades while
-- it is missing. Applying it changes nothing users see today: no live
-- table, policy or function is touched.
--
-- Idempotent (D-12, D-55).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.account_memberships') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.crew_assignment_is_current(boolean,date,date)') IS NULL
     OR to_regprocedure('public.vessel_in_reachable_state(text,text)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR to_regprocedure('public.user_belongs_to_company(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040000_fleet_expiry_engine needs account_memberships, the reach helpers and crew_assignment_is_current(): apply 20261123000300_platform_account_memberships.sql and 20261123010000_platform_user_status.sql first';
  END IF;
  IF to_regprocedure('public.record_is_master(uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_user_is_external(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040000_fleet_expiry_engine needs record_is_master() and record_user_is_external(): apply the record engine (20261123020000, 20261123020100) first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessels' AND column_name = 'is_counted')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vessels' AND column_name = 'lifecycle_status') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040000_fleet_expiry_engine needs vessels.is_counted and vessels.lifecycle_status: apply 20261123000100_platform_vessel_tenancy.sql first';
  END IF;
  IF to_regprocedure('public.user_has_permission(uuid,text,public.permission_level,uuid)') IS NULL
     OR to_regclass('public.rbac_user_roles') IS NULL OR to_regclass('public.roles') IS NULL OR to_regclass('public.user_roles') IS NULL
     OR to_regprocedure('public.hr_can_view(uuid)') IS NULL OR to_regprocedure('public.hr_can_edit(uuid)') IS NULL OR to_regprocedure('public.hr_can_admin(uuid)') IS NULL
     OR to_regprocedure('public.medical_can_view(uuid)') IS NULL OR to_regprocedure('public.medical_can_edit(uuid)') IS NULL OR to_regprocedure('public.medical_can_admin(uuid)') IS NULL
     OR to_regprocedure('public.med_fitness_can_view(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040000_fleet_expiry_engine needs user_has_permission(uuid,text,permission_level,uuid), the RBAC tables and the hr / medical / fitness helpers';
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040000_fleet_expiry_engine needs public.update_updated_at_column()';
  END IF;
  -- The legacy sources of the eight source views.
  IF to_regclass('public.certificates') IS NULL OR to_regclass('public.insurance_policies') IS NULL
     OR to_regclass('public.crew_certificates') IS NULL OR to_regclass('public.crew_work_authorisations') IS NULL
     OR to_regclass('public.training_records') IS NULL OR to_regclass('public.training_courses') IS NULL
     OR to_regclass('public.med_fitness_assessments') IS NULL OR to_regclass('public.crew_contracts') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'imported_vessel_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'visa_expiry')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'department') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124040000_fleet_expiry_engine needs the live certificate, insurance, crew, HR and medical tables and profiles.imported_vessel_id / visa_expiry, user_roles.department';
  END IF;
END
$$;

-- ---------------------------------------------------------------- expiry_window_rules (C5, D-X5-02)

CREATE TABLE IF NOT EXISTS public.expiry_window_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  -- A type of the item type's catalogue (X3 certificate_types, X1
  -- crew_document_types, training_courses): no FK, those tables arrive in
  -- later blocks or are legacy.
  certificate_type_id uuid NULL,
  warn_days integer NOT NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expiry_window_rules
  DROP CONSTRAINT IF EXISTS expiry_window_rules_item_type_check,
  ADD CONSTRAINT expiry_window_rules_item_type_check CHECK (item_type IN (
    'vessel_certificate', 'insurance_policy', 'passport', 'visa', 'crew_document', 'crew_qualification',
    'medical', 'vaccination', 'work_authorisation', 'contract', 'training_course')),
  DROP CONSTRAINT IF EXISTS expiry_window_rules_warn_days_check,
  ADD CONSTRAINT expiry_window_rules_warn_days_check CHECK (warn_days BETWEEN 0 AND 1095);

-- One rule per item type, and one per type of that item type's catalogue.
CREATE UNIQUE INDEX IF NOT EXISTS expiry_window_rules_item_unique
  ON public.expiry_window_rules (company_id, item_type) WHERE certificate_type_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expiry_window_rules_type_unique
  ON public.expiry_window_rules (company_id, item_type, certificate_type_id) WHERE certificate_type_id IS NOT NULL;

ALTER TABLE public.expiry_window_rules ENABLE ROW LEVEL SECURITY;

-- Read: active members of the row's company (get_user_company_id() is NULL
-- for an inactive caller, D-157), computed once per statement. No browser
-- write policy: set_expiry_window_rule() / clear_expiry_window_rule() only.
DROP POLICY IF EXISTS expiry_window_rules_select ON public.expiry_window_rules;
CREATE POLICY expiry_window_rules_select ON public.expiry_window_rules
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

DROP TRIGGER IF EXISTS trg_expiry_window_rules_updated_at ON public.expiry_window_rules;
CREATE TRIGGER trg_expiry_window_rules_updated_at
  BEFORE UPDATE ON public.expiry_window_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.expiry_window_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.expiry_window_rules TO authenticated;
GRANT ALL ON public.expiry_window_rules TO service_role;

-- ---------------------------------------------------------------- expiry_sources (D-X5-01)

CREATE TABLE IF NOT EXISTS public.expiry_sources (
  source_key text PRIMARY KEY,
  item_type text NOT NULL,
  label text NOT NULL,
  view_name text NOT NULL,
  read_area text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  owner_doc text NOT NULL
);

ALTER TABLE public.expiry_sources
  DROP CONSTRAINT IF EXISTS expiry_sources_source_key_check,
  ADD CONSTRAINT expiry_sources_source_key_check CHECK (source_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  DROP CONSTRAINT IF EXISTS expiry_sources_item_type_check,
  ADD CONSTRAINT expiry_sources_item_type_check CHECK (item_type IN (
    'vessel_certificate', 'insurance_policy', 'passport', 'visa', 'crew_document', 'crew_qualification',
    'medical', 'vaccination', 'work_authorisation', 'contract', 'training_course')),
  DROP CONSTRAINT IF EXISTS expiry_sources_label_check,
  ADD CONSTRAINT expiry_sources_label_check CHECK (btrim(label) <> ''),
  DROP CONSTRAINT IF EXISTS expiry_sources_view_name_check,
  ADD CONSTRAINT expiry_sources_view_name_check CHECK (view_name ~ '^expiry_src_[a-z0-9_]+$'),
  DROP CONSTRAINT IF EXISTS expiry_sources_read_area_check,
  ADD CONSTRAINT expiry_sources_read_area_check CHECK (read_area IN ('certificates', 'crew_documents', 'insurance', 'hr', 'training', 'medical_fitness')),
  DROP CONSTRAINT IF EXISTS expiry_sources_owner_doc_check,
  ADD CONSTRAINT expiry_sources_owner_doc_check CHECK (owner_doc ~ '^gap/[0-9]{2}$');

ALTER TABLE public.expiry_sources ENABLE ROW LEVEL SECURITY;

-- Migrations and the service role write the registry (D-55); the browser
-- reads nothing (the definers below read it as their owner).
DROP POLICY IF EXISTS expiry_sources_service_all ON public.expiry_sources;
CREATE POLICY expiry_sources_service_all ON public.expiry_sources
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.expiry_sources FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.expiry_sources TO service_role;

-- ---------------------------------------------------------------- pure engine (EXP1; TS: src/lib/records/expiry.ts)

-- Days from p_today to the expiry date (negative once expired); NULL with
-- no date.
CREATE OR REPLACE FUNCTION public.expiry_days_remaining(p_expires_on date, p_today date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT p_expires_on - p_today
$$;

-- The bucket (C5, D-31): expired before the date; expiring_soon within
-- least(30, window) days (the expiry day itself: 0 days); expiring within
-- the window; valid after it; no_expiry with no date or p_no_expiry. A NULL
-- window is the default 90; a negative window is refused (22023
-- invalid_window), checked first as the TS engine does.
CREATE OR REPLACE FUNCTION public.expiry_bucket(p_expires_on date, p_window_days integer, p_today date, p_no_expiry boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  v_window integer := coalesce(p_window_days, 90);
  v_days integer;
BEGIN
  IF v_window < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_window', DETAIL = format('window_days must be 0 or more, got %s', v_window);
  END IF;
  IF coalesce(p_no_expiry, false) OR p_expires_on IS NULL THEN
    RETURN 'no_expiry';
  END IF;
  IF p_today IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'today_required';
  END IF;
  v_days := p_expires_on - p_today;
  IF v_days < 0 THEN
    RETURN 'expired';
  ELSIF v_days <= least(30, v_window) THEN
    RETURN 'expiring_soon';
  ELSIF v_days <= v_window THEN
    RETURN 'expiring';
  END IF;
  RETURN 'valid';
END;
$$;

-- Endorsement state of an item with an endorsement due date (gap/06 C5;
-- TS: src/modules/fleet/lib/endorsement.ts): 'overdue' once the due date
-- has passed, 'due' from p_window_days before it through the due date
-- itself, else NULL (also with no due date). A NULL window is 30; a
-- negative window is refused (22023 invalid_window).
CREATE OR REPLACE FUNCTION public.expiry_endorsement_state(p_due_on date, p_today date, p_window_days integer DEFAULT 30)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  v_window integer := coalesce(p_window_days, 30);
BEGIN
  IF v_window < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_window', DETAIL = format('window_days must be 0 or more, got %s', v_window);
  END IF;
  IF p_due_on IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_today IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'today_required';
  END IF;
  IF p_due_on < p_today THEN
    RETURN 'overdue';
  ELSIF p_due_on - p_today <= v_window THEN
    RETURN 'due';
  END IF;
  RETURN NULL;
END;
$$;

-- The window when no rule matches (gap/02 data model seed, C5): passports
-- 270 days (nine months), every other item type 90.
CREATE OR REPLACE FUNCTION public.expiry_default_window(p_item_type text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE WHEN p_item_type = 'passport' THEN 270 ELSE 90 END
$$;

-- The window for an item of the company: the rule for p_certificate_type_id
-- under p_item_type, else the item type's rule, else the default. A
-- signed-in caller must be an active member of the company (42501
-- not_permitted otherwise); no JWT (the SQL editor, cron, the service role)
-- answers for any company. A NULL item type has no rule (the default 90);
-- an unknown one is refused (22023 invalid_item_type). Definer: the
-- security-invoker views of later blocks (X1) call it per row, so a member
-- reads the window without reading the rule table.
CREATE OR REPLACE FUNCTION public.expiry_window_for(p_company_id uuid, p_item_type text, p_certificate_type_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_days integer;
BEGIN
  IF v_uid IS NOT NULL AND (p_company_id IS NULL OR NOT coalesce(public.user_belongs_to_company(v_uid, p_company_id), false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_item_type IS NULL THEN
    RETURN public.expiry_default_window(NULL);
  END IF;
  IF p_item_type NOT IN ('vessel_certificate', 'insurance_policy', 'passport', 'visa', 'crew_document', 'crew_qualification',
                         'medical', 'vaccination', 'work_authorisation', 'contract', 'training_course') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_item_type', DETAIL = format('unknown item type %s', p_item_type);
  END IF;
  IF p_certificate_type_id IS NOT NULL THEN
    SELECT r.warn_days INTO v_days FROM public.expiry_window_rules AS r
    WHERE r.company_id = p_company_id AND r.item_type = p_item_type AND r.certificate_type_id = p_certificate_type_id;
    IF v_days IS NOT NULL THEN
      RETURN v_days;
    END IF;
  END IF;
  SELECT r.warn_days INTO v_days FROM public.expiry_window_rules AS r
  WHERE r.company_id = p_company_id AND r.item_type = p_item_type AND r.certificate_type_id IS NULL;
  RETURN coalesce(v_days, public.expiry_default_window(p_item_type));
END;
$$;

-- ---------------------------------------------------------------- fleet access (D-X5-21)

-- Whether _user_id may act on fleet-operations data of _area at _level in
-- the company, on _vessel_id or (NULL) at fleet level. Internal: definers
-- pass auth.uid(); fleet_ops_can() is the caller form. Unknown area or
-- level, NULL or unknown ids: false. Areas and their rules (the adaptor's
-- rule for the matching capability key, src/modules/fleet/lib/fleetOpsAccess.ts):
--   dashboard        RBAC dashboard            nav dashboard
--   reports          RBAC reports              nav reports
--   documents        RBAC documents            nav documents
--   checklists       RBAC ism                  nav ism
--   training         RBAC training             nav development
--   certificates     RBAC vessel_certificates  nav certificates
--   crew_documents   RBAC crew_certificates    nav crew (RBAC crew_roster)
--   insurance        RBAC insurance            nav insurance
--   hr               hr_can_view / _edit / _admin; at view also the
--                    catalogue's legacy flag crew.access_employment_records
--   medical_fitness  view: med_fitness_can_view or medical_can_view;
--                    edit / admin: medical_can_edit / medical_can_admin
--   medical_clinical medical_can_view / _edit / _admin
--   medical_admin    medical_can_admin (any level)
-- An RBAC level is met by that level or a higher one (user_has_permission
-- per level; its vessel rule: a vessel-scoped row of a role bound to
-- another vessel does not count on this vessel). At view, the nav check of
-- canAccessModule() also counts (AuthContext.tsx): RBAC fleet_master, the
-- nav module's RBAC view, or a legacy profile role of the nav's
-- MODULE_ACCESS list.
CREATE OR REPLACE FUNCTION public.fleet_ops_can_for(_user_id uuid, _company_id uuid, _vessel_id uuid, _area text, _level text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_role text;
  v_levels text[];
  v_module text;
  v_nav_module text;
  v_nav_roles text[];
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL OR _area IS NULL OR _level IS NULL THEN
    RETURN false;
  END IF;
  IF _level NOT IN ('view', 'edit', 'admin')
     OR _area NOT IN ('dashboard', 'reports', 'documents', 'checklists', 'training', 'certificates', 'crew_documents',
                      'insurance', 'hr', 'medical_fitness', 'medical_clinical', 'medical_admin') THEN
    RETURN false;
  END IF;
  IF NOT coalesce(public.user_is_active(_user_id), false) THEN
    RETURN false;
  END IF;
  SELECT p.company_id, p.role::text INTO v_company, v_role FROM public.profiles AS p WHERE p.user_id = _user_id;
  IF v_company IS DISTINCT FROM _company_id THEN
    RETURN false;
  END IF;

  -- Scope: a vessel of the company the user reaches, or fleet reach for fleet-level data.
  IF _vessel_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = _vessel_id AND v.company_id = _company_id) THEN
      RETURN false;
    END IF;
    IF NOT (coalesce(public.reach_vessel_for(_user_id, _vessel_id), false) OR coalesce(public.fleet_reach_for(_user_id, _company_id), false)) THEN
      RETURN false;
    END IF;
  ELSIF NOT coalesce(public.fleet_reach_for(_user_id, _company_id), false) THEN
    RETURN false;
  END IF;

  -- An external viewer is view-only (D-123).
  IF _level <> 'view' AND public.record_user_is_external(_user_id, _company_id) THEN
    RETURN false;
  END IF;

  -- Full access (the adaptor's hasFullAccess).
  IF v_role IN ('dpa', 'shore_management') OR EXISTS (
       SELECT 1 FROM public.rbac_user_roles AS r JOIN public.roles AS ro ON ro.id = r.role_id
       WHERE r.user_id = _user_id AND r.is_active = true AND (r.valid_until IS NULL OR r.valid_until > now())
         AND lower(ro.name) IN ('superadmin', 'dpa')) THEN
    RETURN true;
  END IF;

  -- Domain areas.
  IF _area = 'hr' THEN
    IF _level = 'view' THEN
      RETURN coalesce(public.hr_can_view(_user_id), false)
          OR coalesce(public.user_has_permission(_user_id, 'crew.access_employment_records', 'view'::public.permission_level, _vessel_id), false)
          OR coalesce(public.user_has_permission(_user_id, 'crew.access_employment_records', 'edit'::public.permission_level, _vessel_id), false)
          OR coalesce(public.user_has_permission(_user_id, 'crew.access_employment_records', 'admin'::public.permission_level, _vessel_id), false);
    END IF;
    RETURN coalesce(CASE _level WHEN 'edit' THEN public.hr_can_edit(_user_id) ELSE public.hr_can_admin(_user_id) END, false);
  ELSIF _area = 'medical_fitness' THEN
    RETURN coalesce(CASE _level
      WHEN 'view' THEN public.med_fitness_can_view(_user_id) OR public.medical_can_view(_user_id)
      WHEN 'edit' THEN public.medical_can_edit(_user_id)
      ELSE public.medical_can_admin(_user_id)
    END, false);
  ELSIF _area = 'medical_clinical' THEN
    RETURN coalesce(CASE _level
      WHEN 'view' THEN public.medical_can_view(_user_id)
      WHEN 'edit' THEN public.medical_can_edit(_user_id)
      ELSE public.medical_can_admin(_user_id)
    END, false);
  ELSIF _area = 'medical_admin' THEN
    RETURN coalesce(public.medical_can_admin(_user_id), false);
  END IF;

  -- RBAC areas.
  v_module := CASE _area
    WHEN 'dashboard' THEN 'dashboard'
    WHEN 'reports' THEN 'reports'
    WHEN 'documents' THEN 'documents'
    WHEN 'checklists' THEN 'ism'
    WHEN 'training' THEN 'training'
    WHEN 'certificates' THEN 'vessel_certificates'
    WHEN 'crew_documents' THEN 'crew_certificates'
    WHEN 'insurance' THEN 'insurance'
  END;
  v_levels := CASE _level WHEN 'view' THEN ARRAY['view', 'edit', 'admin'] WHEN 'edit' THEN ARRAY['edit', 'admin'] ELSE ARRAY['admin'] END;
  IF EXISTS (SELECT 1 FROM unnest(v_levels) AS l(level)
             WHERE coalesce(public.user_has_permission(_user_id, v_module, l.level::public.permission_level, _vessel_id), false)) THEN
    RETURN true;
  END IF;
  IF _level <> 'view' THEN
    RETURN false;
  END IF;

  -- canAccessModule(nav) at view: RBAC fleet_master, the nav module's RBAC view, a legacy role of MODULE_ACCESS.
  IF EXISTS (
       SELECT 1 FROM public.rbac_user_roles AS r JOIN public.roles AS ro ON ro.id = r.role_id
       WHERE r.user_id = _user_id AND r.is_active = true AND (r.valid_until IS NULL OR r.valid_until > now())
         AND lower(ro.name) = 'fleet_master') THEN
    RETURN true;
  END IF;
  -- fleet-ops-nav-rules:start (MODULE_ACCESS in src/modules/auth/contexts/AuthContext.tsx; pinned by src/test/fleet/fleetOpsAccess.test.ts)
  v_nav_module := CASE _area WHEN 'crew_documents' THEN 'crew_roster' ELSE v_module END;
  v_nav_roles := CASE _area
    WHEN 'dashboard' THEN ARRAY['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer', 'crew']
    WHEN 'reports' THEN ARRAY[]::text[]
    WHEN 'documents' THEN ARRAY['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer', 'crew']
    WHEN 'checklists' THEN ARRAY['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer']
    WHEN 'training' THEN ARRAY[]::text[]
    WHEN 'certificates' THEN ARRAY['dpa', 'shore_management', 'master', 'chief_officer']
    WHEN 'crew_documents' THEN ARRAY['dpa', 'shore_management', 'master', 'chief_officer']
    WHEN 'insurance' THEN ARRAY[]::text[]
  END;
  -- fleet-ops-nav-rules:end
  IF v_nav_module IS DISTINCT FROM v_module AND EXISTS (
       SELECT 1 FROM unnest(ARRAY['view', 'edit', 'admin']) AS l(level)
       WHERE coalesce(public.user_has_permission(_user_id, v_nav_module, l.level::public.permission_level, _vessel_id), false)) THEN
    RETURN true;
  END IF;
  RETURN coalesce(v_role = ANY (v_nav_roles), false);
END;
$$;

-- The caller form (auth.uid()); RLS policies and the browser call it.
CREATE OR REPLACE FUNCTION public.fleet_ops_can(_company_id uuid, _vessel_id uuid, _area text, _level text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN coalesce(public.fleet_ops_can_for(auth.uid(), _company_id, _vessel_id, _area, _level), false);
END;
$$;

-- The vessels a fleet view of _user_id covers (D-X5-09, D-X5-22). NULL ids:
-- every counted vessel of the company the user reaches (is_counted,
-- lifecycle_status 'active', a set status other than Sold, D-123). Explicit
-- ids: each must be a vessel of the company the user reaches (reach or
-- fleet reach) that is not archived or Sold, else 42501
-- vessel_out_of_reach; they are not filtered by is_counted (the vessel home
-- of an uncounted vessel). NULL entries are ignored; an inactive user or
-- another company reaches nothing. Internal (service role; definers).
CREATE OR REPLACE FUNCTION public.fleet_counted_vessels_for(_user_id uuid, _company_id uuid, _vessel_ids uuid[])
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active boolean;
  v_fleet boolean;
  v_id uuid;
BEGIN
  v_active := _user_id IS NOT NULL AND _company_id IS NOT NULL
    AND coalesce(public.user_is_active(_user_id), false)
    AND EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = _company_id);
  v_fleet := v_active AND coalesce(public.fleet_reach_for(_user_id, _company_id), false);

  IF _vessel_ids IS NULL THEN
    IF NOT v_active THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT v.id FROM public.vessels AS v
      WHERE v.company_id = _company_id
        AND v.is_counted
        AND v.lifecycle_status = 'active'
        AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
        AND (v_fleet OR coalesce(public.reach_vessel_for(_user_id, v.id), false))
      ORDER BY v.name, v.id;
    RETURN;
  END IF;

  FOR v_id IN SELECT DISTINCT x FROM unnest(_vessel_ids) AS x WHERE x IS NOT NULL LOOP
    IF NOT (v_active
            AND EXISTS (SELECT 1 FROM public.vessels AS v
                        WHERE v.id = v_id AND v.company_id = _company_id
                          AND public.vessel_in_reachable_state(v.lifecycle_status, v.status))
            AND (v_fleet OR coalesce(public.reach_vessel_for(_user_id, v_id), false))) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'vessel_out_of_reach';
    END IF;
  END LOOP;
  RETURN QUERY
    SELECT v.id FROM public.vessels AS v
    WHERE v.id IN (SELECT x FROM unnest(_vessel_ids) AS x WHERE x IS NOT NULL)
    ORDER BY v.name, v.id;
END;
$$;

-- The current crew of the vessels (all vessels with NULL): every
-- crew_assignments row that is current (crew_assignment_is_current, D-217)
-- on a vessel of the person's own company that is not archived or Sold,
-- joined to the profile by user_id; plus the pending placements of people
-- with no current assignment (profiles.imported_vessel_id on a vessel of
-- their company, D-199 / D-204; pending_login true). is_planned: the join
-- date (else the start date; a placement's joining date, else the profile's
-- creation day) is after today (D-X1-4). Department: the assignment's, else
-- the profile's. Internal (service role; definers and the expiry_src_*
-- views). If assignments are later keyed on profiles.id, this is edited in
-- place before apply (X5 spec §6 risk 5).
CREATE OR REPLACE FUNCTION public.fleet_current_crew(_vessel_ids uuid[])
RETURNS TABLE (vessel_id uuid, profile_id uuid, user_id uuid, "position" text, rank text, department text, join_date date, is_planned boolean, pending_login boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.vessel_id,
         p.id,
         ca.user_id,
         ca.position,
         ca.rank,
         coalesce(nullif(btrim(ca.department), ''), nullif(btrim(p.department), '')),
         coalesce(ca.join_date, ca.start_date),
         coalesce(coalesce(ca.join_date, ca.start_date) > current_date, false),
         false
  FROM public.crew_assignments AS ca
  JOIN public.profiles AS p ON p.user_id = ca.user_id
  JOIN public.vessels AS v ON v.id = ca.vessel_id AND v.company_id = p.company_id
  WHERE ca.is_current
    AND public.crew_assignment_is_current(ca.is_current, ca.leave_date, ca.end_date)
    AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
    AND (_vessel_ids IS NULL OR ca.vessel_id = ANY (_vessel_ids))
  UNION ALL
  SELECT p.imported_vessel_id,
         p.id,
         p.user_id,
         coalesce(nullif(btrim(p.position), ''), nullif(btrim(p.rank), ''), 'Crew'),
         p.rank,
         nullif(btrim(p.department), ''),
         coalesce(p.joining_date, p.created_at::date),
         coalesce(coalesce(p.joining_date, p.created_at::date) > current_date, false),
         true
  FROM public.profiles AS p
  JOIN public.vessels AS v ON v.id = p.imported_vessel_id AND v.company_id = p.company_id
  WHERE p.imported_vessel_id IS NOT NULL
    AND public.vessel_in_reachable_state(v.lifecycle_status, v.status)
    AND (_vessel_ids IS NULL OR p.imported_vessel_id = ANY (_vessel_ids))
    AND (p.user_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.crew_assignments AS c2
          WHERE c2.user_id = p.user_id AND c2.is_current
            AND public.crew_assignment_is_current(c2.is_current, c2.leave_date, c2.end_date)))
$$;

-- Whether _user_id is a head of department covering _department on the
-- vessel: an active, unexpired user_roles row with role 'hod' on that
-- vessel or company-wide (vessel NULL, same company), for that department
-- or all of them (department NULL or blank); the user is an active member
-- of the vessel's company who reaches the vessel (reach or fleet reach) and
-- no external viewer. Department names compare case-insensitively (ASCII)
-- after trimming. Internal (service role; the acknowledgement and training
-- definers of later slices).
CREATE OR REPLACE FUNCTION public.fleet_hod_covers(_user_id uuid, _vessel_id uuid, _department text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_dept text := nullif(translate(btrim(coalesce(_department, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '');
BEGIN
  IF _user_id IS NULL OR _vessel_id IS NULL THEN
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
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = 'hod'
      AND coalesce(ur.is_active, false)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND (ur.company_id IS NULL OR ur.company_id = v_company)
      AND (ur.vessel_id = _vessel_id OR (ur.vessel_id IS NULL AND ur.company_id = v_company))
      AND (nullif(btrim(coalesce(ur.department, '')), '') IS NULL
           OR (v_dept IS NOT NULL
               AND translate(btrim(ur.department), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = v_dept))
  );
END;
$$;

-- ---------------------------------------------------------------- legacy source views (§2.1 contract)

-- Vessel certificates: the legacy register's vessel rows that are not
-- superseded (gap/06 replaces this source with its versions). The legacy
-- register records no endorsement (gap/06 C5: next_survey_date is a survey
-- date), so endorsement_due_on is NULL until gap/06's source.
CREATE OR REPLACE VIEW public.expiry_src_vessel_certificates WITH (security_invoker = true) AS
SELECT 'vessel_certificates'::text AS source_key,
       'vessel_certificate'::text AS item_type,
       c.id AS record_id,
       c.company_id,
       c.vessel_id,
       p.id AS profile_id,
       c.certificate_name::text AS label,
       nullif(concat_ws(' · ', nullif(btrim(c.certificate_number), ''), nullif(btrim(c.issuing_authority), '')), '')::text AS detail,
       NULL::uuid AS certificate_type_id,
       c.expiry_date AS expires_on,
       false AS no_expiry,
       NULL::date AS endorsement_due_on,
       false AS alerts_muted,
       'vessel'::text AS link_scope,
       'certificates'::text AS link_rel
FROM public.certificates AS c
LEFT JOIN public.profiles AS p ON p.user_id = c.user_id AND p.company_id = c.company_id
WHERE c.vessel_id IS NOT NULL
  AND c.superseded_by IS NULL
  AND c.status IS DISTINCT FROM 'Superseded';

-- Insurance policies by coverage end: archived and cancelled policies
-- excluded; a policy with no vessel is a fleet item (vessel_id NULL).
-- Amounts and notes are never read.
CREATE OR REPLACE VIEW public.expiry_src_insurance_policies WITH (security_invoker = true) AS
SELECT 'insurance_policies'::text AS source_key,
       'insurance_policy'::text AS item_type,
       ip.id AS record_id,
       ip.company_id,
       ip.vessel_id,
       NULL::uuid AS profile_id,
       btrim(ip.policy_type)::text AS label,
       nullif(concat_ws(' · ', nullif(btrim(ip.insurer_name), ''), nullif(btrim(ip.policy_number), '')), '')::text AS detail,
       NULL::uuid AS certificate_type_id,
       ip.coverage_end_date AS expires_on,
       false AS no_expiry,
       NULL::date AS endorsement_due_on,
       false AS alerts_muted,
       (CASE WHEN ip.vessel_id IS NULL THEN 'fleet' ELSE 'vessel' END)::text AS link_scope,
       (CASE WHEN ip.vessel_id IS NULL THEN 'reports/insurance' ELSE 'vessel/insurance' END)::text AS link_rel
FROM public.insurance_policies AS ip
WHERE ip.lifecycle_status IS DISTINCT FROM 'archived'
  AND ip.status IS DISTINCT FROM 'cancelled';

-- Legacy crew certificates (keyed on the login): the latest of each
-- certificate type and name per person, with an expiry date. X1 sets this
-- source inactive when its crew documents land.
CREATE OR REPLACE VIEW public.expiry_src_crew_certificates WITH (security_invoker = true) AS
WITH crew AS (
  SELECT DISTINCT ON (c.profile_id) c.profile_id, c.vessel_id
  FROM public.fleet_current_crew(NULL) AS c
  ORDER BY c.profile_id, c.is_planned, c.join_date DESC NULLS LAST, c.vessel_id
),
latest AS (
  SELECT DISTINCT ON (cc.user_id, lower(btrim(cc.certificate_type)), lower(btrim(cc.certificate_name)))
         cc.id, cc.user_id, cc.certificate_name, cc.certificate_number, cc.expiry_date
  FROM public.crew_certificates AS cc
  WHERE cc.expiry_date IS NOT NULL
  ORDER BY cc.user_id, lower(btrim(cc.certificate_type)), lower(btrim(cc.certificate_name)), cc.expiry_date DESC, cc.id
)
SELECT 'crew_certificates_legacy'::text AS source_key,
       'crew_qualification'::text AS item_type,
       l.id AS record_id,
       p.company_id,
       crew.vessel_id,
       p.id AS profile_id,
       l.certificate_name::text AS label,
       nullif(btrim(l.certificate_number), '')::text AS detail,
       NULL::uuid AS certificate_type_id,
       l.expiry_date AS expires_on,
       false AS no_expiry,
       NULL::date AS endorsement_due_on,
       false AS alerts_muted,
       (CASE WHEN crew.vessel_id IS NULL THEN 'workspace' ELSE 'vessel' END)::text AS link_scope,
       (CASE WHEN crew.vessel_id IS NULL THEN 'hris/employee-records' ELSE 'crew/people/' || p.id::text || '/documents' END)::text AS link_rel
FROM latest AS l
JOIN public.profiles AS p ON p.user_id = l.user_id
LEFT JOIN crew ON crew.profile_id = p.id
WHERE p.company_id IS NOT NULL;

-- Passport and visa expiry on the profile (record_id = the profile; the
-- item type tells the two apart). The passport number is never read. X1
-- sets this source inactive when it backfills passports into its crew
-- documents.
CREATE OR REPLACE VIEW public.expiry_src_profile_identity WITH (security_invoker = true) AS
WITH crew AS (
  SELECT DISTINCT ON (c.profile_id) c.profile_id, c.vessel_id
  FROM public.fleet_current_crew(NULL) AS c
  ORDER BY c.profile_id, c.is_planned, c.join_date DESC NULLS LAST, c.vessel_id
),
identity AS (
  SELECT p.id AS profile_id, p.company_id, 'passport'::text AS item_type, 'Passport'::text AS label,
         nullif(btrim(p.passport_country), '')::text AS detail, p.passport_expiry AS expires_on
  FROM public.profiles AS p
  WHERE p.passport_expiry IS NOT NULL AND p.company_id IS NOT NULL
  UNION ALL
  SELECT p.id, p.company_id, 'visa'::text, 'Visa'::text,
         nullif(btrim(p.visa_status), '')::text, p.visa_expiry
  FROM public.profiles AS p
  WHERE p.visa_expiry IS NOT NULL AND p.company_id IS NOT NULL
)
SELECT 'profile_identity_legacy'::text AS source_key,
       i.item_type,
       i.profile_id AS record_id,
       i.company_id,
       crew.vessel_id,
       i.profile_id,
       i.label,
       i.detail,
       NULL::uuid AS certificate_type_id,
       i.expires_on,
       false AS no_expiry,
       NULL::date AS endorsement_due_on,
       false AS alerts_muted,
       (CASE WHEN crew.vessel_id IS NULL THEN 'workspace' ELSE 'vessel' END)::text AS link_scope,
       (CASE WHEN crew.vessel_id IS NULL THEN 'hris/employee-records' ELSE 'crew/people/' || i.profile_id::text || '/documents' END)::text AS link_rel
FROM identity AS i
LEFT JOIN crew ON crew.profile_id = i.profile_id;

-- Right-to-work documents (HRIS): the latest of each type and country per
-- person, revoked ones excluded; visa types are item type visa, the rest
-- work_authorisation. The reference number is never read.
CREATE OR REPLACE VIEW public.expiry_src_work_authorisations WITH (security_invoker = true) AS
WITH crew AS (
  SELECT DISTINCT ON (c.profile_id) c.profile_id, c.vessel_id
  FROM public.fleet_current_crew(NULL) AS c
  ORDER BY c.profile_id, c.is_planned, c.join_date DESC NULLS LAST, c.vessel_id
),
latest AS (
  SELECT DISTINCT ON (wa.profile_id, wa.authorisation_type, lower(btrim(wa.country)))
         wa.id, wa.company_id, wa.profile_id, wa.authorisation_type, wa.country, wa.expiry_date
  FROM public.crew_work_authorisations AS wa
  WHERE wa.expiry_date IS NOT NULL AND wa.status IS DISTINCT FROM 'revoked'
  ORDER BY wa.profile_id, wa.authorisation_type, lower(btrim(wa.country)), wa.expiry_date DESC, wa.id
)
SELECT 'work_authorisations'::text AS source_key,
       (CASE WHEN l.authorisation_type IN ('visa', 'schengen', 'b1_b2', 'c1_d') THEN 'visa' ELSE 'work_authorisation' END)::text AS item_type,
       l.id AS record_id,
       l.company_id,
       crew.vessel_id,
       l.profile_id,
       (CASE l.authorisation_type
          WHEN 'visa' THEN 'Visa'
          WHEN 'work_permit' THEN 'Work permit'
          WHEN 'residence_permit' THEN 'Residence permit'
          WHEN 'seamans_book' THEN 'Seafarer''s book'
          WHEN 'flag_endorsement' THEN 'Flag endorsement'
          WHEN 'schengen' THEN 'Schengen visa'
          WHEN 'b1_b2' THEN 'B1/B2 visa'
          WHEN 'c1_d' THEN 'C1/D visa'
          ELSE 'Work authorisation'
        END)::text AS label,
       nullif(btrim(l.country), '')::text AS detail,
       NULL::uuid AS certificate_type_id,
       l.expiry_date AS expires_on,
       false AS no_expiry,
       NULL::date AS endorsement_due_on,
       false AS alerts_muted,
       (CASE WHEN crew.vessel_id IS NULL THEN 'workspace' ELSE 'vessel' END)::text AS link_scope,
       (CASE WHEN crew.vessel_id IS NULL THEN 'hris/employee-records' ELSE 'crew/people/' || l.profile_id::text || '/documents' END)::text AS link_rel
FROM latest AS l
JOIN public.profiles AS p ON p.id = l.profile_id AND p.company_id = l.company_id
LEFT JOIN crew ON crew.profile_id = l.profile_id;

-- Training certificates (keyed on the login): the latest per course and
-- person, with an expiry date; certificate_type_id is the course, so a
-- window can be set per course.
CREATE OR REPLACE VIEW public.expiry_src_training_records WITH (security_invoker = true) AS
WITH crew AS (
  SELECT DISTINCT ON (c.profile_id) c.profile_id, c.vessel_id
  FROM public.fleet_current_crew(NULL) AS c
  ORDER BY c.profile_id, c.is_planned, c.join_date DESC NULLS LAST, c.vessel_id
),
latest AS (
  SELECT DISTINCT ON (tr.user_id, tr.course_id)
         tr.id, tr.user_id, tr.course_id, tr.training_provider, tr.expiry_date
  FROM public.training_records AS tr
  WHERE tr.expiry_date IS NOT NULL
  ORDER BY tr.user_id, tr.course_id, tr.expiry_date DESC, tr.id
)
SELECT 'training_records'::text AS source_key,
       'crew_qualification'::text AS item_type,
       l.id AS record_id,
       p.company_id,
       crew.vessel_id,
       p.id AS profile_id,
       coalesce(nullif(btrim(tc.course_name), ''), 'Training course')::text AS label,
       nullif(btrim(l.training_provider), '')::text AS detail,
       l.course_id AS certificate_type_id,
       l.expiry_date AS expires_on,
       false AS no_expiry,
       NULL::date AS endorsement_due_on,
       false AS alerts_muted,
       (CASE WHEN crew.vessel_id IS NULL THEN 'workspace' ELSE 'vessel' END)::text AS link_scope,
       (CASE WHEN crew.vessel_id IS NULL THEN 'hris/employee-records' ELSE 'crew/people/' || p.id::text || '/documents' END)::text AS link_rel
FROM latest AS l
JOIN public.profiles AS p ON p.user_id = l.user_id
LEFT JOIN public.training_courses AS tc ON tc.id = l.course_id
LEFT JOIN crew ON crew.profile_id = p.id
WHERE p.company_id IS NOT NULL;

-- Fitness-to-work certificates (Health; administrative fields only): the
-- latest of each assessment type per person, with an expiry date. Only the
-- type, the fitness status and the dates are read: never restrictions,
-- notes or the examiner (docs/HEALTH.md; gap/02 pitfall "medical grid").
CREATE OR REPLACE VIEW public.expiry_src_medical_fitness WITH (security_invoker = true) AS
WITH crew AS (
  SELECT DISTINCT ON (c.profile_id) c.profile_id, c.vessel_id
  FROM public.fleet_current_crew(NULL) AS c
  ORDER BY c.profile_id, c.is_planned, c.join_date DESC NULLS LAST, c.vessel_id
),
latest AS (
  SELECT DISTINCT ON (m.profile_id, m.assessment_type)
         m.id, m.company_id, m.profile_id, m.assessment_type, m.status, m.expires_on
  FROM public.med_fitness_assessments AS m
  WHERE m.profile_id IS NOT NULL AND m.expires_on IS NOT NULL
  ORDER BY m.profile_id, m.assessment_type, m.expires_on DESC, m.id
)
SELECT 'medical_fitness'::text AS source_key,
       'medical'::text AS item_type,
       l.id AS record_id,
       l.company_id,
       crew.vessel_id,
       l.profile_id,
       (CASE l.assessment_type
          WHEN 'eng1' THEN 'ENG1 medical'
          WHEN 'ml5' THEN 'ML5 medical'
          WHEN 'company' THEN 'Company medical'
          WHEN 'return_to_work' THEN 'Return-to-work medical'
          WHEN 'pre_employment' THEN 'Pre-employment medical'
          WHEN 'periodic' THEN 'Periodic medical'
          ELSE 'Medical fitness'
        END)::text AS label,
       (CASE l.status
          WHEN 'fit' THEN 'Fit'
          WHEN 'fit_with_restrictions' THEN 'Fit with restrictions'
          WHEN 'temporarily_unfit' THEN 'Temporarily unfit'
          WHEN 'unfit' THEN 'Unfit'
          WHEN 'pending' THEN 'Pending'
          WHEN 'expired' THEN 'Expired'
        END)::text AS detail,
       NULL::uuid AS certificate_type_id,
       l.expires_on,
       false AS no_expiry,
       NULL::date AS endorsement_due_on,
       false AS alerts_muted,
       (CASE WHEN crew.vessel_id IS NULL THEN 'workspace' ELSE 'vessel' END)::text AS link_scope,
       (CASE WHEN crew.vessel_id IS NULL THEN 'health' ELSE 'crew/medical' END)::text AS link_rel
FROM latest AS l
JOIN public.profiles AS p ON p.id = l.profile_id AND p.company_id = l.company_id
LEFT JOIN crew ON crew.profile_id = l.profile_id;

-- Crew contracts by end date: active contracts with an end date. Wages and
-- terms are never read.
CREATE OR REPLACE VIEW public.expiry_src_crew_contracts WITH (security_invoker = true) AS
WITH crew AS (
  SELECT DISTINCT ON (c.profile_id) c.profile_id, c.vessel_id
  FROM public.fleet_current_crew(NULL) AS c
  ORDER BY c.profile_id, c.is_planned, c.join_date DESC NULLS LAST, c.vessel_id
)
SELECT 'crew_contracts'::text AS source_key,
       'contract'::text AS item_type,
       cc.id AS record_id,
       cc.company_id,
       crew.vessel_id,
       cc.profile_id,
       ('Contract' || coalesce(' ' || nullif(btrim(cc.contract_number), ''), ''))::text AS label,
       nullif(btrim(coalesce(cc.position, '')), '')::text AS detail,
       NULL::uuid AS certificate_type_id,
       cc.end_date AS expires_on,
       false AS no_expiry,
       NULL::date AS endorsement_due_on,
       false AS alerts_muted,
       (CASE WHEN crew.vessel_id IS NULL THEN 'workspace' ELSE 'vessel' END)::text AS link_scope,
       (CASE WHEN crew.vessel_id IS NULL THEN 'hris/employee-records' ELSE 'crew/people/' || cc.profile_id::text END)::text AS link_rel
FROM public.crew_contracts AS cc
JOIN public.profiles AS p ON p.id = cc.profile_id AND p.company_id = cc.company_id
LEFT JOIN crew ON crew.profile_id = cc.profile_id
WHERE cc.status = 'active' AND cc.end_date IS NOT NULL;

REVOKE ALL ON public.expiry_src_vessel_certificates, public.expiry_src_insurance_policies, public.expiry_src_crew_certificates,
  public.expiry_src_profile_identity, public.expiry_src_work_authorisations, public.expiry_src_training_records,
  public.expiry_src_medical_fitness, public.expiry_src_crew_contracts
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- registry seed (D-X5-01)

-- ON CONFLICT DO NOTHING: a row a later block changed (X1 sets two of
-- these inactive) is never reset by a re-run.
INSERT INTO public.expiry_sources (source_key, item_type, label, view_name, read_area, sort_order, is_active, owner_doc) VALUES
  ('vessel_certificates', 'vessel_certificate', 'Vessel certificates', 'expiry_src_vessel_certificates', 'certificates', 10, true, 'gap/02'),
  ('insurance_policies', 'insurance_policy', 'Insurance policies', 'expiry_src_insurance_policies', 'insurance', 20, true, 'gap/02'),
  ('crew_certificates_legacy', 'crew_qualification', 'Crew certificates', 'expiry_src_crew_certificates', 'crew_documents', 30, true, 'gap/02'),
  ('profile_identity_legacy', 'passport', 'Passports and visas', 'expiry_src_profile_identity', 'crew_documents', 40, true, 'gap/02'),
  ('work_authorisations', 'work_authorisation', 'Work authorisations', 'expiry_src_work_authorisations', 'crew_documents', 50, true, 'gap/02'),
  ('training_records', 'crew_qualification', 'Training certificates', 'expiry_src_training_records', 'training', 60, true, 'gap/02'),
  ('medical_fitness', 'medical', 'Medical fitness', 'expiry_src_medical_fitness', 'medical_fitness', 70, true, 'gap/02'),
  ('crew_contracts', 'contract', 'Crew contracts', 'expiry_src_crew_contracts', 'hr', 80, true, 'gap/02')
ON CONFLICT (source_key) DO NOTHING;

-- ---------------------------------------------------------------- fleet expiry rows (internal)

-- Every expiry item of the company that _user_id may read, scored: the
-- active registry rows (optionally only _sources) whose view name passes
-- the pattern again, exists as a view in public (to_regclass) and has every
-- contract column (else skipped with a WARNING), unioned with format('%I');
-- per (read area, vessel) the gate fleet_ops_can_for(..., 'view') is
-- computed once; a row with no vessel (crew with no current vessel, fleet
-- insurance) only with _include_unassigned and fleet-level access to the
-- area. Window: the company's rule for the item's type under its item type,
-- else the item type's rule, else expiry_default_window() (exactly
-- expiry_window_for()); bucket and days from the engine above (days NULL
-- for a no-expiry item); endorsement_state with the default 30-day window.
-- Vessels: fleet_counted_vessels_for() (42501 vessel_out_of_reach for an
-- explicit id out of reach). An inactive user or another company: nothing.
-- Internal (service role; fleet_expiry_items, fleet_expiry_summary, the
-- dashboard and the daily sweep of later slices).
CREATE OR REPLACE FUNCTION public.fleet_expiry_rows_for(
  _user_id uuid, _company_id uuid, _vessel_ids uuid[], _sources text[], _include_unassigned boolean, _today date
)
RETURNS TABLE (
  source_key text, item_type text, record_id uuid, vessel_id uuid, profile_id uuid, label text, detail text,
  certificate_type_id uuid, expires_on date, no_expiry boolean, days_remaining integer, bucket text, window_days integer,
  endorsement_due_on date, endorsement_state text, alerts_muted boolean, link_scope text, link_rel text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_today date := coalesce(_today, current_date);
  v_vessels uuid[];
  v_src record;
  v_rel regclass;
  v_cols integer;
  v_area_vessels jsonb := '{}'::jsonb;
  v_area_fleet jsonb := '{}'::jsonb;
  v_allowed uuid[];
  v_fleet boolean;
  v_parts text[] := ARRAY[]::text[];
  v_contract text[] := ARRAY['source_key', 'item_type', 'record_id', 'company_id', 'vessel_id', 'profile_id', 'label', 'detail',
                             'certificate_type_id', 'expires_on', 'no_expiry', 'endorsement_due_on', 'alerts_muted', 'link_scope', 'link_rel'];
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL
     OR NOT coalesce(public.user_is_active(_user_id), false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = _user_id AND p.company_id = _company_id) THEN
    RETURN;
  END IF;
  v_vessels := ARRAY(SELECT x FROM public.fleet_counted_vessels_for(_user_id, _company_id, _vessel_ids) AS x);

  FOR v_src IN
    SELECT es.source_key, es.view_name, es.read_area
    FROM public.expiry_sources AS es
    WHERE es.is_active AND (_sources IS NULL OR es.source_key = ANY (_sources))
    ORDER BY es.sort_order, es.source_key
  LOOP
    IF v_src.view_name !~ '^expiry_src_[a-z0-9_]+$' THEN
      CONTINUE;
    END IF;
    v_rel := to_regclass('public.' || quote_ident(v_src.view_name));
    IF v_rel IS NULL OR NOT EXISTS (SELECT 1 FROM pg_class AS c WHERE c.oid = v_rel AND c.relkind IN ('v', 'm')) THEN
      CONTINUE;
    END IF;
    SELECT count(*) INTO v_cols FROM pg_attribute AS a
    WHERE a.attrelid = v_rel AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = ANY (v_contract);
    IF v_cols <> cardinality(v_contract) THEN
      RAISE WARNING 'fleet_expiry_rows_for: source % (view %) lacks columns of the expiry source contract; skipped', v_src.source_key, v_src.view_name;
      CONTINUE;
    END IF;

    -- The gates of this read area, once per (area, vessel).
    IF NOT (v_area_vessels ? v_src.read_area) THEN
      v_allowed := ARRAY(SELECT x FROM unnest(v_vessels) AS x
                         WHERE coalesce(public.fleet_ops_can_for(_user_id, _company_id, x, v_src.read_area, 'view'), false));
      v_fleet := coalesce(_include_unassigned, false)
                 AND coalesce(public.fleet_ops_can_for(_user_id, _company_id, NULL, v_src.read_area, 'view'), false);
      v_area_vessels := v_area_vessels || jsonb_build_object(v_src.read_area, to_jsonb(v_allowed));
      v_area_fleet := v_area_fleet || jsonb_build_object(v_src.read_area, v_fleet);
    END IF;
    v_allowed := ARRAY(SELECT jsonb_array_elements_text(v_area_vessels -> v_src.read_area)::uuid);
    v_fleet := (v_area_fleet ->> v_src.read_area)::boolean;
    IF cardinality(v_allowed) = 0 AND NOT v_fleet THEN
      CONTINUE;
    END IF;

    v_parts := v_parts || format(
      $f$SELECT %L::text AS source_key, s.item_type::text AS item_type, s.record_id::uuid AS record_id, s.vessel_id::uuid AS vessel_id,
                s.profile_id::uuid AS profile_id, s.label::text AS label, s.detail::text AS detail,
                s.certificate_type_id::uuid AS certificate_type_id, s.expires_on::date AS expires_on,
                coalesce(s.no_expiry, false) AS no_expiry, s.endorsement_due_on::date AS endorsement_due_on,
                coalesce(s.alerts_muted, false) AS alerts_muted, s.link_scope::text AS link_scope, s.link_rel::text AS link_rel
         FROM public.%I AS s
         WHERE s.company_id = $1 AND (s.vessel_id = ANY (%L::uuid[]) OR (%L::boolean AND s.vessel_id IS NULL))$f$,
      v_src.source_key, v_src.view_name, v_allowed, v_fleet);
  END LOOP;

  IF cardinality(v_parts) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE
    'WITH rules AS (SELECT r.item_type, r.certificate_type_id, r.warn_days FROM public.expiry_window_rules AS r WHERE r.company_id = $1),
          items AS (' || array_to_string(v_parts, ' UNION ALL ') || '),
          windowed AS (
            SELECT i.*, coalesce(
                     (SELECT ru.warn_days FROM rules AS ru WHERE ru.item_type = i.item_type AND i.certificate_type_id IS NOT NULL AND ru.certificate_type_id = i.certificate_type_id),
                     (SELECT ru.warn_days FROM rules AS ru WHERE ru.item_type = i.item_type AND ru.certificate_type_id IS NULL),
                     public.expiry_default_window(i.item_type)) AS window_days
            FROM items AS i)
     SELECT w.source_key, w.item_type, w.record_id, w.vessel_id, w.profile_id, w.label, w.detail, w.certificate_type_id,
            w.expires_on, w.no_expiry,
            CASE WHEN w.no_expiry THEN NULL ELSE public.expiry_days_remaining(w.expires_on, $2) END,
            public.expiry_bucket(w.expires_on, w.window_days, $2, w.no_expiry),
            w.window_days,
            w.endorsement_due_on,
            public.expiry_endorsement_state(w.endorsement_due_on, $2, 30),
            w.alerts_muted, w.link_scope, w.link_rel
     FROM windowed AS w'
    USING _company_id, v_today;
END;
$$;

-- ---------------------------------------------------------------- browser RPCs

-- The caller's fleet expiry list, most urgent first (bucket severity
-- expired > expiring_soon > expiring > valid > no_expiry, then days left,
-- label, record), a page of p_limit (1..500, default 100) from p_offset
-- (0 or more), total_count = every matching row. p_vessel_ids: NULL =
-- every counted vessel the caller reaches; explicit ids are reach-checked
-- (42501 vessel_out_of_reach). p_sources: registry keys (unknown keys match
-- nothing). p_buckets: any of the five buckets (else 22023 invalid_bucket).
-- p_search: up to 200 characters, matched case-insensitively and literally
-- (% and _ escaped) on label, detail and person name. Rows with no vessel
-- only with p_include_unassigned and fleet-level access to the source's
-- area. An inactive caller or no JWT: nothing. 22023 invalid_limit /
-- invalid_offset / invalid_search for bad paging or search.
CREATE OR REPLACE FUNCTION public.fleet_expiry_items(
  p_vessel_ids uuid[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_buckets text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_include_unassigned boolean DEFAULT false,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_today date DEFAULT current_date
)
RETURNS TABLE (
  source_key text, item_type text, record_id uuid, vessel_id uuid, vessel_name text, vessel_code text, profile_id uuid,
  person_name text, label text, detail text, expires_on date, days_remaining integer, bucket text, window_days integer,
  endorsement_due_on date, endorsement_state text, alerts_muted boolean, link_scope text, link_rel text, total_count bigint
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
  v_limit integer := coalesce(p_limit, 100);
  v_offset integer := coalesce(p_offset, 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern text;
BEGIN
  IF v_limit < 1 OR v_limit > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_limit', DETAIL = 'p_limit must be between 1 and 500';
  END IF;
  IF v_offset < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_offset';
  END IF;
  IF p_buckets IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(p_buckets) AS b WHERE b IS NULL OR b NOT IN ('expired', 'expiring_soon', 'expiring', 'valid', 'no_expiry')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_bucket';
  END IF;
  IF length(v_search) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_search', DETAIL = 'p_search is limited to 200 characters';
  END IF;
  v_pattern := CASE WHEN v_search IS NULL THEN NULL
                    ELSE '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    WITH base AS (
      SELECT r.*,
             v.name AS v_name,
             v.code AS v_code,
             CASE WHEN p.id IS NULL THEN NULL
                  ELSE btrim(coalesce(nullif(btrim(p.preferred_name), ''), p.first_name, '') || ' ' || coalesce(p.last_name, ''))
             END AS p_name
      FROM public.fleet_expiry_rows_for(v_uid, v_company, p_vessel_ids, p_sources, p_include_unassigned, p_today) AS r
      LEFT JOIN public.vessels AS v ON v.id = r.vessel_id
      LEFT JOIN public.profiles AS p ON p.id = r.profile_id
    ),
    filtered AS (
      SELECT x.* FROM base AS x
      WHERE (p_buckets IS NULL OR x.bucket = ANY (p_buckets))
        AND (v_pattern IS NULL
             OR x.label ILIKE v_pattern ESCAPE '\'
             OR x.detail ILIKE v_pattern ESCAPE '\'
             OR x.p_name ILIKE v_pattern ESCAPE '\')
    )
    SELECT f.source_key, f.item_type, f.record_id, f.vessel_id, f.v_name::text, f.v_code::text, f.profile_id,
           nullif(f.p_name, '')::text, f.label, f.detail, f.expires_on, f.days_remaining, f.bucket, f.window_days,
           f.endorsement_due_on, f.endorsement_state, f.alerts_muted, f.link_scope, f.link_rel,
           count(*) OVER ()
    FROM filtered AS f
    ORDER BY CASE f.bucket WHEN 'expired' THEN 0 WHEN 'expiring_soon' THEN 1 WHEN 'expiring' THEN 2 WHEN 'valid' THEN 3 ELSE 4 END,
             f.days_remaining NULLS LAST, f.label, f.record_id, f.item_type
    LIMIT v_limit OFFSET v_offset;
END;
$$;

-- Counts per source, item type, bucket and endorsement state (and vessel
-- with p_by_vessel; vessel_id NULL otherwise) over the caller's counted
-- vessels (NULL) or the explicit, reach-checked ids. Items with no vessel
-- are not counted (fleet totals). Muted items are counted only in
-- muted_count; item_count holds the rest. An inactive caller: nothing.
CREATE OR REPLACE FUNCTION public.fleet_expiry_summary(
  p_vessel_ids uuid[] DEFAULT NULL,
  p_by_vessel boolean DEFAULT false,
  p_today date DEFAULT current_date
)
RETURNS TABLE (source_key text, item_type text, vessel_id uuid, bucket text, endorsement_state text, item_count bigint, muted_count bigint)
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
  v_company := public.get_user_company_id(v_uid);
  IF v_uid IS NULL OR v_company IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT r.source_key, r.item_type,
           CASE WHEN coalesce(p_by_vessel, false) THEN r.vessel_id END,
           r.bucket, r.endorsement_state,
           count(*) FILTER (WHERE NOT r.alerts_muted),
           count(*) FILTER (WHERE r.alerts_muted)
    FROM public.fleet_expiry_rows_for(v_uid, v_company, p_vessel_ids, NULL, false, p_today) AS r
    GROUP BY r.source_key, r.item_type, CASE WHEN coalesce(p_by_vessel, false) THEN r.vessel_id END, r.bucket, r.endorsement_state
    ORDER BY r.source_key, r.item_type, 3, r.bucket, r.endorsement_state;
END;
$$;

-- Set the warning window for an item type (p_certificate_type_id NULL) or
-- for one type of its catalogue, in the caller's company. Gate:
-- fleet_ops_can(company, NULL, 'reports', 'admin') (fleet reach and
-- fleet.operations.fleet_reports.admin, D-X5-02), else 42501 not_permitted.
-- 22023 invalid_item_type / invalid_warn_days (0..1095). Returns the stored
-- row (insert or update; actor stamps from auth.uid()).
CREATE OR REPLACE FUNCTION public.set_expiry_window_rule(p_item_type text, p_certificate_type_id uuid, p_warn_days integer)
RETURNS public.expiry_window_rules
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_row public.expiry_window_rules;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF NOT public.fleet_ops_can(v_company, NULL, 'reports', 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_item_type IS NULL OR p_item_type NOT IN ('vessel_certificate', 'insurance_policy', 'passport', 'visa', 'crew_document', 'crew_qualification',
                                                 'medical', 'vaccination', 'work_authorisation', 'contract', 'training_course') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_item_type';
  END IF;
  IF p_warn_days IS NULL OR p_warn_days < 0 OR p_warn_days > 1095 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_warn_days', DETAIL = 'warn_days must be between 0 and 1095';
  END IF;

  IF p_certificate_type_id IS NULL THEN
    INSERT INTO public.expiry_window_rules (company_id, item_type, certificate_type_id, warn_days, created_by, updated_by)
    VALUES (v_company, p_item_type, NULL, p_warn_days, v_uid, v_uid)
    ON CONFLICT (company_id, item_type) WHERE certificate_type_id IS NULL
    DO UPDATE SET warn_days = EXCLUDED.warn_days, updated_by = EXCLUDED.updated_by
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.expiry_window_rules (company_id, item_type, certificate_type_id, warn_days, created_by, updated_by)
    VALUES (v_company, p_item_type, p_certificate_type_id, p_warn_days, v_uid, v_uid)
    ON CONFLICT (company_id, item_type, certificate_type_id) WHERE certificate_type_id IS NOT NULL
    DO UPDATE SET warn_days = EXCLUDED.warn_days, updated_by = EXCLUDED.updated_by
    RETURNING * INTO v_row;
  END IF;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'rule_not_saved';
  END IF;
  RETURN v_row;
END;
$$;

-- Remove a window rule of the caller's company (the item then falls back to
-- the item type's rule or the default). Same gate as set_expiry_window_rule;
-- an unknown id or another company's rule: P0002 rule_not_found.
CREATE OR REPLACE FUNCTION public.clear_expiry_window_rule(p_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_user_company_id(auth.uid());
  v_deleted integer;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF NOT public.fleet_ops_can(v_company, NULL, 'reports', 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_permitted';
  END IF;
  IF p_rule_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rule_required';
  END IF;
  DELETE FROM public.expiry_window_rules AS r WHERE r.id = p_rule_id AND r.company_id = v_company;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'rule_not_found';
  END IF;
END;
$$;

-- ---------------------------------------------------------------- grants (rule 5)

REVOKE ALL ON FUNCTION public.expiry_days_remaining(date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expiry_bucket(date, integer, date, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expiry_endorsement_state(date, date, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expiry_default_window(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expiry_window_for(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_ops_can_for(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_ops_can(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_counted_vessels_for(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_current_crew(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_hod_covers(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_expiry_rows_for(uuid, uuid, uuid[], text[], boolean, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_expiry_items(uuid[], text[], text[], text, boolean, integer, integer, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_expiry_summary(uuid[], boolean, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_expiry_window_rule(text, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clear_expiry_window_rule(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.expiry_days_remaining(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expiry_bucket(date, integer, date, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expiry_endorsement_state(date, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expiry_default_window(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expiry_window_for(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fleet_ops_can_for(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_ops_can(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fleet_counted_vessels_for(uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_current_crew(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_hod_covers(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_expiry_rows_for(uuid, uuid, uuid[], text[], boolean, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_expiry_items(uuid[], text[], text[], text, boolean, integer, integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_expiry_summary(uuid[], boolean, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_expiry_window_rule(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_expiry_window_rule(uuid) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.expiry_window_rules IS 'Expiry warning windows per company (gap/02 X2, C5, D-X5-02): one row per item type (certificate_type_id NULL) and per type of that item type''s catalogue (no FK: certificate_types, crew_document_types and training_courses live in other blocks); warn_days 0..1095. No rule: passport 270 days, every other item type 90 (expiry_default_window). Read: active members of the company. Written only by set_expiry_window_rule / clear_expiry_window_rule (fleet reach and fleet.operations.fleet_reports.admin). The item types are frozen at the X5-01A merge (X1 depends on them).';
COMMENT ON TABLE public.expiry_sources IS 'Registry of the fleet expiry sources (D-X5-01): one row per expiry_src_* view with the fixed column contract (source_key, item_type, record_id, company_id, vessel_id, profile_id, label, detail, certificate_type_id, expires_on, no_expiry, endorsement_due_on, alerts_muted, link_scope, link_rel), the read area that gates it (fleet_ops_can_for) and whether it is active. Written by migrations and the service role only (D-55); the browser reads nothing. A later stream adds its source as a row plus its own view and deactivates the legacy rows it replaces (X1: crew_certificates_legacy, profile_identity_legacy); nobody redefines an X5 function (D-120).';

COMMENT ON VIEW public.expiry_src_vessel_certificates IS 'Expiry source vessel_certificates (D-X5-01 contract): legacy certificates rows with a vessel that are not superseded; no endorsement record in the legacy register. Read only by the fleet expiry definers; no browser grant.';
COMMENT ON VIEW public.expiry_src_insurance_policies IS 'Expiry source insurance_policies (D-X5-01 contract): coverage end dates of policies not archived or cancelled; vessel_id NULL = a fleet policy. Amounts and notes are never read. Definers only.';
COMMENT ON VIEW public.expiry_src_crew_certificates IS 'Expiry source crew_certificates_legacy (D-X5-01 contract): the latest legacy crew certificate of each type and name per person (expiry date set); vessel from fleet_current_crew(). Deactivated by X1 when its crew documents land. Definers only.';
COMMENT ON VIEW public.expiry_src_profile_identity IS 'Expiry source profile_identity_legacy (D-X5-01 contract): profiles.passport_expiry (item type passport) and visa_expiry (visa); record_id is the profile; the passport number is never read. Deactivated by X1 after its passport backfill. Definers only.';
COMMENT ON VIEW public.expiry_src_work_authorisations IS 'Expiry source work_authorisations (D-X5-01 contract): the latest right-to-work document of each type and country per person, revoked excluded; visa types are item type visa. Definers only.';
COMMENT ON VIEW public.expiry_src_training_records IS 'Expiry source training_records (D-X5-01 contract): the latest training certificate per course and person; certificate_type_id = the course (per-course windows). Definers only.';
COMMENT ON VIEW public.expiry_src_medical_fitness IS 'Expiry source medical_fitness (D-X5-01 contract; item type medical): the latest fitness-to-work certificate of each assessment type per person; only the type, the fitness status and the dates (never restrictions, notes or the examiner). Gated by the medical_fitness area (fitness viewers). Definers only.';
COMMENT ON VIEW public.expiry_src_crew_contracts IS 'Expiry source crew_contracts (D-X5-01 contract): active crew contracts by end date; wages and terms are never read. Gated by the hr area. Definers only.';

COMMENT ON FUNCTION public.expiry_days_remaining(date, date) IS 'Days from p_today to p_expires_on (negative once expired); NULL with no date. Pure (EXP1).';
COMMENT ON FUNCTION public.expiry_bucket(date, integer, date, boolean) IS 'The expiry bucket (C5, D-31; TS src/lib/records/expiry.ts, shared fixture EXP1): expired | expiring_soon (<= least(30, window) days; the expiry day itself is 0 days) | expiring (<= window) | valid | no_expiry (no date or p_no_expiry). NULL window = 90; a negative window raises 22023 invalid_window; a dated item with NULL today raises 22023 today_required. Signature frozen at the X5-01A merge.';
COMMENT ON FUNCTION public.expiry_endorsement_state(date, date, integer) IS 'Endorsement state (gap/06 C5; TS src/modules/fleet/lib/endorsement.ts): overdue after the due date, due from p_window_days (default 30) before it through the due date, else NULL (also with no due date). A negative window raises 22023 invalid_window. Signature frozen at the X5-01A merge.';
COMMENT ON FUNCTION public.expiry_default_window(text) IS 'The warning window when no expiry_window_rules row matches: passport 270 days, every other item type 90 (C5; TS expiryDefaultWindow).';
COMMENT ON FUNCTION public.expiry_window_for(uuid, text, uuid) IS 'The warning window of an item of the company (D-X5-02): the rule for the certificate type under the item type, else the item type''s rule, else expiry_default_window(). A signed-in caller must be an active member of the company (42501 not_permitted); no JWT answers for any company. NULL item type: the default 90; an unknown item type: 22023 invalid_item_type. Definer so security-invoker views of later blocks (X1) can call it; signature frozen at the X5-01A merge.';
COMMENT ON FUNCTION public.fleet_ops_can_for(uuid, uuid, uuid, text, text) IS 'Fleet operations access (D-X5-21; TS mirror src/modules/fleet/lib/fleetOpsAccess.ts): false when inactive, outside the company, or for an unknown area / level; a given vessel must be of the company and reached (reach_vessel_for or fleet_reach_for); a NULL vessel (fleet-level data) needs fleet_reach_for; an external viewer passes view only; legacy dpa / shore_management and RBAC superadmin / dpa pass; else the area rule (RBAC module at the level or higher through user_has_permission, with canAccessModule''s nav check at view; or the hr / medical / fitness helpers). Internal (service role; definers).';
COMMENT ON FUNCTION public.fleet_ops_can(uuid, uuid, text, text) IS 'fleet_ops_can_for(auth.uid(), …): the caller form for the browser and RLS policies (D-X5-21).';
COMMENT ON FUNCTION public.fleet_counted_vessels_for(uuid, uuid, uuid[]) IS 'The vessels of a fleet view (gap/02 X3; D-X5-09, D-X5-22): NULL = every counted vessel of the company (is_counted, lifecycle active, a set status other than Sold) the user reaches (reach or fleet reach); explicit ids are reach-checked and not counted-filtered, and an archived, Sold, foreign or unreached id raises 42501 vessel_out_of_reach. Inactive user or another company: nothing. Internal (service role; definers).';
COMMENT ON FUNCTION public.fleet_current_crew(uuid[]) IS 'Current crew of the vessels (NULL = all): crew_assignment_is_current() rows on non-archived vessels of the person''s company joined to profiles by user_id, plus pending placements (profiles.imported_vessel_id; pending_login true) of people with no current assignment (D-199, D-204); is_planned = join date after today (D-X1-4). Columns frozen at the X5-01A merge. Internal (service role; definers and the expiry source views).';
COMMENT ON FUNCTION public.fleet_hod_covers(uuid, uuid, text) IS 'Whether the user is a head of department covering the department on the vessel: an active, unexpired user_roles hod row on the vessel or company-wide (same company), department NULL (all) or equal (ASCII case-insensitive); the user is active, of the vessel''s company, reaches the vessel and is no external viewer. Internal (service role; the acknowledgement and training definers of later slices).';
COMMENT ON FUNCTION public.fleet_expiry_rows_for(uuid, uuid, uuid[], text[], boolean, date) IS 'Every expiry item of the company the user may read, scored (D-X5-01): active expiry_sources rows whose view passes the name pattern, exists and has the contract columns (else skipped with a WARNING), unioned with format(%I); gates fleet_ops_can_for(view) once per (read area, vessel); rows with no vessel only with _include_unassigned and fleet-level access; window as expiry_window_for(); bucket, days and endorsement state from the engine. Vessels from fleet_counted_vessels_for(). Internal (service role; definers).';
COMMENT ON FUNCTION public.fleet_expiry_items(uuid[], text[], text[], text, boolean, integer, integer, date) IS 'The caller''s fleet expiry list (gap/02 X2, R3, R4; D-X5-01): fleet_expiry_rows_for(auth.uid(), the caller''s company, …) with vessel name and code and the person''s name, filtered by bucket (22023 invalid_bucket) and an escaped case-insensitive search (label, detail, person; at most 200 characters), most urgent first, a page of p_limit (1..500; 22023 invalid_limit) from p_offset (22023 invalid_offset), total_count = all matches. Explicit vessel ids out of reach: 42501 vessel_out_of_reach. Inactive caller or no JWT: nothing.';
COMMENT ON FUNCTION public.fleet_expiry_summary(uuid[], boolean, date) IS 'Expiry counts per source, item type, bucket and endorsement state (and vessel with p_by_vessel) over the caller''s counted vessels or the explicit, reach-checked ids (gap/02 W9 Document alerts, D3); items with no vessel are not counted; muted items only in muted_count. Inactive caller or no JWT: nothing.';
COMMENT ON FUNCTION public.set_expiry_window_rule(text, uuid, integer) IS 'Upsert the warning window for an item type (certificate type NULL) or one of its catalogue types in the caller''s company (D-X5-02). Gate fleet_ops_can(company, NULL, reports, admin), else 42501 not_permitted; 22023 invalid_item_type / invalid_warn_days (0..1095). Returns the stored row with actor stamps.';
COMMENT ON FUNCTION public.clear_expiry_window_rule(uuid) IS 'Delete a warning window rule of the caller''s company (D-X5-02). Same gate as set_expiry_window_rule (42501 not_permitted); 22023 rule_required; an unknown or foreign id raises P0002 rule_not_found.';
