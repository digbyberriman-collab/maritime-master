/**
 * Vessel › Crew › Crew Medical (`/v/:vesselCode/crew/medical?status=`;
 * gap/04 C61; gap/02 M1, W8; D-X1-7, D-X5-08; X5-08): the crew medical
 * grid for the scope's vessel only (the vessel comes from the URL, never a
 * name filter). The same component as Fleet › Medical, without the
 * vessel filter.
 *
 * - Gate: `vessel.crew.crew_medical.view` on this vessel (the route guard
 *   uses the same key); nothing is read while it loads and denied is
 *   AccessDenied. The server applies its own rule (fitness or medical
 *   viewers who reach the vessel).
 * - Export, vessel-scoped and logged first (personal data), needs
 *   `vessel.crew.crew_medical.export` on this vessel.
 */
import React from 'react';
import { useVesselScope } from '@/app/router/scopes';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { AccessDenied, EmptyState, PageLoading } from '@/shared/components/states';
import { CrewMedicalGrid } from '../components/CrewMedicalGrid';
import { FLEET_CAPS } from '../paths';

const VesselCrewMedicalPage: React.FC = () => {
  const scope = useVesselScope();
  const vesselId = scope?.vessel.id ?? null;
  const access = useCapability(FLEET_CAPS.crewMedicalView, { vesselId });
  if (!scope) {
    return <EmptyState title="Choose a vessel" body="Crew medical is shown for one vessel. Pick a vessel in the switcher at the top." headingLevel={1} bordered />;
  }
  if (access.status === 'loading') return <PageLoading variant="list" label="Loading crew medical" />;
  if (!access.allowed) {
    return <AccessDenied detail="Crew medical needs access to this vessel's crew medical fitness. If you think you should see it, ask your account admin." />;
  }
  return <VesselCrewMedicalBody vesselId={scope.vessel.id} vesselName={scope.vessel.name} vesselCode={scope.code} />;
};

function VesselCrewMedicalBody({ vesselId, vesselName, vesselCode }: { vesselId: string; vesselName: string; vesselCode: string }) {
  const canExport = useCan(FLEET_CAPS.crewMedicalExport, { vesselId });
  return (
    <CrewMedicalGrid
      vesselId={vesselId}
      vesselCode={vesselCode}
      vesselName={vesselName}
      canExport={canExport}
      header={{
        eyebrow: vesselName,
        title: 'Crew Medical',
        description: 'Medical fitness of the crew on board and joining: ENG1, vaccinations, rest and health checks, with the reason behind every status.',
      }}
    />
  );
}

export default VesselCrewMedicalPage;
