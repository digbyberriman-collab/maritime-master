import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Clock, CheckCircle2 } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboardStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const severityConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  red: { color: 'bg-destructive', bgColor: 'bg-destructive/10', label: 'Critical' },
  orange: { color: 'bg-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-950/30', label: 'High' },
  yellow: { color: 'bg-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-950/30', label: 'Warning' },
  green: { color: 'bg-green-500', bgColor: 'bg-green-50 dark:bg-green-950/30', label: 'Info' },
};

export const AlertsTriagePanel: React.FC = () => {
  const { alerts, isAllVessels } = useDashboardStore();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          Active Alerts
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/alerts" className="flex items-center gap-1">
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mb-2 text-green-500" />
            <p className="text-sm font-medium">No open alerts</p>
            <p className="text-xs">All systems operational</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 8).map(alert => {
              const severity = severityConfig[alert.severity] || severityConfig.yellow;
              return (
                <Link
                  key={alert.id}
                  to={`/alerts?id=${alert.id}`}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-muted/50',
                    severity.bgColor
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', severity.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{alert.title}</p>
                      {alert.is_overdue && (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0">
                          Overdue
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {alert.source_module && (
                        <span className="capitalize">{alert.source_module}</span>
                      )}
                      {isAllVessels && alert.vessel_name && (
                        <>
                          <span>•</span>
                          <span>{alert.vessel_name}</span>
                        </>
                      )}
                      {alert.due_at && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Due: {new Date(alert.due_at).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
