import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { emptyFxRateFormValues, fxRateFormSchema, type FxRateFormValues } from '@/modules/hris/lib/compensation';

interface FxRateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: Partial<FxRateFormValues>;
  onSubmit: (values: FxRateFormValues) => Promise<void>;
  isPending?: boolean;
}

export const FxRateFormDialog: React.FC<FxRateFormDialogProps> = ({ open, onOpenChange, defaults, onSubmit, isPending }) => {
  const form = useForm<FxRateFormValues>({ resolver: zodResolver(fxRateFormSchema), defaultValues: emptyFxRateFormValues(defaults) });

  useEffect(() => {
    if (open) form.reset(emptyFxRateFormValues(defaults));
    // Re-seed only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const base = form.watch('base_currency').toUpperCase();
  const quote = form.watch('quote_currency').toUpperCase();
  const rate = Number(form.watch('rate'));

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add FX rate</DialogTitle>
          <DialogDescription>One unit of the base currency equals <em>rate</em> units of the quote currency. The inverse pair is derived automatically.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="base_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base currency</FormLabel>
                    <FormControl><Input placeholder="USD" maxLength={3} className="uppercase" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quote_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quote currency</FormLabel>
                    <FormControl><Input placeholder="EUR" maxLength={3} className="uppercase" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate</FormLabel>
                    <FormControl><Input inputMode="decimal" placeholder="0.92" {...field} /></FormControl>
                    <FormDescription>
                      {base.length === 3 && quote.length === 3 && Number.isFinite(rate) && rate > 0 ? `1 ${base} = ${rate} ${quote}` : 'Up to 8 decimals.'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="valid_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid from</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormDescription>Replaces an existing rate for the same pair and date.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl><Input placeholder="ECB, bank statement, manual…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save rate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FxRateFormDialog;
