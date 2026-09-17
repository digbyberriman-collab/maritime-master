import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { NEXT_OF_KIN_RELATIONSHIPS, type NextOfKin, type NextOfKinFormData } from '@/modules/hris/hooks/useCrewNextOfKin';

const optionalText = z.string().trim().max(200).optional();

const schema = z
  .object({
    full_name: z.string().trim().min(1, 'Full name is required').max(200),
    relationship: z.string().trim().min(1, 'Relationship is required'),
    phone_primary: optionalText,
    phone_secondary: optionalText,
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]).optional(),
    address_line1: optionalText,
    address_line2: optionalText,
    city: optionalText,
    postal_code: optionalText,
    country: optionalText,
    language: optionalText,
    is_primary: z.boolean(),
    is_emergency_contact: z.boolean(),
    notes: z.string().trim().max(2000).optional(),
    consent: z.boolean(),
  })
  .refine((v) => Boolean(v.phone_primary) || Boolean(v.email), {
    message: 'Provide at least a primary phone number or an email address',
    path: ['phone_primary'],
  });

type FormValues = z.infer<typeof schema>;

interface NextOfKinFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing contact to edit; omit to create. */
  contact?: NextOfKin | null;
  /** True when the crew member has no contacts yet (first one becomes primary). */
  isFirst: boolean;
  submitting?: boolean;
  onSubmit: (values: NextOfKinFormData) => Promise<unknown>;
}

const toDefaults = (contact: NextOfKin | null | undefined, isFirst: boolean): FormValues => ({
  full_name: contact?.full_name ?? '',
  relationship: contact?.relationship ?? '',
  phone_primary: contact?.phone_primary ?? '',
  phone_secondary: contact?.phone_secondary ?? '',
  email: contact?.email ?? '',
  address_line1: contact?.address_line1 ?? '',
  address_line2: contact?.address_line2 ?? '',
  city: contact?.city ?? '',
  postal_code: contact?.postal_code ?? '',
  country: contact?.country ?? '',
  language: contact?.language ?? '',
  is_primary: contact?.is_primary ?? isFirst,
  is_emergency_contact: contact?.is_emergency_contact ?? true,
  notes: contact?.notes ?? '',
  consent: Boolean(contact?.consent_obtained_at),
});

/** Create / edit dialog for a next-of-kin contact. */
export const NextOfKinFormDialog: React.FC<NextOfKinFormDialogProps> = ({ open, onOpenChange, contact, isFirst, submitting, onSubmit }) => {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toDefaults(contact, isFirst) });
  const { reset } = form;

  useEffect(() => {
    if (open) reset(toDefaults(contact, isFirst));
  }, [open, contact, isFirst, reset]);

  // Backfilled rows may carry a relationship outside the fixed list (e.g. "Unknown"); keep it selectable.
  const relationshipOptions = useMemo(() => {
    const current = contact?.relationship;
    const base: string[] = [...NEXT_OF_KIN_RELATIONSHIPS];
    return current && !base.includes(current) ? [current, ...base] : base;
  }, [contact?.relationship]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      full_name: values.full_name,
      relationship: values.relationship,
      phone_primary: values.phone_primary ?? null,
      phone_secondary: values.phone_secondary ?? null,
      email: values.email ?? null,
      address_line1: values.address_line1 ?? null,
      address_line2: values.address_line2 ?? null,
      city: values.city ?? null,
      postal_code: values.postal_code ?? null,
      country: values.country ?? null,
      language: values.language ?? null,
      is_primary: values.is_primary,
      is_emergency_contact: values.is_emergency_contact,
      notes: values.notes ?? null,
      consent: values.consent,
    });
    onOpenChange(false);
  });

  const lockPrimary = Boolean(contact?.is_primary) || isFirst;

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit contact' : 'Add next of kin'}</DialogTitle>
          <DialogDescription>Who should be contacted in an emergency. A phone number or email is required.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name *</FormLabel>
                  <FormControl><Input autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="relationship" render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {relationshipOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone_primary" render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary phone</FormLabel>
                  <FormControl><Input type="tel" inputMode="tel" placeholder="+44 7700 900000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone_secondary" render={({ field }) => (
                <FormItem>
                  <FormLabel>Secondary phone</FormLabel>
                  <FormControl><Input type="tel" inputMode="tel" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" inputMode="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="language" render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferred language</FormLabel>
                  <FormControl><Input placeholder="e.g. Spanish" {...field} /></FormControl>
                  <FormDescription>Helps whoever makes the call.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="address_line1" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Address</FormLabel>
                  <FormControl><Input placeholder="Street" autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="address_line2" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormControl><Input placeholder="Apartment, building (optional)" autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="city" render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="postal_code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Postal code</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="country" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Country</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea rows={3} placeholder="Best time to call, medical power of attorney, etc." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="space-y-3 rounded-md border p-4">
              <FormField control={form.control} name="is_primary" render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={lockPrimary} /></FormControl>
                  <div className="space-y-0.5 leading-none">
                    <FormLabel>Primary contact</FormLabel>
                    <FormDescription>{isFirst ? 'The first contact is always primary.' : 'Called first. Replaces the current primary.'}</FormDescription>
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="is_emergency_contact" render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} /></FormControl>
                  <div className="space-y-0.5 leading-none">
                    <FormLabel>Emergency contact</FormLabel>
                    <FormDescription>Untick for a next of kin who should not be called in an emergency.</FormDescription>
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="consent" render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} /></FormControl>
                  <div className="space-y-0.5 leading-none">
                    <FormLabel>Consent obtained (GDPR)</FormLabel>
                    <FormDescription>
                      This person has been told their details are held for emergency contact purposes.
                      {contact?.consent_obtained_at && ' Unticking clears the recorded consent.'}
                    </FormDescription>
                  </div>
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {contact ? 'Save changes' : 'Add contact'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default NextOfKinFormDialog;
