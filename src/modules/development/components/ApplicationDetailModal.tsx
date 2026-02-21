import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle, XCircle, Clock, DollarSign, User, Calendar } from 'lucide-react';
import { useReviewApplication } from '@/modules/development/hooks/useDevelopmentMutations';
import {
  CATEGORY_CONFIG,
  APPLICATION_STATUS_CONFIG,
  APPROVAL_STEPS,
  type DevCategory,
  type ApplicationStatus,
} from '@/modules/development/constants';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
  canReview?: boolean;
  reviewStage?: 'hod' | 'peer' | 'captain' | null;
}

export default function ApplicationDetailModal({ open, onOpenChange, application, canReview, reviewStage }: Props) {
  const reviewMutation = useReviewApplication();
  const [comments, setComments] = useState('');
  const [isDiscretionary, setIsDiscretionary] = useState(false);
  const [discretionaryJustification, setDiscretionaryJustification] = useState('');

  if (!application) return null;

  const catConfig = CATEGORY_CONFIG[application.category as DevCategory];
  const statusConfig = APPLICATION_STATUS_CONFIG[application.status as ApplicationStatus];
  const currentStep = statusConfig?.step || 0;
  const crewName = application.crew_member
    ? `${application.crew_member.first_name} ${application.crew_member.last_name}`
    : 'Unknown';

  const handleReview = async (decision: 'approved' | 'returned') => {
    if (!reviewStage) return;
    await reviewMutation.mutateAsync({
      applicationId: application.id,
      stage: reviewStage,
      decision,
      comments,
      isDiscretionary: isDiscretionary && reviewStage === 'captain',
      discretionaryJustification: isDiscretionary ? discretionaryJustification : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {application.course_name}
            <Badge variant="outline" className={`${statusConfig?.color || ''} text-xs`}>
              {statusConfig?.label || application.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Applicant Info */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
          <User className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">{crewName}</p>
            <p className="text-xs text-muted-foreground">{application.application_number}</p>
          </div>
          {catConfig && (
            <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs ml-auto`}>
              {catConfig.label}
            </Badge>
          )}
        </div>

        {/* Approval Progress */}
        {currentStep >= 0 && (
          <div className="flex items-center gap-1">
            {APPROVAL_STEPS.map((step, i) => {
              const stepIndex = i + 1;
              const isDone = currentStep > stepIndex;
              const isCurrent = currentStep === stepIndex;
              return (
                <div key={step} className="flex-1">
                  <div className={`h-2 rounded-full ${isDone ? 'bg-success' : isCurrent ? 'bg-amber' : 'bg-muted'}`} />
                  <p className={`text-[10px] mt-1 text-center ${isCurrent ? 'text-amber font-medium' : 'text-muted-foreground'}`}>
                    {step}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <Separator />

        {/* Course Details */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {application.course_provider && (
            <div><span className="text-muted-foreground">Provider:</span> {application.course_provider}</div>
          )}
          {application.course_location && (
            <div><span className="text-muted-foreground">Location:</span> {application.course_location}</div>
          )}
          {application.course_start_date && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {format(new Date(application.course_start_date), 'dd MMM yyyy')}
              {application.course_end_date && ` — ${format(new Date(application.course_end_date), 'dd MMM yyyy')}`}
            </div>
          )}
          {application.course_duration_days && (
            <div><span className="text-muted-foreground">Duration:</span> {application.course_duration_days} days</div>
          )}
          {application.vessel?.name && (
            <div><span className="text-muted-foreground">Vessel:</span> {application.vessel.name}</div>
          )}
        </div>

        {application.course_description && (
          <div>
            <Label className="text-muted-foreground text-xs">Description / Justification</Label>
            <p className="text-sm mt-1">{application.course_description}</p>
          </div>
        )}

        <Separator />

        {/* Cost Breakdown */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Cost Estimate
          </h3>
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
            {application.estimated_tuition_usd > 0 && (
              <div className="flex justify-between"><span>Tuition</span><span>${application.estimated_tuition_usd?.toLocaleString()}</span></div>
            )}
            {application.estimated_travel_usd > 0 && (
              <div className="flex justify-between"><span>Travel</span><span>${application.estimated_travel_usd?.toLocaleString()}</span></div>
            )}
            {application.estimated_accommodation_usd > 0 && (
              <div className="flex justify-between"><span>Accommodation</span><span>${application.estimated_accommodation_usd?.toLocaleString()}</span></div>
            )}
            {application.estimated_food_per_diem_usd > 0 && (
              <div className="flex justify-between"><span>Food per diem</span><span>${application.estimated_food_per_diem_usd?.toLocaleString()}/day</span></div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span><span>${application.estimated_total_usd?.toLocaleString() || '0'}</span>
            </div>
          </div>
        </div>

        {/* Previous Reviews */}
        {[
          { stage: 'hod', label: 'HOD Review', reviewer: application.hod_reviewer_id, date: application.hod_reviewed_at, decision: application.hod_decision, comments: application.hod_comments },
          { stage: 'peer', label: 'Peer Review', reviewer: application.peer_reviewer_id, date: application.peer_reviewed_at, decision: application.peer_decision, comments: application.peer_comments },
          { stage: 'captain', label: 'Captain Review', reviewer: application.captain_reviewer_id, date: application.captain_reviewed_at, decision: application.captain_decision, comments: application.captain_comments },
        ].filter((r) => r.reviewer).map((review) => (
          <div key={review.stage} className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2">
              {review.decision === 'approved' ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm font-medium">{review.label}</span>
              {review.date && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {format(new Date(review.date), 'dd MMM yyyy HH:mm')}
                </span>
              )}
            </div>
            {review.comments && <p className="text-sm text-muted-foreground">{review.comments}</p>}
          </div>
        ))}

        {/* Review Actions */}
        {canReview && reviewStage && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Your Review</h3>
              <div className="space-y-2">
                <Label>Comments</Label>
                <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder="Add review comments..." />
              </div>

              {reviewStage === 'captain' && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={isDiscretionary} onCheckedChange={(v) => setIsDiscretionary(!!v)} />
                    <span className="text-sm">Approve as discretionary (outside standard policy)</span>
                  </label>
                  {isDiscretionary && (
                    <div className="space-y-2">
                      <Label>Justification (required)</Label>
                      <Textarea
                        value={discretionaryJustification}
                        onChange={(e) => setDiscretionaryJustification(e.target.value)}
                        rows={2}
                        placeholder="Explain why this is approved outside standard policy..."
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30"
                  onClick={() => handleReview('returned')}
                  disabled={reviewMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" /> Return
                </Button>
                <Button
                  onClick={() => handleReview('approved')}
                  disabled={reviewMutation.isPending || (isDiscretionary && !discretionaryJustification)}
                >
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
