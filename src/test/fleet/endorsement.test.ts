import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENDORSEMENT_WINDOW_DAYS,
  ENDORSEMENT_STATES,
  ENDORSEMENT_STATE_LABELS,
  endorsementState,
  isEndorsementState,
} from '@/modules/fleet/lib/endorsement';

const TODAY = '2026-11-22';

describe('endorsementState (SQL expiry_endorsement_state)', () => {
  it.each<[string, string, number | null | undefined, 'overdue' | 'due' | null]>([
    ['the day after the due date', '2026-11-21', undefined, 'overdue'],
    ['a year overdue', '2025-11-22', undefined, 'overdue'],
    ['the due date itself', '2026-11-22', undefined, 'due'],
    ['30 days before (default window)', '2026-12-22', undefined, 'due'],
    ['31 days before', '2026-12-23', undefined, null],
    ['a zero window: the day before', '2026-11-23', 0, null],
    ['a zero window: the due date', '2026-11-22', 0, 'due'],
    ['a 90-day window', '2027-02-20', 90, 'due'],
    ['a NULL window is 30', '2026-12-20', null, 'due'],
  ])('%s', (_label, dueOn, windowDays, want) => {
    expect(endorsementState({ dueOn, today: TODAY, windowDays })).toBe(want);
  });

  it('no due date is nothing', () => {
    expect(endorsementState({ dueOn: null, today: TODAY })).toBeNull();
    expect(endorsementState({ dueOn: undefined, today: TODAY })).toBeNull();
    expect(endorsementState({ dueOn: '  ', today: TODAY })).toBeNull();
  });

  it('reads a Date as its local day', () => {
    expect(endorsementState({ dueOn: new Date(2026, 10, 21), today: new Date(2026, 10, 22) })).toBe('overdue');
  });

  it.each([-1, 1.5, Number.NaN])('refuses window %s (SQL raises 22023)', (w) => {
    expect(() => endorsementState({ dueOn: TODAY, today: TODAY, windowDays: w })).toThrow(RangeError);
  });

  it('defaults to 30 days, as the SQL default', () => {
    expect(DEFAULT_ENDORSEMENT_WINDOW_DAYS).toBe(30);
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261124040000_fleet_expiry_engine.sql'), 'utf8');
    expect(sql).toContain('expiry_endorsement_state(p_due_on date, p_today date, p_window_days integer DEFAULT 30)');
  });

  it('agrees with every endorsement case of the SQL test (shared fixture)', () => {
    const test = readFileSync(join(process.cwd(), 'supabase/tests/sql/fleet/expiry_bucket.test.sql'), 'utf8');
    const re = /public\.expiry_endorsement_state\('(\d{4}-\d{2}-\d{2})', '(\d{4}-\d{2}-\d{2})'(?:, (\d+|NULL))?\), (?:'(overdue|due)'|NULL::text)/g;
    const cases = Array.from(test.matchAll(re));
    expect(cases.length).toBeGreaterThanOrEqual(8);
    for (const [, dueOn, today, w, want] of cases) {
      const windowDays = w === undefined ? undefined : w === 'NULL' ? null : Number(w);
      expect(endorsementState({ dueOn, today, windowDays }), `${dueOn} / ${today} / ${w ?? 'default'}`).toBe(want ?? null);
    }
  });
});

describe('labels and guards', () => {
  it('label both states', () => {
    for (const s of ENDORSEMENT_STATES) expect(ENDORSEMENT_STATE_LABELS[s]).toMatch(/^Endorsement /);
  });

  it('isEndorsementState narrows', () => {
    expect(isEndorsementState('due')).toBe(true);
    expect(isEndorsementState('overdue')).toBe(true);
    expect(isEndorsementState('expired')).toBe(false);
    expect(isEndorsementState(null)).toBe(false);
  });
});
