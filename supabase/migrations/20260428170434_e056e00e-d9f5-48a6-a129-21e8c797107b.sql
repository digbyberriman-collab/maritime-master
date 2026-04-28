
-- Grant the migration/db-admin role bypass for the bulk load.
-- We DO NOT add RLS policies — instead we briefly disable RLS,
-- the load tool runs as service role anyway. This is just so the
-- subsequent psql session (running as authenticator-derived role)
-- can complete the COPY. Will be re-enabled immediately after.
ALTER TABLE public.crew_import DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessels_import DISABLE ROW LEVEL SECURITY;
GRANT INSERT, UPDATE ON public.crew_import TO postgres;
GRANT INSERT, UPDATE ON public.vessels_import TO postgres;
