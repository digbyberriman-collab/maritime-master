/**
 * "Correct details" (gap/02 TR5, W3 "Edits by approvers"; X5-07B): an
 * approver fixes the course, dates, category or estimates of an open
 * application without sending it back. React Hook Form on
 * correctionSchema.ts; only the changed fields go to
 * `development_transition('edit_fields')`, which writes the diff to the
 * history and tells the applicant. The dialog stays open on a refusal (the
 * transition hook says why).
 */
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DevCategory } from '../../constants';
import { DEV_CATEGORIES } from '../../lib/settingsSchema';
import { correctionDefaults, correctionPayload, correctionSchema, type CorrectableApplication, type CorrectionValues } from './correctionSchema';
import { COARSE } from './TrainingParts';

export interface CorrectDetailsDialogProps {
  open: boolean;
  application: CorrectableApplication;
  categoryLabels: Readonly<Record<DevCategory, string>>;
  pending: boolean;
  /** Sends edit_fields; resolves when the server confirmed it. */
  onSubmit: (payload: { fields: Record<string, unknown>; comment?: string }) => Promise<void>;
  onClose: () => void;
}

type TextKey = 'course_name' | 'course_provider' | 'course_location';
type DateKey = 'course_start_date' | 'course_end_date';
type MoneyKey = 'estimated_tuition_usd' | 'estimated_travel_usd' | 'estimated_accommodation_usd';

const TEXT_FIELDS: ReadonlyArray<[TextKey, string, number]> = [
  ['course_name', 'Course', 200],
  ['course_provider', 'Provider', 200],
  ['course_location', 'Location', 200],
];
const DATE_FIELDS: ReadonlyArray<[DateKey, string]> = [
  ['course_start_date', 'Starts'],
  ['course_end_date', 'Ends'],
];
const MONEY_FIELDS: ReadonlyArray<[MoneyKey, string]> = [
  ['estimated_tuition_usd', 'Tuition (USD)'],
  ['estimated_travel_usd', 'Travel (USD)'],
  ['estimated_accommodation_usd', 'Accommodation (USD)'],
];

export function CorrectDetailsDialog({ open, application, categoryLabels, pending, onSubmit, onClose }: CorrectDetailsDialogProps) {
  const form = useForm<CorrectionValues>({ resolver: zodResolver(correctionSchema), defaultValues: correctionDefaults(application) });
  const { reset, setError } = form;
  useEffect(() => {
    if (open) reset(correctionDefaults(application));
  }, [open, application, reset]);

  const submit = form.handleSubmit(async (values) => {
    const payload = correctionPayload(values, application);
    if (!payload) {
      setError('course_name', { type: 'manual', message: 'Change at least one detail before saving.' });
      return;
    }
    try {
      await onSubmit(payload);
      onClose();
    } catch {
      // The transition hook has said why; the dialog stays open.
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" aria-describedby="correct-details-description">
        <DialogHeader>
          <DialogTitle>Correct details</DialogTitle>
          <DialogDescription id="correct-details-description">
            Fix what the application got wrong without sending it back. Each change is kept in its history and the applicant is told.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} noValidate className="space-y-4" aria-label="Correct details">
            <fieldset disabled={pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <legend className="sr-only">Details</legend>
              {TEXT_FIELDS.map(([name, label, max]) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem className={cn(name === 'course_name' && 'sm:col-span-2')}>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} maxLength={max} className={COARSE} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={COARSE}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DEV_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {categoryLabels[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {DATE_FIELDS.map(([name, label]) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={(field.value as string | null | undefined) ?? ''} className={COARSE} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              {MONEY_FIELDS.map(([name, label]) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input {...field} value={(field.value as string | number | null | undefined) ?? ''} inputMode="decimal" className={cn('tabular-nums', COARSE)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Note for the applicant (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ''} rows={2} maxLength={2000} />
                    </FormControl>
                    <FormDescription>Kept with the change in the history.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={COARSE} onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" className={COARSE} disabled={pending}>
                {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : null}
                Save corrections
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
