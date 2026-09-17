import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useToast } from '@/shared/hooks/use-toast';
import {
  auditJson,
  defaultCompanySettings,
  generatePeriods,
  skipExistingPeriods,
  sortFxRatesNewestFirst,
  sortPayGrades,
  type CompanySettingsWritePayload,
  type FxRateRow,
  type FxRateWritePayload,
  type GeneratePeriodsInput,
  type HrCompanySettingsRow,
  type PayGradeRow,
  type PayGradeWritePayload,
  type PayPeriodRow,
} from '@/modules/hris/lib/compensation';

/**
 * Data hooks for the Compensation Settings page: company payroll settings,
 * pay grades, FX rates and pay periods. Every write is mirrored into
 * `audit_logs`, as the contracts hooks do.
 */

export const HR_SETTINGS_KEY = ['hris', 'settings'] as const;
export const PAY_GRADES_KEY = ['hris', 'pay-grades'] as const;
export const FX_RATES_KEY = ['hris', 'fx-rates'] as const;
export const PAY_PERIODS_KEY = ['hris', 'pay-periods'] as const;

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
type AuditEntity = 'hr_company_settings' | 'pay_grade' | 'fx_rate' | 'pay_period';

/** Shared audit writer + toast helpers for the settings mutations. */
function useSettingsMutationSupport() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (entityType: AuditEntity, action: AuditAction, entityId: string, oldValues: unknown, newValues: unknown) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues ? auditJson(oldValues) : null,
        new_values: newValues ? auditJson(newValues) : null,
      });
      if (error) console.warn(`${entityType} audit log failed`, error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const auditMany = useCallback(
    async (entityType: AuditEntity, action: AuditAction, rows: { id: string; values: unknown }[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase.from('audit_logs').insert(
        rows.map((r) => ({
          entity_type: entityType,
          entity_id: r.id,
          action,
          actor_user_id: user?.id ?? null,
          actor_email: user?.email ?? null,
          actor_role: profile?.role ?? null,
          old_values: null,
          new_values: auditJson(r.values),
        })),
      );
      if (error) console.warn(`${entityType} audit log failed`, error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );

  const invalidate = useCallback(
    (...keys: readonly (readonly string[])[]) => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient],
  );

  return { companyId, userId: user?.id ?? null, audit, auditMany, fail, invalidate, toast };
}

// ---------------------------------------------------------------------------
// Company settings
// ---------------------------------------------------------------------------

/** The company's payroll settings row (table defaults when it does not exist yet). */
export function useHrCompanySettings() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...HR_SETTINGS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<HrCompanySettingsRow> => {
      const { data, error } = await supabase.from('hr_company_settings').select('*').eq('company_id', companyId as string).maybeSingle();
      if (error) throw error;
      return data ?? defaultCompanySettings(companyId as string);
    },
  });
  return { ...query, settings: query.data ?? null };
}

export function useHrCompanySettingsMutations() {
  const { companyId, userId, audit, fail, invalidate, toast } = useSettingsMutationSupport();

  const upsert = useMutation({
    mutationFn: async ({ previous, payload }: { previous: HrCompanySettingsRow | null; payload: CompanySettingsWritePayload }): Promise<HrCompanySettingsRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const row: TablesInsert<'hr_company_settings'> = { ...payload, company_id: companyId, updated_by: userId, updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from('hr_company_settings').upsert(row, { onConflict: 'company_id' }).select('*').single();
      if (error) throw error;
      await audit('hr_company_settings', previous ? 'UPDATE' : 'CREATE', companyId, previous, data);
      return data;
    },
    onSuccess: () => {
      invalidate(HR_SETTINGS_KEY, ['hris', 'compensation']);
      toast({ title: 'Settings saved' });
    },
    onError: fail('Could not save settings'),
  });

  return { upsert };
}

// ---------------------------------------------------------------------------
// Pay grades
// ---------------------------------------------------------------------------

export function usePayGrades(options: { includeInactive?: boolean } = {}) {
  const { profile } = useAuth();
  const access = usePayrollAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...PAY_GRADES_KEY, companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    staleTime: 60_000,
    queryFn: async (): Promise<PayGradeRow[]> => {
      const { data, error } = await supabase.from('pay_grades').select('*').eq('company_id', companyId as string);
      if (error) throw error;
      return sortPayGrades(data ?? []);
    },
  });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const grades = useMemo(() => (options.includeInactive ? all : all.filter((g) => g.is_active)), [all, options.includeInactive]);
  return { ...query, grades, all };
}

export function usePayGradeMutations() {
  const { companyId, userId, audit, fail, invalidate, toast } = useSettingsMutationSupport();

  const updateRow = useCallback(
    async (id: string, patch: TablesUpdate<'pay_grades'>): Promise<PayGradeRow> => {
      const { data, error } = await supabase.from('pay_grades').update({ ...patch, updated_by: userId }).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    [userId],
  );

  const create = useMutation({
    mutationFn: async (payload: PayGradeWritePayload): Promise<PayGradeRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('pay_grades')
        .insert({ ...payload, company_id: companyId, created_by: userId, updated_by: userId })
        .select('*')
        .single();
      if (error) throw error;
      await audit('pay_grade', 'CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate(PAY_GRADES_KEY);
      toast({ title: 'Pay grade created' });
    },
    onError: fail('Could not create pay grade'),
  });

  const update = useMutation({
    mutationFn: async ({ grade, payload }: { grade: PayGradeRow; payload: Partial<PayGradeWritePayload> }): Promise<PayGradeRow> => {
      const data = await updateRow(grade.id, payload);
      await audit('pay_grade', 'UPDATE', grade.id, grade, data);
      return data;
    },
    onSuccess: () => {
      invalidate(PAY_GRADES_KEY, ['hris', 'compensation']);
      toast({ title: 'Pay grade updated' });
    },
    onError: fail('Could not update pay grade'),
  });

  const setActive = useMutation({
    mutationFn: async ({ grade, isActive }: { grade: PayGradeRow; isActive: boolean }): Promise<PayGradeRow> => {
      const data = await updateRow(grade.id, { is_active: isActive });
      await audit('pay_grade', 'UPDATE', grade.id, { is_active: grade.is_active }, { is_active: data.is_active });
      return data;
    },
    onSuccess: (data) => {
      invalidate(PAY_GRADES_KEY);
      toast({ title: data.is_active ? 'Pay grade activated' : 'Pay grade deactivated' });
    },
    onError: fail('Could not change pay grade'),
  });

  const remove = useMutation({
    mutationFn: async (grade: PayGradeRow): Promise<void> => {
      const { error } = await supabase.from('pay_grades').delete().eq('id', grade.id);
      if (error) throw error;
      await audit('pay_grade', 'DELETE', grade.id, grade, null);
    },
    onSuccess: () => {
      invalidate(PAY_GRADES_KEY, ['hris', 'compensation']);
      toast({ title: 'Pay grade deleted' });
    },
    onError: fail('Could not delete pay grade'),
  });

  return { create, update, setActive, remove };
}

// ---------------------------------------------------------------------------
// FX rates
// ---------------------------------------------------------------------------

/** All FX rates of the company, newest first. */
export function useFxRates() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...FX_RATES_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<FxRateRow[]> => {
      const { data, error } = await supabase.from('fx_rates').select('*').eq('company_id', companyId as string);
      if (error) throw error;
      return sortFxRatesNewestFirst(data ?? []);
    },
  });
  return { ...query, rates: query.data ?? [] };
}

export function useFxRateMutations() {
  const { companyId, userId, audit, fail, invalidate, toast } = useSettingsMutationSupport();

  const add = useMutation({
    mutationFn: async (payload: FxRateWritePayload): Promise<FxRateRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('fx_rates')
        .upsert({ ...payload, company_id: companyId, created_by: userId }, { onConflict: 'company_id,base_currency,quote_currency,valid_from' })
        .select('*')
        .single();
      if (error) throw error;
      await audit('fx_rate', 'CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate(FX_RATES_KEY, ['hris', 'compensation']);
      toast({ title: 'FX rate saved' });
    },
    onError: fail('Could not save FX rate'),
  });

  const remove = useMutation({
    mutationFn: async (rate: FxRateRow): Promise<void> => {
      const { error } = await supabase.from('fx_rates').delete().eq('id', rate.id);
      if (error) throw error;
      await audit('fx_rate', 'DELETE', rate.id, rate, null);
    },
    onSuccess: () => {
      invalidate(FX_RATES_KEY, ['hris', 'compensation']);
      toast({ title: 'FX rate deleted' });
    },
    onError: fail('Could not delete FX rate'),
  });

  return { add, remove };
}

// ---------------------------------------------------------------------------
// Pay periods
// ---------------------------------------------------------------------------

export interface PayPeriodFilters {
  /** 'all' = every scope, 'company' = company-wide periods only, else a vessel id. */
  vesselId: 'all' | 'company' | string;
  /** Calendar year of the period start; null = any. */
  year: number | null;
}

export function usePayPeriods(filters: PayPeriodFilters) {
  const { profile } = useAuth();
  const access = usePayrollAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...PAY_PERIODS_KEY, companyId, filters.vesselId, filters.year],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<PayPeriodRow[]> => {
      let q = supabase.from('pay_periods').select('*').eq('company_id', companyId as string).order('start_date', { ascending: false });
      if (filters.vesselId === 'company') q = q.is('vessel_id', null);
      else if (filters.vesselId !== 'all') q = q.eq('vessel_id', filters.vesselId);
      if (filters.year !== null) q = q.gte('start_date', `${filters.year}-01-01`).lte('start_date', `${filters.year}-12-31`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, periods: query.data ?? [] };
}

export interface GeneratePeriodsArgs extends GeneratePeriodsInput {
  /** null = company-wide. */
  vesselId: string | null;
}

export interface GeneratePeriodsResult {
  inserted: PayPeriodRow[];
  skipped: number;
}

export function usePayPeriodMutations() {
  const { companyId, userId, audit, auditMany, fail, invalidate, toast } = useSettingsMutationSupport();

  const setStatus = useCallback(
    async (period: PayPeriodRow, status: 'open' | 'locked' | 'closed'): Promise<PayPeriodRow> => {
      const now = new Date().toISOString();
      const patch: TablesUpdate<'pay_periods'> =
        status === 'locked'
          ? { status, locked_at: now, locked_by: userId }
          : status === 'closed'
            ? { status, closed_at: now, closed_by: userId, locked_at: period.locked_at ?? now, locked_by: period.locked_by ?? userId }
            : { status, locked_at: null, locked_by: null };
      const { data, error } = await supabase.from('pay_periods').update(patch).eq('id', period.id).select('*').single();
      if (error) throw error;
      await audit('pay_period', 'UPDATE', period.id, { status: period.status }, { status: data.status });
      return data;
    },
    [audit, userId],
  );

  const create = useMutation({
    mutationFn: async (payload: Omit<TablesInsert<'pay_periods'>, 'id' | 'company_id' | 'created_at'>): Promise<PayPeriodRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase.from('pay_periods').insert({ ...payload, company_id: companyId }).select('*').single();
      if (error) throw error;
      await audit('pay_period', 'CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate(PAY_PERIODS_KEY);
      toast({ title: 'Pay period created' });
    },
    onError: fail('Could not create pay period'),
  });

  const generateForYear = useMutation({
    mutationFn: async ({ vesselId, ...input }: GeneratePeriodsArgs): Promise<GeneratePeriodsResult> => {
      if (!companyId) throw new Error('No company on the current profile');
      const generated = generatePeriods(input);
      let existingQuery = supabase.from('pay_periods').select('start_date').eq('company_id', companyId);
      existingQuery = vesselId ? existingQuery.eq('vessel_id', vesselId) : existingQuery.is('vessel_id', null);
      const { data: existing, error: existingError } = await existingQuery;
      if (existingError) throw existingError;
      const toInsert = skipExistingPeriods(generated, (existing ?? []).map((r) => r.start_date));
      if (toInsert.length === 0) return { inserted: [], skipped: generated.length };
      const { data, error } = await supabase
        .from('pay_periods')
        .insert(toInsert.map((p) => ({ ...p, company_id: companyId, vessel_id: vesselId, status: 'open' })))
        .select('*');
      if (error) throw error;
      const inserted = data ?? [];
      await auditMany('pay_period', 'CREATE', inserted.map((r) => ({ id: r.id, values: r })));
      return { inserted, skipped: generated.length - inserted.length };
    },
    onSuccess: ({ inserted, skipped }) => {
      invalidate(PAY_PERIODS_KEY);
      toast({
        title: inserted.length ? `${inserted.length} pay period${inserted.length === 1 ? '' : 's'} created` : 'Nothing to generate',
        description: skipped ? `${skipped} already existed and ${skipped === 1 ? 'was' : 'were'} skipped.` : undefined,
      });
    },
    onError: fail('Could not generate pay periods'),
  });

  const lock = useMutation({
    mutationFn: (period: PayPeriodRow) => setStatus(period, 'locked'),
    onSuccess: () => {
      invalidate(PAY_PERIODS_KEY);
      toast({ title: 'Pay period locked' });
    },
    onError: fail('Could not lock pay period'),
  });

  const unlock = useMutation({
    mutationFn: (period: PayPeriodRow) => setStatus(period, 'open'),
    onSuccess: () => {
      invalidate(PAY_PERIODS_KEY);
      toast({ title: 'Pay period reopened' });
    },
    onError: fail('Could not unlock pay period'),
  });

  const close = useMutation({
    mutationFn: (period: PayPeriodRow) => setStatus(period, 'closed'),
    onSuccess: () => {
      invalidate(PAY_PERIODS_KEY);
      toast({ title: 'Pay period closed' });
    },
    onError: fail('Could not close pay period'),
  });

  return { create, generateForYear, lock, unlock, close };
}
