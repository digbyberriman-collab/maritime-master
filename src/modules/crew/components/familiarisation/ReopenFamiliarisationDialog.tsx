import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/shared/lib/notify';
import { trimText } from '@/modules/crew/lib/familiarisation';
import { familiarisationRefusalMessage, useReopenFamiliarisation } from '@/modules/crew/hooks/useFamiliarisation';

export const REOPEN_REASON_MAX = 2000;

const reopenSchema = z.object({
  reason: z
    .string()
    .transform(trimText)
    .pipe(z.string().min(1, 'Say why it is reopened').max(REOPEN_REASON_MAX, `Keep the reason to ${REOPEN_REASON_MAX.toLocaleString('en-GB')} characters or fewer`)),
});
interface ReopenValues {
  reason: string;
}

export interface ReopenFamiliarisationDialogProps {
  vessel: { id: string; companyId: string };
  recordId: string;
  personName: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Reopens a completed or signed familiarisation with a reason (gap/04 C63):
 * the signatures are cleared, the ticks kept, and the record waits for its
 * signatures again. The reason and who reopened it stay on the record.
 */
export const ReopenFamiliarisationDialog: React.FC<ReopenFamiliarisationDialogProps> = ({ vessel, recordId, personName, onOpenChange }) => {
  const reopen = useReopenFamiliarisation(vessel);
  const [rootError, setRootError] = React.useState<string | null>(null);
  const form = useForm<ReopenValues>({ resolver: zodResolver(reopenSchema), defaultValues: { reason: '' } });

  const onSubmit = form.handleSubmit(async ({ reason }) => {
    setRootError(null);
    try {
      await reopen.mutateAsync({ recordId, reason });
      notify.success(`${personName}'s familiarisation is reopened.`);
      onOpenChange(false);
    } catch (error) {
      setRootError(familiarisationRefusalMessage(error));
    }
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-reopen-familiarisation="">
        <DialogHeader>
          <DialogTitle>Reopen familiarisation</DialogTitle>
          <DialogDescription>
            The signatures are cleared and both sign again. Ticked items stay ticked.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="min-w-0 space-y-4" noValidate>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} maxLength={REOPEN_REASON_MAX} />
                  </FormControl>
                  <FormDescription>Kept on the record with your name.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {rootError ? (
              <p className="type-body text-destructive" role="alert">
                {rootError}
              </p>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" className="[@media(pointer:coarse)]:h-11" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="[@media(pointer:coarse)]:h-11" disabled={reopen.isPending}>
                {reopen.isPending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reopen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ReopenFamiliarisationDialog;
