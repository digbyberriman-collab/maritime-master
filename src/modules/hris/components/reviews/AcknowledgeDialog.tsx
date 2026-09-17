import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PerformanceReview } from '@/modules/hris/hooks/usePerformanceReviews';
import { ratingLabel, reviewTypeLabel } from '@/modules/hris/lib/reviews';

interface AcknowledgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: PerformanceReview | null;
  onConfirm: (comments: string) => Promise<void>;
  isPending?: boolean;
}

/** Crew member confirms they have read the review, with optional comments. */
export const AcknowledgeDialog: React.FC<AcknowledgeDialogProps> = ({ open, onOpenChange, review, onConfirm, isPending }) => {
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (open) setComments(review?.employee_comments ?? '');
  }, [open, review?.employee_comments]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Acknowledge your review</DialogTitle>
          <DialogDescription>
            {review
              ? `Confirms you have read your ${reviewTypeLabel(review.review_type).toLowerCase()} signed by ${review.reviewer_name ?? 'your reviewer'}${
                  review.overall_rating !== null ? ` (overall ${review.overall_rating} · ${ratingLabel(review.overall_rating)})` : ''
                }. Acknowledging does not mean you agree with everything — use the comments to record your view.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="ack-comments">Your comments (optional)</Label>
          <Textarea id="ack-comments" rows={4} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Anything you want on record alongside this review" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Not now</Button>
          <Button type="button" onClick={() => void onConfirm(comments)} disabled={isPending || !review}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} I have read this review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AcknowledgeDialog;
