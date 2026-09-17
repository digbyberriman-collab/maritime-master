ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_status text,
  ADD COLUMN IF NOT EXISTS rotation_pattern text;