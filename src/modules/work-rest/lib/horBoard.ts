/**
 * The vessel hours-of-rest board (gap/04 C40, C41, C42, C43, C45, W6;
 * DECISIONS D-X1-20; T-144). Pure: the board page, its cards, chips and the
 * breach review panel draw from this, and the tests pin every rule.
 *
 * The server (work_rest_vessel_board, 20261124060800) answers one entry per
 * person assigned to the vessel on any day of the month, ended and
 * transferred-out people included; here:
 *
 * - parseVesselBoard: the strict reader of that answer (a shape it does not
 *   expect is an error, never a guess);
 * - the queues (the chips), first match wins:
 *     approved     the month is approved or locked
 *     on_leave     on leave every expected day of the month
 *     ready        submitted or HoD-signed, and the viewer may act on it now
 *                  (the final approver approves; a head of department signs a
 *                  submitted month of their own department; never their own)
 *     in_review    submitted or HoD-signed, waiting on someone else
 *     waiting      not submitted yet (no month, draft or reopened): waiting
 *                  on the crew member
 *   The chips count ready, waiting, approved and on_leave; "All" shows
 *   everyone, in_review included.
 * - departments: grouped in the server's order (the department's catalogue
 *   order), people without a department last under "Other";
 * - the card: the name, the mini calendar from lib/horDay.ts, the month's
 *   status menu from lib/horMonth.ts (who-refusals hidden, condition
 *   refusals disabled with their sentence; a correction still requested
 *   blocks approval, as the server's trigger does), Remind with the
 *   last-reminded line, Former crew and "submit on their behalf" (C43);
 * - the breach review: which outcomes a breach offers, the deficit words,
 *   the review form's schema.
 */
import { z } from 'zod';
import type { HodStep } from '../types';
import { horDayState, monthDays, type HorDay, type HorStart } from './horDay';
import {
  decideMonthAction,
  MONTH_REFUSAL_TEXT,
  normaliseMonthStatus,
  REASON_MAX,
  type MonthAction,
  type MonthDecision,
  type MonthFacts,
  type MonthRefusal,
  type MonthState,
} from './horMonth';

// ---------------------------------------------------------------- the board's shape

export interface BoardAssignmentSpan {
  /** First day aboard (YYYY-MM-DD). */
  from: string | null;
  /** Last day aboard, inclusive; null while current. */
  to: string | null;
}

export interface BoardMonth {
  submissionId: string | null;
  /** The stored status (null: no month row yet, a draft). */
  status: string | null;
  submittedAt: string | null;
  /** Submitted for the crew member by an approver (C43). */
  onBehalf: boolean;
  hodSigned: boolean;
  approvedAt: string | null;
  lockedAt: string | null;
}

export interface BoardCounts {
  expected: number;
  logged: number;
  missing: number;
  breachDays: number;
  unreviewed: number;
  blockingUnreviewed: number;
  lowUnreviewed: number;
  awaitingCorrection: number;
  seriousOpen: number;
}

export const REMINDER_KINDS = ['manual', 'auto_month_start', 'sign_off', 'pre_cutoff'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface BoardReminder {
  kind: ReminderKind;
  /** YYYY-MM-DD, the vessel's day. */
  sentOn: string;
  sentAt: string | null;
  /** The sender's role ("Chief Officer"); null for an automatic reminder. */
  byLabel: string | null;
}

export interface BoardDays {
  /** Days of the month (1-31) with a record on this vessel. */
  records: number[];
  /** Planner leave days (any code but F and T). */
  leave: number[];
  /** Days a live breach belongs to. */
  breach: number[];
  /** Days near the limit (no breach). */
  warning: number[];
}

export interface BoardMember {
  profileId: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  avatarUrl: string | null;
  positionName: string | null;
  positionText: string | null;
  departmentKey: string | null;
  departmentLabel: string | null;
  sortOrder: number | null;
  assignments: BoardAssignmentSpan[];
  month: BoardMonth;
  days: BoardDays;
  counts: BoardCounts;
  stillAboard: boolean;
  /** No assignment on the vessel today and none to come (left, or transferred out). */
  formerCrew: boolean;
  onLeaveAllMonth: boolean;
  lastReminder: BoardReminder | null;
  remindedToday: boolean;
}

export interface VesselBoard {
  vesselId: string;
  year: number;
  month: number;
  /** The vessel's today (YYYY-MM-DD). */
  today: string;
  firstDay: string;
  lastDay: string;
  /** Hours of Rest on the vessel: off, or on from a date (C45). */
  hor: HorStart;
  hodStep: HodStep;
  canFinalApprove: boolean;
  /** The viewer's department on the vessel today. */
  myDepartmentKey: string | null;
  members: BoardMember[];
}

export class BoardShapeError extends Error {
  constructor(what: string) {
    super(`The hours of rest board answered in an unexpected shape (${what}).`);
    this.name = 'BoardShapeError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (v: string | null | undefined): boolean => (v ?? '').trim() === '';

function obj(v: unknown, what: string): Obj {
  if (!isObj(v)) throw new BoardShapeError(what);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new BoardShapeError(what);
  return v;
}
function strOrNull(v: unknown, what: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new BoardShapeError(what);
  return v;
}
function dateOrNull(v: unknown, what: string): string | null {
  const s = strOrNull(v, what);
  if (s !== null && !DATE.test(s)) throw new BoardShapeError(what);
  return s;
}
function int(v: unknown, what: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw new BoardShapeError(what);
  return n;
}
function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new BoardShapeError(what);
  return v;
}
function days(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new BoardShapeError(what);
  return v.map((d) => {
    const n = int(d, what);
    if (n < 1 || n > 31) throw new BoardShapeError(what);
    return n;
  });
}
const isHodStep = (v: unknown): v is HodStep => v === 'off' || v === 'nudge' || v === 'required';
const isReminderKind = (v: unknown): v is ReminderKind => typeof v === 'string' && (REMINDER_KINDS as readonly string[]).includes(v);

function parseMember(raw: unknown, i: number): BoardMember {
  const m = obj(raw, `member ${i}`);
  const month = obj(m.month, `member ${i} month`);
  const d = obj(m.days, `member ${i} days`);
  const c = obj(m.counts, `member ${i} counts`);
  const spans = Array.isArray(m.assignments) ? m.assignments : null;
  if (!spans) throw new BoardShapeError(`member ${i} assignments`);
  let lastReminder: BoardReminder | null = null;
  if (m.last_reminder !== null && m.last_reminder !== undefined) {
    const r = obj(m.last_reminder, `member ${i} reminder`);
    if (!isReminderKind(r.kind)) throw new BoardShapeError(`member ${i} reminder kind`);
    const sentOn = dateOrNull(r.sent_on, `member ${i} reminder day`);
    if (sentOn === null) throw new BoardShapeError(`member ${i} reminder day`);
    lastReminder = { kind: r.kind, sentOn, sentAt: strOrNull(r.sent_at, `member ${i} reminder time`), byLabel: strOrNull(r.by_label, `member ${i} reminder sender`) };
  }
  return {
    profileId: str(m.profile_id, `member ${i} profile`),
    userId: str(m.user_id, `member ${i} login`),
    firstName: strOrNull(m.first_name, `member ${i} first name`),
    lastName: strOrNull(m.last_name, `member ${i} last name`),
    preferredName: strOrNull(m.preferred_name, `member ${i} preferred name`),
    avatarUrl: strOrNull(m.avatar_url, `member ${i} avatar`),
    positionName: strOrNull(m.position_name, `member ${i} position`),
    positionText: strOrNull(m.position_text, `member ${i} title`),
    departmentKey: strOrNull(m.department_key, `member ${i} department`),
    departmentLabel: strOrNull(m.department_label, `member ${i} department label`),
    sortOrder: m.sort_order === null || m.sort_order === undefined ? null : int(m.sort_order, `member ${i} sort`),
    assignments: spans.map((s, j) => {
      const span = obj(s, `member ${i} assignment ${j}`);
      return { from: dateOrNull(span.from, `member ${i} assignment ${j} from`), to: dateOrNull(span.to, `member ${i} assignment ${j} to`) };
    }),
    month: {
      submissionId: strOrNull(month.submission_id, `member ${i} month id`),
      status: strOrNull(month.status, `member ${i} month status`),
      submittedAt: strOrNull(month.submitted_at, `member ${i} submitted`),
      onBehalf: bool(month.on_behalf, `member ${i} on behalf`),
      hodSigned: bool(month.hod_signed, `member ${i} HoD signed`),
      approvedAt: strOrNull(month.approved_at, `member ${i} approved`),
      lockedAt: strOrNull(month.locked_at, `member ${i} locked`),
    },
    days: {
      records: days(d.records, `member ${i} records`),
      leave: days(d.leave, `member ${i} leave`),
      breach: days(d.breach, `member ${i} breach days`),
      warning: days(d.warning, `member ${i} warning days`),
    },
    counts: {
      expected: int(c.expected, `member ${i} expected`),
      logged: int(c.logged, `member ${i} logged`),
      missing: int(c.missing, `member ${i} missing`),
      breachDays: int(c.breach_days, `member ${i} breach count`),
      unreviewed: int(c.unreviewed, `member ${i} unreviewed`),
      blockingUnreviewed: int(c.blocking_unreviewed, `member ${i} blocking`),
      lowUnreviewed: int(c.low_unreviewed, `member ${i} low`),
      awaitingCorrection: int(c.awaiting_correction, `member ${i} corrections`),
      seriousOpen: int(c.serious_open, `member ${i} serious`),
    },
    stillAboard: bool(m.still_aboard, `member ${i} aboard`),
    formerCrew: bool(m.former_crew, `member ${i} former crew`),
    onLeaveAllMonth: bool(m.on_leave_all_month, `member ${i} on leave`),
    lastReminder,
    remindedToday: bool(m.reminded_today, `member ${i} reminded today`),
  };
}

/** Reads work_rest_vessel_board's answer; throws BoardShapeError on anything unexpected. */
export function parseVesselBoard(value: unknown): VesselBoard {
  const b = obj(value, 'board');
  const hor = obj(b.hor, 'hor');
  const off = bool(hor.off, 'hor off');
  const members = Array.isArray(b.members) ? b.members : null;
  if (!members) throw new BoardShapeError('members');
  const today = dateOrNull(b.today, 'today');
  const firstDay = dateOrNull(b.first_day, 'first day');
  const lastDay = dateOrNull(b.last_day, 'last day');
  if (!today || !firstDay || !lastDay) throw new BoardShapeError('days');
  const month = int(b.month, 'month');
  if (month < 1 || month > 12) throw new BoardShapeError('month');
  if (!isHodStep(b.hod_step)) throw new BoardShapeError('hod step');
  return {
    vesselId: str(b.vessel_id, 'vessel'),
    year: int(b.year, 'year'),
    month,
    today,
    firstDay,
    lastDay,
    hor: { off, from: off ? null : dateOrNull(hor.from, 'hor from') },
    hodStep: b.hod_step,
    canFinalApprove: bool(b.can_final_approve, 'final approve'),
    myDepartmentKey: strOrNull(b.my_department_key, 'my department'),
    members: members.map(parseMember),
  };
}

// ---------------------------------------------------------------- months and URL

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface YearMonth {
  year: number;
  month: number;
}

export const monthLabel = ({ year, month }: YearMonth): string => `${MONTH_NAMES[month - 1]} ${year}`;
export const monthParam = ({ year, month }: YearMonth): string => `${year}-${String(month).padStart(2, '0')}`;

/** `?month=YYYY-MM` (the legacy `?year=&month=` pair too), or null. */
export function parseMonthParam(month: string | null, legacyYear?: string | null): YearMonth | null {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) return { year: y, month: m };
    return null;
  }
  if (legacyYear && month && /^\d{4}$/.test(legacyYear) && /^\d{1,2}$/.test(month)) {
    const y = Number(legacyYear);
    const m = Number(month);
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) return { year: y, month: m };
  }
  return null;
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The month a YYYY-MM-DD day falls in. */
export const monthOf = (day: string): YearMonth => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) });

export const compareMonths = (a: YearMonth, b: YearMonth): number => a.year * 12 + a.month - (b.year * 12 + b.month);

/** The first and last day of a month (YYYY-MM-DD). */
export function monthRange({ year, month }: YearMonth): { from: string; to: string } {
  const all = monthDays(year, month);
  return { from: all[0], to: all[all.length - 1] };
}

// ---------------------------------------------------------------- queues

export const BOARD_QUEUES = ['ready', 'waiting', 'approved', 'on_leave'] as const;
export type BoardQueue = (typeof BOARD_QUEUES)[number];
export type MemberQueue = BoardQueue | 'in_review';

export const QUEUE_LABEL: Readonly<Record<BoardQueue, string>> = {
  ready: 'Ready for you',
  waiting: 'Waiting on crew',
  approved: 'Approved',
  on_leave: 'On leave',
};

export const isBoardQueue = (v: unknown): v is BoardQueue => typeof v === 'string' && (BOARD_QUEUES as readonly string[]).includes(v);

/** Who is looking at the board. */
export interface BoardViewer {
  /** The viewer's login (their own month is never theirs to sign). */
  userId: string | null;
}

/** The month's state as the machine reads it (no row: a draft). */
export function memberMonthState(member: BoardMember): MonthState {
  return normaliseMonthStatus(member.month.status ?? 'draft') ?? 'draft';
}

const isOwn = (member: BoardMember, viewer: BoardViewer) => viewer.userId !== null && viewer.userId === member.userId;
const sameDepartment = (member: BoardMember, board: VesselBoard) =>
  board.myDepartmentKey !== null && member.departmentKey !== null && board.myDepartmentKey === member.departmentKey;

/** The facts the month machine needs, from the board (the viewer holds hours_of_rest.approve: the board's gate). */
export function memberMonthFacts(member: BoardMember, board: VesselBoard, viewer: BoardViewer, reason: string | null = null): MonthFacts {
  return {
    isOwn: isOwn(member, viewer),
    canCreate: false,
    canApprove: true,
    canFinalApprove: board.canFinalApprove,
    sameDepartment: sameDepartment(member, board),
    inMonth: true,
    stillAboard: member.stillAboard,
    hodStep: board.hodStep,
    hodSigned: member.month.hodSigned,
    blockingUnreviewed: member.counts.blockingUnreviewed,
    lowUnreviewed: member.counts.lowUnreviewed,
    missingDays: member.counts.missing,
    reason,
  };
}

/** A decision's refusal, or null when the action may run. */
function refusalOf(decision: MonthDecision): { refusal: MonthRefusal; sqlstate: '42501' | '22023' } | null {
  return 'refusal' in decision ? { refusal: decision.refusal, sqlstate: decision.sqlstate } : null;
}

/** The viewer may move this month now: approve (final approver) or sign it as head of department. */
export function viewerMayAct(member: BoardMember, board: VesselBoard, viewer: BoardViewer): boolean {
  const facts = memberMonthFacts(member, board, viewer);
  const status = member.month.status;
  if (board.canFinalApprove && decideMonthAction(status, 'approve', facts).ok) return true;
  if (board.canFinalApprove) {
    // Approval is blocked by an unreviewed breach: reviewing it is the viewer's move all the same.
    if (refusalOf(decideMonthAction(status, 'approve', facts))?.refusal === 'breaches_unreviewed') return true;
  }
  return decideMonthAction(status, 'hod_sign', facts).ok;
}

export function memberQueue(member: BoardMember, board: VesselBoard, viewer: BoardViewer): MemberQueue {
  const state = memberMonthState(member);
  if (state === 'approved' || state === 'locked') return 'approved';
  if (member.onLeaveAllMonth) return 'on_leave';
  if (state === 'submitted' || state === 'hod_signed') return viewerMayAct(member, board, viewer) ? 'ready' : 'in_review';
  return 'waiting';
}

export type QueueCounts = Readonly<Record<BoardQueue | 'all', number>>;

export function queueCounts(members: readonly BoardMember[], board: VesselBoard, viewer: BoardViewer): QueueCounts {
  const counts: Record<BoardQueue | 'all', number> = { all: members.length, ready: 0, waiting: 0, approved: 0, on_leave: 0 };
  for (const m of members) {
    const q = memberQueue(m, board, viewer);
    if (q !== 'in_review') counts[q] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------- departments

export const OTHER_DEPARTMENT = 'other';

export interface DepartmentGroup {
  key: string;
  label: string;
  members: BoardMember[];
}

const humanise = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** People by department, in the server's order (department catalogue order, then rank); no department last, as Other. */
export function departmentGroups(members: readonly BoardMember[]): DepartmentGroup[] {
  const groups = new Map<string, DepartmentGroup>();
  let other: DepartmentGroup | null = null;
  for (const m of members) {
    if (!m.departmentKey) {
      other ??= { key: OTHER_DEPARTMENT, label: 'Other', members: [] };
      other.members.push(m);
      continue;
    }
    let g = groups.get(m.departmentKey);
    if (!g) {
      g = { key: m.departmentKey, label: m.departmentLabel ?? humanise(m.departmentKey), members: [] };
      groups.set(m.departmentKey, g);
    }
    g.members.push(m);
  }
  return other ? [...groups.values(), other] : [...groups.values()];
}

export interface DepartmentTab {
  key: string;
  label: string;
  count: number;
}

/** "All" then one tab per department present on the board. */
export function departmentTabs(members: readonly BoardMember[]): DepartmentTab[] {
  return [{ key: 'all', label: 'All', count: members.length }, ...departmentGroups(members).map((g) => ({ key: g.key, label: g.label, count: g.members.length }))];
}

export interface BoardFilter {
  dept: string | null;
  queue: BoardQueue | null;
}

/** The members a department tab and a queue chip leave (both optional). */
export function filterMembers(members: readonly BoardMember[], filter: BoardFilter, board: VesselBoard, viewer: BoardViewer): BoardMember[] {
  return members.filter((m) => {
    if (filter.dept && filter.dept !== 'all') {
      const key = m.departmentKey ?? OTHER_DEPARTMENT;
      if (key !== filter.dept) return false;
    }
    if (filter.queue && memberQueue(m, board, viewer) !== filter.queue) return false;
    return true;
  });
}

// ---------------------------------------------------------------- the card

export function displayName(member: Pick<BoardMember, 'preferredName' | 'firstName' | 'lastName'>): string {
  const first = member.preferredName?.trim() || member.firstName?.trim() || '';
  const name = [first, member.lastName?.trim() || ''].filter(Boolean).join(' ');
  return name || 'Crew member';
}

export const positionLabel = (member: BoardMember): string => member.positionName ?? member.positionText ?? 'Crew';

/** One mini-calendar day: the lib/horDay.ts state of the person's day on this vessel. */
export interface BoardDay {
  date: string;
  day: HorDay;
}

export function memberDays(member: BoardMember, board: VesselBoard): BoardDay[] {
  const records = new Set(member.days.records);
  const leave = new Set(member.days.leave);
  const breach = new Set(member.days.breach);
  const warning = new Set(member.days.warning);
  return monthDays(board.year, board.month).map((date) => {
    const d = Number(date.slice(8, 10));
    return {
      date,
      day: horDayState({
        date,
        today: board.today,
        start: board.hor,
        assignments: member.assignments,
        leaveCode: leave.has(d) ? 'L' : null,
        hasRecord: records.has(d),
        monthStatus: member.month.status,
        breach: breach.has(d),
        warning: warning.has(d),
      }),
    };
  });
}

/** The words of the month's sign-off actions on the board's status menu. */
export const BOARD_ACTION_LABEL: Readonly<Record<'hod_sign' | 'approve' | 'lock' | 'reopen', string>> = {
  hod_sign: 'Sign as head of department',
  approve: 'Approve month',
  lock: 'Lock month',
  reopen: 'Reopen month',
};

export type BoardMenuAction = keyof typeof BOARD_ACTION_LABEL;
const MENU_ACTIONS: readonly BoardMenuAction[] = ['hod_sign', 'approve', 'lock', 'reopen'];

/** The server refuses approval while a correction is still requested (trigger trg_work_rest_month_correction_guard). */
export const CORRECTION_PENDING_TEXT = 'A correction was requested for a breach of this month. Accept or dismiss it before approving the month.';

export interface MenuItem {
  action: BoardMenuAction;
  label: string;
  /** null: available; else why not, in a sentence. */
  disabledReason: string | null;
  /** The action asks for a reason first (reopen). */
  needsReason: boolean;
}

/**
 * The status menu: actions the viewer could take on this month. Who may not
 * act (42501) and steps the month is not at are left out; a condition that
 * blocks (unreviewed breaches, the HoD signature required, a correction still
 * requested) shows the action disabled with its sentence.
 */
export function menuItems(member: BoardMember, board: VesselBoard, viewer: BoardViewer): MenuItem[] {
  const items: MenuItem[] = [];
  const status = member.month.status;
  for (const action of MENU_ACTIONS) {
    const refused = refusalOf(decideMonthAction(status, action, memberMonthFacts(member, board, viewer, action === 'reopen' ? 'x' : null)));
    if (refused && (refused.sqlstate === '42501' || refused.refusal === 'illegal_transition')) continue;
    let disabledReason = refused ? MONTH_REFUSAL_TEXT[refused.refusal] : null;
    if (action === 'approve' && disabledReason === null && member.counts.awaitingCorrection > 0) disabledReason = CORRECTION_PENDING_TEXT;
    items.push({ action, label: BOARD_ACTION_LABEL[action], disabledReason, needsReason: action === 'reopen' });
  }
  return items;
}

/** "Has left the vessel. Submit on their behalf" (C43): the final approver, a former crew member's open month. */
export function canSubmitOnBehalf(member: BoardMember, board: VesselBoard, viewer: BoardViewer): boolean {
  return decideMonthAction(member.month.status, 'submit_on_behalf', memberMonthFacts(member, board, viewer, 'x')).ok;
}

const shortDay = (day: string): string => {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
};

/** "Reminded 3 Nov by Chief Officer", "Reminded automatically 1 Nov", or null. */
export function reminderLine(reminder: BoardReminder | null): string | null {
  if (!reminder) return null;
  if (reminder.kind !== 'manual') return `Reminded automatically ${shortDay(reminder.sentOn)}`;
  return reminder.byLabel ? `Reminded ${shortDay(reminder.sentOn)} by ${reminder.byLabel}` : `Reminded ${shortDay(reminder.sentOn)}`;
}

export type RemindBlock = 'own_month' | 'month_closed' | 'reminded_today' | 'on_leave';

export const REMIND_BLOCK_TEXT: Readonly<Record<RemindBlock, string>> = {
  own_month: 'This is your own month.',
  month_closed: 'The month is already submitted.',
  reminded_today: 'Already reminded today.',
  on_leave: 'On leave all month: nothing to enter.',
};

/** Whether Remind is offered for a card (the server checks the same and more). */
export function remindState(member: BoardMember, viewer: BoardViewer): { can: boolean; block: RemindBlock | null } {
  const state = memberMonthState(member);
  let block: RemindBlock | null = null;
  if (isOwn(member, viewer)) block = 'own_month';
  else if (state !== 'draft' && state !== 'reopened') block = 'month_closed';
  else if (member.onLeaveAllMonth) block = 'on_leave';
  else if (member.remindedToday) block = 'reminded_today';
  return { can: block === null, block };
}

/** The people "Remind all waiting" sends to: the chip's waiting crew who can be reminded now. */
export function remindableWaiting(members: readonly BoardMember[], board: VesselBoard, viewer: BoardViewer): BoardMember[] {
  return members.filter((m) => memberQueue(m, board, viewer) === 'waiting' && remindState(m, viewer).can);
}

/**
 * C45: the whole month is before the vessel's Hours of Rest start date
 * ("Hours of rest starts on <date>"), or the module is off.
 */
export function boardStartNotice(board: Pick<VesselBoard, 'hor' | 'lastDay'>): { kind: 'off' } | { kind: 'before_start'; from: string } | null {
  if (board.hor.off) return { kind: 'off' };
  if (board.hor.from && board.hor.from > board.lastDay) return { kind: 'before_start', from: board.hor.from };
  return null;
}

/** "1 December 2026". */
export function longDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------- breach review (C42)

export const REVIEW_OUTCOMES = ['accepted', 'correction_requested', 'dismissed'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export const REVIEW_OUTCOME_LABEL: Readonly<Record<ReviewOutcome, string>> = {
  accepted: 'Accept with justification',
  correction_requested: 'Request correction',
  dismissed: 'Dismiss',
};

/** The note's label for each outcome (a justification is required to accept). */
export const REVIEW_NOTE_LABEL: Readonly<Record<ReviewOutcome, string>> = {
  accepted: 'Justification',
  correction_requested: 'What to correct (optional)',
  dismissed: 'Note (optional)',
};

/** What each outcome does, in a sentence under the choice. */
export const REVIEW_OUTCOME_HINT: Readonly<Record<ReviewOutcome, string>> = {
  accepted: 'The breach stands, with your reason on record (an emergency, a drill).',
  correction_requested: 'The month goes back to the crew member to correct the record.',
  dismissed: 'The record was checked after the correction and the breach does not stand.',
};

/** The toast after a review. */
export const REVIEW_DONE_TEXT: Readonly<Record<ReviewOutcome, string>> = {
  accepted: 'Breach accepted with your justification',
  correction_requested: 'Correction requested',
  dismissed: 'Breach dismissed',
};

/** The review fields of a breach row (work_rest_vessel_breaches). */
export interface ReviewableBreach {
  status: string | null;
  review_outcome: string | null;
  breach_report_id: string | null;
  can_review: boolean;
}

/** Not reviewed yet, or waiting on a requested correction. */
export function isOpenBreach(b: Pick<ReviewableBreach, 'status' | 'review_outcome'>): boolean {
  return (b.review_outcome === null && (b.status ?? 'open') === 'open') || b.review_outcome === 'correction_requested';
}

/**
 * The outcomes the panel offers a breach (the server's rules): an open
 * breach is accepted or sent back; one waiting on a correction is accepted
 * or dismissed; a reviewed or reported breach offers nothing; nothing when
 * the viewer may not review it.
 */
export function reviewOptions(b: ReviewableBreach): ReviewOutcome[] {
  if (!b.can_review || b.breach_report_id) return [];
  if (b.review_outcome === 'correction_requested') return ['accepted', 'dismissed'];
  if (b.review_outcome === null && (b.status ?? 'open') === 'open') return ['accepted', 'correction_requested'];
  return [];
}

/** The state a breach row reads as (the work_rest_nc vocabulary). */
export function breachState(b: Pick<ReviewableBreach, 'status' | 'review_outcome' | 'breach_report_id'>): string {
  if (b.breach_report_id) return 'reported';
  if (b.review_outcome) return b.review_outcome;
  return b.status ?? 'open';
}

/** Hours short, as the deficit column shows them ("9 h", "2.5 h"); a dash for the count and interval rules. */
export function deficitText(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '–';
  const rounded = Math.round(hours * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded)} h`;
}

export const RULE_LABEL: Readonly<Record<string, string>> = {
  REST_24H_MIN: 'Rest in 24 h',
  REST_7D_MIN: 'Rest in 7 days',
  REST_PERIODS_MAX: 'Rest periods',
  REST_LONG_BLOCK_MIN: 'Longest rest',
  REST_INTERVAL_MAX: 'Interval between rests',
};

export const ruleLabel = (code: string): string => RULE_LABEL[code] ?? code;

const hoursText = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? r.toFixed(0) : String(r);
};

/** What was measured against the limit, in words ("6 h rest, needs 10 h"); null when a figure is missing. */
export function breachFigures(rule: string, measured: number | null | undefined, threshold: number | null | undefined): string | null {
  if (measured === null || measured === undefined || threshold === null || threshold === undefined) return null;
  if (!Number.isFinite(measured) || !Number.isFinite(threshold)) return null;
  switch (rule) {
    case 'REST_PERIODS_MAX':
      return `${hoursText(measured)} rest periods, at most ${hoursText(threshold)}`;
    case 'REST_INTERVAL_MAX':
      return `${hoursText(measured)} h between rests, at most ${hoursText(threshold)} h`;
    case 'REST_LONG_BLOCK_MIN':
      return `Longest rest ${hoursText(measured)} h, needs ${hoursText(threshold)} h`;
    default:
      return `${hoursText(measured)} h rest, needs ${hoursText(threshold)} h`;
  }
}

/** The fields the breach list is ordered by. */
export interface SortableBreach {
  is_serious: boolean;
  status: string | null;
  review_outcome: string | null;
  breach_day: string | null;
  last_name: string | null;
  first_name: string | null;
}

/**
 * The review order: serious breaches first, then the ones still to review
 * (open or waiting on a correction), then by day and name.
 */
export function sortBreaches<T extends SortableBreach>(rows: readonly T[]): T[] {
  const name = (r: T) => `${r.last_name ?? ''} ${r.first_name ?? ''}`.trim().toLowerCase();
  return [...rows].sort(
    (a, b) =>
      Number(b.is_serious) - Number(a.is_serious) ||
      Number(isOpenBreach(b)) - Number(isOpenBreach(a)) ||
      (a.breach_day ?? '').localeCompare(b.breach_day ?? '') ||
      name(a).localeCompare(name(b)),
  );
}

export const BREACH_FILTERS = ['open', 'all'] as const;
export type BreachFilter = (typeof BREACH_FILTERS)[number];

export const BREACH_FILTER_LABEL: Readonly<Record<BreachFilter, string>> = {
  open: 'Non-compliant only',
  all: 'All breaches',
};

/** `?breaches=open|all` (the panel is open); anything else: closed. */
export const parseBreachFilter = (v: string | null): BreachFilter | null => (v === 'open' || v === 'all' ? v : null);

/** The rows a filter leaves: "Non-compliant only" keeps the breaches not yet accepted or dismissed. */
export function filterBreaches<T extends Pick<ReviewableBreach, 'status' | 'review_outcome'>>(rows: readonly T[], filter: BreachFilter): T[] {
  return filter === 'open' ? rows.filter(isOpenBreach) : [...rows];
}

export const NOTE_MAX = REASON_MAX;

/** The review form (RHF + zod): accepting needs a justification; every note at most 2000 characters. */
export const breachReviewSchema = z
  .object({
    outcome: z.enum(REVIEW_OUTCOMES),
    note: z.string().max(NOTE_MAX, `Keep the note to ${NOTE_MAX} characters.`),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === 'accepted' && blank(v.note)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'Give the justification, for example an emergency or a drill.' });
    }
  });
export type BreachReviewValues = z.infer<typeof breachReviewSchema>;

/** The on-behalf form (C43): a reason is required. */
export const onBehalfSchema = z.object({
  reason: z
    .string()
    .max(REASON_MAX, `Keep the reason to ${REASON_MAX} characters.`)
    .refine((v) => !blank(v), 'Give the reason, for example why they could not submit before leaving.'),
});
export type OnBehalfValues = z.infer<typeof onBehalfSchema>;

/** The reopen form: a reason is required (the server's rule). */
export const reopenSchema = z.object({
  reason: z
    .string()
    .max(REASON_MAX, `Keep the reason to ${REASON_MAX} characters.`)
    .refine((v) => !blank(v), 'Give the reason for reopening.'),
});
export type ReopenValues = z.infer<typeof reopenSchema>;

/** Refusal sentences of the board's writes (the server's DETAIL says the same; this is the fallback). */
export const BOARD_REFUSAL_TEXT: Readonly<Record<string, string>> = {
  reminder_rate_limited: 'Already reminded today.',
  month_closed: 'Their month is already submitted.',
  not_on_board: "Remind only crew on this vessel's hours of rest board for that month.",
  note_required: 'Give the justification, for example an emergency or a drill.',
  dismiss_needs_correction: 'Dismiss a breach only after a correction was requested and the record checked. Accept it with a justification instead.',
  correction_already_requested: 'A correction has already been requested for this breach.',
  already_reviewed: 'This breach has been reviewed.',
  breach_superseded: 'The record was corrected and this breach no longer applies.',
  breach_reported: 'This breach is in a breach report and can no longer change.',
  own_breach: 'Someone else reviews your own breaches.',
  out_of_department: 'Heads of department review breaches of their own department only.',
  reopen_not_permitted: 'This month is approved. Only the final approver can send it back for a correction.',
  correction_pending: CORRECTION_PENDING_TEXT,
};

export type { MonthAction };
