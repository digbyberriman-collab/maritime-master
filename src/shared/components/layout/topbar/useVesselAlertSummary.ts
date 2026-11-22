/**
 * Open alerts per vessel for the scope control's compliance dot and the
 * vessel switcher's alert pills (gap/10 top bar elements 2 and 3; spec §2.1).
 *
 * One query over the user's reachable vessels: `alerts` with status OPEN,
 * `vessel_id` and `severity_color` only, RED first (as the bell orders them),
 * scoped to the company. PostgREST caps a response at 1000 rows; a full
 * response is marked `truncated`, so callers show counts as `n+` and never
 * read a vessel missing from it as "no alerts". While loading or after an
 * error there is no summary at all: no pills and no dots, never a 0.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { AlertSeverity } from '@/modules/alerts/constants';

export const ALERT_SUMMARY_ROW_CAP = 1000;

/** Worst first: the order the bell and the database sort severities in. */
export const SEVERITY_ORDER: readonly AlertSeverity[] = ['RED', 'ORANGE', 'YELLOW', 'GREEN'];

export interface VesselAlertCount {
  open: number;
  worst: AlertSeverity;
}

export type VesselAlertSummary =
  | { status: 'loading' | 'error'; truncated: false; byVessel: ReadonlyMap<string, VesselAlertCount> }
  | { status: 'ready'; truncated: boolean; byVessel: ReadonlyMap<string, VesselAlertCount> };

const EMPTY: ReadonlyMap<string, VesselAlertCount> = new Map();

const isSeverity = (value: unknown): value is AlertSeverity =>
  typeof value === 'string' && (SEVERITY_ORDER as readonly string[]).includes(value);

/** Count rows per vessel and keep the worst severity (pure; exported for tests). */
export function summariseAlerts(rows: readonly { vessel_id: string | null; severity_color: string | null }[]): Map<string, VesselAlertCount> {
  const out = new Map<string, VesselAlertCount>();
  for (const row of rows) {
    if (!row.vessel_id || !isSeverity(row.severity_color)) continue;
    const prev = out.get(row.vessel_id);
    if (!prev) {
      out.set(row.vessel_id, { open: 1, worst: row.severity_color });
      continue;
    }
    const worse = SEVERITY_ORDER.indexOf(row.severity_color) < SEVERITY_ORDER.indexOf(prev.worst);
    out.set(row.vessel_id, { open: prev.open + 1, worst: worse ? row.severity_color : prev.worst });
  }
  return out;
}

export function useVesselAlertSummary(vesselIds: readonly string[]): VesselAlertSummary {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const ids = useMemo(() => Array.from(new Set(vesselIds)).sort(), [vesselIds]);
  const query = useQuery({
    queryKey: ['shell', 'vessel-alerts', companyId, ...ids],
    enabled: Boolean(companyId) && ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('vessel_id, severity_color')
        .eq('company_id', companyId as string)
        .eq('status', 'OPEN')
        .in('vessel_id', ids)
        .order('severity_color', { ascending: true })
        .limit(ALERT_SUMMARY_ROW_CAP);
      if (error) throw error;
      const rows = data ?? [];
      return { truncated: rows.length >= ALERT_SUMMARY_ROW_CAP, byVessel: summariseAlerts(rows) };
    },
  });

  return useMemo<VesselAlertSummary>(() => {
    if (query.isError) return { status: 'error', truncated: false, byVessel: EMPTY };
    if (!query.data) return { status: 'loading', truncated: false, byVessel: EMPTY };
    return { status: 'ready', truncated: query.data.truncated, byVessel: query.data.byVessel };
  }, [query.isError, query.data]);
}
