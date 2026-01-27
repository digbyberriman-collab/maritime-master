-- Create audit_mode_sessions table
CREATE TABLE public.audit_mode_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  audit_party VARCHAR(50) NOT NULL CHECK (audit_party IN ('flag', 'class', 'internal', 'external')),
  audit_party_name VARCHAR(255),
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  visible_modules JSONB NOT NULL DEFAULT '{"certificates": true, "crew": true, "incidents": true, "drills": true, "training": true, "maintenance": false, "documents": true}'::jsonb,
  redaction_rules JSONB NOT NULL DEFAULT '{"hide_overdue": false, "anonymize_medical": true, "hide_maintenance_details": true, "show_summary_only": false}'::jsonb,
  access_token VARCHAR(255) UNIQUE,
  access_token_expires_at TIMESTAMPTZ,
  auditor_email VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_datetime_range CHECK (end_datetime > start_datetime)
);

-- Create audit_mode_access_log table
CREATE TABLE public.audit_mode_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_session_id UUID REFERENCES public.audit_mode_sessions(id) ON DELETE CASCADE NOT NULL,
  accessed_module VARCHAR(50),
  accessed_entity_type VARCHAR(50),
  accessed_entity_id UUID,
  action VARCHAR(20),
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_mode_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_mode_access_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for audit_mode_sessions
CREATE POLICY "Users can view audit sessions in their company"
  ON public.audit_mode_sessions
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "DPA and shore management can manage audit sessions"
  ON public.audit_mode_sessions
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('dpa', 'shore_management')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('dpa', 'shore_management')
    )
  );

CREATE POLICY "Captains can manage audit sessions for their vessels"
  ON public.audit_mode_sessions
  FOR ALL
  TO authenticated
  USING (
    vessel_id IN (
      SELECT vessel_id FROM public.crew_assignments 
      WHERE user_id = auth.uid() 
      AND is_current = true
      AND position IN ('Captain', 'Master')
    )
  )
  WITH CHECK (
    vessel_id IN (
      SELECT vessel_id FROM public.crew_assignments 
      WHERE user_id = auth.uid() 
      AND is_current = true
      AND position IN ('Captain', 'Master')
    )
  );

-- RLS Policies for audit_mode_access_log
CREATE POLICY "Users can view access logs for sessions in their company"
  ON public.audit_mode_access_log
  FOR SELECT
  TO authenticated
  USING (
    audit_session_id IN (
      SELECT id FROM public.audit_mode_sessions 
      WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert access logs"
  ON public.audit_mode_access_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add updated_at trigger
CREATE TRIGGER update_audit_mode_sessions_updated_at
  BEFORE UPDATE ON public.audit_mode_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster token lookups
CREATE INDEX idx_audit_mode_sessions_access_token ON public.audit_mode_sessions(access_token) WHERE access_token IS NOT NULL;
CREATE INDEX idx_audit_mode_sessions_company_active ON public.audit_mode_sessions(company_id, is_active);
CREATE INDEX idx_audit_mode_access_log_session ON public.audit_mode_access_log(audit_session_id);