/**
 * The pure model behind Fleet › Training and the vessel's Crew Training
 * register (gap/02 TR1–TR3, TR8; gap/04 C62; X5-07B). No React, no
 * Supabase: the rows come from the live `development_applications` columns
 * (and, apart, the 040600 `stage_entered_at`), the rules from
 * ../../lib/applicationMachine.ts.
 *
 * - Which applications a fleet register counts: never drafts (the
 *   applicant's own until submitted) and never voided ones (entered in
 *   error, TR6).
 * - The register filters (vessel code, category, status group, clawback
 *   active, search), read from and written to the URL.
 * - Money: every amount stays in the currency it was entered in; totals
 *   are kept per currency and never converted (TR2). An application in a
 *   currency other than USD carries its tuition, travel and accommodation
 *   in that currency when the applicant typed them so; anything entered in
 *   USD (the food per diem always is) counts as USD.
 * - By vessel (TR2): awaiting approval, approved, completed and spend per
 *   vessel.
 * - Awaiting approval > 7 days (TR1, W3): the applications waiting more
 *   than STALE_AFTER_DAYS at one approval stage, longest first, with the
 *   approver level they wait for.
 * - Crew proposals (TR8): custom courses not yet in the catalogue.
 */
import { localCalendarDate } from '@/lib/records/dates';
import type { DevCategory } from '../../constants';
import {
  APPROVED_OPEN_STATUSES,
  AWAITING_APPROVAL_STATUSES,
  STALE_AFTER_DAYS,
  isAwaitingApproval,
  isFinalStage,
  isHodStage,
  pendingFinalApprovers,
  stageEnteredAt,
  type ApplicationProgress,
  type ApplicationStatus,
  type FinalApprovalMode,
} from '../../lib/applicationMachine';
import { DEV_CATEGORIES } from '../../lib/settingsSchema';
import { FLEET_TRAINING_TABS, type FleetTrainingTab } from '../../paths';

// ─── tabs ─────────────────────────────────────────────────────────────────

export const FLEET_TRAINING_TAB_LABELS: Readonly<Record<FleetTrainingTab, string>> = {
  overview: 'Overview',
  'by-vessel': 'By vessel',
  applications: 'Applications',
  catalogue: 'Catalogue',
  settings: 'Settings',
};

/** The tab of a URL segment, or null for an unknown one (the page then lands on the overview). */
export function parseTrainingTab(value: string | null | undefined): FleetTrainingTab | null {
  return value && (FLEET_TRAINING_TABS as readonly string[]).includes(value) ? (value as FleetTrainingTab) : null;
}

// ─── the row ──────────────────────────────────────────────────────────────

/** The live columns a fleet register reads (one select; the 040600 columns come apart). */
export const FLEET_APPLICATION_COLUMNS = [
  'id',
  'application_number',
  'crew_member_id',
  'vessel_id',
  'course_id',
  'course_name',
  'category',
  'status',
  'course_provider',
  'course_location',
  'course_description',
  'course_start_date',
  'course_end_date',
  'course_duration_days',
  'estimated_tuition_usd',
  'estimated_travel_usd',
  'estimated_accommodation_usd',
  'estimated_food_per_diem_usd',
  'estimated_total_usd',
  'application_currency',
  'tuition_local_amount',
  'travel_local_amount',
  'accommodation_local_amount',
  'is_custom_course',
  'is_discretionary',
  'discretionary_justification',
  'denial_reason',
  'hod_reviewer_id',
  'hod_reviewed_at',
  'hod_decision',
  'hod_comments',
  'purser_reviewer_id',
  'purser_reviewed_at',
  'purser_decision',
  'purser_comments',
  'captain_reviewer_id',
  'captain_reviewed_at',
  'captain_decision',
  'captain_comments',
  'submitted_at',
  'completed_at',
  'clawback_end_date',
  'created_at',
  'updated_at',
] as const;

/** The applicant's name and department, through the application's crew-member key. */
export const FLEET_APPLICATION_CREW_EMBED = 'crew_member:profiles!development_applications_crew_member_id_fkey(first_name, last_name, department)';

export interface FleetApplicationCrew {
  first_name: string | null;
  last_name: string | null;
  department: string | null;
}

export interface FleetApplicationRow {
  id: string;
  application_number: string;
  crew_member_id: string;
  vessel_id: string;
  course_id: string | null;
  course_name: string;
  category: string;
  status: string;
  course_provider: string | null;
  course_location: string | null;
  course_description: string | null;
  course_start_date: string | null;
  course_end_date: string | null;
  course_duration_days: number | null;
  estimated_tuition_usd: number | null;
  estimated_travel_usd: number | null;
  estimated_accommodation_usd: number | null;
  estimated_food_per_diem_usd: number | null;
  estimated_total_usd: number | null;
  application_currency: string | null;
  tuition_local_amount: number | null;
  travel_local_amount: number | null;
  accommodation_local_amount: number | null;
  is_custom_course: boolean | null;
  is_discretionary: boolean | null;
  discretionary_justification: string | null;
  denial_reason: string | null;
  hod_reviewer_id: string | null;
  hod_reviewed_at: string | null;
  hod_decision: string | null;
  hod_comments: string | null;
  purser_reviewer_id: string | null;
  purser_reviewed_at: string | null;
  purser_decision: string | null;
  purser_comments: string | null;
  captain_reviewer_id: string | null;
  captain_reviewed_at: string | null;
  captain_decision: string | null;
  captain_comments: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  clawback_end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  crew_member: FleetApplicationCrew | null;
  /** From the 040600 lifecycle select; null while it is not set up (then the stale rule falls back, see stageEnteredAt). */
  stage_entered_at?: string | null;
}

/** A fleet register leaves out drafts (not submitted yet) and voided applications (entered in error, TR6). */
export function countsInFleetRegister(status: string): boolean {
  return status !== 'draft' && status !== 'voided';
}

/** The applicant's name, or a plain "Name not available" (never an invented one). */
export function crewName(crew: FleetApplicationCrew | null | undefined): string {
  const name = `${crew?.first_name ?? ''} ${crew?.last_name ?? ''}`.trim();
  return name || 'Name not available';
}

// ─── status groups ────────────────────────────────────────────────────────

/** The register's status filter: groups of the machine's statuses (drafts and voided never show). */
export const STATUS_GROUPS = ['awaiting', 'approved', 'completed', 'returned', 'rejected', 'cancelled'] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export const STATUS_GROUP_STATUSES: Readonly<Record<StatusGroup, readonly ApplicationStatus[]>> = {
  awaiting: AWAITING_APPROVAL_STATUSES,
  approved: APPROVED_OPEN_STATUSES,
  completed: ['completed', 'reimbursed', 'closed'],
  returned: ['returned'],
  rejected: ['rejected'],
  cancelled: ['cancelled'],
};

export const STATUS_GROUP_LABELS: Readonly<Record<StatusGroup, string>> = {
  awaiting: 'Awaiting approval',
  approved: 'Approved, not yet completed',
  completed: 'Completed',
  returned: 'Returned for changes',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** The group a stored status belongs to, or null (draft, voided, or a status the machine does not know). */
export function statusGroupOf(status: string): StatusGroup | null {
  for (const group of STATUS_GROUPS) if ((STATUS_GROUP_STATUSES[group] as readonly string[]).includes(status)) return group;
  return null;
}

// ─── clawback ─────────────────────────────────────────────────────────────

/** Company-required and Mandatory courses never carry a clawback (W3). */
export const CLAWBACK_EXEMPT_CATEGORIES: readonly DevCategory[] = ['fleet_organised', 'mandatory'];

/**
 * The application is inside its clawback window today: it was reimbursed
 * (or closed after that), its category is not exempt, and its
 * `clawback_end_date` (set on reimburse) is today or later.
 */
export function isClawbackActive(row: Pick<FleetApplicationRow, 'status' | 'category' | 'clawback_end_date'>, today: string): boolean {
  if (row.status !== 'reimbursed' && row.status !== 'closed') return false;
  if ((CLAWBACK_EXEMPT_CATEGORIES as readonly string[]).includes(row.category)) return false;
  return typeof row.clawback_end_date === 'string' && row.clawback_end_date.slice(0, 10) >= today;
}

// ─── money, per currency ──────────────────────────────────────────────────

/** Totals by ISO currency code. */
export type CurrencyTotals = ReadonlyMap<string, number>;

const ISO = /^[A-Z]{3}$/;
const finite = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * An application's estimated cost by the currency each part was entered in.
 * A part with an amount in the application's own (non-USD) currency counts
 * there; otherwise its USD figure counts as USD. The food per diem is a
 * daily USD rate times the course days (as the stored total). Zero parts
 * are left out; nothing is converted.
 */
export function amountsByCurrency(
  row: Pick<
    FleetApplicationRow,
    | 'application_currency'
    | 'tuition_local_amount'
    | 'travel_local_amount'
    | 'accommodation_local_amount'
    | 'estimated_tuition_usd'
    | 'estimated_travel_usd'
    | 'estimated_accommodation_usd'
    | 'estimated_food_per_diem_usd'
    | 'course_duration_days'
  >,
): Map<string, number> {
  const currency = row.application_currency && ISO.test(row.application_currency) ? row.application_currency : 'USD';
  const out = new Map<string, number>();
  const add = (code: string, amount: number | null) => {
    if (amount === null || amount === 0) return;
    out.set(code, (out.get(code) ?? 0) + amount);
  };
  const part = (local: number | null | undefined, usd: number | null | undefined) => {
    const l = finite(local);
    if (currency !== 'USD' && l !== null) add(currency, l);
    else add('USD', finite(usd));
  };
  part(row.tuition_local_amount, row.estimated_tuition_usd);
  part(row.travel_local_amount, row.estimated_travel_usd);
  part(row.accommodation_local_amount, row.estimated_accommodation_usd);
  const perDay = finite(row.estimated_food_per_diem_usd);
  const days = finite(row.course_duration_days);
  if (perDay !== null && days !== null) add('USD', perDay * days);
  return out;
}

/** The sum of several applications' amounts, per currency. */
export function sumByCurrency(rows: ReadonlyArray<Parameters<typeof amountsByCurrency>[0]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) for (const [code, amount] of amountsByCurrency(row)) out.set(code, (out.get(code) ?? 0) + amount);
  return out;
}

/** The currencies in display order: USD first, then alphabetical. */
export function currencyOrder(totals: CurrencyTotals): string[] {
  return [...totals.keys()].sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)));
}

/** "USD 12,400" for one currency (whole units; the register is an estimate). */
export function formatMoney(code: string, amount: number): string {
  return `${code} ${Math.round(amount).toLocaleString('en-GB')}`;
}

/** "USD 12,400 · EUR 3,000", or null when there is nothing. */
export function formatCurrencyTotals(totals: CurrencyTotals): string | null {
  const parts = currencyOrder(totals).map((code) => formatMoney(code, totals.get(code) ?? 0));
  return parts.length ? parts.join(' · ') : null;
}

// ─── register filters (URL) ───────────────────────────────────────────────

export interface RegisterFilters {
  /** Upper-case vessel code (D-03), or null for every vessel. */
  vessel: string | null;
  category: DevCategory | null;
  status: StatusGroup | null;
  clawbackActive: boolean;
  q: string;
}

export const EMPTY_REGISTER_FILTERS: Readonly<RegisterFilters> = { vessel: null, category: null, status: null, clawbackActive: false, q: '' };

const isCategory = (v: string | null): v is DevCategory => v !== null && (DEV_CATEGORIES as readonly string[]).includes(v);
const isGroup = (v: string | null): v is StatusGroup => v !== null && (STATUS_GROUPS as readonly string[]).includes(v);

/** The filters from the query string; anything unknown is ignored, never guessed. */
export function parseRegisterFilters(params: URLSearchParams): RegisterFilters {
  const vessel = params.get('vessel')?.trim().toUpperCase() || null;
  const category = params.get('category');
  const status = params.get('status');
  return {
    vessel: vessel && /^[A-Z0-9]{2,8}$/.test(vessel) ? vessel : null,
    category: isCategory(category) ? category : null,
    status: isGroup(status) ? status : null,
    clawbackActive: params.get('clawback') === 'active',
    q: (params.get('q') ?? '').slice(0, 120),
  };
}

/** The query string of the filters (keeps any other parameter of `base`, e.g. `application`). */
export function registerFiltersToParams(filters: RegisterFilters, base?: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key));
  set('vessel', filters.vessel ? filters.vessel.toLowerCase() : null);
  set('category', filters.category);
  set('status', filters.status);
  set('clawback', filters.clawbackActive ? 'active' : null);
  set('q', filters.q.trim() || null);
  return next;
}

export function hasRegisterFilters(f: RegisterFilters): boolean {
  return Boolean(f.vessel || f.category || f.status || f.clawbackActive || f.q.trim());
}

/** The vessel a row is on, from the reader's list (id → code / name). */
export interface RegisterVessel {
  id: string;
  name: string;
  code: string | null;
}

/** The rows the filters keep (a vessel code no vessel has keeps nothing). */
export function applyRegisterFilters(
  rows: readonly FleetApplicationRow[],
  filters: RegisterFilters,
  vessels: readonly RegisterVessel[],
  today: string,
): FleetApplicationRow[] {
  const vesselId = filters.vessel ? vessels.find((v) => v.code?.toUpperCase() === filters.vessel)?.id ?? '∅' : null;
  const q = filters.q.trim().toLowerCase();
  const statuses = filters.status ? (STATUS_GROUP_STATUSES[filters.status] as readonly string[]) : null;
  return rows.filter((row) => {
    if (!countsInFleetRegister(row.status)) return false;
    if (vesselId && row.vessel_id !== vesselId) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (statuses && !statuses.includes(row.status)) return false;
    if (filters.clawbackActive && !isClawbackActive(row, today)) return false;
    if (!q) return true;
    return [row.course_name, row.application_number, row.course_provider, crewName(row.crew_member), row.crew_member?.department]
      .filter((v): v is string => typeof v === 'string')
      .some((v) => v.toLowerCase().includes(q));
  });
}

// ─── overview ─────────────────────────────────────────────────────────────

export interface TrainingCounts {
  /** Every application a fleet register counts (no drafts, no voided). */
  total: number;
  awaiting: number;
  approved: number;
  completed: number;
  returned: number;
  rejected: number;
  cancelled: number;
  clawbackActive: number;
  byCategory: Readonly<Record<DevCategory, number>>;
  /** Estimated cost of approved and completed applications, per currency. */
  committed: Map<string, number>;
}

const SPEND_GROUPS: readonly StatusGroup[] = ['approved', 'completed'];

/** Whether an application's estimate counts as spend (approved or completed). */
export function countsAsSpend(status: string): boolean {
  const group = statusGroupOf(status);
  return group !== null && SPEND_GROUPS.includes(group);
}

export function trainingCounts(rows: readonly FleetApplicationRow[], today: string): TrainingCounts {
  const byCategory = Object.fromEntries(DEV_CATEGORIES.map((c) => [c, 0])) as Record<DevCategory, number>;
  const counted = rows.filter((r) => countsInFleetRegister(r.status));
  const groups: Record<StatusGroup, number> = { awaiting: 0, approved: 0, completed: 0, returned: 0, rejected: 0, cancelled: 0 };
  for (const row of counted) {
    const group = statusGroupOf(row.status);
    if (group) groups[group] += 1;
    if (isCategory(row.category)) byCategory[row.category] += 1;
  }
  return {
    total: counted.length,
    ...groups,
    clawbackActive: counted.filter((r) => isClawbackActive(r, today)).length,
    byCategory,
    committed: sumByCurrency(counted.filter((r) => countsAsSpend(r.status))),
  };
}

// ─── by vessel ────────────────────────────────────────────────────────────

export interface VesselTrainingRow {
  /** The vessel id, or null for the applications on vessels outside the reader's list. */
  vesselId: string | null;
  name: string;
  code: string | null;
  awaiting: number;
  approved: number;
  completed: number;
  total: number;
  spend: Map<string, number>;
}

/** One row per vessel in the reader's list (in its order), plus "Other vessels" when some rows are on none of them. */
export function vesselBreakdown(rows: readonly FleetApplicationRow[], vessels: readonly RegisterVessel[]): VesselTrainingRow[] {
  const blank = (vesselId: string | null, name: string, code: string | null): VesselTrainingRow => ({
    vesselId,
    name,
    code,
    awaiting: 0,
    approved: 0,
    completed: 0,
    total: 0,
    spend: new Map(),
  });
  const byId = new Map(vessels.map((v) => [v.id, blank(v.id, v.name, v.code)] as const));
  const other = blank(null, 'Other vessels', null);
  for (const row of rows) {
    if (!countsInFleetRegister(row.status)) continue;
    const target = byId.get(row.vessel_id) ?? other;
    target.total += 1;
    const group = statusGroupOf(row.status);
    if (group === 'awaiting') target.awaiting += 1;
    if (group === 'approved') target.approved += 1;
    if (group === 'completed') target.completed += 1;
    if (countsAsSpend(row.status)) for (const [code, amount] of amountsByCurrency(row)) target.spend.set(code, (target.spend.get(code) ?? 0) + amount);
  }
  const out = vessels.map((v) => byId.get(v.id) as VesselTrainingRow);
  if (other.total > 0) out.push(other);
  return out;
}

// ─── awaiting approval > 7 days ───────────────────────────────────────────

/** The approver level an application waits for (W3). */
export type ApproverLevel = 'Head of department' | 'Captain' | 'Purser' | 'Captain and Purser' | 'Captain or Purser' | 'Final approval';

/** "With the head of department", "With the Captain and the Purser". */
export const APPROVER_PHRASES: Readonly<Record<ApproverLevel, string>> = {
  'Head of department': 'With the head of department',
  Captain: 'With the Captain',
  Purser: 'With the Purser',
  'Captain and Purser': 'With the Captain and the Purser',
  'Captain or Purser': 'With the Captain or the Purser',
  'Final approval': 'Waiting for the final approval',
};

/** Who a waiting application is with (W3: "with the approver level"); null when it waits for nobody's approval. */
export function approverLevel(app: ApplicationProgress, mode: FinalApprovalMode): ApproverLevel | null {
  if (isHodStage(app.status)) return 'Head of department';
  if (!isFinalStage(app.status)) return null;
  if (mode === 'either') return 'Captain or Purser';
  const pending = pendingFinalApprovers(mode, app);
  if (pending.length === 2) return 'Captain and Purser';
  if (pending[0] === 'captain') return 'Captain';
  if (pending[0] === 'purser') return 'Purser';
  return 'Final approval';
}

export interface StaleApplication {
  row: FleetApplicationRow;
  /** Whole days at the current stage. */
  waitingDays: number;
  approver: ApproverLevel;
  /** When the stage began came from stage_entered_at (true) or an older date of the row (false, before 040600). */
  exact: boolean;
}

const DAY_MS = 86_400_000;

/** Applications waiting more than `days` at one approval stage, longest first. */
export function staleApplications(
  rows: readonly FleetApplicationRow[],
  mode: FinalApprovalMode,
  now: Date = new Date(),
  days: number = STALE_AFTER_DAYS,
): StaleApplication[] {
  const out: StaleApplication[] = [];
  for (const row of rows) {
    if (!isAwaitingApproval(row.status)) continue;
    const at = stageEnteredAt(row);
    if (!at) continue;
    const waited = now.getTime() - at.getTime();
    if (waited <= days * DAY_MS) continue;
    out.push({ row, waitingDays: Math.floor(waited / DAY_MS), approver: approverLevel(row, mode) ?? 'Final approval', exact: Boolean(row.stage_entered_at) });
  }
  return out.sort((a, b) => b.waitingDays - a.waitingDays || a.row.application_number.localeCompare(b.row.application_number));
}

// ─── crew proposals (TR8) ─────────────────────────────────────────────────

/** Custom courses crew applied for that are not in the catalogue yet (submitted, not voided). */
export function courseProposals(rows: readonly FleetApplicationRow[]): FleetApplicationRow[] {
  return rows
    .filter((r) => countsInFleetRegister(r.status) && r.is_custom_course === true && !r.course_id)
    .sort((a, b) => (b.submitted_at ?? b.created_at ?? '').localeCompare(a.submitted_at ?? a.created_at ?? ''));
}

/** Latest course start first, unscheduled ones last (the cards' order, as the table's default sort). */
export function byStartDateDesc(rows: readonly FleetApplicationRow[]): FleetApplicationRow[] {
  return [...rows].sort((a, b) => {
    const x = a.course_start_date ?? '';
    const y = b.course_start_date ?? '';
    if (x === y) return a.application_number.localeCompare(b.application_number);
    if (!x) return 1;
    if (!y) return -1;
    return y.localeCompare(x);
  });
}

// ─── phase (vessel register, gap/04 C62) ─────────────────────────────────

/** Where a course is in time, from its dates and status. */
export type TrainingPhase = 'upcoming' | 'current' | 'completed' | 'unscheduled';

export const TRAINING_PHASES: readonly TrainingPhase[] = ['upcoming', 'current', 'completed', 'unscheduled'];

export const TRAINING_PHASE_LABELS: Readonly<Record<TrainingPhase, string>> = {
  upcoming: 'Upcoming',
  current: 'In progress',
  completed: 'Completed',
  unscheduled: 'Not scheduled',
};

/** Completed applications are completed; otherwise the course dates against today (date-only, local). */
export function trainingPhase(row: Pick<FleetApplicationRow, 'status' | 'course_start_date' | 'course_end_date'>, today: string): TrainingPhase {
  if (row.status === 'completed' || row.status === 'reimbursed' || row.status === 'closed') return 'completed';
  const start = row.course_start_date?.slice(0, 10) ?? null;
  const end = row.course_end_date?.slice(0, 10) ?? start;
  if (!start) return 'unscheduled';
  if (start > today) return 'upcoming';
  if (end && end < today) return 'completed';
  return 'current';
}

// ─── dates ────────────────────────────────────────────────────────────────

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}/;

/** A stored day as "12 Mar 2026" without moving it across time zones; null for no day. */
export function formatDay(value: string | null | undefined): string | null {
  if (!value || !DAY_ONLY.test(value)) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Course dates as short as they read clearly: "3 – 7 Mar 2026", "28 Feb – 2 Mar 2026", "30 Dec 2026 – 2 Jan 2027"; null when unscheduled. */
export function formatCourseDates(start: string | null, end: string | null): string | null {
  const a = formatDay(start);
  const b = formatDay(end);
  if (!a || !start) return null;
  if (!b || !end || b === a) return a;
  const [sy, sm] = start.slice(0, 7).split('-');
  const [ey, em] = end.slice(0, 7).split('-');
  const startParts = a.split(' ');
  if (sy === ey && sm === em) return `${startParts[0]} – ${b}`;
  if (sy === ey) return `${startParts[0]} ${startParts[1]} – ${b}`;
  return `${a} – ${b}`;
}

/** Today as a local calendar day. */
export function todayLocal(now: Date = new Date()): string {
  return localCalendarDate(now);
}

/** "Updated 26 Nov 2026, 09:14 UTC" (D-88). */
export function formatUpdatedUtc(at: number): string {
  const text = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(new Date(at));
  return `Updated ${text} UTC`;
}

/** The plural of a count: "1 application", "3 applications". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
}
