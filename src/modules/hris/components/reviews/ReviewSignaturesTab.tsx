import React from 'react';
import { Check, Circle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PerformanceReview } from '@/modules/hris/hooks/usePerformanceReviews';
import { formatDateTime } from '@/modules/hris/lib/format';

interface ReviewSignaturesTabProps {
  review: PerformanceReview;
  onOpenDocument?: () => void;
}

/** Timestamps of each workflow step plus the filed PDF, if any. */
export const ReviewSignaturesTab: React.FC<ReviewSignaturesTabProps> = ({ review, onOpenDocument }) => {
  const rows: { label: string; who: string; at: string | null }[] = [
    { label: 'Review created', who: '—', at: review.created_at },
    { label: 'Self-assessment submitted', who: review.crew_name, at: review.self_assessment_submitted_at },
    { label: 'Review submitted by reviewer', who: review.reviewer_name ?? '—', at: review.submitted_at },
    { label: 'Reviewer signed', who: review.reviewer_name ?? '—', at: review.reviewer_signed_at },
    { label: 'Crew member acknowledged', who: review.crew_name, at: review.employee_acknowledged_at },
    { label: 'Completed', who: '—', at: review.completed_at },
  ];

  return (
    <div className="space-y-6">
      <ol className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className={cn('flex items-center gap-3 rounded-md border p-3', r.at ? 'bg-card' : 'bg-muted/20 text-muted-foreground')}>
            {r.at ? <Check className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground/50" />}
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm', r.at && 'font-medium text-foreground')}>{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.who}</p>
            </div>
            <p className="whitespace-nowrap text-sm">{r.at ? formatDateTime(r.at) : 'Pending'}</p>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 text-sm">
          {review.document_path ? 'A signed PDF copy is filed with the crew member’s documents.' : 'No PDF has been filed yet. Export the completed review to attach one.'}
        </div>
        {review.document_path && onOpenDocument && (
          <Button variant="outline" size="sm" onClick={onOpenDocument}>Open PDF</Button>
        )}
      </div>
    </div>
  );
};

export default ReviewSignaturesTab;
