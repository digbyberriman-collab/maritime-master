import React, { Suspense, lazy } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import type { TransferCrewData, CrewMember } from '@/modules/crew/hooks/useCrew';
import { isPendingPlacementAssignment } from '@/modules/crew/lib/crewUpdateErrors';
import { useScope } from '@/app/router/scopeContext';

// The reviewed transfer (X1-11) loads only when a transfer opens.
const TransferEntry = lazy(() => import('@/modules/crew/components/transfer/TransferEntry'));

/** D-225: a pending placement is not an assignment; a transfer waits until the login is linked. */
export const TRANSFER_PENDING_MESSAGE =
  'This person is not assigned to the vessel yet: the assignment is written once they are invited and their login is linked. They can be transferred after that.';

const formSchema = z.object({
  newVesselId: z.string().min(1, 'Please select a vessel'),
  position: z.string().min(1, 'Position is required'),
  transferDate: z.date({ required_error: 'Transfer date is required' }),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface TransferCrewModalProps {
  isOpen: boolean;
  onClose: () => void;
  crewMember: CrewMember | null;
  onSubmit: (data: TransferCrewData) => Promise<void>;
  isLoading: boolean;
}

/**
 * The legacy two-step transfer (D-225 fixed: a pending placement is refused
 * before anything is written, refusals read as STORM sentences, a half
 * transfer says "Partly saved"). It is the documented D-01 fallback while
 * the transfer RPCs of 20261124061100 are not applied (`notice` says so),
 * and the form for a person outside a vessel scope.
 */
export const LegacyTransferForm: React.FC<TransferCrewModalProps & { notice?: string | null }> = ({
  isOpen,
  onClose,
  crewMember,
  onSubmit,
  isLoading,
  notice = null,
}) => {
  const { vessels } = useVessels();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newVesselId: '',
      position: crewMember?.current_assignment?.position || '',
      transferDate: new Date(),
      notes: '',
    },
  });

  React.useEffect(() => {
    if (isOpen && crewMember) {
      form.reset({
        newVesselId: '',
        position: crewMember.current_assignment?.position || '',
        transferDate: new Date(),
        notes: '',
      });
    }
  }, [isOpen, crewMember, form]);

  const pending = isPendingPlacementAssignment(crewMember?.current_assignment) || !crewMember?.user_id;

  const handleSubmit = async (values: FormValues) => {
    if (!crewMember?.current_assignment || !crewMember.user_id || pending) return;

    try {
      await onSubmit({
        userId: crewMember.user_id,
        currentAssignmentId: crewMember.current_assignment.id,
        newVesselId: values.newVesselId,
        position: values.position,
        transferDate: format(values.transferDate, 'yyyy-MM-dd'),
        notes: values.notes,
      });
    } catch {
      // The writer has already said why (a STORM sentence, or "Partly saved"); keep the entries.
      return;
    }
    onClose();
  };

  const availableVessels = vessels.filter(
    (v) => v.status === 'Active' && v.id !== crewMember?.current_assignment?.vessel_id
  );

  if (!crewMember) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Crew Member</DialogTitle>
          <DialogDescription>
            Transfer {crewMember.first_name} {crewMember.last_name} to a different vessel.
          </DialogDescription>
        </DialogHeader>

        {notice ? (
          <Alert variant="info" data-transfer-fallback="">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {pending ? (
          <Alert variant="info" data-transfer-refused="pending_placement">
            <AlertDescription>{TRANSFER_PENDING_MESSAGE}</AlertDescription>
          </Alert>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Current Vessel (disabled) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Vessel</label>
              <Input
                value={crewMember.current_assignment?.vessel_name || 'Not assigned'}
                disabled
                className="bg-muted"
              />
            </div>

            <FormField
              control={form.control}
              name="newVesselId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Vessel *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select new vessel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover">
                      {availableVessels.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No other vessels available
                        </SelectItem>
                      ) : (
                        availableVessels.map((vessel) => (
                          <SelectItem key={vessel.id} value={vessel.id}>
                            {vessel.name} {vessel.imo_number && `(IMO: ${vessel.imo_number})`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Position *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Chief Engineer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="transferDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Transfer Date *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? format(field.value, 'PPP') : 'Select date'}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional notes about the transfer..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || pending}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Transfer
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Transfer from the crew list row (and the legacy roster): the reviewed
 * transfer wizard (X1-11; gap/04 C58, W9) on the route vessel, through
 * TransferEntry (lazy). D-01: while its RPCs are missing, or outside a
 * vessel, the legacy form above with the notice. The props stay the
 * legacy ones, so the callers need no change.
 */
const TransferCrewModal: React.FC<TransferCrewModalProps> = (props) => {
  const scope = useScope();
  const { crewMember } = props;
  if (!crewMember || !props.isOpen) return null;
  const routeVessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const vesselId = routeVessel?.id ?? null;
  if (!vesselId) return <LegacyTransferForm {...props} />;
  const name = [crewMember.preferred_name || crewMember.first_name, crewMember.last_name].filter(Boolean).join(' ') || 'crew member';
  return (
    <Suspense fallback={null}>
      <TransferEntry
        open
        onClose={props.onClose}
        vessel={{ id: vesselId, companyId: routeVessel?.company_id ?? null }}
        profileId={crewMember.id}
        personName={name}
        renderFallback={(notice) => <LegacyTransferForm {...props} notice={notice} />}
      />
    </Suspense>
  );
};

export default TransferCrewModal;
