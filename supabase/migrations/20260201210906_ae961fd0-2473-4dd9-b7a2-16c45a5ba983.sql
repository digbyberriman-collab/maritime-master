-- Create webhook configurations table to store endpoint settings
CREATE TABLE public.webhook_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  webhook_secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allowed_data_types TEXT[] NOT NULL DEFAULT ARRAY['crew', 'vessel', 'document', 'incident'],
  allowed_ip_addresses TEXT[],
  rate_limit_per_minute INTEGER DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Create webhook events log table
CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_config_id UUID REFERENCES public.webhook_configurations(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  data_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for webhook_configurations
CREATE POLICY "Company admins can view webhook configs"
ON public.webhook_configurations FOR SELECT
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
);

CREATE POLICY "Company admins can create webhook configs"
ON public.webhook_configurations FOR INSERT
WITH CHECK (
  company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
);

CREATE POLICY "Company admins can update webhook configs"
ON public.webhook_configurations FOR UPDATE
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
);

CREATE POLICY "Company admins can delete webhook configs"
ON public.webhook_configurations FOR DELETE
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
);

-- RLS Policies for webhook_events
CREATE POLICY "Company admins can view webhook events"
ON public.webhook_events FOR SELECT
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
);

-- Indexes for performance
CREATE INDEX idx_webhook_configurations_company ON public.webhook_configurations(company_id);
CREATE INDEX idx_webhook_configurations_active ON public.webhook_configurations(is_active) WHERE is_active = true;
CREATE INDEX idx_webhook_events_company ON public.webhook_events(company_id);
CREATE INDEX idx_webhook_events_config ON public.webhook_events(webhook_config_id);
CREATE INDEX idx_webhook_events_status ON public.webhook_events(status);
CREATE INDEX idx_webhook_events_created ON public.webhook_events(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_webhook_configurations_updated_at
BEFORE UPDATE ON public.webhook_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();