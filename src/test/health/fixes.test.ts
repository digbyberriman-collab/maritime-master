/**
 * Regression tests for the defects found in the Health & Wellness review.
 *
 * Every case here failed before the fix it covers. The timezone cases pin the
 * browser to a zone either side of UTC, because the bugs were invisible from
 * London and wrong everywhere else.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// These are pure functions, but they live beside hooks that import the
// Supabase client at module load. Stub it so the module graph resolves.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  fromLocalDateTimeInput,
  localDayIso,
  localDayOf,
  todayIso,
  toLocalDateTimeInput,
} from '@/modules/health/lib/format';
import { riskBandFor, riskBandForScore, scoreScreening } from '@/modules/health/hooks/useScreening';
import { clinicalReferral } from '@/modules/health/hooks/useReferrals';

/** Runs `fn` with the clock frozen at `iso` and the process in `tz`. */
function at<T>(iso: string, tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  try {
    return fn();
  } finally {
    vi.useRealTimers();
    process.env.TZ = previous;
  }
}

afterEach(() => vi.useRealTimers());

describe('local calendar days', () => {
  it('reports the day the user is living in, not the UTC day', () => {
    // 01:00 on the 21st in Dubai is still the 20th in UTC.
    expect(at('2026-09-20T21:00:00Z', 'Asia/Dubai', todayIso)).toBe('2026-09-21');
    // 21:00 on the 20th in New York is already the 21st in UTC.
    expect(at('2026-09-21T01:00:00Z', 'America/New_York', todayIso)).toBe('2026-09-20');
  });

  it('buckets a timestamp by its local day', () => {
    expect(at('2026-09-20T12:00:00Z', 'Asia/Dubai', () => localDayOf('2026-09-20T21:30:00Z'))).toBe(
      '2026-09-21',
    );
    expect(
      at('2026-09-20T12:00:00Z', 'America/New_York', () => localDayOf('2026-09-21T01:30:00Z')),
    ).toBe('2026-09-20');
  });

  it('returns null rather than a bogus day for missing or unparseable input', () => {
    expect(localDayOf(null)).toBeNull();
    expect(localDayOf('not a date')).toBeNull();
  });

  it('formats a fixed date the same in every zone', () => {
    expect(localDayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('datetime-local round trip', () => {
  it('does not shift the timestamp by the UTC offset on save', () => {
    at('2026-09-20T12:00:00Z', 'Asia/Dubai', () => {
      const stored = '2026-09-20T12:00:00.000Z'; // 16:00 local
      const input = toLocalDateTimeInput(stored);
      expect(input).toBe('2026-09-20T16:00');
      expect(fromLocalDateTimeInput(input)).toBe(stored);
    });
  });

  it('survives repeated edit-and-save cycles without drifting', () => {
    at('2026-09-20T12:00:00Z', 'America/New_York', () => {
      let stored: string | null = '2026-09-20T12:00:00.000Z';
      for (let i = 0; i < 5; i += 1) {
        stored = fromLocalDateTimeInput(toLocalDateTimeInput(stored));
      }
      expect(stored).toBe('2026-09-20T12:00:00.000Z');
    });
  });

  it('seeds "now" as the local wall clock', () => {
    expect(at('2026-09-20T21:30:00Z', 'Asia/Dubai', () => toLocalDateTimeInput())).toBe(
      '2026-09-21T01:30',
    );
  });

  it('treats an empty input as no timestamp', () => {
    expect(fromLocalDateTimeInput('')).toBeNull();
    expect(fromLocalDateTimeInput(null)).toBeNull();
  });
});

describe('screening scores follow the template', () => {
  const questions = [
    { id: 'a', answer_type: 'scale', weight: 1 },
    { id: 'b', answer_type: 'scale', weight: 1 },
    { id: 'c', answer_type: 'scale', weight: 1 },
  ] as never[];
  const answers = new Map(
    ['a', 'b', 'c'].map((id) => [
      id,
      { value_numeric: 12, value_text: null, value_options: [], value_date: null, is_flagged: false },
    ]),
  ) as never;

  it('sums a summed template', () => {
    expect(scoreScreening(questions, answers, 'sum').total).toBe(36);
  });

  it('averages an averaged template instead of summing it', () => {
    expect(scoreScreening(questions, answers, 'average').total).toBe(12);
  });

  it('gives an unscored template no band at all', () => {
    const scored = scoreScreening(questions, answers, 'none');
    expect(scored.total).toBe(0);
    expect(riskBandFor(scored.total, 'none')).toBeNull();
  });

  it('bands a summed and an averaged template differently for the same answers', () => {
    expect(riskBandFor(scoreScreening(questions, answers, 'sum').total, 'sum')).toBe('high');
    expect(riskBandFor(scoreScreening(questions, answers, 'average').total, 'average')).toBe('low');
  });

  it('keeps the raw banding thresholds', () => {
    expect(riskBandForScore(15)).toBe('low');
    expect(riskBandForScore(16)).toBe('moderate');
    expect(riskBandForScore(31)).toBe('high');
    expect(riskBandForScore(46)).toBe('very_high');
  });
});

describe('referral clinical notes', () => {
  it('allows notes only where both ends are clinical', () => {
    expect(clinicalReferral('medical', 'physio')).toBe(true);
    expect(clinicalReferral('medical', 'specialist')).toBe(true);
    expect(clinicalReferral('physio', 'medical')).toBe(true);
  });

  it('refuses them for spa, nutrition and PT', () => {
    expect(clinicalReferral('medical', 'spa')).toBe(false);
    expect(clinicalReferral('medical', 'nutrition')).toBe(false);
    expect(clinicalReferral('medical', 'pt')).toBe(false);
    expect(clinicalReferral('spa', 'medical')).toBe(false);
    expect(clinicalReferral('self', 'medical')).toBe(false);
  });

  it('treats a missing discipline as non-clinical', () => {
    expect(clinicalReferral(null, 'physio')).toBe(false);
    expect(clinicalReferral('medical', undefined)).toBe(false);
  });
});
