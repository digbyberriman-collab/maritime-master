import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronDown, MoreHorizontal, Pencil, Ship, Trash2, UserPlus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useApplicationMutations, useVacancy, useVacancyMutations, type ApplicationWithCandidate } from '@/modules/hris/hooks/useRecruitment';
import { formatDate, formatDateTime, formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  ACTIVE_STAGES,
  STAGE_BAR_CLASS,
  candidateName,
  nextStages,
  sortByStageChanged,
  stageDef,
  timeInStage,
  vacancyProgress,
  vacancyTransitions,
  type PipelineStage,
  type VacancyRow,
} from '@/modules/hris/lib/recruitment';
import { MatchScoreBadge } from './MatchScoreBadge';
import { AddCandidateDialog } from './AddCandidateDialog';
import { PriorityBadge, RatingStars, StageBadge, VacancyStatusBadge } from './RecruitmentBadges';
import { OfferDialog, RejectDialog } from './StageMoveDialogs';

interface VacancyDetailProps {
  vacancyId: string;
  canEdit: boolean;
  onBack: () => void;
  onEdit: (vacancy: VacancyRow) => void;
  onOpenApplication: (applicationId: string) => void;
  /** Open the candidate form; the new candidate is applied to this vacancy on save. */
  onCreateCandidate: () => void;
  onDeleted: () => void;
}

type PendingMove = { application: ApplicationWithCandidate; stage: 'offer' | 'rejected' | 'withdrawn' } | null;

const STATUS_ACTION_LABEL: Record<string, string> = {
  open: 'Open vacancy',
  on_hold: 'Put on hold',
  filled: 'Mark as filled',
  cancelled: 'Cancel vacancy',
  draft: 'Return to draft',
};

/** Header, Kanban-style pipeline board and requirements panel for one vacancy. */
export const VacancyDetail: React.FC<VacancyDetailProps> = ({ vacancyId, canEdit, onBack, onEdit, onOpenApplication, onCreateCandidate, onDeleted }) => {
  const { detail, isLoading } = useVacancy(vacancyId);
  const vacancyMutations = useVacancyMutations();
  const appMutations = useApplicationMutations();
  const directory = useHrCrewDirectory({ includeInactive: true });

  const [adding, setAdding] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const nameOf = (profileId: string | null) => (profileId ? directory.all.find((e) => e.id === profileId)?.displayName ?? null : null);

  const columns = useMemo(() => {
    const map = new Map<PipelineStage, ApplicationWithCandidate[]>();
    for (const s of ACTIVE_STAGES) map.set(s, []);
    for (const a of detail?.applications ?? []) {
      const list = map.get(a.stage as PipelineStage);
      if (list) list.push(a);
    }
    for (const [k, v] of map) map.set(k, sortByStageChanged(v));
    return map;
  }, [detail?.applications]);

  const closed = useMemo(
    () => sortByStageChanged((detail?.applications ?? []).filter((a) => !ACTIVE_STAGES.includes(a.stage as PipelineStage))),
    [detail?.applications],
  );

  const nextInterview = useMemo(() => {
    const map = new Map<string, string>();
    const now = Date.now();
    for (const iv of detail?.interviews ?? []) {
      if (iv.status !== 'scheduled' || new Date(iv.scheduled_at).getTime() < now) continue;
      const existing = map.get(iv.application_id);
      if (!existing || iv.scheduled_at < existing) map.set(iv.application_id, iv.scheduled_at);
    }
    return map;
  }, [detail?.interviews]);

  if (isLoading || !detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-96 w-full" />
        {!isLoading && !detail && <p className="text-sm text-muted-foreground">This vacancy could not be found.</p>}
      </div>
    );
  }

  const { vacancy, applications } = detail;
  const progress = vacancyProgress(vacancy, applications);
  const transitions = vacancyTransitions(vacancy.status);
  const busy = vacancyMutations.setStatus.isPending || vacancyMutations.remove.isPending || appMutations.moveStage.isPending || appMutations.apply.isPending;
  const acceptingCandidates = vacancy.status === 'open' || vacancy.status === 'draft' || vacancy.status === 'on_hold';

  const requestMove = (application: ApplicationWithCandidate, stage: PipelineStage) => {
    if (stage === 'offer' || stage === 'rejected' || stage === 'withdrawn') {
      setPendingMove({ application, stage });
      return;
    }
    appMutations.moveStage.mutate({ application, stage });
  };

  const salaryRange =
    vacancy.salary_min_minor !== null || vacancy.salary_max_minor !== null
      ? `${formatMinor(vacancy.salary_min_minor, vacancy.salary_currency)} – ${formatMinor(vacancy.salary_max_minor, vacancy.salary_currency)} / month`
      : null;

  return (
    <div className="space-y-6">
      <Card className="bg-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-muted-foreground" onClick={onBack}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> All vacancies
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{vacancy.title}</CardTitle>
                <VacancyStatusBadge status={vacancy.status} />
                <PriorityBadge priority={vacancy.priority} />
                {vacancy.reference && <Badge variant="outline" className="font-mono text-[11px]">{vacancy.reference}</Badge>}
              </div>
              <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1"><Ship className="h-3.5 w-3.5" /> {vacancy.vessel_name ?? 'Shore'}</span>
                <span>{[vacancy.rank, vacancy.department].filter(Boolean).join(' · ') || 'Rank not set'}</span>
                <span>{humanise(vacancy.contract_type)}{vacancy.rotation_pattern ? ` · ${vacancy.rotation_pattern}` : ''}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Start {formatDate(vacancy.start_date)}</span>
                {nameOf(vacancy.hiring_manager_profile_id) && (
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {nameOf(vacancy.hiring_manager_profile_id)}</span>
                )}
              </CardDescription>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setAdding(true)} disabled={busy || !acceptingCandidates}>
                  <UserPlus className="mr-2 h-4 w-4" /> Add candidate
                </Button>
                <Button size="sm" variant="outline" onClick={() => onEdit(vacancy)} disabled={busy}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={busy}>
                      Status <ChevronDown className="ml-1 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Change status</DropdownMenuLabel>
                    {transitions.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => vacancyMutations.setStatus.mutate({ vacancy, status: s })}>
                        {STATUS_ACTION_LABEL[s]}
                      </DropdownMenuItem>
                    ))}
                    {vacancy.status === 'draft' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete draft
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 border-t pt-4 md:grid-cols-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Positions filled</span>
              <span className="tabular-nums">{progress.hired} / {progress.headcount}</span>
            </div>
            <Progress value={progress.pct} className="h-2" />
            <p className="text-xs text-muted-foreground">{progress.inOffer} in offer or accepted</p>
          </div>
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">Compensation</p>
            <p>{salaryRange ?? 'Not disclosed'}</p>
            {vacancy.pay_grade && (
              <p className="text-xs text-muted-foreground">
                Grade {vacancy.pay_grade.code} · {formatMinor(vacancy.pay_grade.monthly_base_minor, vacancy.pay_grade.currency)}
              </p>
            )}
          </div>
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">Timeline</p>
            <p>Opened {vacancy.opened_at ? formatDate(vacancy.opened_at) : '—'}{vacancy.filled_at ? ` · Filled ${formatDate(vacancy.filled_at)}` : ''}</p>
            {nameOf(vacancy.replaces_profile_id) && <p className="text-xs text-muted-foreground">Replaces {nameOf(vacancy.replaces_profile_id)}</p>}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1080px] grid-cols-6 gap-3">
          {ACTIVE_STAGES.map((stage) => {
            const cards = columns.get(stage) ?? [];
            const def = stageDef(stage);
            return (
              <div key={stage} className="flex min-h-[320px] flex-col rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={cn('h-2 w-2 rounded-full', STAGE_BAR_CLASS[stage])} />
                    {def.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{cards.length}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {cards.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Empty</p>}
                  {cards.map((a) => {
                    const days = timeInStage(a);
                    const interviewAt = nextInterview.get(a.id);
                    const moves = nextStages(a.stage);
                    return (
                      <div
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenApplication(a.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpenApplication(a.id);
                          }
                        }}
                        className="group rounded-md border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{candidateName(a.candidate)}</p>
                            <p className="truncate text-xs text-muted-foreground">{a.candidate.rank ?? a.candidate.department ?? '—'}</p>
                          </div>
                          {canEdit && moves.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => e.stopPropagation()} aria-label="Move">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                                {moves.map((s) => (
                                  <DropdownMenuItem key={s} onClick={() => requestMove(a, s)} className={s === 'rejected' ? 'text-destructive focus:text-destructive' : undefined}>
                                    {stageDef(s).label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <MatchScoreBadge candidate={a.candidate} vacancy={vacancy} className="text-[10px]" />
                          <Badge variant="outline" className={cn('text-[10px]', days > 14 ? 'border-amber-500/30 text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                            {days}d in stage
                          </Badge>
                        </div>
                        {(interviewAt || a.rating) && (
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            {interviewAt ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {formatDateTime(interviewAt)}</span> : <span />}
                            {a.rating ? <RatingStars value={a.rating} /> : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Closed applications</CardTitle>
              <CardDescription>Hired, rejected and withdrawn candidates for this vacancy.</CardDescription>
            </div>
            {closed.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowClosed((v) => !v)}>
                {showClosed ? 'Hide' : `Show ${closed.length}`}
              </Button>
            )}
          </CardHeader>
          {showClosed && closed.length > 0 && (
            <CardContent className="space-y-2 pt-0">
              {closed.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpenApplication(a.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{candidateName(a.candidate)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.stage === 'rejected' && a.rejection_reason ? a.rejection_reason : `${stageDef(a.stage).label} ${formatDate(a.stage_changed_at)}`}
                    </span>
                  </span>
                  <StageBadge stage={a.stage} />
                </button>
              ))}
            </CardContent>
          )}
          {closed.length === 0 && <CardContent className="pt-0 text-sm text-muted-foreground">Nothing closed yet.</CardContent>}
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Requirements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Required certificates</p>
              {vacancy.required_certificates.length ? (
                <div className="flex flex-wrap gap-1">
                  {vacancy.required_certificates.map((c) => <Badge key={c} variant="secondary" className="font-normal">{c}</Badge>)}
                </div>
              ) : (
                <p className="text-muted-foreground">None specified</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Experience & requirements</p>
              <p className="whitespace-pre-wrap">{vacancy.requirements ?? '—'}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap">{vacancy.description ?? '—'}</p>
            </div>
            {vacancy.notes && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Internal notes</p>
                <p className="whitespace-pre-wrap">{vacancy.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AddCandidateDialog
        open={adding}
        onOpenChange={setAdding}
        vacancy={vacancy}
        excludeCandidateIds={applications.map((a) => a.candidate_id)}
        isPending={appMutations.apply.isPending}
        onPick={async (candidateId) => {
          await appMutations.apply.mutateAsync({ vacancyId: vacancy.id, candidateId });
          setAdding(false);
        }}
        onCreateNew={() => {
          setAdding(false);
          onCreateCandidate();
        }}
      />

      <OfferDialog
        open={pendingMove?.stage === 'offer'}
        onOpenChange={(o) => !o && setPendingMove(null)}
        candidateName={pendingMove ? candidateName(pendingMove.application.candidate) : ''}
        vacancy={vacancy}
        current={pendingMove?.application}
        isPending={appMutations.moveStage.isPending}
        onSubmit={async (offer) => {
          if (!pendingMove) return;
          await appMutations.moveStage.mutateAsync({ application: pendingMove.application, stage: 'offer', offer });
          setPendingMove(null);
        }}
      />

      <RejectDialog
        open={pendingMove?.stage === 'rejected' || pendingMove?.stage === 'withdrawn'}
        onOpenChange={(o) => !o && setPendingMove(null)}
        candidateName={pendingMove ? candidateName(pendingMove.application.candidate) : ''}
        mode={pendingMove?.stage === 'withdrawn' ? 'withdrawn' : 'rejected'}
        isPending={appMutations.moveStage.isPending}
        onSubmit={async (reason) => {
          if (!pendingMove || pendingMove.stage === 'offer') return;
          await appMutations.moveStage.mutateAsync({ application: pendingMove.application, stage: pendingMove.stage, rejection_reason: reason });
          setPendingMove(null);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft vacancy?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the vacancy{applications.length ? ` and its ${applications.length} application(s)` : ''}. Cancel it instead to keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={vacancyMutations.remove.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={vacancyMutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                void vacancyMutations.remove.mutateAsync(vacancy).then(() => {
                  setConfirmDelete(false);
                  onDeleted();
                });
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

export default VacancyDetail;
