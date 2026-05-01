// Resolve the effective leave policy for a crew member, considering:
//   1. crew-specific policy
//   2. vessel-specific policy
//   3. company default policy
//   4. global default policy (is_default true, all scopes NULL)
//   5. hard-coded fallback constant

import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_LEAVE_POLICY, LeavePolicy } from '../lib/leaveCalculator';

const sb = supabase as any;

export interface LeavePolicyRow extends LeavePolicy {
  id: string;
  name: string;
  is_default: boolean;
  company_id: string | null;
  vessel_id: string | null;
  crew_id: string | null;
}

function rowToPolicy(row: any): LeavePolicy {
  return {
    annual_entitlement_days: Number(row.annual_entitlement_days),
    accrual_method: row.accrual_method,
    rounding_step: Number(row.rounding_step),
    booked_deducts_available: !!row.booked_deducts_available,
    sick_affects_balance: !!row.sick_affects_balance,
    training_affects_balance: !!row.training_affects_balance,
    unpaid_affects_balance: !!row.unpaid_affects_balance,
    prorate_partial_months: !!row.prorate_partial_months,
  };
}

export async function resolveLeavePolicy(opts: {
  crewId: string;
  vesselId: string | null;
  companyId: string | null;
}): Promise<LeavePolicy> {
  const { crewId, vesselId, companyId } = opts;

  // 1. crew-specific
  if (crewId) {
    const { data } = await sb
      .from('leave_policies')
      .select('*')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return rowToPolicy(data);
  }

  // 2. vessel-specific
  if (vesselId) {
    const { data } = await sb
      .from('leave_policies')
      .select('*')
      .eq('vessel_id', vesselId)
      .is('crew_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return rowToPolicy(data);
  }

  // 3. company default
  if (companyId) {
    const { data } = await sb
      .from('leave_policies')
      .select('*')
      .eq('company_id', companyId)
      .is('vessel_id', null)
      .is('crew_id', null)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return rowToPolicy(data);
  }

  // 4. global default
  const { data: defaults } = await sb
    .from('leave_policies')
    .select('*')
    .is('company_id', null)
    .is('vessel_id', null)
    .is('crew_id', null)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  if (defaults) return rowToPolicy(defaults);

  return DEFAULT_LEAVE_POLICY;
}
