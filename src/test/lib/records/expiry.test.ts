import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPIRY_WINDOW_DAYS,
  EXPIRY_BUCKET_LABELS,
  EXPIRY_BUCKETS,
  countBuckets,
  expiryBucket,
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

describe('expiryBucket: boundaries with a 90-day window', () => {
  it.each<[number, ExpiryBucket]>([
    [-365, 'expired'],
    [-1, 'expired'],
    [0, 'expiring_soon'], // valid through the expiry date
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
