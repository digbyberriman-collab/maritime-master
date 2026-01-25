-- Fix overly permissive RLS on maintenance_task_templates
DROP POLICY IF EXISTS "Users can manage maintenance templates" ON public.maintenance_task_templates;

-- Replace with proper company-scoped policies
CREATE POLICY "Users can insert maintenance templates in their company"
ON public.maintenance_task_templates FOR INSERT
WITH CHECK (
  (category_id IS NOT NULL) OR
  EXISTS (
    SELECT 1 FROM equipment e
    JOIN vessels v ON v.id = e.vessel_id
    WHERE e.id = maintenance_task_templates.equipment_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  )
);

CREATE POLICY "Users can update maintenance templates in their company"
ON public.maintenance_task_templates FOR UPDATE
USING (
  (equipment_id IS NULL AND category_id IS NOT NULL) OR
  EXISTS (
    SELECT 1 FROM equipment e
    JOIN vessels v ON v.id = e.vessel_id
    WHERE e.id = maintenance_task_templates.equipment_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  )
);

CREATE POLICY "Users can delete maintenance templates in their company"
ON public.maintenance_task_templates FOR DELETE
USING (
  (equipment_id IS NULL AND category_id IS NOT NULL) OR
  EXISTS (
    SELECT 1 FROM equipment e
    JOIN vessels v ON v.id = e.vessel_id
    WHERE e.id = maintenance_task_templates.equipment_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  )
);