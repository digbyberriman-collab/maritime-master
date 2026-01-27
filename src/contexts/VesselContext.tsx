import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Vessel {
  id: string;
  company_id: string;
  name: string;
  imo_number: string | null;
  flag_state: string | null;
  vessel_type: string | null;
  classification_society: string | null;
  gross_tonnage: number | null;
  build_year: number | null;
  status: string | null;
}

interface VesselContextType {
  selectedVessel: Vessel | null;
  selectedVesselId: string | null;
  vessels: Vessel[];
  isAllVessels: boolean;
  setSelectedVessel: (vessel: Vessel | null) => void;
  setSelectedVesselById: (vesselId: string | null) => void;
  setAllVessels: () => void;
  loading: boolean;
  refreshVessels: () => Promise<void>;
  canAccessAllVessels: boolean;
}

const VesselContext = createContext<VesselContextType | undefined>(undefined);

const STORAGE_KEY_VESSEL_ID = 'storm_selectedVesselId';
const STORAGE_KEY_ALL_VESSELS = 'storm_isAllVessels';

// Roles that can access all vessels and see \"All Vessels\" option
const ALL_VESSELS_ROLES = ['dpa', 'shore_management'];

export const VesselProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [selectedVessel, setSelectedVesselState] = useState<Vessel | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAllVessels, setIsAllVessels] = useState(false);

  // Check if user can access all vessels based on their role
  const canAccessAllVessels = ALL_VESSELS_ROLES.includes(profile?.role || '');

  // Load vessels based on user role
  const loadVessels = useCallback(async () => {
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let vesselsData: Vessel[] = [];

      // DPA/Shore Management see all company vessels
      if (canAccessAllVessels) {
        const { data, error } = await supabase
          .from('vessels')
          .select('*')
          .eq('company_id', profile.company_id)
          .neq('status', 'Sold')
          .order('name');

        if (error) throw error;
        vesselsData = data || [];
      } else {
        // Other users see only their assigned vessels
        const { data: assignments, error: assignmentError } = await supabase
          .from('crew_assignments')
          .select('vessel_id')
          .eq('user_id', profile.user_id)
          .eq('is_current', true);

        if (assignmentError) throw assignmentError;

        if (assignments && assignments.length > 0) {
          const vesselIds = assignments.map(a => a.vessel_id);
          const { data, error } = await supabase
            .from('vessels')
            .select('*')
            .in('id', vesselIds)
            .neq('status', 'Sold')
            .order('name');

          if (error) throw error;
          vesselsData = data || [];
        }
      }

      setVessels(vesselsData);

      // Restore previous selection from sessionStorage
      const savedIsAllVessels = sessionStorage.getItem(STORAGE_KEY_ALL_VESSELS) === 'true';
      const savedVesselId = sessionStorage.getItem(STORAGE_KEY_VESSEL_ID);

      if (savedIsAllVessels && canAccessAllVessels) {
        setIsAllVessels(true);
        setSelectedVesselState(null);
      } else if (savedVesselId) {
        const vessel = vesselsData.find(v => v.id === savedVesselId);
        if (vessel) {
          setSelectedVesselState(vessel);
          setIsAllVessels(false);
        } else if (vesselsData.length > 0) {
          // Saved vessel not found, default to first vessel
          setSelectedVesselState(vesselsData[0]);
          setIsAllVessels(false);
        } else if (canAccessAllVessels) {
          // No vessels found but user can access all - set to all vessels mode
          setIsAllVessels(true);
        }
      } else if (vesselsData.length > 0) {
        // No saved selection, default to first vessel
        setSelectedVesselState(vesselsData[0]);
        setIsAllVessels(false);
      } else if (canAccessAllVessels) {
        // No vessels but user can access all - set to all vessels mode
        setIsAllVessels(true);
      }
    } catch (error) {
      console.error('Error loading vessels:', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, profile?.user_id, canAccessAllVessels]);

  // Load vessels when profile changes
  useEffect(() => {
    if (profile) {
      loadVessels();
    }
  }, [profile, loadVessels]);

  // Persist selected vessel to sessionStorage
  useEffect(() => {
    if (selectedVessel) {
      sessionStorage.setItem(STORAGE_KEY_VESSEL_ID, selectedVessel.id);
      sessionStorage.setItem(STORAGE_KEY_ALL_VESSELS, 'false');
    }
  }, [selectedVessel]);

  // Persist \"All Vessels\" selection
  useEffect(() => {
    if (isAllVessels) {
      sessionStorage.setItem(STORAGE_KEY_ALL_VESSELS, 'true');
      sessionStorage.removeItem(STORAGE_KEY_VESSEL_ID);
    }
  }, [isAllVessels]);

  const setSelectedVessel = useCallback((vessel: Vessel | null) => {
    setSelectedVesselState(vessel);
    setIsAllVessels(false);
  }, []);

  const setSelectedVesselById = useCallback((vesselId: string | null) => {
    if (vesselId === null || vesselId === '__all__') {
      if (canAccessAllVessels) {
        setIsAllVessels(true);
        setSelectedVesselState(null);
      }
    } else {
      const vessel = vessels.find(v => v.id === vesselId);
      if (vessel) {
        setSelectedVesselState(vessel);
        setIsAllVessels(false);
      }
    }
  }, [vessels, canAccessAllVessels]);

  const setAllVessels = useCallback(() => {
    if (canAccessAllVessels) {
      setIsAllVessels(true);
      setSelectedVesselState(null);
    }
  }, [canAccessAllVessels]);

  const refreshVessels = useCallback(async () => {
    await loadVessels();
  }, [loadVessels]);

  const value: VesselContextType = {
    selectedVessel,
    selectedVesselId: selectedVessel?.id || null,
    vessels,
    isAllVessels,
    setSelectedVessel,
    setSelectedVesselById,
    setAllVessels,
    loading,
    refreshVessels,
    canAccessAllVessels,
  };

  return <VesselContext.Provider value={value}>{children}</VesselContext.Provider>;
};

// Custom hook to use vessel context
export const useVessel = () => {
  const context = useContext(VesselContext);
  if (context === undefined) {
    throw new Error('useVessel must be used within a VesselProvider');
  }
  return context;
};
