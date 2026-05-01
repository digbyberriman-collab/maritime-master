-- =================================================================
-- LEAVE MANAGEMENT UPGRADE
-- =================================================================
-- Adds policy, balance-adjustment and entitlement support, fixes
-- the leave-request status check (cancelled), broadens leave
-- entitlement on profiles, and indexes lookups used by the planner.
-- =================================================================

-- 1. Per-crew employment / leave fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_start_date DATE,
  ADD COLUMN IF NOT EXISTS annual_leave_entitlement NUMERIC,
  ADD COLUMN IF NOT EXISTS leave_accrual_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rotation_pattern VARCHAR(40);

COMMENT ON COLUMN public.profiles.employment_start_date IS
  'Employment / company start date — anchor for leave accrual when contract_start_date is null.';
COMMENT ON COLUMN public.profiles.annual_leave_entitlement IS
  'Per-crew override of the annual leave entitlement (days). Falls back to vessel/company policy when null.';
COMMENT ON COLUMN public.profiles.leave_accrual_method IS
  'Per-crew override: monthly | daily | rotation | contract.';
COMMENT ON COLUMN public.profiles.rotation_pattern IS
  'Rotation pattern label (e.g. "2:2", "3:3", "60/30"). Used by leave projection.';

-- 2. Leave policies (company / vessel scope)
CREATE TABLE IF NOT EXISTS public.crew_leave_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  scope_label TEXT NOT NULL DEFAULT 'company',
  default_annual_entitlement NUMERIC NOT NULL DEFAULT 60,
  accrual_method VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (accrual_method IN ('monthly', 'daily', 'rotation', 'contract')),
  monthly_accrual_days NUMERIC NOT NULL DEFAULT 5,
  pro_rata BOOLEAN NOT NULL DEFAULT true,
  rounding VARCHAR(10) NOT NULL DEFAULT 'half'
    CHECK (rounding IN ('none', 'half', 'whole')),
  booked_deducts BOOLEAN NOT NULL DEFAULT true,
  sick_affects_balance BOOLEAN NOT NULL DEFAULT false,
  training_affects_balance BOOLEAN NOT NULL DEFAULT false,
  unpaid_affects_balance BOOLEAN NOT NULL DEFAULT false,
  default_rotation VARCHAR(40),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only one policy row per scope (company or vessel)
  UNIQUE (company_id, vessel_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_leave_policies_company
  ON public.crew_leave_policies (company_id);
CREATE INDEX IF NOT EXISTS idx_crew_leave_policies_vessel
  ON public.crew_leave_policies (vessel_id);

ALTER TABLE public.crew_leave_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view leave policies in their company" ON public.crew_leave_policies;
CREATE POLICY "Users can view leave policies in their company"
  ON public.crew_leave_policies FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Authorized users can manage leave policies" ON public.crew_leave_policies;
CREATE POLICY "Authorized users can manage leave policies"
  ON public.crew_leave_policies FOR ALL
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('dpa', 'shore_management', 'master')
    )
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('dpa', 'shore_management', 'master')
    )
  );

CREATE TRIGGER update_crew_leave_policies_updated_at
  BEFORE UPDATE ON public.crew_leave_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Manual balance adjustments (audit-friendly)
CREATE TABLE IF NOT EXISTS public.crew_leave_balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  adjustment_days NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_leave_balance_adjustments_crew
  ON public.crew_leave_balance_adjustments (crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_leave_balance_adjustments_company
  ON public.crew_leave_balance_adjustments (company_id);

ALTER TABLE public.crew_leave_balance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view balance adjustments in their company"
  ON public.crew_leave_balance_adjustments;
CREATE POLICY "Users can view balance adjustments in their company"
  ON public.crew_leave_balance_adjustments FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Authorized users can insert balance adjustments"
  ON public.crew_leave_balance_adjustments;
CREATE POLICY "Authorized users can insert balance adjustments"
  ON public.crew_leave_balance_adjustments FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('dpa', 'shore_management', 'master')
    )
  );

-- 4. Allow 'cancelled' on the new request workflow
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'crew_leave_requests'
      AND constraint_name = 'crew_leave_requests_status_check'
  ) THEN
    ALTER TABLE public.crew_leave_requests
      DROP CONSTRAINT crew_leave_requests_status_check;
  END IF;
END
$$;

ALTER TABLE public.crew_leave_requests
  ADD CONSTRAINT crew_leave_requests_status_check
  CHECK (status IN ('draft','pending','approved','declined','cancelled','completed'));

ALTER TABLE public.crew_leave_requests
  ADD COLUMN IF NOT EXISTS hod_reviewed_by UUID REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS hod_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_crew_leave_requests_crew
  ON public.crew_leave_requests (crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_leave_requests_vessel
  ON public.crew_leave_requests (vessel_id);
CREATE INDEX IF NOT EXISTS idx_crew_leave_requests_dates
  ON public.crew_leave_requests (start_date, end_date);

-- 5. Helper: leave-domain audit log convenience view (re-uses audit_logs table)
COMMENT ON TABLE public.audit_logs IS
  'Generic audit trail. entity_type values include: crew_profile, leave_request, leave_entry, leave_policy, leave_balance_adjustment, leave_calendar_lock.';
