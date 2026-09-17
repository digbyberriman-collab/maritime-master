import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { formatMinor, fromMinor, toMinor } from '@/modules/hris/lib/format';
import type { GratuityDistributionWithProfile } from '@/modules/hris/hooks/useGratuities';
import type { DistributionAction } from './DistributionsTable';

const schema = z.object({
  amount: z.string().trim(),
  reason: z.string().trim().max(1000),
});

type Values = z.infer<typeof schema>;

export interface DistributionDialogResult {
  action: DistributionAction;
  /** Signed adjustment in minor units (adjust only). */
  adjustmentMinor: number;
  reason: string;
}

interface DistributionAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distribution: GratuityDistributionWithProfile | null;
  action: DistributionAction;
  currency: string;
  onConfirm: (result: DistributionDialogResult) => Promise<void>;
  isPending?: boolean;
}

const COPY: Record<DistributionAction, { title: string; cta: string }> = {
  exclude: { title: 'Exclude from this pool', cta: 'Exclude' },
  include: { title: 'Include again', cta: 'Include' },
  adjust: { title: 'Adjust share', cta: 'Save adjustment' },
};

/**
 * One dialog for the three row actions. Excluding re-runs the engine so the
 * others' shares re-balance; adjusting only changes this row and shows up in
 * the reconciliation footer.
 */
export const DistributionAdjustDialog: React.FC<DistributionAdjustDialogProps> = ({ open, onOpenChange, distribution, action, currency, onConfirm, isPending }) => {
  const resolver = useMemo(
    () =>
      zodResolver(
        schema.superRefine((v, ctx) => {
          if (action === 'exclude' && v.reason.length < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Give a short reason' });
          if (action === 'adjust') {
            if (toMinor(v.amount) === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Enter a signed amount, e.g. -50 or 120.50' });
            if (v.reason.length < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Give a short reason' });
          }
        }),
      ),
    [action],
  );

  const form = useForm<Values>({ resolver, defaultValues: { amount: '', reason: '' } });

  useEffect(() => {
    if (open) {
      form.reset({
        amount: action === 'adjust' && distribution?.adjustment_minor ? fromMinor(distribution.adjustment_minor) : '',
        reason: action === 'adjust' ? distribution?.adjustment_reason ?? '' : '',
      });
    }
    // Re-seed only when the dialog opens or the target/action changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, distribution?.id, action]);

  const amount = form.watch('amount');
  const previewFinal = useMemo(() => {
    if (!distribution || action !== 'adjust') return null;
    const adj = toMinor(amount);
    return adj === null ? null : distribution.amount_minor + adj;
  }, [amount, distribution, action]);

  const submit = form.handleSubmit(async (values) => {
    await onConfirm({ action, adjustmentMinor: action === 'adjust' ? toMinor(values.amount) ?? 0 : 0, reason: values.reason });
  });

  const name = distribution?.crew_name ?? 'this crew member';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{COPY[action].title}</DialogTitle>
          <DialogDescription>
            {action === 'exclude' && `${name} will receive nothing from this pool and the remaining shares will be recalculated.`}
            {action === 'include' && `${name} will be added back and the shares will be recalculated.`}
            {action === 'adjust' &&
              distribution &&
              `Calculated share for ${name}: ${formatMinor(distribution.amount_minor, currency)}. Use a negative amount to reduce it.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            {action === 'adjust' && (
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjustment ({currency})</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="e.g. -50.00" autoFocus {...field} />
                    </FormControl>
                    <FormDescription>{previewFinal === null ? 'Final amount: —' : `Final amount: ${formatMinor(previewFinal, currency)}`}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {action !== 'include' && (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder={action === 'exclude' ? 'e.g. Signed off before the charter' : 'e.g. Guest tipped the chef directly'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" variant={action === 'exclude' ? 'destructive' : 'default'} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {COPY[action].cta}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default DistributionAdjustDialog;
