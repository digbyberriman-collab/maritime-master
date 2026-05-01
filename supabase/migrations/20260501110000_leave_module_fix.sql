-- =============================================
-- LEAVE MODULE FIX MIGRATION
-- - Adds leave policy settings (company default + vessel/crew overrides)
-- - Adds 'cancelled' + HoD review states to crew_leave_requests
-- - Adds explicit reversal/cancellation columns
-- - Adds dedicated leave audit log
-- - Tightens RLS so non-officers see only their own leave entries / requests
-- - Adds annual leave entitlement column on profiles
-- =============================================

-- ---------- Profile leave fields ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS leave_accrual_method TEXT
    CHECK (leave_accrual_method IN ('monthly','daily','contract','rotation','none')),
  ADD COLUMN IF NOT EXISTS rotation_pattern TEXT;

-- ---------- Leave policies ----------
CREATE TABLE IF NOT EXISTS public.leave_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  crew_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  -- Days of paid annual leave per full year of service.
  annual_entitlement_days NUMERIC(5,2) NOT NULL DEFAULT 28,
  -- One of monthly | daily | contract | rotation
  accrual_method TEXT NOT NULL DEFAULT 'monthly'
    CHECK (accrual_method IN ('monthly','daily','contract','rotation')),
  -- Rounding: 0 = no rounding, 0.5 = half-day, 1 = full-day
  rounding_step NUMERIC(3,2) NOT NULL DEFAULT 0,
  -- Whether booked-but-not-yet-taken leave reduces the available balance
  booked_deducts_available BOOLEAN NOT NULL DEFAULT true,
  -- Sick / training / unpaid leave inclusion in balance maths
  sick_affects_balance BOOLEAN NOT NULL DEFAULT false,
  training_affects_balance BOOLEAN NOT NULL DEFAULT false,
  unpaid_affects_balance BOOLEAN NOT NULL DEFAULT false,
  -- Pro-rate accrual for partial months / start mid-month
  prorate_partial_months BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(user_id)
);

ALTER TABLE public.leave_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View leave policies in company"
  ON public.leave_policies FOR SELECT
  USING (
    company_id IS NULL
    OR public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "Manage leave policies"
  ON public.leave_policies FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser']::public.app_role[]));

CREATE INDEX IF NOT EXISTS idx_leave_policies_company ON public.leave_policies(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_policies_vessel ON public.leave_policies(vessel_id);
CREATE INDEX IF NOT EXISTS idx_leave_policies_crew ON public.leave_policies(crew_id);

-- ---------- crew_leave_requests upgrades ----------
-- Drop the existing CHECK and re-add expanded one for new statuses
DO $$
DECLARE conname TEXT;
BEGIN
  FOR conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.crew_leave_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.crew_leave_requests DROP CONSTRAINT ' || quote_ident(conname);
  END LOOP;
END $$;

ALTER TABLE public.crew_leave_requests
  ADD CONSTRAINT crew_leave_requests_status_check
  CHECK (status IN ('draft','requested','hod_reviewed','approved','rejected','declined','cancelled','completed','pending'));

ALTER TABLE public.crew_leave_requests
  ADD COLUMN IF NOT EXISTS hod_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hod_reviewed_by UUID REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS hod_review_notes TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ---------- Tighten RLS so crew only see their own leave ----------
DROP POLICY IF EXISTS "Users can view leave entries in their company" ON public.crew_leave_entries;
CREATE POLICY "View leave entries scoped"
  ON public.crew_leave_entries FOR SELECT
  USING (
    -- Self
    crew_id = auth.uid()
    -- Officers / fleet management see all in company
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer']::public.app_role[])
    )
  );

DROP POLICY IF EXISTS "Users can insert leave entries in their company" ON public.crew_leave_entries;
CREATE POLICY "Insert leave entries scoped"
  ON public.crew_leave_entries FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      crew_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[])
    )
  );

DROP POLICY IF EXISTS "Users can update leave entries in their company" ON public.crew_leave_entries;
CREATE POLICY "Update leave entries scoped"
  ON public.crew_leave_entries FOR UPDATE
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      crew_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[])
    )
  );

DROP POLICY IF EXISTS "Users can delete leave entries in their company" ON public.crew_leave_entries;
CREATE POLICY "Delete leave entries scoped"
  ON public.crew_leave_entries FOR DELETE
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      crew_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[])
    )
  );

DROP POLICY IF EXISTS "Users can view leave requests in their company" ON public.crew_leave_requests;
CREATE POLICY "View leave requests scoped"
  ON public.crew_leave_requests FOR SELECT
  USING (
    crew_id = auth.uid()
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser','hod','chief_officer','chief_engineer']::public.app_role[])
    )
  );

DROP POLICY IF EXISTS "Users can insert leave requests in their company" ON public.crew_leave_requests;
CREATE POLICY "Insert leave requests scoped"
  ON public.crew_leave_requests FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      crew_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[])
    )
  );

DROP POLICY IF EXISTS "Users can update leave requests in their company" ON public.crew_leave_requests;
CREATE POLICY "Update leave requests scoped"
  ON public.crew_leave_requests FOR UPDATE
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      (crew_id = auth.uid() AND status IN ('draft','requested','pending'))
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod']::public.app_role[])
    )
  );

-- ---------- Leave audit log ----------
CREATE TABLE IF NOT EXISTS public.crew_leave_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  vessel_id UUID REFERENCES public.vessels(id),
  crew_id UUID REFERENCES public.profiles(user_id),
  actor_id UUID REFERENCES public.profiles(user_id),
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.crew_leave_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View leave audit log"
  ON public.crew_leave_audit_log FOR SELECT
  USING (
    crew_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','captain','purser','hod','auditor_flag','auditor_class']::public.app_role[])
  );

CREATE POLICY "Insert leave audit log"
  ON public.crew_leave_audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_crew_leave_audit_crew ON public.crew_leave_audit_log(crew_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_leave_audit_vessel ON public.crew_leave_audit_log(vessel_id, created_at DESC);

-- ---------- Triggers ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_leave_policies_updated_at') THEN
    CREATE TRIGGER set_leave_policies_updated_at BEFORE UPDATE ON public.leave_policies
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ---------- Default global policy ----------
INSERT INTO public.leave_policies (id, company_id, vessel_id, crew_id, name, is_default,
  annual_entitlement_days, accrual_method, rounding_step,
  booked_deducts_available, sick_affects_balance, training_affects_balance, unpaid_affects_balance,
  prorate_partial_months, notes)
VALUES (
  '00000000-0000-0000-0000-00000000bbbb',
  NULL, NULL, NULL, 'Default Annual Leave (28 days)', true,
  28, 'monthly', 0,
  true, false, false, false,
  true,
  'Default policy: 28 days/year accrued monthly with pro-rata for partial months.'
) ON CONFLICT (id) DO NOTHING;
