CREATE OR REPLACE FUNCTION public.hr_archive_due_records(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
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
  IF p.company_id <> public.get_user_company_id(auth.uid()) THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.crew_assignments ca WHERE ca.user_id = p.user_id AND ca.is_current) THEN
    RAISE EXCEPTION 'Crew member still has a current assignment';
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
  DELETE FROM public.performance_review_welfare_notes w
    USING public.performance_reviews r WHERE w.review_id = r.id AND r.profile_id = p_profile_id;
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

  INSERT INTO public.gdpr_requests (company_id, subject_user_id, request_type, status, requested_by, requested_at, processed_by, processed_at, deadline_date, response_notes)
  VALUES (p.company_id, COALESCE(p.user_id, auth.uid()), 'erasure', 'completed', auth.uid(), now(), auth.uid(), now(), CURRENT_DATE, p_reason);

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_user_id, new_values)
  VALUES ('crew_profile', p_profile_id, 'ANONYMIZE', auth.uid(), jsonb_build_object('reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_record_access_log(p_record_type text, p_record_id uuid, p_profile_id uuid, p_context text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.get_user_company_id(auth.uid());
  IF v_company IS NULL THEN RETURN; END IF;
  INSERT INTO public.compliance_access_log (company_id, user_id, user_role, module, action, entity_type, entity_id, accessed_fields, is_audit_mode)
  VALUES (v_company, auth.uid(), COALESCE(public.legacy_profile_role(auth.uid()), 'unknown'), 'hr', 'view', p_record_type, p_record_id,
          CASE WHEN p_context IS NULL THEN NULL ELSE ARRAY[p_context] END, false);
EXCEPTION WHEN undefined_column OR undefined_table OR check_violation THEN
  RETURN;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('hr-archive-due-records', '40 0 * * *', $cron$SELECT public.hr_archive_due_records()$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

DROP POLICY IF EXISTS "gratuity_pools_select" ON public.gratuity_pools;
CREATE POLICY "gratuity_pools_select" ON public.gratuity_pools
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.payroll_can_view(auth.uid())
      OR (
        status IN ('approved', 'distributed')
        AND EXISTS (
          SELECT 1 FROM public.gratuity_distributions gd
          WHERE gd.pool_id = gratuity_pools.id AND gd.profile_id = public.my_profile_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS "gratuity_distributions_select" ON public.gratuity_distributions;
CREATE POLICY "gratuity_distributions_select" ON public.gratuity_distributions
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.payroll_can_view(auth.uid())
      OR (
        profile_id = public.my_profile_id()
        AND EXISTS (SELECT 1 FROM public.gratuity_pools gp WHERE gp.id = pool_id AND gp.status IN ('approved', 'distributed'))
      )
    )
  );

DROP POLICY IF EXISTS "payroll_runs_select" ON public.payroll_runs;
CREATE POLICY "payroll_runs_select" ON public.payroll_runs
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.payroll_can_view(auth.uid())
      OR (status = 'paid' AND EXISTS (
        SELECT 1 FROM public.payroll_lines pl
        WHERE pl.run_id = payroll_runs.id AND pl.profile_id = public.my_profile_id() AND pl.status = 'paid'))
    )
  );

DROP POLICY IF EXISTS "pay_periods_select" ON public.pay_periods;
CREATE POLICY "pay_periods_select" ON public.pay_periods
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.payroll_can_view(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.payroll_runs r JOIN public.payroll_lines pl ON pl.run_id = r.id
        WHERE r.pay_period_id = pay_periods.id AND pl.profile_id = public.my_profile_id() AND pl.status = 'paid')
    )
  );

CREATE OR REPLACE FUNCTION public.payroll_lines_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.payroll_runs WHERE id = NEW.run_id;
  IF v_status NOT IN ('draft', 'calculated') AND (
       NEW.other_earnings_minor IS DISTINCT FROM OLD.other_earnings_minor
    OR NEW.deductions_minor IS DISTINCT FROM OLD.deductions_minor
    OR NEW.gross_minor IS DISTINCT FROM OLD.gross_minor
    OR NEW.net_minor IS DISTINCT FROM OLD.net_minor
    OR NEW.prorated_base_minor IS DISTINCT FROM OLD.prorated_base_minor
    OR NEW.allowances_minor IS DISTINCT FROM OLD.allowances_minor
    OR NEW.gratuity_minor IS DISTINCT FROM OLD.gratuity_minor
    OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'paid')
  ) THEN
    RAISE EXCEPTION 'Payroll lines cannot be adjusted once the run is %', v_status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_payroll_lines_guard ON public.payroll_lines;
CREATE TRIGGER trg_payroll_lines_guard BEFORE UPDATE ON public.payroll_lines
  FOR EACH ROW EXECUTE FUNCTION public.payroll_lines_guard();

DROP POLICY IF EXISTS "HR can view crew audit logs" ON public.audit_logs;
CREATE POLICY "HR can view crew audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    public.hr_can_view(auth.uid())
    AND entity_type IN (
      'crew_profile', 'profile', 'crew_member', 'crew_assignment', 'crew_contract', 'crew_next_of_kin',
      'crew_certificate', 'crew_attachment', 'performance_review', 'crew_objective', 'disciplinary_record',
      'crew_compensation', 'pay_review', 'payroll_run', 'payroll_line', 'gratuity_pool', 'gratuity_distribution',
      'hr_record_metadata', 'vacancy', 'candidate', 'candidate_application', 'onboarding_record', 'onboarding_item',
      'crew_work_authorisation', 'pay_grade', 'pay_period', 'fx_rate', 'hr_company_settings'
    )
    AND (entity_type <> 'disciplinary_record' OR public.hr_can_edit(auth.uid()))
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE (p.id::text = audit_logs.entity_id::text OR p.user_id::text = audit_logs.entity_id::text)
          AND p.company_id = public.get_user_company_id(auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.crew_assignments ca
        JOIN public.profiles p ON p.user_id = ca.user_id
        WHERE ca.id::text = audit_logs.entity_id::text AND p.company_id = public.get_user_company_id(auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.hr_record_metadata m
        WHERE m.record_id::text = audit_logs.entity_id::text AND m.company_id = public.get_user_company_id(auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles a
        WHERE a.user_id = audit_logs.actor_user_id AND a.company_id = public.get_user_company_id(auth.uid())
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.performance_review_welfare_notes (
  review_id uuid PRIMARY KEY REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  notes text,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_review_welfare_notes TO authenticated;
GRANT ALL ON public.performance_review_welfare_notes TO service_role;
ALTER TABLE public.performance_review_welfare_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "performance_review_welfare_notes_rw" ON public.performance_review_welfare_notes;
CREATE POLICY "performance_review_welfare_notes_rw" ON public.performance_review_welfare_notes
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.hr_can_edit(auth.uid())
      OR EXISTS (SELECT 1 FROM public.performance_reviews r WHERE r.id = review_id AND r.reviewer_profile_id = public.my_profile_id())
    )
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.hr_can_edit(auth.uid())
      OR EXISTS (SELECT 1 FROM public.performance_reviews r WHERE r.id = review_id AND r.reviewer_profile_id = public.my_profile_id())
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performance_reviews' AND column_name = 'welfare_notes') THEN
    INSERT INTO public.performance_review_welfare_notes (review_id, company_id, notes)
    SELECT id, company_id, welfare_notes FROM public.performance_reviews WHERE welfare_notes IS NOT NULL
    ON CONFLICT (review_id) DO NOTHING;
    ALTER TABLE public.performance_reviews DROP COLUMN welfare_notes;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_interviews_interviewers ON public.interviews USING gin (interviewer_profile_ids);
CREATE INDEX IF NOT EXISTS idx_interviews_company_status_time ON public.interviews (company_id, status, scheduled_at);

CREATE OR REPLACE VIEW public.hr_performance_due_items
WITH (security_invoker = true) AS
  SELECT 'review'::text AS item_type, r.id AS record_id, r.company_id, r.profile_id, p.user_id,
         p.first_name || ' ' || p.last_name AS crew_name, r.vessel_id,
         r.review_type AS label, r.status, r.due_date, (r.due_date - CURRENT_DATE) AS days_remaining
  FROM public.performance_reviews r JOIN public.profiles p ON p.id = r.profile_id
  WHERE r.status NOT IN ('completed', 'cancelled') AND r.due_date IS NOT NULL
UNION ALL
  SELECT 'objective', o.id, o.company_id, o.profile_id, p.user_id,
         p.first_name || ' ' || p.last_name, NULL::uuid,
         o.title, o.status, o.target_date, (o.target_date - CURRENT_DATE)
  FROM public.crew_objectives o JOIN public.profiles p ON p.id = o.profile_id
  WHERE o.status IN ('not_started', 'in_progress') AND o.target_date IS NOT NULL
UNION ALL
  SELECT 'warning', d.id, d.company_id, d.profile_id, p.user_id,
         p.first_name || ' ' || p.last_name, d.vessel_id,
         d.stage, d.status, d.expiry_date, (d.expiry_date - CURRENT_DATE)
  FROM public.disciplinary_records d JOIN public.profiles p ON p.id = d.profile_id
  WHERE d.status IN ('open', 'closed') AND d.expiry_date IS NOT NULL
UNION ALL
  SELECT 'onboarding_item', i.id, i.company_id, rec.profile_id, p.user_id,
         p.first_name || ' ' || p.last_name, rec.vessel_id,
         i.section || ': ' || i.title, CASE WHEN i.completed THEN 'completed' ELSE 'open' END, i.due_date, (i.due_date - CURRENT_DATE)
  FROM public.onboarding_items i
  JOIN public.onboarding_records rec ON rec.id = i.record_id
  JOIN public.profiles p ON p.id = rec.profile_id
  WHERE NOT i.completed AND i.required AND rec.status IN ('not_started', 'in_progress') AND i.due_date IS NOT NULL;