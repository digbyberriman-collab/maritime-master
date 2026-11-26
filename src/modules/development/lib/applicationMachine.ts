/**
 * The training application lifecycle (gap/02 W3, TR4–TR6, TR9; X5 spec §2
 * X5-07A, D-X5-06, D-X5-20, D-X5-25): the states × actions table and the
 * actor table the server's `development_transition()` enforces
 * (`20261124040600_fleet_training_core.sql`), the final-approval rule
 * (both | either), who acts next, the "awaiting approval > 7 days" rule,
 * what each action needs from the person acting, and the sentence for
 * every refusal the definer raises.
 *
 * Pure: no React, no Supabase. The UI uses it to offer only the actions an
 * application's status and the viewer's part allow, and to word a refusal;
 * the server stays the authority (it re-checks every rule and the
 * viewer's offices). The SQL test
 * (supabase/tests/sql/fleet/training_transitions.test.sql) copies
 * `machineRows()` between its machine-table markers and `actorRows()`
 * between its actor-table markers; src/test/development/applicationMachine.test.ts
 * pins both copies and the SQL lists.
 */

/** Exactly the statuses of `development_applications_status_check` (D-X5-25). */
export const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'hod_review',
  'captain_purser_review',
  'purser_review',
  'captain_review',
  'approved',
  'discretionary_approved',
  'enrolled',
  'completed',
  'reimbursed',
  'closed',
  'returned',
  'rejected',
  'cancelled',
  'voided',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** The actions of `development_transition(p_action)`. */
export const APPLICATION_ACTIONS = [
  'submit',
  'hod_approve',
  'hod_return',
  'final_approve',
  'final_approve_discretionary',
  'return',
  'reject',
  'cancel',
  'enrol',
  'complete',
  'reimburse',
  'close',
  'void',
  'edit_fields',
] as const;
export type ApplicationAction = (typeof APPLICATION_ACTIONS)[number];

/** The parts a person can play on an application (the server's `development_actor_roles_for`). */
export const APPLICATION_ACTORS = ['applicant', 'hod', 'captain', 'purser', 'training_editor', 'training_admin'] as const;
export type ApplicationActor = (typeof APPLICATION_ACTORS)[number];

export type FinalApprovalMode = 'both' | 'either';
export type FinalApproverRole = 'captain' | 'purser';

/** Waiting for the head of department (submitted is a legacy name of this stage). */
export const HOD_REVIEW_STATUSES = ['submitted', 'hod_review'] as const satisfies readonly ApplicationStatus[];
/** Waiting for the final approval (purser_review and captain_review stay for existing rows). */
export const FINAL_REVIEW_STATUSES = ['captain_purser_review', 'purser_review', 'captain_review'] as const satisfies readonly ApplicationStatus[];
/** Waiting for someone's approval: the stale rule and "awaiting approval" counts read these. */
export const AWAITING_APPROVAL_STATUSES = [...HOD_REVIEW_STATUSES, ...FINAL_REVIEW_STATUSES] as const;
export const APPROVED_STATUSES = ['approved', 'discretionary_approved'] as const satisfies readonly ApplicationStatus[];
/** Approved and still running: approved, discretionary, enrolled. */
export const APPROVED_OPEN_STATUSES = [...APPROVED_STATUSES, 'enrolled'] as const;
/** Where approvers may still correct the details (edit_fields). */
export const OPEN_STATUSES = [...AWAITING_APPROVAL_STATUSES, ...APPROVED_OPEN_STATUSES] as const;
/** Nothing further happens (void excepted for rejected, cancelled and closed). */
export const TERMINAL_STATUSES = ['rejected', 'cancelled', 'closed', 'voided'] as const satisfies readonly ApplicationStatus[];
/** The applicant's own edit window (the UPDATE policy). */
export const APPLICANT_EDITABLE_STATUSES = ['draft', 'returned'] as const satisfies readonly ApplicationStatus[];
/** In progress for the applicant's "Active applications": submitted through enrolled. */
export const ACTIVE_STATUSES = [...AWAITING_APPROVAL_STATUSES, ...APPROVED_OPEN_STATUSES] as const;
/** Counts as an approved course for eligibility, totals and expense claims. */
export const APPROVED_OR_LATER_STATUSES = [...APPROVED_OPEN_STATUSES, 'completed', 'reimbursed', 'closed'] as const;

const has = <T extends string>(list: readonly T[], value: string | null | undefined): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

export const isApplicationStatus = (value: unknown): value is ApplicationStatus => typeof value === 'string' && has(APPLICATION_STATUSES, value);
export const isAwaitingApproval = (status: string | null | undefined): boolean => has(AWAITING_APPROVAL_STATUSES, status);
export const isHodStage = (status: string | null | undefined): boolean => has(HOD_REVIEW_STATUSES, status);
export const isFinalStage = (status: string | null | undefined): boolean => has(FINAL_REVIEW_STATUSES, status);

/** Refusals that depend only on the status (22023 messages of development_transition). */
export type MachineRefusal = 'invalid_transition' | 'application_final' | 'application_voided';

/** Where an action leaves an application, or why it is refused. */
export type MachineOutcome = { ok: true; to: ApplicationStatus } | { ok: false; refusal: MachineRefusal };

/**
 * The states × actions table (W3), the mirror of the server's
 * `development_transition_target()`. final_approve is shown completing the
 * final review; until the final-approval rule is met (finalApprovalCompletes)
 * the status stays. edit_fields keeps the status.
 */
export function transitionTarget(status: ApplicationStatus, action: ApplicationAction): MachineOutcome {
  if (status === 'voided') return { ok: false, refusal: 'application_voided' };
  if (status === 'rejected' || status === 'cancelled' || status === 'closed') {
    return action === 'void' ? { ok: true, to: 'voided' } : { ok: false, refusal: 'application_final' };
  }
  const to = (s: ApplicationStatus): MachineOutcome => ({ ok: true, to: s });
  const hod = has(HOD_REVIEW_STATUSES, status);
  const final = has(FINAL_REVIEW_STATUSES, status);
  switch (action) {
    case 'void':
      return to('voided');
    case 'submit':
      if (status === 'draft' || status === 'returned') return to('hod_review');
      break;
    case 'hod_approve':
      if (hod) return to('captain_purser_review');
      break;
    case 'hod_return':
      if (hod) return to('returned');
      break;
    case 'final_approve':
      if (final) return to('approved');
      break;
    case 'final_approve_discretionary':
      if (final) return to('discretionary_approved');
      break;
    case 'return':
      if (final) return to('returned');
      break;
    case 'reject':
      if (hod || final) return to('rejected');
      break;
    case 'cancel':
      if (status === 'draft' || status === 'returned' || hod || final || has(APPROVED_OPEN_STATUSES, status)) return to('cancelled');
      break;
    case 'enrol':
      if (has(APPROVED_STATUSES, status)) return to('enrolled');
      break;
    case 'complete':
      if (has(APPROVED_OPEN_STATUSES, status)) return to('completed');
      break;
    case 'reimburse':
      if (status === 'completed') return to('reimbursed');
      break;
    case 'close':
      if (status === 'completed' || status === 'reimbursed') return to('closed');
      break;
    case 'edit_fields':
      if (has(OPEN_STATUSES, status)) return to(status);
      break;
  }
  return { ok: false, refusal: 'invalid_transition' };
}

/**
 * Who may take the action in that status (the server's
 * `development_action_actors()`), in the order the server picks the part
 * the person acts in. Empty when the pair is refused. Nobody reviews their
 * own application: the applicant only ever acts as the applicant.
 */
export function actionActors(action: ApplicationAction, status: ApplicationStatus): readonly ApplicationActor[] {
  if (!transitionTarget(status, action).ok) return [];
  switch (action) {
    case 'submit':
      return ['applicant'];
    case 'hod_approve':
    case 'hod_return':
      return ['hod'];
    case 'final_approve':
    case 'return':
      return ['captain', 'purser'];
    case 'final_approve_discretionary':
      return ['captain'];
    case 'reject':
      return isHodStage(status) ? ['hod'] : isFinalStage(status) ? ['captain', 'purser'] : [];
    case 'cancel':
      return has(APPROVED_OPEN_STATUSES, status) ? ['captain', 'purser', 'training_admin'] : ['applicant'];
    case 'enrol':
    case 'complete':
      return ['applicant', 'captain', 'purser', 'training_editor', 'training_admin'];
    case 'reimburse':
    case 'close':
    case 'void':
      return ['captain', 'purser', 'training_admin'];
    case 'edit_fields':
      return ['hod', 'captain', 'purser', 'training_editor', 'training_admin'];
  }
}

/** The outcome as the SQL tables write it: the status, or `!` and the refusal. */
export function outcomeText(outcome: MachineOutcome): string {
  return 'refusal' in outcome ? `!${outcome.refusal}` : outcome.to;
}

/** One row per (status, action): the outcome as the SQL test writes it (`!refusal` or the status). */
export function machineRows(): Array<[ApplicationStatus, ApplicationAction, string]> {
  return APPLICATION_STATUSES.flatMap((status) =>
    APPLICATION_ACTIONS.map((action): [ApplicationStatus, ApplicationAction, string] => {
      const outcome = transitionTarget(status, action);
      return [status, action, outcomeText(outcome)];
    }),
  );
}

/** One row per legal (action, status): the actors joined with `|`, as the SQL test writes them. */
export function actorRows(): Array<[ApplicationAction, ApplicationStatus, string]> {
  return APPLICATION_ACTIONS.flatMap((action) =>
    APPLICATION_STATUSES.flatMap((status): Array<[ApplicationAction, ApplicationStatus, string]> => {
      const actors = actionActors(action, status);
      return actors.length ? [[action, status, actors.join('|')]] : [];
    }),
  );
}

// ─── the final review (D-X5-06) ───────────────────────────────────────────

/** The decision columns the final-approval rule reads. */
export interface FinalDecisions {
  captain_decision?: string | null;
  captain_reviewer_id?: string | null;
  purser_decision?: string | null;
  purser_reviewer_id?: string | null;
  is_discretionary?: boolean | null;
}

const captainApproved = (d: FinalDecisions) => d.captain_decision === 'approved' || d.captain_decision === 'discretionary_approved';
const purserApproved = (d: FinalDecisions) => d.purser_decision === 'approved';

/** Whether the role has already approved (a second approval by the same office is refused: already_decided). */
export function hasApproved(role: FinalApproverRole, decisions: FinalDecisions): boolean {
  return role === 'captain' ? captainApproved(decisions) : purserApproved(decisions);
}

/**
 * Whether an approval by `role` now completes the final review: 'either'
 * always; 'both' once the other office has approved too.
 */
export function finalApprovalCompletes(mode: FinalApprovalMode, role: FinalApproverRole, decisions: FinalDecisions): boolean {
  if (mode === 'either') return true;
  return role === 'captain' ? purserApproved(decisions) : captainApproved(decisions);
}

/**
 * The status after a final approval by `role` (discretionary when the
 * Captain approves as such, or did before): approved / discretionary_approved
 * when it completes the review, else the review status unchanged.
 */
export function statusAfterFinalApproval(
  status: ApplicationStatus,
  mode: FinalApprovalMode,
  role: FinalApproverRole,
  decisions: FinalDecisions,
  discretionary: boolean,
): ApplicationStatus {
  if (!finalApprovalCompletes(mode, role, decisions)) return status;
  return discretionary || decisions.is_discretionary ? 'discretionary_approved' : 'approved';
}

/** The final approvers still to decide ('both': each office not yet approved; 'either': both offices). */
export function pendingFinalApprovers(mode: FinalApprovalMode, decisions: FinalDecisions): FinalApproverRole[] {
  if (mode === 'either') return captainApproved(decisions) || purserApproved(decisions) ? [] : ['captain', 'purser'];
  const out: FinalApproverRole[] = [];
  if (!captainApproved(decisions)) out.push('captain');
  if (!purserApproved(decisions)) out.push('purser');
  return out;
}

// ─── who acts next, and the stale rule ────────────────────────────────────

export type NextActor =
  | { kind: 'applicant'; label: string }
  | { kind: 'hod'; label: string }
  | { kind: 'final'; roles: FinalApproverRole[]; label: string }
  | { kind: 'training_admin'; label: string }
  | { kind: 'none'; label: string };

/** The part of the application row the next-actor and stale rules read. */
export interface ApplicationProgress extends FinalDecisions {
  status: string;
  stage_entered_at?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

const ROLE_WORD: Record<FinalApproverRole, string> = { captain: 'Captain', purser: 'Purser' };

/** Who the application is waiting for (the server notifies the same people). */
export function nextActor(app: ApplicationProgress, mode: FinalApprovalMode): NextActor {
  const status = app.status;
  if (status === 'draft') return { kind: 'applicant', label: 'Waiting for you to submit it' };
  if (status === 'returned') return { kind: 'applicant', label: 'Returned for changes' };
  if (isHodStage(status)) return { kind: 'hod', label: 'Waiting for the head of department' };
  if (isFinalStage(status)) {
    const roles = pendingFinalApprovers(mode, app);
    const who = mode === 'either' ? 'the Captain or the Purser' : roles.map((r) => `the ${ROLE_WORD[r]}`).join(' and ');
    return { kind: 'final', roles, label: `Waiting for ${who || 'the final approval'}` };
  }
  if (has(APPROVED_STATUSES, status)) return { kind: 'applicant', label: 'Approved: book the course' };
  if (status === 'enrolled') return { kind: 'applicant', label: 'Enrolled: record the completion' };
  if (status === 'completed') return { kind: 'training_admin', label: 'Waiting for reimbursement' };
  if (status === 'reimbursed') return { kind: 'training_admin', label: 'Waiting to be closed' };
  return { kind: 'none', label: 'Nothing further' };
}

/** Days an application may wait at one approval stage before it is stale (TR1). */
export const STALE_AFTER_DAYS = 7;

/** When the application entered its current stage (stage_entered_at; older rows: submitted, then updated, then created). */
export function stageEnteredAt(app: ApplicationProgress): Date | null {
  const raw = app.stage_entered_at ?? (isAwaitingApproval(app.status) ? app.submitted_at : null) ?? app.updated_at ?? app.created_at ?? null;
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Waiting for approval for more than STALE_AFTER_DAYS days at one stage. */
export function isStale(app: ApplicationProgress, now: Date = new Date(), days: number = STALE_AFTER_DAYS): boolean {
  if (!isAwaitingApproval(app.status)) return false;
  const at = stageEnteredAt(app);
  return at !== null && now.getTime() - at.getTime() > days * 86_400_000;
}

// ─── what an action needs, and what a viewer may do ───────────────────────

/** The text an action requires from the person acting (the server refuses without it). */
export type ActionRequirement = 'comment' | 'reason' | 'justification' | 'completion' | 'fields' | null;

export function actionRequirement(action: ApplicationAction, actor: ApplicationActor | null): ActionRequirement {
  switch (action) {
    case 'hod_return':
    case 'return':
      return 'comment';
    case 'reject':
    case 'void':
      return 'reason';
    case 'cancel':
      return actor === 'applicant' ? null : 'reason';
    case 'final_approve_discretionary':
      return 'justification';
    case 'complete':
      return 'completion';
    case 'edit_fields':
      return 'fields';
    default:
      return null;
  }
}

/** The actions a viewer holding `roles` may take now (the server re-checks; final approvals already given are left out). */
export function availableActions(
  app: ApplicationProgress,
  roles: readonly ApplicationActor[],
  mode: FinalApprovalMode,
): ApplicationAction[] {
  if (!isApplicationStatus(app.status)) return [];
  const status = app.status;
  const pending = pendingFinalApprovers(mode, app);
  return APPLICATION_ACTIONS.filter((action) => {
    const actors = actionActors(action, status);
    if (!actors.some((a) => roles.includes(a))) return false;
    if (action === 'final_approve') return pending.some((r) => roles.includes(r));
    if (action === 'final_approve_discretionary') return pending.includes('captain') && roles.includes('captain');
    return true;
  });
}

// ─── words ────────────────────────────────────────────────────────────────

export const ACTION_LABELS: Readonly<Record<ApplicationAction, string>> = {
  submit: 'Submit for approval',
  hod_approve: 'Approve',
  hod_return: 'Return for changes',
  final_approve: 'Approve',
  final_approve_discretionary: 'Approve as discretionary',
  return: 'Return for changes',
  reject: 'Reject',
  cancel: 'Cancel application',
  enrol: 'Mark as enrolled',
  complete: 'Record completion',
  reimburse: 'Mark as reimbursed',
  close: 'Close',
  void: 'Void',
  edit_fields: 'Correct details',
};

/** What the person reads after a successful action. */
export const ACTION_DONE: Readonly<Record<ApplicationAction, string>> = {
  submit: 'Application submitted for approval',
  hod_approve: 'Approved and passed to the final approvers',
  hod_return: 'Returned to the applicant for changes',
  final_approve: 'Approval recorded',
  final_approve_discretionary: 'Discretionary approval recorded',
  return: 'Returned to the applicant for changes',
  reject: 'Application rejected',
  cancel: 'Application cancelled',
  enrol: 'Marked as enrolled',
  complete: 'Completion recorded',
  reimburse: 'Marked as reimbursed',
  close: 'Application closed',
  void: 'Application voided',
  edit_fields: 'Details corrected; the applicant has been told',
};

/** A sentence for each refusal `development_transition()` raises (22023 / 42501 / P0002 messages). */
export const TRANSITION_REFUSALS: Readonly<Record<string, string>> = {
  invalid_transition: 'That step is not open for this application now. Reload it to see where it stands.',
  application_final: 'This application is finished; it can only be voided.',
  application_voided: 'This application was voided; nothing more can change.',
  application_not_found: 'This application could not be found, or you cannot see it.',
  not_permitted: 'You cannot take this step on this application.',
  unknown_action: 'That step is not known.',
  payload_invalid: 'The details sent were not understood.',
  stale_application: 'Someone changed this application since you opened it. Reload it and try again.',
  role_required: 'You hold both final approver offices here: choose whether you act as the Captain or the Purser.',
  already_decided: 'Your office has already approved this application.',
  same_approver: 'The second approval has to come from someone else.',
  comment_required: 'Say what needs to change before returning it.',
  reason_required: 'Give a reason.',
  justification_required: 'Explain why this is approved outside the standard policy.',
  completed_on_required: 'Enter the day the course was completed.',
  completed_on_invalid: 'Enter the completion day as a date.',
  completed_on_in_future: 'The completion day cannot be in the future.',
  text_too_long: 'Keep the text shorter.',
  evidence_path_invalid: 'The evidence file could not be linked.',
  fields_required: 'Change at least one detail.',
  field_not_editable: 'That detail cannot be corrected here.',
  field_invalid: 'One of the corrected details is not valid.',
  nothing_changed: 'Nothing was changed.',
  application_not_updated: 'The application did not change. Reload it and try again.',
};

/** The sentence for a refusal message, or null when the message is not one of the definer's codes. */
export function transitionRefusalMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return TRANSITION_REFUSALS[message.trim()] ?? null;
}

/** What the UI says when development_transition is not in the database yet (D-01, D-X5-20). */
export const TRANSITION_NOT_SET_UP = 'Training approvals are not set up yet, so nothing was changed.';

/**
 * The actions that keep today's direct write while development_transition
 * is missing (D-X5-20): the applicant's submit of a draft or returned
 * application, and the applicant's cancel of a draft. Every other action
 * says "not set up yet".
 */
export function hasLegacyFallback(action: ApplicationAction, status: string, actor: ApplicationActor | null): boolean {
  if (actor !== 'applicant') return false;
  if (action === 'submit') return status === 'draft' || status === 'returned';
  if (action === 'cancel') return status === 'draft';
  return false;
}
