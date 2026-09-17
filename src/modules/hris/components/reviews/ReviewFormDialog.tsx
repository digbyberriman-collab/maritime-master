import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';
import type { PerformanceReviewRow, ReviewCycleRow } from '@/modules/hris/hooks/usePerformanceReviews';
import { REVIEW_TYPES, REVIEW_TYPE_VALUES, type ReviewType } from '@/modules/hris/lib/reviews';

const NONE = '__none__';

export const reviewFormSchema = z
  .object({
    profile_id: z.string().min(1, 'Choose the crew member being reviewed'),
    reviewer_profile_id: z.string(),
    review_type: z.enum(REVIEW_TYPE_VALUES as [ReviewType, ...ReviewType[]]),
    cycle_id: z.string(),
    vessel_id: z.string(),
    period_start: z.string(),
    period_end: z.string(),
    due_date: z.string(),
  })
  .refine((v) => !v.period_start || !v.period_end || v.period_end >= v.period_start, {
    message: 'Period end must be on or after the start',
    path: ['period_end'],
  })
  .refine((v) => v.profile_id !== v.reviewer_profile_id, { message: 'The reviewer cannot review themselves', path: ['reviewer_profile_id'] });

export type ReviewFormValues = z.infer<typeof reviewFormSchema>;

export const emptyReviewForm = (defaults: Partial<ReviewFormValues> = {}): ReviewFormValues => ({
  profile_id: '',
  reviewer_profile_id: '',
  review_type: 'annual_evaluation',
  cycle_id: '',
  vessel_id: '',
  period_start: '',
  period_end: '',
  due_date: '',
  ...defaults,
});

export const reviewToFormValues = (review: PerformanceReviewRow): ReviewFormValues => ({
  profile_id: review.profile_id,
  reviewer_profile_id: review.reviewer_profile_id ?? '',
  review_type: (REVIEW_TYPE_VALUES.includes(review.review_type as ReviewType) ? review.review_type : 'annual_evaluation') as ReviewType,
  cycle_id: review.cycle_id ?? '',
  vessel_id: review.vessel_id ?? '',
  period_start: review.period_start ?? '',
  period_end: review.period_end ?? '',
  due_date: review.due_date ?? '',
});

interface ReviewFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, edits this review's metadata; otherwise creates one. */
  review?: PerformanceReviewRow | null;
  /** Prefill for new reviews (subject, vessel, type, reviewer). */
  defaults?: Partial<ReviewFormValues>;
  /** Lock the subject (crew mode). */
  lockSubject?: boolean;
  cycles: ReviewCycleRow[];
  vessels: CompanyVessel[];
  onSubmit: (values: ReviewFormValues) => Promise<void>;
  isPending?: boolean;
}

/** Create / edit a review's metadata. Ratings and narrative live in the detail view. */
export const ReviewFormDialog: React.FC<ReviewFormDialogProps> = ({ open, onOpenChange, review, defaults, lockSubject, cycles, vessels, onSubmit, isPending }) => {
  const isEdit = Boolean(review);
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: review ? reviewToFormValues(review) : emptyReviewForm(defaults),
  });

  useEffect(() => {
    if (open) form.reset(review ? reviewToFormValues(review) : emptyReviewForm(defaults));
    // Re-seed only when the dialog opens or the target review changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, review?.id]);

  const applyCycle = (cycleId: string) => {
    form.setValue('cycle_id', cycleId);
    const cycle = cycles.find((c) => c.id === cycleId);
    if (!cycle) return;
    form.setValue('review_type', (REVIEW_TYPE_VALUES.includes(cycle.review_type as ReviewType) ? cycle.review_type : 'annual_evaluation') as ReviewType);
    form.setValue('period_start', cycle.period_start);
    form.setValue('period_end', cycle.period_end);
    form.setValue('due_date', cycle.due_date);
    if (cycle.vessel_id && !form.getValues('vessel_id')) form.setValue('vessel_id', cycle.vessel_id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit review details' : 'New review'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Change who, when and what kind of review this is.' : 'The review is saved as a draft; ratings and comments are added from the review page.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="profile_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Crew member</FormLabel>
                <FormControl>
                  <CrewPicker value={field.value || null} onChange={(id, entry) => {
                    field.onChange(id ?? '');
                    if (entry?.vessel_id && !form.getValues('vessel_id')) form.setValue('vessel_id', entry.vessel_id);
                  }} disabled={lockSubject || isEdit} includeInactive />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="reviewer_profile_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Reviewer</FormLabel>
                <FormControl>
                  <CrewPicker value={field.value || null} onChange={(id) => field.onChange(id ?? '')} placeholder="Assign a reviewer" />
                </FormControl>
                <FormDescription>Usually the head of department or the captain. Required before the review can start.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="cycle_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cycle</FormLabel>
                  <Select value={field.value || NONE} onValueChange={(v) => (v === NONE ? field.onChange('') : applyCycle(v))}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>No cycle</SelectItem>
                      {cycles.filter((c) => c.status !== 'closed' || c.id === field.value).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Choosing a cycle fills in the type and dates.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="review_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Review type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{REVIEW_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="vessel_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vessel</FormLabel>
                  <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Unassigned</SelectItem>
                      {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="due_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="period_start" render={({ field }) => (
                <FormItem>
                  <FormLabel>Period start</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="period_end" render={({ field }) => (
                <FormItem>
                  <FormLabel>Period end</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Create draft'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewFormDialog;
