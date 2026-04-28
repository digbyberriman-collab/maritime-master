
WITH vessel_map AS (
  SELECT * FROM (VALUES
    ('Leviathan',    'M/Y LEVIATHAN'),
    ('Game Changer', 'M/Y GAME CHANGER'),
    ('Draak',        'M/Y DRAAK'),
    ('Xiphias',      'M/Y XIPHIAS'),
    ('Dagon',        'R/V DAGON'),
    ('Hydra',        'R/V HYDRA'),
    ('Inkfish',      'Inkfish'),
    ('Rocinante',    'Rocinante'),
    ('Fleet-Wide',   'Fleet-Wide')
  ) AS m(import_name, live_name)
),
resolved AS (
  SELECT
    c.airtable_id,
    lower(COALESCE(
      NULLIF(trim(c.krakenfleet_email), ''),
      NULLIF(trim(c.personal_email), ''),
      NULLIF(trim(c.work_email), ''),
      'imported-' || c.airtable_id || '@no-email.local'
    )) AS email,
    COALESCE(NULLIF(trim(c.first_name), ''), 'Unknown') AS first_name,
    COALESCE(NULLIF(trim(c.last_name), ''),  'Unknown') AS last_name,
    NULLIF(trim(c.preferred_name), '') AS preferred_name,
    NULLIF(trim(c.role), '') AS rank,
    NULLIF(trim(c.nationality), '') AS nationality,
    NULLIF(trim(c.cellular_phone), '') AS phone,
    c.date_of_birth,
    NULLIF(trim(c.department), '') AS department,
    NULLIF(trim(c.next_of_kin_name), '') AS noks_name,
    NULLIF(trim(c.next_of_kin_phone), '') AS noks_phone,
    (
      SELECT v.id
      FROM vessel_map vm
      JOIN public.vessels v ON v.name = vm.live_name
      WHERE vm.import_name = trim(split_part(c.vessel, ',', 1))
        AND v.company_id = '11111111-1111-1111-1111-111111111111'
      LIMIT 1
    ) AS vessel_id
  FROM public.crew_import_active c
),
-- Dedupe within the import: keep first row per email
deduped AS (
  SELECT DISTINCT ON (email) *
  FROM resolved
  ORDER BY email, airtable_id
)
INSERT INTO public.profiles (
  airtable_id, email, first_name, last_name, preferred_name,
  rank, nationality, phone, date_of_birth, department,
  emergency_contact_name, emergency_contact_phone,
  imported_vessel_id, company_id, role, account_status, is_imported, user_id
)
SELECT
  d.airtable_id, d.email, d.first_name, d.last_name, d.preferred_name,
  d.rank, d.nationality, d.phone, d.date_of_birth, d.department,
  d.noks_name, d.noks_phone,
  d.vessel_id,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'crew'::user_role,
  'not_invited',
  true,
  NULL
FROM deduped d
-- Skip if email already exists in profiles for this company
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.company_id = '11111111-1111-1111-1111-111111111111'
    AND lower(p.email) = d.email
)
ON CONFLICT (airtable_id) DO UPDATE SET
  email                    = EXCLUDED.email,
  first_name               = EXCLUDED.first_name,
  last_name                = EXCLUDED.last_name,
  preferred_name           = EXCLUDED.preferred_name,
  rank                     = EXCLUDED.rank,
  nationality              = EXCLUDED.nationality,
  phone                    = EXCLUDED.phone,
  date_of_birth            = EXCLUDED.date_of_birth,
  department               = EXCLUDED.department,
  emergency_contact_name   = EXCLUDED.emergency_contact_name,
  emergency_contact_phone  = EXCLUDED.emergency_contact_phone,
  imported_vessel_id       = EXCLUDED.imported_vessel_id,
  updated_at               = now();
