-- =====================================================
-- ELECTRONIC FORMS SYSTEM DATABASE SCHEMA
-- =====================================================

-- Template Categories
CREATE TABLE public.form_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL,
  description TEXT,
  parent_category_id UUID REFERENCES public.form_categories(id),
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.form_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for form_categories
CREATE POLICY "Users can view form categories in their company"
ON public.form_categories FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "DPAs and Management can manage form categories"
ON public.form_categories FOR ALL
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin']::app_role[])
);

-- Form Templates
CREATE TABLE public.form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  
  -- Identification
  template_code VARCHAR(50) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Classification
  category_id UUID REFERENCES public.form_categories(id),
  form_type VARCHAR(50) NOT NULL,
  
  -- Scope
  vessel_scope VARCHAR(20) DEFAULT 'FLEET',
  vessel_ids UUID[],
  department_scope VARCHAR(50),
  
  -- Version Control
  version INTEGER DEFAULT 1,
  version_notes TEXT,
  effective_date DATE,
  supersedes_template_id UUID REFERENCES public.form_templates(id),
  
  -- Source Document
  source_file_url TEXT,
  source_file_name TEXT,
  source_file_type VARCHAR(20),
  
  -- Form Schema (JSON)
  form_schema JSONB NOT NULL DEFAULT '{"pages": [], "fields": []}',
  
  -- Initiation Settings
  initiation_mode VARCHAR(20) DEFAULT 'MANUAL',
  allow_line_items BOOLEAN DEFAULT true,
  
  -- Expiry Settings
  has_expiry BOOLEAN DEFAULT false,
  expiry_hours INTEGER,
  expiry_action VARCHAR(20),
  
  -- Signature Requirements
  required_signers JSONB DEFAULT '[]',
  allow_parallel_signing BOOLEAN DEFAULT false,
  
  -- Review Cycle
  review_cycle_days INTEGER,
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  next_review_date DATE,
  
  -- Workflow Integration
  can_trigger_incident BOOLEAN DEFAULT false,
  can_trigger_nc BOOLEAN DEFAULT false,
  can_trigger_capa BOOLEAN DEFAULT false,
  auto_attach_to_audit BOOLEAN DEFAULT false,
  
  -- Status
  status VARCHAR(20) DEFAULT 'DRAFT',
  published_at TIMESTAMP WITH TIME ZONE,
  published_by UUID REFERENCES public.profiles(user_id),
  
  -- Audit
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(company_id, template_code, version)
);

CREATE INDEX idx_form_templates_company ON public.form_templates(company_id, status);
CREATE INDEX idx_form_templates_type ON public.form_templates(form_type);

-- Enable RLS
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for form_templates
CREATE POLICY "Users can view published templates in their company"
ON public.form_templates FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND (status = 'PUBLISHED' OR created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin']::app_role[]))
);

CREATE POLICY "DPAs can manage form templates"
ON public.form_templates FOR ALL
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin']::app_role[])
);

-- Template Version History
CREATE TABLE public.form_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.form_templates(id) ON DELETE CASCADE,
  
  version INTEGER NOT NULL,
  form_schema JSONB NOT NULL,
  version_notes TEXT,
  
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(template_id, version)
);

ALTER TABLE public.form_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view template versions"
ON public.form_template_versions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.form_templates ft 
    WHERE ft.id = template_id 
    AND public.user_belongs_to_company(auth.uid(), ft.company_id)
  )
);

-- Template Acknowledgements
CREATE TABLE public.form_template_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.form_templates(id) ON DELETE CASCADE,
  template_version INTEGER NOT NULL,
  user_id UUID REFERENCES public.profiles(user_id),
  
  acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(template_id, template_version, user_id)
);

ALTER TABLE public.form_template_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own acknowledgements"
ON public.form_template_acknowledgements FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- Form Schedules
CREATE TABLE public.form_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.form_templates(id) NOT NULL,
  
  schedule_name VARCHAR(255),
  
  vessel_id UUID REFERENCES public.vessels(id),
  
  recurrence_type VARCHAR(20) NOT NULL,
  recurrence_config JSONB NOT NULL,
  
  assigned_role VARCHAR(50),
  assigned_user_id UUID REFERENCES public.profiles(user_id),
  
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date TIMESTAMP WITH TIME ZONE,
  
  is_active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMP WITH TIME ZONE,
  
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_form_schedules_next_due ON public.form_schedules(next_due_date) WHERE is_active = true;

ALTER TABLE public.form_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedules in their company"
ON public.form_schedules FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "DPAs can manage schedules"
ON public.form_schedules FOR ALL
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin', 'captain']::app_role[])
);

-- Form Submissions
CREATE TABLE public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  submission_number VARCHAR(50) UNIQUE NOT NULL,
  template_id UUID REFERENCES public.form_templates(id) NOT NULL,
  template_version INTEGER NOT NULL,
  schedule_id UUID REFERENCES public.form_schedules(id),
  
  company_id UUID REFERENCES public.companies(id),
  vessel_id UUID REFERENCES public.vessels(id),
  
  form_data JSONB NOT NULL DEFAULT '{}',
  line_items JSONB DEFAULT '[]',
  
  created_date DATE NOT NULL,
  created_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
  vessel_local_offset_minutes INTEGER,
  due_date TIMESTAMP WITH TIME ZONE,
  
  status VARCHAR(20) DEFAULT 'DRAFT',
  
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP WITH TIME ZONE,
  content_hash VARCHAR(64),
  
  created_offline BOOLEAN DEFAULT false,
  synced_at TIMESTAMP WITH TIME ZONE,
  offline_device_id VARCHAR(100),
  
  linked_incident_id UUID,
  linked_nc_id UUID,
  linked_capa_id UUID,
  linked_audit_id UUID,
  
  requires_amendment BOOLEAN DEFAULT false,
  amendment_of_id UUID REFERENCES public.form_submissions(id),
  amendment_reason TEXT,
  
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  submitted_by UUID REFERENCES public.profiles(user_id)
);

CREATE INDEX idx_form_submissions_template ON public.form_submissions(template_id);
CREATE INDEX idx_form_submissions_vessel ON public.form_submissions(vessel_id, status);
CREATE INDEX idx_form_submissions_user ON public.form_submissions(created_by, status);
CREATE INDEX idx_form_submissions_status ON public.form_submissions(status, due_date);

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view submissions in their company"
ON public.form_submissions FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can create submissions"
ON public.form_submissions FOR INSERT
TO authenticated
WITH CHECK (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update their own draft submissions"
ON public.form_submissions FOR UPDATE
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin', 'captain']::app_role[]))
);

-- Form Signatures
CREATE TABLE public.form_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.form_submissions(id) ON DELETE CASCADE NOT NULL,
  
  signer_user_id UUID REFERENCES public.profiles(user_id) NOT NULL,
  signer_name VARCHAR(255) NOT NULL,
  signer_role VARCHAR(50) NOT NULL,
  signer_rank VARCHAR(100),
  
  signature_order INTEGER NOT NULL,
  signature_type VARCHAR(20) DEFAULT 'TYPED',
  signature_data TEXT,
  
  signed_at TIMESTAMP WITH TIME ZONE,
  
  ip_address VARCHAR(50),
  device_info TEXT,
  user_agent TEXT,
  
  status VARCHAR(20) DEFAULT 'PENDING',
  rejection_reason TEXT,
  delegated_to UUID REFERENCES public.profiles(user_id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(submission_id, signer_user_id, signature_order)
);

CREATE INDEX idx_form_signatures_submission ON public.form_signatures(submission_id);
CREATE INDEX idx_form_signatures_pending ON public.form_signatures(signer_user_id, status) WHERE status = 'PENDING';

ALTER TABLE public.form_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view signatures for accessible submissions"
ON public.form_signatures FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.form_submissions fs 
    WHERE fs.id = submission_id 
    AND public.user_belongs_to_company(auth.uid(), fs.company_id)
  )
);

CREATE POLICY "Users can sign their own signatures"
ON public.form_signatures FOR UPDATE
TO authenticated
USING (signer_user_id = auth.uid());

-- Form Attachments
CREATE TABLE public.form_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  
  field_id VARCHAR(100),
  
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  
  uploaded_by UUID REFERENCES public.profiles(user_id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.form_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments for accessible submissions"
ON public.form_attachments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.form_submissions fs 
    WHERE fs.id = submission_id 
    AND public.user_belongs_to_company(auth.uid(), fs.company_id)
  )
);

CREATE POLICY "Users can upload attachments to their submissions"
ON public.form_attachments FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.form_submissions fs 
    WHERE fs.id = submission_id 
    AND fs.created_by = auth.uid()
    AND fs.status IN ('DRAFT', 'IN_PROGRESS')
  )
);

-- Form Amendments
CREATE TABLE public.form_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.form_submissions(id) NOT NULL,
  
  amendment_number INTEGER NOT NULL,
  amendment_reason TEXT NOT NULL,
  
  previous_data JSONB NOT NULL,
  new_data JSONB NOT NULL,
  changed_fields TEXT[],
  
  requested_by UUID REFERENCES public.profiles(user_id) NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  approved_by UUID REFERENCES public.profiles(user_id),
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_status VARCHAR(20) DEFAULT 'PENDING',
  
  requires_re_signature BOOLEAN DEFAULT true,
  re_signed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.form_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view amendments for accessible submissions"
ON public.form_amendments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.form_submissions fs 
    WHERE fs.id = submission_id 
    AND public.user_belongs_to_company(auth.uid(), fs.company_id)
  )
);

-- Offline Queue
CREATE TABLE public.form_offline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  device_id VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES public.profiles(user_id) NOT NULL,
  
  action_type VARCHAR(20) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  
  payload JSONB NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  synced_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(20) DEFAULT 'PENDING',
  sync_error TEXT
);

CREATE INDEX idx_offline_queue_pending ON public.form_offline_queue(device_id, sync_status) WHERE sync_status = 'PENDING';

ALTER TABLE public.form_offline_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own offline queue"
ON public.form_offline_queue FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- AI Extraction Jobs
CREATE TABLE public.form_ai_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.form_templates(id),
  company_id UUID REFERENCES public.companies(id),
  
  source_file_url TEXT NOT NULL,
  
  status VARCHAR(20) DEFAULT 'PENDING',
  
  extracted_schema JSONB,
  extraction_confidence DECIMAL(3,2),
  extraction_notes TEXT,
  
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.form_ai_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view extraction jobs in their company"
ON public.form_ai_extraction_jobs FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "DPAs can create extraction jobs"
ON public.form_ai_extraction_jobs FOR INSERT
TO authenticated
WITH CHECK (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin']::app_role[])
);

-- Add triggers for updated_at
CREATE TRIGGER update_form_templates_updated_at
BEFORE UPDATE ON public.form_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate submission number
CREATE OR REPLACE FUNCTION public.generate_form_submission_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template_code TEXT;
  seq_num INTEGER;
BEGIN
  -- Get template code
  SELECT ft.template_code INTO template_code
  FROM form_templates ft
  WHERE ft.id = NEW.template_id;
  
  -- Get next sequence number for this template
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(submission_number, '-', 3) AS INTEGER)
  ), 0) + 1 INTO seq_num
  FROM form_submissions
  WHERE template_id = NEW.template_id;
  
  -- Generate submission number: TEMPLATE_CODE-YYYYMMDD-NNNN
  NEW.submission_number := template_code || '-' || TO_CHAR(NEW.created_date, 'YYYYMMDD') || '-' || LPAD(seq_num::TEXT, 4, '0');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER generate_submission_number
BEFORE INSERT ON public.form_submissions
FOR EACH ROW
WHEN (NEW.submission_number IS NULL OR NEW.submission_number = '')
EXECUTE FUNCTION public.generate_form_submission_number();