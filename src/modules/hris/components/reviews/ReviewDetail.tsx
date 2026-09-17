import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  Pencil,
  Play,
  Save,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TablesUpdate } from '@/integrations/supabase/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/shared/hooks/use-toast';
import { getCrewDocumentSignedUrl } from '@/lib/storage/crewDocuments';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useCompetencies, useReview, useReviewCycles, useReviewMutations, type PerformanceReview } from '@/modules/hris/hooks/usePerformanceReviews';
import { daysUntil, expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/hris/lib/format';
import { buildReviewPdf, pdfToFile } from '@/modules/hris/lib/reviewPdf';
import {
  REVIEW_STEPS,
  STATUS_LABEL,
  canTransition,
  followUpsToJson,
  isTerminalStatus,
  missingRatings,
  parseFollowUps,
  parseRatings,
  ratingLabel,
  ratingsToJson,
  reviewFileName,
  reviewTypeLabel,
  reviewerCanEditIn,
  seedRatings,
  stepIndex,
  type CompetencyRating,
  type FollowUpAction,
} from '@/modules/hris/lib/reviews';
import { AcknowledgeDialog } from './AcknowledgeDialog';
import { ReviewEvidenceTab } from './ReviewEvidenceTab';
import { ReviewFollowUpTab, type Recommendations } from './ReviewFollowUpTab';
import { ReviewFormDialog, type ReviewFormValues } from './ReviewFormDialog';
import { ReviewNarrativeTab, type NarrativeField, type NarrativeValues } from './ReviewNarrativeTab';
import { ReviewRatingsGrid } from './ReviewRatingsGrid';
import { ReviewSignaturesTab } from './ReviewSignaturesTab';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { SelfAssessmentForm } from './SelfAssessmentForm';

interface ReviewDetailProps {
  reviewId: string;
  onBack: () => void;
  onSelectCrew?: (profileId: string) => void;
}

interface ReviewDraft extends NarrativeValues, Recommendations {
  ratings: CompetencyRating[];
  welfare_notes: string;
  follow_up_actions: FollowUpAction[];
  next_review_date: string;
}

const nullable = (value: string): string | null => (value.trim() ? value : null);

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

const Stepper: React.FC<{ status: string }> = ({ status }) => {
  const current = stepIndex(status);
  const cancelled = status === 'cancelled';
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {REVIEW_STEPS.map((step, idx) => {
        const done = !cancelled && idx < current;
        const active = !cancelled && idx === current;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 items-center gap-1 rounded-full border px-2',
                done && 'border-green-500/30 bg-green-500/10 text-green-600',
                active && 'border-primary bg-primary/10 text-primary',
                !done && !active && 'border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : <span className="font-mono">{idx + 1}</span>}
              {STATUS_LABEL[step]}
            </span>
            {idx < REVIEW_STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
          </li>
        );
      })}
      {cancelled && <li><Badge variant="outline" className="bg-destructive/10 text-destructive">Cancelled</Badge></li>}
    </ol>
  );
};

/** Full review page: header, stepper, state-driven actions and the five tabs. */
export const ReviewDetail: React.FC<ReviewDetailProps> = ({ reviewId, onBack, onSelectCrew }) => {
  const { profile } = useAuth();
  const access = useHrAccess();
  const { toast } = useToast();
  const { review, isLoading, isError } = useReview(reviewId);
  const { competencies } = useCompetencies();
  const { vessels, vesselName } = useCompanyVessels();
  const { cycles } = useReviewCycles();
  const mutations = useReviewMutations();

  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [baseline, setBaseline] = useState<string>('');
  const [tab, setTab] = useState('ratings');
  const [editMeta, setEditMeta] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [ackOpen, setAckOpen] = useState(false);

  const myProfileId = profile?.id ?? null;
  const isReviewer = Boolean(review && myProfileId && review.reviewer_profile_id === myProfileId);
  const isSubject = Boolean(review && myProfileId && review.profile_id === myProfileId);
  const canEdit = !access.loading && access.canEdit;
  const canAdmin = !access.loading && access.canAdmin;
  const canManage = (canEdit || isReviewer) && !isSubject;
  const status = review?.status ?? 'draft';
  const editable = canManage && reviewerCanEditIn(status);
  const canToggleDone = canManage && !isTerminalStatus(status);
  const showWelfare = canManage;

  // Working copy of every reviewer-editable field, built from the server row.
  const seed = useCallback(
    (r: PerformanceReview): ReviewDraft => ({
      ratings: seedRatings(parseRatings(r.ratings), competencies),
      strengths: r.strengths ?? '',
      development_areas: r.development_areas ?? '',
      training_needs: r.training_needs ?? '',
      career_aspirations: r.career_aspirations ?? '',
      summary: r.summary ?? '',
      reviewer_comments: r.reviewer_comments ?? '',
      welfare_notes: r.welfare_notes ?? '',
      follow_up_actions: parseFollowUps(r.follow_up_actions),
      next_review_date: r.next_review_date ?? '',
      recommend_promotion: r.recommend_promotion,
      recommend_pay_review: r.recommend_pay_review,
      retain: r.retain,
    }),
    [competencies],
  );

  // Re-seed whenever the server row changes (a save bumps updated_at) or the competency list loads.
  useEffect(() => {
    if (!review) return;
    const next = seed(review);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [review, seed]);

  const dirty = Boolean(draft) && JSON.stringify(draft) !== baseline;
  const patchDraft = (next: Partial<ReviewDraft>) => setDraft((prev) => (prev ? { ...prev, ...next } : prev));

  const buildPatch = (): TablesUpdate<'performance_reviews'> => {
    if (!draft) return {};
    if (!editable) return { follow_up_actions: followUpsToJson(draft.follow_up_actions) };
    return {
      ratings: ratingsToJson(draft.ratings),
      strengths: nullable(draft.strengths),
      development_areas: nullable(draft.development_areas),
      training_needs: nullable(draft.training_needs),
      career_aspirations: nullable(draft.career_aspirations),
      summary: nullable(draft.summary),
      reviewer_comments: nullable(draft.reviewer_comments),
      ...(showWelfare ? { welfare_notes: nullable(draft.welfare_notes) } : {}),
      follow_up_actions: followUpsToJson(draft.follow_up_actions),
      next_review_date: draft.next_review_date || null,
      recommend_promotion: draft.recommend_promotion,
      recommend_pay_review: draft.recommend_pay_review,
      retain: draft.retain,
    };
  };

  const save = async () => {
    if (!review || !draft) return;
    await mutations.update.mutateAsync({ review, patch: buildPatch() });
    setBaseline(JSON.stringify(draft));
  };

  const signAndSend = async () => {
    if (!review || !draft) return;
    const patch = buildPatch();
    delete patch.ratings; // signAndSend serialises the ratings itself after validating them
    await mutations.signAndSend.mutateAsync({ review, ratings: draft.ratings, competencies, patch });
    setBaseline(JSON.stringify(draft));
  };

  const exportPdf = (): ReturnType<typeof buildReviewPdf> | null => {
    if (!review) return null;
    return buildReviewPdf({
      review,
      subject: { name: review.crew_name, rank: review.subject?.rank ?? review.subject?.position, department: review.subject?.department },
      reviewer: review.reviewer ? { name: review.reviewer_name ?? '', rank: review.reviewer.rank } : null,
      vesselName: review.vessel_name,
      cycleName: review.cycle_name,
      includeWelfareNotes: false,
    });
  };

  const download = () => {
    const doc = exportPdf();
    if (!doc || !review) return;
    doc.save(reviewFileName(review, review.crew_name));
  };

  const filePdf = async () => {
    const doc = exportPdf();
    if (!doc || !review) return;
    const file = pdfToFile(doc, reviewFileName(review, review.crew_name));
    await mutations.uploadDocument.mutateAsync({ review, file, crewUserId: review.subject?.user_id ?? review.profile_id });
  };

  const openDocument = async () => {
    try {
      const url = await getCrewDocumentSignedUrl(review?.document_path);
      if (!url) throw new Error('Document has no storage path');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({ title: 'Could not open PDF', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    }
  };

  const saveMeta = async (values: ReviewFormValues) => {
    if (!review) return;
    await mutations.update.mutateAsync({
      review,
      patch: {
        reviewer_profile_id: values.reviewer_profile_id || null,
        review_type: values.review_type,
        cycle_id: values.cycle_id || null,
        vessel_id: values.vessel_id || null,
        period_start: values.period_start || null,
        period_end: values.period_end || null,
        due_date: values.due_date || null,
      },
    });
    setEditMeta(false);
  };

  const busy =
    mutations.update.isPending ||
    mutations.sendForSelfAssessment.isPending ||
    mutations.startReview.isPending ||
    mutations.signAndSend.isPending ||
    mutations.cancel.isPending ||
    mutations.remove.isPending ||
    mutations.uploadDocument.isPending;

  const missing = useMemo(() => (draft ? missingRatings(draft.ratings, competencies) : []), [draft, competencies]);
  const selfRatings = useMemo(() => parseRatings(review?.self_ratings), [review?.self_ratings]);
  const showSelf = Boolean(review?.self_assessment_submitted_at) || selfRatings.length > 0;

  if (isLoading || access.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !review || !draft) {
    return (
      <Card className="border-dashed bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="font-medium text-foreground">Review not found</p>
          <p className="text-sm text-muted-foreground">It may have been deleted, or you do not have access to it yet.</p>
          <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        </CardContent>
      </Card>
    );
  }

  const dueTone = !isTerminalStatus(status) && review.due_date ? expiryTone(review.due_date) : 'none';
  const subjectSelfAssessing = isSubject && status === 'self_assessment';
  const subjectAcknowledging = isSubject && status === 'awaiting_acknowledgement';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (editable || canToggleDone) && (
            <Button variant="outline" onClick={() => void save()} disabled={busy}>
              {mutations.update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
            </Button>
          )}
          {canManage && status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => setEditMeta(true)} disabled={busy}><Pencil className="mr-2 h-4 w-4" /> Edit details</Button>
              <Button variant="outline" onClick={() => mutations.sendForSelfAssessment.mutate(review)} disabled={busy || !review.reviewer_profile_id}>
                <Send className="mr-2 h-4 w-4" /> Send for self-assessment
              </Button>
              <Button onClick={() => mutations.startReview.mutate(review)} disabled={busy || !review.reviewer_profile_id}>
                <Play className="mr-2 h-4 w-4" /> Start review
              </Button>
            </>
          )}
          {canManage && status === 'self_assessment' && (
            <>
              <Button variant="outline" onClick={() => setEditMeta(true)} disabled={busy}><Pencil className="mr-2 h-4 w-4" /> Edit details</Button>
              <Button variant="outline" onClick={() => mutations.startReview.mutate(review)} disabled={busy}>
                <Play className="mr-2 h-4 w-4" /> Start review without self-assessment
              </Button>
            </>
          )}
          {canManage && status === 'in_review' && (
            <Button onClick={() => void signAndSend()} disabled={busy || missing.length > 0 || competencies.length === 0} title={missing.length ? `Unrated: ${missing.map((m) => m.name).join(', ')}` : undefined}>
              {mutations.signAndSend.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />} Sign & send to crew
            </Button>
          )}
          {subjectAcknowledging && (
            <Button onClick={() => setAckOpen(true)} disabled={mutations.acknowledge.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Acknowledge review
            </Button>
          )}
          {status === 'completed' && (
            <>
              <Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" /> Export PDF</Button>
              {canManage && (
                <Button variant="outline" onClick={() => void filePdf()} disabled={busy}>
                  {mutations.uploadDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
                  {review.document_path ? 'Re-file PDF' : 'File PDF to records'}
                </Button>
              )}
            </>
          )}
          {canEdit && canTransition(status, 'cancelled') && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirm('cancel')} disabled={busy}>
              <Ban className="mr-2 h-4 w-4" /> Cancel review
            </Button>
          )}
          {canAdmin && status === 'draft' && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirm('delete')} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <Card className="bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={review.subject?.avatar_url ?? undefined} alt="" />
                <AvatarFallback>{initials(review.crew_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-foreground">{review.crew_name}</h2>
                  <ReviewStatusBadge status={status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {[review.subject?.rank ?? review.subject?.position, review.subject?.department, review.vessel_name].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-medium">{reviewTypeLabel(review.review_type)}</span>
                  {review.cycle_name && <span className="text-muted-foreground"> · {review.cycle_name}</span>}
                  {(review.period_start || review.period_end) && (
                    <span className="text-muted-foreground"> · {formatDate(review.period_start)} – {formatDate(review.period_end)}</span>
                  )}
                </p>
                {onSelectCrew && !isSubject && (
                  <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => onSelectCrew(review.profile_id)}>
                    <UserRound className="mr-1 h-3 w-3" /> All reviews for {review.crew_name}
                  </Button>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Reviewer</dt>
                <dd className="font-medium">{review.reviewer_name ?? <span className="italic text-muted-foreground">Unassigned</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Due</dt>
                <dd className="flex items-center gap-2 font-medium">
                  {formatDate(review.due_date)}
                  {dueTone !== 'none' && dueTone !== 'ok' && (
                    <Badge variant="outline" className={cn('text-[10px]', toneClass[dueTone])}>{expiryLabel(review.due_date)}</Badge>
                  )}
                  {dueTone === 'ok' && daysUntil(review.due_date) !== null && <span className="text-xs font-normal text-muted-foreground">{expiryLabel(review.due_date)}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Overall rating</dt>
                <dd className="font-medium">
                  {review.overall_rating ?? '—'}
                  {review.overall_rating !== null && <span className="ml-1 text-xs font-normal text-muted-foreground">{ratingLabel(review.overall_rating)}</span>}
                </dd>
              </div>
            </dl>
          </div>
          <Stepper status={status} />
        </CardContent>
      </Card>

      {subjectSelfAssessing && (
        <SelfAssessmentForm
          review={review}
          competencies={competencies}
          isPending={mutations.submitSelfAssessment.isPending}
          onSubmit={async (ratings, comments) => {
            await mutations.submitSelfAssessment.mutateAsync({ reviewId: review.id, selfRatings: ratings, comments });
          }}
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="ratings">Ratings</TabsTrigger>
          <TabsTrigger value="narrative">Narrative</TabsTrigger>
          <TabsTrigger value="followup">Follow-up</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="signatures">Signatures</TabsTrigger>
        </TabsList>
        <Card className="mt-3 bg-card">
          <CardContent className="p-5">
            <TabsContent value="ratings" className="mt-0">
              {isSubject && status === 'self_assessment' ? (
                <p className="text-sm text-muted-foreground">Your reviewer's ratings will appear here after you submit your self-assessment and they complete the review.</p>
              ) : (
                <ReviewRatingsGrid
                  ratings={draft.ratings}
                  selfRatings={selfRatings}
                  competencies={competencies}
                  editable={editable}
                  onChange={(next) => patchDraft({ ratings: next })}
                  showSelf={showSelf}
                  storedOverall={review.overall_rating}
                />
              )}
            </TabsContent>
            <TabsContent value="narrative" className="mt-0">
              <ReviewNarrativeTab
                values={draft}
                editable={editable}
                employeeComments={review.employee_comments}
                onChange={(field: NarrativeField, value) => patchDraft({ [field]: value } as Partial<ReviewDraft>)}
              />
            </TabsContent>
            <TabsContent value="followup" className="mt-0">
              <ReviewFollowUpTab
                actions={draft.follow_up_actions}
                onActionsChange={(next) => patchDraft({ follow_up_actions: next })}
                nextReviewDate={draft.next_review_date}
                onNextReviewDateChange={(v) => patchDraft({ next_review_date: v })}
                recommendations={{ recommend_promotion: draft.recommend_promotion, recommend_pay_review: draft.recommend_pay_review, retain: draft.retain }}
                onRecommendationChange={(key, value) => patchDraft({ [key]: value } as Partial<ReviewDraft>)}
                welfareNotes={draft.welfare_notes}
                onWelfareNotesChange={(v) => patchDraft({ welfare_notes: v })}
                editable={editable}
                canToggleDone={canToggleDone}
                showWelfare={showWelfare}
              />
            </TabsContent>
            <TabsContent value="evidence" className="mt-0">
              <ReviewEvidenceTab review={review} vesselName={vesselName} />
            </TabsContent>
            <TabsContent value="signatures" className="mt-0">
              <ReviewSignaturesTab review={review} onOpenDocument={() => void openDocument()} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      <ReviewFormDialog
        open={editMeta}
        onOpenChange={setEditMeta}
        review={review}
        cycles={cycles}
        vessels={vessels}
        onSubmit={saveMeta}
        isPending={mutations.update.isPending}
      />

      <AcknowledgeDialog
        open={ackOpen}
        onOpenChange={setAckOpen}
        review={review}
        isPending={mutations.acknowledge.isPending}
        onConfirm={async (comments) => {
          await mutations.acknowledge.mutateAsync({ reviewId: review.id, comments });
          setAckOpen(false);
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'delete' ? 'Delete this draft?' : 'Cancel this review?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'delete'
                ? 'The draft is removed permanently. Nothing has been sent to the crew member.'
                : 'The review is kept for the record but closed without completion. The crew member will no longer be asked to act on it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                const action = confirm === 'delete' ? mutations.remove : mutations.cancel;
                action.mutate(review, {
                  onSuccess: () => {
                    setConfirm(null);
                    if (confirm === 'delete') onBack();
                  },
                });
              }}
            >
              {confirm === 'delete' ? 'Delete draft' : 'Cancel review'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ReviewDetail;
