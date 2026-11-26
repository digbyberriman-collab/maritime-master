/**
 * Cross-engine: the vessel-signature lock is per cycle (gap/05 "Signature
 * slots"; gap/08 SIG10; DECISIONS D-51). The caller derives
 * `sheet.vesselLocked = vesselSignaturesLocked(envelope, sheet.cycle)`; these
 * tests drive both engines the way a record page would.
 */
import { describe, expect, it } from 'vitest';
import {
  transitionEnvelope,
  vesselSignaturesLocked,
  type EnvelopeState,
  type TransitionInput,
} from '@/lib/records/companyStep';
import {
  createSignatureSheet,
  removeBlocker,
  removeSignature,
  signSlot,
  startNextCycle,
  type SignatureActor,
  type SignatureSheet,
  type SlotDefinition,
} from '@/lib/records/signatures';

// Corrective-action style chain: HoD → Master → company sign-off.
const CA_SLOTS: SlotDefinition[] = [
  { key: 'hod', label: 'Head of Department', order: 1, party: 'vessel', officeKey: 'hod' },
  { key: 'master', label: 'Master', order: 2, party: 'vessel', officeKey: 'master' },
  { key: 'company', label: 'Company', order: 3, party: 'company' },
];
// Incident vessel final review: Safety Officer → Master; the company closes with "Close as".
const INCIDENT_SLOTS: SlotDefinition[] = [
  { key: 'safety_officer', label: 'Safety Officer', order: 1, party: 'vessel', officeKey: 'safety_officer' },
  { key: 'master', label: 'Master', order: 2, party: 'vessel', officeKey: 'master' },
];

const OFFICES: Record<string, string[]> = {
  hod: ['p-hod'],
  safety_officer: ['p-so'],
  master: ['p-master'],
  company: ['p-shore'],
};
const actor = (profileId: string, extra: Partial<SignatureActor> = {}): SignatureActor => ({
  profileId,
  name: profileId,
  canWrite: true,
  isEligible: (slot, id) => (OFFICES[slot.key] ?? []).includes(id),
  ...extra,
});
const HOD = actor('p-hod');
const SO = actor('p-so');
const MASTER = actor('p-master', { isMaster: true });
const SHORE = actor('p-shore', { isCompanyActor: true });

let n = 0;
const sign = (sheet: SignatureSheet, slotKey: string, who: SignatureActor): SignatureSheet => {
  n += 1;
  const r = signSlot(sheet, { slotKey, id: `sig-${n}`, method: 'verified', recordDigest: 'd1', at: `2026-11-22T10:${String(n % 60).padStart(2, '0')}:00Z` }, who);
  if (!r.ok) throw new Error(`sign ${slotKey}: ${r.error.code}`);
  return r.value;
};

const step = (env: EnvelopeState, input: TransitionInput): EnvelopeState => {
  const r = transitionEnvelope(env, input);
  if (!r.ok) throw new Error(`${input.action}: ${r.error.code}`);
  const { status, closedBy, companyAcknowledged, cycle, acknowledgedCycle, initialReportAcknowledged } = r.value;
  return { ...env, status, closedBy, companyAcknowledged, cycle, acknowledgedCycle, initialReportAcknowledged };
};

/** What the record page does after every change: re-derive the lock from the envelope. */
const derive = (sheet: SignatureSheet, env: EnvelopeState): SignatureSheet => ({
  ...sheet,
  vesselLocked: vesselSignaturesLocked(env, sheet.cycle),
});

const ACK: TransitionInput = { action: 'acknowledge', actor: 'company' };
const PARTIAL: TransitionInput = { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: false };
const ALL: TransitionInput = { action: 'vessel_sign', actor: 'vessel', allVesselSlotsSigned: true };
const REASON = 'Signed before the photos were added';
const removeMaster = (sheet: SignatureSheet, reason: string | null = REASON) => removeBlocker(sheet, { slotKey: 'master', reason }, MASTER);

/** Both vessel slots signed, the envelope awaiting the company, the sheet submitted. */
function signVesselChain(sheet: SignatureSheet, env: EnvelopeState): { sheet: SignatureSheet; env: EnvelopeState } {
  let s = sign(sheet, 'hod', HOD);
  let e = step(env, PARTIAL);
  s = sign(s, 'master', MASTER);
  e = step(e, ALL);
  expect(e.status).toBe('awaiting_company_close');
  return { sheet: derive({ ...s, submitted: true }, e), env: e };
}

describe('sign_off kind: the lock belongs to the acknowledged cycle', () => {
  const KIND: EnvelopeState = { companyStep: 'sign_off', allowReopen: true, status: 'open' };

  /** Cycle 1 signed and acknowledged: the vessel slots are locked. */
  function acknowledgedCycle1() {
    const chain = signVesselChain(createSignatureSheet(CA_SLOTS), KIND);
    // Not acknowledged yet: the Master may still remove.
    expect(chain.sheet.vesselLocked).toBe(false);
    expect(removeMaster(chain.sheet)).toBeNull();

    const env = step(chain.env, ACK);
    const sheet = derive(chain.sheet, env);
    expect(sheet.vesselLocked).toBe(true);
    expect(removeMaster(sheet)).toMatchObject({ code: 'company_acknowledged' });
    expect(removeBlocker(sheet, { slotKey: 'hod', reason: REASON }, HOD)).toMatchObject({ code: 'company_acknowledged' });
    // A reader (no write access, D-214) is refused before the lock, as
    // record_remove_signature checks write access first.
    expect(removeBlocker(sheet, { slotKey: 'master', reason: REASON }, actor('p-master', { isMaster: true, canWrite: false }))).toMatchObject({ code: 'no_write_access' });
    return { sheet, env };
  }

  /** The resubmitted next cycle: unlocked until the company acknowledges it, then locked again. */
  function expectNextCycleUnlockedUntilAcknowledged(sheet: SignatureSheet, env: EnvelopeState) {
    expect(env).toMatchObject({ cycle: 2, companyAcknowledged: false, acknowledgedCycle: null });
    let s = derive(startNextCycle(sheet, '2026-11-22T12:00:00Z'), env);
    expect(s.cycle).toBe(2);
    expect(s.vesselLocked).toBe(false);

    const resigned = signVesselChain(s, env);
    s = resigned.sheet;
    expect(resigned.env).toMatchObject({ status: 'awaiting_company_close', companyAcknowledged: false, acknowledgedCycle: null });
    expect(s.vesselLocked).toBe(false);
    // Submitted, so the removal needs a reason.
    expect(removeMaster(s)).toBeNull();
    expect(removeMaster(s, null)).toMatchObject({ code: 'reason_required' });
    const removed = removeSignature(s, { slotKey: 'master', reason: REASON, at: '2026-11-22T12:30:00Z' }, MASTER);
    expect(removed.ok).toBe(true);

    // The company acknowledges the resubmitted cycle: locked again.
    const ack = transitionEnvelope(resigned.env, ACK);
    expect(ack).toMatchObject({ ok: true, value: { acknowledgedCycle: 2, cycle: 2 } });
    const reacked = step(resigned.env, ACK);
    s = derive(s, reacked);
    expect(s.vesselLocked).toBe(true);
    expect(removeMaster(s)).toMatchObject({ code: 'company_acknowledged' });
  }

  it('Return to vessel: the next cycle is unlocked until the company acknowledges it', () => {
    const { sheet, env } = acknowledgedCycle1();
    const returned = step(env, { action: 'return_to_vessel', actor: 'company', reason: 'Photos missing' });
    expect(returned.status).toBe('info_requested');
    // Re-deriving before the sheet moves to the new cycle does not lock the old sheet either.
    expect(vesselSignaturesLocked(returned, sheet.cycle)).toBe(false);
    expectNextCycleUnlockedUntilAcknowledged(sheet, returned);
  });

  it('Reopen: the closed record is locked; the reopened cycle is unlocked until acknowledged', () => {
    const { sheet, env } = acknowledgedCycle1();
    const withCompany = sign(sheet, 'company', SHORE);
    const closed = step(env, { action: 'sign_off', actor: 'company' });
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'company_sign_off' });
    const closedSheet = derive(withCompany, closed);
    expect(closedSheet.vesselLocked).toBe(true);

    const reopened = step(closed, { action: 'reopen', actor: 'company', reason: 'New evidence' });
    expect(reopened.status).toBe('in_review');
    expectNextCycleUnlockedUntilAcknowledged(closedSheet, reopened);
  });

  it('a company sign-off without a separate acknowledgement still locks the closed record', () => {
    const chain = signVesselChain(createSignatureSheet(CA_SLOTS), KIND);
    const closed = step(chain.env, { action: 'sign_off', actor: 'company' });
    expect(closed.acknowledgedCycle).toBeNull();
    const sheet = derive(sign(chain.sheet, 'company', SHORE), closed);
    expect(sheet.vesselLocked).toBe(true);
    expect(removeMaster(sheet)).toMatchObject({ code: 'company_acknowledged' });
  });
});

describe('report-first incident: the initial-report acknowledgement does not lock the final review', () => {
  const KIND: EnvelopeState = { companyStep: 'sign_off', reportFirst: true, allowCloseAs: true, allowReopen: true, status: 'open' };

  function finalReviewSigned() {
    let env = step(KIND, { action: 'submit', actor: 'vessel' });
    env = step(env, ACK);
    expect(env).toMatchObject({ status: 'acknowledged', initialReportAcknowledged: true, acknowledgedCycle: null });
    let sheet: SignatureSheet = { ...createSignatureSheet(INCIDENT_SLOTS), submitted: true };
    sheet = derive(sheet, env);
    expect(sheet.vesselLocked).toBe(false);

    sheet = sign(sheet, 'safety_officer', SO);
    env = step(env, PARTIAL);
    sheet = sign(sheet, 'master', MASTER);
    env = step(env, ALL);
    expect(env.status).toBe('awaiting_company_close');
    return { sheet: derive(sheet, env), env };
  }

  it('after the initial acknowledgement and the final-review signatures, the slots stay removable', () => {
    const { sheet } = finalReviewSigned();
    expect(sheet.vesselLocked).toBe(false);
    expect(removeMaster(sheet)).toBeNull();
  });

  it('Close as after review locks the vessel slots', () => {
    const { sheet, env } = finalReviewSigned();
    const closed = step(env, { action: 'close_as', actor: 'company', closedAs: 'after_review' });
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'company_close_as' });
    const locked = derive(sheet, closed);
    expect(locked.vesselLocked).toBe(true);
    expect(removeMaster(locked)).toMatchObject({ code: 'company_acknowledged' });
  });

  it('acknowledging the final review locks the vessel slots while awaiting the close', () => {
    const { sheet, env } = finalReviewSigned();
    const acked = step(env, ACK);
    expect(acked).toMatchObject({ status: 'awaiting_company_close', acknowledgedCycle: 1 });
    expect(derive(sheet, acked).vesselLocked).toBe(true);
  });
});
