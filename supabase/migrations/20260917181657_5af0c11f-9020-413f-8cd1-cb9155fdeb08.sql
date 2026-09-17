ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS joining_date date,
  ADD COLUMN IF NOT EXISTS leaving_date date,
  ADD COLUMN IF NOT EXISTS watch_pattern text;