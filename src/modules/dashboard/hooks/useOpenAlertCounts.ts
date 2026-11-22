import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import type { AlertCounts } from '@/modules/alerts/hooks/useAlerts';
import type { AlertSeverity } from '@/modules/alerts/constants';

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

export type OpenAlertCountsState =
  | { status: 'loading'; counts: null }
  | { status: 'error'; counts: null }
  | { status: 'ready'; counts: AlertCounts };

/**
 * Open alert counts by severity for the fleet dashboard's KPI row.
 *
 * Same query and cache key as `useAlerts().alertCounts`, so acknowledging or
 * snoozing an alert anywhere refreshes the tiles. Unlike that hook it never
 * hands back zeros it did not read: while the query runs (or cannot run yet,
 * before the profile arrives) the state is `loading`, and a failed read is
 * `error`, so a tile can say why it has no number (D-04, no fake "all clear").
 */
export function useOpenAlertCounts(): OpenAlertCountsState & { retry: () => void } {
  const { profile } = useAuth();
  const { selectedVesselId, isAllVessels } = useVessel();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: ['alert-counts', companyId ?? undefined, selectedVesselId, isAllVessels],
    queryFn: async (): Promise<AlertCounts> => {
      if (!companyId) return countAlertsBySeverity([]);
      let request = supabase
        .from('alerts')
        .select('severity_color, status')
        .eq('company_id', companyId)
        .in('status', [...OPEN_ALERT_STATUSES]);
      if (!isAllVessels && selectedVesselId) {
        request = request.eq('vessel_id', selectedVesselId);
      }
      const { data, error } = await request;
      if (error) throw error;
      return countAlertsBySeverity(data ?? []);
    },
    enabled: Boolean(companyId),
  });

  const retry = () => {
    void query.refetch();
  };
  if (query.isError) return { status: 'error', counts: null, retry };
  if (query.isPending || !query.data) return { status: 'loading', counts: null, retry };
  return { status: 'ready', counts: query.data, retry };
}
