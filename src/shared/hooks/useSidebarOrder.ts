import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'storm:sidebar-order:v2';
const LEGACY_KEY = 'storm:sidebar-order:v1';
const ROOT = '__root';

export type OrderMap = Record<string, string[]>;

const read = (): OrderMap => {
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

const write = (map: OrderMap) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('storm:sidebar-order-changed'));
  } catch {
    // ignore
  }
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
    window.addEventListener('storm:sidebar-order-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storm:sidebar-order-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const setGroupOrder = useCallback((groupId: string, next: string[]) => {
    setMap((prev) => {
      const updated = { ...prev, [groupId]: next };
      write(updated);
      return updated;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }
    setMap({});
    window.dispatchEvent(new CustomEvent('storm:sidebar-order-changed'));
  }, []);

  const moveInGroup = useCallback(
    (groupId: string, id: string, direction: 'up' | 'down', allIds: string[]) => {
      const current = map[groupId] ?? [];
      const base = current.length ? [...current] : [...allIds];
      allIds.forEach((x) => {
        if (!base.includes(x)) base.push(x);
      });
      const idx = base.indexOf(id);
      if (idx === -1) return;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= base.length) return;
      [base[idx], base[target]] = [base[target], base[idx]];
      setGroupOrder(groupId, base);
    },
    [map, setGroupOrder]
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
    ROOT,
  };
}

export const SIDEBAR_ROOT = ROOT;
