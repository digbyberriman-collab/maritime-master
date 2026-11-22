/**
 * Pure helpers behind `WhoseMoveChip` and `ExpiryPill` (kept out of the
 * component files so fast refresh stays component-only). Nothing here throws.
 */
import { format } from 'date-fns';
import { daysBetween, toCalendarDate, type DateInput } from '@/lib/records/dates';
import { EXPIRY_BUCKETS, expiryStatus, type ExpiryBucket } from '@/lib/records/expiry';

// ─── Whose move ───────────────────────────────────────────────────────────

/** Whole days waiting, or null when either date is missing or not a date. Never throws. */
export function waitingDays(since: DateInput | null | undefined, now: DateInput = new Date()): number | null {
  if (since === null || since === undefined || since === '') return null;
  try {
    return Math.max(0, daysBetween(toCalendarDate(since), toCalendarDate(now)));
  } catch {
    return null;
  }
}

/** `0` → "today", `1` → "1 day", `12` → "12 days". */
export function formatWaiting(days: number): string {
  if (days <= 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

// ─── Expiry ───────────────────────────────────────────────────────────────

export const isExpiryBucket = (value: unknown): value is ExpiryBucket =>
  typeof value === 'string' && (EXPIRY_BUCKETS as readonly string[]).includes(value);

export interface ResolvedExpiry {
  bucket: ExpiryBucket | null;
  daysRemaining: number | null;
  expiresOn: string | null;
}

/** Bucket and days for the pill. Never throws: bad input resolves to `bucket: null`. */
export function resolveExpiry({
  bucket,
  expiresOn,
  windowDays,
  noExpiry,
  today,
}: {
  bucket?: ExpiryBucket | null;
  expiresOn?: DateInput | null;
  windowDays?: number | null;
  noExpiry?: boolean;
  today?: DateInput;
}): ResolvedExpiry {
  let computed: ReturnType<typeof expiryStatus> | null = null;
  let date: string | null = null;
  if (noExpiry || (expiresOn !== undefined && expiresOn !== null && expiresOn !== '')) {
    try {
      computed = expiryStatus({ expiresOn, windowDays, today: today ?? new Date(), noExpiry });
      date = noExpiry || !expiresOn ? null : toCalendarDate(expiresOn);
    } catch {
      computed = null;
    }
  } else if (expiresOn === null || expiresOn === '') {
    computed = { bucket: 'no_expiry', daysRemaining: null, label: '', windowDays: 0 };
  }
  // A bucket from the server is the authority; the date still gives the days.
  const resolved = isExpiryBucket(bucket) ? bucket : (computed?.bucket ?? null);
  return { bucket: resolved, daysRemaining: computed?.daysRemaining ?? null, expiresOn: date };
}

/** "52d overdue", "today", "in 18d", "to 03 Mar 2027"; null when there is nothing to add. */
export function expiryDetail({ bucket, daysRemaining, expiresOn }: ResolvedExpiry): string | null {
  if (bucket === null || bucket === 'no_expiry' || daysRemaining === null) return null;
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d overdue`;
  if (bucket === 'valid') {
    if (!expiresOn) return null;
    const [y, m, d] = expiresOn.split('-').map(Number);
    return `to ${format(new Date(y, m - 1, d), 'dd MMM yyyy')}`;
  }
  return daysRemaining === 0 ? 'today' : `in ${daysRemaining}d`;
}
