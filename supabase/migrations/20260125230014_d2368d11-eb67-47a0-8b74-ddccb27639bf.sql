-- Training courses table (master list of available courses/certificates)
CREATE TABLE public.training_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_name TEXT NOT NULL,
  course_code TEXT NOT NULL,
  course_category TEXT NOT NULL, -- STCW, Flag_Required, Company_Required, Manufacturer, Other
  issuing_authority TEXT,
  course_duration_days INTEGER,
  validity_period_months INTEGER, -- null if no expiry
  description TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  applicable_ranks TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Training records table (individual crew training certificates)
CREATE TABLE public.training_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  certificate_number TEXT,
  training_provider TEXT NOT NULL,
  completion_date DATE NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  certificate_file_url TEXT,
  grade_result TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Valid', -- Valid, Expiring_Soon, Expired, Suspended
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Familiarization templates (reusable checklists per rank)
CREATE TABLE public.familiarization_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  applicable_ranks TEXT[] DEFAULT '{}',
  sections JSONB NOT NULL DEFAULT '[]', -- [{section_name, checklist_items[], required_days}]
  total_duration_days INTEGER NOT NULL DEFAULT 14,
  created_by UUID REFERENCES public.profiles(user_id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Familiarization records (individual crew familiarization tracking)
CREATE TABLE public.familiarization_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.familiarization_templates(id),
  join_date DATE NOT NULL,
  target_completion_date DATE NOT NULL,
  actual_completion_date DATE,
  status TEXT NOT NULL DEFAULT 'In_Progress', -- Not_Started, In_Progress, Completed, Overdue
  completion_percentage INTEGER NOT NULL DEFAULT 0,
  supervisor_id UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Familiarization checklist items (individual items to complete)
CREATE TABLE public.familiarization_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  familiarization_id UUID NOT NULL REFERENCES public.familiarization_records(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  item_text TEXT NOT NULL,
  item_order INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_date DATE,
  completed_by_id UUID REFERENCES public.profiles(user_id),
  evidence_url TEXT,
  notes TEXT
);

-- Training matrix (required courses per rank per vessel)
CREATE TABLE public.training_matrix (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  rank TEXT NOT NULL,
  required_courses JSONB NOT NULL DEFAULT '[]', -- array of course_ids
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vessel_id, rank)
);

-- Enable RLS on all tables
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.familiarization_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.familiarization_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.familiarization_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_matrix ENABLE ROW LEVEL SECURITY;

-- Training courses: viewable by all authenticated, manageable by DPA/shore management
CREATE POLICY "Authenticated users can view training courses"
  ON public.training_courses FOR SELECT
  USING (true);

CREATE POLICY "Users can manage training courses"
  ON public.training_courses FOR ALL
  USING (true);

-- Training records: users can view/manage records in their company
CREATE POLICY "Users can view training records in their company"
  ON public.training_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = training_records.user_id
    AND user_belongs_to_company(auth.uid(), p.company_id)
  ));

CREATE POLICY "Users can insert training records in their company"
  ON public.training_records FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = training_records.user_id
    AND user_belongs_to_company(auth.uid(), p.company_id)
  ));

CREATE POLICY "Users can update training records in their company"
  ON public.training_records FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = training_records.user_id
    AND user_belongs_to_company(auth.uid(), p.company_id)
  ));

CREATE POLICY "Users can delete training records in their company"
  ON public.training_records FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = training_records.user_id
    AND user_belongs_to_company(auth.uid(), p.company_id)
  ));

-- Familiarization templates: viewable/manageable by company
CREATE POLICY "Users can view familiarization templates in their company"
  ON public.familiarization_templates FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM vessels v
    WHERE v.id = familiarization_templates.vessel_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  ));

CREATE POLICY "Users can manage familiarization templates in their company"
  ON public.familiarization_templates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM vessels v
    WHERE v.id = familiarization_templates.vessel_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  ));

-- Familiarization records: viewable/manageable by company
CREATE POLICY "Users can view familiarization records in their company"
  ON public.familiarization_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM vessels v
    WHERE v.id = familiarization_records.vessel_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  ));

CREATE POLICY "Users can manage familiarization records in their company"
  ON public.familiarization_records FOR ALL
  USING (EXISTS (
    SELECT 1 FROM vessels v
    WHERE v.id = familiarization_records.vessel_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  ));

-- Familiarization checklist items: viewable/manageable by company
CREATE POLICY "Users can view checklist items in their company"
  ON public.familiarization_checklist_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM familiarization_records fr
    JOIN vessels v ON v.id = fr.vessel_id
    WHERE fr.id = familiarization_checklist_items.familiarization_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  ));

CREATE POLICY "Users can manage checklist items in their company"
  ON public.familiarization_checklist_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM familiarization_records fr
    JOIN vessels v ON v.id = fr.vessel_id
    WHERE fr.id = familiarization_checklist_items.familiarization_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  ));

-- Training matrix: viewable/manageable by company
CREATE POLICY "Users can view training matrix in their company"
  ON public.training_matrix FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM vessels v
    WHERE v.id = training_matrix.vessel_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  ));

CREATE POLICY "Users can manage training matrix in their company"
  ON public.training_matrix FOR ALL
  USING (EXISTS (
    SELECT 1 FROM vessels v
    WHERE v.id = training_matrix.vessel_id
    AND user_belongs_to_company(auth.uid(), v.company_id)
  ));

-- Add update triggers
CREATE TRIGGER update_training_records_updated_at
  BEFORE UPDATE ON public.training_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_familiarization_records_updated_at
  BEFORE UPDATE ON public.familiarization_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default training courses (STCW and common maritime courses)
INSERT INTO public.training_courses (course_name, course_code, course_category, issuing_authority, course_duration_days, validity_period_months, is_mandatory, applicable_ranks) VALUES
('Basic Safety Training', 'STCW-VI/1', 'STCW', 'Maritime Training Center', 5, 60, true, '{}'),
('Proficiency in Survival Craft', 'STCW-VI/2', 'STCW', 'Maritime Training Center', 3, 60, true, ARRAY['master', 'chief_officer', 'chief_engineer']),
('Advanced Fire Fighting', 'STCW-VI/3', 'STCW', 'Maritime Training Center', 5, 60, true, ARRAY['master', 'chief_officer', 'chief_engineer']),
('Medical First Aid', 'STCW-VI/4.1', 'STCW', 'Maritime Training Center', 3, 60, true, ARRAY['master', 'chief_officer']),
('Medical Care', 'STCW-VI/4.2', 'STCW', 'Maritime Training Center', 5, 60, true, ARRAY['master']),
('Helicopter Underwater Escape Training', 'HUET', 'Company_Required', 'Offshore Training Center', 1, 48, false, '{}'),
('Seafarer Medical Certificate', 'ENG-1', 'Flag_Required', 'Approved Medical Examiner', NULL, 24, true, '{}'),
('Ship Security Officer', 'SSO', 'STCW', 'Maritime Training Center', 3, NULL, false, ARRAY['master', 'chief_officer']),
('Designated Security Duties', 'DSD', 'STCW', 'Maritime Training Center', 1, NULL, true, '{}'),
('Security Awareness Training', 'SAT', 'STCW', 'Maritime Training Center', 1, NULL, true, '{}'),
('Bridge Resource Management', 'BRM', 'Company_Required', 'Maritime Training Center', 5, 60, false, ARRAY['master', 'chief_officer']),
('Engine Room Resource Management', 'ERM', 'Company_Required', 'Maritime Training Center', 5, 60, false, ARRAY['chief_engineer']),
('ISM/ISPS Refresher', 'ISM-ISPS', 'Company_Required', 'Company', 1, 12, true, '{}'),
('Tanker Familiarization', 'STCW-V/1-1', 'STCW', 'Maritime Training Center', 3, NULL, false, '{}'),
('Advanced Oil Tanker Operations', 'STCW-V/1-2', 'STCW', 'Maritime Training Center', 5, 60, false, '{}');