import React, { useState, useEffect } from 'react';
import { UserPlus, Loader2, Users, User } from 'lucide-react';
import { useRedRoomStore } from '@/modules/red-room/store/redRoomStore';
import { supabase } from '@/integrations/supabase/client';
import { PRIORITY_OPTIONS, ASSIGNABLE_ROLES } from '@/modules/red-room/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { RedRoomItem, AssignmentPriority } from '@/modules/red-room/types';

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: RedRoomItem | null;
  onSuccess: () => void;
}

interface CrewMember {
  id: string;
  user_id: string;
  full_name: string;
  position: string;
}

export function AssignTaskDialog({ open, onOpenChange, item, onSuccess }: AssignTaskDialogProps) {
  const { assignTask } = useRedRoomStore();

  const [assignType, setAssignType] = useState<'individual' | 'role'>('individual');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [priority, setPriority] = useState<AssignmentPriority>('urgent');
  const [notes, setNotes] = useState('');
  
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [isLoadingCrew, setIsLoadingCrew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load crew members when dialog opens
  useEffect(() => {
    if (open && item) {
      loadCrewMembers(item.vessel_id);
    }
  }, [open, item]);

  async function loadCrewMembers(vesselId: string) {
    setIsLoadingCrew(true);
    try {
      // Get crew from profiles with current vessel assignments
      const { data, error } = await supabase
        .from('crew_assignments')
        .select(`
          id,
          user_id,
          position,
          profile:profiles!crew_assignments_user_id_fkey(first_name, last_name)
        `)
        .eq('vessel_id', vesselId)
        .eq('is_current', true)
        .not('user_id', 'is', null);

      if (error) throw error;

      const mapped: CrewMember[] = (data || []).map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        full_name: c.profile ? `${c.profile.first_name || ''} ${c.profile.last_name || ''}`.trim() : 'Unknown',
        position: c.position || 'Crew',
      }));

      setCrewMembers(mapped);
    } catch (error) {
      console.error('Failed to load crew:', error);
    } finally {
      setIsLoadingCrew(false);
    }
  }

  async function handleSubmit() {
    if (!item) return;

    // Validate
    if (assignType === 'individual' && !selectedUserId) {
      setError('Please select a crew member');
      return;
    }
    if (assignType === 'role' && !selectedRole) {
      setError('Please select a role');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await assignTask({
        alertId: item.id,
        assignToUserId: assignType === 'individual' ? selectedUserId : undefined,
        assignToRole: assignType === 'role' ? selectedRole : undefined,
        notes: notes || undefined,
        priority,
      });

      if (result.success) {
        onSuccess();
        // Reset form
        setSelectedUserId('');
        setSelectedRole('');
        setNotes('');
        setPriority('urgent');
      } else {
        setError(result.error || 'Failed to assign task');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setError(null);
      setSelectedUserId('');
      setSelectedRole('');
      setNotes('');
      setPriority('urgent');
    }
    onOpenChange(newOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-purple-500" />
            Assign Task
          </DialogTitle>
          <DialogDescription>
            <span className="line-clamp-1 font-medium">{item?.title}</span>
            <span className="block text-xs mt-1 text-muted-foreground">
              Assigned tasks appear in the assignee's Red Room regardless of urgency.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Assign To Type */}
          <Tabs value={assignType} onValueChange={(v) => setAssignType(v as 'individual' | 'role')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="individual" className="gap-2">
                <User className="w-4 h-4" />
                Individual
              </TabsTrigger>
              <TabsTrigger value="role" className="gap-2">
                <Users className="w-4 h-4" />
                Role
              </TabsTrigger>
            </TabsList>

            <TabsContent value="individual" className="mt-4">
              <div className="space-y-2">
                <Label>Select Crew Member</Label>
                {isLoadingCrew ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : crewMembers.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    No crew members found for this vessel
                  </div>
                ) : (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select crew member" />
                    </SelectTrigger>
                    <SelectContent>
                      {crewMembers.map(member => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {member.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span>{member.full_name}</span>
                            <span className="text-muted-foreground">({member.position})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </TabsContent>

            <TabsContent value="role" className="mt-4">
              <div className="space-y-2">
                <Label>Select Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map(role => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  All crew members with this role will see this task in their Red Room.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <RadioGroup
              value={priority}
              onValueChange={(v) => setPriority(v as AssignmentPriority)}
              className="space-y-2"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-3">
                  <RadioGroupItem value={option.value} id={`priority-${option.value}`} />
                  <Label htmlFor={`priority-${option.value}`} className="cursor-pointer flex-1">
                    <p className="font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="assignment-notes">Instructions (optional)</Label>
            <Textarea
              id="assignment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any specific instructions for the assignee..."
              rows={3}
            />
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Assign Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignTaskDialog;
