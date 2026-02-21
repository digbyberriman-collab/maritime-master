import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Building2, MapPin,
  Users, DollarSign, Phone, Wifi, UtensilsCrossed,
  Car, Plane, WashingMachine, FileText
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function AddQuarantineHousePage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state_province: '',
    postal_code: '',
    country: '',
    total_rooms: 0,
    total_beds: 0,
    daily_rate: '',
    rate_currency: 'USD',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    wifi_available: false,
    kitchen_available: false,
    parking_available: false,
    includes_meals: false,
    airport_transfer_available: false,
    laundry_available: false,
    check_in_instructions: '',
    house_rules: '',
    notes: '',
  });

  function updateField(field: string, value: string | number | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim() || !formData.address_line1.trim() || !formData.city.trim() || !formData.country.trim()) {
      toast.error('Please fill in all required fields: Name, Address, City, and Country.');
      return;
    }

    if (!profile?.company_id) {
      toast.error('Company information is missing. Please try again.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('quarantine_houses')
        .insert({
          name: formData.name.trim(),
          address_line1: formData.address_line1.trim(),
          address_line2: formData.address_line2.trim() || null,
          city: formData.city.trim(),
          state_province: formData.state_province.trim() || null,
          postal_code: formData.postal_code.trim() || null,
          country: formData.country.trim(),
          total_rooms: formData.total_rooms,
          total_beds: formData.total_beds,
          daily_rate: formData.daily_rate ? parseFloat(formData.daily_rate) : null,
          rate_currency: formData.rate_currency,
          contact_name: formData.contact_name.trim() || null,
          contact_phone: formData.contact_phone.trim() || null,
          contact_email: formData.contact_email.trim() || null,
          wifi_available: formData.wifi_available,
          kitchen_available: formData.kitchen_available,
          parking_available: formData.parking_available,
          includes_meals: formData.includes_meals,
          airport_transfer_available: formData.airport_transfer_available,
          laundry_available: formData.laundry_available,
          check_in_instructions: formData.check_in_instructions.trim() || null,
          house_rules: formData.house_rules.trim() || null,
          notes: formData.notes.trim() || null,
          company_id: profile.company_id,
          created_by: user?.id || null,
          is_active: true,
        });

      if (error) throw error;

      toast.success('Quarantine house created successfully.');
      navigate('/crew/admin/quarantine');
    } catch (error) {
      console.error('Failed to create quarantine house:', error);
      toast.error('Failed to create quarantine house. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/crew/admin/quarantine')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            Add Quarantine House
          </h1>
          <p className="text-muted-foreground">Register a new quarantine accommodation facility</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g., Seaside Quarantine Lodge"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address_line1">Address Line 1 *</Label>
                <Input
                  id="address_line1"
                  value={formData.address_line1}
                  onChange={(e) => updateField('address_line1', e.target.value)}
                  placeholder="Street address"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_line2">Address Line 2</Label>
                <Input
                  id="address_line2"
                  value={formData.address_line2}
                  onChange={(e) => updateField('address_line2', e.target.value)}
                  placeholder="Suite, unit, building, etc."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="e.g., Singapore"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state_province">State / Province</Label>
                <Input
                  id="state_province"
                  value={formData.state_province}
                  onChange={(e) => updateField('state_province', e.target.value)}
                  placeholder="e.g., California"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postal_code">Postal Code</Label>
                <Input
                  id="postal_code"
                  value={formData.postal_code}
                  onChange={(e) => updateField('postal_code', e.target.value)}
                  placeholder="e.g., 049318"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => updateField('country', e.target.value)}
                placeholder="e.g., Singapore"
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Capacity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Capacity
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total_rooms">Total Rooms</Label>
              <Input
                id="total_rooms"
                type="number"
                min={0}
                value={formData.total_rooms}
                onChange={(e) => updateField('total_rooms', parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_beds">Total Beds</Label>
              <Input
                id="total_beds"
                type="number"
                min={0}
                value={formData.total_beds}
                onChange={(e) => updateField('total_beds', parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="daily_rate">Daily Rate</Label>
              <Input
                id="daily_rate"
                type="number"
                step="0.01"
                min={0}
                value={formData.daily_rate}
                onChange={(e) => updateField('daily_rate', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate_currency">Currency</Label>
              <Select
                value={formData.rate_currency}
                onValueChange={(v) => updateField('rate_currency', v)}
              >
                <SelectTrigger id="rate_currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                  <SelectItem value="SGD">SGD - Singapore Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact Name</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => updateField('contact_name', e.target.value)}
                placeholder="e.g., John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Phone</Label>
              <Input
                id="contact_phone"
                type="tel"
                value={formData.contact_phone}
                onChange={(e) => updateField('contact_phone', e.target.value)}
                placeholder="e.g., +65 1234 5678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">Email</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => updateField('contact_email', e.target.value)}
                placeholder="e.g., contact@lodge.com"
              />
            </div>
          </CardContent>
        </Card>

        {/* Amenities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="w-4 h-4" />
              Amenities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="wifi_available" className="flex items-center gap-2 cursor-pointer">
                  <Wifi className="w-4 h-4 text-muted-foreground" />
                  WiFi Available
                </Label>
                <Switch
                  id="wifi_available"
                  checked={formData.wifi_available}
                  onCheckedChange={(v) => updateField('wifi_available', v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="kitchen_available" className="flex items-center gap-2 cursor-pointer">
                  <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
                  Kitchen Available
                </Label>
                <Switch
                  id="kitchen_available"
                  checked={formData.kitchen_available}
                  onCheckedChange={(v) => updateField('kitchen_available', v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="parking_available" className="flex items-center gap-2 cursor-pointer">
                  <Car className="w-4 h-4 text-muted-foreground" />
                  Parking Available
                </Label>
                <Switch
                  id="parking_available"
                  checked={formData.parking_available}
                  onCheckedChange={(v) => updateField('parking_available', v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="includes_meals" className="flex items-center gap-2 cursor-pointer">
                  <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
                  Meals Included
                </Label>
                <Switch
                  id="includes_meals"
                  checked={formData.includes_meals}
                  onCheckedChange={(v) => updateField('includes_meals', v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="airport_transfer_available" className="flex items-center gap-2 cursor-pointer">
                  <Plane className="w-4 h-4 text-muted-foreground" />
                  Airport Transfer
                </Label>
                <Switch
                  id="airport_transfer_available"
                  checked={formData.airport_transfer_available}
                  onCheckedChange={(v) => updateField('airport_transfer_available', v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="laundry_available" className="flex items-center gap-2 cursor-pointer">
                  <WashingMachine className="w-4 h-4 text-muted-foreground" />
                  Laundry Available
                </Label>
                <Switch
                  id="laundry_available"
                  checked={formData.laundry_available}
                  onCheckedChange={(v) => updateField('laundry_available', v)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Additional Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="check_in_instructions">Check-in Instructions</Label>
              <Textarea
                id="check_in_instructions"
                value={formData.check_in_instructions}
                onChange={(e) => updateField('check_in_instructions', e.target.value)}
                placeholder="e.g., Check-in at the front desk with valid ID. Key collection available 24/7."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="house_rules">House Rules</Label>
              <Textarea
                id="house_rules"
                value={formData.house_rules}
                onChange={(e) => updateField('house_rules', e.target.value)}
                placeholder="e.g., No smoking indoors. Quiet hours from 10 PM to 7 AM."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Any additional notes about this facility..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate('/crew/admin/quarantine')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Create Quarantine House
          </Button>
        </div>
      </form>
    </div>
  );
}
