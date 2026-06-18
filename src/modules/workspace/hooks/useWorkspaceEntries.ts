import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import type { WorkspaceItem, WorkspaceItemPriority, WorkspaceItemStatus, WorkspaceItemType } from '../types';

function storageKey(companyId: string | null, vesselId: string | null, pagePath: string): string {
  return `storm-workspace:${companyId ?? 'global'}:${vesselId ?? 'fleet'}:${pagePath}`;
}

function loadItems(key: string): WorkspaceItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveItems(key: string, items: WorkspaceItem[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

export function useWorkspaceEntries(pagePath: string) {
  const { profile } = useAuth();
  const { selectedVessel } = useVessel();
  const key = useMemo(
    () => storageKey(profile?.company_id ?? null, selectedVessel?.id ?? null, pagePath),
    [profile?.company_id, selectedVessel?.id, pagePath],
  );

  const [items, setItems] = useState<WorkspaceItem[]>(() => loadItems(key));

  useEffect(() => {
    setItems(loadItems(key));
  }, [key]);

  const persist = useCallback(
    (next: WorkspaceItem[]) => {
      setItems(next);
      saveItems(key, next);
    },
    [key],
  );

  const addItem = useCallback(
    (input: {
      type: WorkspaceItemType;
      title: string;
      description?: string;
      priority?: WorkspaceItemPriority;
      status?: WorkspaceItemStatus;
      assignee?: string;
      dueDate?: string;
      tags?: string[];
    }) => {
      const now = new Date().toISOString();
      const item: WorkspaceItem = {
        id: crypto.randomUUID(),
        type: input.type,
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        status: input.status ?? 'open',
        priority: input.priority ?? 'medium',
        assignee: input.assignee,
        dueDate: input.dueDate,
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
      };
      persist([item, ...items]);
      return item;
    },
    [items, persist],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<Omit<WorkspaceItem, 'id' | 'createdAt'>>) => {
      persist(
        items.map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
        ),
      );
    },
    [items, persist],
  );

  const deleteItem = useCallback(
    (id: string) => {
      persist(items.filter((item) => item.id !== id));
    },
    [items, persist],
  );

  const stats = useMemo(
    () => ({
      total: items.length,
      open: items.filter((i) => i.status === 'open' || i.status === 'in_progress').length,
      completed: items.filter((i) => i.status === 'completed').length,
      high: items.filter((i) => i.priority === 'high').length,
    }),
    [items],
  );

  return { items, addItem, updateItem, deleteItem, stats, vesselName: selectedVessel?.name };
}
