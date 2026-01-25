import React, { useState } from 'react';
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
import { useVessels } from '@/hooks/useVessels';
import type { TransferCrewData, CrewMember } from '@/hooks/useCrew';

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

const TransferCrewModal: React.FC<TransferCrewModalProps> = ({
  isOpen,
  onClose,
  crewMember,
  onSubmit,
  isLoading,
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

  const handleSubmit = async (values: FormValues) => {
    if (!crewMember?.current_assignment) return;

    await onSubmit({
      userId: crewMember.user_id,
      currentAssignmentId: crewMember.current_assignment.id,
      newVesselId: values.newVesselId,
      position: values.position,
      transferDate: format(values.transferDate, 'yyyy-MM-dd'),
      notes: values.notes,
    });
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
                        <SelectItem value="" disabled>
                          No other vessels available
                        </SelectItem>
                      ) : (
                        availableVessels.map((vessel) => (
                          <SelectItem key={vessel.id} value={vessel.id}>
                            {vessel.name}
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
              <Button type="submit" disabled={isLoading}>
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

export default TransferCrewModal;
