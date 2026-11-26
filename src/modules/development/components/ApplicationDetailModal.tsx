/**
 * One training application: its details, the review history, and the
 * steps the viewer may take now (gap/02 W3, TR4–TR6; X5-07A, X5-07B).
 * Every step goes through development_transition (useApplicationTransition);
 * the steps offered come from the machine (lib/applicationMachine.ts) and
 * the viewer's part as far as the page knows it: the applicant on their
 * own application, the review stage a reviewer page opened it for, the
 * parts a page passes (`viewerRoles`), training admins. The server
 * re-checks every one and refuses in words; nothing says "done" before the
 * returned answer confirmed it.
 *
 * - Return and Reject are distinct: a return goes back to the applicant
 *   with a comment (the text box here); a rejection is final, confirmed in
 *   its own dialog with a reason (DecisionDialog).
 * - Void (TR6, entered in error) is confirmed in its own dialog with a
 *   reason; the application then leaves every register and total.
 * - Correct details (TR5, `edit_fields`): approvers fix the course, dates,
 *   category or estimates in CorrectDetailsDialog; the history records the
 *   diff and the applicant is told.
 * - History (TR5): every step from development_application_events, with
 *   who, from and to, the comment and the field diffs (ApplicationEventLog).
 *
 * While development_transition is missing (D-01), only the applicant's
 * submit and cancel of a draft still work (D-X5-20); every other step is
 * shown disabled with "Not set up yet".
 */
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle, XCircle, DollarSign, User, Calendar, Info, PencilLine } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { StatusPill } from '@/shared/components/status';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCan } from '@/lib/permissions/useCan';
import { todayDateOnly } from '@/shared/lib/form';
import { useApplicationTransition, useTransitionSupport } from '@/modules/development/hooks/useDevelopmentMutations';
import { useCategoryLabels, usePolicyExtras } from '@/modules/development/hooks/useProgramSettings';
import { useApplicationLifecycle } from '@/modules/development/hooks/useApplicationLifecycle';
import { CATEGORY_CONFIG, APPLICATION_STATUS_CONFIG, APPROVAL_STEPS, type DevCategory, type ApplicationStatus } from '@/modules/development/constants';
import {
  ACTION_LABELS,
  actionActors,
  actionRequirement,
  availableActions,
  hasLegacyFallback,
  isApplicationStatus,
  nextActor,
  isStale,
  TRANSITION_NOT_SET_UP,
  type ApplicationAction,
  type ApplicationActor,
  type FinalApproverRole,
} from '@/modules/development/lib/applicationMachine';
import { ApplicationEventLog } from '@/modules/development/components/training/ApplicationEventLog';
import { CorrectDetailsDialog } from '@/modules/development/components/training/CorrectDetailsDialog';
import { DecisionDialog, type DecisionKind } from '@/modules/development/components/training/DecisionDialog';

/** The application fields the modal reads (a row of development_applications with its joins). */
export interface DetailApplication {
  id: string;
  status: string;
  crew_member_id?: string | null;
  application_number?: string | null;
  course_name: string;
  category?: string | null;
  course_provider?: string | null;
  course_location?: string | null;
  course_start_date?: string | null;
  course_end_date?: string | null;
  course_duration_days?: number | null;
  course_description?: string | null;
  estimated_tuition_usd?: number | null;
  estimated_travel_usd?: number | null;
  estimated_accommodation_usd?: number | null;
  estimated_food_per_diem_usd?: number | null;
  estimated_total_usd?: number | null;
  hod_reviewer_id?: string | null;
  hod_reviewed_at?: string | null;
  hod_decision?: string | null;
  hod_comments?: string | null;
  purser_reviewer_id?: string | null;
  purser_reviewed_at?: string | null;
  purser_decision?: string | null;
  purser_comments?: string | null;
  captain_reviewer_id?: string | null;
  captain_reviewed_at?: string | null;
  captain_decision?: string | null;
  captain_comments?: string | null;
  is_discretionary?: boolean | null;
  discretionary_justification?: string | null;
  denial_reason?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  crew_member?: { first_name?: string | null; last_name?: string | null } | null;
  vessel?: { name?: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: DetailApplication | null;
  /** A reviewer page opened it: the steps of `reviewStage` are offered. */
  canReview?: boolean;
  reviewStage?: 'hod' | 'purser' | 'captain' | null;
  /** The viewer's parts when the page knows them (wins over reviewStage). */
  viewerRoles?: readonly ApplicationActor[];
}

const money = (v: number | null | undefined) => `$${(v ?? 0).toLocaleString('en-GB')}`;
const day = (v: string | null | undefined) => (v ? format(new Date(v), 'dd MMM yyyy') : null);

const ACTION_VARIANT: Partial<Record<ApplicationAction, 'default' | 'outline' | 'destructive'>> = {
  reject: 'destructive',
  void: 'destructive',
  hod_return: 'outline',
  return: 'outline',
  cancel: 'outline',
  edit_fields: 'outline',
};

/** Steps confirmed in their own dialog with a reason (never the shared text box). */
const DIALOG_STEPS: ReadonlySet<ApplicationAction> = new Set(['reject', 'void']);

/** Steps that need the text box, and what it is called for them. */
const TEXT_WORDS: Record<'comment' | 'reason' | 'justification', string> = {
  comment: 'What needs to change',
  reason: 'Reason',
  justification: 'Why this is approved outside the standard policy',
};

export default function ApplicationDetailModal({ open, onOpenChange, application, canReview, reviewStage, viewerRoles }: Props) {
  const { user } = useAuth();
  const transition = useApplicationTransition();
  const support = useTransitionSupport();
  const { data: extras } = usePolicyExtras();
  const labels = useCategoryLabels();
  const lifecycle = useApplicationLifecycle(open ? application?.id : null);
  const isTrainingAdmin = useCan('fleet.operations.fleet_training.admin');
  const [text, setText] = useState('');
  const [completedOn, setCompletedOn] = useState(todayDateOnly());
  const [certificateNumber, setCertificateNumber] = useState('');
  const [actAs, setActAs] = useState<FinalApproverRole>('captain');
  const [decision, setDecision] = useState<DecisionKind | null>(null);
  const [correcting, setCorrecting] = useState(false);

  useEffect(() => {
    if (!open) {
      setText('');
      setCertificateNumber('');
      setCompletedOn(todayDateOnly());
      setDecision(null);
      setCorrecting(false);
    }
  }, [open, application?.id]);

  const mode = extras?.final_approval_mode ?? 'both';

  const roles = useMemo<ApplicationActor[]>(() => {
    if (!application) return [];
    if (user?.id && application.crew_member_id === user.id) return ['applicant'];
    if (viewerRoles) return [...viewerRoles];
    const out: ApplicationActor[] = [];
    if (canReview && reviewStage) out.push(reviewStage);
    if (isTrainingAdmin) out.push('training_admin');
    return out;
  }, [application, user?.id, viewerRoles, canReview, reviewStage, isTrainingAdmin]);

  const allActions = useMemo(() => (application ? availableActions(application, roles, mode) : []), [application, roles, mode]);
  const actions = useMemo(() => allActions.filter((a) => a !== 'edit_fields'), [allActions]);
  const canCorrect = allActions.includes('edit_fields');

  if (!application) return null;

  const status = application.status;
  const knownStatus = isApplicationStatus(status) ? status : null;
  const catConfig = CATEGORY_CONFIG[application.category as DevCategory];
  const statusConfig = APPLICATION_STATUS_CONFIG[status as ApplicationStatus];
  const currentStep = statusConfig?.step ?? 0;
  const crewName = application.crew_member
    ? `${application.crew_member.first_name ?? ''} ${application.crew_member.last_name ?? ''}`.trim() || 'Name not available'
    : 'Name not available';
  const actor = roles[0] ?? null;
  const next = nextActor({ ...application, stage_entered_at: lifecycle.data?.stage_entered_at }, mode);
  const stale = isStale({ ...application, stage_entered_at: lifecycle.data?.stage_entered_at });
  const bothFinal = roles.includes('captain') && roles.includes('purser');

  const disabledReason = (action: ApplicationAction): string | null => {
    if (support === 'missing' && !hasLegacyFallback(action, status, actor)) return 'Not set up yet';
    if (DIALOG_STEPS.has(action)) return null;
    const need = actionRequirement(action, actionActors(action, knownStatus ?? 'draft').find((a) => roles.includes(a)) ?? null);
    if ((need === 'comment' || need === 'reason' || need === 'justification') && !text.trim()) return `${TEXT_WORDS[need]} is needed`;
    if (need === 'completion' && !completedOn) return 'Enter the completion day';
    return null;
  };

  /** Sends one step; resolves once the server confirmed it, rejects (after the hook's toast) when refused. */
  const send = async (action: ApplicationAction, extra: Record<string, unknown> | null) => {
    const acting = actionActors(action, knownStatus ?? 'draft').find((a) => roles.includes(a)) ?? null;
    const need = actionRequirement(action, acting);
    const payload: Record<string, unknown> = { ...(extra ?? {}) };
    if (extra === null) {
      if (need === 'comment') payload.comment = text.trim();
      if (need === 'reason') payload.reason = text.trim();
      if (need === 'justification') payload.justification = text.trim();
      if (need === null && text.trim()) payload.comment = text.trim();
      if (need === 'completion') {
        payload.completed_on = completedOn;
        if (certificateNumber.trim()) payload.certificate_number = certificateNumber.trim();
      }
    }
    if ((action === 'final_approve' || action === 'return' || action === 'reject' || action === 'edit_fields') && bothFinal) payload.role = actAs;
    await transition.mutateAsync({
      applicationId: application.id,
      action,
      payload,
      expectedUpdatedAt: application.updated_at ?? null,
      currentStatus: status,
      actingAs: acting,
    });
  };

  const run = async (action: ApplicationAction) => {
    if (DIALOG_STEPS.has(action)) {
      setDecision(action as DecisionKind);
      return;
    }
    try {
      await send(action, null);
      onOpenChange(false);
    } catch {
      // The hook has said why; the dialog stays open.
    }
  };

  const confirmDecision = async (kind: DecisionKind, reason: string) => {
    await send(kind, { reason });
    onOpenChange(false);
  };

  const reviews = [
    { stage: 'hod', label: 'Head of department', reviewer: application.hod_reviewer_id, date: application.hod_reviewed_at, decision: application.hod_decision, comments: application.hod_comments },
    { stage: 'purser', label: 'Purser', reviewer: application.purser_reviewer_id, date: application.purser_reviewed_at, decision: application.purser_decision, comments: application.purser_comments },
    { stage: 'captain', label: 'Captain', reviewer: application.captain_reviewer_id, date: application.captain_reviewed_at, decision: application.captain_decision, comments: application.captain_comments },
  ].filter((r) => r.reviewer);

  const outcome =
    status === 'rejected'
      ? { title: 'Rejected', body: application.denial_reason }
      : status === 'voided'
        ? { title: 'Voided', body: lifecycle.data?.void_reason ?? null }
        : status === 'cancelled'
          ? { title: 'Cancelled', body: lifecycle.data?.cancel_reason ?? null }
          : null;

  const needsText = actions.some((a) => {
    if (DIALOG_STEPS.has(a)) return false;
    const need = actionRequirement(a, actionActors(a, knownStatus ?? 'draft').find((r) => roles.includes(r)) ?? null);
    return need === 'comment' || need === 'reason' || need === 'justification';
  });
  const canComplete = actions.includes('complete');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <span className="min-w-0 break-words">{application.course_name}</span>
            <StatusPill domain="training_application" status={status} size="sm" />
          </DialogTitle>
          <DialogDescription>{next.label}{stale ? ' · waiting more than 7 days' : ''}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
          <User className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="type-body font-medium">{crewName}</p>
            {application.application_number ? <p className="type-mono text-muted-foreground">{application.application_number}</p> : null}
          </div>
          {catConfig ? (
            <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} ml-auto border-0 text-xs`}>
              {labels[application.category as DevCategory] ?? catConfig.label}
            </Badge>
          ) : null}
        </div>

        {currentStep >= 0 ? (
          <ol className="flex items-center gap-1" aria-label="Approval progress">
            {APPROVAL_STEPS.map((step, i) => {
              const stepIndex = i + 1;
              const isDone = currentStep > stepIndex;
              const isCurrent = currentStep === stepIndex;
              return (
                <li key={step} className="flex-1" aria-current={isCurrent ? 'step' : undefined}>
                  <div className={`h-2 rounded-full ${isDone ? 'bg-success' : isCurrent ? 'bg-amber' : 'bg-muted'}`} />
                  <p className={`type-caption mt-1 text-center ${isCurrent ? 'font-medium text-amber' : 'text-muted-foreground'}`}>{step}</p>
                </li>
              );
            })}
          </ol>
        ) : null}

        {outcome ? (
          <div className="rounded-lg border border-input p-3" role="note">
            <p className="type-body font-medium">{outcome.title}</p>
            <p className="type-body text-muted-foreground">{outcome.body || 'No reason recorded.'}</p>
          </div>
        ) : null}

        <Separator />

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {application.course_provider ? (
            <div><dt className="inline text-muted-foreground">Provider: </dt><dd className="inline">{application.course_provider}</dd></div>
          ) : null}
          {application.course_location ? (
            <div><dt className="inline text-muted-foreground">Location: </dt><dd className="inline">{application.course_location}</dd></div>
          ) : null}
          {application.course_start_date ? (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span>
                {day(application.course_start_date)}
                {application.course_end_date ? ` – ${day(application.course_end_date)}` : ''}
              </span>
            </div>
          ) : null}
          {application.course_duration_days ? (
            <div><dt className="inline text-muted-foreground">Duration: </dt><dd className="inline">{application.course_duration_days} days</dd></div>
          ) : null}
          {application.vessel?.name ? (
            <div><dt className="inline text-muted-foreground">Vessel: </dt><dd className="inline">{application.vessel.name}</dd></div>
          ) : null}
        </dl>

        {application.course_description ? (
          <div>
            <Label className="text-xs text-muted-foreground">Description / justification</Label>
            <p className="mt-1 text-sm">{application.course_description}</p>
          </div>
        ) : null}

        <Separator />

        <section className="space-y-2" aria-labelledby="dev-app-costs">
          <h3 id="dev-app-costs" className="flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="h-4 w-4" aria-hidden="true" /> Cost estimate
          </h3>
          <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
            {(application.estimated_tuition_usd ?? 0) > 0 ? <div className="flex justify-between"><span>Tuition</span><span>{money(application.estimated_tuition_usd)}</span></div> : null}
            {(application.estimated_travel_usd ?? 0) > 0 ? <div className="flex justify-between"><span>Travel</span><span>{money(application.estimated_travel_usd)}</span></div> : null}
            {(application.estimated_accommodation_usd ?? 0) > 0 ? <div className="flex justify-between"><span>Accommodation</span><span>{money(application.estimated_accommodation_usd)}</span></div> : null}
            {(application.estimated_food_per_diem_usd ?? 0) > 0 ? <div className="flex justify-between"><span>Food per diem</span><span>{money(application.estimated_food_per_diem_usd)}/day</span></div> : null}
            <Separator />
            <div className="flex justify-between font-semibold"><span>Total</span><span>{money(application.estimated_total_usd)}</span></div>
          </div>
        </section>

        {reviews.map((review) => (
          <div key={review.stage} className="space-y-1 rounded-lg border border-input p-3">
            <div className="flex flex-wrap items-center gap-2">
              {review.decision === 'approved' || review.decision === 'discretionary_approved' ? (
                <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
              )}
              <span className="text-sm font-medium">
                {review.label}: {review.decision === 'returned' ? 'returned' : review.decision === 'discretionary_approved' ? 'approved (discretionary)' : 'approved'}
              </span>
              {review.date ? <span className="ml-auto text-xs text-muted-foreground">{format(new Date(review.date), 'dd MMM yyyy HH:mm')}</span> : null}
            </div>
            {review.comments ? <p className="text-sm text-muted-foreground">{review.comments}</p> : null}
          </div>
        ))}
        {application.is_discretionary && application.discretionary_justification ? (
          <p className="text-sm text-muted-foreground">Discretionary: {application.discretionary_justification}</p>
        ) : null}

        <Separator />
        <ApplicationEventLog applicationId={application.id} enabled={open} />

        {canCorrect ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-input p-3">
            <p className="text-sm text-muted-foreground">Something wrong in the details? Correct it without sending the application back.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={support === 'missing' || transition.isPending}
              title={support === 'missing' ? 'Not set up yet' : undefined}
              onClick={() => setCorrecting(true)}
            >
              <PencilLine aria-hidden="true" className="h-4 w-4" />
              {ACTION_LABELS.edit_fields}
              {support === 'missing' ? <span className="sr-only">: Not set up yet</span> : null}
            </Button>
          </div>
        ) : null}

        {actions.length > 0 ? (
          <>
            <Separator />
            <section className="space-y-3" aria-labelledby="dev-app-actions">
              <h3 id="dev-app-actions" className="text-sm font-semibold">Next step</h3>
              {support === 'missing' ? (
                <p className="flex items-start gap-2 text-sm text-muted-foreground" role="status">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {TRANSITION_NOT_SET_UP}
                </p>
              ) : null}
              {bothFinal && actions.some((a) => a === 'final_approve' || a === 'return' || a === 'reject') ? (
                <fieldset className="flex flex-wrap items-center gap-4 text-sm">
                  <legend className="sr-only">Act as</legend>
                  {(['captain', 'purser'] as const).map((r) => (
                    <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2">
                      <input type="radio" name="dev-act-as" value={r} checked={actAs === r} onChange={() => setActAs(r)} />
                      Act as the {r === 'captain' ? 'Captain' : 'Purser'}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {needsText ? (
                <div className="space-y-2">
                  <Label htmlFor="dev-app-text">Comment or reason</Label>
                  <Textarea
                    id="dev-app-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Needed to return, or to cancel an approved application; optional otherwise"
                  />
                </div>
              ) : null}
              {canComplete ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="dev-app-completed-on">Completed on</Label>
                    <Input id="dev-app-completed-on" type="date" value={completedOn} max={todayDateOnly()} onChange={(e) => setCompletedOn(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dev-app-certificate">Certificate number (optional)</Label>
                    <Input id="dev-app-certificate" value={certificateNumber} maxLength={120} onChange={(e) => setCertificateNumber(e.target.value)} />
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                {actions.map((action) => {
                  const reason = disabledReason(action);
                  return (
                    <Button
                      key={action}
                      type="button"
                      variant={ACTION_VARIANT[action] ?? 'default'}
                      className="min-h-11"
                      disabled={transition.isPending || reason !== null}
                      title={reason ?? undefined}
                      aria-describedby={reason ? `dev-app-reason-${action}` : undefined}
                      onClick={() => void run(action)}
                    >
                      {ACTION_LABELS[action]}
                      {reason ? <span id={`dev-app-reason-${action}`} className="sr-only">: {reason}</span> : null}
                    </Button>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
      <DecisionDialog
        kind={decision}
        courseName={application.course_name}
        pending={transition.isPending}
        onConfirm={confirmDecision}
        onClose={() => setDecision(null)}
      />
      {correcting ? (
        <CorrectDetailsDialog
          open
          application={application}
          categoryLabels={labels}
          pending={transition.isPending}
          onSubmit={async (payload) => {
            await send('edit_fields', payload);
            // The loaded row is now out of date (its updated_at): close, the lists refetch.
            onOpenChange(false);
          }}
          onClose={() => setCorrecting(false)}
        />
      ) : null}
      </DialogContent>
    </Dialog>
  );
}
