import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GeocodingResult {
  display_name: string;
  name: string;
  country: string;
  country_code: string;
  region: string;
  area: string;
  latitude: number;
  longitude: number;
  type: string;
  osm_id: number;
}

export function useGeocodingSearch(query: string) {
  return useQuery({
    queryKey: ['geocode-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const { data, error } = await supabase.functions.invoke('geocode-search', {
        body: { query },
      });
      if (error) throw error;
      return (data?.results || []) as GeocodingResult[];
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}
