import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEmergencyContactsStore } from '@/store/emergencyContactsStore';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

describe('emergencyContactsStore', () => {
  beforeEach(() => {
    useEmergencyContactsStore.getState().clear();
  });

  describe('initial state', () => {
    it('should have null contacts', () => {
      expect(useEmergencyContactsStore.getState().contacts).toBeNull();
    });

    it('should have empty history', () => {
      expect(useEmergencyContactsStore.getState().history).toEqual([]);
    });

    it('should not be loading', () => {
      expect(useEmergencyContactsStore.getState().isLoading).toBe(false);
    });

    it('should not be saving', () => {
      expect(useEmergencyContactsStore.getState().isSaving).toBe(false);
    });

    it('should have no error', () => {
      expect(useEmergencyContactsStore.getState().error).toBeNull();
    });

    it('should have no current vessel', () => {
      expect(useEmergencyContactsStore.getState().currentVesselId).toBeNull();
    });
  });

  describe('clear', () => {
    it('should reset data state', () => {
      useEmergencyContactsStore.setState({
        contacts: { id: '1' } as any,
        history: [{ id: '1' }] as any,
        currentVesselId: 'vessel-1',
        error: 'some error',
      });

      useEmergencyContactsStore.getState().clear();

      const state = useEmergencyContactsStore.getState();
      expect(state.contacts).toBeNull();
      expect(state.history).toEqual([]);
      expect(state.currentVesselId).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('loadContacts', () => {
    it('should set loading state and currentVesselId', async () => {
      const promise = useEmergencyContactsStore.getState().loadContacts('vessel-1');
      // During loading, currentVesselId should be set
      expect(useEmergencyContactsStore.getState().currentVesselId).toBe('vessel-1');
      await promise;
    });

    it('should set contacts to null when no data returned', async () => {
      await useEmergencyContactsStore.getState().loadContacts('vessel-1');
      expect(useEmergencyContactsStore.getState().contacts).toBeNull();
      expect(useEmergencyContactsStore.getState().isLoading).toBe(false);
    });
  });
});
