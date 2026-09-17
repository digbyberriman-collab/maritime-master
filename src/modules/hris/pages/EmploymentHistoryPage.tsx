import React, { useCallback } from 'react';
import { Download, History, UserRound, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useEmploymentHistory, useRecentMovements } from '@/modules/hris/hooks/useEmploymentHistory';
import { ServiceSummary } from '@/modules/hris/components/history/ServiceSummary';
import { Timeline } from '@/modules/hris/components/history/Timeline';
import { AssignmentsTable } from '@/modules/hris/components/history/AssignmentsTable';
import { RecentMovementsTable } from '@/modules/hris/components/history/RecentMovementsTable';
import { assignmentsToCsv, isoDay, type AssignmentPatch, type AssignmentRecord } from '@/modules/hris/lib/employmentHistory';

const MOVEMENT_WINDOW_DAYS = 30;
/** UTF-8 byte-order mark so Excel opens the CSV with the right encoding. */
const BOM = String.fromCharCode(0xfeff);

const EmptyState: React.FC<{ icon: React.ElementType; title: string; description: string }> = ({ icon: Icon, title, description }) => (
  <Card className="border-dashed border-border/60">
    <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

const EmploymentHistoryPage: React.FC = () => {
  const { profileId, entry, setProfileId, selfOnly, access } = useSelectedCrew();
  const history = useEmploymentHistory(profileId);
  const movements = useRecentMovements(MOVEMENT_WINDOW_DAYS);

  const crewName = entry?.displayName ?? (history.profile ? `${history.profile.first_name} ${history.profile.last_name}`.trim() : null);

  const handleExport = useCallback(() => {
    const csv = assignmentsToCsv(history.assignments, history.today);
    const blob = new Blob([`${BOM}${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (crewName ?? 'crew').replace(/[^A-Za-z0-9]+/g, '_');
    a.href = url;
    a.download = `Sea_Service_Record_${safeName}_${isoDay(history.today)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [history.assignments, history.today, crewName]);

  const handleSave = useCallback(
    (assignment: AssignmentRecord, patch: AssignmentPatch) => history.updateAssignment.mutateAsync({ assignment, patch }),
    [history.updateAssignment],
  );

  const description = selfOnly
    ? 'Your vessel assignments, contracts and sea-service record.'
    : 'Vessel assignments, contracts, rank changes and sea-service totals per crew member.';

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={History}
        title="Employment History"
        description={description}
        toolbar={
          selfOnly ? undefined : (
            <CrewPicker value={profileId} onChange={(id) => setProfileId(id)} includeInactive className="md:w-[360px]" placeholder="Select crew member to view history" />
          )
        }
        actions={
          profileId && history.hasAccount && history.assignments.length > 0 ? (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {!profileId ? (
        access.canView ? (
          <RecentMovementsTable
            movements={movements.movements}
            isLoading={movements.isLoading || access.loading}
            windowDays={MOVEMENT_WINDOW_DAYS}
            onSelectCrew={(id) => setProfileId(id)}
          />
        ) : (
          <EmptyState icon={UserRound} title="No crew member selected" description="Select a crew member to see their employment history." />
        )
      ) : history.error ? (
        <EmptyState icon={UserX} title="Could not load employment history" description={history.error instanceof Error ? history.error.message : 'Please try again.'} />
      ) : !history.isLoading && !history.profile ? (
        <EmptyState icon={UserX} title="Crew member not found" description="This profile does not exist or you do not have access to it." />
      ) : !history.isLoading && !history.hasAccount ? (
        <EmptyState
          icon={UserX}
          title={`${crewName ?? 'This crew member'} has no account yet`}
          description="Employment history starts once the crew member has accepted their invitation and has a login. Imported crew without an account have no vessel assignments to show."
        />
      ) : (
        <>
          <ServiceSummary summary={history.summary} isLoading={history.isLoading} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Timeline events={history.timeline} isLoading={history.isLoading} todayIso={isoDay(history.today)} />
            <AssignmentsTable
              assignments={history.assignments}
              today={history.today}
              canEdit={access.canEdit}
              isLoading={history.isLoading}
              isSaving={history.updateAssignment.isPending}
              onSave={handleSave}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default EmploymentHistoryPage;
