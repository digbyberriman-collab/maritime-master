import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { DEFAULT_SETTINGS, type ProgramSettings } from '@/modules/development/services/rulesEngine';

export function useProgramSettings() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['development-program-settings', companyId],
    queryFn: async (): Promise<ProgramSettings> => {
      if (!companyId) return DEFAULT_SETTINGS;
      const { data, error } = await supabase
        .from('program_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS;
      return {
        accommodation_cap_per_night_usd: Number(data.accommodation_cap_per_night_usd ?? DEFAULT_SETTINGS.accommodation_cap_per_night_usd),
        food_per_diem_usd: Number(data.food_per_diem_usd ?? DEFAULT_SETTINGS.food_per_diem_usd),
        professional_split_threshold_usd: Number(data.professional_split_threshold_usd ?? DEFAULT_SETTINGS.professional_split_threshold_usd),
        clawback_months: Number(data.clawback_months ?? DEFAULT_SETTINGS.clawback_months),
        eligibility_service_days: Number(data.eligibility_service_days ?? DEFAULT_SETTINGS.eligibility_service_days),
        probation_default_days: Number(data.probation_default_days ?? DEFAULT_SETTINGS.probation_default_days),
        online_neutral_threshold_hours: Number(data.online_neutral_threshold_hours ?? DEFAULT_SETTINGS.online_neutral_threshold_hours),
        anniversary_window_days: Number(data.anniversary_window_days ?? DEFAULT_SETTINGS.anniversary_window_days),
        business_class_flights_allowed: Boolean(data.business_class_flights_allowed ?? DEFAULT_SETTINGS.business_class_flights_allowed),
      };
    },
    staleTime: 5 * 60_000,
  });
}