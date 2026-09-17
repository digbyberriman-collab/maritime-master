-- =================================================================
-- HRIS: review fixes (authorisation and data-integrity hardening)
-- =================================================================
-- 1. hr_can_view honours custom RBAC 'hr' view permissions (mirrors hrAccess.ts)
-- 2. profiles: HR editors cannot change privileged columns (role,
--    account_status, company_id, user_id) unless they are HR admins
-- 3. recruitment_hire_candidate is tenant-scoped
-- 4. onboarding_start requires HR edit rights in the profile's company
-- 5. sweeper functions are not callable by end users; hr_archive_due_records
--    is additionally scoped to the caller's company when a user runs it
-- 6. hr_anonymize_profile handles imported crew (no login) correctly
-- 7. same-day compensation changes no longer trip crew_compensation_dates_chk
-- =================================================================

-- ---------------------------------------------------------------
-- 1. hr_can_view: include RBAC module permission
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.hr_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['chief_officer','chief_engineer','hod']::app_role[])
    OR public.user_has_module_access(_user_id, 'hr', 'view')
    OR public.legacy_profile_role(_user_id) IN ('chief_officer', 'chief_engineer');
$$;

-- ---------------------------------------------------------------
-- 2. profiles: guard privileged columns against non-admin updates
-- ---------------------------------------------------------------
-- RLS WITH CHECK cannot compare against the old row, so a BEFORE UPDATE
-- trigger enforces it. Service-role / cron contexts (auth.uid() IS NULL)
-- are unaffected, as are HR admins (DPA, shore management, superadmin).
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.account_status IS DISTINCT FROM OLD.account_status
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND NOT public.hr_can_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only HR admins can change role, account status, company or login of a profile'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_guard_privileged_columns ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------
-- 3. recruitment_hire_candidate: tenant scoping
-- ---------------------------------------------------------------
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
  v_company uuid;
  v_profile_id uuid;
  v_email text;
  v_hired integer;
BEGIN
  IF NOT public.hr_can_edit(auth.uid()) THEN RAISE EXCEPTION 'Not allowed to hire'; END IF;
  v_company := public.get_user_company_id(auth.uid());
  IF v_company IS NULL THEN RAISE EXCEPTION 'Not allowed to hire'; END IF;

  SELECT * INTO app FROM public.candidate_applications WHERE id = p_application_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO cand FROM public.candidates WHERE id = app.candidate_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  SELECT * INTO vac FROM public.vacancies WHERE id = app.vacancy_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vacancy not found'; END IF;
  IF p_vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels WHERE id = p_vessel_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Vessel not found';
  END IF;

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
      v_company, 'crew', COALESCE(vac.rank, cand.rank), COALESCE(vac.department, cand.department), vac.title,
      'active', 'not_invited', true, COALESCE(p_vessel_id, vac.vessel_id), p_start_date
    ) RETURNING id INTO v_profile_id;

    INSERT INTO public.crew_contracts (company_id, profile_id, vessel_id, contract_type, position, department, rank, start_date, rotation_pattern, wage_currency, base_wage_minor, wage_frequency, status, notes)
    VALUES (v_company, v_profile_id, COALESCE(p_vessel_id, vac.vessel_id), vac.contract_type, vac.title, vac.department, vac.rank, p_start_date, vac.rotation_pattern, app.offer_currency, app.offer_base_minor, 'monthly', 'draft', 'Created from accepted offer');
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

-- ---------------------------------------------------------------
-- 4. onboarding_start: caller must be an HR editor of the profile's company
-- ---------------------------------------------------------------
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
  IF NOT public.hr_can_edit(auth.uid()) THEN RAISE EXCEPTION 'Not allowed to start onboarding'; END IF;
  SELECT company_id INTO v_company FROM public.profiles WHERE id = p_profile_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Profile has no company'; END IF;
  IF v_company <> public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF p_vessel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vessels WHERE id = p_vessel_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Vessel not found';
  END IF;

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

-- ---------------------------------------------------------------
-- 5. Sweeper functions: cron / service-role only
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_archive_due_records(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  -- A signed-in user may only archive within their own company and only as
  -- an HR admin; cron / the service role (no auth.uid()) sweep every company.
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.hr_can_admin(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
    p_company_id := public.get_user_company_id(auth.uid());
    IF p_company_id IS NULL THEN RETURN 0; END IF;
  END IF;

  UPDATE public.hr_record_metadata m
  SET lifecycle_status = 'archived', archived_at = now(), updated_at = now()
  FROM public.data_retention_policies p
  WHERE p.company_id = m.company_id AND p.record_type = m.record_type
    AND COALESCE(p.auto_archive, false)
    AND m.lifecycle_status = 'active'
    AND m.retention_end_date < CURRENT_DATE
    AND (p_company_id IS NULL OR m.company_id = p_company_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_archive_due_records(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_expire_overrun_contracts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_expire_disciplinary_records() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_generate_alerts(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- 6. hr_anonymize_profile: imported crew handling
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_anonymize_profile(p_profile_id uuid, p_reason text DEFAULT 'GDPR erasure')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
  v_tag text;
BEGIN
  IF NOT public.hr_can_admin(auth.uid()) THEN RAISE EXCEPTION 'Only HR admins can anonymise records'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF p.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF p.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.crew_assignments ca WHERE ca.user_id = p.user_id AND ca.is_current) THEN
    RAISE EXCEPTION 'Crew member still has a current assignment';
  END IF;
  -- Imported crew have no login and therefore no crew_assignments row; an
  -- active contract is the equivalent signal that they are still on board.
  IF EXISTS (
    SELECT 1 FROM public.crew_contracts c
    WHERE c.profile_id = p_profile_id AND c.status = 'active'
      AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Crew member still has an active contract';
  END IF;

  v_tag := 'ANON-' || LEFT(REPLACE(p_profile_id::text, '-', ''), 8);

  UPDATE public.profiles SET
    first_name = 'Former', last_name = 'Crew ' || v_tag, preferred_name = NULL,
    email = v_tag || '@anonymised.local', phone = NULL, date_of_birth = NULL, gender = NULL,
    nationality = NULL, passport_number = NULL, passport_expiry = NULL, visa_status = NULL, visa_expiry = NULL,
    medical_expiry = NULL, emergency_contact_name = NULL, emergency_contact_phone = NULL, notes = NULL,
    avatar_url = NULL, cabin = NULL, status = 'inactive', account_status = 'disabled', updated_at = now()
  WHERE id = p_profile_id;

  DELETE FROM public.crew_next_of_kin WHERE profile_id = p_profile_id;
  DELETE FROM public.crew_bank_details WHERE profile_id = p_profile_id;
  DELETE FROM public.crew_work_authorisations WHERE profile_id = p_profile_id;
  UPDATE public.crew_contracts SET notes = NULL, document_path = NULL, document_name = NULL, updated_at = now() WHERE profile_id = p_profile_id;
  UPDATE public.performance_reviews SET strengths = NULL, development_areas = NULL, training_needs = NULL, career_aspirations = NULL,
    summary = NULL, reviewer_comments = NULL, employee_comments = NULL, ratings = '[]'::jsonb, self_ratings = '[]'::jsonb,
    document_path = NULL, updated_at = now() WHERE profile_id = p_profile_id;
  DELETE FROM public.performance_review_welfare_notes
    WHERE review_id IN (SELECT id FROM public.performance_reviews WHERE profile_id = p_profile_id);
  UPDATE public.crew_objectives SET description = NULL, notes = NULL, updated_at = now() WHERE profile_id = p_profile_id;
  UPDATE public.disciplinary_records SET description = '[anonymised]', investigation_notes = NULL, witness_statements = NULL,
    outcome = NULL, appeal_notes = NULL, document_path = NULL, document_name = NULL, updated_at = now() WHERE profile_id = p_profile_id;
  IF p.user_id IS NOT NULL THEN
    DELETE FROM public.crew_attachments WHERE user_id = p.user_id;
    UPDATE public.crew_certificates SET file_url = NULL, file_name = NULL, notes = NULL, certificate_number = NULL WHERE user_id = p.user_id;
  END IF;

  UPDATE public.hr_record_metadata
  SET lifecycle_status = 'anonymized', anonymized_at = now(), anonymized_by = auth.uid(), updated_at = now()
  WHERE profile_id = p_profile_id OR (p.user_id IS NOT NULL AND user_id = p.user_id);

  -- gdpr_requests is keyed on a login (subject_user_id → profiles.user_id);
  -- imported crew have none, so their erasure is recorded in audit_logs only.
  IF p.user_id IS NOT NULL THEN
    INSERT INTO public.gdpr_requests (company_id, subject_user_id, request_type, status, requested_by, requested_at, processed_by, processed_at, deadline_date, response_notes)
    VALUES (p.company_id, p.user_id, 'erasure', 'completed', auth.uid(), now(), auth.uid(), now(), CURRENT_DATE, p_reason);
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_user_id, new_values)
  VALUES ('crew_profile', p_profile_id::text, 'ANONYMIZE', auth.uid(),
          jsonb_build_object('reason', p_reason, 'had_login', p.user_id IS NOT NULL));
END;
$$;

-- ---------------------------------------------------------------
-- 7. Same-day compensation changes
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_compensation_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.hr_register_record(NEW.company_id, NEW.profile_id, 'salary_compensation', NEW.id, 'crew_compensation', COALESCE(NEW.effective_to, NEW.effective_from));
  IF NEW.status = 'active' THEN
    -- Close the previous package the day before the new one starts. When the
    -- new package starts on (or before) the old one's start date the old row
    -- is closed on its own start date so crew_compensation_dates_chk holds.
    UPDATE public.crew_compensation
    SET status = 'superseded',
        effective_to = COALESCE(effective_to, GREATEST(effective_from, NEW.effective_from - 1)),
        updated_at = now()
    WHERE profile_id = NEW.profile_id AND id <> NEW.id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;
