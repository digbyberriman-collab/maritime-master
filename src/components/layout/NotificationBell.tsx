import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVessel } from '@/contexts/VesselContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Bell, 
  AlertTriangle, 
  AlertCircle, 
  ChevronRight,
  Clock,
  Info,
  CheckCircle,
  Ship,
  Globe,
  ExternalLink,
  Check,
} from 'lucide-react';
import { formatDistanceToNow, isBefore, addDays, parseISO } from 'date-fns';
import type { AlertSeverity, AlertStatus } from '@/lib/alertConstants';
import { cn } from '@/lib/utils';

interface AlertItem {
  id: string;
  title: string;
  description: string | null;
  severity_color: AlertSeverity;
  status: AlertStatus;
  vessel_id: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  source_module: string | null;
  vessel?: { name: string } | null;
}

const HELPER_STORAGE_KEY = 'storm_alert_helper_shown';
const MAX_DROPDOWN_ALERTS = 20;
const REFRESH_INTERVAL_MS = 30000; // 30 seconds

const getSeverityConfig = (severity: AlertSeverity) => {
  switch (severity) {
    case 'RED':
      return {
        icon: AlertCircle,
        bgClass: 'bg-destructive/10',
        textClass: 'text-destructive',
        borderClass: 'border-l-destructive',
        label: 'Critical',
      };
    case 'ORANGE':
      return {
        icon: AlertTriangle,
        bgClass: 'bg-warning/10',
        textClass: 'text-warning',
        borderClass: 'border-l-warning',
        label: 'High Priority',
      };
    case 'YELLOW':
      return {
        icon: Clock,
        bgClass: 'bg-accent/20',
        textClass: 'text-accent-foreground',
        borderClass: 'border-l-accent',
        label: 'Upcoming',
      };
    case 'GREEN':
      return {
        icon: CheckCircle,
        bgClass: 'bg-success/10',
        textClass: 'text-success',
        borderClass: 'border-l-success',
        label: 'Info',
      };
    default:
      return {
        icon: Info,
        bgClass: 'bg-muted',
        textClass: 'text-muted-foreground',
        borderClass: 'border-l-muted',
        label: 'Unknown',
      };
  }
};

// Generate deep link based on module type
const getDeepLink = (alert: AlertItem): string => {
  const baseRoutes: Record<string, string> = {
    incident: '/incidents',
    certificate: '/certificates',
    drill: '/drills',
    audit: '/audits',
    maintenance: '/maintenance',
    capa: '/reports/capa-tracker',
    document: '/documents',
    crew: '/crew',
    training: '/training',
    form: '/ism/forms/submissions',
    risk_assessment: '/risk-assessments',
  };

  const module = alert.source_module?.toLowerCase() || alert.related_entity_type?.toLowerCase() || '';
  const entityId = alert.related_entity_id;

  // Try to match a base route
  for (const [key, route] of Object.entries(baseRoutes)) {
    if (module.includes(key)) {
      // If we have an entity ID, we could append it as a query param or path
      return entityId ? `${route}?id=${entityId}` : route;
    }
  }

  // Default to alerts page
  return '/alerts';
};

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { selectedVesselId, isAllVessels } = useVessel();
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showHelper, setShowHelper] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if helper has been shown before
  useEffect(() => {
    const hasSeenHelper = localStorage.getItem(HELPER_STORAGE_KEY);
    if (!hasSeenHelper) {
      setShowHelper(true);
    }
  }, []);

  const dismissHelper = () => {
    localStorage.setItem(HELPER_STORAGE_KEY, 'true');
    setShowHelper(false);
  };

  const loadAlerts = async () => {
    if (!profile?.company_id) return;

    try {
      let query = supabase
        .from('alerts')
        .select(`
          id,
          title,
          description,
          severity_color,
          status,
          vessel_id,
          due_at,
          created_at,
          updated_at,
          related_entity_type,
          related_entity_id,
          source_module,
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .in('status', ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED'])
        .order('severity_color', { ascending: true }) // RED first
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(MAX_DROPDOWN_ALERTS);

      // Apply vessel filter if not in "All Vessels" mode
      if (!isAllVessels && selectedVesselId) {
        query = query.or(`vessel_id.eq.${selectedVesselId},vessel_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setAlerts((data as AlertItem[]) || []);
      
      // Calculate unread (OPEN) count
      const openCount = (data || []).filter(a => a.status === 'OPEN').length;
      setUnreadCount(openCount);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load and polling
  useEffect(() => {
    loadAlerts();

    // Set up polling interval
    const interval = setInterval(loadAlerts, REFRESH_INTERVAL_MS);

    // Set up realtime subscription for immediate updates
    const subscription = supabase
      .channel('alerts-bell')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
        },
        () => {
          loadAlerts();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [profile?.company_id, selectedVesselId, isAllVessels]);

  // Categorize alerts
  const categorizedAlerts = useMemo(() => {
    const now = new Date();
    const upcomingThreshold = addDays(now, 7);

    const urgent: AlertItem[] = [];
    const overdue: AlertItem[] = [];
    const upcoming: AlertItem[] = [];
    const info: AlertItem[] = [];

    alerts.forEach((alert) => {
      // RED severity is always urgent
      if (alert.severity_color === 'RED') {
        urgent.push(alert);
        return;
      }

      // Check if overdue based on due_at
      if (alert.due_at) {
        const dueDate = parseISO(alert.due_at);
        if (isBefore(dueDate, now)) {
          overdue.push(alert);
          return;
        }
        // Upcoming if within threshold
        if (isBefore(dueDate, upcomingThreshold)) {
          upcoming.push(alert);
          return;
        }
      }

      // ORANGE goes to overdue section, YELLOW to upcoming
      if (alert.severity_color === 'ORANGE') {
        overdue.push(alert);
      } else if (alert.severity_color === 'YELLOW') {
        upcoming.push(alert);
      } else {
        info.push(alert);
      }
    });

    return { urgent, overdue, upcoming, info };
  }, [alerts]);

  const handleAlertClick = (alert: AlertItem) => {
    setIsOpen(false);
    const link = getDeepLink(alert);
    navigate(link);
  };

  const handleAcknowledge = async (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    if (!profile?.user_id) return;

    try {
      await supabase
        .from('alerts')
        .update({
          status: 'ACKNOWLEDGED' as AlertStatus,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: profile.user_id,
        })
        .eq('id', alertId);

      // Refresh alerts
      loadAlerts();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const renderAlertRow = (alert: AlertItem) => {
    const config = getSeverityConfig(alert.severity_color);
    const Icon = config.icon;
    const vesselName = alert.vessel?.name || (alert.vessel_id ? 'Unknown Vessel' : 'Fleet');
    const timeAgo = formatDistanceToNow(parseISO(alert.created_at), { addSuffix: true });
    const isAcknowledged = alert.status === 'ACKNOWLEDGED';

    return (
      <div
        key={alert.id}
        onClick={() => handleAlertClick(alert)}
        className={cn(
          'flex items-start gap-3 p-3 cursor-pointer transition-colors border-l-4',
          config.borderClass,
          'hover:bg-muted/50'
        )}
      >
        <div className={cn('p-1.5 rounded-full flex-shrink-0', config.bgClass)}>
          <Icon className={cn('w-4 h-4', config.textClass)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{alert.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {alert.vessel_id ? (
                <Ship className="w-3 h-3" />
              ) : (
                <Globe className="w-3 h-3" />
              )}
              {vesselName}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
          {alert.due_at && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Due: {new Date(alert.due_at).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isAcknowledged && alert.severity_color !== 'GREEN' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => handleAcknowledge(e, alert.id)}
              title="Acknowledge"
            >
              <Check className="w-4 h-4" />
            </Button>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    );
  };

  const renderSection = (title: string, alertsList: AlertItem[], severity: 'urgent' | 'overdue' | 'upcoming' | 'info') => {
    if (alertsList.length === 0) return null;

    const colors = {
      urgent: 'text-destructive',
      overdue: 'text-warning',
      upcoming: 'text-accent-foreground',
      info: 'text-success',
    };

    return (
      <div className="py-2">
        <div className="px-3 py-1.5 flex items-center gap-2">
          <span className={cn('text-xs font-semibold uppercase tracking-wider', colors[severity])}>
            {title}
          </span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            {alertsList.length}
          </Badge>
        </div>
        <div className="divide-y divide-border">
          {alertsList.map(renderAlertRow)}
        </div>
      </div>
    );
  };

  const totalAlerts = alerts.length;
  const hasAlerts = totalAlerts > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        className="w-96 p-0 bg-popover"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground">Alerts</span>
          </div>
          {totalAlerts > 0 && (
            <Badge variant="outline" className="text-xs">
              {unreadCount} open
            </Badge>
          )}
        </div>

        {/* Helper text for first-time users */}
        {showHelper && hasAlerts && (
          <div className="px-4 py-2 bg-primary/5 border-b border-border flex items-start gap-2">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">
                Quick view: urgent and overdue items. Click an alert to jump directly to the record.
              </p>
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs text-primary"
                onClick={dismissHelper}
              >
                Got it
              </Button>
            </div>
          </div>
        )}

        {/* Alert sections */}
        {hasAlerts ? (
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y divide-border">
              {renderSection('Urgent', categorizedAlerts.urgent, 'urgent')}
              {renderSection('Overdue', categorizedAlerts.overdue, 'overdue')}
              {renderSection('Upcoming', categorizedAlerts.upcoming, 'upcoming')}
              {renderSection('Info', categorizedAlerts.info, 'info')}
            </div>
          </ScrollArea>
        ) : (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <Bell className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No open alerts</p>
            <p className="text-xs text-muted-foreground mt-1">
              All systems operating normally
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center"
            onClick={() => {
              setIsOpen(false);
              navigate('/alerts');
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View all alerts
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
