import { describe, expect, it } from 'vitest';
import {
  ACTION_FROM,
  CLOSED_AS,
  ENVELOPE_ACTIONS,
  availableActions,
  closeAsOptions,
  transitionEnvelope,
  vesselCanClose,
  vesselSignaturesLocked,
  type ClosedBy,
  type EnvelopeAction,
  type EnvelopeState,
  type TransitionInput,
} from '@/lib/records/companyStep';
import { ENVELOPE_STATUSES, type DeleteRule, type EnvelopeStatus, type Party } from '@/lib/records/types';

type KindConfig = Omit<EnvelopeState, 'status'> & { closer: ClosedBy };

const KINDS: Record<string, KindConfig> = {
  // e.g. a drill record: the vessel closes it.
  none: { companyStep: 'none', closer: 'vessel' },
  // e.g. a monthly report the company only acknowledges.
  acknowledge: { companyStep: 'acknowledge', closer: 'company_acknowledge' },
  // e.g. a corrective action: company signs off and closes.
  sign_off: { companyStep: 'sign_off', allowReopen: true, closer: 'company_sign_off' },
  // e.g. a risk assessment: company decides.
  decision: { companyStep: 'sign_off', decisionKind: true, allowReopen: true, closer: 'company_decision' },
  // e.g. an incident: initial report first, close-as options.
  report_first: { companyStep: 'sign_off', reportFirst: true, allowCloseAs: true, allowReopen: true, closer: 'company_close_as' },
};

const HAPPY: Omit<TransitionInput, 'action' | 'actor'> = {
  reason: 'reason',
  decision: 'approved',
  closedAs: 'after_review',
  allVesselSlotsSigned: true,
  openRequests: 0,
  staleRequiredSignatures: false,
};

const stateFor = (kind: KindConfig, status: EnvelopeStatus, extra: Partial<EnvelopeState> = {}): EnvelopeState => {
  const { closer, ...rest } = kind;
  return { ...rest, status, closedBy: status === 'closed' ? closer : null, ...extra };
};

/** Apply `input` and feed the outcome into the next state (what the server stores). */
const step = (state: EnvelopeState, input: TransitionInput): EnvelopeState => {
  const r = transitionEnvelope(state, input);
  if (!r.ok) throw new Error(`${input.action}: ${r.error.code}`);
  const { status, closedBy, companyAcknowledged, cycle, acknowledgedCycle, initialReportAcknowledged } = r.value;
  return { ...state, status, closedBy, companyAcknowledged, cycle, acknowledgedCycle, initialReportAcknowledged };
};
const ACK: TransitionInput = { action: 'acknowledge', actor: 'company' };
const RETURN: TransitionInput = { action: 'return_to_vessel', actor: 'company', reason: 'Photos missing' };
const RESIGN: TransitionInput = { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true };

/** Every ok transition except void, as "status --action(actor)--> to". */
function okTransitions(kind: KindConfig): string[] {
  const out: string[] = [];
  for (const status of ENVELOPE_STATUSES) {
    for (const action of ENVELOPE_ACTIONS) {
      if (action === 'void') continue;
      for (const actor of ['vessel', 'company'] as Party[]) {
        const r = transitionEnvelope(stateFor(kind, status), { action, actor, ...HAPPY });
        if (r.ok) out.push(`${status} --${action}(${actor})--> ${r.value.status}`);
      }
    }
  }
  return out.sort();
}

describe('exhaustive transition matrix per company step', () => {
  it('company_step none: the last vessel slot closes the record; no company actions', () => {
    expect(okTransitions(KINDS.none)).toEqual(
      [
        'open --vessel_sign(vessel)--> closed',
        'acknowledged --vessel_sign(vessel)--> closed',
        'in_review --vessel_sign(vessel)--> closed',
        'info_requested --vessel_sign(vessel)--> closed',
      ].sort(),
    );
  });

  it('company_step acknowledge: company acknowledgement closes it', () => {
    expect(okTransitions(KINDS.acknowledge)).toEqual(
      [
        'open --vessel_sign(vessel)--> awaiting_company_close',
        'acknowledged --vessel_sign(vessel)--> awaiting_company_close',
        'in_review --vessel_sign(vessel)--> awaiting_company_close',
        'info_requested --vessel_sign(vessel)--> awaiting_company_close',
        'awaiting_company_close --acknowledge(company)--> closed',
        'submitted --return_to_vessel(company)--> info_requested',
        'acknowledged --return_to_vessel(company)--> info_requested',
        'awaiting_company_close --return_to_vessel(company)--> info_requested',
        'closed --remove_company_signature(company)--> awaiting_company_close',
      ].sort(),
    );
  });

  it('company_step sign_off: only the company closes', () => {
    expect(okTransitions(KINDS.sign_off)).toEqual(
      [
        'open --vessel_sign(vessel)--> awaiting_company_close',
        'acknowledged --vessel_sign(vessel)--> awaiting_company_close',
        'in_review --vessel_sign(vessel)--> awaiting_company_close',
        'info_requested --vessel_sign(vessel)--> awaiting_company_close',
        'awaiting_company_close --acknowledge(company)--> awaiting_company_close',
        'awaiting_company_close --sign_off(company)--> closed',
        'submitted --return_to_vessel(company)--> info_requested',
        'acknowledged --return_to_vessel(company)--> info_requested',
        'awaiting_company_close --return_to_vessel(company)--> info_requested',
        'closed --reopen(company)--> in_review',
        'closed --remove_company_signature(company)--> awaiting_company_close',
      ].sort(),
    );
  });

  it('decision kinds: the company decides instead of signing off', () => {
    expect(okTransitions(KINDS.decision)).toEqual(
      [
        'open --vessel_sign(vessel)--> awaiting_company_close',
        'acknowledged --vessel_sign(vessel)--> awaiting_company_close',
        'in_review --vessel_sign(vessel)--> awaiting_company_close',
        'info_requested --vessel_sign(vessel)--> awaiting_company_close',
        'awaiting_company_close --acknowledge(company)--> awaiting_company_close',
        'awaiting_company_close --decide(company)--> closed',
        'submitted --return_to_vessel(company)--> info_requested',
        'acknowledged --return_to_vessel(company)--> info_requested',
        'awaiting_company_close --return_to_vessel(company)--> info_requested',
        'closed --reopen(company)--> in_review',
        'closed --remove_company_signature(company)--> awaiting_company_close',
      ].sort(),
    );
  });

  it('report-first kinds: submit, acknowledge, close after review, reopen to acknowledged', () => {
    // HAPPY closes "after review", which needs the vessel final review: only from awaiting_company_close.
    expect(okTransitions(KINDS.report_first)).toEqual(
      [
        'open --submit(vessel)--> submitted',
        'open --vessel_sign(vessel)--> awaiting_company_close',
        'acknowledged --vessel_sign(vessel)--> awaiting_company_close',
        'in_review --vessel_sign(vessel)--> awaiting_company_close',
        'info_requested --vessel_sign(vessel)--> awaiting_company_close',
        'submitted --acknowledge(company)--> acknowledged',
        'awaiting_company_close --acknowledge(company)--> awaiting_company_close',
        'awaiting_company_close --sign_off(company)--> closed',
        'awaiting_company_close --close_as(company)--> closed',
        'submitted --return_to_vessel(company)--> info_requested',
        'acknowledged --return_to_vessel(company)--> info_requested',
        'awaiting_company_close --return_to_vessel(company)--> info_requested',
        'closed --reopen(company)--> acknowledged',
      ].sort(),
    );
  });

  it('report-first kinds: raised in error and duplicate close from submitted, acknowledged or awaiting the company', () => {
    for (const closedAs of ['raised_in_error', 'duplicate'] as const) {
      const from = ENVELOPE_STATUSES.filter(
        (status) =>
          transitionEnvelope(stateFor(KINDS.report_first, status), { action: 'close_as', actor: 'company', ...HAPPY, closedAs, duplicateOf: 'INC-DRA-2026-008' }).ok,
      );
      expect(from).toEqual(['submitted', 'acknowledged', 'awaiting_company_close']);
    }
  });

  it('nothing happens to a voided record', () => {
    for (const action of ENVELOPE_ACTIONS) {
      for (const actor of ['vessel', 'company'] as Party[]) {
        const r = transitionEnvelope(stateFor(KINDS.sign_off, 'void'), { action, actor, ...HAPPY });
        expect(r).toMatchObject({ ok: false, error: { code: 'voided' } });
      }
    }
  });
});

describe("void follows the kind's delete rule (gap/08 §F; D-32)", () => {
  const LIVE = ENVELOPE_STATUSES.filter((s) => s !== 'void');
  const RULES: Array<[DeleteRule | undefined, Record<Party, 'ok' | 'wrong_party' | 'not_for_kind'>]> = [
    [undefined, { vessel: 'ok', company: 'ok' }], // absent = draft_only
    ['draft_only', { vessel: 'ok', company: 'ok' }],
    ['until_signed', { vessel: 'ok', company: 'ok' }],
    ['never_after_submit', { vessel: 'wrong_party', company: 'ok' }],
    ['free', { vessel: 'not_for_kind', company: 'not_for_kind' }],
    ['cascade_parent', { vessel: 'not_for_kind', company: 'not_for_kind' }],
  ];

  it.each(RULES)('deleteRule %s', (deleteRule, expected) => {
    for (const kind of Object.values(KINDS)) {
      for (const actor of ['vessel', 'company'] as Party[]) {
        for (const status of LIVE) {
          const r = transitionEnvelope(stateFor(kind, status, { deleteRule }), { action: 'void', actor, reason: 'Raised on the wrong vessel' });
          if (expected[actor] === 'ok') {
            expect(r).toMatchObject({ ok: true, value: { status: 'void', notification: 'record_voided', effects: ['snapshot'] } });
          } else {
            expect(r).toMatchObject({ ok: false, error: { code: expected[actor] } });
          }
        }
        expect(transitionEnvelope(stateFor(kind, 'void', { deleteRule }), { action: 'void', actor, reason: 'r' })).toMatchObject({ ok: false, error: { code: 'voided' } });
      }
    }
  });

  it('a void needs a reason', () => {
    expect(transitionEnvelope(stateFor(KINDS.none, 'open'), { action: 'void', actor: 'vessel' })).toMatchObject({ ok: false, error: { code: 'reason_required' } });
    const incident = stateFor(KINDS.report_first, 'submitted', { deleteRule: 'never_after_submit' });
    expect(transitionEnvelope(incident, { action: 'void', actor: 'company', reason: '  ' })).toMatchObject({ ok: false, error: { code: 'reason_required' } });
  });

  it('the company voids a submitted or closed incident with a reason; the vessel cannot', () => {
    for (const status of ['submitted', 'acknowledged', 'closed'] as EnvelopeStatus[]) {
      const incident = stateFor(KINDS.report_first, status, { deleteRule: 'never_after_submit' });
      expect(transitionEnvelope(incident, { action: 'void', actor: 'vessel', reason: 'oops' })).toMatchObject({
        ok: false,
        error: { code: 'wrong_party', message: 'Only the company can void this record.' },
      });
      expect(transitionEnvelope(incident, { action: 'void', actor: 'company', reason: 'Raised on the wrong vessel' })).toMatchObject({ ok: true, value: { status: 'void' } });
    }
  });

  it('availableActions reflects the rule', () => {
    const incident = stateFor(KINDS.report_first, 'submitted', { deleteRule: 'never_after_submit' });
    expect(availableActions(incident, 'vessel')).not.toContain('void');
    expect(availableActions(incident, 'vessel')).toEqual([]);
    expect(availableActions(incident, 'company')).toContain('void');
    expect(availableActions(stateFor(KINDS.none, 'open', { deleteRule: 'free' }), 'vessel')).toEqual(['vessel_sign']);
  });
});

describe('the company gate (T-78, T-69)', () => {
  it('a sign_off kind never reaches closed from any vessel action, whatever the inputs', () => {
    expect(vesselCanClose('sign_off')).toBe(false);
    expect(vesselCanClose('acknowledge')).toBe(false);
    expect(vesselCanClose('none')).toBe(true);
    const inputs: Array<Partial<TransitionInput>> = [HAPPY, { allVesselSlotsSigned: false }, { ...HAPPY, decision: 'approved_with_conditions', conditions: 'c' }];
    for (const kind of [KINDS.sign_off, KINDS.decision, KINDS.report_first, KINDS.acknowledge]) {
      for (const status of ENVELOPE_STATUSES) {
        for (const action of ENVELOPE_ACTIONS) {
          for (const extra of inputs) {
            const r = transitionEnvelope(stateFor(kind, status), { action, actor: 'vessel', ...extra });
            if (r.ok && action !== 'void') expect(r.value.status).not.toBe('closed');
          }
        }
      }
    }
  });

  it('company actions refuse the vessel and vessel actions refuse the company', () => {
    const companyOnly: EnvelopeAction[] = ['acknowledge', 'decide', 'sign_off', 'close_as', 'return_to_vessel', 'reopen', 'remove_company_signature'];
    for (const action of companyOnly) {
      expect(transitionEnvelope(stateFor(KINDS.report_first, 'awaiting_company_close'), { action, actor: 'vessel', ...HAPPY })).toMatchObject({ ok: false, error: { code: 'wrong_party' } });
    }
    for (const action of ['submit', 'vessel_sign'] as EnvelopeAction[]) {
      expect(transitionEnvelope(stateFor(KINDS.report_first, 'open'), { action, actor: 'company', ...HAPPY })).toMatchObject({ ok: false, error: { code: 'wrong_party' } });
    }
  });
});

describe('vessel signatures', () => {
  it('a partial set of vessel signatures moves to (or stays) in review', () => {
    for (const status of ['open', 'acknowledged', 'in_review', 'info_requested'] as EnvelopeStatus[]) {
      const r = transitionEnvelope(stateFor(KINDS.sign_off, status), { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: false });
      expect(r).toMatchObject({ ok: true, value: { status: 'in_review', effects: [], notification: null } });
    }
  });

  it('the last vessel slot submits to the company with a snapshot and a notification', () => {
    const r = transitionEnvelope(stateFor(KINDS.sign_off, 'in_review'), { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true });
    expect(r).toMatchObject({ ok: true, value: { status: 'awaiting_company_close', effects: ['snapshot'], notification: 'record_submitted_to_company' } });
  });

  it('company_step none closes on the last vessel slot, closed by the vessel', () => {
    const r = transitionEnvelope(stateFor(KINDS.none, 'in_review'), { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true });
    expect(r).toMatchObject({ ok: true, value: { status: 'closed', closedBy: 'vessel', notification: 'record_closed' } });
  });

  it('cannot sign while submitted or awaiting the company', () => {
    for (const status of ['submitted', 'awaiting_company_close', 'closed'] as EnvelopeStatus[]) {
      expect(transitionEnvelope(stateFor(KINDS.report_first, status), { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true })).toMatchObject({
        ok: false,
        error: { code: 'invalid_transition' },
      });
    }
  });
});

describe('guards', () => {
  const closeActions: Array<[keyof typeof KINDS, EnvelopeStatus, Partial<TransitionInput> & { action: EnvelopeAction; actor: Party }]> = [
    ['none', 'in_review', { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true }],
    ['acknowledge', 'awaiting_company_close', { action: 'acknowledge', actor: 'company' }],
    ['sign_off', 'awaiting_company_close', { action: 'sign_off', actor: 'company' }],
    ['decision', 'awaiting_company_close', { action: 'decide', actor: 'company', decision: 'approved' }],
    ['decision', 'awaiting_company_close', { action: 'decide', actor: 'company', decision: 'approved_with_conditions', conditions: 'Hot work only by day' }],
    ['report_first', 'awaiting_company_close', { action: 'close_as', actor: 'company', closedAs: 'after_review' }],
    ['report_first', 'acknowledged', { action: 'close_as', actor: 'company', closedAs: 'raised_in_error' }],
  ];

  it.each(closeActions)('%s: closing from %s is blocked by open requests', (kind, status, input) => {
    const r = transitionEnvelope(stateFor(KINDS[kind], status), { ...input, openRequests: 1 });
    expect(r).toMatchObject({ ok: false, error: { code: 'open_requests', message: '1 open request — mark it done or cancel it first' } });
    const many = transitionEnvelope(stateFor(KINDS[kind], status), { ...input, openRequests: 3 });
    expect(many).toMatchObject({ ok: false, error: { message: '3 open requests — mark them done or cancel them first' } });
  });

  it.each(closeActions)('%s: closing from %s is blocked by stale required signatures', (kind, status, input) => {
    const r = transitionEnvelope(stateFor(KINDS[kind], status), { ...input, staleRequiredSignatures: true });
    expect(r).toMatchObject({ ok: false, error: { code: 'stale_signatures' } });
  });

  it('submitting is blocked by stale signatures, but not by open requests', () => {
    expect(transitionEnvelope(stateFor(KINDS.report_first, 'open'), { action: 'submit', actor: 'vessel', staleRequiredSignatures: true })).toMatchObject({ ok: false, error: { code: 'stale_signatures' } });
    expect(transitionEnvelope(stateFor(KINDS.sign_off, 'in_review'), { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true, staleRequiredSignatures: true })).toMatchObject({ ok: false, error: { code: 'stale_signatures' } });
    expect(transitionEnvelope(stateFor(KINDS.sign_off, 'in_review'), { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true, openRequests: 2 }).ok).toBe(true);
  });

  it('open requests do not block returning, reopening or acknowledging', () => {
    expect(transitionEnvelope(stateFor(KINDS.sign_off, 'awaiting_company_close'), { action: 'return_to_vessel', actor: 'company', reason: 'r', openRequests: 2 }).ok).toBe(true);
    expect(transitionEnvelope(stateFor(KINDS.sign_off, 'closed'), { action: 'reopen', actor: 'company', reason: 'r', openRequests: 2 }).ok).toBe(true);
    expect(transitionEnvelope(stateFor(KINDS.sign_off, 'awaiting_company_close'), { action: 'acknowledge', actor: 'company', openRequests: 2 }).ok).toBe(true);
  });

  it.each<[keyof typeof KINDS, EnvelopeStatus, EnvelopeAction]>([
    ['sign_off', 'awaiting_company_close', 'return_to_vessel'],
    ['sign_off', 'closed', 'reopen'],
    ['sign_off', 'closed', 'remove_company_signature'],
    ['sign_off', 'open', 'void'],
  ])('%s: %s → %s needs a reason', (kind, status, action) => {
    for (const reason of [undefined, null, '', '   ']) {
      expect(transitionEnvelope(stateFor(KINDS[kind], status), { action, actor: 'company', reason })).toMatchObject({ ok: false, error: { code: 'reason_required' } });
    }
  });

  it('a decision needs a choice; conditions or a reason where the choice requires one', () => {
    const s = stateFor(KINDS.decision, 'awaiting_company_close');
    expect(transitionEnvelope(s, { action: 'decide', actor: 'company' })).toMatchObject({ ok: false, error: { code: 'decision_required' } });
    expect(transitionEnvelope(s, { action: 'decide', actor: 'company', decision: 'approved_with_conditions' })).toMatchObject({ ok: false, error: { code: 'conditions_required' } });
    expect(transitionEnvelope(s, { action: 'decide', actor: 'company', decision: 'not_approved' })).toMatchObject({ ok: false, error: { code: 'reason_required' } });
  });

  it('not approved goes back to the vessel with a new cycle (one step, no draft round trip)', () => {
    const r = transitionEnvelope(stateFor(KINDS.decision, 'awaiting_company_close'), { action: 'decide', actor: 'company', decision: 'not_approved', reason: 'Controls missing for line 4' });
    expect(r).toMatchObject({ ok: true, value: { status: 'info_requested', notification: 'record_decision' } });
    expect(r.ok && r.value.effects).toEqual(['snapshot', 'supersede_vessel_signatures', 'new_cycle']);
  });

  it('close as duplicate needs the duplicated record; close as needs a choice', () => {
    const s = stateFor(KINDS.report_first, 'submitted');
    expect(transitionEnvelope(s, { action: 'close_as', actor: 'company' })).toMatchObject({ ok: false, error: { code: 'closed_as_required' } });
    expect(transitionEnvelope(s, { action: 'close_as', actor: 'company', closedAs: 'duplicate' })).toMatchObject({ ok: false, error: { code: 'duplicate_required' } });
    expect(transitionEnvelope(s, { action: 'close_as', actor: 'company', closedAs: 'duplicate', duplicateOf: 'INC-DRA-2026-008' })).toMatchObject({ ok: true, value: { status: 'closed', closedBy: 'company_close_as' } });
    expect(transitionEnvelope(s, { action: 'close_as', actor: 'company', closedAs: 'raised_in_error' }).ok).toBe(true);
  });

  it.each<EnvelopeStatus>(['submitted', 'acknowledged'])('close as after review is refused from %s (vessel final review not signed)', (status) => {
    const r = transitionEnvelope(stateFor(KINDS.report_first, status), { action: 'close_as', actor: 'company', closedAs: 'after_review' });
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_transition', message: 'Closed after review needs the vessel final review signed first.' } });
  });

  it('closeAsOptions: after review only once the vessel final review is signed', () => {
    const options = (status: EnvelopeStatus) => closeAsOptions(stateFor(KINDS.report_first, status));
    expect(options('submitted')).toEqual(['raised_in_error', 'duplicate']);
    expect(options('acknowledged')).toEqual(['raised_in_error', 'duplicate']);
    expect(options('awaiting_company_close')).toEqual([...CLOSED_AS]);
    for (const status of ['open', 'in_review', 'info_requested', 'closed', 'void'] as EnvelopeStatus[]) expect(options(status)).toEqual([]);
    for (const kind of [KINDS.none, KINDS.acknowledge, KINDS.sign_off, KINDS.decision]) {
      for (const status of ENVELOPE_STATUSES) expect(closeAsOptions(stateFor(kind, status))).toEqual([]);
    }
  });

  it('return to vessel: from submitted, acknowledged and awaiting the company (D-30)', () => {
    expect([...ACTION_FROM.return_to_vessel].sort()).toEqual(['acknowledged', 'awaiting_company_close', 'submitted']);
    for (const kind of [KINDS.acknowledge, KINDS.sign_off, KINDS.decision, KINDS.report_first]) {
      for (const status of ENVELOPE_STATUSES) {
        const r = transitionEnvelope(stateFor(kind, status, { companyAcknowledged: status === 'acknowledged' }), {
          action: 'return_to_vessel',
          actor: 'company',
          reason: 'Photos missing',
        });
        if (['submitted', 'acknowledged', 'awaiting_company_close'].includes(status)) {
          expect(r).toMatchObject({ ok: true, value: { status: 'info_requested', notification: 'record_returned' } });
        } else {
          expect(r).toMatchObject({ ok: false });
        }
      }
    }
    expect(transitionEnvelope(stateFor(KINDS.none, 'submitted'), { action: 'return_to_vessel', actor: 'company', reason: 'r' })).toMatchObject({ ok: false, error: { code: 'not_for_kind' } });
  });

  it.each<[string, EnvelopeState]>([
    ['report-first (initial report acknowledged)', stateFor(KINDS.report_first, 'submitted')],
    ['sign_off (acknowledged while awaiting the company)', stateFor(KINDS.sign_off, 'awaiting_company_close')],
  ])('%s: a returned record comes back to the company through the vessel signatures, unacknowledged (D-30, D-51)', (_, start) => {
    const acked = step(start, ACK);
    expect(acked).toMatchObject({ companyAcknowledged: true, cycle: 1 });
    const returned = step(acked, RETURN);
    expect(returned).toMatchObject({ status: 'info_requested', companyAcknowledged: false, acknowledgedCycle: null, cycle: 2 });
    const resigned = step(returned, RESIGN);
    expect(resigned).toMatchObject({ status: 'awaiting_company_close', companyAcknowledged: false, acknowledgedCycle: null, cycle: 2 });
    expect(resigned.initialReportAcknowledged).toBe(Boolean(start.reportFirst));
  });

  it('the company acknowledges a resubmitted cycle; twice in that cycle is refused (D-51)', () => {
    const resubmitted = step(step(step(stateFor(KINDS.sign_off, 'awaiting_company_close'), ACK), RETURN), RESIGN);
    expect(transitionEnvelope(resubmitted, ACK)).toMatchObject({
      ok: true,
      value: { status: 'awaiting_company_close', companyAcknowledged: true, acknowledgedCycle: 2, cycle: 2, effects: ['company_acknowledgement'] },
    });
    expect(transitionEnvelope(step(resubmitted, ACK), ACK)).toMatchObject({ ok: false, error: { code: 'already_acknowledged' } });
    expect(availableActions(resubmitted, 'company')).toContain('acknowledge');
  });

  it('reopen resets the acknowledgement and starts the next cycle (D-51)', () => {
    const closed = step(step(stateFor(KINDS.sign_off, 'awaiting_company_close'), ACK), { action: 'sign_off', actor: 'company' });
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'company_sign_off', companyAcknowledged: true, acknowledgedCycle: 1, cycle: 1 });
    const reopened = step(closed, { action: 'reopen', actor: 'company', reason: 'New evidence' });
    expect(reopened).toMatchObject({ status: 'in_review', closedBy: null, companyAcknowledged: false, acknowledgedCycle: null, cycle: 2 });
    const resubmitted = step(reopened, RESIGN);
    expect(transitionEnvelope(resubmitted, ACK)).toMatchObject({ ok: true, value: { acknowledgedCycle: 2, cycle: 2 } });
  });

  it('report-first reopen keeps the initial-report history but not the acknowledgement', () => {
    const closed = stateFor(KINDS.report_first, 'closed', { companyAcknowledged: true, acknowledgedCycle: 1, initialReportAcknowledged: true });
    expect(step(closed, { action: 'reopen', actor: 'company', reason: 'New evidence' })).toMatchObject({
      status: 'acknowledged',
      companyAcknowledged: false,
      acknowledgedCycle: null,
      initialReportAcknowledged: true,
      cycle: 2,
    });
  });

  it('report-first: the initial-report acknowledgement does not count as acknowledging the final review (D-51)', () => {
    const submitted = step(stateFor(KINDS.report_first, 'open'), { action: 'submit', actor: 'vessel' });
    const initial = transitionEnvelope(submitted, ACK);
    expect(initial).toMatchObject({
      ok: true,
      value: { status: 'acknowledged', companyAcknowledged: true, initialReportAcknowledged: true, acknowledgedCycle: null, cycle: 1 },
    });
    const finalReview = step(step(submitted, ACK), RESIGN);
    expect(finalReview).toMatchObject({ status: 'awaiting_company_close', acknowledgedCycle: null });
    expect(availableActions(finalReview, 'company')).toContain('acknowledge');
    const acked = transitionEnvelope(finalReview, ACK);
    expect(acked).toMatchObject({ ok: true, value: { status: 'awaiting_company_close', acknowledgedCycle: 1, initialReportAcknowledged: true } });
    expect(transitionEnvelope(step(finalReview, ACK), ACK)).toMatchObject({ ok: false, error: { code: 'already_acknowledged' } });
  });

  it('not approved resets the acknowledgement and starts the next cycle (D-51)', () => {
    const acked = step(stateFor(KINDS.decision, 'awaiting_company_close', { cycle: 3 }), ACK);
    expect(acked).toMatchObject({ acknowledgedCycle: 3, cycle: 3 });
    const notApproved = step(acked, { action: 'decide', actor: 'company', decision: 'not_approved', reason: 'Controls missing for line 4' });
    expect(notApproved).toMatchObject({ status: 'info_requested', companyAcknowledged: false, acknowledgedCycle: null, cycle: 4 });
  });

  it('acknowledge kinds: after Remove company signature the company closes again by acknowledging', () => {
    const closed = step(stateFor(KINDS.acknowledge, 'awaiting_company_close'), ACK);
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'company_acknowledge', acknowledgedCycle: 1 });
    const removed = step(closed, { action: 'remove_company_signature', actor: 'company', reason: 'Signed too early' });
    expect(removed).toMatchObject({ status: 'awaiting_company_close', closedBy: null, acknowledgedCycle: 1, cycle: 1 });
    expect(transitionEnvelope(removed, ACK)).toMatchObject({ ok: true, value: { status: 'closed', closedBy: 'company_acknowledge' } });
  });

  it('transitions without a new cycle keep the cycle and the acknowledgement', () => {
    const s = stateFor(KINDS.sign_off, 'awaiting_company_close', { cycle: 2, companyAcknowledged: true, acknowledgedCycle: 2 });
    expect(transitionEnvelope(s, { action: 'sign_off', actor: 'company' })).toMatchObject({
      ok: true,
      value: { status: 'closed', cycle: 2, acknowledgedCycle: 2, companyAcknowledged: true },
    });
  });

  it('kind checks', () => {
    expect(transitionEnvelope(stateFor(KINDS.sign_off, 'open'), { action: 'submit', actor: 'vessel' })).toMatchObject({ ok: false, error: { code: 'not_for_kind' } });
    expect(transitionEnvelope(stateFor(KINDS.decision, 'awaiting_company_close'), { action: 'sign_off', actor: 'company' })).toMatchObject({ ok: false, error: { code: 'not_for_kind' } });
    expect(transitionEnvelope(stateFor(KINDS.sign_off, 'awaiting_company_close'), { action: 'decide', actor: 'company', decision: 'approved' })).toMatchObject({ ok: false, error: { code: 'not_for_kind' } });
    expect(transitionEnvelope(stateFor(KINDS.acknowledge, 'closed'), { action: 'reopen', actor: 'company', reason: 'r' })).toMatchObject({ ok: false, error: { code: 'not_for_kind' } });
    expect(transitionEnvelope(stateFor(KINDS.report_first, 'closed'), { action: 'remove_company_signature', actor: 'company', reason: 'r' })).toMatchObject({ ok: false, error: { code: 'not_for_kind' } });
    expect(transitionEnvelope(stateFor(KINDS.none, 'closed'), { action: 'remove_company_signature', actor: 'company', reason: 'r' })).toMatchObject({ ok: false, error: { code: 'not_for_kind' } });
  });

  it('acknowledging twice in one cycle is refused; the flag carries forward to the close', () => {
    const first = transitionEnvelope(stateFor(KINDS.sign_off, 'awaiting_company_close'), { action: 'acknowledge', actor: 'company' });
    expect(first).toMatchObject({
      ok: true,
      value: { companyAcknowledged: true, acknowledgedCycle: 1, cycle: 1, effects: ['company_acknowledgement'], notification: 'record_acknowledged' },
    });
    const again = transitionEnvelope(stateFor(KINDS.sign_off, 'awaiting_company_close', { companyAcknowledged: true, acknowledgedCycle: 1 }), { action: 'acknowledge', actor: 'company' });
    expect(again).toMatchObject({ ok: false, error: { code: 'already_acknowledged' } });
    const signOff = transitionEnvelope(stateFor(KINDS.sign_off, 'awaiting_company_close', { companyAcknowledged: true, acknowledgedCycle: 1 }), { action: 'sign_off', actor: 'company' });
    expect(signOff).toMatchObject({ ok: true, value: { companyAcknowledged: true, acknowledgedCycle: 1, closedBy: 'company_sign_off', effects: ['company_signature', 'snapshot'] } });
  });

  it('optimistic concurrency: a stale expected version is refused before anything else', () => {
    const s = stateFor(KINDS.sign_off, 'awaiting_company_close', { version: 7 });
    expect(transitionEnvelope(s, { action: 'sign_off', actor: 'company', expectedVersion: 6 })).toMatchObject({ ok: false, error: { code: 'version_conflict' } });
    expect(transitionEnvelope(s, { action: 'sign_off', actor: 'company', expectedVersion: 7 }).ok).toBe(true);
    expect(transitionEnvelope(s, { action: 'sign_off', actor: 'company' }).ok).toBe(true);
  });
});

describe('effects and notifications', () => {
  it('return to vessel supersedes vessel signatures and starts a new cycle', () => {
    const r = transitionEnvelope(stateFor(KINDS.sign_off, 'awaiting_company_close'), { action: 'return_to_vessel', actor: 'company', reason: 'Photos missing' });
    expect(r).toMatchObject({ ok: true, value: { status: 'info_requested', notification: 'record_returned' } });
    expect(r.ok && r.value.effects).toEqual(['snapshot', 'supersede_vessel_signatures', 'new_cycle']);
  });

  it('reopen starts a new cycle and clears the closer', () => {
    const r = transitionEnvelope(stateFor(KINDS.report_first, 'closed'), { action: 'reopen', actor: 'company', reason: 'New evidence' });
    expect(r).toMatchObject({ ok: true, value: { status: 'acknowledged', closedBy: null, effects: ['snapshot', 'new_cycle'], notification: 'record_reopened' } });
  });

  it('remove company signature returns to awaiting the company', () => {
    const r = transitionEnvelope(stateFor(KINDS.sign_off, 'closed'), { action: 'remove_company_signature', actor: 'company', reason: 'Signed too early' });
    expect(r).toMatchObject({ ok: true, value: { status: 'awaiting_company_close', closedBy: null, effects: ['remove_company_signature'] } });
  });

  it('acknowledge-only kinds record the acknowledgement as the closing signature', () => {
    const r = transitionEnvelope(stateFor(KINDS.acknowledge, 'awaiting_company_close'), { action: 'acknowledge', actor: 'company' });
    expect(r).toMatchObject({ ok: true, value: { status: 'closed', closedBy: 'company_acknowledge', companyAcknowledged: true } });
    expect(r.ok && r.value.effects).toEqual(['company_acknowledgement', 'company_signature', 'snapshot']);
  });

  it('error messages name the status in words', () => {
    const r = transitionEnvelope(stateFor(KINDS.sign_off, 'awaiting_company_close'), { action: 'submit', actor: 'vessel' });
    expect(r.ok ? '' : r.error.message).toContain('awaiting company close');
  });
});

describe('availableActions (action bar)', () => {
  it('lists what each side can do now', () => {
    expect(availableActions(stateFor(KINDS.sign_off, 'awaiting_company_close'), 'company')).toEqual(['acknowledge', 'sign_off', 'return_to_vessel', 'void']);
    expect(availableActions(stateFor(KINDS.sign_off, 'awaiting_company_close'), 'vessel')).toEqual(['void']);
    expect(availableActions(stateFor(KINDS.report_first, 'open'), 'vessel')).toEqual(['submit', 'vessel_sign', 'void']);
    expect(availableActions(stateFor(KINDS.decision, 'closed'), 'company')).toEqual(['reopen', 'remove_company_signature', 'void']);
    expect(availableActions(stateFor(KINDS.none, 'void'), 'company')).toEqual([]);
  });

  it('thread and signature guards do not hide an action', () => {
    expect(availableActions(stateFor(KINDS.sign_off, 'awaiting_company_close', { companyAcknowledged: true, acknowledgedCycle: 1 }), 'company')).toEqual(['sign_off', 'return_to_vessel', 'void']);
  });

  it('acknowledge comes back on the bar for a cycle the company has not acknowledged (D-51)', () => {
    // Acknowledged an earlier cycle only.
    expect(availableActions(stateFor(KINDS.sign_off, 'awaiting_company_close', { cycle: 2, acknowledgedCycle: 1 }), 'company')).toContain('acknowledge');
    // Report-first: only the initial report was acknowledged.
    const finalReview = stateFor(KINDS.report_first, 'awaiting_company_close', { companyAcknowledged: true, initialReportAcknowledged: true });
    expect(availableActions(finalReview, 'company')).toEqual(['acknowledge', 'sign_off', 'close_as', 'return_to_vessel', 'void']);
  });

  it('close as stays on the bar in submitted and acknowledged (raised in error / duplicate)', () => {
    expect(availableActions(stateFor(KINDS.report_first, 'submitted'), 'company')).toEqual(['acknowledge', 'close_as', 'return_to_vessel', 'void']);
    expect(availableActions(stateFor(KINDS.report_first, 'acknowledged', { companyAcknowledged: true }), 'company')).toEqual(['close_as', 'return_to_vessel', 'void']);
    expect(availableActions(stateFor(KINDS.report_first, 'awaiting_company_close'), 'company')).toEqual(['acknowledge', 'sign_off', 'close_as', 'return_to_vessel', 'void']);
    expect(availableActions(stateFor(KINDS.report_first, 'submitted'), 'vessel')).not.toContain('close_as');
  });
});

describe('vesselSignaturesLocked (gap/05 "Signature slots"; SIG10; D-51)', () => {
  const locked = (extra: Partial<EnvelopeState> & Pick<EnvelopeState, 'status'>, sheetCycle = 1) =>
    vesselSignaturesLocked({ closedBy: null, ...extra }, sheetCycle);

  it('locks the cycle the company acknowledged, while awaiting the company or closed', () => {
    expect(locked({ status: 'awaiting_company_close', acknowledgedCycle: 1 })).toBe(true);
    expect(locked({ status: 'awaiting_company_close', cycle: 2, acknowledgedCycle: 2 }, 2)).toBe(true);
    expect(locked({ status: 'closed', closedBy: 'company_sign_off', acknowledgedCycle: 1 })).toBe(true);
    expect(locked({ status: 'awaiting_company_close', acknowledgedCycle: null })).toBe(false);
    expect(locked({ status: 'awaiting_company_close' })).toBe(false);
  });

  it('an acknowledgement of an earlier cycle does not lock the current one', () => {
    expect(locked({ status: 'awaiting_company_close', cycle: 2, acknowledgedCycle: 1 }, 2)).toBe(false);
  });

  it('only the envelope\'s current cycle is ever locked', () => {
    expect(locked({ status: 'awaiting_company_close', cycle: 2, acknowledgedCycle: 2 }, 1)).toBe(false);
    expect(locked({ status: 'closed', closedBy: 'company_close_as', cycle: 2 }, 1)).toBe(false);
  });

  it('a company close locks; a vessel close does not', () => {
    for (const closedBy of ['company_acknowledge', 'company_sign_off', 'company_decision', 'company_close_as'] as ClosedBy[]) {
      expect(locked({ status: 'closed', closedBy })).toBe(true);
    }
    expect(locked({ status: 'closed', closedBy: 'vessel' })).toBe(false);
    expect(locked({ status: 'closed', closedBy: null })).toBe(false);
  });

  it('report-first: the initial-report acknowledgement does not lock the final-review slots', () => {
    expect(locked({ status: 'acknowledged', acknowledgedCycle: null })).toBe(false);
    expect(locked({ status: 'awaiting_company_close', acknowledgedCycle: null })).toBe(false);
  });

  it('other statuses are never locked', () => {
    for (const status of ['open', 'in_review', 'submitted', 'acknowledged', 'info_requested', 'void'] as EnvelopeStatus[]) {
      expect(locked({ status, acknowledgedCycle: 1 })).toBe(false);
    }
  });
});
