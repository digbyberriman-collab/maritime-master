/**
 * The fleet crew reports' reads (gap/02 R5, R9, R10, R11; X5 spec X5-10A;
 * DECISIONS D-01, D-04): `fleet_report_crew_qualifications`,
 * `fleet_report_hours_of_rest` and `fleet_report_contracts`
 * (`20261124040900_fleet_report_crew_sources.sql`), over the vessels shown.
 *
 * The same rules as the other report reads (./useReportData.ts):
 * - nothing is requested until the scope is known and the page's gate allows
 *   it (`enabled`; `idle` meanwhile); no vessels shown answers `no_vessels`
 *   without a request;
 * - the default "Vessels shown" is sent as NULL, any other choice as
 *   explicit ids the server reach-checks (D-X5-22);
 * - a missing RPC (`isMissingRelation`) is `not_set_up`, cached and not
 *   retried; for R5 the server also answers `state: 'not_set_up'` while
 *   X1's requirement engine is missing, and the hook passes that on as
 *   `not_set_up` (never zeros);
 * - 42501 `vessel_out_of_reach`, 22023 `invalid_period` / `period_too_long`
 *   / `invalid_mode` get their own sentences and are not retried; any other
 *   error is an error with a retry;
 * - every answer is parsed against the shape the SQL writes; one this
 *   client cannot read is an error, never a guess.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { todayDateOnly } from '@/shared/lib/form';
import { isMissingRelationError as isMissingRelation } from '@/shared/lib/notify';
import { VESSEL_OUT_OF_REACH_MESSAGE } from '@/modules/fleet';
import { reportsDb } from '../lib/reportsDb';
import type {
  ContractReportRow,
  CrewQualificationRow,
  FleetReportContractsJson,
  FleetReportCrewQualificationsJson,
  FleetReportHoursOfRestJson,
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

export const PERIOD_TOO_LONG_MESSAGE = 'Choose a period of at most 366 days.';
export const PERIOD_INVALID_MESSAGE = 'The period must start on or before its last day.';
export const CREW_REPORT_MODE_MESSAGE = 'This report asked for something the server does not know. Reload the page.';

type RpcError = { code?: string; message?: string };

function rethrow(error: RpcError): never {
  if (error.code === '42501' && error.message === 'vessel_out_of_reach') {
    throw new ReportDataError('vessel_out_of_reach', VESSEL_OUT_OF_REACH_MESSAGE);
  }
  if (error.code === '22023' && error.message === 'period_too_long') throw new ReportDataError('period_too_long', PERIOD_TOO_LONG_MESSAGE);
  if (error.code === '22023' && error.message === 'invalid_period') throw new ReportDataError('invalid_period', PERIOD_INVALID_MESSAGE);
  if (error.code === '22023' && error.message === 'invalid_mode') throw new ReportDataError('invalid_mode', CREW_REPORT_MODE_MESSAGE);
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

const qualificationRow = z.object({
  vessel_id: z.string(),
  profile_id: z.string(),
  first_name: text,
  last_name: text,
  preferred_name: text,
  position_name: text,
  position_text: text,
  department_key: text,
  rank_tier: text,
  sort_order: z.number().int().nullable(),
  placement_kind: z.string(),
  required: count,
  met: count,
  expiring: count,
  expired: count,
  missing: count,
  conditional: count,
  muted: count,
  docs_required: count,
  docs_met: count,
  stcw_required: count,
  stcw_met: count,
  quals_required: count,
  quals_met: count,
  fam_required: count,
  fam_met: count,
  status: z.enum(['complete', 'expiring', 'missing', 'expired']),
  next_expiry: day.nullable(),
  issues: z.array(
    z.object({
      row_id: z.string(),
      label: z.string(),
      tab: z.string(),
      state: z.string(),
      reason: z.string().nullable().optional().transform((v) => v ?? null),
    }),
  ),
});

const qualificationsSchema = z.object({
  state: z.enum(['ok', 'not_set_up']),
  today: day,
  vessels: z.array(coverage),
  rows: z.array(qualificationRow),
});

const rate = z.number().nonnegative().nullable();
const horSchema = z.object({
  vessels: count,
  from: day,
  to: day,
  today: day,
  source: z.enum(['breach_review', 'compliance_checks']).nullable(),
  totals: z
    .object({
      vessels_covered: count,
      vessels_logging: count,
      crew_days: count,
      breach_days: count,
      serious_days: count,
      unreviewed: count,
      months_not_submitted: count,
      rate_per_100: rate,
    })
    .nullable(),
  per_vessel: z.array(
    coverage.extend({
      crew_logging: nullableCount,
      crew_days: nullableCount,
      breach_days: nullableCount,
      serious_days: nullableCount,
      unreviewed: nullableCount,
      months_not_submitted: nullableCount,
      rate_per_100: rate,
      last_entry: day.nullable(),
    }),
  ),
  heat: z.array(
    z.object({
      vessel_id: z.string(),
      day,
      logged: count,
      breaches: count,
      serious: count,
      unreviewed: count,
    }),
  ),
  emerging: z.object({
    total: count,
    rows: z.array(
      z.object({
        profile_id: z.string(),
        person_name: text,
        position: text,
        vessel_id: z.string().nullable(),
        breach_days: count,
        serious_days: count,
        unreviewed: count,
        last_breach: day,
      }),
    ),
  }),
});

const contractRow = z.object({
  contract_id: z.string(),
  profile_id: z.string(),
  person_name: text,
  position: text,
  department: text,
  vessel_id: z.string().nullable(),
  contract_type: z.string(),
  contract_number: text,
  sea_reference: text,
  status: z.string(),
  start_date: day,
  end_date: day.nullable(),
  signed_by_crew_at: text,
  signed_by_company_at: text,
  agreement_state: z.enum(['draft', 'not_signed', 'signed']),
  awaiting: z.enum(['crew', 'company', 'both']).nullable(),
  days_left: z.number().int().nullable(),
  bucket: z.enum(['ended', 'd30', 'd60', 'd90']).nullable(),
  renewal_drafted: z.boolean(),
});

const contractsSchema = z.object({
  mode: z.string(),
  today: day,
  vessels: z.array(coverage.extend({ state: z.enum(['ok', 'no_access']) })),
  unassigned: z.boolean(),
  rows: z.array(contractRow),
});

// ─── Fetchers ───────────────────────────────────────────────────────────

const NOT_SET_UP = { kind: 'not_set_up' } as const;
type Answer<T> = typeof NOT_SET_UP | { kind: 'ok'; value: T };

const vesselArg = (scope: ReportScope): string[] | null => (scope.fleetWide ? null : [...scope.vesselIds]);

export async function fetchCrewQualifications(scope: ReportScope): Promise<Answer<FleetReportCrewQualificationsJson>> {
  const { data, error } = await reportsDb.rpc('fleet_report_crew_qualifications', { p_vessel_ids: vesselArg(scope) });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  const value = parse<FleetReportCrewQualificationsJson>(qualificationsSchema, data);
  // X1's requirement engine is not in the database yet: the same "not set up" as a missing RPC (never zeros).
  if (value.state === 'not_set_up') return NOT_SET_UP;
  return { kind: 'ok', value };
}

export interface HoursOfRestPeriod {
  from: string;
  to: string;
}

export async function fetchHoursOfRest(scope: ReportScope, period: HoursOfRestPeriod, today: string): Promise<Answer<FleetReportHoursOfRestJson>> {
  const { data, error } = await reportsDb.rpc('fleet_report_hours_of_rest', {
    p_vessel_ids: vesselArg(scope),
    p_from: period.from,
    p_to: period.to,
    p_today: today,
  });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetReportHoursOfRestJson>(horSchema, data) };
}

export type ContractsMode = 'agreements' | 'ending';

export async function fetchContracts(scope: ReportScope, mode: ContractsMode, today: string): Promise<Answer<FleetReportContractsJson>> {
  const { data, error } = await reportsDb.rpc('fleet_report_contracts', { p_vessel_ids: vesselArg(scope), p_mode: mode, p_today: today });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    rethrow(error);
  }
  return { kind: 'ok', value: parse<FleetReportContractsJson>(contractsSchema, data) };
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

/** R5: the crew compliance summaries of the vessels shown (X1's engine). */
export function useCrewQualifications(scope: ReportScope | null, options: ReportHookOptions = {}): ReportDataState<FleetReportCrewQualificationsJson> {
  const { active, vesselIds, noVessels, fleetWide } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.crewQualifications(scope?.companyId, vesselIds, { fleetWide }),
    queryFn: () => fetchCrewQualifications(requireScope(scope)),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}

/** R9: hours of rest over the period for the vessels shown. */
export function useHoursOfRestReport(
  scope: ReportScope | null,
  period: HoursOfRestPeriod,
  options: ReportHookOptions = {},
): ReportDataState<FleetReportHoursOfRestJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.hoursOfRest(scope?.companyId, vesselIds, { fleetWide, from: period.from, to: period.to, today }),
    queryFn: () => fetchHoursOfRest(requireScope(scope), period, today),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}

/** R10 / R11: the contracts of the vessels shown, as agreements or by end date. */
export function useContractsReport(
  scope: ReportScope | null,
  mode: ContractsMode,
  options: ReportHookOptions = {},
): ReportDataState<FleetReportContractsJson> {
  const { active, vesselIds, noVessels, fleetWide, today } = flags(scope, options);
  const result = useQuery({
    queryKey: reportsKeys.contracts(scope?.companyId, vesselIds, { fleetWide, mode, today }),
    queryFn: () => fetchContracts(requireScope(scope), mode, today),
    enabled: active && !noVessels,
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
  return stateOf(result, active, noVessels);
}

export type { ContractReportRow, CrewQualificationRow };
