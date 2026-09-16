import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface PlannerAccess {
  canView: boolean;
  canEdit: boolean;
  roles: string[];
  isLoading: boolean;
}

/**
 * Single source of truth for planner permissions: asks the database for the
 * same checks the RLS policies use, so hidden controls and blocked writes can
 * never disagree. Editors are superadmin / dpa / fleet_master / captain / hod /
 * purser, or anyone granted edit on the crew module. Everyone else is read-only.
 */
export function usePlannerPermissions(): PlannerAccess {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ['frp', 'access', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('frp_planner_access');
      if (error) throw error;
      return data as { can_view: boolean; can_edit: boolean; roles: string[] };
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  return {
    // Fail closed on edit, fail open on view (page-level access is already routed).
    canView: q.data?.can_view ?? true,
    canEdit: q.data?.can_edit ?? false,
    roles: q.data?.roles ?? [],
    isLoading: q.isLoading,
  };
}
