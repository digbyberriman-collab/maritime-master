import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CompetencyRow } from '@/modules/hris/hooks/usePerformanceReviews';
import { computeOverallRating, ratingDelta, ratingLabel, type CompetencyRating } from '@/modules/hris/lib/reviews';
import { RatingInput } from './RatingInput';

interface ReviewRatingsGridProps {
  /** Reviewer ratings (working copy). */
  ratings: CompetencyRating[];
  selfRatings: CompetencyRating[];
  competencies: CompetencyRow[];
  /** Reviewer can edit ratings and comments. */
  editable: boolean;
  onChange?: (next: CompetencyRating[]) => void;
  /** Hide the self column while the crew member has not submitted yet. */
  showSelf: boolean;
  /** Stored overall on the review (shown alongside the live computed one). */
  storedOverall?: number | null;
}

const DeltaBadge: React.FC<{ delta: number | null }> = ({ delta }) => {
  if (delta === null) return <span className="text-muted-foreground">—</span>;
  const cls = delta > 0 ? 'bg-green-500/10 text-green-600 border-green-500/20' : delta < 0 ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' : 'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={cn('font-mono text-[11px]', cls)}>
      {delta > 0 ? `+${delta}` : delta}
    </Badge>
  );
};

/** Competency grid: self rating vs reviewer rating side by side with delta and a reviewer comment per row. */
export const ReviewRatingsGrid: React.FC<ReviewRatingsGridProps> = ({ ratings, selfRatings, competencies, editable, onChange, showSelf, storedOverall }) => {
  const selfById = useMemo(() => new Map(selfRatings.map((r) => [r.competency_id, r])), [selfRatings]);
  const descById = useMemo(() => new Map(competencies.map((c) => [c.id, c.description])), [competencies]);
  const overall = computeOverallRating(ratings);
  const selfOverall = computeOverallRating(selfRatings);
  const rated = ratings.filter((r) => r.rating !== null).length;

  const patch = (competencyId: string, next: Partial<CompetencyRating>) => {
    onChange?.(ratings.map((r) => (r.competency_id === competencyId ? { ...r, ...next } : r)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <div>
          <span className="text-muted-foreground">Overall (reviewer)</span>
          <p className="text-lg font-semibold leading-tight text-foreground">
            {overall ?? '—'} <span className="text-xs font-normal text-muted-foreground">{overall === null ? `${rated} of ${ratings.length} rated` : ratingLabel(overall)}</span>
          </p>
        </div>
        {showSelf && (
          <div>
            <span className="text-muted-foreground">Overall (self)</span>
            <p className="text-lg font-semibold leading-tight text-foreground">
              {selfOverall ?? '—'} <span className="text-xs font-normal text-muted-foreground">{selfOverall === null ? 'Not submitted' : ratingLabel(selfOverall)}</span>
            </p>
          </div>
        )}
        {storedOverall !== undefined && storedOverall !== null && storedOverall !== overall && (
          <p className="text-xs text-muted-foreground">Saved overall: {storedOverall} (unsaved changes)</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Competency</TableHead>
              {showSelf && <TableHead className="min-w-[150px]">Self</TableHead>}
              <TableHead className="min-w-[170px]">Reviewer</TableHead>
              {showSelf && <TableHead className="w-[1%] text-center">Δ</TableHead>}
              <TableHead className="min-w-[260px]">Reviewer comment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ratings.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No competencies configured for this company yet. An HR admin can add them.</TableCell></TableRow>
            )}
            {ratings.map((r) => {
              const self = selfById.get(r.competency_id);
              const description = descById.get(r.competency_id);
              return (
                <TableRow key={r.competency_id} className="align-top">
                  <TableCell>
                    <p className="font-medium text-foreground">{r.name}</p>
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                    {self?.comment && showSelf && <p className="mt-1 text-xs italic text-muted-foreground">“{self.comment}”</p>}
                  </TableCell>
                  {showSelf && (
                    <TableCell>
                      <RatingInput value={self?.rating ?? null} size="sm" aria-label={`Self rating for ${r.name}`} />
                    </TableCell>
                  )}
                  <TableCell>
                    <RatingInput
                      value={r.rating}
                      size="sm"
                      aria-label={`Reviewer rating for ${r.name}`}
                      onChange={editable ? (v) => patch(r.competency_id, { rating: v }) : undefined}
                    />
                  </TableCell>
                  {showSelf && <TableCell className="text-center"><DeltaBadge delta={ratingDelta(self?.rating, r.rating)} /></TableCell>}
                  <TableCell>
                    {editable ? (
                      <Textarea
                        rows={2}
                        value={r.comment}
                        placeholder="Evidence, examples, what to keep doing…"
                        onChange={(e) => patch(r.competency_id, { comment: e.target.value })}
                        className="min-h-[56px] text-sm"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm text-foreground">{r.comment || <span className="text-muted-foreground">—</span>}</p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ReviewRatingsGrid;
