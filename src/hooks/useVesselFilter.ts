import { useVessel } from '@/contexts/VesselContext';
import { useMemo } from 'react';

/**
 * Hook to get vessel filter parameters for Supabase queries
 * Returns the vessel ID to filter by, or null if showing all vessels
 */
export const useVesselFilter = () => {
  const { selectedVesselId, isAllVessels, selectedVessel, vessels, loading, canAccessAllVessels } = useVessel();

  const vesselFilter = useMemo(() => {
    if (isAllVessels) {
      return null; // No filter - show all vessels
    }
    return selectedVesselId;
  }, [isAllVessels, selectedVesselId]);

  const vesselIds = useMemo(() => {
    if (isAllVessels) {
      return vessels.map(v => v.id);
    }
    return selectedVesselId ? [selectedVesselId] : [];
  }, [isAllVessels, vessels, selectedVesselId]);

  return {
    vesselFilter,
    vesselIds,
    isAllVessels,
    selectedVessel,
    vessels,
    loading,
    canAccessAllVessels,
  };
};
