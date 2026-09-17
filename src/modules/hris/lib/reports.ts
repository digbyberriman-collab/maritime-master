/**
 * Pure aggregations for HR Reporting & Analytics and the HR dashboard.
 *
 * Everything here takes plain rows and returns plain rows so it can be unit
 * tested with fixtures and reused by the CSV / PDF exports. Dates are ISO
 * `yyyy-MM-dd` strings (Postgres `date` columns); comparisons are done on the
 * day part only, which sorts lexicographically.
 */
import { addMonths, differenceInCalendarDays, format, parseISO, startOfMonth, subMonths } from 'date-fns';

// ---------------------------------------------------------------------------
// Shared row shapes (subsets of the Supabase rows)
// ---------------------------------------------------------------------------

export interface AssignmentLike {
  user_id: string;
  vessel_id: string | null;
  join_date: string;
  leave_date: string | null;
}

export interface ExpiryLike {
  item_type: string;
  due_date: string;
}

export interface ReviewLike {
  review_type: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
}

export interface LeaveRequestLike {
  start_date: string;
  status: string;
}

export interface StatusLike {
  status: string;
}

export interface MonthBucket {
  /** `yyyy-MM` */
  key: string;
  /** `MMM yy` */
  label: string;
  /** `yyyy-MM-01` */
  first: string;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** First 10 characters of an ISO timestamp/date, i.e. the `yyyy-MM-dd` day. */
export const isoDay = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  if (value instanceof Date) return format(value, 'yyyy-MM-dd');
  return value.length >= 10 ? value.slice(0, 10) : null;
};

const monthBucket = (d: Date): MonthBucket => {
  const first = startOfMonth(d);
  return { key: format(first, 'yyyy-MM'), label: format(first, 'MMM yy'), first: format(first, 'yyyy-MM-dd') };
};

/** Inclusive list of month buckets from the month of `from` to the month of `to`. */
export const monthRange = (from: Date, to: Date): MonthBucket[] => {
  const out: MonthBucket[] = [];
  let cursor = startOfMonth(from);
  const end = startOfMonth(to);
  while (cursor.getTime() <= end.getTime()) {
    out.push(monthBucket(cursor));
    cursor = addMonths(cursor, 1);
  }
  return out;
};

/** The last `count` months ending with the month of `to` (default: 12 months). */
export const lastMonths = (to: Date, count = 12): MonthBucket[] => monthRange(subMonths(startOfMonth(to), count - 1), to);

/** Months starting with the month of `from` for `count` months ahead. */
export const nextMonths = (from: Date, count = 6): MonthBucket[] => monthRange(startOfMonth(from), addMonths(startOfMonth(from), count - 1));

// ---------------------------------------------------------------------------
// Headcount
// ---------------------------------------------------------------------------

/** True when the assignment covers `day` (join ≤ day and (no leave or leave ≥ day)). */
export const isOnboardOn = (a: AssignmentLike, day: string): boolean => {
  const join = isoDay(a.join_date);
  if (!join || join > day) return false;
  const leave = isoDay(a.leave_date);
  return !leave || leave >= day;
};

/** Distinct crew onboard on a given day. */
export const headcountOn = (assignments: AssignmentLike[], day: string): number => {
  const users = new Set<string>();
  for (const a of assignments) if (isOnboardOn(a, day)) users.add(a.user_id);
  return users.size;
};

export interface HeadcountPoint {
  month: string;
  label: string;
  headcount: number;
}

/** Crew onboard on the 1st of each month. */
export const headcountTrend = (assignments: AssignmentLike[], months: MonthBucket[]): HeadcountPoint[] =>
  months.map((m) => ({ month: m.key, label: m.label, headcount: headcountOn(assignments, m.first) }));

export interface MovementPoint {
  month: string;
  label: string;
  joiners: number;
  leavers: number;
}

/** Assignments starting / ending in each month (one per assignment, not per crew). */
export const joinersLeavers = (assignments: AssignmentLike[], months: MonthBucket[]): MovementPoint[] => {
  const joins = new Map<string, number>();
  const leaves = new Map<string, number>();
  for (const a of assignments) {
    const j = isoDay(a.join_date);
    if (j) joins.set(j.slice(0, 7), (joins.get(j.slice(0, 7)) ?? 0) + 1);
    const l = isoDay(a.leave_date);
    if (l) leaves.set(l.slice(0, 7), (leaves.get(l.slice(0, 7)) ?? 0) + 1);
  }
  return months.map((m) => ({ month: m.key, label: m.label, joiners: joins.get(m.key) ?? 0, leavers: leaves.get(m.key) ?? 0 }));
};

export interface TurnoverPoint {
  month: string;
  label: string;
  /** Leavers in the 12 months ending with this month. */
  leavers12m: number;
  /** Mean headcount on the 1st of each of those 12 months. */
  avgHeadcount: number;
  /** leavers12m / avgHeadcount × 100, 1 decimal; 0 when there is no headcount. */
  ratePct: number;
}

/** Rolling 12-month turnover: leavers over average monthly headcount. */
export const turnoverRate = (assignments: AssignmentLike[], months: MonthBucket[]): TurnoverPoint[] =>
  months.map((m) => {
    const window = lastMonths(parseISO(m.first), 12);
    const movement = joinersLeavers(assignments, window);
    const leavers12m = movement.reduce((sum, p) => sum + p.leavers, 0);
    const heads = window.map((w) => headcountOn(assignments, w.first));
    const avgHeadcount = heads.reduce((s, h) => s + h, 0) / window.length;
    const ratePct = avgHeadcount > 0 ? Math.round((leavers12m / avgHeadcount) * 1000) / 10 : 0;
    return { month: m.key, label: m.label, leavers12m, avgHeadcount: Math.round(avgHeadcount * 10) / 10, ratePct };
  });

// ---------------------------------------------------------------------------
// Tenure
// ---------------------------------------------------------------------------

export const TENURE_BUCKETS = ['< 6 months', '6–12 months', '1–2 years', '2–5 years', '5+ years'] as const;
export type TenureBucket = (typeof TENURE_BUCKETS)[number];

export const tenureBucket = (days: number): TenureBucket => {
  if (days < 182) return '< 6 months';
  if (days < 365) return '6–12 months';
  if (days < 730) return '1–2 years';
  if (days < 1826) return '2–5 years';
  return '5+ years';
};

export interface TenurePoint {
  bucket: TenureBucket;
  count: number;
}

/**
 * Tenure of crew who are currently onboard (an assignment covering `today`),
 * measured from their earliest join date across all assignments.
 */
export const tenureDistribution = (assignments: AssignmentLike[], today: Date): TenurePoint[] => {
  const day = format(today, 'yyyy-MM-dd');
  const earliest = new Map<string, string>();
  const active = new Set<string>();
  for (const a of assignments) {
    const j = isoDay(a.join_date);
    if (!j) continue;
    const prev = earliest.get(a.user_id);
    if (!prev || j < prev) earliest.set(a.user_id, j);
    if (isOnboardOn(a, day)) active.add(a.user_id);
  }
  const counts = new Map<TenureBucket, number>(TENURE_BUCKETS.map((b) => [b, 0]));
  for (const user of active) {
    const start = earliest.get(user);
    if (!start) continue;
    const days = differenceInCalendarDays(today, parseISO(start));
    const b = tenureBucket(Math.max(0, days));
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return TENURE_BUCKETS.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
};

// ---------------------------------------------------------------------------
// Expiry forecasts
// ---------------------------------------------------------------------------

export interface ForecastPoint {
  month: string;
  label: string;
  counts: Record<string, number>;
  total: number;
}

/** Items due per month, split by `item_type`; only months in `months` are returned. */
export const expiryForecast = (items: ExpiryLike[], months: MonthBucket[]): ForecastPoint[] => {
  const byMonth = new Map<string, Record<string, number>>();
  for (const it of items) {
    const d = isoDay(it.due_date);
    if (!d) continue;
    const key = d.slice(0, 7);
    const rec = byMonth.get(key) ?? {};
    rec[it.item_type] = (rec[it.item_type] ?? 0) + 1;
    byMonth.set(key, rec);
  }
  return months.map((m) => {
    const counts = byMonth.get(m.key) ?? {};
    return { month: m.key, label: m.label, counts, total: Object.values(counts).reduce((s, n) => s + n, 0) };
  });
};

/** Distinct item types present in a forecast, stable order. */
export const forecastTypes = (points: ForecastPoint[]): string[] => {
  const seen = new Set<string>();
  for (const p of points) for (const k of Object.keys(p.counts)) seen.add(k);
  return Array.from(seen).sort();
};

// ---------------------------------------------------------------------------
// Categorical mixes
// ---------------------------------------------------------------------------

export interface MixPoint {
  name: string;
  count: number;
}

/** Counts by a string key, descending, with null/empty grouped under `Unknown`. */
export const categoryMix = <T>(rows: T[], pick: (row: T) => string | null | undefined, options: { top?: number; unknownLabel?: string } = {}): MixPoint[] => {
  const unknown = options.unknownLabel ?? 'Unknown';
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = (pick(r) ?? '').trim() || unknown;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (options.top && sorted.length > options.top) {
    const head = sorted.slice(0, options.top);
    const rest = sorted.slice(options.top).reduce((s, p) => s + p.count, 0);
    return rest > 0 ? [...head, { name: 'Other', count: rest }] : head;
  }
  return sorted;
};

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface ReviewCompletionPoint {
  type: string;
  completed: number;
  /** Due this year and not yet completed (includes cancelled = false). */
  outstanding: number;
  /** Outstanding and past due. */
  overdue: number;
}

/** Reviews completed / outstanding in `year`, by review type. */
export const reviewCompletion = (reviews: ReviewLike[], year: number, today: Date): ReviewCompletionPoint[] => {
  const day = format(today, 'yyyy-MM-dd');
  const map = new Map<string, ReviewCompletionPoint>();
  const get = (t: string) => {
    const existing = map.get(t);
    if (existing) return existing;
    const created = { type: t, completed: 0, outstanding: 0, overdue: 0 };
    map.set(t, created);
    return created;
  };
  const inYear = (d: string | null) => {
    const iso = isoDay(d);
    return Boolean(iso && iso.startsWith(`${year}-`));
  };
  for (const r of reviews) {
    if (r.status === 'cancelled') continue;
    if (r.status === 'completed') {
      if (inYear(r.completed_at) || (!r.completed_at && inYear(r.due_date))) get(r.review_type).completed += 1;
      continue;
    }
    if (inYear(r.due_date)) {
      const p = get(r.review_type);
      p.outstanding += 1;
      const due = isoDay(r.due_date);
      if (due && due < day) p.overdue += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.type.localeCompare(b.type));
};

// ---------------------------------------------------------------------------
// Leave & onboarding
// ---------------------------------------------------------------------------

export interface LeavePoint {
  month: string;
  label: string;
  pending: number;
  approved: number;
  declined: number;
}

/** Leave requests by start month and status. */
export const leaveByMonth = (requests: LeaveRequestLike[], months: MonthBucket[]): LeavePoint[] => {
  const byMonth = new Map<string, LeavePoint>();
  for (const m of months) byMonth.set(m.key, { month: m.key, label: m.label, pending: 0, approved: 0, declined: 0 });
  for (const r of requests) {
    const d = isoDay(r.start_date);
    if (!d) continue;
    const p = byMonth.get(d.slice(0, 7));
    if (!p) continue;
    if (r.status === 'approved') p.approved += 1;
    else if (r.status === 'declined' || r.status === 'rejected') p.declined += 1;
    else p.pending += 1;
  }
  return months.map((m) => byMonth.get(m.key) as LeavePoint);
};

/** Count of rows per status, stable order (`order` first, then anything else alphabetically). */
export const statusCounts = (rows: StatusLike[], order: string[] = []): MixPoint[] => {
  const mix = categoryMix(rows, (r) => r.status);
  const rank = (name: string) => {
    const i = order.indexOf(name);
    return i === -1 ? order.length : i;
  };
  return mix.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export type CsvValue = string | number | null | undefined;

export const csvCell = (v: CsvValue): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (headers: string[], rows: CsvValue[][]): string =>
  [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');

export interface CsvSection {
  title: string;
  headers: string[];
  rows: CsvValue[][];
}

/** Several tables in one CSV file, separated by a title row and a blank line. */
export const sectionsToCsv = (sections: CsvSection[]): string =>
  sections.map((s) => `${csvCell(s.title)}\n${toCsv(s.headers, s.rows)}`).join('\n\n');

/** Slug safe for file names. */
export const fileSlug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------
// Browser download (no-op outside a DOM)
// ---------------------------------------------------------------------------

export const downloadTextFile = (content: string, fileName: string, mime = 'text/csv;charset=utf-8'): void => {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
