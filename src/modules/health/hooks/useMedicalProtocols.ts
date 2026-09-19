import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { daysUntil } from '@/modules/health/lib/format';

export type Protocol = Tables<'med_protocols'>;
export type ProtocolAcknowledgement = Tables<'med_protocol_acknowledgements'>;
export type MedicalLogEntry = Tables<'med_log_entries'>;

export const PROTOCOLS_KEY = ['health', 'protocols'] as const;
export const PROTOCOL_ACKS_KEY = ['health', 'protocol-acks'] as const;
export const MEDICAL_LOGS_KEY = ['health', 'medical-logs'] as const;

export const PROTOCOL_CATEGORIES = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'medication', label: 'Medication' },
  { value: 'evacuation', label: 'Evacuation' },
  { value: 'infection_control', label: 'Infection control' },
  { value: 'mental_health', label: 'Mental health' },
  { value: 'dental', label: 'Dental' },
  { value: 'hygiene', label: 'Hygiene' },
  { value: 'other', label: 'Other' },
] as const;

export const protocolCategoryLabel = (value: string | null | undefined): string =>
  PROTOCOL_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export interface ProtocolEntry extends Protocol {
  acknowledgementCount: number;
  reviewOverdue: boolean;
  daysToReview: number | null;
}

/**
 * The medical protocol library. Protocols are versioned and can require an
 * acknowledgement, which is how a DPA shows an auditor that the crew have
 * read the medevac procedure.
 */
export function useMedicalProtocols() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...PROTOCOLS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<ProtocolEntry[]> => {
      const { data, error } = await supabase
        .from('med_protocols')
        .select('*, med_protocol_acknowledgements(id)')
        .eq('company_id', companyId as string)
        .order('category')
        .order('title');
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as Protocol & { med_protocol_acknowledgements?: { id: string }[] };
        const days = daysUntil(typed.review_due);
        return {
          ...typed,
          acknowledgementCount: typed.med_protocol_acknowledgements?.length ?? 0,
          reviewOverdue: days !== null && days < 0,
          daysToReview: days,
        };
      });
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PROTOCOLS_KEY });
    void queryClient.invalidateQueries({ queryKey: PROTOCOL_ACKS_KEY });
  };

  const save = useMutation({
    mutationFn: async (values: Partial<Protocol> & { title: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      if (values.id) {
        const { error } = await supabase
          .from('med_protocols')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('med_protocols').insert({
        ...values,
        company_id: companyId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'med_protocols'>);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Protocol saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_protocols').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Protocol removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  /** Publishing bumps the version so an acknowledgement is version-specific. */
  const publish = useMutation({
    mutationFn: async (protocol: Protocol) => {
      const { error } = await supabase
        .from('med_protocols')
        .update({
          status: 'active',
          version: protocol.status === 'active' ? protocol.version + 1 : protocol.version,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq('id', protocol.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Protocol published', description: 'Crew acknowledgements now apply to this version.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not publish', description: error.message, variant: 'destructive' });
    },
  });

  const acknowledge = useMutation({
    mutationFn: async (protocol: Protocol) => {
      if (!companyId || !profile?.id) throw new Error('No profile');
      const { error } = await supabase.from('med_protocol_acknowledgements').insert({
        company_id: companyId,
        protocol_id: protocol.id,
        profile_id: profile.id,
        version: protocol.version,
      });
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Acknowledged' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not acknowledge', description: error.message, variant: 'destructive' });
    },
  });

  const active = useMemo(() => (query.data ?? []).filter((p) => p.status === 'active'), [query.data]);

  return {
    ...query,
    protocols: query.data ?? [],
    active,
    save,
    remove,
    publish,
    acknowledge,
    isMutating: save.isPending || remove.isPending || publish.isPending || acknowledge.isPending,
  };
}

/** Which protocols the signed-in person has acknowledged, and at what version. */
export function useMyProtocolAcknowledgements() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;

  const query = useQuery({
    queryKey: [...PROTOCOL_ACKS_KEY, 'mine', profileId],
    enabled: Boolean(profileId),
    staleTime: 60_000,
    queryFn: async (): Promise<ProtocolAcknowledgement[]> => {
      const { data, error } = await supabase
        .from('med_protocol_acknowledgements')
        .select('*')
        .eq('profile_id', profileId as string);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byProtocol = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of query.data ?? []) {
      map.set(row.protocol_id, Math.max(map.get(row.protocol_id) ?? 0, row.version));
    }
    return map;
  }, [query.data]);

  return { ...query, acknowledgements: query.data ?? [], byProtocol };
}

export const LOG_TYPES = [
  { value: 'fridge_temperature', label: 'Medical fridge temperature', unit: '°C' },
  { value: 'daily_check', label: 'Daily hospital check', unit: null },
  { value: 'weekly_check', label: 'Weekly check', unit: null },
  { value: 'sharps', label: 'Sharps disposal', unit: null },
  { value: 'oxygen', label: 'Oxygen cylinder', unit: 'bar' },
  { value: 'defibrillator', label: 'Defibrillator check', unit: null },
  { value: 'waste', label: 'Clinical waste', unit: null },
  { value: 'cleaning', label: 'Cleaning', unit: null },
  { value: 'telemedicine', label: 'Telemedicine call', unit: null },
  { value: 'handover', label: 'Medic handover', unit: null },
  { value: 'other', label: 'Other', unit: null },
] as const;

export const logTypeLabel = (value: string | null | undefined): string =>
  LOG_TYPES.find((t) => t.value === value)?.label ?? 'Other';

export const logTypeUnit = (value: string | null | undefined): string | null =>
  LOG_TYPES.find((t) => t.value === value)?.unit ?? null;

export interface MedicalLogEntryRow extends MedicalLogEntry {
  location_name: string | null;
  equipment_name: string | null;
  vessel_name: string | null;
}

/**
 * The ship's medical log books: fridge temperatures, daily hospital checks,
 * oxygen pressures, sharps disposal and telemedicine calls.
 */
export function useMedicalLogs(options: { logType?: string | null; vesselId?: string | null; limit?: number } = {}) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const { logType, vesselId, limit = 200 } = options;

  const query = useQuery({
    queryKey: [...MEDICAL_LOGS_KEY, companyId, logType ?? 'all', vesselId ?? 'all', limit],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async (): Promise<MedicalLogEntryRow[]> => {
      let request = supabase
        .from('med_log_entries')
        .select('*, med_supply_locations(name), med_equipment(name), vessels(name)')
        .eq('company_id', companyId as string)
        .order('recorded_at', { ascending: false })
        .limit(limit);
      if (logType) request = request.eq('log_type', logType);
      if (vesselId) request = request.eq('vessel_id', vesselId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const typed = row as MedicalLogEntry & {
          med_supply_locations?: { name: string } | null;
          med_equipment?: { name: string } | null;
          vessels?: { name: string } | null;
        };
        return {
          ...typed,
          location_name: typed.med_supply_locations?.name ?? null,
          equipment_name: typed.med_equipment?.name ?? null,
          vessel_name: typed.vessels?.name ?? null,
        };
      });
    },
  });

  const addEntry = useMutation({
    mutationFn: async (values: Partial<MedicalLogEntry> & { log_type: string }) => {
      if (!companyId) throw new Error('No company on your profile');
      const { error } = await supabase.from('med_log_entries').insert({
        ...values,
        company_id: companyId,
        recorded_by: user?.id ?? null,
      } as TablesInsert<'med_log_entries'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEDICAL_LOGS_KEY });
      toast({ title: 'Log entry recorded' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not record', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('med_log_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEDICAL_LOGS_KEY });
      toast({ title: 'Entry removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    entries: query.data ?? [],
    addEntry,
    remove,
    isMutating: addEntry.isPending || remove.isPending,
  };
}
