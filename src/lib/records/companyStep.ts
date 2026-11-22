/**
 * Record envelope transitions with the company-step gate (gap/08 §A, §C;
 * CO1–CO10; DECISIONS C6).
 *
 *   open ──first vessel signature──▶ in_review ──last vessel slot──▶ awaiting_company_close
 *     │                                                                   ├─ company: Sign off & close ─▶ closed
 *     │                                                                   ├─ company: Close as (any option) ─▶ closed
 *     │                                                                   ├─ company: Return to vessel (reason) ─▶ info_requested
 *     │                                                                   └─ company: Not approved (reason) ─▶ info_requested
 *     ├─ report-first kinds: Submit ─▶ submitted ─Acknowledge─▶ acknowledged
 *     │     submitted | acknowledged ── company: Close as raised in error / duplicate ─▶ closed
 *     │     submitted | acknowledged ── company: Return to vessel (reason) ─▶ info_requested   (D-30)
 *     ├─ company_step = none: last vessel slot ─▶ closed
 *     └─ Void (reason; who may void depends on the kind's delete rule, D-32) ─▶ void
 *   info_requested ──vessel edits, re-signs──▶ awaiting_company_close   (D-30: not "the previous state")
 *   closed ──Reopen (company, reason)──▶ acknowledged (report-first) | in_review
 *   closed ──Remove company signature (company, reason)──▶ awaiting_company_close
 *
 * "Close as after review" needs the vessel final review signed first, so it
 * is only possible from awaiting_company_close (gap/05 W1); `closeAsOptions`
 * says which options a status allows.
 *
 * Company step per kind (`none` / `acknowledge` / `sign_off`):
 * - `none`: the last vessel slot closes the record.
 * - `acknowledge`: the last vessel slot hands it to the company; the
 *   company's acknowledgement closes it.
 * - `sign_off`: only a company action (sign off, decide, close as) can close
 *   it. A vessel action never reaches `closed` (T-78, T-69).
 *
 * Guards: company actor for company actions; no open thread requests to
 * close; no stale required signatures to submit or close; not voided; the
 * expected version matches. Pure: `record_transition()` / `company_action()`
 * are the authority.
 *
 * The company acknowledgement belongs to a review cycle, not to the record
 * (gap/05 "Signature slots"; gap/08 SIG10; DECISIONS D-51). `acknowledge`
 * from `awaiting_company_close` records `acknowledgedCycle = cycle`, and the
 * `already_acknowledged` guard is per cycle. Every outcome with the
 * `new_cycle` effect (Return to vessel, Not approved, Reopen) moves to
 * `cycle + 1` and clears `companyAcknowledged` and `acknowledgedCycle`, so
 * the company can acknowledge the resubmitted cycle. A report-first kind's
 * initial-report acknowledgement sets `initialReportAcknowledged` (record
 * history, kept across cycles) but no `acknowledgedCycle`: the final-review
 * vessel slots are signed after it, so it does not lock them.
 *
 * The signature sheet's `vesselLocked` (no removing vessel signatures) is
 * `vesselSignaturesLocked(envelope, sheet.cycle)`: the company acknowledged
 * the sheet's cycle (status `awaiting_company_close` or `closed`), or the
 * company closed the record.
 */
import type { CompanyStep, DeleteRule, EnvelopeStatus, Party } from './types';
import { fail, ok, type EngineResult } from './types';

export const ENVELOPE_ACTIONS = [
  'submit',
  'vessel_sign',
  'acknowledge',
  'decide',
  'sign_off',
  'close_as',
  'return_to_vessel',
  'reopen',
  'remove_company_signature',
  'void',
] as const;
export type EnvelopeAction = (typeof ENVELOPE_ACTIONS)[number];

export type CompanyDecision = 'approved' | 'approved_with_conditions' | 'not_approved';
export const CLOSED_AS = ['after_review', 'raised_in_error', 'duplicate'] as const;
export type ClosedAs = (typeof CLOSED_AS)[number];
export type ClosedBy = 'vessel' | 'company_acknowledge' | 'company_sign_off' | 'company_decision' | 'company_close_as';

/** Side effects the server performs in the same transaction. */
export type TransitionEffect =
  | 'snapshot'
  | 'company_acknowledgement'
  | 'company_signature'
  | 'remove_company_signature'
  | 'supersede_vessel_signatures'
  | 'new_cycle';

/** Engine notification types (gap/08 §N). */
export type EnvelopeNotification =
  | 'record_submitted_to_company'
  | 'record_acknowledged'
  | 'record_decision'
  | 'record_returned'
  | 'record_closed'
  | 'record_reopened'
  | 'record_voided';

export interface EnvelopeState {
  status: EnvelopeStatus;
  companyStep: CompanyStep;
  /** Kinds with an initial report (incident): Submit → submitted → Acknowledge → acknowledged. */
  reportFirst?: boolean;
  /** The company closes with a decision (approved / with conditions / not approved), e.g. risk assessments. */
  decisionKind?: boolean;
  allowReopen?: boolean;
  /** The company may "Close as" (after review / raised in error / duplicate), e.g. incidents. */
  allowCloseAs?: boolean;
  closedBy?: ClosedBy | null;
  /** The company acknowledged in the current cycle (cleared by every `new_cycle` outcome). */
  companyAcknowledged?: boolean;
  /** The current review cycle, 1 first; mirrors the signature sheet's `cycle`. Absent means 1. */
  cycle?: number;
  /** The cycle whose vessel signatures the company acknowledged; null or absent when none. */
  acknowledgedCycle?: number | null;
  /** Report-first kinds only: the company acknowledged the initial report (record-level history). */
  initialReportAcknowledged?: boolean;
  version?: number;
  /**
   * The kind's delete rule (gap/08 §F; DECISIONS D-32), which decides who may
   * void. Absent means `draft_only`.
   */
  deleteRule?: DeleteRule;
}

export interface TransitionInput {
  action: EnvelopeAction;
  actor: Party;
  /** Open thread requests (close and sign-off are blocked while any is open). */
  openRequests?: number;
  /** A required signature is stale (submit and close are blocked). */
  staleRequiredSignatures?: boolean;
  /** `vessel_sign`: every required vessel slot is now signed. */
  allVesselSlotsSigned?: boolean;
  reason?: string | null;
  decision?: CompanyDecision;
  conditions?: string | null;
  closedAs?: ClosedAs;
  /** `close_as duplicate`: the record it duplicates. */
  duplicateOf?: string | null;
  expectedVersion?: number;
}

export interface TransitionOutcome {
  status: EnvelopeStatus;
  closedBy: ClosedBy | null;
  companyAcknowledged: boolean;
  /** The cycle after the transition: one more when `effects` include `new_cycle`. */
  cycle: number;
  /** The cycle the company acknowledged, or null (always null after `new_cycle`). */
  acknowledgedCycle: number | null;
  initialReportAcknowledged: boolean;
  effects: TransitionEffect[];
  notification: EnvelopeNotification | null;
}

export type TransitionErrorCode =
  | 'version_conflict'
  | 'voided'
  | 'wrong_party'
  | 'invalid_transition'
  | 'not_for_kind'
  | 'reason_required'
  | 'decision_required'
  | 'conditions_required'
  | 'closed_as_required'
  | 'duplicate_required'
  | 'open_requests'
  | 'stale_signatures'
  | 'already_acknowledged';

export type TransitionResult = EngineResult<TransitionOutcome, TransitionErrorCode>;

const COMPANY_ACTIONS: ReadonlySet<EnvelopeAction> = new Set([
  'acknowledge',
  'decide',
  'sign_off',
  'close_as',
  'return_to_vessel',
  'reopen',
  'remove_company_signature',
]);
const VESSEL_ACTIONS: ReadonlySet<EnvelopeAction> = new Set(['submit', 'vessel_sign']);

/** Statuses each action may start from (before kind-specific checks). */
export const ACTION_FROM: Readonly<Record<EnvelopeAction, readonly EnvelopeStatus[]>> = {
  submit: ['open'],
  vessel_sign: ['open', 'acknowledged', 'in_review', 'info_requested'],
  acknowledge: ['submitted', 'awaiting_company_close'],
  decide: ['awaiting_company_close'],
  sign_off: ['awaiting_company_close'],
  close_as: ['submitted', 'acknowledged', 'awaiting_company_close'],
  // D-30: the union of gap/05 W1 and gap/08 §C.
  return_to_vessel: ['submitted', 'acknowledged', 'awaiting_company_close'],
  reopen: ['closed'],
  remove_company_signature: ['closed'],
  void: ['open', 'in_review', 'submitted', 'acknowledged', 'awaiting_company_close', 'info_requested', 'closed'],
};

const COMPANY_CLOSED: ReadonlySet<ClosedBy> = new Set(['company_acknowledge', 'company_sign_off', 'company_decision']);
/** Every company close, with or without a company signature (`close_as` has none). */
const COMPANY_CLOSERS: ReadonlySet<ClosedBy> = new Set([...COMPANY_CLOSED, 'company_close_as']);

const blank = (s: string | null | undefined) => !s || !s.trim();

/** The next state for `input.action`, or why it is refused. */
export function transitionEnvelope(state: EnvelopeState, input: TransitionInput): TransitionResult {
  const { action, actor } = input;
  if (input.expectedVersion !== undefined && state.version !== undefined && input.expectedVersion !== state.version) {
    return fail('version_conflict', 'This record changed since you opened it. Reload to see the latest version.');
  }
  if (state.status === 'void') return fail('voided', 'This record has been voided.');
  if (COMPANY_ACTIONS.has(action) && actor !== 'company') return fail('wrong_party', 'Only the company can do that.');
  if (VESSEL_ACTIONS.has(action) && actor !== 'vessel') return fail('wrong_party', 'Only the vessel can do that.');
  if (!ACTION_FROM[action].includes(state.status)) {
    return fail('invalid_transition', `"${action}" is not possible while the record is ${state.status.replace(/_/g, ' ')}.`);
  }

  const cycle = state.cycle ?? 1;
  const ackedCycle = state.acknowledgedCycle ?? null;
  // A new cycle starts unacknowledged (D-51); the initial-report history is kept.
  const outcome = (
    status: EnvelopeStatus,
    effects: TransitionEffect[],
    notification: EnvelopeNotification | null,
    extra: Partial<
      Pick<TransitionOutcome, 'closedBy' | 'companyAcknowledged' | 'cycle' | 'acknowledgedCycle' | 'initialReportAcknowledged'>
    > = {},
  ): TransitionResult => {
    const newCycle = effects.includes('new_cycle');
    return ok({
      status,
      closedBy: extra.closedBy !== undefined ? extra.closedBy : status === 'closed' ? state.closedBy ?? null : null,
      companyAcknowledged: extra.companyAcknowledged ?? (newCycle ? false : Boolean(state.companyAcknowledged)),
      cycle: extra.cycle ?? (newCycle ? cycle + 1 : cycle),
      acknowledgedCycle: extra.acknowledgedCycle !== undefined ? extra.acknowledgedCycle : newCycle ? null : ackedCycle,
      initialReportAcknowledged: extra.initialReportAcknowledged ?? Boolean(state.initialReportAcknowledged),
      effects,
      notification,
    });
  };
  const openRequestsBlock = (input.openRequests ?? 0) > 0;
  const requestsMessage = () => {
    const n = input.openRequests ?? 0;
    return n === 1 ? '1 open request — mark it done or cancel it first' : `${n} open requests — mark them done or cancel them first`;
  };
  const staleMessage = 'Signed before later edits — re-sign to confirm the current content';

  switch (action) {
    case 'submit': {
      if (!state.reportFirst || state.companyStep === 'none') return fail('not_for_kind', 'This kind of record is not submitted to the company on its own.');
      if (input.staleRequiredSignatures) return fail('stale_signatures', staleMessage);
      return outcome('submitted', ['snapshot'], 'record_submitted_to_company');
    }

    case 'vessel_sign': {
      if (!input.allVesselSlotsSigned) return outcome('in_review', [], null);
      if (input.staleRequiredSignatures) return fail('stale_signatures', staleMessage);
      if (state.companyStep === 'none') {
        if (openRequestsBlock) return fail('open_requests', requestsMessage());
        return outcome('closed', ['snapshot'], 'record_closed', { closedBy: 'vessel' });
      }
      return outcome('awaiting_company_close', ['snapshot'], 'record_submitted_to_company');
    }

    case 'acknowledge': {
      if (state.companyStep === 'none') return fail('not_for_kind', 'This kind of record has no company step.');
      if (state.status === 'submitted') {
        if (!state.reportFirst) return fail('not_for_kind', 'Only report-first records are acknowledged on submission.');
        // The initial report only: the final-review vessel slots are signed later, so no acknowledgedCycle (D-51).
        return outcome('acknowledged', ['company_acknowledgement'], 'record_acknowledged', {
          companyAcknowledged: true,
          initialReportAcknowledged: true,
        });
      }
      // awaiting_company_close: the company acknowledges this cycle's vessel signatures.
      if (state.companyStep === 'acknowledge') {
        // The acknowledgement is the closing signature, so it is not guarded per cycle: after
        // Remove company signature the company closes again the same way.
        if (openRequestsBlock) return fail('open_requests', requestsMessage());
        if (input.staleRequiredSignatures) return fail('stale_signatures', staleMessage);
        return outcome('closed', ['company_acknowledgement', 'company_signature', 'snapshot'], 'record_acknowledged', {
          closedBy: 'company_acknowledge',
          companyAcknowledged: true,
          acknowledgedCycle: cycle,
        });
      }
      if (ackedCycle === cycle) return fail('already_acknowledged', 'The company has already acknowledged this review cycle.');
      return outcome('awaiting_company_close', ['company_acknowledgement'], 'record_acknowledged', {
        companyAcknowledged: true,
        acknowledgedCycle: cycle,
      });
    }

    case 'decide': {
      if (state.companyStep !== 'sign_off' || !state.decisionKind) return fail('not_for_kind', 'This kind of record is not closed by a company decision.');
      if (!input.decision) return fail('decision_required', 'Choose approved, approved with conditions or not approved.');
      if (input.decision === 'not_approved') {
        if (blank(input.reason)) return fail('reason_required', 'Say why it is not approved.');
        return outcome('info_requested', ['snapshot', 'supersede_vessel_signatures', 'new_cycle'], 'record_decision');
      }
      if (input.decision === 'approved_with_conditions' && blank(input.conditions)) {
        return fail('conditions_required', 'List the conditions of the approval.');
      }
      if (openRequestsBlock) return fail('open_requests', requestsMessage());
      if (input.staleRequiredSignatures) return fail('stale_signatures', staleMessage);
      return outcome('closed', ['company_signature', 'snapshot'], 'record_decision', { closedBy: 'company_decision' });
    }

    case 'sign_off': {
      if (state.companyStep !== 'sign_off') return fail('not_for_kind', 'This kind of record does not need company sign-off.');
      if (state.decisionKind) return fail('not_for_kind', 'Record the company decision instead of signing off.');
      if (openRequestsBlock) return fail('open_requests', requestsMessage());
      if (input.staleRequiredSignatures) return fail('stale_signatures', staleMessage);
      return outcome('closed', ['company_signature', 'snapshot'], 'record_closed', { closedBy: 'company_sign_off' });
    }

    case 'close_as': {
      if (!state.allowCloseAs) return fail('not_for_kind', 'This kind of record cannot be closed that way.');
      if (!input.closedAs) return fail('closed_as_required', 'Choose how the record is closed.');
      if (input.closedAs === 'after_review' && state.status !== 'awaiting_company_close') {
        return fail('invalid_transition', 'Closed after review needs the vessel final review signed first.');
      }
      if (input.closedAs === 'duplicate' && blank(input.duplicateOf)) return fail('duplicate_required', 'Link the record this one duplicates.');
      if (openRequestsBlock) return fail('open_requests', requestsMessage());
      if (input.staleRequiredSignatures) return fail('stale_signatures', staleMessage);
      return outcome('closed', ['snapshot'], 'record_closed', { closedBy: 'company_close_as' });
    }

    case 'return_to_vessel': {
      if (state.companyStep === 'none') return fail('not_for_kind', 'This kind of record has no company step.');
      if (blank(input.reason)) return fail('reason_required', 'Say what the vessel needs to change.');
      return outcome('info_requested', ['snapshot', 'supersede_vessel_signatures', 'new_cycle'], 'record_returned');
    }

    case 'reopen': {
      if (!state.allowReopen) return fail('not_for_kind', 'This kind of record cannot be reopened.');
      if (blank(input.reason)) return fail('reason_required', 'Say why the record is being reopened.');
      return outcome(state.reportFirst ? 'acknowledged' : 'in_review', ['snapshot', 'new_cycle'], 'record_reopened', { closedBy: null });
    }

    case 'remove_company_signature': {
      if (!state.closedBy || !COMPANY_CLOSED.has(state.closedBy)) {
        return fail('not_for_kind', 'There is no company signature or decision to remove.');
      }
      if (blank(input.reason)) return fail('reason_required', 'Say why the company signature is being removed.');
      return outcome('awaiting_company_close', ['remove_company_signature'], null, { closedBy: null });
    }

    case 'void': {
      // D-32: the kind's delete rule decides who may void. Role limits (owner,
      // admins, the Master) belong to the capability layer, not this engine.
      const rule = state.deleteRule ?? 'draft_only';
      if (rule === 'free' || rule === 'cascade_parent') return fail('not_for_kind', 'This kind of record is deleted, not voided.');
      if (rule === 'never_after_submit' && actor !== 'company') return fail('wrong_party', 'Only the company can void this record.');
      if (blank(input.reason)) return fail('reason_required', 'Say why the record is being voided.');
      return outcome('void', ['snapshot'], 'record_voided', { closedBy: state.closedBy ?? null });
    }
  }
}

/**
 * The actions `actor` could take from `state` (ignoring inputs such as a
 * reason, and the thread / signature guards). Use it to decide which buttons
 * the action bar shows; the transition itself still checks everything.
 */
export function availableActions(state: EnvelopeState, actor: Party): EnvelopeAction[] {
  return ENVELOPE_ACTIONS.filter((action) => {
    if (action === 'close_as') return actor === 'company' && closeAsOptions(state).length > 0;
    return probe(state, { action, actor });
  });
}

/**
 * The "Close as" options the company may pick from `state`, in display
 * order (empty when the kind has no close-as or the status allows none).
 * "After review" appears only once the vessel final review is signed
 * (awaiting_company_close); "raised in error" and "duplicate" also close
 * straight from submitted or acknowledged (gap/05 W1).
 */
export function closeAsOptions(state: EnvelopeState): ClosedAs[] {
  return CLOSED_AS.filter((closedAs) => probe(state, { action: 'close_as', actor: 'company', closedAs }));
}

/** Would the action pass, ignoring free-text inputs and the thread / signature guards? */
function probe(state: EnvelopeState, input: Pick<TransitionInput, 'action' | 'actor' | 'closedAs'>): boolean {
  const result = transitionEnvelope(state, {
    reason: 'x',
    decision: 'approved',
    duplicateOf: 'x',
    allVesselSlotsSigned: true,
    ...input,
  });
  if (result.ok) return true;
  // Guards that depend on the thread or the signatures are not "unavailable".
  return result.error.code === 'open_requests' || result.error.code === 'stale_signatures';
}

/** True when a vessel-side action could ever close a record of this company step (false for sign_off). */
export function vesselCanClose(companyStep: CompanyStep): boolean {
  return companyStep === 'none';
}

/**
 * Are the vessel signatures of the sheet's cycle locked (no removing them)?
 * Callers set `sheet.vesselLocked = vesselSignaturesLocked(envelope, sheet.cycle)`
 * (gap/05 "Signature slots"; gap/08 SIG10; DECISIONS D-51). True only for the
 * envelope's current cycle, and only when the company acknowledged that cycle
 * (status `awaiting_company_close` or `closed`) or closed the record. A
 * report-first initial-report acknowledgement does not lock the final-review
 * slots. After Return to vessel, Not approved or Reopen the new cycle is
 * unlocked until the company acknowledges it (or closes the record).
 */
export function vesselSignaturesLocked(
  state: Pick<EnvelopeState, 'status' | 'acknowledgedCycle' | 'closedBy' | 'cycle'>,
  sheetCycle: number,
): boolean {
  if (sheetCycle !== (state.cycle ?? 1)) return false;
  const acknowledgedThisCycle =
    state.acknowledgedCycle === sheetCycle && (state.status === 'awaiting_company_close' || state.status === 'closed');
  const companyClosed = state.status === 'closed' && state.closedBy != null && COMPANY_CLOSERS.has(state.closedBy);
  return acknowledgedThisCycle || companyClosed;
}
