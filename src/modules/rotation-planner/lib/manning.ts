/**
 * Manning by day (gap/04 C47, C48, W7; D-X1-16; X1-09): the bands, the
 * reader of vessel_manning_by_day's rows, the per-day totals for the On
 * board row and the critical spans the timeline lists as manning gaps.
 *
 * `manningBand` is the exact mirror of planner_manning_band() in
 * 20261124060900_crew_planner_periods.sql; the SQL test loads this file and
 * compares the two over every combination of aboard, qualified, minimum
 * and maximum up to 4. Pure: only relative imports.
 */
import { addDays, compareDates, daysInclusive } from './duration';

export const MANNING_BANDS = ['critical', 'at_minimum', 'normal', 'overmanned'] as const;
export type ManningBand = (typeof MANNING_BANDS)[number];

/**
 * The band of a position on a day, first match wins: critical (qualified
 * below a minimum above zero), at_minimum (qualified at that minimum),
 * overmanned (aboard above the maximum, when one is set), normal.
 */
export function manningBand(aboard: number, qualified: number, min: number, max: number | null): ManningBand {
  const m = min ?? 0;
  if (m > 0 && (qualified ?? 0) < m) return 'critical';
  if (m > 0 && (qualified ?? 0) === m) return 'at_minimum';
  if (max !== null && max !== undefined && (aboard ?? 0) > max) return 'overmanned';
  return 'normal';
}

/** How many qualified people a position is short of its minimum (never negative). */
export const shortBy = (qualified: number, min: number): number => Math.max((min ?? 0) - (qualified ?? 0), 0);

/** One row of vessel_manning_by_day: a day and a position (a null position: titles that map to none). */
export interface ManningDayRow {
  day: string;
  positionId: string | null;
  positionKey: string | null;
  positionName: string | null;
  departmentKey: string | null;
  sortOrder: number | null;
  aboard: number;
  qualified: number;
  min: number;
  max: number | null;
  shortBy: number;
  band: ManningBand;
}

/** A manning answer that does not have the shape the planner needs. */
export class ManningShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManningShapeError';
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, field: string, i: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new ManningShapeError(`Manning row ${i + 1}: ${field} is not a count.`);
  return v;
};
const strOrNull = (v: unknown, field: string, i: number): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new ManningShapeError(`Manning row ${i + 1}: ${field} is not text.`);
  return v;
};

/** Reads vessel_manning_by_day's rows strictly (snake case, as the RPC answers). */
export function parseManningRows(rows: unknown): ManningDayRow[] {
  if (!Array.isArray(rows)) throw new ManningShapeError('Manning came back in an unexpected shape.');
  return rows.map((row: unknown, i) => {
    if (!row || typeof row !== 'object') throw new ManningShapeError(`Manning row ${i + 1} is not an object.`);
    const r = row as Record<string, unknown>;
    if (typeof r.day !== 'string' || !DATE_ONLY.test(r.day)) throw new ManningShapeError(`Manning row ${i + 1} has no day.`);
    if (!(MANNING_BANDS as readonly string[]).includes(r.band as string)) throw new ManningShapeError(`Manning row ${i + 1} has an unknown band.`);
    const max = r.max_on_board === null || r.max_on_board === undefined ? null : int(r.max_on_board, 'max_on_board', i);
    const sortOrder = r.sort_order === null || r.sort_order === undefined ? null : Number(r.sort_order);
    if (sortOrder !== null && !Number.isFinite(sortOrder)) throw new ManningShapeError(`Manning row ${i + 1}: sort_order is not a number.`);
    return {
      day: r.day,
      positionId: strOrNull(r.position_id, 'position_id', i),
      positionKey: strOrNull(r.position_key, 'position_key', i),
      positionName: strOrNull(r.position_name, 'position_name', i),
      departmentKey: strOrNull(r.department_key, 'department_key', i),
      sortOrder,
      aboard: int(r.aboard, 'aboard', i),
      qualified: int(r.qualified, 'qualified', i),
      min: int(r.min_on_board, 'min_on_board', i),
      max,
      shortBy: int(r.short_by, 'short_by', i),
      band: r.band as ManningBand,
    };
  });
}

/** The severity order of the bands for a total row (worst first). */
const TOTAL_BAND_ORDER: readonly ManningBand[] = ['critical', 'at_minimum', 'overmanned', 'normal'];

export interface ManningDayTotal {
  day: string;
  aboard: number;
  qualified: number;
  min: number;
  /** The sum of the maximums, or null when a position with people or a minimum has none. */
  max: number | null;
  /** The worst position band of the day, in the band precedence (critical, at minimum, overmanned, normal). */
  band: ManningBand;
  criticalPositions: number;
}

/**
 * The On board total of each day (the manning grid's total row): sums of
 * aboard, qualified and minimum, and the worst band of its positions, so a
 * short position is never hidden by a well-crewed vessel overall. Days in
 * ascending order.
 */
export function manningTotals(rows: readonly ManningDayRow[]): ManningDayTotal[] {
  const byDay = new Map<string, ManningDayRow[]>();
  for (const r of rows) {
    const list = byDay.get(r.day);
    if (list) list.push(r);
    else byDay.set(r.day, [r]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => compareDates(a, b))
    .map(([day, list]) => {
      let band: ManningBand = 'normal';
      for (const r of list) if (TOTAL_BAND_ORDER.indexOf(r.band) < TOTAL_BAND_ORDER.indexOf(band)) band = r.band;
      const capped = list.filter((r) => r.aboard > 0 || r.min > 0);
      const max = capped.every((r) => r.max !== null) ? capped.reduce((n, r) => n + (r.max ?? 0), 0) : null;
      return {
        day,
        aboard: list.reduce((n, r) => n + r.aboard, 0),
        qualified: list.reduce((n, r) => n + r.qualified, 0),
        min: list.reduce((n, r) => n + r.min, 0),
        max,
        band,
        criticalPositions: list.filter((r) => r.band === 'critical').length,
      };
    });
}

/** A run of consecutive days a position spends in one band (the timeline's manning gap rows read the critical ones). */
export interface ManningSpan {
  positionId: string | null;
  positionName: string | null;
  departmentKey: string | null;
  band: ManningBand;
  start: string;
  end: string;
  days: number;
  min: number;
  /** The largest shortfall in the span. */
  worstShortBy: number;
}

/**
 * The spans of consecutive days in a band, per position (default: the
 * critical ones), ordered by start, then the position's rank order and name.
 * A gap in the days (a day not in the rows) ends a span.
 */
export function bandSpans(rows: readonly ManningDayRow[], band: ManningBand = 'critical'): ManningSpan[] {
  const byPosition = new Map<string, ManningDayRow[]>();
  for (const r of rows) {
    const k = r.positionId ?? '';
    const list = byPosition.get(k);
    if (list) list.push(r);
    else byPosition.set(k, [r]);
  }
  const spans: Array<{ span: ManningSpan; sortOrder: number | null }> = [];
  for (const list of byPosition.values()) {
    const sorted = [...list].sort((a, b) => compareDates(a.day, b.day));
    let open: { span: ManningSpan; sortOrder: number | null } | null = null;
    for (const r of sorted) {
      if (open !== null && r.band === band && addDays(open.span.end, 1) === r.day) {
        open.span.end = r.day;
        open.span.days = daysInclusive(open.span.start, open.span.end);
        open.span.worstShortBy = Math.max(open.span.worstShortBy, r.shortBy);
        open.span.min = Math.max(open.span.min, r.min);
        continue;
      }
      if (open) spans.push(open);
      open =
        r.band === band
          ? {
              span: {
                positionId: r.positionId,
                positionName: r.positionName,
                departmentKey: r.departmentKey,
                band,
                start: r.day,
                end: r.day,
                days: 1,
                min: r.min,
                worstShortBy: r.shortBy,
              },
              sortOrder: r.sortOrder,
            }
          : null;
    }
    if (open) spans.push(open);
  }
  return spans
    .sort(
      (a, b) =>
        compareDates(a.span.start, b.span.start) ||
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        (a.span.positionName ?? '').localeCompare(b.span.positionName ?? ''),
    )
    .map((x) => x.span);
}

/** The gap row's sentence: "Captain needs 1 on board, short by 1" (gap/04 C47). */
export function manningGapLabel(span: Pick<ManningSpan, 'positionName' | 'min' | 'worstShortBy'>): string {
  const who = span.positionName ?? 'Unmatched titles';
  return `${who} needs ${span.min} on board, short by ${span.worstShortBy}`;
}
