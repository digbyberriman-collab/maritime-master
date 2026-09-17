import React, { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Loader2, Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useDisciplinaryRecords, useIncidentsForPicker } from '@/modules/hris/hooks/useDisciplinary';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import {
  DEFAULT_DISCIPLINARY_FILTERS,
  DEFAULT_EXPIRY_MONTHS,
  DISCIPLINARY_CATEGORIES,
  DISCIPLINARY_SEVERITIES,
  DISCIPLINARY_STAGES,
  SEVERITY_LABEL,
  STAGE_LABEL,
  caseFormSchema,
  countLiveWarnings,
  defaultExpiryDate,
  emptyCaseFormValues,
  recordToCaseFormValues,
  suggestNextStage,
  type CaseFormValues,
  type DisciplinaryRecordRow,
} from '@/modules/hris/lib/disciplinary';

const NONE = '__none__';

interface CaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this record; otherwise it opens a new case. */
  record?: DisciplinaryRecordRow | null;
  /** Prefill for new cases (subject, vessel). */
  defaults?: Partial<CaseFormValues>;
  /** Whether the subject can be changed (locked when opened from a crew file). */
  lockSubject?: boolean;
  vessels: CompanyVessel[];
  /** Existing records for the subject, used for the escalation suggestion. Fetched for the chosen subject when omitted. */
  existingRecords?: DisciplinaryRecordRow[];
  onSubmit: (values: CaseFormValues) => Promise<void>;
  isPending?: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className="space-y-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
  </div>
);

/** Open / edit a disciplinary case. The investigation file lives in a collapsed, clearly restricted section. */
export const CaseFormDialog: React.FC<CaseFormDialogProps> = ({
  open,
  onOpenChange,
  record,
  defaults,
  lockSubject,
  vessels,
  existingRecords,
  onSubmit,
  isPending,
}) => {
  const isEdit = Boolean(record);
  const { profile } = useAuth();
  const directory = useHrCrewDirectory({ includeInactive: true });
  const expiryTouched = useRef(false);

  const seed = () =>
    record ? recordToCaseFormValues(record) : emptyCaseFormValues({ issued_by_profile_id: profile?.id ?? '', ...defaults });

  const form = useForm<CaseFormValues>({ resolver: zodResolver(caseFormSchema), defaultValues: seed() });

  useEffect(() => {
    if (open) {
      form.reset(seed());
      expiryTouched.current = Boolean(record?.expiry_date);
    }
    // Re-seed only when the dialog opens or the target record changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  const subjectId = form.watch('profile_id');
  const stage = form.watch('stage');
  const severity = form.watch('severity');
  const incidentDate = form.watch('incident_date');
  const outcomeDate = form.watch('outcome_date');
  const expiry = form.watch('expiry_date');

  const { incidents } = useIncidentsForPicker(subjectId || null);
  const subject = useMemo(() => directory.all.find((e) => e.id === subjectId) ?? null, [directory.all, subjectId]);
  const subjectFilters = useMemo(() => ({ ...DEFAULT_DISCIPLINARY_FILTERS, crewId: subjectId || 'all' }), [subjectId]);
  const subjectRecords = useDisciplinaryRecords(subjectFilters, { enabled: open && !existingRecords && Boolean(subjectId) });
  const priorRecords = useMemo(
    () => (existingRecords ?? subjectRecords.all).filter((r) => r.id !== record?.id),
    [existingRecords, subjectRecords.all, record?.id],
  );

  // Default the vessel from the subject's assignment when nothing is chosen yet.
  useEffect(() => {
    if (!isEdit && subject?.vessel_id && !form.getValues('vessel_id')) form.setValue('vessel_id', subject.vessel_id);
  }, [isEdit, subject?.vessel_id, form]);

  // Suggest an expiry from the stage unless the user has set one by hand.
  useEffect(() => {
    if (expiryTouched.current) return;
    const suggested = defaultExpiryDate(stage, outcomeDate || incidentDate);
    form.setValue('expiry_date', suggested ?? '', { shouldValidate: false });
  }, [stage, outcomeDate, incidentDate, form]);

  const liveWarnings = useMemo(() => countLiveWarnings(priorRecords), [priorRecords]);
  const suggestedStage = useMemo(() => suggestNextStage(priorRecords, severity), [priorRecords, severity]);
  const suggestedExpiry = defaultExpiryDate(stage, outcomeDate || incidentDate);
  const stageMonths = DEFAULT_EXPIRY_MONTHS[stage];

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit case' : 'New disciplinary case'}</DialogTitle>
          <DialogDescription>
            Record the matter factually. Retention is 2 years for minor and 7 years for serious or gross misconduct, counted from the incident date.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-6">
            <Section title="Subject">
              <FormField
                control={form.control}
                name="profile_id"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Crew member</FormLabel>
                    <FormControl>
                      <CrewPicker value={field.value || null} onChange={(id) => field.onChange(id ?? '')} includeInactive disabled={lockSubject || isEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vessel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vessel</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="No vessel" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No vessel</SelectItem>
                        {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="incident_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked incident</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {incidents.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.incident_number} · {formatDate(i.incident_date)} · {humanise(i.incident_type)}
                            {i.linked ? ` (${humanise(i.involvement)})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Incidents this person is recorded on are listed first.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Matter">
              <FormField
                control={form.control}
                name="incident_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Incident date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {DISCIPLINARY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{humanise(c)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Severity</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {DISCIPLINARY_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {DISCIPLINARY_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormDescription className="flex flex-wrap items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {liveWarnings === 0 ? 'No live warnings.' : `${liveWarnings} live warning${liveWarnings === 1 ? '' : 's'}.`} Ladder suggests{' '}
                      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => field.onChange(suggestedStage)}>
                        {STAGE_LABEL[suggestedStage].toLowerCase()}
                      </button>
                      .
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea rows={4} placeholder="What happened, when, who was present, which rule or standard was breached…" {...field} /></FormControl>
                    <FormDescription>The crew member can read this once the case leaves the investigation stage.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Outcome">
              <FormField
                control={form.control}
                name="outcome"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Outcome</FormLabel>
                    <FormControl><Textarea rows={2} placeholder="Decision reached and any conditions…" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="outcome_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Outcome date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiry_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Live until (expiry)</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        onChange={(e) => {
                          expiryTouched.current = true;
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {stageMonths
                        ? `Typical: ${stageMonths} months${suggestedExpiry ? ` (${formatDate(suggestedExpiry)})` : ''}.`
                        : 'Only warnings lapse; leave blank for other stages.'}
                      {expiry && suggestedExpiry && expiry !== suggestedExpiry && (
                        <button
                          type="button"
                          className="ml-1 underline underline-offset-2 hover:text-foreground"
                          onClick={() => {
                            expiryTouched.current = false;
                            form.setValue('expiry_date', suggestedExpiry, { shouldValidate: true });
                          }}
                        >
                          Use typical
                        </button>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="issued_by_profile_id"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Issued by</FormLabel>
                    <FormControl>
                      <CrewPicker value={field.value || null} onChange={(id) => field.onChange(id ?? '')} includeInactive placeholder="Issuing officer" />
                    </FormControl>
                    <FormDescription>Defaults to you. Change it when recording a decision taken by the Master or a HOD.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Collapsible defaultOpen={Boolean(record?.investigation_notes || record?.witness_statements)}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex w-full items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm"
                >
                  <span className="inline-flex items-center gap-2 font-medium text-destructive">
                    <Lock className="h-4 w-4" /> Investigation file (restricted)
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">
                  Visible to HR editors only. Never shown to the crew member, and never written to the audit log.
                </p>
                <FormField
                  control={form.control}
                  name="investigation_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Investigation notes</FormLabel>
                      <FormControl><Textarea rows={4} placeholder="Interviews, evidence reviewed, findings…" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="witness_statements"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Witness statements</FormLabel>
                      <FormControl><Textarea rows={4} placeholder="Statements taken, by whom and when…" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Open case'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CaseFormDialog;
