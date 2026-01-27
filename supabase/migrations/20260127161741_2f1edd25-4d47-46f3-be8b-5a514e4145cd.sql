-- Create crew_certificates table for managing individual crew member certifications
CREATE TABLE public.crew_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  certificate_type TEXT NOT NULL,
  certificate_name TEXT NOT NULL,
  issuing_authority TEXT,
  certificate_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'Valid',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(user_id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(user_id)
);

-- Enable RLS
ALTER TABLE public.crew_certificates ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can manage certificates for crew in their company
CREATE POLICY "Users can view crew certificates in their company"
  ON public.crew_certificates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = crew_certificates.user_id
        AND user_belongs_to_company(auth.uid(), p.company_id)
    )
  );

CREATE POLICY "Users can insert crew certificates in their company"
  ON public.crew_certificates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = crew_certificates.user_id
        AND user_belongs_to_company(auth.uid(), p.company_id)
    )
  );

CREATE POLICY "Users can update crew certificates in their company"
  ON public.crew_certificates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = crew_certificates.user_id
        AND user_belongs_to_company(auth.uid(), p.company_id)
    )
  );

CREATE POLICY "Users can delete crew certificates in their company"
  ON public.crew_certificates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = crew_certificates.user_id
        AND user_belongs_to_company(auth.uid(), p.company_id)
    )
  );

-- Create indexes for performance
CREATE INDEX idx_crew_certificates_user_id ON public.crew_certificates(user_id);
CREATE INDEX idx_crew_certificates_expiry_date ON public.crew_certificates(expiry_date);

-- Add trigger for updated_at
CREATE TRIGGER update_crew_certificates_updated_at
  BEFORE UPDATE ON public.crew_certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();