import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Save, UserRound, X } from 'lucide-react';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/shared/hooks/use-toast';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useHrProfile, useUpdateHrProfile } from '@/modules/hris/hooks/useHrProfile';
import { resolveEditableFields, type ProfileFormField } from '@/modules/hris/lib/profileForm';
import { ProfileSummaryCard } from '@/modules/hris/components/personal/ProfileSummaryCard';
import { PersonalDetailsForm } from '@/modules/hris/components/personal/PersonalDetailsForm';
import { ProfileAuditTrail } from '@/modules/hris/components/personal/ProfileAuditTrail';

const FORM_ID = 'hris-personal-details-form';

const PersonalDetailsPage: React.FC = () => {
  const { profileId, entry, setProfileId, selfOnly, isOwnRecord, access } = useSelectedCrew();
  const profileQuery = useHrProfile(profileId);
  const { mutateAsync: saveProfile, isPending: saving } = useUpdateHrProfile();

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  /** Deferred action awaiting the "discard changes?" confirmation. */
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const profile = profileQuery.data ?? null;
  const editableFields = useMemo(
    () => resolveEditableFields({ canEdit: access.canEdit, isOwnRecord }),
    [access.canEdit, isOwnRecord],
  );
  const canEditRecord = !access.loading && editableFields.size > 0;
  const canUploadAvatar = !access.loading && (access.canEdit || isOwnRecord);
  const showSensitive = access.canView || isOwnRecord;

  // Leave edit mode whenever the selected crew changes.
  useEffect(() => {
    setEditing(false);
    setDirty(false);
  }, [profileId]);

  // Browser-level unsaved-changes guard (tab close / reload / hard navigation).
  useEffect(() => {
    if (!(editing && dirty)) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editing, dirty]);

  const guarded = useCallback(
    (action: () => void) => {
      if (editing && dirty) setPendingAction(() => action);
      else action();
    },
    [editing, dirty],
  );

  const handlePick = useCallback((id: string | null) => guarded(() => setProfileId(id)), [guarded, setProfileId]);
  const handleCancel = useCallback(() => guarded(() => setEditing(false)), [guarded]);

  const handleSubmit = useCallback(
    async (patch: TablesUpdate<'profiles'>, previous: Partial<Record<ProfileFormField, string | null>>) => {
      if (!profileId) return;
      if (Object.keys(patch).length === 0) {
        setEditing(false);
        return;
      }
      try {
        await saveProfile({ profileId, patch, previous });
        toast({ title: 'Personal details saved' });
        setEditing(false);
      } catch (error) {
        toast({
          title: 'Could not save',
          description: error instanceof Error ? error.message : 'Unexpected error while saving',
          variant: 'destructive',
        });
      }
    },
    [profileId, saveProfile],
  );

  const actions = profile && canEditRecord ? (
    editing ? (
      <>
        <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} disabled={saving || !dirty}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save changes
        </Button>
      </>
    ) : (
      <Button type="button" onClick={() => setEditing(true)}>
        <Pencil className="mr-2 h-4 w-4" />
        Edit
      </Button>
    )
  ) : null;

  const loading = access.loading || (Boolean(profileId) && profileQuery.isLoading);

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={UserRound}
        title="Personal Details"
        description={selfOnly ? 'Your personal record.' : 'Identity, contact, employment and compliance details for a crew member.'}
        actions={actions}
        toolbar={
          selfOnly ? undefined : (
            <CrewPicker value={profileId} onChange={handlePick} includeInactive className="md:w-[380px]" />
          )
        }
      />

      {isOwnRecord && !access.canEdit && profile && (
        <Alert className="bg-card">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Self-service</AlertTitle>
          <AlertDescription>
            You can update your preferred name, phone number and photo. Ask HR to change anything else.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <LoadingState />
      ) : !profileId ? (
        <EmptyState />
      ) : profileQuery.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load this profile</AlertTitle>
          <AlertDescription>
            {profileQuery.error instanceof Error ? profileQuery.error.message : 'Unexpected error'}
          </AlertDescription>
        </Alert>
      ) : !profile ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Profile not found</AlertTitle>
          <AlertDescription>This record does not exist or you do not have access to it.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-6">
            <ProfileSummaryCard profile={profile} entry={entry} canUploadAvatar={canUploadAvatar} />
            <ProfileAuditTrail profileId={profile.id} userId={profile.user_id} />
          </div>
          <PersonalDetailsForm
            key={profile.id}
            profile={profile}
            editing={editing}
            editableFields={editableFields}
            showSensitive={showSensitive}
            saving={saving}
            formId={FORM_ID}
            onSubmit={handleSubmit}
            onDirtyChange={setDirty}
          />
        </div>
      )}

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have edits that have not been saved. Leaving now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pendingAction;
                setPendingAction(null);
                setEditing(false);
                setDirty(false);
                action?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const EmptyState: React.FC = () => (
  <Card className="bg-card">
    <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-muted p-4">
        <UserRound className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-foreground">Select a crew member</p>
        <p className="text-sm text-muted-foreground">Use the picker above to open someone&apos;s personal record.</p>
      </div>
    </CardContent>
  </Card>
);

const LoadingState: React.FC = () => (
  <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
    <div className="space-y-6">
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
    <div className="space-y-6">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  </div>
);

export default PersonalDetailsPage;
