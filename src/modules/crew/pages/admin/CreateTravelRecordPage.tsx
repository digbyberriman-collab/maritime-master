import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plane, ArrowLeft, Save, Loader2, User, 
  Ship, Calendar, MapPin, Home, DollarSign
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
import { useToast } from '@/shared/hooks/use-toast';

export default function CreateTravelRecordPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [crewMembers, setCrewMembers] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [quarantineHouses, setQuarantineHouses] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    crew_member_id: '',
    vessel_id: '',
    travel_type: 'join',
    status: 'planned',
    departure_date: '',
    arrival_date: '',
    origin_city: '',
    origin_country: '',
    origin_airport_code: '',
    destination_city: '',
    destination_country: '',
    destination_airport_code: '',
    joining_vessel: false,
    leaving_vessel: false,
    handover_notes: '',
    pickup_required: false,
    pickup_location: '',
    accommodation_required: false,
    accommodation_id: '',
    travel_agent: '',
    booking_reference: '',
    total_cost: '',
    cost_currency: 'USD',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [crewRes, vesselsRes, housesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, first_name, last_name').order('last_name'),
        supabase.from('vessels').select('id, name').order('name'),
        supabase.from('quarantine_houses').select('id, name, city, country').eq('is_active', true),
      ]);

      setCrewMembers(crewRes.data || []);
      setVessels(vesselsRes.data || []);
      setQuarantineHouses(housesRes.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.crew_member_id || !formData.departure_date) {
      toast({
        title: 'Error',
        description: 'Please fill in required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('crew_travel_records')
        .insert({
          ...formData,
          company_id: profile?.company_id,
          vessel_id: formData.vessel_id || null,
          accommodation_id: formData.accommodation_id || null,
          total_cost: formData.total_cost ? parseFloat(formData.total_cost) : null,
          arrival_date: formData.arrival_date || null,
          created_by: profile?.user_id,
        })
        .select()
        .single();

      if (error) throw error;

      // Create pre-departure checklist automatically
      await supabase.from('pre_departure_checklists').insert({
        travel_record_id: data.id,
        crew_member_id: formData.crew_member_id,
        company_id: profile?.company_id,
      });

      toast({
        title: 'Success',
        description: 'Travel record created successfully',
      });

      navigate(`/crew/admin/travel/${data.id}`);
    } catch (error) {
      console.error('Failed to create travel record:', error);
      toast({
        title: 'Error',
        description: 'Failed to create travel record',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plane className="w-6 h-6" />
            New Travel Record
          </h1>
          <p className="text-muted-foreground">Create a new crew travel record</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Crew & Vessel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" />
              Crew Member & Vessel
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Crew Member *</Label>
              <Select
                value={formData.crew_member_id}
                onValueChange={(v) => setFormData({ ...formData, crew_member_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select crew member" />
                </SelectTrigger>
                <SelectContent>
                  {crewMembers.map((cm) => (
                    <SelectItem key={cm.user_id} value={cm.user_id}>
                      {cm.last_name}, {cm.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Vessel</Label>
              <Select
                value={formData.vessel_id}
                onValueChange={(v) => setFormData({ ...formData, vessel_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vessel" />
                </SelectTrigger>
                <SelectContent>
                  {vessels.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Travel Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plane className="w-4 h-4" />
              Travel Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Travel Type *</Label>
                <Select
                  value={formData.travel_type}
                  onValueChange={(v) => setFormData({ ...formData, travel_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="join">Joining Vessel</SelectItem>
                    <SelectItem value="leave">Leaving Vessel</SelectItem>
                    <SelectItem value="rotation">Rotation</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Departure Date *</Label>
                <Input
                  type="date"
                  value={formData.departure_date}
                  onChange={(e) => setFormData({ ...formData, departure_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Arrival Date</Label>
                <Input
                  type="date"
                  value={formData.arrival_date}
                  onChange={(e) => setFormData({ ...formData, arrival_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.joining_vessel}
                  onCheckedChange={(v) => setFormData({ ...formData, joining_vessel: v })}
                />
                <Label>Joining Vessel</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.leaving_vessel}
                  onCheckedChange={(v) => setFormData({ ...formData, leaving_vessel: v })}
                />
                <Label>Leaving Vessel</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Locations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Origin City</Label>
                <Input
                  value={formData.origin_city}
                  onChange={(e) => setFormData({ ...formData, origin_city: e.target.value })}
                  placeholder="e.g., London"
                />
              </div>
              <div className="space-y-2">
                <Label>Origin Country</Label>
                <Input
                  value={formData.origin_country}
                  onChange={(e) => setFormData({ ...formData, origin_country: e.target.value })}
                  placeholder="e.g., United Kingdom"
                />
              </div>
              <div className="space-y-2">
                <Label>Origin Airport Code</Label>
                <Input
                  value={formData.origin_airport_code}
                  onChange={(e) => setFormData({ ...formData, origin_airport_code: e.target.value.toUpperCase() })}
                  placeholder="e.g., LHR"
                  maxLength={4}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Destination City</Label>
                <Input
                  value={formData.destination_city}
                  onChange={(e) => setFormData({ ...formData, destination_city: e.target.value })}
                  placeholder="e.g., Singapore"
                />
              </div>
              <div className="space-y-2">
                <Label>Destination Country</Label>
                <Input
                  value={formData.destination_country}
                  onChange={(e) => setFormData({ ...formData, destination_country: e.target.value })}
                  placeholder="e.g., Singapore"
                />
              </div>
              <div className="space-y-2">
                <Label>Destination Airport Code</Label>
                <Input
                  value={formData.destination_airport_code}
                  onChange={(e) => setFormData({ ...formData, destination_airport_code: e.target.value.toUpperCase() })}
                  placeholder="e.g., SIN"
                  maxLength={4}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logistics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="w-4 h-4" />
              Logistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.pickup_required}
                  onCheckedChange={(v) => setFormData({ ...formData, pickup_required: v })}
                />
                <Label>Pickup Required</Label>
              </div>
              
              {formData.pickup_required && (
                <div className="space-y-2 ml-6">
                  <Label>Pickup Location</Label>
                  <Input
                    value={formData.pickup_location}
                    onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
                    placeholder="e.g., Terminal 3 Arrivals"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.accommodation_required}
                  onCheckedChange={(v) => setFormData({ ...formData, accommodation_required: v })}
                />
                <Label>Accommodation Required</Label>
              </div>
              
              {formData.accommodation_required && (
                <div className="space-y-2 ml-6">
                  <Label>Quarantine House</Label>
                  <Select
                    value={formData.accommodation_id}
                    onValueChange={(v) => setFormData({ ...formData, accommodation_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select accommodation" />
                    </SelectTrigger>
                    <SelectContent>
                      {quarantineHouses.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name} - {h.city}, {h.country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Booking Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Booking Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Travel Agent</Label>
                <Input
                  value={formData.travel_agent}
                  onChange={(e) => setFormData({ ...formData, travel_agent: e.target.value })}
                  placeholder="e.g., Maritime Travel Ltd"
                />
              </div>
              <div className="space-y-2">
                <Label>Booking Reference</Label>
                <Input
                  value={formData.booking_reference}
                  onChange={(e) => setFormData({ ...formData, booking_reference: e.target.value })}
                  placeholder="e.g., ABC123"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.total_cost}
                  onChange={(e) => setFormData({ ...formData, total_cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={formData.cost_currency}
                  onValueChange={(v) => setFormData({ ...formData, cost_currency: v })}
                >
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
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            Create Travel Record
          </Button>
        </div>
      </form>
    </div>
  );
}
