import React from 'react';
import { ChevronRight, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatMinor, humanise } from '@/modules/hris/lib/format';
import { formatPct, type PayReviewListItem } from '@/modules/hris/lib/payReviewHelpers';
import { ReviewStatusBadge } from './ReviewStatusBadge';

interface ReviewsTableProps {
  reviews: PayReviewListItem[];
  isLoading: boolean;
  /** Company view: show the crew column and select crew on click. */
  showCrew?: boolean;
  onSelectCrew?: (profileId: string) => void;
  onSelectReview?: (review: PayReviewListItem) => void;
  selectedId?: string | null;
  emptyHint?: string;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

const pctClass = (pct: number | null) => (pct === null ? 'text-muted-foreground' : pct < 0 ? 'text-destructive' : pct > 0 ? 'text-green-500' : 'text-foreground');

export const ReviewsTable: React.FC<ReviewsTableProps> = ({ reviews, isLoading, showCrew, onSelectCrew, onSelectReview, selectedId, emptyHint }) => (
  <Card className="bg-card">
    <CardContent className="p-0">
      {isLoading ? (
        <div className="space-y-2 p-6">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">No pay reviews</p>
          <p className="text-sm text-muted-foreground">{emptyHint ?? 'Reviews matching the current filters will appear here.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {showCrew && <TableHead>Crew</TableHead>}
                <TableHead>Review date</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Previous</TableHead>
                <TableHead className="text-right">Proposed</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((r) => (
                <TableRow
                  key={r.id}
                  className={cn((onSelectCrew || onSelectReview) && 'cursor-pointer', selectedId === r.id && 'bg-accent/40')}
                  onClick={() => (showCrew ? onSelectCrew?.(r.profile_id) : onSelectReview?.(r))}
                >
                  {showCrew && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={r.avatar_url ?? undefined} alt="" />
                          <AvatarFallback className="text-[10px]">{initials(r.crew_name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{r.crew_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{[r.rank, r.department].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap">{formatDate(r.review_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(r.effective_date)}</TableCell>
                  <TableCell>{humanise(r.reason)}</TableCell>
                  <TableCell><ReviewStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatMinor(r.previous_base_minor, r.currency)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-foreground">{formatMinor(r.proposed_base_minor, r.currency)}</TableCell>
                  <TableCell className={cn('text-right font-medium tabular-nums', pctClass(r.change_pct))}>{formatPct(r.change_pct)}</TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
);

export default ReviewsTable;
