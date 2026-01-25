import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMaintenance } from '@/hooks/useMaintenance';
import { useVessels } from '@/hooks/useVessels';
import { Plus, Search, AlertTriangle, Edit, Package } from 'lucide-react';

const SparePartsTab: React.FC = () => {
  const { spareParts, createSparePart, updateSparePart } = useMaintenance();
  const { vessels } = useVessels();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPart, setEditingPart] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    vessel_id: '',
    part_number: '',
    part_name: '',
    manufacturer: '',
    quantity_onboard: 0,
    minimum_stock: 0,
    unit_cost: 0,
    location_onboard: '',
    supplier: '',
    notes: '',
  });

  const resetForm = () => {
    setFormData({
      vessel_id: '',
      part_number: '',
      part_name: '',
      manufacturer: '',
      quantity_onboard: 0,
      minimum_stock: 0,
      unit_cost: 0,
      location_onboard: '',
      supplier: '',
      notes: '',
    });
    setEditingPart(null);
  };

  const filteredParts = spareParts.filter(part => 
    part.part_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.part_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (part.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const handleSubmit = async () => {
    if (editingPart) {
      await updateSparePart.mutateAsync({
        id: editingPart,
        ...formData,
        equipment_ids: [],
        last_ordered_date: null,
      });
    } else {
      await createSparePart.mutateAsync({
        ...formData,
        equipment_ids: [],
        last_ordered_date: null,
      });
    }
    setShowAddModal(false);
    resetForm();
  };

  const openEditModal = (partId: string) => {
    const part = spareParts.find(p => p.id === partId);
    if (part) {
      setFormData({
        vessel_id: part.vessel_id,
        part_number: part.part_number,
        part_name: part.part_name,
        manufacturer: part.manufacturer || '',
        quantity_onboard: part.quantity_onboard,
        minimum_stock: part.minimum_stock,
        unit_cost: part.unit_cost || 0,
        location_onboard: part.location_onboard || '',
        supplier: part.supplier || '',
        notes: part.notes || '',
      });
      setEditingPart(partId);
      setShowAddModal(true);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Spare Parts Inventory</CardTitle>
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Spare Part
            </Button>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by part name, number, manufacturer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredParts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No spare parts found</p>
              <Button variant="link" onClick={() => setShowAddModal(true)}>
                Add your first spare part
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Qty Onboard</TableHead>
                  <TableHead>Min Stock</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParts.map((part) => {
                  const isLowStock = part.quantity_onboard <= part.minimum_stock;

                  return (
                    <TableRow key={part.id}>
                      <TableCell className="font-mono font-medium">
                        {part.part_number}
                      </TableCell>
                      <TableCell>{part.part_name}</TableCell>
                      <TableCell>{part.vessel?.name || '—'}</TableCell>
                      <TableCell>{part.manufacturer || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={isLowStock ? 'text-critical font-medium' : ''}>
                            {part.quantity_onboard}
                          </span>
                          {isLowStock && (
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{part.minimum_stock}</TableCell>
                      <TableCell>{part.location_onboard || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openEditModal(part.id)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Spare Part Modal */}
      <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPart ? 'Edit Spare Part' : 'Add Spare Part'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partNumber">Part Number *</Label>
                <Input
                  id="partNumber"
                  value={formData.part_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, part_number: e.target.value }))}
                  placeholder="e.g., FLT-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partName">Part Name *</Label>
                <Input
                  id="partName"
                  value={formData.part_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, part_name: e.target.value }))}
                  placeholder="e.g., Oil Filter"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => setFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
                placeholder="e.g., Caterpillar"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Qty Onboard</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity_onboard}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity_onboard: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minStock">Min Stock</Label>
                <Input
                  id="minStock"
                  type="number"
                  value={formData.minimum_stock}
                  onChange={(e) => setFormData(prev => ({ ...prev, minimum_stock: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Unit Cost ($)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  value={formData.unit_cost}
                  onChange={(e) => setFormData(prev => ({ ...prev, unit_cost: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Location Onboard</Label>
                <Input
                  id="location"
                  value={formData.location_onboard}
                  onChange={(e) => setFormData(prev => ({ ...prev, location_onboard: e.target.value }))}
                  placeholder="e.g., Engine Room Store"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                  placeholder="e.g., Marine Supplies Co."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!formData.vessel_id || !formData.part_number || !formData.part_name}
            >
              {editingPart ? 'Save Changes' : 'Add Part'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SparePartsTab;
