/**
 * The palette's Recent group (gap/10 IA12, BUILD-PLAN S5): the last items a
 * user picked, kept on this device only (`storm-palette-recent:<userId>`),
 * newest first. Only ids are stored; the palette shows a recent id only
 * while an item with that id is still offered to the user, so a page or
 * action that has since been withdrawn never comes back through Recent.
 *
 * Storage can be missing or blocked (private mode, previews): every read and
 * write is guarded and the palette works without it.
 */
import { useCallback, useState } from 'react';

export const PALETTE_RECENT_LIMIT = 6;
export const PALETTE_RECENT_PREFIX = 'storm-palette-recent:';

export const paletteRecentKey = (userId: string): string => `${PALETTE_RECENT_PREFIX}${userId}`;

const MAX_ID_LENGTH = 512;

function sanitise(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry || entry.length > MAX_ID_LENGTH || out.includes(entry)) continue;
    out.push(entry);
    if (out.length === PALETTE_RECENT_LIMIT) break;
  }
  return out;
}

/** The stored recent ids for `userId`, newest first; [] when signed out or unreadable. */
export function readPaletteRecent(userId: string | null | undefined): string[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(paletteRecentKey(userId));
    return raw ? sanitise(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** `id` moved to the front of `ids`, de-duplicated and capped (pure). */
export function withRecent(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter((existing) => existing !== id)].slice(0, PALETTE_RECENT_LIMIT);
}

/** Record a pick and return the new list. Nothing is stored without a user. */
export function recordPaletteRecent(userId: string | null | undefined, id: string): string[] {
  if (!userId || !id) return [];
  const next = withRecent(readPaletteRecent(userId), id);
  try {
    window.localStorage.setItem(paletteRecentKey(userId), JSON.stringify(next));
  } catch {
    // Storage blocked: the pick still happens, it just is not remembered.
  }
  return next;
}

/**
 * The ids still offered, in recent order (pure). `available` maps an id to
 * whatever the palette renders for it.
 */
export function availableRecent<T>(ids: readonly string[], available: ReadonlyMap<string, T>): T[] {
  const out: T[] = [];
  for (const id of ids) {
    const item = available.get(id);
    if (item !== undefined) out.push(item);
  }
  return out;
}

/** Read once per palette open; `record` writes through and updates the list. */
export function usePaletteRecent(userId: string | null | undefined): {
  ids: readonly string[];
  record: (id: string) => void;
} {
  const [state, setState] = useState(() => ({ userId, ids: readPaletteRecent(userId) }));
  // Another account signed in while the palette was mounted: read theirs.
  const current = state.userId === userId ? state : { userId, ids: readPaletteRecent(userId) };
  if (current !== state) setState(current);
  const record = useCallback(
    (id: string) => {
      const ids = recordPaletteRecent(userId, id);
      setState({ userId, ids });
    },
    [userId],
  );
  return { ids: current.ids, record };
}
