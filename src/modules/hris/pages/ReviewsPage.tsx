import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, ClipboardList, Plus, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useCrewReviews, useMyReviews, useReviewCycles, useReviewMutations, useReviewsConducting, type PerformanceReview } from '@/modules/hris/hooks/usePerformanceReviews';
import { REVIEW_TYPES, pageTitleForType, reviewTypeFromPath, type ReviewType } from '@/modules/hris/lib/reviews';
import { ReviewsOverview } from '@/modules/hris/components/reviews/ReviewsOverview';
import { ReviewCyclesPanel } from '@/modules/hris/components/reviews/ReviewCyclesPanel';
import { ReviewsTable } from '@/modules/hris/components/reviews/ReviewsTable';
import { ReviewDetail } from '@/modules/hris/components/reviews/ReviewDetail';
import { ReviewFormDialog } from '@/modules/hris/components/reviews/ReviewFormDialog';
import type { ReviewFormValues } from '@/modules/hris/lib/reviewForm';

const REVIEW_PARAM = 'review';

const ReviewsPage: React.FC = () => {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const { profileId, entry, setProfileId, selfOnly, access } = useSelectedCrew();
  const { vessels } = useCompanyVessels();
  const { cycles } = useReviewCycles();
  const mutations = useReviewMutations();

  const routeType = useMemo(() => reviewTypeFromPath(pathname), [pathname]);
  const [typeFilter, setTypeFilter] = useState<ReviewType | 'all'>(routeType);
  useEffect(() => setTypeFilter(routeType), [routeType]);

  const reviewId = searchParams.get(REVIEW_PARAM);
  const openReview = (id: string | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set(REVIEW_PARAM, id);
      else next.delete(REVIEW_PARAM);
      return next;
    });

  const selectCrew = (id: string | null) => {
    openReview(null);
    setProfileId(id);
  };

  const [createOpen, setCreateOpen] = useState(false);
  const canEdit = !access.loading && access.canEdit;

  const crewReviews = useCrewReviews(!selfOnly ? profileId : null);
  const crewRows = useMemo(
    () => (typeFilter === 'all' ? crewReviews.reviews : crewReviews.reviews.filter((r) => r.review_type === typeFilter)),
    [crewReviews.reviews, typeFilter],
  );

  const mine = useMyReviews();
  const conducting = useReviewsConducting();

  const createDefaults = useMemo<Partial<ReviewFormValues>>(
    () => ({
      profile_id: profileId ?? '',
      vessel_id: entry?.vessel_id ?? '',
      review_type: routeType,
      reviewer_profile_id: canEdit && profile?.id && profile.id !== profileId ? profile.id : '',
    }),
    [profileId, entry?.vessel_id, routeType, canEdit, profile?.id],
  );

  const handleCreate = async (values: ReviewFormValues) => {
    const created = await mutations.create.mutateAsync({
      profile_id: values.profile_id,
      reviewer_profile_id: values.reviewer_profile_id || null,
      review_type: values.review_type,
      cycle_id: values.cycle_id || null,
      vessel_id: values.vessel_id || null,
      period_start: values.period_start || null,
      period_end: values.period_end || null,
      due_date: values.due_date || null,
      status: 'draft',
    });
    setCreateOpen(false);
    openReview(created.id);
  };

  const mode: 'review' | 'self' | 'crew' | 'overview' = reviewId ? 'review' : selfOnly ? 'self' : profileId ? 'crew' : 'overview';
  const title = pageTitleForType(typeFilter === 'all' ? 'all' : routeType);

  const description =
    mode === 'review'
      ? undefined
      : mode === 'self'
        ? 'Your evaluations, reviews and catch-ups, and anything waiting for your input.'
        : mode === 'crew'
          ? `Review history for ${entry?.displayName ?? 'the selected crew member'}.`
          : 'Due dates, cycles and every review across the company.';

  const conductingCard = (rows: PerformanceReview[], subtitle: string) => (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-muted-foreground" /> Reviews I'm conducting
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ReviewsTable reviews={rows} isLoading={conducting.isLoading} onOpen={(id) => openReview(id)} emptyMessage="Nothing assigned to you." />
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={ClipboardCheck}
        title={title}
        description={description}
        actions={
          mode !== 'review' && (
            <>
              {mode === 'crew' && (
                <Button variant="outline" onClick={() => selectCrew(null)}>
                  <Users className="mr-2 h-4 w-4" /> All crew
                </Button>
              )}
              {mode === 'crew' && canEdit && (
                <Button onClick={() => setCreateOpen(true)} disabled={mutations.create.isPending}>
                  <Plus className="mr-2 h-4 w-4" /> New review
                </Button>
              )}
            </>
          )
        }
        toolbar={
          mode !== 'review' && (
            <>
              {!selfOnly && (
                <CrewPicker value={profileId} onChange={(id) => selectCrew(id)} includeInactive className="md:w-[420px]" placeholder="Select a crew member to see their reviews" />
              )}
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ReviewType | 'all')}>
                <SelectTrigger className="md:w-56"><SelectValue placeholder="Review type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All review types</SelectItem>
                  {REVIEW_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )
        }
      />

      {mode === 'review' && reviewId && (
        <ReviewDetail reviewId={reviewId} onBack={() => openReview(null)} onSelectCrew={selfOnly ? undefined : (id) => selectCrew(id)} />
      )}

      {mode === 'self' && (
        <div className="space-y-6">
          {mine.awaitingMe.length > 0 && (
            <Card className="border-primary/40 bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserCheck className="h-4 w-4 text-primary" /> Waiting for you
                </CardTitle>
                <CardDescription>Complete your self-assessment or acknowledge a signed review.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ReviewsTable
                  reviews={mine.awaitingMe}
                  onOpen={(id) => openReview(id)}
                  hideCrew
                  rowAction={(r) => (
                    <Button size="sm" className="h-7 text-xs" onClick={() => openReview(r.id)}>
                      {r.status === 'self_assessment' ? 'Self-assess' : 'Acknowledge'}
                    </Button>
                  )}
                />
              </CardContent>
            </Card>
          )}
          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">My reviews</CardTitle>
              <CardDescription>Reviews shared with you. Drafts appear once your reviewer sends them.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ReviewsTable
                reviews={typeFilter === 'all' ? mine.reviews : mine.reviews.filter((r) => r.review_type === typeFilter)}
                isLoading={mine.isLoading}
                onOpen={(id) => openReview(id)}
                hideCrew
                emptyMessage="No reviews have been shared with you yet."
              />
            </CardContent>
          </Card>
          {conducting.reviews.length > 0 && conductingCard(conducting.reviews, 'Reviews where you are the assigned reviewer.')}
        </div>
      )}

      {mode === 'crew' && (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reviews for {entry?.displayName ?? 'crew member'}</CardTitle>
            <CardDescription>Every evaluation, review and catch-up on record. Click a row to open it.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ReviewsTable
              reviews={crewRows}
              isLoading={crewReviews.isLoading}
              onOpen={(id) => openReview(id)}
              hideCrew
              emptyMessage={canEdit ? 'No reviews yet. Use "New review" to start one.' : 'No reviews on record.'}
            />
          </CardContent>
        </Card>
      )}

      {mode === 'overview' &&
        (access.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-6">
            {!canEdit && conducting.reviews.length > 0 && conductingCard(conducting.awaiting.length ? conducting.awaiting : conducting.reviews, 'Reviews assigned to you as reviewer that still need your input.')}
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="cycles">Cycles</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="mt-4">
                <ReviewsOverview type={typeFilter} onOpenReview={(id) => openReview(id)} onSelectCrew={(id) => selectCrew(id)} />
              </TabsContent>
              <TabsContent value="cycles" className="mt-4">
                <ReviewCyclesPanel defaultType={typeFilter} canEdit={canEdit} />
              </TabsContent>
            </Tabs>
          </div>
        ))}

      <ReviewFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaults={createDefaults}
        lockSubject={Boolean(profileId)}
        cycles={cycles}
        vessels={vessels}
        onSubmit={handleCreate}
        isPending={mutations.create.isPending}
      />
    </div>
  );
};

export default ReviewsPage;
