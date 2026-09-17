import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CompetencyRow, PerformanceReview } from '@/modules/hris/hooks/usePerformanceReviews';
import { computeOverallRating, missingRatings, parseRatings, ratingLabel, seedRatings, type CompetencyRating } from '@/modules/hris/lib/reviews';
import { RatingInput } from './RatingInput';

interface SelfAssessmentFormProps {
  review: PerformanceReview;
  competencies: CompetencyRow[];
  onSubmit: (selfRatings: CompetencyRating[], comments: string) => Promise<void>;
  isPending?: boolean;
}

/** The crew member rates themselves against each competency and adds comments, then submits (RPC). */
export const SelfAssessmentForm: React.FC<SelfAssessmentFormProps> = ({ review, competencies, onSubmit, isPending }) => {
  const [ratings, setRatings] = useState<CompetencyRating[]>(() => seedRatings(parseRatings(review.self_ratings), competencies));
  const [comments, setComments] = useState(review.employee_comments ?? '');

  useEffect(() => {
    setRatings(seedRatings(parseRatings(review.self_ratings), competencies));
  }, [review.id, review.self_ratings, competencies]);

  const missing = useMemo(() => missingRatings(ratings, competencies), [ratings, competencies]);
  const overall = computeOverallRating(ratings);
  const patch = (id: string, next: Partial<CompetencyRating>) => setRatings((prev) => prev.map((r) => (r.competency_id === id ? { ...r, ...next } : r)));

  return (
    <Card className="border-primary/40 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Your self-assessment</CardTitle>
        <CardDescription>
          Rate yourself honestly against each competency and add examples. Your reviewer sees this next to their own rating; nothing is sent until you submit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4">
          {ratings.map((r) => {
            const description = competencies.find((c) => c.id === r.competency_id)?.description;
            return (
              <div key={r.competency_id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="space-y-2">
                  <p className="font-medium text-foreground">{r.name}</p>
                  {description && <p className="text-xs text-muted-foreground">{description}</p>}
                  <RatingInput value={r.rating} onChange={(v) => patch(r.competency_id, { rating: v })} aria-label={`Self rating for ${r.name}`} />
                </div>
                <Textarea
                  rows={2}
                  value={r.comment}
                  placeholder="An example from this period…"
                  onChange={(e) => patch(r.competency_id, { comment: e.target.value })}
                  className="text-sm"
                />
              </div>
            );
          })}
          {ratings.length === 0 && <p className="text-sm text-muted-foreground">No competencies have been set up yet — you can still add comments below.</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="self-comments">Your comments</Label>
          <Textarea
            id="self-comments"
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Highlights, challenges, support you need, where you want to go next…"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {overall !== null ? (
              <>Your overall: <span className="font-medium text-foreground">{overall}</span> · {ratingLabel(overall)}</>
            ) : (
              'Rate each competency to see your overall.'
            )}
            {missing.length > 0 && ratings.length > 0 && <span className="block text-xs">Still to rate: {missing.map((m) => m.name).join(', ')}</span>}
          </p>
          <Button onClick={() => void onSubmit(ratings, comments)} disabled={isPending || (ratings.length > 0 && missing.length > 0)}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Submit self-assessment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SelfAssessmentForm;
