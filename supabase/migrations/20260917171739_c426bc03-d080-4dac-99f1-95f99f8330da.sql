-- ── Logbook types enum ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'logbook_type') THEN
    CREATE TYPE public.logbook_type AS ENUM (
      'deck_log',
      'engine_log',
      'bell_book',
      'radio_log',
      'oil_record_book',
      'garbage_record_book',
      'ballast_water_record',
      'visitor_log'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'logbook_entry_status') THEN
    CREATE TYPE public.logbook_entry_status AS ENUM ('draft', 'submitted', 'signed', 'amended');
  END IF;
END $$;

-- ── Logbooks (one row per logbook per vessel) ──────────────────────
CREATE TABLE public.logbooks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  logbook_type public.logbook_type NOT NULL,
  name text NOT NULL,
  description text,
  is_statutory boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  current_page integer NOT NULL DEFAULT 1,
  last_entry_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vessel_id, logbook_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logbooks TO authenticated;
GRANT ALL ON public.logbooks TO service_role;

ALTER TABLE public.logbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logbooks_select_company" ON public.logbooks
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "logbooks_insert_privileged" ON public.logbooks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','chief_engineer','chief_officer','purser']::app_role[])
  );

CREATE POLICY "logbooks_update_privileged" ON public.logbooks
  FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','chief_engineer','chief_officer','purser']::app_role[])
  )
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "logbooks_delete_admin" ON public.logbooks
  FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['superadmin','dpa']::app_role[])
  );

CREATE INDEX idx_logbooks_vessel ON public.logbooks(vessel_id);
CREATE INDEX idx_logbooks_company ON public.logbooks(company_id);

CREATE TRIGGER update_logbooks_updated_at
  BEFORE UPDATE ON public.logbooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Logbook entries ───────────────────────────────────────────────
CREATE TABLE public.logbook_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  logbook_id uuid NOT NULL REFERENCES public.logbooks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  entry_at timestamptz NOT NULL DEFAULT now(),
  entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  watch_period text,
  page_number integer,
  summary text,
  remarks text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  latitude numeric(9,6),
  longitude numeric(9,6),
  position_text text,
  status public.logbook_entry_status NOT NULL DEFAULT 'draft',
  recorded_by uuid,
  recorded_by_name text,
  signed_by uuid,
  signed_by_name text,
  signed_at timestamptz,
  amended_from_id uuid REFERENCES public.logbook_entries(id) ON DELETE SET NULL,
  amendment_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logbook_entries TO authenticated;
GRANT ALL ON public.logbook_entries TO service_role;

ALTER TABLE public.logbook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logbook_entries_select_company" ON public.logbook_entries
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "logbook_entries_insert_crew" ON public.logbook_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "logbook_entries_update_author_or_privileged" ON public.logbook_entries
  FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      (recorded_by = auth.uid() AND status = 'draft')
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','chief_engineer','chief_officer','purser']::app_role[])
    )
  )
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "logbook_entries_delete_draft_or_admin" ON public.logbook_entries
  FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      (recorded_by = auth.uid() AND status = 'draft')
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa']::app_role[])
    )
  );

CREATE INDEX idx_logbook_entries_logbook ON public.logbook_entries(logbook_id, entry_at DESC);
CREATE INDEX idx_logbook_entries_vessel_date ON public.logbook_entries(vessel_id, entry_date DESC);
CREATE INDEX idx_logbook_entries_company ON public.logbook_entries(company_id);
CREATE INDEX idx_logbook_entries_status ON public.logbook_entries(status);

CREATE TRIGGER update_logbook_entries_updated_at
  BEFORE UPDATE ON public.logbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep the parent logbook's last entry timestamp current
CREATE OR REPLACE FUNCTION public.touch_logbook_last_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.logbooks
     SET last_entry_at = GREATEST(COALESCE(last_entry_at, NEW.entry_at), NEW.entry_at)
   WHERE id = NEW.logbook_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER logbook_entries_touch_parent
  AFTER INSERT OR UPDATE OF entry_at ON public.logbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_logbook_last_entry();