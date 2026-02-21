import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Equipment, EquipmentCategory } from '@/modules/maintenance/hooks/useMaintenance';
import { TASK_TYPES, INTERVAL_TYPES, RESPONSIBLE_ROLES } from '@/modules/maintenance/constants';
import { RefreshCw, Clock, Users, Wrench } from 'lucide-react';

interface TaskTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment[];
  categories: EquipmentCategory[];
  onSave: (template: TaskTemplateData) => void;
  editingTemplate?: TaskTemplateData | null;
}

export interface TaskTemplateData {
  id?: string;
  task_name: string;
  task_type: string;
  task_description: string;
  interval_type: string;
  interval_value: number;
  equipment_id: string | null;
  category_id: string | null;
  responsible_role: string;
  estimated_duration_minutes: number;
  safety_precautions: string;
  required_tools: string[];
  required_spares: string[];
  is_active: boolean;
}

const TaskTemplateModal: React.FC<TaskTemplateModalProps> = ({
  open,
  onOpenChange,
  equipment,
  categories,
  onSave,
  editingTemplate,
}) => {
  const [formData, setFormData] = useState<TaskTemplateData>({
    task_name: editingTemplate?.task_name || '',
    task_type: editingTemplate?.task_type || 'Inspection',
    task_description: editingTemplate?.task_description || '',
    interval_type: editingTemplate?.interval_type || 'Months',
    interval_value: editingTemplate?.interval_value || 3,
    equipment_id: editingTemplate?.equipment_id || null,
    category_id: editingTemplate?.category_id || null,
    responsible_role: editingTemplate?.responsible_role || 'Chief_Engineer',
    estimated_duration_minutes: editingTemplate?.estimated_duration_minutes || 60,
    safety_precautions: editingTemplate?.safety_precautions || '',
    required_tools: editingTemplate?.required_tools || [],
    required_spares: editingTemplate?.required_spares || [],
    is_active: editingTemplate?.is_active ?? true,
  });

  const [toolsInput, setToolsInput] = useState(formData.required_tools.join(', '));
  const [sparesInput, setSparesInput] = useState(formData.required_spares.join(', '));
  const [applyTo, setApplyTo] = useState<'equipment' | 'category'>('equipment');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const templateData: TaskTemplateData = {
      ...formData,
      required_tools: toolsInput.split(',').map(t => t.trim()).filter(Boolean),
      required_spares: sparesInput.split(',').map(s => s.trim()).filter(Boolean),
      equipment_id: applyTo === 'equipment' ? formData.equipment_id : null,
      category_id: applyTo === 'category' ? formData.category_id : null,
    };

    onSave(templateData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {editingTemplate ? 'Edit Task Template' : 'Create Task Template'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task_name">Task Name *</Label>
                <Input
                  id="task_name"
                  value={formData.task_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, task_name: e.target.value }))}
                  placeholder="e.g., Main Engine Oil Change"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_type">Task Type *</Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="task_description">Description</Label>
              <Textarea
                id="task_description"
                value={formData.task_description}
                onChange={(e) => setFormData(prev => ({ ...prev, task_description: e.target.value }))}
                placeholder="Detailed description of the maintenance task..."
                rows={3}
              />
            </div>
          </div>

          {/* Interval Settings */}
          <div className="space-y-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" />
              <span className="font-medium">Recurring Interval</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Interval Type</Label>
                <Select 
                  value={formData.interval_type} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, interval_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interval_value">
                  {formData.interval_type === 'Hours' ? 'Every (hours)' : 
                   formData.interval_type === 'Days' ? 'Every (days)' :
                   formData.interval_type === 'Months' ? 'Every (months)' :
                   formData.interval_type === 'Annual' ? 'Every (years)' : 'Value'}
                </Label>
                <Input
                  id="interval_value"
                  type="number"
                  min={1}
                  value={formData.interval_value}
                  onChange={(e) => setFormData(prev => ({ ...prev, interval_value: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>
          </div>

          {/* Apply To */}
          <div className="space-y-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="h-4 w-4" />
              <span className="font-medium">Apply Template To</span>
            </div>
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="applyTo" 
                  checked={applyTo === 'equipment'}
                  onChange={() => setApplyTo('equipment')}
                  className="form-radio"
                />
                <span>Specific Equipment</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="applyTo" 
                  checked={applyTo === 'category'}
                  onChange={() => setApplyTo('category')}
                  className="form-radio"
                />
                <span>Equipment Category</span>
              </label>
            </div>

            {applyTo === 'equipment' ? (
              <div className="space-y-2">
                <Label>Equipment</Label>
                <Select 
                  value={formData.equipment_id || ''} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, equipment_id: value || null }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select equipment..." />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment.map(eq => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.equipment_code} - {eq.equipment_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Category (applies to all equipment in category)</Label>
                <Select 
                  value={formData.category_id || ''} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value || null }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.category_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Responsibility & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Responsible Role
              </Label>
              <Select 
                value={formData.responsible_role} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, responsible_role: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSIBLE_ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Estimated Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                value={formData.estimated_duration_minutes}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  estimated_duration_minutes: parseInt(e.target.value) || 60 
                }))}
              />
            </div>
          </div>

          {/* Tools & Spares */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tools">Required Tools (comma-separated)</Label>
              <Textarea
                id="tools"
                value={toolsInput}
                onChange={(e) => setToolsInput(e.target.value)}
                placeholder="Wrench, Torque meter, Safety glasses..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spares">Required Spares (comma-separated)</Label>
              <Textarea
                id="spares"
                value={sparesInput}
                onChange={(e) => setSparesInput(e.target.value)}
                placeholder="Oil filter, Gasket set..."
                rows={2}
              />
            </div>
          </div>

          {/* Safety Precautions */}
          <div className="space-y-2">
            <Label htmlFor="safety">Safety Precautions</Label>
            <Textarea
              id="safety"
              value={formData.safety_precautions}
              onChange={(e) => setFormData(prev => ({ ...prev, safety_precautions: e.target.value }))}
              placeholder="Safety requirements and precautions..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TaskTemplateModal;
