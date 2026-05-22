import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CrewListLayout } from '@/modules/crew/components/list/CrewListLayout';
import { CrewListSkeleton } from '@/modules/crew/components/list/CrewListSkeleton';
import { CrewListErrorState } from '@/modules/crew/components/list/CrewListErrorState';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import { useCrewWithComputedStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';
import { useVesselFilter } from '@/modules/vessels/hooks/useVesselFilter';
import CrewFormModal from '@/modules/crew/components/CrewFormModal';
import ImportCrewCSVModal from '@/modules/crew/components/ImportCrewCSVModal';

const CrewRoster: React.FC = () => {
  const { vesselFilter, isAllVessels } = useVesselFilter();
  const effective = isAllVessels ? undefined : vesselFilter ?? undefined;
  const { data, isLoading, error, refetch } = useCrewWithComputedStatus(effective);
  const { addCrewMember } = useCrew(effective);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <DashboardLayout>
      <Card>
        <CardHeader>
          <CardTitle>Crew</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <CrewListSkeleton />
          ) : error ? (
            <CrewListErrorState error={error} onRetry={refetch} />
          ) : (
            <CrewListLayout
              members={data}
              onAddCrew={() => setAddOpen(true)}
              onImportCSV={() => setImportOpen(true)}
            />
          )}
        </CardContent>
      </Card>

      <CrewFormModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        isLoading={addCrewMember.isPending}
        onSubmit={async (formData) => {
          await addCrewMember.mutateAsync(formData);
          setAddOpen(false);
        }}
      />
      <ImportCrewCSVModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          setImportOpen(false);
          refetch();
        }}
      />
    </DashboardLayout>
  );
};

export default CrewRoster;
