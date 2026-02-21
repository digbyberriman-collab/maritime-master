import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMaintenance } from '@/modules/maintenance/hooks/useMaintenance';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import { TASK_TYPES, TASK_PRIORITY, generateTaskNumber } from '@/modules/maintenance/constants';

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedEquipmentId?: string;
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ 
  open, 
  onOpenChange,
  preselectedEquipmentId 
}) => {
  const { equipment, tasks, createTask } = useMaintenance();
  const { crew } = useCrew();

  const [formData, setFormData] = useState({
    equipment_id: preselectedEquipmentId || '',
    task_name: '',
    task_type: 'Inspection',
    due_date: '',
    scheduled_date: '',
    assigned_to_id: '',
    priority: 'Normal',
    work_description: '',
  });

  const resetForm = () => {
    setFormData({
      equipment_id: preselectedEquipmentId || '',
      task_name: '',
      task_type: 'Inspection',
      due_date: '',
      scheduled_date: '',
      assigned_to_id: '',
      priority: 'Normal',
      work_description: '',
    });
  };

  // Generate task number
  const getNextTaskNumber = () => {
    const year = new Date().getFullYear();
    const yearTasks = tasks.filter(t => t.task_number.includes(`MAINT-${year}`));
    const nextSequence = yearTasks.length + 1;
    return generateTaskNumber(year, nextSequence);
  };

  const handleSubmit = async () => {
    const taskNumber = getNextTaskNumber();

    await createTask.mutateAsync({
      task_number: taskNumber,
      equipment_id: formData.equipment_id,
      task_name: formData.task_name,
      task_type: formData.task_type,
      due_date: formData.due_date,
      scheduled_date: formData.scheduled_date || undefined,
      assigned_to_id: formData.assigned_to_id || undefined,
      priority: formData.priority,
      status: 'Pending',
      work_description: formData.work_description || undefined,
    });

    onOpenChange(false);
    resetForm();
  };

  const isValid = formData.equipment_id && formData.task_name && formData.due_date;

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={(open) => { onOpenChange(open); if (!open) resetForm(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Maintenance Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="equipment">Equipment *</Label>
            <Select
              value={formData.equipment_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, equipment_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select equipment" />
              </SelectTrigger>
              <SelectContent>
                {equipment.map(equip => (
                  <SelectItem key={equip.id} value={equip.id}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{equip.equipment_code}</span>
                      <span>{equip.equipment_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taskType">Task Type *</Label>
              <Select
                value={formData.task_type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, task_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITY.map(priority => (
                    <SelectItem key={priority.value} value={priority.value}>
                      {priority.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="taskName">Task Name *</Label>
            <Input
              id="taskName"
              value={formData.task_name}
              onChange={(e) => setFormData(prev => ({ ...prev, task_name: e.target.value }))}
              placeholder="e.g., Main Engine Oil Change"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input
                id="dueDate"
                type="date"
                min={today}
                value={formData.due_date}
                onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Scheduled Date</Label>
              <Input
                id="scheduledDate"
                type="date"
                min={today}
                value={formData.scheduled_date}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduled_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignedTo">Assign To</Label>
            <Select
              value={formData.assigned_to_id || "__unassigned__"}
              onValueChange={(value) => setFormData(prev => ({ ...prev, assigned_to_id: value === "__unassigned__" ? "" : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select crew member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {crew.map(member => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.first_name} {member.last_name} - {member.rank || 'Crew'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Work Description</Label>
            <Textarea
              id="description"
              value={formData.work_description}
              onChange={(e) => setFormData(prev => ({ ...prev, work_description: e.target.value }))}
              placeholder="Describe the maintenance work to be performed..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || createTask.isPending}>
            {createTask.isPending ? 'Creating...' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTaskModal;
