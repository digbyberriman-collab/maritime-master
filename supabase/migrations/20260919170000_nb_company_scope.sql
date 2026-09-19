-- =================================================================
-- New Build: company-scoped row level security
-- =================================================================
-- 20260617180527 created the nb_* tables with
--   CREATE POLICY "<table>_auth_all" ... FOR ALL TO authenticated USING (true) WITH CHECK (true)
-- so any signed-in user of any company could read and write every
-- company's new-build projects, budgets, purchase orders and drawings.
-- Every nb_* table carries company_id. This migration:
--   1. drops the permissive policies on every nb_* table,
--   2. adds select / insert / update / delete policies scoped to the
--      caller's company, plus an explicit anon deny,
--   3. fills company_id from the caller on insert (and removes the
--      zero-uuid default) so the New Build UI keeps working without
--      sending company_id itself.
-- It is written as a loop over pg_tables so it also covers nb_* tables
-- added after this file was written.
-- =================================================================

CREATE OR REPLACE FUNCTION public.nb_set_company_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.company_id IS NULL OR NEW.company_id = '00000000-0000-0000-0000-000000000000'::uuid)
     AND auth.uid() IS NOT NULL THEN
    NEW.company_id := public.get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nb_set_company_id() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'nb\_%'
    ORDER BY tablename
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) THEN
      RAISE EXCEPTION 'nb table % has no company_id column; add it before scoping', t;
    END IF;

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id DROP DEFAULT', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id))',
      t || '_company_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id))',
      t || '_company_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id)) WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id))',
      t || '_company_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id))',
      t || '_company_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (false)',
      t || '_anon_deny', t);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_nb_set_company_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_nb_set_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.nb_set_company_id()',
      t);
  END LOOP;
END $$;

-- Verification (run after applying):
--   SELECT tablename, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename LIKE 'nb\_%' AND qual = 'true';
-- must return no rows.
