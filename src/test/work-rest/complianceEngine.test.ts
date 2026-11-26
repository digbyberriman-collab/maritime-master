import { describe, expect, it } from 'vitest';
import {
  calculateCompliance,
  hasOverlappingBlocks,
} from '@/modules/work-rest/lib/complianceEngine';
import { DailyRecord, DEFAULT_RULE_SET } from '@/modules/work-rest/types';

const CREW = '00000000-0000-0000-0000-000000000001';
const VESSEL = '00000000-0000-0000-0000-000000000002';

function day(date: string, work: Array<[number, number]>): DailyRecord {
  return {
    crew_id: CREW,
    vessel_id: VESSEL,
    record_date: date,
    blocks: work.map(([s, e]) => ({
      block_type: 'work',
      start_minute: s * 60,
      end_minute: e * 60,
    })),
  };
}

describe('compliance engine', () => {
  it('flags a compliant day with 14h rest as compliant', () => {
    const r = calculateCompliance([day('2026-05-01', [[8, 18]])], DEFAULT_RULE_SET);
    expect(r.daily_summary[0].rest_minutes).toBe(14 * 60);
    expect(r.daily_summary[0].is_compliant).toBe(true);
    expect(r.non_conformities.find((n) => n.rule_code === 'REST_24H_MIN')).toBeUndefined();
  });

  it('detects rest below 10h in a 24h period', () => {
    // 16h work in a single block ⇒ 8h rest
    const r = calculateCompliance([day('2026-05-01', [[6, 22]])], DEFAULT_RULE_SET);
    const nc = r.non_conformities.find((n) => n.rule_code === 'REST_24H_MIN');
    expect(nc).toBeDefined();
    expect(nc!.measured_value).toBe(8);
    expect(nc!.threshold_value).toBe(10);
  });

  it('detects rest split into more than 2 periods', () => {
    // 4 work blocks ⇒ 5 rest blocks (one before, between each, one after)
    const r = calculateCompliance(
      [day('2026-05-01', [[2, 4], [6, 8], [10, 12], [14, 16]])],
      DEFAULT_RULE_SET
    );
    const nc = r.non_conformities.find((n) => n.rule_code === 'REST_PERIODS_MAX');
    expect(nc).toBeDefined();
    expect(nc!.measured_value).toBeGreaterThan(2);
  });

  it('detects no rest period of at least 6 hours', () => {
    // Lots of small rest gaps, none ≥ 6h
    const r = calculateCompliance(
      [day('2026-05-01', [[0, 5], [10, 15], [20, 24]])], // 5h gap, 5h gap, 5h gap
      DEFAULT_RULE_SET
    );
    const nc = r.non_conformities.find((n) => n.rule_code === 'REST_LONG_BLOCK_MIN');
    expect(nc).toBeDefined();
  });

  it('flags 7-day rest below 77h', () => {
    // 8 days where each day has 8h rest ⇒ 56h in any 7-day window
    const records = Array.from({ length: 8 }, (_, i) =>
      day(`2026-05-0${i + 1}`, [[0, 16]]) // 16h work, 8h rest
    );
    const r = calculateCompliance(records, DEFAULT_RULE_SET);
    expect(r.non_conformities.some((n) => n.rule_code === 'REST_7D_MIN')).toBe(true);
  });

  it('flags interval between rest periods exceeding 14 hours', () => {
    // Continuous work from 02:00 to 22:00 (single block) gives a 20h gap between
    // the night-rest at start and the night-rest at end.
    const r = calculateCompliance([day('2026-05-01', [[2, 22]])], DEFAULT_RULE_SET);
    const nc = r.non_conformities.find((n) => n.rule_code === 'REST_INTERVAL_MAX');
    expect(nc).toBeDefined();
  });

  it('rolling 7d window passes for typical compliant pattern', () => {
    // 7 days of 14h rest (work 09:00-19:00 = 10h work) ⇒ 7 * 14 = 98h ≥ 77h
    const records = Array.from({ length: 7 }, (_, i) =>
      day(`2026-05-0${i + 1}`, [[9, 19]])
    );
    const r = calculateCompliance(records, DEFAULT_RULE_SET);
    expect(r.rolling_7d.every((w) => w.passes)).toBe(true);
  });

  it('detects overlapping work blocks within a single day', () => {
    expect(
      hasOverlappingBlocks([
        { block_type: 'work', start_minute: 0, end_minute: 240 },
        { block_type: 'work', start_minute: 180, end_minute: 360 },
      ])
    ).toBe(true);
    expect(
      hasOverlappingBlocks([
        { block_type: 'work', start_minute: 0, end_minute: 240 },
        { block_type: 'work', start_minute: 300, end_minute: 480 },
      ])
    ).toBe(false);
  });

  it('treats unmarked time as rest by default', () => {
    // Empty day ⇒ 24h rest, compliant for 24h rule, but 0 work
    const r = calculateCompliance([day('2026-05-01', [])], DEFAULT_RULE_SET);
    expect(r.daily_summary[0].rest_minutes).toBe(24 * 60);
    expect(r.daily_summary[0].work_minutes).toBe(0);
  });

  it('totals work and rest minutes', () => {
    const r = calculateCompliance([day('2026-05-01', [[8, 18]])], DEFAULT_RULE_SET);
    expect(r.totals.work_minutes).toBe(10 * 60);
    expect(r.totals.rest_minutes).toBe(14 * 60);
  });

  it('respects custom rule sets', () => {
    // Stricter rules: 12h rest required
    const r = calculateCompliance(
      [day('2026-05-01', [[8, 18]])], // 14h rest, 10h work
      { ...DEFAULT_RULE_SET, min_rest_per_24h: 12 }
    );
    expect(r.non_conformities.some((n) => n.rule_code === 'REST_24H_MIN')).toBe(false);

    const r2 = calculateCompliance(
      [day('2026-05-01', [[8, 18]])],
      { ...DEFAULT_RULE_SET, min_rest_per_24h: 16 }
    );
    expect(r2.non_conformities.some((n) => n.rule_code === 'REST_24H_MIN')).toBe(true);
  });
});
