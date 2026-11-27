/**
 * The planner's period rules and the leave request machine (gap/04 W7,
 * C50, C52; X1-09). The exact mirror of 20261124060900_crew_planner_periods.sql:
 *
 * - rangesOverlap / periodsOverlap    planner_periods_overlap()
 * - openHorizon                       planner_open_horizon()
 * - planReplace                       the replace loop of planner_period_write()
 * - validatePeriodsInput              planner_periods_parse()
 * - leaveDecisionCheck                planner_leave_decide_check()
 *
 * The SQL test loads this file (scripts/db/lib/load-ts.mjs) and compares
 * rangesOverlap, openHorizon and leaveDecisionCheck with the SQL functions
 * case by case; the replace and validation rules are pinned by the same
 * scenarios on both sides.
 *
 * A period's end is `null` when it is "end unknown": such a period ends the
 * day before the person's next period, so it never overlaps a period that
 * starts after it. Pure: only relative imports.
 */
import { addDays, compareDates, daysBetween, isDateOnly, maxDate } from './duration';

/** How far ahead an end-unknown period is written to day codes. */
export const OPEN_PERIOD_HORIZON_DAYS = 30;
/** Requests and Add leave hold at most this many periods. */
export const MAX_PERIODS_PER_REQUEST = 10;
/** Periods fall within this many days of today (two years). */
export const PERIOD_RANGE_DAYS = 731;
/** The leave type that replace may trim, split or remove. */
export const REPLACEABLE_LEAVE_TYPE = 'rotation';

/** Two periods share a day (a null end is end unknown). The mirror of planner_periods_overlap(). */
export function rangesOverlap(aStart: string | null, aEnd: string | null, bStart: string | null, bEnd: string | null): boolean {
  if (aStart === null || bStart === null) return false;
  const c = compareDates(aStart, bStart);
  if (c === 0) return true;
  if (c < 0) return aEnd !== null && compareDates(aEnd, bStart) >= 0;
  return bEnd !== null && compareDates(bEnd, aStart) >= 0;
}

export interface PeriodRange {
  start: string;
  /** null: end unknown. */
  end: string | null;
}

export const periodsOverlap = (a: PeriodRange, b: PeriodRange): boolean => rangesOverlap(a.start, a.end, b.start, b.end);

/**
 * How far an end-unknown period is written to day codes: today + 30, never
 * past the day before the next period, never before its own start. The
 * mirror of planner_open_horizon().
 */
export function openHorizon(start: string, nextStart: string | null, today: string): string {
  const ahead = maxDate(addDays(today, OPEN_PERIOD_HORIZON_DAYS), start);
  if (nextStart !== null && compareDates(nextStart, start) > 0) {
    const before = addDays(nextStart, -1);
    return compareDates(before, ahead) < 0 ? before : ahead;
  }
  return ahead;
}

/** A confirmed period as the store holds it. */
export interface StoredPeriod {
  id: string;
  leaveTypeKey: string;
  start: string;
  /** The stored end_date: the end, or how far an end-unknown period is written. */
  end: string;
  endUnknown: boolean;
}

/** The range a stored period covers for the overlap rules (an end-unknown period has no end). */
export const coverOf = (p: StoredPeriod): PeriodRange => ({ start: p.start, end: p.endUnknown ? null : p.end });

/** The day before the person's next period starts, for an end-unknown period; null when no period follows. */
export function effectiveEnd(period: StoredPeriod, others: readonly StoredPeriod[]): string | null {
  if (!period.endUnknown) return period.end;
  let next: string | null = null;
  for (const o of others) {
    if (o.id === period.id || compareDates(o.start, period.start) <= 0) continue;
    if (next === null || compareDates(o.start, next) < 0) next = o.start;
  }
  return next === null ? null : addDays(next, -1);
}

/** The period that governs a day: the latest start among the periods covering it (ties by id), as the day codes and manning read it. */
export function governingPeriod<T extends StoredPeriod>(periods: readonly T[], day: string): T | null {
  let best: T | null = null;
  for (const p of periods) {
    if (compareDates(p.start, day) > 0) continue;
    const end = effectiveEnd(p, periods);
    if (end !== null && compareDates(end, day) < 0) continue;
    if (best === null || compareDates(p.start, best.start) > 0 || (compareDates(p.start, best.start) === 0 && p.id < best.id)) best = p;
  }
  return best;
}

export interface ReplacePlan {
  /** Overlapping periods that refuse the write (not rotation leave, or replace not chosen). */
  blockers: StoredPeriod[];
  /** Rotation-leave periods removed. */
  deletes: string[];
  /** Rotation-leave periods trimmed. */
  updates: Array<{ id: string; start: string; end: string; endUnknown: boolean }>;
  /** The tail of a rotation-leave period split around the new one. */
  inserts: Array<{ fromId: string; start: string; end: string; endUnknown: false }>;
  /** The write goes ahead (no blocker). */
  ok: boolean;
}

/**
 * What writing `incoming` does to the person's other confirmed periods
 * (the replace loop of planner_period_write): an overlapping period blocks
 * unless `replace` is chosen and it is rotation leave, which is trimmed
 * before the new period, moved after it, split around it or removed.
 */
export function planReplace(existing: readonly StoredPeriod[], incoming: PeriodRange, replace: boolean): ReplacePlan {
  const plan: ReplacePlan = { blockers: [], deletes: [], updates: [], inserts: [], ok: true };
  const sorted = [...existing].sort((a, b) => compareDates(a.start, b.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const s = incoming.start;
  const e = incoming.end;
  for (const r of sorted) {
    if (!periodsOverlap(coverOf(r), incoming)) continue;
    if (!replace || r.leaveTypeKey !== REPLACEABLE_LEAVE_TYPE) {
      plan.blockers.push(r);
      continue;
    }
    if (compareDates(r.start, s) < 0) {
      if (!r.endUnknown && e !== null && compareDates(r.end, e) > 0) {
        plan.inserts.push({ fromId: r.id, start: addDays(e, 1), end: r.end, endUnknown: false });
      }
      plan.updates.push({ id: r.id, start: r.start, end: addDays(s, -1), endUnknown: false });
    } else if (e === null) {
      plan.deletes.push(r.id);
    } else if (r.endUnknown) {
      plan.updates.push({ id: r.id, start: addDays(e, 1), end: maxDate(r.end, addDays(e, 1)), endUnknown: true });
    } else if (compareDates(r.end, e) <= 0) {
      plan.deletes.push(r.id);
    } else {
      plan.updates.push({ id: r.id, start: addDays(e, 1), end: r.end, endUnknown: false });
    }
  }
  plan.ok = plan.blockers.length === 0;
  return plan;
}

/** One period of a request or Add leave, as the dialog sends it. */
export interface PeriodInput {
  leaveTypeKey: string;
  start: string;
  end: string | null;
  endUnknown: boolean;
}

export type PeriodsRefusal =
  | 'periods_required'
  | 'periods_too_many'
  | 'period_invalid'
  | 'leave_type_unknown'
  | 'period_dates_invalid'
  | 'period_out_of_range'
  | 'periods_overlap';

export type PeriodsCheck = { ok: true } | { ok: false; refusal: PeriodsRefusal; index: number | null };

/**
 * The periods of a request or Add leave, checked as planner_periods_parse()
 * does: 1 to 10 periods; an active leave type; a start; an end on or after
 * it, or end unknown and no end; every date within two years of today; no
 * two periods overlapping. `index` is the period (1-based) the refusal
 * names, null for the list as a whole.
 */
export function validatePeriodsInput(periods: readonly PeriodInput[], opts: { today: string; activeTypeKeys: readonly string[] }): PeriodsCheck {
  if (periods.length === 0) return { ok: false, refusal: 'periods_required', index: null };
  if (periods.length > MAX_PERIODS_PER_REQUEST) return { ok: false, refusal: 'periods_too_many', index: null };
  const seen: PeriodRange[] = [];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const index = i + 1;
    if (!opts.activeTypeKeys.includes(p.leaveTypeKey)) return { ok: false, refusal: 'leave_type_unknown', index };
    if (!isDateOnly(p.start) || (p.end !== null && !isDateOnly(p.end))) return { ok: false, refusal: 'period_invalid', index };
    if ((p.endUnknown && p.end !== null) || (!p.endUnknown && p.end === null)) return { ok: false, refusal: 'period_invalid', index };
    if (p.end !== null && compareDates(p.end, p.start) < 0) return { ok: false, refusal: 'period_dates_invalid', index };
    const fromToday = daysBetween(opts.today, p.start);
    if (fromToday < -PERIOD_RANGE_DAYS || fromToday > PERIOD_RANGE_DAYS || (p.end !== null && daysBetween(opts.today, p.end) > PERIOD_RANGE_DAYS)) {
      return { ok: false, refusal: 'period_out_of_range', index };
    }
    const range = { start: p.start, end: p.end };
    if (seen.some((x) => periodsOverlap(x, range))) return { ok: false, refusal: 'periods_overlap', index };
    seen.push(range);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- leave requests (gap/04 C52, W7)

export const LEAVE_REQUEST_STATUSES = ['draft', 'pending', 'approved', 'declined', 'cancelled', 'completed'] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const LEAVE_DECISIONS = ['hod_review', 'approve', 'decline', 'cancel'] as const;
export type LeaveDecision = (typeof LEAVE_DECISIONS)[number];

export const LEAVE_HOD_STEPS = ['off', 'nudge', 'required'] as const;
export type LeaveHodStep = (typeof LEAVE_HOD_STEPS)[number];

/** The status a decision leaves the request in (a HoD review keeps it pending). */
export const LEAVE_DECISION_RESULT: Readonly<Record<LeaveDecision, LeaveRequestStatus>> = Object.freeze({
  hod_review: 'pending',
  approve: 'approved',
  decline: 'declined',
  cancel: 'cancelled',
});

/**
 * May this decision be taken? 'ok' or '<sqlstate>:<refusal>'. The exact
 * mirror of planner_leave_decide_check(): hod_review (pending, the HoD
 * step on, the department's head, once), approve (pending, an approver,
 * after the HoD review when the step is required unless Master or fleet),
 * decline (pending, an approver or the department's head with the step on,
 * a reason), cancel (the requester while pending; an approver while pending
 * or approved, with a reason unless it is their own). Nobody decides their
 * own request.
 */
export function leaveDecisionCheck(
  decision: string | null,
  status: string | null,
  isOwner: boolean | null,
  isApprover: boolean | null,
  isHod: boolean | null,
  isMasterOrFleet: boolean | null,
  hodStep: string | null,
  hodReviewed: boolean | null,
  hasReason: boolean | null,
): string {
  const owner = isOwner ?? false;
  const approver = isApprover ?? false;
  const hod = isHod ?? false;
  const masterFleet = isMasterOrFleet ?? false;
  const step = hodStep ?? 'nudge';
  const reviewed = hodReviewed ?? false;
  const reason = hasReason ?? false;
  if (decision === null || !(LEAVE_DECISIONS as readonly string[]).includes(decision)) return '22023:decision_invalid';
  if (decision === 'hod_review') {
    if (status !== 'pending') return '22023:illegal_transition';
    if (step === 'off') return '22023:hod_step_off';
    if (owner) return '42501:own_request';
    if (!hod) return '42501:not_department_hod';
    if (reviewed) return '22023:already_reviewed';
    return 'ok';
  }
  if (decision === 'approve') {
    if (status !== 'pending') return '22023:illegal_transition';
    if (owner) return '42501:own_request';
    if (!approver) return '42501:not_permitted';
    if (step === 'required' && !reviewed && !masterFleet) return '22023:hod_review_pending';
    return 'ok';
  }
  if (decision === 'decline') {
    if (status !== 'pending') return '22023:illegal_transition';
    if (owner) return '42501:own_request';
    if (!(approver || (hod && step !== 'off'))) return '42501:not_permitted';
    if (!reason) return '22023:reason_required';
    return 'ok';
  }
  if (status === null || (status !== 'pending' && status !== 'approved')) return '22023:illegal_transition';
  if (status === 'pending' && owner) return 'ok';
  if (status === 'approved' && owner && !approver) return '42501:ask_approver';
  if (!approver) return '42501:not_permitted';
  if (!owner && !reason) return '22023:reason_required';
  return 'ok';
}

export interface LeaveDecisionContext {
  status: LeaveRequestStatus | string;
  isOwner: boolean;
  isApprover: boolean;
  isHod: boolean;
  isMasterOrFleet: boolean;
  hodStep: LeaveHodStep;
  hodReviewed: boolean;
}

/** The decisions a viewer may take on a request (a reason supplied where one is needed), with whether each asks for one. */
export function leaveRequestActions(ctx: LeaveDecisionContext): Array<{ decision: LeaveDecision; needsReason: boolean }> {
  const out: Array<{ decision: LeaveDecision; needsReason: boolean }> = [];
  for (const decision of LEAVE_DECISIONS) {
    const args = [decision, ctx.status, ctx.isOwner, ctx.isApprover, ctx.isHod, ctx.isMasterOrFleet, ctx.hodStep, ctx.hodReviewed] as const;
    if (leaveDecisionCheck(...args, true) !== 'ok') continue;
    out.push({ decision, needsReason: leaveDecisionCheck(...args, false) === '22023:reason_required' });
  }
  return out;
}

/** The sentence for a planner refusal code (the server's DETAIL wins when it sends one). */
export const PLANNER_REFUSAL_TEXT: Readonly<Record<string, string>> = Object.freeze({
  crew_not_permitted: "You don't have permission to change this vessel's planner.",
  not_signed_in: 'Sign in to continue.',
  vessel_required: 'Choose a vessel.',
  vessel_not_found: 'This vessel could not be found.',
  person_not_found: 'This crew member could not be found.',
  period_not_found: 'This period could not be found on this vessel.',
  request_not_found: 'This leave request could not be found.',
  leave_type_unknown: 'Choose a leave type.',
  leave_type_invalid: 'Choose a type of time off.',
  leave_type_not_requestable: 'Choose a type of leave for each period.',
  leave_approval_required: 'Leave of this type needs an approver: add it with Add leave.',
  period_overlap: 'This period overlaps another one.',
  period_from_request: 'This period comes from an approved leave request: cancel or change the request instead.',
  period_changed: 'Someone changed this period after you opened it. Reload and try again.',
  period_invalid: 'Give a start and an end, or tick End unknown.',
  period_dates_invalid: 'The end is before the start.',
  period_out_of_range: 'Periods fall within two years of today.',
  periods_required: 'Add at least one period.',
  periods_too_many: 'A request holds at most 10 periods.',
  periods_overlap: 'Two of these periods overlap.',
  notes_too_long: 'Notes hold up to 2,000 characters.',
  reason_too_long: 'A reason holds up to 2,000 characters.',
  request_needs_login: 'Leave for a crew member without a sign-in is added by a leave approver.',
  not_on_vessel_crew: 'You can request leave on a vessel you are assigned to.',
  request_vessel_unknown: 'This request names no vessel; ask the crew member to request again from their vessel.',
  decision_invalid: 'Choose approve, decline or cancel.',
  illegal_transition: 'This request has already been decided.',
  hod_step_off: 'This vessel has no head-of-department review for leave.',
  own_request: "You can't decide your own leave request.",
  not_department_hod: "Only the head of the crew member's department reviews this request first.",
  already_reviewed: 'The head of department has already reviewed this request.',
  not_permitted: "You don't have permission to decide leave on this vessel.",
  hod_review_pending: "The head of the crew member's department reviews this request first.",
  reason_required: 'Give a reason.',
  ask_approver: 'Approved leave is cancelled by a leave approver.',
  hod_step_invalid: 'Choose off, nudge or required.',
  direction_invalid: 'Choose on or off.',
  date_out_of_range: 'Choose a day within a month of today.',
  person_not_on_vessel: 'Only crew assigned to this vessel on that day can be toggled on or off.',
  already_off: 'This crew member is already off on that day.',
  not_on_leave: 'There is no time off on that day to end.',
  range_required: 'Choose a start and an end.',
  range_invalid: 'The end is before the start.',
  range_too_long: 'Choose at most 400 days.',
});

/** The sentence for a refusal: the server's own sentence when it is one, else the planner's, else a generic one. */
export function plannerRefusalText(refusal: string, detail?: string | null): string {
  const d = (detail ?? '').trim();
  if (d && !/^[a-z0-9_]+$/.test(d)) return d;
  return PLANNER_REFUSAL_TEXT[refusal] ?? 'The planner could not save this change.';
}

// ---------------------------------------------------------------- the planner's reads (planner_vessel_periods, leave requests)

const PERIOD_STATUSES = ['draft', 'confirmed', 'pending_approval', 'conflict', 'complete'] as const;
export type PlannerPeriodStatus = (typeof PERIOD_STATUSES)[number];

/** One period of the vessel's timeline (planner_vessel_periods), camel case. */
export interface PlannerPeriod {
  id: string;
  vesselId: string | null;
  profileId: string | null;
  crewUserId: string | null;
  /** The person's name as the timeline shows it (preferred name, else first and last, else the imported name). */
  crewName: string;
  /** null: a legacy bar whose type maps to no leave type (tbc). */
  leaveTypeKey: string | null;
  status: PlannerPeriodStatus;
  start: string;
  /** The stored end_date (for an end-unknown period: how far its day codes are written). */
  end: string;
  endUnknown: boolean;
  /** The day before the next period for an end-unknown period; null while none follows. */
  effectiveEnd: string | null;
  requestId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  isSickOnBoard: boolean;
  notes: string | null;
  version: number;
  updatedAt: string;
}

/** A planner answer that does not have the shape the planner needs (never guessed). */
export class PlannerShapeError extends Error {
  readonly answer: unknown;
  constructor(message: string, answer: unknown) {
    super(message);
    this.name = 'PlannerShapeError';
    this.answer = answer;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const textOrNull = (v: unknown, what: string, row: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new PlannerShapeError(`The planner answer has an unexpected ${what}.`, row);
  return v;
};
const requiredText = (v: unknown, what: string, row: unknown): string => {
  if (typeof v !== 'string' || !v) throw new PlannerShapeError(`The planner answer has no ${what}.`, row);
  return v;
};
const dateOnly = (v: unknown, what: string, row: unknown): string => {
  if (!isDateOnly(v)) throw new PlannerShapeError(`The planner answer has no ${what}.`, row);
  return v;
};
const dateOrNull = (v: unknown, what: string, row: unknown): string | null => (v === null || v === undefined ? null : dateOnly(v, what, row));
const flag = (v: unknown, what: string, row: unknown): boolean => {
  if (typeof v !== 'boolean') throw new PlannerShapeError(`The planner answer has an unexpected ${what}.`, row);
  return v;
};

/** The name the timeline shows for a person: preferred name, else first and last name, else the imported name, else "Unnamed crew". */
export function plannerCrewName(r: { preferredName?: string | null; firstName?: string | null; lastName?: string | null; rawName?: string | null }): string {
  const preferred = (r.preferredName ?? '').trim();
  const last = (r.lastName ?? '').trim();
  if (preferred) return last ? `${preferred} ${last}` : preferred;
  const full = [r.firstName, r.lastName].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  if (full) return full;
  const raw = (r.rawName ?? '').trim();
  return raw || 'Unnamed crew';
}

/** Reads planner_vessel_periods' rows strictly (snake case, as the RPC answers). */
export function parsePlannerPeriodRows(rows: unknown): PlannerPeriod[] {
  if (!Array.isArray(rows)) throw new PlannerShapeError('The planner periods came back in an unexpected shape.', rows);
  return rows.map((row: unknown) => {
    if (!isRecord(row)) throw new PlannerShapeError('A planner period is not an object.', row);
    if (!(PERIOD_STATUSES as readonly unknown[]).includes(row.status)) throw new PlannerShapeError('A planner period has an unknown status.', row);
    if (typeof row.version !== 'number' || !Number.isInteger(row.version)) throw new PlannerShapeError('A planner period has no version.', row);
    const start = dateOnly(row.start_date, 'start', row);
    const end = dateOnly(row.end_date, 'end', row);
    if (compareDates(end, start) < 0) throw new PlannerShapeError('A planner period ends before it starts.', row);
    return {
      id: requiredText(row.id, 'id', row),
      vesselId: textOrNull(row.vessel_id, 'vessel', row),
      profileId: textOrNull(row.profile_id, 'person', row),
      crewUserId: textOrNull(row.crew_user_id, 'login', row),
      crewName: plannerCrewName({
        preferredName: textOrNull(row.preferred_name, 'preferred name', row),
        firstName: textOrNull(row.first_name, 'first name', row),
        lastName: textOrNull(row.last_name, 'last name', row),
        rawName: textOrNull(row.crew_name_raw, 'imported name', row),
      }),
      leaveTypeKey: textOrNull(row.leave_type_key, 'leave type', row),
      status: row.status as PlannerPeriodStatus,
      start,
      end,
      endUnknown: flag(row.end_unknown, 'end unknown flag', row),
      effectiveEnd: dateOrNull(row.effective_end, 'effective end', row),
      requestId: textOrNull(row.request_id, 'request', row),
      approvedBy: textOrNull(row.approved_by, 'approver', row),
      approvedAt: textOrNull(row.approved_at, 'approval time', row),
      isSickOnBoard: flag(row.is_sick_on_board, 'sick on board flag', row),
      notes: textOrNull(row.notes, 'note', row),
      version: row.version,
      updatedAt: requiredText(row.updated_at, 'update time', row),
    };
  });
}

/** A confirmed (or complete) period with a leave type, as the overlap and replace rules read it. */
export function storedPeriodsOf(periods: readonly PlannerPeriod[], profileId: string): StoredPeriod[] {
  return periods
    .filter((p) => p.profileId === profileId && (p.status === 'confirmed' || p.status === 'complete') && p.leaveTypeKey !== null)
    .map((p) => ({ id: p.id, leaveTypeKey: p.leaveTypeKey as string, start: p.start, end: p.end, endUnknown: p.endUnknown }));
}

/** The p_periods payload of a request or Add leave (snake case; an end-unknown period sends no end). */
export function periodsPayload(periods: readonly PeriodInput[]): Array<{ leave_type_key: string; start_date: string; end_date: string | null; end_unknown: boolean }> {
  return periods.map((p) => ({
    leave_type_key: p.leaveTypeKey,
    start_date: p.start,
    end_date: p.endUnknown ? null : p.end,
    end_unknown: p.endUnknown,
  }));
}

/** One period of a leave request (crew_leave_request_periods), camel case. */
export interface LeaveRequestPeriod {
  id: string;
  leaveTypeKey: string;
  start: string;
  end: string | null;
  endUnknown: boolean;
  sortOrder: number;
}

/** A leave request with its periods, camel case. */
export interface LeaveRequest {
  id: string;
  companyId: string;
  vesselId: string | null;
  profileId: string | null;
  crewUserId: string;
  status: LeaveRequestStatus;
  /** The whole range of the request (the first start, the last end). */
  start: string;
  end: string;
  notes: string | null;
  submittedAt: string;
  hodReviewedAt: string | null;
  hodReviewedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  cancellationReason: string | null;
  /** The periods in their order; a legacy request (before 060900) has one, read from its own range. */
  periods: LeaveRequestPeriod[];
}

/**
 * Reads crew_leave_requests rows with their crew_leave_request_periods rows
 * strictly. A request without period rows is a legacy one: its one period
 * is its own range and type (`legacyTypeKey` maps its day code to a leave
 * type; an unknown code is an error, never a guess).
 */
export function parseLeaveRequestRows(
  requests: unknown,
  periods: unknown,
  legacyTypeKey: (dayCode: string) => string | null,
): LeaveRequest[] {
  if (!Array.isArray(requests)) throw new PlannerShapeError('The leave requests came back in an unexpected shape.', requests);
  if (!Array.isArray(periods)) throw new PlannerShapeError('The leave request periods came back in an unexpected shape.', periods);
  const byRequest = new Map<string, LeaveRequestPeriod[]>();
  for (const row of periods as unknown[]) {
    if (!isRecord(row)) throw new PlannerShapeError('A leave request period is not an object.', row);
    const requestId = requiredText(row.request_id, 'request', row);
    if (typeof row.sort_order !== 'number' || !Number.isInteger(row.sort_order)) throw new PlannerShapeError('A leave request period has no order.', row);
    const period: LeaveRequestPeriod = {
      id: requiredText(row.id, 'id', row),
      leaveTypeKey: requiredText(row.leave_type_key, 'leave type', row),
      start: dateOnly(row.start_date, 'start', row),
      end: dateOrNull(row.end_date, 'end', row),
      endUnknown: flag(row.end_unknown, 'end unknown flag', row),
      sortOrder: row.sort_order,
    };
    const list = byRequest.get(requestId);
    if (list) list.push(period);
    else byRequest.set(requestId, [period]);
  }
  return (requests as unknown[]).map((row) => {
    if (!isRecord(row)) throw new PlannerShapeError('A leave request is not an object.', row);
    if (!(LEAVE_REQUEST_STATUSES as readonly unknown[]).includes(row.status)) throw new PlannerShapeError('A leave request has an unknown status.', row);
    const id = requiredText(row.id, 'id', row);
    const start = dateOnly(row.start_date, 'start', row);
    const end = dateOnly(row.end_date, 'end', row);
    let list = [...(byRequest.get(id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    if (list.length === 0) {
      const code = requiredText(row.leave_type, 'leave type', row);
      const key = legacyTypeKey(code);
      if (key === null) throw new PlannerShapeError('A leave request has an unknown leave type.', row);
      list = [{ id: `${id}:legacy`, leaveTypeKey: key, start, end, endUnknown: false, sortOrder: 0 }];
    }
    return {
      id,
      companyId: requiredText(row.company_id, 'company', row),
      vesselId: textOrNull(row.vessel_id, 'vessel', row),
      profileId: textOrNull(row.profile_id, 'person', row),
      crewUserId: requiredText(row.crew_id, 'login', row),
      status: row.status as LeaveRequestStatus,
      start,
      end,
      notes: textOrNull(row.notes, 'note', row),
      submittedAt: requiredText(row.submitted_at, 'submission time', row),
      hodReviewedAt: textOrNull(row.hod_reviewed_at, 'review time', row),
      hodReviewedBy: textOrNull(row.hod_reviewed_by, 'reviewer', row),
      reviewedAt: textOrNull(row.reviewed_at, 'decision time', row),
      reviewedBy: textOrNull(row.reviewed_by, 'decider', row),
      cancellationReason: textOrNull(row.cancellation_reason, 'reason', row),
      periods: list,
    };
  });
}

// ---------------------------------------------------------------- errors (D-01)

/** The notice while 20261124060900 is not applied (the planner keeps its legacy behaviour, X1-09B). */
export const PLANNER_NOT_SET_UP_NOTICE = 'The new rotation planner is not set up on this database yet. The planner keeps working as before.';

/**
 * The planner RPC is not in the database yet (D-01): PostgREST's
 * "could not find the function" (PGRST202), or a 42883 naming the function
 * itself (a 42883 about anything else is a bug, not a missing migration).
 */
export function isPlannerRpcMissing(error: unknown, fn: string): boolean {
  if (!isRecord(error)) return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST202') return true;
  if (e.code === '42883') return typeof e.message === 'string' && e.message.includes(fn);
  return false;
}

/** The relation the planner reads is not in the database yet (42P01, PGRST205): the table of 060900 is missing. */
export function isPlannerTableMissing(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === '42P01' || code === 'PGRST205';
}

/** A missing planner RPC or table, as an error a hook throws and a page reads as "not set up". */
export class PlannerNotSetUpError extends Error {
  readonly fn: string;
  constructor(fn: string) {
    super(PLANNER_NOT_SET_UP_NOTICE);
    this.name = 'PlannerNotSetUpError';
    this.fn = fn;
  }
}

/** A refusal of a planner RPC: its SQLSTATE, its word, the sentence to show and the hint (a period id or a 1-based period index). */
export class PlannerRefusalError extends Error {
  readonly code: string | null;
  readonly refusal: string;
  readonly hint: string | null;
  /** The error the RPC answered. */
  readonly original: unknown;
  constructor(refusal: string, text: string, code: string | null, hint: string | null, original: unknown) {
    super(text);
    this.name = 'PlannerRefusalError';
    this.refusal = refusal;
    this.code = code;
    this.hint = hint;
    this.original = original;
  }
}

const REFUSAL_WORD = /^[a-z][a-z0-9_]*$/;

/**
 * The refusal a planner RPC raised (MESSAGE is a refusal word, DETAIL the
 * sentence, HINT the period), or null when the error is not one (a network
 * failure, a bug): those are thrown as they are.
 */
export function plannerRefusalOf(error: unknown): PlannerRefusalError | null {
  if (!isRecord(error)) return null;
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const word = typeof e.message === 'string' ? e.message.trim() : '';
  if (!REFUSAL_WORD.test(word)) return null;
  const code = typeof e.code === 'string' && e.code ? e.code : null;
  const detail = typeof e.details === 'string' ? e.details : null;
  const hint = typeof e.hint === 'string' && e.hint.trim() ? e.hint.trim() : null;
  return new PlannerRefusalError(word, plannerRefusalText(word, detail), code, hint, error);
}

/**
 * What a planner hook throws for a failed call: PlannerNotSetUpError for a
 * missing RPC (D-01), PlannerRefusalError for a refusal, else the error
 * itself. Never swallows.
 */
export function plannerErrorOf(error: unknown, fn: string): unknown {
  if (isPlannerRpcMissing(error, fn) || isPlannerTableMissing(error)) return new PlannerNotSetUpError(fn);
  return plannerRefusalOf(error) ?? error;
}
