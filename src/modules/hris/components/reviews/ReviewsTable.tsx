import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { daysUntil, expiryLabel, formatDate, toneClass } from '@/modules/hris/lib/format';
import { isTerminalStatus, reviewTypeLabel } from '@/modules/hris/lib/reviews';
import type { PerformanceReview } from '@/modules/hris/hooks/usePerformanceReviews';
import { ReviewStatusBadge } from './ReviewStatusBadge';

interface ReviewsTableProps {
  reviews: PerformanceReview[];
  isLoading?: boolean;
  onOpen: (reviewId: string) => void;
  /** Hide the crew column when the table is already scoped to one person. */
  hideCrew?: boolean;
  emptyMessage?: string;
  /** Optional per-row action slot (e.g. "Acknowledge"). */
  rowAction?: (review: PerformanceReview) => React.ReactNode;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

const dueTone = (review: PerformanceReview) => {
  if (isTerminalStatus(review.status) || !review.due_date) return 'none' as const;
  const days = daysUntil(review.due_date);
  if (days === null) return 'none' as const;
  if (days < 0) return 'expired' as const;
  if (days <= 14) return 'critical' as const;
  if (days <= 30) return 'warning' as const;
  return 'ok' as const;
};

/** Sortable-by-caller list of reviews; a row click opens the review. */
export const ReviewsTable: React.FC<ReviewsTableProps> = ({ reviews, isLoading, onOpen, hideCrew, emptyMessage = 'No reviews to show.', rowAction }) => {
  if (isLoading) {
    return (
      <div className="space-y-2 px-6 pb-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }
  if (!reviews.length) return <p className="px-6 pb-6 text-sm text-muted-foreground">{emptyMessage}</p>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {!hideCrew && <TableHead>Crew</TableHead>}
            <TableHead>Type</TableHead>
            <TableHead>Reviewer</TableHead>
            <TableHead>Vessel</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-center">Overall</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[1%]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((r) => {
            const tone = dueTone(r);
            return (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => onOpen(r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(r.id);
                  }
                }}
              >
                {!hideCrew && (
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={r.subject?.avatar_url ?? undefined} alt="" />
                        <AvatarFallback className="text-[10px]">{initials(r.crew_name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate">{r.crew_name}</span>
                        {(r.subject?.rank ?? r.subject?.position) && (
                          <span className="block truncate text-xs font-normal text-muted-foreground">{r.subject?.rank ?? r.subject?.position}</span>
                        )}
                      </span>
                    </span>
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap">
                  {reviewTypeLabel(r.review_type)}
                  {r.cycle_name && <span className="block text-xs text-muted-foreground">{r.cycle_name}</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{r.reviewer_name ?? <span className="italic">Unassigned</span>}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{r.vessel_name ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {r.period_start || r.period_end ? `${formatDate(r.period_start)} – ${formatDate(r.period_end)}` : '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    {formatDate(r.due_date)}
                    {tone !== 'none' && tone !== 'ok' && (
                      <Badge variant="outline" className={cn('text-[10px]', toneClass[tone])}>{expiryLabel(r.due_date)}</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-center font-medium">{r.overall_rating ?? '—'}</TableCell>
                <TableCell><ReviewStatusBadge status={r.status} /></TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="flex items-center justify-end gap-2">
                    {rowAction && <span onClick={(e) => e.stopPropagation()}>{rowAction(r)}</span>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default ReviewsTable;
