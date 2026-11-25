/**
 * May the signed-in person add, change and remove vessels? (DECISIONS D-124,
 * D-224; D-01, D-04.)
 *
 * The P3 vessel policies (file 8) allow writes only when
 * `has_capability('fleet.operations.vessels.admin', company_id)` is true, so
 * the controls ask the database that exact question through the pending
 * shim rather than the `useCan` adaptor, whose interim answer can disagree
 * with the live database until the access files are applied.
 *
 * - `true`: allowed.
 * - `false`: denied.
 * - The function is not in the database yet (`isMissingRelation`: PGRST202,
 *   42883, …): files 4 and 8 are unapplied and the legacy "Users can manage
 *   vessels in their company" ALL policy still governs, so a signed-in
 *   member of that company keeps today's rule (D-01).
 * - Loading, or any other error: denied (D-04). The controls stay hidden;
 *   the route itself stays on fleet reach (D-33, D-49).
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { authDb } from '@/modules/auth/services/accessDb';

export const VESSELS_ADMIN_CAPABILITY = 'fleet.operations.vessels.admin';

/** What the database answered: the capability, or "the RPC is not live yet". */
export type VesselAdminAnswer = 'granted' | 'denied' | 'rpc-missing';

export const vesselAdminGateKeys = {
  all: ['capability', VESSELS_ADMIN_CAPABILITY] as const,
  gate: (userId: string, companyId: string, vesselId: string | null) =>
    ['capability', VESSELS_ADMIN_CAPABILITY, userId, companyId, vesselId] as const,
};

export interface VesselAdminGateInput {
  companyId: string | null | undefined;
  /** For a control on one vessel; omitted for the fleet list. */
  vesselId?: string | null;
}

export interface VesselAdminGate {
  allowed: boolean;
  loading: boolean;
}

/** Asks `has_capability`; a missing function resolves as `rpc-missing`, any other error throws. */
export async function fetchVesselAdminAnswer(companyId: string, vesselId: string | null): Promise<VesselAdminAnswer> {
  const { data, error } = await authDb.rpc(
    'has_capability',
    vesselId
      ? { p_key: VESSELS_ADMIN_CAPABILITY, p_company_id: companyId, p_vessel_id: vesselId }
      : { p_key: VESSELS_ADMIN_CAPABILITY, p_company_id: companyId },
  );
  if (error) {
    if (isMissingRelation(error)) return 'rpc-missing';
    throw error;
  }
  return data === true ? 'granted' : 'denied';
}

export function useVesselAdminGate({ companyId, vesselId }: VesselAdminGateInput): VesselAdminGate {
  const { user, profile, loading: authLoading, profileResolved } = useAuth();
  const userId = user?.id ?? null;
  const vessel = vesselId ?? null;
  const enabled = Boolean(userId && companyId);

  const query = useQuery({
    queryKey: vesselAdminGateKeys.gate(userId ?? '', companyId ?? '', vessel),
    queryFn: () => fetchVesselAdminAnswer(companyId ?? '', vessel),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });

  if (!enabled) {
    // Still loading only while the session or the profile is unknown.
    return { allowed: false, loading: Boolean(authLoading) || (Boolean(userId) && profileResolved === false) };
  }
  if (query.isPending) return { allowed: false, loading: true };
  if (query.isError) return { allowed: false, loading: false };

  const answer = query.data;
  if (answer === 'granted') return { allowed: true, loading: false };
  // D-01: the legacy ALL policy (user_belongs_to_company) still governs.
  if (answer === 'rpc-missing') return { allowed: Boolean(profile?.company_id) && profile?.company_id === companyId, loading: false };
  return { allowed: false, loading: false };
}
