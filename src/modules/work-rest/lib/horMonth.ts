/**
 * The hours-of-rest month (gap/04 C39, C43, W6; DECISIONS D-X1-6, D-X1-11,
 * D-X1-20). One month per crew member and vessel. Pure: the server's
 * work_rest_month_decide (20261124060700_crew_hor_engine.sql) is the same
 * rule, and work_rest_month_transition gathers the facts below from the
 * database and acts on the answer. The cases in
 * src/test/work-rest/fixtures/horCases.json ("months") hold the two
 * together.
 *
 *   draft / reopened --submit (the crew member, signs)-----------------> submitted
 *   draft / reopened --submit_on_behalf (final approver, for a person
 *                      who has left the vessel; reason; company sign)--> submitted
 *   submitted --hod_sign (HoR approve, same department, signs)--------> hod_signed
 *   submitted / hod_signed --approve (final approver, signs)----------> approved
 *   approved --lock (final approver)-----------------------------------> locked
 *   submitted / hod_signed / approved / locked --reopen (final
 *                      approver; reason; signatures kept as stale)----> reopened
 *
 * Who is checked first (42501), then where the month is (22023
 * illegal_transition), then the conditions (22023). Legacy statuses read as
 * their new names: crew_signed = submitted, hod_reviewed = hod_signed,
 * captain_reviewed = approved.
 */
import type { HodStep, SubmissionStatus } from '../types';

export const MONTH_ACTIONS = ['submit', 'submit_on_behalf', 'hod_sign', 'approve', 'lock', 'reopen'] as const;
export type MonthAction = (typeof MONTH_ACTIONS)[number];

/** The statuses the engine writes (legacy rows read as one of these). */
export const MONTH_STATES = ['draft', 'submitted', 'hod_signed', 'approved', 'locked', 'reopened'] as const;
export type MonthState = (typeof MONTH_STATES)[number];

/** Every status a month row may hold, the legacy ones included. */
export const ALL_SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'draft',
  'submitted',
  'crew_signed',
  'hod_reviewed',
  'hod_signed',
  'captain_reviewed',
  'approved',
  'locked',
  'reopened',
];

/** A stored status as the machine reads it; null for an unknown value. */
export function normaliseMonthStatus(status: string | null | undefined): MonthState | null {
  switch (status) {
    case 'draft':
    case 'submitted':
    case 'hod_signed':
    case 'approved':
    case 'locked':
    case 'reopened':
      return status;
    case 'crew_signed':
      return 'submitted';
    case 'hod_reviewed':
      return 'hod_signed';
    case 'captain_reviewed':
      return 'approved';
    default:
      return null;
  }
}

/** Days of an open month can be saved; a submitted, approved or locked month is closed (22023 month_closed). */
export function isMonthOpen(status: string | null | undefined): boolean {
  const s = status === null || status === undefined ? 'draft' : normaliseMonthStatus(status);
  return s === 'draft' || s === 'reopened';
}

/** From which states each action may run. */
export const LEGAL_FROM: Readonly<Record<MonthAction, readonly MonthState[]>> = {
  submit: ['draft', 'reopened'],
  submit_on_behalf: ['draft', 'reopened'],
  hod_sign: ['submitted'],
  approve: ['submitted', 'hod_signed'],
  lock: ['approved'],
  reopen: ['submitted', 'hod_signed', 'approved', 'locked'],
};

export const NEXT_STATE: Readonly<Record<MonthAction, MonthState>> = {
  submit: 'submitted',
  submit_on_behalf: 'submitted',
  hod_sign: 'hod_signed',
  approve: 'approved',
  lock: 'locked',
  reopen: 'reopened',
};

/** The signature an action records in work_rest_signatures (lock and reopen sign nothing). */
export const SIGNER_ROLE: Readonly<Record<MonthAction, 'crew' | 'company' | 'hod' | 'captain' | null>> = {
  submit: 'crew',
  submit_on_behalf: 'company',
  hod_sign: 'hod',
  approve: 'captain',
  lock: null,
  reopen: null,
};

/** What the decision needs to know (the server gathers the same from the database). */
export interface MonthFacts {
  /** The caller is the crew member. */
  isOwn: boolean;
  /** vessel.crew.hours_of_rest.create on the vessel. */
  canCreate: boolean;
  /** vessel.crew.hours_of_rest.approve on the vessel. */
  canApprove: boolean;
  /** vessel.crew.hours_of_rest.final_approve on the vessel. */
  canFinalApprove: boolean;
  /** The caller's department on the vessel is the crew member's. */
  sameDepartment: boolean;
  /** The crew member had an assignment on the vessel during the month. */
  inMonth: boolean;
  /** The crew member is still assigned to the vessel today. */
  stillAboard: boolean;
  hodStep: HodStep;
  /** A live head-of-department signature is on the month. */
  hodSigned: boolean;
  /** Unreviewed breaches of medium, high or critical severity. */
  blockingUnreviewed: number;
  /** Unreviewed low-severity breaches (a warning only). */
  lowUnreviewed: number;
  /** Expected days with no entry (a warning on submit). */
  missingDays: number;
  /** The reason given (on behalf, reopen). */
  reason: string | null;
}

export type MonthRefusal =
  | 'action_unknown'
  | 'not_own_month'
  | 'own_month'
  | 'not_permitted'
  | 'out_of_department'
  | 'illegal_transition'
  | 'not_on_vessel'
  | 'still_on_vessel'
  | 'reason_required'
  | 'reason_too_long'
  | 'hod_step_off'
  | 'hod_signature_required'
  | 'breaches_unreviewed';

export type MonthWarning = 'days_not_entered' | 'low_breaches_unreviewed' | 'hod_not_signed';

/** The SQLSTATE the server raises for each refusal (42501 who, 22023 the rest). */
export const REFUSAL_SQLSTATE: Readonly<Record<MonthRefusal, '42501' | '22023'>> = {
  action_unknown: '22023',
  not_own_month: '42501',
  own_month: '42501',
  not_permitted: '42501',
  out_of_department: '42501',
  illegal_transition: '22023',
  not_on_vessel: '22023',
  still_on_vessel: '22023',
  reason_required: '22023',
  reason_too_long: '22023',
  hod_step_off: '22023',
  hod_signature_required: '22023',
  breaches_unreviewed: '22023',
};

export type MonthDecision =
  | { ok: true; to: MonthState; warnings: MonthWarning[] }
  | { ok: false; refusal: MonthRefusal; sqlstate: '42501' | '22023' };

export const REASON_MAX = 2000;

const refuse = (refusal: MonthRefusal): MonthDecision => ({ ok: false, refusal, sqlstate: REFUSAL_SQLSTATE[refusal] });

const blank = (text: string | null | undefined): boolean => !text || text.trim().length === 0;

export function isMonthAction(action: string): action is MonthAction {
  return (MONTH_ACTIONS as readonly string[]).includes(action);
}

/**
 * Whether `action` may run on a month in `status` for the caller the facts
 * describe, and what follows: the next state and any warnings, or the
 * refusal and its SQLSTATE.
 */
export function decideMonthAction(status: string | null | undefined, action: string, facts: MonthFacts): MonthDecision {
  if (!isMonthAction(action)) return refuse('action_unknown');

  // Who.
  switch (action) {
    case 'submit':
      if (!facts.isOwn) return refuse('not_own_month');
      if (!facts.canCreate) return refuse('not_permitted');
      break;
    case 'submit_on_behalf':
      if (!facts.canFinalApprove) return refuse('not_permitted');
      if (facts.isOwn) return refuse('own_month');
      break;
    case 'hod_sign':
      if (!facts.canApprove) return refuse('not_permitted');
      if (facts.isOwn) return refuse('own_month');
      if (!facts.sameDepartment) return refuse('out_of_department');
      break;
    case 'approve':
    case 'reopen':
      if (!facts.canFinalApprove) return refuse('not_permitted');
      if (facts.isOwn) return refuse('own_month');
      break;
    case 'lock':
      if (!facts.canFinalApprove) return refuse('not_permitted');
      break;
  }

  // Where the month is.
  const state = normaliseMonthStatus(status ?? 'draft');
  if (state === null || !LEGAL_FROM[action].includes(state)) return refuse('illegal_transition');

  // Conditions.
  const warnings: MonthWarning[] = [];
  const reasonLong = (facts.reason ?? '').trim().length > REASON_MAX;
  switch (action) {
    case 'submit':
      if (!facts.inMonth) return refuse('not_on_vessel');
      if (facts.missingDays > 0) warnings.push('days_not_entered');
      break;
    case 'submit_on_behalf':
      if (facts.stillAboard) return refuse('still_on_vessel');
      if (!facts.inMonth) return refuse('not_on_vessel');
      if (blank(facts.reason)) return refuse('reason_required');
      if (reasonLong) return refuse('reason_too_long');
      if (facts.missingDays > 0) warnings.push('days_not_entered');
      break;
    case 'hod_sign':
      if (facts.hodStep === 'off') return refuse('hod_step_off');
      break;
    case 'approve':
      if (facts.hodStep === 'required' && !facts.hodSigned) return refuse('hod_signature_required');
      if (facts.blockingUnreviewed > 0) return refuse('breaches_unreviewed');
      if (facts.lowUnreviewed > 0) warnings.push('low_breaches_unreviewed');
      if (facts.hodStep === 'nudge' && !facts.hodSigned) warnings.push('hod_not_signed');
      break;
    case 'reopen':
      if (blank(facts.reason)) return refuse('reason_required');
      if (reasonLong) return refuse('reason_too_long');
      break;
    case 'lock':
      break;
  }
  return { ok: true, to: NEXT_STATE[action], warnings };
}

/** The actions the caller may take on the month now (refusal-free), in MONTH_ACTIONS order. */
export function availableMonthActions(status: string | null | undefined, facts: MonthFacts): MonthAction[] {
  return MONTH_ACTIONS.filter((a) => {
    // A reason is asked for when the action is chosen; offer the action without one.
    const withReason = a === 'submit_on_behalf' || a === 'reopen' ? { ...facts, reason: facts.reason ?? 'x' } : facts;
    return decideMonthAction(status, a, withReason).ok;
  });
}

/** Refusal sentences for the UI (the server's DETAIL says the same). */
export const MONTH_REFUSAL_TEXT: Readonly<Record<MonthRefusal, string>> = {
  action_unknown: 'That step is not part of the monthly sign-off.',
  not_own_month: 'Only the crew member submits their own month. Submit on their behalf once they have left the vessel.',
  own_month: 'Someone else signs off your own month.',
  not_permitted: "You don't have permission to do that for this month.",
  out_of_department: 'Heads of department sign months of their own department only.',
  illegal_transition: 'This month is not at that step.',
  not_on_vessel: 'There is no assignment to this vessel in that month.',
  still_on_vessel: 'They are still on the vessel, so they submit the month themselves.',
  reason_required: 'Give a reason.',
  reason_too_long: 'Keep the reason to 2000 characters.',
  hod_step_off: 'The head of department step is off on this vessel.',
  hod_signature_required: 'The head of department signs the month before approval on this vessel.',
  breaches_unreviewed: 'Review every breach before approving the month.',
};

export const MONTH_WARNING_TEXT: Readonly<Record<MonthWarning, string>> = {
  days_not_entered: 'Some days of the month have no entry.',
  low_breaches_unreviewed: 'Minor breaches are not reviewed yet.',
  hod_not_signed: 'The head of department has not signed this month.',
};
