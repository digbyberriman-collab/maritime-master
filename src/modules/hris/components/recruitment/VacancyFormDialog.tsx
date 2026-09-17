import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RANKS } from '@/modules/crew/constants';
import { LEAVE_DEPARTMENTS } from '@/modules/crew/leaveConstants';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { CONTRACT_TYPES, CURRENCY_PRESETS } from '@/modules/hris/lib/contractHelpers';
import { formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  VACANCY_PRIORITIES,
  buildReference,
  emptyVacancyFormValues,
  vacancyFormSchema,
  vacancyToFormValues,
  type VacancyFormValues,
  type VacancyRow,
} from '@/modules/hris/lib/recruitment';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';
import type { PayGradeOption } from '@/modules/hris/hooks/useRecruitment';

const NONE = '__none__';
const DEPARTMENTS = LEAVE_DEPARTMENTS.filter((d) => d !== 'All');

interface VacancyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this vacancy; otherwise it creates one. */
  vacancy?: VacancyRow | null;
  vessels: CompanyVessel[];
  payGrades: PayGradeOption[];
  /** Used to suggest a reference for new vacancies. */
  nextSequence: number;
  onSubmit: (values: VacancyFormValues) => Promise<void>;
  isPending?: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </div>
);

/** Create / edit a vacancy. Money is entered in major units and converted at submit time. */
export const VacancyFormDialog: React.FC<VacancyFormDialogProps> = ({
  open,
  onOpenChange,
  vacancy,
  vessels,
  payGrades,
  nextSequence,
  onSubmit,
  isPending,
}) => {
  const isEdit = Boolean(vacancy);
  const form = useForm<VacancyFormValues>({
    resolver: zodResolver(vacancyFormSchema),
    defaultValues: vacancy ? vacancyToFormValues(vacancy) : emptyVacancyFormValues(),
  });

  useEffect(() => {
    if (open) form.reset(vacancy ? vacancyToFormValues(vacancy) : emptyVacancyFormValues());
    // Re-seed only when the dialog opens or the target vacancy changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vacancy?.id]);

  const vesselId = form.watch('vessel_id');
  const payGradeId = form.watch('pay_grade_id');
  const selectedGrade = payGrades.find((g) => g.id === payGradeId) ?? null;

  const suggestReference = () => {
    const vessel = vessels.find((v) => v.id === vesselId) ?? null;
    form.setValue('reference', buildReference(vessel, nextSequence), { shouldDirty: true });
  };

  const applyPayGrade = (id: string) => {
    form.setValue('pay_grade_id', id === NONE ? '' : id, { shouldDirty: true });
    const grade = payGrades.find((g) => g.id === id);
    if (grade) {
      if (!form.getValues('salary_currency')) form.setValue('salary_currency', grade.currency);
      if (!form.getValues('rank') && grade.rank) form.setValue('rank', grade.rank);
      if (!form.getValues('department') && grade.department) form.setValue('department', grade.department);
    }
  };

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vacancy' : 'New vacancy'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the position details. Status changes are made from the vacancy header.' : 'Describe the position. Save as a draft or open it straight away.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-6">
            <Section title="Position">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Title</FormLabel>
                    <FormControl><Input placeholder="e.g. Second Engineer" {...field} /></FormControl>
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
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Shore / not vessel-specific</SelectItem>
                        {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference</FormLabel>
                    <div className="flex gap-2">
                      <FormControl><Input placeholder="DRA-0001" {...field} /></FormControl>
                      <Button type="button" variant="outline" size="icon" onClick={suggestReference} title="Suggest a reference">
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rank"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rank</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent className="max-h-72">
                        <SelectItem value={NONE}>Not specified</SelectItem>
                        {RANKS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
                    <FormLabel>Department</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not specified</SelectItem>
                        {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {VACANCY_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{humanise(p)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="headcount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Headcount</FormLabel>
                    <FormControl><Input type="number" min={1} max={50} {...field} /></FormControl>
                    <FormDescription>Positions to fill; the vacancy fills automatically when reached.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Terms">
              <FormField
                control={form.control}
                name="contract_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contract type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {CONTRACT_TYPES.map((t) => <SelectItem key={t} value={t}>{humanise(t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rotation_pattern"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rotation</FormLabel>
                    <FormControl><Input placeholder="e.g. 10:10, 2:1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target start</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormDescription>For fixed-term or seasonal positions.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pay_grade_id"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Pay grade</FormLabel>
                    <Select value={field.value || NONE} onValueChange={applyPayGrade}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent className="max-h-72">
                        <SelectItem value={NONE}>No pay grade</SelectItem>
                        {payGrades.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.code} · {g.name} · {formatMinor(g.monthly_base_minor, g.currency)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedGrade && (
                      <FormDescription>
                        Base {formatMinor(selectedGrade.monthly_base_minor, selectedGrade.currency)}/month. The salary range below is what candidates are told.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salary_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary currency</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not disclosed</SelectItem>
                        {CURRENCY_PRESETS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="salary_min"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min / month</FormLabel>
                      <FormControl><Input inputMode="decimal" placeholder="4500" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="salary_max"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max / month</FormLabel>
                      <FormControl><Input inputMode="decimal" placeholder="5200" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Section>

            <Section title="People">
              <FormField
                control={form.control}
                name="hiring_manager_profile_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hiring manager</FormLabel>
                    <CrewPicker value={field.value || null} onChange={(id) => field.onChange(id ?? '')} placeholder="Who owns this hire?" />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="replaces_profile_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Replaces</FormLabel>
                    <CrewPicker value={field.value || null} onChange={(id) => field.onChange(id ?? '')} includeInactive placeholder="Crew member leaving (optional)" />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Requirements">
              <FormField
                control={form.control}
                name="required_certificates"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Required certificates</FormLabel>
                    <FormControl><Textarea rows={2} placeholder="STCW Basic Training, ENG1, Yachtmaster Offshore" {...field} /></FormControl>
                    <FormDescription>Comma-separated. Used to score candidate matches.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requirements"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Experience & requirements</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="Years of experience, vessel size, languages…" {...field} /></FormControl>
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
                    <FormControl><Textarea rows={4} placeholder="Role summary shared with agencies and candidates" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Internal notes</FormLabel>
                    <FormControl><Textarea rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            {!isEdit && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Save as</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger className="sm:w-60"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft (not yet recruiting)</SelectItem>
                        <SelectItem value="open">Open (accepting candidates)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Create vacancy'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default VacancyFormDialog;
