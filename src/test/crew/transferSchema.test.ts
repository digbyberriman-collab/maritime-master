/**
 * The transfer wizard's forms (X1-11): the details rules mirror
 * transfer_crew_start (dates, the same or a new position, notes), the
 * acknowledgements, decline and cancel reasons, and where a server refusal
 * lands (its HINT).
 */
import { describe, expect, it } from 'vitest';
import {
  TRANSFER_MESSAGES,
  acknowledgeSchema,
  buildCancelSchema,
  buildTransferDetailsSchema,
  declineSchema,
  toAcknowledgePayload,
  toStartArgs,
  transferDetailsDefaults,
  transferFieldFor,
  type TransferDetailsValues,
} from '@/modules/crew/lib/transferSchema';
import { TRANSFER_LIMITS } from '@/modules/crew/lib/transfer';

const TODAY = '2026-11-27';
const schema = buildTransferDetailsSchema({
  today: TODAY,
  fromVesselId: 'v-dra',
  joinDate: '2026-11-01',
  hasSamePosition: (id) => id === 'v-hyd',
});

const valid: TransferDetailsValues = {
  toVesselId: 'v-hyd',
  positionMode: 'same',
  toPositionId: null,
  signOffDate: '2026-12-01',
  signOnDate: '2026-12-02',
  notes: null,
};

const messagesOf = (input: Record<string, unknown>) => {
  const r = schema.safeParse({ ...valid, ...input });
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('the details', () => {
  it('accepts a valid transfer and trims the notes', () => {
    const r = schema.safeParse({ ...valid, notes: '  relieving the bosun  ' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.notes).toBe('relieving the bosun');
    expect(schema.safeParse({ ...valid, notes: '   ' }).success && schema.parse({ ...valid, notes: '   ' }).notes).toBeNull();
  });

  it('needs another vessel', () => {
    expect(messagesOf({ toVesselId: '' })).toMatchObject({ toVesselId: TRANSFER_MESSAGES.destination });
    expect(messagesOf({ toVesselId: 'v-dra' })).toMatchObject({ toVesselId: TRANSFER_MESSAGES.sameVessel });
  });

  it('needs a position: the same one only where the destination has it', () => {
    expect(messagesOf({ positionMode: 'new', toPositionId: null })).toMatchObject({ toPositionId: TRANSFER_MESSAGES.position });
    expect(messagesOf({ positionMode: 'new', toPositionId: 'pos-bosun' })).toEqual({});
    expect(messagesOf({ toVesselId: 'v-other', positionMode: 'same' })).toMatchObject({ positionMode: TRANSFER_MESSAGES.samePositionMissing });
    expect(messagesOf({ toVesselId: 'v-other', positionMode: 'new', toPositionId: 'pos-x' })).toEqual({});
  });

  it('keeps the sign-off within the server window and after joining', () => {
    expect(messagesOf({ signOffDate: '2026-11-01', signOnDate: '2026-11-02' })).toEqual({});
    expect(messagesOf({ signOffDate: '2026-10-26', signOnDate: '2026-10-27' })).toMatchObject({ signOffDate: TRANSFER_MESSAGES.signOffTooEarly });
    const lastDay = '2027-11-27';
    expect(messagesOf({ signOffDate: lastDay, signOnDate: lastDay })).toEqual({});
    expect(messagesOf({ signOffDate: '2027-11-28', signOnDate: '2027-11-28' })).toMatchObject({ signOffDate: TRANSFER_MESSAGES.signOffTooLate });
    expect(messagesOf({ signOffDate: '2026-10-31', signOnDate: '2026-11-01' })).toMatchObject({ signOffDate: TRANSFER_MESSAGES.signOffBeforeJoin });
    const noJoin = buildTransferDetailsSchema({ today: TODAY, fromVesselId: 'v-dra', joinDate: null, hasSamePosition: () => true });
    expect(noJoin.safeParse({ ...valid, signOffDate: '2026-10-31', signOnDate: '2026-11-01' }).success).toBe(true);
  });

  it('signs on the same day or within the gap', () => {
    expect(messagesOf({ signOnDate: '2026-12-01' })).toEqual({});
    expect(messagesOf({ signOnDate: '2026-11-30' })).toMatchObject({ signOnDate: TRANSFER_MESSAGES.signOnBeforeSignOff });
    expect(messagesOf({ signOnDate: '2027-03-01' })).toEqual({});
    expect(messagesOf({ signOnDate: '2027-03-02' })).toMatchObject({ signOnDate: TRANSFER_MESSAGES.gapTooLong });
  });

  it('needs both dates and bounds the notes', () => {
    expect(Object.keys(messagesOf({ signOffDate: '' }))).toContain('signOffDate');
    expect(Object.keys(messagesOf({ signOnDate: '' }))).toContain('signOnDate');
    expect(messagesOf({ notes: 'x'.repeat(TRANSFER_LIMITS.notesMax + 1) })).toMatchObject({ notes: TRANSFER_MESSAGES.notes });
    expect(messagesOf({ notes: 'x'.repeat(TRANSFER_LIMITS.notesMax) })).toEqual({});
  });

  it('starts from today to tomorrow on the same position, and keeps a prefill', () => {
    expect(transferDetailsDefaults(TODAY)).toEqual({ toVesselId: '', positionMode: 'same', toPositionId: null, signOffDate: TODAY, signOnDate: '2026-11-28', notes: '' });
    expect(transferDetailsDefaults(TODAY, { toVesselId: 'v-hyd', signOnDate: '2026-12-03' })).toMatchObject({ toVesselId: 'v-hyd', signOnDate: '2026-12-03' });
  });

  it('sends the same position as NULL (the server resolves it on the destination)', () => {
    expect(toStartArgs('p-1', 'v-dra', { ...valid, toPositionId: 'ignored' })).toEqual({
      p_profile_id: 'p-1',
      p_from_vessel_id: 'v-dra',
      p_to_vessel_id: 'v-hyd',
      p_to_position_id: null,
      p_sign_off_date: '2026-12-01',
      p_sign_on_date: '2026-12-02',
      p_notes: null,
    });
    expect(toStartArgs('p-1', 'v-dra', { ...valid, positionMode: 'new', toPositionId: 'pos-bosun', notes: 'n' })).toMatchObject({
      p_to_position_id: 'pos-bosun',
      p_notes: 'n',
    });
  });
});

describe('the acknowledgements', () => {
  it('needs every item ticked', () => {
    const r = acknowledgeSchema.safeParse({ items: [{ key: 'a', ticked: true, note: '' }, { key: 'b', ticked: false, note: '' }] });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.map((i) => [i.path.join('.'), i.message])).toEqual([['items.1.ticked', TRANSFER_MESSAGES.tick]]);
    expect(acknowledgeSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it('bounds each note', () => {
    const r = acknowledgeSchema.safeParse({ items: [{ key: 'a', ticked: true, note: 'x'.repeat(TRANSFER_LIMITS.ackNoteMax + 1) }] });
    expect(!r.success && r.error.issues[0]?.message).toBe(TRANSFER_MESSAGES.ackNote);
  });

  it('sends the ticked items with their notes', () => {
    expect(
      toAcknowledgePayload([
        { key: 'a', ticked: true, note: '  seen  ' },
        { key: 'b', ticked: true, note: null },
        { key: 'c', ticked: false, note: 'not sent' },
        { ticked: true },
      ]),
    ).toEqual([{ key: 'a', acknowledged: true, note: 'seen' }, { key: 'b', acknowledged: true }]);
  });
});

describe('decline and cancel', () => {
  it('a decline needs a reason', () => {
    expect(declineSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(declineSchema.safeParse({ reason: 'Short-handed on HYDRA' }).success).toBe(true);
    expect(declineSchema.safeParse({ reason: 'x'.repeat(TRANSFER_LIMITS.reasonMax + 1) }).success).toBe(false);
  });

  it('a cancellation needs a reason once submitted', () => {
    expect(buildCancelSchema('draft').safeParse({ reason: '' }).success).toBe(true);
    expect(buildCancelSchema('review').safeParse({ reason: '' }).success).toBe(true);
    expect(buildCancelSchema('pending_approval').safeParse({ reason: '' }).success).toBe(false);
    expect(buildCancelSchema('scheduled').safeParse({ reason: ' ' }).success).toBe(false);
    expect(buildCancelSchema('scheduled').safeParse({ reason: 'Plans changed' }).success).toBe(true);
  });
});

describe('server refusals on the right field', () => {
  it('maps the HINT to the field', () => {
    expect(transferFieldFor('to_vessel_id')).toBe('toVesselId');
    expect(transferFieldFor('to_position_id')).toBe('toPositionId');
    expect(transferFieldFor('sign_off_date')).toBe('signOffDate');
    expect(transferFieldFor('sign_on_date')).toBe('signOnDate');
    expect(transferFieldFor('notes')).toBe('notes');
    expect(transferFieldFor('p_profile_id')).toBeNull();
    expect(transferFieldFor(null)).toBeNull();
  });
});
