import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { RedRoomItem, AssignTaskPayload, AssignmentPriority } from '@/types/redRoom';

interface RedRoomState {
  items: RedRoomItem[];
  isLoading: boolean;
  error: string | null;
  
  // Current user permissions
  canAssignTasks: boolean;
  
  // Actions
  loadRedRoomItems: (companyId: string, vesselId?: string | null) => Promise<void>;
  checkPermissions: () => Promise<void>;
  
  // Item actions
  snoozeItem: (alertId: string, hours: number, reason?: string) => Promise<{ success: boolean; error?: string; remainingSnoozes?: number }>;
  acknowledgeItem: (alertId: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
  assignTask: (payload: AssignTaskPayload) => Promise<{ success: boolean; error?: string }>;
  
  // Navigation helper
  getViewUrl: (item: RedRoomItem) => string;
  
  // Reset
  reset: () => void;
}

const initialState = {
  items: [],
  isLoading: false,
  error: null,
  canAssignTasks: false,
};

export const useRedRoomStore = create<RedRoomState>((set, get) => ({
  ...initialState,

  loadRedRoomItems: async (companyId, vesselId) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase.rpc('get_red_room_items', {
        p_company_id: companyId,
        p_vessel_id: vesselId || null,
      });

      if (error) throw error;
      
      // Map the response to our type
      const items: RedRoomItem[] = (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        severity: item.severity as RedRoomItem['severity'],
        status: item.status?.toLowerCase() as RedRoomItem['status'],
        source_module: item.source_module,
        due_at: item.due_at,
        vessel_id: item.vessel_id,
        vessel_name: item.vessel_name || 'Unknown Vessel',
        incident_id: item.incident_id,
        related_entity_type: item.related_entity_type,
        related_entity_id: item.related_entity_id,
        is_direct_assignment: item.is_direct_assignment || false,
        assigned_by_name: item.assigned_by_name,
        assigned_at: item.assigned_at,
        assignment_notes: item.assignment_notes,
        assignment_priority: item.assignment_priority as AssignmentPriority,
        snooze_count: item.snooze_count || 0,
        snoozed_until: item.snoozed_until,
        created_at: item.created_at,
        is_overdue: item.is_overdue || false,
        is_snoozed: item.is_snoozed || false,
        source_type: item.source_type as RedRoomItem['source_type'],
      }));
      
      set({ items, isLoading: false });
    } catch (error) {
      console.error('Failed to load Red Room items:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load items',
        isLoading: false 
      });
    }
  },

  checkPermissions: async () => {
    try {
      const { data, error } = await supabase.rpc('can_user_assign_tasks');
      
      if (error) {
        console.error('Failed to check permissions:', error);
        set({ canAssignTasks: false });
        return;
      }
      
      set({ canAssignTasks: data === true });
    } catch (error) {
      console.error('Failed to check permissions:', error);
      set({ canAssignTasks: false });
    }
  },

  snoozeItem: async (alertId, hours, reason) => {
    try {
      const { data, error } = await supabase.rpc('snooze_alert', {
        p_alert_id: alertId,
        p_snooze_hours: hours,
        p_reason: reason || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; remaining_snoozes?: number };
      
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to snooze' };
      }

      // Remove from local state (it's snoozed)
      set((state) => ({
        items: state.items.filter(i => i.id !== alertId),
      }));

      return { 
        success: true, 
        remainingSnoozes: result.remaining_snoozes 
      };
    } catch (error) {
      console.error('Snooze error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to snooze' 
      };
    }
  },

  acknowledgeItem: async (alertId, notes) => {
    try {
      const { data, error } = await supabase.rpc('acknowledge_alert_action', {
        p_alert_id: alertId,
        p_notes: notes || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to acknowledge' };
      }

      // Remove from local state
      set((state) => ({
        items: state.items.filter(i => i.id !== alertId),
      }));

      return { success: true };
    } catch (error) {
      console.error('Acknowledge error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to acknowledge' 
      };
    }
  },

  assignTask: async (payload) => {
    const { canAssignTasks } = get();
    
    if (!canAssignTasks) {
      return { success: false, error: 'You do not have permission to assign tasks' };
    }

    try {
      const { data, error } = await supabase.rpc('assign_alert_task', {
        p_alert_id: payload.alertId,
        p_assign_to_user_id: payload.assignToUserId || null,
        p_assign_to_role: payload.assignToRole || null,
        p_notes: payload.notes || null,
        p_priority: payload.priority,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to assign task' };
      }

      return { success: true };
    } catch (error) {
      console.error('Assign task error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to assign task' 
      };
    }
  },

  getViewUrl: (item) => {
    // Determine the correct URL based on related record type
    if (item.incident_id) {
      return `/incidents?id=${item.incident_id}`;
    }
    
    if (item.related_entity_type && item.related_entity_id) {
      switch (item.related_entity_type.toLowerCase()) {
        case 'incident':
          return `/incidents?id=${item.related_entity_id}`;
        case 'form':
        case 'form_submission':
          return `/ism/forms/submissions/${item.related_entity_id}`;
        case 'certificate':
          return `/certificates?id=${item.related_entity_id}`;
        case 'maintenance':
        case 'maintenance_task':
          return `/maintenance?task=${item.related_entity_id}`;
        case 'defect':
          return `/maintenance?defect=${item.related_entity_id}`;
        case 'audit':
          return `/audits?id=${item.related_entity_id}`;
        case 'drill':
          return `/ism/drills?id=${item.related_entity_id}`;
        case 'crew':
        case 'profile':
          return `/crew?id=${item.related_entity_id}`;
        case 'corrective_action':
        case 'capa':
          return `/reports/capa-tracker?id=${item.related_entity_id}`;
        case 'training':
          return `/training?id=${item.related_entity_id}`;
        default:
          return `/alerts?id=${item.id}`;
      }
    }

    // Fallback based on source module
    if (item.source_module) {
      switch (item.source_module.toLowerCase()) {
        case 'incidents':
          return `/incidents`;
        case 'certificates':
          return `/certificates`;
        case 'maintenance':
          return `/maintenance`;
        case 'drills':
          return `/ism/drills`;
        case 'audits':
          return `/audits`;
        case 'training':
          return `/training`;
        case 'crew':
          return `/crew`;
        default:
          return `/alerts?id=${item.id}`;
      }
    }

    // Fallback to alert detail page
    return `/alerts?id=${item.id}`;
  },

  reset: () => {
    set(initialState);
  },
}));

// Selector hooks for optimized re-renders
export const useRedRoomItems = () => useRedRoomStore((state) => state.items);
export const useRedRoomLoading = () => useRedRoomStore((state) => ({ 
  isLoading: state.isLoading, 
  error: state.error 
}));
export const useCanAssignTasks = () => useRedRoomStore((state) => state.canAssignTasks);
