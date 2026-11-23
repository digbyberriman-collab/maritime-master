/**
 * The alerts bell: today's bell, kept as the fallback while
 * `notification_inbox` is not in the database (D-01; Phase 2 spec §B.7).
 * src/shared/components/layout/NotificationBell.tsx uses it ONLY when the
 * inbox reads answer "table missing" (any other inbox error shows the inbox
 * panel's error with Retry): `useAlertsBell(enabled)` (../hooks/useAlertsBell.ts)
 * reads the badge counts and the panel list, and `AlertsBellPanel` is the panel. The bell keeps one
 * trigger and one popover for both sources. It reads the `alerts` table: the
 * latest 20 open alerts in the viewer's alert scope and "Open inbox".
 *
 * Scope (`useAlertScope`, shared with /inbox's Attention tab; D-71): the
 * route's vessel inside `/v/:code` (named in the panel header), else the
 * whole company for fleet reach, else the vessels in reach. Nothing is read
 * until access and the vessel list have loaded, and a null selection never
 * widens the scope (D-04). Every read is keyed by the scope, so a response
 * for an earlier scope never shows.
 *
 * The badge counts unacknowledged alerts (status OPEN; the Fleet KPI tiles
 * count every open status, so the bell says "unacknowledged", never
 * "open"): two head counts (unacknowledged, unacknowledged RED), not the
 * 20-row panel list. Critical tone when any is RED (critical = destructive,
 * D-57), else Signal; only the critical badge pulses, and not under reduced
 * motion. No badge until the counts are in; if the counts fail but the list
 * loaded, the list's OPEN row count (`<n>+` when the list is full, and no
 * badge when a full list holds no OPEN row: the count is then unknown,
 * D-91). While the list loads or after an error the panel says so; it never
 * reads a failed load as "no alerts". A failed Acknowledge says so.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { notify } from '@/shared/lib/notify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ALERTS_BELL_QUERY_KEY, type AlertItem, type AlertsBellData } from '../hooks/useAlertsBell';

const HELPER_STORAGE_KEY = 'storm_alert_helper_shown';
/** The personal inbox; its Attention tab is today's Notification Center (D-62). */
const INBOX_PATH = '/inbox?tab=attention';

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

  // Default to the inbox's Attention tab (today's Notification Center, D-62)
  return INBOX_PATH;
};

export interface AlertsBellPanelProps {
  data: AlertsBellData;
  onClose: () => void;
  /** Focus the first alert row, else the panel. */
  focusPanelStart: () => void;
}

/** The alerts panel, mounted while the bell is open. */
export function AlertsBellPanel({ data, onClose, focusPanelStart }: AlertsBellPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { ready, vesselName, list, badge } = data;
  const [showHelper, setShowHelper] = useState(false);
  const [acknowledging, setAcknowledging] = useState<ReadonlySet<string>>(() => new Set());
  const acknowledgingRef = useRef(new Set<string>());

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
    // Move focus before the button goes, so it stays in the panel.
    focusPanelStart();
    setShowHelper(false);
  };

  const alerts = useMemo(() => list.data ?? [], [list.data]);
  const isLoading = !ready || list.isPending;
  const loadFailed = list.isError;

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
    onClose();
    navigate(getDeepLink(alert));
  };

  const handleAcknowledge = async (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    if (!profile?.user_id || acknowledgingRef.current.has(alertId)) return;
    // One write per alert at a time: a second click waits for the first.
    acknowledgingRef.current.add(alertId);
    setAcknowledging(new Set(acknowledgingRef.current));
    const failed = (error: unknown) =>
      notify.error(error, {
        title: 'Could not acknowledge the alert',
        fallback: "That alert wasn't acknowledged. You may not have access to it.",
      });

    try {
      const { data, error } = await supabase
        .from('alerts')
        .update({
          status: 'ACKNOWLEDGED' as AlertStatus,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: profile.user_id,
        })
        .eq('id', alertId)
        .select('id');
      // No row back: RLS hid it, or it is gone. Either way it was not acknowledged.
      if (error || !data?.length) failed(error ?? new Error('not acknowledged'));
    } catch (error) {
      failed(error);
    } finally {
      acknowledgingRef.current.delete(alertId);
      setAcknowledging(new Set(acknowledgingRef.current));
      void queryClient.invalidateQueries({ queryKey: ALERTS_BELL_QUERY_KEY });
    }
  };

  const renderAlertRow = (alert: AlertItem) => {
    const config = getSeverityConfig(alert.severity_color);
    const Icon = config.icon;
    const rowVesselName = alert.vessel?.name || (alert.vessel_id ? 'Unknown Vessel' : 'Fleet');
    const timeAgo = formatDistanceToNow(parseISO(alert.created_at), { addSuffix: true });
    const isAcknowledged = alert.status === 'ACKNOWLEDGED';
    const pending = acknowledging.has(alert.id);

    return (
      <div
        key={alert.id}
        data-alert-row=""
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
              {rowVesselName}
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
              className="h-7 w-7 aria-disabled:cursor-wait aria-disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
              onClick={(e) => void handleAcknowledge(e, alert.id)}
              // aria-disabled, not disabled: the button keeps focus while the write runs.
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
              aria-label={`Acknowledge ${alert.title}`}
              title="Acknowledge"
            >
              {pending ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
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

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex min-w-0 items-center gap-2">
          <Bell className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
          <span className="type-subtitle truncate text-foreground">
            Alerts
            {vesselName && (
              <>
                <span className="text-muted-foreground"> · </span>
                <span className="font-display">{vesselName}</span>
              </>
            )}
          </span>
        </div>
        {!isLoading && !loadFailed && totalAlerts > 0 && badge && (
          <Badge variant="outline" className="shrink-0 text-xs">
            {badge.label} unacknowledged
          </Badge>
        )}
      </div>

      {/* Helper text for first-time users */}
      {showHelper && hasAlerts && (
        <div className="shrink-0 px-4 py-2 bg-muted border-b border-border flex items-start gap-2">
          <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              Quick view: urgent and overdue items. Click an alert to jump directly to the record.
            </p>
            <Button
              variant="link"
              size="sm"
              className="h-auto md:h-auto p-0 text-xs text-primary [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:justify-start"
              onClick={dismissHelper}
            >
              Got it
            </Button>
          </div>
        </div>
      )}

      {/* Alert sections */}
      {isLoading && !hasAlerts ? (
        <div role="status" className="flex shrink-0 items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          Loading alerts…
        </div>
      ) : loadFailed && !hasAlerts ? (
        <div role="alert" className="shrink-0 p-6 text-center">
          <p className="text-sm font-medium text-foreground">Alerts could not load</p>
          <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ALERTS_BELL_QUERY_KEY })}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : hasAlerts ? (
        // A plain scroller: the ScrollArea viewport lays rows out at their
        // natural width, so long titles would not truncate. Up to 400 px, and
        // it shrinks (never grows) when the panel is capped by the viewport.
        <div className="min-h-0 max-h-[400px] shrink overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="divide-y divide-border">
            {renderSection('Urgent', categorizedAlerts.urgent, 'urgent')}
            {renderSection('Overdue', categorizedAlerts.overdue, 'overdue')}
            {renderSection('Upcoming', categorizedAlerts.upcoming, 'upcoming')}
            {renderSection('Info', categorizedAlerts.info, 'info')}
          </div>
        </div>
      ) : (
        <div className="shrink-0 p-8 text-center">
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
      <div className="shrink-0 px-4 py-3 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center [@media(pointer:coarse)]:h-11"
          onClick={() => {
            onClose();
            navigate(INBOX_PATH);
          }}
        >
          <Inbox className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
          Open inbox
        </Button>
      </div>
    </>
  );
}
