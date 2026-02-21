import { useState, useEffect } from 'react';
import { X, ClipboardCheck, User, Calendar, Flag, FileText, Ship } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useCrewTasks, TaskType, TaskPriority } from '@/modules/crew/hooks/useCrewTasks';
import { format } from 'date-fns';

interface AssignTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedCrewId?: string;
  onSuccess?: () => void;
}

interface CrewMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  rank: string | null;
}

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'task', label: 'General Task' },
  { value: 'review', label: 'Review' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'form', label: 'Complete Form' },
  { value: 'acknowledgement', label: 'Document Acknowledgement' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'text-muted-foreground' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
  { value: 'high', label: 'High', color: 'text-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'text-destructive' },
];

export function AssignTaskModal({ 
  open, 
  onOpenChange, 
  preselectedCrewId,
  onSuccess 
}: AssignTaskModalProps) {
  const { profile } = useAuth();
  const { selectedVessel } = useVessel();
  const { createTask } = useCrewTasks();
  
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [loadingCrew, setLoadingCrew] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('task');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignedTo, setAssignedTo] = useState(preselectedCrewId || '');
  const [dueDate, setDueDate] = useState('');
  const [requiresVerification, setRequiresVerification] = useState(false);

  useEffect(() => {
    if (open) {
      loadCrewMembers();
      if (preselectedCrewId) {
        setAssignedTo(preselectedCrewId);
      }
    }
  }, [open, preselectedCrewId]);

  async function loadCrewMembers() {
    if (!profile?.company_id) return;
    
    setLoadingCrew(true);
    try {
      let query = supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email, rank')
        .eq('company_id', profile.company_id)
        .order('last_name');

      // If vessel is selected, filter by crew assignments
      if (selectedVessel?.id) {
        const { data: assignments } = await supabase
          .from('crew_assignments')
          .select('user_id')
          .eq('vessel_id', selectedVessel.id)
          .eq('is_current', true);

        if (assignments?.length) {
          const userIds = assignments.map(a => a.user_id);
          query = query.in('user_id', userIds);
        }
      }

      const { data } = await query;
      setCrewMembers(data || []);
    } catch (error) {
      console.error('Failed to load crew:', error);
    } finally {
      setLoadingCrew(false);
    }
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setTaskType('task');
    setPriority('medium');
    setAssignedTo(preselectedCrewId || '');
    setDueDate('');
    setRequiresVerification(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !assignedTo) return;

    setSubmitting(true);
    try {
      const result = await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        task_type: taskType,
        priority,
        assigned_to: assignedTo,
        vessel_id: selectedVessel?.id,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        verification_required: requiresVerification,
      });

      if (result) {
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Assign Task
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details about the task..."
              rows={3}
            />
          </div>

          {/* Task Type & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Task Type</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={p.color}>{p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assign To */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Assign To *
            </Label>
            <Select value={assignedTo} onValueChange={setAssignedTo} disabled={loadingCrew}>
              <SelectTrigger>
                <SelectValue placeholder="Select crew member..." />
              </SelectTrigger>
              <SelectContent>
                {crewMembers.map((crew) => (
                  <SelectItem key={crew.user_id} value={crew.user_id}>
                    {crew.first_name} {crew.last_name}
                    {crew.rank && <span className="text-muted-foreground"> ({crew.rank})</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label htmlFor="dueDate" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Due Date
            </Label>
            <Input
              id="dueDate"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Vessel Context */}
          {selectedVessel && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              <Ship className="h-4 w-4" />
              Task will be assigned for vessel: <strong>{selectedVessel.name}</strong>
            </div>
          )}

          {/* Verification Required */}
          <div className="flex items-center justify-between py-2 border-t">
            <div>
              <Label htmlFor="verification">Requires Verification</Label>
              <p className="text-xs text-muted-foreground">
                Task must be verified by an officer after completion
              </p>
            </div>
            <Switch
              id="verification"
              checked={requiresVerification}
              onCheckedChange={setRequiresVerification}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !title.trim() || !assignedTo}>
              {submitting ? 'Assigning...' : 'Assign Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
