import React, { useState } from 'react';
import { Check, Loader2, Pencil, Play, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatDateTime, formatMinor, humanise } from '@/modules/hris/lib/format';
import { formatPct, type PayReviewListItem } from '@/modules/hris/lib/payReviewHelpers';
import { ReviewStatusBadge } from './ReviewStatusBadge';

interface ReviewDetailCardProps {
  review: PayReviewListItem;
  canEdit: boolean;
  canAdmin: boolean;
  busy: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onReject: (reason: string | null) => void;
  onApply: () => void;
  onDelete: () => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn('min-w-0', className)}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);

/** Full detail of one review with the gated workflow actions. */
export const ReviewDetailCard: React.FC<ReviewDetailCardProps> = ({ review, canEdit, canAdmin, busy, onEdit, onApprove, onReject, onApply, onDelete }) => {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const isProposed = review.status === 'proposed';
  const isApproved = review.status === 'approved';
  const pct = review.change_pct;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {humanise(review.reason)} review · {formatDate(review.review_date)}
              <ReviewStatusBadge status={review.status} />
            </CardTitle>
            <p className="text-sm text-muted-foreground">Effective {formatDate(review.effective_date)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && isProposed && (
              <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            )}
            {canAdmin && isProposed && (
              <Button size="sm" onClick={onApprove} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Approve
              </Button>
            )}
            {canAdmin && (isProposed || isApproved) && (
              <Button variant="outline" size="sm" onClick={() => setRejecting((v) => !v)} disabled={busy}>
                <X className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            )}
            {canAdmin && isApproved && (
              <Button size="sm" onClick={onApply} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />} Apply
              </Button>
            )}
            {canEdit && review.status !== 'applied' && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete} disabled={busy}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rejecting && (
          <div className="space-y-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <Textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this review rejected? (optional, recorded in notes)" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={busy}>Back</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  onReject(rejectReason.trim() || null);
                  setRejecting(false);
                  setRejectReason('');
                }}
              >
                Confirm rejection
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={`Previous base (${review.currency})`}>
            <span className="tabular-nums">{formatMinor(review.previous_base_minor, review.currency)}</span>
          </Field>
          <Field label={`Proposed base (${review.currency})`}>
            <span className="font-semibold tabular-nums">{formatMinor(review.proposed_base_minor, review.currency)}</span>
          </Field>
          <Field label="Change">
            <span className={cn('font-semibold tabular-nums', pct === null ? 'text-muted-foreground' : pct < 0 ? 'text-destructive' : 'text-green-500')}>
              {formatPct(pct, 2)}
            </span>
          </Field>
          <Field label="Difference">
            <span className="tabular-nums">
              {review.proposed_base_minor - review.previous_base_minor >= 0 ? '+' : ''}
              {formatMinor(review.proposed_base_minor - review.previous_base_minor, review.currency)}
            </span>
          </Field>
        </div>

        {(review.justification || review.comparator_notes) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {review.justification && (
              <Field label="Justification"><p className="whitespace-pre-wrap">{review.justification}</p></Field>
            )}
            {review.comparator_notes && (
              <Field label="Comparator notes"><p className="whitespace-pre-wrap">{review.comparator_notes}</p></Field>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 border-t pt-3 text-xs sm:grid-cols-4">
          <Field label="Proposed">{formatDateTime(review.created_at)}</Field>
          <Field label="Approved">{review.approved_at ? formatDateTime(review.approved_at) : '—'}</Field>
          <Field label="Applied">{review.applied_at ? formatDateTime(review.applied_at) : '—'}</Field>
          <Field label="New compensation">
            {review.new_compensation_id ? <span className="font-mono">{review.new_compensation_id.slice(0, 8)}…</span> : '—'}
          </Field>
        </div>
        {review.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{review.notes}</p>}
      </CardContent>
    </Card>
  );
};

export default ReviewDetailCard;
