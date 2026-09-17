import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { removeCrewDocument, uploadCrewDocument } from '@/lib/storage/crewDocuments';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { EXPIRY_QUERY_KEY } from '@/modules/hris/hooks/useCrewContracts';
import {
  buildMatrix,
  filterMatrix,
  sortByWorst,
  type AuthorisationPayload,
  type HrExpiryItemRow,
  type MatrixFilters,
  type MatrixRow,
  type WorkAuthorisationRow,
} from '@/modules/hris/lib/rightToWork';

export const RTW_KEY = ['hris', 'right-to-work'] as const;
export const RTW_AUTHORISATIONS_KEY = [...RTW_KEY, 'authorisations'] as const;
export const RTW_COMPANY_AUTHORISATIONS_KEY = [...RTW_KEY, 'company-authorisations'] as const;
export const RTW_EXPIRY_KEY = [...RTW_KEY, 'expiry'] as const;
export const RTW_PROFILE_KEY = [...RTW_KEY, 'profile-documents'] as const;

const RTW_EXPIRY_TYPES = ['passport', 'visa', 'medical', 'certificate', 'work_authorisation'] as const;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Work authorisations of one crew member, soonest expiry first. */
export function useWorkAuthorisations(profileId: string | null) {
  const query = useQuery({
    queryKey: [...RTW_AUTHORISATIONS_KEY, profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<WorkAuthorisationRow[]> => {
      const { data, error } = await supabase
        .from('crew_work_authorisations')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, authorisations: query.data ?? [] };
}

/** Identity documents held on `profiles` for one crew member. */
export interface ProfileDocuments {
  id: string;
  user_id: string | null;
  nationality: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  visa_status: string | null;
  visa_expiry: string | null;
  medical_expiry: string | null;
}

export function useProfileDocuments(profileId: string | null) {
  const query = useQuery({
    queryKey: [...RTW_PROFILE_KEY, profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ProfileDocuments> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, nationality, passport_number, passport_expiry, visa_status, visa_expiry, medical_expiry')
        .eq('id', profileId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
  return { ...query, documents: query.data ?? null };
}

/**
 * All right-to-work expiry rows for the company (no date ceiling — the
 * matrix needs "valid" items too). Self-service users only receive their
 * own rows through RLS.
 */
export function useRtwExpiryItems(options: { profileId?: string | null } = {}) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...RTW_EXPIRY_KEY, companyId, options.profileId ?? 'all'],
    enabled: Boolean(companyId) && !access.loading,
    queryFn: async (): Promise<HrExpiryItemRow[]> => {
      let q = supabase.from('hr_expiry_items').select('*').eq('company_id', companyId as string).in('item_type', [...RTW_EXPIRY_TYPES]);
      if (options.profileId) q = q.eq('profile_id', options.profileId);
      const { data, error } = await q.order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, items: query.data ?? [] };
}

/** Every authorisation in the company (for the matrix). */
function useCompanyAuthorisations() {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  return useQuery({
    queryKey: [...RTW_COMPANY_AUTHORISATIONS_KEY, companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<WorkAuthorisationRow[]> => {
      const { data, error } = await supabase.from('crew_work_authorisations').select('*').eq('company_id', companyId as string);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** One row per crew member with passport / visa / medical / authorisations / certificates status. */
export function useCompanyRtwMatrix(filters: MatrixFilters) {
  const directory = useHrCrewDirectory();
  const expiry = useRtwExpiryItems();
  const authorisations = useCompanyAuthorisations();

  const all: MatrixRow[] = useMemo(
    () =>
      sortByWorst(
        buildMatrix({
          directory: directory.entries,
          expiryItems: expiry.items,
          authorisations: authorisations.data ?? [],
          columns: filters.columns,
        }),
      ),
    [directory.entries, expiry.items, authorisations.data, filters.columns],
  );
  const rows = useMemo(() => filterMatrix(all, filters), [all, filters]);
  const departments = useMemo(() => Array.from(new Set(directory.entries.map((e) => e.department).filter((d): d is string => Boolean(d)))).sort(), [directory.entries]);

  return {
    all,
    rows,
    departments,
    isLoading: directory.isLoading || expiry.isLoading || authorisations.isLoading,
    isError: directory.isError || expiry.isError || authorisations.isError,
    error: directory.error ?? expiry.error ?? authorisations.error,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

const authSnapshot = (row: Partial<WorkAuthorisationRow>): Json => ({
  authorisation_type: row.authorisation_type ?? null,
  country: row.country ?? null,
  reference_number: row.reference_number ?? null,
  issued_date: row.issued_date ?? null,
  expiry_date: row.expiry_date ?? null,
  entries: row.entries ?? null,
  status: row.status ?? null,
  document_path: row.document_path ?? null,
  verified_at: row.verified_at ?? null,
  notes: row.notes ?? null,
});

export interface ProfileDocumentsPatch {
  nationality?: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  visa_status?: string | null;
  visa_expiry?: string | null;
  medical_expiry?: string | null;
}

export function useRtwMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (entityType: 'crew_work_authorisation' | 'crew_profile', action: AuditAction, entityId: string, oldValues: Json | null, newValues: Json | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues,
        new_values: newValues,
      });
      if (error) console.warn(`${entityType} audit log failed`, error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: RTW_KEY });
    void queryClient.invalidateQueries({ queryKey: EXPIRY_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['hris', 'crew-directory'] });
  }, [queryClient]);

  const fail = useCallback(
    (title: string) => (error: unknown) => toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' }),
    [toast],
  );

  const updateRow = useCallback(
    async (id: string, patch: TablesUpdate<'crew_work_authorisations'>): Promise<WorkAuthorisationRow> => {
      const { data, error } = await supabase.from('crew_work_authorisations').update({ ...patch, updated_by: user?.id ?? null }).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    [user?.id],
  );

  const createAuthorisation = useMutation({
    mutationFn: async ({ profileId, payload }: { profileId: string; payload: AuthorisationPayload }): Promise<WorkAuthorisationRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const insert: TablesInsert<'crew_work_authorisations'> = { ...payload, company_id: companyId, profile_id: profileId, created_by: user?.id ?? null, updated_by: user?.id ?? null };
      const { data, error } = await supabase.from('crew_work_authorisations').insert(insert).select('*').single();
      if (error) throw error;
      await audit('crew_work_authorisation', 'CREATE', data.id, null, authSnapshot(data));
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Authorisation added' });
    },
    onError: fail('Could not add authorisation'),
  });

  const updateAuthorisation = useMutation({
    mutationFn: async ({ row, payload }: { row: WorkAuthorisationRow; payload: Partial<AuthorisationPayload> }): Promise<WorkAuthorisationRow> => {
      const data = await updateRow(row.id, payload);
      await audit('crew_work_authorisation', 'UPDATE', row.id, authSnapshot(row), authSnapshot(data));
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Authorisation updated' });
    },
    onError: fail('Could not update authorisation'),
  });

  const verifyAuthorisation = useMutation({
    mutationFn: async ({ row, verified }: { row: WorkAuthorisationRow; verified: boolean }): Promise<WorkAuthorisationRow> => {
      const data = await updateRow(row.id, verified ? { verified_at: new Date().toISOString(), verified_by: user?.id ?? null } : { verified_at: null, verified_by: null });
      await audit('crew_work_authorisation', 'UPDATE', row.id, authSnapshot(row), authSnapshot(data));
      return data;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      toast({ title: vars.verified ? 'Marked as verified' : 'Verification cleared' });
    },
    onError: fail('Could not update verification'),
  });

  const deleteAuthorisation = useMutation({
    mutationFn: async (row: WorkAuthorisationRow): Promise<void> => {
      const { error } = await supabase.from('crew_work_authorisations').delete().eq('id', row.id);
      if (error) throw error;
      if (row.document_path) await removeCrewDocument(row.document_path).catch((err: unknown) => console.warn('authorisation document not removed', err));
      await audit('crew_work_authorisation', 'DELETE', row.id, authSnapshot(row), null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Authorisation deleted' });
    },
    onError: fail('Could not delete authorisation'),
  });

  const uploadDocument = useMutation({
    mutationFn: async ({ row, file, crewUserId }: { row: WorkAuthorisationRow; file: File; crewUserId: string }): Promise<WorkAuthorisationRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const uploaded = await uploadCrewDocument({ file, companyId, crewUserId, kind: 'right-to-work' });
      const data = await updateRow(row.id, { document_path: uploaded.path, document_name: uploaded.name });
      if (row.document_path && row.document_path !== uploaded.path) {
        await removeCrewDocument(row.document_path).catch((err: unknown) => console.warn('old authorisation document not removed', err));
      }
      await audit('crew_work_authorisation', 'UPDATE', row.id, authSnapshot(row), authSnapshot(data));
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Document uploaded' });
    },
    onError: fail('Could not upload document'),
  });

  const updateProfileDocuments = useMutation({
    mutationFn: async ({ profileId, before, patch }: { profileId: string; before: ProfileDocumentsPatch; patch: ProfileDocumentsPatch }): Promise<void> => {
      const { error } = await supabase.from('profiles').update({ ...patch, updated_by: user?.id ?? null }).eq('id', profileId);
      if (error) throw error;
      const changed = (Object.keys(patch) as (keyof ProfileDocumentsPatch)[]).filter((k) => (before[k] ?? null) !== (patch[k] ?? null));
      if (changed.length) {
        const oldValues: Record<string, Json> = {};
        const newValues: Record<string, Json> = {};
        for (const k of changed) {
          oldValues[k] = before[k] ?? null;
          newValues[k] = patch[k] ?? null;
        }
        await audit('crew_profile', 'UPDATE', profileId, oldValues, newValues);
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Identity documents saved' });
    },
    onError: fail('Could not save identity documents'),
  });

  return { createAuthorisation, updateAuthorisation, verifyAuthorisation, deleteAuthorisation, uploadDocument, updateProfileDocuments };
}

/** "Refresh alerts now": runs `hr_generate_alerts` for the company. */
export function useRunHrAlerts() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;
  return useMutation({
    mutationFn: async (): Promise<number> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase.rpc('hr_generate_alerts', { p_company_id: companyId });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast({ title: 'Alerts refreshed', description: count === 0 ? 'No new alerts. Existing ones were updated or auto-dismissed.' : `${count} new alert${count === 1 ? '' : 's'} created.` });
    },
    onError: (error: unknown) => toast({ title: 'Could not refresh alerts', description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' }),
  });
}
