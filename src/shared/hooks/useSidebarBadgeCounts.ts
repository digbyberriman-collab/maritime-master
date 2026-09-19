import { useNotificationCenter } from '@/modules/notifications/hooks/useNotificationCenter';
import { useMyNotificationPreferences } from '@/modules/notifications-admin/hooks/useNotificationData';

export interface SidebarBadgeCounts {
  pendingCompliance: number;
  unreadMessages: number;
  overdueTasks: number;
}

export function useSidebarBadgeCounts() {
  const query = useNotificationCenter();
  const preferences = useMyNotificationPreferences();
  const preferenceMap = new Map(
    (preferences.data ?? []).map((preference) => [preference.notification_type_key, preference.in_app_enabled]),
  );
  const isEnabled = (key: string) => preferenceMap.get(key) ?? true;
  const counts: SidebarBadgeCounts | undefined = query.data && !preferences.isLoading ? {
    pendingCompliance: isEnabled('sidebar_compliance') ? query.data.pendingCompliance.length : 0,
    unreadMessages: isEnabled('sidebar_messages') ? query.data.unreadMessages.length : 0,
    overdueTasks: isEnabled('sidebar_operational_tasks') ? query.data.overdueTasks.length : 0,
  } : undefined;
  return {
    ...query,
    data: counts,
    isLoading: query.isLoading || preferences.isLoading,
    isError: query.isError || preferences.isError,
  };
}