/**
 * Add or edit a catalogue course with its rules (gap/02 TR7; X5-07B;
 * D-X5-05). React Hook Form on the course schema (lib/courseSchema.ts, the
 * mirror of `development_course_save`); the save goes through the definer
 * and nothing says "saved" until the returned row is this company's
 * course. A refusal is shown in words inside the dialog, which stays open.
 *
 * "Grants qualification" is the qualification's name as text
 * (`qualification_label`) until the crew module's public API offers a
 * document-type picker (platform-prep plan contract 3); a course that
 * already names a document type keeps it (the key is not sent).
 */
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DEPARTMENTS, FORMAT_LABELS, type DevCategory } from '../../constants';
import { DEV_FORMATS, courseSchema, type CourseValues } from '../../lib/courseSchema';
import { courseFormDefaults } from './courseForm';
import { DEV_CATEGORIES } from '../../lib/settingsSchema';
import { COARSE } from './TrainingParts';
import { useSaveCourse, type CatalogueCourse } from './useFleetTrainingData';

export interface CourseEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** The course to edit; null adds a new one. */
  course: CatalogueCourse | null;
  categoryLabels: Readonly<Record<DevCategory, string>>;
}

const NO_FORMAT = '__none__';
const COURSE_DEPARTMENTS = DEPARTMENTS.filter((d) => d !== 'All');

function PositionsField({ value, onChange, id }: { value: readonly string[]; onChange: (next: string[]) => void; id: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const name = draft.trim();
    if (!name || value.some((v) => v.toLowerCase() === name.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, name]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          maxLength={80}
          placeholder="Type a position, then Add"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className={COARSE}
        />
        <Button type="button" variant="outline" size="sm" className={cn('h-10', COARSE)} onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Positions">
          {value.map((name) => (
            <li key={name} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-3 pr-1 text-xs">
              {name}
              <button
                type="button"
                className={cn('focus-ring inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground', '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11')}
                aria-label={`Remove ${name}`}
                onClick={() => onChange(value.filter((v) => v !== name))}
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-caption text-muted-foreground">Every position, unless you name some.</p>
      )}
    </div>
  );
}

export function CourseEditorDialog({ open, onOpenChange, companyId, course, categoryLabels }: CourseEditorDialogProps) {
  const form = useForm<CourseValues>({ resolver: zodResolver(courseSchema), defaultValues: courseFormDefaults(course) });
  const save = useSaveCourse(companyId);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { reset } = form;

  useEffect(() => {
    if (open) {
      reset(courseFormDefaults(course));
      setRefusal(null);
    }
  }, [open, course, reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    setRefusal(null);
    try {
      await save.mutateAsync({ values, existing: course ? { id: course.id, updated_at: course.updated_at } : null });
      onOpenChange(false);
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : 'The course was not saved. Try again.');
    }
  });

  const busy = save.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" aria-describedby="course-editor-description">
        <DialogHeader>
          <DialogTitle>{course ? 'Edit course' : 'New course'}</DialogTitle>
          <DialogDescription id="course-editor-description">
            The course crew can apply for, and the rules a completion follows: how long the qualification is valid and when renewal opens.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label={course ? `Edit ${course.name}` : 'New course'}>
            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2" disabled={busy}>
              <legend className="sr-only">The course</legend>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={(field.value as string | undefined) ?? ''} maxLength={200} className={COARSE} />
                    </FormControl>
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
                    <Select value={(field.value as string | undefined) ?? ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={COARSE}>
                          <SelectValue placeholder="Choose a category" />
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
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department group</FormLabel>
                    <Select value={(field.value as string | undefined) ?? ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={COARSE}>
                          <SelectValue placeholder="Choose the department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DEPARTMENTS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d === 'All' ? 'All departments' : d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Format</FormLabel>
                    <Select value={(field.value as string | null | undefined) ?? NO_FORMAT} onValueChange={(v) => field.onChange(v === NO_FORMAT ? null : v)}>
                      <FormControl>
                        <SelectTrigger className={COARSE}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_FORMAT}>Not given</SelectItem>
                        {DEV_FORMATS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {FORMAT_LABELS[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="duration_description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration</FormLabel>
                    <FormControl>
                      <Input {...field} value={(field.value as string | null | undefined) ?? ''} maxLength={200} placeholder="For example 5 days" className={COARSE} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pathway"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pathway</FormLabel>
                    <FormControl>
                      <Input {...field} value={(field.value as string | null | undefined) ?? ''} maxLength={120} placeholder="For example Officer of the watch" className={COARSE} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sub_section"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-section</FormLabel>
                    <FormControl>
                      <Input {...field} value={(field.value as string | null | undefined) ?? ''} maxLength={120} className={COARSE} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 sm:grid-cols-2" disabled={busy}>
              <legend className="px-1 text-sm font-semibold">Rules</legend>
              <FormField
                control={form.control}
                name="valid_for_months"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid for (months)</FormLabel>
                    <FormControl>
                      <Input {...field} value={(field.value as string | number | null | undefined) ?? ''} inputMode="numeric" className={cn('tabular-nums', COARSE)} />
                    </FormControl>
                    <FormDescription>Blank: the qualification never expires.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="renew_from_months"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Renewal opens (months before expiry)</FormLabel>
                    <FormControl>
                      <Input {...field} value={(field.value as string | number | null | undefined) ?? ''} inputMode="numeric" className={cn('tabular-nums', COARSE)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_mandatory"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3 sm:col-span-2">
                    <div>
                      <FormLabel>Mandatory</FormLabel>
                      <FormDescription>For the departments and positions it applies to.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="applies_to_departments"
                render={({ field }) => {
                  const selected = (field.value as string[] | undefined) ?? [];
                  return (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Applies to departments</FormLabel>
                      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="group" aria-label="Applies to departments">
                        {COURSE_DEPARTMENTS.map((d) => {
                          const id = `course-dept-${d}`;
                          return (
                            <label key={d} htmlFor={id} className={cn('flex cursor-pointer items-center gap-2 text-sm', COARSE)}>
                              <Checkbox
                                id={id}
                                checked={selected.includes(d)}
                                onCheckedChange={(on) => field.onChange(on ? [...selected, d] : selected.filter((x) => x !== d))}
                              />
                              {d}
                            </label>
                          );
                        })}
                      </div>
                      <FormDescription>None ticked: every department.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="applies_to_positions"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel htmlFor="course-positions">Applies to positions</FormLabel>
                    <PositionsField id="course-positions" value={(field.value as string[] | undefined) ?? []} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="qualification_label"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Grants qualification</FormLabel>
                    <FormControl>
                      <Input {...field} value={(field.value as string | null | undefined) ?? ''} maxLength={200} placeholder="The certificate a completion records" className={COARSE} />
                    </FormControl>
                    <FormDescription>
                      A completion records this qualification on the crew member, valid for the months above.
                      {course?.rules?.qualification_document_type_id ? ' This course also names a crew document type, which is kept.' : ''}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="renewal_note"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Renewal note</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={(field.value as string | null | undefined) ?? ''} rows={2} maxLength={2000} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={(field.value as string | null | undefined) ?? ''} rows={3} maxLength={4000} disabled={busy} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {refusal ? (
              <p role="alert" className="text-sm text-destructive">
                {refusal}
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" className={COARSE} disabled={busy}>
                {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : null}
                {course ? 'Save course' : 'Add course'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
