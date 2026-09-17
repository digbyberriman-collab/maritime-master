import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, LifeBuoy, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { useReviewEvidence, type PerformanceReview } from '@/modules/hris/hooks/usePerformanceReviews';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import { RatingInput } from './RatingInput';

interface ReviewEvidenceTabProps {
  review: PerformanceReview;
  vesselName: (id: string | null | undefined) => string | null;
}

/** Read-only supporting evidence: drill performance ratings in the period and open objectives. */
export const ReviewEvidenceTab: React.FC<ReviewEvidenceTabProps> = ({ review, vesselName }) => {
  const { drills, drillsLoading, drillAverage, objectives, objectivesLoading } = useReviewEvidence({
    userId: review.subject?.user_id,
    profileId: review.profile_id,
    periodStart: review.period_start,
    periodEnd: review.period_end,
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <LifeBuoy className="h-4 w-4 text-muted-foreground" /> Drill performance
            </h3>
            <p className="text-xs text-muted-foreground">
              Ratings given by the drill leader{review.period_start || review.period_end ? ` between ${formatDate(review.period_start)} and ${formatDate(review.period_end)}` : ''}.
            </p>
          </div>
          {drillAverage !== null && (
            <Badge variant="outline" className="text-xs">Average {drillAverage} over {drills.length} drill{drills.length === 1 ? '' : 's'}</Badge>
          )}
        </div>
        {!review.subject?.user_id ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">This crew member has no login yet, so no drill records are linked.</p>
        ) : drillsLoading ? (
          <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></div>
        ) : drills.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No rated drill participation in this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Drill</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Comments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drills.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(d.date)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{d.drill_name ?? 'Drill'}</span>
                      <span className="block text-xs text-muted-foreground">{d.drill_number}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{vesselName(d.vessel_id) ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{d.station_assignment ?? '—'}</TableCell>
                    <TableCell><RatingInput value={d.performance_rating} size="sm" /></TableCell>
                    <TableCell className="max-w-[280px] text-sm text-muted-foreground">{d.comments ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Target className="h-4 w-4 text-muted-foreground" /> Open objectives
            </h3>
            <p className="text-xs text-muted-foreground">Objectives and PDP items still in progress for this crew member.</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to={`${HRIS_PATHS.objectives}?crew=${review.profile_id}`}>
              Objectives & PDPs <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        {objectivesLoading ? (
          <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></div>
        ) : objectives.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No open objectives.</p>
        ) : (
          <ul className="space-y-2">
            {objectives.map((o) => (
              <li key={o.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_120px_160px]">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{o.title}</p>
                  <p className="text-xs text-muted-foreground">{humanise(o.category)} · target {formatDate(o.target_date)}</p>
                </div>
                <Badge variant="outline" className="h-6 justify-center text-[11px]">{humanise(o.status)}</Badge>
                <div className="flex items-center gap-2">
                  <Progress value={o.progress_pct} className="h-2" />
                  <span className="w-10 text-right text-xs text-muted-foreground">{o.progress_pct}%</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ReviewEvidenceTab;
