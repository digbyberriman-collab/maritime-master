import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { TemplateSection } from '../lib/templates';
import type { SampleRow } from '../lib/types';

/** An editable row: either a copy of a saved draft or a new unsaved line. */
export interface LineBuffer {
  id: string;
  existingId: string | null;
  bookId: string;
  volumeId: string;
  sectionId: string;
  schema: TemplateSection;
  version: number;
  fields: Record<string, string>;
  /** datetime-local value (UTC, minute precision) */
  occurredAt: string;
  /** ISO timestamp the row was opened with; retained when the minute is unchanged */
  originalTime: string;
  notes: string;
  sample: SampleRow | null;
  overrideReason: string;
  correctsId: string | null;
  correctionReason: string;
  dirty: boolean;
}

type Store = Record<string, LineBuffer>;
const cache = new Map<string, Store>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const key = (userId: string) => `logbooks:lines:${userId}`;

const load = (userId: string): Store => {
  if (!cache.has(userId)) {
    let saved: Store = {};
    try { saved = JSON.parse(sessionStorage.getItem(key(userId)) || '{}'); } catch { saved = {}; }
    cache.set(userId, saved && typeof saved === 'object' ? saved : {});
  }
  return cache.get(userId)!;
};

let persistError: ((message: string) => void) | null = null;
const persist = (userId: string, store: Store) => {
  cache.set(userId, store);
  try { sessionStorage.setItem(key(userId), JSON.stringify(store)); }
  catch { persistError?.('This tab cannot keep a recovery copy. Save the row before leaving it.'); }
  notify();
};

/**
 * Unsaved row copies are kept per user in session storage so they survive
 * section changes and reloads in the same tab. This is a recovery aid, not a
 * disconnected synchronisation queue: only saved drafts reach the service.
 */
export function useWorkingCopies(userId: string | null, onPersistError?: (message: string) => void) {
  persistError = onPersistError ?? null;
  const uid = userId ?? 'anon';
  const store = useSyncExternalStore(subscribe, () => load(uid));

  const put = useCallback((buffer: LineBuffer) => {
    persist(uid, { ...load(uid), [buffer.id]: buffer });
  }, [uid]);

  const update = useCallback((id: string, patch: (buffer: LineBuffer) => LineBuffer) => {
    const current = load(uid)[id];
    if (!current) return;
    persist(uid, { ...load(uid), [id]: patch(current) });
  }, [uid]);

  const remove = useCallback((id: string) => {
    const next = { ...load(uid) };
    delete next[id];
    persist(uid, next);
  }, [uid]);

  const rekey = useCallback((from: string, buffer: LineBuffer) => {
    const next = { ...load(uid) };
    delete next[from];
    next[buffer.id] = buffer;
    persist(uid, next);
  }, [uid]);

  const list = useMemo(() => Object.values(store), [store]);
  return { store, list, put, update, remove, rekey };
}
