import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

interface DashboardFilterContextType {
  selectedVesselIds: string[];
  setSelectedVesselIds: (ids: string[]) => void;
  isAllVessels: boolean;
}

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export const DashboardFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    vessels,
    isAllVessels: ctxIsAllVessels,
    selectedVesselId,
    setSelectedVesselById,
    setAllVessels,
    canAccessAllVessels,
  } = useVessel();

  // Derive the multi-select array from the single source of truth (VesselContext).
  // - All Vessels  -> every vessel id
  // - Single vessel -> that vessel's id
  const selectedVesselIds = React.useMemo(() => {
    if (ctxIsAllVessels) return vessels.map((v) => v.id);
    return selectedVesselId ? [selectedVesselId] : [];
  }, [ctxIsAllVessels, selectedVesselId, vessels]);

  // When the header filter changes, propagate the choice to VesselContext so
  // every module (sidebar pages, hooks using useVesselFilter / useVessel) reacts.
  const setSelectedVesselIds = useCallback(
    (ids: string[]) => {
      if (vessels.length === 0) return;
      const allIds = vessels.map((v) => v.id);
      const isAll = ids.length === allIds.length && allIds.every((id) => ids.includes(id));

      if (isAll && canAccessAllVessels) {
        setAllVessels();
        return;
      }
      if (ids.length === 1) {
        setSelectedVesselById(ids[0]);
        return;
      }
      // Subset (2+ but not all): VesselContext can't represent subsets,
      // so default to first vessel in the subset to keep modules consistent.
      if (ids.length > 1) {
        setSelectedVesselById(ids[0]);
        return;
      }
      // Empty selection: fall back to All if allowed, else first vessel.
      if (canAccessAllVessels) {
        setAllVessels();
      } else {
        setSelectedVesselById(allIds[0]);
      }
    },
    [vessels, canAccessAllVessels, setAllVessels, setSelectedVesselById]
  );

  const isAllVessels = ctxIsAllVessels;

  return (
    <DashboardFilterContext.Provider value={{ selectedVesselIds, setSelectedVesselIds, isAllVessels }}>
      {children}
    </DashboardFilterContext.Provider>
  );
};

export const useDashboardFilter = () => {
  const context = useContext(DashboardFilterContext);
  if (!context) {
    throw new Error('useDashboardFilter must be used within DashboardFilterProvider');
  }
  return context;
};
