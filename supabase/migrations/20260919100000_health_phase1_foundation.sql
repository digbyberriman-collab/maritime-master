-- =================================================================
-- HEALTH & WELLNESS PHASE 1: FOUNDATION
-- =================================================================
-- 1. RBAC modules `medical` (sensitive) and `wellness`
-- 2. Access helpers, mirrored in src/modules/auth/lib/medicalAccess.ts
--    and src/modules/auth/lib/wellnessAccess.ts
-- 3. hw_people        — the health subject (crew, guest, owner, contractor)
-- 4. hw_practitioners — medical staff, therapists, trainers (one table,
--                       discipline column) + their qualifications
-- 5. hw_measurements  — shared body metrics (nutrition, PT, physio)
-- 6. hw_settings      — per-company health settings
-- 7. hw_referrals     — cross-discipline referrals
-- 8. hw_record_access_log — who read whose clinical record
--
-- Clinical detail (diagnosis, medication, consultations) lives in the
-- med_* tables added in phase 2 and is gated on medical_can_*. This file
-- deliberately keeps hw_people free of clinical columns so that spa and
-- gym staff can read a name without reading a medical history.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. RBAC modules
-- ---------------------------------------------------------------
INSERT INTO public.modules (key, name, description, route, sort_order, is_active) VALUES
  ('medical', 'Medical', 'Clinical records, medical stores, protocols and ship hospital', '/health/medical/dashboard', 26, true),
  ('wellness', 'Health & Wellness', 'Spa, nutrition, physiotherapy and personal training', '/health/spa/dashboard', 27, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.modules (key, name, description, sort_order, is_active) VALUES
  ('medical.view_clinical', 'Can view clinical records', 'See diagnoses, medication and consultation notes', 940, true),
  ('medical.edit_clinical', 'Can edit clinical records', 'Record consultations, medication and assessments', 941, true),
  ('medical.manage_stores', 'Can manage medical stores', 'Receive, issue and dispose of medical stores including controlled drugs', 942, true),
  ('wellness.manage_bookings', 'Can manage wellness bookings', 'Spa bookings, training sessions and physio appointments', 943, true),
  ('wellness.manage_programmes', 'Can manage training programmes', 'Build and assign training and rehabilitation programmes', 944, true)
ON CONFLICT (key) DO NOTHING;

-- Medical is clinical: only superadmin and DPA get it by default. Ship's
-- medics get it by being listed in hw_practitioners, not by rank.
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'medical', 'admin'::permission_level, 'fleet'::role_scope_type
FROM public.roles r WHERE r.name IN ('superadmin', 'dpa')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'medical', 'view'::permission_level, 'self'::role_scope_type
FROM public.roles r WHERE r.name = 'crew'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'wellness', 'admin'::permission_level, 'fleet'::role_scope_type
FROM public.roles r WHERE r.name IN ('superadmin', 'dpa')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'wellness', 'edit'::permission_level, 'vessel'::role_scope_type
FROM public.roles r WHERE r.name IN ('captain', 'purser')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'wellness', 'view'::permission_level, 'vessel'::role_scope_type
FROM public.roles r WHERE r.name IN ('fleet_master', 'chief_officer', 'hod')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'wellness', 'view'::permission_level, 'self'::role_scope_type
FROM public.roles r WHERE r.name = 'crew'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------
-- 2. hw_practitioners (created before the helpers that read it)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hw_practitioners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  discipline text NOT NULL CHECK (discipline IN ('medical','spa','physio','nutrition','pt')),
  full_name text NOT NULL,
  role_title text,
  seniority text CHECK (seniority IS NULL OR seniority IN ('lead','senior','practitioner','assistant','trainee')),
  rank_code text,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  email text,
  phone text,
  specialisms text[] NOT NULL DEFAULT '{}',
  bio text,
  license_number text,
  license_authority text,
  license_expiry date,
  started_on date,
  ended_on date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hw_practitioners_company ON public.hw_practitioners(company_id, discipline, is_active);
CREATE INDEX IF NOT EXISTS idx_hw_practitioners_profile ON public.hw_practitioners(profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hw_practitioners_profile_discipline
  ON public.hw_practitioners(company_id, profile_id, discipline) WHERE profile_id IS NOT NULL;

COMMENT ON TABLE public.hw_practitioners IS 'Medical staff, spa therapists, physiotherapists, nutritionists and personal trainers. One row per person per discipline; profile_id links to a crew login where one exists.';

-- ---------------------------------------------------------------
-- 3. Access helpers
-- ---------------------------------------------------------------

-- True when the user is an active practitioner in the given discipline.
CREATE OR REPLACE FUNCTION public.hw_is_practitioner(_user_id uuid, _discipline text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hw_practitioners pr
    JOIN public.profiles p ON p.id = pr.profile_id
    WHERE p.user_id = _user_id
      AND pr.is_active
      AND (_discipline IS NULL OR pr.discipline = _discipline)
      AND (pr.ended_on IS NULL OR pr.ended_on >= CURRENT_DATE)
  );
$$;

CREATE OR REPLACE FUNCTION public.medical_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.rbac_company_permission(_user_id, 'medical', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management');
$$;

CREATE OR REPLACE FUNCTION public.medical_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.medical_can_admin(_user_id)
    OR public.hw_is_practitioner(_user_id, 'medical')
    OR public.rbac_company_permission(_user_id, 'medical', 'edit');
$$;

CREATE OR REPLACE FUNCTION public.medical_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.medical_can_edit(_user_id)
    OR public.rbac_company_permission(_user_id, 'medical', 'view');
$$;

COMMENT ON FUNCTION public.medical_can_view IS 'Clinical read access. Deliberately excludes captains and HR: they see fitness status through med_fitness_can_view, never diagnosis, medication or consultation notes.';

CREATE OR REPLACE FUNCTION public.wellness_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.rbac_company_permission(_user_id, 'wellness', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management');
$$;

CREATE OR REPLACE FUNCTION public.wellness_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.wellness_can_admin(_user_id)
    OR public.medical_can_edit(_user_id)
    OR public.hw_is_practitioner(_user_id, NULL)
    OR public.has_any_role(_user_id, ARRAY['captain','purser']::app_role[])
    OR public.rbac_company_permission(_user_id, 'wellness', 'edit')
    OR public.legacy_profile_role(_user_id) = 'master';
$$;

CREATE OR REPLACE FUNCTION public.wellness_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.wellness_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['fleet_master','chief_officer','chief_engineer','hod']::app_role[])
    OR public.rbac_company_permission(_user_id, 'wellness', 'view');
$$;

-- Fitness to work: status, restrictions and expiry only. Captains and HR
-- need this to crew a vessel legally; it carries no clinical detail.
CREATE OR REPLACE FUNCTION public.med_fitness_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.medical_can_view(_user_id)
    OR public.hr_can_view(_user_id)
    OR public.has_any_role(_user_id, ARRAY['captain','fleet_master']::app_role[]);
$$;

REVOKE ALL ON FUNCTION public.hw_is_practitioner(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.medical_can_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.medical_can_edit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.medical_can_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wellness_can_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wellness_can_edit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wellness_can_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.med_fitness_can_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hw_is_practitioner(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.medical_can_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.medical_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.medical_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wellness_can_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wellness_can_edit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wellness_can_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.med_fitness_can_view(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. hw_people — the health subject
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hw_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  person_type text NOT NULL DEFAULT 'crew'
    CHECK (person_type IN ('crew','contractor','shoreside','guest','owner','family','visitor','other')),
  first_name text NOT NULL,
  last_name text NOT NULL,
  preferred_name text,
  date_of_birth date,
  gender text,
  nationality text,
  email text,
  phone text,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  cabin text,
  language text,
  department text,
  rank text,
  emergency_contact_name text,
  emergency_contact_phone text,
  -- Consent for wellness staff (spa, gym, galley) to see the allergy and
  -- dietary flags they need to keep the person safe. Clinical detail is
  -- never shared on this flag.
  consent_share_safety_flags boolean NOT NULL DEFAULT true,
  arrived_on date,
  departed_on date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hw_people_company ON public.hw_people(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_hw_people_vessel ON public.hw_people(vessel_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hw_people_profile ON public.hw_people(profile_id) WHERE profile_id IS NOT NULL;

COMMENT ON TABLE public.hw_people IS 'Every person the health section can treat, train or book: crew (linked to profiles) and non-crew (guests, owner party, contractors) who must never get a profile. Identity only — no clinical columns.';

-- True when the health subject is the calling user.
CREATE OR REPLACE FUNCTION public.hw_person_is_self(_user_id uuid, _person_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hw_people hp
    JOIN public.profiles p ON p.id = hp.profile_id
    WHERE hp.id = _person_id AND p.user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.hw_person_is_self(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hw_person_is_self(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 5. hw_measurements — shared body metrics
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hw_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  measured_on date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'self' CHECK (source IN ('self','pt','physio','nutrition','medical','spa')),
  weight_kg numeric(6,2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  height_cm numeric(6,2) CHECK (height_cm IS NULL OR height_cm > 0),
  body_fat_pct numeric(5,2) CHECK (body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 100)),
  muscle_mass_kg numeric(6,2),
  waist_cm numeric(6,2),
  chest_cm numeric(6,2),
  hip_cm numeric(6,2),
  arm_cm numeric(6,2),
  thigh_cm numeric(6,2),
  calf_cm numeric(6,2),
  neck_cm numeric(6,2),
  resting_hr integer CHECK (resting_hr IS NULL OR (resting_hr > 0 AND resting_hr < 250)),
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  notes text,
  recorded_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hw_measurements_person ON public.hw_measurements(person_id, measured_on DESC);

-- ---------------------------------------------------------------
-- 6. hw_settings — per-company health settings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hw_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  units text NOT NULL DEFAULT 'metric' CHECK (units IN ('metric','imperial')),
  allow_self_logging boolean NOT NULL DEFAULT true,
  allow_crew_view_own_records boolean NOT NULL DEFAULT true,
  controlled_drugs_require_witness boolean NOT NULL DEFAULT true,
  medical_stores_category text CHECK (medical_stores_category IS NULL OR medical_stores_category IN ('A','B','C')),
  stock_expiry_warning_days integer NOT NULL DEFAULT 90 CHECK (stock_expiry_warning_days > 0),
  equipment_check_warning_days integer NOT NULL DEFAULT 30 CHECK (equipment_check_warning_days > 0),
  fitness_expiry_warning_days integer NOT NULL DEFAULT 90 CHECK (fitness_expiry_warning_days > 0),
  vaccination_warning_days integer NOT NULL DEFAULT 60 CHECK (vaccination_warning_days > 0),
  telemedicine_provider text,
  telemedicine_contact text,
  telemedicine_account_ref text,
  spa_booking_lead_hours integer NOT NULL DEFAULT 2 CHECK (spa_booking_lead_hours >= 0),
  spa_opening_time time NOT NULL DEFAULT '08:00',
  spa_closing_time time NOT NULL DEFAULT '20:00',
  default_currency char(3) NOT NULL DEFAULT 'EUR',
  notes text,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Returns the company's health settings, creating the default row on first read.
CREATE OR REPLACE FUNCTION public.hw_settings_for(p_company_id uuid)
RETURNS public.hw_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.hw_settings;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;
  IF NOT public.user_belongs_to_company(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  SELECT * INTO v_row FROM public.hw_settings WHERE company_id = p_company_id;
  IF NOT FOUND THEN
    INSERT INTO public.hw_settings (company_id) VALUES (p_company_id)
    ON CONFLICT (company_id) DO NOTHING;
    SELECT * INTO v_row FROM public.hw_settings WHERE company_id = p_company_id;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.hw_settings_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hw_settings_for(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 7. hw_referrals — cross-discipline referrals
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hw_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.hw_people(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  from_discipline text NOT NULL CHECK (from_discipline IN ('medical','spa','physio','nutrition','pt','self','hr')),
  to_discipline text NOT NULL CHECK (to_discipline IN ('medical','spa','physio','nutrition','pt','shoreside','specialist')),
  reason text NOT NULL,
  -- Clinical background is only populated on medical referrals and is
  -- masked in the UI for non-clinical readers.
  clinical_notes text,
  urgency text NOT NULL DEFAULT 'routine' CHECK (urgency IN ('routine','soon','urgent','emergency')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined','completed','cancelled')),
  consultation_id uuid,
  referred_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  assigned_practitioner_id uuid REFERENCES public.hw_practitioners(id) ON DELETE SET NULL,
  responded_at timestamptz,
  response_notes text,
  completed_at timestamptz,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hw_referrals_person ON public.hw_referrals(person_id, status);
CREATE INDEX IF NOT EXISTS idx_hw_referrals_company ON public.hw_referrals(company_id, status, urgency);

-- ---------------------------------------------------------------
-- 8. hw_record_access_log
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hw_record_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.hw_people(id) ON DELETE SET NULL,
  record_type text NOT NULL,
  record_id uuid,
  action text NOT NULL DEFAULT 'view' CHECK (action IN ('view','export','print','amend')),
  accessed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  context text
);
CREATE INDEX IF NOT EXISTS idx_hw_record_access_person ON public.hw_record_access_log(person_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hw_record_access_company ON public.hw_record_access_log(company_id, accessed_at DESC);

COMMENT ON TABLE public.hw_record_access_log IS 'Clinical record reads. Insert-only for the reader; readable by medical admins and the subject.';

-- ---------------------------------------------------------------
-- 9. Row level security
-- ---------------------------------------------------------------
ALTER TABLE public.hw_people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hw_people_select" ON public.hw_people;
CREATE POLICY "hw_people_select" ON public.hw_people
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.wellness_can_view(auth.uid())
      OR public.medical_can_view(auth.uid())
      OR profile_id = public.my_profile_id()
    )
  );
DROP POLICY IF EXISTS "hw_people_write" ON public.hw_people;
CREATE POLICY "hw_people_write" ON public.hw_people
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.wellness_can_edit(auth.uid()) OR public.medical_can_edit(auth.uid()))
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.wellness_can_edit(auth.uid()) OR public.medical_can_edit(auth.uid()))
  );

ALTER TABLE public.hw_practitioners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hw_practitioners_select" ON public.hw_practitioners;
CREATE POLICY "hw_practitioners_select" ON public.hw_practitioners
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.wellness_can_view(auth.uid())
      OR public.medical_can_view(auth.uid())
      OR profile_id = public.my_profile_id()
    )
  );
DROP POLICY IF EXISTS "hw_practitioners_write" ON public.hw_practitioners;
CREATE POLICY "hw_practitioners_write" ON public.hw_practitioners
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.wellness_can_admin(auth.uid())
      OR public.medical_can_admin(auth.uid())
      OR public.hr_can_edit(auth.uid())
    )
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.wellness_can_admin(auth.uid())
      OR public.medical_can_admin(auth.uid())
      OR public.hr_can_edit(auth.uid())
    )
  );

ALTER TABLE public.hw_measurements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hw_measurements_select" ON public.hw_measurements;
CREATE POLICY "hw_measurements_select" ON public.hw_measurements
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.wellness_can_view(auth.uid())
      OR public.medical_can_view(auth.uid())
      OR public.hw_person_is_self(auth.uid(), person_id)
    )
  );
DROP POLICY IF EXISTS "hw_measurements_write" ON public.hw_measurements;
CREATE POLICY "hw_measurements_write" ON public.hw_measurements
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.wellness_can_edit(auth.uid())
      OR public.medical_can_edit(auth.uid())
      OR public.hw_person_is_self(auth.uid(), person_id)
    )
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.wellness_can_edit(auth.uid())
      OR public.medical_can_edit(auth.uid())
      OR public.hw_person_is_self(auth.uid(), person_id)
    )
  );

ALTER TABLE public.hw_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hw_settings_select" ON public.hw_settings;
CREATE POLICY "hw_settings_select" ON public.hw_settings
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "hw_settings_write" ON public.hw_settings;
CREATE POLICY "hw_settings_write" ON public.hw_settings
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.wellness_can_admin(auth.uid()) OR public.medical_can_admin(auth.uid()))
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.wellness_can_admin(auth.uid()) OR public.medical_can_admin(auth.uid()))
  );

ALTER TABLE public.hw_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hw_referrals_select" ON public.hw_referrals;
CREATE POLICY "hw_referrals_select" ON public.hw_referrals
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.medical_can_view(auth.uid())
      OR public.hw_is_practitioner(auth.uid(), from_discipline)
      OR public.hw_is_practitioner(auth.uid(), to_discipline)
      OR public.wellness_can_admin(auth.uid())
      OR public.hw_person_is_self(auth.uid(), person_id)
    )
  );
DROP POLICY IF EXISTS "hw_referrals_write" ON public.hw_referrals;
CREATE POLICY "hw_referrals_write" ON public.hw_referrals
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.medical_can_edit(auth.uid())
      OR public.hw_is_practitioner(auth.uid(), from_discipline)
      OR public.hw_is_practitioner(auth.uid(), to_discipline)
      OR public.wellness_can_admin(auth.uid())
    )
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.medical_can_edit(auth.uid())
      OR public.hw_is_practitioner(auth.uid(), from_discipline)
      OR public.hw_is_practitioner(auth.uid(), to_discipline)
      OR public.wellness_can_admin(auth.uid())
    )
  );

ALTER TABLE public.hw_record_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hw_record_access_log_insert" ON public.hw_record_access_log;
CREATE POLICY "hw_record_access_log_insert" ON public.hw_record_access_log
  FOR INSERT WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND accessed_by = auth.uid()
  );
DROP POLICY IF EXISTS "hw_record_access_log_select" ON public.hw_record_access_log;
CREATE POLICY "hw_record_access_log_select" ON public.hw_record_access_log
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.medical_can_admin(auth.uid())
      OR public.hr_can_admin(auth.uid())
      OR public.hw_person_is_self(auth.uid(), person_id)
    )
  );

-- ---------------------------------------------------------------
-- 10. Keep hw_people in step with profiles
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hw_sync_person_from_profile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.hw_people (
    company_id, profile_id, person_type, first_name, last_name, preferred_name,
    date_of_birth, gender, nationality, email, phone, department, rank, is_active
  ) VALUES (
    NEW.company_id, NEW.id,
    CASE WHEN NEW.personnel_type IN ('contractor','shoreside') THEN NEW.personnel_type ELSE 'crew' END,
    NEW.first_name, NEW.last_name, NEW.preferred_name,
    NEW.date_of_birth, NEW.gender, NEW.nationality, NEW.email, NEW.phone,
    NEW.department, NEW.rank,
    COALESCE(NEW.status, 'active') <> 'inactive'
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    preferred_name = EXCLUDED.preferred_name,
    date_of_birth = EXCLUDED.date_of_birth,
    gender = EXCLUDED.gender,
    nationality = EXCLUDED.nationality,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    department = EXCLUDED.department,
    rank = EXCLUDED.rank,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_hw_person ON public.profiles;
CREATE TRIGGER trg_profiles_sync_hw_person
  AFTER INSERT OR UPDATE OF first_name, last_name, preferred_name, date_of_birth,
    gender, nationality, email, phone, department, rank, status, company_id, personnel_type
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.hw_sync_person_from_profile();

-- Backfill one subject per existing profile.
INSERT INTO public.hw_people (
  company_id, profile_id, person_type, first_name, last_name, preferred_name,
  date_of_birth, gender, nationality, email, phone, department, rank, is_active
)
SELECT
  p.company_id, p.id,
  CASE WHEN p.personnel_type IN ('contractor','shoreside') THEN p.personnel_type ELSE 'crew' END,
  p.first_name, p.last_name, p.preferred_name,
  p.date_of_birth, p.gender, p.nationality, p.email, p.phone,
  p.department, p.rank,
  COALESCE(p.status, 'active') <> 'inactive'
FROM public.profiles p
WHERE p.company_id IS NOT NULL
ON CONFLICT (profile_id) DO NOTHING;

-- Attach the current vessel where there is a live assignment.
UPDATE public.hw_people hp
SET vessel_id = a.vessel_id
FROM public.profiles p
JOIN public.crew_assignments a ON a.user_id = p.user_id AND a.is_current
WHERE hp.profile_id = p.id AND hp.vessel_id IS NULL;

-- ---------------------------------------------------------------
-- 11. updated_at triggers
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_hw_people_updated_at ON public.hw_people;
CREATE TRIGGER trg_hw_people_updated_at BEFORE UPDATE ON public.hw_people
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_hw_practitioners_updated_at ON public.hw_practitioners;
CREATE TRIGGER trg_hw_practitioners_updated_at BEFORE UPDATE ON public.hw_practitioners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_hw_measurements_updated_at ON public.hw_measurements;
CREATE TRIGGER trg_hw_measurements_updated_at BEFORE UPDATE ON public.hw_measurements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_hw_settings_updated_at ON public.hw_settings;
CREATE TRIGGER trg_hw_settings_updated_at BEFORE UPDATE ON public.hw_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_hw_referrals_updated_at ON public.hw_referrals;
CREATE TRIGGER trg_hw_referrals_updated_at BEFORE UPDATE ON public.hw_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hw_people TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hw_practitioners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hw_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hw_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hw_referrals TO authenticated;
GRANT SELECT, INSERT ON public.hw_record_access_log TO authenticated;
