import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDrills } from '@/hooks/useDrills';
import { useVessels } from '@/hooks/useVessels';
import { Plus, Phone, Mail, Clock, Trash2, Edit } from 'lucide-react';
import { CONTACT_CATEGORIES } from '@/lib/drillConstants';

interface EmergencyContactsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EmergencyContactsModal: React.FC<EmergencyContactsModalProps> = ({ open, onOpenChange }) => {
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    vessel_id: '',
    contact_category: '',
    organization_name: '',
    contact_person: '',
    phone_primary: '',
    phone_secondary: '',
    email: '',
    available_24_7: false,
    notes: '',
    display_order: 0,
  });

  const { emergencyContacts, addContact, deleteContact } = useDrills();
  const { vessels } = useVessels();

  // Filter contacts by vessel
  const filteredContacts = selectedVessel === 'all' 
    ? emergencyContacts 
    : emergencyContacts.filter(c => c.vessel_id === selectedVessel);

  // Group contacts by category
  const groupedContacts = CONTACT_CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = filteredContacts.filter(c => c.contact_category === cat.value);
    return acc;
  }, {} as Record<string, typeof emergencyContacts>);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addContact({
      ...formData,
      display_order: emergencyContacts.length,
    });
    setShowAddForm(false);
    setFormData({
      vessel_id: '',
      contact_category: '',
      organization_name: '',
      contact_person: '',
      phone_primary: '',
      phone_secondary: '',
      email: '',
      available_24_7: false,
      notes: '',
      display_order: 0,
    });
  };

  const getCategoryLabel = (category: string) => {
    return CONTACT_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emergency Contacts</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="list">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="list">Contact List</TabsTrigger>
              <TabsTrigger value="add">Add Contact</TabsTrigger>
            </TabsList>
            
            <Select value={selectedVessel} onValueChange={setSelectedVessel}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Vessels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vessels</SelectItem>
                {vessels.map(vessel => (
                  <SelectItem key={vessel.id} value={vessel.id}>
                    {vessel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="list">
            {filteredContacts.length > 0 ? (
              <div className="space-y-4">
                {CONTACT_CATEGORIES.map(cat => {
                  const contacts = groupedContacts[cat.value] || [];
                  if (contacts.length === 0) return null;

                  return (
                    <div key={cat.value}>
                      <h4 className="font-medium text-sm text-muted-foreground mb-2">
                        {cat.label}
                      </h4>
                      <div className="space-y-2">
                        {contacts.map(contact => (
                          <div 
                            key={contact.id} 
                            className="p-4 border rounded-lg flex items-start justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{contact.organization_name}</p>
                                {contact.available_24_7 && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    24/7
                                  </Badge>
                                )}
                              </div>
                              {contact.contact_person && (
                                <p className="text-sm text-muted-foreground">
                                  {contact.contact_person}
                                </p>
                              )}
                              <div className="flex items-center gap-4 text-sm">
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  <a href={`tel:${contact.phone_primary}`} className="text-primary hover:underline">
                                    {contact.phone_primary}
                                  </a>
                                </div>
                                {contact.phone_secondary && (
                                  <div className="flex items-center gap-1">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    <a href={`tel:${contact.phone_secondary}`} className="hover:underline">
                                      {contact.phone_secondary}
                                    </a>
                                  </div>
                                )}
                                {contact.email && (
                                  <div className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                                      {contact.email}
                                    </a>
                                  </div>
                                )}
                              </div>
                              {contact.notes && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {contact.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => deleteContact(contact.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No emergency contacts configured</p>
                <p className="text-sm">Add contacts to have them available during emergencies</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="add">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vessel *</Label>
                  <Select 
                    value={formData.vessel_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, vessel_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vessel" />
                    </SelectTrigger>
                    <SelectContent>
                      {vessels.map(vessel => (
                        <SelectItem key={vessel.id} value={vessel.id}>
                          {vessel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select 
                    value={formData.contact_category} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, contact_category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Organization Name *</Label>
                  <Input
                    value={formData.organization_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, organization_name: e.target.value }))}
                    placeholder="e.g., US Coast Guard"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Contact Person</Label>
                  <Input
                    value={formData.contact_person}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary Phone *</Label>
                  <Input
                    value={formData.phone_primary}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone_primary: e.target.value }))}
                    placeholder="+1 234 567 8900"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Secondary Phone</Label>
                  <Input
                    value={formData.phone_secondary}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone_secondary: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="contact@organization.com"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="available_24_7"
                  checked={formData.available_24_7}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, available_24_7: checked as boolean }))}
                />
                <Label htmlFor="available_24_7">Available 24/7</Label>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional information..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="submit" disabled={!formData.vessel_id || !formData.contact_category || !formData.organization_name || !formData.phone_primary}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default EmergencyContactsModal;
