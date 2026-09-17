ALTER TYPE public.logbook_entry_status ADD VALUE IF NOT EXISTS 'finalized';

ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS finalized_by_name text,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE OR REPLACE FUNCTION public.logbook_entries_signoff_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sign-off must always carry who signed and when.
  IF NEW.status IN ('signed', 'finalized') THEN
    IF NEW.signed_by IS NULL OR NEW.signed_at IS NULL THEN
      RAISE EXCEPTION 'A logbook entry must record who signed it and when before it can be signed or finalized.';
    END IF;
  END IF;

  -- Finalisation requires a completed sign-off and stamps the finaliser.
  IF NEW.status = 'finalized' AND (TG_OP = 'INSERT' OR OLD.status <> 'finalized') THEN
    IF NEW.signed_by IS NULL OR NEW.signed_at IS NULL THEN
      RAISE EXCEPTION 'This entry must be signed off before it can be finalized.';
    END IF;
    NEW.finalized_by := COALESCE(NEW.finalized_by, auth.uid());
    NEW.finalized_at := COALESCE(NEW.finalized_at, now());
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    -- Finalised entries are locked; only DPA/Superadmin may reopen them.
    IF NEW.status <> 'finalized' THEN
      IF NOT (public.has_role(auth.uid(), 'dpa'::app_role)
              OR public.has_role(auth.uid(), 'superadmin'::app_role)) THEN
        RAISE EXCEPTION 'A finalized logbook entry can only be reopened by the DPA or a Superadmin.';
      END IF;
      NEW.finalized_by := NULL;
      NEW.finalized_by_name := NULL;
      NEW.finalized_at := NULL;
    ELSIF (NEW.entry_at, NEW.summary, NEW.remarks, NEW.watch_period, NEW.position_text, NEW.data)
          IS DISTINCT FROM
          (OLD.entry_at, OLD.summary, OLD.remarks, OLD.watch_period, OLD.position_text, OLD.data) THEN
      RAISE EXCEPTION 'A finalized logbook entry cannot be edited. Reopen it first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.logbook_entries_signoff_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS logbook_entries_signoff_guard ON public.logbook_entries;
CREATE TRIGGER logbook_entries_signoff_guard
  BEFORE INSERT OR UPDATE ON public.logbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.logbook_entries_signoff_guard();