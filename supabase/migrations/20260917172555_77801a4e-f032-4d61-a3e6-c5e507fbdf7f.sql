-- Track who last changed an entry
ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by_name text;

-- ── Audit trail of every change to an entry ───────────────────────
CREATE TABLE public.logbook_entry_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id uuid NOT NULL,
  logbook_id uuid,
  company_id uuid NOT NULL,
  vessel_id uuid,
  action text NOT NULL,
  changed_fields text[],
  old_values jsonb,
  new_values jsonb,
  actor_id uuid,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.logbook_entry_audit TO authenticated;
GRANT ALL ON public.logbook_entry_audit TO service_role;

ALTER TABLE public.logbook_entry_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logbook_entry_audit_select_company" ON public.logbook_entry_audit
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE INDEX idx_logbook_entry_audit_entry ON public.logbook_entry_audit(entry_id, created_at DESC);
CREATE INDEX idx_logbook_entry_audit_company ON public.logbook_entry_audit(company_id);

-- Resolve a readable name for the acting user
CREATE OR REPLACE FUNCTION public.logbook_actor_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
           p.email,
           'System'
         )
    FROM public.profiles p
   WHERE p.user_id = _user_id
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.logbook_actor_name(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.logbook_actor_name(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.logbook_actor_name(uuid) FROM authenticated;

-- Stamp updated_by / updated_by_name on every update
CREATE OR REPLACE FUNCTION public.logbook_stamp_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
    NEW.updated_by_name := public.logbook_actor_name(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.logbook_stamp_updated_by() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.logbook_stamp_updated_by() FROM anon;
REVOKE ALL ON FUNCTION public.logbook_stamp_updated_by() FROM authenticated;

CREATE TRIGGER logbook_entries_stamp_updated_by
  BEFORE UPDATE ON public.logbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.logbook_stamp_updated_by();

-- Record every create, change and deletion
CREATE OR REPLACE FUNCTION public.logbook_entries_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_actor uuid := auth.uid();
  v_tracked text[] := ARRAY[
    'entry_at','entry_date','watch_period','page_number','summary','remarks',
    'data','latitude','longitude','position_text','status','signed_by','signed_by_name','signed_at'
  ];
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.logbook_entry_audit (
      entry_id, logbook_id, company_id, vessel_id, action, new_values, actor_id, actor_name
    ) VALUES (
      NEW.id, NEW.logbook_id, NEW.company_id, NEW.vessel_id, 'created',
      to_jsonb(NEW) - 'created_at' - 'updated_at',
      v_actor, public.logbook_actor_name(v_actor)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.logbook_entry_audit (
      entry_id, logbook_id, company_id, vessel_id, action, old_values, actor_id, actor_name
    ) VALUES (
      OLD.id, OLD.logbook_id, OLD.company_id, OLD.vessel_id, 'deleted',
      to_jsonb(OLD) - 'created_at' - 'updated_at',
      v_actor, public.logbook_actor_name(v_actor)
    );
    RETURN OLD;
  END IF;

  v_old := '{}'::jsonb;
  v_new := '{}'::jsonb;
  v_changed := ARRAY[]::text[];

  FOREACH v_key IN ARRAY v_tracked LOOP
    IF to_jsonb(OLD) -> v_key IS DISTINCT FROM to_jsonb(NEW) -> v_key THEN
      v_changed := v_changed || v_key;
      v_old := v_old || jsonb_build_object(v_key, to_jsonb(OLD) -> v_key);
      v_new := v_new || jsonb_build_object(v_key, to_jsonb(NEW) -> v_key);
    END IF;
  END LOOP;

  IF array_length(v_changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.logbook_entry_audit (
    entry_id, logbook_id, company_id, vessel_id, action,
    changed_fields, old_values, new_values, actor_id, actor_name
  ) VALUES (
    NEW.id, NEW.logbook_id, NEW.company_id, NEW.vessel_id,
    CASE WHEN NEW.status = 'signed' AND OLD.status <> 'signed' THEN 'signed' ELSE 'updated' END,
    v_changed, v_old, v_new, v_actor, public.logbook_actor_name(v_actor)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.logbook_entries_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.logbook_entries_audit() FROM anon;
REVOKE ALL ON FUNCTION public.logbook_entries_audit() FROM authenticated;

CREATE TRIGGER logbook_entries_audit_trail
  AFTER INSERT OR UPDATE OR DELETE ON public.logbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.logbook_entries_audit();