import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAlertScope } from '@/modules/notifications/hooks/useNotificationCenter';
import { alertOrFilter } from '@/modules/notifications/lib/alertScope';
import type { AlertCounts } from '@/modules/alerts/hooks/useAlerts';
import type { AlertSeverity } from '@/modules/alerts/constants';
import type { KpiTileProps } from '@/shared/components/data/KpiTile';

/** Alert states that still need someone (the alert engine's open set). */
export const OPEN_ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED'] as const;

const SEVERITIES: readonly AlertSeverity[] = ['RED', 'ORANGE', 'YELLOW', 'GREEN'];

export function countAlertsBySeverity(rows: ReadonlyArray<{ severity_color: string | null }>): AlertCounts {
  const counts: AlertCounts = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0, total: 0 };
  for (const row of rows) {
    const severity = row.severity_color as AlertSeverity;
    if (SEVERITIES.includes(severity)) {
      counts[severity] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/**
 * Why there is no number: the read failed (`read`, a Retry may help), or the
 * signed-in account has no company to count for (`no-company`, it cannot).
 */
export type OpenAlertCountsErrorReason = 'read' | 'no-company';

export type OpenAlertCountsState =
  | { status: 'loading'; counts: null }
  | { status: 'error'; reason: OpenAlertCountsErrorReason; counts: null }
  | { status: 'ready'; counts: AlertCounts };

/**
 * Open alert counts by severity for the fleet dashboard's KPI row.
 *
 * Scoped like the top-bar bell and the inbox (`useAlertScope`, D-90 / D-71):
 * outside `/v/:code` a viewer with fleet reach counts every open alert of the
 * company, anyone else the alerts of the vessels in their reach plus the
 * company-wide ones; inside `/v/:code`, that vessel's and the company-wide
 * ones. The VesselContext selection never narrows a fleet tile, so a tile
 * that says "across your fleet" counts the fleet, and agrees with the bell.
 *
 * The key keeps the `alert-counts` prefix, so acknowledging or snoozing an
 * alert (useAlerts' invalidations) refreshes the tiles; its literal `scope`
 * part keeps it apart from useAlerts' own four-part key, which caches a
 * different shape of the same counts.
 *
 * It never hands back zeros it did not read (D-04, no fake "all clear"):
 * nothing is read until auth, roles and the vessel list have loaded, and
 * until then, and while the query runs, the state is `loading`; a failed
 * read is `error` (reason `read`), so a tile can say why it has no number.
 * Once all of that has loaded, an account with no company (no company_id,
 * or a profile that could not be read) is `error` with reason `no-company`
 * (D-103): not zeros, not a skeleton that never clears, and nothing read.
 */
export function useOpenAlertCounts(): OpenAlertCountsState & { retry: () => void } {
  const { ready, settled, companyId, scope, scopeKey } = useAlertScope();

  const query = useQuery({
    queryKey: ['alert-counts', companyId ?? undefined, 'scope', scopeKey],
    queryFn: async (): Promise<AlertCounts> => {
      if (!companyId) throw new Error('No company to count alerts for');
      let request = supabase
        .from('alerts')
        .select('severity_color, status')
        .eq('company_id', companyId)
        .in('status', [...OPEN_ALERT_STATUSES]);
      const orFilter = alertOrFilter(scope);
      if (orFilter) request = request.or(orFilter);
      const { data, error } = await request;
      if (error) throw error;
      return countAlertsBySeverity(data ?? []);
    },
    enabled: ready,
  });

  // `refetch` ignores `enabled`, so a retry before access has loaded would
  // read with a scope that is not settled yet.
  const retry = () => {
    if (ready) void query.refetch();
  };
  if (!settled) return { status: 'loading', counts: null, retry };
  if (!companyId) return { status: 'error', reason: 'no-company', counts: null, retry };
  if (query.isError) return { status: 'error', reason: 'read', counts: null, retry };
  if (query.isPending || !query.data) return { status: 'loading', counts: null, retry };
  return { status: 'ready', counts: query.data, retry };
}

export const NO_COMPANY_MESSAGE = 'No company on your account';

/**
 * A KPI tile's state for these counts: the skeleton while loading; for an
 * error, why, with a Retry only where one can help (a failed read, not an
 * account with no company).
 */
export function alertKpiTileProps(
  alerts: OpenAlertCountsState & { retry: () => void },
): Pick<KpiTileProps, 'state' | 'errorMessage' | 'onRetry'> {
  if (alerts.status === 'ready') return { state: undefined, onRetry: alerts.retry };
  if (alerts.status === 'loading') return { state: 'loading', onRetry: alerts.retry };
  if (alerts.reason === 'no-company') return { state: 'error', errorMessage: NO_COMPANY_MESSAGE, onRetry: undefined };
  return { state: 'error', onRetry: alerts.retry };
}
