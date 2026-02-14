
-- Table to track Airtable sync state per crew member
CREATE TABLE public.airtable_sync_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  profile_user_id UUID NOT NULL,
  airtable_record_id TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_direction TEXT NOT NULL DEFAULT 'import', -- 'import' or 'export'
  sync_status TEXT NOT NULL DEFAULT 'synced', -- 'synced', 'pending', 'error'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, airtable_record_id),
  UNIQUE(company_id, profile_user_id)
);

-- Sync run log
CREATE TABLE public.airtable_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  sync_type TEXT NOT NULL, -- 'full', 'incremental', 'manual'
  direction TEXT NOT NULL, -- 'import', 'export', 'two_way'
  records_imported INT DEFAULT 0,
  records_exported INT DEFAULT 0,
  records_errored INT DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  error_details JSONB,
  triggered_by UUID
);

-- Enable RLS
ALTER TABLE public.airtable_sync_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airtable_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS: company-scoped access
CREATE POLICY "Company users can view sync map"
  ON public.airtable_sync_map FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company users can view sync log"
  ON public.airtable_sync_log FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

-- Only edge functions (service role) will insert/update these tables
