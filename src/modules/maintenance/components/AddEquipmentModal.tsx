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
import { Checkbox } from '@/components/ui/checkbox';
import { useMaintenance } from '@/modules/maintenance/hooks/useMaintenance';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { EQUIPMENT_CRITICALITY, EQUIPMENT_STATUS } from '@/modules/maintenance/constants';
import { Plus, X } from 'lucide-react';

interface AddEquipmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddEquipmentModal: React.FC<AddEquipmentModalProps> = ({ open, onOpenChange }) => {
  const { flatCategories, createEquipment } = useMaintenance();
  const { vessels } = useVessels();

  const [formData, setFormData] = useState({
    vessel_id: '',
    category_id: '',
    equipment_name: '',
    equipment_code: '',
    location: '',
    manufacturer: '',
    model: '',
    serial_number: '',
    installation_date: '',
    warranty_expiry: '',
    criticality: 'Non_Critical',
    status: 'Operational',
    running_hours_total: 0,
    trackRunningHours: false,
  });

  const [specifications, setSpecifications] = useState<Array<{ key: string; value: string }>>([]);

  const resetForm = () => {
    setFormData({
      vessel_id: '',
      category_id: '',
      equipment_name: '',
      equipment_code: '',
      location: '',
      manufacturer: '',
      model: '',
      serial_number: '',
      installation_date: '',
      warranty_expiry: '',
      criticality: 'Non_Critical',
      status: 'Operational',
      running_hours_total: 0,
      trackRunningHours: false,
    });
    setSpecifications([]);
  };

  // Generate equipment code suggestion based on category
  const generateCodeSuggestion = (categoryId: string) => {
    const category = flatCategories.find(c => c.id === categoryId);
    if (!category) return '';
    
    const prefix = category.category_name.substring(0, 3).toUpperCase();
    return `${prefix}-001`;
  };

  const handleCategoryChange = (categoryId: string) => {
    setFormData(prev => ({
      ...prev,
      category_id: categoryId,
      equipment_code: prev.equipment_code || generateCodeSuggestion(categoryId),
    }));
  };

  const addSpecification = () => {
    setSpecifications(prev => [...prev, { key: '', value: '' }]);
  };

  const updateSpecification = (index: number, field: 'key' | 'value', value: string) => {
    setSpecifications(prev => prev.map((spec, i) => 
      i === index ? { ...spec, [field]: value } : spec
    ));
  };

  const removeSpecification = (index: number) => {
    setSpecifications(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const specsObject = specifications.reduce((acc, spec) => {
      if (spec.key.trim()) {
        acc[spec.key.trim()] = spec.value.trim();
      }
      return acc;
    }, {} as Record<string, string>);

    await createEquipment.mutateAsync({
      vessel_id: formData.vessel_id,
      category_id: formData.category_id,
      equipment_name: formData.equipment_name,
      equipment_code: formData.equipment_code,
      location: formData.location || null,
      manufacturer: formData.manufacturer || null,
      model: formData.model || null,
      serial_number: formData.serial_number || null,
      installation_date: formData.installation_date || null,
      warranty_expiry: formData.warranty_expiry || null,
      criticality: formData.criticality,
      status: formData.status,
      running_hours_total: formData.trackRunningHours ? formData.running_hours_total : 0,
      running_hours_last_updated: formData.trackRunningHours ? new Date().toISOString() : null,
      specifications: Object.keys(specsObject).length > 0 ? specsObject : null,
      manual_url: null,
      photo_url: null,
    });

    onOpenChange(false);
    resetForm();
  };

  const isValid = formData.vessel_id && formData.category_id && formData.equipment_name && formData.equipment_code;

  return (
    <Dialog open={open} onOpenChange={(open) => { onOpenChange(open); if (!open) resetForm(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Equipment</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Basic Information</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vessel">Vessel *</Label>
                <Select
                  value={formData.vessel_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, vessel_id: value }))}
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
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={handleCategoryChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {flatCategories.map(category => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.parent_category_id ? '— ' : ''}{category.category_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Equipment Name *</Label>
                <Input
                  id="name"
                  value={formData.equipment_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, equipment_name: e.target.value }))}
                  placeholder="e.g., Main Engine No. 1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Equipment Code *</Label>
                <Input
                  id="code"
                  value={formData.equipment_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, equipment_code: e.target.value }))}
                  placeholder="e.g., ME-001"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location on Vessel</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Engine Room, Port Side"
              />
            </div>
          </div>

          {/* Manufacturer Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Manufacturer Details</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
                  placeholder="e.g., MAN, Caterpillar"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="e.g., 6L21/31"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serial">Serial Number</Label>
                <Input
                  id="serial"
                  value={formData.serial_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, serial_number: e.target.value }))}
                  placeholder="e.g., SN123456"
                />
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Dates</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="installation">Installation Date</Label>
                <Input
                  id="installation"
                  type="date"
                  value={formData.installation_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, installation_date: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="warranty">Warranty Expiry</Label>
                <Input
                  id="warranty"
                  type="date"
                  value={formData.warranty_expiry}
                  onChange={(e) => setFormData(prev => ({ ...prev, warranty_expiry: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Classification</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="criticality">Criticality *</Label>
                <Select
                  value={formData.criticality}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, criticality: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_CRITICALITY.map(crit => (
                      <SelectItem key={crit.value} value={crit.value}>
                        <div>
                          <span className="font-medium">{crit.label}</span>
                          <span className="text-muted-foreground text-xs ml-2">
                            {crit.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_STATUS.map(status => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Running Hours */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="trackHours"
                checked={formData.trackRunningHours}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, trackRunningHours: checked === true }))}
              />
              <Label htmlFor="trackHours">Track Running Hours</Label>
            </div>

            {formData.trackRunningHours && (
              <div className="space-y-2">
                <Label htmlFor="hours">Current Running Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  value={formData.running_hours_total}
                  onChange={(e) => setFormData(prev => ({ ...prev, running_hours_total: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {/* Specifications */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm text-muted-foreground">Specifications</h3>
              <Button variant="outline" size="sm" onClick={addSpecification}>
                <Plus className="h-4 w-4 mr-1" />
                Add Field
              </Button>
            </div>

            {specifications.map((spec, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Key (e.g., Power)"
                  value={spec.key}
                  onChange={(e) => updateSpecification(index, 'key', e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Value (e.g., 1000kW)"
                  value={spec.value}
                  onChange={(e) => updateSpecification(index, 'value', e.target.value)}
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => removeSpecification(index)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || createEquipment.isPending}>
            {createEquipment.isPending ? 'Adding...' : 'Add Equipment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddEquipmentModal;
