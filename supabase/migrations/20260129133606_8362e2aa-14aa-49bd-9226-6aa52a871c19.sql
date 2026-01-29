-- Crew Tasks Table for officer-assigned tasks, reviews, and evaluations
CREATE TABLE public.crew_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  
  -- Task Details
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL CHECK (task_type IN ('task', 'review', 'evaluation', 'form', 'acknowledgement', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Assignment
  assigned_to UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  
  -- Dates
  due_date TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled')),
  
  -- Related entities
  related_form_id UUID REFERENCES public.form_templates(id) ON DELETE SET NULL,
  related_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  
  -- Completion
  completion_notes TEXT,
  verification_required BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES public.profiles(user_id),
  verified_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_crew_tasks_assigned_to ON public.crew_tasks(assigned_to);
CREATE INDEX idx_crew_tasks_assigned_by ON public.crew_tasks(assigned_by);
CREATE INDEX idx_crew_tasks_vessel ON public.crew_tasks(vessel_id);
CREATE INDEX idx_crew_tasks_status ON public.crew_tasks(status);
CREATE INDEX idx_crew_tasks_due_date ON public.crew_tasks(due_date);
CREATE INDEX idx_crew_tasks_company ON public.crew_tasks(company_id);

-- Enable RLS
ALTER TABLE public.crew_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view tasks assigned to them"
ON public.crew_tasks FOR SELECT
TO authenticated
USING (
  assigned_to = auth.uid() 
  OR assigned_by = auth.uid()
  OR public.has_fleet_access(auth.uid())
);

CREATE POLICY "Officers can create tasks"
ON public.crew_tasks FOR INSERT
TO authenticated
WITH CHECK (
  assigned_by = auth.uid()
  AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master', 'captain', 'chief_officer', 'chief_engineer']::app_role[])
);

CREATE POLICY "Users can update their own tasks"
ON public.crew_tasks FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid() 
  OR assigned_by = auth.uid()
  OR public.has_fleet_access(auth.uid())
);

CREATE POLICY "Assigners can delete tasks"
ON public.crew_tasks FOR DELETE
TO authenticated
USING (
  assigned_by = auth.uid()
  OR public.has_fleet_access(auth.uid())
);

-- Update trigger
CREATE TRIGGER update_crew_tasks_updated_at
  BEFORE UPDATE ON public.crew_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();