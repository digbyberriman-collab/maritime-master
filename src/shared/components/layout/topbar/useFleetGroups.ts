/**
 * The company's fleet groups, for grouping the vessel switcher (gap/10 top
 * bar element 3). Names only: `color_hex` is tenant data and is not drawn
 * (Signal stays the only accent, D-DS4). On an error the switcher shows one
 * "Vessels" group; it never invents groups.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface FleetGroup {
  id: string;
  name: string;
}

export type FleetGroupsState = { status: 'loading' | 'error' | 'ready'; groups: readonly FleetGroup[] };

const NONE: readonly FleetGroup[] = [];

export function useFleetGroups(enabled = true): FleetGroupsState {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: ['fleet-groups', companyId],
    enabled: enabled && Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FleetGroup[]> => {
      const { data, error } = await supabase
        .from('fleet_groups')
        .select('id, name')
        .eq('company_id', companyId as string)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((g) => typeof g.id === 'string' && typeof g.name === 'string');
    },
  });
  if (query.isError) return { status: 'error', groups: NONE };
  if (!query.data) return { status: 'loading', groups: NONE };
  return { status: 'ready', groups: query.data };
}
