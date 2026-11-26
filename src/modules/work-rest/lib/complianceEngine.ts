// Compliance engine for Hours of Work and Rest (gap/04 C38, C46, W6;
// DECISIONS D-X1-9). Pure and deterministic; the SQL port
// work_rest_rule_eval (20261124060700_crew_hor_engine.sql) gives the same
// answers, held together by the shared cases in
// src/test/work-rest/fixtures/horCases.json (vitest and the SQL parity
// block both assert them).
//
// The model (one person, every vessel's days together):
//
// - A day is recorded when it has a record. Its work is the union of its
//   work blocks (clamped to 0..1440, empty ones dropped); every other minute
//   of a recorded day is rest. Days without a record are unknown, never rest.
// - Consecutive recorded days form a run. Work and rest periods are merged
//   across midnight inside a run, so a night's rest is one period.
// - Every rule runs per recorded day, on the vessel's local clock (1440-minute
//   days, as the entry grid shows them), and a window is evaluated only when
//   every minute of it is recorded:
//     REST_24H_MIN       the least rest in any 24 h window ending that day
//                        (end in (00:00, 24:00]) is below the minimum
//                        (10 h). Serious below 4 h (critical); high when
//                        more than 2 h short; else medium.
//     REST_7D_MIN        the same over 7 x 24 h windows (77 h). Serious
//                        below 50 h (critical); medium within the 7-day
//                        warning margin (3 h short or less); else high.
//     REST_PERIODS_MAX   more rest periods touch the day than allowed (2;
//                        a period across midnight counts in both days).
//     REST_LONG_BLOCK_MIN no rest period touching the day lasts the minimum
//                        long block (6 h), counting each period whole.
//     REST_INTERVAL_MAX  a work period (the interval between two rest
//                        periods) longer than the maximum (14 h); it belongs
//                        to the day it ends in, the longest one per day.
//   A window's least rest is exact: rest in a window is piecewise linear in
//   its start, so the minimum is at a period boundary or at the ends of the
//   day's range; ties take the latest window.
// - A day is in breach when a non-conformity belongs to it, and in warning
//   when it is not and its least 24 h or 7-day rest is at or above the
//   minimum but within the warning margin (1 h / 3 h).
// - Deficit = threshold - measured, in hours, both to 2 decimals; null for
//   the period count and the interval rule.

import {
  ComplianceResult,
  ComplianceWindow,
  DailyRecord,
  DaySummary,
  DEFAULT_RULE_SET,
  DEFAULT_THRESHOLDS,
  NonConformity,
  RuleCode,
  RuleSet,
  Severity,
  WorkRestBlock,
} from '../types';

const MINUTES_PER_DAY = 1440;
const HOUR = 60;
const WEEK = 7 * MINUTES_PER_DAY;

// ---------------------------------------------------------------- parity core

/** One recorded day for the engine: its date and its work intervals in minutes. */
export interface EngineDay {
  date: string;
  work: Array<[number, number]>;
}

/** The rule values in hours (thresholds may have two decimals, as work_rest_rule_sets stores them). */
export interface EngineRules {
  min_rest_24h: number;
  min_rest_7d: number;
  max_periods: number;
  min_long_block: number;
  max_interval: number;
  warn_24h: number;
  warn_7d: number;
  serious_24h: number;
  serious_7d: number;
}

/** A day's answer (the SQL evaluator's `days` items). */
export interface EngineDayResult {
  date: string;
  work_minutes: number;
  rest_minutes: number;
  rest_period_count: number;
  longest_rest_minutes: number;
  min_rest_24h: number | null;
  min_rest_7d: number | null;
  /** Local window of the least 24 h rest, 'YYYY-MM-DDTHH:MM'. */
  window_24h_start: string | null;
  window_24h_end: string | null;
  window_7d_start: string | null;
  window_7d_end: string | null;
  breach: boolean;
  warning: boolean;
}

/** A breach (the SQL evaluator's `non_conformities` items); windows are local 'YYYY-MM-DDTHH:MM'. */
export interface EngineBreach {
  day: string;
  rule_code: RuleCode;
  window_start: string;
  window_end: string;
  measured: number;
  threshold: number;
  deficit: number | null;
  severity: Severity;
  is_serious: boolean;
}

export interface EngineResult {
  days: EngineDayResult[];
  non_conformities: EngineBreach[];
}

/** The order breaches of one day are listed in (both engines). */
export const RULE_ORDER: readonly RuleCode[] = [
  'REST_24H_MIN',
  'REST_7D_MIN',
  'REST_PERIODS_MAX',
  'REST_LONG_BLOCK_MIN',
  'REST_INTERVAL_MAX',
];

interface Interval {
  s: number;
  e: number;
}

interface Run {
  start: number;
  end: number;
  work: Interval[];
  rest: Interval[];
  /** Work period boundaries, ascending. */
  bounds: number[];
}

const DAY_MS = 86_400_000;

/** Whole days from 1970-01-01 (dates are YYYY-MM-DD, read as UTC midnights). */
function dayNumber(date: string): number {
  return Math.round(new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime() / DAY_MS);
}

function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Absolute local minute -> 'YYYY-MM-DDTHH:MM' (minutes from 1970-01-01 00:00 local). */
export function localStamp(abs: number): string {
  return new Date(abs * 60_000).toISOString().slice(0, 16);
}

/** Hours -> minutes, exact to a tenth of a minute (rule values have at most two decimals). */
function minutesOf(hours: number): number {
  return Math.round(hours * 600) / 10;
}

/** Minutes -> hours to 2 decimals (never on a half: minutes * 5 / 3 is never k + 0.5). */
function hoursOf(minutes: number): number {
  return Math.round((minutes * 5) / 3) / 100;
}

/** A rule value in hundredths of an hour (it has at most two decimals). */
function hundredths(hours: number): number {
  return Math.round(hours * 100);
}

function clampMinute(n: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(n)));
}

/** The union of intervals (touching ones merged), ascending. */
function union(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.e > i.s).sort((a, b) => a.s - b.s || a.e - b.e);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.s <= last.e) {
      if (i.e > last.e) last.e = i.e;
    } else {
      out.push({ s: i.s, e: i.e });
    }
  }
  return out;
}

function overlap(a: Interval, s: number, e: number): number {
  return Math.max(0, Math.min(a.e, e) - Math.max(a.s, s));
}

function workIn(run: Run, s: number, e: number): number {
  let total = 0;
  for (const w of run.work) total += overlap(w, s, e);
  return total;
}

/**
 * The least rest of a window of `length` minutes whose end falls in the day
 * starting at `d0` (end in (d0, d0 + 1440]) and that lies wholly inside the
 * run; ties take the latest window. Null when no such window exists.
 */
function leastRest(run: Run, d0: number, length: number): { rest: number; start: number } | null {
  const lo = Math.max(d0 - length + 1, run.start);
  const hi = Math.min(d0 + MINUTES_PER_DAY - length, run.end - length);
  if (lo > hi) return null;
  const candidates = new Set<number>([lo, hi]);
  for (const b of run.bounds) {
    if (b > lo && b < hi) candidates.add(b);
    const back = b - length;
    if (back > lo && back < hi) candidates.add(back);
  }
  let best: { rest: number; start: number } | null = null;
  for (const t of Array.from(candidates).sort((a, b) => a - b)) {
    const rest = length - workIn(run, t, t + length);
    if (!best || rest <= best.rest) best = { rest, start: t };
  }
  return best;
}

function rulesOf(ruleSet: RuleSet): EngineRules {
  return {
    min_rest_24h: ruleSet.min_rest_per_24h,
    min_rest_7d: ruleSet.min_rest_per_7d,
    max_periods: ruleSet.max_rest_periods_per_24h,
    min_long_block: ruleSet.min_long_rest_block,
    max_interval: ruleSet.max_interval_between_rest,
    warn_24h: ruleSet.warning_margin_24h ?? DEFAULT_THRESHOLDS.warning_margin_24h,
    warn_7d: ruleSet.warning_margin_7d ?? DEFAULT_THRESHOLDS.warning_margin_7d,
    serious_24h: ruleSet.serious_24h ?? DEFAULT_THRESHOLDS.serious_24h,
    serious_7d: ruleSet.serious_7d ?? DEFAULT_THRESHOLDS.serious_7d,
  };
}

/** The engine rules of a rule set (the defaults fill the margins and serious thresholds). */
export const engineRulesOf = rulesOf;

/** Breach measured in minutes against a threshold in hours: measured, threshold and deficit in hours. */
function hoursFigures(measuredMinutes: number, thresholdHours: number): { measured: number; threshold: number; deficit: number } {
  const measured = hoursOf(measuredMinutes);
  const threshold = hundredths(thresholdHours) / 100;
  return { measured, threshold, deficit: (hundredths(thresholdHours) - Math.round(measured * 100)) / 100 };
}

/** Recorded days (de-duplicated by date, the first wins) as runs of consecutive days with their periods. */
function buildRuns(input: EngineDay[]): { dayNumbers: number[]; runs: Run[]; runOfDay: Map<number, Run> } {
  const seen = new Map<number, Interval[]>();
  for (const day of input) {
    const n = dayNumber(day.date);
    if (seen.has(n)) continue;
    const d0 = n * MINUTES_PER_DAY;
    seen.set(
      n,
      (day.work ?? [])
        .map(([s, e]) => ({ s: d0 + clampMinute(s), e: d0 + clampMinute(e) }))
        .filter((i) => i.e > i.s),
    );
  }
  const dayNumbers = Array.from(seen.keys()).sort((a, b) => a - b);

  // Runs of consecutive recorded days, with their work and rest periods.
  const runs: Run[] = [];
  const runOfDay = new Map<number, Run>();
  for (const n of dayNumbers) {
    let run = runs[runs.length - 1];
    if (!run || run.end !== n * MINUTES_PER_DAY) {
      run = { start: n * MINUTES_PER_DAY, end: n * MINUTES_PER_DAY, work: [], rest: [], bounds: [] };
      runs.push(run);
    }
    run.end = (n + 1) * MINUTES_PER_DAY;
    run.work.push(...(seen.get(n) ?? []));
    runOfDay.set(n, run);
  }
  for (const run of runs) {
    run.work = union(run.work);
    let cursor = run.start;
    for (const w of run.work) {
      if (w.s > cursor) run.rest.push({ s: cursor, e: w.s });
      cursor = w.e;
    }
    if (cursor < run.end) run.rest.push({ s: cursor, e: run.end });
    run.bounds = Array.from(new Set(run.work.flatMap((w) => [w.s, w.e]))).sort((a, b) => a - b);
  }

  return { dayNumbers, runs, runOfDay };
}

/**
 * Evaluates the rules over the recorded days (the parity core). `range`
 * limits the answer to the days from..to (inclusive); every given day still
 * counts as context. Days are de-duplicated by date (the first wins).
 */
export function evaluateRules(input: EngineDay[], rules: EngineRules, range?: { from?: string | null; to?: string | null }): EngineResult {
  const { dayNumbers, runs, runOfDay } = buildRuns(input);

  const from = range?.from ? dayNumber(range.from) : -Infinity;
  const to = range?.to ? dayNumber(range.to) : Infinity;

  const thr24 = minutesOf(rules.min_rest_24h);
  const thr7 = minutesOf(rules.min_rest_7d);
  const warn24 = minutesOf(rules.warn_24h);
  const warn7 = minutesOf(rules.warn_7d);
  const serious24 = minutesOf(rules.serious_24h);
  const serious7 = minutesOf(rules.serious_7d);
  const high24 = minutesOf(rules.min_rest_24h - 2);
  const longMin = minutesOf(rules.min_long_block);
  const intervalMax = minutesOf(rules.max_interval);

  const breaches: EngineBreach[] = [];
  const days: EngineDayResult[] = [];

  // The interval rule, per run: work periods longer than the maximum, by the day they end in.
  const intervalByDay = new Map<number, Interval>();
  for (const run of runs) {
    for (const w of run.work) {
      if (w.e - w.s <= intervalMax) continue;
      const day = Math.floor((w.e - 1) / MINUTES_PER_DAY);
      const held = intervalByDay.get(day);
      if (!held || w.e - w.s > held.e - held.s || (w.e - w.s === held.e - held.s && w.e > held.e)) {
        intervalByDay.set(day, w);
      }
    }
  }

  for (const n of dayNumbers) {
    if (n < from || n > to) continue;
    const run = runOfDay.get(n);
    if (!run) continue;
    const d0 = n * MINUTES_PER_DAY;
    const d1 = d0 + MINUTES_PER_DAY;
    const date = dateOfDay(n);
    const dayBreaches: EngineBreach[] = [];

    const work = workIn(run, d0, d1);
    const touching = run.rest.filter((r) => r.s < d1 && r.e > d0);
    const longest = touching.reduce((m, r) => Math.max(m, r.e - r.s), 0);

    const w24 = leastRest(run, d0, MINUTES_PER_DAY);
    const w7 = leastRest(run, d0, WEEK);

    if (w24 && w24.rest < thr24) {
      const f = hoursFigures(w24.rest, rules.min_rest_24h);
      const serious = w24.rest < serious24;
      dayBreaches.push({
        day: date,
        rule_code: 'REST_24H_MIN',
        window_start: localStamp(w24.start),
        window_end: localStamp(w24.start + MINUTES_PER_DAY),
        ...f,
        severity: serious ? 'critical' : w24.rest < high24 ? 'high' : 'medium',
        is_serious: serious,
      });
    }
    if (w7 && w7.rest < thr7) {
      const f = hoursFigures(w7.rest, rules.min_rest_7d);
      const serious = w7.rest < serious7;
      dayBreaches.push({
        day: date,
        rule_code: 'REST_7D_MIN',
        window_start: localStamp(w7.start),
        window_end: localStamp(w7.start + WEEK),
        ...f,
        severity: serious ? 'critical' : thr7 - w7.rest <= warn7 ? 'medium' : 'high',
        is_serious: serious,
      });
    }
    if (touching.length > rules.max_periods) {
      dayBreaches.push({
        day: date,
        rule_code: 'REST_PERIODS_MAX',
        window_start: localStamp(d0),
        window_end: localStamp(d1),
        measured: touching.length,
        threshold: rules.max_periods,
        deficit: null,
        severity: 'medium',
        is_serious: false,
      });
    }
    if (longest < longMin) {
      dayBreaches.push({
        day: date,
        rule_code: 'REST_LONG_BLOCK_MIN',
        window_start: localStamp(d0),
        window_end: localStamp(d1),
        ...hoursFigures(longest, rules.min_long_block),
        severity: 'high',
        is_serious: false,
      });
    }
    const interval = intervalByDay.get(n);
    if (interval) {
      dayBreaches.push({
        day: date,
        rule_code: 'REST_INTERVAL_MAX',
        window_start: localStamp(interval.s),
        window_end: localStamp(interval.e),
        measured: hoursOf(interval.e - interval.s),
        threshold: hundredths(rules.max_interval) / 100,
        deficit: null,
        severity: 'high',
        is_serious: false,
      });
    }

    const breach = dayBreaches.length > 0;
    const near24 = w24 !== null && w24.rest >= thr24 && w24.rest < thr24 + warn24;
    const near7 = w7 !== null && w7.rest >= thr7 && w7.rest < thr7 + warn7;
    days.push({
      date,
      work_minutes: work,
      rest_minutes: MINUTES_PER_DAY - work,
      rest_period_count: touching.length,
      longest_rest_minutes: longest,
      min_rest_24h: w24 ? w24.rest : null,
      min_rest_7d: w7 ? w7.rest : null,
      window_24h_start: w24 ? localStamp(w24.start) : null,
      window_24h_end: w24 ? localStamp(w24.start + MINUTES_PER_DAY) : null,
      window_7d_start: w7 ? localStamp(w7.start) : null,
      window_7d_end: w7 ? localStamp(w7.start + WEEK) : null,
      breach,
      warning: !breach && (near24 || near7),
    });
    breaches.push(...dayBreaches);
  }

  return { days, non_conformities: breaches };
}

// ---------------------------------------------------------------- the app's API

/** A record's work blocks as engine intervals (rest blocks carry no rule meaning: unmarked time is rest). */
export function engineDayOf(record: Pick<DailyRecord, 'record_date' | 'blocks'>): EngineDay {
  return {
    date: record.record_date,
    work: record.blocks
      .filter((b) => b.block_type === 'work')
      .map((b) => [b.start_minute, b.end_minute] as [number, number]),
  };
}

interface NormalisedBlock {
  /** absolute minute from the earliest record's midnight */
  startAbs: number;
  endAbs: number;
  type: 'work' | 'rest';
  date: string;
}

/**
 * The records as one absolute timeline from the earliest record's midnight:
 * work periods (the union of each day's work blocks, merged across
 * midnight) and the rest between them, inside each run of consecutive
 * recorded days. Unrecorded days have no blocks. Both modes treat unmarked
 * time as rest (the setting has never changed that); the flag is kept for
 * the callers that pass it.
 */
export function buildAbsoluteTimeline(
  records: DailyRecord[],
  defaultUnmarkedAsRest = true,
): { baseDate: string; blocks: NormalisedBlock[]; rangeEnd: number } {
  void defaultUnmarkedAsRest;
  if (records.length === 0) {
    return { baseDate: '1970-01-01', blocks: [], rangeEnd: 0 };
  }
  const { dayNumbers, runs } = buildRuns(records.map(engineDayOf));
  const baseDay = dayNumbers[0];
  const base = baseDay * MINUTES_PER_DAY;
  const blocks: NormalisedBlock[] = [];
  for (const run of runs) {
    const periods = [
      ...run.work.map((w) => ({ ...w, type: 'work' as const })),
      ...run.rest.map((r) => ({ ...r, type: 'rest' as const })),
    ].sort((a, b) => a.s - b.s);
    for (const p of periods) {
      blocks.push({ startAbs: p.s - base, endAbs: p.e - base, type: p.type, date: dateOfDay(Math.floor(p.s / MINUTES_PER_DAY)) });
    }
  }
  return { baseDate: dateOfDay(baseDay), blocks, rangeEnd: (dayNumbers[dayNumbers.length - 1] + 1) * MINUTES_PER_DAY - base };
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

/** A local stamp as the legacy ISO form (the vessel's local time written as UTC). */
const isoOf = (stamp: string): string => `${stamp}:00.000Z`;

const fmtHours = (h: number): string => String(+h.toFixed(2));

function describe(code: RuleCode, rules: EngineRules): { description: string; correction: string } {
  switch (code) {
    case 'REST_24H_MIN':
      return {
        description: `Rest below ${fmtHours(rules.min_rest_24h)} hours in a 24-hour period.`,
        correction: `Reduce work hours or rearrange shifts so rest in any 24h period is ≥ ${fmtHours(rules.min_rest_24h)}h.`,
      };
    case 'REST_7D_MIN':
      return {
        description: `Rolling 7-day rest below ${fmtHours(rules.min_rest_7d)} hours.`,
        correction: `Plan recovery rest days to bring the 7-day total to ≥ ${fmtHours(rules.min_rest_7d)}h.`,
      };
    case 'REST_PERIODS_MAX':
      return {
        description: `Rest split into more than ${rules.max_periods} periods.`,
        correction: `Consolidate rest into ≤ ${rules.max_periods} periods.`,
      };
    case 'REST_LONG_BLOCK_MIN':
      return {
        description: `No rest period of at least ${fmtHours(rules.min_long_block)} hours.`,
        correction: `Provide one continuous rest period of ≥ ${fmtHours(rules.min_long_block)}h.`,
      };
    case 'REST_INTERVAL_MAX':
      return {
        description: `Gap between rest periods exceeds ${fmtHours(rules.max_interval)} hours.`,
        correction: `Insert a rest break so the interval is ≤ ${fmtHours(rules.max_interval)}h.`,
      };
  }
}

/** The wording of a rule (both writers use it). */
export const describeRule = describe;

/** Informational rolling windows (hourly 24 h, daily 7-day steps), wholly recorded ones only. */
function rollingWindows(records: DailyRecord[], rules: EngineRules): { r24: ComplianceWindow[]; r7: ComplianceWindow[] } {
  const r24: ComplianceWindow[] = [];
  const r7: ComplianceWindow[] = [];
  if (records.length === 0) return { r24, r7 };
  const { baseDate, blocks } = buildAbsoluteTimeline(records);
  const base = dayNumber(baseDate) * MINUTES_PER_DAY;
  const work = blocks.filter((b) => b.type === 'work').map((b) => ({ s: b.startAbs, e: b.endAbs }));
  // Runs, relative to the base.
  const dayNums = Array.from(new Set(records.map((r) => dayNumber(r.record_date)))).sort((a, b) => a - b);
  const runs: Interval[] = [];
  for (const n of dayNums) {
    const s = n * MINUTES_PER_DAY - base;
    const last = runs[runs.length - 1];
    if (last && last.e === s) last.e = s + MINUTES_PER_DAY;
    else runs.push({ s, e: s + MINUTES_PER_DAY });
  }
  const restIn = (s: number, e: number) => e - s - work.reduce((t, w) => t + overlap(w, s, e), 0);
  const thr24 = minutesOf(rules.min_rest_24h);
  const thr7 = minutesOf(rules.min_rest_7d);
  for (const run of runs) {
    for (let t = run.s; t + MINUTES_PER_DAY <= run.e; t += HOUR) {
      const rest = restIn(t, t + MINUTES_PER_DAY);
      r24.push({
        check_window: 'rolling_24h',
        window_start: isoOf(localStamp(base + t)),
        window_end: isoOf(localStamp(base + t + MINUTES_PER_DAY)),
        rest_minutes: rest,
        work_minutes: MINUTES_PER_DAY - rest,
        passes: rest >= thr24,
        threshold_minutes: thr24,
      });
    }
    for (let t = run.s; t + WEEK <= run.e; t += MINUTES_PER_DAY) {
      const rest = restIn(t, t + WEEK);
      r7.push({
        check_window: 'rolling_7d',
        window_start: isoOf(localStamp(base + t)),
        window_end: isoOf(localStamp(base + t + WEEK)),
        rest_minutes: rest,
        work_minutes: WEEK - rest,
        passes: rest >= thr7,
        threshold_minutes: thr7,
      });
    }
  }
  return { r24, r7 };
}

/**
 * Main entry point. Returns a complete compliance result for the supplied
 * daily records. Windows are the vessel's local times written in the legacy
 * ISO form (local time with a Z), as the legacy writer has always stored
 * them; the server engine stores real instants in the vessel's zone.
 */
export function calculateCompliance(
  records: DailyRecord[],
  ruleSet: RuleSet = DEFAULT_RULE_SET,
  options: {
    defaultUnmarkedAsRest?: boolean;
    /** Answer only these days (YYYY-MM-DD, inclusive); every record still counts as context (the week before a month). */
    range?: { from: string; to: string };
  } = {},
): ComplianceResult {
  const rules = rulesOf(ruleSet);
  const crewId = records[0]?.crew_id ?? '';
  const result = evaluateRules(records.map(engineDayOf), rules, options.range);

  const non_conformities: NonConformity[] = result.non_conformities.map((b) => {
    const text = describe(b.rule_code, rules);
    return {
      crew_id: crewId,
      rule_code: b.rule_code,
      rule_description: text.description,
      severity: b.severity,
      window_start: isoOf(b.window_start),
      window_end: isoOf(b.window_end),
      measured_value: b.measured,
      threshold_value: b.threshold,
      suggested_correction: text.correction,
      status: 'open',
      breach_day: b.day,
      is_serious: b.is_serious,
      deficit_hours: b.deficit,
    };
  });

  const daily_summary: DaySummary[] = result.days.map((d) => ({
    date: d.date,
    work_minutes: d.work_minutes,
    rest_minutes: d.rest_minutes,
    rest_period_count: d.rest_period_count,
    longest_rest_minutes: d.longest_rest_minutes,
    is_compliant: !d.breach,
    breach: d.breach,
    warning: d.warning,
    min_rest_24h_minutes: d.min_rest_24h,
    min_rest_7d_minutes: d.min_rest_7d,
  }));

  const all = rollingWindows(records, rules);
  // With a range, only the windows that end in it (end in (from 00:00, to + 1 day 00:00]).
  const inRange = (w: ComplianceWindow) => {
    if (!options.range) return true;
    const end = w.window_end.slice(0, 16);
    const startOfRange = `${options.range.from}T00:00`;
    const endOfRange = localStamp((dayNumber(options.range.to) + 1) * MINUTES_PER_DAY);
    return end > startOfRange && end <= endOfRange;
  };
  const r24 = all.r24.filter(inRange);
  const r7 = all.r7.filter(inRange);
  const work = result.days.reduce((s, d) => s + d.work_minutes, 0);
  const rest = result.days.reduce((s, d) => s + d.rest_minutes, 0);

  return {
    is_compliant: non_conformities.length === 0,
    daily_summary,
    rolling_24h: r24,
    rolling_7d: r7,
    non_conformities,
    totals: { work_minutes: work, rest_minutes: rest },
  };
}
