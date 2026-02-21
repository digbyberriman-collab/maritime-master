import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { useEmergencyContactsStore } from '@/modules/emergency/store/emergencyContactsStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/shared/hooks/use-toast';
import type { VesselEmergencyContacts, EmergencyContactsFormData } from '@/modules/emergency/types';

interface EmergencyContactsEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vesselId: string;
  companyId: string;
  contacts: VesselEmergencyContacts | null;
}

export function EmergencyContactsEditDialog({
  open,
  onOpenChange,
  vesselId,
  companyId,
  contacts,
}: EmergencyContactsEditDialogProps) {
  const { saveContacts, isSaving } = useEmergencyContactsStore();
  const { toast } = useToast();
  const [changeSummary, setChangeSummary] = useState('');

  const defaultValues: EmergencyContactsFormData = contacts ? {
    emergency_heading: contacts.emergency_heading,
    primary_instruction: contacts.primary_instruction,
    secondary_instruction: contacts.secondary_instruction,
    primary_phone: contacts.primary_phone,
    primary_email: contacts.primary_email,
    logo_url: contacts.logo_url,
    team_members: contacts.team_members.map(m => ({
      name: m.name,
      position: m.position,
      phone: m.phone,
      email: m.email,
      display_order: m.display_order,
    })),
  } : {
    emergency_heading: 'EMERGENCY CONTACT DETAILS 24/7',
    primary_instruction: 'PLEASE DIAL THIS NUMBER FIRST',
    secondary_instruction: 'If you cannot reach us, please dial one of the below emergency team members:',
    primary_phone: '',
    primary_email: '',
    logo_url: null,
    team_members: [],
  };

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<EmergencyContactsFormData>({
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'team_members',
  });

  // Reset form when contacts change
  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setChangeSummary('');
    }
  }, [open, contacts]);

  async function onSubmit(data: EmergencyContactsFormData) {
    try {
      await saveContacts(vesselId, companyId, data, changeSummary || undefined);
      toast({
        title: 'Emergency contacts updated',
        description: 'Changes saved and will reflect across all surfaces.',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save emergency contacts.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Emergency Contact Details</DialogTitle>
          <DialogDescription>
            Changes will update all displays: Vessel Emergency Details, Dashboard Widget, and ERM.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6 py-4">
              {/* Header Settings */}
              <div className="space-y-4">
                <h3 className="font-medium text-foreground">Header & Instructions</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="emergency_heading">Emergency Heading</Label>
                  <Input
                    id="emergency_heading"
                    {...register('emergency_heading', { required: 'Heading is required' })}
                    placeholder="EMERGENCY CONTACT DETAILS 24/7"
                  />
                  {errors.emergency_heading && (
                    <p className="text-sm text-destructive">{errors.emergency_heading.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="primary_instruction">Primary Instruction</Label>
                  <Input
                    id="primary_instruction"
                    {...register('primary_instruction', { required: 'Instruction is required' })}
                    placeholder="PLEASE DIAL THIS NUMBER FIRST"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secondary_instruction">Secondary Instruction</Label>
                  <Textarea
                    id="secondary_instruction"
                    {...register('secondary_instruction')}
                    placeholder="If you cannot reach us..."
                    rows={2}
                  />
                </div>
              </div>

              {/* Primary Contact */}
              <div className="space-y-4">
                <h3 className="font-medium text-foreground">Primary Emergency Contact</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="primary_phone">Emergency Phone Number *</Label>
                    <Input
                      id="primary_phone"
                      {...register('primary_phone', { required: 'Phone number is required' })}
                      placeholder="+1 954 355 1305"
                    />
                    {errors.primary_phone && (
                      <p className="text-sm text-destructive">{errors.primary_phone.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="primary_email">Emergency Email *</Label>
                    <Input
                      id="primary_email"
                      type="email"
                      {...register('primary_email', { required: 'Email is required' })}
                      placeholder="sos@example.com"
                    />
                    {errors.primary_email && (
                      <p className="text-sm text-destructive">{errors.primary_email.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Logo URL */}
              <div className="space-y-2">
                <Label htmlFor="logo_url">Company Logo URL (optional)</Label>
                <Input
                  id="logo_url"
                  {...register('logo_url')}
                  placeholder="https://example.com/logo.png"
                />
              </div>

              {/* Emergency Team Members */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-foreground">Emergency Team Members</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ name: '', position: '', phone: '', email: '', display_order: fields.length })}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Contact
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No team members added yet.</p>
                ) : (
                  <div className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-start gap-2 p-4 border rounded-lg bg-muted/30">
                        <GripVertical className="w-5 h-5 text-muted-foreground mt-8 cursor-move" />
                        <input type="hidden" {...register(`team_members.${index}.display_order`)} value={index} />
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Name</Label>
                            <Input
                              {...register(`team_members.${index}.name`, { required: true })}
                              placeholder="John Smith"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Position</Label>
                            <Input
                              {...register(`team_members.${index}.position`, { required: true })}
                              placeholder="DPA / CSO"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Phone</Label>
                            <Input
                              {...register(`team_members.${index}.phone`, { required: true })}
                              placeholder="+1 555 123 4567"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Email</Label>
                            <Input
                              {...register(`team_members.${index}.email`, { required: true })}
                              type="email"
                              placeholder="john@example.com"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive mt-6"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Change Summary */}
              <div className="space-y-2">
                <Label htmlFor="change_summary">Change Summary (for audit log)</Label>
                <Textarea
                  id="change_summary"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="Describe what changes were made..."
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
