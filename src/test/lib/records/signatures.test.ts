import { describe, expect, it } from 'vitest';
import {
  activeSignature,
  cancelPass,
  canSign,
  createSignatureSheet,
  hasStaleRequiredSignatures,
  isSignatureStale,
  orderBanner,
  partyComplete,
  passSlotTo,
  removeSignature,
  reSignSlot,
  sheetCompletion,
  signSlot,
  slotActions,
  slotState,
  staleSlots,
  startNextCycle,
  validateSlotTemplate,
  type SignatureActor,
  type SignatureSheet,
  type SignInput,
  type SlotDefinition,
} from '@/lib/records/signatures';

// Corrective-action style chain: HoD → Master → company (gap/08 §B, image18 flow).
const CA_SLOTS: SlotDefinition[] = [
  { key: 'hod', label: 'Head of Department', order: 1, party: 'vessel', officeKey: 'hod' },
  { key: 'master', label: 'Master', order: 2, party: 'vessel', officeKey: 'master', allowOnBehalf: true },
  { key: 'company', label: 'Company', order: 3, party: 'company' },
];

// Who holds which slot on this vessel (the server's slot_eligible).
const OFFICES: Record<string, string[]> = {
  hod: ['p-hod', 'p-hod2'],
  master: ['p-master'],
  company: ['p-shore'],
  ao: ['p-ao', 'p-both'],
  cp: ['p-cp', 'p-both', 'p-creator'],
  witness_a: ['p-a'],
  witness_b: ['p-b'],
  observer: ['p-hod'],
};
const eligible = (slot: SlotDefinition, profileId: string) => (OFFICES[slot.key] ?? []).includes(profileId);

const actor = (profileId: string, extra: Partial<SignatureActor> = {}): SignatureActor => ({
  profileId,
  name: profileId,
  isEligible: eligible,
  canWrite: true,
  ...extra,
});
const HOD = actor('p-hod');
const MASTER = actor('p-master', { isMaster: true });
const SHORE = actor('p-shore', { isCompanyActor: true });
const CREW = actor('p-crew');

let n = 0;
const sign = (sheet: SignatureSheet, slotKey: string, who: SignatureActor, extra: Partial<SignInput> = {}) =>
  signSlot(sheet, { slotKey, id: `sig-${++n}`, method: 'verified', recordDigest: 'd1', at: `2026-11-22T10:${String(n % 60).padStart(2, '0')}:00Z`, ...extra }, who);

const must = <T,>(r: { ok: boolean; value?: T; error?: { code: string } }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.value;
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

const fresh = () => createSignatureSheet(CA_SLOTS, { creatorProfileId: 'p-creator' });

describe('template validation', () => {
  it('rejects duplicate keys, bad orders and unsafe company flags', () => {
    expect(() => validateSlotTemplate([CA_SLOTS[0], CA_SLOTS[0]])).toThrow(/Duplicate/);
    expect(() => validateSlotTemplate([{ ...CA_SLOTS[0], order: 0 }])).toThrow(/order/);
    expect(() => validateSlotTemplate([{ ...CA_SLOTS[0], order: 1.5 }])).toThrow(/order/);
    expect(() => validateSlotTemplate([{ ...CA_SLOTS[0], key: 'Bad Key' }])).toThrow(/snake_case/);
    expect(() => validateSlotTemplate([{ key: 'c', label: 'C', order: 1, party: 'company', allowVisitor: true }])).toThrow(/visitors/);
    expect(() => validateSlotTemplate([{ key: 'c', label: 'C', order: 1, party: 'company', allowOnBehalf: true }])).toThrow(/behalf/);
    // Review round 4 (company-slot-witnessed-forgery): a company sign-off is
    // made by the company actor on their own account, never witnessed.
    expect(() => validateSlotTemplate([{ key: 'c', label: 'C', order: 1, party: 'company', allowWitnessed: true }])).toThrow(
      'Company slot "c" cannot be witnessed',
    );
    expect(() => validateSlotTemplate([{ key: 'c', label: 'C', order: 1, party: 'company', allowWitnessed: false }])).not.toThrow();
    expect(() => validateSlotTemplate([{ ...CA_SLOTS[0], distinctFrom: ['nope'] }])).toThrow(/unknown slot/);
  });

  it('sorts slots by order', () => {
    const sheet = createSignatureSheet([CA_SLOTS[2], CA_SLOTS[0], CA_SLOTS[1]]);
    expect(sheet.slots.map((s) => s.key)).toEqual(['hod', 'master', 'company']);
  });
});

describe('slot lifecycle: waiting → open → signed', () => {
  it('a fresh sheet opens only the first slot', () => {
    const s = fresh();
    expect(CA_SLOTS.map((slot) => slotState(s, slot.key))).toEqual(['open', 'waiting', 'waiting']);
    expect(orderBanner(s)).toBe("Waiting for the Head of Department's signature — sign in order");
  });

  it('signing in order opens the next slot each time and completes the sheet', () => {
    let s = fresh();
    s = must(sign(s, 'hod', HOD));
    expect(CA_SLOTS.map((slot) => slotState(s, slot.key))).toEqual(['signed', 'open', 'waiting']);
    expect(orderBanner(s)).toBe("Waiting for the Master's signature — sign in order");
    expect(partyComplete(s, 'vessel')).toBe(false);

    s = must(sign(s, 'master', MASTER));
    expect(partyComplete(s, 'vessel')).toBe(true);
    expect(sheetCompletion(s)).toMatchObject({ requiredTotal: 3, requiredSigned: 2, complete: false });

    s = must(sign(s, 'company', SHORE));
    expect(CA_SLOTS.map((slot) => slotState(s, slot.key))).toEqual(['signed', 'signed', 'signed']);
    expect(sheetCompletion(s).complete).toBe(true);
    expect(orderBanner(s)).toBeNull();
  });

  it('records the signature with method, signer and digest', () => {
    const s = must(sign(fresh(), 'hod', HOD, { recordDigest: 'abc', at: '2026-11-22T09:00:00Z', id: 'sig-x' }));
    expect(activeSignature(s, 'hod')).toEqual({
      id: 'sig-x',
      slotKey: 'hod',
      cycle: 1,
      signerProfileId: 'p-hod',
      signerName: 'p-hod',
      signerKind: 'crew',
      method: 'verified',
      witnessProfileId: null,
      onBehalfOfOffice: null,
      recordDigest: 'abc',
      signedAt: '2026-11-22T09:00:00Z',
      removedAt: null,
      removedBy: null,
      removalReason: null,
      supersededAt: null,
    });
  });
});

describe('forbidden signings', () => {
  it('a later slot cannot sign before earlier required slots', () => {
    const r = sign(fresh(), 'master', MASTER);
    expect(code(r)).toBe('slot_waiting');
    expect(r.ok ? '' : r.error.message).toBe('Master must wait for the Head of Department signature first.');
  });

  it('a signed slot cannot be signed again', () => {
    const s = must(sign(fresh(), 'hod', HOD));
    expect(code(sign(s, 'hod', actor('p-hod2')))).toBe('slot_signed');
  });

  it('an ineligible person cannot sign as themselves', () => {
    expect(code(sign(fresh(), 'hod', CREW))).toBe('not_eligible');
    // The Master of another vessel is not an office holder here.
    expect(code(sign(fresh(), 'hod', MASTER))).toBe('not_eligible');
  });

  it('impersonating users can never sign', () => {
    expect(code(sign(fresh(), 'hod', actor('p-hod', { impersonating: true })))).toBe('impersonating');
  });

  it('unknown slot and missing digest', () => {
    expect(code(sign(fresh(), 'nope', HOD))).toBe('unknown_slot');
    expect(code(sign(fresh(), 'hod', HOD, { recordDigest: '' }))).toBe('invalid_input');
  });
});

describe('optional slots and parallel groups', () => {
  const slots: SlotDefinition[] = [
    { key: 'witness_a', label: 'First witness', order: 1, party: 'vessel' },
    { key: 'witness_b', label: 'Second witness', order: 1, party: 'vessel' },
    { key: 'observer', label: 'Observer', order: 2, party: 'vessel', required: false },
    { key: 'master', label: 'Master', order: 3, party: 'vessel' },
  ];
  const A = actor('p-a');
  const B = actor('p-b');

  it('slots sharing an order sign in either order', () => {
    let s = createSignatureSheet(slots);
    expect(slotState(s, 'witness_a')).toBe('open');
    expect(slotState(s, 'witness_b')).toBe('open');
    expect(orderBanner(s)).toBe("Waiting for the First witness's and the Second witness's signatures — sign in order");
    s = must(sign(s, 'witness_b', B));
    expect(slotState(s, 'observer')).toBe('waiting');
    s = must(sign(s, 'witness_a', A));
    expect(slotState(s, 'observer')).toBe('open');
  });

  it('an optional slot does not block later slots or completion', () => {
    let s = createSignatureSheet(slots);
    s = must(sign(s, 'witness_a', A));
    s = must(sign(s, 'witness_b', B));
    expect(slotState(s, 'master')).toBe('open');
    s = must(sign(s, 'master', MASTER));
    expect(sheetCompletion(s)).toMatchObject({ requiredTotal: 3, requiredSigned: 3, complete: true });
    expect(slotState(s, 'observer')).toBe('open');
  });

  it('either parallel signature can be removed while no later slot is signed', () => {
    let s = createSignatureSheet(slots);
    s = must(sign(s, 'witness_a', A));
    s = must(sign(s, 'witness_b', B));
    expect(code(removeSignature(s, { slotKey: 'witness_a', at: 't' }, A))).toBe('ok');
    expect(code(removeSignature(s, { slotKey: 'witness_b', at: 't' }, B))).toBe('ok');
  });
});

describe('someone else signing (witnessed)', () => {
  const slots: SlotDefinition[] = [
    { key: 'cp', label: 'Competent person', order: 1, party: 'vessel', allowVisitor: true },
    { key: 'hod', label: 'Head of Department', order: 2, party: 'vessel' },
    { key: 'company', label: 'Company', order: 3, party: 'company' },
  ];
  const witnessed = (signer: SignInput['signer']): Partial<SignInput> => ({ method: 'witnessed', signer });

  it('a crew member picked from the list signs on this device; the logged-in user witnesses', () => {
    const s = must(sign(createSignatureSheet(slots), 'cp', CREW, witnessed({ profileId: 'p-cp', name: 'Competent person' })));
    expect(activeSignature(s, 'cp')).toMatchObject({ method: 'witnessed', signerProfileId: 'p-cp', witnessProfileId: 'p-crew', signerKind: 'crew' });
  });

  it('the picked person must be eligible for the slot', () => {
    expect(code(sign(createSignatureSheet(slots), 'cp', CREW, witnessed({ profileId: 'p-master', name: 'Master' })))).toBe('not_eligible');
  });

  it('a visitor or contractor may sign only where the slot allows it', () => {
    const s0 = createSignatureSheet(slots);
    const visitor = witnessed({ profileId: null, name: 'Contractor', kind: 'contractor' });
    const s1 = must(sign(s0, 'cp', CREW, visitor));
    expect(activeSignature(s1, 'cp')).toMatchObject({ signerProfileId: null, signerKind: 'contractor', method: 'witnessed' });
    expect(code(sign(s1, 'hod', CREW, visitor))).toBe('visitor_not_allowed');
  });

  it('company slots cannot be witnessed', () => {
    let s = createSignatureSheet(slots);
    s = must(sign(s, 'cp', actor('p-cp')));
    s = must(sign(s, 'hod', HOD));
    expect(code(sign(s, 'company', HOD, witnessed({ profileId: 'p-shore', name: 'Shore' })))).toBe('method_not_allowed');
  });

  it('a company slot is never witnessed, even when a sheet carries the flag (defence in depth)', () => {
    // A sheet built around validateSlotTemplate (e.g. stale data): the flag
    // on a company slot is ignored, as record_sign_slot ignores it.
    const forged: SlotDefinition[] = [{ key: 'company', label: 'Company', order: 1, party: 'company', allowWitnessed: true }];
    const sheet: SignatureSheet = { ...createSignatureSheet([]), slots: forged };
    expect(code(sign(sheet, 'company', CREW, witnessed({ profileId: 'p-shore', name: 'Shore' })))).toBe('method_not_allowed');
    expect(sheet.signatures).toHaveLength(0);
  });

  it('witnessing needs write access, a named signer, and someone other than yourself', () => {
    const s = createSignatureSheet(slots);
    expect(code(sign(s, 'cp', actor('p-crew', { canWrite: false }), witnessed({ profileId: 'p-cp', name: 'CP' })))).toBe('no_write_access');
    expect(code(sign(s, 'cp', CREW, witnessed({ profileId: null, name: '  ' })))).toBe('invalid_input');
    expect(code(sign(s, 'cp', actor('p-cp'), witnessed({ profileId: 'p-cp', name: 'CP' })))).toBe('witness_is_signer');
  });
});

describe('signed on behalf', () => {
  const OFFICER = actor('p-chief-officer', { canSignOnBehalf: () => true });

  it('only where the slot allows it; the office is recorded', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = must(sign(s, 'master', OFFICER, { method: 'on_behalf' }));
    expect(activeSignature(s, 'master')).toMatchObject({ method: 'on_behalf', signerProfileId: 'p-chief-officer', onBehalfOfOffice: 'master', onBehalfReason: null });
    expect(code(sign(fresh(), 'hod', OFFICER, { method: 'on_behalf' }))).toBe('method_not_allowed');
  });

  it('write access alone is not enough: the caller must allow on-behalf signing for this person', () => {
    const s = must(sign(fresh(), 'hod', HOD));
    const writer = actor('p-deckhand'); // canWrite, not eligible, no canSignOnBehalf
    const r = sign(s, 'master', writer, { method: 'on_behalf' });
    expect(r).toMatchObject({ ok: false, error: { code: 'not_eligible', message: "You can't sign on the Master's behalf on this record." } });
    expect(code(sign(s, 'master', actor('p-deckhand', { canSignOnBehalf: () => false }), { method: 'on_behalf' }))).toBe('not_eligible');
    expect(slotActions(s, 'master', writer).signOnBehalf).toBe(false);
  });

  it('the predicate gets the slot and the signer', () => {
    const seen: Array<[string, string]> = [];
    const s = must(sign(fresh(), 'hod', HOD));
    must(sign(s, 'master', actor('p-co', { canSignOnBehalf: (slot, id) => (seen.push([slot.key, id]), true) }), { method: 'on_behalf' }));
    expect(seen).toContainEqual(['master', 'p-co']);
  });

  it('re-signing an on-behalf signature re-checks write access and on-behalf eligibility', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = must(sign(s, 'master', OFFICER, { method: 'on_behalf', recordDigest: 'd1' }));
    const resign = (who: SignatureActor) => reSignSlot(s, { slotKey: 'master', id: `re-${++n}`, recordDigest: 'd2', at: 't2' }, who);
    expect(code(resign(OFFICER))).toBe('ok');
    expect(code(resign(actor('p-chief-officer')))).toBe('not_eligible');
    expect(code(resign(actor('p-chief-officer', { canSignOnBehalf: () => true, canWrite: false })))).toBe('no_write_access');
  });

  it('the office holder is offered "Sign as me", not "Sign on behalf"', () => {
    const s = must(sign(fresh(), 'hod', HOD));
    const master = actor('p-master', { isMaster: true, canSignOnBehalf: () => true });
    expect(slotActions(s, 'master', master)).toMatchObject({ signAsMe: true, signOnBehalf: false });
    expect(slotActions(s, 'master', OFFICER)).toMatchObject({ signAsMe: false, signOnBehalf: true });
  });

  it('a slot may require a reason for on-behalf signing; it is stored on the row', () => {
    const slots: SlotDefinition[] = [{ key: 'master', label: 'Master', order: 1, party: 'vessel', officeKey: 'master', allowOnBehalf: true, onBehalfReasonRequired: true }];
    const s = createSignatureSheet(slots);
    expect(code(sign(s, 'master', OFFICER, { method: 'on_behalf' }))).toBe('reason_required');
    expect(code(sign(s, 'master', OFFICER, { method: 'on_behalf', reason: '  ' }))).toBe('reason_required');
    const signed = must(sign(s, 'master', OFFICER, { method: 'on_behalf', reason: ' Master ashore for the port state visit ' }));
    expect(activeSignature(signed, 'master')?.onBehalfReason).toBe('Master ashore for the port state visit');
    expect(slotActions(s, 'master', OFFICER).signOnBehalf).toBe(true);
  });

  it('needs write access (absent counts as none)', () => {
    const s = must(sign(fresh(), 'hod', HOD));
    expect(code(sign(s, 'master', actor('p-x', { canWrite: false }), { method: 'on_behalf' }))).toBe('no_write_access');
    expect(code(sign(s, 'master', actor('p-x', { canWrite: undefined }), { method: 'on_behalf' }))).toBe('no_write_access');
    expect(code(sign(fresh(), 'hod', actor('p-x', { canWrite: undefined }), { method: 'witnessed', signer: { profileId: 'p-hod', name: 'HoD' } }))).toBe('no_write_access');
  });
});

describe('separation of duties', () => {
  const ptw: SlotDefinition[] = [
    { key: 'cp', label: 'Competent person', order: 1, party: 'vessel', distinctFrom: ['creator'] },
    { key: 'ao', label: 'Authorising officer', order: 2, party: 'vessel', distinctFrom: ['cp', 'creator'] },
  ];

  it('the same person cannot sign two conflicting slots', () => {
    let s = createSignatureSheet(ptw, { creatorProfileId: 'p-creator' });
    s = must(sign(s, 'cp', actor('p-both')));
    const r = sign(s, 'ao', actor('p-both'));
    expect(code(r)).toBe('separation_of_duties');
    expect(code(sign(s, 'ao', actor('p-ao')))).toBe('ok');
  });

  it('the record creator cannot sign a slot marked distinct from the creator', () => {
    const s = createSignatureSheet(ptw, { creatorProfileId: 'p-creator' });
    expect(code(sign(s, 'cp', actor('p-creator')))).toBe('separation_of_duties');
  });

  it('applies to the witnessed signer, not the witness', () => {
    let s = createSignatureSheet(ptw, { creatorProfileId: 'p-creator' });
    s = must(sign(s, 'cp', actor('p-both')));
    expect(code(sign(s, 'ao', CREW, { method: 'witnessed', signer: { profileId: 'p-both', name: 'Both' } }))).toBe('separation_of_duties');
  });
});

describe('pass to', () => {
  it('open → requested → (cancel) → open', () => {
    let s = fresh();
    s = must(passSlotTo(s, { slotKey: 'hod', toProfileId: 'p-hod2', at: 't1' }, CREW));
    expect(slotState(s, 'hod')).toBe('requested');
    expect(s.passes.hod).toEqual({ profileId: 'p-hod2', at: 't1' });
    s = must(cancelPass(s, 'hod', CREW));
    expect(slotState(s, 'hod')).toBe('open');
  });

  it('requested → signed clears the request', () => {
    let s = must(passSlotTo(fresh(), { slotKey: 'hod', toProfileId: 'p-hod2', at: 't1' }, CREW));
    s = must(sign(s, 'hod', actor('p-hod2')));
    expect(slotState(s, 'hod')).toBe('signed');
    expect(s.passes.hod).toBeUndefined();
  });

  it('forbidden: waiting, signed, already requested, ineligible target, cancel without a pass', () => {
    const s = fresh();
    expect(code(passSlotTo(s, { slotKey: 'master', toProfileId: 'p-master', at: 't' }, CREW))).toBe('not_open');
    expect(code(passSlotTo(s, { slotKey: 'hod', toProfileId: 'p-crew', at: 't' }, CREW))).toBe('not_eligible');
    const requested = must(passSlotTo(s, { slotKey: 'hod', toProfileId: 'p-hod', at: 't' }, CREW));
    expect(code(passSlotTo(requested, { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, CREW))).toBe('not_open');
    const signed = must(sign(s, 'hod', HOD));
    expect(code(passSlotTo(signed, { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, CREW))).toBe('not_open');
    expect(code(cancelPass(s, 'hod', CREW))).toBe('not_requested');
    expect(code(cancelPass(s, 'nope', CREW))).toBe('unknown_slot');
  });
});

describe('remove signature: reverse order only', () => {
  const allSigned = () => {
    let s = fresh();
    s = must(sign(s, 'hod', HOD));
    s = must(sign(s, 'master', MASTER));
    s = must(sign(s, 'company', SHORE));
    return s;
  };

  it('the company decision goes first, then the vessel slots, latest first', () => {
    let s = allSigned();
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't' }, HOD))).toBe('not_latest');
    expect(code(removeSignature(s, { slotKey: 'master', at: 't' }, MASTER))).toBe('not_latest');
    s = must(removeSignature(s, { slotKey: 'company', at: 't' }, SHORE));
    expect(slotState(s, 'company')).toBe('open');
    s = must(removeSignature(s, { slotKey: 'master', at: 't' }, MASTER));
    expect(CA_SLOTS.map((slot) => slotState(s, slot.key))).toEqual(['signed', 'open', 'waiting']);
  });

  it('removing an optional earlier slot keeps the later slot open and its pass requested', () => {
    const slots: SlotDefinition[] = [
      { key: 'a', label: 'A', order: 1, party: 'vessel' },
      { key: 'o', label: 'Observer', order: 2, party: 'vessel', required: false },
      { key: 'c', label: 'C', order: 3, party: 'vessel' },
    ];
    const anyone = actor('p-any', { isEligible: () => true });
    let s = must(sign(createSignatureSheet(slots), 'a', anyone));
    s = must(passSlotTo(s, { slotKey: 'c', toProfileId: 'p3', at: 't2' }, anyone));
    expect(slotState(s, 'c')).toBe('requested');
    s = must(sign(s, 'o', anyone));
    s = must(removeSignature(s, { slotKey: 'o', at: 't3' }, anyone));
    expect(slotState(s, 'o')).toBe('open');
    expect(slotState(s, 'c')).toBe('requested');
    expect(s.passes.c).toEqual({ profileId: 'p3', at: 't2' });
  });

  it('removal returns later slots to waiting and clears their pass requests', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = must(passSlotTo(s, { slotKey: 'master', toProfileId: 'p-master', at: 't' }, HOD));
    s = must(removeSignature(s, { slotKey: 'hod', at: 't2' }, HOD));
    expect(slotState(s, 'master')).toBe('waiting');
    expect(s.passes.master).toBeUndefined();
    // History is kept.
    expect(s.signatures).toHaveLength(1);
    expect(s.signatures[0]).toMatchObject({ removedAt: 't2', removedBy: 'p-hod' });
  });

  it('who may remove: signer, Master for vessel slots, company actor for company slots', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't' }, CREW))).toBe('not_allowed');
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't' }, SHORE))).toBe('not_allowed'); // company never removes vessel slots here
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't' }, MASTER))).toBe('ok');
    s = must(sign(s, 'master', MASTER));
    s = must(sign(s, 'company', SHORE));
    expect(code(removeSignature(s, { slotKey: 'company', at: 't' }, MASTER))).toBe('not_allowed');
    expect(code(removeSignature(s, { slotKey: 'company', at: 't' }, actor('p-other-admin', { isCompanyActor: true })))).toBe('ok');
  });

  it('the witness alone may not remove a witnessed signature; the Master may (gap/08 §B)', () => {
    const slots: SlotDefinition[] = [{ key: 'cp', label: 'CP', order: 1, party: 'vessel', allowVisitor: true }];
    const s = must(sign(createSignatureSheet(slots), 'cp', CREW, { method: 'witnessed', signer: { profileId: null, name: 'Visitor' } }));
    expect(code(removeSignature(s, { slotKey: 'cp', at: 't' }, CREW))).toBe('not_allowed');
    expect(code(removeSignature(s, { slotKey: 'cp', at: 't' }, MASTER))).toBe('ok');
  });

  it('the witness of a crew-witnessed Master signature is refused; the Master removes it', () => {
    const slots: SlotDefinition[] = [{ key: 'master', label: 'Master', order: 1, party: 'vessel', officeKey: 'master' }];
    const s = must(sign(createSignatureSheet(slots), 'master', CREW, { method: 'witnessed', signer: { profileId: 'p-master', name: 'Master' } }));
    expect(activeSignature(s, 'master')).toMatchObject({ signerProfileId: 'p-master', witnessProfileId: 'p-crew' });
    expect(code(removeSignature(s, { slotKey: 'master', at: 't' }, CREW))).toBe('not_allowed');
    expect(code(removeSignature(s, { slotKey: 'master', at: 't' }, MASTER))).toBe('ok');
  });

  it('a reason is required once the record is submitted', () => {
    const s = { ...must(sign(fresh(), 'hod', HOD)), submitted: true };
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't' }, HOD))).toBe('reason_required');
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't', reason: '  ' }, HOD))).toBe('reason_required');
    const r = must(removeSignature(s, { slotKey: 'hod', at: 't', reason: 'Signed the wrong form' }, HOD));
    expect(r.signatures[0].removalReason).toBe('Signed the wrong form');
  });

  it('forbidden: unsigned slot, impersonation', () => {
    expect(code(removeSignature(fresh(), { slotKey: 'hod', at: 't' }, HOD))).toBe('not_signed');
    const s = must(sign(fresh(), 'hod', HOD));
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't' }, actor('p-hod', { impersonating: true })))).toBe('impersonating');
  });

  it('after company acknowledgement, vessel signatures are locked until the record is returned', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = must(sign(s, 'master', MASTER));
    s = { ...s, submitted: true, vesselLocked: true };
    const master = removeSignature(s, { slotKey: 'master', at: 't', reason: 'changed my mind' }, MASTER);
    expect(master).toMatchObject({
      ok: false,
      error: { code: 'company_acknowledged', message: 'The company has acknowledged this record. Ask the company to return it to the vessel before removing a vessel signature.' },
    });
    expect(code(removeSignature(s, { slotKey: 'master', at: 't', reason: 'r' }, actor('p-master')))).toBe('company_acknowledged');
    expect(slotActions(s, 'master', MASTER).remove).toBe(false);

    // The company's own slot stays removable by the company.
    const withCompany = must(sign(s, 'company', SHORE));
    expect(code(removeSignature(withCompany, { slotKey: 'company', at: 't', reason: 'Signed too early' }, SHORE))).toBe('ok');

    // Return to vessel / reopen / review starts a new cycle, which clears the lock.
    let next = startNextCycle(s, 't-return');
    expect(next.vesselLocked).toBe(false);
    next = must(sign(next, 'hod', HOD));
    expect(code(removeSignature(next, { slotKey: 'hod', at: 't', reason: 'r' }, HOD))).toBe('ok');
  });

  it('the slot can be signed again after removal (new row)', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = must(removeSignature(s, { slotKey: 'hod', at: 't' }, HOD));
    s = must(sign(s, 'hod', actor('p-hod2')));
    expect(activeSignature(s, 'hod')?.signerProfileId).toBe('p-hod2');
    expect(s.signatures).toHaveLength(2);
  });
});

describe('stale signatures', () => {
  const digestFor = (current: Record<string, string>) => (slot: SlotDefinition) => current[slot.key] ?? 'd1';

  it('a signature goes stale when the covered content changes', () => {
    const s = must(sign(fresh(), 'hod', HOD, { recordDigest: 'd1' }));
    expect(isSignatureStale(s, 'hod', 'd1')).toBe(false);
    expect(isSignatureStale(s, 'hod', 'd2')).toBe(true);
    expect(isSignatureStale(s, 'master', 'd2')).toBe(false); // unsigned slots are never stale
    expect(staleSlots(s, digestFor({ hod: 'd2' })).map((x) => x.key)).toEqual(['hod']);
    expect(hasStaleRequiredSignatures(s, digestFor({ hod: 'd2' }))).toBe(true);
    expect(hasStaleRequiredSignatures(s, digestFor({}))).toBe(false);
  });

  it('only the sections a slot covers matter (per-slot digests)', () => {
    let s = must(sign(fresh(), 'hod', HOD, { recordDigest: 'sec1-v1' }));
    s = must(sign(s, 'master', MASTER, { recordDigest: 'all-v1' }));
    // Section 3 changed: the Master (whole record) is stale, the HoD (section 1) is not.
    expect(staleSlots(s, digestFor({ hod: 'sec1-v1', master: 'all-v2' })).map((x) => x.key)).toEqual(['master']);
  });

  it('optional stale signatures do not block', () => {
    const slots: SlotDefinition[] = [{ key: 'observer', label: 'Observer', order: 1, party: 'vessel', required: false }];
    const s = must(sign(createSignatureSheet(slots), 'observer', HOD, { recordDigest: 'd1' }));
    expect(hasStaleRequiredSignatures(s, () => 'd2')).toBe(false);
  });

  it('re-sign: same signer, one tap, old row superseded', () => {
    let s = must(sign(fresh(), 'hod', HOD, { recordDigest: 'd1', id: 'old' }));
    s = must(reSignSlot(s, { slotKey: 'hod', id: 'new', recordDigest: 'd2', at: 't2' }, HOD));
    expect(activeSignature(s, 'hod')).toMatchObject({ id: 'new', recordDigest: 'd2', signedAt: 't2' });
    expect(s.signatures.find((x) => x.id === 'old')?.supersededAt).toBe('t2');
    expect(isSignatureStale(s, 'hod', 'd2')).toBe(false);
  });

  it('re-sign is refused when not stale, by someone else, or for a witnessed signature', () => {
    const s = must(sign(fresh(), 'hod', HOD, { recordDigest: 'd1' }));
    expect(code(reSignSlot(s, { slotKey: 'hod', id: 'n', recordDigest: 'd1', at: 't' }, HOD))).toBe('not_stale');
    expect(code(reSignSlot(s, { slotKey: 'hod', id: 'n', recordDigest: 'd2', at: 't' }, actor('p-hod2')))).toBe('different_signer');
    expect(code(reSignSlot(s, { slotKey: 'master', id: 'n', recordDigest: 'd2', at: 't' }, MASTER))).toBe('not_signed');
    expect(code(reSignSlot(s, { slotKey: 'hod', id: 'n', recordDigest: 'd2', at: 't' }, actor('p-hod', { impersonating: true })))).toBe('impersonating');
    const w = must(sign(fresh(), 'hod', CREW, { method: 'witnessed', signer: { profileId: 'p-hod', name: 'HoD' }, recordDigest: 'd1' }));
    expect(code(reSignSlot(w, { slotKey: 'hod', id: 'n', recordDigest: 'd2', at: 't' }, HOD))).toBe('needs_ceremony');
  });
});

describe('signature ids are idempotency keys', () => {
  const twoSlots: SlotDefinition[] = [
    { key: 'a', label: 'A', order: 1, party: 'vessel' },
    { key: 'b', label: 'B', order: 2, party: 'vessel' },
  ];
  const anyone = actor('p-any', { isEligible: () => true, isMaster: true });
  const input = (slotKey: string, id: string, recordDigest = 'd1'): SignInput => ({ slotKey, id, method: 'verified', recordDigest, at: 't' });

  it('replaying a signature (same id, same slot) is a no-op', () => {
    const s = must(signSlot(createSignatureSheet(twoSlots), input('a', 'same'), anyone));
    const again = signSlot(s, input('a', 'same'), anyone);
    expect(again).toMatchObject({ ok: true });
    expect(again.value).toBe(s);
    expect(s.signatures).toHaveLength(1);
  });

  it('an id used on another slot (or on a removed row) is refused', () => {
    let s = must(signSlot(createSignatureSheet(twoSlots), input('a', 'same'), anyone));
    expect(signSlot(s, input('b', 'same'), anyone)).toMatchObject({ ok: false, error: { code: 'invalid_input', message: 'That signature id is already used on this record.' } });
    s = must(removeSignature(s, { slotKey: 'a', at: 't2' }, anyone));
    expect(code(signSlot(s, input('a', 'same'), anyone))).toBe('invalid_input');
  });

  it('removal and re-sign change exactly one row, even if ids collide in stored data', () => {
    const base = must(signSlot(must(signSlot(createSignatureSheet(twoSlots), input('a', 'a1'), anyone)), input('b', 'b1'), anyone));
    // Legacy data with a duplicated id: only the row on the slot acted on may change.
    const dup: SignatureSheet = { ...base, signatures: base.signatures.map((r) => ({ ...r, id: 'dup' })) };
    const removed = must(removeSignature(dup, { slotKey: 'b', at: 't2' }, anyone));
    expect(activeSignature(removed, 'a')).toBeDefined();
    expect(activeSignature(removed, 'b')).toBeUndefined();
    expect(removed.signatures.filter((r) => r.removedAt)).toHaveLength(1);

    const resigned = must(reSignSlot(dup, { slotKey: 'b', id: 'b2', recordDigest: 'd2', at: 't3' }, anyone));
    expect(activeSignature(resigned, 'a')).toMatchObject({ id: 'dup', supersededAt: null });
    expect(activeSignature(resigned, 'b')).toMatchObject({ id: 'b2', recordDigest: 'd2' });
    expect(resigned.signatures.filter((r) => r.supersededAt)).toHaveLength(1);
  });

  it('re-sign: replaying the same id is a no-op; reusing another row\'s id is refused', () => {
    const s = must(signSlot(createSignatureSheet(twoSlots), input('a', 'a1'), anyone));
    const resigned = must(reSignSlot(s, { slotKey: 'a', id: 'a2', recordDigest: 'd2', at: 't2' }, anyone));
    expect(reSignSlot(resigned, { slotKey: 'a', id: 'a2', recordDigest: 'd2', at: 't2' }, anyone).value).toBe(resigned);
    expect(code(reSignSlot(resigned, { slotKey: 'a', id: 'a1', recordDigest: 'd3', at: 't3' }, anyone))).toBe('invalid_input');
  });
});

describe('cycles', () => {
  it('a new cycle supersedes live signatures and reopens the template', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = must(sign(s, 'master', MASTER));
    s = must(passSlotTo(s, { slotKey: 'company', toProfileId: 'p-shore', at: 't' }, MASTER));
    const next = startNextCycle(s, 't-review');
    expect(next.cycle).toBe(2);
    expect(next.passes).toEqual({});
    expect(CA_SLOTS.map((slot) => slotState(next, slot.key))).toEqual(['open', 'waiting', 'waiting']);
    expect(next.signatures.every((x) => x.supersededAt === 't-review')).toBe(true);
    // History of cycle 1 is kept, untouched apart from the supersede stamp.
    expect(next.signatures.map((x) => x.cycle)).toEqual([1, 1]);
  });

  it('removed signatures keep their removal, not a supersede stamp', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = must(removeSignature(s, { slotKey: 'hod', at: 't-rm' }, HOD));
    const next = startNextCycle(s, 't-next');
    expect(next.signatures[0]).toMatchObject({ removedAt: 't-rm', supersededAt: null });
  });

  it('cycle 2 signatures are separate from cycle 1', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = startNextCycle(s, 't');
    s = must(sign(s, 'hod', HOD));
    expect(activeSignature(s, 'hod')?.cycle).toBe(2);
  });
});

describe('write access (D-214: a reader who may view the record changes nothing)', () => {
  // An external viewer: may read, may not write; eligibility would admit them.
  const READER = actor('p-hod', { canWrite: false });
  const READER_UNSET = actor('p-hod', { canWrite: undefined });
  const COMPANY_READER = actor('p-shore', { canWrite: false, isCompanyActor: true });
  const WRITE_MESSAGE = 'You can view this record but not change it.';

  it('pass: no_write_access after impersonation, before the slot state', () => {
    expect(passSlotTo(fresh(), { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, READER)).toEqual({
      ok: false,
      error: { code: 'no_write_access', message: WRITE_MESSAGE },
    });
    expect(code(passSlotTo(fresh(), { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, READER_UNSET))).toBe('no_write_access');
    // A waiting slot: the write check comes first, as in record_pass_slot.
    expect(code(passSlotTo(fresh(), { slotKey: 'master', toProfileId: 'p-master', at: 't' }, READER))).toBe('no_write_access');
    expect(code(passSlotTo(fresh(), { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, actor('p-hod', { canWrite: false, impersonating: true })))).toBe('impersonating');
  });

  it('cancel a pass: no_write_access, the pass stays', () => {
    const requested = must(passSlotTo(fresh(), { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, CREW));
    const r = cancelPass(requested, 'hod', READER);
    expect(code(r)).toBe('no_write_access');
    expect(slotState(requested, 'hod')).toBe('requested');
    expect(code(cancelPass(requested, 'hod', READER_UNSET))).toBe('no_write_access');
    expect(code(cancelPass(requested, 'hod', actor('p-hod', { canWrite: false, impersonating: true })))).toBe('impersonating');
  });

  it('re-sign (verified, own signature): no_write_access before not_signed', () => {
    const s = must(sign(fresh(), 'hod', HOD));
    expect(code(reSignSlot(s, { slotKey: 'hod', id: 're-reader', recordDigest: 'd2', at: 't2' }, READER))).toBe('no_write_access');
    expect(code(reSignSlot(s, { slotKey: 'master', id: 're-reader-2', recordDigest: 'd2', at: 't2' }, READER))).toBe('no_write_access');
    expect(activeSignature(s, 'hod')?.recordDigest).toBe('d1');
  });

  it('remove (own signature): no_write_access before not_signed, the signature stays', () => {
    const s = must(sign(fresh(), 'hod', HOD));
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't2' }, READER))).toBe('no_write_access');
    expect(code(removeSignature(s, { slotKey: 'master', at: 't2' }, READER))).toBe('no_write_access');
    // A reader who also holds the Master office removes nothing either.
    expect(code(removeSignature(s, { slotKey: 'hod', at: 't2' }, actor('p-master', { canWrite: false, isMaster: true })))).toBe('no_write_access');
    expect(activeSignature(s, 'hod')?.removedAt).toBeNull();
  });

  it('slotActions offers a reader no pass, cancel or remove', () => {
    expect(slotActions(fresh(), 'hod', READER)).toMatchObject({ passTo: false, cancelPass: false, remove: false, someoneElse: false });
    const requested = must(passSlotTo(fresh(), { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, CREW));
    expect(slotActions(requested, 'hod', READER)).toMatchObject({ passTo: false, cancelPass: false });
    const signed = must(sign(fresh(), 'hod', HOD));
    expect(slotActions(signed, 'hod', READER).remove).toBe(false);
    expect(slotActions(signed, 'hod', READER_UNSET).remove).toBe(false);
  });

  it('a company actor without canWrite still acts', () => {
    let s = must(sign(fresh(), 'hod', HOD));
    s = must(sign(s, 'master', MASTER));
    expect(slotActions(s, 'company', COMPANY_READER)).toMatchObject({ signAsMe: true, passTo: true });
    const requested = must(passSlotTo(s, { slotKey: 'company', toProfileId: 'p-shore', at: 't' }, COMPANY_READER));
    expect(slotActions(requested, 'company', COMPANY_READER).cancelPass).toBe(true);
    const back = must(cancelPass(requested, 'company', COMPANY_READER));
    expect(slotState(back, 'company')).toBe('open');
    const signed = must(sign(s, 'company', COMPANY_READER));
    expect(code(reSignSlot(signed, { slotKey: 'company', id: 're-company', recordDigest: 'd2', at: 't3' }, COMPANY_READER))).toBe('ok');
    expect(code(removeSignature(signed, { slotKey: 'company', at: 't3' }, COMPANY_READER))).toBe('ok');
    expect(slotActions(signed, 'company', COMPANY_READER).remove).toBe(true);
  });
});

describe('slot actions (what the slot shows)', () => {
  it('eligible: "Sign as me" is primary, "Someone else signing?" secondary', () => {
    expect(slotActions(fresh(), 'hod', HOD)).toMatchObject({ signAsMe: true, someoneElse: true, passTo: true, primary: 'sign_as_me' });
  });

  it('not eligible: "Pass to…" is primary', () => {
    expect(slotActions(fresh(), 'hod', CREW)).toMatchObject({ signAsMe: false, someoneElse: true, passTo: true, primary: 'pass_to' });
  });

  it('waiting slots offer nothing; signed slots offer remove to the right people', () => {
    expect(slotActions(fresh(), 'master', MASTER)).toMatchObject({ signAsMe: false, passTo: false, someoneElse: false, primary: null });
    const s = must(sign(fresh(), 'hod', HOD));
    expect(slotActions(s, 'hod', HOD).remove).toBe(true);
    expect(slotActions(s, 'hod', CREW).remove).toBe(false);
  });

  it('requested slots offer cancel; on-behalf only where allowed', () => {
    const r = must(passSlotTo(fresh(), { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, CREW));
    expect(slotActions(r, 'hod', CREW)).toMatchObject({ cancelPass: true, passTo: false });
    const s = must(sign(fresh(), 'hod', HOD));
    expect(slotActions(s, 'master', actor('p-officer', { canSignOnBehalf: () => true })).signOnBehalf).toBe(true);
    expect(slotActions(s, 'master', actor('p-officer')).signOnBehalf).toBe(false);
    expect(slotActions(fresh(), 'hod', actor('p-officer', { canSignOnBehalf: () => true })).signOnBehalf).toBe(false);
  });

  it('impersonation hides every control', () => {
    expect(slotActions(fresh(), 'hod', actor('p-hod', { impersonating: true }))).toMatchObject({ signAsMe: false, someoneElse: false, passTo: false, primary: null });
  });

  it('canSign mirrors signSlot', () => {
    const input: SignInput = { slotKey: 'hod', id: 'x', method: 'verified', recordDigest: 'd', at: 't' };
    expect(canSign(fresh(), input, HOD)).toBe(true);
    expect(canSign(fresh(), input, CREW)).toBe(false);
  });

  it('sheet actions never mutate their input', () => {
    const s = fresh();
    const snapshot = JSON.stringify(s);
    sign(s, 'hod', HOD);
    passSlotTo(s, { slotKey: 'hod', toProfileId: 'p-hod2', at: 't' }, CREW);
    startNextCycle(s, 't');
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
