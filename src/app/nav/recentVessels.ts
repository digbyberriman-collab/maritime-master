/**
 * The last vessels a user opened, on this device (gap/10 IA4 "Recent (last
 * 3)"; spec §6.2). AppShell records every vessel-scope visit and the vessel
 * switch records the vessel it opens; the vessel switcher lists them first.
 *
 * Stored per user under `storm-recent-vessels:<userId>` as vessel ids, newest
 * first, at most three. Storage may be unavailable (private mode, blocked):
 * every read and write is guarded, and the list is then simply empty. Ids are
 * filtered against the user's current reach on every read, so a vessel the
 * user lost access to never comes back through this list.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

export const RECENT_VESSELS_MAX = 3;
export const RECENT_VESSELS_KEY_PREFIX = 'storm-recent-vessels:';
const CHANGE_EVENT = 'storm-recent-vessels-change';

export const recentVesselsKey = (userId: string): string => `${RECENT_VESSELS_KEY_PREFIX}${userId}`;

function readRaw(userId: string): string | null {
  try {
    return window.localStorage.getItem(recentVesselsKey(userId));
  } catch {
    return null;
  }
}

/** Parse a stored list; anything malformed reads as empty. */
export function parseRecentVessels(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const ids = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(ids)).slice(0, RECENT_VESSELS_MAX);
  } catch {
    return [];
  }
}

/** The stored ids for a user, newest first (not filtered to reach). */
export function readRecentVessels(userId: string): string[] {
  return parseRecentVessels(readRaw(userId));
}

/** Put `vesselId` at the front of the user's list. A no-op when it is already first. */
export function recordRecentVessel(userId: string | null | undefined, vesselId: string | null | undefined): void {
  if (!userId || !vesselId) return;
  const current = readRecentVessels(userId);
  if (current[0] === vesselId) return;
  const next = [vesselId, ...current.filter((id) => id !== vesselId)].slice(0, RECENT_VESSELS_MAX);
  try {
    window.localStorage.setItem(recentVesselsKey(userId), JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(RECENT_VESSELS_KEY_PREFIX)) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The signed-in user's recent vessel ids that are still in reach, newest first. */
export function useRecentVessels(): string[] {
  const { user } = useAuth();
  const { vessels } = useVessel();
  const userId = user?.id ?? null;
  const getSnapshot = useCallback(() => (userId ? readRaw(userId) : null), [userId]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return useMemo(() => {
    const reachable = new Set(vessels.map((v) => v.id));
    return parseRecentVessels(raw).filter((id) => reachable.has(id));
  }, [raw, vessels]);
}
