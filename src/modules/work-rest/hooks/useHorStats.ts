/**
 * The vessel's hours-of-rest report (gap/04 C44, C41, C42; X1-08B): the
 * year's month statistics (work_rest_month_stats), the breach reports sent
 * (work_rest_breach_reports), the reminder log (work_rest_reminders), the
 * people a breach report may go to (work_rest_breach_report_recipients),
 * creating a breach report (work_rest_breach_report_create) and the
 * breaches a report's PDF is rebuilt from (D-X1-23).
 *
 * Keys sit under the vessel's (workRestKeys.vessel) and carry the year, so
 * a review, a reminder or a new report on the board refreshes the report,
 * and the report's writes refresh the board.
 *
 * D-01: each read answers `{applied: false}` while its RPC or table is not
 * in the database (the page says the report is not set up yet, a panel
 * that it is not available yet); any other error is a real error, a
 * refusal becoming a WorkRestRefusal (42501: not for this viewer).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { crewRefusalMessage } from '@/modules/crew/lib/crewUpdateErrors';
import {
  BREACH_REPORT_NOT_SET_UP,
  REPORT_RPC,
  ReportShapeError,
  isReportRpcMissing,
  parseBreachReportCreated,
  parseMonthStats,
  personName,
  reportBreachRows,
  reportRefusalText,
  type BreachReportCreated,
  type MonthStats,
  type NamedPerson,
  type ReminderEntry,
  type SentReport,
} from '../lib/horReport';
import {
  WorkRestEngineRequired,
  WorkRestRefusal,
  asWorkRestError,
  listVesselBreaches,
  type EngineCall,
} from '../services/workRestService';
import { workRestDb as db, type WorkRestReportRecipientRow, type WorkRestVesselBreachRow } from '../types/db.pending';
import { workRestKeys } from './workRestKeys';

/** The report's keys, under the vessel's. */
export const horReportKeys = {
  year: (vesselId: string, year: number) => [...workRestKeys.vessel(vesselId), 'report', year] as const,
  stats: (vesselId: string, year: number) => [...horReportKeys.year(vesselId, year), 'stats'] as const,
  sent: (vesselId: string, year: number) => [...horReportKeys.year(vesselId, year), 'sent'] as const,
  reminders: (vesselId: string, year: number) => [...horReportKeys.year(vesselId, year), 'reminders'] as const,
  recipients: (vesselId: string) => [...workRestKeys.vessel(vesselId), 'report-recipients'] as const,
};

/** Refusals and a malformed answer do not get better by asking again. */
export const retryReportRead = (failures: number, error: unknown): boolean =>
  !(error instanceof WorkRestRefusal) && !(error instanceof ReportShapeError) && failures < 1;

const noVesselKey = (what: string, year: number) => [...workRestKeys.all, 'report', 'no-vessel', what, year] as const;

// ---------------------------------------------------------------- month statistics

export async function fetchMonthStats(opts: { vesselId: string; year: number }): Promise<EngineCall<MonthStats[]>> {
  const { data, error } = await db.rpc(REPORT_RPC.monthStats, { p_vessel_id: opts.vesselId, p_year: opts.year });
  if (error) {
    if (isReportRpcMissing(error, REPORT_RPC.monthStats)) return { applied: false };
    throw asWorkRestError(error);
  }
  return { applied: true, data: parseMonthStats(data) };
}

export function useHorMonthStats(opts: { vesselId: string | null; year: number; enabled?: boolean }) {
  const { vesselId, year } = opts;
  return useQuery<EngineCall<MonthStats[]>>({
    queryKey: vesselId ? horReportKeys.stats(vesselId, year) : noVesselKey('stats', year),
    queryFn: () => {
      if (!vesselId) throw new Error('No vessel.');
      return fetchMonthStats({ vesselId, year });
    },
    enabled: Boolean(vesselId) && (opts.enabled ?? true),
    retry: retryReportRead,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------- names

type ProfileName = NamedPerson & { id: string; user_id: string | null };

/**
 * Names for people the page lists, in one read. A name is a label: when
 * the profiles cannot be read the rows still show, without it.
 */
async function profileNames(by: 'id' | 'user_id', ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data, error } = await db.from('profiles').select('id, user_id, first_name, last_name, preferred_name').in(by, unique);
  if (error) return names;
  const rows: ProfileName[] = data ?? [];
  for (const p of rows) {
    const key = by === 'id' ? p.id : p.user_id;
    if (key) names.set(key, personName(p));
  }
  return names;
}

// ---------------------------------------------------------------- breach reports sent

const REPORT_COLUMNS = 'id, reference, period_from, period_to, nc_ids, recipient_user_ids, notes, sent_by, sent_at';

/** The vessel's breach reports whose period touches the year, newest first (RLS: final approvers and recipients). */
export async function fetchSentReports(opts: { vesselId: string; year: number }): Promise<EngineCall<SentReport[]>> {
  const { data, error } = await db
    .from('work_rest_breach_reports')
    .select(REPORT_COLUMNS)
    .eq('vessel_id', opts.vesselId)
    .lte('period_from', `${opts.year}-12-31`)
    .gte('period_to', `${opts.year}-01-01`)
    .order('sent_at', { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingRelation(error)) return { applied: false };
    throw asWorkRestError(error);
  }
  const rows = data ?? [];
  const names = await profileNames('user_id', rows.flatMap((r) => (r.sent_by ? [r.sent_by] : [])));
  return {
    applied: true,
    data: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      periodFrom: r.period_from,
      periodTo: r.period_to,
      ncIds: r.nc_ids ?? [],
      recipientIds: r.recipient_user_ids ?? [],
      notes: r.notes,
      sentBy: r.sent_by,
      sentByName: r.sent_by ? names.get(r.sent_by) ?? null : null,
      sentAt: r.sent_at,
    })),
  };
}

export function useSentBreachReports(opts: { vesselId: string | null; year: number; enabled?: boolean }) {
  const { vesselId, year } = opts;
  return useQuery<EngineCall<SentReport[]>>({
    queryKey: vesselId ? horReportKeys.sent(vesselId, year) : noVesselKey('sent', year),
    queryFn: () => {
      if (!vesselId) throw new Error('No vessel.');
      return fetchSentReports({ vesselId, year });
    },
    enabled: Boolean(vesselId) && (opts.enabled ?? true),
    retry: retryReportRead,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------- the reminder log (C41)

const REMINDER_COLUMNS = 'id, profile_id, crew_user_id, period_year, period_month, kind, sent_by_role_label, sent_on, sent_at';

export interface ReminderLog {
  entries: ReminderEntry[];
  /** The vessel has had at least one automatic reminder (any year): the daily sweep is running. */
  automaticSeen: boolean;
}

/** The reminders sent about the year's months, newest first, and whether the vessel ever had an automatic one. */
export async function fetchReminderLog(opts: { vesselId: string; year: number }): Promise<EngineCall<ReminderLog>> {
  const [log, automatic] = await Promise.all([
    db
      .from('work_rest_reminders')
      .select(REMINDER_COLUMNS)
      .eq('vessel_id', opts.vesselId)
      .eq('period_year', opts.year)
      .order('sent_at', { ascending: false })
      .limit(200),
    db.from('work_rest_reminders').select('id').eq('vessel_id', opts.vesselId).neq('kind', 'manual').limit(1),
  ]);
  const error = log.error ?? automatic.error;
  if (error) {
    if (isMissingRelation(error)) return { applied: false };
    throw asWorkRestError(error);
  }
  const rows = log.data ?? [];
  const names = await profileNames('id', rows.map((r) => r.profile_id));
  return {
    applied: true,
    data: {
      entries: rows.map((r) => ({
        id: r.id,
        profileId: r.profile_id,
        crewName: names.get(r.profile_id) ?? 'Crew member',
        periodYear: r.period_year,
        periodMonth: r.period_month,
        kind: r.kind,
        byLabel: r.sent_by_role_label,
        sentOn: r.sent_on,
        sentAt: r.sent_at,
      })),
      automaticSeen: (automatic.data ?? []).length > 0,
    },
  };
}

export function useReminderLog(opts: { vesselId: string | null; year: number; enabled?: boolean }) {
  const { vesselId, year } = opts;
  return useQuery<EngineCall<ReminderLog>>({
    queryKey: vesselId ? horReportKeys.reminders(vesselId, year) : noVesselKey('reminders', year),
    queryFn: () => {
      if (!vesselId) throw new Error('No vessel.');
      return fetchReminderLog({ vesselId, year });
    },
    enabled: Boolean(vesselId) && (opts.enabled ?? true),
    retry: retryReportRead,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------- recipients and creating a report

export async function fetchReportRecipients(vesselId: string): Promise<EngineCall<WorkRestReportRecipientRow[]>> {
  const { data, error } = await db.rpc(REPORT_RPC.recipients, { p_vessel_id: vesselId });
  if (error) {
    if (isReportRpcMissing(error, REPORT_RPC.recipients)) return { applied: false };
    throw asWorkRestError(error);
  }
  if (data !== null && !Array.isArray(data)) throw new ReportShapeError('recipients');
  return { applied: true, data: (data ?? []).filter((r) => r.kind === 'dpa' || r.kind === 'fleet_hr') };
}

export function useReportRecipients(opts: { vesselId: string | null; enabled?: boolean }) {
  const { vesselId } = opts;
  return useQuery<EngineCall<WorkRestReportRecipientRow[]>>({
    queryKey: vesselId ? horReportKeys.recipients(vesselId) : noVesselKey('recipients', 0),
    queryFn: () => {
      if (!vesselId) throw new Error('No vessel.');
      return fetchReportRecipients(vesselId);
    },
    enabled: Boolean(vesselId) && (opts.enabled ?? true),
    retry: retryReportRead,
    staleTime: 5 * 60_000,
  });
}

export interface CreateBreachReportInput {
  from: string;
  to: string;
  ncIds: readonly string[];
  recipientIds: readonly string[];
  notes: string | null;
}

/** Creates the report; WorkRestEngineRequired while the RPC is missing; a refusal is a WorkRestRefusal. */
export async function createBreachReport(vesselId: string, input: CreateBreachReportInput): Promise<BreachReportCreated> {
  const { data, error } = await db.rpc(REPORT_RPC.create, {
    p_vessel_id: vesselId,
    p_from: input.from,
    p_to: input.to,
    p_nc_ids: [...input.ncIds],
    p_recipient_user_ids: [...input.recipientIds],
    p_notes: input.notes,
  });
  if (error) {
    if (isReportRpcMissing(error, REPORT_RPC.create)) throw new WorkRestEngineRequired(BREACH_REPORT_NOT_SET_UP);
    throw asWorkRestError(error);
  }
  return parseBreachReportCreated(data);
}

/** Creating a report refreshes the vessel's keys (the board's breaches are flagged reported, the report lists it). */
export function useCreateBreachReport(vesselId: string) {
  const qc = useQueryClient();
  return useMutation<BreachReportCreated, unknown, CreateBreachReportInput>({
    mutationFn: (input) => createBreachReport(vesselId, input),
    onSettled: () => qc.invalidateQueries({ queryKey: workRestKeys.vessel(vesselId) }),
  });
}

/** One sentence for a refused or failed report write or read. */
export function reportErrorText(error: unknown): string {
  if (error instanceof WorkRestEngineRequired) return error.message;
  if (error instanceof WorkRestRefusal) {
    const detail = error.message !== error.refusal ? error.message : null;
    const sentence = reportRefusalText(error.refusal, detail);
    if (sentence) return sentence;
  }
  return crewRefusalMessage(error);
}

// ---------------------------------------------------------------- a report's breaches (its PDF, D-X1-23)

/**
 * The breaches a report stored, read again for its PDF (work_rest_vessel_breaches
 * over the report's period, kept to its ids). `missing` counts the ids no
 * longer listed (a record corrected since). WorkRestEngineRequired while the
 * breach RPC is missing.
 */
export async function loadReportBreaches(
  vesselId: string,
  report: Pick<SentReport, 'ncIds' | 'periodFrom' | 'periodTo'>,
): Promise<{ rows: WorkRestVesselBreachRow[]; missing: number }> {
  const out = await listVesselBreaches({ vesselId, from: report.periodFrom, to: report.periodTo, onlyOpen: false });
  if (!out.applied) throw new WorkRestEngineRequired(BREACH_REPORT_NOT_SET_UP);
  return reportBreachRows(report, out.data);
}
