import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  CURRENCY_PRESETS,
  OTHER_CURRENCY,
  PAY_FREQUENCIES,
  compensationFormSchema,
  compensationToFormValues,
  emptyCompensationFormValues,
  gradeDefaults,
  resolveCurrency,
  type CompensationFormValues,
  type CrewCompensationRow,
  type PayGradeRow,
} from '@/modules/hris/lib/compensation';
import { AllowancesEditor } from './AllowancesEditor';

const NO_GRADE = '__none__';

interface CompensationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this package; otherwise it creates one. */
  row?: CrewCompensationRow | null;
  /** Prefill for new packages. */
  defaults?: Partial<CompensationFormValues>;
  grades: PayGradeRow[];
  crewName?: string;
  onSubmit: (values: CompensationFormValues) => Promise<void>;
  isPending?: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </div>
);

/**
 * Create / edit a compensation package. Money is entered in major units and
 * converted to minor units at submit time.
 */
export const CompensationFormDialog: React.FC<CompensationFormDialogProps> = ({
  open,
  onOpenChange,
  row,
  defaults,
  grades,
  crewName,
  onSubmit,
  isPending,
}) => {
  const isEdit = Boolean(row);
  const statusEditable = !row || row.status !== 'superseded';

  const form = useForm<CompensationFormValues>({
    resolver: zodResolver(compensationFormSchema),
    defaultValues: row ? compensationToFormValues(row) : emptyCompensationFormValues(defaults),
  });

  useEffect(() => {
    if (open) form.reset(row ? compensationToFormValues(row) : emptyCompensationFormValues(defaults));
    // Re-seed only when the dialog opens or the target row changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  const currencySelect = form.watch('currency');
  const currencyOther = form.watch('currency_other');
  const gradeId = form.watch('pay_grade_id');
  const frequency = form.watch('pay_frequency');
  const currency = resolveCurrency(currencySelect, currencyOther) ?? 'EUR';

  const gradeOptions = useMemo(() => {
    // Keep an inactive grade selectable when it is the one already on the row.
    const visible = grades.filter((g) => g.is_active || g.id === row?.pay_grade_id);
    return visible;
  }, [grades, row?.pay_grade_id]);
  const selectedGrade = useMemo(() => grades.find((g) => g.id === gradeId) ?? null, [grades, gradeId]);

  const applyGrade = () => {
    if (!selectedGrade) return;
    const patch = gradeDefaults(selectedGrade, frequency);
    (Object.keys(patch) as (keyof CompensationFormValues)[]).forEach((key) => {
      const value = patch[key];
      if (value !== undefined) form.setValue(key, value, { shouldDirty: true, shouldValidate: true });
    });
  };

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit compensation' : 'New compensation'}</DialogTitle>
          <DialogDescription>
            {crewName ? `Compensation package for ${crewName}. ` : ''}
            Activating a package supersedes any other active package for this crew member.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-6">
            <Section title="Pay grade">
              <FormField
                control={form.control}
                name="pay_grade_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pay grade</FormLabel>
                    <Select value={field.value || NO_GRADE} onValueChange={(v) => field.onChange(v === NO_GRADE ? '' : v)}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="No pay grade" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_GRADE}>No pay grade</SelectItem>
                        {gradeOptions.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.code} · {g.name}{g.is_active ? '' : ' (inactive)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col justify-end gap-1">
                <Button type="button" variant="outline" onClick={applyGrade} disabled={!selectedGrade || isPending}>
                  <Wand2 className="mr-2 h-4 w-4" /> Apply grade defaults
                </Button>
                <p className="text-xs text-muted-foreground">
                  {selectedGrade
                    ? `${formatMinor(selectedGrade.monthly_base_minor, selectedGrade.currency)} / month` +
                      (selectedGrade.daily_rate_minor !== null ? ` · ${formatMinor(selectedGrade.daily_rate_minor, selectedGrade.currency)} / day` : '') +
                      ` · ${selectedGrade.gratuity_points} pts`
                    : 'Fills base, currency and gratuity points from the grade.'}
                </p>
              </div>
            </Section>

            <Section title="Base pay">
              <FormField
                control={form.control}
                name="base_salary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base salary</FormLabel>
                    <FormControl><Input inputMode="decimal" placeholder="0.00" {...field} /></FormControl>
                    <FormDescription>Entered in major units; stored as minor units.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pay_frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAY_FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>{humanise(f)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select value={field.value || 'EUR'} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCY_PRESETS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                        <SelectItem value={OTHER_CURRENCY}>Other…</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {currencySelect === OTHER_CURRENCY && (
                <FormField
                  control={form.control}
                  name="currency_other"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency code</FormLabel>
                      <FormControl><Input placeholder="ISO 4217, e.g. NOK" maxLength={3} className="uppercase" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </Section>

            <AllowancesEditor control={form.control} currency={currency} disabled={isPending} />

            <Section title="Gratuities">
              <FormField
                control={form.control}
                name="gratuity_eligible"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Eligible for gratuities</FormLabel>
                      <FormDescription>Included when a gratuity pool is split.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gratuity_points"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gratuity points</FormLabel>
                    <FormControl><Input inputMode="decimal" placeholder="Grade default" {...field} /></FormControl>
                    <FormDescription>Blank uses the pay grade or company default.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Validity">
              <FormField
                control={form.control}
                name="effective_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective from</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="effective_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective to</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormDescription>Leave blank for open-ended.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {statusEditable && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for change</FormLabel>
                    <FormControl><Input placeholder="Promotion, annual review, new hire…" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Create compensation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CompensationFormDialog;
