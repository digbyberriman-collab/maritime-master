import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { todayDateOnly } from '@/shared/lib/form';
import {
  END_DATE_WINDOW_DAYS,
  END_EMPLOYMENT_PENDING_MESSAGE,
  END_NOTES_MAX,
  END_REASONS,
  addDaysTo,
  endEmploymentArgs,
  endEmploymentDefaults,
  endEmploymentFieldFor,
  endEmploymentOutcome,
  formatEmploymentDay,
  makeEndEmploymentSchema,
  type EndEmploymentResult,
  type EndEmploymentValues,
} from '@/modules/crew/lib/employment';
import { EmploymentError, useEndEmployment, type EmploymentVessel } from '@/modules/crew/hooks/useEmployment';

const FIELD = 'min-h-10 [@media(pointer:coarse)]:min-h-11';

export interface EndEmploymentPerson {
  profileId: string;
  displayName: string;
  /** The day they joined the route vessel (the current assignment's), when known. */
  joinDate: string | null;
  /** A pending placement (D-225): there is no assignment to end. */
  pendingPlacement?: boolean;
}

export interface EndEmploymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: EmploymentVessel & { name: string };
  person: EndEmploymentPerson;
  /**
   * D-01: what to show when crew_end_employment is not applied: the legacy
   * sign-off with the notice, carrying over the end date and the notes.
   */
  renderFallback: (notice: string, carry: { endDate: string; reason: string; notes: string }) => React.ReactNode;
  /** After a confirmed end of employment (the dialog then shows the outcome). */
  onEnded?: (result: EndEmploymentResult) => void;
}

/**
 * End employment (gap/04 W8, C57; X1-11B): the end date, the reason (W8's
 * list), and notes, then crew_end_employment, which in one definer ends the
 * assignment on the vessel (the crew-assignment guard decides as the
 * caller), ends the open terms, expires or terminates the active contract,
 * removes the planner periods after the end date and trims one that runs
 * past it, names the final hours of rest month and tells fleet HR. The
 * person keeps their documents and history.
 *
 * The form mirrors the server's refusals with the server's sentences
 * (lib/employment); a refusal that names a field (HINT) lands on it, any
 * other is shown above the buttons, and a 42501 shows its STORM sentence
 * (D-207). The outcome is shown effect by effect as the server answered it,
 * never assumed. D-01: while the RPC is missing the dialog shows the legacy
 * sign-off (renderFallback) with a notice.
 */
const EndEmploymentDialog: React.FC<EndEmploymentDialogProps> = ({ open, onOpenChange, vessel, person, renderFallback, onEnded }) => {
  const today = useMemo(() => todayDateOnly(), []);
  const schema = useMemo(() => makeEndEmploymentSchema({ today, joinDate: person.joinDate }), [today, person.joinDate]);
  const form = useForm<EndEmploymentValues>({ resolver: zodResolver(schema), defaultValues: endEmploymentDefaults(today) });
  const { register, control, handleSubmit, setError, watch, formState } = form;
  const end = useEndEmployment(vessel, person.profileId);
  const [result, setResult] = useState<EndEmploymentResult | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setFormError(null);
      form.reset(endEmploymentDefaults(today));
    }
  }, [open, form, today]);

  const reason = watch('reason');
  const notes = watch('notes');
  const reasonOption = END_REASONS.find((r) => r.value === reason) ?? null;
  const errorText = (name: keyof EndEmploymentValues) => {
    const message = formState.errors[name]?.message;
    return typeof message === 'string' ? message : null;
  };

  if (fallback) {
    const values = form.getValues();
    return <>{renderFallback(fallback, { endDate: values.endDate, reason: values.reason, notes: values.notes })}</>;
  }

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const answer = await end.mutateAsync(endEmploymentArgs(values, person.profileId, vessel.id));
      setResult(answer);
      onEnded?.(answer);
    } catch (e) {
      if (e instanceof EmploymentError) {
        if (e.kind === 'missing') {
          setFallback(e.message);
          return;
        }
        const field = endEmploymentFieldFor(e.hint);
        if (field) {
          setError(field, { type: 'server', message: e.message });
          return;
        }
        setFormError(e.message);
        return;
      }
      setFormError(e instanceof Error ? e.message : 'Employment was not ended. Try again.');
    }
  });

  const busy = end.isPending;
  const min = person.joinDate && person.joinDate.slice(0, 10) > addDaysTo(today, -END_DATE_WINDOW_DAYS) ? person.joinDate.slice(0, 10) : addDaysTo(today, -END_DATE_WINDOW_DAYS);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" data-end-employment={result ? 'done' : 'form'}>
        <DialogHeader>
          <DialogTitle>{result ? 'Employment ended' : 'End employment'}</DialogTitle>
          <DialogDescription>
            {result
              ? `${person.displayName} is no longer on ${vessel.name}’s crew from ${formatEmploymentDay(result.endDate)}.`
              : `${person.displayName} on ${vessel.name}. Their documents and history stay on their profile.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <Alert variant="success">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              <AlertTitle>Done</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4" data-end-employment-outcome="">
                  {endEmploymentOutcome(result, { person: person.displayName, vessel: vessel.name }).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" className="[@media(pointer:coarse)]:h-11" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : person.pendingPlacement ? (
          <div className="space-y-4">
            <Alert variant="info" data-end-employment-refused="pending_placement">
              <AlertDescription>{END_EMPLOYMENT_PENDING_MESSAGE}</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit} noValidate aria-label="End employment">
            <div className="space-y-2">
              <Label htmlFor="end-employment-date">Last day of employment</Label>
              <Input
                id="end-employment-date"
                type="date"
                className={FIELD}
                min={min}
                max={addDaysTo(today, END_DATE_WINDOW_DAYS)}
                aria-invalid={Boolean(errorText('endDate'))}
                aria-describedby="end-employment-date-help"
                {...register('endDate')}
              />
              <p id="end-employment-date-help" className="type-caption text-muted-foreground">
                {person.joinDate ? `Joined ${formatEmploymentDay(person.joinDate)}. ` : ''}Within a year of today, either way.
              </p>
              {errorText('endDate') ? <p className="type-caption text-critical">{errorText('endDate')}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-employment-reason">Reason</Label>
              <Controller
                control={control}
                name="reason"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="end-employment-reason"
                      className={FIELD}
                      aria-invalid={Boolean(errorText('reason'))}
                      aria-describedby={reasonOption ? 'end-employment-reason-help' : undefined}
                    >
                      <SelectValue placeholder="Choose why the employment ends" />
                    </SelectTrigger>
                    <SelectContent>
                      {END_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {reasonOption ? (
                <p id="end-employment-reason-help" className="type-caption text-muted-foreground">
                  {reasonOption.hint}
                </p>
              ) : null}
              {errorText('reason') ? <p className="type-caption text-critical">{errorText('reason')}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-employment-notes">Notes{reason === 'other' ? '' : ' (optional)'}</Label>
              <Textarea
                id="end-employment-notes"
                rows={3}
                className="resize-none"
                maxLength={END_NOTES_MAX + 200}
                aria-invalid={Boolean(errorText('notes'))}
                aria-describedby="end-employment-notes-count"
                {...register('notes')}
              />
              <p id="end-employment-notes-count" className="type-caption text-muted-foreground">
                {notes.trim().length.toLocaleString('en-GB')} of {END_NOTES_MAX.toLocaleString('en-GB')} characters. Kept with the employment record.
              </p>
              {errorText('notes') ? <p className="type-caption text-critical">{errorText('notes')}</p> : null}
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3 type-caption text-muted-foreground" data-end-employment-effects="">
              <p className="font-medium text-foreground">What happens</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>The assignment and the employment terms on {vessel.name} end on that day.</li>
                <li>The active contract is marked expired or terminated, as the reason says.</li>
                <li>Planner periods after that day are removed; one running past it ends there.</li>
                <li>That month’s hours of rest are their final month.</li>
                <li>Fleet HR is told in STORM.</li>
              </ul>
            </div>

            {formError ? (
              <Alert variant="destructive" data-end-employment-error="">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" className="[@media(pointer:coarse)]:h-11" disabled={busy}>
                {busy ? <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" /> : null}
                End employment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EndEmploymentDialog;
