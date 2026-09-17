import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useToast } from '@/shared/hooks/use-toast';
import {
  asSplitMethod,
  canApprovePool,
  canCancelPool,
  canDeletePool,
  canMarkDistributed,
  distributionAuditSnapshot,
  filterPools,
  isPoolEditable,
  poolAuditSnapshot,
  type AuditValues,
  type GratuityDistributionRow,
  type GratuityPoolFilters,
  type GratuityPoolRow,
  type GratuitySplitMethod,
  type PoolWritePayload,
} from '@/modules/hris/lib/gratuities';

export const GRATUITIES_KEY = ['hris', 'gratuities'] as const;

/** Pool list row with the vessel name and participant counts joined in. */
export interface GratuityPoolListItem extends GratuityPoolRow {
  vessel_name: string | null;
  /** Non-excluded participants. */
  participant_count: number;
  excluded_count: number;
}

export interface DistributionProfile {
  id: string;
  first_name: string;
  last_name: string;
  rank: string | null;
  department: string | null;
  avatar_url: string | null;
}

export interface GratuityDistributionWithProfile extends GratuityDistributionRow {
  profile: DistributionProfile | null;
  crew_name: string;
}

export interface GratuityPoolDetail extends GratuityPoolRow {
  vessel_name: string | null;
  distributions: GratuityDistributionWithProfile[];
}

export interface GratuityDefaults {
  currency: string;
  split_method: GratuitySplitMethod;
}

type VesselJoin = { name: string } | null;

const crewName = (p: DistributionProfile | null): string => `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Unknown crew';

const sortDistributions = (rows: GratuityDistributionWithProfile[]): GratuityDistributionWithProfile[] =>
  [...rows].sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.amount_minor - a.amount_minor || a.crew_name.localeCompare(b.crew_name));

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Company defaults for new pools (`hr_company_settings`); falls back to EUR / points_days. */
export function useGratuityDefaults() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...GRATUITIES_KEY, 'defaults', companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GratuityDefaults> => {
      const { data, error } = await supabase
        .from('hr_company_settings')
        .select('default_currency, gratuity_default_method')
        .eq('company_id', companyId as string)
        .maybeSingle();
      if (error) throw error;
      return { currency: data?.default_currency ?? 'EUR', split_method: asSplitMethod(data?.gratuity_default_method) };
    },
  });
  return { ...query, defaults: query.data ?? { currency: 'EUR', split_method: 'points_days' as GratuitySplitMethod } };
}

/**
 * All pools of the company (fetched once; the KPI tiles need the full set)
 * with the filters applied client-side.
 */
export function useGratuityPools(filters: GratuityPoolFilters) {
  const { profile } = useAuth();
  const access = usePayrollAccess();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...GRATUITIES_KEY, 'pools', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<GratuityPoolListItem[]> => {
      const { data, error } = await supabase
        .from('gratuity_pools')
        .select('*, vessels(name), gratuity_distributions(id, excluded)')
        .eq('company_id', companyId as string)
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw) => {
        const { vessels, gratuity_distributions, ...rest } = raw as GratuityPoolRow & {
          vessels: VesselJoin;
          gratuity_distributions: { id: string; excluded: boolean }[] | null;
        };
        const dists = gratuity_distributions ?? [];
        const excluded = dists.filter((d) => d.excluded).length;
        return { ...rest, vessel_name: vessels?.name ?? null, participant_count: dists.length - excluded, excluded_count: excluded };
      });
    },
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const pools = useMemo(() => filterPools(all, filters), [all, filters]);
  return { ...query, all, pools };
}

/** One pool with its distributions and the crew profile joined in. */
export function useGratuityPool(poolId: string | null) {
  const access = usePayrollAccess();
  const query = useQuery({
    queryKey: [...GRATUITIES_KEY, 'pool', poolId],
    enabled: Boolean(poolId) && !access.loading && access.canView,
    queryFn: async (): Promise<GratuityPoolDetail | null> => {
      const { data, error } = await supabase
        .from('gratuity_pools')
        .select('*, vessels(name), gratuity_distributions(*, profiles!gratuity_distributions_profile_id_fkey(id, first_name, last_name, rank, department, avatar_url))')
        .eq('id', poolId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { vessels, gratuity_distributions, ...rest } = data as GratuityPoolRow & {
        vessels: VesselJoin;
        gratuity_distributions: (GratuityDistributionRow & { profiles: DistributionProfile | null })[] | null;
      };
      const distributions = (gratuity_distributions ?? []).map((d) => {
        const { profiles, ...row } = d;
        return { ...row, profile: profiles ?? null, crew_name: crewName(profiles ?? null) };
      });
      return { ...rest, vessel_name: vessels?.name ?? null, distributions: sortDistributions(distributions) };
    },
  });
  return { ...query, pool: query.data ?? null };
}

export interface MyGratuity extends GratuityDistributionRow {
  pool_name: string;
  vessel_name: string | null;
  period_start: string | null;
  period_end: string | null;
  currency: string;
  pool_status: string | null;
}

/**
 * Self-service: the signed-in crew member's own distributions. Pool details
 * come through the embedded relation; RLS may hide pools the user cannot
 * read, in which case the row still shows with a generic label.
 */
export function useMyGratuities(options: { enabled?: boolean } = {}) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;
  const query = useQuery({
    queryKey: [...GRATUITIES_KEY, 'mine', profileId],
    enabled: Boolean(profileId) && (options.enabled ?? true),
    queryFn: async (): Promise<MyGratuity[]> => {
      const { data, error } = await supabase
        .from('gratuity_distributions')
        .select('*, gratuity_pools(name, period_start, period_end, currency, status, vessels(name))')
        .eq('profile_id', profileId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      type PoolJoin = { name: string; period_start: string; period_end: string; currency: string; status: string; vessels: VesselJoin } | null;
      return (data ?? [])
        .map((raw) => {
          const { gratuity_pools, ...row } = raw as GratuityDistributionRow & { gratuity_pools: PoolJoin };
          return {
            ...row,
            pool_name: gratuity_pools?.name ?? 'Gratuity pool',
            vessel_name: gratuity_pools?.vessels?.name ?? null,
            period_start: gratuity_pools?.period_start ?? null,
            period_end: gratuity_pools?.period_end ?? null,
            currency: gratuity_pools?.currency ?? 'EUR',
            pool_status: gratuity_pools?.status ?? null,
          };
        })
        // Crew only see shares once the pool has been approved (or the pool is not readable at all).
        .filter((r) => r.pool_status === null || r.pool_status === 'approved' || r.pool_status === 'distributed')
        .sort((a, b) => (b.period_end ?? '').localeCompare(a.period_end ?? ''));
    },
  });
  return { ...query, gratuities: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface UpdatePoolArgs {
  pool: GratuityPoolRow;
  payload: Partial<PoolWritePayload>;
}

export interface UpdateDistributionArgs {
  distribution: GratuityDistributionRow;
  poolStatus: string;
  patch: Pick<TablesUpdate<'gratuity_distributions'>, 'excluded' | 'exclusion_reason' | 'adjustment_minor' | 'adjustment_reason'>;
}

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'CALCULATE' | 'APPROVE' | 'DISTRIBUTE' | 'CANCEL';
type AuditEntity = 'gratuity_pool' | 'gratuity_distribution';

export function useGratuityMutations() {
  const { profile, user } = useAuth();
  const access = usePayrollAccess();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (entity: AuditEntity, action: AuditAction, entityId: string, oldValues: AuditValues | null, newValues: AuditValues | null) => {
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
    (poolId?: string) => {
      void queryClient.invalidateQueries({ queryKey: [...GRATUITIES_KEY, 'pools'] });
      void queryClient.invalidateQueries({ queryKey: [...GRATUITIES_KEY, 'mine'] });
      if (poolId) void queryClient.invalidateQueries({ queryKey: [...GRATUITIES_KEY, 'pool', poolId] });
    },
    [queryClient],
  );

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );

  const requireEdit = useCallback(() => {
    if (!access.canEdit) throw new Error('You do not have permission to edit gratuities');
  }, [access.canEdit]);
  const requireAdmin = useCallback(() => {
    if (!access.canAdmin) throw new Error('Only payroll administrators can do this');
  }, [access.canAdmin]);

  const updatePoolRow = useCallback(
    async (id: string, patch: TablesUpdate<'gratuity_pools'>): Promise<GratuityPoolRow> => {
      const { data, error } = await supabase
        .from('gratuity_pools')
        .update({ ...patch, updated_by: user?.id ?? null })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    [user?.id],
  );

  const runCalculate = useCallback(async (poolId: string): Promise<number> => {
    const { data, error } = await supabase.rpc('gratuity_calculate_pool', { p_pool_id: poolId });
    if (error) throw error;
    return data ?? 0;
  }, []);

  const createPool = useMutation({
    mutationFn: async (payload: PoolWritePayload): Promise<GratuityPoolRow> => {
      requireEdit();
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('gratuity_pools')
        .insert({ ...payload, company_id: companyId, status: 'draft', created_by: user?.id ?? null, updated_by: user?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      await audit('gratuity_pool', 'CREATE', data.id, null, poolAuditSnapshot(data));
      return data;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      toast({ title: 'Pool created', description: `${data.name} is ready to calculate.` });
    },
    onError: fail('Could not create pool'),
  });

  const updatePool = useMutation({
    mutationFn: async ({ pool, payload }: UpdatePoolArgs): Promise<GratuityPoolRow> => {
      requireEdit();
      if (!isPoolEditable(pool.status)) throw new Error(`A ${pool.status} pool cannot be edited`);
      const data = await updatePoolRow(pool.id, payload);
      await audit('gratuity_pool', 'UPDATE', pool.id, poolAuditSnapshot(pool), poolAuditSnapshot(data));
      return data;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      toast({ title: 'Pool updated', description: data.status === 'calculated' ? 'Recalculate to refresh the shares.' : undefined });
    },
    onError: fail('Could not update pool'),
  });

  const calculatePool = useMutation({
    mutationFn: async (pool: GratuityPoolRow): Promise<number> => {
      requireEdit();
      if (!isPoolEditable(pool.status)) throw new Error(`A ${pool.status} pool cannot be recalculated`);
      const count = await runCalculate(pool.id);
      await audit('gratuity_pool', 'CALCULATE', pool.id, poolAuditSnapshot(pool), { ...poolAuditSnapshot({ ...pool, status: 'calculated' }), participants: count });
      return count;
    },
    onSuccess: (count, pool) => {
      invalidate(pool.id);
      toast({
        title: 'Pool calculated',
        description: count === 0 ? 'No eligible crew were onboard during this period.' : `${count} crew member${count === 1 ? '' : 's'} share the pool.`,
      });
    },
    onError: fail('Could not calculate pool'),
  });

  const updateDistribution = useMutation({
    mutationFn: async ({ distribution, poolStatus, patch }: UpdateDistributionArgs): Promise<GratuityDistributionRow> => {
      requireEdit();
      if (distribution.payout_status === 'paid' || distribution.payout_status === 'in_payroll') {
        throw new Error('This share is already in payroll and cannot be changed');
      }
      const { data, error } = await supabase.from('gratuity_distributions').update(patch).eq('id', distribution.id).select('*').single();
      if (error) throw error;
      await audit('gratuity_distribution', 'UPDATE', distribution.id, distributionAuditSnapshot(distribution), distributionAuditSnapshot(data));
      // Exclusion changes shift everyone else's share, so re-run the engine; adjustments only touch this row.
      const exclusionChanged = patch.excluded !== undefined && patch.excluded !== distribution.excluded;
      if (exclusionChanged && isPoolEditable(poolStatus)) await runCalculate(distribution.pool_id);
      return data;
    },
    onSuccess: (data, { patch }) => {
      invalidate(data.pool_id);
      const title = patch.excluded === true ? 'Crew member excluded' : patch.excluded === false ? 'Crew member included' : 'Adjustment saved';
      toast({ title });
    },
    onError: fail('Could not update share'),
  });

  const approvePool = useMutation({
    mutationFn: async (pool: GratuityPoolRow): Promise<GratuityPoolRow> => {
      requireAdmin();
      if (!canApprovePool(pool.status)) throw new Error('Only a calculated pool can be approved');
      const data = await updatePoolRow(pool.id, { status: 'approved', approved_by: user?.id ?? null, approved_at: new Date().toISOString() });
      await audit('gratuity_pool', 'APPROVE', pool.id, poolAuditSnapshot(pool), poolAuditSnapshot(data));
      return data;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      toast({ title: 'Pool approved', description: 'Shares will be picked up by the next payroll run covering the period end.' });
    },
    onError: fail('Could not approve pool'),
  });

  const markDistributed = useMutation({
    mutationFn: async (pool: GratuityPoolRow): Promise<GratuityPoolRow> => {
      requireAdmin();
      if (!canMarkDistributed(pool.status)) throw new Error('Only an approved pool can be marked as distributed');
      const paidAt = new Date().toISOString();
      const { data: paidRows, error: dErr } = await supabase
        .from('gratuity_distributions')
        .update({ payout_status: 'paid', paid_at: paidAt })
        .eq('pool_id', pool.id)
        .eq('payout_status', 'pending')
        .eq('excluded', false)
        .select('id');
      if (dErr) throw dErr;
      const data = await updatePoolRow(pool.id, { status: 'distributed', distributed_at: paidAt });
      await audit('gratuity_pool', 'DISTRIBUTE', pool.id, poolAuditSnapshot(pool), { ...poolAuditSnapshot(data), paid_shares: paidRows?.length ?? 0 });
      return data;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      toast({ title: 'Pool distributed', description: 'All pending shares are marked as paid outside payroll.' });
    },
    onError: fail('Could not mark pool as distributed'),
  });

  const cancelPool = useMutation({
    mutationFn: async ({ pool, reason }: { pool: GratuityPoolRow; reason?: string }): Promise<GratuityPoolRow> => {
      requireEdit();
      if (!canCancelPool(pool.status)) throw new Error(`A ${pool.status} pool cannot be cancelled`);
      if (pool.status === 'approved') requireAdmin();
      const { error: dErr } = await supabase
        .from('gratuity_distributions')
        .update({ payout_status: 'cancelled' })
        .eq('pool_id', pool.id)
        .eq('payout_status', 'pending');
      if (dErr) throw dErr;
      const notes = reason ? `${pool.notes ? `${pool.notes}\n` : ''}Cancelled: ${reason}` : pool.notes;
      const data = await updatePoolRow(pool.id, { status: 'cancelled', notes });
      await audit('gratuity_pool', 'CANCEL', pool.id, poolAuditSnapshot(pool), { ...poolAuditSnapshot(data), reason: reason ?? null });
      return data;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      toast({ title: 'Pool cancelled' });
    },
    onError: fail('Could not cancel pool'),
  });

  const deletePool = useMutation({
    mutationFn: async (pool: GratuityPoolRow): Promise<void> => {
      requireEdit();
      if (!canDeletePool(pool.status)) throw new Error('Only draft pools can be deleted');
      const { error } = await supabase.from('gratuity_pools').delete().eq('id', pool.id);
      if (error) throw error;
      await audit('gratuity_pool', 'DELETE', pool.id, poolAuditSnapshot(pool), null);
    },
    onSuccess: (_, pool) => {
      invalidate(pool.id);
      queryClient.removeQueries({ queryKey: [...GRATUITIES_KEY, 'pool', pool.id] });
      toast({ title: 'Pool deleted' });
    },
    onError: fail('Could not delete pool'),
  });

  const isPending =
    createPool.isPending ||
    updatePool.isPending ||
    calculatePool.isPending ||
    updateDistribution.isPending ||
    approvePool.isPending ||
    markDistributed.isPending ||
    cancelPool.isPending ||
    deletePool.isPending;

  return { createPool, updatePool, calculatePool, updateDistribution, approvePool, markDistributed, cancelPool, deletePool, isPending };
}
