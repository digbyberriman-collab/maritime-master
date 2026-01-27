-- Create roles table for custom role management
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  role_code VARCHAR(50) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system_role BOOLEAN DEFAULT false,
  is_custom BOOLEAN DEFAULT false,
  scope_type VARCHAR(20) DEFAULT 'vessel' CHECK (scope_type IN ('fleet', 'vessel', 'department', 'self')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(company_id, role_code)
);

-- Create permissions table (module/action combinations)
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(module, action)
);

-- Create role-permission mapping table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE NOT NULL,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  vessel_scope BOOLEAN DEFAULT false,
  department_scope BOOLEAN DEFAULT false,
  self_only BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- Create field redactions table
CREATE TABLE IF NOT EXISTS public.field_redactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  module VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  restricted_role_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(company_id, module, field_name)
);

-- Enable RLS on all tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_redactions ENABLE ROW LEVEL SECURITY;

-- RLS for roles: users can only see roles for their company
CREATE POLICY "Users can view roles for their company"
ON public.roles FOR SELECT
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "DPA can manage roles for their company"
ON public.roles FOR ALL
USING (
  company_id IN (
    SELECT company_id FROM public.profiles 
    WHERE user_id = auth.uid() AND role IN ('dpa', 'shore_management')
  )
);

-- RLS for permissions: all authenticated users can view
CREATE POLICY "Authenticated users can view permissions"
ON public.permissions FOR SELECT
TO authenticated
USING (true);

-- RLS for role_permissions: users can view their company's role permissions
CREATE POLICY "Users can view role permissions for their company"
ON public.role_permissions FOR SELECT
USING (
  role_id IN (
    SELECT id FROM public.roles WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "DPA can manage role permissions"
ON public.role_permissions FOR ALL
USING (
  role_id IN (
    SELECT id FROM public.roles WHERE company_id IN (
      SELECT company_id FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('dpa', 'shore_management')
    )
  )
);

-- RLS for field_redactions
CREATE POLICY "Users can view field redactions for their company"
ON public.field_redactions FOR SELECT
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "DPA can manage field redactions"
ON public.field_redactions FOR ALL
USING (
  company_id IN (
    SELECT company_id FROM public.profiles 
    WHERE user_id = auth.uid() AND role IN ('dpa', 'shore_management')
  )
);

-- Seed permissions table with all module/action combinations
INSERT INTO public.permissions (module, action, description) VALUES
  ('ism_forms', 'view', 'View ISM/SMS forms'),
  ('ism_forms', 'create', 'Create ISM/SMS forms'),
  ('ism_forms', 'edit', 'Edit ISM/SMS forms'),
  ('ism_forms', 'approve', 'Approve ISM/SMS forms'),
  ('ism_forms', 'sign', 'Sign ISM/SMS forms'),
  ('ism_forms', 'export', 'Export ISM/SMS forms'),
  ('documents', 'view', 'View documents'),
  ('documents', 'create', 'Create documents'),
  ('documents', 'edit', 'Edit documents'),
  ('documents', 'approve', 'Approve documents'),
  ('documents', 'delete', 'Delete documents'),
  ('documents', 'export', 'Export documents'),
  ('crew_certificates', 'view', 'View crew certificates'),
  ('crew_certificates', 'create', 'Create crew certificates'),
  ('crew_certificates', 'edit', 'Edit crew certificates'),
  ('crew_certificates', 'approve', 'Approve crew certificates'),
  ('crew_certificates', 'delete', 'Delete crew certificates'),
  ('crew_certificates', 'export', 'Export crew certificates'),
  ('vessel_certificates', 'view', 'View vessel certificates'),
  ('vessel_certificates', 'create', 'Create vessel certificates'),
  ('vessel_certificates', 'edit', 'Edit vessel certificates'),
  ('vessel_certificates', 'approve', 'Approve vessel certificates'),
  ('vessel_certificates', 'delete', 'Delete vessel certificates'),
  ('vessel_certificates', 'export', 'Export vessel certificates'),
  ('incidents', 'view', 'View incidents'),
  ('incidents', 'create', 'Report incidents'),
  ('incidents', 'edit', 'Edit incidents'),
  ('incidents', 'approve', 'Approve incident investigations'),
  ('incidents', 'delete', 'Delete incidents'),
  ('incidents', 'export', 'Export incidents'),
  ('drills', 'view', 'View drills'),
  ('drills', 'create', 'Schedule drills'),
  ('drills', 'edit', 'Edit drills'),
  ('drills', 'delete', 'Delete drills'),
  ('drills', 'export', 'Export drills'),
  ('training', 'view', 'View training records'),
  ('training', 'create', 'Create training records'),
  ('training', 'edit', 'Edit training records'),
  ('training', 'delete', 'Delete training records'),
  ('training', 'export', 'Export training records'),
  ('hours_of_rest', 'view', 'View hours of rest'),
  ('hours_of_rest', 'create', 'Log hours of rest'),
  ('hours_of_rest', 'edit', 'Edit hours of rest'),
  ('hours_of_rest', 'export', 'Export hours of rest'),
  ('audits', 'view', 'View audits'),
  ('audits', 'create', 'Create audits'),
  ('audits', 'edit', 'Edit audits'),
  ('audits', 'export', 'Export audits'),
  ('maintenance', 'view', 'View maintenance'),
  ('maintenance', 'export', 'Export maintenance'),
  ('fleet_map', 'view', 'View fleet map'),
  ('settings', 'view', 'View settings'),
  ('settings', 'edit', 'Edit settings'),
  ('settings', 'configure', 'Configure system settings')
ON CONFLICT (module, action) DO NOTHING;

-- Add updated_at triggers
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_field_redactions_updated_at
  BEFORE UPDATE ON public.field_redactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();