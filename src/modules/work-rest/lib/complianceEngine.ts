// Compliance calculation engine for Hours of Work and Rest.
//
// The engine accepts a flat list of WorkRestBlock entries (with attached
// record_date) and a RuleSet, then produces:
//   - per-day summaries (work, rest, period counts, longest rest)
//   - rolling 24h windows
//   - rolling 7d windows
//   - a list of NonConformity records
//
// All inputs are interpreted in *local vessel time*. The engine is
// pure / deterministic and reusable from UI, API and reporting code.

import {
  ComplianceResult,
  ComplianceWindow,
  DailyRecord,
  DEFAULT_RULE_SET,
  NonConformity,
  RuleSet,
  WorkRestBlock,
} from '../types';

const MINUTES_PER_DAY = 1440;
const HOUR = 60;

interface NormalisedBlock {
  /** absolute minute from epoch-day-0 midnight */
  startAbs: number;
  endAbs: number;
  type: 'work' | 'rest';
  date: string;
}

function dayDiffMinutes(date: string, base: string): number {
  // Treat the date strings (YYYY-MM-DD) as UTC midnights and compute
  // their delta in minutes — robust against DST since we only need
  // relative ordering.
  const d = new Date(date + 'T00:00:00Z').getTime();
  const b = new Date(base + 'T00:00:00Z').getTime();
  return Math.round((d - b) / 60000);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Normalise blocks across days into a single absolute timeline. Blocks are
 * assumed not to span midnight (UI splits them on save), but we tolerate
 * that case by clamping.
 */
export function buildAbsoluteTimeline(
  records: DailyRecord[],
  defaultUnmarkedAsRest = true
): { baseDate: string; blocks: NormalisedBlock[]; rangeEnd: number } {
  if (records.length === 0) {
    return { baseDate: '1970-01-01', blocks: [], rangeEnd: 0 };
  }
  const sorted = [...records].sort((a, b) => a.record_date.localeCompare(b.record_date));
  const baseDate = sorted[0].record_date;

  const allBlocks: NormalisedBlock[] = [];

  for (const rec of sorted) {
    const offset = dayDiffMinutes(rec.record_date, baseDate);
    // Sort + clamp blocks within day
    const dayBlocks = [...rec.blocks]
      .map((b) => ({
        ...b,
        start_minute: clamp(b.start_minute, 0, MINUTES_PER_DAY),
        end_minute: clamp(b.end_minute, 0, MINUTES_PER_DAY),
      }))
      .filter((b) => b.end_minute > b.start_minute)
      .sort((a, b) => a.start_minute - b.start_minute);

    if (defaultUnmarkedAsRest) {
      // Treat any unmarked time as rest. Convert work blocks into the
      // canonical work entries; we'll fill gaps with rest below.
      let cursor = 0;
      for (const blk of dayBlocks) {
        if (blk.block_type !== 'work') continue;
        if (blk.start_minute > cursor) {
          allBlocks.push({
            startAbs: offset + cursor,
            endAbs: offset + blk.start_minute,
            type: 'rest',
            date: rec.record_date,
          });
        }
        allBlocks.push({
          startAbs: offset + blk.start_minute,
          endAbs: offset + blk.end_minute,
          type: 'work',
          date: rec.record_date,
        });
        cursor = blk.end_minute;
      }
      if (cursor < MINUTES_PER_DAY) {
        allBlocks.push({
          startAbs: offset + cursor,
          endAbs: offset + MINUTES_PER_DAY,
          type: 'rest',
          date: rec.record_date,
        });
      }
    } else {
      // Both work + rest blocks taken at face value; fill gaps as rest.
      let cursor = 0;
      for (const blk of dayBlocks) {
        if (blk.start_minute > cursor) {
          allBlocks.push({
            startAbs: offset + cursor,
            endAbs: offset + blk.start_minute,
            type: 'rest',
            date: rec.record_date,
          });
        }
        allBlocks.push({
          startAbs: offset + blk.start_minute,
          endAbs: offset + blk.end_minute,
          type: blk.block_type,
          date: rec.record_date,
        });
        cursor = Math.max(cursor, blk.end_minute);
      }
      if (cursor < MINUTES_PER_DAY) {
        allBlocks.push({
          startAbs: offset + cursor,
          endAbs: offset + MINUTES_PER_DAY,
          type: 'rest',
          date: rec.record_date,
        });
      }
    }
  }

  // Merge consecutive same-type blocks (so rest periods that span midnight
  // are properly counted as one period).
  const merged: NormalisedBlock[] = [];
  for (const blk of allBlocks) {
    const last = merged[merged.length - 1];
    if (last && last.type === blk.type && last.endAbs === blk.startAbs) {
      last.endAbs = blk.endAbs;
    } else {
      merged.push({ ...blk });
    }
  }

  const lastDayOffset = dayDiffMinutes(sorted[sorted.length - 1].record_date, baseDate);
  return { baseDate, blocks: merged, rangeEnd: lastDayOffset + MINUTES_PER_DAY };
}

/**
 * Detect overlapping work blocks within the provided list of blocks for a
 * single day. Returns true if any pair overlaps.
 */
export function hasOverlappingBlocks(blocks: WorkRestBlock[]): boolean {
  const sorted = [...blocks]
    .filter((b) => b.block_type === 'work')
    .sort((a, b) => a.start_minute - b.start_minute);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_minute < sorted[i - 1].end_minute) return true;
  }
  return false;
}

function minutesOfTypeInWindow(
  blocks: NormalisedBlock[],
  windowStart: number,
  windowEnd: number,
  type: 'work' | 'rest'
): number {
  let total = 0;
  for (const b of blocks) {
    if (b.type !== type) continue;
    const s = Math.max(b.startAbs, windowStart);
    const e = Math.min(b.endAbs, windowEnd);
    if (e > s) total += e - s;
  }
  return total;
}

interface DaySummary {
  date: string;
  work_minutes: number;
  rest_minutes: number;
  rest_period_count: number;
  longest_rest_minutes: number;
  rest_blocks: NormalisedBlock[];
  is_compliant: boolean;
}

function buildDailySummaries(
  blocks: NormalisedBlock[],
  records: DailyRecord[],
  rules: RuleSet
): DaySummary[] {
  const byDate = new Map<string, NormalisedBlock[]>();
  for (const r of records) byDate.set(r.record_date, []);
  for (const b of blocks) {
    if (!byDate.has(b.date)) byDate.set(b.date, []);
    byDate.get(b.date)!.push(b);
  }
  const summaries: DaySummary[] = [];
  for (const [date, dayBlocks] of byDate) {
    const restBlocks = dayBlocks.filter((b) => b.type === 'rest');
    const workMinutes = dayBlocks
      .filter((b) => b.type === 'work')
      .reduce((s, b) => s + (b.endAbs - b.startAbs), 0);
    const restMinutes = restBlocks.reduce((s, b) => s + (b.endAbs - b.startAbs), 0);
    const longest = restBlocks.reduce((m, b) => Math.max(m, b.endAbs - b.startAbs), 0);

    summaries.push({
      date,
      work_minutes: workMinutes,
      rest_minutes: restMinutes,
      rest_period_count: restBlocks.length,
      longest_rest_minutes: longest,
      rest_blocks: restBlocks,
      is_compliant:
        restMinutes >= rules.min_rest_per_24h * HOUR &&
        restBlocks.length <= rules.max_rest_periods_per_24h &&
        longest >= rules.min_long_rest_block * HOUR,
    });
  }
  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}

function fmt(absMinutes: number, baseDate: string): string {
  const base = new Date(baseDate + 'T00:00:00Z').getTime();
  return new Date(base + absMinutes * 60000).toISOString();
}

/**
 * Main entry point. Returns a complete compliance result for the supplied
 * daily records.
 */
export function calculateCompliance(
  records: DailyRecord[],
  ruleSet: RuleSet = DEFAULT_RULE_SET,
  options: { defaultUnmarkedAsRest?: boolean } = {}
): ComplianceResult {
  const { defaultUnmarkedAsRest = true } = options;
  const { baseDate, blocks, rangeEnd } = buildAbsoluteTimeline(records, defaultUnmarkedAsRest);
  const dailySummaries = buildDailySummaries(blocks, records, ruleSet);

  const ncs: NonConformity[] = [];
  const rolling24: ComplianceWindow[] = [];
  const rolling7: ComplianceWindow[] = [];

  // Daily checks → NCs
  for (const s of dailySummaries) {
    const offset = dayDiffMinutes(s.date, baseDate);
    const windowStart = fmt(offset, baseDate);
    const windowEnd = fmt(offset + MINUTES_PER_DAY, baseDate);
    if (s.rest_minutes < ruleSet.min_rest_per_24h * HOUR) {
      ncs.push({
        crew_id: records[0]?.crew_id ?? '',
        rule_code: 'REST_24H_MIN',
        rule_description: `Rest below ${ruleSet.min_rest_per_24h} hours in a 24-hour period.`,
        severity:
          s.rest_minutes < (ruleSet.min_rest_per_24h - 2) * HOUR ? 'high' : 'medium',
        window_start: windowStart,
        window_end: windowEnd,
        measured_value: +(s.rest_minutes / HOUR).toFixed(2),
        threshold_value: ruleSet.min_rest_per_24h,
        suggested_correction:
          'Reduce work hours or rearrange shifts so rest in any 24h period is ≥ ' +
          ruleSet.min_rest_per_24h + 'h.',
        status: 'open',
      });
    }
    if (s.rest_period_count > ruleSet.max_rest_periods_per_24h) {
      ncs.push({
        crew_id: records[0]?.crew_id ?? '',
        rule_code: 'REST_PERIODS_MAX',
        rule_description:
          'Rest split into more than ' + ruleSet.max_rest_periods_per_24h + ' periods.',
        severity: 'medium',
        window_start: windowStart,
        window_end: windowEnd,
        measured_value: s.rest_period_count,
        threshold_value: ruleSet.max_rest_periods_per_24h,
        suggested_correction:
          'Consolidate rest into ≤ ' + ruleSet.max_rest_periods_per_24h + ' periods.',
        status: 'open',
      });
    }
    if (s.longest_rest_minutes < ruleSet.min_long_rest_block * HOUR) {
      ncs.push({
        crew_id: records[0]?.crew_id ?? '',
        rule_code: 'REST_LONG_BLOCK_MIN',
        rule_description:
          'No rest period of at least ' + ruleSet.min_long_rest_block + ' hours.',
        severity: 'high',
        window_start: windowStart,
        window_end: windowEnd,
        measured_value: +(s.longest_rest_minutes / HOUR).toFixed(2),
        threshold_value: ruleSet.min_long_rest_block,
        suggested_correction:
          'Provide one continuous rest period of ≥ ' + ruleSet.min_long_rest_block + 'h.',
        status: 'open',
      });
    }

    // Interval between consecutive rest periods
    const sortedRest = [...s.rest_blocks].sort((a, b) => a.startAbs - b.startAbs);
    for (let i = 1; i < sortedRest.length; i++) {
      const gap = sortedRest[i].startAbs - sortedRest[i - 1].endAbs;
      if (gap > ruleSet.max_interval_between_rest * HOUR) {
        ncs.push({
          crew_id: records[0]?.crew_id ?? '',
          rule_code: 'REST_INTERVAL_MAX',
          rule_description:
            'Gap between rest periods exceeds ' + ruleSet.max_interval_between_rest + ' hours.',
          severity: 'high',
          window_start: fmt(sortedRest[i - 1].endAbs, baseDate),
          window_end: fmt(sortedRest[i].startAbs, baseDate),
          measured_value: +(gap / HOUR).toFixed(2),
          threshold_value: ruleSet.max_interval_between_rest,
          suggested_correction:
            'Insert a rest break so the interval is ≤ ' +
            ruleSet.max_interval_between_rest + 'h.',
          status: 'open',
        });
      }
    }
  }

  // Rolling 24h windows (1-hour step) — produces a continuous compliance curve
  const stepRolling = HOUR;
  for (let t = 0; t + 24 * HOUR <= rangeEnd; t += stepRolling) {
    const restMin = minutesOfTypeInWindow(blocks, t, t + 24 * HOUR, 'rest');
    const workMin = 24 * HOUR - restMin;
    const passes = restMin >= ruleSet.min_rest_per_24h * HOUR;
    rolling24.push({
      check_window: 'rolling_24h',
      window_start: fmt(t, baseDate),
      window_end: fmt(t + 24 * HOUR, baseDate),
      rest_minutes: restMin,
      work_minutes: workMin,
      passes,
      threshold_minutes: ruleSet.min_rest_per_24h * HOUR,
    });
  }

  // Rolling 7-day windows (1-day step)
  for (let t = 0; t + 7 * MINUTES_PER_DAY <= rangeEnd; t += MINUTES_PER_DAY) {
    const restMin = minutesOfTypeInWindow(blocks, t, t + 7 * MINUTES_PER_DAY, 'rest');
    const workMin = 7 * MINUTES_PER_DAY - restMin;
    const passes = restMin >= ruleSet.min_rest_per_7d * HOUR;
    rolling7.push({
      check_window: 'rolling_7d',
      window_start: fmt(t, baseDate),
      window_end: fmt(t + 7 * MINUTES_PER_DAY, baseDate),
      rest_minutes: restMin,
      work_minutes: workMin,
      passes,
      threshold_minutes: ruleSet.min_rest_per_7d * HOUR,
    });
    if (!passes) {
      ncs.push({
        crew_id: records[0]?.crew_id ?? '',
        rule_code: 'REST_7D_MIN',
        rule_description: `Rolling 7-day rest below ${ruleSet.min_rest_per_7d} hours.`,
        severity: 'critical',
        window_start: fmt(t, baseDate),
        window_end: fmt(t + 7 * MINUTES_PER_DAY, baseDate),
        measured_value: +(restMin / HOUR).toFixed(2),
        threshold_value: ruleSet.min_rest_per_7d,
        suggested_correction:
          'Plan recovery rest days to bring the 7-day total to ≥ ' +
          ruleSet.min_rest_per_7d + 'h.',
        status: 'open',
      });
    }
  }

  const totalWork = blocks.filter((b) => b.type === 'work')
    .reduce((s, b) => s + (b.endAbs - b.startAbs), 0);
  const totalRest = blocks.filter((b) => b.type === 'rest')
    .reduce((s, b) => s + (b.endAbs - b.startAbs), 0);

  const isCompliant = ncs.length === 0;

  return {
    is_compliant: isCompliant,
    daily_summary: dailySummaries.map((d) => ({
      date: d.date,
      work_minutes: d.work_minutes,
      rest_minutes: d.rest_minutes,
      rest_period_count: d.rest_period_count,
      longest_rest_minutes: d.longest_rest_minutes,
      is_compliant: d.is_compliant,
    })),
    rolling_24h: rolling24,
    rolling_7d: rolling7,
    non_conformities: ncs,
    totals: {
      work_minutes: totalWork,
      rest_minutes: totalRest,
    },
  };
}
