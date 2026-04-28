DROP VIEW IF EXISTS public.crew_import_active;
ALTER TABLE public.crew_import ALTER COLUMN crew_id TYPE numeric USING crew_id::numeric;
CREATE VIEW public.crew_import_active
  WITH (security_invoker = true)
  AS SELECT * FROM public.crew_import WHERE is_archived = false;
GRANT SELECT ON public.crew_import_active TO sandbox_exec, authenticated;