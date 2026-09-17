-- =================================================================
-- HRIS PHASE 2: COMPENSATION ENGINE
-- =================================================================
-- Money is stored as integer minor units (cents) with an ISO-4217 code.
--
-- 1. finance RBAC module + helpers (payroll_can_view / edit / admin)
-- 2. hr_company_settings (default currency, pay period, cutoff)
-- 3. fx_rates
-- 4. pay_grades
-- 5. crew_compensation (+ hr_record_metadata registration)
-- 6. crew_bank_details
-- 7. pay_periods
-- 8. gratuity_pools / gratuity_distributions
-- 9. payroll_runs / payroll_lines
-- 10. pay_reviews (+ registration)
-- 11. hr_days_onboard(): days onboard / leave / travel / unpaid per crew
-- 12. payroll_calculate_run(): the pro-rata engine
-- 13. gratuity_calculate_pool(): the gratuity split engine
-- =================================================================

-- ---------------------------------------------------------------
-- 1. finance RBAC module + helpers
-- ---------------------------------------------------------------
INSERT INTO public.modules (key, name, description, route, sort_order, is_active)
VALUES ('finance', 'Finance & Payroll', 'Compensation, payroll runs, gratuities and pay reviews', '/hris/compensation/payroll', 25, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.modules (key, name, description, sort_order, is_active) VALUES
  ('finance.view_compensation', 'Can view compensation', 'See salaries, allowances and pay grades', 930, true),
  ('finance.edit_compensation', 'Can edit compensation', 'Change salaries, pay grades and bank details', 931, true),
  ('finance.run_payroll', 'Can run payroll', 'Create and calculate payroll runs and gratuity pools', 932, true)
ON CONFLICT (key) DO NOTHING;

-- Seed finance module permissions for the standard roles (no-op if roles absent).
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'finance', 'admin'::permission_level, 'fleet'::role_scope_type FROM public.roles r WHERE r.name IN ('superadmin', 'dpa')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'finance', 'edit'::permission_level, 'fleet'::role_scope_type FROM public.roles r WHERE r.name = 'purser'
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, module_key, permission, scope)
SELECT r.id, 'finance', 'view'::permission_level, 'fleet'::role_scope_type FROM public.roles r WHERE r.name = 'fleet_master'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.payroll_can_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['superadmin','dpa']::app_role[])
    OR public.user_has_module_access(_user_id, 'finance', 'admin')
    OR public.legacy_profile_role(_user_id) IN ('dpa', 'shore_management');
$$;

CREATE OR REPLACE FUNCTION public.payroll_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.payroll_can_admin(_user_id)
    OR public.has_any_role(_user_id, ARRAY['purser']::app_role[])
    OR public.user_has_module_access(_user_id, 'finance', 'edit');
$$;

CREATE OR REPLACE FUNCTION public.payroll_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.payroll_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['fleet_master']::app_role[])
    OR public.user_has_module_access(_user_id, 'finance', 'view');
$$;

-- ---------------------------------------------------------------
-- 2. hr_company_settings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_company_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  default_currency char(3) NOT NULL DEFAULT 'EUR',
  pay_period_type text NOT NULL DEFAULT 'calendar_month'
    CHECK (pay_period_type IN ('calendar_month', 'four_weekly', 'rotation')),
  pay_cutoff_day integer NOT NULL DEFAULT 25 CHECK (pay_cutoff_day BETWEEN 1 AND 28),
  pay_day_of_month integer NOT NULL DEFAULT 28 CHECK (pay_day_of_month BETWEEN 1 AND 31),
  unpaid_leave_codes text[] NOT NULL DEFAULT ARRAY['U'],
  travel_days_paid boolean NOT NULL DEFAULT true,
  gratuity_default_method text NOT NULL DEFAULT 'points_days'
    CHECK (gratuity_default_method IN ('equal', 'points', 'days_weighted', 'points_days')),
  gratuity_default_points numeric(8,2) NOT NULL DEFAULT 1.0,
  rounding_minor integer NOT NULL DEFAULT 1 CHECK (rounding_minor IN (1, 5, 10, 100)),
  payslip_footer text,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_company_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hr_company_settings_select" ON public.hr_company_settings;
CREATE POLICY "hr_company_settings_select" ON public.hr_company_settings
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "hr_company_settings_write" ON public.hr_company_settings;
CREATE POLICY "hr_company_settings_write" ON public.hr_company_settings
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_admin(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_admin(auth.uid()));

INSERT INTO public.hr_company_settings (company_id)
SELECT id FROM public.companies ON CONFLICT (company_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hr_company_settings_for(p_company_id uuid)
RETURNS public.hr_company_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.hr_company_settings;
BEGIN
  SELECT * INTO r FROM public.hr_company_settings WHERE company_id = p_company_id;
  IF NOT FOUND THEN
    INSERT INTO public.hr_company_settings (company_id) VALUES (p_company_id)
    ON CONFLICT (company_id) DO NOTHING;
    SELECT * INTO r FROM public.hr_company_settings WHERE company_id = p_company_id;
  END IF;
  RETURN r;
END;
$$;

-- ---------------------------------------------------------------
-- 3. fx_rates
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  base_currency char(3) NOT NULL,
  quote_currency char(3) NOT NULL,
  rate numeric(18,8) NOT NULL CHECK (rate > 0),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  source text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, base_currency, quote_currency, valid_from)
);
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fx_rates_select" ON public.fx_rates;
CREATE POLICY "fx_rates_select" ON public.fx_rates
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id));
DROP POLICY IF EXISTS "fx_rates_write" ON public.fx_rates;
CREATE POLICY "fx_rates_write" ON public.fx_rates
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));

-- Latest rate on or before a date; 1.0 for same currency; inverse if only the
-- reverse pair exists; NULL when unknown.
CREATE OR REPLACE FUNCTION public.fx_rate_for(p_company_id uuid, p_from char(3), p_to char(3), p_on date)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric;
BEGIN
  IF p_from = p_to THEN RETURN 1; END IF;
  SELECT rate INTO v FROM public.fx_rates
  WHERE company_id = p_company_id AND base_currency = p_from AND quote_currency = p_to AND valid_from <= p_on
  ORDER BY valid_from DESC LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT rate INTO v FROM public.fx_rates
  WHERE company_id = p_company_id AND base_currency = p_to AND quote_currency = p_from AND valid_from <= p_on
  ORDER BY valid_from DESC LIMIT 1;
  IF v IS NOT NULL THEN RETURN 1 / v; END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------
-- 4. pay_grades
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pay_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  department text,
  rank text,
  grade_level integer NOT NULL DEFAULT 1,
  step integer NOT NULL DEFAULT 1,
  currency char(3) NOT NULL DEFAULT 'EUR',
  monthly_base_minor bigint NOT NULL DEFAULT 0 CHECK (monthly_base_minor >= 0),
  daily_rate_minor bigint CHECK (daily_rate_minor IS NULL OR daily_rate_minor >= 0),
  gratuity_points numeric(8,2) NOT NULL DEFAULT 1.0,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_pay_grades_company ON public.pay_grades(company_id, is_active);
ALTER TABLE public.pay_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_grades_select" ON public.pay_grades;
CREATE POLICY "pay_grades_select" ON public.pay_grades
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_view(auth.uid()));
DROP POLICY IF EXISTS "pay_grades_write" ON public.pay_grades;
CREATE POLICY "pay_grades_write" ON public.pay_grades
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_pay_grades_updated_at ON public.pay_grades;
CREATE TRIGGER trg_pay_grades_updated_at BEFORE UPDATE ON public.pay_grades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 5. crew_compensation
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_compensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pay_grade_id uuid REFERENCES public.pay_grades(id) ON DELETE SET NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  base_salary_minor bigint NOT NULL DEFAULT 0 CHECK (base_salary_minor >= 0),
  pay_frequency text NOT NULL DEFAULT 'monthly' CHECK (pay_frequency IN ('monthly', 'daily', 'weekly', 'annual')),
  -- [{ "name": "Uniform", "amount_minor": 10000, "taxable": false, "recurring": true, "prorate": true }]
  allowances jsonb NOT NULL DEFAULT '[]'::jsonb,
  gratuity_points numeric(8,2),
  gratuity_eligible boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'superseded')),
  reason text,
  approved_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_compensation_dates_chk CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_crew_compensation_profile ON public.crew_compensation(profile_id, status);
ALTER TABLE public.crew_compensation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_compensation_select" ON public.crew_compensation;
CREATE POLICY "crew_compensation_select" ON public.crew_compensation
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.payroll_can_view(auth.uid()) OR profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "crew_compensation_write" ON public.crew_compensation;
CREATE POLICY "crew_compensation_write" ON public.crew_compensation
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_crew_compensation_updated_at ON public.crew_compensation;
CREATE TRIGGER trg_crew_compensation_updated_at BEFORE UPDATE ON public.crew_compensation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.crew_compensation_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.hr_register_record(NEW.company_id, NEW.profile_id, 'salary_compensation', NEW.id, 'crew_compensation', COALESCE(NEW.effective_to, NEW.effective_from));
  IF NEW.status = 'active' THEN
    UPDATE public.crew_compensation
    SET status = 'superseded',
        effective_to = COALESCE(effective_to, NEW.effective_from - 1),
        updated_at = now()
    WHERE profile_id = NEW.profile_id AND id <> NEW.id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_crew_compensation_after_write ON public.crew_compensation;
CREATE TRIGGER trg_crew_compensation_after_write AFTER INSERT OR UPDATE ON public.crew_compensation
  FOR EACH ROW EXECUTE FUNCTION public.crew_compensation_after_write();

-- ---------------------------------------------------------------
-- 6. crew_bank_details (payroll admins + subject only)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_holder text NOT NULL,
  bank_name text,
  bank_country char(2),
  iban text,
  swift_bic text,
  account_number text,
  sort_code text,
  routing_number text,
  currency char(3),
  is_primary boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crew_bank_details_profile ON public.crew_bank_details(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crew_bank_details_primary ON public.crew_bank_details(profile_id) WHERE is_primary;
ALTER TABLE public.crew_bank_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew_bank_details_select" ON public.crew_bank_details;
CREATE POLICY "crew_bank_details_select" ON public.crew_bank_details
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.payroll_can_edit(auth.uid()) OR profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "crew_bank_details_write" ON public.crew_bank_details;
CREATE POLICY "crew_bank_details_write" ON public.crew_bank_details
  FOR ALL USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.payroll_can_edit(auth.uid()) OR profile_id = public.my_profile_id())
  ) WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.payroll_can_edit(auth.uid()) OR profile_id = public.my_profile_id())
  );
DROP TRIGGER IF EXISTS trg_crew_bank_details_updated_at ON public.crew_bank_details;
CREATE TRIGGER trg_crew_bank_details_updated_at BEFORE UPDATE ON public.crew_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bank changes are always audited (fraud vector).
CREATE OR REPLACE FUNCTION public.crew_bank_details_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_user_id, old_values, new_values)
  VALUES (
    'crew_bank_details',
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN jsonb_build_object('iban', LEFT(COALESCE(OLD.iban,''), 4) || '…', 'account_number', LEFT(COALESCE(OLD.account_number,''), 2) || '…', 'bank_name', OLD.bank_name) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN jsonb_build_object('iban', LEFT(COALESCE(NEW.iban,''), 4) || '…', 'account_number', LEFT(COALESCE(NEW.account_number,''), 2) || '…', 'bank_name', NEW.bank_name) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_crew_bank_details_audit ON public.crew_bank_details;
CREATE TRIGGER trg_crew_bank_details_audit AFTER INSERT OR UPDATE OR DELETE ON public.crew_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.crew_bank_details_audit();

-- ---------------------------------------------------------------
-- 7. pay_periods
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  period_type text NOT NULL DEFAULT 'calendar_month' CHECK (period_type IN ('calendar_month', 'four_weekly', 'rotation', 'custom')),
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
  locked_at timestamptz,
  locked_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pay_periods_dates_chk CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_periods_company_vessel_start
  ON public.pay_periods(company_id, COALESCE(vessel_id, '00000000-0000-0000-0000-000000000000'::uuid), start_date);
ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_periods_select" ON public.pay_periods;
CREATE POLICY "pay_periods_select" ON public.pay_periods
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_view(auth.uid()));
DROP POLICY IF EXISTS "pay_periods_write" ON public.pay_periods;
CREATE POLICY "pay_periods_write" ON public.pay_periods
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));

-- ---------------------------------------------------------------
-- 8. gratuity_pools / gratuity_distributions
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gratuity_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'charter' CHECK (source IN ('charter', 'owner', 'other')),
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  gross_amount_minor bigint NOT NULL CHECK (gross_amount_minor >= 0),
  deductions_minor bigint NOT NULL DEFAULT 0 CHECK (deductions_minor >= 0),
  deductions_note text,
  split_method text NOT NULL DEFAULT 'points_days' CHECK (split_method IN ('equal', 'points', 'days_weighted', 'points_days')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'approved', 'distributed', 'cancelled')),
  calculated_at timestamptz,
  approved_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  approved_at timestamptz,
  distributed_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gratuity_pools_dates_chk CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_gratuity_pools_company ON public.gratuity_pools(company_id, vessel_id, status);
ALTER TABLE public.gratuity_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gratuity_pools_select" ON public.gratuity_pools;
CREATE POLICY "gratuity_pools_select" ON public.gratuity_pools
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_view(auth.uid()));
DROP POLICY IF EXISTS "gratuity_pools_write" ON public.gratuity_pools;
CREATE POLICY "gratuity_pools_write" ON public.gratuity_pools
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_gratuity_pools_updated_at ON public.gratuity_pools;
CREATE TRIGGER trg_gratuity_pools_updated_at BEFORE UPDATE ON public.gratuity_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.gratuity_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.gratuity_pools(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  days_onboard integer NOT NULL DEFAULT 0,
  points numeric(8,2) NOT NULL DEFAULT 1.0,
  weight numeric(14,4) NOT NULL DEFAULT 0,
  share_ratio numeric(12,8) NOT NULL DEFAULT 0,
  amount_minor bigint NOT NULL DEFAULT 0,
  adjustment_minor bigint NOT NULL DEFAULT 0,
  adjustment_reason text,
  excluded boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  payout_status text NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending', 'in_payroll', 'paid', 'cancelled')),
  paid_at timestamptz,
  payroll_line_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_gratuity_distributions_profile ON public.gratuity_distributions(profile_id, payout_status);
ALTER TABLE public.gratuity_distributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gratuity_distributions_select" ON public.gratuity_distributions;
CREATE POLICY "gratuity_distributions_select" ON public.gratuity_distributions
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.payroll_can_view(auth.uid()) OR profile_id = public.my_profile_id())
  );
DROP POLICY IF EXISTS "gratuity_distributions_write" ON public.gratuity_distributions;
CREATE POLICY "gratuity_distributions_write" ON public.gratuity_distributions
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_gratuity_distributions_updated_at ON public.gratuity_distributions;
CREATE TRIGGER trg_gratuity_distributions_updated_at BEFORE UPDATE ON public.gratuity_distributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 9. payroll_runs / payroll_lines
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE,
  pay_period_id uuid NOT NULL REFERENCES public.pay_periods(id) ON DELETE RESTRICT,
  run_number text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'pending_approval', 'approved', 'paid', 'cancelled')),
  headcount integer NOT NULL DEFAULT 0,
  total_gross_minor bigint NOT NULL DEFAULT 0,
  total_deductions_minor bigint NOT NULL DEFAULT 0,
  total_net_minor bigint NOT NULL DEFAULT 0,
  calculated_at timestamptz,
  submitted_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, run_number)
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_company ON public.payroll_runs(company_id, status);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_runs_select" ON public.payroll_runs;
CREATE POLICY "payroll_runs_select" ON public.payroll_runs
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_view(auth.uid()));
DROP POLICY IF EXISTS "payroll_runs_write" ON public.payroll_runs;
CREATE POLICY "payroll_runs_write" ON public.payroll_runs
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_payroll_runs_updated_at ON public.payroll_runs;
CREATE TRIGGER trg_payroll_runs_updated_at BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Approval and payment are admin-only state transitions.
CREATE OR REPLACE FUNCTION public.payroll_runs_guard_transitions()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('approved', 'paid') AND NOT public.payroll_can_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only payroll admins can approve or pay a payroll run';
    END IF;
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'A paid payroll run cannot change status';
    END IF;
    IF NEW.status = 'approved' THEN NEW.approved_by := auth.uid(); NEW.approved_at := now(); END IF;
    IF NEW.status = 'pending_approval' THEN NEW.submitted_by := auth.uid(); NEW.submitted_at := now(); END IF;
    IF NEW.status = 'paid' THEN
      NEW.paid_at := now();
      UPDATE public.gratuity_distributions SET payout_status = 'paid', paid_at = now()
      WHERE payroll_line_id IN (SELECT id FROM public.payroll_lines WHERE run_id = NEW.id);
      UPDATE public.payroll_lines SET status = 'paid' WHERE run_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_payroll_runs_guard ON public.payroll_runs;
CREATE TRIGGER trg_payroll_runs_guard BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_runs_guard_transitions();

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  compensation_id uuid REFERENCES public.crew_compensation(id) ON DELETE SET NULL,
  pay_grade_id uuid REFERENCES public.pay_grades(id) ON DELETE SET NULL,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  currency char(3) NOT NULL,
  pay_frequency text NOT NULL,
  days_in_period integer NOT NULL,
  days_onboard integer NOT NULL DEFAULT 0,
  days_leave_paid integer NOT NULL DEFAULT 0,
  days_travel integer NOT NULL DEFAULT 0,
  days_unpaid integer NOT NULL DEFAULT 0,
  days_paid integer NOT NULL DEFAULT 0,
  proration_ratio numeric(12,8) NOT NULL DEFAULT 1,
  base_period_minor bigint NOT NULL DEFAULT 0,
  prorated_base_minor bigint NOT NULL DEFAULT 0,
  allowances_minor bigint NOT NULL DEFAULT 0,
  gratuity_minor bigint NOT NULL DEFAULT 0,
  other_earnings_minor bigint NOT NULL DEFAULT 0,
  deductions_minor bigint NOT NULL DEFAULT 0,
  gross_minor bigint NOT NULL DEFAULT 0,
  net_minor bigint NOT NULL DEFAULT 0,
  fx_rate_to_run numeric(18,8),
  net_run_currency_minor bigint,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated', 'adjusted', 'excluded', 'paid')),
  payslip_path text,
  payslip_generated_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_profile ON public.payroll_lines(profile_id);
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_lines_select" ON public.payroll_lines;
CREATE POLICY "payroll_lines_select" ON public.payroll_lines
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.payroll_can_view(auth.uid()) OR (profile_id = public.my_profile_id() AND status = 'paid'))
  );
DROP POLICY IF EXISTS "payroll_lines_write" ON public.payroll_lines;
CREATE POLICY "payroll_lines_write" ON public.payroll_lines
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_payroll_lines_updated_at ON public.payroll_lines;
CREATE TRIGGER trg_payroll_lines_updated_at BEFORE UPDATE ON public.payroll_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.gratuity_distributions
  DROP CONSTRAINT IF EXISTS gratuity_distributions_payroll_line_id_fkey;
ALTER TABLE public.gratuity_distributions
  ADD CONSTRAINT gratuity_distributions_payroll_line_id_fkey
  FOREIGN KEY (payroll_line_id) REFERENCES public.payroll_lines(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 10. pay_reviews
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pay_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_date date NOT NULL DEFAULT CURRENT_DATE,
  effective_date date NOT NULL,
  previous_compensation_id uuid REFERENCES public.crew_compensation(id) ON DELETE SET NULL,
  new_compensation_id uuid REFERENCES public.crew_compensation(id) ON DELETE SET NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  previous_base_minor bigint NOT NULL DEFAULT 0,
  proposed_base_minor bigint NOT NULL DEFAULT 0,
  change_pct numeric(8,4) GENERATED ALWAYS AS (
    CASE WHEN previous_base_minor > 0 THEN ROUND(((proposed_base_minor - previous_base_minor)::numeric / previous_base_minor) * 100, 4) ELSE NULL END
  ) STORED,
  reason text NOT NULL DEFAULT 'annual' CHECK (reason IN ('annual', 'promotion', 'market', 'retention', 'correction', 'other')),
  justification text,
  comparator_notes text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'applied')),
  proposed_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  approved_at timestamptz,
  applied_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_reviews_profile ON public.pay_reviews(profile_id, status);
ALTER TABLE public.pay_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_reviews_select" ON public.pay_reviews;
CREATE POLICY "pay_reviews_select" ON public.pay_reviews
  FOR SELECT USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_view(auth.uid()));
DROP POLICY IF EXISTS "pay_reviews_write" ON public.pay_reviews;
CREATE POLICY "pay_reviews_write" ON public.pay_reviews
  FOR ALL USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.payroll_can_edit(auth.uid()));
DROP TRIGGER IF EXISTS trg_pay_reviews_updated_at ON public.pay_reviews;
CREATE TRIGGER trg_pay_reviews_updated_at BEFORE UPDATE ON public.pay_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.pay_reviews_after_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.hr_register_record(NEW.company_id, NEW.profile_id, 'pay_review', NEW.id, 'pay_reviews', NEW.review_date);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pay_reviews_after_write ON public.pay_reviews;
CREATE TRIGGER trg_pay_reviews_after_write AFTER INSERT OR UPDATE ON public.pay_reviews
  FOR EACH ROW EXECUTE FUNCTION public.pay_reviews_after_write();

-- Applying an approved review creates the new active compensation row.
CREATE OR REPLACE FUNCTION public.pay_review_apply(p_review_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.pay_reviews;
  prev public.crew_compensation;
  new_id uuid;
BEGIN
  SELECT * INTO r FROM public.pay_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pay review not found'; END IF;
  IF NOT public.payroll_can_admin(auth.uid()) THEN RAISE EXCEPTION 'Only payroll admins can apply pay reviews'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Pay review must be approved before it is applied'; END IF;

  SELECT * INTO prev FROM public.crew_compensation
  WHERE profile_id = r.profile_id AND status = 'active' ORDER BY effective_from DESC LIMIT 1;

  INSERT INTO public.crew_compensation (
    company_id, profile_id, pay_grade_id, currency, base_salary_minor, pay_frequency, allowances,
    gratuity_points, gratuity_eligible, effective_from, status, reason, approved_by, approved_at, created_by
  ) VALUES (
    r.company_id, r.profile_id, prev.pay_grade_id, r.currency, r.proposed_base_minor,
    COALESCE(prev.pay_frequency, 'monthly'), COALESCE(prev.allowances, '[]'::jsonb),
    prev.gratuity_points, COALESCE(prev.gratuity_eligible, true), r.effective_date, 'active',
    'Pay review ' || r.reason, auth.uid(), now(), auth.uid()
  ) RETURNING id INTO new_id;

  UPDATE public.pay_reviews
  SET status = 'applied', applied_at = now(), previous_compensation_id = prev.id, new_compensation_id = new_id, updated_at = now()
  WHERE id = p_review_id;
  RETURN new_id;
END;
$$;

-- ---------------------------------------------------------------
-- 11. hr_days_onboard(): per-day classification for a crew member
-- ---------------------------------------------------------------
-- Priority per calendar day:
--   1. crew_leave_entries (explicit day code): F/Q = onboard, T/CD = travel,
--      U = unpaid, N = no crew (unpaid), other leave codes = paid leave.
--   2. frp_rotation_assignments covering the day (confirmed/complete):
--      onboard/yard/temp_cover/training = onboard, travel = travel,
--      leave/standby/wfh = paid leave, no_crew = unpaid.
--   3. crew_assignments covering the day on a vessel = onboard.
--   4. otherwise: paid leave if a contract/compensation is active, else none.
CREATE OR REPLACE FUNCTION public.hr_days_onboard(
  p_profile_id uuid,
  p_start date,
  p_end date,
  p_vessel_id uuid DEFAULT NULL,
  p_unpaid_codes text[] DEFAULT ARRAY['U']
)
RETURNS TABLE (
  days_in_period integer,
  days_onboard integer,
  days_leave_paid integer,
  days_travel integer,
  days_unpaid integer,
  days_unknown integer,
  source_summary jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = p_profile_id;

  RETURN QUERY
  WITH days AS (
    SELECT d::date AS day FROM generate_series(p_start, p_end, interval '1 day') d
  ),
  classified AS (
    SELECT
      dy.day,
      COALESCE(
        (SELECT CASE
                  WHEN e.status_code IN ('F','Q') THEN 'onboard'
                  WHEN e.status_code IN ('T','CD') THEN 'travel'
                  WHEN e.status_code = ANY(p_unpaid_codes) OR e.status_code = 'N' THEN 'unpaid'
                  ELSE 'leave'
                END
         FROM public.crew_leave_entries e
         WHERE v_user_id IS NOT NULL AND e.crew_id = v_user_id AND e.date = dy.day
           AND (p_vessel_id IS NULL OR e.vessel_id IS NULL OR e.vessel_id = p_vessel_id)
         LIMIT 1),
        (SELECT CASE
                  WHEN a.rotation_type IN ('onboard','yard','temp_cover','training') THEN 'onboard'
                  WHEN a.rotation_type = 'travel' THEN 'travel'
                  WHEN a.rotation_type IN ('leave','standby','wfh') THEN 'leave'
                  WHEN a.rotation_type = 'no_crew' THEN 'unpaid'
                  ELSE NULL
                END
         FROM public.frp_rotation_assignments a
         WHERE v_user_id IS NOT NULL AND a.crew_user_id = v_user_id
           AND a.status IN ('confirmed','complete','draft')
           AND dy.day BETWEEN a.start_date AND a.end_date
           AND (p_vessel_id IS NULL OR a.vessel_id IS NULL OR a.vessel_id = p_vessel_id)
         ORDER BY CASE a.status WHEN 'confirmed' THEN 0 WHEN 'complete' THEN 1 ELSE 2 END
         LIMIT 1),
        (SELECT 'onboard'
         FROM public.crew_assignments ca
         WHERE v_user_id IS NOT NULL AND ca.user_id = v_user_id
           AND dy.day >= COALESCE(ca.start_date, ca.join_date)
           AND (COALESCE(ca.end_date, ca.leave_date) IS NULL OR dy.day <= COALESCE(ca.end_date, ca.leave_date))
           AND (p_vessel_id IS NULL OR ca.vessel_id = p_vessel_id)
         LIMIT 1),
        (SELECT 'leave'
         FROM public.crew_contracts c
         WHERE c.profile_id = p_profile_id AND c.status = 'active'
           AND dy.day >= c.start_date AND (c.end_date IS NULL OR dy.day <= c.end_date)
         LIMIT 1),
        'unknown'
      ) AS kind
    FROM days dy
  )
  SELECT
    (p_end - p_start + 1)::integer,
    COUNT(*) FILTER (WHERE kind = 'onboard')::integer,
    COUNT(*) FILTER (WHERE kind = 'leave')::integer,
    COUNT(*) FILTER (WHERE kind = 'travel')::integer,
    COUNT(*) FILTER (WHERE kind = 'unpaid')::integer,
    COUNT(*) FILTER (WHERE kind = 'unknown')::integer,
    jsonb_build_object(
      'onboard', COUNT(*) FILTER (WHERE kind = 'onboard'),
      'leave', COUNT(*) FILTER (WHERE kind = 'leave'),
      'travel', COUNT(*) FILTER (WHERE kind = 'travel'),
      'unpaid', COUNT(*) FILTER (WHERE kind = 'unpaid'),
      'unknown', COUNT(*) FILTER (WHERE kind = 'unknown')
    )
  FROM classified;
END;
$$;

-- ---------------------------------------------------------------
-- 12. payroll_calculate_run(): the pro-rata engine
-- ---------------------------------------------------------------
-- For every crew member with an active compensation row whose current vessel
-- matches the run (or all company crew when the run has no vessel):
--   monthly/annual/weekly: base for the period = monthly base (annual/12,
--     weekly*52/12), paid days = days_in_period - unpaid days (travel counts
--     as paid when settings.travel_days_paid), prorated by paid/days_in_period.
--   daily: prorated base = daily rate * (onboard + travel-if-paid) days.
--   Recurring allowances with prorate=true follow the same ratio.
--   Pending gratuity distributions whose pool period ends inside the pay
--   period are attached to the line and marked in_payroll.
--   Lines are converted to the run currency via fx_rate_for.
CREATE OR REPLACE FUNCTION public.payroll_calculate_run(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  run public.payroll_runs;
  period public.pay_periods;
  settings public.hr_company_settings;
  comp RECORD;
  d RECORD;
  v_base_period bigint;
  v_paid_days integer;
  v_ratio numeric(12,8);
  v_prorated bigint;
  v_allow bigint;
  v_allow_detail jsonb;
  v_grat bigint;
  v_gross bigint;
  v_net bigint;
  v_fx numeric;
  v_line_id uuid;
  v_count integer := 0;
  v_days_in integer;
  v_rounding integer;
BEGIN
  IF NOT public.payroll_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to calculate payroll';
  END IF;

  SELECT * INTO run FROM public.payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF run.status NOT IN ('draft', 'calculated') THEN
    RAISE EXCEPTION 'Payroll run % cannot be recalculated in status %', run.run_number, run.status;
  END IF;

  SELECT * INTO period FROM public.pay_periods WHERE id = run.pay_period_id;
  settings := public.hr_company_settings_for(run.company_id);
  v_days_in := period.end_date - period.start_date + 1;
  v_rounding := GREATEST(settings.rounding_minor, 1);

  -- Release gratuities previously attached to this run's lines, then rebuild.
  UPDATE public.gratuity_distributions SET payout_status = 'pending', payroll_line_id = NULL
  WHERE payroll_line_id IN (SELECT id FROM public.payroll_lines WHERE run_id = p_run_id) AND payout_status = 'in_payroll';
  DELETE FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'adjusted';

  FOR comp IN
    SELECT cc.*, p.user_id,
           (SELECT ca.vessel_id FROM public.crew_assignments ca
             WHERE ca.user_id = p.user_id AND ca.is_current ORDER BY ca.join_date DESC LIMIT 1) AS current_vessel_id
    FROM public.crew_compensation cc
    JOIN public.profiles p ON p.id = cc.profile_id
    WHERE cc.company_id = run.company_id
      AND cc.status = 'active'
      AND cc.effective_from <= period.end_date
      AND (cc.effective_to IS NULL OR cc.effective_to >= period.start_date)
      AND NOT EXISTS (SELECT 1 FROM public.payroll_lines pl WHERE pl.run_id = p_run_id AND pl.profile_id = cc.profile_id AND pl.status = 'adjusted')
  LOOP
    IF run.vessel_id IS NOT NULL AND comp.current_vessel_id IS DISTINCT FROM run.vessel_id THEN
      CONTINUE;
    END IF;

    SELECT * INTO d FROM public.hr_days_onboard(comp.profile_id, period.start_date, period.end_date, run.vessel_id, settings.unpaid_leave_codes);

    IF comp.pay_frequency = 'daily' THEN
      v_paid_days := d.days_onboard + CASE WHEN settings.travel_days_paid THEN d.days_travel ELSE 0 END;
      v_base_period := comp.base_salary_minor * v_days_in; -- reference only
      v_ratio := CASE WHEN v_days_in > 0 THEN v_paid_days::numeric / v_days_in ELSE 0 END;
      v_prorated := comp.base_salary_minor * v_paid_days;
    ELSE
      v_base_period := CASE comp.pay_frequency
        WHEN 'annual' THEN ROUND(comp.base_salary_minor / 12.0)
        WHEN 'weekly' THEN ROUND(comp.base_salary_minor * 52 / 12.0)
        ELSE comp.base_salary_minor END;
      v_paid_days := v_days_in - d.days_unpaid - CASE WHEN settings.travel_days_paid THEN 0 ELSE d.days_travel END;
      v_ratio := CASE WHEN v_days_in > 0 THEN v_paid_days::numeric / v_days_in ELSE 0 END;
      v_prorated := ROUND(v_base_period * v_ratio);
    END IF;

    -- Allowances
    v_allow := 0;
    v_allow_detail := '[]'::jsonb;
    IF jsonb_typeof(comp.allowances) = 'array' THEN
      SELECT COALESCE(SUM(amt), 0), COALESCE(jsonb_agg(jsonb_build_object('name', nm, 'amount_minor', amt)), '[]'::jsonb)
      INTO v_allow, v_allow_detail
      FROM (
        SELECT
          a->>'name' AS nm,
          CASE WHEN COALESCE((a->>'prorate')::boolean, true)
               THEN ROUND(COALESCE((a->>'amount_minor')::bigint, 0) * v_ratio)
               ELSE COALESCE((a->>'amount_minor')::bigint, 0) END AS amt
        FROM jsonb_array_elements(comp.allowances) a
        WHERE COALESCE((a->>'recurring')::boolean, true)
      ) x;
    END IF;

    -- Gratuities pending for this crew member whose pool period ended in the pay period
    SELECT COALESCE(SUM(gd.amount_minor + gd.adjustment_minor), 0) INTO v_grat
    FROM public.gratuity_distributions gd
    JOIN public.gratuity_pools gp ON gp.id = gd.pool_id
    WHERE gd.profile_id = comp.profile_id AND gd.payout_status = 'pending' AND NOT gd.excluded
      AND gp.status = 'approved' AND gp.currency = comp.currency
      AND gp.period_end BETWEEN period.start_date AND period.end_date;

    v_gross := v_prorated + v_allow + v_grat;
    v_net := (v_gross / v_rounding) * v_rounding;
    v_fx := public.fx_rate_for(run.company_id, comp.currency, run.currency, period.end_date);

    INSERT INTO public.payroll_lines (
      run_id, company_id, profile_id, compensation_id, pay_grade_id, vessel_id, currency, pay_frequency,
      days_in_period, days_onboard, days_leave_paid, days_travel, days_unpaid, days_paid, proration_ratio,
      base_period_minor, prorated_base_minor, allowances_minor, gratuity_minor, gross_minor, net_minor,
      fx_rate_to_run, net_run_currency_minor, breakdown, status
    ) VALUES (
      p_run_id, run.company_id, comp.profile_id, comp.id, comp.pay_grade_id, comp.current_vessel_id, comp.currency, comp.pay_frequency,
      v_days_in, d.days_onboard, d.days_leave_paid, d.days_travel, d.days_unpaid, v_paid_days, v_ratio,
      v_base_period, v_prorated, v_allow, v_grat, v_gross, v_net,
      v_fx, CASE WHEN v_fx IS NULL THEN NULL ELSE ROUND(v_net * v_fx) END,
      jsonb_build_object('allowances', v_allow_detail, 'days', d.source_summary, 'travel_days_paid', settings.travel_days_paid),
      'calculated'
    ) RETURNING id INTO v_line_id;

    UPDATE public.gratuity_distributions gd
    SET payout_status = 'in_payroll', payroll_line_id = v_line_id
    FROM public.gratuity_pools gp
    WHERE gp.id = gd.pool_id AND gd.profile_id = comp.profile_id AND gd.payout_status = 'pending' AND NOT gd.excluded
      AND gp.status = 'approved' AND gp.currency = comp.currency
      AND gp.period_end BETWEEN period.start_date AND period.end_date;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.payroll_runs SET
    status = 'calculated',
    calculated_at = now(),
    headcount = (SELECT COUNT(*) FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'excluded'),
    total_gross_minor = (SELECT COALESCE(SUM(COALESCE(ROUND(gross_minor * fx_rate_to_run), gross_minor)), 0) FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'excluded'),
    total_deductions_minor = (SELECT COALESCE(SUM(COALESCE(ROUND(deductions_minor * fx_rate_to_run), deductions_minor)), 0) FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'excluded'),
    total_net_minor = (SELECT COALESCE(SUM(COALESCE(net_run_currency_minor, net_minor)), 0) FROM public.payroll_lines WHERE run_id = p_run_id AND status <> 'excluded'),
    updated_at = now()
  WHERE id = p_run_id;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------
-- 13. gratuity_calculate_pool(): split a pool across crew onboard
-- ---------------------------------------------------------------
-- Eligible crew: active compensation with gratuity_eligible, and at least
-- one onboard day on the pool's vessel during the pool period.
--   equal        weight = 1
--   points       weight = points (compensation override → pay grade → default)
--   days_weighted weight = days_onboard
--   points_days  weight = points * days_onboard
-- Existing rows keep their exclusion/adjustment; amounts are recomputed.
CREATE OR REPLACE FUNCTION public.gratuity_calculate_pool(p_pool_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pool public.gratuity_pools;
  settings public.hr_company_settings;
  comp RECORD;
  d RECORD;
  v_points numeric;
  v_weight numeric;
  v_total_weight numeric := 0;
  v_net bigint;
  v_allocated bigint := 0;
  v_count integer := 0;
  v_last_id uuid;
BEGIN
  IF NOT public.payroll_can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to calculate gratuities';
  END IF;
  SELECT * INTO pool FROM public.gratuity_pools WHERE id = p_pool_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gratuity pool not found'; END IF;
  IF pool.status NOT IN ('draft', 'calculated') THEN
    RAISE EXCEPTION 'Pool % cannot be recalculated in status %', pool.name, pool.status;
  END IF;
  settings := public.hr_company_settings_for(pool.company_id);
  v_net := pool.gross_amount_minor - pool.deductions_minor;

  -- Upsert participants
  FOR comp IN
    SELECT cc.profile_id, cc.gratuity_points, pg.gratuity_points AS grade_points
    FROM public.crew_compensation cc
    LEFT JOIN public.pay_grades pg ON pg.id = cc.pay_grade_id
    WHERE cc.company_id = pool.company_id AND cc.status = 'active' AND cc.gratuity_eligible
      AND cc.effective_from <= pool.period_end AND (cc.effective_to IS NULL OR cc.effective_to >= pool.period_start)
  LOOP
    SELECT * INTO d FROM public.hr_days_onboard(comp.profile_id, pool.period_start, pool.period_end, pool.vessel_id, settings.unpaid_leave_codes);
    IF d.days_onboard <= 0 THEN CONTINUE; END IF;
    v_points := COALESCE(comp.gratuity_points, comp.grade_points, settings.gratuity_default_points);
    v_weight := CASE pool.split_method
      WHEN 'equal' THEN 1
      WHEN 'points' THEN v_points
      WHEN 'days_weighted' THEN d.days_onboard
      ELSE v_points * d.days_onboard END;

    INSERT INTO public.gratuity_distributions (pool_id, company_id, profile_id, days_onboard, points, weight)
    VALUES (p_pool_id, pool.company_id, comp.profile_id, d.days_onboard, v_points, v_weight)
    ON CONFLICT (pool_id, profile_id) DO UPDATE
      SET days_onboard = EXCLUDED.days_onboard, points = EXCLUDED.points, weight = EXCLUDED.weight, updated_at = now();
  END LOOP;

  -- Drop participants no longer eligible (never touch paid rows)
  DELETE FROM public.gratuity_distributions gd
  WHERE gd.pool_id = p_pool_id AND gd.payout_status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_compensation cc
      WHERE cc.profile_id = gd.profile_id AND cc.status = 'active' AND cc.gratuity_eligible
    );

  SELECT COALESCE(SUM(weight), 0) INTO v_total_weight FROM public.gratuity_distributions WHERE pool_id = p_pool_id AND NOT excluded;

  UPDATE public.gratuity_distributions
  SET share_ratio = CASE WHEN excluded OR v_total_weight = 0 THEN 0 ELSE weight / v_total_weight END,
      amount_minor = CASE WHEN excluded OR v_total_weight = 0 THEN 0 ELSE FLOOR(v_net * (weight / v_total_weight)) END,
      updated_at = now()
  WHERE pool_id = p_pool_id AND payout_status IN ('pending', 'cancelled');

  -- Give rounding remainder to the largest share so the pool sums exactly.
  SELECT COALESCE(SUM(amount_minor), 0) INTO v_allocated FROM public.gratuity_distributions WHERE pool_id = p_pool_id AND NOT excluded;
  IF v_allocated < v_net AND v_total_weight > 0 THEN
    SELECT id INTO v_last_id FROM public.gratuity_distributions WHERE pool_id = p_pool_id AND NOT excluded ORDER BY weight DESC, created_at ASC LIMIT 1;
    UPDATE public.gratuity_distributions SET amount_minor = amount_minor + (v_net - v_allocated) WHERE id = v_last_id;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.gratuity_distributions WHERE pool_id = p_pool_id AND NOT excluded;
  UPDATE public.gratuity_pools SET status = 'calculated', calculated_at = now(), updated_at = now() WHERE id = p_pool_id;
  RETURN v_count;
END;
$$;

-- Pay grade names are used for gratuity points by rank; seed a starter set
-- per company only if the company has none.
INSERT INTO public.pay_grades (company_id, code, name, department, rank, grade_level, gratuity_points)
SELECT c.id, g.code, g.name, g.department, g.rank, g.level, g.points
FROM public.companies c
CROSS JOIN (VALUES
  ('CAPT', 'Captain', 'Deck', 'Master', 10, 2.0),
  ('CO',   'Chief Officer', 'Deck', 'Chief Officer', 8, 1.6),
  ('2O',   'Second Officer', 'Deck', '2nd Officer', 6, 1.3),
  ('BSN',  'Bosun', 'Deck', 'Bosun', 5, 1.2),
  ('DH',   'Deckhand', 'Deck', 'Deckhand', 3, 1.0),
  ('CE',   'Chief Engineer', 'Engineering', 'Chief Engineer', 9, 1.8),
  ('2E',   'Second Engineer', 'Engineering', '2nd Engineer', 7, 1.4),
  ('ETO',  'ETO', 'Engineering', 'ETO', 6, 1.3),
  ('CS',   'Chief Stewardess', 'Interior', 'Chief Stewardess', 7, 1.4),
  ('STW',  'Stewardess', 'Interior', 'Stewardess', 3, 1.0),
  ('CHEF', 'Head Chef', 'Galley', 'Chef', 7, 1.4),
  ('COOK', 'Cook', 'Galley', 'Cook', 4, 1.1),
  ('PUR',  'Purser', 'Interior', 'Purser', 7, 1.4)
) AS g(code, name, department, rank, level, points)
WHERE NOT EXISTS (SELECT 1 FROM public.pay_grades pg WHERE pg.company_id = c.id)
ON CONFLICT (company_id, code) DO NOTHING;
