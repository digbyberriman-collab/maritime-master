/**
 * Nav badge registry (gap/10 IA21; spec §4.4). A nav node names one of these
 * keys in `badgeKey`; the sidebar shows the count on the node (or on its
 * group when the node is hidden) and a vessel tab shows it as a small count.
 *
 * Each entry says how to read its count from `useSidebarBadgeCounts`, how to
 * name one item, where the badge leads and its tone (critical for overdue or
 * blocking work, primary for unread). An unknown key, a count of 0 or counts
 * that have not loaded render nothing: never a fake number.
 *
 * The registry is the extension point for the Support, Safety, Technical and
 * Documents badges once their counts exist (docs 03, 05, 06, 02).
 */
import { useCallback } from 'react';
import { useSidebarBadgeCounts, type SidebarBadgeCounts } from '@/shared/hooks/useSidebarBadgeCounts';

export type NavBadgeTone = 'critical' | 'primary';

export interface NavBadgeEntry {
  count: (counts: SidebarBadgeCounts | undefined) => number;
  singular: string;
  plural?: string;
  destination: string;
  tone: NavBadgeTone;
}

export const NAV_BADGES: Readonly<Record<string, NavBadgeEntry>> = Object.freeze({
  pendingCompliance: {
    count: (c) => c?.pendingCompliance ?? 0,
    singular: 'pending compliance item',
    destination: '/notifications/center?tab=compliance',
    tone: 'critical',
  },
  unreadMessages: {
    count: (c) => c?.unreadMessages ?? 0,
    singular: 'unread message',
    destination: '/notifications/center?tab=messages',
    tone: 'primary',
  },
  overdueTasks: {
    count: (c) => c?.overdueTasks ?? 0,
    singular: 'overdue operational task',
    destination: '/notifications/center?tab=tasks',
    tone: 'critical',
  },
});

export interface NavBadge {
  count: number;
  /** "4 unread messages". */
  label: string;
  /** "99+" above 99. */
  text: string;
  destination: string;
  tone: NavBadgeTone;
}

/** The badge for a key and the loaded counts, or null (unknown key, nothing waiting, not loaded). */
export function navBadgeFor(key: string | undefined, counts: SidebarBadgeCounts | undefined): NavBadge | null {
  if (!key || !counts) return null;
  const entry = Object.prototype.hasOwnProperty.call(NAV_BADGES, key) ? NAV_BADGES[key] : undefined;
  if (!entry) return null;
  const count = entry.count(counts);
  if (!Number.isFinite(count) || count <= 0) return null;
  const noun = count === 1 ? entry.singular : entry.plural ?? `${entry.singular}s`;
  return {
    count,
    label: `${count} ${noun}`,
    text: count > 99 ? '99+' : String(count),
    destination: entry.destination,
    tone: entry.tone,
  };
}

/** `badgeFor(key)` over the live counts. */
export function useNavBadges(): (key: string | undefined) => NavBadge | null {
  const { data } = useSidebarBadgeCounts();
  return useCallback((key: string | undefined) => navBadgeFor(key, data), [data]);
}
