
drop view if exists public.crew_import_active;
create view public.crew_import_active
  with (security_invoker = true)
  as
  select * from public.crew_import where is_archived = false;
