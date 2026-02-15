
-- ============================================
-- CREW LEAVE PLANNER TABLES
-- ============================================

-- 1. crew_leave_entries: one status per crew per day
CREATE TABLE public.crew_leave_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status_code VARCHAR(4) NOT NULL CHECK (status_code IN ('F','Q','L','T','CD','M','PPL','CL','N','U','R')),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  vessel_id UUID REFERENCES public.vessels(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(crew_id, date)
);

-- 2. crew_leave_carryover: balance from previous year
CREATE TABLE public.crew_leave_carryover (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  carryover_days DECIMAL NOT NULL DEFAULT 0,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(crew_id, year)
);

-- 3. crew_leave_locked_months: which months are finalized
CREATE TABLE public.crew_leave_locked_months (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  vessel_id UUID REFERENCES public.vessels(id),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES public.profiles(user_id),
  UNIQUE(year, month, company_id, vessel_id)
);

-- 4. crew_leave_requests: leave request/approval workflow
CREATE TABLE public.crew_leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  leave_type VARCHAR(4) NOT NULL CHECK (leave_type IN ('F','Q','L','T','CD','M','PPL','CL','N','U','R')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  vessel_id UUID REFERENCES public.vessels(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.crew_leave_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_leave_carryover ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_leave_locked_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_leave_requests ENABLE ROW LEVEL SECURITY;

-- RLS: crew_leave_entries - company-scoped access
CREATE POLICY "Users can view leave entries in their company"
  ON public.crew_leave_entries FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert leave entries in their company"
  ON public.crew_leave_entries FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update leave entries in their company"
  ON public.crew_leave_entries FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete leave entries in their company"
  ON public.crew_leave_entries FOR DELETE
  USING (company_id = public.get_user_company_id(auth.uid()));

-- RLS: crew_leave_carryover
CREATE POLICY "Users can view carryover in their company"
  ON public.crew_leave_carryover FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can manage carryover in their company"
  ON public.crew_leave_carryover FOR ALL
  USING (company_id = public.get_user_company_id(auth.uid()));

-- RLS: crew_leave_locked_months
CREATE POLICY "Users can view locked months in their company"
  ON public.crew_leave_locked_months FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can manage locked months in their company"
  ON public.crew_leave_locked_months FOR ALL
  USING (company_id = public.get_user_company_id(auth.uid()));

-- RLS: crew_leave_requests
CREATE POLICY "Users can view leave requests in their company"
  ON public.crew_leave_requests FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert leave requests in their company"
  ON public.crew_leave_requests FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update leave requests in their company"
  ON public.crew_leave_requests FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_crew_leave_entries_crew_date ON public.crew_leave_entries(crew_id, date);
CREATE INDEX idx_crew_leave_entries_date ON public.crew_leave_entries(date);
CREATE INDEX idx_crew_leave_entries_company ON public.crew_leave_entries(company_id);
CREATE INDEX idx_crew_leave_carryover_crew_year ON public.crew_leave_carryover(crew_id, year);
CREATE INDEX idx_crew_leave_requests_company ON public.crew_leave_requests(company_id);
CREATE INDEX idx_crew_leave_requests_status ON public.crew_leave_requests(status);

-- Triggers for updated_at
CREATE TRIGGER update_crew_leave_entries_updated_at
  BEFORE UPDATE ON public.crew_leave_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_crew_leave_carryover_updated_at
  BEFORE UPDATE ON public.crew_leave_carryover
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_crew_leave_requests_updated_at
  BEFORE UPDATE ON public.crew_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
