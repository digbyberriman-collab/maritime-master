import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CrewOption {
  id: string;
  label: string;
  first_name: string;
  last_name: string;
  rank: string | null;
}

export interface VesselOption {
  id: string;
  label: string;
  status: string | null;
}

export interface QuarantineHouseOption {
  id: string;
  label: string;
  city: string | null;
  country: string;
}

export function formatCrewName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const normalizedFirst = firstName?.trim() || '';
  const normalizedLast = lastName?.trim() || '';
  if (!normalizedFirst && !normalizedLast) return 'Unknown';
  return [normalizedLast, normalizedFirst].filter(Boolean).join(', ');
}

export function useCrewOptions() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['reference-crew-options', profile?.company_id],
    queryFn: async (): Promise<CrewOption[]> => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, rank, status')
        .eq('company_id', profile.company_id)
        .or('status.is.null,status.neq.Inactive')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });

      if (error) throw error;

      return (data || []).map((crew) => ({
        id: crew.user_id,
        label: formatCrewName(crew.first_name, crew.last_name),
        first_name: crew.first_name,
        last_name: crew.last_name,
        rank: crew.rank,
      }));
    },
    enabled: !!profile?.company_id,
  });
}

export function useVesselOptions() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['reference-vessel-options', profile?.company_id],
    queryFn: async (): Promise<VesselOption[]> => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('vessels')
        .select('id, name, status')
        .eq('company_id', profile.company_id)
        .or('status.is.null,status.neq.Sold')
        .order('name', { ascending: true });

      if (error) throw error;

      return (data || []).map((vessel) => ({
        id: vessel.id,
        label: vessel.name,
        status: vessel.status,
      }));
    },
    enabled: !!profile?.company_id,
  });
}

export function useQuarantineHouseOptions() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['reference-quarantine-house-options', profile?.company_id],
    queryFn: async (): Promise<QuarantineHouseOption[]> => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('quarantine_houses')
        .select('id, name, city, country')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      return (data || []).map((house) => ({
        id: house.id,
        label: house.name,
        city: house.city,
        country: house.country,
      }));
    },
    enabled: !!profile?.company_id,
  });
}
