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
  comment_count?: number;
  submitter_name?: string;
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

export interface BrowseFilters {
  search: string;
  status: string;
  category: string;
  region: string;
  tags: string[];
  sortBy: 'newest' | 'most_voted' | 'enthusiasm' | 'destination';
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

  // Browse suggestions with filters
  const useBrowseSuggestions = (filters: BrowseFilters) => {
    return useQuery({
      queryKey: ['trip-suggestions', 'browse', profile?.company_id, filters],
      queryFn: async () => {
        if (!profile?.company_id || !user) return [];

        // Fetch suggestions with destinations join
        let query = supabase
          .from('trip_suggestions')
          .select('*, destinations(*)')
          .eq('company_id', profile.company_id)
          .is('deleted_at', null);

        // Apply filters
        if (filters.status && filters.status !== 'all') {
          query = query.eq('status', filters.status as any);
        }
        if (filters.category && filters.category !== 'all') {
          query = query.eq('trip_category', filters.category as any);
        }
        if (filters.search) {
          query = query.or(`description.ilike.%${filters.search}%,title.ilike.%${filters.search}%`);
        }
        if (filters.tags.length > 0) {
          query = query.overlaps('tags', filters.tags);
        }

        // Sort
        switch (filters.sortBy) {
          case 'enthusiasm':
            query = query.order('enthusiasm_rating', { ascending: false });
            break;
          case 'destination':
            query = query.order('created_at', { ascending: false });
            break;
          case 'newest':
          default:
            query = query.order('created_at', { ascending: false });
            break;
        }

        const { data: suggestions, error } = await query;
        if (error) throw error;

        // Fetch vote counts for all suggestions
        const suggestionIds = (suggestions || []).map(s => s.id);
        if (suggestionIds.length === 0) return [];

        const { data: votes } = await supabase
          .from('trip_suggestion_votes')
          .select('suggestion_id')
          .in('suggestion_id', suggestionIds);

        // Fetch user's own votes
        const { data: userVotes } = await supabase
          .from('trip_suggestion_votes')
          .select('suggestion_id')
          .eq('user_id', user.id)
          .in('suggestion_id', suggestionIds);

        // Fetch comment counts
        const { data: comments } = await supabase
          .from('trip_suggestion_comments')
          .select('suggestion_id')
          .is('deleted_at', null)
          .in('suggestion_id', suggestionIds);

        // Fetch submitter names
        const submitterIds = [...new Set((suggestions || []).map(s => s.submitted_by))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', submitterIds);

        const profileMap = new Map((profiles || []).map(p => [p.user_id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));

        // Build vote count map
        const voteCountMap = new Map<string, number>();
        (votes || []).forEach(v => {
          voteCountMap.set(v.suggestion_id, (voteCountMap.get(v.suggestion_id) || 0) + 1);
        });

        const userVoteSet = new Set((userVotes || []).map(v => v.suggestion_id));

        // Build comment count map
        const commentCountMap = new Map<string, number>();
        (comments || []).forEach(c => {
          commentCountMap.set(c.suggestion_id, (commentCountMap.get(c.suggestion_id) || 0) + 1);
        });

        const enriched = (suggestions || []).map(s => ({
          ...s,
          vote_count: voteCountMap.get(s.id) || 0,
          user_voted: userVoteSet.has(s.id),
          comment_count: commentCountMap.get(s.id) || 0,
          submitter_name: profileMap.get(s.submitted_by) || 'Unknown',
        })) as TripSuggestion[];

        // Filter by region (post-query since it's on joined table)
        let filtered = enriched;
        if (filters.region && filters.region !== 'all') {
          filtered = filtered.filter(s => s.destinations?.region === filters.region);
        }

        // Sort by votes if needed (post-query)
        if (filters.sortBy === 'most_voted') {
          filtered.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
        }

        return filtered;
      },
      enabled: !!profile?.company_id && !!user,
    });
  };

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

  // Vote / Unvote
  const toggleVote = useMutation({
    mutationFn: async ({ suggestionId, hasVoted }: { suggestionId: string; hasVoted: boolean }) => {
      if (!user) throw new Error('Not authenticated');

      if (hasVoted) {
        const { error } = await supabase
          .from('trip_suggestion_votes')
          .delete()
          .eq('suggestion_id', suggestionId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trip_suggestion_votes')
          .insert({ suggestion_id: suggestionId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-suggestions', 'browse'] });
    },
    onError: (error) => {
      toast({ title: 'Vote failed', description: error.message, variant: 'destructive' });
    },
  });

  // Add comment
  const addComment = useMutation({
    mutationFn: async ({ suggestionId, body }: { suggestionId: string; body: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('trip_suggestion_comments')
        .insert({
          suggestion_id: suggestionId,
          author_id: user.id,
          body,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-suggestions', 'browse'] });
      queryClient.invalidateQueries({ queryKey: ['trip-suggestion-comments'] });
    },
    onError: (error) => {
      toast({ title: 'Comment failed', description: error.message, variant: 'destructive' });
    },
  });

  // Fetch comments for a suggestion
  const useComments = (suggestionId: string | null) => {
    return useQuery({
      queryKey: ['trip-suggestion-comments', suggestionId],
      queryFn: async () => {
        if (!suggestionId) return [];
        const { data, error } = await supabase
          .from('trip_suggestion_comments')
          .select('*')
          .eq('suggestion_id', suggestionId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });
        if (error) throw error;

        // Fetch author names
        const authorIds = [...new Set((data || []).map(c => c.author_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', authorIds);

        const profileMap = new Map((profiles || []).map(p => [p.user_id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));

        return (data || []).map(c => ({
          ...c,
          author_name: profileMap.get(c.author_id) || 'Unknown',
        }));
      },
      enabled: !!suggestionId,
    });
  };

  return {
    useDestinationSearch,
    useBrowseSuggestions,
    useComments,
    destinations: destinationsQuery.data || [],
    destinationsLoading: destinationsQuery.isLoading,
    submitSuggestion,
    toggleVote,
    addComment,
  };
};
