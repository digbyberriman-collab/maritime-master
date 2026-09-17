import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { toast } from '@/shared/hooks/use-toast';
import type { LogbookDefinition } from '@/modules/logbooks/lib/logbookDefinitions';

export type LogbookEntryStatus = 'draft' | 'submitted' | 'signed' | 'amended' | 'finalized';

export interface LogbookRecord {
  id: string;
  company_id: string;
  vessel_id: string;
  logbook_type: string;
  name: string;
  description: string | null;
  is_statutory: boolean;
  is_active: boolean;
  last_entry_at: string | null;
}

export interface LogbookEntry {
  id: string;
  logbook_id: string;
  company_id: string;
  vessel_id: string;
  entry_at: string;
  entry_date: string;
  watch_period: string | null;
  page_number: number | null;
  summary: string | null;
  remarks: string | null;
  data: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  position_text: string | null;
  status: LogbookEntryStatus;
  recorded_by: string | null;
  recorded_by_name: string | null;
  signed_by: string | null;
  signed_by_name: string | null;
  signed_at: string | null;
  finalized_by: string | null;
  finalized_by_name: string | null;
  finalized_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogbookEntryInput {
  entry_at: string;
  watch_period: string | null;
  summary: string | null;
  remarks: string | null;
  position_text: string | null;
  latitude: number | null;
  longitude: number | null;
  data: Record<string, unknown>;
}

/** Roles allowed to sign off entries and open a logbook for a vessel. */
const SENIOR_ROLES = [
  'superadmin', 'dpa', 'shore_management', 'fleet_master',
  'master', 'captain', 'chief_engineer', 'chief_officer', 'purser',
];

const monthBounds = (month: Date) => {
  const start = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(month.getFullYear(), month.getMonth() + 1, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
};

export const useLogbook = (definition: LogbookDefinition | undefined, month: Date) => {
  const { profile, user } = useAuth();
  const { selectedVessel } = useVessel();
  const queryClient = useQueryClient();

  const companyId = profile?.company_id ?? null;
  const vesselId = selectedVessel?.id ?? null;
  const logbookType = definition?.type ?? null;

  const canSign = useMemo(
    () => SENIOR_ROLES.includes(profile?.role ?? ''),
    [profile?.role],
  );

  const recorderName = useMemo(() => {
    const first = (profile as { first_name?: string } | null)?.first_name ?? '';
    const last = (profile as { last_name?: string } | null)?.last_name ?? '';
    const full = `${first} ${last}`.trim();
    return full || profile?.email || 'Unknown';
  }, [profile]);

  const logbookQuery = useQuery({
    queryKey: ['logbook', vesselId, logbookType],
    enabled: !!vesselId && !!logbookType,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logbooks')
        .select('*')
        .eq('vessel_id', vesselId!)
        .eq('logbook_type', logbookType as never)
        .maybeSingle();
      if (error) throw error;
      return (data as LogbookRecord | null) ?? null;
    },
  });

  const logbook = logbookQuery.data ?? null;

  const { start, end } = monthBounds(month);

  const entriesQuery = useQuery({
    queryKey: ['logbook-entries', logbook?.id, start],
    enabled: !!logbook?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logbook_entries')
        .select('*')
        .eq('logbook_id', logbook!.id)
        .gte('entry_at', start)
        .lt('entry_at', end)
        .order('entry_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LogbookEntry[];
    },
  });

  const ensureLogbook = async (): Promise<LogbookRecord> => {
    if (logbook) return logbook;
    if (!companyId || !vesselId || !definition) {
      throw new Error('Select a vessel before adding entries.');
    }
    const { data, error } = await supabase
      .from('logbooks')
      .insert({
        company_id: companyId,
        vessel_id: vesselId,
        logbook_type: definition.type as never,
        name: definition.label,
        description: definition.description,
        is_statutory: definition.statutory,
      })
      .select('*')
      .single();
    if (error) {
      throw new Error(
        'This logbook has not been opened for the vessel yet, and your role cannot open it. Ask the Captain or DPA to add the first entry.',
      );
    }
    await queryClient.invalidateQueries({ queryKey: ['logbook', vesselId, logbookType] });
    return data as LogbookRecord;
  };

  const invalidateEntries = () =>
    queryClient.invalidateQueries({ queryKey: ['logbook-entries'] });

  const createEntry = useMutation({
    mutationFn: async (input: LogbookEntryInput) => {
      const book = await ensureLogbook();
      const { data, error } = await supabase
        .from('logbook_entries')
        .insert({
          logbook_id: book.id,
          company_id: book.company_id,
          vessel_id: book.vessel_id,
          entry_at: input.entry_at,
          entry_date: input.entry_at.slice(0, 10),
          watch_period: input.watch_period,
          summary: input.summary,
          remarks: input.remarks,
          position_text: input.position_text,
          latitude: input.latitude,
          longitude: input.longitude,
          data: input.data as never,
          status: 'draft',
          recorded_by: user?.id ?? null,
          recorded_by_name: recorderName,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateEntries();
      toast({ title: 'Entry saved', description: 'The logbook entry has been recorded as a draft.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save entry', description: error.message, variant: 'destructive' });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: LogbookEntryInput }) => {
      const { error } = await supabase
        .from('logbook_entries')
        .update({
          entry_at: input.entry_at,
          entry_date: input.entry_at.slice(0, 10),
          watch_period: input.watch_period,
          summary: input.summary,
          remarks: input.remarks,
          position_text: input.position_text,
          latitude: input.latitude,
          longitude: input.longitude,
          data: input.data as never,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateEntries();
      toast({ title: 'Entry updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update entry', description: error.message, variant: 'destructive' });
    },
  });

  const signEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('logbook_entries')
        .update({
          status: 'signed',
          signed_by: user?.id ?? null,
          signed_by_name: recorderName,
          signed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateEntries();
      toast({ title: 'Entry signed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not sign entry', description: error.message, variant: 'destructive' });
    },
  });

  /** Finalising locks the entry; it is only permitted once the entry is signed off. */
  const finalizeEntry = useMutation({
    mutationFn: async (entry: LogbookEntry) => {
      if (entry.status !== 'signed' || !entry.signed_by || !entry.signed_at) {
        throw new Error('This entry must be signed off before it can be finalised.');
      }
      const { error } = await supabase
        .from('logbook_entries')
        .update({
          status: 'finalized',
          finalized_by: user?.id ?? null,
          finalized_by_name: recorderName,
          finalized_at: new Date().toISOString(),
        } as never)
        .eq('id', entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateEntries();
      toast({ title: 'Entry finalised', description: 'The entry is now locked against further changes.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not finalise entry', description: error.message, variant: 'destructive' });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('logbook_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateEntries();
      toast({ title: 'Entry deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete entry', description: error.message, variant: 'destructive' });
    },
  });

  return {
    logbook,
    entries: entriesQuery.data ?? [],
    isLoading: logbookQuery.isLoading || entriesQuery.isLoading,
    canSign,
    currentUserId: user?.id ?? null,
    hasVessel: !!vesselId,
    createEntry,
    updateEntry,
    signEntry,
    finalizeEntry,
    deleteEntry,
  };
};
