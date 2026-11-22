/**
 * The signed-in user's favourites (`user_pinned_shortcuts`, live table;
 * gap/10 IA13). Read through React Query (`['pinned-shortcuts', userId]`) so
 * the top-bar star, its menu and /me/shortcuts share one cache and agree.
 *
 * Writes never fake success: a failed insert, delete or reorder shows a
 * notice and the list is re-read (a reorder's optimistic order is rolled
 * back). `togglePin` resolves to whether the write went through, and
 * `toggling` is true while it runs, so the star can wait instead of letting
 * a second click create a duplicate.
 *
 * `effectiveShortcuts` (pins, or a default set when there are none) and
 * `suggestions` (session activity) remain for older callers; the top bar
 * shows real pins only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { notify } from '@/shared/lib/notify';

export interface PinnedShortcut {
  id: string;
  shortcut_target: string;
  shortcut_label: string;
  shortcut_icon: string;
  sort_order: number;
}

export interface AvailableShortcut {
  target: string;
  label: string;
  icon: string;
}

/** All pages that can be pinned as shortcuts */
export const ALL_AVAILABLE_SHORTCUTS: AvailableShortcut[] = [
  { target: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { target: '/crew', label: 'Crew List', icon: 'users' },
  { target: '/crew?new=true', label: 'Add Crew Member', icon: 'users' },
  { target: '/certificates', label: 'Certificates', icon: 'award' },
  { target: '/crew/flights', label: 'Flights', icon: 'plane' },
  { target: '/compliance', label: 'Compliance', icon: 'shield' },
  { target: '/maintenance', label: 'Maintenance', icon: 'wrench' },
  { target: '/documents', label: 'Documents', icon: 'file-text' },
  { target: '/itinerary', label: 'Itinerary', icon: 'compass' },
  { target: '/notifications/center', label: 'Alerts', icon: 'bell' },
  { target: '/incidents', label: 'Incidents', icon: 'alert-triangle' },
  { target: '/incidents?new=true', label: 'Report Incident', icon: 'alert-triangle' },
  { target: '/fleet-map', label: 'Fleet Map', icon: 'map' },
  { target: '/vessels/list', label: 'Vessels', icon: 'ship' },
  { target: '/vessels/list?new=true', label: 'Add Vessel', icon: 'ship' },
  { target: '/ism/forms/templates', label: 'Forms', icon: 'file-text' },
  { target: '/ism/audits-surveys', label: 'Audits', icon: 'check-square' },
  { target: '/ism/drills', label: 'Drills', icon: 'target' },
  { target: '/risk-assessments', label: 'Risk Assessments', icon: 'shield' },
];

/** Default shortcuts for new users (no pins yet); legacy callers only. */
const DEFAULT_TARGETS = ['/dashboard', '/crew', '/certificates', '/compliance', '/maintenance'];

export const pinnedShortcutsKeys = {
  all: ['pinned-shortcuts'] as const,
  user: (userId: string | null) => ['pinned-shortcuts', userId] as const,
};

const NO_PINS: PinnedShortcut[] = [];

export type PinnedShortcutsStatus = 'loading' | 'error' | 'ready';

async function fetchPins(userId: string): Promise<PinnedShortcut[]> {
  const { data, error } = await supabase
    .from('user_pinned_shortcuts')
    .select('id, shortcut_target, shortcut_label, shortcut_icon, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function usePinnedShortcuts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const key = useMemo(() => pinnedShortcutsKeys.user(userId), [userId]);

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: () => fetchPins(userId as string),
  });
  const pins = query.data ?? NO_PINS;
  const status: PinnedShortcutsStatus = query.isError ? 'error' : query.data ? 'ready' : 'loading';

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: key }), [queryClient, key]);

  // Suggestions from this session's activity that are not pinned yet.
  const [suggestions, setSuggestions] = useState<AvailableShortcut[]>([]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('storm_activity_log');
      const log: Record<string, { label: string; icon: string; count: number }> = raw ? JSON.parse(raw) : {};
      const pinnedTargets = new Set(pins.map((p) => p.shortcut_target));
      setSuggestions(
        Object.entries(log)
          .filter(([target]) => !pinnedTargets.has(target))
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 4)
          .map(([target, data]) => ({ target, label: data.label, icon: data.icon })),
      );
    } catch {
      setSuggestions([]);
    }
  }, [pins]);

  const effectiveShortcuts: AvailableShortcut[] = useMemo(
    () =>
      pins.length > 0
        ? pins.map((p) => ({ target: p.shortcut_target, label: p.shortcut_label, icon: p.shortcut_icon }))
        : ALL_AVAILABLE_SHORTCUTS.filter((s) => DEFAULT_TARGETS.includes(s.target)),
    [pins],
  );

  const insertPin = useCallback(
    async (shortcut: AvailableShortcut): Promise<boolean> => {
      if (!userId) return false;
      const current = queryClient.getQueryData<PinnedShortcut[]>(key) ?? pins;
      if (current.some((p) => p.shortcut_target === shortcut.target)) return true;
      const maxOrder = current.length > 0 ? Math.max(...current.map((p) => p.sort_order)) + 1 : 0;
      const { error } = await supabase.from('user_pinned_shortcuts').insert({
        user_id: userId,
        shortcut_target: shortcut.target,
        shortcut_label: shortcut.label,
        shortcut_icon: shortcut.icon,
        sort_order: maxOrder,
      });
      await refresh();
      if (error) {
        notify.error(error, { title: 'Could not add the favourite' });
        return false;
      }
      return true;
    },
    [userId, queryClient, key, pins, refresh],
  );

  const deletePin = useCallback(
    async (target: string): Promise<boolean> => {
      if (!userId) return false;
      const { error } = await supabase.from('user_pinned_shortcuts').delete().eq('user_id', userId).eq('shortcut_target', target);
      await refresh();
      if (error) {
        notify.error(error, { title: 'Could not remove the favourite' });
        return false;
      }
      return true;
    },
    [userId, refresh],
  );

  const toggle = useMutation({
    mutationFn: async (shortcut: AvailableShortcut): Promise<boolean> => {
      const current = queryClient.getQueryData<PinnedShortcut[]>(key) ?? pins;
      return current.some((p) => p.shortcut_target === shortcut.target) ? deletePin(shortcut.target) : insertPin(shortcut);
    },
  });

  const addPin = useCallback(async (shortcut: AvailableShortcut) => {
    await insertPin(shortcut);
  }, [insertPin]);

  const removePin = useCallback(async (target: string) => {
    await deletePin(target);
  }, [deletePin]);

  /** Pin or unpin a page; resolves to whether the change was saved. */
  const togglePin = useCallback((shortcut: AvailableShortcut) => toggle.mutateAsync(shortcut), [toggle]);

  const reorderPins = useCallback(
    async (orderedTargets: string[]) => {
      if (!userId) return;
      const previous = queryClient.getQueryData<PinnedShortcut[]>(key) ?? pins;
      const next = orderedTargets
        .map((target, idx) => {
          const existing = previous.find((p) => p.shortcut_target === target);
          return existing ? { ...existing, sort_order: idx } : null;
        })
        .filter((p): p is PinnedShortcut => p !== null);
      queryClient.setQueryData(key, next);
      const results = await Promise.all(
        orderedTargets.map((target, idx) =>
          supabase.from('user_pinned_shortcuts').update({ sort_order: idx }).eq('user_id', userId).eq('shortcut_target', target),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        queryClient.setQueryData(key, previous);
        notify.error(failed.error, { title: 'Could not save the new order' });
        await refresh();
      }
    },
    [userId, queryClient, key, pins, refresh],
  );

  const isPinned = useCallback((target: string) => pins.some((p) => p.shortcut_target === target), [pins]);

  const clearAllPins = useCallback(async () => {
    if (!userId) return;
    const { error } = await supabase.from('user_pinned_shortcuts').delete().eq('user_id', userId);
    await refresh();
    if (error) notify.error(error, { title: 'Could not clear your favourites' });
  }, [userId, refresh]);

  return {
    pins,
    status,
    error: query.error,
    retry: refresh,
    effectiveShortcuts,
    suggestions,
    loading: status === 'loading',
    addPin,
    removePin,
    togglePin,
    toggling: toggle.isPending,
    reorderPins,
    isPinned,
    hasPins: pins.length > 0,
    clearAllPins,
  };
}
