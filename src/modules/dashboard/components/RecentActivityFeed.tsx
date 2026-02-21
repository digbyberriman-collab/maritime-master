import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Activity, FileText, AlertTriangle, Award, 
  Users, Wrench, ClipboardCheck, CheckCircle,
  XCircle, Upload, Target
} from 'lucide-react';
import { useDashboardStore } from '@/modules/dashboard/store/dashboardStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { activityTypeConfig } from '@/modules/dashboard/types';

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  form_submitted: FileText,
  form_approved: CheckCircle,
  form_rejected: XCircle,
  incident_logged: AlertTriangle,
  incident_closed: CheckCircle,
  certificate_uploaded: Upload,
  certificate_expired: AlertTriangle,
  certificate_renewed: Award,
  crew_joined: Users,
  crew_left: Users,
  crew_status_changed: Users,
  drill_completed: Target,
  drill_overdue: AlertTriangle,
  maintenance_completed: Wrench,
  defect_raised: Wrench,
  defect_closed: CheckCircle,
  audit_completed: ClipboardCheck,
  nc_raised: AlertTriangle,
  nc_closed: CheckCircle,
  capa_opened: AlertTriangle,
  capa_closed: CheckCircle,
  alert_created: AlertTriangle,
  alert_acknowledged: CheckCircle,
  alert_resolved: CheckCircle,
  document_uploaded: Upload,
  task_completed: CheckCircle,
};

export const RecentActivityFeed: React.FC = () => {
  const { recentActivity, isAllVessels } = useDashboardStore();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Activity className="w-4 h-4 text-primary" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm font-medium">No recent activity</p>
            <p className="text-xs">Activity will appear here as actions are performed</p>
          </div>
        ) : (
          <ScrollArea className="h-[350px] pr-4">
            <div className="space-y-1">
              {recentActivity.map(item => {
                const Icon = activityIcons[item.activity_type] || Activity;
                const config = activityTypeConfig[item.activity_type] || { 
                  label: item.activity_type, 
                  color: 'text-muted-foreground' 
                };
                
                return (
                  <div 
                    key={item.id}
                    className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className={cn(
                      'flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0',
                      config.color.replace('text-', 'bg-').replace('-500', '-100'),
                      'dark:bg-opacity-20'
                    )}>
                      <Icon className={cn('w-4 h-4', config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {item.performed_by_name && (
                          <span>{item.performed_by_name}</span>
                        )}
                        {isAllVessels && item.vessel_name && (
                          <>
                            <span>•</span>
                            <span>{item.vessel_name}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
