/**
 * The fleet dashboard's reads (gap/02 D1, D3, D4, D6, D7, W9; DECISIONS
 * D-01, D-04): `fleet_dashboard_kpis`, `fleet_dashboard_panels` and
 * `fleet_vessel_comparison` over the vessels shown.
 *
 * - Nothing is requested until the scope is known (company and vessels
 *   shown) and the page's gate allows it (`enabled`): a gate that is still
 *   loading or denied sends no request (fail closed, D-04) and answers
 *   `idle`. No vessels shown: `no_vessels`, without a request.
 * - The default "Vessels shown" (every counted vessel) is sent as NULL, so
 *   the server also counts fleet-level items (corrective actions with no
 *   vessel, fleet insurance, company audits) for callers with fleet reach;
 *   any other selection is sent as explicit ids, which the server
 *   reach-checks (D-X5-22) and counts alone.
 * - The RPC is not in the database yet (`isMissingRelation`): `not_set_up`,
 *   cached and not retried. Any other error is `error` with a retry; a
 *   vessel that left the caller's reach (42501 `vessel_out_of_reach`) gets
 *   its own sentence and is not retried.
 * - The jsonb answers are parsed against the shapes the SQL writes; an
 *   answer this client cannot read is an error, never a guess or a zero.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { todayDateOnly } from '@/shared/lib/form';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { VESSEL_OUT_OF_REACH_MESSAGE } from '@/modules/fleet';
import type {
  DashboardPendingFunctions,
  FleetDashboardKpisJson,
  FleetDashboardPanelsJson,
  FleetVesselComparisonRow,
} from '../types/db.pending';

/** The dashboard module's typed client (the app's one client; only the type is widened). */
export const dashboardDb = pendingClient<NoPending, NoPending, DashboardPendingFunctions>();

/** The company and the vessels a dashboard read is for. */
export interface FleetDashboardScope {
  companyId: string;
  /** The vessels shown. */
  vesselIds: readonly string[];
  /** The default selection (every counted vessel): sent as NULL, fleet-level items included. */
  fleetWide: boolean;
}

/** The most items one ranked list may ask for (`invalid_limit` above). */
export const FLEET_PANELS_MAX_LIMIT = 20;
export const FLEET_PANELS_DEFAULT_LIMIT = 5;

// ─── Keys ───────────────────────────────────────────────────────────────

const NONE = 'none';
const sortedIds = (ids: readonly string[]): string[] => [...new Set(ids)].sort();
const company = (companyId: string | null | undefined) => ['dashboard', 'company', companyId ?? NONE] as const;
const fleetAll = (companyId: string | null | undefined) => [...company(companyId), 'fleet'] as const;

/**
 * React Query keys of the dashboard module. Every key carries the company
 * id and the vessel ids it was read for (sorted, so the same vessels in
 * another order share an entry), and whether the read was fleet-wide.
 * Invalidate by prefix: `dashboardKeys.fleet(companyId)`.
 */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  company,
  fleet: fleetAll,
  kpis: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean; today: string }) =>
    [...fleetAll(companyId), 'kpis', sortedIds(vesselIds), { fleetWide: opts.fleetWide, today: opts.today }] as const,
  panels: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean; limit: number; today: string }) =>
    [...fleetAll(companyId), 'panels', sortedIds(vesselIds), { fleetWide: opts.fleetWide, limit: opts.limit, today: opts.today }] as const,
  comparison: (companyId: string | null | undefined, vesselIds: readonly string[], opts: { fleetWide: boolean; today: string }) =>
    [...fleetAll(companyId), 'comparison', sortedIds(vesselIds), { fleetWide: opts.fleetWide, today: opts.today }] as const,
};

// ─── Parsing ────────────────────────────────────────────────────────────

const count = z.number().int().nonnegative();
const days = z.number().int();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const noAccess = z.object({ state: z.literal('no_access') });
const moduleOff = z.object({ state: z.literal('module_off') });
const notTracked = z.object({ state: z.literal('not_tracked') });
const linkScope = z.enum(['vessel', 'fleet', 'workspace']);

const kpisSchema = z.object({
  vessels: count,
  today: dateOnly,
  tiles: z.object({
    documents: z.discriminatedUnion('state', [
      noAccess,
      z.object({
        state: z.literal('ok'),
        value: count,
        vessels: count,
        parts: z.object({
          expired_vessel_certificates: count,
          expired_crew_documents: count,
          expired_crew_qualifications: count,
          endorsements_overdue: count,
          expiring: count,
          // C-1 split of `expiring` by source (D-381); absent in answers from before it.
          expiring_vessel_certificates: count.optional(),
          expiring_crew_items: count.optional(),
        }),
      }),
    ]),
    hours_of_rest: z.discriminatedUnion('state', [
      noAccess,
      z.object({ state: z.literal('module_off'), vessels_off: count }),
      z.object({
        state: z.literal('ok'),
        value: count,
        breach_days: count,
        near_threshold: count,
        crew_without_entries: count,
        vessels_logging: count,
        vessels_off: count,
      }),
    ]),
    safety: z.discriminatedUnion('state', [
      noAccess,
      moduleOff,
      z.object({
        state: z.literal('ok'),
        value: count,
        vessels: count,
        open_corrective_actions: count.nullable(),
        overdue_corrective_actions: count.nullable(),
        overdue_drills: count.nullable(),
      }),
    ]),
    technical: z.discriminatedUnion('state', [
      noAccess,
      moduleOff,
      z.object({ state: z.literal('ok'), value: count, vessels: count, overdue_jobs: count, pending_approval: count, open_jobs: count }),
    ]),
    leave: z.object({ state: z.literal('not_enabled') }),
    finance: z.object({ state: z.literal('hidden') }),
  }),
});

const vessel = {
  vessel_id: z.string().nullable(),
  vessel_name: z.string().nullable(),
  vessel_code: z.string().nullable(),
};

const expiryItem = z.object({
  ...vessel,
  source_key: z.string(),
  item_type: z.string(),
  record_id: z.string(),
  person_name: z.string().nullable(),
  label: z.string(),
  detail: z.string().nullable(),
  expires_on: dateOnly.nullable(),
  days_remaining: days.nullable(),
  bucket: z.string(),
  endorsement_due_on: dateOnly.nullable(),
  endorsement_state: z.string().nullable(),
  link_scope: linkScope,
  link_rel: z.string(),
});
const expiryGroup = z.object({ total: count, items: z.array(expiryItem) });

const listOf = <T extends z.ZodTypeAny>(item: T) =>
  z.discriminatedUnion('state', [noAccess, moduleOff, notTracked, z.object({ state: z.literal('ok'), total: count, items: z.array(item) })]);

const panelsSchema = z.object({
  vessels: count,
  today: dateOnly,
  expiry: z.discriminatedUnion('state', [
    noAccess,
    z.object({
      state: z.literal('ok'),
      groups: z.object({ vessel_certificates: expiryGroup, crew_documents: expiryGroup, crew_qualifications: expiryGroup }),
    }),
  ]),
  corrective_actions: z.discriminatedUnion('state', [
    noAccess,
    moduleOff,
    z.object({
      state: z.literal('ok'),
      total: count,
      overdue: count,
      items: z.array(
        z.object({
          ...vessel,
          id: z.string(),
          action_number: z.string(),
          description: z.string(),
          action_type: z.string(),
          status: z.string(),
          due_date: dateOnly,
          days_overdue: count,
          source: z.enum(['incident', 'audit_finding', 'none']),
          source_id: z.string().nullable(),
        }),
      ),
    }),
  ]),
  overdue_drills: listOf(
    z.object({ ...vessel, id: z.string(), drill_number: z.string(), drill_type: z.string().nullable(), scheduled_on: dateOnly, days_overdue: count }),
  ),
  hess: listOf(z.object({ ...vessel, next_due_on: dateOnly, days_remaining: days })),
  insurance: listOf(
    z.object({
      ...vessel,
      record_id: z.string(),
      label: z.string(),
      detail: z.string().nullable(),
      expires_on: dateOnly,
      days_remaining: days.nullable(),
      bucket: z.string(),
      link_scope: linkScope,
      link_rel: z.string(),
    }),
  ),
  surveys: listOf(
    z.object({
      ...vessel,
      kind: z.enum(['audit', 'certificate_survey']),
      id: z.string(),
      reference: z.string().nullable(),
      label: z.string(),
      status: z.string().nullable(),
      due_on: dateOnly,
      days_remaining: days,
    }),
  ),
  work_list: z.discriminatedUnion('state', [
    noAccess,
    moduleOff,
    z.object({
      state: z.literal('ok'),
      vessels: z.array(
        z.object({ vessel_id: z.string(), vessel_name: z.string(), vessel_code: z.string().nullable(), open: count, overdue: count, pending_approval: count }),
      ),
    }),
  ]),
});

const comparisonGroups = {
  documents: z
    .object({
      value: count,
      expired: count,
      endorsements_overdue: count,
      expiring: count,
      // C-1 split by source (D-381); absent in answers from before it.
      expired_vessel_certificates: count.optional(),
      expired_crew_items: count.optional(),
      expiring_vessel_certificates: count.optional(),
      expiring_crew_items: count.optional(),
    })
    .nullable(),
  safety: z
    .object({ open_corrective_actions: count.nullable(), overdue_corrective_actions: count.nullable(), overdue_drills: count.nullable() })
    .nullable(),
  technical: z.object({ open_jobs: count, overdue_jobs: count, pending_approval: count }).nullable(),
  insurance: z.object({ expired: count, expiring: count }).nullable(),
  hours_of_rest: z.object({ breach_days: count, near_threshold: count, crew_without_entries: count }).nullable(),
};
const comparisonRow = z.object({ vessel_id: z.string(), vessel_name: z.string(), vessel_code: z.string().nullable(), ...comparisonGroups });

/** One vessel of the comparison; a NULL group is "–" (no access, or its module off). Within a group, null = not counted. */
export interface FleetVesselComparison {
  vessel_id: string;
  vessel_name: string;
  vessel_code: string | null;
  /** The four by-source counts are optional (C-1, D-381): answers from before the split carry none. */
  documents: {
    value: number;
    expired: number;
    endorsements_overdue: number;
    expiring: number;
    expired_vessel_certificates?: number;
    expired_crew_items?: number;
    expiring_vessel_certificates?: number;
    expiring_crew_items?: number;
  } | null;
  safety: { open_corrective_actions: number | null; overdue_corrective_actions: number | null; overdue_drills: number | null } | null;
  technical: { open_jobs: number; overdue_jobs: number; pending_approval: number } | null;
  insurance: { expired: number; expiring: number } | null;
  hours_of_rest: { breach_days: number; near_threshold: number; crew_without_entries: number } | null;
}

// ─── Errors ─────────────────────────────────────────────────────────────

/** A refusal or failure of a dashboard read, worded for the reader. */
export class FleetDashboardError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'FleetDashboardError';
    this.reason = reason;
  }
}

export const UNREADABLE_ANSWER_MESSAGE = 'The dashboard sent an answer this version of STORM cannot show. Reload the page.';

type RpcError = { code?: string; message?: string };

function rethrow(error: RpcError): never {
  if (error.code === '42501' && error.message === 'vessel_out_of_reach') {
    throw new FleetDashboardError('vessel_out_of_reach', VESSEL_OUT_OF_REACH_MESSAGE);
  }
  throw error;
}

/**
 * The answer, checked against the schema the SQL writes. The schemas above
 * are the runtime contract of the TS shapes in ../types/db.pending.ts
 * (zod's inferred types are not used: they need compiler options this
 * project does not set).
 */
function parse<T>(schema: z.ZodTypeAny, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new FleetDashboardError('unreadable', UNREADABLE_ANSWER_MESSAGE);
  return result.data as T;
}

/** Retrying cannot fix a missing reach, a refused request or an answer this client cannot read. */
export const retryDashboardRead = (failureCount: number, error: unknown): boolean => {
  if (error instanceof FleetDashboardError) return false;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '42501' || code === '22023') return false;
  return failureCount < 1;
};

const NOT_SET_UP = { kind: 'not_set_up' } as const;
type Answer<T> = typeof NOT_SET_UP | { kind: 'ok'; value: T };

const vesselArg = (scope: FleetDashboardScope): string[] | null => (scope.fleetWide ? null : [...scope.vesselIds]);

// ─── Fetchers ───────────────────────────────────────────────────────────

export async function fetchFleetDashboardKpis(scope: FleetDashboardScope, today: string): Promise<Answer<FleetDashboardKpisJson>> {
  const { data, error } = await dashboardDb.rpc('fleet_dashboard_kpis', { p_vessel_ids: vesselArg(scope), p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetDashboardKpisJson>(kpisSchema, data) };
}

export async function fetchFleetDashboardPanels(scope: FleetDashboardScope, limit: number, today: string): Promise<Answer<FleetDashboardPanelsJson>> {
  const { data, error } = await dashboardDb.rpc('fleet_dashboard_panels', { p_vessel_ids: vesselArg(scope), p_limit: limit, p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetDashboardPanelsJson>(panelsSchema, data) };
}

export async function fetchFleetVesselComparison(scope: FleetDashboardScope, today: string): Promise<Answer<FleetVesselComparison[]>> {
  const { data, error } = await dashboardDb.rpc('fleet_vessel_comparison', { p_vessel_ids: vesselArg(scope), p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  const rows: FleetVesselComparisonRow[] = Array.isArray(data) ? data : [];
  return { kind: 'ok', value: rows.map((row) => parse<FleetVesselComparison>(comparisonRow, row)) };
}

// ─── Hooks ──────────────────────────────────────────────────────────────

/** What a dashboard hook answers. `error` carries a retry; `ready` the read time (D-88) and a refresh. */
export type FleetDashboardState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'no_vessels' }
  | { state: 'not_set_up' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; data: T; refreshing: boolean; updatedAt: number; refresh: () => void };

export interface FleetDashboardHookOptions {
  /** The page's gate: false (loading or denied) sends no request and answers `idle`. Default true. */
  enabled?: boolean;
  /** The day to count for (`yyyy-MM-dd`); today's local date when omitted. */
  today?: string;
}

interface QueryLike<T> {
  data: Answer<T> | undefined;
  error: unknown;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => unknown;
}

function stateOf<T>(query: QueryLike<T>, active: boolean, noVessels: boolean): FleetDashboardState<T> {
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

/** The query only runs with a scope (`enabled`); a refetch without one fails instead of reading the wrong vessels. */
function requireScope(scope: FleetDashboardScope | null): FleetDashboardScope {
  if (!scope) throw new FleetDashboardError('no_scope', 'The vessels to show are not known yet.');
  return scope;
}

function useScopeFlags(scope: FleetDashboardScope | null, options: FleetDashboardHookOptions) {
  const active = (options.enabled ?? true) && Boolean(scope?.companyId);
  const vesselIds = scope?.vesselIds ?? [];
  return { active, vesselIds, noVessels: vesselIds.length === 0, fleetWide: Boolean(scope?.fleetWide), today: options.today ?? todayDateOnly() };
}

/** The KPI row (W9) for the vessels shown. `scope` null (not known yet) answers `idle` without a request. */
export function useFleetDashboardKpis(
  scope: FleetDashboardScope | null,
  options: FleetDashboardHookOptions = {},
): FleetDashboardState<FleetDashboardKpisJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = useScopeFlags(scope, options);
  const result = useQuery({
    queryKey: dashboardKeys.kpis(scope?.companyId, vesselIds, { fleetWide, today }),
    queryFn: () => fetchFleetDashboardKpis(requireScope(scope), today),
    enabled: active && !noVessels,
    retry: retryDashboardRead,
    staleTime: 60_000,
  });
  return stateOf(result, active, noVessels);
}

/** The ranked lists for the vessels shown, at most `limit` items each (1..20, default 5). */
export function useFleetDashboardPanels(
  scope: FleetDashboardScope | null,
  options: FleetDashboardHookOptions & { limit?: number } = {},
): FleetDashboardState<FleetDashboardPanelsJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = useScopeFlags(scope, options);
  const limit = Math.min(FLEET_PANELS_MAX_LIMIT, Math.max(1, Math.trunc(options.limit ?? FLEET_PANELS_DEFAULT_LIMIT)));
  const result = useQuery({
    queryKey: dashboardKeys.panels(scope?.companyId, vesselIds, { fleetWide, limit, today }),
    queryFn: () => fetchFleetDashboardPanels(requireScope(scope), limit, today),
    enabled: active && !noVessels,
    retry: retryDashboardRead,
    staleTime: 60_000,
  });
  return stateOf(result, active, noVessels);
}

/** One row per vessel shown (the health matrix and the Vessel comparison report). */
export function useFleetVesselComparison(
  scope: FleetDashboardScope | null,
  options: FleetDashboardHookOptions = {},
): FleetDashboardState<FleetVesselComparison[]> {
  const { active, vesselIds, noVessels, fleetWide, today } = useScopeFlags(scope, options);
  const result = useQuery({
    queryKey: dashboardKeys.comparison(scope?.companyId, vesselIds, { fleetWide, today }),
    queryFn: () => fetchFleetVesselComparison(requireScope(scope), today),
    enabled: active && !noVessels,
    retry: retryDashboardRead,
    staleTime: 60_000,
  });
  return stateOf(result, active, noVessels);
}
