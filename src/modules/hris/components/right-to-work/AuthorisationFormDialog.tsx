import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AUTHORISATION_STATUSES,
  AUTHORISATION_STATUS_LABELS,
  AUTHORISATION_TYPES,
  AUTHORISATION_TYPE_LABELS,
  authorisationFormSchema,
  authorisationFormToPayload,
  authorisationToFormValues,
  type AuthorisationFormValues,
  type AuthorisationPayload,
  type WorkAuthorisationRow,
} from '@/modules/hris/lib/rightToWork';

interface AuthorisationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing row to edit; omit to create. */
  authorisation?: WorkAuthorisationRow | null;
  /** Prefill for a new row (e.g. from the itinerary hint). */
  presetType?: AuthorisationFormValues['authorisation_type'] | null;
  submitting?: boolean;
  onSubmit: (payload: AuthorisationPayload) => Promise<unknown>;
}

/** Create / edit dialog for a visa, permit, seaman's book or endorsement. */
export const AuthorisationFormDialog: React.FC<AuthorisationFormDialogProps> = ({ open, onOpenChange, authorisation, presetType, submitting, onSubmit }) => {
  const form = useForm<AuthorisationFormValues>({ resolver: zodResolver(authorisationFormSchema), defaultValues: authorisationToFormValues(authorisation) });
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    const values = authorisationToFormValues(authorisation);
    reset(presetType && !authorisation ? { ...values, authorisation_type: presetType } : values);
  }, [open, authorisation, presetType, reset]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(authorisationFormToPayload(values));
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{authorisation ? 'Edit authorisation' : 'Add work authorisation'}</DialogTitle>
          <DialogDescription>Visas, permits, seaman's books and flag endorsements. Expiry feeds the HR alerts.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="authorisation_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{AUTHORISATION_TYPES.map((t) => <SelectItem key={t} value={t}>{AUTHORISATION_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country / area</FormLabel>
                    <FormControl><Input placeholder="e.g. United States" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reference_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference number</FormLabel>
                  <FormControl><Input placeholder="Visa / permit number" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="issued_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issued</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiry_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expires</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="entries"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entries</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">Not applicable</SelectItem>
                        <SelectItem value="single">Single entry</SelectItem>
                        <SelectItem value="multiple">Multiple entry</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{AUTHORISATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{AUTHORISATION_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                    </Select>
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
                  <FormControl><Textarea rows={2} placeholder="Conditions, sponsor, port restrictions…" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {authorisation ? 'Save changes' : 'Add authorisation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AuthorisationFormDialog;
