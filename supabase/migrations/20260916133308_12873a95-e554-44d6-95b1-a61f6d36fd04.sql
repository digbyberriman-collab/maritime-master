REVOKE EXECUTE ON FUNCTION public.sync_crew_import_to_profiles(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_crew_import_to_profiles(uuid) TO authenticated;