/**
 * Crew compliance of a vessel (X1-06; gap/04 C5, C33, C36, W5): what the
 * server's requirement engine (20261124060600, crew_compliance_summary_for
 * and crew_requirement_status_for) answers, parsed into lib/compliance.ts's
 * shapes.
 *
 * - useVesselCompliance(vesselId): one summary per crew member of the vessel
 *   (crew_vessel_compliance: counts, status, next expiry, the two list dots,
 *   the issues worst first). With `detail: 'cells'` it also reads every
 *   status row (crew_vessel_requirement_status: one per person and
 *   requirement, for the status matrix); the crew list asks only for the
 *   summaries.
 * - usePersonRequirementStatus(vesselId, profileId): one person's status
 *   rows on the vessel (the profile's "Missing required" block and the add
 *   dialog's "Missing for current role"); a person may read their own with
 *   crew_certificates.view_own.
 *
 * Gates are the server's: crew_compliance.view on the vessel (42501
 * otherwise; externals refused). A 42501 is 'denied' (the list keeps its
 * dots as a dash), never an empty list.
 *
 * D-01. While 20261124060600 is not applied the RPCs are missing
 * (PGRST202, a 42883 naming the function, a missing relation): the hooks
 * answer 'not_set_up' and the page shows COMPLIANCE_NOT_SET_UP_NOTICE. Any
 * other error is an error state with Retry. A row whose words are not the
 * engine's (an unknown state, tab or reason) is an error too, never a
 * guess. Nothing is mocked.
 */
import { useQuery } from '@tanstack/react-query';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { isMissingTable } from '@/integrations/supabase/missingRelation';
import type { Json } from '@/integrations/supabase/types';
import { EXPIRY_BUCKETS, type ExpiryBucket } from '@/lib/records/expiry';
import {
  COMPLIANCE_NOT_SET_UP_NOTICE,
  REQUIREMENT_KINDS,
  isComplianceDot,
  isComplianceIssueReason,
  isComplianceStatus,
  isComplianceTab,
  isGapReason,
  isRequirementState,
  isSatisfiedVia,
  type ComplianceCounts,
  type ComplianceIssue,
  type RequirementKind,
  type RequirementStatus,
} from '../lib/compliance';
import { CREW_PLACEMENT_KINDS, type CrewPlacementKind } from '../lib/crewStatus';
import { displayNameOf, isMissingRpc } from '../lib/crewListModel';
import type {
  CrewComplianceSummaryDbRow,
  CrewDocumentVerificationStatus,
  CrewPendingFunctions,
  CrewPendingTables,
  CrewRequirementStatusDbRow,
} from '../types/db.pending';
import { crewKeys } from './crewKeys';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const VESSEL_COMPLIANCE_RPC = 'crew_vessel_compliance';
export const REQUIREMENT_STATUS_RPC = 'crew_vessel_requirement_status';

export { COMPLIANCE_NOT_SET_UP_NOTICE };

const NONE = 'none';

/**
 * Keys of the compliance reads. Every key carries the company and the
 * vessel (crewKeys.vessel), so a vessel switch never shares an entry;
 * invalidate `complianceKeys.vessel(companyId, vesselId)` after a
 * configuration write or a document change on that vessel.
 */
export const complianceKeys = {
  vessel: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...crewKeys.vessel(companyId, vesselId), 'compliance'] as const,
  summary: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...complianceKeys.vessel(companyId, vesselId), 'summary'] as const,
  cells: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...complianceKeys.vessel(companyId, vesselId), 'cells'] as const,
  person: (companyId: string | null | undefined, vesselId: string | null | undefined, profileId: string | null | undefined) =>
    [...complianceKeys.vessel(companyId, vesselId), 'person', profileId ?? NONE] as const,
  config: (companyId: string | null | undefined, vesselId: string | null | undefined) =>
    [...complianceKeys.vessel(companyId, vesselId), 'config'] as const,
};

/** True for any compliance key of the company (every vessel): a company-wide write (a new type, a rule) changes them all. */
export function isCompanyComplianceKey(key: readonly unknown[], companyId: string | null | undefined): boolean {
  return key[0] === 'crew' && key[1] === 'company' && key[2] === (companyId ?? NONE) && key[3] === 'vessel' && key[5] === 'compliance';
}

// ---------------------------------------------------------------- errors

/** The RPC is not applied yet (D-01). */
export class ComplianceNotSetUp extends Error {
  constructor() {
    super(COMPLIANCE_NOT_SET_UP_NOTICE);
    this.name = 'ComplianceNotSetUp';
  }
}

/** The server answered something that is not the engine's contract (an unknown word, a missing id). */
export class ComplianceAnswerError extends Error {
  readonly answer: unknown;
  constructor(message: string, answer: unknown) {
    super(message);
    this.name = 'ComplianceAnswerError';
    this.answer = answer;
  }
}

const codeOf = (error: unknown): unknown => (error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined);

/** PGRST202, a 42883 naming the function, or a missing relation (D-01). */
export const complianceNotApplied = (error: unknown, fn: string): boolean => isMissingRpc(error, fn) || isMissingTable(error);

/** A refusal the server sent as 42501 (the caller may not see compliance on this vessel). */
export const isComplianceDenied = (error: unknown): boolean => codeOf(error) === '42501';

const detailOf = (error: unknown): string | null => {
  const details = error && typeof error === 'object' ? (error as { details?: unknown }).details : undefined;
  return typeof details === 'string' && details.trim() && !/^[a-z0-9_]+$/.test(details.trim()) ? details.trim() : null;
};

/** The sentence a denied read shows (the server's DETAIL when it wrote one). */
export const COMPLIANCE_DENIED_NOTICE = "You can't see crew compliance on this vessel.";

export function noComplianceRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ComplianceNotSetUp || error instanceof ComplianceAnswerError) return false;
  const code = codeOf(error);
  return code !== '42501' && code !== 'P0002' && code !== '22023' && failureCount < 1;
}

// ---------------------------------------------------------------- parsing (the engine's words into lib/compliance.ts)

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const VERIFICATION_STATUSES = ['unverified', 'verified', 'conditionally_approved', 'rejected'] as const satisfies readonly CrewDocumentVerificationStatus[];

function checked<T>(ok: boolean, value: T, what: string, row: unknown): T {
  if (!ok) throw new ComplianceAnswerError(`The compliance answer has an unexpected ${what}.`, row);
  return value;
}

/** One status row with the person and the placement it belongs to. */
export interface CrewRequirementStatusRow extends RequirementStatus {
  companyId: string;
  vesselId: string;
  profileId: string;
  userId: string | null;
  positionId: string | null;
  placementKind: CrewPlacementKind;
}

/** crew_vessel_requirement_status's row in lib/compliance.ts's shape; an unknown word is a ComplianceAnswerError. */
export function parseRequirementStatusRow(row: CrewRequirementStatusDbRow): CrewRequirementStatusRow {
  if (!row || typeof row.row_id !== 'string' || typeof row.profile_id !== 'string') {
    throw new ComplianceAnswerError('The compliance answer has a row without its requirement or person.', row);
  }
  const bucket: ExpiryBucket | null =
    row.bucket === null ? null : checked(isOneOf(EXPIRY_BUCKETS, row.bucket), row.bucket as ExpiryBucket, 'expiry bucket', row);
  const verification: CrewDocumentVerificationStatus | null =
    row.verification_status === null
      ? null
      : checked(isOneOf(VERIFICATION_STATUSES, row.verification_status), row.verification_status as CrewDocumentVerificationStatus, 'verification status', row);
  return {
    companyId: row.company_id,
    vesselId: row.vessel_id,
    profileId: row.profile_id,
    userId: row.user_id,
    positionId: row.position_id,
    placementKind: checked(isOneOf(CREW_PLACEMENT_KINDS, row.placement_kind), row.placement_kind as CrewPlacementKind, 'placement', row),
    rowId: row.row_id,
    groupKey: row.group_key,
    label: row.row_label,
    kind: checked(isOneOf(REQUIREMENT_KINDS, row.row_kind), row.row_kind as RequirementKind, 'requirement kind', row),
    tab: checked(isComplianceTab(row.tab), row.tab as RequirementStatus['tab'], 'tab', row),
    rowSort: Number(row.row_sort),
    state: checked(isRequirementState(row.state), row.state as RequirementStatus['state'], 'state', row),
    satisfyingDocumentId: row.satisfying_document_id,
    satisfyingRecordId: row.satisfying_record_id,
    satisfyingTypeId: row.satisfying_type_id,
    satisfyingName: row.satisfying_name,
    satisfiedVia:
      row.satisfied_via === null ? null : checked(isSatisfiedVia(row.satisfied_via), row.satisfied_via as RequirementStatus['satisfiedVia'], 'satisfied via', row),
    viaOptionTypeId: row.via_option_type_id,
    nextExpiry: row.next_expiry,
    noExpiry: Boolean(row.no_expiry),
    bucket,
    daysRemaining: row.days_remaining === null ? null : Number(row.days_remaining),
    verificationStatus: verification,
    isConditional: Boolean(row.is_conditional),
    isMuted: Boolean(row.is_muted),
    missingDate: Boolean(row.missing_date),
    hasFile: row.has_file === null ? null : Boolean(row.has_file),
    gapReason: row.gap_reason === null ? null : checked(isGapReason(row.gap_reason), row.gap_reason as RequirementStatus['gapReason'], 'gap reason', row),
    nearestDocumentId: row.nearest_document_id,
    nearestRecordId: row.nearest_record_id,
    nearestTypeId: row.nearest_type_id,
    nearestName: row.nearest_name,
  };
}

/** The issues jsonb ([{row_id, label, tab, state, reason}], worst first). */
export function parseComplianceIssues(issues: Json, row: unknown): ComplianceIssue[] {
  if (issues === null) return [];
  if (!Array.isArray(issues)) throw new ComplianceAnswerError('The compliance answer has issues that are not a list.', row);
  return issues.map((issue) => {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) throw new ComplianceAnswerError('The compliance answer has an unexpected issue.', row);
    const i = issue as Record<string, Json | undefined>;
    if (typeof i.row_id !== 'string' || typeof i.label !== 'string') throw new ComplianceAnswerError('The compliance answer has an issue without its requirement.', row);
    return {
      rowId: i.row_id,
      label: i.label,
      tab: checked(isComplianceTab(i.tab), i.tab as ComplianceIssue['tab'], 'issue tab', row),
      state: checked(isRequirementState(i.state), i.state as ComplianceIssue['state'], 'issue state', row),
      reason: checked(isComplianceIssueReason(i.reason), i.reason as ComplianceIssue['reason'], 'issue reason', row),
    };
  });
}

/** One crew member's summary on the vessel. */
export interface CrewComplianceSummary extends ComplianceCounts {
  companyId: string;
  vesselId: string;
  profileId: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  /** "Last, First" (crewListModel.displayNameOf). */
  displayName: string;
  positionId: string | null;
  positionName: string | null;
  positionText: string | null;
  departmentKey: string | null;
  rankTier: string | null;
  sortOrder: number | null;
  placementKind: CrewPlacementKind;
}

const count = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

/** crew_vessel_compliance's row in lib/compliance.ts's shape; an unknown word is a ComplianceAnswerError. */
export function parseComplianceSummaryRow(row: CrewComplianceSummaryDbRow): CrewComplianceSummary {
  if (!row || typeof row.profile_id !== 'string') throw new ComplianceAnswerError('The compliance answer has a summary without its person.', row);
  return {
    companyId: row.company_id,
    vesselId: row.vessel_id,
    profileId: row.profile_id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    displayName: displayNameOf(row.first_name, row.last_name),
    positionId: row.position_id,
    positionName: row.position_name,
    positionText: row.position_text,
    departmentKey: row.department_key,
    rankTier: row.rank_tier,
    sortOrder: row.sort_order === null ? null : Number(row.sort_order),
    placementKind: checked(isOneOf(CREW_PLACEMENT_KINDS, row.placement_kind), row.placement_kind as CrewPlacementKind, 'placement', row),
    required: count(row.required),
    met: count(row.met),
    expiring: count(row.expiring),
    expired: count(row.expired),
    missing: count(row.missing),
    conditional: count(row.conditional),
    muted: count(row.muted),
    docsRequired: count(row.docs_required),
    docsMet: count(row.docs_met),
    stcwRequired: count(row.stcw_required),
    stcwMet: count(row.stcw_met),
    qualsRequired: count(row.quals_required),
    qualsMet: count(row.quals_met),
    famRequired: count(row.fam_required),
    famMet: count(row.fam_met),
    status: checked(isComplianceStatus(row.status), row.status as ComplianceCounts['status'], 'status', row),
    nextExpiry: row.next_expiry,
    dotDocuments: checked(isComplianceDot(row.dot_documents), row.dot_documents as ComplianceCounts['dotDocuments'], 'documents dot', row),
    dotQualifications: checked(isComplianceDot(row.dot_qualifications), row.dot_qualifications as ComplianceCounts['dotQualifications'], 'qualifications dot', row),
    issues: parseComplianceIssues(row.issues, row),
  };
}

/** Status rows per person, in the engine's order (row sort, then the row id). */
export function groupStatusByProfile(rows: readonly CrewRequirementStatusRow[]): Map<string, CrewRequirementStatusRow[]> {
  const out = new Map<string, CrewRequirementStatusRow[]>();
  for (const r of rows) {
    const list = out.get(r.profileId) ?? [];
    list.push(r);
    out.set(r.profileId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.rowSort - b.rowSort || (a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------- reads

export interface VesselCompliance {
  /** One per crew member, in the server's order (department, position, name). */
  people: CrewComplianceSummary[];
  byProfile: ReadonlyMap<string, CrewComplianceSummary>;
  /** Every status row; empty unless `detail: 'cells'` was asked. */
  statuses: CrewRequirementStatusRow[];
  statusByProfile: ReadonlyMap<string, readonly CrewRequirementStatusRow[]>;
}

export type ComplianceDetail = 'summary' | 'cells';

function rethrowRead(error: unknown, fn: string): never {
  if (complianceNotApplied(error, fn)) throw new ComplianceNotSetUp();
  throw error;
}

export async function fetchVesselComplianceSummaries(vesselId: string): Promise<CrewComplianceSummary[]> {
  const { data, error } = await crewDb.rpc(VESSEL_COMPLIANCE_RPC, { p_vessel_id: vesselId });
  if (error) rethrowRead(error, VESSEL_COMPLIANCE_RPC);
  if (data !== null && !Array.isArray(data)) throw new ComplianceAnswerError('The compliance answer is not a list.', data);
  return (data ?? []).map(parseComplianceSummaryRow);
}

export async function fetchRequirementStatus(vesselId: string, profileId: string | null = null): Promise<CrewRequirementStatusRow[]> {
  const { data, error } = await crewDb.rpc(REQUIREMENT_STATUS_RPC, { p_vessel_id: vesselId, p_profile_id: profileId });
  if (error) rethrowRead(error, REQUIREMENT_STATUS_RPC);
  if (data !== null && !Array.isArray(data)) throw new ComplianceAnswerError('The compliance answer is not a list.', data);
  const rows = (data ?? []).map(parseRequirementStatusRow);
  // The server answers only the person asked for; a row of anyone else is
  // never shown as theirs (the visual harness answers one list for every call).
  return profileId ? rows.filter((r) => r.profileId === profileId) : rows;
}

/** The vessel's summaries and, with 'cells', every status row (two reads in parallel). */
export async function fetchVesselCompliance(vesselId: string, detail: ComplianceDetail = 'summary'): Promise<VesselCompliance> {
  const [people, statuses] = await Promise.all([
    fetchVesselComplianceSummaries(vesselId),
    detail === 'cells' ? fetchRequirementStatus(vesselId, null) : Promise.resolve([] as CrewRequirementStatusRow[]),
  ]);
  return {
    people,
    byProfile: new Map(people.map((p) => [p.profileId, p])),
    statuses,
    statusByProfile: groupStatusByProfile(statuses),
  };
}

export type VesselComplianceState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** 20261124060600 is not applied (D-01): COMPLIANCE_NOT_SET_UP_NOTICE; the list dots stay a dash. */
  | { status: 'not_set_up'; notice: string }
  /** 42501: the caller may not see compliance on this vessel. */
  | { status: 'denied'; notice: string }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; compliance: VesselCompliance };

interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  refetch: () => unknown;
}

/** The state of a compliance read (shared by the hooks). */
export function complianceState<T, R>(enabled: boolean, query: QueryLike<T>, ready: (data: T) => R) {
  if (!enabled) return { status: 'idle' } as const;
  if (query.error instanceof ComplianceNotSetUp) return { status: 'not_set_up', notice: COMPLIANCE_NOT_SET_UP_NOTICE } as const;
  if (query.error && isComplianceDenied(query.error)) return { status: 'denied', notice: detailOf(query.error) ?? COMPLIANCE_DENIED_NOTICE } as const;
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() } as const;
  if (query.data === undefined) return { status: 'loading' } as const;
  return ready(query.data);
}

/**
 * The vessel's crew compliance. Sends nothing while `enabled` is false (a
 * gate loading or denied) or without a vessel and company.
 */
export function useVesselCompliance(
  vesselId: string | null | undefined,
  options: { companyId: string | null | undefined; enabled?: boolean; detail?: ComplianceDetail },
): VesselComplianceState {
  const detail = options.detail ?? 'summary';
  const enabled = (options.enabled ?? true) && Boolean(vesselId) && Boolean(options.companyId);
  const query = useQuery({
    queryKey: detail === 'cells' ? complianceKeys.cells(options.companyId, vesselId) : complianceKeys.summary(options.companyId, vesselId),
    queryFn: () => fetchVesselCompliance(vesselId as string, detail),
    enabled,
    retry: noComplianceRetry,
    staleTime: 60_000,
  });
  return complianceState(enabled, query, (compliance) => ({ status: 'ready', compliance }) as const);
}

export type PersonRequirementStatusState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up'; notice: string }
  | { status: 'denied'; notice: string }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; rows: CrewRequirementStatusRow[] };

/** One person's status rows on the vessel (their own with crew_certificates.view_own). */
export function usePersonRequirementStatus(
  vesselId: string | null | undefined,
  profileId: string | null | undefined,
  options: { companyId: string | null | undefined; enabled?: boolean },
): PersonRequirementStatusState {
  const enabled = (options.enabled ?? true) && Boolean(vesselId) && Boolean(profileId) && Boolean(options.companyId);
  const query = useQuery({
    queryKey: complianceKeys.person(options.companyId, vesselId, profileId),
    queryFn: () => fetchRequirementStatus(vesselId as string, profileId as string),
    enabled,
    retry: noComplianceRetry,
    staleTime: 60_000,
  });
  return complianceState(enabled, query, (rows) => ({ status: 'ready', rows }) as const);
}
