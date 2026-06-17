import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VesselLite { id: string; name: string }
export interface CrewLite { user_id: string; first_name: string | null; last_name: string | null; rank: string | null; department: string | null }

export function useVesselsLite() {
  return useQuery({
    queryKey: ['frp', 'vessels'],
    queryFn: async (): Promise<VesselLite[]> => {
      const { data, error } = await supabase.from('vessels').select('id,name').neq('status', 'Sold').order('name');
      if (error) throw error;
      return (data ?? []) as VesselLite[];
    },
  });
}

export function useCrewLite() {
  return useQuery({
    queryKey: ['frp', 'crew'],
    queryFn: async (): Promise<CrewLite[]> => {
      const { data, error } = await supabase.from('profiles').select('user_id,first_name,last_name,rank,department').order('last_name');
      if (error) throw error;
      return (data ?? []) as CrewLite[];
    },
  });
}