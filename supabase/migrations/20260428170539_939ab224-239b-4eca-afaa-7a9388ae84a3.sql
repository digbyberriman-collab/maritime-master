REVOKE INSERT, UPDATE ON public.crew_import FROM sandbox_exec;
REVOKE INSERT, UPDATE ON public.vessels_import FROM sandbox_exec;
REVOKE INSERT, UPDATE ON public.crew_import FROM postgres;
REVOKE INSERT, UPDATE ON public.vessels_import FROM postgres;
ALTER TABLE public.crew_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessels_import ENABLE ROW LEVEL SECURITY;