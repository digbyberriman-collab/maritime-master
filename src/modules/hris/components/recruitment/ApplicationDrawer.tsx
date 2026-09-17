import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  StickyNote,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/shared/hooks/use-toast';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useApplicationDetail, useApplicationMutations, useInterviewMutations, useInterviews } from '@/modules/hris/hooks/useRecruitment';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { formatDate, formatDateTime, formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  ACTIVE_STAGES,
  MANUAL_EVENT_TYPES,
  STAGE_BAR_CLASS,
  candidateName,
  nextStages,
  parseScorecard,
  personalDetailsLink,
  scorecardAverage,
  stageDef,
  timeInStage,
  type ApplicationEventRow,
  type ApplicationEventType,
  type InterviewRow,
  type PipelineStage,
} from '@/modules/hris/lib/recruitment';
import { MatchScoreBadge } from './MatchScoreBadge';
import { OutcomeBadge, RatingStars, StageBadge } from './RecruitmentBadges';
import { OfferDialog, RejectDialog } from './StageMoveDialogs';
import { CompleteInterviewDialog, ScheduleInterviewDialog } from './InterviewDialogs';
import { HireDialog } from './HireDialog';

interface ApplicationDrawerProps {
  applicationId: string | null;
  onClose: () => void;
  canEdit: boolean;
}

const EVENT_ICON: Record<ApplicationEventType, React.FC<{ className?: string }>> = {
  note: StickyNote,
  stage_change: ArrowRight,
  interview: CalendarDays,
  offer: Send,
  email: Mail,
  call: Phone,
  reference: ShieldCheck,
};

const eventBody = (e: ApplicationEventRow): string => {
  if (e.event_type === 'stage_change') return `Moved from ${stageDef(e.from_stage).label} to ${stageDef(e.to_stage).label}`;
  return e.body ?? humanise(e.event_type);
};

const isEventType = (value: string): value is ApplicationEventType => (MANUAL_EVENT_TYPES as readonly string[]).includes(value) || value in EVENT_ICON;

/**
 * Side sheet for one application: candidate summary, stage stepper with
 * move / reject / withdraw, offer terms, interviews, timeline and hire.
 */
export const ApplicationDrawer: React.FC<ApplicationDrawerProps> = ({ applicationId, onClose, canEdit }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { detail, isLoading } = useApplicationDetail(applicationId);
  const { interviews } = useInterviews(applicationId);
  const appMutations = useApplicationMutations();
  const interviewMutations = useInterviewMutations();
  const { vessels } = useCompanyVessels();
  const directory = useHrCrewDirectory({ includeInactive: true });

  const [offerOpen, setOfferOpen] = useState(false);
  const [rejectMode, setRejectMode] = useState<'rejected' | 'withdrawn' | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completing, setCompleting] = useState<InterviewRow | null>(null);
  const [hireOpen, setHireOpen] = useState(false);
  const [noteType, setNoteType] = useState<ApplicationEventType>('note');
  const [noteBody, setNoteBody] = useState('');
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    setNotesDraft(detail?.application.notes ?? '');
  }, [detail?.application.id, detail?.application.notes]);

  const nameOf = useMemo(() => {
    const byId = new Map(directory.all.map((e) => [e.id, e.displayName]));
    const byUser = new Map(directory.all.filter((e) => e.user_id).map((e) => [e.user_id as string, e.displayName]));
    return {
      profile: (id: string) => byId.get(id) ?? 'Unknown',
      user: (id: string | null) => (id ? byUser.get(id) ?? 'HR' : 'System'),
    };
  }, [directory.all]);

  const application = detail?.application ?? null;
  const name = application ? candidateName(application.candidate) : '';
  const stage = (application?.stage ?? 'applied') as PipelineStage;
  const isActive = ACTIVE_STAGES.includes(stage);
  const moves = application ? nextStages(application.stage).filter((s) => s !== 'rejected' && s !== 'withdrawn') : [];
  const busy = appMutations.moveStage.isPending || appMutations.hire.isPending;

  const move = (target: PipelineStage) => {
    if (!application) return;
    if (target === 'offer') return setOfferOpen(true);
    if (target === 'rejected' || target === 'withdrawn') return setRejectMode(target);
    appMutations.moveStage.mutate({ application, stage: target });
  };

  const addNote = async () => {
    if (!application || !noteBody.trim()) return;
    await appMutations.addEvent.mutateAsync({ applicationId: application.id, event_type: noteType, body: noteBody });
    setNoteBody('');
  };

  const hire = async (args: { startDate: string; vesselId: string | null }): Promise<string> => {
    if (!application) throw new Error('No application');
    const profileId = await appMutations.hire.mutateAsync({ application, ...args });
    toast({
      title: `${name} hired`,
      description: 'Crew profile, draft contract and onboarding created.',
      action: (
        <ToastAction altText="Open personal details" onClick={() => navigate(personalDetailsLink(profileId))}>
          Open record
        </ToastAction>
      ),
    });
    return profileId;
  };

  return (
    <Sheet open={Boolean(applicationId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {isLoading || !application ? (
          <div className="space-y-4 p-6">
            <SheetHeader>
              <SheetTitle>Application</SheetTitle>
              <SheetDescription>{isLoading ? 'Loading…' : 'This application could not be found.'}</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-2 border-b p-6 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-lg">{name}</SheetTitle>
                <StageBadge stage={application.stage} />
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{[application.candidate.rank, application.candidate.department, application.candidate.nationality].filter(Boolean).join(' · ') || 'Candidate'}</span>
                <span>·</span>
                <Link to={`${HRIS_PATHS.vacancies}?vacancy=${application.vacancy_id}`} className="underline-offset-2 hover:underline">
                  {application.vacancy.title}{application.vacancy.vessel_name ? ` · ${application.vacancy.vessel_name}` : ''}
                </Link>
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <MatchScoreBadge candidate={application.candidate} vacancy={application.vacancy} />
                <RatingStars
                  value={application.rating}
                  size="md"
                  onChange={canEdit ? (rating) => appMutations.rate.mutate({ application, rating }) : undefined}
                />
                <span className="text-xs text-muted-foreground">Applied {formatDate(application.applied_at)} · {timeInStage(application)}d in stage</span>
                <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                  <Link to={`${HRIS_PATHS.candidates}?candidate=${application.candidate_id}`}>
                    Candidate record <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
                {application.candidate.hired_profile_id && (
                  <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                    <Link to={personalDetailsLink(application.candidate.hired_profile_id)}>
                      Crew record <ExternalLink className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-6 p-6">
              {/* Stage stepper */}
              <section className="space-y-3">
                <ol className="flex items-center gap-1">
                  {ACTIVE_STAGES.map((s, i) => {
                    const idx = ACTIVE_STAGES.indexOf(stage);
                    const done = isActive ? i < idx : stage === 'hired';
                    const current = isActive && i === idx;
                    return (
                      <li key={s} className="flex flex-1 flex-col items-center gap-1" title={stageDef(s).label}>
                        <span
                          className={cn(
                            'h-2 w-full rounded-full',
                            done ? STAGE_BAR_CLASS[s] : current ? cn(STAGE_BAR_CLASS[s], 'ring-2 ring-offset-1 ring-offset-background ring-primary/40') : 'bg-muted',
                          )}
                        />
                        <span className={cn('truncate text-[10px]', current ? 'font-medium text-foreground' : 'text-muted-foreground')}>{stageDef(s).label}</span>
                      </li>
                    );
                  })}
                </ol>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {moves.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" disabled={busy}>
                            Move to <ChevronDown className="ml-1 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>Next stage</DropdownMenuLabel>
                          {moves.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => move(s)}>{stageDef(s).label}</DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {stage === 'accepted' && (
                      <Button size="sm" variant="default" className="bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={() => setHireOpen(true)} disabled={busy}>
                        <UserCheck className="mr-2 h-4 w-4" /> Hire
                      </Button>
                    )}
                    {isActive && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setRejectMode('rejected')} disabled={busy}>
                          <XCircle className="mr-2 h-4 w-4" /> Reject
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectMode('withdrawn')} disabled={busy}>
                          <Ban className="mr-2 h-4 w-4" /> Withdrawn
                        </Button>
                      </>
                    )}
                    {(stage === 'rejected' || stage === 'withdrawn') && (
                      <Button size="sm" variant="outline" onClick={() => move('applied')} disabled={busy}>Reopen application</Button>
                    )}
                  </div>
                )}
                {stage === 'rejected' && application.rejection_reason && (
                  <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm">
                    <span className="font-medium">Rejected:</span> {application.rejection_reason}
                  </p>
                )}
                {(application.offer_base_minor !== null || application.offer_start_date) && (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Offer</span>
                      {application.offer_accepted_at ? (
                        <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Accepted {formatDate(application.offer_accepted_at)}
                        </Badge>
                      ) : application.offer_sent_at ? (
                        <span className="text-xs text-muted-foreground">Sent {formatDate(application.offer_sent_at)}</span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground">
                      {formatMinor(application.offer_base_minor, application.offer_currency)}/month · start {formatDate(application.offer_start_date)}
                    </p>
                    {canEdit && stage === 'offer' && (
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setOfferOpen(true)}>Revise offer</Button>
                    )}
                  </div>
                )}
              </section>

              <Separator />

              {/* Interviews */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Interviews</h3>
                  {canEdit && isActive && (
                    <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
                      <CalendarDays className="mr-2 h-4 w-4" /> Schedule
                    </Button>
                  )}
                </div>
                {interviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No interviews yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {interviews.map((iv) => {
                      const rows = parseScorecard(iv.scorecard);
                      const avg = scorecardAverage(rows);
                      const upcoming = iv.status === 'scheduled';
                      return (
                        <li key={iv.id} className="rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{formatDateTime(iv.scheduled_at)} <span className="font-normal text-muted-foreground">· {humanise(iv.format)} · {iv.duration_minutes} min</span></p>
                              <p className="text-xs text-muted-foreground">
                                {iv.interviewer_profile_ids.length ? iv.interviewer_profile_ids.map(nameOf.profile).join(', ') : 'No interviewers'}
                                {iv.location ? ` · ${iv.location}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {iv.status === 'completed' ? <OutcomeBadge outcome={iv.outcome} /> : <Badge variant="outline">{humanise(iv.status)}</Badge>}
                              {avg !== null && <span className="text-xs tabular-nums text-muted-foreground">{avg}/5</span>}
                            </div>
                          </div>
                          {iv.feedback && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{iv.feedback}</p>}
                          {canEdit && (
                            <div className="mt-2 flex gap-2">
                              {upcoming && (
                                <>
                                  <Button size="sm" variant="secondary" className="h-7" onClick={() => setCompleting(iv)}>Record feedback</Button>
                                  <Button size="sm" variant="ghost" className="h-7" onClick={() => interviewMutations.cancel.mutate(iv)} disabled={interviewMutations.cancel.isPending}>Cancel</Button>
                                </>
                              )}
                              {iv.status === 'completed' && (
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => setCompleting(iv)}>Edit feedback</Button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <Separator />

              {/* Notes */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Application notes</h3>
                {canEdit ? (
                  <>
                    <Textarea rows={3} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Salary discussion, availability caveats, agency terms…" />
                    {notesDraft !== (application.notes ?? '') && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setNotesDraft(application.notes ?? '')}>Discard</Button>
                        <Button size="sm" onClick={() => appMutations.updateNotes.mutate({ application, notes: notesDraft })} disabled={appMutations.updateNotes.isPending}>Save notes</Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{application.notes ?? '—'}</p>
                )}
              </section>

              <Separator />

              {/* Timeline */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Timeline</h3>
                {canEdit && (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex gap-2">
                      <Select value={noteType} onValueChange={(v) => isEventType(v) && setNoteType(v)}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MANUAL_EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{humanise(t)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Textarea
                        rows={1}
                        className="min-h-[40px]"
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        placeholder={noteType === 'reference' ? 'Who was contacted and what they said' : 'Add to the timeline…'}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => void addNote()} disabled={!noteBody.trim() || appMutations.addEvent.isPending}>Add</Button>
                    </div>
                  </div>
                )}
                {detail.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ol className="space-y-3">
                    {detail.events.map((e) => {
                      const Icon = EVENT_ICON[e.event_type as ApplicationEventType] ?? StickyNote;
                      return (
                        <li key={e.id} className="flex gap-3 text-sm">
                          <span className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="whitespace-pre-wrap">{eventBody(e)}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)} · {nameOf.user(e.created_by)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>

            <OfferDialog
              open={offerOpen}
              onOpenChange={setOfferOpen}
              candidateName={name}
              vacancy={application.vacancy}
              current={application}
              isPending={appMutations.moveStage.isPending}
              onSubmit={async (offer) => {
                await appMutations.moveStage.mutateAsync({ application, stage: 'offer', offer });
                setOfferOpen(false);
              }}
            />
            <RejectDialog
              open={rejectMode !== null}
              onOpenChange={(o) => !o && setRejectMode(null)}
              candidateName={name}
              mode={rejectMode ?? 'rejected'}
              isPending={appMutations.moveStage.isPending}
              onSubmit={async (reason) => {
                if (!rejectMode) return;
                await appMutations.moveStage.mutateAsync({ application, stage: rejectMode, rejection_reason: reason });
                setRejectMode(null);
              }}
            />
            <ScheduleInterviewDialog
              open={scheduleOpen}
              onOpenChange={setScheduleOpen}
              candidateName={name}
              defaultInterviewerIds={application.vacancy.hiring_manager_profile_id ? [application.vacancy.hiring_manager_profile_id] : []}
              nameOf={nameOf.profile}
              isPending={interviewMutations.schedule.isPending}
              onSubmit={async (values) => {
                await interviewMutations.schedule.mutateAsync({ applicationId: application.id, values });
                setScheduleOpen(false);
                if (application.stage === 'applied' || application.stage === 'screening') {
                  appMutations.moveStage.mutate({ application, stage: 'interview' });
                }
              }}
            />
            <CompleteInterviewDialog
              open={Boolean(completing)}
              onOpenChange={(o) => !o && setCompleting(null)}
              interview={completing}
              candidateName={name}
              isPending={interviewMutations.complete.isPending}
              onSubmit={async (values) => {
                if (!completing) return;
                await interviewMutations.complete.mutateAsync({ interview: completing, ...values });
                setCompleting(null);
              }}
            />
            <HireDialog
              open={hireOpen}
              onOpenChange={setHireOpen}
              candidateName={name}
              application={application}
              vacancy={application.vacancy}
              vessels={vessels}
              isPending={appMutations.hire.isPending}
              onHire={hire}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ApplicationDrawer;
