/**
 * The fleet operations reports' reads (gap/02 R7, R13, R17, R18; X5 spec
 * X5-10B; DECISIONS D-01, D-04): `fleet_report_overdue_drills`,
 * `fleet_report_insurance`, `fleet_report_audits` and
 * `fleet_report_work_list` (`20261124041000_fleet_report_ops_sources.sql`),
 * over the vessels shown.
 *
 * The same rules as the other report reads (./useReportData.ts,
 * ./useCrewReports.ts):
 * - nothing is requested until the scope is known and the page's gate allows
 *   it (`enabled`; `idle` meanwhile); no vessels shown answers `no_vessels`
 *   without a request;
 * - the default "Vessels shown" is sent as NULL (fleet insurance and company
 *   audits count for readers with fleet reach), any other choice as explicit
 *   ids the server reach-checks (D-X5-22);
 * - a missing RPC (`isMissingRelation`) is `not_set_up`, cached and not
 *   retried ("This report is not set up yet");
 * - 42501 `vessel_out_of_reach`, 22023 `invalid_period` / `period_too_long`
 *   get their own sentences and are not retried; any other error is an error
 *   with a retry;
 * - every answer is parsed against the shape the SQL writes; one this client
 *   cannot read is an error, never a guess or a zero.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { todayDateOnly } from '@/shared/lib/form';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { VESSEL_OUT_OF_REACH_MESSAGE } from '@/modules/fleet';
import { reportsDb } from '../lib/reportsDb';
import type {
  FleetReportAuditsJson,
  FleetReportInsuranceJson,
  FleetReportOverdueDrillsJson,
  FleetReportWorkListJson,
} from '../types/db.pending';
import { reportsKeys } from './keys';
import {
  ReportDataError,
  UNREADABLE_REPORT_MESSAGE,
  retryReportRead,
  type ReportDataState,
  type ReportHookOptions,
  type ReportScope,
} from './useReportData';

export const AUDIT_PERIOD_TOO_LONG_MESSAGE = 'Choose a period of at most two years (731 days).';
export const AUDIT_PERIOD_INVALID_MESSAGE = 'The period must start on or before its last day.';

type RpcError = { code?: string; message?: string };

function rethrow(error: RpcError): never {
  if (error.code === '42501' && error.message === 'vessel_out_of_reach') {
    throw new ReportDataError('vessel_out_of_reach', VESSEL_OUT_OF_REACH_MESSAGE);
  }
  if (error.code === '22023' && error.message === 'period_too_long') throw new ReportDataError('period_too_long', AUDIT_PERIOD_TOO_LONG_MESSAGE);
  if (error.code === '22023' && error.message === 'invalid_period') throw new ReportDataError('invalid_period', AUDIT_PERIOD_INVALID_MESSAGE);
  throw error;
}

function parse<T>(schema: z.ZodTypeAny, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ReportDataError('unreadable', UNREADABLE_REPORT_MESSAGE);
  return result.data as T;
}

// ─── Parsing ────────────────────────────────────────────────────────────

const count = z.number().int().nonnegative();
const nullableCount = count.nullable();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string().nullable();
const coverage = z.object({
  vessel_id: z.string(),
  vessel_name: z.string(),
  vessel_code: z.string().nullable(),
  state: z.enum(['ok', 'no_access', 'module_off']),
});

const drillsSchema = z.object({
  today: day,
  required_types: count,
  vessels: z.array(coverage),
  rows: z.array(
    z.object({
      kind: z.enum(['missed', 'lapsed', 'due_soon', 'never']),
      vessel_id: z.string(),
      drill_type_id: z.string(),
      drill_type: z.string(),
      category: z.string(),
      frequency_days: z.number().int().positive(),
      solas_reference: text,
      drill_id: z.string().nullable(),
      drill_number: text,
      status: text,
      due_on: day.nullable(),
      days_overdue: z.number().int().nullable(),
      last_done_on: day.nullable(),
      next_scheduled_on: day.nullable(),
    }),
  ),
});

const insuranceSchema = z.object({
  today: day,
  vessels: z.array(coverage.extend({ state: z.enum(['ok', 'no_access']) })),
  fleet_level: z.boolean(),
  rows: z.array(
    z.object({
      policy_id: z.string(),
      vessel_id: z.string().nullable(),
      policy_type: text,
      insurer: text,
      policy_number: text,
      coverage_start: day.nullable(),
      coverage_end: day.nullable(),
      days_remaining: z.number().int().nullable(),
      bucket: z.enum(['expired', 'expiring_soon', 'expiring', 'valid', 'no_expiry']),
      window_days: count,
      status: text,
      certificate_on_file: z.boolean(),
    }),
  ),
});

const findings = z.object({ total: count, open: count, major: count, minor: count, observations: count });

const auditsSchema = z.object({
  from: day,
  to: day,
  today: day,
  vessels: z.array(coverage.extend({ surveys_state: z.enum(['ok', 'no_access']) })),
  fleet_level: z.boolean(),
  rows: z.array(
    z.object({
      kind: z.enum(['audit', 'certificate_survey']),
      id: z.string(),
      vessel_id: z.string().nullable(),
      reference: text,
      title: text,
      scope: text,
      status: text,
      state: z.enum(['due', 'overdue', 'in_progress', 'done', 'cancelled']),
      outcome: text,
      scheduled_on: day.nullable(),
      started_on: day.nullable(),
      ended_on: day.nullable(),
      on_date: day.nullable(),
      days: z.number().int().nullable(),
      auditor_org: text,
      auditor_name: text,
      lead_auditor: text,
      findings: findings.nullable(),
    }),
  ),
});

const workListSchema = z.object({
  today: day,
  vessels: z.array(
    coverage.extend({
      open: nullableCount,
      overdue: nullableCount,
      pending_approval: nullableCount,
      due_30: nullableCount,
      high_priority: nullableCount,
      completed_30: nullableCount,
      statuses: z.record(z.string(), count).nullable(),
    }),
  ),
  totals: z
    .object({
      vessels_covered: count,
      open: count,
      overdue: count,
      pending_approval: count,
      due_30: count,
      high_priority: count,
      completed_30: count,
    })
    .nullable(),
  overdue: z.object({
    total: count,
    rows: z.array(
      z.object({
        job_id: z.string(),
        vessel_id: z.string(),
        task_number: text,
        task_name: z.string(),
        equipment_name: text,
        priority: text,
        status: text,
        due_date: day,
        days_overdue: count,
      }),
    ),
  }),
});

// ─── Fetchers ───────────────────────────────────────────────────────────

const NOT_SET_UP = { kind: 'not_set_up' } as const;
type Answer<T> = typeof NOT_SET_UP | { kind: 'ok'; value: T };

const vesselArg = (scope: ReportScope): string[] | null => (scope.fleetWide ? null : [...scope.vesselIds]);

export async function fetchOverdueDrills(scope: ReportScope, today: string): Promise<Answer<FleetReportOverdueDrillsJson>> {
  const { data, error } = await reportsDb.rpc('fleet_report_overdue_drills', { p_vessel_ids: vesselArg(scope), p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetReportOverdueDrillsJson>(drillsSchema, data) };
}

export async function fetchInsurance(scope: ReportScope, today: string): Promise<Answer<FleetReportInsuranceJson>> {
  const { data, error } = await reportsDb.rpc('fleet_report_insurance', { p_vessel_ids: vesselArg(scope), p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetReportInsuranceJson>(insuranceSchema, data) };
}

export interface AuditsPeriod {
  from: string;
  to: string;
}

export async function fetchAudits(scope: ReportScope, period: AuditsPeriod, today: string): Promise<Answer<FleetReportAuditsJson>> {
  const { data, error } = await reportsDb.rpc('fleet_report_audits', {
    p_vessel_ids: vesselArg(scope),
    p_from: period.from,
    p_to: period.to,
    p_today: today,
  });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetReportAuditsJson>(auditsSchema, data) };
}

export async function fetchWorkList(scope: ReportScope, today: string): Promise<Answer<FleetReportWorkListJson>> {
  const { data, error } = await reportsDb.rpc('fleet_report_work_list', { p_vessel_ids: vesselArg(scope), p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetReportWorkListJson>(workListSchema, data) };
}

// ─── Hooks ──────────────────────────────────────────────────────────────

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

/** R7: the overdue drills of the vessels shown. */
export function useOverdueDrills(scope: ReportScope | null, options: ReportHookOptions = {}): ReportDataState<FleetReportOverdueDrillsJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.overdueDrills(scope?.companyId, vesselIds, { fleetWide, today }),
    queryFn: () => fetchOverdueDrills(requireScope(scope), today),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}

/** R13: the insurance policies of the vessels shown (and the fleet's, for the fleet-wide read). */
export function useInsuranceReport(scope: ReportScope | null, options: ReportHookOptions = {}): ReportDataState<FleetReportInsuranceJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.insurance(scope?.companyId, vesselIds, { fleetWide, today }),
    queryFn: () => fetchInsurance(requireScope(scope), today),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}

/** R17: the audits and surveys of the vessels shown over the period. */
export function useAuditsReport(
  scope: ReportScope | null,
  period: AuditsPeriod,
  options: ReportHookOptions = {},
): ReportDataState<FleetReportAuditsJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.audits(scope?.companyId, vesselIds, { fleetWide, from: period.from, to: period.to, today }),
    queryFn: () => fetchAudits(requireScope(scope), period, today),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}

/** R18: the work list of the vessels shown. */
export function useWorkList(scope: ReportScope | null, options: ReportHookOptions = {}): ReportDataState<FleetReportWorkListJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.workList(scope?.companyId, vesselIds, { fleetWide, today }),
    queryFn: () => fetchWorkList(requireScope(scope), today),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}
