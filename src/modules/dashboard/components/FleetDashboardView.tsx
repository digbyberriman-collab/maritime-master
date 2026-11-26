import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessels, type Vessel } from '@/modules/vessels/hooks/useVessels';
import type { VesselDashboardData } from '@/modules/vessels/hooks/useVesselDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import RegionMapCard from './fleet/RegionMapCard';
import { FleetKpiRow } from './fleet/FleetKpiRow';
import VesselHealthMatrix from './fleet/VesselHealthMatrix';
import { FLEET_REGIONS, regionForFlag, type FleetRegion } from './fleet/regionUtils';
import { useFleetDashboardKpis, type FleetDashboardScope } from '../hooks/useFleetDashboard';
import { useOpenAlertCounts } from '../hooks/useOpenAlertCounts';
import { fleetKpisInput } from '../lib/fleetKpiRules';
import { FLEET_REPORT_PATHS } from '../pages/FleetReportsIndex';

/** Report keys the fleet reports index knows (a KPI number links only to one of these). */
const KNOWN_REPORT_KEYS: ReadonlySet<string> = new Set(FLEET_REPORT_PATHS);

function useFleetVesselSummaries(vesselIds: string[]) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['fleet-vessel-summaries', profile?.company_id, vesselIds.join(',')],
    queryFn: async (): Promise<VesselDashboardData[]> => {
      if (!profile?.company_id || vesselIds.length === 0) return [];
      const { data, error } = await supabase.rpc('get_vessel_dashboard_summary', {
        p_company_id: profile.company_id,
        p_vessel_ids: vesselIds,
        p_aggregate_all: false,
      });
      if (error) throw error;
      return (data || []) as VesselDashboardData[];
    },
    enabled: !!profile?.company_id && vesselIds.length > 0,
    staleTime: 30_000,
  });
}

/**
 * The legacy `?view=fleet` branch of the vessel dashboard (X5-02B removes
 * it with this file). Its KPI row is the fleet dashboard's (X5-02A): the
 * server's counts over every counted vessel (fleet-wide), not sums of
 * get_vessel_dashboard_summary.
 */
const FleetDashboardView: React.FC = () => {
  const { profile } = useAuth();
  const { vessels, isLoading: vesselsLoading } = useVessels();
  const vesselIds = useMemo(() => vessels.map((v) => v.id), [vessels]);
  const { data: summaries, isLoading: summariesLoading } = useFleetVesselSummaries(vesselIds);

  const summaryByVessel = useMemo(() => {
    const m = new Map<string, VesselDashboardData>();
    summaries?.forEach((s) => {
      if (s.vessel_id) m.set(s.vessel_id, s);
    });
    return m;
  }, [summaries]);

  // Bucket vessels by region; only render regions that have vessels.
  const regionsWithVessels: { region: FleetRegion; vessels: Vessel[] }[] = useMemo(() => {
    const buckets = new Map<string, Vessel[]>();
    vessels.forEach((v) => {
      const key = regionForFlag(v.flag_state);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(v);
    });
    return FLEET_REGIONS.filter((r) => buckets.has(r.key)).map((r) => ({
      region: r,
      vessels: buckets.get(r.key) || [],
    }));
  }, [vessels]);

  const kpiScope = useMemo<FleetDashboardScope | null>(
    () => (profile?.company_id ? { companyId: profile.company_id, vesselIds, fleetWide: true } : null),
    [profile?.company_id, vesselIds],
  );
  const kpis = useFleetDashboardKpis(kpiScope);
  const alerts = useOpenAlertCounts();

  const matrixRows = useMemo(
    () =>
      vessels.map((v) => ({
        vessel: { id: v.id, name: v.name },
        data: summaryByVessel.get(v.id) || null,
      })),
    [vessels, summaryByVessel]
  );

  const loading = vesselsLoading || summariesLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0 space-y-6">
        <div>
          <h2 className="type-title text-foreground">Fleet overview</h2>
          <p className="text-sm text-muted-foreground">
            {vessels.length} {vessels.length === 1 ? 'vessel' : 'vessels'} across {regionsWithVessels.length}{' '}
            {regionsWithVessels.length === 1 ? 'region' : 'regions'}
          </p>
        </div>

        {/* Regional mini-maps */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : regionsWithVessels.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {regionsWithVessels.map(({ region, vessels: vs }) => (
              <RegionMapCard
                key={region.key}
                region={region}
                vessels={vs.map((v) => ({ id: v.id, name: v.name }))}
              />
            ))}
          </div>
        ) : null}

        <FleetKpiRow
          kpis={fleetKpisInput(kpis)}
          onRetry={kpis.state === 'error' ? kpis.retry : undefined}
          alerts={alerts}
          knownReportKeys={KNOWN_REPORT_KEYS}
        />

        {/* Vessel Health Matrix */}
        <VesselHealthMatrix rows={matrixRows} />
      </div>
    </div>
  );
};

export default FleetDashboardView;