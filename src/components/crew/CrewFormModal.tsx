import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, Copy, Check } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { RANKS, NATIONALITIES, CREW_ROLES } from '@/lib/crewConstants';
import { useVessels } from '@/hooks/useVessels';
import type { AddCrewMemberData } from '@/hooks/useCrew';

const formSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  nationality: z.string().optional(),
  rank: z.string().optional(),
  role: z.enum(['master', 'chief_engineer', 'chief_officer', 'crew']),
  vesselId: z.string().optional(),
  position: z.string().optional(),
  joinDate: z.date().optional(),
  sendWelcomeEmail: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface CrewFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AddCrewMemberData) => Promise<void>;
  isLoading: boolean;
}

// Generate a random password
const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const CrewFormModal: React.FC<CrewFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const { vessels } = useVessels();
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [copied, setCopied] = useState(false);

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
      sendWelcomeEmail: true,
    },
  });

  useEffect(() => {
    if (isOpen) {
      setGeneratedPassword(generatePassword());
      setCopied(false);
      form.reset();
    }
  }, [isOpen, form]);

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (values: FormValues) => {
    await onSubmit({
      email: values.email,
      password: generatedPassword,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      nationality: values.nationality,
      rank: values.rank,
      role: values.role,
      vesselId: values.vesselId || undefined,
      position: values.position || undefined,
      joinDate: values.joinDate ? format(values.joinDate, 'yyyy-MM-dd') : undefined,
    });
    onClose();
  };

  const activeVessels = vessels.filter((v) => v.status === 'Active');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Crew Member</DialogTitle>
          <DialogDescription>
            Create a new crew member account and optionally assign them to a vessel.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
                        <Input placeholder="John" {...field} />
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
                        <Input placeholder="Smith" {...field} />
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
                      <Input type="email" placeholder="john.smith@example.com" {...field} />
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vessel (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover">
                        {activeVessels.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            No active vessels
                          </SelectItem>
                        ) : (
                          activeVessels.map((vessel) => (
                            <SelectItem key={vessel.id} value={vessel.id}>
                              {vessel.name}
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
                        {CREW_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Determines what features the user can access.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Initial Password</FormLabel>
                <div className="flex gap-2">
                  <Input
                    value={generatedPassword}
                    readOnly
                    className="font-mono bg-muted"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyPassword}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy this password and share it securely with the crew member.
                </p>
              </div>

              <FormField
                control={form.control}
                name="sendWelcomeEmail"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Send welcome email</FormLabel>
                      <FormDescription>
                        Notify the crew member about their new account.
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
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
