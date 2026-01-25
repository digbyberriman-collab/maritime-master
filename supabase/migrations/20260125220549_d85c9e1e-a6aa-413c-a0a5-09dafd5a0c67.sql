-- Create incidents table
CREATE TABLE public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    reported_by UUID NOT NULL REFERENCES public.profiles(user_id),
    incident_number TEXT UNIQUE NOT NULL,
    incident_date TIMESTAMP WITH TIME ZONE NOT NULL,
    reported_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    incident_type TEXT NOT NULL CHECK (incident_type IN ('Near Miss', 'Injury', 'Pollution', 'Property Damage', 'Security', 'Other')),
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    immediate_action TEXT,
    persons_involved JSONB DEFAULT '[]'::jsonb,
    witnesses JSONB DEFAULT '[]'::jsonb,
    severity_actual INTEGER NOT NULL CHECK (severity_actual BETWEEN 1 AND 5),
    severity_potential INTEGER NOT NULL CHECK (severity_potential BETWEEN 1 AND 5),
    investigation_required BOOLEAN DEFAULT true,
    investigation_status TEXT DEFAULT 'Not Started' CHECK (investigation_status IN ('Not Started', 'In Progress', 'Completed')),
    root_cause TEXT,
    contributing_factors TEXT[] DEFAULT '{}',
    dpa_notified BOOLEAN DEFAULT false,
    dpa_notified_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'Under Investigation', 'Closed')),
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create corrective_actions table
CREATE TABLE public.corrective_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
    finding_id UUID,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    action_number TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('Immediate', 'Corrective', 'Preventive')),
    assigned_to UUID NOT NULL REFERENCES public.profiles(user_id),
    assigned_by UUID NOT NULL REFERENCES public.profiles(user_id),
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Verification', 'Closed')),
    completion_date DATE,
    completion_notes TEXT,
    evidence_urls TEXT[] DEFAULT '{}',
    verified_by UUID REFERENCES public.profiles(user_id),
    verified_date DATE,
    verification_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create incident_investigation table
CREATE TABLE public.incident_investigation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    lead_investigator UUID NOT NULL REFERENCES public.profiles(user_id),
    investigation_team JSONB DEFAULT '[]'::jsonb,
    investigation_method TEXT CHECK (investigation_method IN ('5 Whys', 'Fishbone', 'RCA', 'Other')),
    timeline JSONB DEFAULT '[]'::jsonb,
    findings TEXT,
    root_cause TEXT,
    contributing_factors TEXT[] DEFAULT '{}',
    recommendations TEXT[] DEFAULT '{}',
    completed_date DATE,
    approved_by UUID REFERENCES public.profiles(user_id),
    approved_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_investigation ENABLE ROW LEVEL SECURITY;

-- RLS policies for incidents
CREATE POLICY "Users can view incidents in their company"
ON public.incidents FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can insert incidents in their company"
ON public.incidents FOR INSERT
WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can update incidents in their company"
ON public.incidents FOR UPDATE
USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can delete incidents in their company"
ON public.incidents FOR DELETE
USING (user_belongs_to_company(auth.uid(), company_id));

-- RLS policies for corrective_actions
CREATE POLICY "Users can view corrective actions in their company"
ON public.corrective_actions FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can insert corrective actions in their company"
ON public.corrective_actions FOR INSERT
WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can update corrective actions in their company"
ON public.corrective_actions FOR UPDATE
USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can delete corrective actions in their company"
ON public.corrective_actions FOR DELETE
USING (user_belongs_to_company(auth.uid(), company_id));

-- RLS policies for incident_investigation
CREATE POLICY "Users can view investigations in their company"
ON public.incident_investigation FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id = incident_investigation.incident_id
    AND user_belongs_to_company(auth.uid(), i.company_id)
));

CREATE POLICY "Users can insert investigations in their company"
ON public.incident_investigation FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id = incident_investigation.incident_id
    AND user_belongs_to_company(auth.uid(), i.company_id)
));

CREATE POLICY "Users can update investigations in their company"
ON public.incident_investigation FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id = incident_investigation.incident_id
    AND user_belongs_to_company(auth.uid(), i.company_id)
));

-- Add updated_at trigger
CREATE TRIGGER update_incidents_updated_at
BEFORE UPDATE ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_corrective_actions_updated_at
BEFORE UPDATE ON public.corrective_actions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for incident attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('incident-attachments', 'incident-attachments', false);

-- Storage policies for incident attachments
CREATE POLICY "Users can view incident attachments in their company"
ON storage.objects FOR SELECT
USING (bucket_id = 'incident-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Users can upload incident attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'incident-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their incident attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'incident-attachments' AND auth.role() = 'authenticated');