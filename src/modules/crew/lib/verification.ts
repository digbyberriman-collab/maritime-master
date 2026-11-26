/**
 * Crew document verification, alerts off and expiry notices (X1-05; gap/04
 * C27, C28, C30, W3, W4; DECISIONS D-31). The TS mirror of
 * 20261124060500_crew_document_verification.sql:
 *
 * - the verifier rule (crew_document_verifier_check): an active member of
 *   the person's company, never an external viewer, never for their own
 *   documents, who holds vessel.crew.crew_certificates.approve on a vessel
 *   of the person. On that vessel the Master, the Purser's office and fleet
 *   reach decide for every department; a head of department (position tier
 *   hod) only for their own department; a holder outside the HoD tier is
 *   not bound to a department;
 * - the decisions: verified, conditionally approved (counts towards the
 *   requirements, shown amber) and rejected (never counts); a note is
 *   required for the last two;
 * - the material change that sends a reviewed document back to unverified
 *   (crew_certificates_guard in 060400);
 * - alerts off: a reason is required;
 * - the expiry notice stages of the daily sweep (crew_document_expiry_stage);
 * - the verify and alerts-off forms (zod, for React Hook Form) and the
 *   field a refusal points at.
 *
 * Pure: no React, no client. Dates are date-only strings in local time.
 */
import { format } from 'date-fns';
import { z } from 'zod';
import { isDateOnly } from '@/shared/lib/form';
import type { CrewDocumentDecision, CrewDocumentVerificationStatus, CrewDocumentVerifyBlock } from '../types/db.pending';
import type { RankTier } from '../types/domain';

/** The verification states, in the server's spelling (crew_certificates.verification_status). */
export const VERIFICATION_STATES = ['unverified', 'verified', 'conditionally_approved', 'rejected'] as const satisfies readonly CrewDocumentVerificationStatus[];

/** The decisions a verifier records (crew_document_verify p_decision), in the dialog's order. */
export const VERIFICATION_DECISIONS = ['verified', 'conditionally_approved', 'rejected'] as const satisfies readonly CrewDocumentDecision[];

/** The dialog's words for each decision. */
export const DECISION_LABEL: Readonly<Record<CrewDocumentDecision, string>> = {
  verified: 'Verified',
  conditionally_approved: 'Conditionally approved',
  rejected: 'Rejected',
};

/** What each decision means, under its option. */
export const DECISION_HINT: Readonly<Record<CrewDocumentDecision, string>> = {
  verified: 'The file and the details match. The document counts towards the requirements.',
  conditionally_approved: 'It counts towards the requirements, with a condition. Say what it is and until when.',
  rejected: 'It does not count towards any requirement. Say why, so it can be put right.',
};

/** The longest verification note the server takes (crew_certificates_text_lengths_check). */
export const VERIFICATION_NOTE_MAX = 2000;

/** The longest alerts-off reason the server takes. */
export const MUTE_REASON_MAX = 500;

export function isDecision(value: unknown): value is CrewDocumentDecision {
  return typeof value === 'string' && (VERIFICATION_DECISIONS as readonly string[]).includes(value);
}

/** A conditional approval and a rejection need a note (22023 note_required). */
export function noteRequired(decision: CrewDocumentDecision): boolean {
  return decision !== 'verified';
}

export type VerificationInputProblem = 'decision_invalid' | 'note_required' | 'note_too_long';

/** What the server would refuse in a decision before it is sent, or null. The note is trimmed; blank is none. */
export function verificationInputProblem(decision: unknown, note: string | null | undefined): VerificationInputProblem | null {
  if (!isDecision(decision)) return 'decision_invalid';
  const text = (note ?? '').trim();
  if (noteRequired(decision) && text === '') return 'note_required';
  if (text.length > VERIFICATION_NOTE_MAX) return 'note_too_long';
  return null;
}

/** A verified or conditionally approved document counts towards the requirements; a rejected one never does; an unverified one counts while it waits. */
export function satisfiesRequirements(status: CrewDocumentVerificationStatus): boolean {
  return status !== 'rejected';
}

/** A conditional approval shows amber in the matrix (W4). */
export function showsAmber(status: CrewDocumentVerificationStatus): boolean {
  return status === 'conditionally_approved';
}

/** A document waiting for a verifier (the 'Needs review' count). Legacy rows read before the catalogue is applied have no verification. */
export function needsReview(doc: { verificationStatus: CrewDocumentVerificationStatus; legacy?: boolean }): boolean {
  return !doc.legacy && doc.verificationStatus === 'unverified';
}

// ---------------------------------------------------------------- the verifier rule

/** What the rule needs about the caller on one vessel of the person's structural set. */
export interface VerifierVessel {
  /** vessel.crew.crew_certificates.approve on this vessel. */
  holdsApprove: boolean;
  /** The Master of the vessel (record_is_master). */
  isMaster: boolean;
  /** The caller's tier and department on the vessel's crew (null when not on it). */
  callerTier: RankTier | null;
  callerDepartment: string | null;
  /** The person's department on the vessel (null when unknown). */
  subjectDepartment: string | null;
}

export interface VerifierInput {
  /** Active, of the person's company, no external viewer. */
  eligible: boolean;
  isOwnDocument: boolean;
  /** Fleet reach (fleet_reach_for). */
  fleetReach: boolean;
  /** The person's structural vessels (current or planned assignment, pending placement). */
  vessels: readonly VerifierVessel[];
}

export type VerifierAnswer = 'ok' | CrewDocumentVerifyBlock;

/** The Purser's office verifies for every department, as the Master does. */
export const CREW_OFFICE_DEPARTMENT = 'purser_office';

/** The answer on one vessel (SQL crew_document_verifier_on). */
export function verifierOnVessel(vessel: VerifierVessel, fleetReach: boolean): 'ok' | 'out_of_department' | 'not_permitted' {
  if (!vessel.holdsApprove) return 'not_permitted';
  if (vessel.isMaster || fleetReach) return 'ok';
  // The command tier and the Purser's office decide for every department, and the rule binds only the HoD tier.
  if (vessel.callerTier === 'command' || vessel.callerDepartment === CREW_OFFICE_DEPARTMENT || vessel.callerTier !== 'hod') return 'ok';
  return vessel.subjectDepartment !== null && vessel.subjectDepartment === vessel.callerDepartment ? 'ok' : 'out_of_department';
}

/** Whether the caller may decide the person's document verification (SQL crew_document_verifier_check). */
export function verifierDecision(input: VerifierInput): VerifierAnswer {
  if (!input.eligible) return 'not_permitted';
  if (input.isOwnDocument) return 'own_document';
  let best: VerifierAnswer = 'not_permitted';
  for (const vessel of input.vessels) {
    const answer = verifierOnVessel(vessel, input.fleetReach);
    if (answer === 'ok') return 'ok';
    if (answer === 'out_of_department') best = 'out_of_department';
  }
  return best;
}

/** Why Verify is not offered, in words (and the server's 42501 DETAIL for the same refusal). */
export const VERIFY_BLOCK_MESSAGE: Readonly<Record<CrewDocumentVerifyBlock, string>> = {
  own_document: "You can't verify your own documents. Someone else on board or in the office checks them.",
  out_of_department: 'As a head of department you verify the documents of your own department only.',
  not_permitted: "You don't have permission to verify this person's documents.",
};

// ---------------------------------------------------------------- material change (060400 crew_certificates_guard)

/** The fields whose change sends a reviewed document back to unverified. */
export interface MaterialFields {
  number: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  noExpiry: boolean;
  issuingCountryCode: string | null;
  typeId: string | null;
  /** The stored file (path or legacy reference); a new upload counts as a change. */
  file: string | null;
}

const blank = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/** True when a change touches the number, a date, the No-expiry tick, the issuing country, the type or the file. */
export function isMaterialChange(before: MaterialFields, after: MaterialFields): boolean {
  return (
    blank(before.number) !== blank(after.number) ||
    blank(before.issueDate) !== blank(after.issueDate) ||
    blank(before.expiryDate) !== blank(after.expiryDate) ||
    before.noExpiry !== after.noExpiry ||
    blank(before.issuingCountryCode)?.toUpperCase() !== blank(after.issuingCountryCode)?.toUpperCase() ||
    before.typeId !== after.typeId ||
    blank(before.file) !== blank(after.file)
  );
}

/** The verification a document has after a change (the guard: a material change returns a reviewed document to unverified). */
export function statusAfterEdit(status: CrewDocumentVerificationStatus, material: boolean): CrewDocumentVerificationStatus {
  return material ? 'unverified' : status;
}

/** A reviewed document (verified, conditionally approved or rejected): a material edit sends it back for verification. */
export function isReviewed(status: CrewDocumentVerificationStatus): boolean {
  return status !== 'unverified';
}

// ---------------------------------------------------------------- words

const dayOf = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
};

/** "Reviewed by Demo Master on 3 Nov 2026", or null while the document has not been reviewed; a reviewer without a name reads "a reviewer". */
export function reviewedLine(doc: { verificationStatus: CrewDocumentVerificationStatus; verifiedByName: string | null; verifiedAt: string | null }): string | null {
  if (doc.verificationStatus === 'unverified' || !doc.verifiedAt) return null;
  const at = dayOf(doc.verifiedAt);
  const who = doc.verifiedByName?.trim() || 'a reviewer';
  return at ? `Reviewed by ${who} on ${format(at, 'd MMM yyyy')}` : `Reviewed by ${who}`;
}

/** A local date-only string in words ("1 Mar 2027"), or null. */
export function dayText(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return y && m && d ? format(new Date(y, m - 1, d), 'd MMM yyyy') : null;
}

/**
 * The note of a conditional approval: the condition, then "Until <date>."
 * when it has an end ("Valid with corrective lenses. Until 1 Mar 2027.").
 * The server stores it as the verification note (crew_document_verify takes
 * the note only).
 */
export function conditionalNote(condition: string, until: string | null | undefined): string {
  const text = condition.trim();
  const end = dayText(until ?? null);
  if (!end) return text;
  const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
  return `${sentence} Until ${end}.`;
}

export type MuteReasonProblem = 'reason_required' | 'reason_too_long';

/** What the server would refuse in an alerts-off reason, or null (trimmed; blank is none). */
export function muteReasonProblem(reason: string | null | undefined): MuteReasonProblem | null {
  const text = (reason ?? '').trim();
  if (text === '') return 'reason_required';
  if (text.length > MUTE_REASON_MAX) return 'reason_too_long';
  return null;
}

// ---------------------------------------------------------------- expiry notices (SQL crew_document_expiry_stage)

export const EXPIRY_NOTICE_STAGES = ['window', 'd30', 'd7', 'expiry_day'] as const;
export type ExpiryNoticeStage = (typeof EXPIRY_NOTICE_STAGES)[number];

/** Days after the expiry date that a missed expiry-day notice is still sent. */
export const EXPIRY_NOTICE_CATCH_UP_DAYS = 7;

/**
 * The notice stage of a document with `daysLeft` days to its expiry date
 * and a `windowDays`-day warning window: 'window' (more than 30 days left,
 * inside the window), 'd30' (8 to 30), 'd7' (1 to 7), 'expiry_day' (the
 * expiry day and the 7 days after it); null outside the window, longer
 * expired, or without a date. Each recipient hears of a document once per
 * stage and expiry date.
 */
export function expiryNoticeStage(daysLeft: number | null | undefined, windowDays: number | null | undefined): ExpiryNoticeStage | null {
  if (daysLeft === null || daysLeft === undefined || windowDays === null || windowDays === undefined) return null;
  if (daysLeft < -EXPIRY_NOTICE_CATCH_UP_DAYS || daysLeft > Math.max(windowDays, 0)) return null;
  if (daysLeft <= 0) return 'expiry_day';
  if (daysLeft <= 7) return 'd7';
  if (daysLeft <= 30) return 'd30';
  return 'window';
}

/** The days to expiry in words, as the notices say them (SQL crew_document_expiry_phrase). */
export function expiryPhrase(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined) return 'has no expiry date';
  if (daysLeft > 1) return `expires in ${daysLeft} days`;
  if (daysLeft === 1) return 'expires tomorrow';
  if (daysLeft === 0) return 'expires today';
  if (daysLeft === -1) return 'expired yesterday';
  return `expired ${-daysLeft} days ago`;
}

// ---------------------------------------------------------------- the forms (React Hook Form + zod)

/** Before saving a material change to a reviewed document (ReverifyWarning; W4). */
export const REVERIFY_WARNING = 'This document will need to be verified again.';
export const REVERIFY_WARNING_DETAIL = 'Saving these changes sends it back to the people who verify crew documents.';
/** The calm hint on a reviewed document before anything material has changed. */
export const REVERIFY_HINT = 'Changing the number, dates, issuing country, type or file sends this document back for verification.';

export interface VerifyFormValues {
  decision: CrewDocumentDecision | null;
  /** The condition (conditional approval), the reason (rejection) or an optional remark (verified). */
  note: string;
  /** A conditional approval's end, date-only; optional. */
  until: string | null;
}

export const emptyVerifyValues = (): VerifyFormValues => ({ decision: null, note: '', until: null });

/** The verify form: a decision; a note for a condition or a rejection (the server's note_required); a condition's end not in the past. */
export function buildVerifySchema(today: string) {
  return z
    .object({
      decision: z.enum(VERIFICATION_DECISIONS).nullable(),
      note: z.string().max(VERIFICATION_NOTE_MAX - 40, `Keep the note to ${VERIFICATION_NOTE_MAX - 40} characters or fewer.`),
      until: z.string().nullable(),
    })
    .superRefine((v, ctx) => {
      if (!v.decision) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decision'], message: 'Choose a decision.' });
        return;
      }
      if (noteRequired(v.decision) && v.note.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['note'],
          message: v.decision === 'rejected' ? 'Say why the document is rejected.' : 'Say what the condition is.',
        });
      }
      if (v.decision === 'conditionally_approved' && v.until) {
        if (!isDateOnly(v.until)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['until'], message: 'Check the date.' });
        else if (v.until < today) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['until'], message: 'The condition has to end today or later.' });
      }
    });
}

/** What crew_document_verify is sent for the form's values: the decision and the note (a condition's end written into it). */
export function verifyRequest(values: VerifyFormValues): { decision: CrewDocumentDecision; note: string | null } {
  if (!values.decision) throw new Error('A decision is required.');
  const raw = values.note.trim();
  const note = values.decision === 'conditionally_approved' ? conditionalNote(raw, values.until) : raw;
  return { decision: values.decision, note: note === '' ? null : note };
}

export interface MuteFormValues {
  reason: string;
}

/** The alerts-off form: a reason (the server's reason_required), at most 500 characters. */
export const muteSchema = z.object({
  reason: z
    .string()
    .refine((v) => v.trim() !== '', 'Say why alerts are turned off for this document.')
    .refine((v) => v.trim().length <= MUTE_REASON_MAX, `Keep the reason to ${MUTE_REASON_MAX} characters or fewer.`),
});

/** The review form field a 22023 refusal names in HINT (note, reason, decision), else null. */
export function reviewRefusalField(error: unknown): 'note' | 'reason' | 'decision' | 'expiry_date' | null {
  if (error === null || typeof error !== 'object') return null;
  const hint = (error as { hint?: unknown }).hint;
  return hint === 'note' || hint === 'reason' || hint === 'decision' || hint === 'expiry_date' ? hint : null;
}
