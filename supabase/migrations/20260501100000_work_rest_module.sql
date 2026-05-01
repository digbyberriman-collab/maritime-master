-- =============================================
-- HOURS OF WORK AND REST MODULE
-- Extends the existing hours_of_rest_records system into a full
-- compliance-managed Work/Rest module per MLC/STCW requirements.
-- =============================================

-- ---------- Profile extensions ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hod_user_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rank TEXT,
  ADD COLUMN IF NOT EXISTS employment_status TEXT,
  ADD COLUMN IF NOT EXISTS watch_pattern TEXT,
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS leaving_date DATE;

-- ---------- Vessel level rule sets ----------
CREATE TABLE IF NOT EXISTS public.work_rest_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  -- All thresholds configurable
  min_rest_per_24h NUMERIC(4,2) NOT NULL DEFAULT 10.0,
  min_rest_per_7d NUMERIC(5,2) NOT NULL DEFAULT 77.0,
  max_rest_periods_per_24h INTEGER NOT NULL DEFAULT 2,
  min_long_rest_block NUMERIC(4,2) NOT NULL DEFAULT 6.0,
  max_interval_between_rest NUMERIC(4,2) NOT NULL DEFAULT 14.0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(user_id)
);

ALTER TABLE public.work_rest_rule_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View rule sets in company"
  ON public.work_rest_rule_sets FOR SELECT
  USING (
    company_id IS NULL
    OR public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "Admins manage rule sets"
  ON public.work_rest_rule_sets FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain']::public.app_role[]));

-- ---------- Vessel-level operational settings ----------
CREATE TABLE IF NOT EXISTS public.vessel_work_rest_settings (
  vessel_id UUID PRIMARY KEY REFERENCES public.vessels(id) ON DELETE CASCADE,
  rule_set_id UUID REFERENCES public.work_rest_rule_sets(id) ON DELETE SET NULL,
  default_unmarked_as_rest BOOLEAN NOT NULL DEFAULT true,
  cutoff_day_of_month INTEGER NOT NULL DEFAULT 1,
  reminder_days_before_lock INTEGER NOT NULL DEFAULT 3,
  timezone TEXT DEFAULT 'UTC',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(user_id)
);

ALTER TABLE public.vessel_work_rest_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View vessel work/rest settings"
  ON public.vessel_work_rest_settings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vessels v
    WHERE v.id = vessel_id
    AND public.user_belongs_to_company(auth.uid(), v.company_id)
  ));

CREATE POLICY "Admins manage vessel work/rest settings"
  ON public.vessel_work_rest_settings FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain']::public.app_role[]));

-- ---------- Monthly submission (the parent record per crew per month) ----------
CREATE TABLE IF NOT EXISTS public.work_rest_monthly_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','crew_signed','hod_reviewed','hod_signed','captain_reviewed','locked','reopened')),
  rule_set_id UUID REFERENCES public.work_rest_rule_sets(id),
  total_work_hours NUMERIC(6,2) DEFAULT 0,
  total_rest_hours NUMERIC(6,2) DEFAULT 0,
  open_non_conformities INTEGER DEFAULT 0,
  is_compliant BOOLEAN,
  submitted_at TIMESTAMPTZ,
  crew_signed_at TIMESTAMPTZ,
  hod_signed_at TIMESTAMPTZ,
  captain_reviewed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  reopened_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES public.profiles(user_id),
  reopen_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crew_id, period_year, period_month)
);

ALTER TABLE public.work_rest_monthly_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crew view own submission"
  ON public.work_rest_monthly_submissions FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer','auditor_flag','auditor_class']::public.app_role[])
  );

CREATE POLICY "Crew create own submission"
  ON public.work_rest_monthly_submissions FOR INSERT
  WITH CHECK (crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[]));

CREATE POLICY "Authorized update of submission"
  ON public.work_rest_monthly_submissions FOR UPDATE
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[])
  );

CREATE INDEX IF NOT EXISTS idx_wr_monthly_crew_period
  ON public.work_rest_monthly_submissions(crew_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_wr_monthly_vessel_period
  ON public.work_rest_monthly_submissions(vessel_id, period_year, period_month, status);

-- ---------- Per-day record ----------
CREATE TABLE IF NOT EXISTS public.work_rest_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.work_rest_monthly_submissions(id) ON DELETE CASCADE,
  crew_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE NOT NULL,
  record_date DATE NOT NULL,
  total_work_minutes INTEGER DEFAULT 0,
  total_rest_minutes INTEGER DEFAULT 1440,
  longest_rest_minutes INTEGER DEFAULT 0,
  rest_period_count INTEGER DEFAULT 0,
  is_compliant BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crew_id, record_date)
);

ALTER TABLE public.work_rest_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crew view own records"
  ON public.work_rest_records FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer','auditor_flag','auditor_class']::public.app_role[])
  );

CREATE POLICY "Crew manage own records"
  ON public.work_rest_records FOR ALL
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[])
  );

CREATE INDEX IF NOT EXISTS idx_wr_records_crew_date
  ON public.work_rest_records(crew_id, record_date);
CREATE INDEX IF NOT EXISTS idx_wr_records_submission
  ON public.work_rest_records(submission_id);

-- ---------- Individual work blocks ----------
CREATE TABLE IF NOT EXISTS public.work_rest_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID REFERENCES public.work_rest_records(id) ON DELETE CASCADE NOT NULL,
  crew_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  block_type TEXT NOT NULL DEFAULT 'work' CHECK (block_type IN ('work','rest')),
  category TEXT,
  -- minutes from local-day midnight (0-1440)
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (end_minute > start_minute)
);

ALTER TABLE public.work_rest_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View blocks via record visibility"
  ON public.work_rest_blocks FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer','auditor_flag','auditor_class']::public.app_role[])
  );

CREATE POLICY "Manage blocks via record"
  ON public.work_rest_blocks FOR ALL
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[])
  );

CREATE INDEX IF NOT EXISTS idx_wr_blocks_record
  ON public.work_rest_blocks(record_id);

-- ---------- Compliance results (rolling-window summaries) ----------
CREATE TABLE IF NOT EXISTS public.work_rest_compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  submission_id UUID REFERENCES public.work_rest_monthly_submissions(id) ON DELETE CASCADE,
  check_window TEXT NOT NULL CHECK (check_window IN ('rolling_24h','rolling_7d','daily')),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  rest_minutes INTEGER NOT NULL,
  work_minutes INTEGER NOT NULL,
  passes BOOLEAN NOT NULL,
  threshold_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.work_rest_compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own compliance checks"
  ON public.work_rest_compliance_checks FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer','auditor_flag','auditor_class']::public.app_role[])
  );

CREATE POLICY "System manages compliance checks"
  ON public.work_rest_compliance_checks FOR ALL
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','hod']::public.app_role[])
  );

CREATE INDEX IF NOT EXISTS idx_wr_checks_submission
  ON public.work_rest_compliance_checks(submission_id);

-- ---------- Non conformities ----------
CREATE TABLE IF NOT EXISTS public.work_rest_non_conformities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  submission_id UUID REFERENCES public.work_rest_monthly_submissions(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  rule_description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  measured_value NUMERIC(8,2),
  threshold_value NUMERIC(8,2),
  suggested_correction TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewed','justified','corrected','accepted_by_captain','dismissed')),
  justification TEXT,
  reviewer_id UUID REFERENCES public.profiles(user_id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.work_rest_non_conformities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own NCs"
  ON public.work_rest_non_conformities FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer','auditor_flag','auditor_class']::public.app_role[])
  );

CREATE POLICY "Manage NCs"
  ON public.work_rest_non_conformities FOR ALL
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','hod']::public.app_role[])
  );

CREATE INDEX IF NOT EXISTS idx_wr_nc_submission
  ON public.work_rest_non_conformities(submission_id, status);

-- ---------- Notes (free text against day or block) ----------
CREATE TABLE IF NOT EXISTS public.work_rest_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.work_rest_monthly_submissions(id) ON DELETE CASCADE,
  record_id UUID REFERENCES public.work_rest_records(id) ON DELETE CASCADE,
  block_id UUID REFERENCES public.work_rest_blocks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(user_id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.work_rest_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View notes"
  ON public.work_rest_notes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.work_rest_monthly_submissions s
    WHERE s.id = submission_id
    AND (
      s.crew_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer','auditor_flag','auditor_class']::public.app_role[])
    )
  ));

CREATE POLICY "Manage own notes"
  ON public.work_rest_notes FOR ALL
  USING (author_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','hod']::public.app_role[]));

-- ---------- Signatures (crew, HoD, captain) ----------
CREATE TABLE IF NOT EXISTS public.work_rest_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.work_rest_monthly_submissions(id) ON DELETE CASCADE NOT NULL,
  signer_id UUID REFERENCES public.profiles(user_id) NOT NULL,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('crew','hod','captain','purser','dpa')),
  signature_method TEXT NOT NULL DEFAULT 'electronic'
    CHECK (signature_method IN ('electronic','wet_ink_scanned','token')),
  signature_payload JSONB,
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(submission_id, signer_role)
);

ALTER TABLE public.work_rest_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View signatures"
  ON public.work_rest_signatures FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.work_rest_monthly_submissions s
    WHERE s.id = submission_id
    AND (
      s.crew_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer','auditor_flag','auditor_class']::public.app_role[])
    )
  ));

CREATE POLICY "Authorized sign"
  ON public.work_rest_signatures FOR INSERT
  WITH CHECK (signer_id = auth.uid());

-- ---------- Audit log (work/rest specific) ----------
CREATE TABLE IF NOT EXISTS public.work_rest_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.work_rest_monthly_submissions(id) ON DELETE CASCADE,
  crew_id UUID REFERENCES public.profiles(user_id),
  actor_id UUID REFERENCES public.profiles(user_id),
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.work_rest_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View audit log"
  ON public.work_rest_audit_log FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','hod','auditor_flag','auditor_class']::public.app_role[])
  );

CREATE POLICY "Insert audit log"
  ON public.work_rest_audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_wr_audit_submission
  ON public.work_rest_audit_log(submission_id, created_at DESC);

-- ---------- updated_at triggers ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_wr_monthly_updated_at') THEN
    CREATE TRIGGER set_wr_monthly_updated_at BEFORE UPDATE ON public.work_rest_monthly_submissions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_wr_records_updated_at') THEN
    CREATE TRIGGER set_wr_records_updated_at BEFORE UPDATE ON public.work_rest_records
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_wr_blocks_updated_at') THEN
    CREATE TRIGGER set_wr_blocks_updated_at BEFORE UPDATE ON public.work_rest_blocks
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_wr_nc_updated_at') THEN
    CREATE TRIGGER set_wr_nc_updated_at BEFORE UPDATE ON public.work_rest_non_conformities
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_wr_rule_updated_at') THEN
    CREATE TRIGGER set_wr_rule_updated_at BEFORE UPDATE ON public.work_rest_rule_sets
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ---------- Default global rule set (MLC/STCW baseline) ----------
INSERT INTO public.work_rest_rule_sets (id, company_id, vessel_id, name, is_default,
  min_rest_per_24h, min_rest_per_7d, max_rest_periods_per_24h, min_long_rest_block, max_interval_between_rest, notes)
VALUES (
  '00000000-0000-0000-0000-00000000aaaa',
  NULL, NULL, 'MLC/STCW Default', true,
  10.0, 77.0, 2, 6.0, 14.0,
  'Maritime Labour Convention / STCW baseline rest hour rules.'
) ON CONFLICT (id) DO NOTHING;
