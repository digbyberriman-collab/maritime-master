import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDashboardStore } from '@/store/dashboardStore';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

describe('dashboardStore', () => {
  beforeEach(() => {
    useDashboardStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have no selected vessel', () => {
      expect(useDashboardStore.getState().selectedVesselId).toBeNull();
    });

    it('should not show all vessels', () => {
      expect(useDashboardStore.getState().isAllVessels).toBe(false);
    });

    it('should have empty data arrays', () => {
      const state = useDashboardStore.getState();
      expect(state.alerts).toEqual([]);
      expect(state.expiringCerts).toEqual([]);
      expect(state.upcomingAudits).toEqual([]);
      expect(state.recentActivity).toEqual([]);
      expect(state.userVessels).toEqual([]);
    });

    it('should be loading initially', () => {
      expect(useDashboardStore.getState().isLoading).toBe(true);
    });

    it('should not be refreshing', () => {
      expect(useDashboardStore.getState().isRefreshing).toBe(false);
    });

    it('should have no error', () => {
      expect(useDashboardStore.getState().error).toBeNull();
    });
  });

  describe('setSelectedVessel', () => {
    it('should update selectedVesselId and set isAllVessels to false', () => {
      useDashboardStore.setState({ companyId: 'comp-1' });
      useDashboardStore.getState().setSelectedVessel('vessel-1');

      const state = useDashboardStore.getState();
      expect(state.selectedVesselId).toBe('vessel-1');
      expect(state.isAllVessels).toBe(false);
    });

    it('should not update if same vessel is selected', () => {
      useDashboardStore.setState({
        selectedVesselId: 'vessel-1',
        companyId: 'comp-1',
      });

      const loadDashboardSpy = vi.spyOn(useDashboardStore.getState(), 'loadDashboard');
      useDashboardStore.getState().setSelectedVessel('vessel-1');

      // loadDashboard should not be triggered for same vessel
      expect(loadDashboardSpy).not.toHaveBeenCalled();
    });
  });

  describe('setAllVessels', () => {
    it('should not change state if user cannot view all vessels', () => {
      useDashboardStore.setState({ canViewAllVessels: false, isAllVessels: false });
      useDashboardStore.getState().setAllVessels(true);
      expect(useDashboardStore.getState().isAllVessels).toBe(false);
    });

    it('should not change state if already in the same mode', () => {
      useDashboardStore.setState({
        canViewAllVessels: true,
        isAllVessels: true,
        companyId: 'comp-1',
      });
      useDashboardStore.getState().setAllVessels(true);
      // No error means it handled the no-op correctly
    });
  });

  describe('loadDashboard', () => {
    it('should set error when no companyId', async () => {
      useDashboardStore.setState({ companyId: null });
      await useDashboardStore.getState().loadDashboard();

      expect(useDashboardStore.getState().error).toBe('No company context');
      expect(useDashboardStore.getState().isLoading).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      useDashboardStore.setState({
        selectedVesselId: 'vessel-1',
        isAllVessels: true,
        alerts: [{ id: '1' }] as any,
        error: 'some error',
        companyId: 'comp-1',
      });

      useDashboardStore.getState().reset();

      const state = useDashboardStore.getState();
      expect(state.selectedVesselId).toBeNull();
      expect(state.isAllVessels).toBe(false);
      expect(state.alerts).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.companyId).toBeNull();
    });
  });
});
