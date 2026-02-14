
DROP POLICY IF EXISTS "DPAs can manage form templates" ON public.form_templates;

CREATE POLICY "DPAs can manage form templates" ON public.form_templates
FOR ALL
USING (
  user_belongs_to_company(auth.uid(), company_id)
  AND (
    has_any_role(auth.uid(), ARRAY['dpa'::app_role, 'fleet_master'::app_role, 'superadmin'::app_role])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('dpa', 'shore_management', 'master')
    )
  )
)
WITH CHECK (
  user_belongs_to_company(auth.uid(), company_id)
  AND (
    has_any_role(auth.uid(), ARRAY['dpa'::app_role, 'fleet_master'::app_role, 'superadmin'::app_role])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('dpa', 'shore_management', 'master')
    )
  )
);
