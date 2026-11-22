import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessels, type Vessel } from '@/modules/vessels/hooks/useVessels';
import type { VesselDashboardData } from '@/modules/vessels/hooks/useVesselDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import FleetSubNav from './fleet/FleetSubNav';
import RegionMapCard from './fleet/RegionMapCard';
import FleetKPITiles, { type FleetKPI } from './fleet/FleetKPITiles';
import VesselHealthMatrix from './fleet/VesselHealthMatrix';
import { FLEET_REGIONS, regionForFlag, type FleetRegion } from './fleet/regionUtils';

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

const FleetDashboardView: React.FC = () => {
  const { vessels, isLoading: vesselsLoading } = useVessels();
  const vesselIds = useMemo(() => vessels.map((v) => v.id), [vessels]);
  const {
    data: summaries,
    isLoading: summariesLoading,
    isError: summariesError,
    refetch: refetchSummaries,
  } = useFleetVesselSummaries(vesselIds);

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

  // Aggregate the counts the summary RPC returns. Hours of rest, leave and
  // accounting are not in it; FleetKPITiles shows them as not tracked yet.
  const kpi = useMemo((): FleetKPI | null => {
    // No vessels in reach: the summary query never runs, and every count is a real 0.
    const list = vesselIds.length === 0 && !vesselsLoading ? [] : summaries;
    if (!list) return null;
    const sum = (f: (d: VesselDashboardData) => number) =>
      list.reduce((acc, d) => acc + (f(d) || 0), 0);
    const docAlerts = sum((d) => d.certs_expiring_90d);
    const red = sum((d) => d.red_alerts_count);
    const capas = sum((d) => d.open_capas_count);
    const overdue = sum((d) => d.overdue_maintenance_count);
    const defects = sum((d) => d.critical_defects_count);
    return {
      documentAlerts: { value: docAlerts, sub: `${docAlerts} expiring within 90 days` },
      safety: { value: red + capas, sub: `${red} red alerts · ${capas} open CAPAs` },
      technical: { value: overdue + defects, sub: `${overdue} overdue · ${defects} critical defects` },
    };
  }, [summaries, vesselIds.length, vesselsLoading]);

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
    <div className="flex flex-col lg:flex-row gap-6">
      <FleetSubNav />

      <div className="flex-1 min-w-0 space-y-6">
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

        <FleetKPITiles
          kpi={vesselsLoading ? null : kpi}
          error={summariesError}
          onRetry={() => void refetchSummaries()}
        />

        {/* Vessel Health Matrix */}
        <VesselHealthMatrix rows={matrixRows} />
      </div>
    </div>
  );
};

export default FleetDashboardView;