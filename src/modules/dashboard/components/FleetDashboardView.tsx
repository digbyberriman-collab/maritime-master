import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessels, type Vessel } from '@/modules/vessels/hooks/useVessels';
import type { VesselDashboardData } from '@/modules/vessels/hooks/useVesselDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import FleetSubNav from './fleet/FleetSubNav';
import RegionMapCard from './fleet/RegionMapCard';
import FleetKPITiles from './fleet/FleetKPITiles';
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

  // Aggregate KPIs across all vessels.
  const kpi = useMemo(() => {
    const list = summaries || [];
    const sum = (f: (d: VesselDashboardData) => number) =>
      list.reduce((acc, d) => acc + (f(d) || 0), 0);
    const docAlerts = sum((d) => d.certs_expiring_90d);
    const safety = sum((d) => d.red_alerts_count) + sum((d) => d.open_capas_count);
    const technical = sum((d) => d.overdue_maintenance_count) + sum((d) => d.critical_defects_count);
    return {
      documentAlerts: {
        value: docAlerts,
        sub: docAlerts === 0 ? 'All documents in date' : `${docAlerts} expiring within 90 days`,
      },
      hoursOfRest: { value: 0, sub: 'All compliant' },
      leaveOverdue: { value: 0, sub: 'All crew within MLC limits' },
      safety: {
        value: safety,
        sub: safety === 0 ? 'All clear' : `${sum((d) => d.red_alerts_count)} red · ${sum((d) => d.open_capas_count)} open CAPAs`,
      },
      technical: {
        value: technical,
        sub: technical === 0 ? 'All clear' : `${sum((d) => d.overdue_maintenance_count)} overdue · ${sum((d) => d.critical_defects_count)} defects`,
      },
      accounting: { value: 0, sub: '0 overdue invoices' },
    };
  }, [summaries]);

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
          <h2 className="text-2xl font-bold text-foreground">Fleet Dashboard</h2>
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

        {/* Pastel KPI tile row */}
        <FleetKPITiles kpi={kpi} />

        {/* Vessel Health Matrix */}
        <VesselHealthMatrix rows={matrixRows} />
      </div>
    </div>
  );
};

export default FleetDashboardView;