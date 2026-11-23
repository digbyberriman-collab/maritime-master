/**
 * The bell's badge and accessible name (gap/10 top bar element 8; D-91,
 * D-04), shared by the inbox and the alerts fallback: an exact count, a
 * floor (`n+`) when only a full list could be counted, or nothing when the
 * count is unknown. Pure.
 */
import type { UseQueryResult } from '@tanstack/react-query';
import { BELL_INBOX_LIMIT, type InboxCounts, type InboxList } from '../services/inbox';

export interface BellBadge {
  /** What the badge draws (`3`, `99+`, `20+`). */
  label: string;
  /** What the accessible name says (`3`, `121`, `20+`). */
  spoken: string;
  /** The number the badge stands for (0 hides it). */
  count: number;
  critical: boolean;
}

/** A badge for an exact count (`99+` drawn above 99). */
export function exactBadge(count: number, critical: boolean): BellBadge {
  return { count, label: count > 99 ? '99+' : String(count), spoken: String(count), critical };
}

/** A badge for a floor (`n+`), when only a full list could be counted (D-91). */
export function floorBadge(count: number, critical: boolean): BellBadge {
  const label = `${count > 99 ? 99 : count}+`;
  return { count, label, spoken: label, critical };
}

/**
 * The bell's accessible name: `Notifications`, then the count in the words
 * of what it counts (`3 unread notifications`, `1 unacknowledged alert`),
 * then `including critical`.
 */
export function bellLabel(badge: BellBadge | null, singular: string, plural: string): string {
  if (!badge || badge.count <= 0) return 'Notifications';
  const noun = badge.spoken === '1' ? singular : plural;
  return `Notifications, ${badge.spoken} ${noun}${badge.critical ? ', including critical' : ''}`;
}

/** The inbox badge from the counts; from the list's unread rows only when the counts failed (D-91). */
export function inboxBellBadge(counts: UseQueryResult<InboxCounts>, list: UseQueryResult<InboxList>): BellBadge | null {
  if (counts.data?.source === 'table') return exactBadge(counts.data.unread, counts.data.criticalUnread > 0);
  if (counts.isError && list.data?.source === 'table') {
    const unread = list.data.items.filter((item) => !item.read_at);
    const critical = unread.some((item) => item.severity === 'critical');
    // A list that is not full holds every unarchived item, so its unread count
    // is exact; a full one may hide more (a floor), and with no unread row in
    // it the count is unknown: no badge rather than an invented one (D-04).
    if (list.data.items.length >= BELL_INBOX_LIMIT) return unread.length ? floorBadge(unread.length, critical) : null;
    return exactBadge(unread.length, critical);
  }
  return null;
}
