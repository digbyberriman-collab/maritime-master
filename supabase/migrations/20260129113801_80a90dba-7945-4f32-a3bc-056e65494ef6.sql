-- =============================================
-- DATA RETENTION & GDPR COMPLIANCE SCHEMA
-- =============================================

-- Enum for record status including archive states
CREATE TYPE public.record_lifecycle_status AS ENUM (
  'active',
  'pending_archive',
  'archived',
  'pending_deletion',
  'anonymized'
);

-- Enum for GDPR lawful basis
CREATE TYPE public.gdpr_lawful_basis AS ENUM (
  'consent',
  'contractual',
  'legal_obligation',
  'vital_interests',
  'public_task',
  'legitimate_interest'
);

-- Enum for HR record types
CREATE TYPE public.hr_record_type AS ENUM (
  'employment_contract',
  'salary_compensation',
  'pay_review',
  'annual_review',
  'performance_evaluation',
  'rotation_catchup',
  'disciplinary_minor',
  'disciplinary_serious',
  'welfare_note',
  'training_record',
  'leave_record',
  'medical_record'
);

-- =============================================
-- DATA RETENTION POLICIES TABLE
-- =============================================
CREATE TABLE public.data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  record_type public.hr_record_type NOT NULL,
  retention_years INTEGER NOT NULL,
  retention_trigger TEXT NOT NULL DEFAULT 'record_end_date', -- 'record_end_date', 'termination_date', 'last_payment_date'
  auto_archive BOOLEAN DEFAULT true,
  require_dpa_approval_for_deletion BOOLEAN DEFAULT true,
  gdpr_purpose TEXT NOT NULL,
  gdpr_lawful_basis public.gdpr_lawful_basis NOT NULL,
  data_owner TEXT NOT NULL DEFAULT 'Company',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, record_type)
);

-- Enable RLS
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their company retention policies"
  ON public.data_retention_policies FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "DPAs can manage retention policies"
  ON public.data_retention_policies FOR ALL
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

-- =============================================
-- HR RECORDS METADATA TABLE (for retention tracking)
-- =============================================
CREATE TABLE public.hr_record_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  record_type public.hr_record_type NOT NULL,
  record_id UUID NOT NULL, -- References the actual record in the source table
  source_table TEXT NOT NULL, -- e.g., 'crew_contracts', 'salary_records'
  lifecycle_status public.record_lifecycle_status DEFAULT 'active',
  retention_start_date DATE NOT NULL,
  retention_end_date DATE NOT NULL,
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES public.profiles(user_id),
  anonymized_at TIMESTAMPTZ,
  anonymized_by UUID REFERENCES public.profiles(user_id),
  last_accessed_at TIMESTAMPTZ,
  last_accessed_by UUID REFERENCES public.profiles(user_id),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hr_record_metadata ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their company HR metadata"
  ON public.hr_record_metadata FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "DPAs can manage HR metadata"
  ON public.hr_record_metadata FOR ALL
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

-- =============================================
-- GDPR DATA SUBJECT REQUESTS
-- =============================================
CREATE TABLE public.gdpr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  subject_user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('access', 'rectification', 'erasure', 'portability', 'restriction', 'objection')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT now(),
  requested_by UUID REFERENCES public.profiles(user_id) NOT NULL,
  processed_by UUID REFERENCES public.profiles(user_id),
  processed_at TIMESTAMPTZ,
  response_notes TEXT,
  export_file_url TEXT,
  deadline_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gdpr_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own GDPR requests"
  ON public.gdpr_requests FOR SELECT
  USING (subject_user_id = auth.uid() OR requested_by = auth.uid());

CREATE POLICY "DPAs can manage all GDPR requests"
  ON public.gdpr_requests FOR ALL
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

-- =============================================
-- INSURANCE POLICIES TABLE
-- =============================================
CREATE TABLE public.insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL,
  policy_number TEXT NOT NULL,
  insurer_name TEXT NOT NULL,
  insurer_contact TEXT,
  coverage_start_date DATE NOT NULL,
  coverage_end_date DATE NOT NULL,
  coverage_amount DECIMAL(15, 2),
  premium_amount DECIMAL(15, 2), -- SENSITIVE: Hidden from auditors
  deductible_amount DECIMAL(15, 2), -- SENSITIVE: Hidden from auditors
  certificate_url TEXT,
  policy_document_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'pending_renewal')),
  notes TEXT, -- SENSITIVE: Hidden from auditors
  lifecycle_status public.record_lifecycle_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(user_id),
  updated_by UUID REFERENCES public.profiles(user_id)
);

-- Enable RLS
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their company insurance policies"
  ON public.insurance_policies FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "DPAs can manage insurance policies"
  ON public.insurance_policies FOR ALL
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
  );

-- =============================================
-- INSURANCE CLAIMS TABLE (HIGHLY SENSITIVE)
-- =============================================
CREATE TABLE public.insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  policy_id UUID REFERENCES public.insurance_policies(id) ON DELETE CASCADE NOT NULL,
  claim_number TEXT NOT NULL,
  claim_date DATE NOT NULL,
  incident_description TEXT NOT NULL,
  claim_amount DECIMAL(15, 2), -- SENSITIVE
  settlement_amount DECIMAL(15, 2), -- SENSITIVE
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'approved', 'rejected', 'settled', 'closed')),
  correspondence_notes TEXT, -- HIGHLY SENSITIVE: Never shown to auditors
  attachments TEXT[],
  lifecycle_status public.record_lifecycle_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(user_id)
);

-- Enable RLS
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Only DPAs can view insurance claims"
  ON public.insurance_claims FOR SELECT
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

CREATE POLICY "Only DPAs can manage insurance claims"
  ON public.insurance_claims FOR ALL
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

-- =============================================
-- INSURANCE AUDIT MODE SESSIONS
-- =============================================
CREATE TABLE public.insurance_audit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id),
  audit_party TEXT NOT NULL,
  auditor_name TEXT,
  auditor_email TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  access_token TEXT UNIQUE,
  access_token_expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(user_id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.insurance_audit_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "DPAs can manage insurance audit sessions"
  ON public.insurance_audit_sessions FOR ALL
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

-- =============================================
-- COMPLIANCE ACCESS LOG (All sensitive access events)
-- =============================================
CREATE TABLE public.compliance_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(user_id) NOT NULL,
  user_role TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('hr', 'insurance', 'crew', 'incidents')),
  action TEXT NOT NULL CHECK (action IN ('view', 'export', 'edit', 'archive', 'anonymize', 'delete')),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  accessed_fields TEXT[], -- Which fields were accessed
  is_audit_mode BOOLEAN DEFAULT false,
  audit_session_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  access_granted BOOLEAN DEFAULT true,
  denial_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.compliance_access_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "DPAs can view compliance access logs"
  ON public.compliance_access_log FOR SELECT
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

CREATE POLICY "System can insert compliance logs"
  ON public.compliance_access_log FOR INSERT
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

-- =============================================
-- HR AUDIT ACCESS PERMISSIONS (Explicit enable only)
-- =============================================
CREATE TABLE public.hr_audit_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  audit_session_id UUID REFERENCES public.audit_mode_sessions(id) ON DELETE CASCADE NOT NULL,
  granted_access_level TEXT NOT NULL DEFAULT 'employment_only' 
    CHECK (granted_access_level IN ('none', 'employment_only', 'limited', 'full')),
  allowed_fields TEXT[] DEFAULT ARRAY['employment_exists', 'contract_valid'],
  denied_fields TEXT[] DEFAULT ARRAY['salary', 'reviews', 'disciplinary', 'welfare', 'medical'],
  granted_by UUID REFERENCES public.profiles(user_id) NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(user_id),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.hr_audit_access_grants ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "DPAs can manage HR audit access grants"
  ON public.hr_audit_access_grants FOR ALL
  USING (
    public.user_belongs_to_company(auth.uid(), company_id) 
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

-- =============================================
-- INSERT DEFAULT RETENTION POLICIES (for each company on creation)
-- =============================================
CREATE OR REPLACE FUNCTION public.create_default_retention_policies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Employment Contracts: 7 years post-termination
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'employment_contract', 7, 'termination_date', 'Legal compliance and employment record keeping', 'legal_obligation');
  
  -- Salary & Compensation: 7 years after final payment
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'salary_compensation', 7, 'last_payment_date', 'Tax and payroll compliance', 'legal_obligation');
  
  -- Pay Reviews: 5 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'pay_review', 5, 'record_end_date', 'Compensation management and audit trail', 'legitimate_interest');
  
  -- Annual Reviews: 5 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'annual_review', 5, 'record_end_date', 'Performance management and development', 'legitimate_interest');
  
  -- Performance Evaluations: 3 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'performance_evaluation', 3, 'record_end_date', 'Performance management', 'legitimate_interest');
  
  -- Rotation Catch-ups: 2 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'rotation_catchup', 2, 'record_end_date', 'Crew welfare and management', 'legitimate_interest');
  
  -- Disciplinary Minor: 2 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'disciplinary_minor', 2, 'record_end_date', 'Workplace conduct management', 'legitimate_interest');
  
  -- Disciplinary Serious: 7 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'disciplinary_serious', 7, 'record_end_date', 'Legal compliance and safety', 'legal_obligation');
  
  -- Welfare Notes: 3 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'welfare_note', 3, 'record_end_date', 'Crew welfare support', 'legitimate_interest');
  
  -- Training Records: 7 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'training_record', 7, 'record_end_date', 'Compliance and certification', 'legal_obligation');
  
  -- Leave Records: 3 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'leave_record', 3, 'record_end_date', 'Leave management and compliance', 'contractual');
  
  -- Medical Records: 7 years
  INSERT INTO public.data_retention_policies (company_id, record_type, retention_years, retention_trigger, gdpr_purpose, gdpr_lawful_basis)
  VALUES (NEW.id, 'medical_record', 7, 'record_end_date', 'Health and safety compliance', 'legal_obligation');
  
  RETURN NEW;
END;
$$;

-- Create trigger for default retention policies
CREATE TRIGGER on_company_created_add_retention_policies
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_retention_policies();

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX idx_hr_record_metadata_user ON public.hr_record_metadata(user_id);
CREATE INDEX idx_hr_record_metadata_status ON public.hr_record_metadata(lifecycle_status);
CREATE INDEX idx_hr_record_metadata_retention ON public.hr_record_metadata(retention_end_date);
CREATE INDEX idx_compliance_access_log_user ON public.compliance_access_log(user_id);
CREATE INDEX idx_compliance_access_log_module ON public.compliance_access_log(module);
CREATE INDEX idx_insurance_policies_company ON public.insurance_policies(company_id);
CREATE INDEX idx_insurance_policies_vessel ON public.insurance_policies(vessel_id);
CREATE INDEX idx_gdpr_requests_subject ON public.gdpr_requests(subject_user_id);

-- =============================================
-- UPDATED_AT TRIGGERS
-- =============================================
CREATE TRIGGER update_data_retention_policies_updated_at
  BEFORE UPDATE ON public.data_retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hr_record_metadata_updated_at
  BEFORE UPDATE ON public.hr_record_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gdpr_requests_updated_at
  BEFORE UPDATE ON public.gdpr_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_policies_updated_at
  BEFORE UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_claims_updated_at
  BEFORE UPDATE ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_audit_sessions_updated_at
  BEFORE UPDATE ON public.insurance_audit_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();