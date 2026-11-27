/**
 * Familiarisation reads and writes (X1-10; gap/04 C63, W11). Every call is
 * an RPC of 20261124061000_crew_familiarisation.sql through the training
 * module's pending client; nothing writes the tables directly (the guards
 * refuse it).
 *
 * - useFamiliarisationOverview(vessel, { all }): the vessel's templates with
 *   their counts, the latest (or all) records, the crew a record can be
 *   started for and what the caller may do (familiarisation_vessel_overview,
 *   familiarisation.view).
 * - useFamiliarisationRecord(recordId): one record with its items and the
 *   caller's rights (familiarisation_record_detail: the person's own record
 *   with view_own, else familiarisation.view; P0002 otherwise).
 * - The writes (template save, start, tick, sign, reopen, delete), each
 *   checked against what the server answered (the template or record it
 *   returned, the id it deleted): never a quiet success. A confirmed write
 *   refreshes the vessel's familiarisation and its crew compliance (a
 *   completed record counts in Met, C36).
 *
 * D-01. While 061000 is not applied the RPCs are missing: the reads end in
 * FamiliarisationNotSetUp (the page falls back to the legacy tab with an
 * info strip) and the writes refuse with the same notice. Any other error
 * is an error state with Retry. Nothing is mocked.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMissingRelation } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
import { trainingRpc, type TrainingRpcName } from '@/modules/training/lib/trainingDb';
import { crewKeys } from './crewKeys';
import { complianceKeys } from './useVesselCompliance';
import {
  FAMILIARISATION_REFUSALS,
  isFamiliarisationStatus,
  type FamiliarisationSection,
  type FamiliarisationStatus,
} from '../lib/familiarisation';

export const OVERVIEW_RPC = 'familiarisation_vessel_overview';
export const RECORD_RPC = 'familiarisation_record_detail';

export const FAMILIARISATION_NOT_SET_UP_NOTICE =
  'Familiarisation per vessel and position becomes available once the crew update is applied.';

const NONE = 'none';

/** Keys of the familiarisation reads, under the vessel (crewKeys.vessel): a vessel switch never shares an entry. */
export const familiarisationKeys = {
  vessel: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...crewKeys.vessel(companyId, vesselId), 'familiarisation'] as const,
  overview: (companyId: string | null | undefined, vesselId: string | null | undefined, all: boolean) =>
    [...familiarisationKeys.vessel(companyId, vesselId), 'overview', all ? 'all' : 'recent'] as const,
  record: (companyId: string | null | undefined, vesselId: string | null | undefined, recordId: string | null | undefined) =>
    [...familiarisationKeys.vessel(companyId, vesselId), 'record', recordId ?? NONE] as const,
};

// ---------------------------------------------------------------- errors

/** 061000 is not applied (D-01). */
export class FamiliarisationNotSetUp extends Error {
  constructor() {
    super(FAMILIARISATION_NOT_SET_UP_NOTICE);
    this.name = 'FamiliarisationNotSetUp';
  }
}

/** The server answered something that is not the contract. */
export class FamiliarisationAnswerError extends Error {
  readonly answer: unknown;
  constructor(message: string, answer: unknown) {
    super(message);
    this.name = 'FamiliarisationAnswerError';
    this.answer = answer;
  }
}

interface PostgrestLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

const codeOf = (error: unknown): string | null =>
  error !== null && typeof error === 'object' && typeof (error as PostgrestLike).code === 'string' ? ((error as PostgrestLike).code as string) : null;

const detailOf = (error: unknown): string | null => {
  if (error === null || typeof error !== 'object') return null;
  const d = (error as PostgrestLike).details;
  return typeof d === 'string' && d.trim() !== '' && !/^[a-z0-9_]+$/.test(d.trim()) ? d.trim() : null;
};

const messageOf = (error: unknown): string | null => {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === 'object' && typeof (error as PostgrestLike).message === 'string') return (error as PostgrestLike).message as string;
  return null;
};

/** A missing RPC or relation of 061000 (D-01). */
export function familiarisationNotApplied(error: unknown): boolean {
  if (error instanceof FamiliarisationNotSetUp) return true;
  if (error === null || typeof error !== 'object') return false;
  return isMissingRelation(error as { code: string; message: string });
}

/** No access: 42501 (or the record is not visible, P0002, on the record page). */
export const isFamiliarisationDenied = (error: unknown): boolean => codeOf(error) === '42501';
export const isFamiliarisationNotFound = (error: unknown): boolean => codeOf(error) === 'P0002';

/**
 * One STORM sentence for a refused familiarisation write: the server's DETAIL
 * when it sent one, else the code's sentence, else the message.
 */
export function familiarisationRefusalMessage(error: unknown): string {
  if (familiarisationNotApplied(error)) return FAMILIARISATION_NOT_SET_UP_NOTICE;
  const detail = detailOf(error);
  if (detail) return detail;
  const message = messageOf(error)?.trim() ?? '';
  if (FAMILIARISATION_REFUSALS[message]) return FAMILIARISATION_REFUSALS[message];
  if (message && !/^[a-z0-9_]+$/.test(message)) return message;
  return codeOf(error) === '42501' ? FAMILIARISATION_REFUSALS.not_permitted : 'That did not work. Try again.';
}

/** The field a refusal names (PostgREST `hint`, e.g. "name", "sections.2"). */
export function familiarisationRefusalHint(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null;
  const h = (error as { hint?: unknown }).hint;
  return typeof h === 'string' && h.trim() !== '' ? h.trim() : null;
}

const noRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof FamiliarisationNotSetUp || error instanceof FamiliarisationAnswerError) return false;
  const code = codeOf(error);
  return code !== '42501' && code !== 'P0002' && code !== '22023' && failureCount < 1;
};

// ---------------------------------------------------------------- parsing

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;
const reqStr = (o: Obj, key: string, answer: unknown): string => {
  const v = str(o[key]);
  if (v === null) throw new FamiliarisationAnswerError(`The familiarisation answer has no ${key}.`, answer);
  return v;
};

export interface FamiliarisationTemplate {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  scope: 'fleet' | 'vessel';
  vesselId: string | null;
  variantOf: string | null;
  dueWithinDays: number | null;
  requiresCrewSignature: boolean;
  requiresSupervisorSignature: boolean;
  isActive: boolean;
  sections: FamiliarisationSection[];
  itemCount: number;
  positionIds: string[];
  /** Applies on this vessel (active, and not replaced here by a variant). */
  applies: boolean;
  /** A fleet template this vessel replaced with its own variant. */
  replacedByVariant: boolean;
  completed: number;
  inProgress: number;
  overdue: number;
  missing: number;
  required: number;
  updatedAt: string | null;
}

export interface FamiliarisationRecordSummary {
  id: string;
  templateId: string | null;
  templateCode: string | null;
  templateName: string;
  profileId: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  hasLogin: boolean;
  status: FamiliarisationStatus;
  joinDate: string | null;
  dueDate: string | null;
  overdue: boolean;
  itemsTotal: number;
  itemsDone: number;
  crewSignedAt: string | null;
  supervisorSignedAt: string | null;
  requiresCrewSignature: boolean;
  requiresSupervisorSignature: boolean;
  completedOn: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FamiliarisationMember {
  profileId: string;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  hasLogin: boolean;
  placementKind: string | null;
  joinDate: string | null;
  positionId: string | null;
  positionName: string | null;
}

export interface FamiliarisationOverview {
  vesselId: string;
  companyId: string;
  today: string | null;
  canCreate: boolean;
  canEditTemplates: boolean;
  canEditFleetTemplates: boolean;
  templates: FamiliarisationTemplate[];
  records: FamiliarisationRecordSummary[];
  recordsTotal: number;
  members: FamiliarisationMember[];
}

const parseSections = (v: unknown): FamiliarisationSection[] => {
  if (!Array.isArray(v)) return [];
  const out: FamiliarisationSection[] = [];
  for (const s of v) {
    if (!isObj(s)) continue;
    const name = str(s.section_name) ?? 'Checklist';
    const items = Array.isArray(s.checklist_items) ? s.checklist_items.filter((x): x is string => typeof x === 'string') : [];
    const section: FamiliarisationSection = { section_name: name, checklist_items: items };
    if (typeof s.required_days === 'number') section.required_days = s.required_days;
    out.push(section);
  }
  return out;
};

const statusOf = (v: unknown, answer: unknown): FamiliarisationStatus => {
  if (!isFamiliarisationStatus(v)) throw new FamiliarisationAnswerError(`Unknown familiarisation status ${String(v)}.`, answer);
  return v;
};

export function parseTemplate(t: unknown, answer: unknown = t): FamiliarisationTemplate {
  if (!isObj(t)) throw new FamiliarisationAnswerError('A familiarisation template could not be read.', answer);
  const scope = t.scope === 'fleet' ? 'fleet' : t.scope === 'vessel' ? 'vessel' : null;
  if (!scope) throw new FamiliarisationAnswerError('A familiarisation template has no scope.', answer);
  return {
    id: reqStr(t, 'id', answer),
    code: str(t.code),
    name: str(t.name) ?? 'Familiarisation',
    description: str(t.description),
    scope,
    vesselId: str(t.vessel_id),
    variantOf: str(t.variant_of),
    dueWithinDays: typeof t.due_within_days === 'number' ? t.due_within_days : null,
    requiresCrewSignature: t.requires_crew_signature !== false,
    requiresSupervisorSignature: t.requires_supervisor_signature !== false,
    isActive: t.is_active !== false,
    sections: parseSections(t.sections),
    itemCount: num(t.item_count),
    positionIds: Array.isArray(t.position_ids) ? t.position_ids.filter((x): x is string => typeof x === 'string') : [],
    applies: t.applies === undefined ? t.is_active !== false : bool(t.applies),
    replacedByVariant: bool(t.replaced_by_variant),
    completed: num(t.completed),
    inProgress: num(t.in_progress),
    overdue: num(t.overdue),
    missing: num(t.missing),
    required: num(t.required),
    updatedAt: str(t.updated_at),
  };
}

function parseRecordSummary(r: unknown, answer: unknown): FamiliarisationRecordSummary {
  if (!isObj(r)) throw new FamiliarisationAnswerError('A familiarisation record could not be read.', answer);
  return {
    id: reqStr(r, 'id', answer),
    templateId: str(r.template_id),
    templateCode: str(r.template_code),
    templateName: str(r.template_name) ?? 'Familiarisation',
    profileId: str(r.profile_id),
    firstName: str(r.first_name),
    lastName: str(r.last_name),
    preferredName: str(r.preferred_name),
    hasLogin: bool(r.has_login),
    status: statusOf(r.status, answer),
    joinDate: str(r.join_date),
    dueDate: str(r.due_date),
    overdue: bool(r.overdue),
    itemsTotal: num(r.items_total),
    itemsDone: num(r.items_done),
    crewSignedAt: str(r.crew_signed_at),
    supervisorSignedAt: str(r.supervisor_signed_at),
    requiresCrewSignature: r.requires_crew_signature !== false,
    requiresSupervisorSignature: r.requires_supervisor_signature !== false,
    completedOn: str(r.completed_on),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function parseOverview(answer: unknown): FamiliarisationOverview {
  if (!isObj(answer)) throw new FamiliarisationAnswerError('The familiarisation overview could not be read.', answer);
  const templates = Array.isArray(answer.templates) ? answer.templates.map((t) => parseTemplate(t, answer)) : [];
  const records = Array.isArray(answer.records) ? answer.records.map((r) => parseRecordSummary(r, answer)) : [];
  const members: FamiliarisationMember[] = Array.isArray(answer.members)
    ? answer.members.filter(isObj).map((m) => ({
        profileId: reqStr(m, 'profile_id', answer),
        firstName: str(m.first_name),
        lastName: str(m.last_name),
        preferredName: str(m.preferred_name),
        hasLogin: bool(m.has_login),
        placementKind: str(m.placement_kind),
        joinDate: str(m.join_date),
        positionId: str(m.position_id),
        positionName: str(m.position_name),
      }))
    : [];
  return {
    vesselId: reqStr(answer, 'vessel_id', answer),
    companyId: reqStr(answer, 'company_id', answer),
    today: str(answer.today),
    canCreate: bool(answer.can_create),
    canEditTemplates: bool(answer.can_edit_templates),
    canEditFleetTemplates: bool(answer.can_edit_fleet_templates),
    templates,
    records,
    recordsTotal: typeof answer.records_total === 'number' ? answer.records_total : records.length,
    members,
  };
}

export interface FamiliarisationItem {
  id: string;
  sectionName: string;
  itemText: string;
  itemOrder: number;
  completed: boolean;
  completedDate: string | null;
  completedByName: string | null;
  notes: string | null;
}

/** Each action: 'ok' or the refusal code the server would answer (lib/familiarisation checkAction / decideActor). */
export interface FamiliarisationRights {
  tick: string;
  signCrew: string;
  signSupervisor: string;
  reopen: string;
  delete: string;
  isOwn: boolean;
}

export interface FamiliarisationRecordDetail {
  id: string;
  companyId: string;
  vesselId: string;
  vesselName: string | null;
  templateId: string | null;
  templateCode: string | null;
  templateName: string;
  templateDescription: string | null;
  templateScope: 'fleet' | 'vessel' | null;
  profileId: string | null;
  person: { firstName: string | null; lastName: string | null; preferredName: string | null; avatarUrl: string | null; hasLogin: boolean };
  status: FamiliarisationStatus;
  joinDate: string | null;
  dueDate: string | null;
  overdue: boolean;
  completedOn: string | null;
  itemsTotal: number;
  itemsDone: number;
  requiresCrewSignature: boolean;
  requiresSupervisorSignature: boolean;
  crewSignedAt: string | null;
  crewSignedByName: string | null;
  supervisorSignedAt: string | null;
  supervisorSignedByName: string | null;
  reopenedAt: string | null;
  reopenedReason: string | null;
  reopenedByName: string | null;
  items: FamiliarisationItem[];
  rights: FamiliarisationRights;
}

export function parseRecordDetail(answer: unknown): FamiliarisationRecordDetail {
  if (!isObj(answer)) throw new FamiliarisationAnswerError('The familiarisation record could not be read.', answer);
  const person = isObj(answer.person) ? answer.person : {};
  const rights = isObj(answer.rights) ? answer.rights : {};
  const right = (k: string): string => str(rights[k]) ?? 'not_permitted';
  const items: FamiliarisationItem[] = Array.isArray(answer.items)
    ? answer.items.filter(isObj).map((i) => ({
        id: reqStr(i, 'id', answer),
        sectionName: str(i.section_name) ?? 'Checklist',
        itemText: str(i.item_text) ?? '',
        itemOrder: num(i.item_order),
        completed: bool(i.completed),
        completedDate: str(i.completed_date),
        completedByName: str(i.completed_by_name),
        notes: str(i.notes),
      }))
    : [];
  const scope = answer.template_scope === 'fleet' || answer.template_scope === 'vessel' ? answer.template_scope : null;
  return {
    id: reqStr(answer, 'id', answer),
    companyId: reqStr(answer, 'company_id', answer),
    vesselId: reqStr(answer, 'vessel_id', answer),
    vesselName: str(answer.vessel_name),
    templateId: str(answer.template_id),
    templateCode: str(answer.template_code),
    templateName: str(answer.template_name) ?? 'Familiarisation',
    templateDescription: str(answer.template_description),
    templateScope: scope,
    profileId: str(answer.profile_id),
    person: {
      firstName: str(person.first_name),
      lastName: str(person.last_name),
      preferredName: str(person.preferred_name),
      avatarUrl: str(person.avatar_url),
      hasLogin: bool(person.has_login),
    },
    status: statusOf(answer.status, answer),
    joinDate: str(answer.join_date),
    dueDate: str(answer.due_date),
    overdue: bool(answer.overdue),
    completedOn: str(answer.completed_on),
    itemsTotal: num(answer.items_total),
    itemsDone: num(answer.items_done),
    requiresCrewSignature: answer.requires_crew_signature !== false,
    requiresSupervisorSignature: answer.requires_supervisor_signature !== false,
    crewSignedAt: str(answer.crew_signed_at),
    crewSignedByName: str(answer.crew_signed_by_name),
    supervisorSignedAt: str(answer.supervisor_signed_at),
    supervisorSignedByName: str(answer.supervisor_signed_by_name),
    reopenedAt: str(answer.reopened_at),
    reopenedReason: str(answer.reopened_reason),
    reopenedByName: str(answer.reopened_by_name),
    items,
    rights: {
      tick: right('tick'),
      signCrew: right('sign_crew'),
      signSupervisor: right('sign_supervisor'),
      reopen: right('reopen'),
      delete: right('delete'),
      isOwn: bool(rights.is_own),
    },
  };
}

/** The person's name for lists: preferred (else first) name and last name. */
export function personName(p: { firstName: string | null; lastName: string | null; preferredName?: string | null }): string {
  const first = p.preferredName ?? p.firstName;
  const name = [first, p.lastName].filter((x): x is string => Boolean(x && x.trim())).join(' ');
  return name || 'Unnamed crew member';
}

// ---------------------------------------------------------------- reads

export interface FamiliarisationVessel {
  id: string;
  companyId: string;
}

export type FamiliarisationState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up'; notice: string }
  | { status: 'denied'; notice: string | null }
  | { status: 'not_found' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; data: T; refetching: boolean; refetch: () => void };

async function rpcJson(fn: TrainingRpcName, args: Record<string, unknown>): Promise<Json> {
  const { data, error } = await trainingRpc(fn, args);
  if (error) {
    if (familiarisationNotApplied(error)) throw new FamiliarisationNotSetUp();
    throw error;
  }
  return data as Json;
}

export async function fetchOverview(vesselId: string, all: boolean): Promise<FamiliarisationOverview> {
  return parseOverview(await rpcJson('familiarisation_vessel_overview', { p_vessel_id: vesselId, p_all: all }));
}

export async function fetchRecordDetail(recordId: string): Promise<FamiliarisationRecordDetail> {
  return parseRecordDetail(await rpcJson('familiarisation_record_detail', { p_record_id: recordId }));
}

function toState<T>(enabled: boolean, query: { data: T | undefined; error: unknown; isFetching: boolean; refetch: () => unknown }): FamiliarisationState<T> {
  if (!enabled) return { status: 'idle' };
  if (query.error instanceof FamiliarisationNotSetUp) return { status: 'not_set_up', notice: FAMILIARISATION_NOT_SET_UP_NOTICE };
  if (query.error && isFamiliarisationDenied(query.error)) return { status: 'denied', notice: detailOf(query.error) };
  if (query.error && isFamiliarisationNotFound(query.error)) return { status: 'not_found' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (query.data === undefined) return { status: 'loading' };
  return { status: 'ready', data: query.data, refetching: query.isFetching, refetch: () => void query.refetch() };
}

/** The vessel's familiarisation (templates, records, crew, rights). Sends nothing while `enabled` is false. */
export function useFamiliarisationOverview(
  vessel: FamiliarisationVessel | null,
  options: { all?: boolean; enabled?: boolean } = {},
): FamiliarisationState<FamiliarisationOverview> {
  const all = options.all ?? false;
  const enabled = Boolean(vessel) && (options.enabled ?? true);
  const query = useQuery({
    queryKey: familiarisationKeys.overview(vessel?.companyId, vessel?.id, all),
    queryFn: () => fetchOverview(vessel!.id, all),
    enabled,
    retry: noRetry,
    staleTime: 30_000,
  });
  return toState(enabled, query);
}

/** One record for its page. Sends nothing while `enabled` is false. */
export function useFamiliarisationRecord(
  vessel: FamiliarisationVessel | null,
  recordId: string | null,
  options: { enabled?: boolean } = {},
): FamiliarisationState<FamiliarisationRecordDetail> {
  const enabled = Boolean(vessel && recordId) && (options.enabled ?? true);
  const query = useQuery({
    queryKey: familiarisationKeys.record(vessel?.companyId, vessel?.id, recordId),
    queryFn: () => fetchRecordDetail(recordId!),
    enabled,
    retry: noRetry,
  });
  return toState(enabled, query);
}

// ---------------------------------------------------------------- writes

export interface TemplatePayload {
  name?: string;
  description?: string | null;
  scope?: 'fleet' | 'vessel';
  due_within_days?: number;
  requires_crew_signature?: boolean;
  requires_supervisor_signature?: boolean;
  sections?: FamiliarisationSection[];
  position_ids?: string[];
  is_active?: boolean;
  variant_of?: string | null;
}

function useFamiliarisationWrite<TVars, TResult>(
  vessel: FamiliarisationVessel | null,
  run: (vars: TVars) => Promise<TResult>,
  after?: (result: TResult, vars: TVars) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: TVars) => {
      if (!vessel) throw new FamiliarisationAnswerError('No vessel is open.', null);
      return run(vars);
    },
    onSuccess: (result, vars) => {
      if (vessel) {
        void qc.invalidateQueries({ queryKey: familiarisationKeys.vessel(vessel.companyId, vessel.id) });
        void qc.invalidateQueries({ queryKey: complianceKeys.vessel(vessel.companyId, vessel.id) });
      }
      after?.(result, vars);
    },
  });
}

/** Saves a template (create with templateId null); returns the saved template, checked. */
export function useSaveFamiliarisationTemplate(vessel: FamiliarisationVessel | null) {
  return useFamiliarisationWrite(vessel, async (vars: { templateId: string | null; payload: TemplatePayload }) => {
    const answer = await rpcJson('familiarisation_template_save', {
      p_vessel_id: vessel!.id,
      p_template_id: vars.templateId,
      p_payload: vars.payload as unknown as Json,
    });
    const saved = parseTemplate(answer);
    if (vars.templateId && saved.id !== vars.templateId) throw new FamiliarisationAnswerError('The server saved another template.', answer);
    return saved;
  });
}

/** Starts a record for a person; returns the record, checked. */
export function useStartFamiliarisation(vessel: FamiliarisationVessel | null) {
  return useFamiliarisationWrite(vessel, async (vars: { templateId: string; profileId: string }) => {
    const answer = await rpcJson('familiarisation_start', { p_template_id: vars.templateId, p_profile_id: vars.profileId, p_vessel_id: vessel!.id });
    const record = parseRecordDetail(answer);
    if (record.profileId !== vars.profileId || record.templateId !== vars.templateId) {
      throw new FamiliarisationAnswerError('The server started another record.', answer);
    }
    return record;
  });
}

/** Ticks or unticks an item; returns the record, checked to hold the item in the asked state. */
export function useTickFamiliarisationItem(vessel: FamiliarisationVessel | null) {
  const qc = useQueryClient();
  return useFamiliarisationWrite(
    vessel,
    async (vars: { recordId: string; itemId: string; done: boolean; note?: string | null }) => {
      const answer = await rpcJson('familiarisation_tick', { p_item_id: vars.itemId, p_done: vars.done, p_note: vars.note ?? null });
      const record = parseRecordDetail(answer);
      const item = record.items.find((i) => i.id === vars.itemId);
      if (record.id !== vars.recordId || !item || item.completed !== vars.done) {
        throw new FamiliarisationAnswerError('The item was not changed.', answer);
      }
      return record;
    },
    (record) => {
      if (vessel) qc.setQueryData(familiarisationKeys.record(vessel.companyId, vessel.id, record.id), record);
    },
  );
}

/** Signs as the crew member or the supervisor; returns the record, checked to carry the signature. */
export function useSignFamiliarisation(vessel: FamiliarisationVessel | null) {
  const qc = useQueryClient();
  return useFamiliarisationWrite(
    vessel,
    async (vars: { recordId: string; as: 'crew' | 'supervisor' }) => {
      const answer = await rpcJson('familiarisation_sign', { p_record_id: vars.recordId, p_as: vars.as });
      const record = parseRecordDetail(answer);
      const signed = vars.as === 'crew' ? record.crewSignedAt : record.supervisorSignedAt;
      if (record.id !== vars.recordId || !signed) throw new FamiliarisationAnswerError('The signature was not saved.', answer);
      return record;
    },
    (record) => {
      if (vessel) qc.setQueryData(familiarisationKeys.record(vessel.companyId, vessel.id, record.id), record);
    },
  );
}

/** Reopens with a reason; returns the record, checked to be reopened. */
export function useReopenFamiliarisation(vessel: FamiliarisationVessel | null) {
  const qc = useQueryClient();
  return useFamiliarisationWrite(
    vessel,
    async (vars: { recordId: string; reason: string }) => {
      const answer = await rpcJson('familiarisation_reopen', { p_record_id: vars.recordId, p_reason: vars.reason });
      const record = parseRecordDetail(answer);
      if (record.id !== vars.recordId || record.status === 'completed' || !record.reopenedAt) {
        throw new FamiliarisationAnswerError('The record was not reopened.', answer);
      }
      return record;
    },
    (record) => {
      if (vessel) qc.setQueryData(familiarisationKeys.record(vessel.companyId, vessel.id, record.id), record);
    },
  );
}

/** Deletes a record started by mistake; checked against the id the server deleted. */
export function useDeleteFamiliarisation(vessel: FamiliarisationVessel | null) {
  return useFamiliarisationWrite(vessel, async (vars: { recordId: string }) => {
    const answer = await rpcJson('familiarisation_delete', { p_record_id: vars.recordId });
    if (answer !== vars.recordId) throw new FamiliarisationAnswerError('The record was not deleted.', answer);
    return vars.recordId;
  });
}
