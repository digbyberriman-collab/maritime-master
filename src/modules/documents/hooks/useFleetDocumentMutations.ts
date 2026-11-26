/**
 * Every change to the fleet document library goes through one of the
 * library's definers (gap/02 W1; `20261124040300_fleet_documents_library.sql`;
 * there is no browser write grant on any library table):
 *
 * - taxonomy (this slice's settings drawer): section save / reorder /
 *   delete, type save / delete;
 * - documents (the publish flow, X5-04B): create, update, add a version,
 *   set targets, publish, withdraw, delete a draft.
 *
 * Each call checks the input first with the server's own rules where it
 * can, then checks the row the definer returns against what was asked (no
 * row, another company or another value is not a save, so no fake
 * success). Refusals (22023 with a stable code, 42501, P0002) become
 * FleetDocumentRefusalError with the sentence from
 * lib/fleetDocumentMachine.ts; a missing RPC (D-01) says the library is
 * not set up yet. The hooks toast the outcome through notify() and
 * invalidate the company's library queries whatever happened, because a
 * refusal can mean the screen was stale.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isMissingRelationError as isMissingRelation, notify } from '@/shared/lib/notify';
import { fleetDocumentRefusal } from '../lib/fleetDocumentMachine';
import { fleetDocumentsDb } from '../lib/fleetDocumentsDb';
import type {
  FleetDocumentRow,
  FleetDocumentSectionRow,
  FleetDocumentTargetMode,
  FleetDocumentTypeRow,
  FleetDocumentVersionKind,
  FleetDocumentVersionRow,
} from '../types/db.pending';
import { fleetDocumentKeys } from './keys';

export const NOT_SET_UP_MESSAGE = 'Fleet documents are not set up yet, so nothing was saved.';
const NOT_SAVED_MESSAGE = 'The change was not saved. Refresh to see the current library, then try again.';

/** A refusal or a failed check, with the sentence to show. */
export class FleetDocumentRefusalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FleetDocumentRefusalError';
  }
}

const refuse = (code: string): never => {
  throw new FleetDocumentRefusalError(code, fleetDocumentRefusal(code) ?? NOT_SAVED_MESSAGE);
};

/** A definer error as a sentence (a missing RPC is "not set up"); an unknown error is returned as it is. */
export function toFleetDocumentError(error: { code?: string; message?: string } | null | undefined): unknown {
  if (!error) return new FleetDocumentRefusalError('not_saved', NOT_SAVED_MESSAGE);
  if (isMissingRelation(error as { code: string; message: string })) return new FleetDocumentRefusalError('not_set_up', NOT_SET_UP_MESSAGE);
  const sentence = fleetDocumentRefusal(error.message);
  return sentence ? new FleetDocumentRefusalError(error.message as string, sentence) : error;
}

/** The single row a definer returned (PostgREST returns a composite as an object, sometimes as a one-row array). */
function oneRow<T>(data: unknown): Partial<T> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? (row as Partial<T>) : null;
}

function check(ok: boolean): void {
  if (!ok) throw new FleetDocumentRefusalError('not_saved', NOT_SAVED_MESSAGE);
}

const trimmed = (value: string | null | undefined) => (value ?? '').trim();

// ─── Taxonomy ───────────────────────────────────────────────────────────

export const NAME_MAX = 80;

export interface SaveSectionInput {
  /** null adds a section (placed last). */
  id: string | null;
  name: string;
}

export async function saveSection(companyId: string, input: SaveSectionInput): Promise<FleetDocumentSectionRow> {
  const name = trimmed(input.name);
  if (!name) refuse('name_required');
  if (name.length > NAME_MAX) refuse('name_too_long');
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_section_save', { p_id: input.id, p_name: name });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentSectionRow>(data);
  check(!!row && typeof row.id === 'string' && row.company_id === companyId && row.name === name && (input.id === null || row.id === input.id));
  return row as FleetDocumentSectionRow;
}

export async function reorderSections(companyId: string, ids: readonly string[]): Promise<FleetDocumentSectionRow[]> {
  if (!ids.length || new Set(ids).size !== ids.length) refuse('reorder_mismatch');
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_sections_reorder', { p_ids: [...ids] });
  if (error) throw toFleetDocumentError(error);
  const rows = (Array.isArray(data) ? data : []) as Partial<FleetDocumentSectionRow>[];
  check(rows.length === ids.length && rows.every((r, i) => r.id === ids[i] && r.company_id === companyId));
  return rows as FleetDocumentSectionRow[];
}

export async function deleteSection(companyId: string, id: string): Promise<FleetDocumentSectionRow> {
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_section_delete', { p_id: id });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentSectionRow>(data);
  check(!!row && row.id === id && row.company_id === companyId);
  return row as FleetDocumentSectionRow;
}

export interface SaveTypeInput {
  /** null adds a type to `sectionId` (placed last in it). */
  id: string | null;
  sectionId: string;
  name: string;
  ackRequiredDefault: boolean;
  ackDueDaysDefault: number;
  versionKindDefault: FleetDocumentVersionKind;
  hideWhenEmpty: boolean;
}

export const ACK_DUE_DAYS_MAX = 365;

export async function saveType(companyId: string, input: SaveTypeInput): Promise<FleetDocumentTypeRow> {
  const name = trimmed(input.name);
  if (!name) refuse('name_required');
  if (name.length > NAME_MAX) refuse('name_too_long');
  if (!input.sectionId) refuse('section_required');
  if (!Number.isInteger(input.ackDueDaysDefault) || input.ackDueDaysDefault < 1 || input.ackDueDaysDefault > ACK_DUE_DAYS_MAX) refuse('invalid_ack_due_days');
  if (input.versionKindDefault !== 'major' && input.versionKindDefault !== 'minor') refuse('invalid_version_kind');
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_type_save', {
    p_id: input.id,
    p_section_id: input.sectionId,
    p_name: name,
    p_ack_required_default: input.ackRequiredDefault,
    p_ack_due_days_default: input.ackDueDaysDefault,
    p_version_kind_default: input.versionKindDefault,
    p_hide_when_empty: input.hideWhenEmpty,
  });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentTypeRow>(data);
  check(
    !!row &&
      typeof row.id === 'string' &&
      (input.id === null || row.id === input.id) &&
      row.company_id === companyId &&
      row.section_id === input.sectionId &&
      row.name === name &&
      row.ack_required_default === input.ackRequiredDefault &&
      row.ack_due_days_default === input.ackDueDaysDefault &&
      row.version_kind_default === input.versionKindDefault &&
      row.hide_when_empty === input.hideWhenEmpty,
  );
  return row as FleetDocumentTypeRow;
}

export async function deleteType(companyId: string, id: string): Promise<FleetDocumentTypeRow> {
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_type_delete', { p_id: id });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentTypeRow>(data);
  check(!!row && row.id === id && row.company_id === companyId);
  return row as FleetDocumentTypeRow;
}

// ─── Documents (the publish flow, X5-04B) ───────────────────────────────

export interface CreateDocumentInput {
  typeId: string;
  title: string;
  description?: string | null;
  ackRequired?: boolean | null;
  ackDueDays?: number | null;
}

export async function createDocument(companyId: string, input: CreateDocumentInput): Promise<FleetDocumentRow> {
  const title = trimmed(input.title);
  if (!title) refuse('title_required');
  if (title.length > 160) refuse('title_too_long');
  const description = trimmed(input.description) || null;
  if (description && description.length > 2000) refuse('description_too_long');
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_create', {
    p_type_id: input.typeId,
    p_title: title,
    p_description: description,
    p_ack_required: input.ackRequired ?? null,
    p_ack_due_days: input.ackDueDays ?? null,
  });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentRow>(data);
  check(!!row && typeof row.id === 'string' && row.company_id === companyId && row.status === 'draft' && row.type_id === input.typeId && row.title === title);
  return row as FleetDocumentRow;
}

export interface AddVersionInput {
  documentId: string;
  fileObjectId: string;
  versionLabel?: string | null;
  versionKind?: FleetDocumentVersionKind | null;
  /** Date-only `yyyy-MM-dd` in local time (src/shared/lib/form.ts). */
  effectiveDate?: string | null;
  changeSummary?: string | null;
}

export async function addVersion(companyId: string, input: AddVersionInput): Promise<FleetDocumentVersionRow> {
  const label = trimmed(input.versionLabel) || null;
  if (label && label.length > 40) refuse('version_label_too_long');
  const summary = trimmed(input.changeSummary) || null;
  if (summary && summary.length > 1000) refuse('change_summary_too_long');
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_add_version', {
    p_document_id: input.documentId,
    p_file_object_id: input.fileObjectId,
    p_version_label: label,
    p_version_kind: input.versionKind ?? null,
    p_effective_date: input.effectiveDate ?? null,
    p_change_summary: summary,
  });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentVersionRow>(data);
  check(
    !!row &&
      row.company_id === companyId &&
      row.document_id === input.documentId &&
      row.file_object_id === input.fileObjectId &&
      row.state === 'draft' &&
      (label === null || row.version_label === label),
  );
  return row as FleetDocumentVersionRow;
}

export interface SetTargetsInput {
  documentId: string;
  targetMode: FleetDocumentTargetMode;
  /** Required (one or more) for 'selected'; ignored for 'all_including_future'. */
  vesselIds?: readonly string[];
}

export async function setTargets(companyId: string, input: SetTargetsInput): Promise<FleetDocumentRow> {
  const ids = input.targetMode === 'selected' ? [...new Set(input.vesselIds ?? [])] : [];
  if (input.targetMode === 'selected' && !ids.length) refuse('targets_required');
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_set_targets', {
    p_document_id: input.documentId,
    p_target_mode: input.targetMode,
    p_vessel_ids: input.targetMode === 'selected' ? ids : null,
  });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentRow>(data);
  check(!!row && row.id === input.documentId && row.company_id === companyId && row.target_mode === input.targetMode);
  return row as FleetDocumentRow;
}

export interface PublishInput {
  documentId: string;
  versionId: string;
  /** The document's updated_at as last read (the server refuses a stale one). */
  expectedUpdatedAt: string;
}

export async function publishDocument(companyId: string, input: PublishInput): Promise<FleetDocumentRow> {
  if (!input.expectedUpdatedAt) refuse('expected_updated_at_required');
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_publish', {
    p_document_id: input.documentId,
    p_version_id: input.versionId,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentRow>(data);
  check(!!row && row.id === input.documentId && row.company_id === companyId && row.status === 'published' && row.current_version_id === input.versionId);
  return row as FleetDocumentRow;
}

export async function withdrawDocument(companyId: string, input: { documentId: string; reason: string }): Promise<FleetDocumentRow> {
  const reason = trimmed(input.reason);
  if (!reason) refuse('reason_required');
  if (reason.length > 500) refuse('reason_too_long');
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_withdraw', { p_document_id: input.documentId, p_reason: reason });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentRow>(data);
  check(!!row && row.id === input.documentId && row.company_id === companyId && row.status === 'withdrawn' && row.withdrawn_reason === reason);
  return row as FleetDocumentRow;
}

export async function deleteDraftDocument(companyId: string, documentId: string): Promise<FleetDocumentRow> {
  const { data, error } = await fleetDocumentsDb.rpc('fleet_document_delete_draft', { p_document_id: documentId });
  if (error) throw toFleetDocumentError(error);
  const row = oneRow<FleetDocumentRow>(data);
  check(!!row && row.id === documentId && row.company_id === companyId);
  return row as FleetDocumentRow;
}

// ─── Hooks ──────────────────────────────────────────────────────────────

function useLibraryMutation<I, R>(
  companyId: string | null | undefined,
  run: (companyId: string, input: I) => Promise<R>,
  messages: { success: (row: R, input: I) => string; error: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: I) => {
      if (!companyId) return Promise.reject(new FleetDocumentRefusalError('no_company', 'Your account is not linked to a company.'));
      return run(companyId, input);
    },
    onSuccess: (row, input) => notify.success(messages.success(row, input)),
    onError: (error) => notify.error(error, { title: messages.error }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fleetDocumentKeys.company(companyId) }),
  });
}

export function useSaveSection(companyId: string | null | undefined) {
  return useLibraryMutation(companyId, saveSection, {
    success: (row, input) => (input.id ? `Section renamed to ${row.name}` : `Section ${row.name} added`),
    error: 'Could not save the section',
  });
}

export function useReorderSections(companyId: string | null | undefined) {
  return useLibraryMutation(companyId, reorderSections, { success: () => 'Section order saved', error: 'Could not move the section' });
}

export function useDeleteSection(companyId: string | null | undefined) {
  return useLibraryMutation(companyId, deleteSection, { success: (row) => `Section ${row.name} deleted`, error: 'Could not delete the section' });
}

export function useSaveType(companyId: string | null | undefined) {
  return useLibraryMutation(companyId, saveType, {
    success: (row, input) => (input.id ? `${row.name} saved` : `Document type ${row.name} added`),
    error: 'Could not save the document type',
  });
}

export function useDeleteType(companyId: string | null | undefined) {
  return useLibraryMutation(companyId, deleteType, { success: (row) => `Document type ${row.name} deleted`, error: 'Could not delete the document type' });
}
