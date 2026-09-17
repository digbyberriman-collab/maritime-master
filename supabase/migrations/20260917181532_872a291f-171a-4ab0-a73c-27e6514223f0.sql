ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS annual_leave_entitlement numeric,
  ADD COLUMN IF NOT EXISTS leave_accrual_method text;