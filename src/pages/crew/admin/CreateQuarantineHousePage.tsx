import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface HouseFormState {
  name: string;
  address_line1: string;
  city: string;
  country: string;
  total_rooms: string;
  total_beds: string;
  daily_rate: string;
  rate_currency: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  wifi_available: boolean;
  kitchen_available: boolean;
  parking_available: boolean;
  airport_transfer_available: boolean;
  includes_meals: boolean;
  notes: string;
}

const initialFormState: HouseFormState = {
  name: '',
  address_line1: '',
  city: '',
  country: '',
  total_rooms: '1',
  total_beds: '1',
  daily_rate: '',
  rate_currency: 'USD',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  wifi_available: true,
  kitchen_available: false,
  parking_available: false,
  airport_transfer_available: false,
  includes_meals: false,
  notes: '',
};

export default function CreateQuarantineHousePage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<HouseFormState>(initialFormState);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile?.company_id) {
      toast({
        title: 'Error',
        description: 'Missing company context for this user',
        variant: 'destructive',
      });
      return;
    }

    const totalRooms = Number.parseInt(formData.total_rooms, 10);
    const totalBeds = Number.parseInt(formData.total_beds, 10);

    if (!formData.name || !formData.address_line1 || !formData.city || !formData.country || totalRooms < 1 || totalBeds < 1) {
      toast({
        title: 'Error',
        description: 'Please complete all required fields',
        variant: 'destructive',
      });
      return;
    }

    const payload: Database['public']['Tables']['quarantine_houses']['Insert'] = {
      company_id: profile.company_id,
      created_by: user?.id ?? null,
      name: formData.name.trim(),
      address_line1: formData.address_line1.trim(),
      city: formData.city.trim(),
      country: formData.country.trim(),
      total_rooms: totalRooms,
      total_beds: totalBeds,
      daily_rate: formData.daily_rate ? Number.parseFloat(formData.daily_rate) : null,
      rate_currency: formData.rate_currency,
      contact_name: formData.contact_name || null,
      contact_phone: formData.contact_phone || null,
      contact_email: formData.contact_email || null,
      wifi_available: formData.wifi_available,
      kitchen_available: formData.kitchen_available,
      parking_available: formData.parking_available,
      airport_transfer_available: formData.airport_transfer_available,
      includes_meals: formData.includes_meals,
      notes: formData.notes || null,
      is_active: true,
    };

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('quarantine_houses').insert(payload);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Quarantine house created successfully',
      });
      navigate('/crew/admin/quarantine');
    } catch (error) {
      console.error('Failed to create quarantine house:', error);
      toast({
        title: 'Error',
        description: 'Failed to create quarantine house',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Home className="w-6 h-6" />
            Add Quarantine House
          </h1>
          <p className="text-muted-foreground">Register a new accommodation option for crew travel operations</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>House Name *</Label>
              <Input
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g., Harbour Transit Suites"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address *</Label>
              <Input
                value={formData.address_line1}
                onChange={(event) => setFormData((prev) => ({ ...prev, address_line1: event.target.value }))}
                placeholder="Street and building number"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>City *</Label>
              <Input
                value={formData.city}
                onChange={(event) => setFormData((prev) => ({ ...prev, city: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Country *</Label>
              <Input
                value={formData.country}
                onChange={(event) => setFormData((prev) => ({ ...prev, country: event.target.value }))}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacity & Rate</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Total Rooms *</Label>
              <Input
                type="number"
                min={1}
                value={formData.total_rooms}
                onChange={(event) => setFormData((prev) => ({ ...prev, total_rooms: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Total Beds *</Label>
              <Input
                type="number"
                min={1}
                value={formData.total_beds}
                onChange={(event) => setFormData((prev) => ({ ...prev, total_beds: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Daily Rate</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={formData.daily_rate}
                onChange={(event) => setFormData((prev) => ({ ...prev, daily_rate: event.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={formData.rate_currency} onValueChange={(value) => setFormData((prev) => ({ ...prev, rate_currency: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="SGD">SGD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Amenities</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="wifi" className="cursor-pointer">WiFi Available</Label>
              <Switch id="wifi" checked={formData.wifi_available} onCheckedChange={(value) => setFormData((prev) => ({ ...prev, wifi_available: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="kitchen" className="cursor-pointer">Kitchen Available</Label>
              <Switch id="kitchen" checked={formData.kitchen_available} onCheckedChange={(value) => setFormData((prev) => ({ ...prev, kitchen_available: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="parking" className="cursor-pointer">Parking Available</Label>
              <Switch id="parking" checked={formData.parking_available} onCheckedChange={(value) => setFormData((prev) => ({ ...prev, parking_available: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="airport-transfer" className="cursor-pointer">Airport Transfer</Label>
              <Switch
                id="airport-transfer"
                checked={formData.airport_transfer_available}
                onCheckedChange={(value) => setFormData((prev) => ({ ...prev, airport_transfer_available: value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
              <Label htmlFor="meals" className="cursor-pointer">Meals Included</Label>
              <Switch id="meals" checked={formData.includes_meals} onCheckedChange={(value) => setFormData((prev) => ({ ...prev, includes_meals: value }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={formData.contact_name} onChange={(event) => setFormData((prev) => ({ ...prev, contact_name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formData.contact_phone} onChange={(event) => setFormData((prev) => ({ ...prev, contact_phone: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.contact_email} onChange={(event) => setFormData((prev) => ({ ...prev, contact_email: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                placeholder="Any additional context for logistics teams..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save House
          </Button>
        </div>
      </form>
    </div>
  );
}
