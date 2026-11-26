/**
 * Expense claims against an approved training application (gap/02 W3
 * Reimbursed; development_expenses, its own entity with its own status
 * vocabulary). Unchanged behaviour, moved out of useDevelopmentMutations so
 * that file holds only application writes (X5-07A).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { notify } from '@/shared/lib/notify';
import { developmentKeys, invalidateApplicationQueries } from './keys';

interface SubmitExpenseInput {
  application_id: string;
  actual_tuition_usd?: number;
  actual_travel_usd?: number;
  actual_accommodation_usd?: number;
  actual_accommodation_nights?: number;
  actual_accommodation_nightly_rate?: number;
  actual_food_per_diem_usd?: number;
  actual_food_days?: number;
  is_split_payment?: boolean;
}

export function useSubmitExpense() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitExpenseInput) => {
      if (!user?.id || !profile?.company_id) throw new Error('Not authenticated');
      const { actual_total_usd: _ignoredTotal, ...expenseInput } = input as SubmitExpenseInput & { actual_total_usd?: never };
      const { data, error } = await supabase
        .from('development_expenses')
        .insert({
          ...expenseInput,
          crew_member_id: user.id,
          company_id: profile.company_id,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error('The expense claim was not saved. Try again.');
      return data;
    },
    onSuccess: () => {
      void invalidateApplicationQueries(queryClient);
      notify.success('Expense claim submitted');
    },
    onError: (err: unknown) => notify.error(err, { title: 'The expense claim was not submitted' }),
  });
}

export function useFleetExpenses() {
  const { profile } = useAuth();
  return {
    queryKey: developmentKeys.fleetExpenses(profile?.company_id),
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
