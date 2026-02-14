import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface Destination {
  id: string;
  name: string;
  country: string | null;
  country_code: string | null;
  region: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  is_verified: boolean;
  merged_into_id: string | null;
}

export interface TripSuggestion {
  id: string;
  company_id: string;
  destination_id: string;
  title: string | null;
  description: string;
  tags: string[];
  trip_category: string;
  diving_level: string | null;
  diving_types: string[] | null;
  marine_species: string | null;
  best_months: number[] | null;
  event_dates: any;
  suitable_vessels: string[] | null;
  estimated_duration: string | null;
  nearest_bunker_text: string | null;
  owner_visited: string | null;
  owner_visited_when: string | null;
  enthusiasm_rating: number;
  status: string;
  internal_notes: string | null;
  linked_entry_id: string | null;
  submitted_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined
  destinations?: Destination;
  vote_count?: number;
  user_voted?: boolean;
}

export interface SuggestionFormData {
  destination_id?: string;
  new_destination?: {
    name: string;
    country: string;
    region: string;
    area: string;
    latitude?: number;
    longitude?: number;
  };
  description: string;
  tags: string[];
  trip_category: string;
  diving_level?: string;
  diving_types?: string[];
  marine_species?: string;
  best_months?: number[];
  event_dates?: Array<{ name: string; start_date: string; end_date: string }>;
  suitable_vessels?: string[];
  estimated_duration?: string;
  nearest_bunker_text?: string;
  owner_visited?: string;
  owner_visited_when?: string;
  enthusiasm_rating: number;
}

export const useTripSuggestions = () => {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  // Search destinations for autocomplete
  const useDestinationSearch = (query: string) => {
    return useQuery({
      queryKey: ['destinations', 'search', query],
      queryFn: async () => {
        if (!query || query.length < 2) return [];
        const { data, error } = await supabase
          .from('destinations')
          .select('*')
          .is('merged_into_id', null)
          .ilike('name', `%${query}%`)
          .order('name')
          .limit(10);
        if (error) throw error;
        return (data || []) as Destination[];
      },
      enabled: query.length >= 2,
    });
  };

  // All destinations
  const destinationsQuery = useQuery({
    queryKey: ['destinations', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('destinations')
        .select('*')
        .is('merged_into_id', null)
        .order('name');
      if (error) throw error;
      return (data || []) as Destination[];
    },
    enabled: !!profile?.company_id,
  });

  // Submit a new suggestion
  const submitSuggestion = useMutation({
    mutationFn: async (formData: SuggestionFormData) => {
      if (!user || !profile?.company_id) throw new Error('Not authenticated');

      let destinationId = formData.destination_id;

      // Create new destination if needed
      if (!destinationId && formData.new_destination) {
        const { data: newDest, error: destError } = await supabase
          .from('destinations')
          .insert({
            name: formData.new_destination.name,
            country: formData.new_destination.country,
            region: formData.new_destination.region,
            area: formData.new_destination.area,
            latitude: formData.new_destination.latitude,
            longitude: formData.new_destination.longitude,
            company_id: profile.company_id,
            created_by: user.id,
            is_verified: false,
          })
          .select('id')
          .single();
        if (destError) throw destError;
        destinationId = newDest.id;
      }

      if (!destinationId) throw new Error('Destination is required');

      const { data, error } = await supabase
        .from('trip_suggestions')
        .insert({
          company_id: profile.company_id,
          destination_id: destinationId,
          description: formData.description,
          tags: formData.tags,
          trip_category: formData.trip_category as any,
          diving_level: (formData.diving_level || null) as any,
          diving_types: formData.diving_types || null,
          marine_species: formData.marine_species || null,
          best_months: formData.best_months || null,
          event_dates: formData.event_dates || null,
          suitable_vessels: formData.suitable_vessels || null,
          estimated_duration: formData.estimated_duration || null,
          nearest_bunker_text: formData.nearest_bunker_text || null,
          owner_visited: (formData.owner_visited || null) as any,
          owner_visited_when: formData.owner_visited_when || null,
          enthusiasm_rating: formData.enthusiasm_rating,
          submitted_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['destinations'] });
      toast({ title: 'Suggestion submitted!', description: 'View it in Browse Suggestions.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return {
    useDestinationSearch,
    destinations: destinationsQuery.data || [],
    destinationsLoading: destinationsQuery.isLoading,
    submitSuggestion,
  };
};
