/**
 * Pure helpers behind `WhoseMoveChip` and `ExpiryPill` (kept out of the
 * component files so fast refresh stays component-only). Nothing here throws.
 */
import { format } from 'date-fns';
import { daysBetween, localCalendarDate, toCalendarDate, type DateInput } from '@/lib/records/dates';
import { EXPIRY_BUCKETS, expiryBucketForDays, expiryStatus, type ExpiryBucket } from '@/lib/records/expiry';

// ─── Whose move ───────────────────────────────────────────────────────────

/**
 * Whole LOCAL calendar days waiting (gap/08 TH3), or null when either date is
 * missing or not a date. `since` is usually a `timestamptz` (`moved_at`); it
 * and `now` are both read as the viewer's local day, so a move 30 minutes ago
 * is "today" in every time zone. Never throws.
 */
export function waitingDays(since: DateInput | null | undefined, now: DateInput = new Date()): number | null {
  if (since === null || since === undefined || since === '') return null;
  try {
    return Math.max(0, daysBetween(localCalendarDate(since), localCalendarDate(now)));
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

/**
 * Bucket and days for the pill. Never throws: bad input resolves to `bucket: null`.
 *
 * The server's `bucket` (and `daysRemaining`, when it sends one) is the
 * authority. The server counts from its own `current_date`, the browser from
 * the local day, so near midnight the two can differ by a day. To keep the
 * tier and the detail text from contradicting each other:
 *
 * - server days win over the locally counted days;
 * - server days without a server bucket give the bucket too;
 * - a server bucket without server days keeps the local count only when the
 *   local bucket agrees; otherwise the days are dropped (`null`) and the pill
 *   shows the tier alone ("Valid" still shows "to dd MMM yyyy").
 *
 * Callers that know the server's date pass it as `today`.
 */
export function resolveExpiry({
  bucket,
  daysRemaining,
  expiresOn,
  windowDays,
  noExpiry,
  today,
}: {
  bucket?: ExpiryBucket | null;
  daysRemaining?: number | null;
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

  const serverBucket = isExpiryBucket(bucket) ? bucket : null;
  const serverDays = typeof daysRemaining === 'number' && Number.isInteger(daysRemaining) ? daysRemaining : null;

  if (serverBucket) {
    if (serverBucket === 'no_expiry') return { bucket: serverBucket, daysRemaining: null, expiresOn: date };
    if (serverDays !== null) return { bucket: serverBucket, daysRemaining: serverDays, expiresOn: date };
    const localDays = computed !== null && computed.bucket === serverBucket ? computed.daysRemaining : null;
    return { bucket: serverBucket, daysRemaining: localDays, expiresOn: date };
  }

  if (serverDays !== null && computed !== null && computed.bucket !== 'no_expiry') {
    try {
      return { bucket: expiryBucketForDays(serverDays, windowDays), daysRemaining: serverDays, expiresOn: date };
    } catch {
      return { bucket: null, daysRemaining: null, expiresOn: date };
    }
  }

  return { bucket: computed?.bucket ?? null, daysRemaining: computed?.daysRemaining ?? null, expiresOn: date };
}

/** "52d overdue", "today", "in 18d", "to 03 Mar 2027"; null when there is nothing to add. */
export function expiryDetail({ bucket, daysRemaining, expiresOn }: ResolvedExpiry): string | null {
  if (bucket === null || bucket === 'no_expiry') return null;
  // "Valid" shows the date, which does not depend on whose "today" counted the days.
  if (bucket === 'valid') {
    if (!expiresOn) return null;
    const [y, m, d] = expiresOn.split('-').map(Number);
    return `to ${format(new Date(y, m - 1, d), 'dd MMM yyyy')}`;
  }
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d overdue`;
  return daysRemaining === 0 ? 'today' : `in ${daysRemaining}d`;
}
