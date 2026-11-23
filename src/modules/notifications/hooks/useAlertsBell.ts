/**
 * The alerts bell's reads (the top-bar bell's fallback while
 * `notification_inbox` is missing, D-01): the latest 20 open-status alerts
 * in the viewer's alert scope and two head counts (unacknowledged, and
 * unacknowledged RED) for the badge, with a realtime channel on `alerts`.
 * Nothing is read while `enabled` is false or access and the vessel list
 * load (D-04); every read is keyed by the scope (D-71). The badge rules are
 * D-91's. The panel is ../components/AlertsBell.tsx.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AlertSeverity, AlertStatus } from '@/modules/alerts/constants';
import { useAlertScope } from './useNotificationCenter';
import { alertOrFilter } from '../lib/alertScope';
import { exactBadge, floorBadge, type BellBadge } from '../lib/bellBadge';

export interface AlertItem {
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

const MAX_DROPDOWN_ALERTS = 20;
const REFRESH_INTERVAL_MS = 30000; // 30 seconds
const OPEN_STATUSES: readonly AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED'];

/** Every alerts-bell read starts with this key; the realtime channel invalidates it. */
export const ALERTS_BELL_QUERY_KEY = ['shell', 'bell'] as const;

interface BellCounts {
  open: number;
  critical: number;
}

export interface AlertsBellData {
  /** Access and the vessel list have loaded (the alert scope is final). */
  ready: boolean;
  vesselName: string | null;
  list: UseQueryResult<AlertItem[]>;
  badge: BellBadge | null;
}

/** The alerts bell's reads (nothing while `enabled` is false or access loads, D-04). */
export function useAlertsBell(enabled: boolean): AlertsBellData {
  const queryClient = useQueryClient();
  const { ready: scopeReady, companyId, scope, scopeKey, vesselName } = useAlertScope();
  const ready = enabled && scopeReady;
  const orFilter = alertOrFilter(scope);

  const list = useQuery({
    queryKey: [...ALERTS_BELL_QUERY_KEY, 'list', companyId, scopeKey],
    enabled: ready,
    refetchInterval: REFRESH_INTERVAL_MS,
    queryFn: async (): Promise<AlertItem[]> => {
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
        .eq('company_id', companyId as string)
        .in('status', OPEN_STATUSES)
        .order('severity_color', { ascending: true }) // RED first
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(MAX_DROPDOWN_ALERTS);
      if (orFilter) query = query.or(orFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data as AlertItem[] | null) ?? [];
    },
  });

  const counts = useQuery({
    queryKey: [...ALERTS_BELL_QUERY_KEY, 'counts', companyId, scopeKey],
    enabled: ready,
    refetchInterval: REFRESH_INTERVAL_MS,
    queryFn: async (): Promise<BellCounts> => {
      const openAlerts = () => {
        const query = supabase
          .from('alerts')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId as string)
          .eq('status', 'OPEN');
        return orFilter ? query.or(orFilter) : query;
      };
      const [all, red] = await Promise.all([openAlerts(), openAlerts().eq('severity_color', 'RED')]);
      if (all.error) throw all.error;
      if (red.error) throw red.error;
      if (typeof all.count !== 'number' || typeof red.count !== 'number') throw new Error('The alert count was not returned.');
      return { open: all.count, critical: red.count };
    },
  });

  // Realtime: any change to alerts refreshes every bell read.
  useEffect(() => {
    if (!ready) return undefined;
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
          void queryClient.invalidateQueries({ queryKey: ALERTS_BELL_QUERY_KEY });
        }
      )
      .subscribe();
    return () => {
      subscription.unsubscribe();
    };
  }, [ready, queryClient]);

  // The badge: the counts when they are in; the list's unacknowledged rows if only the counts failed.
  const badge = useMemo((): BellBadge | null => {
    if (!ready) return null;
    if (counts.data) return exactBadge(counts.data.open, counts.data.critical > 0);
    if (counts.isError && list.data) {
      // The list holds every open-status alert (OPEN, ACKNOWLEDGED, SNOOZED,
      // ESCALATED) up to its 20-row cap. A list that is not full holds them all,
      // so its OPEN count is exact. A full list can hide more OPEN alerts, so its
      // count is a floor (`<n>+`); with no OPEN row in a full list the count is
      // unknown, and the bell shows no badge rather than invent one (D-04).
      const openRows = list.data.filter((a) => a.status === 'OPEN');
      const full = list.data.length >= MAX_DROPDOWN_ALERTS;
      const critical = openRows.some((a) => a.severity_color === 'RED');
      if (full) return openRows.length === 0 ? null : floorBadge(openRows.length, critical);
      return exactBadge(openRows.length, critical);
    }
    return null;
  }, [ready, counts.data, counts.isError, list.data]);

  return { ready, vesselName, list, badge };
}
