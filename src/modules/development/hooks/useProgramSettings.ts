/**
 * The company's training programme settings (gap/02 TR10; D-X5-06,
 * D-X5-19). The live columns and the columns 040600 adds are read in two
 * selects, so a database without 040600 still serves the live policy
 * (D-X5-20). Before the company has a row, the row's own column defaults
 * apply (lib/settingsSchema.ts), never other numbers.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { DEFAULT_SETTINGS, type ProgramSettings } from '@/modules/development/services/rulesEngine';
import type { DevCategory } from '@/modules/development/constants';
import {
  PROGRAM_POLICY_EXTRA_DEFAULTS,
  parseCategoryLabels,
  parseFinalApprovalMode,
  parseFxOverrides,
  type ProgramPolicyExtras,
} from '@/modules/development/lib/settingsSchema';
import { developmentDb } from './developmentDb';
import { developmentKeys } from './keys';

const LIVE_COLUMNS =
  'accommodation_cap_per_night_usd, food_per_diem_usd, professional_split_threshold_usd, clawback_months, eligibility_service_days, probation_default_days, online_neutral_threshold_hours, anniversary_window_days, business_class_flights_allowed';

export function useProgramSettings() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: developmentKeys.settings(companyId),
    queryFn: async (): Promise<ProgramSettings> => {
      if (!companyId) return DEFAULT_SETTINGS;
      const { data, error } = await supabase.from('program_settings').select(LIVE_COLUMNS).eq('company_id', companyId).maybeSingle();
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
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

/** The 040600 policy columns, with `notSetUp` while they are missing (then the defaults apply). */
export interface PolicyExtrasState extends ProgramPolicyExtras {
  notSetUp: boolean;
}

export function usePolicyExtras() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: developmentKeys.policyExtras(companyId),
    queryFn: async (): Promise<PolicyExtrasState> => {
      if (!companyId) return { ...PROGRAM_POLICY_EXTRA_DEFAULTS, notSetUp: false };
      const { data, error } = await developmentDb
        .from('program_settings')
        .select('final_approval_mode, mileage_rate_per_mile, mileage_rate_per_km, fx_overrides, category_labels')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error)) return { ...PROGRAM_POLICY_EXTRA_DEFAULTS, notSetUp: true };
        throw error;
      }
      if (!data) return { ...PROGRAM_POLICY_EXTRA_DEFAULTS, notSetUp: false };
      return {
        final_approval_mode: parseFinalApprovalMode(data.final_approval_mode),
        mileage_rate_per_mile: data.mileage_rate_per_mile == null ? null : Number(data.mileage_rate_per_mile),
        mileage_rate_per_km: data.mileage_rate_per_km == null ? null : Number(data.mileage_rate_per_km),
        fx_overrides: parseFxOverrides(data.fx_overrides),
        category_labels: parseCategoryLabels(data.category_labels),
        notSetUp: false,
      };
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

/** The account's category words (the defaults until the settings load, or when they are not set up). */
export function useCategoryLabels(): Readonly<Record<DevCategory, string>> {
  const { data } = usePolicyExtras();
  return data?.category_labels ?? PROGRAM_POLICY_EXTRA_DEFAULTS.category_labels;
}
