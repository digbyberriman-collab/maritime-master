-- Create audits table
CREATE TABLE public.audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_number TEXT NOT NULL UNIQUE,
  audit_type TEXT NOT NULL, -- Internal, External_Initial, External_Annual, External_Intermediate, External_Renewal
  audit_scope TEXT NOT NULL, -- Full SMS, Specific sections, Department-specific
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  actual_start_date DATE,
  actual_end_date DATE,
  lead_auditor_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  external_auditor_name TEXT,
  external_auditor_org TEXT,
  ism_sections_covered INTEGER[] DEFAULT '{}'::INTEGER[],
  status TEXT NOT NULL DEFAULT 'Planned', -- Planned, In_Progress, Completed, Closed
  audit_report_url TEXT,
  overall_result TEXT, -- Satisfactory, Satisfactory_with_Observations, Major_NC, Certificate_Withdrawn
  notes TEXT,
  audit_team UUID[] DEFAULT '{}'::UUID[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit_findings table
CREATE TABLE public.audit_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  finding_number TEXT NOT NULL,
  finding_type TEXT NOT NULL, -- Major_NC, Minor_NC, Observation
  ism_section INTEGER NOT NULL, -- 1-13
  requirement_text TEXT NOT NULL,
  finding_description TEXT NOT NULL,
  objective_evidence TEXT NOT NULL,
  vessel_response TEXT,
  status TEXT NOT NULL DEFAULT 'Open', -- Open, CAPA_Assigned, Under_Review, Closed
  closeout_evidence_urls TEXT[] DEFAULT '{}'::TEXT[],
  closed_date DATE,
  verified_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create management_reviews table
CREATE TABLE public.management_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_date DATE NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  attendees JSONB DEFAULT '[]'::JSONB,
  period_covered TEXT NOT NULL,
  agenda_items JSONB DEFAULT '[]'::JSONB,
  incident_summary JSONB DEFAULT '{}'::JSONB,
  audit_summary JSONB DEFAULT '{}'::JSONB,
  capa_summary JSONB DEFAULT '{}'::JSONB,
  sms_changes_needed TEXT[] DEFAULT '{}'::TEXT[],
  resource_decisions TEXT[] DEFAULT '{}'::TEXT[],
  action_items JSONB DEFAULT '[]'::JSONB,
  minutes_url TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled', -- Scheduled, Completed
  next_review_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for audits
CREATE POLICY "Users can view audits in their company" ON public.audits
  FOR SELECT USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can insert audits in their company" ON public.audits
  FOR INSERT WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can update audits in their company" ON public.audits
  FOR UPDATE USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can delete audits in their company" ON public.audits
  FOR DELETE USING (user_belongs_to_company(auth.uid(), company_id));

-- RLS Policies for audit_findings
CREATE POLICY "Users can view findings in their company" ON public.audit_findings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.audits a 
      WHERE a.id = audit_findings.audit_id 
      AND user_belongs_to_company(auth.uid(), a.company_id)
    )
  );

CREATE POLICY "Users can insert findings in their company" ON public.audit_findings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.audits a 
      WHERE a.id = audit_findings.audit_id 
      AND user_belongs_to_company(auth.uid(), a.company_id)
    )
  );

CREATE POLICY "Users can update findings in their company" ON public.audit_findings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.audits a 
      WHERE a.id = audit_findings.audit_id 
      AND user_belongs_to_company(auth.uid(), a.company_id)
    )
  );

CREATE POLICY "Users can delete findings in their company" ON public.audit_findings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.audits a 
      WHERE a.id = audit_findings.audit_id 
      AND user_belongs_to_company(auth.uid(), a.company_id)
    )
  );

-- RLS Policies for management_reviews
CREATE POLICY "Users can view reviews in their company" ON public.management_reviews
  FOR SELECT USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can insert reviews in their company" ON public.management_reviews
  FOR INSERT WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can update reviews in their company" ON public.management_reviews
  FOR UPDATE USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can delete reviews in their company" ON public.management_reviews
  FOR DELETE USING (user_belongs_to_company(auth.uid(), company_id));

-- Create indexes for performance
CREATE INDEX idx_audits_company_id ON public.audits(company_id);
CREATE INDEX idx_audits_vessel_id ON public.audits(vessel_id);
CREATE INDEX idx_audits_scheduled_date ON public.audits(scheduled_date);
CREATE INDEX idx_audits_status ON public.audits(status);
CREATE INDEX idx_audit_findings_audit_id ON public.audit_findings(audit_id);
CREATE INDEX idx_audit_findings_status ON public.audit_findings(status);
CREATE INDEX idx_management_reviews_company_id ON public.management_reviews(company_id);
CREATE INDEX idx_management_reviews_review_date ON public.management_reviews(review_date);

-- Add updated_at triggers
CREATE TRIGGER update_audits_updated_at
  BEFORE UPDATE ON public.audits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_audit_findings_updated_at
  BEFORE UPDATE ON public.audit_findings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_management_reviews_updated_at
  BEFORE UPDATE ON public.management_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();