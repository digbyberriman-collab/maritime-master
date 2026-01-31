import React, { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface MaintenanceDefect {
  id: string;
  defect_number: string;
  vessel: string;
  equipment: string;
  location: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'pending_parts' | 'completed' | 'cancelled';
  ism_critical: boolean;
  reported_date: string;
  reported_by: string;
  assigned_to?: string;
  target_completion: string;
  completion_date?: string;
  estimated_cost?: number;
  actual_cost?: number;
  spare_parts_required?: string[];
  created_at: string;
  updated_at: string;
}

interface AddDefectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDefectAdded: (defect: MaintenanceDefect) => void;
  editDefect?: MaintenanceDefect | null;
}

const vessels = [
  'MV Atlantic Pioneer', 'MV Ocean Explorer', 'MV North Star', 'MV Pacific Voyager',
  'MV Eastern Dawn', 'MV Iron Duke', 'MV Grain Master', 'MV Coal Express'
];

const equipmentTypes = [
  'Main Engine', 'Auxiliary Engine', 'Generator', 'Fire Pump', 'Steering Gear',
  'Navigation Radar', 'Windlass', 'Deck Crane', 'Ballast Pump', 'HVAC System',
  'Life Boat Davit', 'Safety Equipment', 'Electrical System', 'Boiler'
];

const locations = [
  'Engine Room', 'Bridge', 'Main Deck', 'Steering Gear Room', 'Cargo Hold',
  'Accommodation', 'Galley', 'Emergency Generator Room', 'Boat Deck'
];

const engineers = [
  'Chief Engineer Mike Rodriguez', 'Second Engineer Robert Chen', 'Third Engineer David Wilson',
  'Chief Engineer Elena Rossi', 'Second Engineer Anna Martinez', 'Third Engineer Carlos Lopez'
];

const AddDefectModal: React.FC<AddDefectModalProps> = ({
  open,
  onOpenChange,
  onDefectAdded,
  editDefect
}) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    vessel: editDefect?.vessel || '',
    equipment: editDefect?.equipment || '',
    location: editDefect?.location || '',
    description: editDefect?.description || '',
    priority: editDefect?.priority || 'medium' as const,
    status: editDefect?.status || 'open' as const,
    ism_critical: editDefect?.ism_critical || false,
    reported_by: editDefect?.reported_by || '',
    assigned_to: editDefect?.assigned_to || '',
    target_completion: editDefect?.target_completion ? 
      new Date(editDefect.target_completion).toISOString().split('T')[0] : 
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
    estimated_cost: editDefect?.estimated_cost || '',
    spare_parts_required: editDefect?.spare_parts_required?.join(', ') || ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (!formData.vessel || !formData.equipment || !formData.description.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    try {
      const defectNumber = editDefect?.defect_number || `DEF-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      
      const newDefect: MaintenanceDefect = {
        id: editDefect?.id || `defect-${Date.now()}`,
        defect_number: defectNumber,
        ...formData,
        estimated_cost: formData.estimated_cost ? Number(formData.estimated_cost) : undefined,
        spare_parts_required: formData.spare_parts_required 
          ? formData.spare_parts_required.split(',').map(part => part.trim()).filter(Boolean)
          : [],
        target_completion: new Date(formData.target_completion).toISOString(),
        reported_date: editDefect?.reported_date || new Date().toISOString(),
        completion_date: editDefect?.completion_date,
        actual_cost: editDefect?.actual_cost,
        created_at: editDefect?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      onDefectAdded(newDefect);
      
      toast({
        title: editDefect ? 'Defect Updated' : 'Defect Reported',
        description: `Defect ${defectNumber} has been ${editDefect ? 'updated' : 'reported'} successfully.`,
      });

      // Reset form
      if (!editDefect) {
        setFormData({
          vessel: '',
          equipment: '',
          location: '',
          description: '',
          priority: 'medium',
          status: 'open',
          ism_critical: false,
          reported_by: '',
          assigned_to: '',
          target_completion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          estimated_cost: '',
          spare_parts_required: ''
        });
      }

      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save defect. Please try again.',
        variant: 'destructive',
      });
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editDefect ? 'Update Defect' : 'Report New Defect'}
          </DialogTitle>
          <DialogDescription>
            {editDefect ? 'Update defect information and status.' : 'Report a new maintenance defect for tracking and resolution.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vessel">Vessel *</Label>
              <Select value={formData.vessel} onValueChange={(value) => setFormData(prev => ({...prev, vessel: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vessel" />
                </SelectTrigger>
                <SelectContent>
                  {vessels.map(vessel => (
                    <SelectItem key={vessel} value={vessel}>
                      {vessel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment">Equipment *</Label>
              <Select value={formData.equipment} onValueChange={(value) => setFormData(prev => ({...prev, equipment: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  {equipmentTypes.map(equipment => (
                    <SelectItem key={equipment} value={equipment}>
                      {equipment}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Select value={formData.location} onValueChange={(value) => setFormData(prev => ({...prev, location: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(location => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={formData.priority} onValueChange={(value: any) => setFormData(prev => ({...prev, priority: value}))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
              rows={3}
              placeholder="Detailed description of the defect, symptoms, and any immediate actions taken..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reported_by">Reported By</Label>
              <Input
                id="reported_by"
                value={formData.reported_by}
                onChange={(e) => setFormData(prev => ({...prev, reported_by: e.target.value}))}
                placeholder="Name of person reporting"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigned_to">Assign To</Label>
              <Select value={formData.assigned_to} onValueChange={(value) => setFormData(prev => ({...prev, assigned_to: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select engineer" />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map(engineer => (
                    <SelectItem key={engineer} value={engineer}>
                      {engineer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target_completion">Target Completion Date</Label>
              <Input
                id="target_completion"
                type="date"
                value={formData.target_completion}
                onChange={(e) => setFormData(prev => ({...prev, target_completion: e.target.value}))}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimated_cost">Estimated Cost ($)</Label>
              <Input
                id="estimated_cost"
                type="number"
                value={formData.estimated_cost}
                onChange={(e) => setFormData(prev => ({...prev, estimated_cost: e.target.value}))}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spare_parts">Spare Parts Required</Label>
            <Input
              id="spare_parts"
              value={formData.spare_parts_required}
              onChange={(e) => setFormData(prev => ({...prev, spare_parts_required: e.target.value}))}
              placeholder="Comma-separated list of required spare parts"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value: any) => setFormData(prev => ({...prev, status: value}))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="pending_parts">Pending Parts</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-8">
              <Checkbox
                id="ism_critical"
                checked={formData.ism_critical}
                onCheckedChange={(checked) => setFormData(prev => ({...prev, ism_critical: !!checked}))}
              />
              <Label htmlFor="ism_critical" className="cursor-pointer">
                ISM Critical Equipment
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : (editDefect ? 'Update Defect' : 'Report Defect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddDefectModal;