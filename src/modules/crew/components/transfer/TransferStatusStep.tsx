import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TRANSFER_STATUS_SENTENCE, cancelReasonRequired, formatTransferDay, transferDue, type Transfer } from '@/modules/crew/lib/transfer';
import { buildCancelSchema, declineSchema } from '@/modules/crew/lib/transferSchema';
import type { TransferError } from '@/modules/crew/hooks/useTransfers';
import { TransferSummary } from './TransferSummary';

export type StatusAction = { kind: 'approve' } | { kind: 'decline'; reason: string } | { kind: 'cancel'; reason: string | null } | { kind: 'complete' };

interface TransferStatusStepProps {
  transfer: Transfer;
  today: string;
  busy: boolean;
  error: TransferError | null;
  onAction: (action: StatusAction) => void;
  onClose: () => void;
}

const stamp = (when: string | null, who: string | null): string | null => {
  if (!when) return null;
  const day = formatTransferDay(when.slice(0, 10));
  return who ? `${day} by ${who}` : day;
};

/**
 * Step 3 of the transfer (gap/04 W9): where it stands, who moved it on and
 * when, and what the viewer may do now, as the server says (rights): a
 * fleet approver approves or declines (a reason), the transferring officer
 * completes it from the sign-off date, either cancels it (a reason once it
 * was submitted).
 */
export const TransferStatusStep: React.FC<TransferStatusStepProps> = ({ transfer, today, busy, error, onAction, onClose }) => {
  const [mode, setMode] = useState<'none' | 'decline' | 'cancel'>('none');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  // A step that moved the transfer on closes the reason box (a refusal keeps it, with the error).
  const [shownStatus, setShownStatus] = useState(transfer.status);
  if (shownStatus !== transfer.status) {
    setShownStatus(transfer.status);
    setMode('none');
    setReason('');
    setReasonError(null);
  }
  const r = transfer.rights;
  const facts: Array<[string, string]> = [];
  const created = stamp(transfer.createdAt, transfer.createdByName);
  if (created) facts.push(['Started', created]);
  const submitted = stamp(transfer.submittedAt, transfer.submittedByName);
  if (submitted) facts.push(['Submitted', submitted]);
  const approved = stamp(transfer.approvedAt, transfer.approvedByName);
  if (approved) facts.push(['Approved', approved]);
  if (transfer.declineReason) facts.push(['Declined', transfer.declineReason]);
  const cancelled = stamp(transfer.cancelledAt, transfer.cancelledByName);
  if (cancelled && !transfer.declineReason) facts.push(['Cancelled', transfer.cancelledReason ? `${cancelled}: ${transfer.cancelledReason}` : cancelled]);
  const completed = stamp(transfer.completedAt, null);
  if (completed) facts.push(['Completed', completed]);
  if (transfer.compliantOnDestinationAt) facts.push(['Compliant on arrival', formatTransferDay(transfer.compliantOnDestinationAt.slice(0, 10))]);

  const confirmReason = () => {
    const parsed = mode === 'decline' ? declineSchema.safeParse({ reason }) : buildCancelSchema(transfer.status).safeParse({ reason });
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? 'Say why.');
      return;
    }
    setReasonError(null);
    const text = parsed.data.reason.trim();
    if (mode === 'decline') onAction({ kind: 'decline', reason: text });
    else onAction({ kind: 'cancel', reason: text || null });
  };

  const notDue = transfer.status === 'scheduled' && !transferDue(transfer.signOffDate, today);

  return (
    <div className="space-y-4" data-transfer-step="status">
      <TransferSummary transfer={transfer} />
      <p className="type-body text-muted-foreground">{TRANSFER_STATUS_SENTENCE[transfer.status]}</p>
      {facts.length > 0 ? (
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
          {facts.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="type-caption text-muted-foreground">{label}</dt>
              <dd className="type-body break-words">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      {transfer.status === 'pending_approval' && transfer.decideBlock === 'own_submission' ? (
        <Alert variant="info">
          <AlertDescription>You submitted this transfer, so another fleet approver decides it.</AlertDescription>
        </Alert>
      ) : null}
      {transfer.status === 'pending_approval' && !r.canDecide && transfer.decideBlock === null ? (
        <p className="type-caption text-muted-foreground">A fleet approver decides it; you will see the outcome here.</p>
      ) : null}
      {notDue && r.canEdit === false && !r.canComplete ? (
        <p className="type-caption text-muted-foreground">It can be completed from {formatTransferDay(transfer.signOffDate)}; otherwise it completes itself on the sign-on date.</p>
      ) : null}

      {mode !== 'none' ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label htmlFor="transfer-reason">
            {mode === 'decline' ? 'Why is it declined?' : cancelReasonRequired(transfer.status) ? 'Why is it cancelled?' : 'Why is it cancelled? (optional)'}
          </Label>
          <Textarea id="transfer-reason" rows={3} className="resize-none" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(reasonError)} />
          {reasonError ? <p className="type-caption text-critical">{reasonError}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => { setMode('none'); setReasonError(null); }} disabled={busy}>
              Back
            </Button>
            <Button type="button" variant={mode === 'decline' ? 'destructive' : 'outline'} onClick={confirmReason} disabled={busy}>
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {mode === 'decline' ? 'Decline transfer' : 'Cancel transfer'}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      {mode === 'none' ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {r.canCancel ? (
            <Button type="button" variant="ghost" onClick={() => setMode('cancel')} disabled={busy}>
              Cancel transfer
            </Button>
          ) : null}
          {r.canDecide ? (
            <>
              <Button type="button" variant="outline" onClick={() => setMode('decline')} disabled={busy}>
                Decline
              </Button>
              <Button type="button" variant="signal" onClick={() => onAction({ kind: 'approve' })} disabled={busy}>
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                Approve
              </Button>
            </>
          ) : null}
          {r.canComplete ? (
            <Button type="button" variant="signal" onClick={() => onAction({ kind: 'complete' })} disabled={busy}>
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Complete transfer now
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default TransferStatusStep;
