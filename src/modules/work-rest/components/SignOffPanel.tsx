/**
 * The month's sign-off (gap/04 C39, C43, W6; T-148; DECISIONS D-X1-6,
 * D-X1-11, D-X1-20). One month per crew member and vessel.
 *
 * Who may do what is decided as the server decides it (lib/horMonth.ts,
 * the mirror of work_rest_month_decide): from the viewer's capabilities on
 * the vessel (useCan: hours_of_rest.create for one's own month, .approve
 * for the head of department step, .final_approve for approval, lock,
 * reopen and submit on behalf) and the department rule (a head of
 * department signs months of their own department only). No role names.
 * An action the viewer may never take is not shown; one blocked by a
 * condition (breaches not reviewed, the HoD signature this vessel
 * requires, unsaved days) is shown disabled with the reason.
 *
 * The HoD step follows the vessel's hod_step: off (no HoD row, no HoD
 * sign), nudge (approval stays open; the approver is reminded, T-148) or
 * required. Reopen and submit on behalf need a reason. Every step goes
 * through work_rest_month_transition; while the engine is missing (D-01)
 * the service writes the legacy rows instead, and submit on behalf, which
 * exists only in the engine, says so. Refusals show the server's sentence
 * (crewRefusalMessage) in the dialog.
 */
import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, CircleDashed, FileSignature, Lock, RotateCcw, Send, ShieldCheck, UserCheck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { StatusPill } from '@/shared/components/status';
import { notify } from '@/shared/lib/notify';
import { useCan } from '@/lib/permissions/useCan';
import { CREW_CAPS } from '@/modules/crew/paths';
import { crewRefusalMessage } from '@/modules/crew/lib/crewUpdateErrors';
import {
  MONTH_ACTIONS,
  MONTH_REFUSAL_TEXT,
  MONTH_WARNING_TEXT,
  REASON_MAX,
  decideMonthAction,
  normaliseMonthStatus,
  type MonthAction,
  type MonthFacts,
  type MonthRefusal,
  type MonthWarning,
} from '../lib/horMonth';
import {
  WorkRestEngineRequired,
  WorkRestRefusal,
  transitionMonth,
  type MonthlySubmission,
  type NonConformityListRow,
  type SignatureListRow,
} from '../services/workRestService';
import type { HodStep } from '../types';

export interface SignOffPanelProps {
  vesselId: string;
  vesselName: string;
  /** The crew member's login (work-rest keys on it). */
  crewUserId: string;
  crewName: string;
  year: number;
  month: number;
  /** "November 2026". */
  monthLabel: string;
  submission: MonthlySubmission;
  signatures: readonly SignatureListRow[];
  nonConformities: readonly NonConformityListRow[];
  actorId: string;
  isOwn: boolean;
  /** The viewer's department on the vessel is the crew member's (false when either is unknown). */
  sameDepartment: boolean;
  /** The crew member had an assignment on the vessel during the month. */
  inMonth: boolean;
  /** The crew member is still assigned to the vessel today. */
  stillAboard: boolean;
  hodStep: HodStep;
  /** Expected days with no entry. */
  missingDays: number;
  /** Days changed on screen and not saved yet. */
  unsavedDays: number;
  onChanged: () => void | Promise<void>;
}

/** Refusals that mean the viewer never takes this step here: the action is not offered. */
const HIDE_ON: ReadonlySet<MonthRefusal> = new Set([
  'action_unknown',
  'not_own_month',
  'own_month',
  'not_permitted',
  'out_of_department',
  'illegal_transition',
  'hod_step_off',
  'still_on_vessel',
]);

interface ActionCopy {
  label: string;
  icon: typeof Send;
  title: string;
  body: (p: SignOffPanelProps) => string;
  confirm: string;
  done: string;
  reason?: boolean;
  statement?: string;
}

/** The submit statement (the engine stores the same sentence when none is sent). */
const SUBMIT_STATEMENT = 'I confirm these records of my hours of work and rest are accurate.';

const COPY: Readonly<Record<MonthAction, ActionCopy>> = {
  submit: {
    label: 'Submit month',
    icon: Send,
    title: 'Submit your month',
    body: (p) => `Your hours of work and rest for ${p.monthLabel} on ${p.vesselName} go for review. Days can't be changed after this unless the month is reopened.`,
    confirm: 'Submit and sign',
    done: 'Month submitted',
    statement: SUBMIT_STATEMENT,
  },
  submit_on_behalf: {
    label: 'Submit on their behalf',
    icon: UserCheck,
    title: 'Submit on their behalf',
    body: (p) => `${p.crewName} has left ${p.vesselName}. The month is submitted with a company signature and your reason, and goes on to approval.`,
    confirm: 'Submit for them',
    done: 'Submitted on their behalf',
    reason: true,
  },
  hod_sign: {
    label: 'Sign as head of department',
    icon: FileSignature,
    title: 'Sign as head of department',
    body: (p) => `You confirm you have reviewed ${p.crewName}'s hours for ${p.monthLabel}.`,
    confirm: 'Sign',
    done: 'Signed as head of department',
  },
  approve: {
    label: 'Approve month',
    icon: ShieldCheck,
    title: 'Approve the month',
    body: (p) => `Approve and sign ${p.crewName}'s hours of work and rest for ${p.monthLabel}.`,
    confirm: 'Approve and sign',
    done: 'Month approved',
  },
  lock: {
    label: 'Lock',
    icon: Lock,
    title: 'Lock the month',
    body: () => 'A locked month is the record. It changes only if it is reopened, with a reason.',
    confirm: 'Lock',
    done: 'Month locked',
  },
  reopen: {
    label: 'Reopen',
    icon: RotateCcw,
    title: 'Reopen the month',
    body: () => 'Days can be changed again. The signatures so far are kept as history and marked as replaced.',
    confirm: 'Reopen',
    done: 'Month reopened',
    reason: true,
  },
};

/** One sentence for a refused or failed step: the server's own where it gave one. */
function refusalText(error: unknown): string {
  if (error instanceof WorkRestEngineRequired) return error.message;
  if (error instanceof WorkRestRefusal) {
    const known = (MONTH_REFUSAL_TEXT as Readonly<Record<string, string>>)[error.refusal];
    const sentence = error.message !== error.refusal ? error.message : known ?? error.message;
    return crewRefusalMessage({ code: error.code, details: sentence, message: sentence });
  }
  return crewRefusalMessage(error);
}

const signerName = (sig: SignatureListRow | undefined): string | null => {
  if (!sig) return null;
  const name = [sig.profiles?.first_name, sig.profiles?.last_name].filter(Boolean).join(' ').trim();
  return name || 'Signed';
};

const when = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return null;
  }
};

const isUnreviewed = (n: NonConformityListRow) => n.status === 'open' && !n.review_outcome && !n.superseded_at;

export const SignOffPanel: React.FC<SignOffPanelProps> = (props) => {
  const { vesselId, submission, signatures, nonConformities, isOwn, sameDepartment, inMonth, stillAboard, hodStep, missingDays, unsavedDays } = props;
  const ctx = { vesselId };
  const canCreate = useCan(CREW_CAPS.horCreate, ctx);
  const canApprove = useCan(CREW_CAPS.horApprove, ctx);
  const canFinalApprove = useCan(CREW_CAPS.horFinalApprove, ctx);
  const [open, setOpen] = useState<MonthAction | null>(null);

  const live = signatures.filter((s) => !s.stale_at);
  const sigOf = (role: string) => live.filter((s) => s.signer_role === role).pop();
  const state = normaliseMonthStatus(submission.status) ?? 'draft';
  const hodSigned = Boolean(sigOf('hod')) || state === 'hod_signed';
  const blockingUnreviewed = nonConformities.filter((n) => isUnreviewed(n) && n.severity !== 'low').length;
  const lowUnreviewed = nonConformities.filter((n) => isUnreviewed(n) && n.severity === 'low').length;

  const facts: MonthFacts = useMemo(
    () => ({ isOwn, canCreate, canApprove, canFinalApprove, sameDepartment, inMonth, stillAboard, hodStep, hodSigned, blockingUnreviewed, lowUnreviewed, missingDays, reason: null }),
    [isOwn, canCreate, canApprove, canFinalApprove, sameDepartment, inMonth, stillAboard, hodStep, hodSigned, blockingUnreviewed, lowUnreviewed, missingDays],
  );

  /** The steps on offer, each enabled or disabled with the reason. */
  const offers = MONTH_ACTIONS.flatMap((action) => {
    const decision = decideMonthAction(submission.status, action, { ...facts, reason: COPY[action].reason ? 'x' : null });
    const refusal = 'refusal' in decision ? decision.refusal : null;
    if (refusal && HIDE_ON.has(refusal)) return [];
    if (action === 'submit_on_behalf' && refusal) return [];
    let reason: string | null = refusal ? MONTH_REFUSAL_TEXT[refusal] : null;
    if (!reason && action === 'submit' && unsavedDays > 0) reason = 'Save the changed days first.';
    return [{ action, reason, warnings: 'warnings' in decision ? decision.warnings : [] }];
  });
  const current = offers.find((o) => o.action === open) ?? null;

  const crewSig = sigOf('crew') ?? sigOf('company');
  const onBehalf = !sigOf('crew') && Boolean(sigOf('company'));
  const rows: Array<{ key: string; label: string; done: boolean; who: string | null; at: string | null; note?: string }> = [
    {
      key: 'crew',
      label: onBehalf ? 'Submitted for the crew member' : 'Crew member',
      done: Boolean(crewSig),
      who: signerName(crewSig),
      at: when(crewSig?.signed_at),
    },
    ...(hodStep === 'off'
      ? []
      : [
          {
            key: 'hod',
            label: hodStep === 'required' ? 'Head of department (required)' : 'Head of department (optional)',
            done: hodSigned,
            who: signerName(sigOf('hod')) ?? (hodSigned ? 'Signed' : null),
            at: when(sigOf('hod')?.signed_at ?? submission.hod_signed_at),
          },
        ]),
    {
      key: 'captain',
      label: 'Approved by the Master',
      done: state === 'approved' || state === 'locked',
      who: signerName(sigOf('captain')),
      at: when(sigOf('captain')?.signed_at ?? submission.captain_reviewed_at),
    },
    { key: 'locked', label: 'Locked', done: state === 'locked', who: null, at: when(submission.locked_at) },
  ];

  // A HoD signature or the hod_signed state counts as signed, so only a submitted month can be waiting for it.
  const nudge = hodStep === 'nudge' && !hodSigned && state === 'submitted' && canFinalApprove && !isOwn;

  return (
    <Card data-sign-off={state}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 type-subtitle">
          <FileSignature aria-hidden="true" className="h-4 w-4" />
          Sign-off
          <StatusPill className="ml-auto" domain="work_rest_submission" status={submission.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-1.5" aria-label="Sign-off steps">
          {rows.map((r) => (
            <li key={r.key} className="flex min-h-10 items-start gap-2 rounded-md border border-border px-2.5 py-2" data-step={r.key} data-done={r.done || undefined}>
              {r.done ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <CircleDashed aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block type-body-sm font-medium text-foreground">{r.label}</span>
                <span className="block type-caption text-muted-foreground">
                  {r.done ? [r.who, r.at].filter(Boolean).join(' · ') || 'Done' : 'Waiting'}
                </span>
              </span>
            </li>
          ))}
        </ol>
        {state === 'reopened' && submission.reopen_reason ? (
          <p className="type-caption text-muted-foreground">Reopened: {submission.reopen_reason}</p>
        ) : null}
        {nudge ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            <AlertDescription>The head of department has not signed this month yet. You can still approve it.</AlertDescription>
          </Alert>
        ) : null}
        {offers.length ? (
          <div className="flex flex-wrap gap-2">
            {offers.map((o) => {
              const Icon = COPY[o.action].icon;
              const primary = o.action === 'submit' || o.action === 'approve' || o.action === 'hod_sign' || o.action === 'submit_on_behalf';
              return (
                <span key={o.action} className="inline-flex flex-col gap-1">
                  <Button
                    type="button"
                    variant={primary ? 'default' : 'outline'}
                    disabled={Boolean(o.reason)}
                    aria-describedby={o.reason ? `signoff-${o.action}-why` : undefined}
                    onClick={() => setOpen(o.action)}
                  >
                    <Icon aria-hidden="true" />
                    {COPY[o.action].label}
                  </Button>
                  {o.reason ? (
                    <span id={`signoff-${o.action}-why`} className="max-w-[18rem] type-caption text-muted-foreground">
                      {o.reason}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="type-caption text-muted-foreground">{isOwn ? 'Nothing to do on this month now.' : 'You have no step to take on this month now.'}</p>
        )}
      </CardContent>
      {current ? (
        <ActionDialog
          panel={props}
          action={current.action}
          warnings={[
            ...current.warnings,
            ...(current.action === 'submit' && missingDays > 0 && !current.warnings.includes('days_not_entered') ? (['days_not_entered'] as MonthWarning[]) : []),
          ]}
          missingDays={missingDays}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Card>
  );
};

const actionSchema = (withReason: boolean, withStatement: boolean) =>
  z.object({
    reason: withReason
      ? z.string().trim().min(1, 'Give a reason').max(REASON_MAX, `Keep the reason to ${REASON_MAX} characters`)
      : z.string(),
    confirmed: withStatement ? z.literal(true, { errorMap: () => ({ message: 'Confirm the statement to submit' }) }) : z.boolean(),
  });
type ActionValues = { reason: string; confirmed: boolean };

const ActionDialog: React.FC<{
  panel: SignOffPanelProps;
  action: MonthAction;
  warnings: readonly MonthWarning[];
  missingDays: number;
  onClose: () => void;
}> = ({ panel, action, warnings, missingDays, onClose }) => {
  const copy = COPY[action];
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ActionValues>({
    resolver: zodResolver(actionSchema(Boolean(copy.reason), Boolean(copy.statement))),
    defaultValues: { reason: '', confirmed: false },
  });
  const busy = form.formState.isSubmitting;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const out = await transitionMonth({
        vesselId: panel.vesselId,
        crewId: panel.crewUserId,
        year: panel.year,
        month: panel.month,
        action,
        reason: copy.reason ? values.reason.trim() : null,
        signatureText: copy.statement ?? null,
        legacy: { submissionId: panel.submission.id, actorId: panel.actorId },
      });
      notify.success(copy.done);
      if (out.mode === 'engine') {
        for (const w of out.result.warnings) {
          const text = (MONTH_WARNING_TEXT as Readonly<Record<string, string>>)[w];
          if (text) notify.warning(text);
        }
      }
      onClose();
      await panel.onChanged();
    } catch (e) {
      setError(refusalText(e));
    }
  });

  const warningText = (w: MonthWarning) =>
    w === 'days_not_entered' && missingDays > 0 ? `${MONTH_WARNING_TEXT[w]} (${missingDays} ${missingDays === 1 ? 'day' : 'days'})` : MONTH_WARNING_TEXT[w];
  const nudge = action === 'approve' && warnings.includes('hod_not_signed');

  return (
    <Dialog open onOpenChange={(o) => (o || busy ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body(panel)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-3" noValidate aria-label={copy.title}>
            {warnings.length ? (
              <ul className="space-y-1.5" aria-label="Before you go on">
                {warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-muted px-3 py-2 type-body-sm text-foreground">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    {warningText(w)}
                  </li>
                ))}
              </ul>
            ) : null}
            {copy.reason ? (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} maxLength={REASON_MAX} placeholder={action === 'reopen' ? 'What needs to change' : 'Why the month is submitted for them'} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {copy.statement ? (
              <FormField
                control={form.control}
                name="confirmed"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 space-y-0 rounded-md border border-border p-3">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel className="font-normal">{copy.statement}</FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {nudge ? 'Approve anyway' : copy.confirm}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default SignOffPanel;
