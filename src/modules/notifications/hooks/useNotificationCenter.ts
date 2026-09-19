import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { isComplianceAlert } from '@/modules/notifications/lib/notificationLinks';
import type { Database } from '@/integrations/supabase/types';

type AlertRow = Database['public']['Tables']['alerts']['Row'];
type TaskRow = Database['public']['Tables']['maintenance_tasks']['Row'];

export interface NotificationAlert extends Pick<AlertRow,
  'id' | 'title' | 'description' | 'severity_color' | 'status' | 'vessel_id' |
  'due_at' | 'created_at' | 'source_module' | 'related_entity_type' | 'related_entity_id' | 'alert_type'
> {
  vessel: { name: string } | null;
}

export interface OverdueOperationalTask extends Pick<TaskRow,
  'id' | 'task_name' | 'task_number' | 'task_type' | 'priority' | 'status' | 'due_date' | 'work_description'
> {
  equipment: {
    equipment_name: string;
    vessel_id: string;
    vessel: { name: string } | null;
  } | null;
}

export interface NotificationCenterData {
  pendingCompliance: NotificationAlert[];
  unreadMessages: NotificationAlert[];
  overdueTasks: OverdueOperationalTask[];
}

const EMPTY_DATA: NotificationCenterData = {
  pendingCompliance: [],
  unreadMessages: [],
  overdueTasks: [],
};

export function useNotificationCenter() {
  const { user, profile } = useAuth();
  const { selectedVesselId, isAllVessels } = useVessel();

  return useQuery({
    queryKey: ['notification-center', profile?.company_id, user?.id, selectedVesselId, isAllVessels],
    queryFn: async (): Promise<NotificationCenterData> => {
      if (!profile?.company_id || !user?.id) return EMPTY_DATA;

      let alertsQuery = supabase
        .from('alerts')
        .select(`
          id, title, description, severity_color, status, vessel_id, due_at, created_at,
          source_module, related_entity_type, related_entity_id, alert_type,
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .in('status', ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED'])
        .order('created_at', { ascending: false });

      let tasksQuery = supabase
        .from('maintenance_tasks')
        .select(`
          id, task_name, task_number, task_type, priority, status, due_date, work_description,
          equipment:equipment!inner(equipment_name, vessel_id, vessel:vessels(name))
        `)
        .lt('due_date', new Date().toISOString())
        .in('status', ['Pending', 'In Progress', 'Overdue', 'pending', 'in_progress', 'overdue'])
        .order('due_date', { ascending: true });

      if (!isAllVessels && selectedVesselId) {
        alertsQuery = alertsQuery.or(`vessel_id.eq.${selectedVesselId},vessel_id.is.null`);
        tasksQuery = tasksQuery.eq('equipment.vessel_id', selectedVesselId);
      }

      const [alertsResult, tasksResult] = await Promise.all([alertsQuery, tasksQuery]);
      if (alertsResult.error) throw alertsResult.error;
      if (tasksResult.error) throw tasksResult.error;

      const alerts = (alertsResult.data ?? []) as NotificationAlert[];
      const tasks = (tasksResult.data ?? []) as OverdueOperationalTask[];
      return {
        pendingCompliance: alerts.filter(isComplianceAlert),
        unreadMessages: alerts.filter((alert) => alert.status === 'OPEN'),
        overdueTasks: tasks,
      };
    },
    enabled: Boolean(profile?.company_id && user?.id),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
