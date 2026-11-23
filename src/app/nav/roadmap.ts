/**
 * "Show roadmap": lets an owner or admin see planned nav leaves (DECISIONS
 * D-06, gap/10 IA10). Everyone else never sees them, whatever is stored.
 *
 * The device holds the choice that applies (`storm-show-roadmap` in
 * localStorage is `'true'` while on and absent while off;
 * `storm-show-roadmap-chosen` marks that this device has chosen at all) and
 * it is mirrored to `user_preferences.show_roadmap` once that column is live
 * (D-29, D-19; Phase 2 spec §B.5): the device value wins once set, a device
 * with none adopts the account's explicit value (src/app/shell/
 * uiPreferenceSync.ts), and a failed mirror shows a notice without changing
 * the device value. Changes reach every open sidebar in this tab (custom
 * event) and in other tabs (`storage` event).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { mirrorUiPreference } from '@/app/shell/uiPreferenceSync';

export const SHOW_ROADMAP_KEY = 'storm-show-roadmap';
/** Set once this device has made (or adopted) a choice, on or off: D-19's "the device wins once set". */
export const SHOW_ROADMAP_CHOSEN_KEY = 'storm-show-roadmap-chosen';
const CHANGE_EVENT = 'storm-show-roadmap-change';

/**
 * Roles that count as owner or admin today. These are the same sets every
 * access resolver in src/modules/auth/lib uses: RBAC superadmin and DPA, and
 * the legacy DPA and shore-management roles.
 */
export const ROADMAP_RBAC_ROLES: readonly string[] = ['superadmin', 'dpa'];
export const ROADMAP_LEGACY_ROLES: readonly string[] = ['dpa', 'shore_management'];

export interface RoadmapAccessInput {
  /** RBAC role names (`permissionsStore.userRoles[].role_name`). */
  rbacRoles: readonly (string | null | undefined)[];
  /** `profiles.role`, the legacy role. */
  legacyRole: string | null | undefined;
  /** False while roles are still loading: the answer is then "no". */
  ready: boolean;
}

/** Owner/admin check for the roadmap toggle. Fails closed while loading. */
export function canUseRoadmap({ rbacRoles, legacyRole, ready }: RoadmapAccessInput): boolean {
  if (!ready) return false;
  if (rbacRoles.some((r) => !!r && ROADMAP_RBAC_ROLES.includes(r))) return true;
  return !!legacyRole && ROADMAP_LEGACY_ROLES.includes(legacyRole);
}

/** The stored preference. False when unset or when storage is unavailable. */
export function readShowRoadmap(): boolean {
  try {
    return window.localStorage.getItem(SHOW_ROADMAP_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * True when this browser holds its own choice, on or off. An "off" chosen
 * before Phase 2 left no trace, so such a device reads as "never chosen" and
 * may adopt the account's explicit value once.
 */
export function hasStoredShowRoadmapChoice(): boolean {
  try {
    return window.localStorage.getItem(SHOW_ROADMAP_KEY) === 'true' || window.localStorage.getItem(SHOW_ROADMAP_CHOSEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Store the choice on this device (device only; the hook's setter also mirrors it). */
export function writeShowRoadmap(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    else window.localStorage.removeItem(SHOW_ROADMAP_KEY);
    window.localStorage.setItem(SHOW_ROADMAP_CHOSEN_KEY, '1');
  } catch {
    /* storage unavailable: the choice lasts for this render only */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SHOW_ROADMAP_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The stored preference and a setter that stores it on the device and
 * mirrors it to the account. Callers still apply `canUseRoadmap`.
 */
export function useShowRoadmapPreference(): [boolean, (on: boolean) => void] {
  const stored = useSyncExternalStore(subscribe, readShowRoadmap, () => false);
  const set = useCallback((on: boolean) => {
    writeShowRoadmap(on);
    void mirrorUiPreference({ show_roadmap: on });
  }, []);
  return [stored, set];
}
