
-- =============================================
-- STORM RBAC System - Part 1: Complete Schema
-- =============================================

-- First, rename existing conflicting tables to preserve data
ALTER TABLE IF EXISTS roles RENAME TO roles_legacy_v1;
ALTER TABLE IF EXISTS role_permissions RENAME TO role_permissions_legacy_v1;

-- Create enum for scope types
CREATE TYPE role_scope_type AS ENUM ('fleet', 'vessel', 'department', 'self');

-- Create permission level enum
CREATE TYPE permission_level AS ENUM ('view', 'edit', 'admin');

-- Create audit action type enum
CREATE TYPE audit_action_type AS ENUM (
  'role_assigned',
  'role_removed',
  'permission_granted',
  'permission_revoked',
  'permission_updated',
  'scope_changed',
  'override_added',
  'override_removed',
  'role_created',
  'role_updated',
  'role_deleted',
  'api_access_granted',
  'api_access_revoked',
  'audit_mode_enabled',
  'audit_mode_disabled'
);

-- =============================================
-- TABLE 1: roles
-- =============================================
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  is_system_role BOOLEAN DEFAULT true,
  default_scope role_scope_type DEFAULT 'vessel',
  is_api_only BOOLEAN DEFAULT false,
  is_time_limited BOOLEAN DEFAULT false,
  max_session_hours INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert 11 system roles
INSERT INTO roles (name, display_name, description, default_scope, is_api_only, is_time_limited, max_session_hours) VALUES
  ('dpa', 'DPA (Designated Person Ashore)', 'Full fleet access, compliance oversight, all administrative functions', 'fleet', false, false, NULL),
  ('fleet_master', 'Fleet Master', 'Fleet-wide operational oversight, multi-vessel coordination', 'fleet', false, false, NULL),
  ('captain', 'Captain/Master', 'Vessel master, full vessel authority, ISM responsible person', 'vessel', false, false, NULL),
  ('purser', 'Purser', 'Administrative officer, crew records, documentation, finances', 'vessel', false, false, NULL),
  ('chief_officer', 'Chief Officer', 'Senior deck officer, safety management, ISM compliance', 'vessel', false, false, NULL),
  ('chief_engineer', 'Chief Engineer', 'Senior engineering officer, maintenance, technical systems', 'vessel', false, false, NULL),
  ('hod', 'Head of Department', 'Department head (Interior, Deck, etc.), team management', 'department', false, false, NULL),
  ('officer', 'Officer', 'Licensed officer, watchkeeping, form completion', 'vessel', false, false, NULL),
  ('crew', 'Crew', 'General crew member, self-service access', 'self', false, false, NULL),
  ('auditor', 'Auditor', 'External auditor, time-limited read-only access', 'vessel', false, true, 72),
  ('employer_api', 'Employer API Client', 'API integration for employer systems', 'fleet', true, false, NULL);

-- Enable RLS on roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roles are readable by authenticated users" ON roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can modify roles" ON roles
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

-- =============================================
-- TABLE 2: modules
-- =============================================
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  parent_key TEXT,
  icon TEXT,
  route TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  supports_scoping BOOLEAN DEFAULT true,
  api_accessible BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert 26 modules
INSERT INTO modules (key, name, description, route, icon, sort_order, api_accessible) VALUES
  ('dashboard', 'Dashboard', 'Main overview and alerts', '/', 'LayoutDashboard', 1, true),
  ('fleet', 'Fleet', 'Fleet overview, groups, and map', '/fleet', 'Ship', 2, false),
  ('vessels', 'Vessels', 'Vessel profiles and details', '/vessels', 'Anchor', 3, false),
  ('crew_roster', 'Crew Roster', 'Master crew list and assignments', '/crew', 'Users', 4, true),
  ('crew_certificates', 'Crew Certificates', 'Crew certifications and expiries', '/crew/certificates', 'Award', 5, false),
  ('vessel_certificates', 'Vessel Certificates', 'Vessel certifications and surveys', '/vessels/certificates', 'FileCheck', 6, false),
  ('documents', 'Documents', 'Controlled document management', '/documents', 'FileText', 7, false),
  ('ism', 'ISM', 'ISM checklists and forms', '/ism', 'Shield', 8, false),
  ('erm', 'ERM', 'Emergency Response Manual', '/ism/erm', 'AlertTriangle', 9, false),
  ('ptw', 'Permits to Work', 'Work permit management', '/ism/permits-to-work', 'ClipboardCheck', 10, false),
  ('risk_assessments', 'Risk Assessments', 'Risk assessment forms', '/ism/risk-assessments', 'AlertCircle', 11, false),
  ('sops', 'SOPs', 'Standard Operating Procedures', '/ism/sops', 'BookOpen', 12, false),
  ('drills', 'Drills', 'Drill scheduling and records', '/ism/drills', 'Siren', 13, false),
  ('training', 'Training', 'Training records and planning', '/ism/training', 'GraduationCap', 14, false),
  ('meetings', 'Meetings', 'Safety meetings and minutes', '/ism/meetings', 'Calendar', 15, false),
  ('incidents', 'Incidents', 'Incident reporting', '/ism/incidents', 'AlertOctagon', 16, false),
  ('investigations', 'Investigations', 'Incident investigations', '/ism/investigations', 'Search', 17, false),
  ('capa', 'CAPA', 'Corrective and Preventive Actions', '/ism/corrective-actions', 'Wrench', 18, false),
  ('non_conformities', 'Non-Conformities', 'NC tracking and closeout', '/ism/non-conformities', 'XCircle', 19, false),
  ('observations', 'Observations', 'Safety observations', '/ism/observations', 'Eye', 20, false),
  ('audits_surveys', 'Audits & Surveys', 'Audit management', '/ism/audits-surveys', 'ClipboardList', 21, false),
  ('maintenance', 'Maintenance', 'Maintenance overlay dashboard', '/maintenance', 'Settings', 22, false),
  ('insurance', 'Insurance', 'Insurance policies and claims', '/insurance', 'Shield', 23, false),
  ('hr', 'HR', 'Human resources management', '/hr', 'UserCog', 24, true),
  ('reports', 'Reports', 'Reports and analytics', '/reports', 'BarChart', 25, false),
  ('settings', 'Settings', 'System configuration', '/settings', 'Cog', 99, false);

-- Add self-referencing FK
ALTER TABLE modules ADD CONSTRAINT modules_parent_key_fkey 
  FOREIGN KEY (parent_key) REFERENCES modules(key) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Modules are readable by authenticated users" ON modules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can modify modules" ON modules
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

-- =============================================
-- TABLE 3: role_permissions
-- =============================================
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  permission permission_level NOT NULL,
  scope role_scope_type NOT NULL DEFAULT 'vessel',
  restrictions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, module_key, permission)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_module ON role_permissions(module_key);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Role permissions are readable by authenticated users" ON role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can modify role permissions" ON role_permissions
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

-- =============================================
-- TABLE 4: rbac_user_roles
-- =============================================
CREATE TABLE rbac_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES vessels(id) ON DELETE CASCADE,
  department TEXT,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, role_id, vessel_id)
);

CREATE INDEX idx_rbac_user_roles_user ON rbac_user_roles(user_id);
CREATE INDEX idx_rbac_user_roles_vessel ON rbac_user_roles(vessel_id);
CREATE INDEX idx_rbac_user_roles_role ON rbac_user_roles(role_id);

ALTER TABLE rbac_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own role assignments" ON rbac_user_roles
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

CREATE POLICY "Only admins can modify role assignments" ON rbac_user_roles
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

-- =============================================
-- TABLE 5: user_permission_overrides
-- =============================================
CREATE TABLE user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  permission permission_level NOT NULL,
  is_granted BOOLEAN NOT NULL,
  scope role_scope_type,
  restrictions JSONB DEFAULT '{}',
  reason TEXT NOT NULL,
  valid_until TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, module_key, permission)
);

CREATE INDEX idx_user_permission_overrides_user ON user_permission_overrides(user_id);
CREATE INDEX idx_user_permission_overrides_module ON user_permission_overrides(module_key);

ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own permission overrides" ON user_permission_overrides
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

CREATE POLICY "Only admins can modify permission overrides" ON user_permission_overrides
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

-- =============================================
-- TABLE 6: permission_audit_log
-- =============================================
CREATE TABLE permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp_utc TIMESTAMPTZ DEFAULT NOW(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id),
  actor_role TEXT NOT NULL,
  action_type audit_action_type NOT NULL,
  target_user_id UUID REFERENCES auth.users(id),
  target_role_id UUID REFERENCES roles(id),
  target_module_key TEXT REFERENCES modules(key),
  before_state JSONB,
  after_state JSONB,
  reason_text TEXT,
  vessel_scope UUID REFERENCES vessels(id),
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  is_high_impact BOOLEAN DEFAULT false
);

CREATE INDEX idx_permission_audit_log_timestamp ON permission_audit_log(timestamp_utc DESC);
CREATE INDEX idx_permission_audit_log_actor ON permission_audit_log(actor_user_id);
CREATE INDEX idx_permission_audit_log_target_user ON permission_audit_log(target_user_id);
CREATE INDEX idx_permission_audit_log_action ON permission_audit_log(action_type);

ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view permission audit logs" ON permission_audit_log
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

CREATE POLICY "Admins can insert audit logs" ON permission_audit_log
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role) OR 
    public.has_role(auth.uid(), 'dpa'::app_role)
  );

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to log permission changes
CREATE OR REPLACE FUNCTION log_permission_change(
  p_actor_user_id UUID,
  p_actor_role TEXT,
  p_action_type audit_action_type,
  p_target_user_id UUID DEFAULT NULL,
  p_target_role_id UUID DEFAULT NULL,
  p_target_module_key TEXT DEFAULT NULL,
  p_before_state JSONB DEFAULT NULL,
  p_after_state JSONB DEFAULT NULL,
  p_reason_text TEXT DEFAULT NULL,
  p_vessel_scope UUID DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_is_high_impact BOOLEAN := false;
BEGIN
  IF p_action_type IN ('role_assigned', 'role_removed', 'permission_revoked', 'api_access_granted') 
     OR p_target_module_key IN ('settings', 'hr', 'insurance', 'incidents') THEN
    v_is_high_impact := true;
  END IF;

  INSERT INTO permission_audit_log (
    actor_user_id, actor_role, action_type,
    target_user_id, target_role_id, target_module_key,
    before_state, after_state, reason_text,
    vessel_scope, ip_address, user_agent, is_high_impact
  ) VALUES (
    p_actor_user_id, p_actor_role, p_action_type,
    p_target_user_id, p_target_role_id, p_target_module_key,
    p_before_state, p_after_state, p_reason_text,
    p_vessel_scope, p_ip_address, p_user_agent, v_is_high_impact
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get user permissions
CREATE OR REPLACE FUNCTION get_user_rbac_permissions(p_user_id UUID)
RETURNS TABLE (
  module_key TEXT,
  permission permission_level,
  scope role_scope_type,
  restrictions JSONB,
  source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    rp.module_key,
    rp.permission,
    rp.scope,
    rp.restrictions,
    'role'::TEXT AS source
  FROM rbac_user_roles ur
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
  
  UNION ALL
  
  SELECT
    upo.module_key,
    upo.permission,
    upo.scope,
    upo.restrictions,
    'override'::TEXT AS source
  FROM user_permission_overrides upo
  WHERE upo.user_id = p_user_id
    AND upo.is_granted = true
    AND (upo.valid_until IS NULL OR upo.valid_until > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to check module access
CREATE OR REPLACE FUNCTION user_has_module_access(
  p_user_id UUID,
  p_module_key TEXT,
  p_required_permission permission_level DEFAULT 'view'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_access BOOLEAN := false;
  v_is_denied BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM user_permission_overrides upo
    WHERE upo.user_id = p_user_id
      AND upo.module_key = p_module_key
      AND upo.is_granted = false
      AND (upo.valid_until IS NULL OR upo.valid_until > NOW())
  ) INTO v_is_denied;
  
  IF v_is_denied THEN
    RETURN false;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM get_user_rbac_permissions(p_user_id) gup
    WHERE gup.module_key = p_module_key
      AND (
        gup.permission = p_required_permission
        OR (p_required_permission = 'view' AND gup.permission IN ('view', 'edit', 'admin'))
        OR (p_required_permission = 'edit' AND gup.permission IN ('edit', 'admin'))
      )
  ) INTO v_has_access;
  
  RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_roles_updated_at();

CREATE TRIGGER trigger_role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
