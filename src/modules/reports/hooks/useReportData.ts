/**
 * The reports module's reads (gap/02 R1, R14; DECISIONS D-01, D-04):
 * `fleet_report_trends` (the hub's monthly trends) and `fleet_vessel_list`
 * (the Fleet list report, X5-03B), over the vessels shown.
 *
 * - Nothing is requested until the scope is known (company and vessels
 *   shown) and the page's gate allows it (`enabled`): a gate that is still
 *   loading or denied sends no request (fail closed, D-04) and answers
 *   `idle`. No vessels shown: `no_vessels`, without a request.
 * - The default "Vessels shown" is sent as NULL (fleet-level items count for
 *   callers with fleet reach); any other selection as explicit ids, which
 *   the server reach-checks (D-X5-22).
 * - The RPC is not in the database yet (`isMissingRelation`): `not_set_up`,
 *   cached and not retried ("This report is not set up yet"). Any other
 *   error is `error` with a retry; a vessel out of reach (42501
 *   `vessel_out_of_reach`) gets its own sentence and is not retried.
 * - The answers are parsed against the shapes the SQL writes; an answer
 *   this client cannot read is an error, never a guess or a zero.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { todayDateOnly } from '@/shared/lib/form';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { VESSEL_OUT_OF_REACH_MESSAGE } from '@/modules/fleet';
import type { FleetDashboardState } from '@/modules/dashboard/hooks/useFleetDashboard';
import { reportsDb } from '../lib/reportsDb';
import type { ReportPeriod } from '../lib/trends';
import type { FleetReportTrendsJson, FleetVesselListRow } from '../types/db.pending';
import { reportsKeys } from './keys';

/** What a report hook answers (the dashboard hooks' shape, so pages share their states). */
export type ReportDataState<T> = FleetDashboardState<T>;

/** The company and the vessels a report read is for. */
export interface ReportScope {
  companyId: string;
  vesselIds: readonly string[];
  /** The default selection (every counted vessel): sent as NULL. */
  fleetWide: boolean;
}

/** A refusal or failure of a report read, worded for the reader. */
export class ReportDataError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'ReportDataError';
    this.reason = reason;
  }
}

export const UNREADABLE_REPORT_MESSAGE = 'The report sent an answer this version of STORM cannot show. Reload the page.';
export const INVALID_PERIOD_MESSAGE = 'Choose a period of 3, 6 or 12 months.';

type RpcError = { code?: string; message?: string };

function rethrow(error: RpcError): never {
  if (error.code === '42501' && error.message === 'vessel_out_of_reach') {
    throw new ReportDataError('vessel_out_of_reach', VESSEL_OUT_OF_REACH_MESSAGE);
  }
  if (error.code === '22023' && error.message === 'invalid_period') {
    throw new ReportDataError('invalid_period', INVALID_PERIOD_MESSAGE);
  }
  throw error;
}

function parse<T>(schema: z.ZodTypeAny, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ReportDataError('unreadable', UNREADABLE_REPORT_MESSAGE);
  return result.data as T;
}

/** Retrying cannot fix a missing reach, a refused request or an answer this client cannot read. */
export const retryReportRead = (failureCount: number, error: unknown): boolean => {
  if (error instanceof ReportDataError) return false;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '42501' || code === '22023') return false;
  return failureCount < 1;
};

// ─── Parsing ────────────────────────────────────────────────────────────

const count = z.number().int().nonnegative();
const month = z.string().regex(/^\d{4}-\d{2}-01$/);
const counts = z.array(count);
const noAccess = z.object({ state: z.literal('no_access') });
const moduleOff = z.object({ state: z.literal('module_off') });

const trendsSchema = z
  .object({
    vessels: count,
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    months: z.array(month).min(1),
    ahead: z.array(month).min(1),
    incidents: z.discriminatedUnion('state', [noAccess, moduleOff, z.object({ state: z.literal('ok'), vessels: count, counts })]),
    corrective_actions: z.discriminatedUnion('state', [noAccess, moduleOff, z.object({ state: z.literal('ok'), vessels: count, opened: counts, closed: counts })]),
    drills: z.discriminatedUnion('state', [noAccess, moduleOff, z.object({ state: z.literal('ok'), vessels: count, completed: counts, overdue: counts })]),
    expiries: z.discriminatedUnion('state', [noAccess, z.object({ state: z.literal('ok'), vessels: count, expired: count, due: counts })]),
  })
  .superRefine((d, ctx) => {
    // Every series has one value per month of its axis.
    const n = d.months.length;
    const bad = (values: readonly number[], len: number) => values.length !== len;
    if (d.ahead.length !== n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ahead length' });
    if (d.incidents.state === 'ok' && bad(d.incidents.counts, n)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'incidents length' });
    if (d.corrective_actions.state === 'ok' && (bad(d.corrective_actions.opened, n) || bad(d.corrective_actions.closed, n))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'corrective actions length' });
    }
    if (d.drills.state === 'ok' && (bad(d.drills.completed, n) || bad(d.drills.overdue, n))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'drills length' });
    if (d.expiries.state === 'ok' && bad(d.expiries.due, d.ahead.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expiries length' });
  });

const nullableCount = count.nullable();
const vesselListRow = z.object({
  vessel_id: z.string(),
  vessel_name: z.string(),
  vessel_code: z.string().nullable(),
  vessel_type: z.string().nullable(),
  flag_state: z.string().nullable(),
  classification_society: z.string().nullable(),
  imo_number: z.string().nullable(),
  length_overall: z.number().nullable(),
  builder: z.string().nullable(),
  build_year: z.number().int().nullable(),
  fleet_group_id: z.string().nullable(),
  fleet_group_name: z.string().nullable(),
  is_counted: z.boolean(),
  active_crew: nullableCount,
  certificates_total: nullableCount,
  certificates_expired: nullableCount,
  certificates_expiring: nullableCount,
});

// ─── Fetchers ───────────────────────────────────────────────────────────

const NOT_SET_UP = { kind: 'not_set_up' } as const;
type Answer<T> = typeof NOT_SET_UP | { kind: 'ok'; value: T };

const vesselArg = (scope: ReportScope): string[] | null => (scope.fleetWide ? null : [...scope.vesselIds]);

export async function fetchReportTrends(scope: ReportScope, months: ReportPeriod, today: string): Promise<Answer<FleetReportTrendsJson>> {
  const { data, error } = await reportsDb.rpc('fleet_report_trends', { p_vessel_ids: vesselArg(scope), p_months: months, p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetReportTrendsJson>(trendsSchema, data) };
}

export async function fetchFleetVesselList(scope: ReportScope, today: string): Promise<Answer<FleetVesselListRow[]>> {
  const { data, error } = await reportsDb.rpc('fleet_vessel_list', { p_vessel_ids: vesselArg(scope), p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  // PostgREST sends numeric as a number or, for large values, a string: accept both, never guess others.
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return {
    kind: 'ok',
    value: rows.map((row) => {
      const r = row as Record<string, unknown>;
      const loa = typeof r.length_overall === 'string' && r.length_overall.trim() !== '' ? Number(r.length_overall) : r.length_overall;
      return parse<FleetVesselListRow>(vesselListRow, { ...r, length_overall: loa });
    }),
  };
}

// ─── Hooks ──────────────────────────────────────────────────────────────

export interface ReportHookOptions {
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

function stateOf<T>(query: QueryLike<T>, active: boolean, noVessels: boolean): ReportDataState<T> {
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

function requireScope(scope: ReportScope | null): ReportScope {
  if (!scope) throw new ReportDataError('no_scope', 'The vessels to show are not known yet.');
  return scope;
}

function flags(scope: ReportScope | null, options: ReportHookOptions) {
  const active = (options.enabled ?? true) && Boolean(scope?.companyId);
  const vesselIds = scope?.vesselIds ?? [];
  return { active, vesselIds, noVessels: vesselIds.length === 0, fleetWide: Boolean(scope?.fleetWide), today: options.today ?? todayDateOnly() };
}

/** The hub's monthly trends over `months` (3, 6 or 12) for the vessels shown. */
export function useReportTrends(
  scope: ReportScope | null,
  months: ReportPeriod,
  options: ReportHookOptions = {},
): ReportDataState<FleetReportTrendsJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.trends(scope?.companyId, vesselIds, { fleetWide, months, today }),
    queryFn: () => fetchReportTrends(requireScope(scope), months, today),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}

/** One row per vessel shown (the Fleet list report, X5-03B). */
export function useFleetVesselList(scope: ReportScope | null, options: ReportHookOptions = {}): ReportDataState<FleetVesselListRow[]> {
  const { active, vesselIds, noVessels, fleetWide, today } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.vesselList(scope?.companyId, vesselIds, { fleetWide, today }),
    queryFn: () => fetchFleetVesselList(requireScope(scope), today),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}
