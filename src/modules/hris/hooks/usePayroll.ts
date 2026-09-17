import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { useToast } from '@/shared/hooks/use-toast';
import { uploadCrewDocument } from '@/lib/storage/crewDocuments';
import { calculatePayrollLine, type Allowance, type DayCounts, type PayFrequency } from '@/modules/hris/lib/payroll/engine';
import { buildPayslipPdf, payslipFileName, pdfToFile } from '@/modules/hris/lib/payroll/payslip';
import {
  buildRunNumber,
  filterRuns,
  recomputeLine,
  runNumberPrefix,
  totalRun,
  type PayPeriodRow,
  type PayrollLineRow,
  type PayrollRunFilters,
  type PayrollRunListItem,
  type PayrollRunRow,
  type PayrollRunStatus,
} from '@/modules/hris/lib/payroll/runHelpers';

export const PAYROLL_KEY = ['hris', 'payroll'] as const;
export const PAY_PERIODS_KEY = ['hris', 'pay-periods'] as const;
export const HR_SETTINGS_KEY = ['hris', 'company-settings'] as const;
export const COMPENSATION_KEY = ['hris', 'compensation'] as const;

export type HrCompanySettings = Tables<'hr_company_settings'>;
export type CrewCompensationRow = Tables<'crew_compensation'>;

type VesselJoin = { name: string } | null;
type PeriodJoin = Pick<PayPeriodRow, 'label' | 'start_date' | 'end_date'> | null;
type ProfileJoin = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  rank: string | null;
  department: string | null;
  avatar_url: string | null;
} | null;

const crewDisplayName = (p: ProfileJoin): string => {
  if (!p) return 'Unknown crew';
  const first = p.preferred_name || p.first_name || '';
  return `${first} ${p.last_name ?? ''}`.trim() || 'Unknown crew';
};

/** A payroll line with the crew member's display fields joined in. */
export interface PayrollLine extends PayrollLineRow {
  crew_name: string;
  crew_user_id: string | null;
  rank: string | null;
  department: string | null;
  avatar_url: string | null;
  vessel_name: string | null;
}

export interface PayrollRunDetail extends PayrollRunRow {
  vessel_name: string | null;
  period: PayPeriodRow | null;
  lines: PayrollLine[];
}

export interface PayPeriodOption extends PayPeriodRow {
  vessel_name: string | null;
}

const DEFAULT_SETTINGS: Omit<HrCompanySettings, 'company_id'> = {
  default_currency: 'EUR',
  pay_period_type: 'calendar_month',
  pay_cutoff_day: 25,
  pay_day_of_month: 28,
  unpaid_leave_codes: ['U'],
  travel_days_paid: true,
  gratuity_default_method: 'points_days',
  gratuity_default_points: 1,
  rounding_minor: 1,
  payslip_footer: null,
  updated_by: null,
  updated_at: '',
};

/** Company payroll settings (falls back to the SQL defaults when no row exists yet). */
export function usePayrollSettings() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...HR_SETTINGS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HrCompanySettings> => {
      const { data, error } = await supabase.from('hr_company_settings').select('*').eq('company_id', companyId as string).maybeSingle();
      if (error) throw error;
      return data ?? { ...DEFAULT_SETTINGS, company_id: companyId as string };
    },
  });
  return { ...query, settings: query.data ?? { ...DEFAULT_SETTINGS, company_id: companyId ?? '' } };
}

/** Open and locked pay periods (closed periods cannot take a new run). */
export function usePayPeriodsForRuns() {
  const { profile } = useAuth();
  const access = usePayrollAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...PAY_PERIODS_KEY, 'for-runs', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<PayPeriodOption[]> => {
      const { data, error } = await supabase
        .from('pay_periods')
        .select('*, vessels(name)')
        .eq('company_id', companyId as string)
        .in('status', ['open', 'locked'])
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw) => {
        const { vessels, ...rest } = raw as PayPeriodRow & { vessels: VesselJoin };
        return { ...rest, vessel_name: vessels?.name ?? null };
      });
    },
  });
  return { ...query, periods: query.data ?? [] };
}

/** All payroll runs of the company (filters applied client-side, the full list feeds the KPIs). */
export function usePayrollRuns(filters: PayrollRunFilters) {
  const { profile } = useAuth();
  const access = usePayrollAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...PAYROLL_KEY, 'runs', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<PayrollRunListItem[]> => {
      const { data, error } = await supabase
        .from('payroll_runs')
        .select('*, vessels(name), pay_periods!payroll_runs_pay_period_id_fkey(label, start_date, end_date)')
        .eq('company_id', companyId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw) => {
        const { vessels, pay_periods, ...rest } = raw as PayrollRunRow & { vessels: VesselJoin; pay_periods: PeriodJoin };
        return {
          ...rest,
          vessel_name: vessels?.name ?? null,
          period_label: pay_periods?.label ?? null,
          period_start: pay_periods?.start_date ?? null,
          period_end: pay_periods?.end_date ?? null,
        };
      });
    },
  });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const runs = useMemo(() => filterRuns(all, filters), [all, filters]);
  return { ...query, all, runs };
}

const LINE_SELECT =
  '*, vessels(name), profiles!payroll_lines_profile_id_fkey(id, user_id, first_name, last_name, preferred_name, rank, department, avatar_url)';

const mapLine = (raw: unknown): PayrollLine => {
  const { vessels, profiles, ...rest } = raw as PayrollLineRow & { vessels: VesselJoin; profiles: ProfileJoin };
  return {
    ...rest,
    crew_name: crewDisplayName(profiles),
    crew_user_id: profiles?.user_id ?? null,
    rank: profiles?.rank ?? null,
    department: profiles?.department ?? null,
    avatar_url: profiles?.avatar_url ?? null,
    vessel_name: vessels?.name ?? null,
  };
};

/** One run with its period and all lines (crew joined). */
export function usePayrollRun(runId: string | null) {
  const access = usePayrollAccess();
  const query = useQuery({
    queryKey: [...PAYROLL_KEY, 'run', runId],
    enabled: Boolean(runId) && !access.loading && access.canView,
    queryFn: async (): Promise<PayrollRunDetail | null> => {
      const { data: run, error } = await supabase
        .from('payroll_runs')
        .select('*, vessels(name), pay_periods!payroll_runs_pay_period_id_fkey(*)')
        .eq('id', runId as string)
        .maybeSingle();
      if (error) throw error;
      if (!run) return null;
      const { data: lines, error: lErr } = await supabase
        .from('payroll_lines')
        .select(LINE_SELECT)
        .eq('run_id', runId as string)
        .order('created_at', { ascending: true });
      if (lErr) throw lErr;
      const { vessels, pay_periods, ...rest } = run as PayrollRunRow & { vessels: VesselJoin; pay_periods: PayPeriodRow | null };
      const mapped = (lines ?? []).map(mapLine).sort((a, b) => a.crew_name.localeCompare(b.crew_name));
      return { ...rest, vessel_name: vessels?.name ?? null, period: pay_periods ?? null, lines: mapped };
    },
  });
  return { ...query, run: query.data ?? null };
}

/** Self-service: the current user's paid payslips. Runs/periods may be null (RLS). */
export interface MyPayslip extends PayrollLineRow {
  run_number: string | null;
  run_currency: string | null;
  paid_at: string | null;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
}

export function useMyPayslips() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;
  const query = useQuery({
    queryKey: [...PAYROLL_KEY, 'my-payslips', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<MyPayslip[]> => {
      const { data, error } = await supabase
        .from('payroll_lines')
        .select('*, payroll_runs!payroll_lines_run_id_fkey(run_number, currency, paid_at, pay_periods!payroll_runs_pay_period_id_fkey(label, start_date, end_date))')
        .eq('profile_id', profileId as string)
        .eq('status', 'paid')
        .order('created_at', { ascending: false });
      if (error) throw error;
      type RunJoin = { run_number: string; currency: string; paid_at: string | null; pay_periods: PeriodJoin } | null;
      return (data ?? []).map((raw) => {
        const { payroll_runs, ...rest } = raw as PayrollLineRow & { payroll_runs: RunJoin };
        return {
          ...rest,
          run_number: payroll_runs?.run_number ?? null,
          run_currency: payroll_runs?.currency ?? null,
          paid_at: payroll_runs?.paid_at ?? null,
          period_label: payroll_runs?.pay_periods?.label ?? null,
          period_start: payroll_runs?.pay_periods?.start_date ?? null,
          period_end: payroll_runs?.pay_periods?.end_date ?? null,
        };
      });
    },
  });
  return { ...query, payslips: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// What-if preview: engine.ts + hr_days_onboard
// ---------------------------------------------------------------------------

export interface PreviewLineArgs {
  profileId: string | null;
  start: string | null;
  end: string | null;
  vesselId: string | null;
}

const toAllowances = (json: Json): Allowance[] => {
  if (!Array.isArray(json)) return [];
  const out: Allowance[] = [];
  for (const a of json) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) continue;
    const rec = a as Record<string, Json | undefined>;
    out.push({
      name: typeof rec.name === 'string' ? rec.name : 'Allowance',
      amount_minor: Number(rec.amount_minor) || 0,
      taxable: rec.taxable === true,
      recurring: rec.recurring !== false,
      prorate: rec.prorate !== false,
    });
  }
  return out;
};

const asFrequency = (value: string): PayFrequency =>
  value === 'daily' || value === 'weekly' || value === 'annual' ? value : 'monthly';

export function usePreviewLine({ profileId, start, end, vesselId }: PreviewLineArgs) {
  const { settings } = usePayrollSettings();
  const compensation = useQuery({
    queryKey: [...COMPENSATION_KEY, 'active', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<CrewCompensationRow | null> => {
      const { data, error } = await supabase
        .from('crew_compensation')
        .select('*')
        .eq('profile_id', profileId as string)
        .eq('status', 'active')
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const days = useQuery({
    queryKey: [...PAYROLL_KEY, 'days', profileId, start, end, vesselId],
    enabled: Boolean(profileId && start && end),
    queryFn: async (): Promise<DayCounts> => {
      const { data, error } = await supabase.rpc('hr_days_onboard', {
        p_profile_id: profileId as string,
        p_start: start as string,
        p_end: end as string,
        p_vessel_id: vesselId,
        p_unpaid_codes: settings.unpaid_leave_codes,
      });
      if (error) throw error;
      const row = data?.[0];
      return {
        daysInPeriod: row?.days_in_period ?? 0,
        daysOnboard: row?.days_onboard ?? 0,
        daysLeavePaid: row?.days_leave_paid ?? 0,
        daysTravel: row?.days_travel ?? 0,
        daysUnpaid: row?.days_unpaid ?? 0,
        daysUnknown: row?.days_unknown ?? 0,
      };
    },
  });

  const result = useMemo(() => {
    const comp = compensation.data;
    const d = days.data;
    if (!comp || !d) return null;
    return calculatePayrollLine(
      { baseSalaryMinor: comp.base_salary_minor, payFrequency: asFrequency(comp.pay_frequency), allowances: toAllowances(comp.allowances) },
      d,
      0,
      { travelDaysPaid: settings.travel_days_paid, roundingMinor: settings.rounding_minor },
    );
  }, [compensation.data, days.data, settings.travel_days_paid, settings.rounding_minor]);

  return {
    compensation: compensation.data ?? null,
    days: days.data ?? null,
    result,
    isLoading: compensation.isLoading || days.isLoading,
    error: compensation.error ?? days.error ?? null,
    settings,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateRunArgs {
  pay_period_id: string;
  vessel_id: string | null;
  currency: string;
  notes?: string | null;
}

export interface UpdateLineArgs {
  line: PayrollLine;
  other_earnings_minor: number;
  deductions_minor: number;
  notes: string | null;
}

export interface GeneratePayslipsArgs {
  run: PayrollRunDetail;
  /** Defaults to every non-excluded line. */
  lines?: PayrollLine[];
}

type AuditEntity = 'payroll_run' | 'payroll_line';

const TRANSITION_META: Record<PayrollRunStatus, { action: string; title: string; description: (run: PayrollRunRow) => string }> = {
  draft: { action: 'REOPEN', title: 'Run reopened', description: (r) => `${r.run_number} is back in draft.` },
  calculated: { action: 'REOPEN', title: 'Run reopened', description: (r) => `${r.run_number} can be recalculated.` },
  pending_approval: { action: 'SUBMIT', title: 'Submitted for approval', description: (r) => `${r.run_number} is waiting for a payroll admin.` },
  approved: { action: 'APPROVE', title: 'Run approved', description: (r) => `${r.run_number} can now be paid.` },
  paid: { action: 'PAY', title: 'Run marked as paid', description: (r) => `${r.run_number} is closed; payslips are now visible to crew.` },
  cancelled: { action: 'CANCEL', title: 'Run cancelled', description: (r) => `${r.run_number} has been cancelled.` },
};

export function usePayrollMutations() {
  const { profile, user } = useAuth();
  const { settings } = usePayrollSettings();
  const branding = useBrandingContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (entity: AuditEntity, action: string, entityId: string, oldValues: Json | null, newValues: Json | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: entity,
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues,
        new_values: newValues,
      });
      if (error) console.warn(`${entity} audit log failed`, error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(
    (runId?: string) => {
      void queryClient.invalidateQueries({ queryKey: [...PAYROLL_KEY, 'runs'] });
      void queryClient.invalidateQueries({ queryKey: [...PAYROLL_KEY, 'my-payslips'] });
      if (runId) void queryClient.invalidateQueries({ queryKey: [...PAYROLL_KEY, 'run', runId] });
    },
    [queryClient],
  );

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );

  const updateRun = useCallback(
    async (id: string, patch: TablesUpdate<'payroll_runs'>): Promise<PayrollRunRow> => {
      const { data, error } = await supabase
        .from('payroll_runs')
        .update({ ...patch, updated_by: user?.id ?? null })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    [user?.id],
  );

  /** Re-derive headcount and totals from the lines (after a client-side line edit). */
  const retotalRun = useCallback(
    async (runId: string): Promise<void> => {
      const { data, error } = await supabase
        .from('payroll_lines')
        .select('status, gross_minor, deductions_minor, net_minor, net_run_currency_minor, fx_rate_to_run')
        .eq('run_id', runId);
      if (error) throw error;
      await updateRun(runId, totalRun(data ?? []));
    },
    [updateRun],
  );

  const createRun = useMutation({
    mutationFn: async (args: CreateRunArgs): Promise<PayrollRunRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data: period, error: pErr } = await supabase
        .from('pay_periods')
        .select('id, start_date, vessel_id, vessels(name)')
        .eq('id', args.pay_period_id)
        .single();
      if (pErr) throw pErr;
      let vesselName: string | null = null;
      if (args.vessel_id) {
        const { data: v } = await supabase.from('vessels').select('name').eq('id', args.vessel_id).maybeSingle();
        vesselName = v?.name ?? null;
      }
      const prefix = runNumberPrefix(vesselName, period.start_date);
      const { data: existing, error: eErr } = await supabase
        .from('payroll_runs')
        .select('run_number')
        .eq('company_id', companyId)
        .like('run_number', `${prefix}-%`);
      if (eErr) throw eErr;
      const run_number = buildRunNumber({ vesselName, periodStart: period.start_date, existingRunNumbers: (existing ?? []).map((r) => r.run_number) });

      const { data, error } = await supabase
        .from('payroll_runs')
        .insert({
          company_id: companyId,
          vessel_id: args.vessel_id,
          pay_period_id: args.pay_period_id,
          run_number,
          currency: args.currency,
          notes: args.notes ?? null,
          status: 'draft',
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      await audit('payroll_run', 'CREATE', data.id, null, data as unknown as Json);
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast({ title: 'Payroll run created', description: `${data.run_number} is ready to calculate.` });
    },
    onError: fail('Could not create payroll run'),
  });

  const calculateRun = useMutation({
    mutationFn: async (run: PayrollRunRow): Promise<number> => {
      const { data, error } = await supabase.rpc('payroll_calculate_run', { p_run_id: run.id });
      if (error) throw error;
      await audit('payroll_run', 'CALCULATE', run.id, { status: run.status } as Json, { status: 'calculated', lines: data } as Json);
      return data ?? 0;
    },
    onSuccess: (count, run) => {
      invalidate(run.id);
      toast({ title: 'Payroll calculated', description: `${count} line${count === 1 ? '' : 's'} calculated for ${run.run_number}.` });
    },
    onError: fail('Could not calculate payroll'),
  });

  const updateLine = useMutation({
    mutationFn: async ({ line, other_earnings_minor, deductions_minor, notes }: UpdateLineArgs): Promise<PayrollLineRow> => {
      const money = recomputeLine({ ...line, other_earnings_minor, deductions_minor }, settings.rounding_minor);
      const { data, error } = await supabase
        .from('payroll_lines')
        .update({ other_earnings_minor, deductions_minor, notes, status: 'adjusted', ...money })
        .eq('id', line.id)
        .select('*')
        .single();
      if (error) throw error;
      await retotalRun(line.run_id);
      await audit(
        'payroll_line',
        'ADJUST',
        line.id,
        { other_earnings_minor: line.other_earnings_minor, deductions_minor: line.deductions_minor, gross_minor: line.gross_minor, net_minor: line.net_minor, notes: line.notes },
        { other_earnings_minor, deductions_minor, notes, ...money },
      );
      return data;
    },
    onSuccess: (_data, { line }) => {
      invalidate(line.run_id);
      toast({ title: 'Line adjusted', description: `${line.crew_name}'s line has been updated and the run re-totalled.` });
    },
    onError: fail('Could not adjust line'),
  });

  const setLineExcluded = useMutation({
    mutationFn: async ({ line, excluded }: { line: PayrollLine; excluded: boolean }): Promise<void> => {
      const hasAdjustments = line.other_earnings_minor !== 0 || line.deductions_minor !== 0 || Boolean(line.notes);
      const status = excluded ? 'excluded' : hasAdjustments ? 'adjusted' : 'calculated';
      const { error } = await supabase.from('payroll_lines').update({ status }).eq('id', line.id);
      if (error) throw error;
      await retotalRun(line.run_id);
      await audit('payroll_line', excluded ? 'EXCLUDE' : 'INCLUDE', line.id, { status: line.status }, { status });
    },
    onSuccess: (_d, { line, excluded }) => {
      invalidate(line.run_id);
      toast({ title: excluded ? 'Line excluded' : 'Line included', description: `${line.crew_name} ${excluded ? 'removed from' : 'restored to'} this run.` });
    },
    onError: fail('Could not update line'),
  });

  const setStatus = useMutation({
    mutationFn: async ({ run, status }: { run: PayrollRunRow; status: PayrollRunStatus }): Promise<PayrollRunRow> => {
      const data = await updateRun(run.id, { status });
      await audit('payroll_run', TRANSITION_META[status].action, run.id, { status: run.status }, { status: data.status });
      return data;
    },
    onSuccess: (data, { status }) => {
      invalidate(data.id);
      const meta = TRANSITION_META[status];
      toast({ title: meta.title, description: meta.description(data) });
    },
    onError: (error, { status }) => fail(`Could not ${TRANSITION_META[status].title.toLowerCase()}`)(error),
  });

  const generatePayslips = useMutation({
    mutationFn: async ({ run, lines }: GeneratePayslipsArgs): Promise<{ generated: number; failed: string[] }> => {
      if (!companyId) throw new Error('No company on the current profile');
      if (!run.period) throw new Error('Run has no pay period');
      const targets = lines ?? run.lines.filter((l) => l.status !== 'excluded');
      const failed: string[] = [];
      let generated = 0;
      for (const line of targets) {
        try {
          const doc = buildPayslipPdf({
            line,
            run,
            period: run.period,
            crew: { fullName: line.crew_name, rank: line.rank, department: line.department, vesselName: line.vessel_name ?? run.vessel_name },
            company: { name: branding.companyName, clientDisplayName: branding.clientDisplayName, clientLogoUrl: branding.clientLogoUrl, brandColor: branding.brandColor },
            settings,
          });
          const file = pdfToFile(doc, payslipFileName(run.run_number, line.crew_name));
          const uploaded = await uploadCrewDocument({ file, companyId, crewUserId: line.crew_user_id ?? line.profile_id, kind: 'payslips' });
          const { error } = await supabase
            .from('payroll_lines')
            .update({ payslip_path: uploaded.path, payslip_generated_at: new Date().toISOString() })
            .eq('id', line.id);
          if (error) throw error;
          await audit('payroll_line', 'PAYSLIP', line.id, { payslip_path: line.payslip_path }, { payslip_path: uploaded.path });
          generated += 1;
        } catch (err) {
          console.warn('payslip generation failed', line.id, err);
          failed.push(line.crew_name);
        }
      }
      return { generated, failed };
    },
    onSuccess: ({ generated, failed }, { run }) => {
      invalidate(run.id);
      toast({
        title: `${generated} payslip${generated === 1 ? '' : 's'} generated`,
        description: failed.length ? `Failed for: ${failed.join(', ')}` : `Stored under each crew member's documents.`,
        variant: failed.length ? 'destructive' : 'default',
      });
    },
    onError: fail('Could not generate payslips'),
  });

  return { createRun, calculateRun, updateLine, setLineExcluded, setStatus, generatePayslips };
}
