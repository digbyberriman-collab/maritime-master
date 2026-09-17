import React from 'react';
import { useFieldArray, useWatch, type Control } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { formatMinor, toMinor } from '@/modules/hris/lib/format';
import { emptyAllowanceFormValues, type CompensationFormValues } from '@/modules/hris/lib/compensation';

interface AllowancesEditorProps {
  control: Control<CompensationFormValues>;
  currency: string;
  disabled?: boolean;
}

const FLAGS: { key: 'taxable' | 'recurring' | 'prorate'; label: string; hint: string }[] = [
  { key: 'recurring', label: 'Recurring', hint: 'Paid every period (untick for a one-off)' },
  { key: 'prorate', label: 'Pro-rate', hint: 'Scaled to days paid in the period' },
  { key: 'taxable', label: 'Taxable', hint: 'Included in the taxable gross' },
];

/**
 * Repeating rows for the `allowances` jsonb column. Amounts are entered in
 * major units and converted to minor units by `formValuesToCompensationPayload`.
 */
export const AllowancesEditor: React.FC<AllowancesEditorProps> = ({ control, currency, disabled }) => {
  const { fields, append, remove } = useFieldArray({ control, name: 'allowances' });
  const values = useWatch({ control, name: 'allowances' }) ?? [];
  const totalMinor = values.reduce((sum, a) => sum + (toMinor(a?.amount) ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allowances</h3>
          <p className="text-xs text-muted-foreground">Per pay period, on top of the base salary.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => append(emptyAllowanceFormValues())} disabled={disabled}>
          <Plus className="mr-1.5 h-4 w-4" /> Add allowance
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No allowances. Base salary only.</p>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="rounded-md border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                <FormField
                  control={control}
                  name={`allowances.${index}.name`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Uniform, Phone, Seniority" disabled={disabled} {...f} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`allowances.${index}.amount`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Amount ({currency})</FormLabel>
                      <FormControl><Input inputMode="decimal" placeholder="0.00" disabled={disabled} {...f} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-end">
                  <Button type="button" size="icon" variant="ghost" aria-label="Remove allowance" onClick={() => remove(index)} disabled={disabled}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-4">
                {FLAGS.map((flag) => (
                  <FormField
                    key={flag.key}
                    control={control}
                    name={`allowances.${index}.${flag.key}`}
                    render={({ field: f }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} disabled={disabled} />
                        </FormControl>
                        <FormLabel className="text-xs font-normal" title={flag.hint}>{flag.label}</FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>
          ))}
          <p className="text-right text-sm text-muted-foreground">
            Allowances total <span className="font-medium tabular-nums text-foreground">{formatMinor(totalMinor, currency)}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default AllowancesEditor;
