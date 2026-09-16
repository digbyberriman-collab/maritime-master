-- Canonical editor check for the rotation planner and linked leave/travel records
CREATE OR REPLACE FUNCTION public.frp_can_edit(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['superadmin','dpa','fleet_master','captain','hod','purser']::app_role[])
    OR public.user_has_module_access(_user_id, 'crew', 'edit')
    OR public.user_has_module_access(_user_id, 'crew', 'admin');
$$;

-- Viewer check: editors plus crew-level roles who may read the planner
CREATE OR REPLACE FUNCTION public.frp_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.frp_can_edit(_user_id)
    OR public.has_any_role(_user_id, ARRAY['chief_officer','chief_engineer','officer','crew']::app_role[])
    OR public.user_has_module_access(_user_id, 'crew', 'view');
$$;

-- Access summary consumed by the planner UI so controls match the RLS rules
CREATE OR REPLACE FUNCTION public.frp_planner_access()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'can_view', public.frp_can_view(auth.uid()),
    'can_edit', public.frp_can_edit(auth.uid()),
    'roles', COALESCE((
      SELECT jsonb_agg(DISTINCT ur.role::text)
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.frp_can_view(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.frp_planner_access() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.frp_can_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frp_planner_access() TO authenticated;

-- Leave calendar: read for the whole company, writes for editors only
DROP POLICY IF EXISTS "Users can insert leave entries in their company" ON public.crew_leave_entries;
DROP POLICY IF EXISTS "Users can update leave entries in their company" ON public.crew_leave_entries;
DROP POLICY IF EXISTS "Users can delete leave entries in their company" ON public.crew_leave_entries;

CREATE POLICY "Editors can insert leave entries" ON public.crew_leave_entries
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.frp_can_edit(auth.uid()));

CREATE POLICY "Editors can update leave entries" ON public.crew_leave_entries
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.frp_can_edit(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.frp_can_edit(auth.uid()));

CREATE POLICY "Editors can delete leave entries" ON public.crew_leave_entries
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.frp_can_edit(auth.uid()));

-- Leave requests: crew may raise and withdraw their own; editors manage all
DROP POLICY IF EXISTS "Users can insert leave requests in their company" ON public.crew_leave_requests;
DROP POLICY IF EXISTS "Users can update leave requests in their company" ON public.crew_leave_requests;

CREATE POLICY "Own or editor leave request insert" ON public.crew_leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (crew_id = auth.uid() OR public.frp_can_edit(auth.uid()))
  );

CREATE POLICY "Own pending or editor leave request update" ON public.crew_leave_requests
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.frp_can_edit(auth.uid())
      OR (crew_id = auth.uid() AND COALESCE(status, 'pending') = 'pending')
    )
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.frp_can_edit(auth.uid())
      OR (crew_id = auth.uid() AND COALESCE(status, 'pending') = 'pending')
    )
  );