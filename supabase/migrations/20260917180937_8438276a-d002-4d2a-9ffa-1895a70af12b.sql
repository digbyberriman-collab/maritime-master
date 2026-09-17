-- =================================================================
-- HRIS PHASE 4: RECRUITMENT, ONBOARDING, RIGHT TO WORK
-- =================================================================
CREATE TABLE IF NOT EXISTS public.vacancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  reference text,
  title text NOT NULL,
  department text,
  rank text,
  pay_grade_id uuid REFERENCES public.pay_grades(id) ON DELETE SET NULL,
  contract_type text NOT NULL DEFAULT 'rotational'
    CHECK (contract_type IN ('permanent','fixed_term','rotational','temporary','freelance','probationary','seasonal','daywork')),
  rotation_pattern text,
  start_date date,
  end_date date,
  headcount integer NOT NULL DEFAULT 1 CHECK (headcount >= 1),
  salary_currency char(3),
  salary_min_minor bigint,
  salary_max_minor bigint,
  description text,
  requirements text,
  required_certificates text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'on_hold', 'filled', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  hiring_manager_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  replaces_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at timestamptz,
  filled_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacancies TO authenticated;
GRANT ALL ON public.vacancies TO service_role;
CREATE INDEX IF NOT EXISTS idx_vacancies_company_status ON public.vacancies(company_id, status);
ALTER TABLE public.vacancies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vacancies_select" ON public.vacancies;
CREATE POLICY "vacancies_select" ON public.vacancies
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_view(auth.uid()));
DROP POLICY IF EXISTS "vacancies_write" ON public.vacancies;
CREATE POLICY "vacancies_write" ON public.vacancies
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_vacancies_updated_at ON public.vacancies;
CREATE TRIGGER trg_vacancies_updated_at BEFORE UPDATE ON public.vacancies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  preferred_name text,
  email text,
  phone text,
  nationality text,
  date_of_birth date,
  current_location text,
  home_airport text,
  rank text,
  department text,
  years_experience numeric(4,1),
  source text NOT NULL DEFAULT 'direct'
    CHECK (source IN ('direct', 'agency', 'referral', 'website', 'social', 'rehire', 'other')),
  agency_name text,
  referred_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cv_path text,
  cv_name text,
  linkedin_url text,
  certificates text[] NOT NULL DEFAULT ARRAY[]::text[],
  languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  salary_expectation_currency char(3),
  salary_expectation_minor bigint,
  available_from date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hired', 'archived', 'do_not_rehire')),
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes text,
  hired_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  gdpr_consent_at timestamptz,
  gdpr_retention_until date,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
CREATE INDEX IF NOT EXISTS idx_candidates_company_status ON public.candidates(company_id, status);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON public.candidates(company_id, lower(email));
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "candidates_select" ON public.candidates;
CREATE POLICY "candidates_select" ON public.candidates
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_view(auth.uid()));
DROP POLICY IF EXISTS "candidates_write" ON public.candidates;
CREATE POLICY "candidates_write" ON public.candidates
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_candidates_updated_at ON public.candidates;
CREATE TRIGGER trg_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.candidate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vacancy_id uuid NOT NULL REFERENCES public.vacancies(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'applied'
    CHECK (stage IN ('applied', 'screening', 'interview', 'reference_check', 'offer', 'accepted', 'hired', 'rejected', 'withdrawn')),
  rejection_reason text,
  offer_currency char(3),
  offer_base_minor bigint,
  offer_start_date date,
  offer_sent_at timestamptz,
  offer_accepted_at timestamptz,
  applied_at timestamptz NOT NULL DEFAULT now(),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vacancy_id, candidate_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_applications TO authenticated;
GRANT ALL ON public.candidate_applications TO service_role;
CREATE INDEX IF NOT EXISTS idx_candidate_applications_vacancy ON public.candidate_applications(vacancy_id, stage);
CREATE INDEX IF NOT EXISTS idx_candidate_applications_candidate ON public.candidate_applications(candidate_id);
ALTER TABLE public.candidate_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "candidate_applications_select" ON public.candidate_applications;
CREATE POLICY "candidate_applications_select" ON public.candidate_applications
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_view(auth.uid()));
DROP POLICY IF EXISTS "candidate_applications_write" ON public.candidate_applications;
CREATE POLICY "candidate_applications_write" ON public.candidate_applications
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_candidate_applications_updated_at ON public.candidate_applications;
CREATE TRIGGER trg_candidate_applications_updated_at BEFORE UPDATE ON public.candidate_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.candidate_applications(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'note'
    CHECK (event_type IN ('note', 'stage_change', 'interview', 'offer', 'email', 'call', 'reference')),
  from_stage text,
  to_stage text,
  body text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;
CREATE INDEX IF NOT EXISTS idx_application_events_application ON public.application_events(application_id, created_at);
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "application_events_select" ON public.application_events;
CREATE POLICY "application_events_select" ON public.application_events
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_view(auth.uid()));
DROP POLICY IF EXISTS "application_events_insert" ON public.application_events;
CREATE POLICY "application_events_insert" ON public.application_events
  FOR INSERT WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()));

CREATE OR REPLACE FUNCTION public.candidate_applications_track_stage()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
    INSERT INTO public.application_events (application_id, company_id, event_type, from_stage, to_stage, created_by)
    VALUES (NEW.id, NEW.company_id, 'stage_change', OLD.stage, NEW.stage, auth.uid());
    IF NEW.stage = 'offer' AND NEW.offer_sent_at IS NULL THEN NEW.offer_sent_at := now(); END IF;
    IF NEW.stage = 'accepted' AND NEW.offer_accepted_at IS NULL THEN NEW.offer_accepted_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_candidate_applications_track_stage ON public.candidate_applications;
CREATE TRIGGER trg_candidate_applications_track_stage BEFORE UPDATE ON public.candidate_applications
  FOR EACH ROW EXECUTE FUNCTION public.candidate_applications_track_stage();

CREATE TABLE IF NOT EXISTS public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.candidate_applications(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 45,
  format text NOT NULL DEFAULT 'video' CHECK (format IN ('video', 'phone', 'in_person', 'onboard_trial')),
  location text,
  interviewer_profile_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  outcome text CHECK (outcome IS NULL OR outcome IN ('strong_yes', 'yes', 'maybe', 'no')),
  scorecard jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
CREATE INDEX IF NOT EXISTS idx_interviews_application ON public.interviews(application_id, scheduled_at);
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "interviews_select" ON public.interviews;
CREATE POLICY "interviews_select" ON public.interviews
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_view(auth.uid()) OR public.my_profile_id() = ANY(interviewer_profile_ids))
  );
DROP POLICY IF EXISTS "interviews_write" ON public.interviews;
CREATE POLICY "interviews_write" ON public.interviews
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR public.my_profile_id() = ANY(interviewer_profile_ids))
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR public.my_profile_id() = ANY(interviewer_profile_ids))
  );
DROP TRIGGER IF EXISTS trg_interviews_updated_at ON public.interviews;
CREATE TRIGGER trg_interviews_updated_at BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  name text NOT NULL,
  applicable_departments text[] NOT NULL DEFAULT ARRAY[]::text[],
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_templates TO authenticated;
GRANT ALL ON public.onboarding_templates TO service_role;
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "onboarding_templates_select" ON public.onboarding_templates;
CREATE POLICY "onboarding_templates_select" ON public.onboarding_templates
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "onboarding_templates_write" ON public.onboarding_templates;
CREATE POLICY "onboarding_templates_write" ON public.onboarding_templates
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_onboarding_templates_updated_at ON public.onboarding_templates;
CREATE TRIGGER trg_onboarding_templates_updated_at BEFORE UPDATE ON public.onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.onboarding_templates (company_id, name, is_default, sections)
SELECT c.id, 'Standard crew induction', true, $j$[
  {"section": "Before joining", "items": [
    {"title": "Signed employment contract / SEA on file", "owner": "hr", "due_offset_days": -7, "required": true},
    {"title": "Passport, visa and medical certificate verified", "owner": "hr", "due_offset_days": -7, "required": true},
    {"title": "STCW and rank certificates verified", "owner": "hr", "due_offset_days": -7, "required": true},
    {"title": "Next of kin recorded", "owner": "hr", "due_offset_days": -3, "required": true},
    {"title": "Bank details received", "owner": "finance", "due_offset_days": -3, "required": true},
    {"title": "Pay grade and compensation set", "owner": "finance", "due_offset_days": -3, "required": true},
    {"title": "Travel booked and joining instructions sent", "owner": "hr", "due_offset_days": -5, "required": true},
    {"title": "Login invitation sent", "owner": "hr", "due_offset_days": -2, "required": true}
  ]},
  {"section": "First day", "items": [
    {"title": "Cabin, uniform and equipment issued", "owner": "vessel", "due_offset_days": 0, "required": true},
    {"title": "ISM familiarisation started", "owner": "vessel", "due_offset_days": 0, "required": true},
    {"title": "Hours of rest and leave policy briefed", "owner": "vessel", "due_offset_days": 1, "required": true},
    {"title": "Emergency duties and muster station assigned", "owner": "vessel", "due_offset_days": 0, "required": true}
  ]},
  {"section": "First month", "items": [
    {"title": "Required reading acknowledged", "owner": "employee", "due_offset_days": 14, "required": true},
    {"title": "30-day check-in with HOD", "owner": "vessel", "due_offset_days": 30, "required": true},
    {"title": "Probation objectives agreed", "owner": "hr", "due_offset_days": 30, "required": false}
  ]}
]$j$::jsonb
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_templates t WHERE t.company_id = c.id);

CREATE TABLE IF NOT EXISTS public.onboarding_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.onboarding_templates(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  buddy_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'completed', 'cancelled')),
  completion_pct integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_records TO authenticated;
GRANT ALL ON public.onboarding_records TO service_role;
CREATE INDEX IF NOT EXISTS idx_onboarding_records_company ON public.onboarding_records(company_id, status);
ALTER TABLE public.onboarding_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "onboarding_records_select" ON public.onboarding_records;
CREATE POLICY "onboarding_records_select" ON public.onboarding_records
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_view(auth.uid()) OR profile_id = public.my_profile_id() OR buddy_profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "onboarding_records_write" ON public.onboarding_records;
CREATE POLICY "onboarding_records_write" ON public.onboarding_records
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.hr_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_onboarding_records_updated_at ON public.onboarding_records;
CREATE TRIGGER trg_onboarding_records_updated_at BEFORE UPDATE ON public.onboarding_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.onboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.onboarding_records(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  section text NOT NULL,
  title text NOT NULL,
  owner text NOT NULL DEFAULT 'hr' CHECK (owner IN ('hr', 'finance', 'vessel', 'employee', 'buddy')),
  due_date date,
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  evidence_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_items TO authenticated;
GRANT ALL ON public.onboarding_items TO service_role;
CREATE INDEX IF NOT EXISTS idx_onboarding_items_record ON public.onboarding_items(record_id, sort_order);
ALTER TABLE public.onboarding_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "onboarding_items_select" ON public.onboarding_items;
CREATE POLICY "onboarding_items_select" ON public.onboarding_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.onboarding_records r WHERE r.id = record_id));
DROP POLICY IF EXISTS "onboarding_items_write" ON public.onboarding_items;
CREATE POLICY "onboarding_items_write" ON public.onboarding_items
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.hr_can_edit(auth.uid())
      OR EXISTS (SELECT 1 FROM public.onboarding_records r WHERE r.id = record_id
                 AND ((owner = 'employee' AND r.profile_id = public.my_profile_id()) OR (owner = 'buddy' AND r.buddy_profile_id = public.my_profile_id())))
    )
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.hr_can_edit(auth.uid())
      OR EXISTS (SELECT 1 FROM public.onboarding_records r WHERE r.id = record_id
                 AND ((owner = 'employee' AND r.profile_id = public.my_profile_id()) OR (owner = 'buddy' AND r.buddy_profile_id = public.my_profile_id())))
    )
  );
DROP TRIGGER IF EXISTS trg_onboarding_items_updated_at ON public.onboarding_items;
CREATE TRIGGER trg_onboarding_items_updated_at BEFORE UPDATE ON public.onboarding_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.onboarding_recompute(p_record_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total integer; v_done integer; v_pct integer;
BEGIN
  SELECT COUNT(*) FILTER (WHERE required), COUNT(*) FILTER (WHERE required AND completed) INTO v_total, v_done
  FROM public.onboarding_items WHERE record_id = p_record_id;
  v_pct := CASE WHEN v_total = 0 THEN 0 ELSE ROUND((v_done::numeric / v_total) * 100)::integer END;
  UPDATE public.onboarding_records
  SET completion_pct = v_pct,
      status = CASE WHEN status = 'cancelled' THEN status WHEN v_total > 0 AND v_pct = 100 THEN 'completed' WHEN v_pct > 0 THEN 'in_progress' ELSE status END,
      completed_at = CASE WHEN v_total > 0 AND v_pct = 100 THEN COALESCE(completed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE id = p_record_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_items_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.onboarding_recompute(COALESCE(NEW.record_id, OLD.record_id));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_onboarding_items_after_write ON public.onboarding_items;
CREATE TRIGGER trg_onboarding_items_after_write AFTER INSERT OR UPDATE OF completed, required OR DELETE ON public.onboarding_items
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_items_after_write();

CREATE OR REPLACE FUNCTION public.onboarding_start(
  p_profile_id uuid,
  p_vessel_id uuid,
  p_start_date date,
  p_template_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_template public.onboarding_templates;
  v_record uuid;
  v_section jsonb;
  v_item jsonb;
  v_order integer := 0;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = p_profile_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Profile has no company'; END IF;

  IF p_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.onboarding_templates WHERE id = p_template_id AND company_id = v_company;
  ELSE
    SELECT * INTO v_template FROM public.onboarding_templates
    WHERE company_id = v_company AND is_active AND (vessel_id = p_vessel_id OR vessel_id IS NULL)
    ORDER BY (vessel_id = p_vessel_id) DESC NULLS LAST, is_default DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_template.id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.onboarding_records (company_id, profile_id, vessel_id, template_id, start_date, status, created_by)
  VALUES (v_company, p_profile_id, p_vessel_id, v_template.id, p_start_date, 'not_started', auth.uid())
  ON CONFLICT (profile_id, start_date) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_record;

  IF EXISTS (SELECT 1 FROM public.onboarding_items WHERE record_id = v_record) THEN RETURN v_record; END IF;

  FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.sections, '[]'::jsonb)) LOOP
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'items', '[]'::jsonb)) LOOP
      v_order := v_order + 1;
      INSERT INTO public.onboarding_items (record_id, company_id, section, title, owner, due_date, required, sort_order)
      VALUES (
        v_record, v_company, COALESCE(v_section->>'section', 'General'), COALESCE(v_item->>'title', 'Item'),
        COALESCE(NULLIF(v_item->>'owner', ''), 'hr'),
        p_start_date + COALESCE((v_item->>'due_offset_days')::integer, 0),
        COALESCE((v_item->>'required')::boolean, true),
        v_order
      );
    END LOOP;
  END LOOP;
  RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.recruitment_hire_candidate(
  p_application_id uuid,
  p_start_date date,
  p_vessel_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  app public.candidate_applications;
  cand public.candidates;
  vac public.vacancies;
  v_profile_id uuid;
  v_email text;
  v_hired integer;
BEGIN
  IF NOT public.hr_can_edit(auth.uid()) THEN RAISE EXCEPTION 'Not allowed to hire'; END IF;
  SELECT * INTO app FROM public.candidate_applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO cand FROM public.candidates WHERE id = app.candidate_id;
  SELECT * INTO vac FROM public.vacancies WHERE id = app.vacancy_id;

  IF cand.hired_profile_id IS NOT NULL THEN
    v_profile_id := cand.hired_profile_id;
  ELSE
    v_email := COALESCE(NULLIF(cand.email, ''), 'candidate-' || cand.id || '@pending.local');
    INSERT INTO public.profiles (
      email, first_name, last_name, preferred_name, phone, nationality, date_of_birth,
      company_id, role, rank, department, position, status, account_status, is_imported,
      imported_vessel_id, contract_start_date
    ) VALUES (
      v_email, cand.first_name, cand.last_name, cand.preferred_name, cand.phone, cand.nationality, cand.date_of_birth,
      cand.company_id, 'crew', COALESCE(vac.rank, cand.rank), COALESCE(vac.department, cand.department), vac.title,
      'active', 'not_invited', true, COALESCE(p_vessel_id, vac.vessel_id), p_start_date
    ) RETURNING id INTO v_profile_id;

    INSERT INTO public.crew_contracts (company_id, profile_id, vessel_id, contract_type, position, department, rank, start_date, rotation_pattern, wage_currency, base_wage_minor, wage_frequency, status, notes)
    VALUES (cand.company_id, v_profile_id, COALESCE(p_vessel_id, vac.vessel_id), vac.contract_type, vac.title, vac.department, vac.rank, p_start_date, vac.rotation_pattern, app.offer_currency, app.offer_base_minor, 'monthly', 'draft', 'Created from accepted offer');
  END IF;

  UPDATE public.candidates SET status = 'hired', hired_profile_id = v_profile_id, updated_at = now() WHERE id = cand.id;
  UPDATE public.candidate_applications SET stage = 'hired', updated_at = now() WHERE id = p_application_id;

  SELECT COUNT(*) INTO v_hired FROM public.candidate_applications WHERE vacancy_id = vac.id AND stage = 'hired';
  IF v_hired >= vac.headcount THEN
    UPDATE public.vacancies SET status = 'filled', filled_at = now(), updated_at = now() WHERE id = vac.id;
  END IF;

  PERFORM public.onboarding_start(v_profile_id, COALESCE(p_vessel_id, vac.vessel_id), p_start_date, NULL);
  RETURN v_profile_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.crew_work_authorisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  authorisation_type text NOT NULL DEFAULT 'visa'
    CHECK (authorisation_type IN ('visa', 'work_permit', 'residence_permit', 'seamans_book', 'flag_endorsement', 'schengen', 'b1_b2', 'c1_d', 'other')),
  country text NOT NULL,
  reference_number text,
  issued_date date,
  expiry_date date,
  entries text CHECK (entries IS NULL OR entries IN ('single', 'multiple')),
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'pending', 'expired', 'revoked')),
  document_path text,
  document_name text,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_work_authorisations TO authenticated;
GRANT ALL ON public.crew_work_authorisations TO service_role;
CREATE INDEX IF NOT EXISTS idx_crew_work_authorisations_profile ON public.crew_work_authorisations(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_crew_work_authorisations_expiry ON public.crew_work_authorisations(company_id, expiry_date);
ALTER TABLE public.crew_work_authorisations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_work_authorisations_select" ON public.crew_work_authorisations;
CREATE POLICY "crew_work_authorisations_select" ON public.crew_work_authorisations
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_view(auth.uid()) OR profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "crew_work_authorisations_write" ON public.crew_work_authorisations;
CREATE POLICY "crew_work_authorisations_write" ON public.crew_work_authorisations
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR profile_id = public.my_profile_id())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.hr_can_edit(auth.uid()) OR profile_id = public.my_profile_id())
  );
DROP TRIGGER IF EXISTS trg_crew_work_authorisations_updated_at ON public.crew_work_authorisations;
CREATE TRIGGER trg_crew_work_authorisations_updated_at BEFORE UPDATE ON public.crew_work_authorisations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.hr_expiry_items
WITH (security_invoker = true) AS
  SELECT 'contract'::text AS item_type, c.id AS record_id, c.company_id, c.profile_id, p.user_id,
         p.first_name || ' ' || p.last_name AS crew_name, c.vessel_id,
         COALESCE(c.contract_number, c.contract_type) AS label, c.end_date AS due_date, (c.end_date - CURRENT_DATE) AS days_remaining
  FROM public.crew_contracts c JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.status = 'active' AND c.end_date IS NOT NULL
UNION ALL
  SELECT 'probation', c.id, c.company_id, c.profile_id, p.user_id, p.first_name || ' ' || p.last_name, c.vessel_id,
         'Probation', c.probation_end_date, (c.probation_end_date - CURRENT_DATE)
  FROM public.crew_contracts c JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.status = 'active' AND c.probation_end_date IS NOT NULL
UNION ALL
  SELECT 'passport', p.id, p.company_id, p.id, p.user_id, p.first_name || ' ' || p.last_name, NULL::uuid,
         'Passport', p.passport_expiry, (p.passport_expiry - CURRENT_DATE)
  FROM public.profiles p WHERE p.passport_expiry IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT 'visa', p.id, p.company_id, p.id, p.user_id, p.first_name || ' ' || p.last_name, NULL::uuid,
         COALESCE('Visa: ' || NULLIF(p.visa_status, ''), 'Visa'), p.visa_expiry, (p.visa_expiry - CURRENT_DATE)
  FROM public.profiles p WHERE p.visa_expiry IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT 'medical', p.id, p.company_id, p.id, p.user_id, p.first_name || ' ' || p.last_name, NULL::uuid,
         'Medical certificate', p.medical_expiry, (p.medical_expiry - CURRENT_DATE)
  FROM public.profiles p WHERE p.medical_expiry IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT 'certificate', cc.id, p.company_id, p.id, cc.user_id, p.first_name || ' ' || p.last_name, NULL::uuid,
         cc.certificate_name, cc.expiry_date, (cc.expiry_date - CURRENT_DATE)
  FROM public.crew_certificates cc JOIN public.profiles p ON p.user_id = cc.user_id
  WHERE cc.expiry_date IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT 'work_authorisation', w.id, w.company_id, w.profile_id, p.user_id, p.first_name || ' ' || p.last_name, NULL::uuid,
         w.authorisation_type || ' · ' || w.country, w.expiry_date, (w.expiry_date - CURRENT_DATE)
  FROM public.crew_work_authorisations w JOIN public.profiles p ON p.id = w.profile_id
  WHERE w.expiry_date IS NOT NULL AND w.status IN ('valid', 'pending');

CREATE OR REPLACE FUNCTION public.hr_generate_alerts(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item RECORD;
  v_count integer := 0;
  v_severity public.alert_severity;
  v_alert_type text;
  v_title text;
  v_existing uuid;
BEGIN
  FOR item IN
    SELECT e.item_type, e.record_id, e.company_id, e.profile_id, e.user_id, e.crew_name, e.vessel_id, e.label, e.due_date, e.days_remaining
    FROM public.hr_expiry_items e
    WHERE (p_company_id IS NULL OR e.company_id = p_company_id) AND e.days_remaining <= 90
    UNION ALL
    SELECT d.item_type, d.record_id, d.company_id, d.profile_id, d.user_id, d.crew_name, d.vessel_id, d.label, d.due_date, d.days_remaining
    FROM public.hr_performance_due_items d
    WHERE (p_company_id IS NULL OR d.company_id = p_company_id) AND d.days_remaining <= 14
  LOOP
    v_severity := CASE WHEN item.days_remaining < 0 THEN 'RED' WHEN item.days_remaining <= 30 THEN 'ORANGE' ELSE 'YELLOW' END;
    v_alert_type := 'hr_' || item.item_type;
    v_title := CASE
      WHEN item.days_remaining < 0 THEN item.crew_name || ': ' || item.label || ' overdue by ' || ABS(item.days_remaining) || ' days'
      ELSE item.crew_name || ': ' || item.label || ' due in ' || item.days_remaining || ' days' END;

    SELECT id INTO v_existing FROM public.alerts
    WHERE company_id = item.company_id AND alert_type = v_alert_type AND related_entity_id = item.record_id::text
      AND status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.alerts SET title = v_title, severity_color = v_severity, due_at = item.due_date::timestamptz,
        metadata = jsonb_build_object('item_type', item.item_type, 'profile_id', item.profile_id, 'days_remaining', item.days_remaining),
        updated_at = now()
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.alerts (company_id, vessel_id, alert_type, title, description, severity_color, status, source_module,
        related_entity_type, related_entity_id, due_at, owner_role, metadata)
      VALUES (item.company_id, item.vessel_id, v_alert_type, v_title,
        'HR item for ' || item.crew_name || ' (' || item.label || ') due ' || to_char(item.due_date, 'DD Mon YYYY'),
        v_severity, 'OPEN', 'hris', item.item_type, item.record_id::text, item.due_date::timestamptz, 'DPA',
        jsonb_build_object('item_type', item.item_type, 'profile_id', item.profile_id, 'days_remaining', item.days_remaining));
      v_count := v_count + 1;
    END IF;
  END LOOP;

  UPDATE public.alerts a SET status = 'AUTO_DISMISSED', resolved_at = now(), updated_at = now()
  WHERE a.source_module = 'hris' AND a.status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED')
    AND (p_company_id IS NULL OR a.company_id = p_company_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.hr_expiry_items e WHERE e.record_id::text = a.related_entity_id AND e.days_remaining <= 90
      UNION ALL
      SELECT 1 FROM public.hr_performance_due_items d WHERE d.record_id::text = a.related_entity_id AND d.days_remaining <= 14
    );

  RETURN v_count;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('hr-generate-alerts', '30 5 * * *', $cron$SELECT public.hr_generate_alerts()$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

INSERT INTO public.notification_types (key, name, category, cadence, description, sort_order) VALUES
  ('vacancy_opened', 'Vacancy Opened', 'Crew', 'realtime', 'A new vacancy has been opened', 42),
  ('candidate_stage_changed', 'Candidate Stage Changed', 'Crew', 'realtime', 'An application moved to a new pipeline stage', 43),
  ('onboarding_item_due', 'Onboarding Item Due', 'Crew', 'weekly', 'An onboarding task is due or overdue', 44),
  ('work_authorisation_expiring', 'Work Authorisation Expiring', 'Crew', 'weekly', 'A visa, permit or endorsement expires within 90 days', 45)
ON CONFLICT (key) DO NOTHING;