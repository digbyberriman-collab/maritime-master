/**
 * The signed-in user's favourites (`user_pinned_shortcuts`, live table;
 * gap/10 IA13). Read through React Query (`['pinned-shortcuts', userId]`) so
 * the top-bar star, its menu and /me/shortcuts share one cache and agree.
 * Real pins only: no default set, no suggestions.
 *
 * Writes never fake success: a failed insert or delete shows a notice and
 * the list is re-read. `togglePin` resolves to whether the write went
 * through, and `toggling` is true while it runs, so the star can wait
 * instead of letting a second click create a duplicate.
 *
 * Only in-app paths are pinned (`isInAppPath`): a target such as
 * `javascript:…`, `https://…` or `//host` is refused without a write.
 */
import { useCallback, useMemo } from 'react';
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

/**
 * True for a path inside this app (`/fleet/dashboard`): one leading slash,
 * not followed by another slash or a backslash. Rejects `javascript:`,
 * `data:`, `http(s):` and protocol-relative `//host` or `/\host` targets.
 */
export const isInAppPath = (target: string): boolean => /^\/(?![/\\])/.test(target);

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

  const insertPin = useCallback(
    async (shortcut: AvailableShortcut): Promise<boolean> => {
      if (!userId || !isInAppPath(shortcut.target)) return false;
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

  const isPinned = useCallback((target: string) => pins.some((p) => p.shortcut_target === target), [pins]);

  return {
    pins,
    status,
    error: query.error,
    retry: refresh,
    loading: status === 'loading',
    addPin,
    removePin,
    togglePin,
    toggling: toggle.isPending,
    isPinned,
  };
}
