import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

export interface VesselDashboardData {
  vessel_id: string | null;
  vessel_name: string;
  imo_number: string | null;
  flag_state: string | null;
  classification_society: string | null;
  open_alerts_count: number;
  red_alerts_count: number;
  crew_onboard_count: number;
  current_captain: string | null;
  certs_expiring_90d: number;
  crew_certs_expiring_90d: number;
  overdue_drills_count: number;
  training_gaps_count: number;
  overdue_maintenance_count: number;
  critical_defects_count: number;
  audits_due_90d: number;
  open_ncs_count: number;
  open_capas_count: number;
  pending_signatures_count: number;
  data_refreshed_at: string;
}

export const useVesselDashboard = () => {
  const { profile } = useAuth();
  const { selectedVesselId, isAllVessels, canAccessAllVessels, vessels } = useVessel();

  const query = useQuery({
    queryKey: ['vessel-dashboard', profile?.company_id, selectedVesselId, isAllVessels],
    queryFn: async (): Promise<VesselDashboardData[]> => {
      if (!profile?.company_id) return [];

      // Determine which vessel IDs to query
      let vesselIdsParam: string[] | null = null;
      
      if (!isAllVessels && selectedVesselId) {
        vesselIdsParam = [selectedVesselId];
      } else if (isAllVessels && canAccessAllVessels) {
        // For fleet view, pass null to get all vessels
        vesselIdsParam = null;
      }

      const { data, error } = await supabase.rpc('get_vessel_dashboard_summary', {
        p_company_id: profile.company_id,
        p_vessel_ids: vesselIdsParam,
        p_aggregate_all: isAllVessels,
      });

      if (error) {
        console.error('Dashboard query error:', error);
        throw error;
      }

      return (data || []) as VesselDashboardData[];
    },
    enabled: !!profile?.company_id,
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });

  // Get single vessel data or aggregated data
  const dashboardData = query.data?.[0] || null;
  const allVesselsData = isAllVessels ? query.data?.[0] : null;
  const perVesselData = !isAllVessels ? query.data : [];

  return {
    dashboardData,
    allVesselsData,
    perVesselData,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isAllVessels,
    canAccessAllVessels,
  };
};

// Hook for getting quick stats for a specific vessel
export const useVesselQuickStats = (vesselId: string | null) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['vessel-quick-stats', vesselId],
    queryFn: async () => {
      if (!profile?.company_id || !vesselId) return null;

      const { data, error } = await supabase.rpc('get_vessel_dashboard_summary', {
        p_company_id: profile.company_id,
        p_vessel_ids: [vesselId],
        p_aggregate_all: false,
      });

      if (error) throw error;
      return data?.[0] as VesselDashboardData | null;
    },
    enabled: !!profile?.company_id && !!vesselId,
    staleTime: 60000,
  });
};
