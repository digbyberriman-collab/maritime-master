import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { formatMinor, humanise, toMinor } from '@/modules/hris/lib/format';
import {
  GRATUITY_SOURCES,
  SPLIT_METHODS,
  SPLIT_METHOD_LABEL,
  emptyPoolFormValues,
  poolFormSchema,
  poolToFormValues,
  type GratuityPoolRow,
  type PoolFormDefaults,
  type PoolFormValues,
} from '@/modules/hris/lib/gratuities';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'AUD', 'CHF', 'AED'];

interface PoolFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this pool; otherwise it creates one. */
  pool?: GratuityPoolRow | null;
  defaults?: PoolFormDefaults;
  vessels: CompanyVessel[];
  onSubmit: (values: PoolFormValues) => Promise<void>;
  isPending?: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </div>
);

/** Create / edit a gratuity pool. Money is entered in major units and converted at submit time. */
export const PoolFormDialog: React.FC<PoolFormDialogProps> = ({ open, onOpenChange, pool, defaults, vessels, onSubmit, isPending }) => {
  const isEdit = Boolean(pool);
  const form = useForm<PoolFormValues>({
    resolver: zodResolver(poolFormSchema),
    defaultValues: pool ? poolToFormValues(pool) : emptyPoolFormValues(defaults),
  });

  useEffect(() => {
    if (open) form.reset(pool ? poolToFormValues(pool) : emptyPoolFormValues(defaults));
    // Re-seed only when the dialog opens or the target pool changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pool?.id]);

  const currency = form.watch('currency');
  const gross = form.watch('gross_amount');
  const deductions = form.watch('deductions');
  const net = useMemo(() => {
    const g = toMinor(gross);
    if (g === null) return null;
    return Math.max(0, g - (toMinor(deductions) ?? 0));
  }, [gross, deductions]);

  const currencyOptions = useMemo(() => (currency && !CURRENCIES.includes(currency) ? [...CURRENCIES, currency] : CURRENCIES), [currency]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit pool' : 'New gratuity pool'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Changing amounts, dates or the split method requires a recalculation before approval.'
              : 'Record a gratuity received for a vessel. Crew onboard during the period share the net amount.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-6">
            <Section title="Pool">
              <FormField
                control={form.control}
                name="vessel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vessel</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a vessel" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vessels.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Charter tip, week 32" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GRATUITY_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {humanise(s)}
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
                name="received_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Received on</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="period_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period start</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="period_end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period end</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Crew onboard between these dates are eligible.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Amount">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencyOptions.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
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
                name="gross_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gross amount</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deductions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deductions</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormDescription>{net === null ? 'Net to distribute: —' : `Net to distribute: ${formatMinor(net, currency)}`}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deductions_note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deductions note</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Agent commission, cash handling" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Split">
              <FormField
                control={form.control}
                name="split_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Split method</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SPLIT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {SPLIT_METHOD_LABEL[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>You can compare methods on the pool page before approving.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Optional context for the approver" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Create pool'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PoolFormDialog;
