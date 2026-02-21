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
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { DEFECT_PRIORITY, OPERATIONAL_IMPACT, generateDefectNumber } from '@/modules/maintenance/constants';

interface LogDefectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedEquipmentId?: string;
}

const LogDefectModal: React.FC<LogDefectModalProps> = ({ 
  open, 
  onOpenChange,
  preselectedEquipmentId 
}) => {
  const { profile } = useAuth();
  const { vessels } = useVessels();
  const { equipment, defects, createDefect } = useMaintenance();

  const [formData, setFormData] = useState({
    vessel_id: '',
    equipment_id: preselectedEquipmentId || '',
    defect_description: '',
    priority: 'P3_Normal',
    operational_impact: 'No_Impact',
    temporary_repair: '',
    permanent_repair_plan: '',
    target_completion_date: '',
  });

  const resetForm = () => {
    setFormData({
      vessel_id: '',
      equipment_id: preselectedEquipmentId || '',
      defect_description: '',
      priority: 'P3_Normal',
      operational_impact: 'No_Impact',
      temporary_repair: '',
      permanent_repair_plan: '',
      target_completion_date: '',
    });
  };

  // Filter equipment by selected vessel
  const filteredEquipment = formData.vessel_id 
    ? equipment.filter(e => e.vessel_id === formData.vessel_id)
    : equipment;

  // Generate defect number
  const getNextDefectNumber = () => {
    const year = new Date().getFullYear();
    const yearDefects = defects.filter(d => d.defect_number.includes(`DEF-${year}`));
    const nextSequence = yearDefects.length + 1;
    return generateDefectNumber(year, nextSequence);
  };

  const handleSubmit = async () => {
    if (!profile?.user_id) return;

    const defectNumber = getNextDefectNumber();

    await createDefect.mutateAsync({
      defect_number: defectNumber,
      vessel_id: formData.vessel_id,
      equipment_id: formData.equipment_id || null,
      reported_by_id: profile.user_id,
      reported_date: new Date().toISOString(),
      defect_description: formData.defect_description,
      priority: formData.priority,
      operational_impact: formData.operational_impact,
      status: 'Open',
      temporary_repair: formData.temporary_repair || null,
      permanent_repair_plan: formData.permanent_repair_plan || null,
      target_completion_date: formData.target_completion_date || null,
      actual_completion_date: null,
      linked_maintenance_task_id: null,
      closed_by_id: null,
      attachments: [],
    });

    onOpenChange(false);
    resetForm();
  };

  const isValid = formData.vessel_id && formData.defect_description;

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={(open) => { onOpenChange(open); if (!open) resetForm(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log Defect</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vessel">Vessel *</Label>
              <Select
                value={formData.vessel_id}
                onValueChange={(value) => setFormData(prev => ({ 
                  ...prev, 
                  vessel_id: value,
                  equipment_id: '' // Reset equipment when vessel changes
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vessel" />
                </SelectTrigger>
                <SelectContent>
                  {vessels?.map(vessel => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment">Equipment (Optional)</Label>
              <Select
                value={formData.equipment_id || "__general__"}
                onValueChange={(value) => setFormData(prev => ({ ...prev, equipment_id: value === "__general__" ? "" : value }))}
                disabled={!formData.vessel_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__general__">General / No specific equipment</SelectItem>
                  {filteredEquipment.map(equip => (
                    <SelectItem key={equip.id} value={equip.id}>
                      {equip.equipment_code} - {equip.equipment_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Defect Description *</Label>
            <Textarea
              id="description"
              value={formData.defect_description}
              onChange={(e) => setFormData(prev => ({ ...prev, defect_description: e.target.value }))}
              placeholder="Describe the defect in detail..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFECT_PRIORITY.map(priority => (
                    <SelectItem key={priority.value} value={priority.value}>
                      <div>
                        <span className="font-medium">{priority.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="impact">Operational Impact *</Label>
              <Select
                value={formData.operational_impact}
                onValueChange={(value) => setFormData(prev => ({ ...prev, operational_impact: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATIONAL_IMPACT.map(impact => (
                    <SelectItem key={impact.value} value={impact.value}>
                      {impact.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tempRepair">Temporary Repair (if any)</Label>
            <Textarea
              id="tempRepair"
              value={formData.temporary_repair}
              onChange={(e) => setFormData(prev => ({ ...prev, temporary_repair: e.target.value }))}
              placeholder="Describe any temporary measures taken..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="permRepair">Permanent Repair Plan</Label>
            <Textarea
              id="permRepair"
              value={formData.permanent_repair_plan}
              onChange={(e) => setFormData(prev => ({ ...prev, permanent_repair_plan: e.target.value }))}
              placeholder="Describe the planned permanent repair..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetDate">Target Completion Date</Label>
            <Input
              id="targetDate"
              type="date"
              min={today}
              value={formData.target_completion_date}
              onChange={(e) => setFormData(prev => ({ ...prev, target_completion_date: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || createDefect.isPending}>
            {createDefect.isPending ? 'Logging...' : 'Log Defect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogDefectModal;
