/**
 * Shared vocabulary for the record engines (gap/08 REG, SIG, CO, TH).
 *
 * The database is the source of truth for every transition
 * (`record_transition`, `company_action`, `sign_slot`, …). These pure types
 * and the engines beside them mirror the gap/08 state machines so the UI can
 * explain what is possible and why, and so the SQL and the client are tested
 * against the same rules.
 */

/** Envelope statuses (gap/08 §A; doc 05 vocabulary, shared by every module). */
export const ENVELOPE_STATUSES = [
  'open',
  'in_review',
  'submitted',
  'acknowledged',
  'awaiting_company_close',
  'info_requested',
  'closed',
  'void',
] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

/** Who acts: the vessel side, the company (owner / admins with reach), or the engine. */
export type Party = 'vessel' | 'company';
export type EntryParty = Party | 'system';

/** The company step a record kind needs (DECISIONS C6: one enum everywhere). */
export const COMPANY_STEPS = ['none', 'acknowledge', 'sign_off'] as const;
export type CompanyStep = (typeof COMPANY_STEPS)[number];

/** "Whose move" on headers and lists. */
export type WhoseMove = 'vessel' | 'company' | 'none';

/** Edit-after-sign policy per kind (gap/08 §B). */
export type EditAfterSign = 'allow_with_flag' | 'lock' | 'revert_to_draft';

/** Delete rule per kind (gap/08 §F). */
export type DeleteRule = 'draft_only' | 'never_after_submit' | 'until_signed' | 'free' | 'cascade_parent';

/** A failed engine action: a stable code plus a sentence for the UI. */
export interface EngineError<Code extends string = string> {
  code: Code;
  message: string;
}

/**
 * Both branches declare both fields (one as `undefined`) so callers can read
 * `result.error` / `result.value` after checking `ok` even without
 * `strictNullChecks`, where boolean discriminants do not narrow.
 */
export type EngineResult<T, Code extends string = string> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; value?: undefined; error: EngineError<Code> };

export const ok = <T>(value: T): { ok: true; value: T; error?: undefined } => ({ ok: true, value });
export const fail = <Code extends string>(
  code: Code,
  message: string,
): { ok: false; value?: undefined; error: EngineError<Code> } => ({
  ok: false,
  error: { code, message },
});
