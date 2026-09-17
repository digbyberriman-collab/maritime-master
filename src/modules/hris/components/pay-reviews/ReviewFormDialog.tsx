import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMinor, fromMinor, humanise, toMinor } from '@/modules/hris/lib/format';
import { REVIEW_REASONS, changePct, formatPct, type PayReviewReason, type PayReviewRow } from '@/modules/hris/lib/payReviewHelpers';
import type { CrewCompensationRow, PayReviewPayload } from '@/modules/hris/hooks/usePayReviews';

interface ReviewFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, edits this (proposed) review; otherwise proposes a new one. */
  review?: PayReviewRow | null;
  /** Active compensation of the crew member — seeds currency and previous base. */
  compensation: CrewCompensationRow | null;
  crewName?: string;
  onSubmit: (payload: PayReviewPayload) => Promise<void>;
  isPending?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const firstOfNextMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
};

/** Propose / edit a pay review with a live change-% preview. Money is entered in major units. */
export const ReviewFormDialog: React.FC<ReviewFormDialogProps> = ({ open, onOpenChange, review, compensation, crewName, onSubmit, isPending }) => {
  const [reviewDate, setReviewDate] = useState(today());
  const [effectiveDate, setEffectiveDate] = useState(firstOfNextMonth());
  const [proposed, setProposed] = useState('');
  const [reason, setReason] = useState<PayReviewReason>('annual');
  const [justification, setJustification] = useState('');
  const [comparator, setComparator] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currency = review?.currency ?? compensation?.currency ?? 'EUR';
  const previousMinor = review?.previous_base_minor ?? compensation?.base_salary_minor ?? 0;

  useEffect(() => {
    if (!open) return;
    setReviewDate(review?.review_date ?? today());
    setEffectiveDate(review?.effective_date ?? firstOfNextMonth());
    setProposed(review ? fromMinor(review.proposed_base_minor) : compensation ? fromMinor(compensation.base_salary_minor) : '');
    setReason((review?.reason as PayReviewReason | undefined) ?? 'annual');
    setJustification(review?.justification ?? '');
    setComparator(review?.comparator_notes ?? '');
    setError(null);
    // Re-seed only when opening or switching the target review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, review?.id]);

  const proposedMinor = toMinor(proposed);
  const pct = useMemo(() => (proposedMinor === null ? null : changePct(previousMinor, proposedMinor)), [previousMinor, proposedMinor]);
  const delta = proposedMinor === null ? null : proposedMinor - previousMinor;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (proposedMinor === null || proposedMinor < 0) {
      setError('Enter the proposed base salary.');
      return;
    }
    if (!reviewDate || !effectiveDate) {
      setError('Both dates are required.');
      return;
    }
    if (effectiveDate < reviewDate) {
      setError('The effective date cannot be before the review date.');
      return;
    }
    await onSubmit({
      review_date: reviewDate,
      effective_date: effectiveDate,
      currency,
      previous_base_minor: previousMinor,
      proposed_base_minor: proposedMinor,
      reason,
      justification: justification.trim() || null,
      comparator_notes: comparator.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{review ? 'Edit pay review' : 'New pay review'}{crewName ? ` — ${crewName}` : ''}</DialogTitle>
            <DialogDescription>
              {compensation || review
                ? `Current base ${formatMinor(previousMinor, currency)} (${humanise(compensation?.pay_frequency ?? 'monthly')}). The review is proposed in the same currency.`
                : 'This crew member has no active compensation record; the previous base will be recorded as zero.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rv-date">Review date</Label>
              <Input id="rv-date" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-eff">Effective from</Label>
              <Input id="rv-eff" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Previous base ({currency})</Label>
              <Input value={fromMinor(previousMinor)} readOnly className="bg-muted/40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-proposed">Proposed base ({currency})</Label>
              <Input id="rv-proposed" inputMode="decimal" value={proposed} onChange={(e) => setProposed(e.target.value)} placeholder="0.00" autoFocus />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as PayReviewReason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVIEW_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{humanise(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Change</p>
              <p className={cn('text-lg font-semibold tabular-nums', pct === null ? 'text-muted-foreground' : pct < 0 ? 'text-destructive' : 'text-green-500')}>
                {formatPct(pct, 2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Difference</p>
              <p className="font-medium tabular-nums text-foreground">{delta === null ? '—' : `${delta >= 0 ? '+' : ''}${formatMinor(delta, currency)}`}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">New base</p>
              <p className="font-medium tabular-nums text-foreground">{formatMinor(proposedMinor, currency)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rv-just">Justification</Label>
            <Textarea id="rv-just" rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Performance, responsibilities, tenure…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rv-comp">Comparator notes</Label>
            <Textarea id="rv-comp" rows={2} value={comparator} onChange={(e) => setComparator(e.target.value)} placeholder="Market data, pay grade band, peers on similar vessels…" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {review ? 'Save changes' : 'Propose review'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewFormDialog;
