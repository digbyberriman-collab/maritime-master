import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, AlertCircle } from 'lucide-react';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { normaliseError } from '@/shared/lib/notify';
import { RANKS, NATIONALITIES, CREW_ROLES } from '@/modules/crew/constants';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { CREW_MEMBER_ROLES } from '@/modules/auth/services/adminActions';
import type { AddCrewMemberData } from '@/modules/crew/hooks/useCrew';

const formSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  nationality: z.string().optional(),
  rank: z.string().optional(),
  // The crew vocabulary only: admin roles are given in Users & Access (D-124).
  role: z.enum(CREW_MEMBER_ROLES),
  vesselId: z.string().optional(),
  position: z.string().optional(),
  joinDate: z.date().optional(),
  sendInvite: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

/** The role options: the crew vocabulary the function accepts. */
const ROLE_OPTIONS = CREW_ROLES.filter((r) => (CREW_MEMBER_ROLES as readonly string[]).includes(r.value));

interface CrewFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolves when the person was added (the hook says how the invitation went); rejects when nothing was added. */
  onSubmit: (data: AddCrewMemberData) => Promise<unknown>;
  isLoading: boolean;
}

const CrewFormModal: React.FC<CrewFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const { vessels } = useVessels();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      nationality: '',
      rank: '',
      role: 'crew',
      vesselId: '',
      position: '',
      sendInvite: true,
    },
  });

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      form.reset();
    }
  }, [isOpen, form]);

  const handleSubmit = async (values: FormValues) => {
    setFormError(null);
    setIsSubmitting(true);
    try {
      // The function checks the email in every company (409 when it is in use) and sends the invitation.
      await onSubmit({
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        nationality: values.nationality,
        rank: values.rank,
        role: values.role,
        vesselId: values.vesselId || undefined,
        position: values.position || undefined,
        joinDate: values.joinDate ? format(values.joinDate, 'yyyy-MM-dd') : undefined,
        sendInvite: values.sendInvite,
      });
      onClose();
    } catch (error) {
      // Nothing was added: say why and keep the form (the server's STORM sentence, never raw text).
      setFormError(normaliseError(error, 'The crew member could not be added. Try again.').message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeVessels = vessels.filter((v) => v.status === 'Active');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Crew Member</DialogTitle>
          <DialogDescription>
            Add a crew member and optionally assign them to a vessel. They choose their own password from the invitation.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {formError && (
              <Alert variant="destructive" data-crew-form-error="">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Personal Information
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="name@example.com" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 234 567 8900" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nationality</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select nationality" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover max-h-60">
                          {NATIONALITIES.map((nat) => (
                            <SelectItem key={nat} value={nat}>
                              {nat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rank"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rank</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select rank" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover max-h-60">
                          {RANKS.map((rank) => (
                            <SelectItem key={rank} value={rank}>
                              {rank}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Assignment Section */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Vessel Assignment
              </h3>

              <FormField
                control={form.control}
                name="vesselId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vessel</FormLabel>
                    <Select 
                      onValueChange={(v) => field.onChange(v === "__unassigned__" ? "" : v)} 
                      value={field.value || "__unassigned__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vessel (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover">
                        <SelectItem value="__unassigned__">No assignment (optional)</SelectItem>
                        {activeVessels.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            No active vessels available
                          </SelectItem>
                        ) : (
                          activeVessels.map((vessel) => (
                            <SelectItem key={vessel.id} value={vessel.id}>
                              {vessel.name} {vessel.imo_number && `(IMO: ${vessel.imo_number})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Optionally assign this crew member to a vessel immediately.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch('vesselId') && (
                <>
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Chief Engineer" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="joinDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Join Date</FormLabel>
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
                </>
              )}
            </div>

            {/* System Access */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                System Access
              </h3>

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>System Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover">
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Determines what features the user can access. Admin roles are given in Users &amp; Access.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sendInvite"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Send an invitation email</FormLabel>
                      <FormDescription>
                        STORM emails a link to set a password and join. Without it, send the invitation later from Users &amp; Access.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || isSubmitting}>
                {(isLoading || isSubmitting) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Crew Member
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CrewFormModal;
