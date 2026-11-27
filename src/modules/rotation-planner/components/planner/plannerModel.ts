/**
 * The planner page's pure model (X1-09B; gap/04 C47, C48, C49, C50, W7):
 * the tabs and their URLs, the remembered zoom, the timeline and month
 * windows, the day and month columns, the crew rows (department groups in
 * the vessel's rank order, plus anyone with a period who is not on today's
 * list), the bar geometry, drag arithmetic and the manning-gap rows.
 *
 * Pure: no React, no client. Date-only strings (the crew's local calendar
 * day) throughout; arithmetic comes from lib/duration.
 */
import { addDays, compareDates, daysBetween, daysInclusive, isDateOnly, maxDate, minDate } from '../../lib/duration';
import type { ManningGapItem } from '../../lib/conflicts';
import type { PlannerPeriod, StoredPeriod } from '../../lib/periods';
import { leaveTypeByKey, type LeaveType } from '../../lib/leaveTypes';
import { governingPeriod } from '../../lib/periods';

// ---------------------------------------------------------------- tabs

export const PLANNER_TABS = ['timeline', 'manning', 'requests', 'configuration'] as const;
export type PlannerTab = (typeof PLANNER_TABS)[number];

export const PLANNER_TAB_LABEL: Readonly<Record<PlannerTab, string>> = Object.freeze({
  timeline: 'Timeline',
  manning: 'Manning',
  requests: 'Requests',
  configuration: 'Configuration',
});

/** The tab a URL segment names, or null for anything else (the page then lands on the timeline). */
export function parsePlannerTab(value: string | null | undefined): PlannerTab | null {
  return (PLANNER_TABS as readonly string[]).includes(value ?? '') ? (value as PlannerTab) : null;
}

/** The vessel-relative path of a tab (link it with useScopedPath()). */
export const plannerTabPath = (tab: PlannerTab): string => `crew/planner/${tab}`;

/** The tabs shown: Configuration only once the planner engine is applied (D-01). */
export function visiblePlannerTabs(engine: boolean): PlannerTab[] {
  return engine ? [...PLANNER_TABS] : PLANNER_TABS.filter((t) => t !== 'configuration');
}

// ---------------------------------------------------------------- zoom (remembered)

export const PLANNER_ZOOMS = ['month', 'year'] as const;
export type PlannerZoom = (typeof PLANNER_ZOOMS)[number];

export const ZOOM_STORAGE_KEY = 'storm.planner.zoom';

/** Pixels per day of each zoom: Month shows every day with its number, Year shows the months. */
export const ZOOM_PX: Readonly<Record<PlannerZoom, number>> = Object.freeze({ month: 26, year: 3.5 });

/** The remembered zoom (localStorage may be missing or throw: then Month). */
export function readStoredZoom(storage: Pick<Storage, 'getItem'> | null | undefined): PlannerZoom {
  try {
    const v = storage?.getItem(ZOOM_STORAGE_KEY);
    return v === 'year' ? 'year' : 'month';
  } catch {
    return 'month';
  }
}

/** Remembers the zoom; a storage that throws (private mode, blocked) is ignored. */
export function storeZoom(storage: Pick<Storage, 'setItem'> | null | undefined, zoom: PlannerZoom): void {
  try {
    storage?.setItem(ZOOM_STORAGE_KEY, zoom);
  } catch {
    /* per-viewer convenience only */
  }
}

// ---------------------------------------------------------------- months and windows

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The first day of the month of a date. */
export function monthStart(day: string): string {
  if (!isDateOnly(day)) throw new RangeError(`Not a date: ${day}`);
  return `${day.slice(0, 7)}-01`;
}

/** The last day of the month of a date. */
export function monthEnd(day: string): string {
  return addDays(addMonths(monthStart(day), 1), -1);
}

/** The first day of the month n months after (or before) a date's month. */
export function addMonths(day: string, n: number): string {
  if (!isDateOnly(day)) throw new RangeError(`Not a date: ${day}`);
  if (!Number.isInteger(n)) throw new RangeError('Months must be a whole number.');
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy).padStart(4, '0')}-${pad2(mm + 1)}-01`;
}

/**
 * The timeline's window around an anchor day: Month zoom shows the anchor's
 * month with one month either side (about 13 weeks); Year zoom shows twelve
 * months from two months before the anchor's. Both stay under the manning
 * read's 400 days.
 */
export function timelineWindow(anchor: string, zoom: PlannerZoom): { from: string; to: string } {
  if (zoom === 'month') return { from: addMonths(anchor, -1), to: monthEnd(addMonths(anchor, 1)) };
  return { from: addMonths(anchor, -2), to: monthEnd(addMonths(anchor, 9)) };
}

/** The anchor after Back or Forward: a month at Month zoom, a quarter at Year zoom. */
export function shiftAnchor(anchor: string, zoom: PlannerZoom, direction: -1 | 1): string {
  return addMonths(anchor, (zoom === 'month' ? 1 : 3) * direction);
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** "Nov 2026" */
export const monthLabel = (day: string): string => `${MONTH_SHORT[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
/** "November 2026" */
export const monthLongLabel = (day: string): string => `${MONTH_LONG[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
/** "12 Nov 2026" */
export const dayLabel = (day: string): string => `${Number(day.slice(8, 10))} ${monthLabel(day)}`;

/** 0 (Sunday) to 6 (Saturday) for a date-only string, by its calendar day (no time zone). */
export function weekdayOf(day: string): number {
  if (!isDateOnly(day)) throw new RangeError(`Not a date: ${day}`);
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isWeekend = (day: string): boolean => {
  const w = weekdayOf(day);
  return w === 0 || w === 6;
};

export interface DayColumn {
  date: string;
  dayOfMonth: number;
  weekday: string;
  weekend: boolean;
  today: boolean;
  /** The first day of a month (a month boundary in the header). */
  monthStart: boolean;
}

/** One column per day of [from, to]. */
export function dayColumns(from: string, to: string, today: string): DayColumn[] {
  const n = daysInclusive(from, to);
  const out: DayColumn[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(from, i);
    out.push({
      date,
      dayOfMonth: Number(date.slice(8, 10)),
      weekday: WEEKDAY_SHORT[weekdayOf(date)],
      weekend: isWeekend(date),
      today: date === today,
      monthStart: date.endsWith('-01'),
    });
  }
  return out;
}

export interface MonthSegment {
  start: string;
  end: string;
  /** Day offset of the segment in the window. */
  offset: number;
  days: number;
  label: string;
}

/** The months of [from, to], each clipped to the window, with its offset in days. */
export function monthSegments(from: string, to: string): MonthSegment[] {
  const out: MonthSegment[] = [];
  let cursor = monthStart(from);
  while (compareDates(cursor, to) <= 0) {
    const start = maxDate(cursor, from);
    const end = minDate(monthEnd(cursor), to);
    out.push({ start, end, offset: daysBetween(from, start), days: daysInclusive(start, end), label: monthLabel(cursor) });
    cursor = addMonths(cursor, 1);
  }
  return out;
}

// ---------------------------------------------------------------- bars

/** The last day a period is drawn to: its end, or for an end-unknown period the day before the next one (else the window's end). */
export function shownEnd(period: Pick<PlannerPeriod, 'end' | 'endUnknown' | 'effectiveEnd'>, windowEnd: string): string {
  if (!period.endUnknown) return period.end;
  return period.effectiveEnd ?? maxDate(period.end, windowEnd);
}

export interface BarSpan {
  /** Days from the window start to the bar's first shown day. */
  offset: number;
  /** Days the bar shows in the window (at least 1). */
  length: number;
  /** The period starts before the window / ends after it (the bar is cut there). */
  cutStart: boolean;
  cutEnd: boolean;
}

/** Where a period sits in the window, or null when it lies outside it. */
export function barSpan(start: string, end: string, from: string, to: string): BarSpan | null {
  if (compareDates(end, from) < 0 || compareDates(start, to) > 0 || compareDates(end, start) < 0) return null;
  const s = maxDate(start, from);
  const e = minDate(end, to);
  return { offset: daysBetween(from, s), length: daysInclusive(s, e), cutStart: compareDates(start, from) < 0, cutEnd: compareDates(end, to) > 0 };
}

export type DragMode = 'move' | 'start' | 'end';

/**
 * A period's dates after a drag of `delta` days: Move shifts both ends,
 * Start and End move one edge and never past the other. An end-unknown
 * period keeps no end (only its start moves).
 */
export function draggedRange(period: { start: string; end: string | null }, mode: DragMode, delta: number): { start: string; end: string | null } {
  if (!Number.isInteger(delta)) throw new RangeError('A drag moves whole days.');
  const { start, end } = period;
  if (mode === 'move') return { start: addDays(start, delta), end: end === null ? null : addDays(end, delta) };
  if (mode === 'start') {
    const next = addDays(start, delta);
    return { start: end !== null && compareDates(next, end) > 0 ? end : next, end };
  }
  if (end === null) return { start, end };
  const next = addDays(end, delta);
  return { start, end: compareDates(next, start) < 0 ? start : next };
}

// ---------------------------------------------------------------- crew rows

/** Someone on the vessel's list (crew_vessel_list), as the planner reads them. */
export interface PlannerCrewMember {
  profileId: string;
  userId: string | null;
  name: string;
  positionLabel: string | null;
  departmentKey: string | null;
  departmentLabel: string | null;
  sortOrder: number | null;
}

export interface PlannerRow {
  profileId: string;
  userId: string | null;
  name: string;
  positionLabel: string | null;
  /** On today's crew list (false: only their periods bring them here, e.g. a former crew member). */
  onList: boolean;
  periods: PlannerPeriod[];
}

export interface PlannerRowGroup {
  /** The department key, or OTHER_GROUP for people the list does not place. */
  key: string;
  label: string;
  rows: PlannerRow[];
}

export const OTHER_GROUP = '__other';
export const OTHER_GROUP_LABEL = 'Not on the crew list today';

/**
 * The timeline's rows: everyone on the crew list (in the vessel's rank
 * order, department groups in the order their first member appears), and,
 * in a last group, anyone with a period in the window who is not on the
 * list. Periods without a person (an imported bar with only a name) are
 * left out: they belong to the legacy planner.
 */
export function buildPlannerRows(crew: readonly PlannerCrewMember[], periods: readonly PlannerPeriod[], departmentFilter: string | null): PlannerRowGroup[] {
  const byPerson = new Map<string, PlannerPeriod[]>();
  for (const p of periods) {
    if (!p.profileId) continue;
    const list = byPerson.get(p.profileId);
    if (list) list.push(p);
    else byPerson.set(p.profileId, [p]);
  }
  for (const list of byPerson.values()) list.sort((a, b) => compareDates(a.start, b.start) || (a.id < b.id ? -1 : 1));

  const sorted = [...crew].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name) ||
      (a.profileId < b.profileId ? -1 : 1),
  );
  const groups = new Map<string, PlannerRowGroup>();
  const seen = new Set<string>();
  for (const c of sorted) {
    seen.add(c.profileId);
    const key = c.departmentKey ?? OTHER_GROUP;
    if (departmentFilter && key !== departmentFilter) continue;
    let g = groups.get(key);
    if (!g) {
      g = { key, label: c.departmentKey ? c.departmentLabel ?? c.departmentKey : OTHER_GROUP_LABEL, rows: [] };
      groups.set(key, g);
    }
    g.rows.push({ profileId: c.profileId, userId: c.userId, name: c.name, positionLabel: c.positionLabel, onList: true, periods: byPerson.get(c.profileId) ?? [] });
  }
  const others: PlannerRow[] = [];
  for (const [profileId, list] of byPerson) {
    if (seen.has(profileId)) continue;
    others.push({ profileId, userId: list[0].crewUserId, name: list[0].crewName, positionLabel: null, onList: false, periods: list });
  }
  if (others.length > 0 && (!departmentFilter || departmentFilter === OTHER_GROUP)) {
    others.sort((a, b) => a.name.localeCompare(b.name) || (a.profileId < b.profileId ? -1 : 1));
    const g = groups.get(OTHER_GROUP);
    if (g) g.rows.push(...others);
    else groups.set(OTHER_GROUP, { key: OTHER_GROUP, label: OTHER_GROUP_LABEL, rows: others });
  }
  const list = [...groups.values()];
  // The unplaced group always comes last.
  return [...list.filter((g) => g.key !== OTHER_GROUP), ...list.filter((g) => g.key === OTHER_GROUP)];
}

/** The department options of the filter: each department on the list once, in list order. */
export function departmentOptions(crew: readonly PlannerCrewMember[]): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const seen = new Set<string>();
  const sorted = [...crew].sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
  for (const c of sorted) {
    if (!c.departmentKey || seen.has(c.departmentKey)) continue;
    seen.add(c.departmentKey);
    out.push({ key: c.departmentKey, label: c.departmentLabel ?? c.departmentKey });
  }
  return out;
}

// ---------------------------------------------------------------- manning gap rows

export interface ManningGapRow {
  key: string;
  positionName: string;
  departmentKey: string | null;
  spans: ManningGapItem[];
}

/** One row per position with critical spans, in the order of their first span (bandSpans' order). */
export function manningGapRows(gaps: readonly ManningGapItem[], departmentFilter: string | null): ManningGapRow[] {
  const rows = new Map<string, ManningGapRow>();
  for (const g of gaps) {
    if (departmentFilter && departmentFilter !== OTHER_GROUP && g.departmentKey !== departmentFilter) continue;
    const key = g.positionId ?? 'unmatched';
    const row = rows.get(key);
    if (row) row.spans.push(g);
    else rows.set(key, { key, positionName: g.positionName ?? 'Unmatched titles', departmentKey: g.departmentKey, spans: [g] });
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------- the manning grid (one month)

/** The confirmed periods of one person as the store holds them (what the day codes and manning read). */
export function confirmedStored(periods: readonly PlannerPeriod[]): Array<StoredPeriod & { period: PlannerPeriod }> {
  return periods
    .filter((p) => (p.status === 'confirmed' || p.status === 'complete') && p.leaveTypeKey !== null)
    .map((p) => ({ id: p.id, leaveTypeKey: p.leaveTypeKey as string, start: p.start, end: p.end, endUnknown: p.endUnknown, period: p }));
}

/** The leave type key that governs each day of the month for one person (null: no confirmed period that day). */
export function dayTypes(periods: readonly PlannerPeriod[], days: readonly string[]): Array<{ day: string; typeKey: string | null; periodId: string | null }> {
  const stored = confirmedStored(periods);
  return days.map((day) => {
    const g = governingPeriod(stored, day);
    return { day, typeKey: g ? g.leaveTypeKey : null, periodId: g ? g.id : null };
  });
}

/** A painted range on one person's row: the days between the first and the last cell touched, in order. */
export function paintRange(a: string, b: string): { start: string; end: string } {
  return compareDates(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}

// ---------------------------------------------------------------- what may be changed

/** Why a period opens read only (null: it can be changed here). */
export function periodLockReason(period: PlannerPeriod | null, types: readonly LeaveType[], canEdit: boolean, canApproveLeave: boolean): string | null {
  if (!canEdit) return "You can see the planner but can't change it on this vessel.";
  if (!period) return null;
  if (period.requestId) return 'This period comes from an approved leave request: cancel or change the request instead.';
  if (period.status !== 'confirmed' && period.status !== 'draft') return 'This period is waiting for a decision and is changed through its request.';
  const type = leaveTypeByKey(period.leaveTypeKey, types);
  if (!period.leaveTypeKey || !type) return 'This bar was imported without a leave type. Open the legacy planner to change it.';
  if (type.needsApproval && !canApproveLeave) return `${type.label} is changed by a leave approver.`;
  return null;
}
