CREATE OR REPLACE FUNCTION public.has_fleet_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('superadmin', 'dpa', 'fleet_master')
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND role IN ('dpa', 'shore_management')
  )
  OR EXISTS (
    SELECT 1
    FROM public.rbac_user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until > now())
      AND r.name IN ('dpa', 'fleet_master', 'superadmin')
  )
$$;