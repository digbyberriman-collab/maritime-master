-- Function to get top alerts for dashboard
CREATE OR REPLACE FUNCTION get_dashboard_alerts(
  p_company_id UUID,
  p_vessel_id UUID DEFAULT NULL,
  p_all_vessels BOOLEAN DEFAULT FALSE,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  severity TEXT,
  source_module TEXT,
  due_at TIMESTAMPTZ,
  vessel_id UUID,
  vessel_name TEXT,
  created_at TIMESTAMPTZ,
  is_overdue BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.title::TEXT,
    a.severity_color::TEXT AS severity,
    a.source_module::TEXT,
    a.due_at,
    a.vessel_id,
    v.name::TEXT AS vessel_name,
    a.created_at,
    (a.due_at IS NOT NULL AND a.due_at < NOW()) AS is_overdue
  FROM alerts a
  LEFT JOIN vessels v ON v.id = a.vessel_id
  WHERE 
    a.company_id = p_company_id
    AND a.status = 'OPEN'::alert_status
    AND (p_all_vessels OR a.vessel_id = p_vessel_id)
  ORDER BY 
    CASE a.severity_color WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END,
    (a.due_at IS NOT NULL AND a.due_at < NOW()) DESC,
    a.due_at ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Function to get expiring certificates (both vessel and crew)
CREATE OR REPLACE FUNCTION get_expiring_certificates(
  p_company_id UUID,
  p_vessel_id UUID DEFAULT NULL,
  p_all_vessels BOOLEAN DEFAULT FALSE,
  p_days INT DEFAULT 90
)
RETURNS TABLE (
  id UUID,
  certificate_type TEXT,
  certificate_name TEXT,
  expiry_date DATE,
  days_until_expiry INT,
  vessel_id UUID,
  vessel_name TEXT,
  is_crew_cert BOOLEAN,
  crew_member_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  -- Vessel certificates
  SELECT 
    c.id,
    c.certificate_type::TEXT,
    c.certificate_name::TEXT,
    c.expiry_date::DATE,
    (c.expiry_date::DATE - CURRENT_DATE)::INT AS days_until_expiry,
    c.vessel_id,
    v.name::TEXT AS vessel_name,
    FALSE AS is_crew_cert,
    NULL::TEXT AS crew_member_name
  FROM certificates c
  JOIN vessels v ON v.id = c.vessel_id
  WHERE 
    c.company_id = p_company_id
    AND c.vessel_id IS NOT NULL
    AND c.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_days || ' days')::INTERVAL
    AND (p_all_vessels OR c.vessel_id = p_vessel_id)
  
  UNION ALL
  
  -- Crew certificates
  SELECT 
    cc.id,
    cc.certificate_type::TEXT,
    cc.certificate_name::TEXT,
    cc.expiry_date::DATE,
    (cc.expiry_date::DATE - CURRENT_DATE)::INT AS days_until_expiry,
    ca.vessel_id,
    v.name::TEXT AS vessel_name,
    TRUE AS is_crew_cert,
    (p.first_name || ' ' || p.last_name)::TEXT AS crew_member_name
  FROM crew_certificates cc
  JOIN profiles p ON p.user_id = cc.user_id
  JOIN crew_assignments ca ON ca.user_id = cc.user_id AND ca.is_current = true
  JOIN vessels v ON v.id = ca.vessel_id
  WHERE 
    cc.expiry_date IS NOT NULL
    AND cc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_days || ' days')::INTERVAL
    AND (p_all_vessels OR ca.vessel_id = p_vessel_id)
  
  ORDER BY days_until_expiry ASC
  LIMIT 20;
END;
$$;

-- Function to get upcoming audits/surveys
CREATE OR REPLACE FUNCTION get_upcoming_audits(
  p_company_id UUID,
  p_vessel_id UUID DEFAULT NULL,
  p_all_vessels BOOLEAN DEFAULT FALSE,
  p_days INT DEFAULT 90
)
RETURNS TABLE (
  id UUID,
  audit_type TEXT,
  audit_number TEXT,
  audit_scope TEXT,
  scheduled_date DATE,
  days_until_due INT,
  vessel_id UUID,
  vessel_name TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.audit_type::TEXT,
    a.audit_number::TEXT,
    a.audit_scope::TEXT,
    a.scheduled_date::DATE,
    (a.scheduled_date::DATE - CURRENT_DATE)::INT AS days_until_due,
    a.vessel_id,
    v.name::TEXT AS vessel_name,
    a.status::TEXT
  FROM audits a
  LEFT JOIN vessels v ON v.id = a.vessel_id
  WHERE 
    a.company_id = p_company_id
    AND a.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_days || ' days')::INTERVAL
    AND a.status IN ('scheduled', 'pending', 'in_progress')
    AND (p_all_vessels OR a.vessel_id = p_vessel_id)
  ORDER BY a.scheduled_date ASC
  LIMIT 10;
END;
$$;

-- Activity log table for tracking vessel activity
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  vessel_id UUID REFERENCES vessels(id),
  
  -- Activity details
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'form_submitted', 'form_approved', 'form_rejected',
    'incident_logged', 'incident_closed',
    'certificate_uploaded', 'certificate_expired', 'certificate_renewed',
    'crew_joined', 'crew_left', 'crew_status_changed',
    'drill_completed', 'drill_overdue',
    'maintenance_completed', 'defect_raised', 'defect_closed',
    'audit_completed', 'nc_raised', 'nc_closed', 'capa_opened', 'capa_closed',
    'alert_created', 'alert_acknowledged', 'alert_resolved',
    'document_uploaded', 'task_completed'
  )),
  
  -- Context
  title TEXT NOT NULL,
  description TEXT,
  module TEXT,
  record_id UUID,
  record_type TEXT,
  
  -- Actor
  performed_by UUID REFERENCES auth.users(id),
  performed_by_name TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for activity_log
CREATE INDEX IF NOT EXISTS idx_activity_company ON activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_vessel ON activity_log(vessel_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at DESC);

-- Enable RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for activity_log
CREATE POLICY "Users can view activity for their company"
ON activity_log FOR SELECT
USING (company_id = (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert activity for their company"
ON activity_log FOR INSERT
WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

-- Function to get recent activity
CREATE OR REPLACE FUNCTION get_recent_activity(
  p_company_id UUID,
  p_vessel_id UUID DEFAULT NULL,
  p_all_vessels BOOLEAN DEFAULT FALSE,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  activity_type TEXT,
  title TEXT,
  description TEXT,
  module TEXT,
  record_id UUID,
  vessel_id UUID,
  vessel_name TEXT,
  performed_by_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.id,
    al.activity_type,
    al.title,
    al.description,
    al.module,
    al.record_id,
    al.vessel_id,
    v.name::TEXT AS vessel_name,
    al.performed_by_name,
    al.created_at
  FROM activity_log al
  LEFT JOIN vessels v ON v.id = al.vessel_id
  WHERE 
    al.company_id = p_company_id
    AND (p_all_vessels OR al.vessel_id = p_vessel_id)
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$$;