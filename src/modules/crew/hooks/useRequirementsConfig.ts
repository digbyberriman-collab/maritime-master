/**
 * The requirement configuration of a vessel (X1-06; gap/04 C33, C34, W5
 * §1): the rows x positions matrix, each row's options, who holds it, the
 * vessel's crew settings and familiarisation templates, and every write of
 * the configuration tab.
 *
 * - useRequirementsConfig(vesselId): crew_requirements_config (one jsonb;
 *   crew_compliance.view), parsed by parseRequirementsConfig; `canAdmin`
 *   (crew_compliance.admin on the vessel) and `canAdminCompany` (company
 *   wide: new document types, satisfaction rules) are the server's answer.
 * - The writes, each checked against what the server answered (the row it
 *   saved, the id it removed, the number of cells it applied, the toggle it
 *   set), never a quiet success; a refusal is thrown as the server sent it
 *   (complianceRefusalMessage reads it). A confirmed write refreshes the
 *   vessel's compliance (configuration, summaries, cells); a company-wide
 *   write (a document type, a rule) refreshes every vessel of the company
 *   and the catalogue.
 *
 * D-01. While 20261124060600 is not applied crew_requirements_config is
 * missing: 'not_set_up' with COMPLIANCE_NOT_SET_UP_NOTICE; a write refuses
 * with that notice (ComplianceWriteError.notApplied). Any other error is an
 * error state with Retry. Nothing is mocked.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
import {
  COMPLIANCE_NOT_SET_UP_NOTICE,
  isComplianceTab,
  isRequirementGroup,
  type ComplianceTab,
  type RequirementGroup,
  type RequirementKind,
} from '../lib/compliance';
import { crewRefusalMessage } from '../lib/crewUpdateErrors';
import type {
  CrewDocumentSatisfactionKind,
  CrewDocumentTab,
  CrewDocumentTypeRow,
  CrewPassengerToggleRpcRow,
  CrewPendingFunctions,
  CrewPendingTables,
  CrewRequirementCell,
  CrewRequirementRowPayload,
  CrewRequirementRowRow,
  CrewRequirementSetAddedRpcRow,
  VesselCrewSettingsPatch,
  VesselCrewSettingsRow,
} from '../types/db.pending';
import { crewDocumentKeys } from './useDocumentTypes';
import {
  ComplianceAnswerError,
  ComplianceNotSetUp,
  complianceKeys,
  complianceNotApplied,
  complianceState,
  isCompanyComplianceKey,
  noComplianceRetry,
} from './useVesselCompliance';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const REQUIREMENTS_CONFIG_RPC = 'crew_requirements_config';
export const ROW_SAVE_RPC = 'crew_requirement_row_save';
export const ROW_DELETE_RPC = 'crew_requirement_row_delete';
export const CELL_SET_RPC = 'crew_requirement_cell_set';
export const ROW_BULK_RPC = 'crew_requirement_row_bulk';
export const ADD_STCW_BASIC_RPC = 'crew_requirements_add_stcw_basic';
export const SET_PASSENGER_RPC = 'crew_vessel_set_passenger';
export const SETTINGS_SAVE_RPC = 'crew_vessel_settings_save';
export const DOCUMENT_TYPE_CREATE_RPC = 'crew_document_type_create';
export const SATISFIES_SAVE_RPC = 'crew_document_type_satisfies_save';

/** The most cells one crew_requirement_cell_set takes (the server refuses more: cells_too_many). */
export const MAX_CELLS_PER_SAVE = 2000;

// ---------------------------------------------------------------- the configuration

export interface RequirementsSettings {
  isPassengerShip: boolean;
  crewUploadsEnabled: boolean;
  transferRequiresFleetApproval: boolean;
  /** When crew_requirements_seed() looked at the vessel (null: not yet). */
  requirementsSeededAt: string | null;
  updatedAt: string | null;
}

/** A matrix column: a position listed on the vessel, or one a row is ticked for. */
export interface RequirementsPosition {
  positionId: string;
  key: string;
  name: string;
  departmentKey: string;
  departmentLabel: string;
  departmentSort: number;
  rankTier: string | null;
  sortOrder: number;
  /** Listed on the vessel (position_manning); an unlisted one shows only because a row is ticked for it. */
  isListed: boolean;
}

export interface RequirementsOption {
  id: string;
  documentTypeId: string | null;
  familiarizationTemplateId: string | null;
  sortOrder: number;
  /** The document type's name, or the familiarisation template's. */
  name: string | null;
  code: string | null;
  abbreviation: string | null;
  categoryKey: string | null;
  tab: CrewDocumentTab | null;
  isCompanyType: boolean;
}

export interface RequirementsRow {
  id: string;
  groupKey: RequirementGroup;
  label: string;
  kind: RequirementKind;
  sortOrder: number;
  seedKey: string | null;
  tab: ComplianceTab;
  options: RequirementsOption[];
  positionIds: string[];
  /** Crew members on the vessel today who meet it ("held by X"). */
  heldBy: number;
}

export interface RequirementsTemplate {
  id: string;
  name: string;
  isActive: boolean;
}

export interface RequirementsConfig {
  vesselId: string;
  companyId: string;
  /** crew_compliance.admin on the vessel: the matrix, the rows, the settings. */
  canAdmin: boolean;
  /** crew_compliance.admin company wide: new document types and satisfaction rules. */
  canAdminCompany: boolean;
  settings: RequirementsSettings;
  positions: RequirementsPosition[];
  rows: RequirementsRow[];
  templates: RequirementsTemplate[];
  /** The ticked cells, as cellKey(rowId, positionId). */
  ticked: ReadonlySet<string>;
}

export const cellKey = (rowId: string, positionId: string): string => `${rowId}:${positionId}`;

type JsonObject = { [key: string]: Json | undefined };

const isObject = (v: Json | undefined): v is JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v);

function bad(what: string, answer: unknown): never {
  throw new ComplianceAnswerError(`The requirements answer has an unexpected ${what}.`, answer);
}

const str = (v: Json | undefined, what: string, answer: unknown): string => (typeof v === 'string' && v !== '' ? v : bad(what, answer));
const optStr = (v: Json | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: Json | undefined, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const list = (v: Json | undefined, what: string, answer: unknown): Json[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : bad(what, answer));
const DOCUMENT_TABS = ['documents', 'stcw', 'qualifications'] as const satisfies readonly CrewDocumentTab[];
const docTab = (v: Json | undefined): CrewDocumentTab | null =>
  typeof v === 'string' && (DOCUMENT_TABS as readonly string[]).includes(v) ? (v as CrewDocumentTab) : null;

/** crew_requirements_config's jsonb in this module's shape; anything else is a ComplianceAnswerError. */
export function parseRequirementsConfig(data: Json | null | undefined): RequirementsConfig {
  if (!isObject(data ?? null)) bad('shape', data);
  const d = data as JsonObject;
  const s = isObject(d.settings ?? null) ? (d.settings as JsonObject) : {};
  const positions = list(d.positions, 'position list', data).map((p): RequirementsPosition => {
    if (!isObject(p)) bad('position', data);
    return {
      positionId: str(p.position_id, 'position', data),
      key: str(p.key, 'position key', data),
      name: str(p.name, 'position name', data),
      departmentKey: str(p.department_key, 'department', data),
      departmentLabel: optStr(p.department_label) ?? str(p.department_key, 'department', data),
      departmentSort: num(p.department_sort),
      rankTier: optStr(p.rank_tier),
      sortOrder: num(p.sort_order),
      isListed: p.is_listed === true,
    };
  });
  const rows = list(d.rows, 'row list', data).map((r): RequirementsRow => {
    if (!isObject(r)) bad('row', data);
    const kind = r.kind === 'document' || r.kind === 'familiarisation' ? r.kind : bad('requirement kind', data);
    const options = list(r.options, 'option list', data).map((o): RequirementsOption => {
      if (!isObject(o)) bad('option', data);
      const documentTypeId = optStr(o.document_type_id);
      const familiarizationTemplateId = optStr(o.familiarization_template_id);
      if ((documentTypeId === null) === (familiarizationTemplateId === null)) bad('option', data);
      return {
        id: str(o.id, 'option', data),
        documentTypeId,
        familiarizationTemplateId,
        sortOrder: num(o.sort_order),
        name: optStr(o.name),
        code: optStr(o.code),
        abbreviation: optStr(o.abbreviation),
        categoryKey: optStr(o.category_key),
        tab: docTab(o.tab),
        isCompanyType: o.is_company_type === true,
      };
    });
    return {
      id: str(r.id, 'row', data),
      groupKey: isRequirementGroup(r.group_key) ? r.group_key : bad('requirement group', data),
      label: str(r.label, 'requirement name', data),
      kind,
      sortOrder: num(r.sort_order),
      seedKey: optStr(r.seed_key),
      tab: isComplianceTab(r.tab) ? r.tab : bad('tab', data),
      options,
      positionIds: list(r.position_ids, 'position ids', data).map((id) => str(id, 'position id', data)),
      heldBy: num(r.held_by),
    };
  });
  const templates = list(d.templates, 'template list', data).map((t): RequirementsTemplate => {
    if (!isObject(t)) bad('template', data);
    return { id: str(t.id, 'template', data), name: optStr(t.name) ?? '', isActive: t.is_active === true };
  });
  const ticked = new Set<string>();
  for (const r of rows) for (const p of r.positionIds) ticked.add(cellKey(r.id, p));
  return {
    vesselId: str(d.vessel_id, 'vessel', data),
    companyId: str(d.company_id, 'company', data),
    canAdmin: d.can_admin === true,
    canAdminCompany: d.can_admin_company === true,
    settings: {
      isPassengerShip: s.is_passenger_ship === true,
      crewUploadsEnabled: s.crew_uploads_enabled === true,
      transferRequiresFleetApproval: s.transfer_requires_fleet_approval === true,
      requirementsSeededAt: optStr(s.requirements_seeded_at),
      updatedAt: optStr(s.updated_at),
    },
    positions,
    rows,
    templates,
    ticked,
  };
}

export async function fetchRequirementsConfig(vesselId: string): Promise<RequirementsConfig> {
  const { data, error } = await crewDb.rpc(REQUIREMENTS_CONFIG_RPC, { p_vessel_id: vesselId });
  if (error) {
    if (complianceNotApplied(error, REQUIREMENTS_CONFIG_RPC)) throw new ComplianceNotSetUp();
    throw error;
  }
  const config = parseRequirementsConfig(data);
  if (config.vesselId !== vesselId) throw new ComplianceAnswerError('The requirements answer is for another vessel.', data);
  return config;
}

export type RequirementsConfigState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** 20261124060600 is not applied (D-01). */
  | { status: 'not_set_up'; notice: string }
  | { status: 'denied'; notice: string }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; config: RequirementsConfig };

/** The vessel's requirement configuration. Sends nothing while `enabled` is false or without a vessel and company. */
export function useRequirementsConfig(
  vesselId: string | null | undefined,
  options: { companyId: string | null | undefined; enabled?: boolean },
): RequirementsConfigState {
  const enabled = (options.enabled ?? true) && Boolean(vesselId) && Boolean(options.companyId);
  const query = useQuery({
    queryKey: complianceKeys.config(options.companyId, vesselId),
    queryFn: () => fetchRequirementsConfig(vesselId as string),
    enabled,
    retry: noComplianceRetry,
    staleTime: 60_000,
  });
  return complianceState(enabled, query, (config) => ({ status: 'ready', config }) as const);
}

// ---------------------------------------------------------------- refusals

/** A write the server refused or did not confirm. */
export class ComplianceWriteError extends Error {
  /** What the server answered (the error, or the unexpected data). */
  readonly answer: unknown;
  /** The RPC is not applied yet (D-01). */
  readonly notApplied: boolean;
  constructor(message: string, answer: unknown, notApplied = false) {
    super(message);
    this.name = 'ComplianceWriteError';
    this.answer = answer;
    this.notApplied = notApplied;
  }
}

/** Sentences for the refusals the server sends without a DETAIL. */
const REFUSALS: Readonly<Record<string, string>> = {
  payload_invalid: 'The requirement could not be read. Try again.',
  kind_invalid: 'Choose what kind of requirement this is.',
  kind_group_mismatch: 'Familiarisation requirements go in the Familiarisation group, and only there.',
  sort_order_invalid: 'The position in the list is not valid.',
  option_invalid: 'Each option is one document type or one familiarisation.',
  positions_invalid: 'The positions could not be read. Try again.',
  cells_required: 'Tick or clear at least one cell.',
  cells_invalid: 'Each cell names a requirement, a position and whether it is required.',
  action_invalid: 'Choose require all or clear all.',
  value_required: 'Choose on or off.',
  patch_empty: 'Nothing to save.',
  use_passenger_toggle: 'Use the passenger ship switch for this setting.',
  setting_unknown: 'This setting cannot be changed here.',
  setting_invalid: 'Choose on or off.',
  document_type_exists: 'The company already has a document type with this name or code.',
  requirement_set_unknown: 'This set of requirements is not known.',
  requirement_not_found: 'This requirement could not be found on the vessel.',
  rule_not_found: 'This rule could not be found.',
  vessel_not_found: 'This vessel could not be found.',
};

interface RpcErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

const CODE_LIKE = /^[a-z0-9_]+$/;

/**
 * One sentence for a refused configuration write: the not-applied notice; a
 * 22023 / P0002 with a DETAIL sentence shows it (the server writes them
 * for people), else the code's sentence above; anything else goes through
 * crewRefusalMessage (42501 DETAIL as is; never a raw code).
 */
export function complianceRefusalMessage(error: unknown): string {
  if (error instanceof ComplianceWriteError) {
    if (error.notApplied) return COMPLIANCE_NOT_SET_UP_NOTICE;
    if (!(error.answer && typeof error.answer === 'object' && 'code' in error.answer)) return error.message;
    return complianceRefusalMessage(error.answer);
  }
  if (error !== null && typeof error === 'object') {
    const { code, message, details } = error as RpcErrorLike;
    if (code === '22023' || code === 'P0002') {
      const detail = typeof details === 'string' ? details.trim() : '';
      if (detail && !CODE_LIKE.test(detail)) return detail;
      const key = typeof message === 'string' ? message.trim() : '';
      if (key && REFUSALS[key]) return REFUSALS[key];
    }
  }
  return crewRefusalMessage(error);
}

/** The field a 22023 refusal names (its HINT: label, group_key, options, position_ids, cells, name, code ...), for the dialog to mark. */
export function complianceRefusalField(error: unknown): string | null {
  const e = error instanceof ComplianceWriteError ? error.answer : error;
  if (e === null || typeof e !== 'object') return null;
  const { code, hint } = e as RpcErrorLike;
  return code === '22023' && typeof hint === 'string' && CODE_LIKE.test(hint.trim()) ? hint.trim() : null;
}

function rethrowWrite(error: unknown, fn: string): never {
  if (complianceNotApplied(error, fn)) throw new ComplianceWriteError(COMPLIANCE_NOT_SET_UP_NOTICE, error, true);
  throw error;
}

const unconfirmed = (message: string, data: unknown): never => {
  throw new ComplianceWriteError(message, data);
};

// ---------------------------------------------------------------- writes (vessel)

export interface SaveRequirementRowInput {
  vesselId: string;
  /** Null for a new row. */
  rowId: string | null;
  payload: CrewRequirementRowPayload;
}

/** Creates or edits a requirement row (options and ticks replace when given); the answer must be the row on the vessel. */
export async function saveRequirementRow(input: SaveRequirementRowInput): Promise<CrewRequirementRowRow> {
  const { data, error } = await crewDb.rpc(ROW_SAVE_RPC, { p_vessel_id: input.vesselId, p_row_id: input.rowId, p_payload: input.payload });
  if (error) rethrowWrite(error, ROW_SAVE_RPC);
  if (!data || data.vessel_id !== input.vesselId || (input.rowId !== null && data.id !== input.rowId)) {
    return unconfirmed('The requirement was not saved. Try again.', data);
  }
  if (input.payload.label !== undefined && data.label.trim() !== input.payload.label.trim()) return unconfirmed('The requirement was not saved. Try again.', data);
  return data;
}

/** Removes a requirement row (its options and ticks go with it); the answer must be its id. */
export async function deleteRequirementRow(input: { vesselId: string; rowId: string }): Promise<string> {
  const { data, error } = await crewDb.rpc(ROW_DELETE_RPC, { p_vessel_id: input.vesselId, p_row_id: input.rowId });
  if (error) rethrowWrite(error, ROW_DELETE_RPC);
  if (data !== input.rowId) return unconfirmed('The requirement was not removed. Try again.', data);
  return data;
}

/** The staged matrix edits against what is ticked now: only the cells that change, each once. */
export function stagedCells(ticked: ReadonlySet<string>, staged: ReadonlyMap<string, boolean>): CrewRequirementCell[] {
  const out: CrewRequirementCell[] = [];
  for (const [key, required] of staged) {
    if (ticked.has(key) === required) continue;
    const at = key.indexOf(':');
    if (at <= 0) continue;
    out.push({ row_id: key.slice(0, at), position_id: key.slice(at + 1), required });
  }
  return out;
}

/** Applies matrix cells in one transaction (1 to MAX_CELLS_PER_SAVE); the answer must be the number sent. */
export async function setRequirementCells(input: { vesselId: string; cells: readonly CrewRequirementCell[] }): Promise<number> {
  if (input.cells.length === 0) throw new ComplianceWriteError('Tick or clear at least one cell.', null);
  if (input.cells.length > MAX_CELLS_PER_SAVE) throw new ComplianceWriteError(`Save at most ${MAX_CELLS_PER_SAVE} cells at once.`, null);
  const { data, error } = await crewDb.rpc(CELL_SET_RPC, { p_vessel_id: input.vesselId, p_cells: [...input.cells] });
  if (error) rethrowWrite(error, CELL_SET_RPC);
  if (data !== input.cells.length) return unconfirmed('Not every change was saved. Review the matrix and try again.', data);
  return data;
}

export type RequirementRowBulkAction = 'require_all' | 'clear_all';

/** Ticks every listed position, or clears every tick, of a row; the answer is the ticks after (0 after clear all). */
export async function bulkRequirementRow(input: { vesselId: string; rowId: string; action: RequirementRowBulkAction }): Promise<number> {
  const { data, error } = await crewDb.rpc(ROW_BULK_RPC, { p_vessel_id: input.vesselId, p_row_id: input.rowId, p_action: input.action });
  if (error) rethrowWrite(error, ROW_BULK_RPC);
  if (typeof data !== 'number' || data < 0 || (input.action === 'clear_all' && data !== 0)) {
    return unconfirmed(input.action === 'clear_all' ? 'The ticks were not cleared. Try again.' : 'The positions were not ticked. Try again.', data);
  }
  return data;
}

/** "Add STCW basic set (all positions)": PST, FPFF, EFA and PSSR ticked for every listed position. */
export async function addStcwBasicSet(vesselId: string): Promise<CrewRequirementSetAddedRpcRow> {
  const { data, error } = await crewDb.rpc(ADD_STCW_BASIC_RPC, { p_vessel_id: vesselId });
  if (error) rethrowWrite(error, ADD_STCW_BASIC_RPC);
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || typeof row.rows_added !== 'number' || typeof row.cells_added !== 'number') return unconfirmed('The STCW basic set was not added. Try again.', data);
  return row;
}

/** The "Passenger ship?" toggle (adds or removes the STCW passenger rows); the answer must carry the value asked for. */
export async function setPassengerShip(input: { vesselId: string; on: boolean }): Promise<CrewPassengerToggleRpcRow> {
  const { data, error } = await crewDb.rpc(SET_PASSENGER_RPC, { p_vessel_id: input.vesselId, p_on: input.on });
  if (error) rethrowWrite(error, SET_PASSENGER_RPC);
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || row.is_passenger_ship !== input.on) return unconfirmed('The passenger ship setting was not saved. Try again.', data);
  return row;
}

/** Crew uploads and transfer approval; the answer must be the vessel's settings with every value asked for. */
export async function saveVesselCrewSettings(input: { vesselId: string; patch: VesselCrewSettingsPatch }): Promise<VesselCrewSettingsRow> {
  const keys = Object.keys(input.patch) as Array<keyof VesselCrewSettingsPatch>;
  if (keys.length === 0) throw new ComplianceWriteError('Nothing to save.', null);
  const { data, error } = await crewDb.rpc(SETTINGS_SAVE_RPC, { p_vessel_id: input.vesselId, p_patch: input.patch });
  if (error) rethrowWrite(error, SETTINGS_SAVE_RPC);
  if (!data || data.vessel_id !== input.vesselId || keys.some((k) => data[k] !== input.patch[k])) {
    return unconfirmed('The settings were not saved. Try again.', data);
  }
  return data;
}

// ---------------------------------------------------------------- writes (company wide)

export interface CreateDocumentTypeInput {
  categoryKey: string;
  name: string;
  code?: string | null;
  abbreviation?: string | null;
  defaultValidityMonths?: number | null;
  stcwReference?: string | null;
}

const blankToNull = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** A company document type (the add qualification dialog); the answer must be the company's new type with that name. */
export async function createCompanyDocumentType(input: CreateDocumentTypeInput): Promise<CrewDocumentTypeRow> {
  const name = input.name.trim();
  const { data, error } = await crewDb.rpc(DOCUMENT_TYPE_CREATE_RPC, {
    p_category_key: input.categoryKey,
    p_name: name,
    p_code: blankToNull(input.code),
    p_abbreviation: blankToNull(input.abbreviation),
    p_default_validity_months: input.defaultValidityMonths ?? null,
    p_stcw_reference: blankToNull(input.stcwReference),
  });
  if (error) rethrowWrite(error, DOCUMENT_TYPE_CREATE_RPC);
  if (!data || !data.id || data.company_id === null || data.category_key !== input.categoryKey || data.name.trim() !== name) {
    return unconfirmed('The document type was not created. Try again.', data);
  }
  return data;
}

export interface SaveSatisfactionRuleInput {
  /** Holding this type ... */
  typeId: string;
  /** ... satisfies a requirement for this one. */
  satisfiesTypeId: string;
  /** Required unless removing. */
  kind?: CrewDocumentSatisfactionKind;
  /** Removes the company's rule for the pair. */
  remove?: boolean;
}

/** A company satisfaction rule (the equivalence drawer): add or change its kind, or remove it; the answer is the rule id. */
export async function saveSatisfactionRule(input: SaveSatisfactionRuleInput): Promise<string> {
  if (!input.remove && !input.kind) throw new ComplianceWriteError('Choose how the document counts.', null);
  const { data, error } = await crewDb.rpc(SATISFIES_SAVE_RPC, {
    p_type_id: input.typeId,
    p_satisfies_type_id: input.satisfiesTypeId,
    p_kind: input.remove ? null : input.kind ?? null,
    p_remove: Boolean(input.remove),
  });
  if (error) rethrowWrite(error, SATISFIES_SAVE_RPC);
  if (typeof data !== 'string' || data === '') return unconfirmed(input.remove ? 'The rule was not removed. Try again.' : 'The rule was not saved. Try again.', data);
  return data;
}

// ---------------------------------------------------------------- mutations

/** Refreshes the vessel's compliance (configuration, summaries, cells, people) after a confirmed vessel write. */
export const refreshVesselCompliance = (queryClient: QueryClient, companyId: string | null | undefined, vesselId: string | null | undefined) =>
  queryClient.invalidateQueries({ queryKey: complianceKeys.vessel(companyId, vesselId) });

/** Refreshes every vessel's compliance of the company and the document catalogue after a company-wide write. */
export const refreshCompanyCompliance = (queryClient: QueryClient, companyId: string | null | undefined) =>
  Promise.all([
    queryClient.invalidateQueries({ predicate: (q) => isCompanyComplianceKey(q.queryKey, companyId) }),
    queryClient.invalidateQueries({ queryKey: crewDocumentKeys.catalogue(companyId) }),
  ]);

/** The configuration tab's writes, each refreshing what it changed after a confirmed answer. */
export function useRequirementsConfigActions(companyId: string | null | undefined, vesselId: string | null | undefined) {
  const queryClient = useQueryClient();
  const vessel = () => refreshVesselCompliance(queryClient, companyId, vesselId);
  const company = () => refreshCompanyCompliance(queryClient, companyId);
  return {
    saveRow: useMutation({ mutationFn: saveRequirementRow, onSuccess: vessel }),
    deleteRow: useMutation({ mutationFn: deleteRequirementRow, onSuccess: vessel }),
    setCells: useMutation({ mutationFn: setRequirementCells, onSuccess: vessel }),
    bulkRow: useMutation({ mutationFn: bulkRequirementRow, onSuccess: vessel }),
    addStcwBasic: useMutation({ mutationFn: addStcwBasicSet, onSuccess: vessel }),
    setPassenger: useMutation({ mutationFn: setPassengerShip, onSuccess: vessel }),
    saveSettings: useMutation({ mutationFn: saveVesselCrewSettings, onSuccess: vessel }),
    createDocumentType: useMutation({ mutationFn: createCompanyDocumentType, onSuccess: company }),
    saveRule: useMutation({ mutationFn: saveSatisfactionRule, onSuccess: company }),
  };
}
