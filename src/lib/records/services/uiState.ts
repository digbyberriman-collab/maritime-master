/**
 * What a record page shows, built from what the server returned and the
 * frozen C3 libraries (Phase 2 spec §B.6; MASTER-PROMPT §4): which actions
 * the action bar offers (`availableActions` over `envelopeStateForKind`),
 * the whose-move chip (`whoseMoveLabel` on the server's `whose_move`), the
 * signing-order banner (`orderBanner`) and stale-signature warnings.
 *
 * Nothing here decides a status. Buttons are a hint: the server re-checks
 * every action (`record_transition`), derives every guard itself, and the
 * page shows its answer. Where the server's slot states and the library
 * would disagree, the helper says nothing rather than contradict the
 * server.
 */
import { availableActions, closeAsOptions, type ClosedAs, type EnvelopeAction, type EnvelopeState } from '../companyStep';
import { envelopeStateForKind, type RecordKind } from '../registry';
import { orderBanner, slotState, type SignatureSheet, type SlotDefinition, type SlotSignature } from '../signatures';
import { whoseMoveLabel } from '../whoseMove';
import type { Party } from '../types';
import type { RecordSignatureSlotStateRow } from './db.pending';
import type { EnvelopeSummary } from './envelopes';

/** The envelope machine's state for a server row of a registered kind. */
export function envelopeStateFromRow(kind: RecordKind, envelope: EnvelopeSummary): EnvelopeState {
  return envelopeStateForKind(kind, {
    status: envelope.status,
    closedBy: envelope.closed_by_kind,
    companyAcknowledged: envelope.company_acknowledged,
    cycle: envelope.current_cycle,
    acknowledgedCycle: envelope.acknowledged_cycle,
    initialReportAcknowledged: envelope.initial_report_acknowledged,
    version: envelope.version,
  });
}

/**
 * The actions to offer `party` (the server decides which party the caller
 * acts as; pages pass what they know, e.g. company actor or vessel member).
 * `vessel_sign` is never a button: signing the last vessel slot runs it.
 */
export function envelopeActions(kind: RecordKind, envelope: EnvelopeSummary, party: Party): Exclude<EnvelopeAction, 'vessel_sign'>[] {
  return availableActions(envelopeStateFromRow(kind, envelope), party).filter(
    (a): a is Exclude<EnvelopeAction, 'vessel_sign'> => a !== 'vessel_sign',
  );
}

/** The "Close as" choices for the company, in display order. */
export function envelopeCloseAsOptions(kind: RecordKind, envelope: EnvelopeSummary): ClosedAs[] {
  return closeAsOptions(envelopeStateFromRow(kind, envelope));
}

/** The header chip: the server's whose-move, in STORM words. */
export function envelopeWhoseMoveLabel(envelope: Pick<EnvelopeSummary, 'whose_move' | 'status'>): string {
  return whoseMoveLabel(envelope.whose_move, envelope.status);
}

/**
 * A signature sheet that reproduces the server's slot states for one cycle:
 * a slot with a live signature carries a stand-in signature (only its
 * presence is read), a passed slot a pass. Null when the rows span several
 * cycles or the library would derive a different state for any slot than
 * the server returned.
 */
export function sheetFromSlotStates(rows: readonly RecordSignatureSlotStateRow[]): SignatureSheet | null {
  if (rows.length === 0) return null;
  const cycle = rows[0].cycle;
  if (rows.some((r) => r.cycle !== cycle)) return null;
  const slots: SlotDefinition[] = [...rows]
    .sort((a, b) => a.order_no - b.order_no)
    .map((r) => ({ key: r.slot_key, label: r.label, order: r.order_no, party: r.party, required: r.required }));
  const signatures: SlotSignature[] = rows
    .filter((r) => r.live_signature_id)
    .map((r) => ({
      id: r.live_signature_id as string,
      slotKey: r.slot_key,
      cycle,
      signerProfileId: null,
      signerName: '',
      signerKind: 'crew',
      method: 'verified',
      witnessProfileId: null,
      onBehalfOfOffice: null,
      recordDigest: '',
      signedAt: '',
      removedAt: null,
      removedBy: null,
      removalReason: null,
      supersededAt: null,
    }));
  const passes: SignatureSheet['passes'] = Object.fromEntries(
    rows.filter((r) => r.passed_to_profile_id && r.passed_at).map((r) => [r.slot_key, { profileId: r.passed_to_profile_id as string, at: r.passed_at as string }]),
  );
  const sheet: SignatureSheet = { cycle, slots, signatures, passes };
  return rows.every((r) => slotState(sheet, r.slot_key) === r.state) ? sheet : null;
}

/** "Waiting for the Master's signature — sign in order", or null (complete, nothing waiting, or states the library cannot reproduce). */
export function signingOrderBanner(rows: readonly RecordSignatureSlotStateRow[]): string | null {
  const sheet = sheetFromSlotStates(rows);
  return sheet ? orderBanner(sheet) : null;
}

/** Signed slots whose content changed after signing (the server's `stale`), required ones first. */
export function staleSlotRows(rows: readonly RecordSignatureSlotStateRow[]): RecordSignatureSlotStateRow[] {
  return rows.filter((r) => r.state === 'signed' && r.stale === true).sort((a, b) => Number(b.required) - Number(a.required) || a.order_no - b.order_no);
}

/** The stale-signature warning for the record page, or null. */
export function staleSignatureWarning(rows: readonly RecordSignatureSlotStateRow[]): string | null {
  const stale = staleSlotRows(rows);
  if (stale.length === 0) return null;
  const names = stale.map((r) => r.label);
  const who = names.length === 1 ? `The ${names[0]} signature is` : `The ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} signatures are`;
  const blocking = stale.some((r) => r.required);
  return `${who} out of date: the record changed after signing.${blocking ? ' Re-sign before it can go to the company or close.' : ' Re-sign to confirm the change.'}`;
}
