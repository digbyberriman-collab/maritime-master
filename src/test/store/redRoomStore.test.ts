import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRedRoomStore } from '@/modules/red-room/store/redRoomStore';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

describe('redRoomStore', () => {
  beforeEach(() => {
    useRedRoomStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have empty items', () => {
      expect(useRedRoomStore.getState().items).toEqual([]);
    });

    it('should not be loading', () => {
      expect(useRedRoomStore.getState().isLoading).toBe(false);
    });

    it('should have no error', () => {
      expect(useRedRoomStore.getState().error).toBeNull();
    });

    it('should not allow task assignment by default', () => {
      expect(useRedRoomStore.getState().canAssignTasks).toBe(false);
    });
  });

  describe('getViewUrl', () => {
    const getViewUrl = useRedRoomStore.getState().getViewUrl;

    it('should return incidents URL when incident_id is set', () => {
      const item = { incident_id: 'inc-1' } as any;
      expect(getViewUrl(item)).toBe('/incidents?id=inc-1');
    });

    it('should route incident entities to incidents page', () => {
      const item = { related_entity_type: 'incident', related_entity_id: 'inc-2' } as any;
      expect(getViewUrl(item)).toBe('/incidents?id=inc-2');
    });

    it('should route form entities to form submission page', () => {
      const item = { related_entity_type: 'form_submission', related_entity_id: 'form-1' } as any;
      expect(getViewUrl(item)).toBe('/ism/forms/submission/form-1');
    });

    it('should route certificate entities to certificates page', () => {
      const item = { related_entity_type: 'certificate', related_entity_id: 'cert-1' } as any;
      expect(getViewUrl(item)).toBe('/certificates?id=cert-1');
    });

    it('should route maintenance entities to maintenance page', () => {
      const item = { related_entity_type: 'maintenance_task', related_entity_id: 'mt-1' } as any;
      expect(getViewUrl(item)).toBe('/maintenance?task=mt-1');
    });

    it('should route defect entities to maintenance defects page', () => {
      const item = { related_entity_type: 'defect', related_entity_id: 'def-1' } as any;
      expect(getViewUrl(item)).toBe('/maintenance?defect=def-1');
    });

    it('should route audit entities to audits page', () => {
      const item = { related_entity_type: 'audit', related_entity_id: 'aud-1' } as any;
      expect(getViewUrl(item)).toBe('/audits?id=aud-1');
    });

    it('should route drill entities to drills page', () => {
      const item = { related_entity_type: 'drill', related_entity_id: 'drill-1' } as any;
      expect(getViewUrl(item)).toBe('/ism/drills?id=drill-1');
    });

    it('should route crew entities to crew page', () => {
      const item = { related_entity_type: 'crew', related_entity_id: 'crew-1' } as any;
      expect(getViewUrl(item)).toBe('/crew?id=crew-1');
    });

    it('should route corrective_action entities to CAPA tracker', () => {
      const item = { related_entity_type: 'corrective_action', related_entity_id: 'capa-1' } as any;
      expect(getViewUrl(item)).toBe('/reports/capa-tracker?id=capa-1');
    });

    it('should route training entities to training page', () => {
      const item = { related_entity_type: 'training', related_entity_id: 'train-1' } as any;
      expect(getViewUrl(item)).toBe('/training?id=train-1');
    });

    it('should fallback to alerts page for unknown entity types', () => {
      const item = { id: 'alert-1', related_entity_type: 'unknown', related_entity_id: 'x' } as any;
      expect(getViewUrl(item)).toBe('/alerts?id=alert-1');
    });

    it('should fallback based on source_module when no entity info', () => {
      expect(getViewUrl({ id: 'a', source_module: 'incidents' } as any)).toBe('/incidents');
      expect(getViewUrl({ id: 'a', source_module: 'certificates' } as any)).toBe('/certificates');
      expect(getViewUrl({ id: 'a', source_module: 'maintenance' } as any)).toBe('/maintenance');
      expect(getViewUrl({ id: 'a', source_module: 'drills' } as any)).toBe('/ism/drills');
      expect(getViewUrl({ id: 'a', source_module: 'audits' } as any)).toBe('/audits');
      expect(getViewUrl({ id: 'a', source_module: 'training' } as any)).toBe('/training');
      expect(getViewUrl({ id: 'a', source_module: 'crew' } as any)).toBe('/crew');
    });

    it('should fallback to alert detail page as last resort', () => {
      const item = { id: 'alert-1' } as any;
      expect(getViewUrl(item)).toBe('/alerts?id=alert-1');
    });
  });

  describe('assignTask', () => {
    it('should return error when user cannot assign tasks', async () => {
      useRedRoomStore.setState({ canAssignTasks: false });

      const result = await useRedRoomStore.getState().assignTask({
        alertId: 'alert-1',
        priority: 'high',
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You do not have permission to assign tasks');
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      useRedRoomStore.setState({
        items: [{ id: '1' } as any],
        isLoading: true,
        error: 'some error',
        canAssignTasks: true,
      });

      useRedRoomStore.getState().reset();

      const state = useRedRoomStore.getState();
      expect(state.items).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.canAssignTasks).toBe(false);
    });
  });
});
