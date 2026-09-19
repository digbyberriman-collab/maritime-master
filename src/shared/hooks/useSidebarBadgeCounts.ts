import { useNotificationCenter } from '@/modules/notifications/hooks/useNotificationCenter';

export interface SidebarBadgeCounts {
  pendingCompliance: number;
  unreadMessages: number;
  overdueTasks: number;
}

export function useSidebarBadgeCounts() {
  const query = useNotificationCenter();
  const counts: SidebarBadgeCounts | undefined = query.data ? {
    pendingCompliance: query.data.pendingCompliance.length,
    unreadMessages: query.data.unreadMessages.length,
    overdueTasks: query.data.overdueTasks.length,
  } : undefined;
  return { ...query, data: counts };
}