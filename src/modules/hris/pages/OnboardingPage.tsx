import React, { useMemo, useState } from 'react';
import { Loader2, Rocket, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useBuddyRecords, useOnboardingMutations, useOnboardingRecord, useUpcomingJoiners } from '@/modules/hris/hooks/useOnboarding';
import { formatDate } from '@/modules/hris/lib/format';
import type { ItemPermissionContext } from '@/modules/hris/lib/onboarding';
import { OnboardingOverview } from '@/modules/hris/components/onboarding/OnboardingOverview';
import { JoinerReadiness } from '@/modules/hris/components/onboarding/JoinerReadiness';
import { OnboardingChecklist, type ChecklistActions } from '@/modules/hris/components/onboarding/OnboardingChecklist';
import { StartOnboardingDialog } from '@/modules/hris/components/onboarding/StartOnboardingDialog';
import { OnboardingStatusBadge } from '@/modules/hris/components/onboarding/badges';

/** Checklist for one crew member, used for the selected crew and for buddy records. */
const CrewChecklist: React.FC<{ profileId: string; permissions: ItemPermissionContext; canManage: boolean; crewUserId: string | null; emptyState?: React.ReactNode }> = ({
  profileId,
  permissions,
  canManage,
  crewUserId,
  emptyState,
}) => {
  const detail = useOnboardingRecord(profileId);
  const m = useOnboardingMutations();
  const busy = m.toggleItem.isPending || m.updateItem.isPending || m.uploadEvidence.isPending || m.removeItem.isPending || m.setBuddy.isPending || m.cancel.isPending || m.reopen.isPending;

  const actions: ChecklistActions = useMemo(
    () => ({
      toggleItem: (item, completed) => m.toggleItem.mutate({ item, completed }),
      updateNotes: (item, notes) => m.updateItem.mutate({ item, patch: { notes } }),
      uploadEvidence: (item, file) => m.uploadEvidence.mutate({ item, file, crewUserId: crewUserId ?? profileId }),
      removeItem: (item) => m.removeItem.mutate(item),
      addAdHocItem: (args) => {
        if (!detail.record) return Promise.resolve();
        return m.addAdHocItem.mutateAsync({ ...args, record: detail.record, existing: detail.items });
      },
      setBuddy: (record, buddyProfileId) => m.setBuddy.mutate({ record, buddyProfileId }),
      cancel: (record) => m.cancel.mutate(record),
      reopen: (record) => m.reopen.mutate(record),
    }),
    [m.toggleItem, m.updateItem, m.uploadEvidence, m.removeItem, m.addAdHocItem, m.setBuddy, m.cancel, m.reopen, detail.record, detail.items, crewUserId, profileId],
  );

  if (detail.isLoading) return <Skeleton className="h-64 w-full" />;
  if (detail.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load onboarding</AlertTitle>
        <AlertDescription>{detail.error instanceof Error ? detail.error.message : 'Unknown error'}</AlertDescription>
      </Alert>
    );
  }
  if (!detail.record || !detail.data) return <>{emptyState ?? null}</>;
  return <OnboardingChecklist detail={detail.data} permissions={permissions} canManage={canManage} busy={busy} actions={actions} />;
};

/**
 * Onboarding. Overview (KPIs, joiners, templates) when no crew is selected;
 * for a selected joiner the stitched readiness checks plus their induction
 * checklist. Self-service users see "My onboarding" and anything they are
 * buddying.
 */
const OnboardingPage: React.FC = () => {
  const { profile } = useAuth();
  const { profileId, entry, setProfileId, selfOnly, isOwnRecord, access, directoryLoading } = useSelectedCrew();
  const canEdit = !access.loading && access.canEdit;
  const mutations = useOnboardingMutations();
  const detail = useOnboardingRecord(profileId);
  const joiners = useUpcomingJoiners();
  const buddyRecords = useBuddyRecords();
  const [startOpen, setStartOpen] = useState(false);
  const [buddyFor, setBuddyFor] = useState<string | null>(null);

  const suggestedStart = useMemo(() => joiners.joiners.find((j) => j.profileId === profileId)?.startDate ?? null, [joiners.joiners, profileId]);
  const isBuddy = Boolean(detail.record?.buddy_profile_id && detail.record.buddy_profile_id === profile?.id);
  const permissions: ItemPermissionContext = { canEdit, isSubject: isOwnRecord, isBuddy };

  const toolbar = !selfOnly ? (
    <CrewPicker value={profileId} onChange={(id) => setProfileId(id)} includeInactive placeholder="All joiners — pick someone to see their onboarding" className="md:w-[420px]" />
  ) : undefined;

  const startCta = (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Rocket className="h-4 w-4 text-primary" /> No onboarding started</CardTitle>
        <CardDescription>
          {isOwnRecord
            ? 'HR has not started your induction checklist yet. The readiness list above shows what is already in place.'
            : `Start ${entry?.displayName ?? 'this crew member'}'s induction from a template. Items are assigned to HR, finance, the vessel, the joiner and a buddy.`}
        </CardDescription>
      </CardHeader>
      {canEdit && entry && (
        <CardContent>
          <Button onClick={() => setStartOpen(true)} className="gap-1"><Rocket className="h-4 w-4" /> Start onboarding</Button>
          {detail.history.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Previous: {detail.history.map((h) => `${formatDate(h.start_date)} (${h.status.replace('_', ' ')})`).join(', ')}</p>
          )}
        </CardContent>
      )}
    </Card>
  );

  let body: React.ReactNode;
  if (access.loading || (profileId && !entry && directoryLoading)) {
    body = (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  } else if (!profileId) {
    body = access.canView ? <OnboardingOverview canEdit={canEdit} onSelectCrew={setProfileId} /> : <Skeleton className="h-32 w-full" />;
  } else if (!entry) {
    body = <p className="text-sm text-muted-foreground">That crew member could not be found in your company directory.</p>;
  } else {
    body = (
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <JoinerReadiness
            profileId={entry.id}
            crewName={entry.displayName}
            crewEmail={entry.email}
            canEdit={canEdit}
            isOwnRecord={isOwnRecord}
            sendingInvitation={mutations.sendInvitation.isPending}
            onSendInvitation={(id, email) => mutations.sendInvitation.mutate({ profileId: id, email })}
          />
          <CrewChecklist profileId={entry.id} permissions={permissions} canManage={canEdit} crewUserId={entry.user_id} emptyState={startCta} />
        </div>

        {selfOnly && buddyRecords.records.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" /> Crew you are buddying</CardTitle>
              <CardDescription>You can tick off the items assigned to the buddy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="flex flex-wrap gap-2">
                {buddyRecords.records.map((b) => (
                  <li key={b.record.id}>
                    <Button variant={buddyFor === b.profile_id ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setBuddyFor((cur) => (cur === b.profile_id ? null : b.profile_id))}>
                      {b.crew_name} <OnboardingStatusBadge status={b.record.status} />
                    </Button>
                  </li>
                ))}
              </ul>
              {buddyFor && <CrewChecklist profileId={buddyFor} permissions={{ canEdit: false, isSubject: false, isBuddy: true }} canManage={false} crewUserId={null} />}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const showStartAction = Boolean(canEdit && entry && !detail.isLoading && detail.record && (detail.record.status === 'cancelled' || detail.record.status === 'completed'));

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={UserPlus}
        title={selfOnly ? 'My onboarding' : 'Onboarding'}
        description={
          entry
            ? `${entry.displayName}${entry.rank ? ` · ${entry.rank}` : ''}${entry.vessel_name ? ` · ${entry.vessel_name}` : ''}`
            : 'Joiner readiness and induction checklists, from signed contract to first month on board.'
        }
        toolbar={toolbar}
        actions={showStartAction ? <Button onClick={() => setStartOpen(true)} className="gap-1"><Rocket className="h-4 w-4" /> Start new onboarding</Button> : undefined}
      />
      {body}

      {entry && (
        <StartOnboardingDialog
          open={startOpen}
          onOpenChange={setStartOpen}
          crew={entry}
          suggestedStartDate={suggestedStart}
          submitting={mutations.start.isPending}
          onSubmit={(args) => mutations.start.mutateAsync(args)}
        />
      )}
    </div>
  );
};

export default OnboardingPage;
