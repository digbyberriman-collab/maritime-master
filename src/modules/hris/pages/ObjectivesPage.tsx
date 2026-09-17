import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useMyObjectives, useObjectiveMutations, useObjectives, type Objective } from '@/modules/hris/hooks/useObjectives';
import { DEFAULT_OBJECTIVE_FILTERS, formValuesToObjectivePayload, type CrewObjectiveRow, type ObjectiveFormValues } from '@/modules/hris/lib/objectives';
import { ObjectivesOverview } from '@/modules/hris/components/objectives/ObjectivesOverview';
import { PdpSummary } from '@/modules/hris/components/objectives/PdpSummary';
import { ObjectivesBoard } from '@/modules/hris/components/objectives/ObjectivesBoard';
import { ObjectiveFormDialog } from '@/modules/hris/components/objectives/ObjectiveFormDialog';
import { ObjectiveDetailSheet } from '@/modules/hris/components/objectives/ObjectiveDetailSheet';

type FormState = { open: false } | { open: true; profileId: string; crewUserId: string | null; crewName?: string; objective: CrewObjectiveRow | null };

const ObjectivesPage: React.FC = () => {
  const { profileId, entry, setProfileId, selfOnly, isOwnRecord, access } = useSelectedCrew();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const reviewId = searchParams.get('review') ?? '';
  const mutations = useObjectiveMutations();

  const [formState, setFormState] = useState<FormState>({ open: false });
  const [detailId, setDetailId] = useState<string | null>(null);

  const myProfileId = profile?.id ?? null;
  const canEdit = !access.loading && access.canEdit;
  const canAdmin = !access.loading && access.canAdmin;
  const crewMode = Boolean(profileId) && !selfOnly;

  // Crew mode: everything for the selected crew member (RLS lets the subject / owner read their own).
  const crewFilters = useMemo(() => ({ ...DEFAULT_OBJECTIVE_FILTERS, status: 'all' as const, crewId: profileId ?? 'all' }), [profileId]);
  const crew = useObjectives(crewFilters);
  // Self-service: own objectives + the ones I mentor.
  const mine = useMyObjectives();

  const openDetail = (o: Objective) => setDetailId(o.id);

  const openForm = (target: { profileId: string; crewUserId: string | null; crewName?: string }, objective: CrewObjectiveRow | null) => {
    setFormState({ open: true, ...target, objective });
  };

  const handleSubmit = async (values: ObjectiveFormValues) => {
    if (!formState.open) return;
    const payload = formValuesToObjectivePayload(values);
    if (formState.objective) {
      await mutations.update.mutateAsync({ objective: formState.objective, payload });
    } else {
      await mutations.create.mutateAsync({ profileId: formState.profileId, payload });
    }
    setFormState({ open: false });
  };

  const newForSelected = () => {
    if (!profileId) return;
    openForm({ profileId, crewUserId: entry?.user_id ?? null, crewName: entry?.displayName }, null);
  };

  const newForMe = () => {
    if (!myProfileId) return;
    openForm({ profileId: myProfileId, crewUserId: profile?.user_id ?? null, crewName: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() }, null);
  };

  const editFromDetail = (o: Objective) => {
    setDetailId(null);
    openForm({ profileId: o.profile_id, crewUserId: o.crew_user_id, crewName: o.crew_name }, o);
  };

  const canCreateForSelected = crewMode && (canEdit || isOwnRecord);

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={Target}
        title="Objectives & PDPs"
        description={
          selfOnly
            ? 'Your objectives and the ones you mentor. Update progress as you go.'
            : crewMode
              ? 'Personal development plan, objectives and progress for the selected crew member.'
              : 'Objectives across the company: what is open, what is due and how development plans are tracking.'
        }
        actions={
          <>
            {crewMode && (
              <Button variant="outline" onClick={() => setProfileId(null)}>
                <Users className="mr-2 h-4 w-4" /> All crew
              </Button>
            )}
            {canCreateForSelected && (
              <Button onClick={newForSelected} disabled={mutations.create.isPending}>
                <Plus className="mr-2 h-4 w-4" /> New objective
              </Button>
            )}
            {selfOnly && myProfileId && (
              <Button onClick={newForMe} disabled={mutations.create.isPending}>
                <Plus className="mr-2 h-4 w-4" /> New objective
              </Button>
            )}
          </>
        }
        toolbar={
          !selfOnly && (
            <CrewPicker
              value={profileId}
              onChange={(id) => setProfileId(id)}
              includeInactive
              className="md:w-[420px]"
              placeholder="Select a crew member to view their PDP"
            />
          )
        }
      />

      {access.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : selfOnly ? (
        <div className="space-y-8">
          <section className="space-y-4">
            <PdpSummary objectives={mine.own} crewName={profile?.first_name} isLoading={mine.isLoading} />
            <ObjectivesBoard objectives={mine.own} isLoading={mine.isLoading} onOpen={openDetail} onCreate={newForMe} emptyMessage="Add an objective or ask your HOD to set one with you." />
          </section>
          {(mine.isLoading || mine.mentoring.length > 0) && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Objectives I mentor</h2>
                <p className="text-sm text-muted-foreground">Objectives where you are the owner. You can add progress updates for your crew.</p>
              </div>
              <ObjectivesBoard objectives={mine.mentoring} isLoading={mine.isLoading} showCrew onOpen={openDetail} />
            </section>
          )}
        </div>
      ) : !crewMode ? (
        access.canView ? (
          <ObjectivesOverview onSelectCrew={setProfileId} onOpenObjective={setDetailId} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )
      ) : (
        <div className="space-y-6">
          <PdpSummary objectives={crew.all} crewName={entry?.displayName} isLoading={crew.isLoading} />
          <ObjectivesBoard
            objectives={crew.all}
            isLoading={crew.isLoading}
            onOpen={openDetail}
            onCreate={canCreateForSelected ? newForSelected : undefined}
            emptyMessage={canCreateForSelected ? 'Add the first objective to start this development plan.' : 'An HR editor, the crew member or their mentor can add objectives.'}
          />
        </div>
      )}

      <ObjectiveFormDialog
        open={formState.open}
        onOpenChange={(open) => !open && setFormState({ open: false })}
        objective={formState.open ? formState.objective : null}
        defaults={reviewId ? { review_id: reviewId } : undefined}
        crewName={formState.open ? formState.crewName : undefined}
        crewUserId={formState.open ? formState.crewUserId : null}
        canPickOwner={canEdit}
        onSubmit={handleSubmit}
        isPending={mutations.create.isPending || mutations.update.isPending}
      />

      <ObjectiveDetailSheet
        objectiveId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        hrEditor={canEdit}
        canAdmin={canAdmin}
        onEdit={editFromDetail}
      />
    </div>
  );
};

export default ObjectivesPage;
