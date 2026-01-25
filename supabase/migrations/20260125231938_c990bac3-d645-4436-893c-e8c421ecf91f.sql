-- Equipment Categories (hierarchical)
CREATE TABLE public.equipment_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name TEXT NOT NULL,
  parent_category_id UUID REFERENCES public.equipment_categories(id),
  icon TEXT NOT NULL DEFAULT 'box',
  color TEXT NOT NULL DEFAULT '#6366f1',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Equipment Register
CREATE TABLE public.equipment (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.equipment_categories(id),
  equipment_name TEXT NOT NULL,
  equipment_code TEXT NOT NULL,
  location TEXT,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  installation_date DATE,
  warranty_expiry DATE,
  criticality TEXT NOT NULL DEFAULT 'Non_Critical',
  running_hours_total INTEGER NOT NULL DEFAULT 0,
  running_hours_last_updated TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'Operational',
  specifications JSONB DEFAULT '{}'::jsonb,
  manual_url TEXT,
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vessel_id, equipment_code)
);

-- Maintenance Task Templates
CREATE TABLE public.maintenance_task_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.equipment_categories(id),
  task_name TEXT NOT NULL,
  task_description TEXT,
  task_type TEXT NOT NULL,
  interval_type TEXT NOT NULL,
  interval_value INTEGER NOT NULL,
  estimated_duration_minutes INTEGER,
  required_tools TEXT[] DEFAULT '{}'::text[],
  required_spares TEXT[] DEFAULT '{}'::text[],
  procedure_document_id UUID REFERENCES public.documents(id),
  responsible_role TEXT,
  safety_precautions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Maintenance Tasks
CREATE TABLE public.maintenance_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_number TEXT NOT NULL UNIQUE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.maintenance_task_templates(id),
  task_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  due_date DATE NOT NULL,
  due_running_hours INTEGER,
  scheduled_date DATE,
  actual_start_date TIMESTAMP WITH TIME ZONE,
  actual_completion_date TIMESTAMP WITH TIME ZONE,
  assigned_to_id UUID REFERENCES public.profiles(user_id),
  status TEXT NOT NULL DEFAULT 'Pending',
  priority TEXT NOT NULL DEFAULT 'Normal',
  work_description TEXT,
  work_performed TEXT,
  findings TEXT,
  spares_used JSONB DEFAULT '[]'::jsonb,
  hours_spent DECIMAL,
  completed_by_id UUID REFERENCES public.profiles(user_id),
  verified_by_id UUID REFERENCES public.profiles(user_id),
  next_due_date DATE,
  attachments TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Defects (equipment-linked)
CREATE TABLE public.defects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  defect_number TEXT NOT NULL UNIQUE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES public.equipment(id),
  reported_by_id UUID NOT NULL REFERENCES public.profiles(user_id),
  reported_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  defect_description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'P3_Normal',
  operational_impact TEXT NOT NULL DEFAULT 'No_Impact',
  status TEXT NOT NULL DEFAULT 'Open',
  temporary_repair TEXT,
  permanent_repair_plan TEXT,
  target_completion_date DATE,
  actual_completion_date DATE,
  linked_maintenance_task_id UUID REFERENCES public.maintenance_tasks(id),
  closed_by_id UUID REFERENCES public.profiles(user_id),
  attachments TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Running Hours Log
CREATE TABLE public.running_hours_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  recorded_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  running_hours INTEGER NOT NULL,
  recorded_by_id UUID NOT NULL REFERENCES public.profiles(user_id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Spare Parts
CREATE TABLE public.spare_parts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  part_name TEXT NOT NULL,
  equipment_ids UUID[] DEFAULT '{}'::uuid[],
  manufacturer TEXT,
  quantity_onboard INTEGER NOT NULL DEFAULT 0,
  minimum_stock INTEGER NOT NULL DEFAULT 0,
  unit_cost DECIMAL,
  location_onboard TEXT,
  last_ordered_date DATE,
  supplier TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_hours_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_parts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Equipment Categories (read-only for authenticated users)
CREATE POLICY "Authenticated users can view equipment categories"
ON public.equipment_categories FOR SELECT
USING (true);

-- RLS Policies: Equipment
CREATE POLICY "Users can view equipment in their company"
ON public.equipment FOR SELECT
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = equipment.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can insert equipment in their company"
ON public.equipment FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = equipment.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can update equipment in their company"
ON public.equipment FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = equipment.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can delete equipment in their company"
ON public.equipment FOR DELETE
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = equipment.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

-- RLS Policies: Maintenance Task Templates
CREATE POLICY "Users can view maintenance templates in their company"
ON public.maintenance_task_templates FOR SELECT
USING (
  (equipment_id IS NULL AND category_id IS NOT NULL) OR
  EXISTS (
    SELECT 1 FROM equipment e
    JOIN vessels v ON v.id = e.vessel_id
    WHERE e.id = maintenance_task_templates.equipment_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  )
);

CREATE POLICY "Users can manage maintenance templates"
ON public.maintenance_task_templates FOR ALL
USING (true);

-- RLS Policies: Maintenance Tasks
CREATE POLICY "Users can view maintenance tasks in their company"
ON public.maintenance_tasks FOR SELECT
USING (EXISTS (
  SELECT 1 FROM equipment e
  JOIN vessels v ON v.id = e.vessel_id
  WHERE e.id = maintenance_tasks.equipment_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can insert maintenance tasks in their company"
ON public.maintenance_tasks FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM equipment e
  JOIN vessels v ON v.id = e.vessel_id
  WHERE e.id = maintenance_tasks.equipment_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can update maintenance tasks in their company"
ON public.maintenance_tasks FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM equipment e
  JOIN vessels v ON v.id = e.vessel_id
  WHERE e.id = maintenance_tasks.equipment_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can delete maintenance tasks in their company"
ON public.maintenance_tasks FOR DELETE
USING (EXISTS (
  SELECT 1 FROM equipment e
  JOIN vessels v ON v.id = e.vessel_id
  WHERE e.id = maintenance_tasks.equipment_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

-- RLS Policies: Defects
CREATE POLICY "Users can view defects in their company"
ON public.defects FOR SELECT
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = defects.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can insert defects in their company"
ON public.defects FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = defects.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can update defects in their company"
ON public.defects FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = defects.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can delete defects in their company"
ON public.defects FOR DELETE
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = defects.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

-- RLS Policies: Running Hours Log
CREATE POLICY "Users can view running hours in their company"
ON public.running_hours_log FOR SELECT
USING (EXISTS (
  SELECT 1 FROM equipment e
  JOIN vessels v ON v.id = e.vessel_id
  WHERE e.id = running_hours_log.equipment_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can insert running hours in their company"
ON public.running_hours_log FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM equipment e
  JOIN vessels v ON v.id = e.vessel_id
  WHERE e.id = running_hours_log.equipment_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

-- RLS Policies: Spare Parts
CREATE POLICY "Users can view spare parts in their company"
ON public.spare_parts FOR SELECT
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = spare_parts.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can insert spare parts in their company"
ON public.spare_parts FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = spare_parts.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can update spare parts in their company"
ON public.spare_parts FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = spare_parts.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

CREATE POLICY "Users can delete spare parts in their company"
ON public.spare_parts FOR DELETE
USING (EXISTS (
  SELECT 1 FROM vessels v
  WHERE v.id = spare_parts.vessel_id
  AND user_belongs_to_company(auth.uid(), v.company_id)
));

-- Triggers for updated_at
CREATE TRIGGER update_equipment_updated_at
BEFORE UPDATE ON public.equipment
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_maintenance_tasks_updated_at
BEFORE UPDATE ON public.maintenance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_defects_updated_at
BEFORE UPDATE ON public.defects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_spare_parts_updated_at
BEFORE UPDATE ON public.spare_parts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default equipment categories
INSERT INTO public.equipment_categories (category_name, icon, color, display_order) VALUES
('Propulsion', 'ship', '#3b82f6', 1),
('Power Generation', 'zap', '#f59e0b', 2),
('HVAC', 'thermometer', '#10b981', 3),
('Safety Equipment', 'shield', '#ef4444', 4),
('Navigation Equipment', 'compass', '#8b5cf6', 5),
('Deck Equipment', 'anchor', '#6366f1', 6),
('Communication', 'radio', '#06b6d4', 7),
('Cargo Handling', 'package', '#84cc16', 8);

-- Insert sub-categories
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Main Engines', id, 'cog', '#3b82f6', 1 FROM equipment_categories WHERE category_name = 'Propulsion';
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Propellers', id, 'circle', '#3b82f6', 2 FROM equipment_categories WHERE category_name = 'Propulsion';
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Shaft Systems', id, 'minus', '#3b82f6', 3 FROM equipment_categories WHERE category_name = 'Propulsion';

INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Generators', id, 'battery', '#f59e0b', 1 FROM equipment_categories WHERE category_name = 'Power Generation';
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'UPS Systems', id, 'power', '#f59e0b', 2 FROM equipment_categories WHERE category_name = 'Power Generation';
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Switchboards', id, 'toggle-left', '#f59e0b', 3 FROM equipment_categories WHERE category_name = 'Power Generation';

INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Chillers', id, 'snowflake', '#10b981', 1 FROM equipment_categories WHERE category_name = 'HVAC';
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Air Handlers', id, 'wind', '#10b981', 2 FROM equipment_categories WHERE category_name = 'HVAC';
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Ventilation', id, 'fan', '#10b981', 3 FROM equipment_categories WHERE category_name = 'HVAC';

INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Lifeboats', id, 'life-buoy', '#ef4444', 1 FROM equipment_categories WHERE category_name = 'Safety Equipment';
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Fire Fighting', id, 'flame', '#ef4444', 2 FROM equipment_categories WHERE category_name = 'Safety Equipment';
INSERT INTO public.equipment_categories (category_name, parent_category_id, icon, color, display_order)
SELECT 'Life Rafts', id, 'circle', '#ef4444', 3 FROM equipment_categories WHERE category_name = 'Safety Equipment';