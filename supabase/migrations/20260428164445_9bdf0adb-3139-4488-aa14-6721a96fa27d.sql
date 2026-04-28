-- 1. Allow imported crew to live without an auth user.
--    The existing UNIQUE(user_id) already permits multiple NULLs, so the
--    constraint can stay as-is and keep all dependent foreign keys working.
ALTER TABLE public.profiles
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Track imported (not-yet-invited) crew explicitly.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT false;

-- 3. Prevent duplicate emails within the same company (case-insensitive),
--    so importing the same person twice fails fast.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_company_email_unique
  ON public.profiles (company_id, lower(email))
  WHERE company_id IS NOT NULL;

-- 4. Helpful index for filtering the roster by invitation state.
CREATE INDEX IF NOT EXISTS profiles_invitation_state_idx
  ON public.profiles (company_id, account_status, is_imported);