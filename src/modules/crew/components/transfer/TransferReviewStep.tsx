import React, { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/shared/components/status';
import type { Tone } from '@/shared/components/status';
import { liveAcknowledgements, reviewCounts, sortReviewItems, type ReviewItem, type ReviewItemSeverity, type Transfer } from '@/modules/crew/lib/transfer';
import { acknowledgeSchema, type AcknowledgeValues } from '@/modules/crew/lib/transferSchema';
import type { TransferError } from '@/modules/crew/hooks/useTransfers';
import { TransferSummary } from './TransferSummary';

const SEVERITY: Record<ReviewItemSeverity, { tone: Tone; label: string }> = {
  danger: { tone: 'danger', label: 'Needs attention' },
  warning: { tone: 'warn', label: 'Check' },
  info: { tone: 'info', label: 'For information' },
};

interface TransferReviewStepProps {
  transfer: Transfer;
  /** Either vessel asks for fleet approval (the server decides again on submit). */
  approvalExpected: boolean;
  busy: boolean;
  error: TransferError | null;
  /** Ticks every listed item (with notes) and submits. */
  onSubmit: (items: AcknowledgeValues['items']) => void;
  onBack: () => void;
  onCancelTransfer: () => void;
}

/**
 * Step 2 of the transfer (gap/04 W9, C58): the pre-transfer review the
 * server computed (destination gaps for the new position, medical flags
 * without clinical text, the last appraisal, hours of rest, open forms and
 * training), worst first. Every item needs a tick and may take a note;
 * nothing blocks the transfer by itself. Submitting saves the ticks and
 * submits in one go.
 */
export const TransferReviewStep: React.FC<TransferReviewStepProps> = ({ transfer, approvalExpected, busy, error, onSubmit, onBack, onCancelTransfer }) => {
  const items: ReviewItem[] = useMemo(() => sortReviewItems(transfer.review?.items ?? []), [transfer.review]);
  const acks = useMemo(() => liveAcknowledgements(transfer.review, transfer.acknowledgements), [transfer.review, transfer.acknowledgements]);
  const counts = reviewCounts(items);
  const form = useForm<AcknowledgeValues>({
    resolver: zodResolver(acknowledgeSchema),
    defaultValues: { items: items.map((i) => ({ key: i.key, ticked: acks.has(i.key), note: acks.get(i.key)?.note ?? '' })) },
  });
  const { control, handleSubmit, register, watch, formState } = form;
  const { fields } = useFieldArray({ control, name: 'items' });
  const ticked = (watch('items') ?? []).filter((i) => i.ticked).length;
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.filter((i) => acks.get(i.key)?.note).map((i) => [i.key, true])),
  );

  return (
    <form className="space-y-4" onSubmit={handleSubmit((v) => onSubmit(v.items))} noValidate data-transfer-step="review">
      <TransferSummary transfer={transfer} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-subtitle">Before the move</h3>
        <p className="type-caption text-muted-foreground" aria-live="polite">
          {items.length === 0 ? 'Nothing to acknowledge' : `${ticked} of ${items.length} acknowledged`}
          {counts.danger > 0 ? ` · ${counts.danger} need attention` : ''}
        </p>
      </div>
      {items.length === 0 ? (
        <Alert variant="success">
          <AlertDescription>Nothing to flag for this move. Submit it when you are ready.</AlertDescription>
        </Alert>
      ) : (
        <ul className="space-y-2" aria-label="Review items">
          {fields.map((field, index) => {
            const item = items[index];
            if (!item) return null;
            const severity = SEVERITY[item.severity];
            const tickError = formState.errors.items?.[index]?.ticked?.message;
            const noteError = formState.errors.items?.[index]?.note?.message;
            const id = `transfer-ack-${index}`;
            return (
              <li key={field.id} className="rounded-md border border-border bg-card p-3" data-review-item={item.key} data-severity={item.severity}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="type-body font-medium text-foreground">{item.title}</p>
                    {item.detail ? <p className="type-caption text-muted-foreground">{item.detail}</p> : null}
                  </div>
                  <StatusPill tone={severity.tone}>{severity.label}</StatusPill>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Controller
                    control={control}
                    name={`items.${index}.ticked`}
                    render={({ field: f }) => (
                      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-0">
                        <Checkbox id={id} checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} aria-invalid={Boolean(tickError)} />
                        <span className="type-body">Acknowledged</span>
                      </label>
                    )}
                  />
                  {notesOpen[item.key] ? null : (
                    <Button type="button" variant="link" className="h-auto min-h-11 p-0 sm:min-h-0" onClick={() => setNotesOpen((s) => ({ ...s, [item.key]: true }))}>
                      Add a note
                    </Button>
                  )}
                </div>
                {notesOpen[item.key] ? (
                  <div className="mt-2">
                    <label htmlFor={`${id}-note`} className="sr-only">
                      Note on {item.title}
                    </label>
                    <Input id={`${id}-note`} placeholder="Note (optional)" className="min-h-10 [@media(pointer:coarse)]:min-h-11" {...register(`items.${index}.note`)} />
                    {noteError ? <p className="mt-1 type-caption text-critical">{noteError}</p> : null}
                  </div>
                ) : null}
                {tickError ? <p className="mt-1 type-caption text-critical">{tickError}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onCancelTransfer} disabled={busy}>
            Cancel transfer
          </Button>
          <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
            <ArrowLeft aria-hidden="true" />
            Change details
          </Button>
        </div>
        <Button type="submit" variant="signal" disabled={busy}>
          {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {approvalExpected ? 'Submit for fleet approval' : 'Submit and schedule'}
        </Button>
      </div>
    </form>
  );
};

export default TransferReviewStep;
