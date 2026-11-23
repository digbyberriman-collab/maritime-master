-- =================================================================
-- PLATFORM: UI preferences on the server (DECISIONS D-19, D-29, D-69;
-- Phase 2 spec §A.2)
-- Tables: public.user_preferences (live; new columns density, show_roadmap;
--   theme default 'dark')
-- Helpers: none (the live own-row policies apply unchanged)
-- TS mirror: src/modules/settings/types/db.pending.ts
--   (SettingsPendingColumns.user_preferences), read by
--   src/modules/settings/services/uiPreferences.ts
-- =================================================================
--
-- density and show_roadmap follow the user across devices. NULL means
-- "never chosen on the server": the client keeps the device value (or the
-- default). The theme default becomes 'dark' (D-29, dark-first); existing
-- rows are not touched (D-19: a stored 'system' stays and the client
-- ignores it).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.user_preferences') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000200_platform_user_preferences needs public.user_preferences: apply the legacy migrations first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'theme') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000200_platform_user_preferences needs user_preferences.theme';
  END IF;
END
$$;

ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS density text;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS show_roadmap boolean;

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_density_check,
  ADD CONSTRAINT user_preferences_density_check CHECK (density IS NULL OR density IN ('comfortable', 'default', 'compact'));

ALTER TABLE public.user_preferences ALTER COLUMN theme SET DEFAULT 'dark';

COMMENT ON COLUMN public.user_preferences.density IS 'UI density (D-69): comfortable | default | compact. NULL = never chosen on the server; the client keeps the device value.';
COMMENT ON COLUMN public.user_preferences.show_roadmap IS 'Whether roadmap (not yet built) items show in the navigation. NULL = never chosen on the server; the client keeps the device value.';
COMMENT ON COLUMN public.user_preferences.theme IS 'UI theme. Default dark (D-29, dark-first); a stored system value from before D-19 is kept and ignored by the client.';
