ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hod_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employment_start_date date;

CREATE INDEX IF NOT EXISTS idx_profiles_hod_user_id ON public.profiles(hod_user_id);