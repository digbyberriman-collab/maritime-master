/**
 * The fleet expiry list and counts (gap/02 X2, D3; DECISIONS C5, D-01):
 * `fleet_expiry_items` and `fleet_expiry_summary` over the vessels shown.
 *
 * - Nothing is requested until the scope is known (company id and the
 *   vessels shown) and the caller's gate allows it (`enabled`): a gate that
 *   is still loading or denied sends no request (fail closed, D-04).
 * - No vessels shown: `no_vessels`, without a request.
 * - The RPC is not in the database yet (`isMissingRelation`): `not_set_up`.
 *   It is the answer, not an error: it is cached and not retried.
 * - Any other error is `error` with a retry, for `PageError`. A vessel that
 *   left the user's reach (42501 `vessel_out_of_reach`) gets its own
 *   sentence and is not retried.
 * - Rows are the server's, mapped to camelCase; nothing is ever invented,
 *   and an answer this client cannot read (an unknown bucket) is an error.
 *
 * The explicit vessel ids are always sent: the server checks each one
 * against the caller's reach (D-X5-22), and the default selection already
 * holds only counted vessels (../lib/vesselsShown.ts).
 */
import { useQuery } from '@tanstack/react-query';
import { EXPIRY_BUCKETS, EXPIRY_BUCKET_SEVERITY, type ExpiryBucket } from '@/lib/records/expiry';
import { todayDateOnly } from '@/shared/lib/form';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { fleetDb } from '../lib/fleetDb';
import { isEndorsementState, type EndorsementState } from '../lib/endorsement';
import type { ExpiryLinkScope, FleetExpiryItemRow, FleetExpirySummaryRow } from '../types/db.pending';
import { fleetKeys, type FleetExpiryItemsFilters } from './keys';
import type { FleetVesselScope } from './useFleetVesselsShown';

/** The most rows one `fleet_expiry_items` page may ask for (`invalid_limit` above). */
export const FLEET_EXPIRY_MAX_LIMIT = 500;
/** The page size when none is given. */
export const FLEET_EXPIRY_DEFAULT_LIMIT = 100;
/** The longest search the server accepts (`invalid_search` above). */
export const FLEET_EXPIRY_MAX_SEARCH = 200;

/** One expiry item, as the list shows it. */
export interface FleetExpiryItem {
  sourceKey: string;
  itemType: string;
  recordId: string;
  vesselId: string | null;
  vesselName: string | null;
  vesselCode: string | null;
  profileId: string | null;
  personName: string | null;
  label: string;
  detail: string | null;
  expiresOn: string | null;
  daysRemaining: number | null;
  bucket: ExpiryBucket;
  windowDays: number;
  endorsementDueOn: string | null;
  endorsementState: EndorsementState | null;
  alertsMuted: boolean;
  linkScope: ExpiryLinkScope;
  /** Relative to the link scope's root (no leading slash). */
  linkRel: string;
}

export interface FleetExpiryItemsPage {
  items: FleetExpiryItem[];
  /** Every match of the filters (all pages); 0 when this page is empty. */
  total: number;
}

/** One count of `fleet_expiry_summary`. */
export interface FleetExpirySummaryEntry {
  sourceKey: string;
  itemType: string;
  /** Only when counted by vessel. */
  vesselId: string | null;
  bucket: ExpiryBucket;
  endorsementState: EndorsementState | null;
  /** Items with alerts on. */
  itemCount: number;
  /** Items whose alerts are off: counted here only, never in `itemCount`. */
  mutedCount: number;
}

/** What an expiry hook answers. `error` carries a retry for `PageError`. */
export type FleetExpiryState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'no_vessels' }
  | { state: 'not_set_up' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; data: T; refreshing: boolean; updatedAt: number; refresh: () => void };

/** A refusal or failure of an expiry read, worded for the reader. */
export class FleetExpiryError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'FleetExpiryError';
    this.reason = reason;
  }
}

/** The sentence for 42501 `vessel_out_of_reach`. */
export const VESSEL_OUT_OF_REACH_MESSAGE =
  'One of the vessels shown is no longer in your reach. Choose the vessels to show again, or show all vessels.';

type RpcError = { code?: string; message?: string } | null | undefined;

const NOT_SET_UP = { kind: 'not_set_up' } as const;
type Answer<T> = typeof NOT_SET_UP | { kind: 'ok'; value: T };

/** Classifies an RPC error: missing → not set up; out of reach → its sentence; else the error itself. */
function rethrow(error: NonNullable<RpcError>): never {
  if (error.code === '42501' && error.message === 'vessel_out_of_reach') {
    throw new FleetExpiryError('vessel_out_of_reach', VESSEL_OUT_OF_REACH_MESSAGE);
  }
  throw error;
}

/** Retrying cannot fix a missing reach or a refused request. */
const retryOnce = (failureCount: number, error: unknown) => {
  if (error instanceof FleetExpiryError) return false;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '42501' || code === '22023') return false;
  return failureCount < 1;
};

const BUCKETS: ReadonlySet<string> = new Set(EXPIRY_BUCKETS);

function readBucket(value: unknown): ExpiryBucket {
  if (typeof value === 'string' && BUCKETS.has(value)) return value as ExpiryBucket;
  throw new FleetExpiryError('unknown_bucket', 'The expiry list sent a status this version of STORM cannot show. Reload the page.');
}

function readEndorsement(value: unknown): EndorsementState | null {
  if (value === null || value === undefined) return null;
  if (isEndorsementState(value)) return value;
  throw new FleetExpiryError('unknown_endorsement_state', 'The expiry list sent a status this version of STORM cannot show. Reload the page.');
}

const toNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0)) || 0;

export function toFleetExpiryItem(row: FleetExpiryItemRow): FleetExpiryItem {
  return {
    sourceKey: row.source_key,
    itemType: row.item_type,
    recordId: row.record_id,
    vesselId: row.vessel_id,
    vesselName: row.vessel_name,
    vesselCode: row.vessel_code,
    profileId: row.profile_id,
    personName: row.person_name,
    label: row.label,
    detail: row.detail,
    expiresOn: row.expires_on,
    daysRemaining: row.days_remaining,
    bucket: readBucket(row.bucket),
    windowDays: row.window_days,
    endorsementDueOn: row.endorsement_due_on,
    endorsementState: readEndorsement(row.endorsement_state),
    alertsMuted: Boolean(row.alerts_muted),
    linkScope: row.link_scope,
    linkRel: row.link_rel,
  };
}

export function toFleetExpirySummaryEntry(row: FleetExpirySummaryRow): FleetExpirySummaryEntry {
  return {
    sourceKey: row.source_key,
    itemType: row.item_type,
    vesselId: row.vessel_id,
    bucket: readBucket(row.bucket),
    endorsementState: readEndorsement(row.endorsement_state),
    itemCount: toNumber(row.item_count),
    mutedCount: toNumber(row.muted_count),
  };
}

/** The filters a page may set; everything else defaults. */
export interface FleetExpiryItemsQuery {
  sources?: readonly string[] | null;
  buckets?: readonly ExpiryBucket[] | null;
  search?: string | null;
  includeUnassigned?: boolean;
  limit?: number;
  offset?: number;
  /** The day to count for (`yyyy-MM-dd`); today's local date when omitted. */
  today?: string;
}

/**
 * The filters as one stable value (the query key holds it): sources sorted,
 * buckets in severity order, search trimmed (null when blank), limit within
 * 1..500, offset ≥ 0, today's local date by default.
 */
export function normaliseExpiryItemsFilters(query: FleetExpiryItemsQuery = {}): FleetExpiryItemsFilters {
  const sources = query.sources && query.sources.length ? [...new Set(query.sources)].sort() : null;
  const buckets =
    query.buckets && query.buckets.length
      ? [...new Set(query.buckets)].filter((b) => BUCKETS.has(b)).sort((a, b) => EXPIRY_BUCKET_SEVERITY[a] - EXPIRY_BUCKET_SEVERITY[b])
      : null;
  const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim().slice(0, FLEET_EXPIRY_MAX_SEARCH) : null;
  const limit = Math.min(FLEET_EXPIRY_MAX_LIMIT, Math.max(1, Math.trunc(query.limit ?? FLEET_EXPIRY_DEFAULT_LIMIT)));
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  return {
    sources,
    buckets: buckets && buckets.length ? buckets : null,
    search,
    includeUnassigned: Boolean(query.includeUnassigned),
    limit,
    offset,
    today: query.today ?? todayDateOnly(),
  };
}

export async function fetchFleetExpiryItems(vesselIds: readonly string[], filters: FleetExpiryItemsFilters): Promise<Answer<FleetExpiryItemsPage>> {
  const { data, error } = await fleetDb.rpc('fleet_expiry_items', {
    p_vessel_ids: [...vesselIds],
    p_sources: filters.sources ? [...filters.sources] : null,
    p_buckets: filters.buckets ? [...filters.buckets] : null,
    p_search: filters.search,
    p_include_unassigned: filters.includeUnassigned,
    p_limit: filters.limit,
    p_offset: filters.offset,
    p_today: filters.today,
  });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  const rows = Array.isArray(data) ? data : [];
  return { kind: 'ok', value: { items: rows.map(toFleetExpiryItem), total: rows.length ? toNumber(rows[0].total_count) : 0 } };
}

export async function fetchFleetExpirySummary(vesselIds: readonly string[], byVessel: boolean, today: string): Promise<Answer<FleetExpirySummaryEntry[]>> {
  const { data, error } = await fleetDb.rpc('fleet_expiry_summary', {
    p_vessel_ids: [...vesselIds],
    p_by_vessel: byVessel,
    p_today: today,
  });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: (Array.isArray(data) ? data : []).map(toFleetExpirySummaryEntry) };
}

export interface FleetExpiryHookOptions {
  /** The page's gate: false (loading or denied) sends no request and answers `idle`. Default true. */
  enabled?: boolean;
}

interface QueryLike<T> {
  data: Answer<T> | undefined;
  error: unknown;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => unknown;
}

function stateOf<T>(query: QueryLike<T>, active: boolean, noVessels: boolean): FleetExpiryState<T> {
  if (!active) return { state: 'idle' };
  if (noVessels) return { state: 'no_vessels' };
  const retry = () => void query.refetch();
  if (query.data?.kind === 'not_set_up') return { state: 'not_set_up' };
  if (query.data?.kind === 'ok' && !query.error) {
    return { state: 'ready', data: query.data.value, refreshing: query.isFetching, updatedAt: query.dataUpdatedAt, refresh: retry };
  }
  if (query.error) return { state: 'error', error: query.error, retry };
  return { state: 'loading' };
}

/**
 * One page of the fleet expiry list for the vessels shown, most urgent
 * first. `scope` null (not known yet) answers `idle` without a request.
 */
export function useFleetExpiryItems(
  scope: FleetVesselScope | null,
  query: FleetExpiryItemsQuery = {},
  options: FleetExpiryHookOptions = {},
): FleetExpiryState<FleetExpiryItemsPage> {
  const filters = normaliseExpiryItemsFilters(query);
  const active = (options.enabled ?? true) && Boolean(scope?.companyId);
  const vesselIds = scope?.vesselIds ?? [];
  const noVessels = vesselIds.length === 0;
  const result = useQuery({
    queryKey: fleetKeys.expiry.items(scope?.companyId, vesselIds, filters),
    queryFn: () => fetchFleetExpiryItems(vesselIds, filters),
    enabled: active && !noVessels,
    retry: retryOnce,
    staleTime: 60_000,
  });
  return stateOf(result, active, noVessels);
}

/**
 * The fleet expiry counts for the vessels shown: per source, item type,
 * bucket and endorsement state (and vessel with `byVessel`). Muted items
 * are counted only in `mutedCount`.
 */
export function useFleetExpirySummary(
  scope: FleetVesselScope | null,
  query: { byVessel?: boolean; today?: string } = {},
  options: FleetExpiryHookOptions = {},
): FleetExpiryState<FleetExpirySummaryEntry[]> {
  const byVessel = Boolean(query.byVessel);
  const today = query.today ?? todayDateOnly();
  const active = (options.enabled ?? true) && Boolean(scope?.companyId);
  const vesselIds = scope?.vesselIds ?? [];
  const noVessels = vesselIds.length === 0;
  const result = useQuery({
    queryKey: fleetKeys.expiry.summary(scope?.companyId, vesselIds, byVessel, today),
    queryFn: () => fetchFleetExpirySummary(vesselIds, byVessel, today),
    enabled: active && !noVessels,
    retry: retryOnce,
    staleTime: 60_000,
  });
  return stateOf(result, active, noVessels);
}

// ─── Tallies ─────────────────────────────────────────────────────────────

/** The buckets that raise an alert (what a summary shows by default), most urgent first. */
export const ALERT_BUCKETS: readonly ExpiryBucket[] = ['expired', 'expiring_soon', 'expiring'];

export interface ExpiryTally {
  /** Items with alerts on, per bucket. */
  buckets: Record<ExpiryBucket, number>;
  /** Items with alerts on, per endorsement state. */
  endorsements: Record<EndorsementState, number>;
  /** Items whose alerts are off (any bucket). */
  muted: number;
  /** Items with alerts on (every bucket). */
  total: number;
}

/**
 * Adds up summary entries (optionally only those `include` keeps): per
 * bucket, per endorsement state, muted apart. An entry with an endorsement
 * state counts in its bucket and in its endorsement state.
 */
export function tallyExpirySummary(
  entries: readonly FleetExpirySummaryEntry[],
  include: (entry: FleetExpirySummaryEntry) => boolean = () => true,
): ExpiryTally {
  const tally: ExpiryTally = {
    buckets: { expired: 0, expiring_soon: 0, expiring: 0, valid: 0, no_expiry: 0 },
    endorsements: { overdue: 0, due: 0 },
    muted: 0,
    total: 0,
  };
  for (const entry of entries) {
    if (!include(entry)) continue;
    tally.buckets[entry.bucket] += entry.itemCount;
    if (entry.endorsementState) tally.endorsements[entry.endorsementState] += entry.itemCount;
    tally.muted += entry.mutedCount;
    tally.total += entry.itemCount;
  }
  return tally;
}
