/**
 * Server copies of the device-first UI preferences (DECISIONS D-19, D-29,
 * D-69; Phase 2 spec §B.5): `user_preferences.density` and
 * `user_preferences.show_roadmap`, added by
 * `20261123000200_platform_user_preferences.sql`.
 *
 * - Columns missing (D-01: 42703 / PGRST204 or any "not live yet" error):
 *   `source: 'columns-missing'`; the device value stays the only one, as
 *   Appearance says today.
 * - No row: `source: 'columns'` with both values null.
 * - Any other error is thrown.
 *
 * Adoption rule (D-19 applied to density and show_roadmap): the device's
 * stored choice always wins once set; with nothing stored on the device an
 * explicit server value is adopted; null on the server means "never
 * chosen". Writes mirror the device choice to the server and report a
 * failure without changing the device value.
 *
 * Consumed by src/app/shell/uiPreferenceSync.ts.
 */
import { isMissingRelation, pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { isDensity, type Density } from '@/components/ui/theme-config';
import type { SettingsPendingColumns } from '../types/db.pending';

const settingsDb = pendingClient<NoPending, NoPending, NoPending, SettingsPendingColumns>();

export type UiPreferences =
  | { source: 'columns'; density: Density | null; showRoadmap: boolean | null }
  | { source: 'columns-missing'; density: null; showRoadmap: null };

export const uiPreferenceKeys = {
  all: ['ui-preferences'] as const,
  user: (userId: string) => ['ui-preferences', userId] as const,
};

export async function fetchUiPreferences(userId: string): Promise<UiPreferences> {
  const { data, error } = await settingsDb.from('user_preferences').select('density, show_roadmap').eq('user_id', userId).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { source: 'columns-missing', density: null, showRoadmap: null };
    throw error;
  }
  const density = data?.density ?? null;
  return {
    source: 'columns',
    density: density !== null && isDensity(density) ? density : null,
    showRoadmap: typeof data?.show_roadmap === 'boolean' ? data.show_roadmap : null,
  };
}

export type UiPreferenceSaveResult = { ok: true } | { ok: false; reason: 'columns-missing' | 'error'; error?: unknown };

/** Mirror one device choice to the server (upsert on `user_id`). */
export async function saveUiPreference(
  userId: string,
  patch: Partial<{ density: Density; show_roadmap: boolean }>,
): Promise<UiPreferenceSaveResult> {
  const { error } = await settingsDb.from('user_preferences').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
  if (!error) return { ok: true };
  if (isMissingRelation(error)) return { ok: false, reason: 'columns-missing' };
  return { ok: false, reason: 'error', error };
}
