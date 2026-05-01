-- Drop the recursive policy
DROP POLICY IF EXISTS "Admins can view all roles in company" ON public.user_roles;

-- Helper: get current user's company_id without triggering RLS
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1
$$;

-- Recreate policy using security-definer functions (no self-reference in USING)
CREATE POLICY "Admins can view all roles in company"
ON public.user_roles
FOR SELECT
USING (
  public.has_any_role(auth.uid(), ARRAY['superadmin'::app_role, 'dpa'::app_role])
  OR (
    public.has_any_role(
      auth.uid(),
      ARRAY['superadmin'::app_role, 'dpa'::app_role, 'fleet_master'::app_role, 'captain'::app_role, 'purser'::app_role]
    )
    AND company_id = public.current_user_company_id()
  )
);