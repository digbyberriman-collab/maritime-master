-- Create enum for application roles
CREATE TYPE public.app_role AS ENUM (
  'superadmin',
  'dpa',
  'fleet_master',
  'captain',
  'purser',
  'chief_officer',
  'chief_engineer',
  'hod',
  'officer',
  'crew',
  'auditor_flag',
  'auditor_class',
  'travel_agent',
  'employer_api'
);

-- Create user_roles table for proper RBAC
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  department VARCHAR(50),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role, company_id, vessel_id)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Function to check role with company scope
CREATE OR REPLACE FUNCTION public.has_role_in_company(_user_id UUID, _role app_role, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND company_id = _company_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Function to check role with vessel scope
CREATE OR REPLACE FUNCTION public.has_role_on_vessel(_user_id UUID, _role app_role, _vessel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND vessel_id = _vessel_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Function to get all active roles for a user
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS TABLE(role app_role, company_id UUID, vessel_id UUID, department VARCHAR)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, company_id, vessel_id, department
  FROM public.user_roles
  WHERE user_id = _user_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
$$;

-- Function to check if user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = ANY(_roles)
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Function to check fleet-level access
CREATE OR REPLACE FUNCTION public.has_fleet_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('superadmin', 'dpa', 'fleet_master')
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- RLS Policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles in company"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['superadmin'::app_role, 'dpa'::app_role])
  OR (
    company_id IN (
      SELECT ur.company_id FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('superadmin', 'dpa', 'fleet_master', 'captain', 'purser')
      AND ur.is_active = true
    )
  )
);

CREATE POLICY "Superadmin and DPA can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['superadmin'::app_role, 'dpa'::app_role])
)
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['superadmin'::app_role, 'dpa'::app_role])
);

-- Create indexes for performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
CREATE INDEX idx_user_roles_company_id ON public.user_roles(company_id);
CREATE INDEX idx_user_roles_vessel_id ON public.user_roles(vessel_id);
CREATE INDEX idx_user_roles_active ON public.user_roles(user_id, is_active) WHERE is_active = true;

-- Create updated_at trigger
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();