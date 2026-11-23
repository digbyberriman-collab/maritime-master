/**
 * The personal inbox's data (/inbox; gap/10 IA15, spec §2.1): open alerts and
 * overdue operational tasks in the viewer's alert scope, the same scope the
 * top-bar bell reads (`useAlertScope`, ../lib/alertScope.ts): the route's
 * vessel inside `/v/:code`, else the whole company for fleet reach, else the
 * vessels in reach (D-71). The sidebar and tab badge counts
 * (`useSidebarBadgeCounts`) read this query, so they are scoped the same way.
 *
 * Fail closed (D-04): nothing is read until auth, roles and the vessel list
 * have loaded, and a null vessel selection never widens the scope.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useScope } from '@/app/router/scopeContext';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { isComplianceAlert } from '@/modules/notifications/lib/notificationLinks';
import { alertOrFilter, alertScopeFor, alertScopeKey, type AlertScope } from '@/modules/notifications/lib/alertScope';
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

export interface AlertScopeState {
  /** Auth, roles and the vessel list have loaded and there is a company: reading may start. */
  ready: boolean;
  companyId: string | null;
  scope: AlertScope;
  /** `alertScopeKey(scope)`, for query keys. */
  scopeKey: string;
  /** The vessel the route names, when the scope is one vessel. */
  vesselName: string | null;
}

/** The viewer's alert scope (see the header). */
export function useAlertScope(): AlertScopeState {
  const { profile } = useAuth();
  const access = useScopeAccess();
  const { vessels, loading, canAccessAllVessels } = useVessel();
  const route = useScope();
  const companyId = profile?.company_id ?? null;
  const ready = access.ready && !loading && Boolean(companyId);
  const reachKey = vessels.map((v) => v.id).join(',');
  const routeVessel = route.scope === 'vessel' ? route.vessel ?? null : null;
  const scope = useMemo(
    () =>
      alertScopeFor({
        routeScope: route.scope,
        scopeVesselId: routeVessel?.id,
        fleetReach: access.fleetReach || canAccessAllVessels,
        reachableIds: reachKey ? reachKey.split(',') : [],
      }),
    [route.scope, routeVessel?.id, access.fleetReach, canAccessAllVessels, reachKey],
  );
  return {
    ready,
    companyId,
    scope,
    scopeKey: alertScopeKey(scope),
    vesselName: scope.kind === 'vessel' ? routeVessel?.name ?? null : null,
  };
}

const EMPTY_DATA: NotificationCenterData = {
  pendingCompliance: [],
  unreadMessages: [],
  overdueTasks: [],
};

export function useNotificationCenter() {
  const { user } = useAuth();
  const { ready, companyId, scope, scopeKey } = useAlertScope();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ['notification-center', companyId, userId, scopeKey],
    queryFn: async (): Promise<NotificationCenterData> => {
      if (!companyId || !userId) return EMPTY_DATA;

      let alertsQuery = supabase
        .from('alerts')
        .select(`
          id, title, description, severity_color, status, vessel_id, due_at, created_at,
          source_module, related_entity_type, related_entity_id, alert_type,
          vessel:vessels(name)
        `)
        .eq('company_id', companyId)
        .in('status', ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED'])
        .order('created_at', { ascending: false });
      const orFilter = alertOrFilter(scope);
      if (orFilter) alertsQuery = alertsQuery.or(orFilter);

      let tasksQuery = supabase
        .from('maintenance_tasks')
        .select(`
          id, task_name, task_number, task_type, priority, status, due_date, work_description,
          equipment:equipment!inner(equipment_name, vessel_id, vessel:vessels(name))
        `)
        .lt('due_date', new Date().toISOString())
        .in('status', ['Pending', 'In Progress', 'Overdue', 'pending', 'in_progress', 'overdue'])
        .order('due_date', { ascending: true });
      if (scope.kind === 'vessel') tasksQuery = tasksQuery.eq('equipment.vessel_id', scope.vesselId);
      else if (scope.kind === 'reach') tasksQuery = tasksQuery.in('equipment.vessel_id', [...scope.vesselIds]);
      // No vessel in reach: no vessel's tasks (tasks always belong to a vessel).
      const skipTasks = scope.kind === 'reach' && scope.vesselIds.length === 0;

      const [alertsResult, tasksResult] = await Promise.all([alertsQuery, skipTasks ? null : tasksQuery]);
      if (alertsResult.error) throw alertsResult.error;
      if (tasksResult?.error) throw tasksResult.error;

      const alerts = (alertsResult.data ?? []) as NotificationAlert[];
      const tasks = (tasksResult?.data ?? []) as OverdueOperationalTask[];
      return {
        pendingCompliance: alerts.filter(isComplianceAlert),
        unreadMessages: alerts.filter((alert) => alert.status === 'OPEN'),
        overdueTasks: tasks,
      };
    },
    enabled: ready && Boolean(userId),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
