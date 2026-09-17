import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RANKS } from '@/modules/crew/constants';
import { LEAVE_DEPARTMENTS } from '@/modules/crew/leaveConstants';
import {
  CURRENCY_PRESETS,
  OTHER_CURRENCY,
  emptyPayGradeFormValues,
  payGradeFormSchema,
  payGradeToFormValues,
  type PayGradeFormValues,
  type PayGradeRow,
} from '@/modules/hris/lib/compensation';

const CUSTOM = '__custom__';
const NONE = '__none__';
const DEPARTMENTS = LEAVE_DEPARTMENTS.filter((d) => d !== 'All');

interface PayGradeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grade?: PayGradeRow | null;
  onSubmit: (values: PayGradeFormValues) => Promise<void>;
  isPending?: boolean;
}

/**
 * A select with the known options plus "Custom…" that reveals a free-text
 * input, so departments and ranks outside the standard lists still work.
 */
const PresetOrCustom: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
}> = ({ value, onChange, options, placeholder }) => {
  const isPreset = value === '' || options.includes(value);
  const [custom, setCustom] = React.useState(!isPreset);
  useEffect(() => setCustom(!isPreset), [isPreset, value]);
  return (
    <div className="space-y-2">
      <Select
        value={custom ? CUSTOM : value || NONE}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true);
            onChange('');
          } else {
            setCustom(false);
            onChange(v === NONE ? '' : v);
          }
        }}
      >
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{placeholder}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {custom && <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type a value" autoFocus />}
    </div>
  );
};

export const PayGradeFormDialog: React.FC<PayGradeFormDialogProps> = ({ open, onOpenChange, grade, onSubmit, isPending }) => {
  const isEdit = Boolean(grade);
  const form = useForm<PayGradeFormValues>({
    resolver: zodResolver(payGradeFormSchema),
    defaultValues: grade ? payGradeToFormValues(grade) : emptyPayGradeFormValues(),
  });

  useEffect(() => {
    if (open) form.reset(grade ? payGradeToFormValues(grade) : emptyPayGradeFormValues());
    // Re-seed only when the dialog opens or the target grade changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grade?.id]);

  const currencySelect = form.watch('currency');
  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit pay grade' : 'New pay grade'}</DialogTitle>
          <DialogDescription>Grades give new packages their default base, currency and gratuity points.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl><Input placeholder="e.g. CO" className="uppercase" maxLength={20} {...field} /></FormControl>
                    <FormDescription>Unique within the company.</FormDescription>
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
                    <FormControl><Input placeholder="e.g. Chief Officer" {...field} /></FormControl>
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
                    <PresetOrCustom value={field.value ?? ''} onChange={field.onChange} options={DEPARTMENTS} placeholder="Any department" />
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
                    <PresetOrCustom value={field.value ?? ''} onChange={field.onChange} options={RANKS} placeholder="Any rank" />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="grade_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level</FormLabel>
                    <FormControl><Input inputMode="numeric" {...field} /></FormControl>
                    <FormDescription>Higher = more senior; used for ordering.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="step"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Step</FormLabel>
                    <FormControl><Input inputMode="numeric" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                        {CURRENCY_PRESETS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        <SelectItem value={OTHER_CURRENCY}>Other…</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {currencySelect === OTHER_CURRENCY ? (
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
              ) : (
                <div className="hidden sm:block" />
              )}
              <FormField
                control={form.control}
                name="monthly_base"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly base</FormLabel>
                    <FormControl><Input inputMode="decimal" placeholder="0.00" {...field} /></FormControl>
                    <FormDescription>Major units; stored as minor units.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="daily_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Daily rate</FormLabel>
                    <FormControl><Input inputMode="decimal" placeholder="Optional" {...field} /></FormControl>
                    <FormDescription>For day-workers and freelance crew.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gratuity_points"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gratuity points</FormLabel>
                    <FormControl><Input inputMode="decimal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>Inactive grades cannot be picked for new packages.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
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
                {isEdit ? 'Save changes' : 'Create pay grade'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PayGradeFormDialog;
