/**
 * The user's saved sidebar order, on this device: one map of group id → ids
 * in order (`storm:sidebar-order:v2`). The shell's nav hooks read it
 * (`useVisibleNav`, `usePersonalNav`, `useVesselNav`, `useVesselSwitch`,
 * `useFilteredTree`), each by the id of the tree or group it draws; the
 * Sidebar layout page (/me/sidebar-layout) writes it.
 *
 * Writes (D-112): localStorage is the source of truth. Every write reads the
 * stored map, applies the change, stores it, tells the other consumers
 * (`storm:sidebar-order-changed`) and then sets this hook's state, all from
 * the caller's event handler, never inside a React state updater: an
 * updater runs during render, and the event sets the state of other
 * components (the top bar's scope control, the sidebar), which React forbids
 * then. Reading the stored map each time also means two moves in one
 * handler compose instead of the second working on stale data. Where storage
 * is unavailable the map is kept in memory for this page load.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'storm:sidebar-order:v2';
const LEGACY_KEY = 'storm:sidebar-order:v1';
const CHANGED_EVENT = 'storm:sidebar-order-changed';
const ROOT = '__root';

export type OrderMap = Record<string, string[]>;

/** The map of the last write that could not be stored (storage blocked or full); null once one is stored. */
let unsaved: OrderMap | null = null;

const read = (): OrderMap => {
  if (unsaved) return { ...unsaved };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: OrderMap = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string');
        }
        return out;
      }
    }
    // Legacy: old flat array stored root order only.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) return { [ROOT]: parsed.filter((x) => typeof x === 'string') };
    }
  } catch {
    // ignore
  }
  return {};
};

const notify = () => {
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  } catch {
    // ignore
  }
};

/** Store the map and tell every consumer. Call from an event handler or effect, never inside a state updater. */
const write = (map: OrderMap) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    unsaved = null;
  } catch {
    unsaved = { ...map };
  }
  notify();
};

/**
 * Sort a list of items by a saved order. Unknown items keep relative position at end.
 */
export function applySidebarOrder<T extends { id: string }>(items: T[], order: string[] | undefined): T[] {
  if (!order || !order.length) return items;
  const indexOf = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = indexOf.has(a.id) ? (indexOf.get(a.id) as number) : Number.POSITIVE_INFINITY;
    const bi = indexOf.has(b.id) ? (indexOf.get(b.id) as number) : Number.POSITIVE_INFINITY;
    if (ai === bi) return 0;
    return ai - bi;
  });
}

export function useSidebarOrder() {
  const [map, setMap] = useState<OrderMap>(() => read());

  useEffect(() => {
    const handler = () => setMap(read());
    window.addEventListener(CHANGED_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(CHANGED_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const setGroupOrder = useCallback((groupId: string, next: string[]) => {
    const updated = { ...read(), [groupId]: next };
    write(updated);
    setMap(updated);
  }, []);

  /**
   * Reorder within a group: `updater` gets the group's current order (the
   * stored one, else `allIds`, with any id of `allIds` it lacks appended) and
   * returns the new one, or null for no change.
   */
  const reorderGroup = useCallback(
    (groupId: string, allIds: string[], updater: (currentOrder: string[]) => string[] | null) => {
      const prev = read();
      const saved = prev[groupId] ?? [];
      const base = saved.length ? [...saved] : [...allIds];
      // Append any newly-visible ids (e.g. permissions changed) at the end so
      // they participate in reordering instead of silently disappearing.
      allIds.forEach((x) => {
        if (!base.includes(x)) base.push(x);
      });
      const next = updater(base);
      if (!next) return;
      const updated = { ...prev, [groupId]: next };
      write(updated);
      setMap(updated);
    },
    []
  );

  /** Drop groups nothing reads any more (stale keys). A no-op, with no event, when none is stored. */
  const removeGroups = useCallback((ids: string[]) => {
    const prev = read();
    if (!ids.some((id) => Object.prototype.hasOwnProperty.call(prev, id))) return;
    const updated = { ...prev };
    for (const id of ids) delete updated[id];
    write(updated);
    setMap(updated);
  }, []);

  const reset = useCallback(() => {
    unsaved = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }
    setMap({});
    notify();
  }, []);

  const moveInGroup = useCallback(
    (groupId: string, id: string, direction: 'up' | 'down', allIds: string[]) => {
      reorderGroup(groupId, allIds, (base) => {
        const idx = base.indexOf(id);
        if (idx === -1) return null;
        const target = direction === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= base.length) return null;
        const next = [...base];
        [next[idx], next[target]] = [next[target], next[idx]];
        return next;
      });
    },
    [reorderGroup]
  );

  // Back-compat: `order` is the root-level order array.
  const order = map[ROOT] ?? [];
  const setOrder = useCallback((next: string[]) => setGroupOrder(ROOT, next), [setGroupOrder]);
  const move = useCallback(
    (id: string, direction: 'up' | 'down', allIds: string[]) =>
      moveInGroup(ROOT, id, direction, allIds),
    [moveInGroup]
  );

  const getGroupOrder = useCallback((groupId: string) => map[groupId] ?? [], [map]);

  return {
    map,
    order,
    setOrder,
    move,
    reset,
    getGroupOrder,
    setGroupOrder,
    moveInGroup,
    reorderGroup,
    removeGroups,
    ROOT,
  };
}

export const SIDEBAR_ROOT = ROOT;
