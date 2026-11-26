/**
 * The hours-of-rest engine's X1-07 rules (gap/04 C38, C46, W6): serious
 * breaches, deficits, warnings with the margins, the 7-day severity by
 * margin, rolling windows across day and month boundaries, unrecorded days,
 * and the shared parity cases (fixtures/horCases.json, which the SQL
 * evaluator work_rest_rule_eval answers the same; supabase/tests/sql/crew/
 * hor_engine.test.sql).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateCompliance,
  engineRulesOf,
  evaluateRules,
  localStamp,
  RULE_ORDER,
  type EngineDay,
  type EngineResult,
  type EngineRules,
} from '@/modules/work-rest/lib/complianceEngine';
import { DailyRecord, DEFAULT_RULE_SET, DEFAULT_THRESHOLDS } from '@/modules/work-rest/types';

const ROOT = process.cwd();
const CASES = JSON.parse(readFileSync(join(ROOT, 'src/test/work-rest/fixtures/horCases.json'), 'utf8')) as {
  defaults: { rules: EngineRules };
  rules: Array<{ name: string; days: EngineDay[]; rules?: Partial<EngineRules>; range?: { from: string; to: string }; expect: EngineResult }>;
};
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/crew/hor_engine.test.sql'), 'utf8');

const CREW = '00000000-0000-0000-0000-000000000001';
const VESSEL = '00000000-0000-0000-0000-000000000002';
const H = (h: number) => Math.round(h * 60);
const rec = (date: string, work: Array<[number, number]>): DailyRecord => ({
  crew_id: CREW,
  vessel_id: VESSEL,
  record_date: date,
  blocks: work.map(([s, e]) => ({ block_type: 'work' as const, start_minute: H(s), end_minute: H(e) })),
});
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const week = (from: string, n: number, work: Array<[number, number]>) => Array.from({ length: n }, (_, i) => rec(addDays(from, i), work));
const RULES = engineRulesOf(DEFAULT_RULE_SET);

describe('serious breaches and deficits', () => {
  it('rest below 4 h in 24 h is serious and critical, with the deficit in hours', () => {
    const r = calculateCompliance([rec('2026-05-01', [[0, 21]])]);
    const nc = r.non_conformities.find((n) => n.rule_code === 'REST_24H_MIN');
    expect(nc).toMatchObject({ is_serious: true, severity: 'critical', measured_value: 3, threshold_value: 10, deficit_hours: 7, breach_day: '2026-05-01' });
  });

  it('exactly 4 h of rest is not serious (below means below)', () => {
    const r = calculateCompliance([rec('2026-05-01', [[2, 22]])]);
    const nc = r.non_conformities.find((n) => n.rule_code === 'REST_24H_MIN');
    expect(nc).toMatchObject({ is_serious: false, severity: 'high', measured_value: 4, deficit_hours: 6 });
  });

  it('a 24 h shortfall of 2 h or less is medium', () => {
    const r = calculateCompliance([rec('2026-05-01', [[6, 22]])]);
    expect(r.non_conformities.find((n) => n.rule_code === 'REST_24H_MIN')).toMatchObject({ severity: 'medium', deficit_hours: 2 });
  });

  it('a 7-day total below 50 h is serious and critical', () => {
    const r = calculateCompliance(week('2026-05-01', 7, [[0, 18]]));
    const nc = r.non_conformities.find((n) => n.rule_code === 'REST_7D_MIN');
    expect(nc).toMatchObject({ is_serious: true, severity: 'critical', measured_value: 42, threshold_value: 77, deficit_hours: 35, breach_day: '2026-05-07' });
  });

  it('the 7-day severity follows the margin: 3 h short or less is medium, more is high', () => {
    const medium = calculateCompliance([...week('2026-05-01', 6, [[0, 13]]), rec('2026-05-07', [[0, 15]])]);
    expect(medium.non_conformities.find((n) => n.rule_code === 'REST_7D_MIN')).toMatchObject({ severity: 'medium', measured_value: 75, deficit_hours: 2, is_serious: false });
    const high = calculateCompliance(week('2026-05-01', 7, [[0, 14]]));
    expect(high.non_conformities.find((n) => n.rule_code === 'REST_7D_MIN')).toMatchObject({ severity: 'high', measured_value: 70, deficit_hours: 7 });
  });

  it('the long-block rule reports the hours short; counts and intervals carry no deficit', () => {
    const r = calculateCompliance([rec('2026-05-01', [[0, 5], [10, 15], [20, 24]])]);
    expect(r.non_conformities.find((n) => n.rule_code === 'REST_LONG_BLOCK_MIN')?.deficit_hours).toBe(1);
    const periods = calculateCompliance([rec('2026-05-01', [[2, 4], [6, 8], [10, 12], [14, 16]])]);
    expect(periods.non_conformities.find((n) => n.rule_code === 'REST_PERIODS_MAX')?.deficit_hours).toBeNull();
    const interval = calculateCompliance([rec('2026-05-01', [[2, 22]])]);
    expect(interval.non_conformities.find((n) => n.rule_code === 'REST_INTERVAL_MAX')?.deficit_hours).toBeNull();
  });

  it('serious thresholds and margins come from the rule set when given', () => {
    const r = calculateCompliance([rec('2026-05-01', [[0, 19]])], { ...DEFAULT_RULE_SET, serious_24h: 6 });
    expect(r.non_conformities.find((n) => n.rule_code === 'REST_24H_MIN')).toMatchObject({ is_serious: true, measured_value: 5 });
    const plain = calculateCompliance([rec('2026-05-01', [[0, 19]])]);
    expect(plain.non_conformities.find((n) => n.rule_code === 'REST_24H_MIN')?.is_serious).toBe(false);
  });
});

describe('warnings', () => {
  it('rest at the minimum up to the margin warns, without a breach', () => {
    for (const work of [[[6, 20]], [[0, 13.5]]] as Array<Array<[number, number]>>) {
      const r = calculateCompliance([rec('2026-05-01', work)]);
      expect(r.non_conformities).toEqual([]);
      expect(r.daily_summary[0]).toMatchObject({ warning: true, breach: false, is_compliant: true });
    }
  });

  it('rest a full margin above the minimum does not warn', () => {
    const r = calculateCompliance([rec('2026-05-01', [[0, 13]])]);
    expect(r.daily_summary[0]).toMatchObject({ warning: false, breach: false });
  });

  it('a 7-day total within 3 h of 77 h warns on the day the week ends', () => {
    const r = calculateCompliance(week('2026-05-01', 7, [[0, 13]]));
    expect(r.non_conformities).toEqual([]);
    expect(r.daily_summary.map((d) => d.warning)).toEqual([false, false, false, false, false, false, true]);
    expect(r.daily_summary[6].min_rest_7d_minutes).toBe(77 * 60);
  });

  it('a breach day never also warns', () => {
    const r = calculateCompliance(week('2026-05-01', 7, [[0, 14]]));
    const last = r.daily_summary[6];
    expect(last).toMatchObject({ breach: true, warning: false });
    expect(r.daily_summary[0]).toMatchObject({ breach: false, warning: true });
  });

  it('the margins come from the rule set when given', () => {
    const r = calculateCompliance([rec('2026-05-01', [[0, 13]])], { ...DEFAULT_RULE_SET, warning_margin_24h: 2 });
    expect(r.daily_summary[0].warning).toBe(true);
    expect(DEFAULT_THRESHOLDS).toEqual({ warning_margin_24h: 1, warning_margin_7d: 3, serious_24h: 4, serious_7d: 50 });
  });
});

describe('rolling windows', () => {
  it('a 24 h window across midnight is checked: a late finish and an early start breach the next day', () => {
    const r = calculateCompliance([rec('2026-05-01', [[6, 22]]), rec('2026-05-02', [[8, 18]])]);
    const day2 = r.non_conformities.filter((n) => n.breach_day === '2026-05-02');
    expect(day2).toHaveLength(1);
    expect(day2[0]).toMatchObject({ rule_code: 'REST_24H_MIN', measured_value: 8, window_start: '2026-05-01T06:00:00.000Z', window_end: '2026-05-02T06:00:00.000Z' });
    // Day 2's own calendar day has 14 h of rest; the breach is the window ending at 06:00.
    expect(r.daily_summary[1].rest_minutes).toBe(14 * 60);
  });

  it('ties take the latest window', () => {
    const r = calculateCompliance(week('2026-05-01', 3, [[0, 16]]));
    const nc = r.non_conformities.filter((n) => n.rule_code === 'REST_24H_MIN');
    expect(nc.map((n) => n.window_start)).toEqual(['2026-05-01T00:00:00.000Z', '2026-05-02T00:00:00.000Z', '2026-05-03T00:00:00.000Z']);
  });

  it('a work period across midnight is one interval, reported on the day it ends', () => {
    const r = calculateCompliance([rec('2026-05-01', [[18, 24]]), rec('2026-05-02', [[0, 10]])]);
    const nc = r.non_conformities.find((n) => n.rule_code === 'REST_INTERVAL_MAX');
    expect(nc).toMatchObject({ breach_day: '2026-05-02', measured_value: 16, window_start: '2026-05-01T18:00:00.000Z', window_end: '2026-05-02T10:00:00.000Z' });
  });

  it('a night rest across midnight counts whole for the six-hour block, in both days', () => {
    const r = calculateCompliance([rec('2026-05-01', [[6, 20]]), rec('2026-05-02', [[2, 16]])]);
    // 20:00 -> 02:00 is one 6 h period; each day also has its other end.
    expect(r.daily_summary.map((d) => d.longest_rest_minutes)).toEqual([360, 480]);
    expect(r.non_conformities.find((n) => n.rule_code === 'REST_LONG_BLOCK_MIN')).toBeUndefined();
  });

  it('a 7-day window across a month boundary is checked', () => {
    const r = calculateCompliance(week('2026-04-27', 8, [[0, 15]]));
    const nc = r.non_conformities.filter((n) => n.rule_code === 'REST_7D_MIN');
    expect(nc.map((n) => n.breach_day)).toEqual(['2026-05-03', '2026-05-04']);
    expect(nc[0]).toMatchObject({ window_start: '2026-04-27T00:00:00.000Z', window_end: '2026-05-04T00:00:00.000Z', measured_value: 63 });
  });

  it('an unrecorded day is never rest: windows that touch it are not evaluated', () => {
    const r = calculateCompliance([...week('2026-05-01', 3, [[0, 16]]), ...week('2026-05-05', 4, [[0, 16]])]);
    expect(r.non_conformities.some((n) => n.rule_code === 'REST_7D_MIN')).toBe(false);
    expect(r.daily_summary.every((d) => d.min_rest_7d_minutes === null)).toBe(true);
    // The first day after the gap has only its own calendar day.
    expect(r.daily_summary.find((d) => d.date === '2026-05-05')?.min_rest_24h_minutes).toBe(8 * 60);
    expect(r.rolling_7d).toEqual([]);
  });

  it('overlapping work blocks are their union', () => {
    const r = calculateCompliance([
      { ...rec('2026-05-01', []), blocks: [
        { block_type: 'work', start_minute: 0, end_minute: 300 },
        { block_type: 'work', start_minute: 200, end_minute: 600 },
      ] },
    ]);
    expect(r.daily_summary[0]).toMatchObject({ work_minutes: 600, rest_minutes: 840 });
    expect(r.totals.work_minutes).toBe(600);
  });

  it('rest blocks carry no rule meaning (unmarked time is rest)', () => {
    const r = calculateCompliance([
      { ...rec('2026-05-01', [[8, 18]]), blocks: [
        { block_type: 'work', start_minute: 480, end_minute: 1080 },
        { block_type: 'rest', start_minute: 600, end_minute: 700 },
      ] },
    ]);
    expect(r.daily_summary[0].work_minutes).toBe(600);
  });

  it('every breach names the day it belongs to, in the rule order', () => {
    const r = evaluateRules(
      [{ date: '2026-05-01', work: [[0, 1260]] }],
      RULES,
    );
    expect(r.non_conformities.map((n) => n.rule_code)).toEqual(['REST_24H_MIN', 'REST_LONG_BLOCK_MIN', 'REST_INTERVAL_MAX']);
    expect(RULE_ORDER).toEqual(['REST_24H_MIN', 'REST_7D_MIN', 'REST_PERIODS_MAX', 'REST_LONG_BLOCK_MIN', 'REST_INTERVAL_MAX']);
  });

  it('a range limits the answer; every day stays context', () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-05-01', i), work: [[0, 900]] as Array<[number, number]> }));
    const r = evaluateRules(days, RULES, { from: '2026-05-07', to: '2026-05-07' });
    expect(r.days.map((d) => d.date)).toEqual(['2026-05-07']);
    expect(r.non_conformities.find((n) => n.rule_code === 'REST_7D_MIN')).toMatchObject({ day: '2026-05-07', window_start: '2026-05-01T00:00' });
  });

  it('local stamps are minutes from 1970-01-01 local', () => {
    expect(localStamp(0)).toBe('1970-01-01T00:00');
    expect(localStamp(1441)).toBe('1970-01-02T00:01');
  });
});

describe('the parity cases (horCases.json; the SQL evaluator answers the same)', () => {
  it('are many, uniquely named, and cover day, month and year boundaries, gaps, ties and serious breaches', () => {
    expect(CASES.rules.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CASES.rules.map((c) => c.name)).size).toBe(CASES.rules.length);
    const names = CASES.rules.map((c) => c.name).join(' ');
    for (const needle of ['cross_midnight', 'month_boundary', 'year_boundary', 'leap_day', 'gap_day', 'serious', 'warns', 'fractional', 'range_']) {
      expect(names, needle).toContain(needle);
    }
    const all = JSON.stringify(CASES.rules.map((c) => c.expect));
    for (const code of RULE_ORDER) expect(all, code).toContain(code);
    for (const sev of ['"medium"', '"high"', '"critical"']) expect(all, sev).toContain(sev);
    expect(SQL_TEST).toContain('src/test/work-rest/fixtures/horCases.json');
  });

  it.each(CASES.rules.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const rules = { ...CASES.defaults.rules, ...(c.rules ?? {}) };
    expect(evaluateRules(c.days, rules, c.range)).toEqual(c.expect);
  });
});
