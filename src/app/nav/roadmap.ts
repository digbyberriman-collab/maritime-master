/**
 * "Show roadmap": lets an owner or admin see planned nav leaves (DECISIONS
 * D-06, gap/10 IA10). Everyone else never sees them, whatever is stored.
 *
 * The choice is a per-browser preference in localStorage under
 * `storm-show-roadmap`. It moves to `user_preferences.show_roadmap` once that
 * column exists (gap/10 data model). Changes reach every open sidebar in this
 * tab (custom event) and in other tabs (`storage` event).
 */
import { useCallback, useSyncExternalStore } from 'react';

export const SHOW_ROADMAP_KEY = 'storm-show-roadmap';
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

export function writeShowRoadmap(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    else window.localStorage.removeItem(SHOW_ROADMAP_KEY);
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

/** The stored preference and a setter. Callers still apply `canUseRoadmap`. */
export function useShowRoadmapPreference(): [boolean, (on: boolean) => void] {
  const stored = useSyncExternalStore(subscribe, readShowRoadmap, () => false);
  const set = useCallback((on: boolean) => writeShowRoadmap(on), []);
  return [stored, set];
}
