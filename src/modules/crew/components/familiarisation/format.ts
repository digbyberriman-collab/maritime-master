import { format } from 'date-fns';
import { daysUntil } from '@/modules/crew/lib/familiarisation';

/** A date-only string ("2026-11-27") as "27 Nov 2026", read as a calendar day (no time zone shift). */
export function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return y && m && d ? format(new Date(y, m - 1, d), 'd MMM yyyy') : null;
}

/** A timestamp as "27 Nov 2026, 14:05" in the viewer's time. */
export function formatStamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : format(at, 'd MMM yyyy, HH:mm');
}

/** "Due 4 Dec 2026 (in 7 days)", "Due today", "Overdue by 3 days"; null when there is no due date. */
export function dueText(due: string | null, today: string | null, status: string): string | null {
  const shown = formatDateOnly(due);
  if (!due || !shown) return null;
  if (status === 'completed') return `Was due ${shown}`;
  if (!today) return `Due ${shown}`;
  const days = daysUntil(due, today);
  if (days < 0) return `Overdue by ${-days} ${days === -1 ? 'day' : 'days'} (due ${shown})`;
  if (days === 0) return `Due today (${shown})`;
  return `Due ${shown} (in ${days} ${days === 1 ? 'day' : 'days'})`;
}

/** Today as a date-only string in the viewer's calendar (used when the server sent no `today`). */
export function localToday(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}
