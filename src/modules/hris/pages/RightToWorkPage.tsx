import React from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { RtwOverview } from '@/modules/hris/components/right-to-work/RtwOverview';
import { CrewRtwDetail } from '@/modules/hris/components/right-to-work/CrewRtwDetail';

/**
 * Compliance & Right to Work. Company matrix (KPIs + crew × document
 * chips) when no crew is selected; per-crew identity documents,
 * authorisations and certificate expiries otherwise. Self-service users
 * see their own record and can add their own authorisations.
 */
const RightToWorkPage: React.FC = () => {
  const { profileId, entry, setProfileId, selfOnly, isOwnRecord, access, directoryLoading } = useSelectedCrew();
  const canEdit = !access.loading && access.canEdit;

  const toolbar = !selfOnly ? (
    <CrewPicker value={profileId} onChange={(id) => setProfileId(id)} includeInactive placeholder="All crew — pick someone to see their documents" className="md:w-[420px]" />
  ) : undefined;

  let body: React.ReactNode;
  if (access.loading || (profileId && !entry && directoryLoading)) {
    body = (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  } else if (!profileId) {
    body = access.canView ? <RtwOverview canEdit={canEdit} onSelectCrew={setProfileId} /> : <Skeleton className="h-32 w-full" />;
  } else if (!entry) {
    body = <p className="text-sm text-muted-foreground">That crew member could not be found in your company directory.</p>;
  } else {
    body = <CrewRtwDetail crew={entry} canEdit={canEdit} isOwnRecord={isOwnRecord} />;
  }

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={ShieldCheck}
        title={selfOnly ? 'My right to work' : 'Compliance & Right to Work'}
        description={
          entry
            ? `${entry.displayName}${entry.rank ? ` · ${entry.rank}` : ''}${entry.vessel_name ? ` · ${entry.vessel_name}` : ''}${entry.nationality ? ` · ${entry.nationality}` : ''}`
            : 'Passports, visas, medicals, work authorisations and certificates across the fleet.'
        }
        toolbar={toolbar}
      />
      {body}
    </div>
  );
};

export default RightToWorkPage;
