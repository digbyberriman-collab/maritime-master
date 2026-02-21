import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Plus, Search, Calendar, User, DollarSign,
  Clock, CheckCircle, Loader2, MapPin, Bed, XCircle,
  LogIn, LogOut
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

interface QuarantineBooking {
  id: string;
  crew_member_id: string;
  quarantine_house_id: string;
  check_in_date: string;
  check_out_date: string;
  actual_check_in: string | null;
  actual_check_out: string | null;
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  room_number: string | null;
  notes: string | null;
  dietary_requirements: string | null;
  special_requests: string | null;
  total_cost: number | null;
  cost_currency: string | null;
  total_nights: number | null;
  paid: boolean | null;
  company_id: string;
  travel_record_id: string | null;
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
}

interface QuarantineHouse {
  id: string;
  name: string;
  city: string;
  country: string;
  daily_rate: number | null;
  rate_currency: string | null;
}

interface CrewProfile {
  user_id: string;
  first_name: string;
  last_name: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  checked_in: { label: 'Checked In', color: 'bg-green-100 text-green-700', icon: LogIn },
  checked_out: { label: 'Checked Out', color: 'bg-gray-100 text-gray-700', icon: LogOut },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const initialFormState = {
  crew_member_id: '',
  quarantine_house_id: '',
  check_in_date: '',
  check_out_date: '',
  room_number: '',
  dietary_requirements: '',
  special_requests: '',
  notes: '',
};

export default function QuarantineBookingsPage() {
  const { profile } = useAuth();
  const [bookings, setBookings] = useState<QuarantineBooking[]>([]);
  const [houses, setHouses] = useState<QuarantineHouse[]>([]);
  const [crewProfiles, setCrewProfiles] = useState<CrewProfile[]>([]);
  const [housesMap, setHousesMap] = useState<Record<string, QuarantineHouse>>({});
  const [crewMap, setCrewMap] = useState<Record<string, CrewProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [bookingsRes, housesRes, crewRes] = await Promise.all([
        supabase
          .from('quarantine_bookings')
          .select('*')
          .order('check_in_date', { ascending: false }),
        supabase
          .from('quarantine_houses')
          .select('id, name, city, country, daily_rate, rate_currency')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .order('last_name'),
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (housesRes.error) throw housesRes.error;

      const housesList = housesRes.data || [];
      const crewList = crewRes.data || [];
      const hMap: Record<string, QuarantineHouse> = {};
      housesList.forEach((h) => { hMap[h.id] = h; });
      const cMap: Record<string, CrewProfile> = {};
      crewList.forEach((c) => { cMap[c.user_id] = c; });

      setBookings((bookingsRes.data || []) as QuarantineBooking[]);
      setHouses(housesList);
      setCrewProfiles(crewList);
      setHousesMap(hMap);
      setCrewMap(cMap);
    } catch (error) {
      console.error('Failed to load bookings data:', error);
      toast.error('Failed to load bookings');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCheckIn(booking: QuarantineBooking) {
    try {
      const { error } = await supabase
        .from('quarantine_bookings')
        .update({
          status: 'checked_in',
          actual_check_in: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (error) throw error;
      toast.success('Guest checked in successfully');
      loadData();
    } catch (error) {
      console.error('Failed to check in:', error);
      toast.error('Failed to check in');
    }
  }

  async function handleCheckOut(booking: QuarantineBooking) {
    try {
      const { error } = await supabase
        .from('quarantine_bookings')
        .update({
          status: 'checked_out',
          actual_check_out: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (error) throw error;
      toast.success('Guest checked out successfully');
      loadData();
    } catch (error) {
      console.error('Failed to check out:', error);
      toast.error('Failed to check out');
    }
  }

  async function handleCancel(booking: QuarantineBooking) {
    try {
      const { error } = await supabase
        .from('quarantine_bookings')
        .update({ status: 'cancelled' })
        .eq('id', booking.id);

      if (error) throw error;
      toast.success('Booking cancelled');
      loadData();
    } catch (error) {
      console.error('Failed to cancel booking:', error);
      toast.error('Failed to cancel booking');
    }
  }

  async function handleCreateBooking() {
    if (!formData.crew_member_id || !formData.quarantine_house_id || !formData.check_in_date || !formData.check_out_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (new Date(formData.check_out_date) <= new Date(formData.check_in_date)) {
      toast.error('Check-out date must be after check-in date');
      return;
    }

    if (!profile?.company_id) {
      toast.error('Company information not available');
      return;
    }

    setIsSubmitting(true);
    try {
      const nights = differenceInDays(
        new Date(formData.check_out_date),
        new Date(formData.check_in_date)
      );

      const selectedHouse = housesMap[formData.quarantine_house_id];
      const totalCost = selectedHouse?.daily_rate ? selectedHouse.daily_rate * nights : null;
      const costCurrency = selectedHouse?.rate_currency || 'USD';

      const { error } = await supabase
        .from('quarantine_bookings')
        .insert({
          crew_member_id: formData.crew_member_id,
          quarantine_house_id: formData.quarantine_house_id,
          check_in_date: formData.check_in_date,
          check_out_date: formData.check_out_date,
          room_number: formData.room_number || null,
          dietary_requirements: formData.dietary_requirements || null,
          special_requests: formData.special_requests || null,
          notes: formData.notes || null,
          total_nights: nights,
          total_cost: totalCost,
          cost_currency: costCurrency,
          status: 'confirmed',
          company_id: profile.company_id,
          created_by: profile.id,
        });

      if (error) throw error;

      toast.success('Booking created successfully');
      setFormData(initialFormState);
      setIsDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Failed to create booking:', error);
      toast.error('Failed to create booking');
    } finally {
      setIsSubmitting(false);
    }
  }

  function getCrewName(crewMemberId: string): string {
    const crew = crewMap[crewMemberId];
    if (crew) return `${crew.first_name} ${crew.last_name}`;
    return 'Unknown Crew Member';
  }

  function getHouseName(houseId: string): string {
    const house = housesMap[houseId];
    if (house) return house.name;
    return 'Unknown House';
  }

  function getHouseLocation(houseId: string): string | null {
    const house = housesMap[houseId];
    if (house) return `${house.city}, ${house.country}`;
    return null;
  }

  // Filter bookings by status tab and search term
  const filteredBookings = bookings.filter((b) => {
    // Status tab filter
    if (activeTab !== 'all' && b.status !== activeTab) return false;

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const crewName = getCrewName(b.crew_member_id).toLowerCase();
      const houseName = getHouseName(b.quarantine_house_id).toLowerCase();
      const roomNum = (b.room_number || '').toLowerCase();
      return (
        crewName.includes(searchLower) ||
        houseName.includes(searchLower) ||
        roomNum.includes(searchLower)
      );
    }
    return true;
  });

  // Stats computed from all bookings (not filtered)
  const totalBookings = bookings.length;
  const checkedInCount = bookings.filter((b) => b.status === 'checked_in').length;
  const upcomingCount = bookings.filter((b) => b.status === 'confirmed').length;
  const totalCost = bookings.reduce((sum, b) => sum + (b.total_cost || 0), 0);
  const primaryCurrency = bookings.find((b) => b.cost_currency)?.cost_currency || 'USD';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bed className="w-6 h-6" />
            Quarantine Bookings
          </h1>
          <p className="text-muted-foreground">
            Manage crew quarantine accommodation bookings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/crew/admin/quarantine">
              <Building2 className="w-4 h-4 mr-2" />
              Manage Houses
            </Link>
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Booking
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Quarantine Booking</DialogTitle>
                <DialogDescription>
                  Create a new quarantine accommodation booking for a crew member.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Crew Member *</Label>
                  <Select
                    value={formData.crew_member_id}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, crew_member_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select crew member" />
                    </SelectTrigger>
                    <SelectContent>
                      {crewProfiles.map((crew) => (
                        <SelectItem key={crew.user_id} value={crew.user_id}>
                          {crew.first_name} {crew.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quarantine House *</Label>
                  <Select
                    value={formData.quarantine_house_id}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, quarantine_house_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select house" />
                    </SelectTrigger>
                    <SelectContent>
                      {houses.map((house) => (
                        <SelectItem key={house.id} value={house.id}>
                          {house.name} — {house.city}, {house.country}
                          {house.daily_rate ? ` (${house.rate_currency || 'USD'} ${house.daily_rate}/night)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Check-in Date *</Label>
                    <Input
                      type="date"
                      value={formData.check_in_date}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, check_in_date: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Check-out Date *</Label>
                    <Input
                      type="date"
                      value={formData.check_out_date}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, check_out_date: e.target.value }))
                      }
                    />
                  </div>
                </div>
                {formData.check_in_date && formData.check_out_date &&
                  new Date(formData.check_out_date) > new Date(formData.check_in_date) && (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                    {differenceInDays(new Date(formData.check_out_date), new Date(formData.check_in_date))} night(s)
                    {formData.quarantine_house_id && housesMap[formData.quarantine_house_id]?.daily_rate && (
                      <span className="ml-2 font-medium">
                        — Estimated cost: {housesMap[formData.quarantine_house_id].rate_currency || 'USD'}{' '}
                        {(
                          (housesMap[formData.quarantine_house_id].daily_rate || 0) *
                          differenceInDays(new Date(formData.check_out_date), new Date(formData.check_in_date))
                        ).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Room Number</Label>
                  <Input
                    placeholder="e.g., Room 101"
                    value={formData.room_number}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, room_number: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dietary Requirements</Label>
                  <Textarea
                    placeholder="e.g., Halal, vegetarian, allergies..."
                    value={formData.dietary_requirements}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, dietary_requirements: e.target.value }))
                    }
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Special Requests</Label>
                  <Textarea
                    placeholder="e.g., Ground floor room, extra blankets..."
                    value={formData.special_requests}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, special_requests: e.target.value }))
                    }
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Any additional notes..."
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFormData(initialFormState);
                    setIsDialogOpen(false);
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateBooking} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Booking
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalBookings}</p>
                <p className="text-sm text-muted-foreground">Total Bookings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{checkedInCount}</p>
                <p className="text-sm text-muted-foreground">Currently Checked In</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcomingCount}</p>
                <p className="text-sm text-muted-foreground">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {primaryCurrency} {totalCost.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Total Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by crew name, house, or room..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status Filter Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            All ({bookings.length})
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            Confirmed ({bookings.filter((b) => b.status === 'confirmed').length})
          </TabsTrigger>
          <TabsTrigger value="checked_in">
            Checked In ({bookings.filter((b) => b.status === 'checked_in').length})
          </TabsTrigger>
          <TabsTrigger value="checked_out">
            Checked Out ({bookings.filter((b) => b.status === 'checked_out').length})
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({bookings.filter((b) => b.status === 'cancelled').length})
          </TabsTrigger>
        </TabsList>

        {/* All tabs share the same content, filtered by activeTab */}
        {['all', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map((tab) => (
          <TabsContent key={tab} value={tab}>
            {filteredBookings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Bed className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {search
                      ? 'No bookings match your search'
                      : tab === 'all'
                        ? 'No quarantine bookings found'
                        : `No ${tab.replace('_', ' ')} bookings`}
                  </p>
                  {tab === 'all' && !search && (
                    <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                      Create First Booking
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredBookings.map((booking) => {
                  const status = statusConfig[booking.status] || statusConfig.confirmed;
                  const nights = differenceInDays(
                    new Date(booking.check_out_date),
                    new Date(booking.check_in_date)
                  );
                  const houseLocation = getHouseLocation(booking.quarantine_house_id);

                  return (
                    <Card key={booking.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                          {/* Crew Avatar */}
                          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-6 h-6 text-primary" />
                          </div>

                          {/* Booking Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="font-medium">
                                {getCrewName(booking.crew_member_id)}
                              </p>
                              <Badge className={status.color}>
                                {status.label}
                              </Badge>
                              {booking.paid && (
                                <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                  Paid
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {getHouseName(booking.quarantine_house_id)}
                              </span>
                              {booking.room_number && (
                                <>
                                  <span>Room {booking.room_number}</span>
                                </>
                              )}
                              {houseLocation && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {houseLocation}
                                </span>
                              )}
                            </div>

                            {(booking.dietary_requirements || booking.special_requests) && (
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                {booking.dietary_requirements && (
                                  <span>Diet: {booking.dietary_requirements}</span>
                                )}
                                {booking.special_requests && (
                                  <span>Requests: {booking.special_requests}</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Dates & Cost */}
                          <div className="flex-shrink-0 text-right space-y-1">
                            <p className="font-medium flex items-center gap-1 justify-end">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(booking.check_in_date), 'MMM d, yyyy')}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              to {format(new Date(booking.check_out_date), 'MMM d, yyyy')}
                              <span className="ml-1">({nights} night{nights !== 1 ? 's' : ''})</span>
                            </p>
                            {booking.total_cost != null && (
                              <p className="text-sm font-medium flex items-center gap-1 justify-end">
                                <DollarSign className="w-3 h-3" />
                                {booking.cost_currency || 'USD'} {booking.total_cost.toLocaleString()}
                              </p>
                            )}
                            {booking.actual_check_in && (
                              <p className="text-xs text-green-600">
                                In: {format(new Date(booking.actual_check_in), 'MMM d, HH:mm')}
                              </p>
                            )}
                            {booking.actual_check_out && (
                              <p className="text-xs text-gray-500">
                                Out: {format(new Date(booking.actual_check_out), 'MMM d, HH:mm')}
                              </p>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex-shrink-0 flex gap-2">
                            {booking.status === 'confirmed' && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleCheckIn(booking)}
                                >
                                  <LogIn className="w-4 h-4 mr-1" />
                                  Check In
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleCancel(booking)}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Cancel
                                </Button>
                              </>
                            )}
                            {booking.status === 'checked_in' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCheckOut(booking)}
                              >
                                <LogOut className="w-4 h-4 mr-1" />
                                Check Out
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
