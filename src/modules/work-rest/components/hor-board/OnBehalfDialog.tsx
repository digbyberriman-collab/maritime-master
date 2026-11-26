/**
 * A month step from the board (gap/04 C39, C43): the confirmation for
 * signing as head of department, approving and locking, and the reason
 * form for reopening and for "Has left the vessel. Submit on their behalf"
 * (a company signature with who and why; the reason is required, RHF +
 * zod). Every step goes through work_rest_month_transition; a refusal shows
 * the server's sentence in the dialog and the dialog stays open. The toast
 * says only what the server did.
 */
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/shared/lib/notify';
import { REASON_MAX, MONTH_WARNING_TEXT } from '../../lib/horMonth';
import { displayName, monthLabel, onBehalfSchema, reopenSchema, type BoardMember } from '../../lib/horBoard';
import { boardErrorText, useBoardMonthAction } from '../../hooks/useVesselBoard';

export type BoardStep = 'hod_sign' | 'approve' | 'lock' | 'reopen' | 'submit_on_behalf';

interface StepCopy {
  title: string;
  body: (name: string, month: string, vessel: string) => string;
  confirm: string;
  done: (name: string) => string;
  reason: 'on_behalf' | 'reopen' | null;
}

const COPY: Readonly<Record<BoardStep, StepCopy>> = {
  hod_sign: {
    title: 'Sign as head of department',
    body: (name, month) => `You confirm you have reviewed ${name}'s hours for ${month}.`,
    confirm: 'Sign',
    done: (name) => `Signed ${name}'s month as head of department`,
    reason: null,
  },
  approve: {
    title: 'Approve the month',
    body: (name, month) => `Approve and sign ${name}'s hours of work and rest for ${month}.`,
    confirm: 'Approve and sign',
    done: (name) => `${name}'s month is approved`,
    reason: null,
  },
  lock: {
    title: 'Lock the month',
    body: (name, month) => `${name}'s ${month} becomes the record. It changes only if it is reopened, with a reason.`,
    confirm: 'Lock',
    done: (name) => `${name}'s month is locked`,
    reason: null,
  },
  reopen: {
    title: 'Reopen the month',
    body: (name, month) => `${name} can change the days of ${month} again. The signatures so far are kept as history and marked as replaced.`,
    confirm: 'Reopen',
    done: (name) => `${name}'s month is reopened`,
    reason: 'reopen',
  },
  submit_on_behalf: {
    title: 'Submit on their behalf',
    body: (name, month, vessel) =>
      `${name} has left ${vessel}. Their ${month} is submitted with a company signature, your name and your reason, and goes on to approval.`,
    confirm: 'Submit for them',
    done: (name) => `${name}'s month is submitted on their behalf`,
    reason: 'on_behalf',
  },
};

export interface MonthStepDialogProps {
  step: BoardStep;
  vesselId: string;
  vesselName: string;
  member: BoardMember;
  year: number;
  month: number;
  onClose: () => void;
}

type ReasonValues = { reason: string };

export const MonthStepDialog: React.FC<MonthStepDialogProps> = ({ step, vesselId, vesselName, member, year, month, onClose }) => {
  const copy = COPY[step];
  const name = displayName(member);
  const label = monthLabel({ year, month });
  const action = useBoardMonthAction(vesselId);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ReasonValues>({
    resolver: zodResolver(copy.reason === 'reopen' ? reopenSchema : onBehalfSchema),
    defaultValues: { reason: '' },
  });
  const busy = action.isPending || form.formState.isSubmitting;

  const run = async (reason: string | null) => {
    setError(null);
    try {
      const result = await action.mutateAsync({ crewId: member.userId, year, month, action: step, reason });
      notify.success(copy.done(name));
      for (const w of result.warnings) {
        const text = (MONTH_WARNING_TEXT as Readonly<Record<string, string>>)[w];
        if (text) notify.warning(text);
      }
      onClose();
    } catch (e) {
      setError(boardErrorText(e));
    }
  };

  const submit = copy.reason ? form.handleSubmit((v) => run(v.reason.trim())) : (e: React.FormEvent) => {
    e.preventDefault();
    void run(null);
  };

  return (
    <Dialog open onOpenChange={(o) => (o || busy ? undefined : onClose())}>
      <DialogContent data-month-step={step}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body(name, label, vesselName)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-3" noValidate aria-label={copy.title}>
            {copy.reason ? (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        maxLength={REASON_MAX}
                        placeholder={copy.reason === 'reopen' ? 'What needs to change' : 'Why they could not submit before leaving'}
                      />
                    </FormControl>
                    <FormMessage />
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
                {busy ? 'Working…' : copy.confirm}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

/** "Has left the vessel. Submit on their behalf" (C43). */
export const OnBehalfDialog: React.FC<Omit<MonthStepDialogProps, 'step'>> = (props) => <MonthStepDialog step="submit_on_behalf" {...props} />;

export default OnBehalfDialog;
