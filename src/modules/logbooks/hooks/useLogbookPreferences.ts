import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* private mode or blocked storage */ }
  notify();
};

/** Per-user browser preferences: automatic readings on open, expanded workspace, last book. */
export function useLogbookPreferences(userId: string | null) {
  const autoKey = `logbooks:auto-readings:${userId ?? 'anon'}`;
  const expandKey = 'logbooks:expand-workspace';
  const autoReadings = useSyncExternalStore(subscribe, () => read(autoKey) !== 'false');
  const expanded = useSyncExternalStore(subscribe, () => read(expandKey) === 'true');
  const setAutoReadings = useCallback((value: boolean) => write(autoKey, String(value)), [autoKey]);
  const setExpanded = useCallback((value: boolean) => write(expandKey, String(value)), []);
  return { autoReadings, setAutoReadings, expanded, setExpanded };
}
