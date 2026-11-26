/**
 * The end of a fleet document's life (gap/02 W1, FD4; X5 spec X5-04B):
 *
 * - `WithdrawDocumentDialog`: a published document is withdrawn from every
 *   vessel with a reason (1 to 500 characters, lib/fleetDocumentSchema.ts),
 *   through `fleet_document_withdraw`. Final: crew stop seeing it, the
 *   document and its versions stay in the library's history.
 * - `DeleteDraftDialog`: a document that was never published is deleted
 *   instead, through `fleet_document_delete_draft` (its draft file is
 *   removed with it; the library's history keeps a record).
 *
 * Both check the document's state with the lifecycle table first
 * (lib/fleetDocumentMachine.ts) and say why when the action does not
 * apply. A refusal or an error stays in the dialog, in words; the success
 * toast comes only after the definer's returned row was checked (the
 * mutation wrappers). The company's library queries are invalidated
 * whatever happened, because a refusal can mean the screen was stale.
 */
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { errorMessage, notify } from '@/shared/lib/notify';
import { fleetDocumentKeys } from '../hooks/keys';
import { deleteDraftDocument, withdrawDocument } from '../hooks/useFleetDocumentMutations';
import { fleetDocumentRefusal, fleetDocumentTransition, type FleetDocumentStatus } from '../lib/fleetDocumentMachine';
import { WITHDRAW_REASON_MAX, toWithdrawReason, withdrawSchema, type WithdrawFormValues } from '../lib/fleetDocumentSchema';
import type { FleetDocumentRow } from '../types/db.pending';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

/** The document a dialog acts on (a library row is one). */
export interface DocumentEndTarget {
  id: string;
  title: string;
  status: FleetDocumentStatus;
  /** "All 6", "3 of 6". */
  vesselsLabel?: string;
}

const NO_COMPANY = 'Your account is not linked to a company.';

/** The sentence when the action does not apply to the document's state, or null. */
function stateRefusal(status: FleetDocumentStatus, action: 'withdraw' | 'delete_draft'): string | null {
  const outcome = fleetDocumentTransition(status, action);
  return 'refusal' in outcome ? fleetDocumentRefusal(outcome.refusal) : null;
}

// ─── Withdraw ───────────────────────────────────────────────────────────

export interface WithdrawDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  document: DocumentEndTarget | null;
  /** Called with the withdrawn row (already checked). */
  onWithdrawn?: (row: FleetDocumentRow) => void;
}

export function WithdrawDocumentDialog({ open, onOpenChange, companyId, document, onWithdrawn }: WithdrawDocumentDialogProps) {
  return (
    <Dialog open={open && !!document} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full" aria-describedby="withdraw-document-description">
        {open && document ? (
          <WithdrawForm key={document.id} companyId={companyId} document={document} onDone={onOpenChange} onWithdrawn={onWithdrawn} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function WithdrawForm({
  companyId,
  document,
  onDone,
  onWithdrawn,
}: {
  companyId: string | null;
  document: DocumentEndTarget;
  onDone: (open: boolean) => void;
  onWithdrawn?: (row: FleetDocumentRow) => void;
}) {
  const queryClient = useQueryClient();
  const id = React.useId();
  const form = useForm<WithdrawFormValues>({ resolver: zodResolver(withdrawSchema), defaultValues: { reason: '' } });
  const refusal = stateRefusal(document.status, 'withdraw');
  const mutation = useMutation({
    mutationFn: (reason: string) => {
      if (!companyId) return Promise.reject(new Error(NO_COMPANY));
      return withdrawDocument(companyId, { documentId: document.id, reason });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: fleetDocumentKeys.company(companyId) }),
  });
  const reason = form.watch('reason') ?? '';
  const length = reason.trim().length;
  const fieldError = form.formState.errors.reason?.message ?? null;
  const busy = mutation.isPending;

  const submit = form.handleSubmit(async (values) => {
    const text = toWithdrawReason(values);
    if (!text || refusal) return;
    try {
      const row = await mutation.mutateAsync(text);
      notify.success(`${document.title} withdrawn`, { description: 'Crew no longer see it on any vessel. Its versions stay in the library history.' });
      onWithdrawn?.(row);
      onDone(false);
    } catch {
      // The error stays in the dialog (below), in words.
    }
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="break-words">{`Withdraw ${document.title}`}</DialogTitle>
        <DialogDescription id="withdraw-document-description">
          {`Crew stop seeing it on ${document.vesselsLabel ? `the vessels it reaches (${document.vesselsLabel})` : 'every vessel it reaches'}. It cannot be published again; its versions stay in the library history.`}
        </DialogDescription>
      </DialogHeader>

      {refusal ? (
        <Alert variant="info">
          <AlertDescription>{refusal}</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>Reason</Label>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            autoFocus
            maxLength={WITHDRAW_REASON_MAX + 50}
            placeholder="For example: replaced by the new bunkering procedure"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={`${id}-reason-hint${fieldError ? ` ${id}-reason-error` : ''}`}
            disabled={busy}
            {...form.register('reason')}
          />
          <p id={`${id}-reason-hint`} className={cn('type-caption tabular-nums', length > WITHDRAW_REASON_MAX ? 'text-destructive' : 'text-muted-foreground')}>
            {`Kept with the document's history. ${length.toLocaleString('en-GB')} / ${WITHDRAW_REASON_MAX.toLocaleString('en-GB')}`}
          </p>
          {fieldError ? (
            <p id={`${id}-reason-error`} role="alert" className="text-sm text-destructive">
              {fieldError}
            </p>
          ) : null}
        </div>
      )}

      {mutation.isError ? (
        <Alert variant="destructive">
          <AlertTitle>The document was not withdrawn</AlertTitle>
          <AlertDescription>{errorMessage(mutation.error, 'Try again.')}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" className={COARSE} onClick={() => onDone(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" className={COARSE} disabled={busy || !!refusal}>
          {busy ? 'Withdrawing…' : 'Withdraw document'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Delete a draft ─────────────────────────────────────────────────────

export interface DeleteDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  document: DocumentEndTarget | null;
  /** Called with the deleted row (already checked). */
  onDeleted?: (row: FleetDocumentRow) => void;
}

export function DeleteDraftDialog({ open, onOpenChange, companyId, document, onDeleted }: DeleteDraftDialogProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (documentId: string) => {
      if (!companyId) return Promise.reject(new Error(NO_COMPANY));
      return deleteDraftDocument(companyId, documentId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: fleetDocumentKeys.company(companyId) }),
  });
  const { reset } = mutation;
  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);
  if (!document) return null;
  const refusal = stateRefusal(document.status, 'delete_draft');
  const busy = mutation.isPending;

  const confirm = async () => {
    try {
      const row = await mutation.mutateAsync(document.id);
      notify.success(`Draft deleted: ${document.title}`);
      onDeleted?.(row);
      onOpenChange(false);
    } catch {
      // Shown below, in words.
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <AlertDialogContent className="w-[calc(100vw-1rem)] max-w-md sm:w-full">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{`Delete the draft ${document.title}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            It was never published, so no crew have seen it. Its file goes with it; the library history keeps a note that it was deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {refusal ? (
          <Alert variant="info">
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert variant="destructive">
            <AlertTitle>The draft was not deleted</AlertTitle>
            <AlertDescription>{errorMessage(mutation.error, 'Try again.')}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter className="gap-2">
          <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)} disabled={busy}>
            Keep the draft
          </Button>
          <Button type="button" variant="destructive" className={COARSE} onClick={() => void confirm()} disabled={busy || !!refusal}>
            {busy ? 'Deleting…' : 'Delete draft'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default WithdrawDocumentDialog;
