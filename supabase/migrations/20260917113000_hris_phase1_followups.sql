-- =================================================================
-- HRIS PHASE 1 FOLLOW-UPS
-- =================================================================
-- 1. HR-level roles can read audit rows for profiles in their company
--    (the legacy policy only covered dpa/shore_management/master).
-- 2. Company index on crew_next_of_kin for the coverage query.
-- 3. profiles.visa_expiry so visas can be tracked like passports.
-- =================================================================

DROP POLICY IF EXISTS "HR can view crew audit logs" ON public.audit_logs;
CREATE POLICY "HR can view crew audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    public.hr_can_view(auth.uid())
    AND entity_type IN ('crew_profile', 'profile', 'crew_member', 'crew_assignment', 'crew_contract', 'crew_next_of_kin', 'crew_certificate', 'crew_attachment')
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE (p.id::text = audit_logs.entity_id OR p.user_id::text = audit_logs.entity_id)
          AND p.company_id = public.get_user_company_id(auth.uid())
      )
      OR (
        entity_type = 'crew_assignment'
        AND EXISTS (
          SELECT 1 FROM public.crew_assignments ca
          JOIN public.profiles p ON p.user_id = ca.user_id
          WHERE ca.id::text = audit_logs.entity_id
            AND p.company_id = public.get_user_company_id(auth.uid())
        )
      )
      OR (
        entity_type IN ('crew_contract', 'crew_next_of_kin')
        AND EXISTS (
          SELECT 1 FROM public.hr_record_metadata m
          WHERE m.record_id::text = audit_logs.entity_id
            AND m.company_id = public.get_user_company_id(auth.uid())
        )
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_crew_assignments_leave_date ON public.crew_assignments(leave_date) WHERE leave_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crew_next_of_kin_company ON public.crew_next_of_kin(company_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visa_expiry date;
COMMENT ON COLUMN public.profiles.visa_expiry IS 'Expiry of the visa described in visa_status; feeds hr_expiry_items.';

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
  SELECT 'probation', c.id, c.company_id, c.profile_id, p.user_id,
    p.first_name || ' ' || p.last_name, c.vessel_id,
    'Probation', c.probation_end_date, (c.probation_end_date - CURRENT_DATE)
  FROM public.crew_contracts c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.status = 'active' AND c.probation_end_date IS NOT NULL
UNION ALL
  SELECT 'passport', p.id, p.company_id, p.id, p.user_id,
    p.first_name || ' ' || p.last_name, NULL::uuid,
    'Passport', p.passport_expiry, (p.passport_expiry - CURRENT_DATE)
  FROM public.profiles p
  WHERE p.passport_expiry IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT 'visa', p.id, p.company_id, p.id, p.user_id,
    p.first_name || ' ' || p.last_name, NULL::uuid,
    COALESCE('Visa: ' || NULLIF(p.visa_status, ''), 'Visa'), p.visa_expiry, (p.visa_expiry - CURRENT_DATE)
  FROM public.profiles p
  WHERE p.visa_expiry IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT 'medical', p.id, p.company_id, p.id, p.user_id,
    p.first_name || ' ' || p.last_name, NULL::uuid,
    'Medical certificate', p.medical_expiry, (p.medical_expiry - CURRENT_DATE)
  FROM public.profiles p
  WHERE p.medical_expiry IS NOT NULL AND p.company_id IS NOT NULL
UNION ALL
  SELECT 'certificate', cc.id, p.company_id, p.id, cc.user_id,
    p.first_name || ' ' || p.last_name, NULL::uuid,
    cc.certificate_name, cc.expiry_date, (cc.expiry_date - CURRENT_DATE)
  FROM public.crew_certificates cc
  JOIN public.profiles p ON p.user_id = cc.user_id
  WHERE cc.expiry_date IS NOT NULL AND p.company_id IS NOT NULL;

-- 4. Stored contract status catches up with the calendar (pg_cron if present).
CREATE OR REPLACE FUNCTION public.hr_expire_overrun_contracts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.crew_contracts
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND end_date IS NOT NULL AND end_date < CURRENT_DATE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('hr-expire-contracts', '15 0 * * *', $cron$SELECT public.hr_expire_overrun_contracts()$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;
