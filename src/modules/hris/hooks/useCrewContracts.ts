import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { removeCrewDocument, uploadCrewDocument } from '@/lib/storage/crewDocuments';
import {
  auditSnapshot,
  filterCompanyContracts,
  sortContractsNewestFirst,
  type CompanyContractFilters,
  type ContractWritePayload,
  type CrewContractRow,
} from '@/modules/hris/lib/contractHelpers';

/** A contract row with the vessel name joined in. */
export interface CrewContract extends CrewContractRow {
  vessel_name: string | null;
}

/** Company-wide row: contract + vessel + crew display name. */
export interface CompanyContract extends CrewContract {
  crew_name: string;
  crew_user_id: string | null;
}

export type HrExpiryItem = Tables<'hr_expiry_items'>;
export type HrExpiryItemType = 'contract' | 'probation' | 'passport' | 'visa' | 'medical' | 'certificate' | 'work_authorisation';

export interface CompanyVessel {
  id: string;
  name: string;
}

export const CONTRACT_QUERY_KEY = ['hris', 'contracts'] as const;
export const EXPIRY_QUERY_KEY = ['hris', 'expiry-items'] as const;
export const HRIS_VESSELS_KEY = ['hris', 'vessels'] as const;

type VesselJoin = { name: string } | null;
type ProfileJoin = { user_id: string | null; first_name: string; last_name: string; preferred_name: string | null } | null;

const withVessel = <T extends CrewContractRow & { vessels?: VesselJoin }>(row: T): CrewContract => {
  const { vessels, ...rest } = row;
  return { ...(rest as CrewContractRow), vessel_name: vessels?.name ?? null };
};

/** Vessels of the current company, for selects and name lookups. */
export function useCompanyVessels() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...HRIS_VESSELS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CompanyVessel[]> => {
      const { data, error } = await supabase
        .from('vessels')
        .select('id, name')
        .eq('company_id', companyId as string)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const byId = useMemo(() => new Map((query.data ?? []).map((v) => [v.id, v.name])), [query.data]);
  return { ...query, vessels: query.data ?? [], vesselName: (id: string | null | undefined) => (id ? byId.get(id) ?? null : null) };
}

/** All contracts for one crew member (profiles.id), newest first. */
export function useCrewContracts(profileId: string | null) {
  const query = useQuery({
    queryKey: [...CONTRACT_QUERY_KEY, 'crew', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<CrewContract[]> => {
      const { data, error } = await supabase
        .from('crew_contracts')
        .select('*, vessels(name)')
        .eq('profile_id', profileId as string)
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return sortContractsNewestFirst((data ?? []).map(withVessel));
    },
  });
  return { ...query, contracts: query.data ?? [] };
}

/**
 * Company-wide contracts for the overview. The full list is fetched once
 * (it also feeds the KPI tiles) and the filters are applied client-side.
 */
export function useCompanyContracts(filters: CompanyContractFilters) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...CONTRACT_QUERY_KEY, 'company', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<CompanyContract[]> => {
      const { data, error } = await supabase
        .from('crew_contracts')
        .select('*, vessels(name), profiles!crew_contracts_profile_id_fkey(user_id, first_name, last_name, preferred_name)')
        .eq('company_id', companyId as string)
        .order('start_date', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []).map((raw) => {
        const { profiles, ...rest } = raw as CrewContractRow & { vessels: VesselJoin; profiles: ProfileJoin };
        const base = withVessel(rest);
        const first = profiles?.preferred_name || profiles?.first_name || '';
        const crew_name = `${first} ${profiles?.last_name ?? ''}`.trim() || 'Unknown crew';
        return { ...base, crew_name, crew_user_id: profiles?.user_id ?? null };
      });
      return sortContractsNewestFirst(rows);
    },
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const contracts = useMemo(() => filterCompanyContracts(all, filters), [all, filters]);
  return { ...query, all, contracts };
}

interface ExpiryOptions {
  itemTypes: HrExpiryItemType[];
  /** Include items due within this many days (items already overdue are included too). */
  withinDays: number;
}

/** Upcoming HR dates from the `hr_expiry_items` view, soonest first. */
export function useHrExpiryItems({ itemTypes, withinDays }: ExpiryOptions) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const typesKey = [...itemTypes].sort().join(',');

  const query = useQuery({
    queryKey: [...EXPIRY_QUERY_KEY, companyId, typesKey, withinDays],
    enabled: Boolean(companyId) && !access.loading && itemTypes.length > 0,
    queryFn: async (): Promise<HrExpiryItem[]> => {
      const { data, error } = await supabase
        .from('hr_expiry_items')
        .select('*')
        .eq('company_id', companyId as string)
        .in('item_type', itemTypes)
        .lte('days_remaining', withinDays)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, items: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateContractArgs {
  profileId: string;
  payload: ContractWritePayload;
}

export interface UpdateContractArgs {
  contract: CrewContractRow;
  payload: Partial<ContractWritePayload>;
}

export interface TerminateContractArgs {
  contract: CrewContractRow;
  reason: string;
  terminated_at: string;
}

export interface UploadContractDocumentArgs {
  contract: CrewContractRow;
  file: File;
  /** profiles.user_id when the crew member has a login, else profiles.id. */
  crewUserId: string;
}

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export function useContractMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (action: AuditAction, entityId: string, oldValues: Partial<CrewContractRow> | null, newValues: Partial<CrewContractRow> | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: 'crew_contract',
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues ? auditSnapshot(oldValues) : null,
        new_values: newValues ? auditSnapshot(newValues) : null,
      });
      if (error) console.warn('crew_contract audit log failed', error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CONTRACT_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: EXPIRY_QUERY_KEY });
  }, [queryClient]);

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );

  const updateRow = useCallback(async (id: string, patch: TablesUpdate<'crew_contracts'>): Promise<CrewContractRow> => {
    const { data, error } = await supabase
      .from('crew_contracts')
      .update({ ...patch, updated_by: user?.id ?? null })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }, [user?.id]);

  const create = useMutation({
    mutationFn: async ({ profileId, payload }: CreateContractArgs): Promise<CrewContractRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('crew_contracts')
        .insert({ ...payload, company_id: companyId, profile_id: profileId, created_by: user?.id ?? null, updated_by: user?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      await audit('CREATE', data.id, null, data);
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast({ title: data.status === 'active' ? 'Contract activated' : 'Contract saved', description: 'The contract has been created.' });
    },
    onError: fail('Could not create contract'),
  });

  const update = useMutation({
    mutationFn: async ({ contract, payload }: UpdateContractArgs): Promise<CrewContractRow> => {
      const data = await updateRow(contract.id, payload);
      await audit('UPDATE', contract.id, contract, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contract updated' });
    },
    onError: fail('Could not update contract'),
  });

  const activate = useMutation({
    mutationFn: async (contract: CrewContractRow): Promise<CrewContractRow> => {
      const data = await updateRow(contract.id, { status: 'active' });
      await audit('UPDATE', contract.id, contract, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contract activated', description: 'Any previously active contract has been superseded.' });
    },
    onError: fail('Could not activate contract'),
  });

  const terminate = useMutation({
    mutationFn: async ({ contract, reason, terminated_at }: TerminateContractArgs): Promise<CrewContractRow> => {
      const data = await updateRow(contract.id, { status: 'terminated', termination_reason: reason, terminated_at });
      await audit('UPDATE', contract.id, contract, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contract terminated' });
    },
    onError: fail('Could not terminate contract'),
  });

  const uploadDocument = useMutation({
    mutationFn: async ({ contract, file, crewUserId }: UploadContractDocumentArgs): Promise<CrewContractRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const uploaded = await uploadCrewDocument({ file, companyId, crewUserId, kind: 'contracts' });
      const data = await updateRow(contract.id, { document_path: uploaded.path, document_name: uploaded.name });
      if (contract.document_path && contract.document_path !== uploaded.path) {
        await removeCrewDocument(contract.document_path).catch((err: unknown) => console.warn('old contract document not removed', err));
      }
      await audit('UPDATE', contract.id, contract, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Document uploaded', description: 'The signed contract has been attached.' });
    },
    onError: fail('Could not upload document'),
  });

  const remove = useMutation({
    mutationFn: async (contract: CrewContractRow): Promise<void> => {
      const { error } = await supabase.from('crew_contracts').delete().eq('id', contract.id);
      if (error) throw error;
      if (contract.document_path) {
        await removeCrewDocument(contract.document_path).catch((err: unknown) => console.warn('contract document not removed', err));
      }
      await audit('DELETE', contract.id, contract, null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contract deleted' });
    },
    onError: fail('Could not delete contract'),
  });

  return { create, update, activate, terminate, uploadDocument, remove };
}
