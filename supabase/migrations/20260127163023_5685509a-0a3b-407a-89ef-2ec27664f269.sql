-- Create crew_attachments table for storing crew member documents
CREATE TABLE public.crew_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  attachment_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT,
  description TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Foreign keys
  CONSTRAINT crew_attachments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT crew_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(user_id) ON DELETE SET NULL
);

-- Enable Row Level Security
ALTER TABLE public.crew_attachments ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_crew_attachments_user_id ON public.crew_attachments(user_id);
CREATE INDEX idx_crew_attachments_type ON public.crew_attachments(attachment_type);

-- RLS Policies: Same company access via profile join
CREATE POLICY "Users can view crew attachments in their company"
  ON public.crew_attachments
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = crew_attachments.user_id 
    AND user_belongs_to_company(auth.uid(), p.company_id)
  ));

CREATE POLICY "Users can insert crew attachments in their company"
  ON public.crew_attachments
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = crew_attachments.user_id 
    AND user_belongs_to_company(auth.uid(), p.company_id)
  ));

CREATE POLICY "Users can update crew attachments in their company"
  ON public.crew_attachments
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = crew_attachments.user_id 
    AND user_belongs_to_company(auth.uid(), p.company_id)
  ));

CREATE POLICY "Users can delete crew attachments in their company"
  ON public.crew_attachments
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = crew_attachments.user_id 
    AND user_belongs_to_company(auth.uid(), p.company_id)
  ));

-- Trigger for updated_at
CREATE TRIGGER update_crew_attachments_updated_at
  BEFORE UPDATE ON public.crew_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();