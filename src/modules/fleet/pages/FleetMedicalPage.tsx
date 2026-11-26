/**
 * Fleet › People › Medical (`/fleet/medical?vessels=&status=`; gap/02 M1,
 * X1 Medical leaf; D-X5-08; X5-08): the crew medical grid for the vessels
 * shown, with the company's medical settings for medical admins.
 *
 * - Gate: `fleet.operations.fleet_medical.view` (the route guard uses the
 *   same key); nothing is read while it loads and denied is AccessDenied.
 *   The server applies its own rule per vessel (fitness or medical viewers
 *   who reach the vessel).
 * - Export needs `fleet.operations.fleet_medical.export`; "Medical
 *   settings" needs `fleet.operations.fleet_medical.admin`.
 * - `?vessel=<code>` (a link to one vessel) is accepted and shown as that
 *   vessel in the Vessels shown filter.
 */
import React, { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { AccessDenied, PageLoading } from '@/shared/components/states';
import { CrewMedicalGrid } from '../components/CrewMedicalGrid';
import { MedicalSettingsDrawer } from '../components/MedicalSettingsDrawer';
import { FLEET_CAPS } from '../paths';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

const FleetMedicalPage: React.FC = () => {
  const access = useCapability(FLEET_CAPS.medicalView);
  if (access.status === 'loading') return <PageLoading variant="list" label="Loading fleet medical" />;
  if (!access.allowed) {
    return <AccessDenied detail="Fleet medical needs access to crew medical fitness. If you think you should see it, ask your account admin." />;
  }
  return <FleetMedicalBody />;
};

function FleetMedicalBody() {
  const { profile } = useAuth();
  const canExport = useCan(FLEET_CAPS.medicalExport);
  const canAdmin = useCan(FLEET_CAPS.medicalAdmin);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <CrewMedicalGrid
        header={{
          eyebrow: 'Fleet',
          title: 'Medical',
          description: 'Medical fitness across the fleet: ENG1, vaccinations, rest and health checks, with the reason behind every status.',
        }}
        canExport={canExport}
        actions={
          canAdmin ? (
            <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setSettingsOpen(true)}>
              <Settings2 aria-hidden="true" className="h-4 w-4" />
              Medical settings
            </Button>
          ) : null
        }
      />
      {canAdmin ? <MedicalSettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} companyId={profile?.company_id ?? null} /> : null}
    </>
  );
}

export default FleetMedicalPage;
