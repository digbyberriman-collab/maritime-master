-- Risk Assessment Templates table
CREATE TABLE public.risk_assessment_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  task_category TEXT NOT NULL,
  common_hazards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.profiles(user_id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Risk Assessments table
CREATE TABLE public.risk_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_number TEXT NOT NULL UNIQUE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.risk_assessment_templates(id) ON DELETE SET NULL,
  task_name TEXT NOT NULL,
  task_description TEXT,
  task_location TEXT NOT NULL,
  task_date DATE NOT NULL,
  assessed_by_id UUID NOT NULL REFERENCES public.profiles(user_id),
  approved_by_id UUID REFERENCES public.profiles(user_id),
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  review_date DATE NOT NULL,
  linked_procedure_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  risk_score_initial INTEGER,
  risk_score_residual INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Risk Assessment Hazards table
CREATE TABLE public.risk_assessment_hazards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_assessment_id UUID NOT NULL REFERENCES public.risk_assessments(id) ON DELETE CASCADE,
  hazard_description TEXT NOT NULL,
  consequences TEXT NOT NULL,
  likelihood_before INTEGER NOT NULL CHECK (likelihood_before BETWEEN 1 AND 5),
  severity_before INTEGER NOT NULL CHECK (severity_before BETWEEN 1 AND 5),
  risk_score_before INTEGER NOT NULL,
  controls TEXT[] NOT NULL DEFAULT '{}'::text[],
  likelihood_after INTEGER CHECK (likelihood_after BETWEEN 1 AND 5),
  severity_after INTEGER CHECK (severity_after BETWEEN 1 AND 5),
  risk_score_after INTEGER,
  responsible_person TEXT,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Work Permits table
CREATE TABLE public.work_permits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  permit_number TEXT NOT NULL UNIQUE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  permit_type TEXT NOT NULL,
  risk_assessment_id UUID REFERENCES public.risk_assessments(id) ON DELETE SET NULL,
  work_description TEXT NOT NULL,
  work_location TEXT NOT NULL,
  requested_by_id UUID NOT NULL REFERENCES public.profiles(user_id),
  approved_by_id UUID REFERENCES public.profiles(user_id),
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  actual_start TIMESTAMP WITH TIME ZONE,
  actual_end TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'Pending',
  workers JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_precautions_required JSONB NOT NULL DEFAULT '[]'::jsonb,
  precautions_verified BOOLEAN NOT NULL DEFAULT false,
  equipment_isolated BOOLEAN NOT NULL DEFAULT false,
  atmosphere_tested BOOLEAN NOT NULL DEFAULT false,
  atmosphere_results JSONB,
  fire_watch_required BOOLEAN NOT NULL DEFAULT false,
  fire_watch_assigned_id UUID REFERENCES public.profiles(user_id),
  emergency_equipment TEXT[] NOT NULL DEFAULT '{}'::text[],
  cancellation_reason TEXT,
  completion_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Permit Extensions table
CREATE TABLE public.permit_extensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  permit_id UUID NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  extended_by_id UUID NOT NULL REFERENCES public.profiles(user_id),
  new_end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  extension_reason TEXT NOT NULL,
  approved_by_id UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.risk_assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessment_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit_extensions ENABLE ROW LEVEL SECURITY;

-- RLS policies for risk_assessment_templates
CREATE POLICY "Users can view templates in their company" ON public.risk_assessment_templates
  FOR SELECT USING (
    vessel_id IS NULL OR EXISTS (
      SELECT 1 FROM vessels v WHERE v.id = risk_assessment_templates.vessel_id 
      AND user_belongs_to_company(auth.uid(), v.company_id)
    )
  );

CREATE POLICY "Users can insert templates in their company" ON public.risk_assessment_templates
  FOR INSERT WITH CHECK (
    vessel_id IS NULL OR EXISTS (
      SELECT 1 FROM vessels v WHERE v.id = risk_assessment_templates.vessel_id 
      AND user_belongs_to_company(auth.uid(), v.company_id)
    )
  );

CREATE POLICY "Users can update templates in their company" ON public.risk_assessment_templates
  FOR UPDATE USING (
    vessel_id IS NULL OR EXISTS (
      SELECT 1 FROM vessels v WHERE v.id = risk_assessment_templates.vessel_id 
      AND user_belongs_to_company(auth.uid(), v.company_id)
    )
  );

CREATE POLICY "Users can delete templates in their company" ON public.risk_assessment_templates
  FOR DELETE USING (
    vessel_id IS NULL OR EXISTS (
      SELECT 1 FROM vessels v WHERE v.id = risk_assessment_templates.vessel_id 
      AND user_belongs_to_company(auth.uid(), v.company_id)
    )
  );

-- RLS policies for risk_assessments
CREATE POLICY "Users can view risk assessments in their company" ON public.risk_assessments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = risk_assessments.vessel_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can insert risk assessments in their company" ON public.risk_assessments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = risk_assessments.vessel_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can update risk assessments in their company" ON public.risk_assessments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = risk_assessments.vessel_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can delete risk assessments in their company" ON public.risk_assessments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = risk_assessments.vessel_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS policies for risk_assessment_hazards
CREATE POLICY "Users can view hazards in their company" ON public.risk_assessment_hazards
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM risk_assessments ra 
    JOIN vessels v ON v.id = ra.vessel_id 
    WHERE ra.id = risk_assessment_hazards.risk_assessment_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can insert hazards in their company" ON public.risk_assessment_hazards
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM risk_assessments ra 
    JOIN vessels v ON v.id = ra.vessel_id 
    WHERE ra.id = risk_assessment_hazards.risk_assessment_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can update hazards in their company" ON public.risk_assessment_hazards
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM risk_assessments ra 
    JOIN vessels v ON v.id = ra.vessel_id 
    WHERE ra.id = risk_assessment_hazards.risk_assessment_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can delete hazards in their company" ON public.risk_assessment_hazards
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM risk_assessments ra 
    JOIN vessels v ON v.id = ra.vessel_id 
    WHERE ra.id = risk_assessment_hazards.risk_assessment_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS policies for work_permits
CREATE POLICY "Users can view work permits in their company" ON public.work_permits
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = work_permits.vessel_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can insert work permits in their company" ON public.work_permits
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = work_permits.vessel_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can update work permits in their company" ON public.work_permits
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = work_permits.vessel_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can delete work permits in their company" ON public.work_permits
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = work_permits.vessel_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS policies for permit_extensions
CREATE POLICY "Users can view permit extensions in their company" ON public.permit_extensions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM work_permits wp 
    JOIN vessels v ON v.id = wp.vessel_id 
    WHERE wp.id = permit_extensions.permit_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can insert permit extensions in their company" ON public.permit_extensions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM work_permits wp 
    JOIN vessels v ON v.id = wp.vessel_id 
    WHERE wp.id = permit_extensions.permit_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can update permit extensions in their company" ON public.permit_extensions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM work_permits wp 
    JOIN vessels v ON v.id = wp.vessel_id 
    WHERE wp.id = permit_extensions.permit_id 
    AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- Add updated_at triggers
CREATE TRIGGER update_risk_assessments_updated_at
  BEFORE UPDATE ON public.risk_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_work_permits_updated_at
  BEFORE UPDATE ON public.work_permits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();