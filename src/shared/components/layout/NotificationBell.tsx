/**
 * The notification bell in the top bar (gap/10 top bar element 8, IA15; spec
 * §2.1): the latest 20 alerts in reach and "Open inbox". The badge counts open
 * alerts and takes the critical tone when any open alert is RED (critical =
 * destructive, D-57), else Signal; only the critical badge pulses, and not
 * under reduced motion. While the list loads or after an error the panel says
 * so; it never reads a failed load as "no alerts".
 *
 * The open state is the shell's (`ShellActions.openNotifications` opens it
 * from the command palette); outside a shell it keeps its own.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Inbox,
  Check,
  Loader2,
  RotateCw,
} from 'lucide-react';
import { formatDistanceToNow, isBefore, addDays, parseISO } from 'date-fns';
import type { AlertSeverity, AlertStatus } from '@/modules/alerts/constants';
import { cn } from '@/lib/utils';
import { ALERT_SEVERITY_TONE } from '@/modules/notifications/lib/alertSeverityTone';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useShellSurface } from '@/app/shell/shellUi';
import { topBarIconButton } from '@/shared/components/layout/topbar/styles';

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
/** The personal inbox (all notifications for the signed-in user). */
const INBOX_PATH = '/inbox';
const REFRESH_INTERVAL_MS = 30000; // 30 seconds

const getSeverityConfig = (severity: AlertSeverity) => {
  switch (severity) {
    case 'RED':
      return {
        icon: AlertCircle,
        bgClass: ALERT_SEVERITY_TONE.RED.tint,
        textClass: ALERT_SEVERITY_TONE.RED.text,
        borderClass: ALERT_SEVERITY_TONE.RED.borderLeft,
        label: 'Critical',
      };
    case 'ORANGE':
      return {
        icon: AlertTriangle,
        bgClass: ALERT_SEVERITY_TONE.ORANGE.tint,
        textClass: ALERT_SEVERITY_TONE.ORANGE.text,
        borderClass: ALERT_SEVERITY_TONE.ORANGE.borderLeft,
        label: 'High Priority',
      };
    case 'YELLOW':
      return {
        icon: Clock,
        bgClass: ALERT_SEVERITY_TONE.YELLOW.tint,
        textClass: ALERT_SEVERITY_TONE.YELLOW.text,
        borderClass: ALERT_SEVERITY_TONE.YELLOW.borderLeft,
        label: 'Upcoming',
      };
    case 'GREEN':
      return {
        icon: CheckCircle,
        bgClass: ALERT_SEVERITY_TONE.GREEN.tint,
        textClass: ALERT_SEVERITY_TONE.GREEN.text,
        borderClass: ALERT_SEVERITY_TONE.GREEN.borderLeft,
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
  return '/notifications/center';
};

export interface NotificationBellProps {
  /** Controlled open state; defaults to the shell's. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ open, onOpenChange, className }) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { selectedVesselId, isAllVessels } = useVessel();
  const [shellOpen, setShellOpen] = useShellSurface('notifications');
  const isOpen = open ?? shellOpen;
  const setIsOpen = useCallback((next: boolean) => (onOpenChange ?? setShellOpen)(next), [onOpenChange, setShellOpen]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [criticalUnread, setCriticalUnread] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  // Check if helper has been shown before
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(HELPER_STORAGE_KEY)) setShowHelper(true);
    } catch {
      /* storage unavailable: no first-run hint */
    }
  }, []);

  const dismissHelper = () => {
    try {
      window.localStorage.setItem(HELPER_STORAGE_KEY, 'true');
    } catch {
      /* storage unavailable: the hint comes back next time */
    }
    setShowHelper(false);
  };

  const companyId = profile?.company_id ?? null;
  const loadAlerts = useCallback(async () => {
    if (!companyId) return;

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
        .eq('company_id', companyId)
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

      const rows = (data as AlertItem[]) || [];
      setAlerts(rows);
      // Unread = OPEN. Critical tone when any unread alert is RED.
      const open = rows.filter((a) => a.status === 'OPEN');
      setUnreadCount(open.length);
      setCriticalUnread(open.some((a) => a.severity_color === 'RED'));
      setLoadFailed(false);
    } catch (error) {
      console.error('Failed to load alerts:', error);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, isAllVessels, selectedVesselId]);

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
  }, [loadAlerts]);

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
        role="link"
        tabIndex={0}
        onClick={() => handleAlertClick(alert)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target === event.currentTarget) handleAlertClick(alert);
        }}
        className={cn(
          'flex items-start gap-3 p-3 cursor-pointer transition-colors border-l-4 border-b border-b-border last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
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
              className="h-7 w-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
              onClick={(e) => handleAcknowledge(e, alert.id)}
              aria-label={`Acknowledge ${alert.title}`}
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
      urgent: ALERT_SEVERITY_TONE.RED.text,
      overdue: ALERT_SEVERITY_TONE.ORANGE.text,
      upcoming: ALERT_SEVERITY_TONE.YELLOW.text,
      info: ALERT_SEVERITY_TONE.GREEN.text,
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
        {/* Row separators set only the bottom edge, so each row keeps its severity bar on the left. */}
        <div>
          {alertsList.map(renderAlertRow)}
        </div>
      </div>
    );
  };

  const totalAlerts = alerts.length;
  const hasAlerts = totalAlerts > 0;

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={SHELL_TEST_IDS.notificationsTrigger}
          className={cn(topBarIconButton, 'relative', className)}
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread${criticalUnread ? ', including critical' : ''}`
              : 'Notifications'
          }
        >
          <Bell strokeWidth={1.75} aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              data-tone={criticalUnread ? 'critical' : 'primary'}
              className={cn(
                'absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ring-2 ring-background',
                criticalUnread ? 'bg-critical text-critical-foreground motion-safe:animate-pulse' : 'bg-primary text-primary-foreground',
              )}
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] p-0 bg-popover"
        sideOffset={8}
        data-testid={SHELL_TEST_IDS.notificationsPanel}
        aria-label="Notifications"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" strokeWidth={1.75} aria-hidden="true" />
            <span className="type-subtitle text-foreground">Alerts</span>
          </div>
          {!isLoading && !loadFailed && totalAlerts > 0 && (
            <Badge variant="outline" className="text-xs">
              {unreadCount} open
            </Badge>
          )}
        </div>

        {/* Helper text for first-time users */}
        {showHelper && hasAlerts && (
          <div className="px-4 py-2 bg-muted border-b border-border flex items-start gap-2">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
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
        {isLoading && !hasAlerts ? (
          <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            Loading alerts…
          </div>
        ) : loadFailed && !hasAlerts ? (
          <div role="alert" className="p-6 text-center">
            <p className="text-sm font-medium text-foreground">Alerts could not load</p>
            <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => void loadAlerts()}>
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : hasAlerts ? (
          // A plain scroller: the ScrollArea viewport lays rows out at their
          // natural width, so long titles would not truncate.
          <div className="max-h-[min(400px,60dvh)] overflow-y-auto overflow-x-hidden overscroll-contain">
            <div className="divide-y divide-border">
              {renderSection('Urgent', categorizedAlerts.urgent, 'urgent')}
              {renderSection('Overdue', categorizedAlerts.overdue, 'overdue')}
              {renderSection('Upcoming', categorizedAlerts.upcoming, 'upcoming')}
              {renderSection('Info', categorizedAlerts.info, 'info')}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <Bell className="w-6 h-6 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-foreground">No open alerts</p>
            <p className="text-xs text-muted-foreground mt-1">
              New alerts for your vessels appear here.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center [@media(pointer:coarse)]:h-11"
            onClick={() => {
              setIsOpen(false);
              navigate(INBOX_PATH);
            }}
          >
            <Inbox className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
            Open inbox
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
