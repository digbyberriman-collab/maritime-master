
-- 1. Track Airtable origin on profiles for idempotent re-imports
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS airtable_id text UNIQUE;

-- 2. Imported crew don't have a user_id yet, so they can't appear in
--    crew_assignments (which requires user_id). Track their vessel directly
--    on the profile until they're invited.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS imported_vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_imported_vessel_idx ON public.profiles(imported_vessel_id);
CREATE INDEX IF NOT EXISTS profiles_airtable_idx ON public.profiles(airtable_id);

-- 3. Ensure all 9 vessels from the spreadsheet exist in the live vessels table.
--    Existing vessels keep their names. New ones use the spreadsheet name.
INSERT INTO public.vessels (company_id, name, status)
SELECT '11111111-1111-1111-1111-111111111111'::uuid, v.name, 'Active'
FROM (VALUES ('Inkfish'), ('Rocinante'), ('Fleet-Wide')) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.vessels existing
  WHERE existing.company_id = '11111111-1111-1111-1111-111111111111'
    AND (
      existing.name ILIKE '%' || v.name || '%'
      OR v.name ILIKE '%' || existing.name || '%'
    )
);
