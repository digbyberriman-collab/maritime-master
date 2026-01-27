-- E-SMS Forms/Checklists Schema

-- Template definition
CREATE TABLE public.sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) NOT NULL,
  
  -- Identification
  template_code VARCHAR(50) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  category VARCHAR(100),
  
  -- Version control
  version INTEGER DEFAULT 1,
  effective_date DATE NOT NULL,
  supersedes_template_id UUID REFERENCES public.sms_templates(id),
  
  -- Content
  description TEXT,
  instructions TEXT,
  form_schema JSONB NOT NULL DEFAULT '{}',
  
  -- Configuration
  owner_role VARCHAR(50),
  required_signers JSONB NOT NULL DEFAULT '[]',
  allows_attachments BOOLEAN DEFAULT true,
  max_attachments INTEGER DEFAULT 10,
  
  -- Scheduling
  recurrence_type VARCHAR(20) CHECK (recurrence_type IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'PER_EVENT')),
  recurrence_config JSONB,
  
  -- Status
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  published_at TIMESTAMP WITH TIME ZONE,
  published_by UUID REFERENCES public.profiles(user_id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES public.profiles(user_id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(company_id, template_code, version)
);

-- Submission instance
CREATE TABLE public.sms_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  submission_number VARCHAR(50) NOT NULL,
  template_id UUID REFERENCES public.sms_templates(id) NOT NULL,
  template_version INTEGER NOT NULL,
  
  -- Scope
  company_id UUID REFERENCES public.companies(id) NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id),
  
  -- Content
  form_data JSONB NOT NULL DEFAULT '{}',
  
  -- Timing
  submission_date DATE NOT NULL,
  submission_time_utc TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  vessel_local_offset_minutes INTEGER,
  
  -- Status workflow
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_SIGNATURE', 'SIGNED', 'REJECTED', 'AMENDED', 'ARCHIVED')),
  
  -- Immutability
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP WITH TIME ZONE,
  content_hash VARCHAR(64),
  
  -- Tracking
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  submitted_by UUID REFERENCES public.profiles(user_id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(company_id, submission_number)
);

-- Electronic signatures
CREATE TABLE public.sms_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.sms_submissions(id) NOT NULL,
  
  -- Signer identity
  signer_user_id UUID REFERENCES public.profiles(user_id) NOT NULL,
  signer_name VARCHAR(255) NOT NULL,
  signer_role VARCHAR(50) NOT NULL,
  signer_rank VARCHAR(100),
  
  -- Signature details
  signature_order INTEGER NOT NULL,
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  signature_method VARCHAR(20) DEFAULT 'PIN' CHECK (signature_method IN ('PIN', 'BIOMETRIC', 'DRAWN', 'SSO')),
  
  -- Verification data
  signature_data TEXT,
  ip_address VARCHAR(50),
  device_info TEXT,
  user_agent TEXT,
  
  -- Outcome
  action VARCHAR(20) CHECK (action IN ('SIGNED', 'REJECTED', 'DELEGATED')),
  rejection_reason TEXT,
  delegated_to UUID REFERENCES public.profiles(user_id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(submission_id, signer_user_id, signature_order)
);

-- Attachments
CREATE TABLE public.sms_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.sms_submissions(id) NOT NULL,
  
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  description TEXT,
  
  uploaded_by UUID REFERENCES public.profiles(user_id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Amendment log (immutable audit trail)
CREATE TABLE public.sms_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.sms_submissions(id) NOT NULL,
  
  amendment_number INTEGER NOT NULL,
  amendment_reason TEXT NOT NULL,
  
  previous_data JSONB NOT NULL,
  new_data JSONB NOT NULL,
  changed_fields TEXT[],
  
  amended_by UUID REFERENCES public.profiles(user_id) NOT NULL,
  amended_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Re-signature required
  requires_re_signature BOOLEAN DEFAULT true,
  re_signed_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(submission_id, amendment_number)
);

-- Indexes for performance
CREATE INDEX idx_sms_templates_company ON public.sms_templates(company_id);
CREATE INDEX idx_sms_templates_type ON public.sms_templates(template_type, status);
CREATE INDEX idx_sms_submissions_company ON public.sms_submissions(company_id);
CREATE INDEX idx_sms_submissions_vessel ON public.sms_submissions(vessel_id);
CREATE INDEX idx_sms_submissions_template ON public.sms_submissions(template_id);
CREATE INDEX idx_sms_submissions_status ON public.sms_submissions(status, submission_date);
CREATE INDEX idx_sms_signatures_submission ON public.sms_signatures(submission_id);
CREATE INDEX idx_sms_signatures_signer ON public.sms_signatures(signer_user_id);
CREATE INDEX idx_sms_attachments_submission ON public.sms_attachments(submission_id);
CREATE INDEX idx_sms_amendments_submission ON public.sms_amendments(submission_id);

-- Enable RLS
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_amendments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_templates
CREATE POLICY "Users can view templates in their company"
  ON public.sms_templates FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can insert templates in their company"
  ON public.sms_templates FOR INSERT
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can update templates in their company"
  ON public.sms_templates FOR UPDATE
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can delete templates in their company"
  ON public.sms_templates FOR DELETE
  USING (user_belongs_to_company(auth.uid(), company_id));

-- RLS Policies for sms_submissions
CREATE POLICY "Users can view submissions in their company"
  ON public.sms_submissions FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can insert submissions in their company"
  ON public.sms_submissions FOR INSERT
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can update submissions in their company"
  ON public.sms_submissions FOR UPDATE
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can delete submissions in their company"
  ON public.sms_submissions FOR DELETE
  USING (user_belongs_to_company(auth.uid(), company_id));

-- RLS Policies for sms_signatures (via submission company)
CREATE POLICY "Users can view signatures in their company"
  ON public.sms_signatures FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sms_submissions s
    WHERE s.id = submission_id AND user_belongs_to_company(auth.uid(), s.company_id)
  ));

CREATE POLICY "Users can insert signatures in their company"
  ON public.sms_signatures FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sms_submissions s
    WHERE s.id = submission_id AND user_belongs_to_company(auth.uid(), s.company_id)
  ));

CREATE POLICY "Users can update signatures in their company"
  ON public.sms_signatures FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.sms_submissions s
    WHERE s.id = submission_id AND user_belongs_to_company(auth.uid(), s.company_id)
  ));

-- RLS Policies for sms_attachments (via submission company)
CREATE POLICY "Users can view attachments in their company"
  ON public.sms_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sms_submissions s
    WHERE s.id = submission_id AND user_belongs_to_company(auth.uid(), s.company_id)
  ));

CREATE POLICY "Users can insert attachments in their company"
  ON public.sms_attachments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sms_submissions s
    WHERE s.id = submission_id AND user_belongs_to_company(auth.uid(), s.company_id)
  ));

CREATE POLICY "Users can delete attachments in their company"
  ON public.sms_attachments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.sms_submissions s
    WHERE s.id = submission_id AND user_belongs_to_company(auth.uid(), s.company_id)
  ));

-- RLS Policies for sms_amendments (via submission company, insert only - immutable)
CREATE POLICY "Users can view amendments in their company"
  ON public.sms_amendments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sms_submissions s
    WHERE s.id = submission_id AND user_belongs_to_company(auth.uid(), s.company_id)
  ));

CREATE POLICY "Users can insert amendments in their company"
  ON public.sms_amendments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sms_submissions s
    WHERE s.id = submission_id AND user_belongs_to_company(auth.uid(), s.company_id)
  ));

-- Triggers for updated_at
CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_submissions_updated_at
  BEFORE UPDATE ON public.sms_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();