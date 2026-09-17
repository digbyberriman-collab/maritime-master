-- =================================================================
-- HRIS PHASE 1: EMPLOYEE RECORDS
-- =================================================================
-- 1. hr_record_metadata: profile_id + nullable user_id (imported crew have
--    no auth user), unique (source_table, record_id), registration function
-- 2. crew_contracts (employment contracts / SEAs)
-- 3. crew_next_of_kin
-- 4. crew_assignments: end_reason / notes / rank / updated_by
-- 5. notification types for contract expiry and probation end
-- 6. hr_expiry_items view: one row per upcoming HR date
-- =================================================================

-- ---------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- ---------------------------------------------------------------
-- 1. hr_record_metadata
-- ---------------------------------------------------------------
ALTER TABLE public.hr_record_metadata
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.hr_record_metadata ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_record_metadata_profile ON public.hr_record_metadata(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_record_metadata_source
  ON public.hr_record_metadata(source_table, record_id);

UPDATE public.hr_record_metadata m
SET profile_id = p.id
FROM public.profiles p
WHERE m.profile_id IS NULL AND p.user_id = m.user_id;

-- Registers (or refreshes) the retention metadata for an HR record. Retention
-- length comes from the company's data_retention_policies row for the type,
-- defaulting to 7 years. Called by triggers on each HR table.
CREATE OR REPLACE FUNCTION public.hr_register_record(
  p_company_id uuid,
  p_profile_id uuid,
  p_record_type public.hr_record_type,
  p_record_id uuid,
  p_source_table text,
  p_retention_start date
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_years integer;
  v_user_id uuid;
  v_id uuid;
  v_start date := COALESCE(p_retention_start, CURRENT_DATE);
BEGIN
  SELECT retention_years INTO v_years
  FROM public.data_retention_policies
  WHERE company_id = p_company_id AND record_type = p_record_type
  LIMIT 1;
  v_years := COALESCE(v_years, 7);

  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = p_profile_id;

  INSERT INTO public.hr_record_metadata (
    company_id, user_id, profile_id, record_type, record_id, source_table,
    lifecycle_status, retention_start_date, retention_end_date
  ) VALUES (
    p_company_id, v_user_id, p_profile_id, p_record_type, p_record_id, p_source_table,
    'active', v_start, v_start + make_interval(years => v_years)
  )
  ON CONFLICT (source_table, record_id) DO UPDATE
    SET retention_start_date = EXCLUDED.retention_start_date,
        retention_end_date = EXCLUDED.retention_end_date,
        profile_id = EXCLUDED.profile_id,
        user_id = COALESCE(EXCLUDED.user_id, hr_record_metadata.user_id),
        version = hr_record_metadata.version + 1,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------
-- 2. crew_contracts
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  contract_type text NOT NULL DEFAULT 'rotational'
    CHECK (contract_type IN ('permanent','fixed_term','rotational','temporary','freelance','probationary','seasonal','daywork')),
  contract_number text,
  position text,
  department text,
  rank text,
  start_date date NOT NULL,
  end_date date,
  probation_end_date date,
  rotation_pattern text,
  notice_period_days integer,
  sea_reference text,
  flag_state text,
  governing_law text,
  wage_currency char(3),
  base_wage_minor bigint,
  wage_frequency text CHECK (wage_frequency IS NULL OR wage_frequency IN ('monthly','daily','weekly','annual')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','expired','terminated','superseded')),
  signed_by_crew_at timestamptz,
  signed_by_company_at timestamptz,
  document_path text,
  document_name text,
  supersedes_contract_id uuid REFERENCES public.crew_contracts(id) ON DELETE SET NULL,
  termination_reason text,
  terminated_at date,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_contracts_dates_chk CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_contracts_profile ON public.crew_contracts(profile_id);
CREATE INDEX IF NOT EXISTS idx_crew_contracts_company_status ON public.crew_contracts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_crew_contracts_end_date ON public.crew_contracts(end_date) WHERE end_date IS NOT NULL;

ALTER TABLE public.crew_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_contracts_select" ON public.crew_contracts;
CREATE POLICY "crew_contracts_select" ON public.crew_contracts
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_view(auth.uid()) OR profile_id = public.my_profile_id())
  );

DROP POLICY IF EXISTS "crew_contracts_insert" ON public.crew_contracts;
CREATE POLICY "crew_contracts_insert" ON public.crew_contracts
  FOR INSERT WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid())
  );

DROP POLICY IF EXISTS "crew_contracts_update" ON public.crew_contracts;
CREATE POLICY "crew_contracts_update" ON public.crew_contracts
  FOR UPDATE USING (
    public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid())
  );

DROP POLICY IF EXISTS "crew_contracts_delete" ON public.crew_contracts;
CREATE POLICY "crew_contracts_delete" ON public.crew_contracts
  FOR DELETE USING (
    public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_admin(auth.uid())
  );

DROP TRIGGER IF EXISTS trg_crew_contracts_updated_at ON public.crew_contracts;
CREATE TRIGGER trg_crew_contracts_updated_at
  BEFORE UPDATE ON public.crew_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep profiles.contract_start_date / contract_end_date in step with the
-- active contract so the leave calculator and roster keep working.
CREATE OR REPLACE FUNCTION public.crew_contracts_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active RECORD;
BEGIN
  PERFORM public.hr_register_record(
    NEW.company_id, NEW.profile_id, 'employment_contract', NEW.id, 'crew_contracts',
    COALESCE(NEW.terminated_at, NEW.end_date, NEW.start_date)
  );

  -- Only one active contract per crew member: supersede any other active one.
  IF NEW.status = 'active' THEN
    UPDATE public.crew_contracts
    SET status = 'superseded', updated_at = now()
    WHERE profile_id = NEW.profile_id AND id <> NEW.id AND status = 'active';
  END IF;

  SELECT start_date, end_date, probation_end_date, rotation_pattern INTO v_active
  FROM public.crew_contracts
  WHERE profile_id = NEW.profile_id AND status = 'active'
  ORDER BY start_date DESC LIMIT 1;

  IF FOUND THEN
    UPDATE public.profiles
    SET contract_start_date = v_active.start_date,
        contract_end_date = v_active.end_date,
        probation_end_date = COALESCE(v_active.probation_end_date, probation_end_date),
        updated_at = now()
    WHERE id = NEW.profile_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_contracts_after_write ON public.crew_contracts;
CREATE TRIGGER trg_crew_contracts_after_write
  AFTER INSERT OR UPDATE ON public.crew_contracts
  FOR EACH ROW EXECUTE FUNCTION public.crew_contracts_after_write();

-- Backfill: one active contract per profile from the legacy date columns.
INSERT INTO public.crew_contracts (company_id, profile_id, vessel_id, contract_type, position, department, rank, start_date, end_date, probation_end_date, rotation_pattern, status, notes)
SELECT p.company_id, p.id,
       (SELECT ca.vessel_id FROM public.crew_assignments ca WHERE ca.user_id = p.user_id AND ca.is_current ORDER BY ca.join_date DESC LIMIT 1),
       'rotational', p.position, p.department, p.rank,
       p.contract_start_date, p.contract_end_date, p.probation_end_date, p.rotation,
       CASE WHEN p.contract_end_date IS NOT NULL AND p.contract_end_date < CURRENT_DATE THEN 'expired' ELSE 'active' END,
       'Backfilled from profile contract dates'
FROM public.profiles p
WHERE p.company_id IS NOT NULL
  AND p.contract_start_date IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.crew_contracts c WHERE c.profile_id = p.id);

-- ---------------------------------------------------------------
-- 3. crew_next_of_kin
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_next_of_kin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL,
  phone_primary text,
  phone_secondary text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  country text,
  language text,
  is_primary boolean NOT NULL DEFAULT false,
  is_emergency_contact boolean NOT NULL DEFAULT true,
  notes text,
  consent_obtained_at timestamptz,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_next_of_kin_profile ON public.crew_next_of_kin(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crew_next_of_kin_primary
  ON public.crew_next_of_kin(profile_id) WHERE is_primary;

ALTER TABLE public.crew_next_of_kin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_next_of_kin_select" ON public.crew_next_of_kin;
CREATE POLICY "crew_next_of_kin_select" ON public.crew_next_of_kin
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_view(auth.uid()) OR profile_id = public.my_profile_id())
  );

DROP POLICY IF EXISTS "crew_next_of_kin_write" ON public.crew_next_of_kin;
CREATE POLICY "crew_next_of_kin_write" ON public.crew_next_of_kin
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR profile_id = public.my_profile_id())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR profile_id = public.my_profile_id())
  );

DROP TRIGGER IF EXISTS trg_crew_next_of_kin_updated_at ON public.crew_next_of_kin;
CREATE TRIGGER trg_crew_next_of_kin_updated_at
  BEFORE UPDATE ON public.crew_next_of_kin
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mirror the primary contact back to the legacy profile columns.
CREATE OR REPLACE FUNCTION public.crew_next_of_kin_sync_profile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid := COALESCE(NEW.profile_id, OLD.profile_id);
  v_primary RECORD;
BEGIN
  SELECT full_name, phone_primary INTO v_primary
  FROM public.crew_next_of_kin
  WHERE profile_id = v_profile
  ORDER BY is_primary DESC, created_at ASC LIMIT 1;

  UPDATE public.profiles
  SET emergency_contact_name = v_primary.full_name,
      emergency_contact_phone = v_primary.phone_primary,
      updated_at = now()
  WHERE id = v_profile;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_next_of_kin_sync_profile ON public.crew_next_of_kin;
CREATE TRIGGER trg_crew_next_of_kin_sync_profile
  AFTER INSERT OR UPDATE OR DELETE ON public.crew_next_of_kin
  FOR EACH ROW EXECUTE FUNCTION public.crew_next_of_kin_sync_profile();

-- Backfill from the legacy single-contact columns and the import staging table.
INSERT INTO public.crew_next_of_kin (company_id, profile_id, full_name, relationship, phone_primary, is_primary, notes)
SELECT p.company_id, p.id, p.emergency_contact_name, 'Unknown', p.emergency_contact_phone, true, 'Backfilled from profile emergency contact'
FROM public.profiles p
WHERE p.company_id IS NOT NULL
  AND p.emergency_contact_name IS NOT NULL
  AND btrim(p.emergency_contact_name) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.crew_next_of_kin k WHERE k.profile_id = p.id);

-- ---------------------------------------------------------------
-- 4. crew_assignments: capture why an assignment ended
-- ---------------------------------------------------------------
ALTER TABLE public.crew_assignments
  ADD COLUMN IF NOT EXISTS rank text,
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Two "ended" conventions existed (leave_date vs end_date). Make them agree.
UPDATE public.crew_assignments SET end_date = leave_date WHERE end_date IS NULL AND leave_date IS NOT NULL;
UPDATE public.crew_assignments SET leave_date = end_date WHERE leave_date IS NULL AND end_date IS NOT NULL;
UPDATE public.crew_assignments SET start_date = join_date WHERE start_date IS NULL;

CREATE OR REPLACE FUNCTION public.crew_assignments_normalise_dates()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.start_date IS NULL THEN NEW.start_date := NEW.join_date; END IF;
  IF NEW.join_date IS NULL THEN NEW.join_date := NEW.start_date; END IF;
  IF NEW.end_date IS NULL AND NEW.leave_date IS NOT NULL THEN NEW.end_date := NEW.leave_date; END IF;
  IF NEW.leave_date IS NULL AND NEW.end_date IS NOT NULL THEN NEW.leave_date := NEW.end_date; END IF;
  IF NEW.leave_date IS NOT NULL AND NEW.leave_date <= CURRENT_DATE THEN NEW.is_current := false; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_assignments_normalise_dates ON public.crew_assignments;
CREATE TRIGGER trg_crew_assignments_normalise_dates
  BEFORE INSERT OR UPDATE ON public.crew_assignments
  FOR EACH ROW EXECUTE FUNCTION public.crew_assignments_normalise_dates();

-- ---------------------------------------------------------------
-- 5. Notification types
-- ---------------------------------------------------------------
INSERT INTO public.notification_types (key, name, category, cadence, description, sort_order) VALUES
  ('contract_expiring', 'Contract Expiring', 'Crew', 'weekly', 'Employment contract or SEA ending within 90 days', 35),
  ('probation_ending', 'Probation Ending', 'Crew', 'weekly', 'Probation period ending within 30 days', 36),
  ('crew_document_expiring', 'Crew Document Expiring', 'Crew', 'weekly', 'Passport, visa or medical certificate expiring within 90 days', 37)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------
-- 6. hr_expiry_items: one row per upcoming HR date, company scoped by the
--    underlying tables' RLS (security_invoker).
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.hr_expiry_items
WITH (security_invoker = true) AS
  SELECT
    'contract'::text AS item_type,
    c.id AS record_id,
    c.company_id,
    c.profile_id,
    p.user_id,
    p.first_name || ' ' || p.last_name AS crew_name,
    c.vessel_id,
    COALESCE(c.contract_number, c.contract_type) AS label,
    c.end_date AS due_date,
    (c.end_date - CURRENT_DATE) AS days_remaining
  FROM public.crew_contracts c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.status = 'active' AND c.end_date IS NOT NULL
UNION ALL
  SELECT
    'probation', c.id, c.company_id, c.profile_id, p.user_id,
    p.first_name || ' ' || p.last_name, c.vessel_id,
    'Probation', c.probation_end_date, (c.probation_end_date - CURRENT_DATE)
  FROM public.crew_contracts c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.status = 'active' AND c.probation_end_date IS NOT NULL
UNION ALL
  SELECT
    'passport', p.id, p.company_id, p.id, p.user_id,
    p.first_name || ' ' || p.last_name, NULL::uuid,
    'Passport', p.passport_expiry, (p.passport_expiry - CURRENT_DATE)
  FROM public.profiles p
  WHERE p.passport_expiry IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT
    'medical', p.id, p.company_id, p.id, p.user_id,
    p.first_name || ' ' || p.last_name, NULL::uuid,
    'Medical certificate', p.medical_expiry, (p.medical_expiry - CURRENT_DATE)
  FROM public.profiles p
  WHERE p.medical_expiry IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT
    'certificate', cc.id, p.company_id, p.id, cc.user_id,
    p.first_name || ' ' || p.last_name, NULL::uuid,
    cc.certificate_name, cc.expiry_date, (cc.expiry_date - CURRENT_DATE)
  FROM public.crew_certificates cc
  JOIN public.profiles p ON p.user_id = cc.user_id
  WHERE cc.expiry_date IS NOT NULL AND p.company_id IS NOT NULL;

COMMENT ON VIEW public.hr_expiry_items IS 'Upcoming HR dates (contracts, probation, passport, medical, crew certificates). Rows are filtered by the RLS of the underlying tables.';
