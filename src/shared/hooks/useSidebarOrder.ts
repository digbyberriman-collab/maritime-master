import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'storm:sidebar-order:v1';

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const write = (order: string[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    window.dispatchEvent(new CustomEvent('storm:sidebar-order-changed'));
  } catch {
    // ignore
  }
};

/**
 * Sort a list of nav items by a saved user-defined order.
 * Unknown/new items keep their original relative position and appear after known ones.
 */
export function applySidebarOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items;
  const indexOf = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = indexOf.has(a.id) ? (indexOf.get(a.id) as number) : Number.POSITIVE_INFINITY;
    const bi = indexOf.has(b.id) ? (indexOf.get(b.id) as number) : Number.POSITIVE_INFINITY;
    if (ai === bi) return 0;
    return ai - bi;
  });
}

export function useSidebarOrder() {
  const [order, setOrderState] = useState<string[]>(() => read());

  useEffect(() => {
    const handler = () => setOrderState(read());
    window.addEventListener('storm:sidebar-order-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storm:sidebar-order-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const setOrder = useCallback((next: string[]) => {
    setOrderState(next);
    write(next);
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setOrderState([]);
    window.dispatchEvent(new CustomEvent('storm:sidebar-order-changed'));
  }, []);

  const move = useCallback(
    (id: string, direction: 'up' | 'down', allIds: string[]) => {
      const base = order.length ? [...order] : [...allIds];
      // Ensure every visible id is represented so movement is deterministic.
      allIds.forEach((x) => {
        if (!base.includes(x)) base.push(x);
      });
      const idx = base.indexOf(id);
      if (idx === -1) return;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= base.length) return;
      [base[idx], base[target]] = [base[target], base[idx]];
      setOrder(base);
    },
    [order, setOrder]
  );

  return { order, setOrder, move, reset };
}