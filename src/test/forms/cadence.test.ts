/**
 * Template cadence (src/modules/forms/lib/cadence.ts; gap/02 FC3, FC6, W2):
 *
 * - the cadence list is the migration's CHECK;
 * - `nextDue` answers every case below, and the SQL test copies the same
 *   cases (supabase/tests/sql/fleet/form_templates.test.sql, between its
 *   cadence-cases markers) for `form_template_next_due`;
 * - month steps clamp to the month's last day (PostgreSQL date + interval);
 * - overdue from the day after the due day; `runDue` (the run statistics'
 *   next-due and overdue: last run, else first publish; hidden never due);
 * - labels and the scheduled / unscheduled split.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CADENCES,
  CADENCE_LABELS,
  UNSCHEDULED_CADENCES,
  addDays,
  addMonths,
  cadenceLabel,
  isCadence,
  isOverdue,
  isScheduledCadence,
  nextDue,
  runDue,
} from '@/modules/forms/lib/cadence';

const ROOT = process.cwd();
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261124040500_fleet_form_templates.sql'), 'utf8');
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/fleet/form_templates.test.sql'), 'utf8');

/** The cases the SQL test copies: [cadence, anchor, next due]. */
const CASES: ReadonlyArray<[string | null, string | null, string | null]> = [
  ['daily', '2026-11-26', '2026-11-27'],
  ['daily', '2026-12-31', '2027-01-01'],
  ['weekly', '2026-11-26', '2026-12-03'],
  ['monthly', '2026-01-31', '2026-02-28'],
  ['monthly', '2028-01-31', '2028-02-29'],
  ['monthly', '2026-11-26', '2026-12-26'],
  ['quarterly', '2026-11-30', '2027-02-28'],
  ['six_monthly', '2026-08-31', '2027-02-28'],
  ['yearly', '2028-02-29', '2029-02-28'],
  ['two_yearly', '2026-11-26', '2028-11-26'],
  ['five_yearly', '2024-02-29', '2029-02-28'],
  ['none', '2026-11-26', null],
  ['per_voyage', '2026-11-26', null],
  ['per_charter', '2026-11-26', null],
  ['on_demand', '2026-11-26', null],
  [null, '2026-11-26', null],
  ['weekly', null, null],
];

const sqlList = (constraint: string): string[] => {
  const line = SQL.split('\n').find((l) => l.includes(`ADD CONSTRAINT ${constraint} CHECK`)) ?? '';
  return [...line.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

describe('the cadence list', () => {
  it('is the migration CHECK, in order', () => {
    expect([...CADENCES]).toEqual(sqlList('form_templates_cadence_check'));
    expect(CADENCES).toHaveLength(12);
  });

  it('has a label for every cadence and none for anything else', () => {
    for (const c of CADENCES) expect(cadenceLabel(c)).toBe(CADENCE_LABELS[c]);
    expect(cadenceLabel('hourly')).toBeNull();
    expect(cadenceLabel(null)).toBeNull();
    expect(isCadence('weekly')).toBe(true);
    expect(isCadence('Weekly')).toBe(false);
  });

  it('splits scheduled cadences from event-driven ones and none', () => {
    expect(CADENCES.filter((c) => isScheduledCadence(c))).toEqual(['daily', 'weekly', 'monthly', 'quarterly', 'six_monthly', 'yearly', 'two_yearly', 'five_yearly']);
    expect(CADENCES.filter((c) => !isScheduledCadence(c))).toEqual([...UNSCHEDULED_CADENCES]);
    expect(isScheduledCadence(undefined)).toBe(false);
  });
});

describe('next due (form_template_next_due)', () => {
  it.each(CASES)('%s from %s -> %s', (cadence, anchor, due) => {
    expect(nextDue(cadence, anchor)).toBe(due);
  });

  it('is the case list the SQL test copies (between its cadence-cases markers)', () => {
    const block = SQL_TEST.split('-- cadence-cases:start')[1]?.split('-- cadence-cases:end')[0] ?? '';
    const value = (v: string) => (v === 'NULL' ? null : v.replace(/^'|'$/g, ''));
    const rows = [...block.matchAll(/\((NULL|'[a-z_]+'), (NULL|'[\d-]+'), (NULL|'[\d-]+')\)/g)].map((m) => [value(m[1]), value(m[2]), value(m[3])]);
    expect(rows).toEqual(CASES.map((c) => [...c]));
  });

  it('mirrors the SQL steps', () => {
    expect(SQL).toContain("WHEN 'daily' THEN p_anchor + 1");
    expect(SQL).toContain("WHEN 'weekly' THEN p_anchor + 7");
    expect(SQL).toContain("WHEN 'six_monthly' THEN (p_anchor + interval '6 months')::date");
    expect(SQL).toContain("WHEN 'five_yearly' THEN (p_anchor + interval '5 years')::date");
  });
});

describe('calendar arithmetic', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-11-26', 0)).toBe('2026-11-26');
  });

  it('adds months, clamping to the last day of the target month', () => {
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-05-31', -3)).toBe('2026-02-28');
    expect(addMonths('2026-11-26', 120)).toBe('2036-11-26');
  });

  it('refuses something that is not a calendar day', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addMonths('26-11-2026', 1)).toThrow(RangeError);
    expect(() => nextDue('daily', '2026-13-01')).toThrow(RangeError);
  });
});

describe('overdue and the run statistics answer', () => {
  it('is overdue from the day after the due day', () => {
    expect(isOverdue('2026-11-25', '2026-11-26')).toBe(true);
    expect(isOverdue('2026-11-26', '2026-11-26')).toBe(false);
    expect(isOverdue('2026-11-27', '2026-11-26')).toBe(false);
    expect(isOverdue(null, '2026-11-26')).toBe(false);
    expect(() => isOverdue('2026-11-25', 'today')).toThrow(RangeError);
  });

  it('counts from the last run, else from the first publish', () => {
    expect(runDue({ cadence: 'weekly', lastRunOn: '2026-11-17', firstPublishedOn: '2026-01-01', today: '2026-11-26' })).toEqual({ nextDue: '2026-11-24', overdue: true });
    expect(runDue({ cadence: 'weekly', lastRunOn: '2026-11-24', firstPublishedOn: '2026-01-01', today: '2026-11-26' })).toEqual({ nextDue: '2026-12-01', overdue: false });
    expect(runDue({ cadence: 'daily', lastRunOn: null, firstPublishedOn: '2026-11-26', today: '2026-11-26' })).toEqual({ nextDue: '2026-11-27', overdue: false });
    expect(runDue({ cadence: 'daily', lastRunOn: null, firstPublishedOn: '2026-11-26', today: '2026-11-28' })).toEqual({ nextDue: '2026-11-27', overdue: true });
    expect(runDue({ cadence: 'monthly', lastRunOn: null, firstPublishedOn: null, today: '2026-11-26' })).toEqual({ nextDue: null, overdue: false });
  });

  it('is never due when event-driven, unset or hidden on the vessel', () => {
    expect(runDue({ cadence: 'per_voyage', lastRunOn: '2026-01-01', firstPublishedOn: '2026-01-01', today: '2026-11-26' })).toEqual({ nextDue: null, overdue: false });
    expect(runDue({ cadence: null, lastRunOn: '2026-01-01', firstPublishedOn: null, today: '2026-11-26' })).toEqual({ nextDue: null, overdue: false });
    expect(runDue({ cadence: 'daily', lastRunOn: '2026-01-01', firstPublishedOn: null, today: '2026-11-26', hidden: true })).toEqual({ nextDue: null, overdue: false });
  });
});
