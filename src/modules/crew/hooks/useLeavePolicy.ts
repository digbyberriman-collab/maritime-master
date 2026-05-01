import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import {
  DEFAULT_LEAVE_POLICY,
  type LeavePolicy,
  type AccrualMethod,
  type RoundingMethod,
} from '@/modules/crew/services/leaveCalculator';

interface RawPolicyRow {
  id: string;
  company_id: string;
  vessel_id: string | null;
  scope_label: string;
  default_annual_entitlement: number;
  accrual_method: AccrualMethod;
  monthly_accrual_days: number;
  pro_rata: boolean;
  rounding: RoundingMethod;
  booked_deducts: boolean;
  sick_affects_balance: boolean;
  training_affects_balance: boolean;
  unpaid_affects_balance: boolean;
  default_rotation: string | null;
  notes: string | null;
}

const rowToPolicy = (row: RawPolicyRow): LeavePolicy => ({
  defaultAnnualEntitlement: Number(row.default_annual_entitlement) || DEFAULT_LEAVE_POLICY.defaultAnnualEntitlement,
  accrualMethod: row.accrual_method,
  monthlyAccrualDays: Number(row.monthly_accrual_days) || DEFAULT_LEAVE_POLICY.monthlyAccrualDays,
  proRata: row.pro_rata,
  rounding: row.rounding,
  bookedDeducts: row.booked_deducts,
  sickAffectsBalance: row.sick_affects_balance,
  trainingAffectsBalance: row.training_affects_balance,
  unpaidAffectsBalance: row.unpaid_affects_balance,
  defaultRotation: row.default_rotation,
});

/**
 * Resolves the active leave policy for a vessel within the user's company.
 * Lookup order: vessel-specific row → company-wide row → DEFAULT_LEAVE_POLICY.
 */
export const useLeavePolicy = (vesselId?: string | null) => {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['leave-policy', companyId, vesselId ?? null],
    enabled: !!companyId,
    queryFn: async (): Promise<{ policy: LeavePolicy; row: RawPolicyRow | null }> => {
      if (!companyId) return { policy: DEFAULT_LEAVE_POLICY, row: null };

      const { data: rows } = await (supabase as any)
        .from('crew_leave_policies')
        .select('*')
        .eq('company_id', companyId);

      const list = (rows ?? []) as RawPolicyRow[];
      const vesselRow = vesselId ? list.find((r) => r.vessel_id === vesselId) : null;
      const companyRow = list.find((r) => r.vessel_id === null);
      const row = vesselRow ?? companyRow ?? null;

      return { policy: row ? rowToPolicy(row) : DEFAULT_LEAVE_POLICY, row };
    },
  });
};
