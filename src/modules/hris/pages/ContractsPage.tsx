import React, { useMemo, useRef, useState } from 'react';
import { FileSignature, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useToast } from '@/shared/hooks/use-toast';
import { downloadCrewDocument, getCrewDocumentSignedUrl } from '@/lib/storage/crewDocuments';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useCompanyVessels, useContractMutations, useCrewContracts, type CrewContract } from '@/modules/hris/hooks/useCrewContracts';
import { formValuesToPayload, pickCurrentContract, type ContractFormValues } from '@/modules/hris/lib/contractHelpers';
import { ContractsOverview } from '@/modules/hris/components/contracts/ContractsOverview';
import { ContractCard } from '@/modules/hris/components/contracts/ContractCard';
import { ContractHistoryTable } from '@/modules/hris/components/contracts/ContractHistoryTable';
import { ContractFormDialog } from '@/modules/hris/components/contracts/ContractFormDialog';
import { TerminateContractDialog } from '@/modules/hris/components/contracts/TerminateContractDialog';

const ACCEPTED_DOCUMENTS = '.pdf,.doc,.docx,.png,.jpg,.jpeg';

type FormState = { open: false } | { open: true; contract: CrewContract | null };

const ContractsPage: React.FC = () => {
  const { profileId, entry, setProfileId, selfOnly, isOwnRecord, access } = useSelectedCrew();
  const { toast } = useToast();
  const { vessels } = useCompanyVessels();
  const { contracts, isLoading } = useCrewContracts(profileId);
  const mutations = useContractMutations();

  const [formState, setFormState] = useState<FormState>({ open: false });
  const [terminating, setTerminating] = useState<CrewContract | null>(null);
  const [deleting, setDeleting] = useState<CrewContract | null>(null);
  const uploadTarget = useRef<CrewContract | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { current, history } = useMemo(() => pickCurrentContract(contracts), [contracts]);
  const canEdit = !access.loading && access.canEdit;
  const canAdmin = !access.loading && access.canAdmin;
  const showWage = canEdit || isOwnRecord;
  const busy =
    mutations.create.isPending ||
    mutations.update.isPending ||
    mutations.activate.isPending ||
    mutations.terminate.isPending ||
    mutations.uploadDocument.isPending ||
    mutations.remove.isPending;

  const crewName = entry?.displayName;
  const newContractDefaults = useMemo<Partial<ContractFormValues>>(
    () => ({
      vessel_id: entry?.vessel_id ?? '',
      position: entry?.position ?? entry?.assignment_position ?? '',
      rank: entry?.rank ?? '',
      department: entry?.department ?? '',
    }),
    [entry],
  );

  const handleFormSubmit = async (values: ContractFormValues) => {
    if (!profileId || !formState.open) return;
    const payload = formValuesToPayload(values);
    if (formState.contract) {
      // Never let the form demote a historical contract back to draft.
      const editable = formState.contract.status === 'draft' || formState.contract.status === 'active';
      const { status, ...rest } = payload;
      await mutations.update.mutateAsync({ contract: formState.contract, payload: editable ? { ...rest, status } : rest });
    } else {
      await mutations.create.mutateAsync({ profileId, payload });
    }
    setFormState({ open: false });
  };

  const handleTerminate = async (values: { reason: string; terminated_at: string }) => {
    if (!terminating) return;
    await mutations.terminate.mutateAsync({ contract: terminating, ...values });
    setTerminating(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await mutations.remove.mutateAsync(deleting);
    setDeleting(null);
  };

  const startUpload = (contract: CrewContract) => {
    uploadTarget.current = contract;
    fileInput.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const contract = uploadTarget.current;
    e.target.value = '';
    if (!file || !contract || !profileId) return;
    await mutations.uploadDocument.mutateAsync({ contract, file, crewUserId: entry?.user_id ?? profileId });
  };

  const download = async (contract: CrewContract) => {
    try {
      await downloadCrewDocument(contract.document_path, contract.document_name ?? `contract-${contract.id}.pdf`);
    } catch (err) {
      toast({ title: 'Download failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    }
  };

  const preview = async (contract: CrewContract) => {
    try {
      const url = await getCrewDocumentSignedUrl(contract.document_path);
      if (!url) throw new Error('Document has no storage path');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({ title: 'Preview failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    }
  };

  const crewMode = Boolean(profileId);

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={FileSignature}
        title="Contracts & Employment"
        description={crewMode ? 'Employment contract, terms and history for the selected crew member.' : 'Contract coverage and upcoming renewals across the company.'}
        actions={
          <>
            {crewMode && !selfOnly && (
              <Button variant="outline" onClick={() => setProfileId(null)}>
                <Users className="mr-2 h-4 w-4" /> All crew
              </Button>
            )}
            {crewMode && canEdit && (
              <Button onClick={() => setFormState({ open: true, contract: null })} disabled={busy}>
                <Plus className="mr-2 h-4 w-4" /> New contract
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
              placeholder="Select a crew member to view their contract"
            />
          )
        }
      />

      {!crewMode ? (
        access.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ContractsOverview onSelectCrew={setProfileId} />
        )
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {current ? (
            <ContractCard
              contract={current}
              canEdit={canEdit}
              canAdmin={canAdmin}
              showWage={showWage}
              busy={busy}
              onEdit={() => setFormState({ open: true, contract: current })}
              onActivate={() => mutations.activate.mutate(current)}
              onTerminate={() => setTerminating(current)}
              onUpload={() => startUpload(current)}
              onDelete={() => setDeleting(current)}
              onDownload={() => download(current)}
              onPreview={() => preview(current)}
            />
          ) : (
            <Card className="border-dashed bg-card">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <FileSignature className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">No contract on record{crewName ? ` for ${crewName}` : ''}</p>
                  <p className="text-sm text-muted-foreground">
                    {canEdit ? 'Create a contract to track dates, terms and the signed SEA.' : 'An HR editor can add one.'}
                  </p>
                </div>
                {canEdit && (
                  <Button onClick={() => setFormState({ open: true, contract: null })}>
                    <Plus className="mr-2 h-4 w-4" /> New contract
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <ContractHistoryTable
            contracts={history}
            showWage={showWage}
            canEdit={canEdit}
            canAdmin={canAdmin}
            onEdit={(c) => setFormState({ open: true, contract: c })}
            onDelete={setDeleting}
            onDownload={download}
          />
        </div>
      )}

      <input ref={fileInput} type="file" accept={ACCEPTED_DOCUMENTS} className="hidden" onChange={handleFileChosen} />

      <ContractFormDialog
        open={formState.open}
        onOpenChange={(open) => !open && setFormState({ open: false })}
        contract={formState.open ? formState.contract : null}
        defaults={newContractDefaults}
        vessels={vessels}
        crewName={crewName}
        onSubmit={handleFormSubmit}
        isPending={mutations.create.isPending || mutations.update.isPending}
      />

      <TerminateContractDialog
        open={Boolean(terminating)}
        onOpenChange={(open) => !open && setTerminating(null)}
        contract={terminating}
        onConfirm={handleTerminate}
        isPending={mutations.terminate.isPending}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the contract record{deleting?.document_path ? ' and its signed document' : ''}. Prefer terminating or
              superseding a contract so the employment history stays complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ContractsPage;
