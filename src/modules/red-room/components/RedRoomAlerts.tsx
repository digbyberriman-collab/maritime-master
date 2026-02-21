import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertCircle, 
  Eye, 
  CheckCircle, 
  UserPlus,
  ChevronRight,
  Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface RedAlert {
  id: string;
  type: 'incident' | 'medical' | 'manning' | 'safety' | 'certificate' | 'capa';
  vesselName: string;
  title: string;
  description: string;
  timestamp: string;
  severity: 'critical' | 'high';
  status: 'pending' | 'acknowledged' | 'in_progress';
  assignedTo?: string;
}

interface RedRoomAlertsProps {
  alerts: RedAlert[];
  onView: (alert: RedAlert) => void;
  onAcknowledge: (alert: RedAlert) => void;
  onAssign?: (alert: RedAlert) => void;
  onViewAll: () => void;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'incident':
      return '🔴';
    case 'medical':
      return '🏥';
    case 'manning':
      return '👥';
    case 'safety':
      return '⚠️';
    case 'certificate':
      return '📋';
    case 'capa':
      return '📝';
    default:
      return '🔴';
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'incident':
      return 'High-severity incident';
    case 'medical':
      return 'Medical emergency';
    case 'manning':
      return 'Minimum safe manning breach';
    case 'safety':
      return 'Safety concern';
    case 'certificate':
      return 'Certificate expired';
    case 'capa':
      return 'Critical CAPA overdue';
    default:
      return 'Alert';
  }
};

export const RedRoomAlerts: React.FC<RedRoomAlertsProps> = ({
  alerts,
  onView,
  onAcknowledge,
  onAssign,
  onViewAll,
}) => {
  if (alerts.length === 0) {
    return (
      <Card className="shadow-card border-success/30 bg-success/5">
        <CardContent className="py-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success" />
          <h3 className="font-semibold text-success">No Urgent Actions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            All critical items are under control
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5 animate-pulse" />
            RED ROOM - URGENT ACTIONS ({alerts.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            View All
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="bg-background rounded-lg border border-destructive/20 p-4 hover:border-destructive/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{getTypeIcon(alert.type)}</span>
                  <span className="font-semibold text-destructive">{alert.vesselName}:</span>
                  <span className="text-sm">{getTypeLabel(alert.type)}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {alert.description}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}</span>
                  {alert.assignedTo && (
                    <>
                      <span>•</span>
                      <span>Assigned to: {alert.assignedTo}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => onView(alert)}>
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
                {alert.status === 'pending' && (
                  <Button size="sm" variant="outline" onClick={() => onAcknowledge(alert)}>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Acknowledge
                  </Button>
                )}
                {onAssign && alert.status !== 'in_progress' && (
                  <Button size="sm" variant="outline" onClick={() => onAssign(alert)}>
                    <UserPlus className="w-4 h-4 mr-1" />
                    Assign
                  </Button>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Badge variant="destructive" className="text-xs">
                {alert.severity === 'critical' ? 'CRITICAL' : 'HIGH'}
              </Badge>
              <Badge 
                variant="outline" 
                className={
                  alert.status === 'pending' 
                    ? 'border-destructive text-destructive' 
                    : alert.status === 'acknowledged'
                    ? 'border-warning text-warning-foreground'
                    : 'border-primary text-primary'
                }
              >
                {alert.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default RedRoomAlerts;
