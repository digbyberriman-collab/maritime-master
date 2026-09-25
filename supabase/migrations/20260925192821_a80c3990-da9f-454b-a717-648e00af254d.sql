-- =================================================================
-- Server-side reference numbers for audits, findings and drills
-- =================================================================
-- Second half of finding H5. The ISM form workflow migration
-- (20260919210000) moved submission numbering into the database; these
-- three still came from the browser, and from a worse source than the
-- forms did:
--
--   generateAuditNumber(audits.length)        -> AUD-YYYY-NNN
--   generateDrillNumber(drills.length)        -> DRILL-YYYY-NNN
--   generateFindingNumber(auditNumber, n)     -> <audit>-F NN
--
-- The counter was the length of the array React happened to be holding.
-- That array is filtered by vessel and capped, so the number restarts
-- whenever a filter is applied, and two people creating an audit at the
-- same time both get the same one. audits.audit_number and
-- drills.drill_number are UNIQUE, so the second insert fails outright;
-- audit_findings.finding_number is not, so duplicates just accumulate.
--
-- All three tables are empty on the live database, so there is no
-- renumbering to do.
--
-- Counters live in reference_counters, keyed by a scope string, because
-- the scope here is computed (per company and year for audits, per
-- vessel and year for drills, per audit for findings).
-- form_submission_counters keeps its own composite key so it can carry
-- real foreign keys and be cleaned up when a company or template is
-- deleted; these scopes cannot.
--
-- The uniqueness changes with the numbering. audits.audit_number and
-- drills.drill_number were globally UNIQUE, which is incompatible with
-- numbering per tenant: company B's first audit of the year is also
-- AUD-2026-001. Both become composite, and drills are numbered per
-- vessel, which is how a vessel's drill register reads anyway.
-- =================================================================

CREATE TABLE IF NOT EXISTS public.reference_counters (
  scope text PRIMARY KEY,
  next_value integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on with no policy: only SECURITY DEFINER functions reach it.
ALTER TABLE public.reference_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reference_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_reference_value(p_scope text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next integer;
BEGIN
  -- One statement, so concurrent callers serialise on the primary key
  -- instead of both reading the same maximum.
  INSERT INTO public.reference_counters (scope, next_value)
  VALUES (p_scope, 2)
  ON CONFLICT (scope)
  DO UPDATE SET next_value = public.reference_counters.next_value + 1,
                updated_at = now()
  RETURNING next_value - 1 INTO v_next;
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION public.next_reference_value(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- audits: AUD-YYYY-NNN, per company and year
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audits_set_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year integer := extract(year from coalesce(NEW.created_at, now()))::integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.company_id IS NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  NEW.audit_number := 'AUD-' || v_year || '-' || lpad(
    public.next_reference_value('audits:' || coalesce(NEW.company_id::text, 'none') || ':' || v_year)::text,
    3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audits_set_number ON public.audits;
CREATE TRIGGER trg_audits_set_number
  BEFORE INSERT ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.audits_set_number();

-- ---------------------------------------------------------------
-- drills: DRILL-YYYY-NNN, per vessel and year
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.drills_set_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year integer := extract(year from coalesce(NEW.created_at, now()))::integer;
BEGIN
  NEW.drill_number := 'DRILL-' || v_year || '-' || lpad(
    public.next_reference_value('drills:' || NEW.vessel_id::text || ':' || v_year)::text,
    3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drills_set_number ON public.drills;
CREATE TRIGGER trg_drills_set_number
  BEFORE INSERT ON public.drills
  FOR EACH ROW EXECUTE FUNCTION public.drills_set_number();

-- ---------------------------------------------------------------
-- audit_findings: <audit_number>-F NN, per audit
-- ---------------------------------------------------------------
-- finding_number had no unique constraint, which is how the client's
-- filtered-array counter could produce two of the same and nothing
-- complained. Number per audit and enforce it.
CREATE OR REPLACE FUNCTION public.audit_findings_set_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_audit_number text;
BEGIN
  SELECT a.audit_number INTO v_audit_number FROM public.audits a WHERE a.id = NEW.audit_id;
  IF v_audit_number IS NULL THEN
    RAISE EXCEPTION 'A finding must belong to an audit';
  END IF;
  NEW.finding_number := v_audit_number || '-F' || lpad(
    public.next_reference_value('audit_findings:' || NEW.audit_id::text)::text, 2, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_findings_set_number ON public.audit_findings;
CREATE TRIGGER trg_audit_findings_set_number
  BEFORE INSERT ON public.audit_findings
  FOR EACH ROW EXECUTE FUNCTION public.audit_findings_set_number();

ALTER TABLE public.audit_findings DROP CONSTRAINT IF EXISTS audit_findings_number_key;
ALTER TABLE public.audit_findings
  ADD CONSTRAINT audit_findings_number_key UNIQUE (audit_id, finding_number);

-- ---------------------------------------------------------------
-- Uniqueness follows the numbering scope
-- ---------------------------------------------------------------
ALTER TABLE public.audits DROP CONSTRAINT IF EXISTS audits_audit_number_key;
ALTER TABLE public.audits DROP CONSTRAINT IF EXISTS audits_company_number_key;
ALTER TABLE public.audits
  ADD CONSTRAINT audits_company_number_key UNIQUE (company_id, audit_number);

ALTER TABLE public.drills DROP CONSTRAINT IF EXISTS drills_drill_number_key;
ALTER TABLE public.drills DROP CONSTRAINT IF EXISTS drills_vessel_number_key;
ALTER TABLE public.drills
  ADD CONSTRAINT drills_vessel_number_key UNIQUE (vessel_id, drill_number);