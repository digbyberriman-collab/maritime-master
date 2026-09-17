import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { removeCrewDocument, uploadCrewDocument } from '@/lib/storage/crewDocuments';
import {
  auditDisciplinarySnapshot,
  filterDisciplinaryRecords,
  sortRecordsNewestFirst,
  type AppealStatus,
  type DisciplinaryFilters,
  type DisciplinaryRecordRow,
  type DisciplinarySearchable,
  type DisciplinarySelfRow,
  type DisciplinaryStage,
  type DisciplinaryWritePayload,
} from '@/modules/hris/lib/disciplinary';
import { PERFORMANCE_DUE_ITEMS_KEY, type PerformanceDueItem } from '@/modules/hris/hooks/useObjectives';

export const DISCIPLINARY_KEY = ['hris', 'disciplinary'] as const;
export const INCIDENT_PICKER_KEY = ['hris', 'incident-picker'] as const;

type ProfileJoin = {
  user_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  avatar_url: string | null;
  rank: string | null;
} | null;
type IssuerJoin = { first_name: string; last_name: string; preferred_name: string | null } | null;
type VesselJoin = { name: string } | null;
type IncidentJoin = { incident_number: string; incident_type: string; incident_date: string; location: string } | null;

/** Disciplinary record with subject, issuer, vessel and incident resolved. */
export interface DisciplinaryRecord extends DisciplinarySearchable {
  crew_user_id: string | null;
  crew_avatar_url: string | null;
  crew_rank: string | null;
  vessel_name: string | null;
  incident_type: string | null;
  incident_location: string | null;
}

export interface IncidentOption {
  id: string;
  incident_number: string;
  incident_type: string;
  incident_date: string;
  location: string;
  vessel_id: string;
  /** Linked to the crew member through incident_involved_persons. */
  linked: boolean;
  involvement: string | null;
}

const RECORD_SELECT =
  '*, subject:profiles!disciplinary_records_profile_id_fkey(user_id, first_name, last_name, preferred_name, avatar_url, rank), issuer:profiles!disciplinary_records_issued_by_profile_id_fkey(first_name, last_name, preferred_name), vessels!disciplinary_records_vessel_id_fkey(name), incidents!disciplinary_records_incident_id_fkey(incident_number, incident_type, incident_date, location)';

type RawRecord = DisciplinaryRecordRow & { subject: ProfileJoin; issuer: IssuerJoin; vessels: VesselJoin; incidents: IncidentJoin };

const displayName = (p: { first_name: string; last_name: string; preferred_name: string | null } | null): string | null => {
  if (!p) return null;
  const first = p.preferred_name || p.first_name || '';
  return `${first} ${p.last_name ?? ''}`.trim() || null;
};

const shapeRecord = (raw: RawRecord): DisciplinaryRecord => {
  const { subject, issuer, vessels, incidents, ...rest } = raw;
  return {
    ...rest,
    crew_name: displayName(subject) ?? 'Unknown crew',
    crew_user_id: subject?.user_id ?? null,
    crew_avatar_url: subject?.avatar_url ?? null,
    crew_rank: subject?.rank ?? null,
    issued_by_name: displayName(issuer),
    vessel_name: vessels?.name ?? null,
    incident_number: incidents?.incident_number ?? null,
    incident_type: incidents?.incident_type ?? null,
    incident_location: incidents?.location ?? null,
  };
};

const fetchRecords = async (companyId: string, profileId: string | null): Promise<DisciplinaryRecord[]> => {
  let query = supabase.from('disciplinary_records').select(RECORD_SELECT).eq('company_id', companyId);
  if (profileId) query = query.eq('profile_id', profileId);
  const { data, error } = await query.order('incident_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return sortRecordsNewestFirst(((data ?? []) as unknown as RawRecord[]).map(shapeRecord));
};

/**
 * Disciplinary records for HR editors: company-wide, or scoped to a crew
 * member with `filters.crewId`. Other filters apply client-side.
 */
export function useDisciplinaryRecords(filters: DisciplinaryFilters, options: { enabled?: boolean } = {}) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const scopedProfile = filters.crewId !== 'all' ? filters.crewId : null;

  const query = useQuery({
    queryKey: [...DISCIPLINARY_KEY, 'list', companyId, scopedProfile],
    enabled: Boolean(companyId) && !access.loading && access.canEdit && options.enabled !== false,
    queryFn: () => fetchRecords(companyId as string, scopedProfile),
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const records = useMemo(() => filterDisciplinaryRecords(all, { ...filters, crewId: 'all' }), [all, filters]);
  return { ...query, all, records };
}

/** One record, full detail (HR editors). */
export function useDisciplinaryRecord(id: string | null) {
  return useQuery({
    queryKey: [...DISCIPLINARY_KEY, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<DisciplinaryRecord> => {
      const { data, error } = await supabase.from('disciplinary_records').select(RECORD_SELECT).eq('id', id as string).single();
      if (error) throw error;
      return shapeRecord(data as unknown as RawRecord);
    },
  });
}

/** My own records through the subject-safe view (no investigation file, no investigation-stage rows). */
export function useMyDisciplinaryRecords() {
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: [...DISCIPLINARY_KEY, 'mine', profile?.id ?? null],
    enabled: Boolean(profile?.id),
    queryFn: async (): Promise<DisciplinarySelfRow[]> => {
      const { data, error } = await supabase
        .from('disciplinary_records_self')
        .select('*')
        .eq('profile_id', profile?.id as string)
        .order('incident_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, records: query.data ?? [] };
}

/** Warning rows from `hr_performance_due_items` lapsing within `withinDays`, soonest first. */
export function useWarningDueItems(withinDays = 30) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...PERFORMANCE_DUE_ITEMS_KEY, 'warning', companyId, withinDays],
    enabled: Boolean(companyId) && !access.loading && access.canEdit,
    queryFn: async (): Promise<PerformanceDueItem[]> => {
      const { data, error } = await supabase
        .from('hr_performance_due_items')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('item_type', 'warning')
        .lte('days_remaining', withinDays)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, items: query.data ?? [] };
}

/**
 * Incidents in the company for the link picker. When a profile is given,
 * incidents that person is linked to (incident_involved_persons) are
 * flagged and listed first.
 */
export function useIncidentsForPicker(profileId: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...INCIDENT_PICKER_KEY, companyId, profileId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<IncidentOption[]> => {
      const [{ data: incidents, error }, links] = await Promise.all([
        supabase
          .from('incidents')
          .select('id, incident_number, incident_type, incident_date, location, vessel_id')
          .eq('company_id', companyId as string)
          .order('incident_date', { ascending: false })
          .limit(300),
        profileId
          ? supabase.from('incident_involved_persons').select('incident_id, involvement').eq('profile_id', profileId)
          : Promise.resolve({ data: [] as { incident_id: string; involvement: string }[], error: null }),
      ]);
      if (error) throw error;
      if (links.error) throw links.error;
      const involvement = new Map((links.data ?? []).map((l) => [l.incident_id, l.involvement]));
      return (incidents ?? [])
        .map((i) => ({ ...i, linked: involvement.has(i.id), involvement: involvement.get(i.id) ?? null }))
        .sort((a, b) => Number(b.linked) - Number(a.linked) || b.incident_date.localeCompare(a.incident_date));
    },
  });
  return { ...query, incidents: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateCaseArgs {
  profileId: string;
  payload: DisciplinaryWritePayload;
}

export interface UpdateCaseArgs {
  record: DisciplinaryRecordRow;
  payload: Partial<DisciplinaryWritePayload>;
}

export interface SetStageArgs {
  record: DisciplinaryRecordRow;
  stage: DisciplinaryStage;
  outcome: string | null;
  outcome_date: string | null;
  expiry_date: string | null;
}

export interface AppealArgs {
  record: DisciplinaryRecordRow;
  notes: string | null;
}

export interface ResolveAppealArgs extends AppealArgs {
  result: Extract<AppealStatus, 'upheld' | 'overturned'>;
}

export interface UploadCaseDocumentArgs {
  record: DisciplinaryRecordRow;
  file: File;
  /** profiles.user_id when the crew member has a login, else profiles.id. */
  crewUserId: string;
}

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW';

export function useDisciplinaryMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (action: AuditAction, entityId: string, oldValues: Partial<DisciplinaryRecordRow> | null, newValues: Partial<DisciplinaryRecordRow> | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: 'disciplinary_record',
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues ? auditDisciplinarySnapshot(oldValues) : null,
        new_values: newValues ? auditDisciplinarySnapshot(newValues) : null,
      });
      if (error) console.warn('disciplinary_record audit log failed', error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: DISCIPLINARY_KEY });
    void queryClient.invalidateQueries({ queryKey: PERFORMANCE_DUE_ITEMS_KEY });
  }, [queryClient]);

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );

  const updateRow = useCallback(
    async (id: string, patch: TablesUpdate<'disciplinary_records'>): Promise<DisciplinaryRecordRow> => {
      const { data, error } = await supabase
        .from('disciplinary_records')
        .update({ ...patch, updated_by: user?.id ?? null })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    [user?.id],
  );

  /** Every opening of a case file is audited. Fire-and-forget; never blocks the UI. */
  const logView = useCallback(
    (recordId: string) => {
      void audit('VIEW', recordId, null, null);
    },
    [audit],
  );

  const create = useMutation({
    mutationFn: async ({ profileId, payload }: CreateCaseArgs): Promise<DisciplinaryRecordRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const { data, error } = await supabase
        .from('disciplinary_records')
        .insert({
          ...payload,
          company_id: companyId,
          profile_id: profileId,
          issued_by_profile_id: payload.issued_by_profile_id ?? profile?.id ?? null,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      await audit('CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Case opened', description: 'The disciplinary record has been created.' });
    },
    onError: fail('Could not create case'),
  });

  const update = useMutation({
    mutationFn: async ({ record, payload }: UpdateCaseArgs): Promise<DisciplinaryRecordRow> => {
      const data = await updateRow(record.id, payload);
      await audit('UPDATE', record.id, record, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Case updated' });
    },
    onError: fail('Could not update case'),
  });

  const setStage = useMutation({
    mutationFn: async ({ record, stage, outcome, outcome_date, expiry_date }: SetStageArgs): Promise<DisciplinaryRecordRow> => {
      const patch: TablesUpdate<'disciplinary_records'> = { stage, outcome, outcome_date, expiry_date };
      if (record.status === 'expired' && expiry_date) patch.status = 'open';
      const data = await updateRow(record.id, patch);
      await audit('UPDATE', record.id, record, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Stage updated' });
    },
    onError: fail('Could not change stage'),
  });

  const lodgeAppeal = useMutation({
    mutationFn: async ({ record, notes }: AppealArgs): Promise<DisciplinaryRecordRow> => {
      const data = await updateRow(record.id, { appeal_status: 'lodged', appeal_notes: notes });
      await audit('UPDATE', record.id, record, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Appeal lodged', description: 'The warning will not lapse while the appeal is open.' });
    },
    onError: fail('Could not lodge appeal'),
  });

  const resolveAppeal = useMutation({
    mutationFn: async ({ record, result, notes }: ResolveAppealArgs): Promise<DisciplinaryRecordRow> => {
      const patch: TablesUpdate<'disciplinary_records'> = { appeal_status: result, appeal_notes: notes };
      if (result === 'overturned') patch.status = 'overturned';
      const data = await updateRow(record.id, patch);
      await audit('UPDATE', record.id, record, data);
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast({ title: data.appeal_status === 'overturned' ? 'Appeal upheld, record overturned' : 'Appeal dismissed, decision stands' });
    },
    onError: fail('Could not resolve appeal'),
  });

  const close = useMutation({
    mutationFn: async (record: DisciplinaryRecordRow): Promise<DisciplinaryRecordRow> => {
      const data = await updateRow(record.id, { status: 'closed', outcome_date: record.outcome_date ?? new Date().toISOString().slice(0, 10) });
      await audit('UPDATE', record.id, record, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Case closed' });
    },
    onError: fail('Could not close case'),
  });

  const reopen = useMutation({
    mutationFn: async (record: DisciplinaryRecordRow): Promise<DisciplinaryRecordRow> => {
      const data = await updateRow(record.id, { status: 'open' });
      await audit('UPDATE', record.id, record, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Case reopened' });
    },
    onError: fail('Could not reopen case'),
  });

  const uploadDocument = useMutation({
    mutationFn: async ({ record, file, crewUserId }: UploadCaseDocumentArgs): Promise<DisciplinaryRecordRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const uploaded = await uploadCrewDocument({ file, companyId, crewUserId, kind: 'disciplinary' });
      const data = await updateRow(record.id, { document_path: uploaded.path, document_name: uploaded.name });
      if (record.document_path && record.document_path !== uploaded.path) {
        await removeCrewDocument(record.document_path).catch((err: unknown) => console.warn('old disciplinary document not removed', err));
      }
      await audit('UPDATE', record.id, record, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Document attached' });
    },
    onError: fail('Could not upload document'),
  });

  const acknowledge = useMutation({
    mutationFn: async (recordId: string): Promise<void> => {
      const { error } = await supabase.rpc('disciplinary_record_acknowledge', { p_record_id: recordId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Acknowledged', description: 'Thank you. Your acknowledgement has been recorded.' });
    },
    onError: fail('Could not acknowledge'),
  });

  const remove = useMutation({
    mutationFn: async (record: DisciplinaryRecordRow): Promise<void> => {
      const { error } = await supabase.from('disciplinary_records').delete().eq('id', record.id);
      if (error) throw error;
      if (record.document_path) {
        await removeCrewDocument(record.document_path).catch((err: unknown) => console.warn('disciplinary document not removed', err));
      }
      await audit('DELETE', record.id, record, null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Record deleted' });
    },
    onError: fail('Could not delete record'),
  });

  return { create, update, setStage, lodgeAppeal, resolveAppeal, close, reopen, uploadDocument, acknowledge, remove, logView };
}
