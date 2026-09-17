import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import {
  auditJson,
  pickCurrentCompensation,
  sortCompensationNewestFirst,
  todayIso,
  type BankDetailRow,
  type BankDetailWritePayload,
  type CompensationOverviewRow,
  type CompensationWritePayload,
  type CrewCompensationRow,
  type PayGradeRow,
} from '@/modules/hris/lib/compensation';

/**
 * Data hooks for Salaries & Compensation: a crew member's compensation
 * packages, the company-wide overview, FX conversion for the KPI tiles and
 * bank details. Compensation writes are audited client-side (as contracts
 * are); bank detail writes are audited by a database trigger.
 */

export const COMPENSATION_KEY = ['hris', 'compensation'] as const;
export const BANK_DETAILS_KEY = ['hris', 'bank-details'] as const;
export const FX_LOOKUP_KEY = ['hris', 'compensation', 'fx'] as const;

export type PayGradeSummary = Pick<PayGradeRow, 'id' | 'code' | 'name' | 'currency' | 'monthly_base_minor' | 'daily_rate_minor' | 'gratuity_points'>;

/** A compensation row with its pay grade joined in. */
export interface CrewCompensation extends CrewCompensationRow {
  pay_grade: PayGradeSummary | null;
}

const PAY_GRADE_JOIN = 'pay_grades(id, code, name, currency, monthly_base_minor, daily_rate_minor, gratuity_points)';

type GradeJoinRow = CrewCompensationRow & { pay_grades: PayGradeSummary | null };

const withGrade = (row: GradeJoinRow): CrewCompensation => {
  const { pay_grades, ...rest } = row;
  return { ...rest, pay_grade: pay_grades ?? null };
};

/** All compensation packages for one crew member (profiles.id), newest first. */
export function useCrewCompensation(profileId: string | null) {
  const query = useQuery({
    queryKey: [...COMPENSATION_KEY, 'crew', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<CrewCompensation[]> => {
      const { data, error } = await supabase
        .from('crew_compensation')
        .select(`*, ${PAY_GRADE_JOIN}`)
        .eq('profile_id', profileId as string)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return sortCompensationNewestFirst(((data ?? []) as GradeJoinRow[]).map(withGrade));
    },
  });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const { current, history } = useMemo(() => pickCurrentCompensation(rows), [rows]);
  return { ...query, rows, current, history };
}

/**
 * One row per crew member in the directory with their active package (if
 * any) joined in. Feeds the KPI tiles and the overview table.
 */
export function useCompanyCompensation() {
  const { profile } = useAuth();
  const access = usePayrollAccess();
  const directory = useHrCrewDirectory();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...COMPENSATION_KEY, 'company', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<CrewCompensation[]> => {
      const { data, error } = await supabase
        .from('crew_compensation')
        .select(`*, ${PAY_GRADE_JOIN}`)
        .eq('company_id', companyId as string)
        .eq('status', 'active')
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as GradeJoinRow[]).map(withGrade);
    },
  });

  const rows = useMemo<CompensationOverviewRow[]>(() => {
    const byProfile = new Map<string, CrewCompensation>();
    for (const c of query.data ?? []) if (!byProfile.has(c.profile_id)) byProfile.set(c.profile_id, c);
    return directory.entries.map((e) => {
      const c = byProfile.get(e.id) ?? null;
      return {
        profile_id: e.id,
        user_id: e.user_id,
        crew_name: e.displayName,
        rank: e.rank ?? e.position,
        department: e.department,
        vessel_id: e.vessel_id,
        vessel_name: e.vessel_name,
        compensation: c ? { ...c, pay_grade_code: c.pay_grade?.code ?? null, pay_grade_name: c.pay_grade?.name ?? null } : null,
      };
    });
  }, [query.data, directory.entries]);

  return { ...query, isLoading: query.isLoading || directory.isLoading, rows, active: query.data ?? [] };
}

/**
 * FX rates from each of `currencies` into `target` as of today, via the
 * `fx_rate_for` RPC (which also tries the inverse pair). Unknown pairs map
 * to null so the caller can flag them and fall back to 1:1.
 */
export function useFxRatesTo(currencies: readonly string[], target: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const distinct = useMemo(
    () => Array.from(new Set(currencies.map((c) => c.toUpperCase()))).filter((c) => c !== (target ?? '').toUpperCase()).sort(),
    [currencies, target],
  );
  const today = todayIso();
  const query = useQuery({
    queryKey: [...FX_LOOKUP_KEY, companyId, target, distinct.join(','), today],
    enabled: Boolean(companyId && target),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, number | null>> => {
      const entries = await Promise.all(
        distinct.map(async (from): Promise<[string, number | null]> => {
          const { data, error } = await supabase.rpc('fx_rate_for', { p_company_id: companyId as string, p_from: from, p_to: target as string, p_on: today });
          if (error) throw error;
          return [from, typeof data === 'number' && Number.isFinite(data) ? data : null];
        }),
      );
      return new Map(entries);
    },
  });
  const rates = useMemo(() => query.data ?? new Map<string, number | null>(), [query.data]);
  return { ...query, rates, isLoading: distinct.length > 0 && query.isLoading };
}

// ---------------------------------------------------------------------------
// Compensation mutations
// ---------------------------------------------------------------------------

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

function useCompensationAudit() {
  const { profile, user } = useAuth();
  return useCallback(
    async (action: AuditAction, entityId: string, oldValues: Partial<CrewCompensationRow> | null, newValues: Partial<CrewCompensationRow> | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: 'crew_compensation',
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues ? auditJson(oldValues) : null,
        new_values: newValues ? auditJson(newValues) : null,
      });
      if (error) console.warn('crew_compensation audit log failed', error);
    },
    [profile?.role, user?.email, user?.id],
  );
}

function useFail() {
  const { toast } = useToast();
  return useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );
}

export interface CreateCompensationArgs {
  profileId: string;
  payload: CompensationWritePayload;
}

export interface UpdateCompensationArgs {
  row: CrewCompensationRow;
  payload: Partial<CompensationWritePayload>;
}

export function useCompensationMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const audit = useCompensationAudit();
  const fail = useFail();
  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: COMPENSATION_KEY });
  }, [queryClient]);

  /** Strips the joined grade so a `CrewCompensation` can be used as a plain row. */
  const plain = (row: CrewCompensationRow): CrewCompensationRow => {
    const { pay_grade: _grade, ...rest } = row as CrewCompensationRow & { pay_grade?: unknown };
    return rest;
  };

  const updateRow = useCallback(
    async (id: string, patch: TablesUpdate<'crew_compensation'>): Promise<CrewCompensationRow> => {
      const { data, error } = await supabase.from('crew_compensation').update({ ...patch, updated_by: userId }).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    [userId],
  );

  const approvalPatch = (status: string | undefined): TablesUpdate<'crew_compensation'> =>
    status === 'active' ? { approved_by: userId, approved_at: new Date().toISOString() } : {};

  const create = useMutation({
    mutationFn: async ({ profileId, payload }: CreateCompensationArgs): Promise<CrewCompensationRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('crew_compensation')
        .insert({ ...payload, ...approvalPatch(payload.status), company_id: companyId, profile_id: profileId, created_by: userId, updated_by: userId })
        .select('*')
        .single();
      if (error) throw error;
      await audit('CREATE', data.id, null, data);
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast({
        title: data.status === 'active' ? 'Compensation activated' : 'Compensation saved as draft',
        description: data.status === 'active' ? 'Any previously active package has been superseded.' : undefined,
      });
    },
    onError: fail('Could not create compensation'),
  });

  const update = useMutation({
    mutationFn: async ({ row, payload }: UpdateCompensationArgs): Promise<CrewCompensationRow> => {
      const becomingActive = payload.status === 'active' && row.status !== 'active';
      const data = await updateRow(row.id, { ...payload, ...(becomingActive ? approvalPatch('active') : {}) });
      await audit('UPDATE', row.id, plain(row), data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Compensation updated' });
    },
    onError: fail('Could not update compensation'),
  });

  const activate = useMutation({
    mutationFn: async (row: CrewCompensationRow): Promise<CrewCompensationRow> => {
      const data = await updateRow(row.id, { status: 'active', ...approvalPatch('active') });
      await audit('UPDATE', row.id, plain(row), data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Compensation activated', description: 'Any previously active package has been superseded.' });
    },
    onError: fail('Could not activate compensation'),
  });

  const supersede = useMutation({
    mutationFn: async (row: CrewCompensationRow): Promise<CrewCompensationRow> => {
      const data = await updateRow(row.id, { status: 'superseded', effective_to: row.effective_to ?? todayIso() });
      await audit('UPDATE', row.id, plain(row), data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Compensation ended', description: 'The package is now part of the history.' });
    },
    onError: fail('Could not end compensation'),
  });

  const remove = useMutation({
    mutationFn: async (row: CrewCompensationRow): Promise<void> => {
      const { error } = await supabase.from('crew_compensation').delete().eq('id', row.id);
      if (error) throw error;
      await audit('DELETE', row.id, plain(row), null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Compensation deleted' });
    },
    onError: fail('Could not delete compensation'),
  });

  return { create, update, activate, supersede, remove };
}

// ---------------------------------------------------------------------------
// Bank details
// ---------------------------------------------------------------------------

/** Bank accounts on file for one crew member, primary first. */
export function useBankDetails(profileId: string | null) {
  const query = useQuery({
    queryKey: [...BANK_DETAILS_KEY, profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<BankDetailRow[]> => {
      const { data, error } = await supabase
        .from('crew_bank_details')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, accounts: query.data ?? [] };
}

export interface CreateBankDetailArgs {
  profileId: string;
  payload: BankDetailWritePayload;
}

export interface UpdateBankDetailArgs {
  row: BankDetailRow;
  payload: Partial<BankDetailWritePayload>;
}

export function useBankDetailMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fail = useFail();
  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: BANK_DETAILS_KEY });
  }, [queryClient]);

  /** The partial unique index allows one primary per profile: clear the others first. */
  const clearPrimary = useCallback(async (profileId: string, exceptId?: string) => {
    let q = supabase.from('crew_bank_details').update({ is_primary: false, updated_by: userId }).eq('profile_id', profileId).eq('is_primary', true);
    if (exceptId) q = q.neq('id', exceptId);
    const { error } = await q;
    if (error) throw error;
  }, [userId]);

  const create = useMutation({
    mutationFn: async ({ profileId, payload }: CreateBankDetailArgs): Promise<BankDetailRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      if (payload.is_primary) await clearPrimary(profileId);
      const { data, error } = await supabase
        .from('crew_bank_details')
        .insert({ ...payload, company_id: companyId, profile_id: profileId, created_by: userId, updated_by: userId })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Bank account added' });
    },
    onError: fail('Could not add bank account'),
  });

  const update = useMutation({
    mutationFn: async ({ row, payload }: UpdateBankDetailArgs): Promise<BankDetailRow> => {
      if (payload.is_primary) await clearPrimary(row.profile_id, row.id);
      // Changing the account identifiers invalidates any earlier verification.
      const identifiersChanged =
        (payload.iban !== undefined && payload.iban !== row.iban) ||
        (payload.account_number !== undefined && payload.account_number !== row.account_number) ||
        (payload.swift_bic !== undefined && payload.swift_bic !== row.swift_bic) ||
        (payload.sort_code !== undefined && payload.sort_code !== row.sort_code) ||
        (payload.routing_number !== undefined && payload.routing_number !== row.routing_number);
      const patch: TablesUpdate<'crew_bank_details'> = { ...payload, updated_by: userId };
      if (identifiersChanged) {
        patch.verified_at = null;
        patch.verified_by = null;
      }
      const { data, error } = await supabase.from('crew_bank_details').update(patch).eq('id', row.id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Bank account updated' });
    },
    onError: fail('Could not update bank account'),
  });

  const setPrimary = useMutation({
    mutationFn: async (row: BankDetailRow): Promise<BankDetailRow> => {
      await clearPrimary(row.profile_id, row.id);
      const { data, error } = await supabase.from('crew_bank_details').update({ is_primary: true, updated_by: userId }).eq('id', row.id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Primary account changed' });
    },
    onError: fail('Could not change primary account'),
  });

  const verify = useMutation({
    mutationFn: async ({ row, verified }: { row: BankDetailRow; verified: boolean }): Promise<BankDetailRow> => {
      const { data, error } = await supabase
        .from('crew_bank_details')
        .update({ verified_at: verified ? new Date().toISOString() : null, verified_by: verified ? userId : null, updated_by: userId })
        .eq('id', row.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast({ title: data.verified_at ? 'Bank account verified' : 'Verification removed' });
    },
    onError: fail('Could not update verification'),
  });

  const remove = useMutation({
    mutationFn: async (row: BankDetailRow): Promise<void> => {
      const { error } = await supabase.from('crew_bank_details').delete().eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Bank account removed' });
    },
    onError: fail('Could not remove bank account'),
  });

  return { create, update, setPrimary, verify, remove };
}
