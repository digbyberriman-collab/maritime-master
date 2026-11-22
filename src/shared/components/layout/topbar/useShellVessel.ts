/**
 * The vessel the top bar names (spec §6.1 "the vessel in scope, else the last
 * vessel"): the vessel the URL is on; outside the vessel scope the vessel the
 * user opened last on this device (the recent list, still in reach), else the
 * selected or first reachable vessel. The scope control's vessel segment and
 * the account menu's header both show it, so they always agree.
 */
import { useMemo } from 'react';
import { useScope } from '@/app/router/scopeContext';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { useRecentVessels } from '@/app/nav/recentVessels';
import { useVessel, type Vessel } from '@/modules/vessels/contexts/VesselContext';

export function useShellVessel(): Vessel | undefined {
  const scope = useScope();
  const access = useScopeAccess();
  const { vessels, findVesselByCode } = useVessel();
  const recentIds = useRecentVessels();
  const scopeVessel = scope.scope === 'vessel' ? scope.vessel : undefined;
  return useMemo(() => {
    if (scopeVessel) return scopeVessel;
    if (!access.ready) return undefined;
    const recent = recentIds.length ? vessels.find((v) => v.id === recentIds[0]) : undefined;
    return recent ?? (access.lastVesselCode ? findVesselByCode(access.lastVesselCode) : undefined);
  }, [scopeVessel, access.ready, access.lastVesselCode, recentIds, vessels, findVesselByCode]);
}
