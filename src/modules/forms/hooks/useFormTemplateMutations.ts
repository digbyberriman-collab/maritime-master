/**
 * Every change to a form template's status, version or per-vessel
 * settings goes through one of the catalogue's definers (gap/02 W2;
 * `20261124040500_fleet_form_templates.sql`; D-X5-13, D-X5-23): publish,
 * new version, customise, archive, delete a draft, move area, show / hide
 * on a vessel, reorder on a vessel. Content edits of a draft stay direct
 * writes (the guard allows them on drafts only).
 *
 * Each wrapper checks its input first with the server's own limits where
 * it can, then checks the row the definer returns against what was asked
 * (no row, another company, another status or value is not a save, so no
 * fake success). Refusals (22023 with a stable code, 42501, P0002, the
 * guard's 42501 *_guarded) become FormTemplateRefusalError with the
 * sentence from lib/templateMachine.ts; a missing definer (D-01) is the
 * `not_set_up` refusal.
 *
 * D-X5-20, the only fallback: while form_template_publish (and with it the
 * whole file, guard included) is missing, publishing and archiving keep
 * today's direct writes (`legacyPublishWrite`, `legacyArchiveWrite`),
 * checked the same way and refused when the template is not a draft or
 * fails the publish checks. Nothing else falls back: deleting, restoring
 * (a new version) and duplicating (customise) say they are not set up yet.
 * Once the file is applied the definers answer and the fallback never
 * runs, so it can never bypass the guard.
 *
 * `useFormTemplateMutations()` wraps them for the pages: it toasts the
 * outcome through notify() and invalidates the company's template queries
 * (and the ISM pages' own cache keys) whatever happened, because a refusal
 * can mean the screen was stale.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { isMissingRelationError as isMissingRelation, notify } from '@/shared/lib/notify';
import { isFormTemplateArea } from '../lib/areaModel';
import { publishBlocker } from '../lib/publishChecks';
import {
  ARCHIVE_REASON_MAX,
  HIDE_REASON_MAX,
  VERSION_LABEL_MAX,
  formTemplateRefusal,
  formTemplateTransition,
  normaliseFormTemplateStatus,
} from '../lib/templateMachine';
import type {
  FormTemplateArea,
  FormTemplateRow,
  FormTemplateVesselSettingRow,
  FormTemplateVisibility,
  FormsPendingColumns,
  FormsPendingFunctions,
  FormsPendingTables,
} from '../types/db.pending';
import { LEGACY_TEMPLATE_KEYS, formsKeys } from './keys';

/** The app's one client, typed with the catalogue's pending tables, columns and definers (D-01). */
export const formsDb = pendingClient<FormsPendingTables, NoPending, FormsPendingFunctions, FormsPendingColumns>();

export const NOT_SET_UP_MESSAGE = 'Template changes are not set up yet, so nothing was changed.';
export const NOT_SAVED_MESSAGE = 'The change was not saved. Refresh to see the current templates, then try again.';

/** A refusal or a failed check, with the sentence to show. */
export class FormTemplateRefusalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FormTemplateRefusalError';
  }
}

export const isFormTemplateNotSetUp = (error: unknown): boolean => error instanceof FormTemplateRefusalError && error.code === 'not_set_up';

const refuse = (code: string): never => {
  throw new FormTemplateRefusalError(code, formTemplateRefusal(code) ?? NOT_SAVED_MESSAGE);
};

/** A definer error as a refusal with a sentence (a missing definer is not_set_up); an unknown error is returned as it is. */
export function toFormTemplateError(error: { code?: string; message?: string } | null | undefined): unknown {
  if (!error) return new FormTemplateRefusalError('not_saved', NOT_SAVED_MESSAGE);
  if (isMissingRelation(error)) return new FormTemplateRefusalError('not_set_up', NOT_SET_UP_MESSAGE);
  const sentence = formTemplateRefusal(error.message);
  return sentence ? new FormTemplateRefusalError(error.message as string, sentence) : error;
}

/** The single row a definer returned (PostgREST returns a composite as an object, sometimes as a one-row array). */
function oneRow<T>(data: unknown): Partial<T> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? (row as Partial<T>) : null;
}

function check(ok: boolean): void {
  if (!ok) throw new FormTemplateRefusalError('not_saved', NOT_SAVED_MESSAGE);
}

const trimmedOrNull = (value: string | null | undefined): string | null => {
  const t = (value ?? '').trim();
  return t ? t : null;
};

// ─── Lifecycle (fleet checklist admins) ─────────────────────────────────────

export interface PublishInput {
  templateId: string;
  /** A controlled-document number (1–40); blank keeps the version number. */
  versionLabel?: string | null;
  /** The updated_at the publisher saw; the server refuses a stale one. */
  expectedUpdatedAt?: string | null;
}

export async function publishTemplate(companyId: string, input: PublishInput): Promise<FormTemplateRow> {
  const label = trimmedOrNull(input.versionLabel);
  if (label && label.length > VERSION_LABEL_MAX) refuse('version_label_too_long');
  const { data, error } = await formsDb.rpc('form_template_publish', {
    p_template_id: input.templateId,
    p_version_label: label,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  });
  if (error) throw toFormTemplateError(error);
  const row = oneRow<FormTemplateRow>(data);
  check(!!row && row.id === input.templateId && row.company_id === companyId && row.status === 'PUBLISHED' && (row.version_label ?? null) === label);
  return row as FormTemplateRow;
}

export async function newTemplateVersion(companyId: string, templateId: string): Promise<FormTemplateRow> {
  const { data, error } = await formsDb.rpc('form_template_new_version', { p_template_id: templateId });
  if (error) throw toFormTemplateError(error);
  const row = oneRow<FormTemplateRow>(data);
  check(!!row && typeof row.id === 'string' && row.id !== templateId && row.company_id === companyId && row.status === 'DRAFT' && row.supersedes_template_id === templateId);
  return row as FormTemplateRow;
}

export async function customiseTemplate(companyId: string, sourceTemplateId: string): Promise<FormTemplateRow> {
  const { data, error } = await formsDb.rpc('form_template_customise', { p_source_template_id: sourceTemplateId });
  if (error) throw toFormTemplateError(error);
  const row = oneRow<FormTemplateRow>(data);
  check(
    !!row && typeof row.id === 'string' && row.id !== sourceTemplateId && row.company_id === companyId && row.status === 'DRAFT'
      && row.source_template_id === sourceTemplateId && row.origin === 'company',
  );
  return row as FormTemplateRow;
}

export interface ArchiveInput {
  templateId: string;
  /** Optional (up to 500), kept in the history. */
  reason?: string | null;
}

export async function archiveTemplate(companyId: string, input: ArchiveInput): Promise<FormTemplateRow> {
  const reason = trimmedOrNull(input.reason);
  if (reason && reason.length > ARCHIVE_REASON_MAX) refuse('reason_too_long');
  const { data, error } = await formsDb.rpc('form_template_archive', { p_template_id: input.templateId, p_reason: reason });
  if (error) throw toFormTemplateError(error);
  const row = oneRow<FormTemplateRow>(data);
  check(!!row && row.id === input.templateId && row.company_id === companyId && row.status === 'ARCHIVED');
  return row as FormTemplateRow;
}

export async function deleteDraftTemplate(companyId: string, templateId: string): Promise<FormTemplateRow> {
  const { data, error } = await formsDb.rpc('form_template_delete_draft', { p_template_id: templateId });
  if (error) throw toFormTemplateError(error);
  const row = oneRow<FormTemplateRow>(data);
  check(!!row && row.id === templateId && row.company_id === companyId);
  return row as FormTemplateRow;
}

export interface MoveAreaInput {
  templateId: string;
  area: FormTemplateArea;
}

export async function moveTemplateArea(companyId: string, input: MoveAreaInput): Promise<FormTemplateRow> {
  if (!isFormTemplateArea(input.area)) refuse('invalid_area');
  const { data, error } = await formsDb.rpc('form_template_move_area', { p_template_id: input.templateId, p_area: input.area });
  if (error) throw toFormTemplateError(error);
  const row = oneRow<FormTemplateRow>(data);
  check(!!row && row.id === input.templateId && row.company_id === companyId && row.area === input.area);
  return row as FormTemplateRow;
}

// ─── Per vessel (vessel managers and fleet admins) ─────────────────────────

export interface VisibilityInput {
  templateId: string;
  vesselId: string;
  visibility: FormTemplateVisibility;
  /** Why it is hidden (up to 300); ignored when shown. */
  reason?: string | null;
}

export async function setTemplateVisibility(companyId: string, input: VisibilityInput): Promise<FormTemplateVesselSettingRow> {
  if (input.visibility !== 'shown' && input.visibility !== 'hidden') refuse('invalid_visibility');
  const reason = input.visibility === 'hidden' ? trimmedOrNull(input.reason) : null;
  if (reason && reason.length > HIDE_REASON_MAX) refuse('reason_too_long');
  const { data, error } = await formsDb.rpc('form_template_set_visibility', {
    p_template_id: input.templateId,
    p_vessel_id: input.vesselId,
    p_visibility: input.visibility,
    p_reason: reason,
  });
  if (error) throw toFormTemplateError(error);
  const row = oneRow<FormTemplateVesselSettingRow>(data);
  check(
    !!row && row.template_id === input.templateId && row.vessel_id === input.vesselId && row.company_id === companyId
      && row.visibility === input.visibility && (row.reason ?? null) === reason,
  );
  return row as FormTemplateVesselSettingRow;
}

export interface ReorderInput {
  vesselId: string;
  /** null = Unsorted. */
  area: FormTemplateArea | null;
  /** Every published template of the area on the vessel, in the new order. */
  templateIds: readonly string[];
}

export async function reorderTemplates(companyId: string, input: ReorderInput): Promise<FormTemplateVesselSettingRow[]> {
  if (input.area !== null && !isFormTemplateArea(input.area)) refuse('invalid_area');
  if (!input.templateIds.length || new Set(input.templateIds).size !== input.templateIds.length) refuse('reorder_mismatch');
  const { data, error } = await formsDb.rpc('form_template_reorder', {
    p_vessel_id: input.vesselId,
    p_area: input.area,
    p_template_ids: [...input.templateIds],
  });
  if (error) throw toFormTemplateError(error);
  const rows = (Array.isArray(data) ? data : []) as Partial<FormTemplateVesselSettingRow>[];
  check(
    rows.length === input.templateIds.length
      && rows.every((r, i) => r.template_id === input.templateIds[i] && r.vessel_id === input.vesselId && r.company_id === companyId && r.sort_order === i + 1),
  );
  return rows as FormTemplateVesselSettingRow[];
}

// ─── D-X5-20: today's publish and archive writes, only while the definers are missing ──

/** The live columns the fallback reads and checks (no catalogue column: those may be missing too). */
const LEGACY_COLUMNS = 'id, company_id, status, template_name, form_schema, vessel_scope, vessel_ids, published_at, archived_at';

type LegacyTemplate = {
  id: string;
  company_id: string;
  status: string;
  template_name: string;
  form_schema: unknown;
  vessel_scope: string | null;
  vessel_ids: string[] | null;
  published_at: string | null;
  archived_at: string | null;
};

async function readLegacy(companyId: string, templateId: string): Promise<LegacyTemplate> {
  const { data, error } = await formsDb.from('form_templates').select(LEGACY_COLUMNS).eq('id', templateId).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) refuse('template_not_found');
  return data as LegacyTemplate;
}

/** D-X5-20: today's publish write (a draft, after the publish checks), checked like the definer's answer. */
export async function legacyPublishWrite(companyId: string, userId: string, templateId: string): Promise<LegacyTemplate> {
  const current = await readLegacy(companyId, templateId);
  const status = normaliseFormTemplateStatus(current.status);
  const outcome = status ? formTemplateTransition(status, 'publish') : null;
  if (!outcome) refuse('not_saved');
  if (outcome && 'refusal' in outcome) refuse(outcome.refusal);
  const blocker = publishBlocker({
    templateName: current.template_name,
    formSchema: current.form_schema,
    vesselScope: current.vessel_scope,
    vesselIds: current.vessel_ids,
  });
  if (blocker) refuse(blocker);
  const { data, error } = await formsDb
    .from('form_templates')
    .update({ status: 'PUBLISHED', published_at: new Date().toISOString(), published_by: userId })
    .eq('id', templateId)
    .eq('company_id', companyId)
    .eq('status', 'DRAFT')
    .select(LEGACY_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  const row = data as LegacyTemplate | null;
  check(!!row && row.id === templateId && row.status === 'PUBLISHED');
  return row as LegacyTemplate;
}

/** D-X5-20: today's archive write, checked like the definer's answer. */
export async function legacyArchiveWrite(companyId: string, templateId: string): Promise<LegacyTemplate> {
  const current = await readLegacy(companyId, templateId);
  if (normaliseFormTemplateStatus(current.status) === 'ARCHIVED') refuse('already_archived');
  const { data, error } = await formsDb
    .from('form_templates')
    .update({ status: 'ARCHIVED', archived_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('company_id', companyId)
    .neq('status', 'ARCHIVED')
    .select(LEGACY_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  const row = data as LegacyTemplate | null;
  check(!!row && row.id === templateId && row.status === 'ARCHIVED');
  return row as LegacyTemplate;
}

export type WriteVia = 'definer' | 'legacy';

/** Publish through the definer; only when it is missing (D-01), today's write (D-X5-20). */
export async function publishTemplateWithFallback(companyId: string, userId: string, input: PublishInput): Promise<{ id: string; via: WriteVia }> {
  try {
    const row = await publishTemplate(companyId, input);
    return { id: row.id, via: 'definer' };
  } catch (error) {
    if (!isFormTemplateNotSetUp(error)) throw error;
    const row = await legacyPublishWrite(companyId, userId, input.templateId);
    return { id: row.id, via: 'legacy' };
  }
}

/** Archive through the definer; only when it is missing (D-01), today's write (D-X5-20). */
export async function archiveTemplateWithFallback(companyId: string, input: ArchiveInput): Promise<{ id: string; via: WriteVia }> {
  try {
    const row = await archiveTemplate(companyId, input);
    return { id: row.id, via: 'definer' };
  } catch (error) {
    if (!isFormTemplateNotSetUp(error)) throw error;
    const row = await legacyArchiveWrite(companyId, input.templateId);
    return { id: row.id, via: 'legacy' };
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────

function requireCompany(companyId: string | null | undefined): string {
  if (!companyId) refuse('not_permitted');
  return companyId as string;
}

export interface FormTemplateMutations {
  publish: UseMutationResult<{ id: string; via: WriteVia }, unknown, PublishInput>;
  newVersion: UseMutationResult<FormTemplateRow, unknown, string>;
  customise: UseMutationResult<FormTemplateRow, unknown, string>;
  archive: UseMutationResult<{ id: string; via: WriteVia }, unknown, ArchiveInput>;
  deleteDraft: UseMutationResult<FormTemplateRow, unknown, string>;
  moveArea: UseMutationResult<FormTemplateRow, unknown, MoveAreaInput>;
  setVisibility: UseMutationResult<FormTemplateVesselSettingRow, unknown, VisibilityInput>;
  reorder: UseMutationResult<FormTemplateVesselSettingRow[], unknown, ReorderInput>;
}

/**
 * The template mutations for the signed-in user's company. Each one
 * toasts its own outcome (`notify`); callers still get the result or the
 * refusal from `mutateAsync`.
 */
export function useFormTemplateMutations(): FormTemplateMutations {
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: formsKeys.company(companyId) });
    for (const key of LEGACY_TEMPLATE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
  };
  const failed = (title: string) => (error: unknown) => {
    notify.error(error, { title });
  };

  const publish = useMutation({
    mutationFn: (input: PublishInput) => {
      if (!userId) refuse('not_permitted');
      return publishTemplateWithFallback(requireCompany(companyId), userId as string, input);
    },
    onSuccess: () => notify.success('Template published'),
    onError: failed('Template not published'),
    onSettled: settle,
  });
  const newVersion = useMutation({
    mutationFn: (templateId: string) => newTemplateVersion(requireCompany(companyId), templateId),
    onSuccess: (row) => notify.success(`Draft of version ${row.version ?? 1} started`, { description: 'The published version keeps running until you publish the draft.' }),
    onError: failed('New version not started'),
    onSettled: settle,
  });
  const customise = useMutation({
    mutationFn: (sourceTemplateId: string) => customiseTemplate(requireCompany(companyId), sourceTemplateId),
    onSuccess: (row) => notify.success('Copy created as a draft', { description: row.template_code }),
    onError: failed('Copy not created'),
    onSettled: settle,
  });
  const archive = useMutation({
    mutationFn: (input: ArchiveInput) => archiveTemplateWithFallback(requireCompany(companyId), input),
    onSuccess: () => notify.success('Template archived', { description: 'Its runs stay in the records.' }),
    onError: failed('Template not archived'),
    onSettled: settle,
  });
  const deleteDraft = useMutation({
    mutationFn: (templateId: string) => deleteDraftTemplate(requireCompany(companyId), templateId),
    onSuccess: (row) => notify.success('Draft deleted', { description: row.template_name }),
    onError: failed('Draft not deleted'),
    onSettled: settle,
  });
  const moveArea = useMutation({
    mutationFn: (input: MoveAreaInput) => moveTemplateArea(requireCompany(companyId), input),
    onSuccess: () => notify.success('Template moved'),
    onError: failed('Template not moved'),
    onSettled: settle,
  });
  const setVisibility = useMutation({
    mutationFn: (input: VisibilityInput) => setTemplateVisibility(requireCompany(companyId), input),
    onSuccess: (row) => notify.success(row.visibility === 'hidden' ? 'Hidden on this vessel' : 'Shown on this vessel again'),
    onError: failed('Not changed on this vessel'),
    onSettled: settle,
  });
  const reorder = useMutation({
    mutationFn: (input: ReorderInput) => reorderTemplates(requireCompany(companyId), input),
    onSuccess: () => notify.success('Order saved'),
    onError: failed('Order not saved'),
    onSettled: settle,
  });

  return { publish, newVersion, customise, archive, deleteDraft, moveArea, setVisibility, reorder };
}
