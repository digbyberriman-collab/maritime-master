
DROP POLICY IF EXISTS "DPAs can manage form templates" ON public.form_templates;

-- Separate INSERT policy
CREATE POLICY "Authenticated users in company can insert form templates"
ON public.form_templates
FOR INSERT
TO authenticated
WITH CHECK (
  user_belongs_to_company(auth.uid(), company_id)
  AND (
    has_any_role(auth.uid(), ARRAY['dpa'::app_role, 'fleet_master'::app_role, 'superadmin'::app_role])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('dpa'::user_role, 'shore_management'::user_role, 'master'::user_role)
    )
  )
);

-- Separate UPDATE policy
CREATE POLICY "Authenticated users in company can update form templates"
ON public.form_templates
FOR UPDATE
TO authenticated
USING (
  user_belongs_to_company(auth.uid(), company_id)
  AND (
    has_any_role(auth.uid(), ARRAY['dpa'::app_role, 'fleet_master'::app_role, 'superadmin'::app_role])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('dpa'::user_role, 'shore_management'::user_role, 'master'::user_role)
    )
  )
)
WITH CHECK (
  user_belongs_to_company(auth.uid(), company_id)
);

-- Separate DELETE policy
CREATE POLICY "Authenticated users in company can delete form templates"
ON public.form_templates
FOR DELETE
TO authenticated
USING (
  user_belongs_to_company(auth.uid(), company_id)
  AND (
    has_any_role(auth.uid(), ARRAY['dpa'::app_role, 'fleet_master'::app_role, 'superadmin'::app_role])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('dpa'::user_role, 'shore_management'::user_role, 'master'::user_role)
    )
  )
);
