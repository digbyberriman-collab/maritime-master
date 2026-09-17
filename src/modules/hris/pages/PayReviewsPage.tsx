import React, { useMemo, useState } from 'react';
import { BadgeDollarSign, Plus, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { useActiveCompensation, useCompanyPayReviews, useCrewPayReviews, usePayReviewMutations } from '@/modules/hris/hooks/usePayReviews';
import { formatDate, formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  DEFAULT_REVIEW_FILTERS,
  REVIEW_REASONS,
  REVIEW_STATUSES,
  computeReviewKpis,
  reviewYear,
  type PayReviewFilters,
  type PayReviewListItem,
} from '@/modules/hris/lib/payReviewHelpers';
import { ReviewsTable } from '@/modules/hris/components/pay-reviews/ReviewsTable';
import { ReviewFormDialog } from '@/modules/hris/components/pay-reviews/ReviewFormDialog';
import { ReviewDetailCard } from '@/modules/hris/components/pay-reviews/ReviewDetailCard';
import { ReviewCycleSummary } from '@/modules/hris/components/pay-reviews/ReviewCycleSummary';

type FormState = { open: false } | { open: true; review: PayReviewListItem | null };

const PayReviewsPage: React.FC = () => {
  const { profileId, entry, setProfileId, isOwnRecord } = useSelectedCrew();
  const access = usePayrollAccess();
  const selfOnly = !access.loading && access.selfOnly;
  const canEdit = !access.loading && access.canEdit;
  const canAdmin = !access.loading && access.canAdmin;

  const [filters, setFilters] = useState<PayReviewFilters>(DEFAULT_REVIEW_FILTERS);
  const [form, setForm] = useState<FormState>({ open: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PayReviewListItem | null>(null);

  const company = useCompanyPayReviews(filters);
  const crew = useCrewPayReviews(selfOnly ? null : profileId);
  const compensation = useActiveCompensation(profileId);
  const m = usePayReviewMutations();
  const busy = m.create.isPending || m.update.isPending || m.approve.isPending || m.reject.isPending || m.apply.isPending || m.remove.isPending;

  const thisYear = new Date().getFullYear();
  const kpis = useMemo(() => (company.isLoading ? null : computeReviewKpis(company.all, thisYear)), [company.isLoading, company.all, thisYear]);
  const years = useMemo(() => Array.from(new Set(company.all.map(reviewYear))).sort((a, b) => b - a), [company.all]);

  const crewMode = Boolean(profileId) && !selfOnly;
  const selected = useMemo(
    () => crew.reviews.find((r) => r.id === selectedId) ?? crew.reviews[0] ?? null,
    [crew.reviews, selectedId],
  );
  const comp = compensation.compensation;
  const crewName = entry?.displayName;

  const submitForm = async (payload: Parameters<typeof m.create.mutateAsync>[0]['payload']) => {
    if (!form.open || !profileId) return;
    if (form.review) {
      await m.update.mutateAsync({ review: form.review, payload });
    } else {
      const created = await m.create.mutateAsync({ profileId, previousCompensationId: comp?.id ?? null, payload });
      setSelectedId(created.id);
    }
    setForm({ open: false });
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await m.remove.mutateAsync(deleting);
    if (selectedId === deleting.id) setSelectedId(null);
    setDeleting(null);
  };

  // ------------------------------------------------------------------ self-service
  if (selfOnly) {
    return (
      <div className="space-y-6">
        <HrisPageHeader icon={TrendingUp} title="Pay Reviews" description="Your current compensation." />
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><BadgeDollarSign className="h-4 w-4 text-muted-foreground" /> Current compensation</CardTitle>
            <CardDescription>Pay reviews are managed by the finance team; your salary history appears here once a review is applied.</CardDescription>
          </CardHeader>
          <CardContent>
            {compensation.isLoading ? (
              <Skeleton className="h-10 w-48" />
            ) : comp ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Base salary</p><p className="text-lg font-semibold tabular-nums text-foreground">{formatMinor(comp.base_salary_minor, comp.currency)}</p></div>
                <div><p className="text-xs text-muted-foreground">Frequency</p><p className="text-sm text-foreground">{humanise(comp.pay_frequency)}</p></div>
                <div><p className="text-xs text-muted-foreground">Currency</p><p className="text-sm text-foreground">{comp.currency}</p></div>
                <div><p className="text-xs text-muted-foreground">Effective from</p><p className="text-sm text-foreground">{formatDate(comp.effective_from)}</p></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active compensation record on file.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={TrendingUp}
        title="Pay Reviews"
        description={crewMode ? 'Salary review history and proposals for the selected crew member.' : 'Review cycle across the company: propose, approve and apply salary changes.'}
        actions={
          <>
            {crewMode && (
              <Button variant="outline" onClick={() => { setProfileId(null); setSelectedId(null); }}>
                <Users className="mr-2 h-4 w-4" /> All crew
              </Button>
            )}
            {crewMode && canEdit && (
              <Button onClick={() => setForm({ open: true, review: null })} disabled={busy}>
                <Plus className="mr-2 h-4 w-4" /> New review
              </Button>
            )}
          </>
        }
        toolbar={
          <CrewPicker
            value={profileId}
            onChange={(id) => { setProfileId(id); setSelectedId(null); }}
            includeInactive
            className="md:w-[420px]"
            placeholder="Select a crew member to review their pay"
          />
        }
      />

      {!crewMode ? (
        access.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-6">
            <ReviewCycleSummary kpis={kpis} year={thisYear} filters={filters} onFilter={setFilters} />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as PayReviewFilters['status'] }))}>
                <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {REVIEW_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.reason} onValueChange={(v) => setFilters((f) => ({ ...f, reason: v as PayReviewFilters['reason'] }))}>
                <SelectTrigger className="w-[170px]"><SelectValue placeholder="Reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  {REVIEW_REASONS.map((r) => <SelectItem key={r} value={r}>{humanise(r)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(filters.year)} onValueChange={(v) => setFilters((f) => ({ ...f, year: v === 'all' ? 'all' : Number(v) }))}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All years</SelectItem>
                  {(years.length ? years : [thisYear]).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              {(filters.status !== 'all' || filters.reason !== 'all' || filters.year !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_REVIEW_FILTERS)}>Clear</Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{company.reviews.length} of {company.all.length} reviews</span>
            </div>
            <ReviewsTable
              reviews={company.reviews}
              isLoading={company.isLoading}
              showCrew
              onSelectCrew={(id) => { setProfileId(id); setSelectedId(null); }}
              emptyHint={canEdit ? 'Select a crew member to propose their first review.' : undefined}
            />
          </div>
        )
      ) : (
        <div className="space-y-6">
          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BadgeDollarSign className="h-4 w-4 text-muted-foreground" /> Current compensation
                {isOwnRecord && <span className="text-xs font-normal text-muted-foreground">(your own record)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {compensation.isLoading ? (
                <Skeleton className="h-10 w-48" />
              ) : comp ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                  <div><p className="text-xs text-muted-foreground">Base salary</p><p className="text-lg font-semibold tabular-nums text-foreground">{formatMinor(comp.base_salary_minor, comp.currency)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Frequency</p><p className="text-sm text-foreground">{humanise(comp.pay_frequency)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Currency</p><p className="text-sm text-foreground">{comp.currency}</p></div>
                  <div><p className="text-xs text-muted-foreground">Effective from</p><p className="text-sm text-foreground">{formatDate(comp.effective_from)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Last change</p><p className="text-sm text-foreground">{comp.reason ?? '—'}</p></div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active compensation record{crewName ? ` for ${crewName}` : ''}. A review can still be proposed; the previous base will be recorded as zero.
                </p>
              )}
            </CardContent>
          </Card>

          {crew.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              {selected && (
                <ReviewDetailCard
                  review={selected}
                  canEdit={canEdit}
                  canAdmin={canAdmin}
                  busy={busy}
                  onEdit={() => setForm({ open: true, review: selected })}
                  onApprove={() => m.approve.mutate(selected)}
                  onReject={(reason) => m.reject.mutate({ review: selected, reason })}
                  onApply={() => m.apply.mutate(selected)}
                  onDelete={() => setDeleting(selected)}
                />
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Review history</h3>
                <ReviewsTable
                  reviews={crew.reviews}
                  isLoading={false}
                  onSelectReview={(r) => setSelectedId(r.id)}
                  selectedId={selected?.id ?? null}
                  emptyHint={canEdit ? 'Propose the first review for this crew member.' : 'No reviews on record.'}
                />
              </div>
            </>
          )}
        </div>
      )}

      <ReviewFormDialog
        open={form.open}
        onOpenChange={(open) => !open && setForm({ open: false })}
        review={form.open ? form.review : null}
        compensation={comp}
        crewName={crewName}
        isPending={m.create.isPending || m.update.isPending}
        onSubmit={submitForm}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pay review?</AlertDialogTitle>
            <AlertDialogDescription>
              The proposal is removed permanently. Prefer rejecting a review so the decision stays on record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={m.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PayReviewsPage;
