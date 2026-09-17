import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { NATIONALITIES, RANKS } from '@/modules/crew/constants';
import { LEAVE_DEPARTMENTS } from '@/modules/crew/leaveConstants';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { CURRENCY_PRESETS } from '@/modules/hris/lib/contractHelpers';
import { humanise } from '@/modules/hris/lib/format';
import {
  CANDIDATE_SOURCES,
  candidateFormSchema,
  candidateToFormValues,
  emptyCandidateFormValues,
  type CandidateFormValues,
  type CandidateRow,
} from '@/modules/hris/lib/recruitment';

const NONE = '__none__';
const DEPARTMENTS = LEAVE_DEPARTMENTS.filter((d) => d !== 'All');

interface CandidateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this candidate; otherwise it creates one. */
  candidate?: CandidateRow | null;
  /** Prefill for new candidates (e.g. the vacancy's rank and department). */
  defaults?: Partial<CandidateFormValues>;
  /** Shown in the description when the new candidate will be applied to a vacancy. */
  applyingTo?: string | null;
  onSubmit: (values: CandidateFormValues) => Promise<void>;
  isPending?: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </div>
);

const OptionalSelect: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; options: readonly string[] }> = ({ value, onChange, placeholder, options }) => (
  <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
    <SelectContent className="max-h-72">
      <SelectItem value={NONE}>{placeholder}</SelectItem>
      {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
    </SelectContent>
  </Select>
);

/** Create / edit a candidate record. */
export const CandidateFormDialog: React.FC<CandidateFormDialogProps> = ({ open, onOpenChange, candidate, defaults, applyingTo, onSubmit, isPending }) => {
  const isEdit = Boolean(candidate);
  const form = useForm<CandidateFormValues>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues: candidate ? candidateToFormValues(candidate) : emptyCandidateFormValues(defaults),
  });

  useEffect(() => {
    if (open) form.reset(candidate ? candidateToFormValues(candidate) : emptyCandidateFormValues(defaults));
    // Re-seed only when the dialog opens or the target candidate changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidate?.id]);

  const source = form.watch('source');
  const consent = form.watch('gdpr_consent');

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit candidate' : 'New candidate'}</DialogTitle>
          <DialogDescription>
            {applyingTo ? `They will be added to the pipeline for ${applyingTo}. ` : ''}
            Candidates are kept separate from crew until they are hired.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-6">
            <Section title="Identity">
              <FormField control={form.control} name="first_name" render={({ field }) => (
                <FormItem><FormLabel>First name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="last_name" render={({ field }) => (
                <FormItem><FormLabel>Last name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="preferred_name" render={({ field }) => (
                <FormItem><FormLabel>Preferred name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="date_of_birth" render={({ field }) => (
                <FormItem><FormLabel>Date of birth</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="nationality" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nationality</FormLabel>
                  <OptionalSelect value={field.value ?? ''} onChange={field.onChange} placeholder="Not specified" options={NATIONALITIES} />
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="current_location" render={({ field }) => (
                <FormItem><FormLabel>Current location</FormLabel><FormControl><Input placeholder="City, country" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </Section>

            <Section title="Contact">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="home_airport" render={({ field }) => (
                <FormItem><FormLabel>Home airport</FormLabel><FormControl><Input placeholder="e.g. NCE" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="linkedin_url" render={({ field }) => (
                <FormItem><FormLabel>LinkedIn</FormLabel><FormControl><Input placeholder="https://linkedin.com/in/…" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </Section>

            <Section title="Profile">
              <FormField control={form.control} name="rank" render={({ field }) => (
                <FormItem>
                  <FormLabel>Rank</FormLabel>
                  <OptionalSelect value={field.value ?? ''} onChange={field.onChange} placeholder="Not specified" options={RANKS} />
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="department" render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <OptionalSelect value={field.value ?? ''} onChange={field.onChange} placeholder="Not specified" options={DEPARTMENTS} />
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="years_experience" render={({ field }) => (
                <FormItem><FormLabel>Years of experience</FormLabel><FormControl><Input inputMode="decimal" placeholder="e.g. 6.5" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="available_from" render={({ field }) => (
                <FormItem><FormLabel>Available from</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="certificates" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Certificates</FormLabel>
                  <FormControl><Textarea rows={2} placeholder="STCW Basic Training, ENG1, Yachtmaster Offshore" {...field} /></FormControl>
                  <FormDescription>Comma-separated. Matched against vacancy requirements.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="languages" render={({ field }) => (
                <FormItem className="sm:col-span-2"><FormLabel>Languages</FormLabel><FormControl><Input placeholder="English, French" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="salary_expectation_currency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Salary expectation currency</FormLabel>
                  <OptionalSelect value={field.value ?? ''} onChange={field.onChange} placeholder="Not given" options={CURRENCY_PRESETS} />
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="salary_expectation" render={({ field }) => (
                <FormItem><FormLabel>Expected monthly base</FormLabel><FormControl><Input inputMode="decimal" placeholder="5000" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="rating" render={({ field }) => (
                <FormItem>
                  <FormLabel>Overall rating</FormLabel>
                  <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Not rated</SelectItem>
                      {['1', '2', '3', '4', '5'].map((n) => <SelectItem key={n} value={n}>{n} / 5</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </Section>

            <Section title="Source">
              <FormField control={form.control} name="source" render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {CANDIDATE_SOURCES.map((s) => <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              {source === 'agency' && (
                <FormField control={form.control} name="agency_name" render={({ field }) => (
                  <FormItem><FormLabel>Agency</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              )}
              {source === 'referral' && (
                <FormField control={form.control} name="referred_by_profile_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referred by</FormLabel>
                    <CrewPicker value={field.value || null} onChange={(id) => field.onChange(id ?? '')} placeholder="Crew member who referred them" />
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </Section>

            <Section title="Data protection">
              <FormField control={form.control} name="gdpr_consent" render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-3 sm:col-span-2">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} /></FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Candidate has consented to their data being kept for recruitment</FormLabel>
                    <FormDescription>
                      {candidate?.gdpr_consent_at && consent ? 'Consent recorded; the original timestamp is kept.' : 'Timestamped when saved.'}
                    </FormDescription>
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="gdpr_retention_until" render={({ field }) => (
                <FormItem>
                  <FormLabel>Retain until</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormDescription>When the record should be reviewed for deletion.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </Section>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={3} placeholder="First impressions, references, preferences…" {...field} /></FormControl><FormMessage /></FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : applyingTo ? 'Create & add to pipeline' : 'Create candidate'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CandidateFormDialog;
