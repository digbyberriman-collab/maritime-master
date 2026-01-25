-- Create certificates table
CREATE TABLE public.certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  certificate_type TEXT NOT NULL, -- DOC, SMC, Statutory, Crew, Equipment
  certificate_category TEXT, -- SOLAS, MARPOL, Loadline, Tonnage, Class, Training, etc.
  certificate_number TEXT NOT NULL,
  certificate_name TEXT NOT NULL,
  issuing_authority TEXT NOT NULL,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE, -- for crew certificates
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  next_survey_date DATE, -- for annual/intermediate surveys
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'Valid', -- Valid, Expiring_Soon, Expired, Suspended, Superseded
  alert_days INTEGER DEFAULT 90,
  notes TEXT,
  superseded_by UUID REFERENCES public.certificates(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create certificate_alerts table
CREATE TABLE public.certificate_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  certificate_id UUID NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  alert_date DATE NOT NULL,
  alert_type TEXT NOT NULL, -- 90_day, 60_day, 30_day, 7_day, Expired
  sent_at TIMESTAMP WITH TIME ZONE,
  sent_to UUID[] DEFAULT '{}',
  acknowledged_by UUID REFERENCES public.profiles(user_id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for certificates
CREATE POLICY "Users can view certificates in their company"
  ON public.certificates FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can insert certificates in their company"
  ON public.certificates FOR INSERT
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can update certificates in their company"
  ON public.certificates FOR UPDATE
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can delete certificates in their company"
  ON public.certificates FOR DELETE
  USING (user_belongs_to_company(auth.uid(), company_id));

-- RLS policies for certificate_alerts
CREATE POLICY "Users can view certificate alerts in their company"
  ON public.certificate_alerts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.certificates c
    WHERE c.id = certificate_alerts.certificate_id
    AND user_belongs_to_company(auth.uid(), c.company_id)
  ));

CREATE POLICY "Users can insert certificate alerts in their company"
  ON public.certificate_alerts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.certificates c
    WHERE c.id = certificate_alerts.certificate_id
    AND user_belongs_to_company(auth.uid(), c.company_id)
  ));

CREATE POLICY "Users can update certificate alerts in their company"
  ON public.certificate_alerts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.certificates c
    WHERE c.id = certificate_alerts.certificate_id
    AND user_belongs_to_company(auth.uid(), c.company_id)
  ));

-- Create trigger for updated_at
CREATE TRIGGER update_certificates_updated_at
  BEFORE UPDATE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_certificates_company_id ON public.certificates(company_id);
CREATE INDEX idx_certificates_vessel_id ON public.certificates(vessel_id);
CREATE INDEX idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX idx_certificates_expiry_date ON public.certificates(expiry_date);
CREATE INDEX idx_certificates_status ON public.certificates(status);
CREATE INDEX idx_certificate_alerts_certificate_id ON public.certificate_alerts(certificate_id);
CREATE INDEX idx_certificate_alerts_alert_date ON public.certificate_alerts(alert_date);