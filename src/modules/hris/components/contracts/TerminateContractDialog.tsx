import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { formatDate } from '@/modules/hris/lib/format';
import type { CrewContractRow } from '@/modules/hris/lib/contractHelpers';

const schema = z.object({
  terminated_at: z.string().min(1, 'Termination date is required'),
  reason: z.string().trim().min(3, 'Give a short reason').max(1000),
});

type TerminateValues = z.infer<typeof schema>;

interface TerminateContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: CrewContractRow | null;
  onConfirm: (values: TerminateValues) => Promise<void>;
  isPending?: boolean;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Ends an active contract early, recording when and why. */
export const TerminateContractDialog: React.FC<TerminateContractDialogProps> = ({ open, onOpenChange, contract, onConfirm, isPending }) => {
  const form = useForm<TerminateValues>({
    resolver: zodResolver(
      schema.refine((v) => !contract || v.terminated_at >= contract.start_date, {
        path: ['terminated_at'],
        message: 'Termination cannot be before the contract start date',
      }),
    ),
    defaultValues: { terminated_at: todayIso(), reason: '' },
  });

  useEffect(() => {
    if (open) form.reset({ terminated_at: todayIso(), reason: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Terminate contract</DialogTitle>
          <DialogDescription>
            {contract
              ? `This ends the ${contract.contract_type.replace(/_/g, ' ')} contract that started ${formatDate(contract.start_date)}. The record is kept in the contract history.`
              : 'Ends the contract and keeps it in the history.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onConfirm)} className="space-y-4">
            <FormField
              control={form.control}
              name="terminated_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Termination date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl><Textarea rows={3} placeholder="Resignation, mutual agreement, end of season…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Terminate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default TerminateContractDialog;
