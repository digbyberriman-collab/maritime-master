/**
 * Crew import staging (X1-13; gap/04 headline 9; DECISIONS D-181, D-X1-17):
 * the Crew Data sheet of the rotation planner's XLSX import is staged
 * through crew_import_stage (20261124061200_crew_import_tenancy.sql), the
 * browser's only write to crew_import, then sync_crew_import_to_profiles
 * turns the company's staged rows into crew profiles.
 *
 * - crewStagingKey / crewStagingRows: the payload, one row per parsed crew
 *   member, with the planner's stable key (frp-<vessel id>-<crew id or
 *   name>) so a re-import updates the same staged row.
 * - parseStageRows / stageReasonText / summariseStage: the server's one
 *   outcome per row, read strictly and put into words.
 * - runCrewImport: stages in batches of at most 500 (the server's cap),
 *   then syncs when anything was staged. Every outcome is the server's own:
 *   nothing is reported as staged that the server did not stage.
 * - useCrewImportStage: the mutation the dialog uses; it refreshes the crew
 *   and planner reads afterwards.
 * - The import dialog's model (components/ImportDialog.tsx): the source
 *   form's schema, the section reports read from the database's answers
 *   (insertSection, crewSections), the import log status (batchStatus) and
 *   the crew match of rotation and travel rows (matchCrewUser).
 *
 * D-01. While 061200 is not applied, crew_import_stage is missing (PGRST202,
 * or a 42883 naming it): the staging step throws
 * CrewImportStageUnavailableError, "Staging becomes available once the crew
 * update is applied.", and nothing is synced. A refusal (42501, 22023)
 * throws CrewImportStageRefusalError with the server's sentence; anything
 * else is thrown as it came. Nothing is mocked.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { Tone } from '@/components/ui/tones';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { errorMessage } from '@/shared/lib/notify';
import { isPlannerRpcMissing } from '../lib/periods';
import type { ParsedCrewRow } from '../lib/xlsxImporter';
import type { CrewLite } from './useVesselsAndCrew';
import type {
  CrewImportStageOutcome,
  CrewImportStageRowPayload,
  PlannerPendingColumns,
  PlannerPendingFunctions,
  PlannerPendingTables,
} from '../types/db.pending';
import { LEGACY_PLANNER_KEY, plannerKeys } from './plannerKeys';

const stagingDb = pendingClient<PlannerPendingTables, NoPending, PlannerPendingFunctions, PlannerPendingColumns>();

export const CREW_IMPORT_STAGE_RPC = 'crew_import_stage';
export const CREW_IMPORT_SYNC_RPC = 'sync_crew_import_to_profiles';
/** The server's cap per call (22023 too_many_rows above it). */
export const CREW_IMPORT_STAGE_MAX_ROWS = 500;
/** D-01: the staging RPC is not in the database yet. */
export const STAGING_UNAVAILABLE_NOTICE = 'Staging becomes available once the crew update is applied.';
export const STAGING_NO_COMPANY_NOTICE = 'Your profile is not linked to a company, so crew cannot be staged.';

const KEY_MAX = 200;
const KEY_PREFIX = 'frp-';

// ---------------------------------------------------------------- the payload

/** FNV-1a (32 bit) as 8 hex digits: a short stable tag for a name no slug can carry. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const KEY_CHARS = /[^A-Za-z0-9._:-]+/g;

/**
 * The staging key of one crew row on a vessel: frp-<vessel id>-<part>. The
 * part is the sheet's crew ID when there is one, else the lower-case name
 * with every run of other characters as one dash (the key the planner
 * import has always written, so a re-import finds the same row). A name
 * with no letter or digit a key can hold (another script) gets
 * h<hash of name and birth date> instead, so two such people never share a
 * key. At most 200 characters, a letter or digit first (the server's rule).
 */
export function crewStagingKey(vesselId: string, row: Pick<ParsedCrewRow, 'externalId' | 'fullName' | 'dateOfBirth'>): string {
  const base = `${KEY_PREFIX}${vesselId}-`;
  const id = (row.externalId ?? '').trim().replace(KEY_CHARS, '-');
  let part = id && /[A-Za-z0-9]/.test(id) ? id : '';
  if (!part) {
    const slug = (row.fullName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    part = /[a-z0-9]/.test(slug) ? slug : `h${fnv1a(`${(row.fullName ?? '').normalize('NFKC').trim().toLowerCase()}|${row.dateOfBirth ?? ''}`)}`;
  }
  return `${base}${part}`.slice(0, KEY_MAX);
}

const textOrNull = (value: string | undefined | null): string | null => {
  const t = (value ?? '').trim();
  return t ? t : null;
};

/** The crew ID column as a whole number, when it is one (12 digits at most, the server's range). */
export function crewIdOf(externalId: string | undefined | null): number | null {
  const t = (externalId ?? '').trim();
  return /^[0-9]{1,12}$/.test(t) ? Number(t) : null;
}

/**
 * The payload of crew_import_stage for the parsed Crew Data rows: only the
 * fields the server reads, blanks as null, the vessel the import targets.
 * Rows keep the sheet's order, so an outcome's row_index is the sheet row's
 * position among the parsed crew.
 */
export function crewStagingRows(vesselId: string, vesselName: string, crew: readonly ParsedCrewRow[]): CrewImportStageRowPayload[] {
  return crew.map((c) => ({
    airtable_id: crewStagingKey(vesselId, c),
    crew_id: crewIdOf(c.externalId),
    vessel: textOrNull(vesselName),
    first_name: textOrNull(c.firstName),
    middle_name: textOrNull(c.middleName),
    last_name: textOrNull(c.lastName),
    full_legal_name: textOrNull(c.fullName),
    personal_email: textOrNull(c.email),
    cellular_phone: textOrNull(c.phone),
    date_of_birth: textOrNull(c.dateOfBirth),
    nationality: textOrNull(c.nationality),
    role: textOrNull(c.jobTitle),
    repatriation: textOrNull(c.repatriationPort),
  }));
}

// ---------------------------------------------------------------- the answer

export interface StageRowOutcome {
  /** The row's position in the payload (from 0). */
  rowIndex: number;
  stagingKey: string | null;
  outcome: CrewImportStageOutcome;
  /** created / updated when staged; the refusal's word otherwise. */
  reason: string | null;
  field: string | null;
}

/** crew_import_stage answered something this client cannot read. */
export class CrewImportStageShapeError extends Error {
  readonly answer: unknown;
  constructor(message: string, answer: unknown) {
    super(message);
    this.name = 'CrewImportStageShapeError';
    this.answer = answer;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const optText = (v: unknown): v is string | null => v === null || typeof v === 'string';

/** crew_import_stage's rows, strictly: one object per row with a known outcome. `offset` shifts row_index (a later batch). */
export function parseStageRows(data: unknown, offset = 0): StageRowOutcome[] {
  if (!Array.isArray(data)) throw new CrewImportStageShapeError('The staging answer is not a list.', data);
  return data.map((row) => {
    if (!isRecord(row)) throw new CrewImportStageShapeError('A staging outcome is not an object.', row);
    const { row_index, staging_key, outcome, reason, field } = row;
    if (typeof row_index !== 'number' || !Number.isInteger(row_index) || row_index < 0) {
      throw new CrewImportStageShapeError('A staging outcome has no row number.', row);
    }
    if (outcome !== 'staged' && outcome !== 'refused') throw new CrewImportStageShapeError('A staging outcome is unknown.', row);
    if (!optText(staging_key) || !optText(reason) || !optText(field)) {
      throw new CrewImportStageShapeError('A staging outcome has an unexpected field.', row);
    }
    return { rowIndex: row_index + offset, stagingKey: staging_key, outcome, reason, field };
  });
}

const FIELD_LABELS: Record<string, string> = {
  airtable_id: 'The staging key',
  crew_id: 'The crew ID',
  vessel: 'The vessel',
  first_name: 'The first name',
  middle_name: 'The middle name',
  last_name: 'The last name',
  casual_name: 'The casual name',
  full_legal_name: 'The full name',
  preferred_name: 'The preferred name',
  personal_email: 'The email',
  work_email: 'The work email',
  cellular_phone: 'The phone number',
  secondary_phone: 'The second phone number',
  date_of_birth: 'The date of birth',
  nationality: 'The nationality',
  role: 'The job title',
  department: 'The department',
  repatriation: 'The repatriation port',
};

const fieldLabel = (field: string | null): string => (field && FIELD_LABELS[field]) || 'A value';

/** The outcome of one row in words. */
export function stageReasonText(outcome: Pick<StageRowOutcome, 'outcome' | 'reason' | 'field'>): string {
  const { reason, field } = outcome;
  if (outcome.outcome === 'staged') return reason === 'updated' ? 'Updated in the staging list.' : 'Added to the staging list.';
  switch (reason) {
    case 'not_an_object':
      return 'The row could not be read.';
    case 'key_missing':
      return 'The row has no staging key.';
    case 'key_invalid':
      return 'The staging key has characters it cannot hold.';
    case 'duplicate_in_batch':
      return 'The same person appears earlier in this file; only the first row was staged.';
    case 'invalid_value':
      return `${fieldLabel(field)} could not be read.`;
    case 'field_too_long':
      return `${fieldLabel(field)} is longer than allowed (${field === 'personal_email' || field === 'work_email' ? 320 : 200} characters).`;
    case 'invalid_email':
      return `${fieldLabel(field)} is not an email address.`;
    case 'invalid_crew_id':
      return 'The crew ID must be a whole number.';
    case 'invalid_date_of_birth':
      return 'The date of birth is not a valid past date.';
    case 'name_missing':
      return 'The row has no first, last or full name.';
    case 'key_in_use':
      return 'This staging key belongs to a row your company cannot change.';
    case 'archived':
      return 'This person is archived in the staging list, so the row was not changed.';
    default:
      return reason ? `Not staged (${reason}).` : 'Not staged.';
  }
}

export interface StageSummary {
  total: number;
  staged: number;
  created: number;
  updated: number;
  refused: number;
}

export function summariseStage(outcomes: readonly StageRowOutcome[]): StageSummary {
  const staged = outcomes.filter((o) => o.outcome === 'staged');
  return {
    total: outcomes.length,
    staged: staged.length,
    created: staged.filter((o) => o.reason !== 'updated').length,
    updated: staged.filter((o) => o.reason === 'updated').length,
    refused: outcomes.length - staged.length,
  };
}

// ---------------------------------------------------------------- errors

/** D-01: crew_import_stage is not in the database yet. */
export class CrewImportStageUnavailableError extends Error {
  constructor() {
    super(STAGING_UNAVAILABLE_NOTICE);
    this.name = 'CrewImportStageUnavailableError';
  }
}

/** A refusal of the whole call (42501 not permitted, 22023 a bad request), with the sentence to show. */
export class CrewImportStageRefusalError extends Error {
  readonly code: string;
  readonly refusal: string;
  readonly original: unknown;
  constructor(code: string, refusal: string, text: string, original: unknown) {
    super(text);
    this.name = 'CrewImportStageRefusalError';
    this.code = code;
    this.refusal = refusal;
    this.original = original;
  }
}

const REFUSAL_TEXT: Record<string, string> = {
  not_signed_in: 'Sign in with an active account to stage crew.',
  company_required: 'Choose the company to stage crew for.',
  company_mismatch: 'You can only stage crew for your own company.',
  not_permitted: 'Staging crew needs edit access to the rotation planner.',
  rows_not_array: 'The crew rows could not be sent.',
  too_many_rows: 'Stage at most 500 crew at a time.',
};

const errorFields = (error: unknown): { code: string; message: string; details: string } => {
  const e = isRecord(error) ? error : {};
  return {
    code: typeof e.code === 'string' ? e.code : '',
    message: typeof e.message === 'string' ? e.message : '',
    details: typeof e.details === 'string' ? e.details : '',
  };
};

/** What a failed crew_import_stage call means: missing (D-01), a refusal with its sentence, or the error itself. */
export function stageErrorOf(error: unknown): unknown {
  if (isPlannerRpcMissing(error, CREW_IMPORT_STAGE_RPC)) return new CrewImportStageUnavailableError();
  const { code, message, details } = errorFields(error);
  if (code === '42501' || code === '22023') {
    const text = details.trim() || REFUSAL_TEXT[message] || (code === '42501' ? REFUSAL_TEXT.not_permitted : 'The crew rows were refused.');
    return new CrewImportStageRefusalError(code, message, text, error);
  }
  return error;
}

/** The sync's refusal or failure in words (the legacy definer raises sentences; the platform guards add a DETAIL). */
export function syncErrorText(error: unknown): string {
  const { code, message, details } = errorFields(error);
  if (message === 'Insufficient permissions to sync crew') {
    return 'Adding staged crew to the crew list needs a Master, purser or fleet manager role.';
  }
  if (message === 'No company context for crew sync') return STAGING_NO_COMPANY_NOTICE;
  if (details.trim()) return details.trim();
  if (code === '42501') return 'You are not allowed to add these crew to the crew list.';
  return errorMessage(error, 'The staged crew could not be added to the crew list.');
}

// ---------------------------------------------------------------- the run

export interface CrewImportStageResult {
  outcomes: StageRowOutcome[];
  /** A later batch failed: rows from rowIndex on were not staged, and why. */
  stoppedAt: { rowIndex: number; message: string } | null;
}

export type CrewImportSyncResult =
  | { status: 'done'; inserted: number; updated: number; skipped: number }
  | { status: 'not_run' }
  | { status: 'failed'; message: string };

export interface CrewImportResult {
  stage: CrewImportStageResult;
  sync: CrewImportSyncResult;
}

const countOf = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

/** sync_crew_import_to_profiles' answer: { inserted, updated, skipped }. */
export function parseSyncAnswer(data: unknown): { inserted: number; updated: number; skipped: number } {
  const r = isRecord(data) ? data : null;
  const inserted = countOf(r?.inserted);
  const updated = countOf(r?.updated);
  const skipped = countOf(r?.skipped) ?? 0;
  if (inserted === null || updated === null) throw new CrewImportStageShapeError('The crew list answer is unreadable.', data);
  return { inserted, updated, skipped };
}

/**
 * Stages `rows` for the company in batches of 500, then adds the company's
 * staged crew to the crew list. The first batch failing throws (D-01:
 * CrewImportStageUnavailableError; a refusal: CrewImportStageRefusalError);
 * a later batch failing stops there and says so in `stoppedAt`. The sync
 * runs only when the server staged at least one row; its failure is
 * reported, never thrown, because the staging itself succeeded.
 */
export async function runCrewImport(companyId: string | null, rows: readonly CrewImportStageRowPayload[]): Promise<CrewImportResult> {
  if (!companyId) throw new CrewImportStageRefusalError('42501', 'company_required', STAGING_NO_COMPANY_NOTICE, null);
  const outcomes: StageRowOutcome[] = [];
  let stoppedAt: CrewImportStageResult['stoppedAt'] = null;
  for (let offset = 0; offset < rows.length; offset += CREW_IMPORT_STAGE_MAX_ROWS) {
    const batch = rows.slice(offset, offset + CREW_IMPORT_STAGE_MAX_ROWS);
    const { data, error } = await stagingDb.rpc(CREW_IMPORT_STAGE_RPC, { p_company_id: companyId, p_rows: batch });
    if (error) {
      const mapped = stageErrorOf(error);
      if (offset === 0) throw mapped;
      stoppedAt = { rowIndex: offset, message: mapped instanceof Error ? mapped.message : errorMessage(mapped) };
      break;
    }
    const parsed = parseStageRows(data ?? [], offset);
    if (parsed.length !== batch.length) {
      throw new CrewImportStageShapeError(`The server answered ${parsed.length} of ${batch.length} rows.`, data);
    }
    outcomes.push(...parsed);
  }

  if (!outcomes.some((o) => o.outcome === 'staged')) return { stage: { outcomes, stoppedAt }, sync: { status: 'not_run' } };

  const { data, error } = await stagingDb.rpc(CREW_IMPORT_SYNC_RPC, { p_company_id: companyId });
  if (error) return { stage: { outcomes, stoppedAt }, sync: { status: 'failed', message: syncErrorText(error) } };
  try {
    return { stage: { outcomes, stoppedAt }, sync: { status: 'done', ...parseSyncAnswer(data) } };
  } catch (e) {
    return { stage: { outcomes, stoppedAt }, sync: { status: 'failed', message: errorMessage(e) } };
  }
}

/** The reads a crew import changes: the crew lists, the planner (legacy and new) and the import lookups. */
export const CREW_IMPORT_INVALIDATES: readonly (readonly string[])[] = [
  ['crew'],
  ['crew-count'],
  LEGACY_PLANNER_KEY,
  plannerKeys.all,
  ['crew-import-roles'],
  ['crew-import-nationalities'],
  ['crew-import-departments'],
  ['vessels-import'],
];

export interface CrewImportStageVariables {
  companyId: string | null;
  rows: readonly CrewImportStageRowPayload[];
}

/** The staging mutation of the import dialog (runCrewImport), refreshing the changed reads when it settles. */
export function useCrewImportStage() {
  const queryClient = useQueryClient();
  return useMutation<CrewImportResult, unknown, CrewImportStageVariables>({
    mutationFn: ({ companyId, rows }) => runCrewImport(companyId, rows),
    onSettled: async () => {
      await Promise.all(CREW_IMPORT_INVALIDATES.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })));
    },
  });
}

// ---------------------------------------------------------------- the import dialog's model (ImportDialog)

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File;

export const importSourceSchema = z.object({
  vesselId: z.string().min(1, 'Choose the vessel this planner belongs to.'),
  file: z
    .custom<File>(isFile, 'Choose an XLSX file.')
    .refine((f) => /\.(xlsx|xls)$/i.test(f.name), 'Choose an .xlsx or .xls file.')
    .refine((f) => f.size <= MAX_FILE_BYTES, 'The file is larger than 20 MB.'),
});
export type ImportSourceValues = z.infer<typeof importSourceSchema>;


export type SectionStatus = 'done' | 'partial' | 'failed' | 'skipped' | 'unavailable';

export interface SectionReport {
  key: 'lanes' | 'rotations' | 'locations' | 'travel' | 'crew' | 'crew_list';
  label: string;
  status: SectionStatus;
  /** One line about the section ("12 saved", the error's message). */
  detail: string;
}

export interface ImportReport {
  sections: SectionReport[];
  /** The crew rows the server refused, with the person's name from the sheet. */
  refusedCrew: Array<StageRowOutcome & { name: string }>;
  /** The import log could not be updated (the import itself is unchanged). */
  logNote: string | null;
}

export const SECTION_TONE: Record<SectionStatus, Tone> = { done: 'ok', partial: 'warn', failed: 'danger', skipped: 'neutral', unavailable: 'neutral' };
export const SECTION_LABEL: Record<SectionStatus, string> = { done: 'Done', partial: 'Partly', failed: 'Failed', skipped: 'Nothing to do', unavailable: 'Not available' };

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One inserting section's report from the rows the database returned. */
export function insertSection(
  key: SectionReport['key'],
  label: string,
  expected: number,
  result: { data: readonly unknown[] | null; error: unknown } | null,
): SectionReport {
  if (expected === 0 || !result) return { key, label, status: 'skipped', detail: 'None in the file.' };
  if (result.error) return { key, label, status: 'failed', detail: errorMessage(result.error, `The ${label.toLowerCase()} could not be saved.`) };
  const saved = result.data?.length ?? 0;
  if (saved === expected) return { key, label, status: 'done', detail: `${saved} saved.` };
  return { key, label, status: saved === 0 ? 'failed' : 'partial', detail: `${saved} of ${expected} saved.` };
}

/** The crew sections (staging and the crew list) from the staging run. */
export function crewSections(result: CrewImportResult | null, error: unknown, crewCount: number): SectionReport[] {
  if (crewCount === 0) return [{ key: 'crew', label: 'Crew staging', status: 'skipped', detail: 'No crew records in the file.' }];
  if (error instanceof CrewImportStageUnavailableError) {
    return [{ key: 'crew', label: 'Crew staging', status: 'unavailable', detail: error.message }];
  }
  if (error || !result) {
    return [{ key: 'crew', label: 'Crew staging', status: 'failed', detail: errorMessage(error, 'The crew records could not be staged.') }];
  }
  const s = summariseStage(result.stage.outcomes);
  const parts = [`${s.staged} of ${crewCount} staged`];
  if (s.created || s.updated) parts.push(`${s.created} new, ${s.updated} updated`);
  if (s.refused) parts.push(`${s.refused} refused`);
  let detail = `${parts.join(' · ')}.`;
  if (result.stage.stoppedAt) detail += ` Rows from ${result.stage.stoppedAt.rowIndex + 1} on were not sent: ${result.stage.stoppedAt.message}`;
  const status: SectionStatus = s.staged === crewCount ? 'done' : s.staged === 0 ? 'failed' : 'partial';
  const sections: SectionReport[] = [{ key: 'crew', label: 'Crew staging', status, detail }];
  const sync = result.sync;
  if (sync.status === 'done') {
    sections.push({
      key: 'crew_list',
      label: 'Crew list',
      status: 'done',
      detail: `${plural(sync.inserted, 'person', 'people')} added, ${sync.updated} updated${sync.skipped ? `, ${sync.skipped} skipped without a name` : ''}.`,
    });
  } else if (sync.status === 'failed') {
    sections.push({ key: 'crew_list', label: 'Crew list', status: 'failed', detail: sync.message });
  } else {
    sections.push({ key: 'crew_list', label: 'Crew list', status: 'skipped', detail: 'Nothing was staged, so the crew list is unchanged.' });
  }
  return sections;
}

/** complete when every section did its work, failed when none did, partial otherwise. */
export function batchStatus(sections: readonly SectionReport[]): 'complete' | 'partial' | 'failed' {
  const worked = sections.filter((s) => s.status !== 'skipped');
  if (worked.every((s) => s.status === 'done')) return 'complete';
  if (worked.every((s) => s.status === 'failed' || s.status === 'unavailable')) return 'failed';
  return 'partial';
}

/** The planner's crew match: the full name, else a last name only one crew member has. */
export function matchCrewUser(crew: readonly CrewLite[], name: string): string | null {
  const wanted = name.toLowerCase().trim();
  if (!wanted) return null;
  const full = crew.filter((c) => `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase().trim() === wanted);
  if (full.length === 1) return full[0].user_id;
  if (full.length > 1) return null;
  const last = crew.filter((c) => (c.last_name ?? '').toLowerCase().trim() === wanted);
  return last.length === 1 ? last[0].user_id : null;
}
