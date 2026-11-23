/**
 * New `user_preferences` columns (DECISIONS D-19, D-29, D-69; Phase 2 spec
 * §A.2, `20261123000200_platform_user_preferences.sql`). The table is live;
 * only these columns are pending, so a read must classify a missing column
 * (42703 / PGRST204, `isMissingRelation`) as "not stored on the server yet"
 * and keep the device value, as D-19 and D-29 say. Any other error is an
 * error, never a silent default.
 *
 * Null means "never chosen on the server": the device value (or the
 * default) applies.
 */
import type { PendingColumns } from '@/integrations/supabase/pending';
import type { Density } from '@/components/ui/theme-config';

export type UserPreferenceUiColumns = {
  density: Density | null;
  show_roadmap: boolean | null;
};

export type SettingsPendingColumns = {
  user_preferences: PendingColumns<UserPreferenceUiColumns>;
};
