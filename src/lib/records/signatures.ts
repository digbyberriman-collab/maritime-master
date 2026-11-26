/**
 * Ordered signature slots (gap/08 §B, SIG3–SIG15).
 *
 * Pure state machine over one record's signature sheet. The database
 * (`sign_slot`, `pass_slot_to`, `remove_signature`, …) is the authority;
 * this module mirrors its rules so the UI shows the right buttons and
 * banners, and so both sides are tested against the same transitions:
 *
 *   waiting ──all earlier required slots signed (or same order group)──▶ open
 *   open ──Pass to X──▶ requested(X) ──Cancel──▶ open
 *   open | requested ──sign──▶ signed { verified | witnessed | on_behalf }
 *   signed ──covered content changes──▶ signed + stale   (derived from digests)
 *   signed + stale ──Re-sign (same signer)──▶ signed     (old row superseded)
 *   signed ──remove (latest in cycle only; reason once submitted)──▶ open
 *            (when the slot is required, every later slot returns to waiting)
 *   any ──new cycle (review / revert to draft / return to vessel)──▶ superseded
 *
 * Nothing here reads the clock: every action takes its `at` timestamp.
 *
 * Signature ids are the client's idempotency key (gap/08: retries must be
 * idempotent): signing again with the id of the live row on the same slot is
 * a no-op, and an id already used for any other row is refused.
 *
 * Once the company has acknowledged a cycle (or closed the record), that
 * cycle's vessel signatures cannot be removed until the company returns the
 * record (gap/05 "Signature slots"; SIG10; DECISIONS D-51). The lock belongs
 * to the acknowledged cycle, not to the record. The caller sets
 * `sheet.vesselLocked = vesselSignaturesLocked(envelope, sheet.cycle)` from
 * the record envelope (`companyStep.ts`; this module does not import it, so
 * the engines stay independent). A report-first initial-report
 * acknowledgement does not lock the final-review vessel slots signed after
 * it. Return to vessel, Not approved, Reopen and Initiate review start a new
 * cycle: `startNextCycle` clears the flag here, and the envelope's
 * `new_cycle` outcomes clear the acknowledgement, so re-deriving the flag
 * for the new cycle stays false until the company acknowledges that cycle.
 */
import { fail, ok, type EngineResult, type Party } from './types';

export type SignatureMethod = 'verified' | 'witnessed' | 'on_behalf';
export type SignerKind = 'crew' | 'shore' | 'visitor' | 'contractor';
export type SlotState = 'waiting' | 'open' | 'requested' | 'signed';

/** One slot of a kind's (or template's) signature template. */
export interface SlotDefinition {
  key: string;
  /** Role or office shown on the slot and in banners, e.g. "Master". */
  label: string;
  /** Signing order, 1 first. Slots that share an order sign in parallel. */
  order: number;
  party: Party;
  /** Required slots gate later slots and completion. Default true. */
  required?: boolean;
  /** Office the signer must hold on this vessel (server: `vessel_office_holders`). */
  officeKey?: string | null;
  /** Named people who may sign (e.g. the secretary and chairman named in a meeting header). */
  namedProfileIds?: readonly string[];
  /** Sections this signature covers; omitted = the whole record. */
  coversSections?: readonly string[];
  /**
   * "Someone else signing?" allowed. Default: vessel slots yes. Never on
   * company slots: a company sign-off is made by the company actor on their
   * own account (`validateSlotTemplate` refuses the flag there).
   */
  allowWitnessed?: boolean;
  /** A visitor or contractor may sign through the witnessed pad. Never on company slots. */
  allowVisitor?: boolean;
  /** May be signed on the office holder's behalf (e.g. voyage reports, Master slots). */
  allowOnBehalf?: boolean;
  /** An on-behalf signature must give a reason (e.g. passage plans: "Master or on-behalf with reason"). */
  onBehalfReasonRequired?: boolean;
  /** Separation of duties: the signer may not also have signed these slots; `'creator'` = the record's creator. */
  distinctFrom?: readonly string[];
}

/** A signature row (append-only; `removed*` / `supersededAt` set by actions). */
export interface SlotSignature {
  id: string;
  slotKey: string;
  cycle: number;
  /** Null for visitors and contractors. */
  signerProfileId: string | null;
  signerName: string;
  signerKind: SignerKind;
  method: SignatureMethod;
  /** The logged-in user who witnessed a `witnessed` signature. */
  witnessProfileId: string | null;
  /** Office signed for when `method = on_behalf`. */
  onBehalfOfOffice: string | null;
  /** On-behalf only: why the office holder did not sign (present on on-behalf rows). */
  onBehalfReason?: string | null;
  /** Digest of the covered content at signing time (computed in SQL). */
  recordDigest: string;
  signedAt: string;
  removedAt: string | null;
  removedBy: string | null;
  removalReason: string | null;
  supersededAt: string | null;
}

export interface PassRequest {
  profileId: string;
  at: string;
}

export interface SignatureSheet {
  /** Current review cycle, 1 first. */
  cycle: number;
  /** The template, sorted by order. */
  slots: readonly SlotDefinition[];
  /** Every signature row of every cycle, history included. */
  signatures: readonly SlotSignature[];
  /** Open "Pass to" requests in the current cycle, by slot key. */
  passes: Readonly<Record<string, PassRequest>>;
  /** Record creator (for `distinctFrom: ['creator']`). */
  creatorProfileId?: string | null;
  /** Once submitted, removing a signature needs a reason. */
  submitted?: boolean;
  /**
   * The company has acknowledged this cycle's vessel signatures (or closed
   * the record): vessel slots cannot be removed until the company returns
   * it. Set by the caller as `vesselSignaturesLocked(envelope, sheet.cycle)`
   * (see the header); `startNextCycle` clears it.
   */
  vesselLocked?: boolean;
}

/** The person acting in the UI. Eligibility is resolved by the caller (server: `slot_eligible`). */
export interface SignatureActor {
  profileId: string;
  name: string;
  /** May `profileId` sign `slot` (office on this vessel / named person / company actor + sign capability)? */
  isEligible: (slot: SlotDefinition, profileId: string) => boolean;
  /**
   * Write access on the record (server: `record_caller_may_write`; an
   * external viewer has none, D-214). Required (true), unless the actor is a
   * company actor, to pass a slot, cancel a pass, re-sign or remove a
   * signature, and always to witness a signature or sign on behalf. Absent =
   * no (fail closed).
   */
  canWrite?: boolean;
  /**
   * May `profileId` sign `slot` on the office holder's behalf (the module's
   * sign capability plus the rank tier the kind requires; server mirror:
   * `has_capability(<module>.sign)` and the tier check)? Absent = no: write
   * access alone never fills someone else's slot.
   */
  canSignOnBehalf?: (slot: SlotDefinition, profileId: string) => boolean;
  /** Master of this vessel: may remove vessel-slot signatures. */
  isMaster?: boolean;
  /** Owner / admin with reach: may remove company-slot signatures. */
  isCompanyActor?: boolean;
  /** "Login as" session: signing and removing are refused. */
  impersonating?: boolean;
}

export type SignatureErrorCode =
  | 'unknown_slot'
  | 'slot_waiting'
  | 'slot_signed'
  | 'not_open'
  | 'not_requested'
  | 'not_signed'
  | 'impersonating'
  | 'not_eligible'
  | 'no_write_access'
  | 'method_not_allowed'
  | 'visitor_not_allowed'
  | 'witness_is_signer'
  | 'separation_of_duties'
  | 'not_latest'
  | 'reason_required'
  | 'not_allowed'
  | 'not_stale'
  | 'different_signer'
  | 'needs_ceremony'
  | 'company_acknowledged'
  | 'invalid_input';

export type SignatureResult = EngineResult<SignatureSheet, SignatureErrorCode>;

// ─── Construction ─────────────────────────────────────────────────────────

/** Validate a slot template; throws on duplicate keys, bad orders or unsafe flags. */
export function validateSlotTemplate(slots: readonly SlotDefinition[]): void {
  const keys = new Set<string>();
  for (const slot of slots) {
    if (!slot.key || !/^[a-z][a-z0-9_]*$/.test(slot.key)) throw new Error(`Slot key must be snake_case: "${slot.key}"`);
    if (keys.has(slot.key)) throw new Error(`Duplicate slot key "${slot.key}"`);
    keys.add(slot.key);
    if (!Number.isInteger(slot.order) || slot.order < 1) throw new Error(`Slot "${slot.key}" needs a whole-number order ≥ 1`);
    if (slot.party === 'company' && slot.allowWitnessed) throw new Error(`Company slot "${slot.key}" cannot be witnessed`);
    if (slot.party === 'company' && slot.allowVisitor) throw new Error(`Company slot "${slot.key}" cannot allow visitors`);
    if (slot.party === 'company' && slot.allowOnBehalf) throw new Error(`Company slot "${slot.key}" cannot be signed on behalf`);
  }
  for (const slot of slots) {
    for (const other of slot.distinctFrom ?? []) {
      if (other !== 'creator' && !keys.has(other)) throw new Error(`Slot "${slot.key}" is distinct from unknown slot "${other}"`);
    }
  }
}

/** A fresh sheet (cycle 1, nothing signed) for a template. */
export function createSignatureSheet(
  slots: readonly SlotDefinition[],
  options: { creatorProfileId?: string | null; cycle?: number } = {},
): SignatureSheet {
  validateSlotTemplate(slots);
  return {
    cycle: options.cycle ?? 1,
    slots: [...slots].sort((a, b) => a.order - b.order),
    signatures: [],
    passes: {},
    creatorProfileId: options.creatorProfileId ?? null,
    submitted: false,
  };
}

// ─── Derived state ────────────────────────────────────────────────────────

const isRequired = (slot: SlotDefinition) => slot.required !== false;
const allowsWitnessed = (slot: SlotDefinition) => slot.party === 'vessel' && (slot.allowWitnessed ?? true);

export function getSlot(sheet: SignatureSheet, slotKey: string): SlotDefinition | undefined {
  return sheet.slots.find((s) => s.key === slotKey);
}

/** The live signature on a slot in the current cycle, if any. */
export function activeSignature(sheet: SignatureSheet, slotKey: string): SlotSignature | undefined {
  return sheet.signatures.find(
    (sig) => sig.slotKey === slotKey && sig.cycle === sheet.cycle && !sig.removedAt && !sig.supersededAt,
  );
}

/** Live signatures of the current cycle. */
export function activeSignatures(sheet: SignatureSheet): SlotSignature[] {
  return sheet.signatures.filter((sig) => sig.cycle === sheet.cycle && !sig.removedAt && !sig.supersededAt);
}

/** waiting / open / requested / signed for one slot. */
export function slotState(sheet: SignatureSheet, slotKey: string): SlotState {
  const slot = getSlot(sheet, slotKey);
  if (!slot) throw new Error(`Unknown slot "${slotKey}"`);
  if (activeSignature(sheet, slotKey)) return 'signed';
  const earlierUnsigned = sheet.slots.some(
    (s) => s.order < slot.order && isRequired(s) && !activeSignature(sheet, s.key),
  );
  if (earlierUnsigned) return 'waiting';
  return sheet.passes[slotKey] ? 'requested' : 'open';
}

/**
 * Stale = signed over content that has changed since: the signature's digest
 * differs from the current digest of the sections the slot covers.
 * `currentDigest` is the server's `record_content_digest(envelope, sections)`.
 */
export function isSignatureStale(sheet: SignatureSheet, slotKey: string, currentDigest: string): boolean {
  const sig = activeSignature(sheet, slotKey);
  return Boolean(sig) && sig.recordDigest !== currentDigest;
}

/** Slots whose live signature is stale. `digestFor` returns the current digest for a slot's sections. */
export function staleSlots(sheet: SignatureSheet, digestFor: (slot: SlotDefinition) => string): SlotDefinition[] {
  return sheet.slots.filter((slot) => isSignatureStale(sheet, slot.key, digestFor(slot)));
}

/** True when a required signature is stale: submit-to-company and close are blocked (STORM rule). */
export function hasStaleRequiredSignatures(sheet: SignatureSheet, digestFor: (slot: SlotDefinition) => string): boolean {
  return staleSlots(sheet, digestFor).some(isRequired);
}

export interface SheetCompletion {
  requiredTotal: number;
  requiredSigned: number;
  /** Every required slot is signed. */
  complete: boolean;
  /** Slots that can be signed now. */
  openSlots: SlotDefinition[];
  /** The required slots the record is waiting on (open or requested, not signed). */
  waitingOn: SlotDefinition[];
}

export function sheetCompletion(sheet: SignatureSheet): SheetCompletion {
  const required = sheet.slots.filter(isRequired);
  const requiredSigned = required.filter((s) => activeSignature(sheet, s.key)).length;
  const openSlots = sheet.slots.filter((s) => {
    const state = slotState(sheet, s.key);
    return state === 'open' || state === 'requested';
  });
  return {
    requiredTotal: required.length,
    requiredSigned,
    complete: requiredSigned === required.length,
    openSlots,
    waitingOn: openSlots.filter(isRequired),
  };
}

/** Every required slot of one party is signed (e.g. the last vessel slot triggers submit-to-company). */
export function partyComplete(sheet: SignatureSheet, party: Party): boolean {
  return sheet.slots.filter((s) => s.party === party && isRequired(s)).every((s) => activeSignature(sheet, s.key));
}

/** STORM banner copy: "Waiting for the Master's signature — sign in order", or null. */
export function orderBanner(sheet: SignatureSheet): string | null {
  const { waitingOn, complete } = sheetCompletion(sheet);
  if (complete || waitingOn.length === 0) return null;
  const labels = waitingOn.map((s) => `the ${s.label}'s`);
  const who = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `Waiting for ${who} signature${labels.length > 1 ? 's' : ''} — sign in order`;
}

// ─── Checks ───────────────────────────────────────────────────────────────

export interface SignInput {
  slotKey: string;
  /** New signature row id (client idempotency key). */
  id: string;
  method: SignatureMethod;
  /** Current digest of the covered content (from the server). */
  recordDigest: string;
  at: string;
  /**
   * Witnessed only: who signs on the device. A crew member (profileId) or a
   * visitor / contractor (profileId null + name + kind).
   */
  signer?: { profileId: string | null; name: string; kind?: SignerKind };
  /** On-behalf only: the office signed for (defaults to the slot's office). */
  onBehalfOfOffice?: string | null;
  /** On-behalf only: why the office holder is not signing (required where the slot says so). */
  reason?: string | null;
}

function signerFor(input: SignInput, actor: SignatureActor): { profileId: string | null; name: string; kind: SignerKind } {
  if (input.method === 'witnessed' && input.signer) {
    const kind = input.signer.kind ?? (input.signer.profileId ? 'crew' : 'visitor');
    return { profileId: input.signer.profileId, name: input.signer.name, kind };
  }
  return { profileId: actor.profileId, name: actor.name, kind: 'crew' };
}

function slotsConflict(a: SlotDefinition, b: SlotDefinition): boolean {
  return (a.distinctFrom ?? []).includes(b.key) || (b.distinctFrom ?? []).includes(a.key);
}

/** Why `actor` may not sign now, or null when they may. Mirrors `sign_slot()` guards. */
export function signBlocker(sheet: SignatureSheet, input: SignInput, actor: SignatureActor): { code: SignatureErrorCode; message: string } | null {
  const slot = getSlot(sheet, input.slotKey);
  if (!slot) return { code: 'unknown_slot', message: 'That signature slot does not exist on this record.' };
  if (actor.impersonating) return { code: 'impersonating', message: 'Signatures cannot be made while acting as another user.' };
  if (!input.recordDigest) return { code: 'invalid_input', message: 'The record digest is missing.' };

  const state = slotState(sheet, slot.key);
  if (state === 'signed') return { code: 'slot_signed', message: `The ${slot.label} slot is already signed.` };
  if (state === 'waiting') {
    const earlier = sheet.slots.find((s) => s.order < slot.order && isRequired(s) && !activeSignature(sheet, s.key));
    return { code: 'slot_waiting', message: `${slot.label} must wait for the ${earlier?.label ?? 'earlier'} signature first.` };
  }

  const signer = signerFor(input, actor);
  switch (input.method) {
    case 'verified':
      if (!actor.isEligible(slot, actor.profileId)) {
        return { code: 'not_eligible', message: `You can't sign as ${slot.label} on this record.` };
      }
      break;
    case 'witnessed':
      if (!allowsWitnessed(slot)) return { code: 'method_not_allowed', message: `The ${slot.label} slot can't be signed on someone else's behalf on this device.` };
      if (!actor.canWrite) return { code: 'no_write_access', message: 'You need write access to this record to witness a signature.' };
      if (!input.signer || !input.signer.name?.trim()) return { code: 'invalid_input', message: 'Choose who is signing.' };
      if (signer.profileId === actor.profileId) return { code: 'witness_is_signer', message: 'Signing yourself? Use "Sign as me".' };
      if (signer.profileId === null) {
        if (!slot.allowVisitor) return { code: 'visitor_not_allowed', message: `A visitor or contractor can't sign the ${slot.label} slot.` };
      } else if (!actor.isEligible(slot, signer.profileId)) {
        return { code: 'not_eligible', message: `${signer.name} can't sign as ${slot.label} on this record.` };
      }
      break;
    case 'on_behalf':
      if (!slot.allowOnBehalf) return { code: 'method_not_allowed', message: `The ${slot.label} slot can't be signed on someone's behalf.` };
      if (!actor.canWrite) return { code: 'no_write_access', message: 'You need write access to this record to sign on behalf.' };
      if (!actor.canSignOnBehalf?.(slot, actor.profileId)) {
        return { code: 'not_eligible', message: "You can't sign on the " + slot.label + "'s behalf on this record." };
      }
      if (slot.onBehalfReasonRequired && !input.reason?.trim()) {
        return { code: 'reason_required', message: `Say why you are signing on the ${slot.label}'s behalf.` };
      }
      break;
    default:
      return { code: 'invalid_input', message: 'Unknown signing method.' };
  }

  // Separation of duties (e.g. AO ≠ CP ≠ permit creator).
  if (signer.profileId) {
    if ((slot.distinctFrom ?? []).includes('creator') && sheet.creatorProfileId && signer.profileId === sheet.creatorProfileId) {
      return { code: 'separation_of_duties', message: `The person who created this record can't sign as ${slot.label}.` };
    }
    for (const sig of activeSignatures(sheet)) {
      if (sig.signerProfileId !== signer.profileId) continue;
      const other = getSlot(sheet, sig.slotKey);
      if (other && slotsConflict(slot, other)) {
        return { code: 'separation_of_duties', message: `The same person can't sign as both ${other.label} and ${slot.label}.` };
      }
    }
  }
  return null;
}

/** Can `actor` sign `slotKey` with `method` now? */
export function canSign(sheet: SignatureSheet, input: SignInput, actor: SignatureActor): boolean {
  return signBlocker(sheet, input, actor) === null;
}

// ─── Actions ──────────────────────────────────────────────────────────────

const withPassCleared = (passes: Readonly<Record<string, PassRequest>>, keys: readonly string[]) => {
  const next = { ...passes };
  for (const k of keys) delete next[k];
  return next;
};

const isLive = (sheet: SignatureSheet, sig: SlotSignature) => sig.cycle === sheet.cycle && !sig.removedAt && !sig.supersededAt;

/**
 * Idempotency on the client-generated id: `'replay'` when `id` is the live row
 * on `slotKey` (the earlier attempt went through), `'conflict'` when any other
 * row already has it, null when it is new.
 */
function idReuse(sheet: SignatureSheet, id: string, slotKey: string): 'replay' | 'conflict' | null {
  const existing = sheet.signatures.find((s) => s.id === id);
  if (!existing) return null;
  return existing.slotKey === slotKey && isLive(sheet, existing) ? 'replay' : 'conflict';
}
const ID_CONFLICT = 'That signature id is already used on this record.';

/**
 * The vessel-party write gate of pass, cancel-pass, re-sign and remove
 * (SQL: `is_company_actor(...) OR record_caller_may_write(...)`; D-214): a
 * reader who may view the record (an external viewer) changes nothing.
 */
const NO_WRITE_ACCESS = 'You can view this record but not change it.';
const mayWrite = (actor: SignatureActor): boolean => actor.canWrite === true || actor.isCompanyActor === true;

/** Sign a slot. Re-sending the same id for the same slot is a no-op. */
export function signSlot(sheet: SignatureSheet, input: SignInput, actor: SignatureActor): SignatureResult {
  const reuse = idReuse(sheet, input.id, input.slotKey);
  if (reuse === 'replay') return ok(sheet);
  if (reuse === 'conflict') return fail('invalid_input', ID_CONFLICT);
  const blocker = signBlocker(sheet, input, actor);
  if (blocker) return fail(blocker.code, blocker.message);
  const slot = getSlot(sheet, input.slotKey) as SlotDefinition;
  const signer = signerFor(input, actor);
  const signature: SlotSignature = {
    id: input.id,
    slotKey: slot.key,
    cycle: sheet.cycle,
    signerProfileId: signer.profileId,
    signerName: signer.name,
    signerKind: signer.kind,
    method: input.method,
    witnessProfileId: input.method === 'witnessed' ? actor.profileId : null,
    onBehalfOfOffice: input.method === 'on_behalf' ? input.onBehalfOfOffice ?? slot.officeKey ?? slot.label : null,
    ...(input.method === 'on_behalf' ? { onBehalfReason: input.reason?.trim() || null } : {}),
    recordDigest: input.recordDigest,
    signedAt: input.at,
    removedAt: null,
    removedBy: null,
    removalReason: null,
    supersededAt: null,
  };
  return ok({ ...sheet, signatures: [...sheet.signatures, signature], passes: withPassCleared(sheet.passes, [slot.key]) });
}

/**
 * Pass an open slot to an eligible person (creates a sign request). Mirrors
 * `record_pass_slot()`: impersonation, then write access (a company actor
 * or `canWrite`; D-214), then an open slot and an eligible person.
 */
export function passSlotTo(
  sheet: SignatureSheet,
  input: { slotKey: string; toProfileId: string; at: string },
  actor: SignatureActor,
): SignatureResult {
  const slot = getSlot(sheet, input.slotKey);
  if (!slot) return fail('unknown_slot', 'That signature slot does not exist on this record.');
  if (actor.impersonating) return fail('impersonating', 'Signature requests cannot be made while acting as another user.');
  if (!mayWrite(actor)) return fail('no_write_access', NO_WRITE_ACCESS);
  const state = slotState(sheet, slot.key);
  if (state === 'requested') return fail('not_open', `The ${slot.label} slot is already passed to someone. Cancel that first.`);
  if (state !== 'open') return fail('not_open', `The ${slot.label} slot can't be passed on yet.`);
  if (!actor.isEligible(slot, input.toProfileId)) return fail('not_eligible', `That person can't sign as ${slot.label} on this record.`);
  return ok({ ...sheet, passes: { ...sheet.passes, [slot.key]: { profileId: input.toProfileId, at: input.at } } });
}

/**
 * Cancel a pass (or the person declined): requested → open. Mirrors
 * `record_cancel_pass()`: impersonation, then write access (a company actor
 * or `canWrite`; D-214), then a requested slot.
 */
export function cancelPass(sheet: SignatureSheet, slotKey: string, actor: SignatureActor): SignatureResult {
  const slot = getSlot(sheet, slotKey);
  if (!slot) return fail('unknown_slot', 'That signature slot does not exist on this record.');
  if (actor.impersonating) return fail('impersonating', 'Signature requests cannot be changed while acting as another user.');
  if (!mayWrite(actor)) return fail('no_write_access', NO_WRITE_ACCESS);
  if (slotState(sheet, slotKey) !== 'requested') return fail('not_requested', `The ${slot.label} slot has not been passed to anyone.`);
  return ok({ ...sheet, passes: withPassCleared(sheet.passes, [slotKey]) });
}

/**
 * Why `actor` may not remove the signature on `slotKey`, or null. Mirrors
 * `record_remove_signature()`: impersonation, then write access (a company
 * actor or `canWrite`; D-214: an external viewer never removes, not even
 * their own signature or as the Master), then the live signature, the D-51
 * lock, reverse order, who may remove and the reason.
 */
export function removeBlocker(
  sheet: SignatureSheet,
  input: { slotKey: string; reason?: string | null },
  actor: SignatureActor,
): { code: SignatureErrorCode; message: string } | null {
  const slot = getSlot(sheet, input.slotKey);
  if (!slot) return { code: 'unknown_slot', message: 'That signature slot does not exist on this record.' };
  if (actor.impersonating) return { code: 'impersonating', message: 'Signatures cannot be removed while acting as another user.' };
  if (!mayWrite(actor)) return { code: 'no_write_access', message: NO_WRITE_ACCESS };
  const sig = activeSignature(sheet, slot.key);
  if (!sig) return { code: 'not_signed', message: `The ${slot.label} slot is not signed.` };
  if (sheet.vesselLocked && slot.party === 'vessel') {
    return {
      code: 'company_acknowledged',
      message: 'The company has acknowledged this record. Ask the company to return it to the vessel before removing a vessel signature.',
    };
  }

  const laterSigned = activeSignatures(sheet).some((s) => (getSlot(sheet, s.slotKey)?.order ?? 0) > slot.order);
  if (laterSigned) return { code: 'not_latest', message: 'Signatures are removed in reverse order. Remove the later signatures first.' };

  // The signer, never the witness alone (gap/08 §B). A visitor row has no
  // signer profile, so it never matches an actor without one.
  const isSigner = sig.signerProfileId !== null && sig.signerProfileId === actor.profileId;
  const mayRemove = isSigner || (slot.party === 'vessel' && actor.isMaster) || (slot.party === 'company' && actor.isCompanyActor);
  if (!mayRemove) return { code: 'not_allowed', message: 'Only the signer, the Master (vessel slots) or the company (company slots) can remove this signature.' };

  if (sheet.submitted && !input.reason?.trim()) return { code: 'reason_required', message: 'Give a reason for removing a signature from a submitted record.' };
  return null;
}

/**
 * Remove the latest signature (reverse order only). When the slot is
 * required, later slots return to waiting and lose their pass requests; an
 * optional slot's removal leaves later slots (and their passes) as they were.
 */
export function removeSignature(
  sheet: SignatureSheet,
  input: { slotKey: string; reason?: string | null; at: string },
  actor: SignatureActor,
): SignatureResult {
  const blocker = removeBlocker(sheet, input, actor);
  if (blocker) return fail(blocker.code, blocker.message);
  const slot = getSlot(sheet, input.slotKey) as SlotDefinition;
  const sig = activeSignature(sheet, slot.key) as SlotSignature;
  // By identity, not id: exactly this row changes.
  const signatures = sheet.signatures.map((s) =>
    s === sig ? { ...s, removedAt: input.at, removedBy: actor.profileId, removalReason: input.reason?.trim() || null } : s,
  );
  const next: SignatureSheet = { ...sheet, signatures };
  // slotState checks "waiting" before it looks at passes, so the old passes on `next` do no harm here.
  const nowWaiting = sheet.slots.filter((s) => s.order > slot.order && slotState(next, s.key) === 'waiting').map((s) => s.key);
  return ok({ ...next, passes: withPassCleared(sheet.passes, nowWaiting) });
}

/**
 * Re-sign a stale signature in one tap: same signer, new row with the
 * current digest, old row superseded. Witnessed signatures need a new
 * ceremony instead. Mirrors `record_resign_slot()`: id reuse, impersonation,
 * then write access (a company actor or `canWrite`; D-214) for every method.
 */
export function reSignSlot(
  sheet: SignatureSheet,
  input: { slotKey: string; id: string; recordDigest: string; at: string },
  actor: SignatureActor,
): SignatureResult {
  const reuse = idReuse(sheet, input.id, input.slotKey);
  if (reuse === 'replay') return ok(sheet);
  if (reuse === 'conflict') return fail('invalid_input', ID_CONFLICT);
  const slot = getSlot(sheet, input.slotKey);
  if (!slot) return fail('unknown_slot', 'That signature slot does not exist on this record.');
  if (actor.impersonating) return fail('impersonating', 'Signatures cannot be made while acting as another user.');
  // Write access before anything about the signature, for every method
  // (record_resign_slot's order; D-214).
  if (!mayWrite(actor)) return fail('no_write_access', NO_WRITE_ACCESS);
  const sig = activeSignature(sheet, slot.key);
  if (!sig) return fail('not_signed', `The ${slot.label} slot is not signed.`);
  if (sig.recordDigest === input.recordDigest) return fail('not_stale', 'This signature already covers the current content.');
  if (sig.method === 'witnessed') return fail('needs_ceremony', 'A witnessed signature is re-signed through a new witnessed ceremony.');
  if (sig.method === 'verified' && sig.signerProfileId !== actor.profileId) return fail('different_signer', 'Only the person who signed can re-sign.');
  if (sig.method === 'on_behalf' && sig.signerProfileId !== actor.profileId) return fail('different_signer', 'Only the person who signed can re-sign.');
  if (sig.method === 'verified' && !actor.isEligible(slot, actor.profileId)) return fail('not_eligible', `You can no longer sign as ${slot.label} on this record.`);
  if (sig.method === 'on_behalf' && !actor.canSignOnBehalf?.(slot, actor.profileId)) {
    return fail('not_eligible', `You can no longer sign on the ${slot.label}'s behalf on this record.`);
  }

  // By identity, not id: exactly this row is superseded.
  const superseded = sheet.signatures.map((s) => (s === sig ? { ...s, supersededAt: input.at } : s));
  const fresh: SlotSignature = { ...sig, id: input.id, recordDigest: input.recordDigest, signedAt: input.at, supersededAt: null };
  return ok({ ...sheet, signatures: [...superseded, fresh] });
}

/**
 * Start the next cycle (Initiate review, Revert to draft, Return to vessel):
 * live signatures of the current cycle are superseded, passes cleared, and
 * the same template opens again for cycle n + 1.
 */
export function startNextCycle(sheet: SignatureSheet, at: string): SignatureSheet {
  return {
    ...sheet,
    cycle: sheet.cycle + 1,
    signatures: sheet.signatures.map((s) =>
      s.cycle === sheet.cycle && !s.removedAt && !s.supersededAt ? { ...s, supersededAt: at } : s,
    ),
    passes: {},
    vesselLocked: false,
  };
}

// ─── What the slot shows ──────────────────────────────────────────────────

export interface SlotActions {
  /** Primary button when eligible: "Sign as <me>". */
  signAsMe: boolean;
  /** Secondary: "Someone else signing?" (witnessed ceremony). */
  someoneElse: boolean;
  /** "Pass to…" (primary when not eligible). */
  passTo: boolean;
  cancelPass: boolean;
  signOnBehalf: boolean;
  remove: boolean;
  primary: 'sign_as_me' | 'pass_to' | null;
}

/** Which controls a slot offers `actor` right now (gap/08 §B "Signing ceremony"). */
export function slotActions(sheet: SignatureSheet, slotKey: string, actor: SignatureActor): SlotActions {
  const slot = getSlot(sheet, slotKey);
  const none: SlotActions = { signAsMe: false, someoneElse: false, passTo: false, cancelPass: false, signOnBehalf: false, remove: false, primary: null };
  if (!slot) return none;
  const state = slotState(sheet, slotKey);
  const probe = (method: SignatureMethod, signer?: SignInput['signer']): SignInput => ({ slotKey, id: 'probe', method, recordDigest: 'probe', at: '', signer });
  const signable = state === 'open' || state === 'requested';
  const signAsMe = signable && canSign(sheet, probe('verified'), actor);
  const someoneElse = signable && !actor.impersonating && allowsWitnessed(slot) && Boolean(actor.canWrite);
  // The office holder signs as themselves, never on their own behalf.
  const signOnBehalf = signable && !signAsMe && canSign(sheet, { ...probe('on_behalf'), reason: 'probe' }, actor);
  // Pass and cancel need write access (or a company actor), as the server
  // asks (D-214): a reader is never offered a control the server refuses.
  const writes = !actor.impersonating && mayWrite(actor);
  const passTo = state === 'open' && writes;
  return {
    signAsMe,
    someoneElse,
    passTo,
    cancelPass: state === 'requested' && writes,
    signOnBehalf,
    remove: state === 'signed' && removeBlocker(sheet, { slotKey, reason: 'probe' }, actor) === null,
    primary: signAsMe ? 'sign_as_me' : passTo ? 'pass_to' : null,
  };
}
