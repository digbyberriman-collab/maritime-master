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
import { useToast } from '@/shared/hooks/use-toast';

interface FleetGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  vessels: string[];
  manager?: string;
  region?: string;
  type: 'operational' | 'regional' | 'owner' | 'technical';
  created_at: string;
}

interface AddFleetGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupAdded: (group: FleetGroup) => void;
  editGroup?: FleetGroup | null;
}

const availableVessels = [
  'MV Atlantic Pioneer', 'MV Ocean Explorer', 'MV North Star', 'MV Pacific Voyager',
  'MV Eastern Dawn', 'MV Iron Duke', 'MV Grain Master', 'MV Coal Express',
  'MV Med Express', 'MV Tech Leader', 'MV Innovation', 'MV Southern Cross',
  'MV Arctic Wind', 'MV Tropical Storm', 'MV Desert Eagle'
];

const availableManagers = [
  'Captain Sarah Johnson', 'Captain Mike Rodriguez', 'Captain Robert Chen',
  'Captain Elena Rossi', 'Captain David Wilson', 'Chief Engineer Thomas Anderson',
  'Fleet Manager Lisa Thompson', 'Operations Manager John Davis'
];

const predefinedColors = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4',
  '#84CC16', '#F97316', '#EC4899', '#6366F1', '#14B8A6', '#A855F7'
];

const AddFleetGroupModal: React.FC<AddFleetGroupModalProps> = ({
  open,
  onOpenChange,
  onGroupAdded,
  editGroup
}) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: editGroup?.name || '',
    description: editGroup?.description || '',
    color: editGroup?.color || '#3B82F6',
    vessels: editGroup?.vessels || [],
    manager: editGroup?.manager || '',
    region: editGroup?.region || '',
    type: editGroup?.type || 'operational' as const
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Group name is required.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    if (formData.vessels.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please assign at least one vessel to this group.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    try {
      const newGroup: FleetGroup = {
        id: editGroup?.id || `group-${Date.now()}`,
        ...formData,
        created_at: editGroup?.created_at || new Date().toISOString()
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      onGroupAdded(newGroup);
      
      toast({
        title: editGroup ? 'Group Updated' : 'Group Created',
        description: `Fleet group "${formData.name}" has been ${editGroup ? 'updated' : 'created'} successfully.`,
      });

      // Reset form
      if (!editGroup) {
        setFormData({
          name: '',
          description: '',
          color: '#3B82F6',
          vessels: [],
          manager: '',
          region: '',
          type: 'operational'
        });
      }

      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save fleet group. Please try again.',
        variant: 'destructive',
      });
    }

    setLoading(false);
  };

  const handleVesselToggle = (vessel: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      vessels: checked
        ? [...prev.vessels, vessel]
        : prev.vessels.filter(v => v !== vessel)
    }));
  };

  const handleSelectAllVessels = () => {
    const allSelected = formData.vessels.length === availableVessels.length;
    setFormData(prev => ({
      ...prev,
      vessels: allSelected ? [] : [...availableVessels]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editGroup ? 'Edit Fleet Group' : 'Create Fleet Group'}
          </DialogTitle>
          <DialogDescription>
            {editGroup ? 'Update fleet group information and vessel assignments.' : 'Create a new fleet group and assign vessels.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Group Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                required
                placeholder="e.g., Atlantic Fleet"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={formData.type} onValueChange={(value: any) => setFormData(prev => ({...prev, type: value}))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operational">Operational</SelectItem>
                  <SelectItem value="regional">Regional</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
              rows={3}
              placeholder="Brief description of this fleet group..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manager">Fleet Manager</Label>
              <Select value={formData.manager} onValueChange={(value) => setFormData(prev => ({...prev, manager: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {availableManagers.map(manager => (
                    <SelectItem key={manager} value={manager}>
                      {manager}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                value={formData.region}
                onChange={(e) => setFormData(prev => ({...prev, region: e.target.value}))}
                placeholder="e.g., North Atlantic"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Group Color</Label>
            <div className="flex gap-2 flex-wrap">
              {predefinedColors.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 ${
                    formData.color === color ? 'border-gray-900' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData(prev => ({...prev, color}))}
                />
              ))}
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData(prev => ({...prev, color: e.target.value}))}
                className="w-16 h-8 p-1 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Vessel Assignment *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAllVessels}
              >
                {formData.vessels.length === availableVessels.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded p-3">
              {availableVessels.map((vessel) => (
                <div key={vessel} className="flex items-center space-x-2">
                  <Checkbox
                    id={vessel}
                    checked={formData.vessels.includes(vessel)}
                    onCheckedChange={(checked) => handleVesselToggle(vessel, !!checked)}
                  />
                  <Label htmlFor={vessel} className="text-sm cursor-pointer">
                    {vessel}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {formData.vessels.length} of {availableVessels.length} vessels selected
            </p>
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
              {loading ? 'Saving...' : (editGroup ? 'Update Group' : 'Create Group')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddFleetGroupModal;