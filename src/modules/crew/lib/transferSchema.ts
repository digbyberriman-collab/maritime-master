/**
 * The transfer wizard's forms (X1-11; gap/04 W9, C58). React Hook Form +
 * zod with the shared field helpers (src/shared/lib/form.ts). The rules
 * mirror transfer_crew_start / transfer_crew_acknowledge /
 * transfer_crew_decide / transfer_crew_cancel in
 * 20261124061100_crew_transfers_employment.sql, so the person hears the
 * reason before the server refuses (the server still decides, and its
 * refusal lands on the field its HINT names, transferFieldFor).
 */
import { z } from 'zod';
import { dateOnly, optionalText } from '@/shared/lib/form';
import { TRANSFER_LIMITS, addDays, cancelReasonRequired, type TransferStatus } from './transfer';

export const TRANSFER_MESSAGES = {
  destination: 'Choose the vessel they move to.',
  sameVessel: 'Choose another vessel to transfer to.',
  position: 'Choose the position on the new vessel.',
  samePositionMissing: 'Their current position is not on the new vessel’s list. Choose the position there.',
  signOff: 'Enter the sign-off date.',
  signOn: 'Enter the sign-on date.',
  signOffTooEarly: `The sign-off date can be at most ${TRANSFER_LIMITS.signOffPastDays} days ago.`,
  signOffTooLate: 'Plan the transfer within a year.',
  signOffBeforeJoin: 'The sign-off date is before they joined this vessel.',
  signOnBeforeSignOff: 'The sign-on date cannot be before the sign-off date.',
  gapTooLong: `Sign on within ${TRANSFER_LIMITS.maxGapDays} days of signing off.`,
  notes: 'Keep the notes under 2,000 characters.',
  tick: 'Tick this item to acknowledge it.',
  ackNote: 'Keep each note under 500 characters.',
  reasonRequired: 'Say why.',
  reason: 'Keep the reason under 2,000 characters.',
} as const;

export interface TransferDetailsContext {
  /** Today, date-only in local time. */
  today: string;
  fromVesselId: string;
  /** The origin assignment's join date (the sign-off cannot be before it). */
  joinDate: string | null;
  /** Whether a destination keeps the same position (the origin title maps to a position there). */
  hasSamePosition: (vesselId: string) => boolean;
}

export const TRANSFER_POSITION_MODES = ['same', 'new'] as const;
export type TransferPositionMode = (typeof TRANSFER_POSITION_MODES)[number];

export function buildTransferDetailsSchema(ctx: TransferDetailsContext) {
  return z
    .object({
      toVesselId: z.string({ required_error: TRANSFER_MESSAGES.destination }).min(1, TRANSFER_MESSAGES.destination),
      positionMode: z.enum(TRANSFER_POSITION_MODES),
      toPositionId: z.string().nullable(),
      signOffDate: dateOnly(TRANSFER_MESSAGES.signOff),
      signOnDate: dateOnly(TRANSFER_MESSAGES.signOn),
      notes: optionalText(TRANSFER_LIMITS.notesMax, TRANSFER_MESSAGES.notes),
    })
    .superRefine((v, issue) => {
      if (v.toVesselId === ctx.fromVesselId) {
        issue.addIssue({ code: z.ZodIssueCode.custom, path: ['toVesselId'], message: TRANSFER_MESSAGES.sameVessel });
      }
      if (v.positionMode === 'new' && !v.toPositionId) {
        issue.addIssue({ code: z.ZodIssueCode.custom, path: ['toPositionId'], message: TRANSFER_MESSAGES.position });
      }
      if (v.positionMode === 'same' && v.toVesselId && !ctx.hasSamePosition(v.toVesselId)) {
        issue.addIssue({ code: z.ZodIssueCode.custom, path: ['positionMode'], message: TRANSFER_MESSAGES.samePositionMissing });
      }
      if (v.signOffDate < addDays(ctx.today, -TRANSFER_LIMITS.signOffPastDays)) {
        issue.addIssue({ code: z.ZodIssueCode.custom, path: ['signOffDate'], message: TRANSFER_MESSAGES.signOffTooEarly });
      } else if (v.signOffDate > addDays(ctx.today, TRANSFER_LIMITS.signOffFutureDays)) {
        issue.addIssue({ code: z.ZodIssueCode.custom, path: ['signOffDate'], message: TRANSFER_MESSAGES.signOffTooLate });
      } else if (ctx.joinDate && v.signOffDate < ctx.joinDate) {
        issue.addIssue({ code: z.ZodIssueCode.custom, path: ['signOffDate'], message: TRANSFER_MESSAGES.signOffBeforeJoin });
      }
      if (v.signOnDate < v.signOffDate) {
        issue.addIssue({ code: z.ZodIssueCode.custom, path: ['signOnDate'], message: TRANSFER_MESSAGES.signOnBeforeSignOff });
      } else if (v.signOnDate > addDays(v.signOffDate, TRANSFER_LIMITS.maxGapDays)) {
        issue.addIssue({ code: z.ZodIssueCode.custom, path: ['signOnDate'], message: TRANSFER_MESSAGES.gapTooLong });
      }
    });
}

export type TransferDetailsInput = z.input<ReturnType<typeof buildTransferDetailsSchema>>;
export type TransferDetailsValues = z.output<ReturnType<typeof buildTransferDetailsSchema>>;

/** The form's starting values: today to tomorrow, the same position. */
export function transferDetailsDefaults(today: string, prefill?: Partial<TransferDetailsValues>): TransferDetailsValues {
  return {
    toVesselId: '',
    positionMode: 'same',
    toPositionId: null,
    signOffDate: today,
    signOnDate: addDays(today, 1),
    notes: '',
    ...prefill,
  };
}

/** transfer_crew_start's arguments (the same position is sent as NULL: the server resolves it on the destination). */
export function toStartArgs(profileId: string, fromVesselId: string, v: TransferDetailsValues) {
  return {
    p_profile_id: profileId,
    p_from_vessel_id: fromVesselId,
    p_to_vessel_id: v.toVesselId,
    p_to_position_id: v.positionMode === 'new' ? v.toPositionId : null,
    p_sign_off_date: v.signOffDate,
    p_sign_on_date: v.signOnDate,
    p_notes: v.notes,
  };
}

// ---------------------------------------------------------------- acknowledgements

export const acknowledgeSchema = z.object({
  items: z.array(
    z.object({
      key: z.string().min(1),
      ticked: z.boolean().refine((t) => t, { message: TRANSFER_MESSAGES.tick }),
      note: optionalText(TRANSFER_LIMITS.ackNoteMax, TRANSFER_MESSAGES.ackNote),
    }),
  ),
});
export type AcknowledgeInput = z.input<typeof acknowledgeSchema>;
export type AcknowledgeValues = z.output<typeof acknowledgeSchema>;

/** transfer_crew_acknowledge's p_items: every ticked item with its note. */
export function toAcknowledgePayload(
  items: ReadonlyArray<{ key?: string; ticked?: boolean; note?: string | null }>,
): Array<{ key: string; acknowledged: true; note?: string }> {
  const out: Array<{ key: string; acknowledged: true; note?: string }> = [];
  for (const i of items) {
    if (!i.ticked || !i.key) continue;
    const note = (i.note ?? '').trim();
    out.push(note ? { key: i.key, acknowledged: true, note } : { key: i.key, acknowledged: true });
  }
  return out;
}

// ---------------------------------------------------------------- decide and cancel

/** A decline needs a reason; an approval takes none. */
export const declineSchema = z.object({
  reason: z
    .string({ required_error: TRANSFER_MESSAGES.reasonRequired })
    .trim()
    .min(1, TRANSFER_MESSAGES.reasonRequired)
    .max(TRANSFER_LIMITS.reasonMax, TRANSFER_MESSAGES.reason),
});

/** A cancellation needs a reason once the transfer was submitted (cancelReasonRequired). */
export function buildCancelSchema(status: TransferStatus) {
  const required = cancelReasonRequired(status);
  return z.object({
    reason: required
      ? z.string({ required_error: TRANSFER_MESSAGES.reasonRequired }).trim().min(1, TRANSFER_MESSAGES.reasonRequired).max(TRANSFER_LIMITS.reasonMax, TRANSFER_MESSAGES.reason)
      : z.string().trim().max(TRANSFER_LIMITS.reasonMax, TRANSFER_MESSAGES.reason),
  });
}

// ---------------------------------------------------------------- server refusals on the right field

const HINT_FIELDS: Record<string, keyof TransferDetailsValues> = {
  to_vessel_id: 'toVesselId',
  to_position_id: 'toPositionId',
  sign_off_date: 'signOffDate',
  sign_on_date: 'signOnDate',
  notes: 'notes',
};

/** The details field a refusal's HINT names (22023 with HINT), or null. */
export function transferFieldFor(hint: string | null | undefined): keyof TransferDetailsValues | null {
  return hint ? HINT_FIELDS[hint] ?? null : null;
}
