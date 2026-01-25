-- Create drill_types table (reference data for drill types)
CREATE TABLE public.drill_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drill_name TEXT NOT NULL,
  category TEXT NOT NULL, -- SOLAS_Required, Company_Required, Voluntary
  minimum_frequency INTEGER NOT NULL, -- days between drills
  solas_reference TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create drills table
CREATE TABLE public.drills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drill_number TEXT NOT NULL UNIQUE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  drill_type_id UUID NOT NULL REFERENCES public.drill_types(id),
  drill_date_scheduled DATE NOT NULL,
  drill_date_actual TIMESTAMP WITH TIME ZONE,
  drill_duration_minutes INTEGER,
  scenario_description TEXT NOT NULL,
  objectives TEXT[] DEFAULT '{}',
  conducted_by_id UUID REFERENCES public.profiles(user_id),
  location TEXT,
  weather_conditions TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled', -- Scheduled, In_Progress, Completed, Cancelled, Postponed
  cancelled_reason TEXT,
  lessons_learned_positive TEXT,
  lessons_learned_improvement TEXT,
  recommendations TEXT,
  overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create drill_participants table
CREATE TABLE public.drill_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drill_id UUID NOT NULL REFERENCES public.drills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id),
  station_assignment TEXT,
  expected_to_attend BOOLEAN NOT NULL DEFAULT true,
  attended BOOLEAN,
  absent_reason TEXT,
  late_arrival_minutes INTEGER,
  performance_rating INTEGER CHECK (performance_rating >= 1 AND performance_rating <= 5),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create drill_evaluations table
CREATE TABLE public.drill_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drill_id UUID NOT NULL REFERENCES public.drills(id) ON DELETE CASCADE,
  objective_index INTEGER NOT NULL,
  objective_text TEXT NOT NULL,
  achieved BOOLEAN,
  notes TEXT,
  evaluator_id UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create drill_deficiencies table
CREATE TABLE public.drill_deficiencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drill_id UUID NOT NULL REFERENCES public.drills(id) ON DELETE CASCADE,
  deficiency_description TEXT NOT NULL,
  severity TEXT NOT NULL, -- Critical, Serious, Minor, Observation
  corrective_action_id UUID REFERENCES public.corrective_actions(id),
  photo_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create drill_equipment table
CREATE TABLE public.drill_equipment (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drill_id UUID NOT NULL REFERENCES public.drills(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  equipment_used BOOLEAN,
  equipment_status TEXT, -- Satisfactory, Defective, Not_Available
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create emergency_contacts table
CREATE TABLE public.emergency_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  contact_category TEXT NOT NULL, -- Coast_Guard, Flag_State, Class, P&I, Medical, etc.
  organization_name TEXT NOT NULL,
  contact_person TEXT,
  phone_primary TEXT NOT NULL,
  phone_secondary TEXT,
  email TEXT,
  available_24_7 BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create emergency_procedures table
CREATE TABLE public.emergency_procedures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  emergency_type TEXT NOT NULL,
  procedure_document_id UUID REFERENCES public.documents(id),
  muster_station TEXT,
  key_actions TEXT[] DEFAULT '{}',
  responsible_officer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.drill_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drill_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drill_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drill_deficiencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drill_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_procedures ENABLE ROW LEVEL SECURITY;

-- RLS for drill_types (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view drill types" ON public.drill_types
  FOR SELECT USING (true);

-- RLS for drills (company-based via vessel)
CREATE POLICY "Users can view drills in their company" ON public.drills
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = drills.vessel_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can insert drills in their company" ON public.drills
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = drills.vessel_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can update drills in their company" ON public.drills
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = drills.vessel_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can delete drills in their company" ON public.drills
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = drills.vessel_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS for drill_participants
CREATE POLICY "Users can view drill participants in their company" ON public.drill_participants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drills d JOIN vessels v ON v.id = d.vessel_id WHERE d.id = drill_participants.drill_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can manage drill participants in their company" ON public.drill_participants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM drills d JOIN vessels v ON v.id = d.vessel_id WHERE d.id = drill_participants.drill_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS for drill_evaluations
CREATE POLICY "Users can view drill evaluations in their company" ON public.drill_evaluations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drills d JOIN vessels v ON v.id = d.vessel_id WHERE d.id = drill_evaluations.drill_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can manage drill evaluations in their company" ON public.drill_evaluations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM drills d JOIN vessels v ON v.id = d.vessel_id WHERE d.id = drill_evaluations.drill_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS for drill_deficiencies
CREATE POLICY "Users can view drill deficiencies in their company" ON public.drill_deficiencies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drills d JOIN vessels v ON v.id = d.vessel_id WHERE d.id = drill_deficiencies.drill_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can manage drill deficiencies in their company" ON public.drill_deficiencies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM drills d JOIN vessels v ON v.id = d.vessel_id WHERE d.id = drill_deficiencies.drill_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS for drill_equipment
CREATE POLICY "Users can view drill equipment in their company" ON public.drill_equipment
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM drills d JOIN vessels v ON v.id = d.vessel_id WHERE d.id = drill_equipment.drill_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can manage drill equipment in their company" ON public.drill_equipment
  FOR ALL USING (
    EXISTS (SELECT 1 FROM drills d JOIN vessels v ON v.id = d.vessel_id WHERE d.id = drill_equipment.drill_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS for emergency_contacts
CREATE POLICY "Users can view emergency contacts in their company" ON public.emergency_contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = emergency_contacts.vessel_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can manage emergency contacts in their company" ON public.emergency_contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = emergency_contacts.vessel_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- RLS for emergency_procedures
CREATE POLICY "Users can view emergency procedures in their company" ON public.emergency_procedures
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = emergency_procedures.vessel_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

CREATE POLICY "Users can manage emergency procedures in their company" ON public.emergency_procedures
  FOR ALL USING (
    EXISTS (SELECT 1 FROM vessels v WHERE v.id = emergency_procedures.vessel_id AND user_belongs_to_company(auth.uid(), v.company_id))
  );

-- Create indexes for performance
CREATE INDEX idx_drills_vessel_id ON public.drills(vessel_id);
CREATE INDEX idx_drills_drill_type_id ON public.drills(drill_type_id);
CREATE INDEX idx_drills_status ON public.drills(status);
CREATE INDEX idx_drills_scheduled_date ON public.drills(drill_date_scheduled);
CREATE INDEX idx_drill_participants_drill_id ON public.drill_participants(drill_id);
CREATE INDEX idx_drill_participants_user_id ON public.drill_participants(user_id);
CREATE INDEX idx_drill_evaluations_drill_id ON public.drill_evaluations(drill_id);
CREATE INDEX idx_drill_deficiencies_drill_id ON public.drill_deficiencies(drill_id);
CREATE INDEX idx_drill_equipment_drill_id ON public.drill_equipment(drill_id);
CREATE INDEX idx_emergency_contacts_vessel_id ON public.emergency_contacts(vessel_id);
CREATE INDEX idx_emergency_procedures_vessel_id ON public.emergency_procedures(vessel_id);

-- Create trigger for updated_at on drills
CREATE TRIGGER update_drills_updated_at
  BEFORE UPDATE ON public.drills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default drill types
INSERT INTO public.drill_types (drill_name, category, minimum_frequency, solas_reference) VALUES
  ('Fire Drill', 'SOLAS_Required', 7, 'SOLAS III/19.3.2'),
  ('Abandon Ship Drill', 'SOLAS_Required', 30, 'SOLAS III/19.3.2'),
  ('Man Overboard Drill', 'SOLAS_Required', 30, 'SOLAS III/19.3.3'),
  ('Collision Drill', 'Company_Required', 90, NULL),
  ('Grounding Drill', 'Company_Required', 90, NULL),
  ('Flooding Drill', 'Company_Required', 90, NULL),
  ('Pollution Response Drill', 'Company_Required', 30, 'MARPOL'),
  ('Piracy/Armed Robbery Drill', 'Company_Required', 90, 'ISPS Code'),
  ('Medical Emergency Drill', 'Company_Required', 90, NULL),
  ('Enclosed Space Entry Drill', 'SOLAS_Required', 60, 'SOLAS XI-1/7'),
  ('Search and Rescue Drill', 'Company_Required', 90, NULL),
  ('Steering Gear Failure Drill', 'Company_Required', 90, NULL);