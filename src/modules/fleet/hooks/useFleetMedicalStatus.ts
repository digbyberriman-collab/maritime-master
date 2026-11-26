/**
 * The fleet medical status and the company medical settings (gap/02 M1,
 * W8; gap/04 C61; DECISIONS C5, D-01, D-04; D-X5-08; X5-08).
 *
 * `useFleetMedicalStatus` reads `fleet_crew_medical_status` for the vessels
 * a grid covers:
 * - nothing is requested until the scope is known and the caller's gate
 *   allows it (`enabled`): a gate that is still loading or denied sends no
 *   request (fail closed, D-04);
 * - `vesselIds` null asks for the caller's counted vessels (the server's
 *   default, D-X5-22); an empty list answers `no_vessels` without a request;
 *   explicit ids are reach-checked by the server (42501
 *   vessel_out_of_reach gets its own sentence and is not retried);
 * - the RPC is not in the database yet (`isMissingRelation`): `not_set_up`,
 *   the answer, not an error (cached, not retried);
 * - any other error is `error` with a retry, for `PageError`;
 * - rows are the server's, in its order (most severe first), mapped to
 *   camelCase; a status, reason or state this client does not know is an
 *   error, never a guess.
 * The key carries the company, the vessel ids (sorted; `counted` for the
 * default), the status filter and the day judged on.
 *
 * `useFleetMedicalSettings` reads the company's settings row (selected
 * columns only): no row = the defaults; the table missing = the defaults,
 * read-only (D-01). `useSaveFleetMedicalSettings` saves through
 * `fleet_medical_settings_save` only, checks the returned row, words every
 * refusal and invalidates the company's medical queries.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json } from '@/integrations/supabase/types';
import type { ExportColumn } from '@/lib/export';
import { statusMeta } from '@/shared/components/status/statusTone';
import { todayDateOnly } from '@/shared/lib/form';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { fleetDb } from '../lib/fleetDb';
import {
  ENG1_STATE_LABELS,
  MEDICAL_REASON_LABELS,
  MEDICAL_STATUSES,
  isEng1State,
  isMedicalReason,
  isMedicalStatus,
  isOccHealthState,
  type Eng1State,
  type MedicalReason,
  type MedicalStatus,
  type OccHealthState,
} from '../lib/medicalStatus';
import {
  DEFAULT_MEDICAL_SETTINGS,
  medicalSettingsRefusal,
  settingsFromRow,
  toSavePayload,
  type MedicalSettings,
} from '../lib/medicalSettingsSchema';
import type { FleetCrewMedicalStatusRow, FleetMedicalSettingsRow } from '../types/db.pending';
import { fleetKeys, vesselIdsKey } from './keys';
import { VESSEL_OUT_OF_REACH_MESSAGE } from './useFleetExpiry';

// ─── Keys ─────────────────────────────────────────────────────────────────

/** The status filter of a key: in severity order, each once; null = every status. */
export function normaliseStatusFilter(status: readonly MedicalStatus[] | null | undefined): MedicalStatus[] | null {
  if (!status || !status.length) return null;
  const set = new Set(status);
  const out = MEDICAL_STATUSES.filter((s) => set.has(s));
  return out.length ? out : null;
}

const medicalAll = (companyId: string | null | undefined) => [...fleetKeys.company(companyId), 'medical'] as const;

export const fleetMedicalKeys = {
  /** Every medical query of the company (invalidate after a settings change). */
  all: medicalAll,
  status: (companyId: string | null | undefined, vesselIds: readonly string[] | null, status: readonly MedicalStatus[] | null, today: string) =>
    [...medicalAll(companyId), 'status', vesselIds ? vesselIdsKey(vesselIds) : 'counted', { status: normaliseStatusFilter(status), today }] as const,
  settings: (companyId: string | null | undefined) => [...medicalAll(companyId), 'settings'] as const,
};

// ─── Rows ─────────────────────────────────────────────────────────────────

/** One crew member's medical status, as the grid shows it. */
export interface CrewMedicalRow {
  profileId: string;
  personName: string;
  vesselId: string;
  vesselName: string;
  vesselCode: string | null;
  position: string | null;
  department: string | null;
  isPlanned: boolean;
  joinDate: string | null;
  hasHealthRecord: boolean;
  eng1State: Eng1State;
  eng1ExpiresOn: string | null;
  eng1IsEquivalent: boolean | null;
  /** null: not known (no Health record). */
  vaccinesValid: number | null;
  vaccinesExpired: number | null;
  vaccinesMissing: number | null;
  boostersDue: number | null;
  restTracked: boolean;
  /** null: not tracked (no login, or Hours of Rest off on the vessel). */
  restNoncompliant30d: number | null;
  seriousRestBreach30d: number | null;
  occHealthState: OccHealthState | null;
  occHealthDueOn: string | null;
  /** null: the viewer may not see the flag. */
  conditionFlag: boolean | null;
  allergyFlag: boolean | null;
  status: MedicalStatus;
  reasons: MedicalReason[];
}

/** A refusal or failure of a medical read or save, worded for the reader. */
export class FleetMedicalError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'FleetMedicalError';
    this.reason = reason;
  }
}

const UNKNOWN_VALUE = 'The medical status sent a value this version of STORM cannot show. Reload the page.';

const countOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value) || 0);

export function toCrewMedicalRow(row: FleetCrewMedicalStatusRow): CrewMedicalRow {
  if (!isMedicalStatus(row.status) || !isEng1State(row.eng1_state)) throw new FleetMedicalError('unknown_value', UNKNOWN_VALUE);
  if (row.occ_health_state !== null && row.occ_health_state !== undefined && !isOccHealthState(row.occ_health_state)) {
    throw new FleetMedicalError('unknown_value', UNKNOWN_VALUE);
  }
  const reasons = Array.isArray(row.reasons) ? row.reasons : [];
  if (!reasons.every(isMedicalReason)) throw new FleetMedicalError('unknown_value', UNKNOWN_VALUE);
  return {
    profileId: row.profile_id,
    personName: row.person_name,
    vesselId: row.vessel_id,
    vesselName: row.vessel_name,
    vesselCode: row.vessel_code ?? null,
    position: row.position ?? null,
    department: row.department ?? null,
    isPlanned: Boolean(row.is_planned),
    joinDate: row.join_date ?? null,
    hasHealthRecord: Boolean(row.has_health_record),
    eng1State: row.eng1_state,
    eng1ExpiresOn: row.eng1_expires_on ?? null,
    eng1IsEquivalent: row.eng1_is_equivalent ?? null,
    vaccinesValid: countOrNull(row.vaccines_valid),
    vaccinesExpired: countOrNull(row.vaccines_expired),
    vaccinesMissing: countOrNull(row.vaccines_missing),
    boostersDue: countOrNull(row.boosters_due),
    restTracked: Boolean(row.rest_tracked),
    restNoncompliant30d: countOrNull(row.rest_noncompliant_30d),
    seriousRestBreach30d: countOrNull(row.serious_rest_breach_30d),
    occHealthState: row.occ_health_state ?? null,
    occHealthDueOn: row.occ_health_due_on ?? null,
    conditionFlag: row.condition_flag ?? null,
    allergyFlag: row.allergy_flag ?? null,
    status: row.status,
    reasons: [...reasons],
  };
}

// ─── The status read ──────────────────────────────────────────────────────

/** The company and the vessels a medical read is for; `vesselIds` null = the caller's counted vessels. */
export interface FleetMedicalScope {
  companyId: string;
  vesselIds: readonly string[] | null;
}

export type FleetMedicalState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'no_vessels' }
  | { state: 'not_set_up' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; data: T; refreshing: boolean; updatedAt: number; refresh: () => void };

const NOT_SET_UP = { kind: 'not_set_up' } as const;
type Answer<T> = typeof NOT_SET_UP | { kind: 'ok'; value: T };

type RpcError = { code?: string; message?: string } | null | undefined;

function rethrow(error: NonNullable<RpcError>): never {
  if (error.code === '42501' && error.message === 'vessel_out_of_reach') {
    throw new FleetMedicalError('vessel_out_of_reach', VESSEL_OUT_OF_REACH_MESSAGE);
  }
  throw error;
}

/** Retrying cannot fix a missing reach, a refused request or a value this client cannot read. */
const retryOnce = (failureCount: number, error: unknown) => {
  if (error instanceof FleetMedicalError) return false;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '42501' || code === '22023') return false;
  return failureCount < 1;
};

export async function fetchCrewMedicalStatus(
  vesselIds: readonly string[] | null,
  status: readonly MedicalStatus[] | null,
  today: string,
): Promise<Answer<CrewMedicalRow[]>> {
  const { data, error } = await fleetDb.rpc('fleet_crew_medical_status', {
    p_vessel_ids: vesselIds ? [...vesselIds] : null,
    p_status: normaliseStatusFilter(status),
    p_today: today,
  });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: (Array.isArray(data) ? data : []).map(toCrewMedicalRow) };
}

export interface FleetMedicalQuery {
  /** Only these statuses (the server filters); null = every status. */
  status?: readonly MedicalStatus[] | null;
  /** The day the dates are judged on (`yyyy-MM-dd`); today's local date when omitted. */
  today?: string;
}

export interface FleetMedicalHookOptions {
  /** The page's gate: false (loading or denied) sends no request and answers `idle`. Default true. */
  enabled?: boolean;
}

/** The crew medical status for a scope, most severe first. `scope` null (not known yet) answers `idle` without a request. */
export function useFleetMedicalStatus(
  scope: FleetMedicalScope | null,
  query: FleetMedicalQuery = {},
  options: FleetMedicalHookOptions = {},
): FleetMedicalState<CrewMedicalRow[]> {
  const today = query.today ?? todayDateOnly();
  const status = normaliseStatusFilter(query.status);
  const active = (options.enabled ?? true) && Boolean(scope?.companyId);
  const vesselIds = scope?.vesselIds ?? null;
  const noVessels = vesselIds !== null && vesselIds.length === 0;
  const result = useQuery({
    queryKey: fleetMedicalKeys.status(scope?.companyId, vesselIds, status, today),
    queryFn: () => fetchCrewMedicalStatus(vesselIds, status, today),
    enabled: active && !noVessels,
    retry: retryOnce,
    staleTime: 60_000,
  });
  if (!active) return { state: 'idle' };
  if (noVessels) return { state: 'no_vessels' };
  const retry = () => void result.refetch();
  if (result.data?.kind === 'not_set_up') return { state: 'not_set_up' };
  if (result.data?.kind === 'ok' && !result.error) {
    return { state: 'ready', data: result.data.value, refreshing: result.isFetching, updatedAt: result.dataUpdatedAt, refresh: retry };
  }
  if (result.error) return { state: 'error', error: result.error, retry };
  return { state: 'loading' };
}

// ─── Settings ─────────────────────────────────────────────────────────────

/** Where the settings came from: the stored row, the defaults (no row yet), or the defaults because the table is not set up (read-only). */
export type MedicalSettingsSource = 'stored' | 'default' | 'not_set_up';

export interface MedicalSettingsView {
  settings: MedicalSettings;
  source: MedicalSettingsSource;
  /** The stored row's `updated_at` (the stale-write guard); null without a row. */
  updatedAt: string | null;
}

export type MedicalSettingsState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; error: unknown; retry: () => void }
  | ({ state: 'ready' } & MedicalSettingsView);

const SETTINGS_COLUMNS = 'company_id, eng1_assessment_types, eng1_equivalent_types, required_vaccines, updated_at';

export async function fetchMedicalSettings(companyId: string): Promise<MedicalSettingsView> {
  const { data, error } = await fleetDb.from('fleet_medical_settings').select(SETTINGS_COLUMNS).eq('company_id', companyId).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { settings: { ...DEFAULT_MEDICAL_SETTINGS }, source: 'not_set_up', updatedAt: null };
    throw error;
  }
  if (!data) return { settings: { ...DEFAULT_MEDICAL_SETTINGS }, source: 'default', updatedAt: null };
  return { settings: settingsFromRow(data), source: 'stored', updatedAt: data.updated_at };
}

/** The company's medical settings (selected columns; the defaults when there is no row or no table). */
export function useFleetMedicalSettings(companyId: string | null | undefined, options: FleetMedicalHookOptions = {}): MedicalSettingsState {
  const active = (options.enabled ?? true) && Boolean(companyId);
  const result = useQuery({
    queryKey: fleetMedicalKeys.settings(companyId),
    queryFn: () => fetchMedicalSettings(companyId as string),
    enabled: active,
    staleTime: 60_000,
  });
  if (!active) return { state: 'idle' };
  if (result.data && !result.error) return { state: 'ready', ...result.data };
  if (result.error) return { state: 'error', error: result.error, retry: () => void result.refetch() };
  return { state: 'loading' };
}

export const MEDICAL_SETTINGS_NOT_SET_UP = 'Medical settings are not set up yet, so nothing was saved.';

export interface SaveMedicalSettingsInput {
  settings: MedicalSettings;
  /** The `updated_at` the reader saw; null when there was no row. */
  expectedUpdatedAt: string | null;
}

/** Saves through the definer only; the returned row must be the caller's company's, else nothing was saved. */
export async function saveMedicalSettings(companyId: string, input: SaveMedicalSettingsInput): Promise<FleetMedicalSettingsRow> {
  const { data, error } = await fleetDb.rpc('fleet_medical_settings_save', {
    p_settings: toSavePayload(input.settings, input.expectedUpdatedAt) as Json,
  });
  if (error) {
    if (isMissingRelation(error)) throw new FleetMedicalError('not_set_up', MEDICAL_SETTINGS_NOT_SET_UP);
    const sentence = medicalSettingsRefusal(error.message);
    if (sentence) throw new FleetMedicalError(error.message ?? 'refused', sentence);
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as FleetMedicalSettingsRow | null | undefined;
  if (!row || row.company_id !== companyId) {
    throw new FleetMedicalError('settings_not_saved', medicalSettingsRefusal('settings_not_saved') as string);
  }
  return row;
}

/** The settings save. The caller toasts the outcome; every medical query of the company is read again afterwards. */
export function useSaveFleetMedicalSettings(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveMedicalSettingsInput) => {
      if (!companyId) throw new FleetMedicalError('no_company', 'Your company is not known yet. Reload the page and try again.');
      return saveMedicalSettings(companyId, input);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: fleetMedicalKeys.all(companyId) }),
  });
}

// ─── Export ───────────────────────────────────────────────────────────────

const OCC_EXPORT: Readonly<Record<string, string>> = { overdue: 'Overdue', none: 'None on file', ok: 'Up to date' };

/** The CSV / XLSX columns of the grid's rows: dates, states and counts, never clinical details (D-X5-08). */
export const MEDICAL_EXPORT_COLUMNS: ReadonlyArray<ExportColumn<CrewMedicalRow>> = [
  { key: 'person', header: 'Crew member', value: (r) => r.personName, width: 28 },
  { key: 'position', header: 'Position', value: (r) => r.position },
  { key: 'department', header: 'Department', value: (r) => r.department },
  { key: 'vessel', header: 'Vessel', value: (r) => r.vesselName },
  { key: 'joining_on', header: 'Joining on', value: (r) => (r.isPlanned ? r.joinDate : null), kind: 'date' },
  { key: 'status', header: 'Status', value: (r) => statusMeta('medical_status', r.status).label },
  { key: 'reasons', header: 'Reasons', value: (r) => r.reasons.map((x) => MEDICAL_REASON_LABELS[x]).join('; '), width: 48 },
  { key: 'eng1', header: 'ENG1', value: (r) => (r.eng1State === 'missing' && !r.hasHealthRecord ? 'Not known' : ENG1_STATE_LABELS[r.eng1State]) },
  { key: 'eng1_expires_on', header: 'ENG1 expires', value: (r) => r.eng1ExpiresOn, kind: 'date' },
  { key: 'eng1_equivalent', header: 'ENG1 equivalent', value: (r) => r.eng1IsEquivalent, kind: 'boolean' },
  { key: 'vaccines_valid', header: 'Vaccines valid', value: (r) => r.vaccinesValid, kind: 'number' },
  { key: 'vaccines_expired', header: 'Vaccines expired', value: (r) => r.vaccinesExpired, kind: 'number' },
  { key: 'vaccines_missing', header: 'Required vaccines missing', value: (r) => r.vaccinesMissing, kind: 'number' },
  { key: 'boosters_due', header: 'Boosters due', value: (r) => r.boostersDue, kind: 'number' },
  { key: 'rest_breach_days', header: 'Rest breach days (30 d)', value: (r) => r.restNoncompliant30d, kind: 'number' },
  { key: 'serious_rest_breaches', header: 'Serious rest breaches (30 d)', value: (r) => r.seriousRestBreach30d, kind: 'number' },
  { key: 'health_check', header: 'Health check', value: (r) => (r.occHealthState ? OCC_EXPORT[r.occHealthState] : null) },
  { key: 'health_check_due', header: 'Health check due', value: (r) => r.occHealthDueOn, kind: 'date' },
  { key: 'condition_flag', header: 'Condition flag', value: (r) => r.conditionFlag, kind: 'boolean' },
  { key: 'allergy_flag', header: 'Allergy flag', value: (r) => r.allergyFlag, kind: 'boolean' },
];
