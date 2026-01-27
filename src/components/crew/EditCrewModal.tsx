import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RANKS, NATIONALITIES } from '@/lib/crewConstants';
import type { CrewMember, UpdateCrewMemberData } from '@/hooks/useCrew';

const formSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: z.string().optional(),
  nationality: z.string().optional(),
  rank: z.string().optional(),
  status: z.enum(['Active', 'On Leave', 'Inactive']),
});

type FormValues = z.infer<typeof formSchema>;

interface EditCrewModalProps {
  isOpen: boolean;
  onClose: () => void;
  crewMember: CrewMember | null;
  onSubmit: (data: UpdateCrewMemberData) => Promise<void>;
  isLoading: boolean;
}

const EditCrewModal: React.FC<EditCrewModalProps> = ({
  isOpen,
  onClose,
  crewMember,
  onSubmit,
  isLoading,
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      nationality: '',
      rank: '',
      status: 'Active',
    },
  });

  useEffect(() => {
    if (isOpen && crewMember) {
      form.reset({
        firstName: crewMember.first_name,
        lastName: crewMember.last_name,
        phone: crewMember.phone || '',
        nationality: crewMember.nationality || '',
        rank: crewMember.rank || '',
        status: (crewMember.status as 'Active' | 'On Leave' | 'Inactive') || 'Active',
      });
    }
  }, [isOpen, crewMember, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!crewMember) return;

    await onSubmit({
      userId: crewMember.user_id,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      nationality: values.nationality,
      rank: values.rank,
      status: values.status,
    });
    onClose();
  };

  if (!crewMember) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Crew Member</DialogTitle>
          <DialogDescription>
            Update {crewMember.first_name} {crewMember.last_name}'s profile information.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                    <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select nationality" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover max-h-60">
                        <SelectItem value="__none__">Not specified</SelectItem>
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
                    <Select onValueChange={field.onChange} value={field.value || "__none__"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select rank" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover max-h-60">
                        <SelectItem value="__none__">Not specified</SelectItem>
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

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover">
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="On Leave">On Leave</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email shown as read-only */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input value={crewMember.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCrewModal;
