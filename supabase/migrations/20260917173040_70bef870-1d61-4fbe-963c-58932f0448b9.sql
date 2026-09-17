ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personnel_type text NOT NULL DEFAULT 'crew',
  ADD COLUMN IF NOT EXISTS place_of_birth text,
  ADD COLUMN IF NOT EXISTS passport_country text,
  ADD COLUMN IF NOT EXISTS seamans_book_number text,
  ADD COLUMN IF NOT EXISTS embarkation_port text,
  ADD COLUMN IF NOT EXISTS office_location text,
  ADD COLUMN IF NOT EXISTS job_title text;

CREATE INDEX IF NOT EXISTS idx_profiles_personnel_type
  ON public.profiles(company_id, personnel_type);

CREATE INDEX IF NOT EXISTS idx_profiles_imported_vessel
  ON public.profiles(imported_vessel_id);