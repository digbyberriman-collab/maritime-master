import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  bankDetailFormSchema,
  bankDetailToFormValues,
  emptyBankDetailFormValues,
  type BankDetailFormValues,
  type BankDetailRow,
} from '@/modules/hris/lib/compensation';

interface BankDetailsFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row?: BankDetailRow | null;
  defaults?: Partial<BankDetailFormValues>;
  crewName?: string;
  onSubmit: (values: BankDetailFormValues) => Promise<void>;
  isPending?: boolean;
}

/** Add / edit a bank account. IBAN and BIC are validated client-side before saving. */
export const BankDetailsFormDialog: React.FC<BankDetailsFormDialogProps> = ({ open, onOpenChange, row, defaults, crewName, onSubmit, isPending }) => {
  const isEdit = Boolean(row);
  const form = useForm<BankDetailFormValues>({
    resolver: zodResolver(bankDetailFormSchema),
    defaultValues: row ? bankDetailToFormValues(row) : emptyBankDetailFormValues(defaults),
  });

  useEffect(() => {
    if (open) form.reset(row ? bankDetailToFormValues(row) : emptyBankDetailFormValues(defaults));
    // Re-seed only when the dialog opens or the target row changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const text = (name: keyof BankDetailFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, description?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...props} {...field} value={typeof field.value === 'boolean' ? '' : field.value ?? ''} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit bank account' : 'Add bank account'}</DialogTitle>
          <DialogDescription>
            {crewName ? `Payment details for ${crewName}. ` : ''}
            Enter an IBAN or an account number. Changing identifiers clears any verification.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {text('account_holder', 'Account holder', { placeholder: 'Name on the account', autoComplete: 'off' })}
              {text('bank_name', 'Bank name', { autoComplete: 'off' })}
              {text('bank_country', 'Bank country', { placeholder: 'ISO 2-letter, e.g. GB', maxLength: 2, className: 'uppercase' })}
              {text('currency', 'Account currency', { placeholder: 'ISO 4217, e.g. EUR', maxLength: 3, className: 'uppercase' })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {text('iban', 'IBAN', { placeholder: 'GB29 NWBK 6016 1331 9268 19', autoComplete: 'off', className: 'font-mono uppercase' })}
              </div>
              {text('swift_bic', 'SWIFT / BIC', { placeholder: '8 or 11 characters', autoComplete: 'off', className: 'font-mono uppercase' })}
              {text('account_number', 'Account number', { autoComplete: 'off', className: 'font-mono' }, 'For banks without an IBAN.')}
              {text('sort_code', 'Sort code', { placeholder: 'UK', autoComplete: 'off', className: 'font-mono' })}
              {text('routing_number', 'Routing / ABA number', { placeholder: 'US', autoComplete: 'off', className: 'font-mono' })}
            </div>
            <FormField
              control={form.control}
              name="is_primary"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <FormLabel>Primary account</FormLabel>
                    <FormDescription>Payroll is paid here. Only one account can be primary.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
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
                {isEdit ? 'Save changes' : 'Add account'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BankDetailsFormDialog;
