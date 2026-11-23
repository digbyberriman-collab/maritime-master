/**
 * The server side of the device-first UI preferences: density and Show
 * roadmap (DECISIONS D-19, D-29, D-69; Phase 2 spec §B.5). The device keeps
 * the value that applies (`storm-density`, `storm-show-roadmap`); this
 * module adopts the account's value on a device that has none and mirrors
 * every change to `user_preferences.density` / `.show_roadmap` once those
 * columns are live (`20261123000200_platform_user_preferences.sql`).
 *
 * The rule (D-19, applied to both):
 * - the device's stored choice always wins once set;
 * - with nothing stored on the device, an explicit server value is adopted
 *   (null on the server means "never chosen" and changes nothing);
 * - every change applies on the device at once and is mirrored to the
 *   server; a failed mirror shows a notice and never changes the device
 *   value (no fake success, no silent failure);
 * - columns missing (D-01): device only, no notice, and Appearance keeps
 *   saying "Saved on this device.";
 * - columns present: Appearance says the choice also follows the account.
 *
 * A plain store (no React context), so the setters in
 * `src/components/ui/use-density.ts` and `src/app/nav/roadmap.ts` mirror
 * without needing a provider; `useUiPreferenceSync` (./useUiPreferenceSync.ts)
 * tells it who is signed in and runs the adoption once per user.
 */
import type { UiPreferenceSaveResult, UiPreferences } from '@/modules/settings/services/uiPreferences';
import type { Density } from '@/components/ui/theme-config';
import { notify } from '@/shared/lib/notify';

/**
 * The service is loaded on first use, not at import: the density and
 * roadmap setters import this module, and they are used by components
 * (DataTable, the sidebar) that must not pull the Supabase client in with
 * them.
 */
const service = () => import('@/modules/settings/services/uiPreferences');

/** What the server holds for the signed-in user's UI preferences. */
export type UiPreferenceColumns =
  /** Nobody signed in, or the read has not answered yet. */
  | 'unknown'
  /** The columns are live: choices follow the account. */
  | 'present'
  /** The columns are not live yet (D-01): device only. */
  | 'missing'
  /** The read failed: device values stand; a change still tries to mirror. */
  | 'error';

export interface UiPreferenceSyncState {
  userId: string | null;
  columns: UiPreferenceColumns;
}

/** How a sync applies an adopted server value on the device (without mirroring it back). */
export interface UiPreferenceAdopters {
  /** True when the device already holds its own density choice. */
  hasDeviceDensity: () => boolean;
  applyDensity: (density: Density) => void;
  hasDeviceShowRoadmap: () => boolean;
  applyShowRoadmap: (on: boolean) => void;
}

export type UiPreferencePatch = Partial<{ density: Density; show_roadmap: boolean }>;

const SIGNED_OUT: UiPreferenceSyncState = { userId: null, columns: 'unknown' };
let state: UiPreferenceSyncState = SIGNED_OUT;
let seq = 0;
const listeners = new Set<() => void>();

function setState(next: UiPreferenceSyncState): void {
  if (next.userId === state.userId && next.columns === state.columns) return;
  state = next;
  listeners.forEach((l) => l());
}

export function getUiPreferenceSync(): UiPreferenceSyncState {
  return state;
}

export function subscribeUiPreferenceSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Who is signed in (null: nobody). For a new user it reads the server values
 * once and adopts each one the device has never chosen. A read already done
 * (or running) for the same user is not repeated; one that failed is retried
 * on the next call. A newer call (another user, a sign-out) supersedes a read
 * still in flight, so one user's values never land on another's device state.
 */
export async function syncUiPreferences(userId: string | null, adopt: UiPreferenceAdopters): Promise<void> {
  if (!userId) {
    seq += 1;
    setState(SIGNED_OUT);
    return;
  }
  if (state.userId === userId && state.columns !== 'error') return;
  seq += 1;
  const mine = seq;
  setState({ userId, columns: 'unknown' });
  let prefs: UiPreferences;
  try {
    prefs = await (await service()).fetchUiPreferences(userId);
  } catch {
    if (mine === seq) setState({ userId, columns: 'error' });
    return;
  }
  if (mine !== seq) return;
  if (prefs.source === 'columns-missing') {
    setState({ userId, columns: 'missing' });
    return;
  }
  // A choice made on this device while the read was in flight is the newer one.
  if (prefs.density !== null && !adopt.hasDeviceDensity()) adopt.applyDensity(prefs.density);
  if (prefs.showRoadmap !== null && !adopt.hasDeviceShowRoadmap()) adopt.applyShowRoadmap(prefs.showRoadmap);
  setState({ userId, columns: 'present' });
}

const NOTICE_TITLE: Record<keyof UiPreferencePatch, string> = {
  density: 'Density applied on this device only',
  show_roadmap: 'Show roadmap applied on this device only',
};

/**
 * Mirror a device choice that has already been applied. Nobody signed in, or
 * the columns not live: nothing to do. Any other failure shows a notice; the
 * device value is never touched here.
 */
export async function mirrorUiPreference(patch: UiPreferencePatch): Promise<void> {
  const { userId, columns } = state;
  if (!userId || columns === 'missing') return;
  let result: UiPreferenceSaveResult;
  try {
    result = await (await service()).saveUiPreference(userId, patch);
  } catch (error) {
    result = { ok: false, reason: 'error', error };
  }
  // `in` narrows without strictNullChecks (the app's tsconfig has it off).
  if (!('reason' in result)) return;
  if (result.reason === 'columns-missing') {
    if (state.userId === userId) setState({ userId, columns: 'missing' });
    return;
  }
  const key = (Object.keys(patch)[0] as keyof UiPreferencePatch | undefined) ?? 'density';
  notify.error(result.error, {
    title: NOTICE_TITLE[key],
    fallback: 'It could not be saved to your account. Try again later.',
  });
}

/** Test-only: forget the signed-in user and any read in flight. */
export function resetUiPreferenceSyncForTests(): void {
  seq += 1;
  state = SIGNED_OUT;
  listeners.forEach((l) => l());
}
