import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

export interface SidebarBadgeCounts {
  pendingCompliance: number;
  unreadMessages: number;
  overdueTasks: number;
}

const EMPTY_COUNTS: SidebarBadgeCounts = {
  pendingCompliance: 0,
  unreadMessages: 0,
  overdueTasks: 0,
};

const COMPLIANCE_TERMS = ['compliance', 'certificate', 'audit', 'capa', 'ism', 'isps', 'mlc', 'marpol'];
const includesTerm = (value: string | null, terms: string[]): boolean => {
  const normalized = value?.toLowerCase() ?? '';
  return terms.some((term) => normalized.includes(term));
};

export function useSidebarBadgeCounts() {
  const { user, profile } = useAuth();
  const { selectedVesselId, isAllVessels } = useVessel();

  return useQuery({
    queryKey: ['sidebar-badge-counts', profile?.company_id, user?.id, selectedVesselId, isAllVessels],
    queryFn: async (): Promise<SidebarBadgeCounts> => {
      if (!profile?.company_id || !user?.id) return EMPTY_COUNTS;

      let alertsQuery = supabase
        .from('alerts')
        .select('status, source_module, related_entity_type, alert_type')
        .eq('company_id', profile.company_id)
        .in('status', ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED']);

      let tasksQuery = supabase
        .from('maintenance_tasks')
        .select('id, equipment!inner(vessel_id)', { count: 'exact', head: true })
        .lt('due_date', new Date().toISOString())
        .in('status', ['Pending', 'In Progress', 'Overdue', 'pending', 'in_progress', 'overdue']);

      if (!isAllVessels && selectedVesselId) {
        alertsQuery = alertsQuery.or(`vessel_id.eq.${selectedVesselId},vessel_id.is.null`);
        tasksQuery = tasksQuery.eq('equipment.vessel_id', selectedVesselId);
      }

      const [alertsResult, tasksResult] = await Promise.all([alertsQuery, tasksQuery]);
      if (alertsResult.error) throw alertsResult.error;
      if (tasksResult.error) throw tasksResult.error;

      const alerts = alertsResult.data ?? [];
      const matchesAnyField = (alert: typeof alerts[number], terms: string[]) => (
        includesTerm(alert.source_module, terms)
        || includesTerm(alert.related_entity_type, terms)
        || includesTerm(alert.alert_type, terms)
      );

      return {
        pendingCompliance: alerts.filter((alert) => matchesAnyField(alert, COMPLIANCE_TERMS)).length,
        // OPEN alerts are the app's existing unread notification source (the
        // header bell uses the same definition), so the sidebar stays aligned.
        unreadMessages: alerts.filter((alert) => alert.status === 'OPEN').length,
        overdueTasks: tasksResult.count ?? 0,
      };
    },
    enabled: Boolean(profile?.company_id && user?.id),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}