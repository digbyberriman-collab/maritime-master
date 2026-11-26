/**
 * The state of a crew document (X1-04; gap/04 C29, W3; DECISIONS C5, D-31):
 * the TS mirror of crew_documents_for_profile() in
 * 20261124060400_crew_document_catalogue.sql, built on the one expiry engine
 * (src/lib/records/expiry.ts, mirror of SQL expiry_bucket). The two X5 rules
 * it needs, the default window (SQL expiry_default_window) and the
 * endorsement state (SQL expiry_endorsement_state), are restated here in a
 * few lines because the crew module may not import the fleet internals
 * (src/test/fleet/wiring.test.ts) and the fleet public API does not export
 * them; src/test/crew/documentState.test.ts holds both equal to X5's
 * src/modules/fleet/lib/expiryWindows.ts and endorsement.ts on every item
 * type and boundary, so neither engine forks.
 *
 * The rule, first match wins:
 *   not_uploaded  the record has no file
 *   missing_date  no expiry date and no "No expiry" tick: missing data,
 *                 never Valid (D-31); the bucket is null
 *   <bucket>      expired, expiring_soon, expiring, valid or no_expiry, on
 *                 the window of the document's type (the company's rule,
 *                 else passports 270 days and everything else 90)
 * The bucket is kept on its own as well (a document without a file still
 * expires), alerts off is an overlay that keeps the real state, and the
 * endorsement state (due / overdue, 30 days) is separate.
 *
 * The boundary dates are the EXP1 table of src/test/lib/records/expiry.test.ts,
 * asserted against this module in src/test/crew/documentState.test.ts and
 * against SQL in supabase/tests/sql/crew/document_catalogue.test.sql.
 *
 * Pure: no React, no client. "today" is passed in.
 */
import { DEFAULT_EXPIRY_WINDOW_DAYS, expiryStatus, needsAttention as bucketNeedsAttention, type ExpiryBucket } from '@/lib/records/expiry';
import { daysBetween, toCalendarDate, type DateInput } from '@/lib/records/dates';

/** The states a document can read, in the server's spelling (crew_documents_for_profile.state). */
export const CREW_DOCUMENT_STATES = ['not_uploaded', 'missing_date', 'expired', 'expiring_soon', 'expiring', 'valid', 'no_expiry'] as const;
export type CrewDocumentState = (typeof CREW_DOCUMENT_STATES)[number];

/** The endorsement window (days before the due date) the server uses. */
export const DOCUMENT_ENDORSEMENT_WINDOW_DAYS = 30;

/** The default window of a passport (SQL expiry_default_window; X5's PASSPORT_WINDOW_DAYS). */
export const PASSPORT_DOCUMENT_WINDOW_DAYS = 270;

/** The endorsement states, X5's spelling (crew_documents_for_profile.endorsement_state). */
export const DOCUMENT_ENDORSEMENT_STATES = ['overdue', 'due'] as const;
export type EndorsementState = (typeof DOCUMENT_ENDORSEMENT_STATES)[number];

export interface DocumentStateInput {
  /** A stored file (the new file_path or the legacy file_url). */
  hasFile: boolean;
  /** `yyyy-MM-dd`; null or blank without the tick is a missing date. */
  expiryDate: DateInput | null | undefined;
  /** The "No expiry" tick. */
  noExpiry: boolean;
  /** The window of the document's type; null or undefined: the item type's default. */
  windowDays?: number | null;
  /** The type's expiry item type (passport gets 270 days by default). */
  itemType?: string | null;
  alertsMuted?: boolean;
  endorsementDueDate?: DateInput | null;
  today: DateInput;
}

export interface DocumentStateResult {
  state: CrewDocumentState;
  /** The expiry bucket; null only for a missing date. */
  bucket: ExpiryBucket | null;
  /** Days to the expiry date (negative once expired); null with no date or the tick. */
  daysRemaining: number | null;
  windowDays: number;
  /** Alerts off (C28): the state stays real, alerts and KPI counts leave it out. */
  alertsOff: boolean;
  endorsement: EndorsementState | null;
  /** The record lacks data: no file, or no date without the tick. */
  incomplete: boolean;
  /** Raises an alert: expired or inside its window, a missing date, an endorsement due; never with alerts off. */
  needsAttention: boolean;
}

const isBlank = (v: DateInput | null | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** The window a document's type gets when the caller has no rule: passports 270 days, everything else 90 (SQL expiry_default_window). */
export function documentWindowDays(itemType: string | null | undefined, windowDays?: number | null): number {
  if (windowDays !== null && windowDays !== undefined) return windowDays;
  return itemType === 'passport' ? PASSPORT_DOCUMENT_WINDOW_DAYS : DEFAULT_EXPIRY_WINDOW_DAYS;
}

/**
 * The endorsement state of a due date (SQL expiry_endorsement_state(due, today, 30)):
 * overdue once the date has passed, due from 30 days before through the date
 * itself (D-31), else null; null with no due date.
 */
export function documentEndorsementState(dueOn: DateInput | null | undefined, today: DateInput): EndorsementState | null {
  if (isBlank(dueOn)) return null;
  const days = daysBetween(toCalendarDate(today), toCalendarDate(dueOn as DateInput));
  if (days < 0) return 'overdue';
  return days <= DOCUMENT_ENDORSEMENT_WINDOW_DAYS ? 'due' : null;
}

function attention(bucket: ExpiryBucket | null, missingDate: boolean, endorsement: EndorsementState | null, alertsOff: boolean): boolean {
  if (alertsOff) return false;
  return missingDate || endorsement !== null || (bucket !== null && bucketNeedsAttention(bucket));
}

/** A document's state from its fields (the rule of crew_documents_for_profile). */
export function deriveDocumentState(input: DocumentStateInput): DocumentStateResult {
  const windowDays = documentWindowDays(input.itemType, input.windowDays);
  const missingDate = isBlank(input.expiryDate) && !input.noExpiry;
  let bucket: ExpiryBucket | null = null;
  let daysRemaining: number | null = null;
  if (!missingDate) {
    const status = expiryStatus({ expiresOn: input.noExpiry ? null : input.expiryDate, windowDays, today: input.today, noExpiry: input.noExpiry });
    bucket = status.bucket;
    daysRemaining = status.daysRemaining;
  }
  const state: CrewDocumentState = !input.hasFile ? 'not_uploaded' : missingDate ? 'missing_date' : (bucket as ExpiryBucket);
  const endorsement = documentEndorsementState(input.endorsementDueDate, input.today);
  const alertsOff = Boolean(input.alertsMuted);
  return {
    state,
    bucket,
    daysRemaining,
    windowDays,
    alertsOff,
    endorsement,
    incomplete: !input.hasFile || missingDate,
    needsAttention: attention(bucket, missingDate, endorsement, alertsOff),
  };
}

/** The fields of a server row (crew_documents_for_profile) that carry its state. */
export interface ServerStateFields {
  state: CrewDocumentState;
  bucket: ExpiryBucket | null;
  days_remaining: number | null;
  window_days: number;
  alerts_muted: boolean;
  endorsement_state: EndorsementState | null;
  has_file: boolean;
}

/** The state the server computed, in this module's shape (the server is the authority; nothing is recomputed). */
export function documentStateFromServer(row: ServerStateFields): DocumentStateResult {
  // The server's bucket is null exactly for a missing date (no date, no tick).
  const missingDate = row.bucket === null;
  return {
    state: row.state,
    bucket: row.bucket,
    daysRemaining: row.days_remaining,
    windowDays: row.window_days,
    alertsOff: row.alerts_muted,
    endorsement: row.endorsement_state,
    incomplete: !row.has_file || missingDate,
    needsAttention: attention(row.bucket, missingDate, row.endorsement_state, row.alerts_muted),
  };
}

// ---------------------------------------------------------------- what a row shows

/** A pill of a document row: the expiry bucket (ExpiryPill, domain expiry) or a non-bucket state (StatusPill, domain crew_document_state). */
export type DocumentBadge =
  | { kind: 'expiry'; bucket: ExpiryBucket; daysRemaining: number | null }
  | { kind: 'expiry_unknown' }
  | { kind: 'state'; key: 'not_uploaded' | 'missing_date' | 'alerts_off' | 'endorsement_due' | 'endorsement_overdue' };

/**
 * The pills of a document row, in order: the expiry (or "Expiry unknown"
 * for a missing date: ExpiryPill with undefined, D-31), then what else needs
 * saying: no file, a missing date, the endorsement, alerts off (the real
 * state stays first, so alerts off never hides it).
 */
export function documentBadges(result: DocumentStateResult): DocumentBadge[] {
  const out: DocumentBadge[] = [];
  out.push(result.bucket === null ? { kind: 'expiry_unknown' } : { kind: 'expiry', bucket: result.bucket, daysRemaining: result.daysRemaining });
  if (result.state === 'not_uploaded') out.push({ kind: 'state', key: 'not_uploaded' });
  if (result.bucket === null) out.push({ kind: 'state', key: 'missing_date' });
  if (result.endorsement === 'overdue') out.push({ kind: 'state', key: 'endorsement_overdue' });
  if (result.endorsement === 'due') out.push({ kind: 'state', key: 'endorsement_due' });
  if (result.alertsOff) out.push({ kind: 'state', key: 'alerts_off' });
  return out;
}

/** The legend keys of the documents tabs (gap/04 C24): Valid, Expiring, Expired, Missing date, Alerts off, Not uploaded. */
export const DOCUMENT_LEGEND_KEYS = ['valid', 'expiring', 'expired', 'missing_date', 'alerts_off', 'not_uploaded'] as const;
export type DocumentLegendKey = (typeof DOCUMENT_LEGEND_KEYS)[number];

/** Which legend entry a document counts under: alerts off first (the document raises nothing), then no file, a missing date, the bucket. */
export function documentLegendKey(result: DocumentStateResult): DocumentLegendKey {
  if (result.alertsOff) return 'alerts_off';
  if (result.state === 'not_uploaded') return 'not_uploaded';
  if (result.bucket === null) return 'missing_date';
  if (result.bucket === 'expired') return 'expired';
  if (result.bucket === 'expiring' || result.bucket === 'expiring_soon') return 'expiring';
  return 'valid';
}

/** Counts per legend entry (every entry present, zero when unused). */
export function countDocumentLegend(results: Iterable<DocumentStateResult>): Record<DocumentLegendKey, number> {
  const counts: Record<DocumentLegendKey, number> = { valid: 0, expiring: 0, expired: 0, missing_date: 0, alerts_off: 0, not_uploaded: 0 };
  for (const r of results) counts[documentLegendKey(r)] += 1;
  return counts;
}
