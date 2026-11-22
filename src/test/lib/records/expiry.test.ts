import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPIRY_WINDOW_DAYS,
  EXPIRY_BUCKET_LABELS,
  EXPIRY_BUCKETS,
  countBuckets,
  expiryBucket,
  expiryBucketForDays,
  expiryStatus,
  needsAttention,
  resolveExpiryWindow,
  worstBucket,
  type ExpiryBucket,
} from '@/lib/records/expiry';
import { daysBetween } from '@/lib/records/dates';

const TODAY = '2026-11-22';
const plusDays = (n: number) => {
  const d = new Date(Date.UTC(2026, 10, 22 + n));
  return d.toISOString().slice(0, 10); // UTC date math on a UTC-constructed date: safe here
};

/**
 * EXP1 shared fixture (gap/08 EXP1; DECISIONS C5, D-31): SQL `expiry_bucket()`
 * must give the same bucket and days for every row, so the pgTAP test for it
 * copies this table verbatim. An item is valid through its expiry date: the
 * expiry day is `expiring_soon` with 0 days, the day after is `expired`.
 */
const EXPIRY_BUCKET_FIXTURE: ReadonlyArray<{
  case: string;
  expiresOn: string;
  windowDays: number;
  today: string;
  bucket: ExpiryBucket;
  days: number;
}> = [
  { case: 'a year overdue', expiresOn: '2025-11-22', windowDays: 90, today: TODAY, bucket: 'expired', days: -365 },
  { case: 'the day after the expiry date', expiresOn: '2026-11-21', windowDays: 90, today: TODAY, bucket: 'expired', days: -1 },
  { case: 'the expiry date itself', expiresOn: '2026-11-22', windowDays: 90, today: TODAY, bucket: 'expiring_soon', days: 0 },
  { case: 'the day before the expiry date', expiresOn: '2026-11-23', windowDays: 90, today: TODAY, bucket: 'expiring_soon', days: 1 },
  { case: 'last day of the 30-day tier', expiresOn: '2026-12-22', windowDays: 90, today: TODAY, bucket: 'expiring_soon', days: 30 },
  { case: 'first day past the 30-day tier', expiresOn: '2026-12-23', windowDays: 90, today: TODAY, bucket: 'expiring', days: 31 },
  { case: 'last day of the window', expiresOn: '2027-02-20', windowDays: 90, today: TODAY, bucket: 'expiring', days: 90 },
  { case: 'first day past the window', expiresOn: '2027-02-21', windowDays: 90, today: TODAY, bucket: 'valid', days: 91 },
  { case: 'passport, last day of 270', expiresOn: '2027-08-19', windowDays: 270, today: TODAY, bucket: 'expiring', days: 270 },
  { case: 'passport, past 270', expiresOn: '2027-08-20', windowDays: 270, today: TODAY, bucket: 'valid', days: 271 },
  { case: '14-day window, last day', expiresOn: '2026-12-06', windowDays: 14, today: TODAY, bucket: 'expiring_soon', days: 14 },
  { case: '14-day window, past it', expiresOn: '2026-12-07', windowDays: 14, today: TODAY, bucket: 'valid', days: 15 },
  { case: 'zero window, expiry date', expiresOn: '2026-11-22', windowDays: 0, today: TODAY, bucket: 'expiring_soon', days: 0 },
  { case: 'zero window, the day after', expiresOn: '2026-11-21', windowDays: 0, today: TODAY, bucket: 'expired', days: -1 },
];

describe('EXP1 shared TS/SQL expiry_bucket() fixture', () => {
  it.each(EXPIRY_BUCKET_FIXTURE)('$case → $bucket ($days d)', ({ expiresOn, windowDays, today, bucket, days }) => {
    expect(expiryStatus({ expiresOn, windowDays, today })).toMatchObject({ bucket, daysRemaining: days, windowDays });
    expect(expiryBucketForDays(days, windowDays)).toBe(bucket);
  });

  it('null expiry is no_expiry (engine contract; callers decide what a missing date means)', () => {
    expect(expiryStatus({ expiresOn: null, windowDays: 90, today: TODAY })).toMatchObject({ bucket: 'no_expiry', daysRemaining: null });
  });
});

describe('expiryBucketForDays', () => {
  it('rejects a fractional day count or a bad window', () => {
    expect(() => expiryBucketForDays(1.5, 90)).toThrow(RangeError);
    expect(() => expiryBucketForDays(1, -1)).toThrow(RangeError);
  });
  it('defaults the window', () => {
    expect(expiryBucketForDays(90)).toBe('expiring');
    expect(expiryBucketForDays(91, null)).toBe('valid');
  });
});

describe('expiryBucket: boundaries with a 90-day window', () => {
  it.each<[number, ExpiryBucket]>([
    [-365, 'expired'],
    [-1, 'expired'], // the day after the expiry date (D-31)
    [0, 'expiring_soon'], // the expiry date itself: valid through it (D-31)
    [1, 'expiring_soon'],
    [30, 'expiring_soon'],
    [31, 'expiring'],
    [89, 'expiring'],
    [90, 'expiring'],
    [91, 'valid'],
    [3650, 'valid'],
  ])('%i days → %s', (days, bucket) => {
    expect(plusDays(days)).toHaveLength(10);
    expect(daysBetween(TODAY, plusDays(days))).toBe(days);
    expect(expiryBucket({ expiresOn: plusDays(days), windowDays: 90, today: TODAY })).toBe(bucket);
  });
});

describe('expiryBucket: windows are per item type (C5)', () => {
  it('passports (270 days) are "expiring" long before a fixed 90-day tier would say so', () => {
    expect(expiryBucket({ expiresOn: plusDays(200), windowDays: 270, today: TODAY })).toBe('expiring');
    expect(expiryBucket({ expiresOn: plusDays(271), windowDays: 270, today: TODAY })).toBe('valid');
    expect(expiryBucket({ expiresOn: plusDays(200), windowDays: 90, today: TODAY })).toBe('valid');
  });

  it('a window shorter than 30 days shrinks the soon tier to the window', () => {
    expect(expiryBucket({ expiresOn: plusDays(14), windowDays: 14, today: TODAY })).toBe('expiring_soon');
    expect(expiryBucket({ expiresOn: plusDays(15), windowDays: 14, today: TODAY })).toBe('valid');
    expect(expiryBucket({ expiresOn: plusDays(20), windowDays: 14, today: TODAY })).toBe('valid');
  });

  it('a zero window flags only the expiry day and after', () => {
    expect(expiryBucket({ expiresOn: TODAY, windowDays: 0, today: TODAY })).toBe('expiring_soon');
    expect(expiryBucket({ expiresOn: plusDays(1), windowDays: 0, today: TODAY })).toBe('valid');
    expect(expiryBucket({ expiresOn: plusDays(-1), windowDays: 0, today: TODAY })).toBe('expired');
  });

  it('no window falls back to the default', () => {
    expect(DEFAULT_EXPIRY_WINDOW_DAYS).toBe(90);
    expect(expiryStatus({ expiresOn: plusDays(60), today: TODAY })).toMatchObject({ bucket: 'expiring', windowDays: 90 });
    expect(expiryStatus({ expiresOn: plusDays(60), windowDays: null, today: TODAY }).windowDays).toBe(90);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects window %s', (w) => {
    expect(() => expiryBucket({ expiresOn: TODAY, windowDays: w, today: TODAY })).toThrow(RangeError);
  });
});

describe('expiryBucket: no expiry', () => {
  it.each([null, undefined, '', '   '])('no date (%j) → no_expiry', (expiresOn) => {
    expect(expiryStatus({ expiresOn, today: TODAY })).toEqual({ bucket: 'no_expiry', daysRemaining: null, label: 'No expiry', windowDays: 90 });
  });

  it('the noExpiry flag wins over a date', () => {
    expect(expiryBucket({ expiresOn: plusDays(-10), today: TODAY, noExpiry: true })).toBe('no_expiry');
  });

  it('a malformed date throws instead of guessing', () => {
    expect(() => expiryBucket({ expiresOn: '2026-02-30', today: TODAY })).toThrow(RangeError);
    expect(() => expiryBucket({ expiresOn: '22/11/2026', today: TODAY })).toThrow(RangeError);
  });
});

describe('expiryStatus', () => {
  it('reports days remaining and the C5 label', () => {
    expect(expiryStatus({ expiresOn: plusDays(-3), windowDays: 90, today: TODAY })).toEqual({ bucket: 'expired', daysRemaining: -3, label: 'Expired', windowDays: 90 });
    expect(expiryStatus({ expiresOn: plusDays(12), windowDays: 90, today: TODAY }).label).toBe('≤ 30 d');
    expect(expiryStatus({ expiresOn: plusDays(45), windowDays: 90, today: TODAY }).label).toBe('Due ≤ window');
    expect(expiryStatus({ expiresOn: plusDays(400), windowDays: 90, today: TODAY }).label).toBe('Valid');
  });

  it('labels cover every bucket', () => {
    expect(Object.keys(EXPIRY_BUCKET_LABELS).sort()).toEqual([...EXPIRY_BUCKETS].sort());
  });

  it('accepts ISO timestamps (date part as written) and leap days', () => {
    expect(expiryStatus({ expiresOn: '2028-02-29T00:00:00Z', windowDays: 90, today: '2028-02-28' }).daysRemaining).toBe(1);
    expect(expiryStatus({ expiresOn: '2027-03-01', windowDays: 90, today: '2027-02-28' }).daysRemaining).toBe(1);
  });
});

describe('expiry is independent of the machine time zone', () => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });

  it('uses the local calendar day of a Date for "today"', () => {
    // 00:30 on 22 Nov in Auckland is still 21 Nov in UTC.
    const today = new Date(2026, 10, 22, 0, 30);
    expect(expiryStatus({ expiresOn: '2026-11-22', today }).daysRemaining).toBe(0);
    expect(expiryBucket({ expiresOn: '2026-11-21', today })).toBe('expired');
  });

  it('counts calendar days across a daylight-saving change', () => {
    // NZ daylight saving starts 27 Sep 2026; 23-hour day in between.
    expect(expiryStatus({ expiresOn: '2026-09-28', today: '2026-09-26' }).daysRemaining).toBe(2);
  });
});

describe('roll-ups', () => {
  it('needsAttention', () => {
    expect(EXPIRY_BUCKETS.filter(needsAttention)).toEqual(['expired', 'expiring_soon', 'expiring']);
  });

  it('worstBucket', () => {
    expect(worstBucket(['valid', 'expiring', 'no_expiry'])).toBe('expiring');
    expect(worstBucket(['valid', 'expired', 'expiring_soon'])).toBe('expired');
    expect(worstBucket([])).toBe('no_expiry');
  });

  it('countBuckets includes zeros', () => {
    expect(countBuckets(['valid', 'valid', 'expired'])).toEqual({ expired: 1, expiring_soon: 0, expiring: 0, valid: 2, no_expiry: 0 });
  });
});

describe('resolveExpiryWindow', () => {
  const rules = [
    { itemType: 'passport', warnDays: 270 },
    { itemType: 'crew_document', warnDays: 90 },
    { certificateTypeId: 'cert-loadline', warnDays: 180 },
    { itemType: 'vessel_certificate', warnDays: 90 },
  ];

  it('certificate type wins over item type', () => {
    expect(resolveExpiryWindow(rules, { itemType: 'vessel_certificate', certificateTypeId: 'cert-loadline' })).toBe(180);
  });
  it('item type rule', () => {
    expect(resolveExpiryWindow(rules, { itemType: 'passport' })).toBe(270);
    expect(resolveExpiryWindow(rules, { itemType: 'vessel_certificate', certificateTypeId: 'cert-other' })).toBe(90);
  });
  it('fallback', () => {
    expect(resolveExpiryWindow(rules, { itemType: 'visa' })).toBe(90);
    expect(resolveExpiryWindow([], {}, 60)).toBe(60);
  });
});
