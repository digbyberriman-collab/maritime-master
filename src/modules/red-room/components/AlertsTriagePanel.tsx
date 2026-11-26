/**
 * "Active alerts" on the vessel home (BUILD-PLAN Phase 1 open item: no fake
 * all-clear; DECISIONS D-04). It reads this vessel's open alerts itself
 * (`get_dashboard_alerts` for one vessel, most urgent first) instead of the
 * shared dashboard store, which answered for every vessel of a fleet user
 * even inside one vessel's scope.
 *
 * - Loading: skeleton rows.
 * - A failed read: an error with Retry, never "no alerts".
 * - "No open alerts" only after a successful read that returned none.
 * - A row the RPC returns for another vessel is dropped (the answer must be
 *   this vessel's; nothing from elsewhere is shown on its home).
 *
 * The query key sits under the dashboard's company key, so the vessel
 * home's Refresh reads it again. Tokens only.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE_FILL, type Tone } from '@/components/ui/tones';
import { cn } from '@/lib/utils';
import { PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { dashboardKeys } from '@/modules/dashboard/hooks/useFleetDashboard';

/** Alert severities (`alerts.severity`) as tones; anything else is neutral, never guessed. */
const SEVERITY: Readonly<Record<string, { tone: Tone; label: string }>> = {
  red: { tone: 'danger', label: 'Critical' },
  orange: { tone: 'orange', label: 'High' },
  yellow: { tone: 'warn', label: 'Warning' },
  green: { tone: 'ok', label: 'Information' },
};

const DEFAULT_LIMIT = 8;

interface VesselAlertRow {
  id: string;
  title: string;
  severity: string;
  source_module: string | null;
  due_at: string | null;
  is_overdue: boolean;
  vessel_id: string | null;
}

/** "26 Nov 2026" in the reader's locale-neutral en-GB form. */
const formatDue = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export interface AlertsTriagePanelProps {
  companyId: string;
  vesselId: string;
  /** Rows shown (default 8). */
  limit?: number;
}

export const AlertsTriagePanel: React.FC<AlertsTriagePanelProps> = ({ companyId, vesselId, limit = DEFAULT_LIMIT }) => {
  const headingId = React.useId();
  const query = useQuery({
    queryKey: [...dashboardKeys.company(companyId), 'vessel-alerts', vesselId, limit] as const,
    queryFn: async (): Promise<VesselAlertRow[]> => {
      const { data, error } = await supabase.rpc('get_dashboard_alerts', {
        p_company_id: companyId,
        p_vessel_id: vesselId,
        p_all_vessels: false,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? [])
        .filter((row) => row.vessel_id === vesselId)
        .map((row) => ({
          id: row.id,
          title: row.title,
          severity: row.severity,
          source_module: row.source_module ?? null,
          due_at: row.due_at ?? null,
          is_overdue: Boolean(row.is_overdue),
          vessel_id: row.vessel_id,
        }));
    },
    retry: 1,
    staleTime: 30_000,
  });

  let body: React.ReactNode;
  if (query.isError) {
    body = (
      <PageError
        variant="inline"
        title="This vessel's alerts could not load"
        error={query.error}
        onRetry={() => void query.refetch()}
        headingLevel={3}
        treatMissingAsOff={false}
      />
    );
  } else if (!query.data) {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">Loading this vessel's alerts</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (query.data.length === 0) {
    body = (
      <div className="py-6 text-center" data-testid="alerts-empty">
        <p className="text-sm font-medium text-foreground">No open alerts</p>
        <p className="text-xs text-muted-foreground">Nothing is waiting on this vessel right now.</p>
      </div>
    );
  } else {
    body = (
      <ul className="space-y-1">
        {query.data.map((alert) => {
          const severity = SEVERITY[alert.severity] ?? { tone: 'neutral' as Tone, label: alert.severity };
          return (
            <li key={alert.id}>
              <Link
                to={`/alerts?id=${encodeURIComponent(alert.id)}`}
                className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-quick ease-tide hover:bg-accent/40 focus-ring"
              >
                <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', TONE_FILL[severity.tone])} />
                <span className="sr-only">{severity.label}: </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{alert.title}</span>
                    {alert.is_overdue ? <StatusPill tone="danger" label="Overdue" /> : null}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {alert.source_module ? <span className="capitalize">{alert.source_module}</span> : null}
                    {alert.due_at ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden="true" className="h-3 w-3" />
                        Due {formatDue(alert.due_at)}
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card role="region" aria-labelledby={headingId} className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <h2 id={headingId} className="flex items-center gap-2 type-subtitle text-foreground">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-critical" />
          Active alerts
        </h2>
        <Link
          to="/notifications/center"
          className="inline-flex min-h-8 items-center gap-0.5 rounded-sm px-1 type-caption font-medium text-primary underline-offset-2 hover:underline focus-ring [@media(pointer:coarse)]:min-h-11"
          aria-label="View all alerts"
        >
          View all
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
};

export default AlertsTriagePanel;
