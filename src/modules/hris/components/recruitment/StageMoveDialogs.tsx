import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CURRENCY_PRESETS } from '@/modules/hris/lib/contractHelpers';
import { formatMinor, fromMinor, toMinor } from '@/modules/hris/lib/format';
import { offerFormSchema, type OfferFormValues, type VacancyRow } from '@/modules/hris/lib/recruitment';
import type { OfferDetails } from '@/modules/hris/hooks/useRecruitment';

interface OfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  vacancy: Pick<VacancyRow, 'salary_currency' | 'salary_min_minor' | 'salary_max_minor' | 'start_date'>;
  /** Existing offer (when re-issuing). */
  current?: Partial<OfferDetails> | null;
  onSubmit: (offer: OfferDetails) => Promise<void>;
  isPending?: boolean;
}

const defaultsFor = (vacancy: OfferDialogProps['vacancy'], current?: Partial<OfferDetails> | null): OfferFormValues => ({
  offer_currency: current?.offer_currency ?? vacancy.salary_currency ?? 'EUR',
  offer_base: fromMinor(current?.offer_base_minor ?? vacancy.salary_min_minor),
  offer_start_date: current?.offer_start_date ?? vacancy.start_date ?? '',
});

/** Collects the offer terms when an application moves to the offer stage. */
export const OfferDialog: React.FC<OfferDialogProps> = ({ open, onOpenChange, candidateName, vacancy, current, onSubmit, isPending }) => {
  const form = useForm<OfferFormValues>({ resolver: zodResolver(offerFormSchema), defaultValues: defaultsFor(vacancy, current) });

  useEffect(() => {
    if (open) form.reset(defaultsFor(vacancy, current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = form.handleSubmit(async (values) => {
    const offer_base_minor = toMinor(values.offer_base);
    if (offer_base_minor === null) return;
    await onSubmit({ offer_currency: values.offer_currency, offer_base_minor, offer_start_date: values.offer_start_date });
  });

  const range =
    vacancy.salary_min_minor !== null || vacancy.salary_max_minor !== null
      ? `${formatMinor(vacancy.salary_min_minor, vacancy.salary_currency)} – ${formatMinor(vacancy.salary_max_minor, vacancy.salary_currency)}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make an offer</DialogTitle>
          <DialogDescription>
            Record the terms offered to {candidateName}. {range ? `The vacancy range is ${range}/month.` : ''} These terms pre-fill the contract on hire.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="offer_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {CURRENCY_PRESETS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        {field.value && !(CURRENCY_PRESETS as readonly string[]).includes(field.value) && (
                          <SelectItem value={field.value}>{field.value}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="offer_base"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Monthly base</FormLabel>
                    <FormControl><Input inputMode="decimal" placeholder="4800" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="offer_start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proposed start date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormDescription>Can be adjusted again at hire.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record offer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  /** `withdrawn` when the candidate pulled out, `rejected` when the company declined. */
  mode: 'rejected' | 'withdrawn';
  onSubmit: (reason: string) => Promise<void>;
  isPending?: boolean;
}

const REJECTION_REASONS = [
  'Insufficient experience',
  'Missing required certificates',
  'Salary expectations too high',
  'Not available for start date',
  'Interview outcome',
  'References',
  'Position filled',
  'Other',
] as const;

/** Reason capture for rejecting or withdrawing an application. */
export const RejectDialog: React.FC<RejectDialogProps> = ({ open, onOpenChange, candidateName, mode, onSubmit, isPending }) => {
  const [reason, setReason] = useState<string>('');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setDetail('');
    }
  }, [open]);

  const isReject = mode === 'rejected';
  const combined = [isReject ? reason : '', detail.trim()].filter(Boolean).join(' — ');
  const valid = isReject ? Boolean(reason) : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isReject ? 'Reject application' : 'Mark as withdrawn'}</DialogTitle>
          <DialogDescription>
            {isReject
              ? `${candidateName} will be moved out of the active pipeline. The reason is kept on the application and can be reopened later.`
              : `Record that ${candidateName} withdrew from this process.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isReject && (
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>{isReject ? 'Details (optional)' : 'Notes (optional)'}</Label>
            <Textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={isReject ? 'Anything useful for future applications' : 'e.g. accepted another position'} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button
            type="button"
            variant={isReject ? 'destructive' : 'default'}
            disabled={!valid || isPending}
            onClick={() => void onSubmit(combined)}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReject ? 'Reject' : 'Mark withdrawn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
