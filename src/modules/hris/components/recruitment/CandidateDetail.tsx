import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plane,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
import { useToast } from '@/shared/hooks/use-toast';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import {
  downloadCandidateCv,
  getCandidateCvUrl,
  useApplicationMutations,
  useCandidate,
  useCandidateMutations,
  useVacancies,
} from '@/modules/hris/hooks/useRecruitment';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { daysUntil, formatDate, formatDateTime, formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  DEFAULT_VACANCY_FILTERS,
  candidateInitials,
  candidateName,
  personalDetailsLink,
  stageDef,
  timeInStage,
  type CandidateRow,
} from '@/modules/hris/lib/recruitment';
import { MatchScoreBadge } from './MatchScoreBadge';
import { CandidateStatusBadge, RatingStars, StageBadge } from './RecruitmentBadges';

const ACCEPTED_CV = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
const OPEN_VACANCY_FILTERS = { ...DEFAULT_VACANCY_FILTERS, status: 'open' as const };

interface CandidateDetailProps {
  candidateId: string;
  canEdit: boolean;
  onBack: () => void;
  onEdit: (candidate: CandidateRow) => void;
  onOpenApplication: (applicationId: string) => void;
  onDeleted: () => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-xs text-muted-foreground">{label}</p>
    <div className="text-sm">{children}</div>
  </div>
);

/** Profile card, CV, GDPR, notes and applications for one candidate. */
export const CandidateDetail: React.FC<CandidateDetailProps> = ({ candidateId, canEdit, onBack, onEdit, onOpenApplication, onDeleted }) => {
  const { toast } = useToast();
  const { detail, isLoading } = useCandidate(candidateId);
  const mutations = useCandidateMutations();
  const appMutations = useApplicationMutations();
  const { all: vacancies } = useVacancies(OPEN_VACANCY_FILTERS);
  const directory = useHrCrewDirectory({ includeInactive: true });
  const fileInput = useRef<HTMLInputElement>(null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyVacancyId, setApplyVacancyId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDnr, setConfirmDnr] = useState(false);

  const openVacancies = useMemo(() => {
    const applied = new Set((detail?.applications ?? []).map((a) => a.vacancy_id));
    return vacancies.filter((v) => v.status === 'open' && !applied.has(v.id));
  }, [vacancies, detail?.applications]);
  const applyTarget = openVacancies.find((v) => v.id === applyVacancyId) ?? null;

  if (isLoading || !detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
        {!isLoading && !detail && <p className="text-sm text-muted-foreground">This candidate could not be found.</p>}
      </div>
    );
  }

  const { candidate, applications, interviews } = detail;
  const name = candidateName(candidate);
  const referrer = candidate.referred_by_profile_id ? directory.all.find((e) => e.id === candidate.referred_by_profile_id)?.displayName : null;
  const retentionDays = daysUntil(candidate.gdpr_retention_until);
  const busy = mutations.update.isPending || mutations.archive.isPending || mutations.markDoNotRehire.isPending || mutations.reactivate.isPending || mutations.uploadCv.isPending || mutations.remove.isPending;
  const canApply = candidate.status === 'active' || candidate.status === 'hired';

  const previewCv = async () => {
    try {
      const url = await getCandidateCvUrl(candidate.cv_path);
      if (!url) throw new Error('No CV on file');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({ title: 'Preview failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    }
  };

  const downloadCv = async () => {
    try {
      await downloadCandidateCv(candidate.cv_path, candidate.cv_name ?? `${name}-CV.pdf`);
    } catch (err) {
      toast({ title: 'Download failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    }
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await mutations.uploadCv.mutateAsync({ candidate, file });
  };

  const nextInterviewFor = (applicationId: string) =>
    interviews.filter((iv) => iv.application_id === applicationId && iv.status === 'scheduled').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null;

  return (
    <div className="space-y-6">
      <Card className="bg-card">
        <CardHeader className="pb-4">
          <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-7 w-fit px-2 text-muted-foreground" onClick={onBack}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> All candidates
          </Button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="text-base">{candidateInitials(candidate)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">{name}</CardTitle>
                  <CandidateStatusBadge status={candidate.status} />
                  <RatingStars value={candidate.rating} onChange={canEdit ? (rating) => mutations.update.mutate({ candidate, payload: { rating } }) : undefined} />
                </div>
                <CardDescription>
                  {[candidate.rank, candidate.department, candidate.nationality, candidate.years_experience !== null ? `${candidate.years_experience} yrs` : null].filter(Boolean).join(' · ') || 'No profile details yet'}
                </CardDescription>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {candidate.email && <a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${candidate.email}`}><Mail className="h-3 w-3" /> {candidate.email}</a>}
                  {candidate.phone && <a className="inline-flex items-center gap-1 hover:underline" href={`tel:${candidate.phone}`}><Phone className="h-3 w-3" /> {candidate.phone}</a>}
                  {candidate.current_location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {candidate.current_location}</span>}
                  {candidate.home_airport && <span className="inline-flex items-center gap-1"><Plane className="h-3 w-3" /> {candidate.home_airport}</span>}
                  {candidate.linkedin_url && (
                    <a className="inline-flex items-center gap-1 hover:underline" href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" /> LinkedIn
                    </a>
                  )}
                </div>
                {candidate.hired_profile_id && (
                  <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                    <Link to={personalDetailsLink(candidate.hired_profile_id)}>Open crew record <ExternalLink className="ml-1 h-3 w-3" /></Link>
                  </Button>
                )}
              </div>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setApplyOpen(true)} disabled={busy || !canApply}>
                  <Briefcase className="mr-2 h-4 w-4" /> Apply to vacancy
                </Button>
                <Button size="sm" variant="outline" onClick={() => onEdit(candidate)} disabled={busy}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={busy}>
                      More <ChevronDown className="ml-1 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {candidate.status === 'active' && <DropdownMenuItem onClick={() => mutations.archive.mutate(candidate)}>Archive</DropdownMenuItem>}
                    {(candidate.status === 'archived' || candidate.status === 'do_not_rehire') && (
                      <DropdownMenuItem onClick={() => mutations.reactivate.mutate(candidate)}>Reactivate</DropdownMenuItem>
                    )}
                    {candidate.status !== 'do_not_rehire' && (
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDnr(true)}>Mark do not rehire</DropdownMenuItem>
                    )}
                    {applications.length === 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete candidate
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Available from">{formatDate(candidate.available_from)}</Field>
          <Field label="Salary expectation">
            {candidate.salary_expectation_minor !== null ? `${formatMinor(candidate.salary_expectation_minor, candidate.salary_expectation_currency)}/month` : '—'}
          </Field>
          <Field label="Source">
            {humanise(candidate.source)}
            {candidate.agency_name ? ` · ${candidate.agency_name}` : ''}
            {referrer ? ` · ${referrer}` : ''}
          </Field>
          <Field label="Languages">{candidate.languages.length ? candidate.languages.join(', ') : '—'}</Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="mb-1.5 text-xs text-muted-foreground">Certificates</p>
            {candidate.certificates.length ? (
              <div className="flex flex-wrap gap-1">
                {candidate.certificates.map((c) => <Badge key={c} variant="secondary" className="font-normal">{c}</Badge>)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">None recorded</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-card lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Applications</CardTitle>
            <CardDescription>Every vacancy this candidate has been considered for.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not in any pipeline yet.{canEdit && canApply ? ' Use "Apply to vacancy" to add them.' : ''}</p>
            ) : (
              applications.map((a) => {
                const iv = nextInterviewFor(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpenApplication(a.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {a.vacancy.title}
                        <span className="font-normal text-muted-foreground">{a.vacancy.vessel_name ? ` · ${a.vacancy.vessel_name}` : ''}{a.vacancy.reference ? ` · ${a.vacancy.reference}` : ''}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Applied {formatDate(a.applied_at)} · {timeInStage(a)}d in {stageDef(a.stage).label.toLowerCase()}
                        {iv ? ` · interview ${formatDateTime(iv.scheduled_at)}` : ''}
                        {a.stage === 'rejected' && a.rejection_reason ? ` · ${a.rejection_reason}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <MatchScoreBadge candidate={candidate} vacancy={a.vacancy} className="text-[10px]" />
                      <StageBadge stage={a.stage} />
                    </span>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> CV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {candidate.cv_path ? (
                <>
                  <p className="truncate text-sm">{candidate.cv_name ?? 'CV on file'}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void previewCv()}><Eye className="mr-2 h-4 w-4" /> Preview</Button>
                    <Button size="sm" variant="outline" onClick={() => void downloadCv()}><Download className="mr-2 h-4 w-4" /> Download</Button>
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()} disabled={mutations.uploadCv.isPending}>
                        {mutations.uploadCv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Replace
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">No CV uploaded.</p>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={mutations.uploadCv.isPending}>
                      {mutations.uploadCv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Upload CV
                    </Button>
                  )}
                </>
              )}
              <input ref={fileInput} type="file" accept={ACCEPTED_CV} className="hidden" onChange={(e) => void onFileChosen(e)} />
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Data protection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <Field label="Consent">
                {candidate.gdpr_consent_at ? `Given ${formatDateTime(candidate.gdpr_consent_at)}` : <span className="text-amber-600 dark:text-amber-400">Not recorded</span>}
              </Field>
              <Field label="Retain until">
                {candidate.gdpr_retention_until ? (
                  <span className="inline-flex items-center gap-2">
                    {formatDate(candidate.gdpr_retention_until)}
                    {retentionDays !== null && retentionDays <= 30 && (
                      <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mr-1 h-3 w-3" /> {retentionDays < 0 ? 'Review overdue' : `${retentionDays}d left`}
                      </Badge>
                    )}
                  </span>
                ) : '—'}
              </Field>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{candidate.notes ?? '—'}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={applyOpen} onOpenChange={(o) => { setApplyOpen(o); if (!o) setApplyVacancyId(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply {name} to a vacancy</DialogTitle>
            <DialogDescription>Only open vacancies they are not already in are listed.</DialogDescription>
          </DialogHeader>
          {openVacancies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open vacancies available. <Link to={HRIS_PATHS.vacancies} className="underline">Open one</Link> first.
            </p>
          ) : (
            <div className="space-y-3">
              <Select value={applyVacancyId} onValueChange={setApplyVacancyId}>
                <SelectTrigger><SelectValue placeholder="Choose a vacancy" /></SelectTrigger>
                <SelectContent>
                  {openVacancies.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.title}{v.vessel_name ? ` · ${v.vessel_name}` : ''}{v.reference ? ` (${v.reference})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {applyTarget && <MatchScoreBadge candidate={candidate} vacancy={applyTarget} expanded />}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)} disabled={appMutations.apply.isPending}>Cancel</Button>
            <Button
              disabled={!applyVacancyId || appMutations.apply.isPending}
              onClick={() => {
                void appMutations.apply.mutateAsync({ vacancyId: applyVacancyId, candidateId: candidate.id }).then(() => {
                  setApplyOpen(false);
                  setApplyVacancyId('');
                });
              }}
            >
              {appMutations.apply.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDnr} onOpenChange={setConfirmDnr}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {name} as do not rehire?</AlertDialogTitle>
            <AlertDialogDescription>They will be excluded from vacancy pickers. Record the reason in their notes; this can be reversed by reactivating.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void mutations.markDoNotRehire.mutateAsync(candidate).then(() => setConfirmDnr(false));
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this candidate?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the record{candidate.cv_path ? ' and their CV' : ''}. Only candidates with no applications can be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.remove.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                void mutations.remove.mutateAsync(candidate).then(() => {
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

export default CandidateDetail;
