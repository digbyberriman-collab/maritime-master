import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';

export type HealthSettings = Tables<'hw_settings'>;

export const HEALTH_SETTINGS_KEY = ['health', 'settings'] as const;

/** Defaults that match the database, used until the row is created. */
export const HEALTH_SETTINGS_DEFAULTS = {
  units: 'metric',
  allow_self_logging: true,
  allow_crew_view_own_records: true,
  controlled_drugs_require_witness: true,
  stock_expiry_warning_days: 90,
  equipment_check_warning_days: 30,
  fitness_expiry_warning_days: 90,
  vaccination_warning_days: 60,
  spa_booking_lead_hours: 2,
  spa_opening_time: '08:00',
  spa_closing_time: '20:00',
  default_currency: 'EUR',
} as const;

/**
 * Per-company health settings. The row is created on first read by the
 * `hw_settings_for` function so a new company never sees an empty page.
 */
export function useHealthSettings() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...HEALTH_SETTINGS_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HealthSettings | null> => {
      const { data, error } = await supabase.rpc('hw_settings_for', {
        p_company_id: companyId as string,
      });
      if (error) throw error;
      return (data as HealthSettings | null) ?? null;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (values: TablesUpdate<'hw_settings'>) => {
      if (!companyId) throw new Error('No company on your profile');
      const { error } = await supabase
        .from('hw_settings')
        .update({ ...values, updated_by: user?.id ?? null })
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HEALTH_SETTINGS_KEY });
      toast({ title: 'Settings saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save settings', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    settings: query.data ?? null,
    updateSettings,
    isMutating: updateSettings.isPending,
  };
}
