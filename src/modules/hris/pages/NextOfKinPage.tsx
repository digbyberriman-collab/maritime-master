import React, { useState } from 'react';
import { HeartHandshake, Loader2, Plus, Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useCrewNextOfKin, type NextOfKin, type NextOfKinFormData } from '@/modules/hris/hooks/useCrewNextOfKin';
import { NextOfKinCard } from '@/modules/hris/components/next-of-kin/NextOfKinCard';
import { NextOfKinFormDialog } from '@/modules/hris/components/next-of-kin/NextOfKinFormDialog';
import { MissingNextOfKinTable } from '@/modules/hris/components/next-of-kin/MissingNextOfKinTable';

/**
 * Next of Kin / Emergency. Read-first "ICE" layout: the primary contact is
 * the first thing on screen with one-tap call/email, other contacts follow.
 * Editing is gated on HR edit access or the crew member viewing their own
 * record (which is what RLS allows).
 */
const NextOfKinPage: React.FC = () => {
  const { profileId, entry, setProfileId, selfOnly, isOwnRecord, access, directoryLoading } = useSelectedCrew();
  const nok = useCrewNextOfKin(profileId);
  const canEdit = !access.loading && (access.canEdit || isOwnRecord);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NextOfKin | null>(null);
  const [deleting, setDeleting] = useState<NextOfKin | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (contact: NextOfKin) => {
    setEditing(contact);
    setFormOpen(true);
  };
  const submit = async (values: NextOfKinFormData) => {
    if (editing) await nok.updateContact.mutateAsync({ id: editing.id, values });
    else await nok.createContact.mutateAsync(values);
  };

  const toolbar = !selfOnly ? (
    <CrewPicker
      value={profileId}
      onChange={(id) => setProfileId(id)}
      includeInactive
      placeholder="All crew — pick someone to see their contacts"
      className="md:w-[420px]"
    />
  ) : undefined;

  let body: React.ReactNode;
  if (access.loading || (profileId && !entry && directoryLoading)) {
    body = (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  } else if (!profileId) {
    body = access.canView ? <MissingNextOfKinTable onSelect={setProfileId} /> : <Skeleton className="h-32 w-full" />;
  } else if (!entry) {
    body = <p className="text-sm text-muted-foreground">That crew member could not be found in your company directory.</p>;
  } else if (nok.isError) {
    body = (
      <Alert variant="destructive">
        <AlertTitle>Could not load contacts</AlertTitle>
        <AlertDescription>{nok.error instanceof Error ? nok.error.message : 'Unknown error'}</AlertDescription>
      </Alert>
    );
  } else if (nok.isLoading) {
    body = (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  } else if (nok.contacts.length === 0) {
    body = (
      <Alert className="border-dashed">
        <Siren className="h-4 w-4" />
        <AlertTitle>No emergency contact recorded</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {isOwnRecord
              ? 'Add someone who can be reached if something happens to you on board.'
              : `${entry.displayName} has nobody recorded. Add a contact so the vessel can reach someone in an emergency.`}
          </span>
          {canEdit && (
            <Button size="sm" onClick={openCreate} className="gap-1 sm:shrink-0"><Plus className="h-4 w-4" /> Add contact</Button>
          )}
        </AlertDescription>
      </Alert>
    );
  } else {
    body = (
      <div className="space-y-6">
        <section aria-labelledby="ice-primary" className="space-y-3">
          <div className="flex items-center gap-2">
            <Siren className="h-4 w-4 text-destructive" />
            <h2 id="ice-primary" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">In case of emergency, call</h2>
          </div>
          {nok.primary ? (
            <NextOfKinCard contact={nok.primary} emphasis="primary" canEdit={canEdit} busy={nok.isMutating} onEdit={openEdit} onDelete={setDeleting} onSetPrimary={nok.setPrimary.mutate} />
          ) : (
            <Alert>
              <AlertTitle>No primary contact set</AlertTitle>
              <AlertDescription>Choose “Set as primary” on one of the contacts below.</AlertDescription>
            </Alert>
          )}
        </section>

        {nok.others.length > 0 && (
          <section aria-labelledby="ice-others" className="space-y-3">
            <h2 id="ice-others" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Other contacts</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {nok.others.map((c) => (
                <NextOfKinCard key={c.id} contact={c} canEdit={canEdit} busy={nok.isMutating} onEdit={openEdit} onDelete={setDeleting} onSetPrimary={nok.setPrimary.mutate} />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  const showAddAction = Boolean(profileId && entry && canEdit && !nok.isLoading && nok.contacts.length > 0);

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={HeartHandshake}
        title="Next of Kin / Emergency"
        description={entry ? `${entry.displayName}${entry.rank ? ` · ${entry.rank}` : ''}${entry.vessel_name ? ` · ${entry.vessel_name}` : ''}` : 'Who to call when something happens on board.'}
        toolbar={toolbar}
        actions={showAddAction ? <Button onClick={openCreate} className="gap-1"><Plus className="h-4 w-4" /> Add contact</Button> : undefined}
      />
      {body}

      {profileId && (
        <NextOfKinFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          contact={editing}
          isFirst={nok.contacts.length === 0}
          submitting={nok.createContact.isPending || nok.updateContact.isPending}
          onSubmit={submit}
        />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the contact permanently.
              {deleting?.is_primary && nok.contacts.length > 1 && ' The oldest remaining contact will become primary.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={nok.deleteContact.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={nok.deleteContact.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deleting) return;
                nok.deleteContact.mutate(deleting, { onSettled: () => setDeleting(null) });
              }}
            >
              {nok.deleteContact.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NextOfKinPage;
