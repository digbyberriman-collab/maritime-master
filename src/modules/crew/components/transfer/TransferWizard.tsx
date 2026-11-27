import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notify } from '@/shared/lib/notify';
import { todayDateOnly } from '@/shared/lib/form';
import { transferProgressOf, wizardStepFor, type Transfer, type TransferOptions } from '@/modules/crew/lib/transfer';
import { toAcknowledgePayload, toStartArgs, type AcknowledgeValues, type TransferDetailsValues } from '@/modules/crew/lib/transferSchema';
import { transferRefusal, useTransferSteps, type TransferError, type TransferStep, type TransferVessel } from '@/modules/crew/hooks/useTransfers';
import { TransferStatusTimeline } from './TransferStatusTimeline';
import { TransferDetailsStep } from './TransferDetailsStep';
import { TransferReviewStep } from './TransferReviewStep';
import { TransferStatusStep, type StatusAction } from './TransferStatusStep';

export interface TransferWizardProps {
  open: boolean;
  onClose: () => void;
  vessel: TransferVessel;
  /** The person's options on the route vessel (the start); null when the wizard opens on a known transfer. */
  options: TransferOptions | null;
  /** The transfer to open (the person's open transfer, or the ?transfer= deep link). */
  transfer: Transfer | null;
  personName: string;
}

const SUCCESS: Partial<Record<TransferStep['step'], string>> = {
  submit: 'Transfer submitted',
  decide: 'Decision saved',
  cancel: 'Transfer cancelled',
  complete: 'Transfer completed',
};

/** The details form's values from an open draft or review (restarting it keeps them). */
function detailsFrom(t: Transfer | null): Partial<TransferDetailsValues> | undefined {
  if (!t || (t.status !== 'draft' && t.status !== 'review')) return undefined;
  return {
    toVesselId: t.toVessel.id,
    positionMode: t.sameRole ? 'same' : 'new',
    toPositionId: t.sameRole ? null : t.toPosition?.id ?? null,
    signOffDate: t.signOffDate,
    signOnDate: t.signOnDate,
    notes: t.notes ?? '',
  };
}

/**
 * The transfer wizard (gap/04 C58, W9; D-207): 1. the details (destination,
 * the same or a new position, dates), saved as a draft and reviewed; 2. the
 * pre-transfer review, every item ticked, then submit (scheduled, or
 * pending fleet approval when a vessel asks for it); 3. the status, with
 * approve / decline, complete and cancel as the server allows. The timeline
 * on top shows where the transfer stands. Refusals show the server's
 * sentence (the D-207 ones as is) on the field or above the buttons. Lazy:
 * the crew list and the profile load it only when it opens.
 */
const TransferWizard: React.FC<TransferWizardProps> = ({ open, onClose, vessel, options, transfer: initialTransfer, personName }) => {
  const today = useMemo(() => todayDateOnly(), []);
  const [transfer, setTransfer] = useState<Transfer | null>(initialTransfer);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<TransferError | null>(null);
  const [chosenVesselId, setChosenVesselId] = useState<string>('');
  const onDestinationChange = useCallback((id: string) => setChosenVesselId(id), []);
  const steps = useTransferSteps(vessel, options?.person.profileId ?? initialTransfer?.profileId ?? null);
  const busy = steps.isPending;
  const natural = wizardStepFor(transfer?.status ?? null);
  // Only someone who may change the transfer sees its details and review as forms; anyone else sees where it stands.
  const step = editing ? 'details' : transfer && natural !== 'status' && !transfer.rights.canEdit ? 'status' : natural;
  // Each step opens at its top (the dialog scrolls on a phone).
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [step]);

  const run = async (s: TransferStep, quiet = false): Promise<Transfer | null> => {
    setError(null);
    try {
      const next = await steps.mutateAsync(s);
      setTransfer(next);
      if (!quiet && SUCCESS[s.step]) notify.success(SUCCESS[s.step] as string);
      return next;
    } catch (e) {
      const refusal = transferRefusal(e, s.step);
      setError(refusal);
      return null;
    }
  };

  const onDetails = async (values: TransferDetailsValues) => {
    if (!options) return;
    const started = await run({ step: 'start', args: toStartArgs(options.person.profileId, options.from.vesselId, values) }, true);
    if (!started) return;
    const reviewed = await run({ step: 'review', transferId: started.id }, true);
    if (reviewed) setEditing(false);
  };

  const onReviewSubmit = async (items: AcknowledgeValues['items']) => {
    if (!transfer) return;
    const acked = await run({ step: 'acknowledge', transferId: transfer.id, items: toAcknowledgePayload(items) }, true);
    if (acked) await run({ step: 'submit', transferId: transfer.id });
  };

  const onStatusAction = (a: StatusAction) => {
    if (!transfer) return;
    if (a.kind === 'approve') void run({ step: 'decide', transferId: transfer.id, decision: 'approve', reason: null });
    else if (a.kind === 'decline') void run({ step: 'decide', transferId: transfer.id, decision: 'decline', reason: a.reason });
    else if (a.kind === 'cancel') void run({ step: 'cancel', transferId: transfer.id, reason: a.reason });
    else void run({ step: 'complete', transferId: transfer.id });
  };

  const onCancelFromReview = () => {
    if (!transfer) return;
    void run({ step: 'cancel', transferId: transfer.id, reason: null });
  };

  // The server decides on submit (either vessel's setting); until then the chosen destination's flag.
  const destinationId = step === 'details' ? chosenVesselId : transfer?.toVessel.id ?? '';
  const approvalExpected = Boolean(
    (step !== 'details' && transfer?.requiresApproval) || options?.destinations.find((d) => d.vesselId === destinationId)?.requiresApproval,
  );
  const fromLine = options
    ? [options.from.vesselName, options.from.positionText].filter(Boolean).join(' · ')
    : transfer
      ? [transfer.fromVessel.name, transfer.fromPosition?.name].filter(Boolean).join(' · ')
      : '';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent ref={contentRef} className="max-h-[92dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto" data-transfer-wizard={step}>
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle>Transfer {personName}</DialogTitle>
          <DialogDescription>{fromLine ? `From ${fromLine}` : 'Move this crew member to another vessel of the fleet.'}</DialogDescription>
          <TransferStatusTimeline
            progress={
              transfer && !editing
                ? // Before submit the server has not fixed the approval yet: the destination's flag shows it.
                  { ...transferProgressOf(transfer), requiresApproval: transfer.submittedAt ? transfer.requiresApproval : approvalExpected }
                : { status: 'draft', requiresApproval: approvalExpected, reviewed: false, submitted: false, approved: false }
            }
          />
        </DialogHeader>
        {step === 'details' && options ? (
          <TransferDetailsStep
            options={options}
            today={today}
            initial={detailsFrom(transfer)}
            busy={busy}
            error={error}
            onSubmit={(v) => void onDetails(v)}
            onClose={onClose}
            onDestinationChange={onDestinationChange}
          />
        ) : null}
        {step === 'details' && !options ? (
          <p className="type-body text-muted-foreground">Open the transfer from the crew list to change its details.</p>
        ) : null}
        {step === 'review' && transfer ? (
          <TransferReviewStep
            key={`${transfer.id}:${transfer.review?.generatedAt ?? ''}`}
            transfer={transfer}
            approvalExpected={approvalExpected}
            busy={busy}
            error={error}
            onSubmit={(items) => void onReviewSubmit(items)}
            onBack={() => {
              setError(null);
              setEditing(true);
            }}
            onCancelTransfer={onCancelFromReview}
          />
        ) : null}
        {step === 'status' && transfer ? (
          <TransferStatusStep transfer={transfer} today={today} busy={busy} error={error} onAction={onStatusAction} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default TransferWizard;
