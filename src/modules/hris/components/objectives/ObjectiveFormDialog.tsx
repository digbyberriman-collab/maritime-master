import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useDevelopmentApplications, useDevelopmentCourses } from '@/modules/hris/hooks/useObjectives';
import {
  CATEGORY_LABEL,
  OBJECTIVE_CATEGORIES,
  emptyObjectiveFormValues,
  objectiveFormSchema,
  objectiveToFormValues,
  type CrewObjectiveRow,
  type ObjectiveFormValues,
} from '@/modules/hris/lib/objectives';

const NONE = '__none__';

interface ObjectiveFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this objective; otherwise it creates one. */
  objective?: CrewObjectiveRow | null;
  /** Prefill for new objectives (e.g. `review_id` from `?review=`). */
  defaults?: Partial<ObjectiveFormValues>;
  crewName?: string;
  /** profiles.user_id of the subject, for the development-application picker. */
  crewUserId?: string | null;
  /** Whether the owner (mentor / HOD) can be chosen; self-service users cannot reassign. */
  canPickOwner?: boolean;
  onSubmit: (values: ObjectiveFormValues) => Promise<void>;
  isPending?: boolean;
}

/** Create / edit an objective. Progress and status are managed from the detail sheet, not here. */
export const ObjectiveFormDialog: React.FC<ObjectiveFormDialogProps> = ({
  open,
  onOpenChange,
  objective,
  defaults,
  crewName,
  crewUserId,
  canPickOwner = true,
  onSubmit,
  isPending,
}) => {
  const isEdit = Boolean(objective);
  const { courses } = useDevelopmentCourses();
  const { applications } = useDevelopmentApplications(crewUserId ?? null);

  const form = useForm<ObjectiveFormValues>({
    resolver: zodResolver(objectiveFormSchema),
    defaultValues: objective ? objectiveToFormValues(objective) : emptyObjectiveFormValues(defaults),
  });

  useEffect(() => {
    if (open) form.reset(objective ? objectiveToFormValues(objective) : emptyObjectiveFormValues(defaults));
    // Re-seed only when the dialog opens or the target objective changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, objective?.id]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const linkedReview = form.watch('review_id');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit objective' : 'New objective'}</DialogTitle>
          <DialogDescription>
            {crewName ? `Objective for ${crewName}. ` : ''}
            Weight sets how much this objective counts towards the PDP completion score.
            {linkedReview && !isEdit ? ' This objective will be linked to the review it was opened from.' : ''}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-5">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input placeholder="e.g. Complete Advanced Fire Fighting refresher" autoFocus {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {OBJECTIVE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight (1–10)</FormLabel>
                    <FormControl><Input type="number" min={1} max={10} step={1} inputMode="numeric" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="measure"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>How it will be measured</FormLabel>
                  <FormControl><Textarea rows={2} placeholder="Certificate issued; sign-off by Chief Officer; zero near-misses in Q4…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea rows={3} placeholder="Context, why it matters, what support is agreed…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="owner_profile_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Owner (mentor / HOD)</FormLabel>
                  <FormControl>
                    <CrewPicker value={field.value || null} onChange={(id) => field.onChange(id ?? '')} placeholder="Nobody assigned" disabled={!canPickOwner} />
                  </FormControl>
                  <FormDescription>The owner can read and update this objective alongside the crew member.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="linked_course_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked course</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="linked_application_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked training application</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)} disabled={!crewUserId}>
                      <FormControl><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {applications.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.application_number} · {a.course_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!crewUserId && <FormDescription>Available once the crew member has a login.</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Create objective'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ObjectiveFormDialog;
