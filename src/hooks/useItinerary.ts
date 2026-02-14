import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ItineraryEntry, TripType, CreateEntryInput } from '@/types/itinerary';

const itineraryKeys = {
  all: ['itinerary'] as const,
  entries: (companyId: string) => [...itineraryKeys.all, 'entries', companyId] as const,
  tripTypes: (companyId: string) => [...itineraryKeys.all, 'tripTypes', companyId] as const,
  vessels: (companyId: string) => [...itineraryKeys.all, 'vessels', companyId] as const,
};

export function useTripTypes() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: itineraryKeys.tripTypes(companyId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_types')
        .select('*')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return data as TripType[];
    },
    enabled: !!companyId,
  });
}

export function useItineraryVessels() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['vessels', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vessels')
        .select('id, name')
        .eq('company_id', companyId!)
        .neq('status', 'Sold')
        .order('name');
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: !!companyId,
  });
}

/** Derive effective status: entries whose end_date is in the past become completed & locked */
function applyAutoCompletion(entries: ItineraryEntry[]): ItineraryEntry[] {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return entries.map(entry => {
    if (
      entry.end_date < today &&
      entry.status !== 'completed' &&
      entry.status !== 'cancelled'
    ) {
      return { ...entry, status: 'completed' as const, is_locked: true };
    }
    if (entry.status === 'completed') {
      return { ...entry, is_locked: true };
    }
    return entry;
  });
}

export function useItineraryEntries() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: itineraryKeys.entries(companyId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('itinerary_entries')
        .select(`
          *,
          trip_type:trip_types(*),
          vessels:itinerary_entry_vessels(
            id,
            entry_id,
            vessel_id,
            detached_from_group,
            vessel:vessels(id, name)
          )
        `)
        .eq('company_id', companyId!)
        .order('start_date');
      if (error) throw error;
      return applyAutoCompletion(data as unknown as ItineraryEntry[]);
    },
    enabled: !!companyId,
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      // Create entry
      const { data: entry, error: entryError } = await supabase
        .from('itinerary_entries')
        .insert({
          company_id: companyId!,
          title: input.title,
          trip_type_id: input.trip_type_id,
          location: input.location || null,
          country: input.country || null,
          start_date: input.start_date,
          end_date: input.end_date,
          status: input.status,
          notes: input.notes || null,
          created_by: user!.id,
          group_id: input.vessel_ids.length > 1 ? crypto.randomUUID() : null,
        })
        .select()
        .single();
      if (entryError) throw entryError;

      // Link vessels
      if (input.vessel_ids.length > 0) {
        const vesselInserts = input.vessel_ids.map(vid => ({
          entry_id: entry.id,
          vessel_id: vid,
        }));
        const { error: vesselError } = await supabase
          .from('itinerary_entry_vessels')
          .insert(vesselInserts);
        if (vesselError) throw vesselError;
      }

      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itineraryKeys.entries(companyId || '') });
    },
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ItineraryEntry>) => {
      const { data, error } = await supabase
        .from('itinerary_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itineraryKeys.entries(companyId || '') });
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('itinerary_entries')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itineraryKeys.entries(companyId || '') });
    },
  });
}
