import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

interface DashboardFilterContextType {
  selectedVesselIds: string[];
  setSelectedVesselIds: (ids: string[]) => void;
  isAllVessels: boolean;
}

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export const DashboardFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { vessels } = useVessel();
  const [selectedVesselIds, setSelectedVesselIdsState] = useState<string[]>(() =>
    vessels.map((v) => v.id)
  );

  // Keep in sync when vessels load
  React.useEffect(() => {
    if (vessels.length > 0 && selectedVesselIds.length === 0) {
      setSelectedVesselIdsState(vessels.map((v) => v.id));
    }
  }, [vessels]);

  const setSelectedVesselIds = useCallback((ids: string[]) => {
    setSelectedVesselIdsState(ids);
  }, []);

  const isAllVessels = selectedVesselIds.length === vessels.length;

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
