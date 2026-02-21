import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from 'sonner';

interface CreateApplicationInput {
  course_id?: string;
  course_name: string;
  category: string;
  course_description?: string;
  course_provider?: string;
  course_url?: string;
  course_location?: string;
  course_start_date?: string;
  course_end_date?: string;
  course_duration_days?: number;
  estimated_tuition_usd?: number;
  estimated_travel_usd?: number;
  estimated_travel_route?: string;
  estimated_accommodation_usd?: number;
  estimated_accommodation_nights?: number;
  estimated_accommodation_nightly_rate?: number;
  estimated_food_per_diem_usd?: number;
  estimated_total_usd?: number;
  is_custom_course?: boolean;
  leave_days_accrued?: number;
  neutral_days_accrued?: number;
}

export function useCreateApplication() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApplicationInput) => {
      if (!user?.id || !profile?.company_id) throw new Error('Not authenticated');

      // Get current vessel assignment
      const { data: assignment } = await supabase
        .from('crew_assignments')
        .select('vessel_id')
        .eq('user_id', user.id)
        .eq('is_current', true)
        .single();

      if (!assignment) throw new Error('No active vessel assignment found');

      const { data, error } = await supabase
        .from('development_applications')
        .insert({
          crew_member_id: user.id,
          company_id: profile.company_id,
          vessel_id: assignment.vessel_id,
          status: 'draft',
          ...input,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-development-applications'] });
      queryClient.invalidateQueries({ queryKey: ['my-development-stats'] });
      toast.success('Application created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSubmitApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await supabase
        .from('development_applications')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-development-applications'] });
      queryClient.invalidateQueries({ queryKey: ['my-development-stats'] });
      toast.success('Application submitted for review');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

interface ReviewInput {
  applicationId: string;
  stage: 'hod' | 'peer' | 'captain';
  decision: 'approved' | 'returned';
  comments?: string;
  isDiscretionary?: boolean;
  discretionaryJustification?: string;
}

export function useReviewApplication() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReviewInput) => {
      if (!user?.id) throw new Error('Not authenticated');

      const nextStatusMap: Record<string, Record<string, string>> = {
        hod: { approved: 'peer_review', returned: 'returned' },
        peer: { approved: 'captain_review', returned: 'returned' },
        captain: { approved: 'approved', returned: 'returned' },
      };

      const updateFields: Record<string, unknown> = {
        status: nextStatusMap[input.stage][input.decision],
        [`${input.stage}_reviewer_id`]: user.id,
        [`${input.stage}_reviewed_at`]: new Date().toISOString(),
        [`${input.stage}_decision`]: input.decision,
        [`${input.stage}_comments`]: input.comments || null,
      };

      if (input.isDiscretionary && input.stage === 'captain') {
        updateFields.is_discretionary = true;
        updateFields.discretionary_justification = input.discretionaryJustification;
        updateFields.status = 'discretionary_approved';
      }

      const { error } = await supabase
        .from('development_applications')
        .update(updateFields)
        .eq('id', input.applicationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-development-applications'] });
      queryClient.invalidateQueries({ queryKey: ['development-applications-review'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-development-applications'] });
      toast.success('Review submitted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

interface SubmitExpenseInput {
  application_id: string;
  actual_tuition_usd?: number;
  actual_travel_usd?: number;
  actual_accommodation_usd?: number;
  actual_accommodation_nights?: number;
  actual_accommodation_nightly_rate?: number;
  actual_food_per_diem_usd?: number;
  actual_total_usd?: number;
  is_split_payment?: boolean;
}

export function useSubmitExpense() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitExpenseInput) => {
      if (!user?.id || !profile?.company_id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('development_expenses')
        .insert({
          ...input,
          crew_member_id: user.id,
          company_id: profile.company_id,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-development-applications'] });
      queryClient.invalidateQueries({ queryKey: ['my-development-stats'] });
      toast.success('Expense claim submitted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// Hooks for admin/reviewers
export function useApplicationsForReview() {
  const { user, profile } = useAuth();

  return {
    queryKey: ['development-applications-review', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('development_applications')
        .select(`
          *,
          crew_member:profiles!development_applications_crew_member_id_fkey(first_name, last_name, email)
        `)
        .eq('company_id', profile.company_id)
        .in('status', ['submitted', 'hod_review', 'peer_review', 'captain_review'])
        .order('submitted_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  };
}

export function useFleetApplications() {
  const { profile } = useAuth();

  return {
    queryKey: ['fleet-development-applications', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('development_applications')
        .select(`
          *,
          crew_member:profiles!development_applications_crew_member_id_fkey(first_name, last_name, email),
          vessel:vessels!development_applications_vessel_id_fkey(name)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  };
}

export function useFleetExpenses() {
  const { profile } = useAuth();

  return {
    queryKey: ['fleet-development-expenses', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('development_expenses')
        .select(`
          *,
          crew_member:profiles!development_expenses_crew_member_id_fkey(first_name, last_name),
          application:development_applications!development_expenses_application_id_fkey(course_name, category)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  };
}
