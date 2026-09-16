import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface CrewEditAccess {
  canView: boolean;
  canEdit: boolean;
  roles: string[];
  isLoading: boolean;
}

/**
 * Single source of truth for who may change rotations, leave and travel records.
 * Asks the database for the same checks the RLS policies use, so hidden controls
 * and blocked writes can never disagree.
 *
 * Editors: superadmin, dpa, fleet_master, captain, hod, purser — plus anyone
 * granted edit/admin on the crew module. Captains and HoDs edit; plain crew,
 * officers and engineers are read-only (crew may still raise their own leave
 * requests).
 */
export function useCrewEditAccess(): CrewEditAccess {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ['crew-edit-access', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('frp_planner_access');
      if (error) throw error;
      return data as { can_view: boolean; can_edit: boolean; roles: string[] };
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  return {
    // Fail open on view (route-level access already applies), fail closed on edit.
    canView: q.data?.can_view ?? true,
    canEdit: q.data?.can_edit ?? false,
    roles: q.data?.roles ?? [],
    isLoading: q.isLoading,
  };
}
