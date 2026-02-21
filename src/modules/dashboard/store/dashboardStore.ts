import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { 
  DashboardSummary, 
  DashboardAlert, 
  ExpiringCertificate,
  UpcomingAudit,
  ActivityItem 
} from '@/modules/dashboard/types';

interface DashboardState {
  // Selected vessel context
  selectedVesselId: string | null;
  isAllVessels: boolean;
  userVessels: { id: string; name: string }[];
  
  // Data
  summary: DashboardSummary | null;
  alerts: DashboardAlert[];
  expiringCerts: ExpiringCertificate[];
  upcomingAudits: UpcomingAudit[];
  recentActivity: ActivityItem[];
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastRefreshed: Date | null;
  
  // Permissions
  canViewAllVessels: boolean;
  companyId: string | null;
  
  // Actions
  initialize: (companyId: string, userRole: string, assignedVesselId: string | null, canViewAll: boolean) => Promise<void>;
  setSelectedVessel: (vesselId: string | null) => void;
  setAllVessels: (isAll: boolean) => void;
  loadDashboard: () => Promise<void>;
  loadAlerts: () => Promise<void>;
  loadCertificates: () => Promise<void>;
  loadAudits: () => Promise<void>;
  loadActivity: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

const initialState = {
  selectedVesselId: null,
  isAllVessels: false,
  userVessels: [],
  summary: null,
  alerts: [],
  expiringCerts: [],
  upcomingAudits: [],
  recentActivity: [],
  isLoading: true,
  isRefreshing: false,
  error: null,
  lastRefreshed: null,
  canViewAllVessels: false,
  companyId: null,
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  ...initialState,

  initialize: async (companyId, userRole, assignedVesselId, canViewAll) => {
    set({ companyId, canViewAllVessels: canViewAll, isLoading: true });
    
    try {
      // Load user's permitted vessels
      const { data: vessels, error: vesselsError } = await supabase
        .from('vessels')
        .select('id, name')
        .eq('company_id', companyId)
        .neq('status', 'Sold')
        .order('name');
      
      if (vesselsError) throw vesselsError;
      
      set({ userVessels: vessels || [] });
      
      // Set default vessel based on role and permissions
      if (canViewAll) {
        // DPA/Fleet Master default to "All Vessels"
        set({ isAllVessels: true, selectedVesselId: null });
      } else if (assignedVesselId) {
        // User assigned to specific vessel
        set({ selectedVesselId: assignedVesselId, isAllVessels: false });
      } else if (vessels && vessels.length > 0) {
        // Fallback to first vessel
        set({ selectedVesselId: vessels[0].id, isAllVessels: false });
      }
      
      await get().loadDashboard();
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to initialize dashboard',
        isLoading: false 
      });
    }
  },

  setSelectedVessel: (vesselId) => {
    const { selectedVesselId: currentVesselId } = get();
    if (vesselId === currentVesselId) return;
    
    set({ selectedVesselId: vesselId, isAllVessels: false });
    get().loadDashboard();
  },

  setAllVessels: (isAll) => {
    const { canViewAllVessels, isAllVessels, userVessels } = get();
    if (!canViewAllVessels || isAll === isAllVessels) return;
    
    set({ 
      isAllVessels: isAll, 
      selectedVesselId: isAll ? null : userVessels[0]?.id || null 
    });
    get().loadDashboard();
  },

  loadDashboard: async () => {
    const { selectedVesselId, isAllVessels, companyId } = get();
    
    if (!companyId) {
      set({ error: 'No company context', isLoading: false });
      return;
    }
    
    set({ isLoading: true, error: null });

    try {
      // Load all dashboard data in parallel
      const [summaryResult, alertsResult, certsResult, auditsResult, activityResult] = await Promise.all([
        // Summary data
        supabase.rpc('get_vessel_dashboard_summary', {
          p_company_id: companyId,
          p_vessel_ids: selectedVesselId ? [selectedVesselId] : null,
          p_aggregate_all: isAllVessels,
        }),
        // Dashboard alerts
        supabase.rpc('get_dashboard_alerts', {
          p_company_id: companyId,
          p_vessel_id: selectedVesselId,
          p_all_vessels: isAllVessels,
          p_limit: 10,
        }),
        // Expiring certificates
        supabase.rpc('get_expiring_certificates', {
          p_company_id: companyId,
          p_vessel_id: selectedVesselId,
          p_all_vessels: isAllVessels,
          p_days: 90,
        }),
        // Upcoming audits
        supabase.rpc('get_upcoming_audits', {
          p_company_id: companyId,
          p_vessel_id: selectedVesselId,
          p_all_vessels: isAllVessels,
          p_days: 90,
        }),
        // Recent activity
        supabase.rpc('get_recent_activity', {
          p_company_id: companyId,
          p_vessel_id: selectedVesselId,
          p_all_vessels: isAllVessels,
          p_limit: 20,
        }),
      ]);

      if (summaryResult.error) throw summaryResult.error;

      set({
        summary: summaryResult.data?.[0] || null,
        alerts: (alertsResult.data || []) as DashboardAlert[],
        expiringCerts: (certsResult.data || []) as ExpiringCertificate[],
        upcomingAudits: (auditsResult.data || []) as UpcomingAudit[],
        recentActivity: (activityResult.data || []) as ActivityItem[],
        isLoading: false,
        lastRefreshed: new Date(),
      });
    } catch (error) {
      console.error('Dashboard load error:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load dashboard',
        isLoading: false 
      });
    }
  },

  loadAlerts: async () => {
    const { selectedVesselId, isAllVessels, companyId } = get();
    if (!companyId) return;

    try {
      const { data, error } = await supabase.rpc('get_dashboard_alerts', {
        p_company_id: companyId,
        p_vessel_id: selectedVesselId,
        p_all_vessels: isAllVessels,
        p_limit: 10,
      });
      
      if (error) throw error;
      set({ alerts: (data || []) as DashboardAlert[] });
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  },

  loadCertificates: async () => {
    const { selectedVesselId, isAllVessels, companyId } = get();
    if (!companyId) return;

    try {
      const { data, error } = await supabase.rpc('get_expiring_certificates', {
        p_company_id: companyId,
        p_vessel_id: selectedVesselId,
        p_all_vessels: isAllVessels,
        p_days: 90,
      });
      
      if (error) throw error;
      set({ expiringCerts: (data || []) as ExpiringCertificate[] });
    } catch (error) {
      console.error('Failed to load certificates:', error);
    }
  },

  loadAudits: async () => {
    const { selectedVesselId, isAllVessels, companyId } = get();
    if (!companyId) return;

    try {
      const { data, error } = await supabase.rpc('get_upcoming_audits', {
        p_company_id: companyId,
        p_vessel_id: selectedVesselId,
        p_all_vessels: isAllVessels,
        p_days: 90,
      });
      
      if (error) throw error;
      set({ upcomingAudits: (data || []) as UpcomingAudit[] });
    } catch (error) {
      console.error('Failed to load audits:', error);
    }
  },

  loadActivity: async () => {
    const { selectedVesselId, isAllVessels, companyId } = get();
    if (!companyId) return;

    try {
      const { data, error } = await supabase.rpc('get_recent_activity', {
        p_company_id: companyId,
        p_vessel_id: selectedVesselId,
        p_all_vessels: isAllVessels,
        p_limit: 20,
      });
      
      if (error) throw error;
      set({ recentActivity: (data || []) as ActivityItem[] });
    } catch (error) {
      console.error('Failed to load activity:', error);
    }
  },

  refresh: async () => {
    set({ isRefreshing: true });
    await get().loadDashboard();
    set({ isRefreshing: false });
  },

  reset: () => {
    set(initialState);
  },
}));

// Selector hooks for optimized re-renders
export const useDashboardSummary = () => useDashboardStore((state) => state.summary);
export const useDashboardAlerts = () => useDashboardStore((state) => state.alerts);
export const useDashboardCerts = () => useDashboardStore((state) => state.expiringCerts);
export const useDashboardAudits = () => useDashboardStore((state) => state.upcomingAudits);
export const useDashboardActivity = () => useDashboardStore((state) => state.recentActivity);
export const useDashboardLoading = () => useDashboardStore((state) => ({ 
  isLoading: state.isLoading, 
  isRefreshing: state.isRefreshing,
  error: state.error 
}));
export const useDashboardVesselContext = () => useDashboardStore((state) => ({
  selectedVesselId: state.selectedVesselId,
  isAllVessels: state.isAllVessels,
  userVessels: state.userVessels,
  canViewAllVessels: state.canViewAllVessels,
  setSelectedVessel: state.setSelectedVessel,
  setAllVessels: state.setAllVessels,
}));
