/**
 * Record envelope transitions with the company-step gate (gap/08 §A, §C;
 * CO1–CO10; DECISIONS C6).
 *
 *   open ──first vessel signature──▶ in_review ──last vessel slot──▶ awaiting_company_close
 *     │                                                                   ├─ company: Sign off & close ─▶ closed
 *     │                                                                   ├─ company: Return to vessel (reason) ─▶ info_requested
 *     │                                                                   └─ company: Not approved (reason) ─▶ info_requested
 *     ├─ report-first kinds: Submit ─▶ submitted ─Acknowledge─▶ acknowledged
 *     ├─ company_step = none: last vessel slot ─▶ closed
 *     └─ Void (reason) ─▶ void
 *   info_requested ──vessel edits, re-signs──▶ awaiting_company_close
 *   closed ──Reopen (company, reason)──▶ acknowledged (report-first) | in_review
 *   closed ──Remove company signature (company, reason)──▶ awaiting_company_close
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
 */
import type { CompanyStep, EnvelopeStatus, Party } from './types';
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
export type ClosedAs = 'after_review' | 'raised_in_error' | 'duplicate';
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
  companyAcknowledged?: boolean;
  version?: number;
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
  return_to_vessel: ['submitted', 'awaiting_company_close'],
  reopen: ['closed'],
  remove_company_signature: ['closed'],
  void: ['open', 'in_review', 'submitted', 'acknowledged', 'awaiting_company_close', 'info_requested', 'closed'],
};

const COMPANY_CLOSED: ReadonlySet<ClosedBy> = new Set(['company_acknowledge', 'company_sign_off', 'company_decision']);

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

  const acked = Boolean(state.companyAcknowledged);
  const outcome = (
    status: EnvelopeStatus,
    effects: TransitionEffect[],
    notification: EnvelopeNotification | null,
    extra: Partial<Pick<TransitionOutcome, 'closedBy' | 'companyAcknowledged'>> = {},
  ): TransitionResult =>
    ok({
      status,
      closedBy: extra.closedBy !== undefined ? extra.closedBy : status === 'closed' ? state.closedBy ?? null : null,
      companyAcknowledged: extra.companyAcknowledged ?? acked,
      effects,
      notification,
    });
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
        return outcome('acknowledged', ['company_acknowledgement'], 'record_acknowledged', { companyAcknowledged: true });
      }
      // awaiting_company_close
      if (state.companyStep === 'acknowledge') {
        if (openRequestsBlock) return fail('open_requests', requestsMessage());
        if (input.staleRequiredSignatures) return fail('stale_signatures', staleMessage);
        return outcome('closed', ['company_acknowledgement', 'company_signature', 'snapshot'], 'record_acknowledged', {
          closedBy: 'company_acknowledge',
          companyAcknowledged: true,
        });
      }
      if (acked) return fail('already_acknowledged', 'The company has already acknowledged this record.');
      return outcome('awaiting_company_close', ['company_acknowledgement'], 'record_acknowledged', { companyAcknowledged: true });
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
    const result = transitionEnvelope(state, {
      action,
      actor,
      reason: 'x',
      decision: 'approved',
      closedAs: 'after_review',
      allVesselSlotsSigned: true,
    });
    if (result.ok) return true;
    // Guards that depend on the thread or the signatures are not "unavailable".
    return result.error.code === 'open_requests' || result.error.code === 'stale_signatures';
  });
}

/** True when a vessel-side action could ever close a record of this company step (false for sign_off). */
export function vesselCanClose(companyStep: CompanyStep): boolean {
  return companyStep === 'none';
}
