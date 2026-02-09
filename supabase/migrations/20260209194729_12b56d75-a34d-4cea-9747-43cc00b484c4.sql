
-- Table to store external API configurations for data harvesting
CREATE TABLE public.integration_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  integration_name TEXT NOT NULL,
  provider TEXT,
  description TEXT,
  api_key_encrypted TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  refresh_interval_minutes INTEGER DEFAULT 60,
  data_types TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company integrations"
  ON public.integration_api_keys FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage integrations"
  ON public.integration_api_keys FOR ALL
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE TRIGGER update_integration_api_keys_updated_at
  BEFORE UPDATE ON public.integration_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
