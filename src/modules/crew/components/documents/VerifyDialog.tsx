import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/shared/lib/notify';
import { todayDateOnly } from '@/shared/lib/form';
import { CrewDocumentWriteError, type CrewDocumentView } from '@/modules/crew/hooks/useCrewDocuments';
import { useDocumentReviewActions } from '@/modules/crew/hooks/useDocumentVerification';
import { crewDocumentRefusal } from '@/modules/crew/lib/crewDocumentSchema';
import {
  DECISION_HINT,
  DECISION_LABEL,
  VERIFICATION_DECISIONS,
  buildVerifySchema,
  conditionalNote,
  dayText,
  emptyVerifyValues,
  reviewRefusalField,
  reviewedLine,
  verifyRequest,
  type VerifyFormValues,
} from '@/modules/crew/lib/verification';
import type { CrewDocumentDecision } from '@/modules/crew/types/db.pending';
import { VerificationBadge } from './VerificationBadge';

export interface VerifyDialogProps {
  document: CrewDocumentView;
  profileId: string;
  companyId: string;
  /** Whose document it is, for the description. */
  personName?: string | null;
  /** The issuing country in words. */
  countryLabel?: (code: string | null) => string | null;
  onOpenChange: (open: boolean) => void;
  onDecided?: (decision: CrewDocumentDecision) => void;
}

const SUBMIT_LABEL: Readonly<Record<CrewDocumentDecision, string>> = {
  verified: 'Verify',
  conditionally_approved: 'Approve with condition',
  rejected: 'Reject',
};

const SUCCESS_WORDS: Readonly<Record<CrewDocumentDecision, string>> = {
  verified: 'verified',
  conditionally_approved: 'approved with a condition',
  rejected: 'rejected',
};

const NOTE_LABEL: Readonly<Record<CrewDocumentDecision, string>> = {
  verified: 'Remark (optional)',
  conditionally_approved: 'Condition',
  rejected: 'Reason',
};

const NOTE_PLACEHOLDER: Readonly<Record<CrewDocumentDecision, string>> = {
  verified: 'Anything the next reviewer should know',
  conditionally_approved: 'For example: valid with corrective lenses',
  rejected: 'For example: the scan is unreadable, upload a clearer copy',
};

const COARSE = '[@media(pointer:coarse)]:h-11';

/**
 * Record a verification decision on a crew document (gap/04 C27, W4):
 * Verified, Conditionally approved (a condition and, if it ends, until when)
 * or Rejected (why). The document's details sit above the choice so they
 * can be checked against the file; the current review shows who decided
 * what and when. React Hook Form + the zod schema of lib/verification.ts;
 * crew_document_verify must answer with the same document in the decided
 * state, else the decision is not reported as recorded. A refusal lands on
 * the note it names (22023 HINT) or reads in the dialog as the server
 * wrote it (42501: own document, another department, not permitted).
 */
export const VerifyDialog: React.FC<VerifyDialogProps> = ({ document: doc, profileId, companyId, personName, countryLabel, onOpenChange, onDecided }) => {
  const today = React.useMemo(() => todayDateOnly(), []);
  const schema = React.useMemo(() => buildVerifySchema(today), [today]);
  const form = useForm<VerifyFormValues>({ resolver: zodResolver(schema), defaultValues: emptyVerifyValues() });
  const { verify } = useDocumentReviewActions(companyId, profileId);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const saving = verify.isPending;
  const decision = form.watch('decision');
  const note = form.watch('note');
  const until = form.watch('until');
  const reviewed = reviewedLine(doc);
  const country = countryLabel ? countryLabel(doc.issuingCountryCode) : doc.issuingCountryCode;

  const close = (open: boolean) => {
    if (!open && saving) return;
    onOpenChange(open);
  };

  const submit = form.handleSubmit(async (values) => {
    setRefusal(null);
    const request = verifyRequest(values);
    try {
      await verify.mutateAsync({ id: doc.id, decision: request.decision, note: request.note });
      notify.success(`${doc.name} ${SUCCESS_WORDS[request.decision]}`);
      onDecided?.(request.decision);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof CrewDocumentWriteError) {
        setRefusal(error.message);
        return;
      }
      const field = reviewRefusalField(error);
      const { message } = crewDocumentRefusal(error);
      if (field === 'note') form.setError('note', { message }, { shouldFocus: true });
      else if (field === 'decision') form.setError('decision', { message });
      else setRefusal(message);
    }
  });

  const preview = decision === 'conditionally_approved' && note.trim() ? conditionalNote(note, until) : null;

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent
        className="flex max-h-[min(92dvh,48rem)] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0"
        data-verify-dialog=""
        onInteractOutside={(e) => {
          if (saving) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 pr-12 text-left sm:px-6">
          <p className="type-eyebrow text-muted-foreground">Verify document</p>
          <DialogTitle className="type-title break-words">{doc.name}</DialogTitle>
          <DialogDescription>
            {personName ? `${personName}. ` : ''}Check the file and the details, then record your decision.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col" aria-label={`Verify ${doc.name}`}>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
              <section aria-label="The document" className="rounded-md border border-border bg-muted/30 p-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <Fact label="Number" value={doc.number} mono />
                  <Fact label="Issuing country" value={country} />
                  <Fact label="Issued" value={dayText(doc.issueDate)} />
                  <Fact label="Expires" value={doc.noExpiry ? 'No expiry' : dayText(doc.expiryDate)} />
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <VerificationBadge doc={doc} />
                  <span className="type-caption text-muted-foreground">{reviewed ?? 'Nobody has reviewed it yet.'}</span>
                  {doc.hasFile ? null : <span className="type-caption text-muted-foreground">No file is attached.</span>}
                </div>
              </section>

              {refusal ? (
                <Alert variant="destructive" data-verify-refusal="">
                  <AlertOctagon aria-hidden="true" className="size-4" />
                  <AlertDescription>{refusal}</AlertDescription>
                </Alert>
              ) : null}

              <fieldset disabled={saving} className="min-w-0 space-y-5 border-0 p-0">
                <FormField
                  control={form.control}
                  name="decision"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Decision</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value ?? ''}
                          onValueChange={(v) => field.onChange(v as CrewDocumentDecision)}
                          className="grid gap-2"
                          aria-label="Decision"
                        >
                          {VERIFICATION_DECISIONS.map((d) => {
                            const id = `verify-${doc.id}-${d}`;
                            const selected = field.value === d;
                            return (
                              <label
                                key={d}
                                htmlFor={id}
                                className={cn(
                                  'flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
                                  selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                                )}
                                data-decision={d}
                              >
                                <RadioGroupItem id={id} value={d} className="mt-0.5" />
                                <span className="min-w-0">
                                  <span className="block type-body font-medium text-foreground">{DECISION_LABEL[d]}</span>
                                  <span className="block type-caption text-muted-foreground">{DECISION_HINT[d]}</span>
                                </span>
                              </label>
                            );
                          })}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {decision ? (
                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{NOTE_LABEL[decision]}</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} placeholder={NOTE_PLACEHOLDER[decision]} aria-required={decision !== 'verified'} />
                        </FormControl>
                        {decision === 'rejected' ? <FormDescription>The person who holds the document sees this note.</FormDescription> : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                {decision === 'conditionally_approved' ? (
                  <FormField
                    control={form.control}
                    name="until"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Until (optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            min={today}
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            className={cn('w-full sm:w-56', COARSE)}
                          />
                        </FormControl>
                        <FormDescription>When the condition ends. Leave it empty if it has no end.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                {preview ? (
                  <p className="type-caption text-muted-foreground" data-note-preview="">
                    Saved as: <span className="text-foreground">{preview}</span>
                  </p>
                ) : null}
              </fieldset>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={saving} className={COARSE}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} variant={decision === 'rejected' ? 'destructive' : 'default'} className={COARSE}>
                {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {saving ? 'Saving…' : decision ? SUBMIT_LABEL[decision] : 'Record decision'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

const Fact: React.FC<{ label: string; value: string | null; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <dt className="type-caption text-muted-foreground">{label}</dt>
    <dd className={cn('truncate type-body', value ? 'text-foreground' : 'text-muted-foreground', mono && value ? 'type-mono' : null)} title={value ?? undefined}>
      {value ?? 'Not recorded'}
    </dd>
  </div>
);

export default VerifyDialog;
