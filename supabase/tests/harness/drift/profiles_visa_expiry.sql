-- Drift patch: profiles.visa_expiry before the hand-written HRIS phase 4 file.
--
-- Before: 20260917140000_hris_phase4_recruitment_onboarding_rtw.sql
-- Live state reproduced: public.profiles.visa_expiry date (nullable).
-- Evidence: src/integrations/supabase/types.ts, profiles.Row.visa_expiry
--   (string | null); the column is added by 20260917113000 (line 46) and by
--   its Lovable copy 20260917175431_780bf2a9-cf3e-40be-a9b2-f37c8fff5950.sql
--   (line 73, "visa_expiry date"). Live, the copy ran at 17:54 and phase 4 ran
--   as its copy 20260917180937_8438276a-d002-4d2a-9ffa-1895a70af12b.sql at
--   18:09, so the column existed when phase 4's statements ran. Here the
--   hand-written 20260917113000 fails as it failed live (replay.json
--   expect_failure), so the column has to be put in place before the
--   hand-written phase 4 file, which replays in version order ahead of both
--   copies.
-- Schema state only: the same column, type and comment as the copy. Idempotent.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visa_expiry date;
COMMENT ON COLUMN public.profiles.visa_expiry IS 'Expiry of the visa described in visa_status; feeds hr_expiry_items.';
