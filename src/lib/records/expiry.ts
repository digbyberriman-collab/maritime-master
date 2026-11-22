/**
 * Expiry buckets (exec engine 1; gap/08 EXP1 as amended by DECISIONS C5).
 *
 * Buckets are window-relative, not fixed 90/30-day tiers:
 *
 *   expired        the expiry date has passed
 *   expiring_soon  30 days or fewer to go (never earlier than the type's window)
 *   expiring       inside the item type's warning window
 *   valid          outside the window
 *   no_expiry      the item does not expire (or has no expiry date)
 *
 * Windows come only from `expiry_window_rules` (item type or
 * `certificate_type_id`; passports 270 days, other crew documents and
 * certificates 90). This function mirrors SQL `expiry_bucket()` (gap/02 X2
 * owns it); both must give the same answer for the same inputs.
 *
 * An item is valid through its expiry date (DECISIONS D-31): on that day it
 * is `expiring_soon` with 0 days left, and `expired` from the next day. The
 * boundary table in `src/test/lib/records/expiry.test.ts` is the shared
 * TS/SQL fixture (EXP1).
 *
 * A null or blank date is `no_expiry` (D-31; gap/06 certificates rely on it).
 * Callers whose items always expire (crew documents, passports) pass
 * `noExpiry` from the "No expiry" tick and treat a missing date without the
 * tick as missing data: pass `undefined` to `<ExpiryPill>` ("Expiry unknown")
 * or flag it upstream, never `null`.
 */
import { daysBetween, toCalendarDate, type DateInput } from './dates';

export const EXPIRY_BUCKETS = ['expired', 'expiring_soon', 'expiring', 'valid', 'no_expiry'] as const;
export type ExpiryBucket = (typeof EXPIRY_BUCKETS)[number];

/** The fixed "soon" tier (DECISIONS C5). */
export const EXPIRING_SOON_DAYS = 30;
/** Window used when no rule matches (gap/02 seed: crew documents, certificates, qualifications). */
export const DEFAULT_EXPIRY_WINDOW_DAYS = 90;

/** UI labels (DECISIONS C5). */
export const EXPIRY_BUCKET_LABELS: Readonly<Record<ExpiryBucket, string>> = {
  expired: 'Expired',
  expiring_soon: '≤ 30 d',
  expiring: 'Due ≤ window',
  valid: 'Valid',
  no_expiry: 'No expiry',
};

/** Most urgent first; use for sorting and for "worst of" roll-ups. */
export const EXPIRY_BUCKET_SEVERITY: Readonly<Record<ExpiryBucket, number>> = {
  expired: 0,
  expiring_soon: 1,
  expiring: 2,
  valid: 3,
  no_expiry: 4,
};

export interface ExpiryInput {
  /** `yyyy-MM-dd` (or a Date, read as its local day). Null or blank = no date. */
  expiresOn: DateInput | null | undefined;
  /** The item type's warning window in days (from `expiry_window_rules`). */
  windowDays?: number | null;
  /** Today's date (`yyyy-MM-dd` or a Date). Passed in so the result is reproducible. */
  today: DateInput;
  /** The item type never expires (e.g. a certificate of registry). */
  noExpiry?: boolean;
}

export interface ExpiryStatus {
  bucket: ExpiryBucket;
  /** Days from today to the expiry date (negative once expired); null with no expiry. */
  daysRemaining: number | null;
  label: string;
  /** The window actually applied. */
  windowDays: number;
}

function normaliseWindow(windowDays: number | null | undefined): number {
  if (windowDays === null || windowDays === undefined) return DEFAULT_EXPIRY_WINDOW_DAYS;
  if (!Number.isFinite(windowDays) || windowDays < 0 || !Number.isInteger(windowDays)) {
    throw new RangeError(`windowDays must be a whole number of days ≥ 0, got ${windowDays}`);
  }
  return windowDays;
}

const isBlank = (v: DateInput | null | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Bucket plus days remaining and label. */
export function expiryStatus(input: ExpiryInput): ExpiryStatus {
  const windowDays = normaliseWindow(input.windowDays);
  if (input.noExpiry || isBlank(input.expiresOn)) {
    return { bucket: 'no_expiry', daysRemaining: null, label: EXPIRY_BUCKET_LABELS.no_expiry, windowDays };
  }
  const daysRemaining = daysBetween(toCalendarDate(input.today), toCalendarDate(input.expiresOn as DateInput));
  const bucket = expiryBucketForDays(daysRemaining, windowDays);
  return { bucket, daysRemaining, label: EXPIRY_BUCKET_LABELS[bucket], windowDays };
}

/**
 * The bucket for a number of days left (negative once expired) and a window.
 * `expiryStatus` uses it after counting the days; callers that already have
 * the server's day count use it directly so bucket and days agree.
 */
export function expiryBucketForDays(daysRemaining: number, windowDays?: number | null): ExpiryBucket {
  if (!Number.isInteger(daysRemaining)) throw new RangeError(`daysRemaining must be a whole number, got ${daysRemaining}`);
  const window = normaliseWindow(windowDays);
  // A window shorter than 30 days shrinks the soon tier: nothing is flagged before its window opens.
  const soon = Math.min(EXPIRING_SOON_DAYS, window);
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= soon) return 'expiring_soon';
  if (daysRemaining <= window) return 'expiring';
  return 'valid';
}

/** The bucket for one item. */
export function expiryBucket(input: ExpiryInput): ExpiryBucket {
  return expiryStatus(input).bucket;
}

/** True for the buckets that need attention (counted on KPI tiles and in the calendar banner). */
export function needsAttention(bucket: ExpiryBucket): boolean {
  return bucket === 'expired' || bucket === 'expiring_soon' || bucket === 'expiring';
}

/** The most urgent bucket of a set (e.g. a crew member's documents); `no_expiry` when empty. */
export function worstBucket(buckets: Iterable<ExpiryBucket>): ExpiryBucket {
  let worst: ExpiryBucket = 'no_expiry';
  for (const b of buckets) if (EXPIRY_BUCKET_SEVERITY[b] < EXPIRY_BUCKET_SEVERITY[worst]) worst = b;
  return worst;
}

/** Count per bucket (every bucket present, zero when unused). */
export function countBuckets(buckets: Iterable<ExpiryBucket>): Record<ExpiryBucket, number> {
  const counts = { expired: 0, expiring_soon: 0, expiring: 0, valid: 0, no_expiry: 0 };
  for (const b of buckets) counts[b] += 1;
  return counts;
}

/** A row of `expiry_window_rules`. */
export interface ExpiryWindowRule {
  itemType?: string | null;
  certificateTypeId?: string | null;
  warnDays: number;
}

/**
 * The window for an item: a rule for its `certificate_type_id` wins over a
 * rule for its item type; otherwise the default.
 */
export function resolveExpiryWindow(
  rules: readonly ExpiryWindowRule[],
  item: { itemType?: string | null; certificateTypeId?: string | null },
  fallback: number = DEFAULT_EXPIRY_WINDOW_DAYS,
): number {
  if (item.certificateTypeId) {
    const byCert = rules.find((r) => r.certificateTypeId === item.certificateTypeId);
    if (byCert) return normaliseWindow(byCert.warnDays);
  }
  if (item.itemType) {
    const byType = rules.find((r) => !r.certificateTypeId && r.itemType === item.itemType);
    if (byType) return normaliseWindow(byType.warnDays);
  }
  return normaliseWindow(fallback);
}
