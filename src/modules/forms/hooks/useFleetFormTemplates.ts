/**
 * The fleet catalogue reads and the draft save of the Forms & Checklists
 * pages (gap/02 FC1–FC6, W2; X5 spec X5-06B; DECISIONS D-01, D-04,
 * D-X5-13, D-X5-20).
 *
 * Every read goes through the module's typed pending client (`formsDb`)
 * with a key factory carrying the company (and the vessels, area and day
 * where a read depends on them), selects only the columns it needs and
 * is one request per list (no N+1). Nothing is read until the caller's
 * gate is open (`enabled`).
 *
 * - `useFormTemplateCatalogue`: the company's templates (live columns,
 *   never the form itself) and, in a select of their own, the catalogue
 *   columns of 040500. While those are missing every template is Unsorted
 *   (`areasSetUp: false`), never an error (D-01). RLS decides which drafts
 *   the reader sees.
 * - `useFormTemplateVesselSettings`: shown / hidden and order per vessel;
 *   a missing table is `not_set_up` (no hide or order controls).
 * - `useFormTemplateRunStats`: `form_template_run_stats` (FC6). Missing:
 *   `not_set_up`; 42501: `no_access` (the reader may not see runs on a
 *   vessel shown); anything else an error with Retry. Neither of the first
 *   two is retried.
 * - `useFormTemplateDetail`: one template with its form, for the builder
 *   and the preview; an unknown or unreadable id is `not_found`.
 * - `useFormTemplateDrafts`: the drafts with their forms, for the Drafts
 *   tab's "ready to publish" (the publish checks, lib/publishChecks.ts).
 * - `saveTemplateDraft` / `useSaveTemplateDraft`: a draft's content is a
 *   direct table write, which the 040500 guard allows on drafts only:
 *   insert a company DRAFT at version 1, or update a DRAFT with the
 *   `updated_at` the builder loaded (a stale save is refused, never
 *   overwritten). The returned row is checked (an empty answer is not a
 *   save); a refused or empty write says why. Status changes never happen
 *   here: publishing is `form_template_publish` (useFormTemplateMutations).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { isMissingRelationError, notify } from '@/shared/lib/notify';
import {
  CATALOGUE_COLUMNS,
  LIVE_LIST_COLUMNS,
  VESSEL_SETTING_COLUMNS,
  toCatalogueTemplates,
  toVesselSettings,
  type CatalogueColumnsInput,
  type CatalogueTemplate,
  type LiveTemplateInput,
  type VesselSetting,
  type VesselSettingInput,
} from '../lib/catalogueModel';
import { normaliseFormTemplateStatus } from '../lib/templateMachine';
import { draftPayload, suggestTemplateCode, type TemplateDetail, type TemplateFormValues } from '../lib/templateSchema';
import type { FormTemplateArea, FormTemplateRunStatRow } from '../types/db.pending';
import { FormTemplateRefusalError, NOT_SAVED_MESSAGE, formsDb, toFormTemplateError } from './useFormTemplateMutations';
import { LEGACY_TEMPLATE_KEYS, formsKeys } from './keys';

const STALE_MS = 30_000;

type Retry = () => void;

/** Retry a failed read once, never a "not set up" or a refusal. */
const retryOnce = (count: number, error: unknown) => {
  if (isMissingRelationError(error)) return false;
  const code = (error as { code?: string } | null)?.code;
  if (code === '42501' || code === '22023' || code === 'P0002') return false;
  return count < 1;
};

function useCompany() {
  const { profile, user } = useAuth();
  return { companyId: profile?.company_id ?? null, userId: user?.id ?? null };
}

// ─── The catalogue ─────────────────────────────────────────────────────

export type CatalogueState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: Retry }
  | { status: 'ready'; templates: CatalogueTemplate[]; areasSetUp: boolean; updatedAt: number; refreshing: boolean };

export async function fetchCatalogue(companyId: string): Promise<{ templates: CatalogueTemplate[]; areasSetUp: boolean }> {
  const [live, catalogue] = await Promise.all([
    formsDb.from('form_templates').select(LIVE_LIST_COLUMNS).eq('company_id', companyId).order('template_name'),
    formsDb.from('form_templates').select(CATALOGUE_COLUMNS).eq('company_id', companyId),
  ]);
  if (live.error) throw live.error;
  let areasSetUp = true;
  if (catalogue.error) {
    if (!isMissingRelation(catalogue.error)) throw catalogue.error;
    areasSetUp = false;
  }
  const rows = (live.data ?? []) as unknown as LiveTemplateInput[];
  const extra = areasSetUp ? ((catalogue.data ?? []) as unknown as CatalogueColumnsInput[]) : null;
  return { templates: toCatalogueTemplates(rows, extra), areasSetUp };
}

/** The company's templates; `enabled` false (the gate is closed or loading) sends nothing. */
export function useFormTemplateCatalogue(enabled = true): CatalogueState {
  const { companyId } = useCompany();
  const query = useQuery({
    queryKey: formsKeys.templates(companyId),
    queryFn: () => fetchCatalogue(companyId as string),
    enabled: enabled && !!companyId,
    staleTime: STALE_MS,
    retry: retryOnce,
  });
  if (query.data) {
    return { status: 'ready', templates: query.data.templates, areasSetUp: query.data.areasSetUp, updatedAt: query.dataUpdatedAt, refreshing: query.isFetching };
  }
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  return { status: 'loading' };
}

// ─── Per-vessel settings ───────────────────────────────────────────────

export type VesselSettingsState =
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'error'; error: unknown; retry: Retry }
  | { status: 'ready'; settings: VesselSetting[]; updatedAt: number };

const NOT_SET_UP = Symbol('not_set_up');

/** Shown / hidden and order on `vesselIds` (null: every vessel the reader may see). */
export function useFormTemplateVesselSettings(vesselIds: readonly string[] | null, enabled = true): VesselSettingsState {
  const { companyId } = useCompany();
  const query = useQuery({
    queryKey: formsKeys.vesselSettings(companyId, vesselIds),
    queryFn: async (): Promise<VesselSetting[] | typeof NOT_SET_UP> => {
      let q = formsDb.from('form_template_vessel_settings').select(VESSEL_SETTING_COLUMNS).eq('company_id', companyId as string);
      if (vesselIds) q = q.in('vessel_id', [...vesselIds]);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelation(error)) return NOT_SET_UP;
        throw error;
      }
      return toVesselSettings((data ?? []) as unknown as VesselSettingInput[]);
    },
    enabled: enabled && !!companyId && (vesselIds === null || vesselIds.length > 0),
    staleTime: STALE_MS,
    retry: retryOnce,
  });
  if (vesselIds !== null && vesselIds.length === 0) return { status: 'ready', settings: [], updatedAt: Date.now() };
  if (query.data === NOT_SET_UP) return { status: 'not_set_up' };
  if (query.data) return { status: 'ready', settings: query.data, updatedAt: query.dataUpdatedAt };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  return { status: 'loading' };
}

// ─── Run statistics ────────────────────────────────────────────────────

export type RunStatsState =
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'no_access' }
  | { status: 'error'; error: unknown; retry: Retry }
  | { status: 'ready'; stats: FormTemplateRunStatRow[]; updatedAt: number };

const NO_ACCESS = Symbol('no_access');

/**
 * Runs per template and vessel (`form_template_run_stats`): `vesselIds`
 * null = every counted vessel the reader reaches (the server's default);
 * `area` null = every area. `today` is the reader's local day.
 */
export function useFormTemplateRunStats(vesselIds: readonly string[] | null, area: FormTemplateArea | null, today: string, enabled = true): RunStatsState {
  const { companyId } = useCompany();
  const query = useQuery({
    queryKey: formsKeys.runStats(companyId, vesselIds, area, today),
    queryFn: async (): Promise<FormTemplateRunStatRow[] | typeof NOT_SET_UP | typeof NO_ACCESS> => {
      const { data, error } = await formsDb.rpc('form_template_run_stats', {
        p_vessel_ids: vesselIds ? [...vesselIds] : null,
        p_area: area,
        p_today: today,
      });
      if (error) {
        if (isMissingRelation(error)) return NOT_SET_UP;
        if (error.code === '42501') return NO_ACCESS;
        throw error;
      }
      return ((Array.isArray(data) ? data : []) as FormTemplateRunStatRow[]).map((r) => ({ ...r, runs: Number(r.runs) || 0 }));
    },
    enabled: enabled && !!companyId && (vesselIds === null || vesselIds.length > 0),
    staleTime: STALE_MS,
    retry: retryOnce,
  });
  if (vesselIds !== null && vesselIds.length === 0) return { status: 'ready', stats: [], updatedAt: Date.now() };
  if (query.data === NOT_SET_UP) return { status: 'not_set_up' };
  if (query.data === NO_ACCESS) return { status: 'no_access' };
  if (query.data) return { status: 'ready', stats: query.data, updatedAt: query.dataUpdatedAt };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  return { status: 'loading' };
}

// ─── One template ──────────────────────────────────────────────────────

export type TemplateDetailState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; error: unknown; retry: Retry }
  | { status: 'ready'; template: TemplateDetail; areasSetUp: boolean };

const NOT_FOUND = Symbol('not_found');

export async function fetchTemplateDetail(companyId: string, templateId: string): Promise<{ template: TemplateDetail; areasSetUp: boolean } | typeof NOT_FOUND> {
  const [live, catalogue] = await Promise.all([
    formsDb.from('form_templates').select(`${LIVE_LIST_COLUMNS}, form_schema`).eq('company_id', companyId).eq('id', templateId).maybeSingle(),
    formsDb.from('form_templates').select(CATALOGUE_COLUMNS).eq('company_id', companyId).eq('id', templateId).maybeSingle(),
  ]);
  if (live.error) throw live.error;
  if (!live.data) return NOT_FOUND;
  let areasSetUp = true;
  if (catalogue.error) {
    if (!isMissingRelation(catalogue.error)) throw catalogue.error;
    areasSetUp = false;
  }
  const row = live.data as unknown as LiveTemplateInput & { form_schema: unknown };
  const extra = areasSetUp && catalogue.data ? [catalogue.data as unknown as CatalogueColumnsInput] : areasSetUp ? [] : null;
  const [template] = toCatalogueTemplates([row], extra);
  if (!template) return NOT_FOUND;
  return { template: { ...template, formSchema: row.form_schema }, areasSetUp };
}

/** One template with its form; `templateId` null or `enabled` false sends nothing. */
export function useFormTemplateDetail(templateId: string | null | undefined, enabled = true): TemplateDetailState {
  const { companyId } = useCompany();
  const query = useQuery({
    queryKey: formsKeys.template(companyId, templateId),
    queryFn: () => fetchTemplateDetail(companyId as string, templateId as string),
    enabled: enabled && !!companyId && !!templateId,
    staleTime: STALE_MS,
    retry: retryOnce,
  });
  if (query.data === NOT_FOUND) return { status: 'not_found' };
  if (query.data) return { status: 'ready', template: query.data.template, areasSetUp: query.data.areasSetUp };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  return { status: 'loading' };
}

// ─── Drafts and their readiness ────────────────────────────────────────

export interface DraftForm {
  id: string;
  formSchema: unknown;
  vesselScope: string | null;
  vesselIds: string[] | null;
  name: string;
}

export type DraftFormsState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: Retry }
  | { status: 'ready'; drafts: DraftForm[] };

/** The drafts the reader may see, with their forms (for the publish checks). */
export function useFormTemplateDrafts(enabled = true): DraftFormsState {
  const { companyId } = useCompany();
  const query = useQuery({
    queryKey: [...formsKeys.company(companyId), 'drafts'] as const,
    queryFn: async (): Promise<DraftForm[]> => {
      const { data, error } = await formsDb
        .from('form_templates')
        .select('id, template_name, form_schema, vessel_scope, vessel_ids')
        .eq('company_id', companyId as string)
        .eq('status', 'DRAFT');
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{ id: string; template_name: string | null; form_schema: unknown; vessel_scope: string | null; vessel_ids: string[] | null }>).map((r) => ({
        id: r.id,
        name: r.template_name ?? '',
        formSchema: r.form_schema,
        vesselScope: r.vessel_scope,
        vesselIds: r.vessel_ids,
      }));
    },
    enabled: enabled && !!companyId,
    staleTime: STALE_MS,
    retry: retryOnce,
  });
  if (query.data) return { status: 'ready', drafts: query.data };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  return { status: 'loading' };
}

// ─── Saving a draft ────────────────────────────────────────────────────

export const CODE_TAKEN_MESSAGE = 'Another template already uses this code. Change the code and save again.';
export const DRAFT_NOT_PERMITTED_MESSAGE =
  'Your account cannot save template drafts yet. A fleet admin with template editing can save it, or give you access.';
export const NO_LONGER_DRAFT_MESSAGE = 'This template is no longer a draft, so it was not changed. Reload it to see the published version.';

export interface SaveDraftInput {
  /** null: a new template. */
  templateId: string | null;
  values: TemplateFormValues;
  areasSetUp: boolean;
  /** The template as loaded (its form, form type, code and version), for an edit. */
  current: TemplateDetail | null;
  /** The `updated_at` the builder loaded: the save is refused if someone changed it since. */
  expectedUpdatedAt: string | null;
  /** Codes in use, for a code made from the name. */
  usedCodes: readonly string[];
}

export interface SavedDraft {
  id: string;
  updatedAt: string | null;
  code: string;
  created: boolean;
}

/** A draft's code can change only while it is the first version (a later version keeps its family's code). */
export const codeEditable = (current: Pick<TemplateDetail, 'version' | 'supersedesTemplateId'> | null): boolean =>
  !current || (current.version <= 1 && !current.supersedesTemplateId);

function saveError(error: { code?: string; message?: string }): unknown {
  if (error.code === '23505') return new FormTemplateRefusalError('code_taken', CODE_TAKEN_MESSAGE);
  const mapped = toFormTemplateError(error);
  if (mapped instanceof FormTemplateRefusalError) return mapped;
  // Row-level security refused the write (the live table policies): this reader cannot write drafts.
  if (error.code === '42501') return new FormTemplateRefusalError('draft_not_permitted', DRAFT_NOT_PERMITTED_MESSAGE);
  return mapped;
}

/** Why an update changed nothing: gone, no longer a draft, changed since, or not this reader's to change. */
async function emptyUpdateReason(companyId: string, templateId: string, expectedUpdatedAt: string | null): Promise<FormTemplateRefusalError> {
  const { data, error } = await formsDb.from('form_templates').select('id, status, updated_at').eq('company_id', companyId).eq('id', templateId).maybeSingle();
  if (error) return new FormTemplateRefusalError('not_saved', NOT_SAVED_MESSAGE);
  const row = data as { id: string; status: string | null; updated_at: string | null } | null;
  if (!row) return new FormTemplateRefusalError('template_not_found', toFormTemplateMessage('template_not_found'));
  if (normaliseFormTemplateStatus(row.status) !== 'DRAFT') return new FormTemplateRefusalError('no_longer_draft', NO_LONGER_DRAFT_MESSAGE);
  if (expectedUpdatedAt && row.updated_at && Date.parse(row.updated_at) !== Date.parse(expectedUpdatedAt)) {
    return new FormTemplateRefusalError('stale_template', toFormTemplateMessage('stale_template'));
  }
  return new FormTemplateRefusalError('draft_not_permitted', DRAFT_NOT_PERMITTED_MESSAGE);
}

function toFormTemplateMessage(code: string): string {
  const mapped = toFormTemplateError({ code: '22023', message: code });
  return mapped instanceof FormTemplateRefusalError ? mapped.message : NOT_SAVED_MESSAGE;
}

/** Save a draft's content (never its status). */
export async function saveTemplateDraft(companyId: string, userId: string, input: SaveDraftInput): Promise<SavedDraft> {
  const { values, current } = input;
  const editable = codeEditable(current);
  const code = editable ? values.code.trim() || current?.code || suggestTemplateCode(values.name, values.area, input.usedCodes) : (current?.code ?? '');
  const { live, catalogue } = draftPayload(values, { areasSetUp: input.areasSetUp, current, code });

  if (!input.templateId) {
    const { data, error } = await formsDb
      .from('form_templates')
      .insert({ ...live, ...(catalogue ?? {}), company_id: companyId, status: 'DRAFT', created_by: userId })
      .select('id, company_id, status, updated_at')
      .maybeSingle();
    if (error) throw saveError(error);
    const row = data as { id: string; company_id: string; status: string; updated_at: string | null } | null;
    if (!row || row.company_id !== companyId || normaliseFormTemplateStatus(row.status) !== 'DRAFT') {
      throw new FormTemplateRefusalError('not_saved', NOT_SAVED_MESSAGE);
    }
    return { id: row.id, updatedAt: row.updated_at, code, created: true };
  }

  const { template_code, ...content } = live;
  const patch = { ...content, ...(editable ? { template_code } : {}), ...(catalogue ?? {}) };
  let q = formsDb.from('form_templates').update(patch).eq('id', input.templateId).eq('company_id', companyId).eq('status', 'DRAFT');
  if (input.expectedUpdatedAt) q = q.eq('updated_at', input.expectedUpdatedAt);
  const { data, error } = await q.select('id, status, updated_at').maybeSingle();
  if (error) throw saveError(error);
  const row = data as { id: string; status: string; updated_at: string | null } | null;
  if (!row) throw await emptyUpdateReason(companyId, input.templateId, input.expectedUpdatedAt);
  if (row.id !== input.templateId || normaliseFormTemplateStatus(row.status) !== 'DRAFT') throw new FormTemplateRefusalError('not_saved', NOT_SAVED_MESSAGE);
  return { id: row.id, updatedAt: row.updated_at, code, created: false };
}

/** The draft save for the builder: toasts its outcome and refreshes the catalogue whatever happened. */
export function useSaveTemplateDraft() {
  const { companyId, userId } = useCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveDraftInput) => {
      if (!companyId || !userId) throw new FormTemplateRefusalError('not_permitted', toFormTemplateMessage('not_permitted'));
      return saveTemplateDraft(companyId, userId, input);
    },
    onSuccess: (saved) => notify.success(saved.created ? 'Draft created' : 'Draft saved', { description: 'Crews do not see it until it is published.' }),
    onError: (error) => notify.error(error, { title: 'Draft not saved' }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: formsKeys.company(companyId) });
      for (const key of LEGACY_TEMPLATE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
    },
  });
}
