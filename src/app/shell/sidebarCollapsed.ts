/**
 * The sidebar's icon-only state (gap/10 IA20; spec §4.5, critic row; the
 * D-19 pattern for layout preferences).
 *
 * - The device value (`storm-sidebar-collapsed`) wins once it is set.
 * - With nothing stored on this device, the signed-in user's
 *   `user_preferences.sidebar_collapsed` is adopted once (a new device starts
 *   the way the user left the last one), and kept on the device from then on.
 * - Every toggle writes the device value and mirrors it to
 *   `user_preferences.sidebar_collapsed`. The mirror is best effort: a layout
 *   preference, so a failed write is not worth a notice and never reverts
 *   the device choice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export const SIDEBAR_COLLAPSED_KEY = 'storm-sidebar-collapsed';

/** The device value, or null when none is stored (or storage is unavailable). */
export function readStoredSidebarCollapsed(): boolean | null {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredSidebarCollapsed(next: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
  } catch {
    /* storage unavailable: the choice lasts for this session */
  }
}

async function mirrorToProfile(userId: string, next: boolean): Promise<void> {
  try {
    await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, sidebar_collapsed: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch {
    /* best effort (see above) */
  }
}

export interface SidebarCollapsed {
  collapsed: boolean;
  toggle: () => void;
}

export function useSidebarCollapsed(): SidebarCollapsed {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredSidebarCollapsed() ?? false);

  // Nothing on this device yet: adopt the profile's value, once per user.
  const adoptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || adoptedFor.current === userId) return undefined;
    adoptedFor.current = userId;
    if (readStoredSidebarCollapsed() !== null) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('sidebar_collapsed')
          .eq('user_id', userId)
          .limit(1);
        if (cancelled || error) return;
        const stored = data?.[0]?.sidebar_collapsed;
        // A toggle while the read was in flight is the newer choice.
        if (typeof stored !== 'boolean' || readStoredSidebarCollapsed() !== null) return;
        writeStoredSidebarCollapsed(stored);
        setCollapsed(stored);
      } catch {
        /* no profile value: keep the default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // The latest value, so a toggle writes once (state updaters may run twice).
  const current = useRef(collapsed);
  current.current = collapsed;
  const toggle = useCallback(() => {
    const next = !current.current;
    current.current = next;
    writeStoredSidebarCollapsed(next);
    setCollapsed(next);
    if (userId) void mirrorToProfile(userId, next);
  }, [userId]);

  return { collapsed, toggle };
}
