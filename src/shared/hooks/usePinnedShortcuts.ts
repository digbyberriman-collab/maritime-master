import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

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
  { target: '/alerts', label: 'Alerts', icon: 'bell' },
  { target: '/incidents', label: 'Incidents', icon: 'alert-triangle' },
  { target: '/incidents?new=true', label: 'Report Incident', icon: 'alert-triangle' },
  { target: '/fleet-map', label: 'Fleet Map', icon: 'map' },
  { target: '/vessels/list', label: 'Vessels', icon: 'ship' },
  { target: '/vessels/list?new=true', label: 'Add Vessel', icon: 'ship' },
  { target: '/ism/forms/templates', label: 'Forms', icon: 'file-text' },
  { target: '/ism/audits', label: 'Audits', icon: 'check-square' },
  { target: '/ism/drills', label: 'Drills', icon: 'target' },
  { target: '/risk-assessments', label: 'Risk Assessments', icon: 'shield' },
];

/** Default shortcuts for new users (no pins yet) */
const DEFAULT_TARGETS = ['/dashboard', '/crew', '/certificates', '/compliance', '/maintenance'];

export function usePinnedShortcuts() {
  const { user } = useAuth();
  const [pins, setPins] = useState<PinnedShortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<AvailableShortcut[]>([]);

  // Load pins from DB
  const fetchPins = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('user_pinned_shortcuts')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });

    if (!error && data) {
      setPins(data);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchPins();
  }, [fetchPins]);

  // Build suggestions from session activity that aren't already pinned
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('storm_activity_log');
      const log: Record<string, { label: string; icon: string; count: number }> = raw ? JSON.parse(raw) : {};
      const pinnedTargets = new Set(pins.map(p => p.shortcut_target));

      const suggested = Object.entries(log)
        .filter(([target]) => !pinnedTargets.has(target))
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 4)
        .map(([target, data]) => ({ target, label: data.label, icon: data.icon }));

      setSuggestions(suggested);
    } catch {
      setSuggestions([]);
    }
  }, [pins]);

  // Get effective shortcuts (pins or defaults if no pins yet)
  const effectiveShortcuts: AvailableShortcut[] = pins.length > 0
    ? pins.map(p => ({ target: p.shortcut_target, label: p.shortcut_label, icon: p.shortcut_icon }))
    : ALL_AVAILABLE_SHORTCUTS.filter(s => DEFAULT_TARGETS.includes(s.target));

  const addPin = useCallback(async (shortcut: AvailableShortcut) => {
    if (!user?.id) return;
    const maxOrder = pins.length > 0 ? Math.max(...pins.map(p => p.sort_order)) + 1 : 0;
    const { error } = await supabase.from('user_pinned_shortcuts').insert({
      user_id: user.id,
      shortcut_target: shortcut.target,
      shortcut_label: shortcut.label,
      shortcut_icon: shortcut.icon,
      sort_order: maxOrder,
    });
    if (!error) await fetchPins();
  }, [user?.id, pins, fetchPins]);

  const removePin = useCallback(async (target: string) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('user_pinned_shortcuts')
      .delete()
      .eq('user_id', user.id)
      .eq('shortcut_target', target);
    if (!error) await fetchPins();
  }, [user?.id, fetchPins]);

  const reorderPins = useCallback(async (orderedTargets: string[]) => {
    if (!user?.id) return;
    // Optimistic update
    const newPins = orderedTargets
      .map((target, idx) => {
        const existing = pins.find(p => p.shortcut_target === target);
        if (!existing) return null;
        return { ...existing, sort_order: idx };
      })
      .filter(Boolean) as PinnedShortcut[];
    setPins(newPins);

    // Persist each update
    await Promise.all(
      orderedTargets.map((target, idx) =>
        supabase
          .from('user_pinned_shortcuts')
          .update({ sort_order: idx })
          .eq('user_id', user.id)
          .eq('shortcut_target', target)
      )
    );
  }, [user?.id, pins]);

  const isPinned = useCallback((target: string) => {
    return pins.some(p => p.shortcut_target === target);
  }, [pins]);

  const clearAllPins = useCallback(async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('user_pinned_shortcuts')
      .delete()
      .eq('user_id', user.id);
    if (!error) await fetchPins();
  }, [user?.id, fetchPins]);

  return {
    pins,
    effectiveShortcuts,
    suggestions,
    loading,
    addPin,
    removePin,
    reorderPins,
    isPinned,
    hasPins: pins.length > 0,
    clearAllPins,
  };
}
