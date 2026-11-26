/**
 * Remind the people who still have to acknowledge a fleet document
 * (gap/02 FD7 manual reminders, W1 "Remind"; X5 spec X5-05B; DECISIONS
 * D-128, D-249): one person, everyone outstanding on a vessel, or everyone
 * outstanding on every vessel the document reaches.
 *
 * - The 24-hour rule is shown before anything is sent: each person gets at
 *   most one reminder a day for a document, and anyone reminded in the
 *   last 24 hours is skipped. When the reminder log can be read, the dialog
 *   says how many of the people it would reach were reminded recently ("at
 *   least": the log shows only what the caller may read).
 * - When the screen holds the person rows, the dialog says how many people
 *   it would reach (on the crew, still to acknowledge, with an app login,
 *   never the caller); people without a login or outside the signer list
 *   are not reminded, and the dialog says what to do instead.
 * - The answer of `fleet_document_remind` is checked; the toast reports who
 *   was reminded, who was skipped by the 24-hour rule and who could not be
 *   reached. A refusal stays in the dialog as a sentence. Reminders are
 *   in-app: nothing here says an email was sent (D-249).
 */
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BellRing, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/shared/lib/notify';
import { REMIND_CHANNEL, REMIND_RULE, remindCandidates, type RemindScope, type RemindTarget } from '../lib/ackAdmin';
import { remindSchema, type RemindFormValues } from '../lib/acknowledgementSchema';
import { recentlyReminded, useRecentFleetDocumentReminders, useRemindFleetDocument } from '../hooks/useFleetDocumentAcks';
import type { FleetDocumentAckStatusRow } from '../types/db.pending';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

const people = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'person' : 'people'}`;

/** What the reminder is about, and the choices of who to remind. */
export interface RemindRequest {
  documentId: string;
  title: string;
  versionLabel: string;
  /** The scopes the caller may choose from, the first preselected (one scope: no choice shown). */
  scopes: readonly RemindScope[];
  /** The vessel for the `vessel` and `person` scopes. */
  vesselId: string | null;
  vesselName: string | null;
  /** The person for the `person` scope. */
  profileId: string | null;
  personName: string | null;
}

export interface RemindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  request: RemindRequest | null;
  /**
   * The person rows the screen holds for this document (the caller's
   * readership), to say how many people a reminder would reach; null when
   * they are not loaded (the dialog then describes who, without a number).
   */
  rows: readonly FleetDocumentAckStatusRow[] | null;
  /** The caller's profile (never reminded). */
  callerProfileId: string | null;
}

export function RemindDialog({ open, onOpenChange, companyId, request, rows, callerProfileId }: RemindDialogProps) {
  return (
    <Dialog open={open && !!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full" aria-describedby="remind-description">
        {open && request ? (
          <RemindForm
            key={`${request.documentId}:${request.vesselId ?? 'all'}:${request.profileId ?? 'all'}`}
            companyId={companyId}
            request={request}
            rows={rows}
            callerProfileId={callerProfileId}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const SCOPE_LABEL = (scope: RemindScope, request: RemindRequest): string => {
  if (scope === 'person') return `Only ${request.personName ?? 'this person'}`;
  if (scope === 'vessel') return `Everyone still to acknowledge on ${request.vesselName ?? 'this vessel'}`;
  return 'Everyone still to acknowledge, on every vessel it reaches';
};

function targetFor(request: RemindRequest, scope: RemindScope): RemindTarget {
  return {
    scope,
    documentId: request.documentId,
    vesselId: scope === 'all' ? null : request.vesselId,
    profileId: scope === 'person' ? request.profileId : null,
  };
}

function RemindForm({
  companyId,
  request,
  rows,
  callerProfileId,
  onDone,
}: {
  companyId: string | null;
  request: RemindRequest;
  rows: readonly FleetDocumentAckStatusRow[] | null;
  callerProfileId: string | null;
  onDone: () => void;
}) {
  const id = React.useId();
  const scopes = request.scopes.length ? request.scopes : (['all'] as const);
  const form = useForm<RemindFormValues>({ resolver: zodResolver(remindSchema), defaultValues: { scope: scopes[0] } });
  const scope = form.watch('scope');
  const remind = useRemindFleetDocument(companyId);
  const recent = useRecentFleetDocumentReminders(companyId, request.documentId);

  const candidatesFor = (s: RemindScope) => (rows ? remindCandidates(rows, targetFor(request, s), callerProfileId) : null);
  const candidates = candidatesFor(scope);
  const recentSet = recent.state === 'ready' ? recentlyReminded(recent.data) : null;
  const recentlyCount = candidates && recentSet ? candidates.filter((r) => recentSet.has(r.profile_id)).length : null;
  const reachable = candidates ? candidates.length - (recentlyCount ?? 0) : null;
  const busy = remind.isPending;

  const submit = form.handleSubmit(async (values) => {
    try {
      await remind.mutateAsync(targetFor(request, values.scope));
      onDone();
    } catch {
      // Shown below, in words.
    }
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="break-words">{`Remind about ${request.title}`}</DialogTitle>
        <DialogDescription id="remind-description">
          {`Version ${request.versionLabel}. A reminder asks people who have not acknowledged it yet to read it and confirm.`}
        </DialogDescription>
      </DialogHeader>

      {scopes.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Who to remind</legend>
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={(v) => field.onChange(v)} className="gap-1" disabled={busy}>
                {scopes.map((s) => {
                  const n = candidatesFor(s)?.length ?? null;
                  return (
                    <Label
                      key={s}
                      htmlFor={`${id}-${s}`}
                      className={cn('flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm font-normal', COARSE, field.value === s && 'border-primary bg-signal-muted')}
                    >
                      <RadioGroupItem id={`${id}-${s}`} value={s} />
                      <span className="min-w-0 flex-1 break-words text-foreground">{SCOPE_LABEL(s, request)}</span>
                      {n !== null ? <span className="shrink-0 tabular-nums text-muted-foreground">{people(n)}</span> : null}
                    </Label>
                  );
                })}
              </RadioGroup>
            )}
          />
        </fieldset>
      ) : (
        <p className="text-sm text-foreground">{SCOPE_LABEL(scopes[0], request)}</p>
      )}

      <div className="space-y-1 text-sm" data-testid="remind-reach">
        {candidates ? (
          candidates.length === 0 ? (
            <p className="text-foreground">Nobody here can be reminded: everyone has acknowledged, or cannot acknowledge in the app.</p>
          ) : (
            <p className="text-foreground">
              <span className="font-medium">{`${people(candidates.length)} still to acknowledge with an app login.`}</span>
              {recentlyCount ? ` At least ${people(recentlyCount)} of them ${recentlyCount === 1 ? 'was' : 'were'} reminded in the last 24 hours and will be skipped.` : null}
            </p>
          )
        ) : (
          <p className="text-foreground">Everyone still to acknowledge with an app login is reminded.</p>
        )}
        {recent.state === 'error' ? <p className="type-caption text-muted-foreground">Recent reminders could not be checked; the 24-hour rule still applies.</p> : null}
        <p className="type-caption text-muted-foreground">
          People without an app login, or not on the signer list, are not reminded. The Master or their head of department can record a witnessed acknowledgement instead.
        </p>
      </div>

      <Alert variant="info" data-testid="remind-rule">
        <Info aria-hidden="true" className="h-4 w-4" />
        <AlertTitle>The 24-hour rule</AlertTitle>
        <AlertDescription>{`${REMIND_RULE} ${REMIND_CHANNEL}`}</AlertDescription>
      </Alert>

      {remind.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Nobody was reminded</AlertTitle>
          <AlertDescription>{errorMessage(remind.error, 'Try again.')}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" className={COARSE} onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" className={COARSE} disabled={busy || (candidates !== null && candidates.length === 0)} aria-busy={busy}>
          <BellRing aria-hidden="true" className="h-4 w-4" />
          {busy ? 'Reminding…' : reachable !== null && reachable > 0 ? `Remind ${people(reachable)}` : 'Send reminder'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default RemindDialog;
