import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bed,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Filter,
  Loader2,
  MapPin,
  Plus,
  Search,
  User,
} from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

interface CrewMemberOption {
  user_id: string;
  first_name: string;
  last_name: string;
  rank: string | null;
}

interface QuarantineHouseOption {
  id: string;
  name: string;
  city: string | null;
  daily_rate: number | null;
  rate_currency: string | null;
}

interface QuarantineBooking {
  id: string;
  crew_member_id: string;
  quarantine_house_id: string;
  check_in_date: string;
  check_out_date: string;
  status: BookingStatus;
  room_number: string | null;
  notes: string | null;
  created_at: string | null;
  crew_member: {
    first_name: string;
    last_name: string;
    rank: string | null;
  } | null;
  quarantine_house: {
    name: string;
    location: string | null;
  } | null;
}

interface NewBookingFormState {
  crew_member_id: string;
  quarantine_house_id: string;
  check_in_date: string;
  check_out_date: string;
  room_number: string;
  notes: string;
  status: BookingStatus;
}

const BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];

const statusColors: Record<BookingStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  checked_in: 'bg-green-100 text-green-700',
  checked_out: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

function toStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeStatus(status: string | null): BookingStatus {
  if (status && BOOKING_STATUSES.includes(status as BookingStatus)) {
    return status as BookingStatus;
  }
  return 'pending';
}

function getTodayISODate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function QuarantineBookingsPage() {
  const { profile, user } = useAuth();
  const [searchParams] = useSearchParams();
  const filteredHouseId = searchParams.get('house') || '';
  const shouldOpenNewModal = searchParams.get('new') === 'true';

  const [bookings, setBookings] = useState<QuarantineBooking[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMemberOption[]>([]);
  const [houses, setHouses] = useState<QuarantineHouseOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBooking, setNewBooking] = useState<NewBookingFormState>({
    crew_member_id: '',
    quarantine_house_id: filteredHouseId,
    check_in_date: getTodayISODate(),
    check_out_date: '',
    room_number: '',
    notes: '',
    status: 'confirmed',
  });

  useEffect(() => {
    void loadBookings();
  }, [statusFilter]);

  useEffect(() => {
    if (profile?.company_id) {
      void loadFormOptions(profile.company_id);
    }
  }, [profile?.company_id]);

  useEffect(() => {
    if (filteredHouseId) {
      setNewBooking((prev) => ({ ...prev, quarantine_house_id: filteredHouseId }));
    }
  }, [filteredHouseId]);

  useEffect(() => {
    if (shouldOpenNewModal) {
      setIsDialogOpen(true);
    }
  }, [shouldOpenNewModal]);

  async function loadFormOptions(companyId: string) {
    try {
      const [crewResponse, houseResponse] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, first_name, last_name, rank')
          .eq('company_id', companyId)
          .order('last_name', { ascending: true }),
        supabase
          .from('quarantine_houses')
          .select('id, name, city, daily_rate, rate_currency')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name', { ascending: true }),
      ]);

      if (crewResponse.error) throw crewResponse.error;
      if (houseResponse.error) throw houseResponse.error;

      setCrewMembers((crewResponse.data || []) as CrewMemberOption[]);
      setHouses((houseResponse.data || []) as QuarantineHouseOption[]);
    } catch (error) {
      console.error('Failed to load booking form options:', error);
      toast.error('Unable to load crew and house options');
    }
  }

  async function loadBookings() {
    setIsLoading(true);
    try {
      let query = supabase
        .from('quarantine_bookings')
        .select(`
          id,
          crew_member_id,
          quarantine_house_id,
          check_in_date,
          check_out_date,
          status,
          room_number,
          notes,
          created_at,
          crew_member:profiles(first_name, last_name, rank),
          quarantine_house:quarantine_houses(name, city)
        `)
        .order('check_in_date', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as Array<{
        id: string;
        crew_member_id: string;
        quarantine_house_id: string;
        check_in_date: string;
        check_out_date: string;
        status: string | null;
        room_number: string | null;
        notes: string | null;
        created_at: string | null;
        crew_member: { first_name: string; last_name: string; rank: string | null } | null;
        quarantine_house: { name: string; city: string | null } | null;
      }>;

      const mapped: QuarantineBooking[] = rows.map((booking) => ({
        id: booking.id,
        crew_member_id: booking.crew_member_id,
        quarantine_house_id: booking.quarantine_house_id,
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        status: normalizeStatus(booking.status),
        room_number: booking.room_number,
        notes: booking.notes,
        created_at: booking.created_at,
        crew_member: booking.crew_member,
        quarantine_house: booking.quarantine_house
          ? {
              name: booking.quarantine_house.name,
              location: booking.quarantine_house.city,
            }
          : null,
      }));

      setBookings(mapped);
    } catch (error) {
      console.error('Failed to load bookings:', error);
      setBookings([]);
      toast.error('Unable to load quarantine bookings');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStatusChange(id: string, status: BookingStatus) {
    try {
      const updates: Database['public']['Tables']['quarantine_bookings']['Update'] = { status };
      const now = new Date().toISOString();
      if (status === 'checked_in') {
        updates.actual_check_in = now;
      }
      if (status === 'checked_out') {
        updates.actual_check_out = now;
      }

      const { error } = await supabase.from('quarantine_bookings').update(updates).eq('id', id);
      if (error) throw error;

      toast.success('Booking status updated');
      await loadBookings();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update booking status');
    }
  }

  async function handleCreateBooking() {
    if (!profile?.company_id) {
      toast.error('No company context found for this user');
      return;
    }

    if (!newBooking.crew_member_id || !newBooking.quarantine_house_id || !newBooking.check_in_date || !newBooking.check_out_date) {
      toast.error('Crew member, house, and dates are required');
      return;
    }

    const checkInDate = new Date(newBooking.check_in_date);
    const checkOutDate = new Date(newBooking.check_out_date);
    if (checkOutDate < checkInDate) {
      toast.error('Check-out date must be on or after check-in date');
      return;
    }

    const nights = Math.max(differenceInDays(checkOutDate, checkInDate), 1);
    const selectedHouse = houses.find((house) => house.id === newBooking.quarantine_house_id);
    const totalCost = selectedHouse?.daily_rate ? selectedHouse.daily_rate * nights : null;

    const payload: Database['public']['Tables']['quarantine_bookings']['Insert'] = {
      company_id: profile.company_id,
      created_by: user?.id ?? null,
      crew_member_id: newBooking.crew_member_id,
      quarantine_house_id: newBooking.quarantine_house_id,
      check_in_date: newBooking.check_in_date,
      check_out_date: newBooking.check_out_date,
      status: newBooking.status,
      room_number: newBooking.room_number || null,
      notes: newBooking.notes || null,
      total_nights: nights,
      total_cost: totalCost,
      cost_currency: selectedHouse?.rate_currency ?? null,
    };

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('quarantine_bookings').insert(payload);
      if (error) throw error;

      toast.success('Quarantine booking created');
      setIsDialogOpen(false);
      setNewBooking({
        crew_member_id: '',
        quarantine_house_id: filteredHouseId,
        check_in_date: getTodayISODate(),
        check_out_date: '',
        room_number: '',
        notes: '',
        status: 'confirmed',
      });
      await loadBookings();
    } catch (error) {
      console.error('Failed to create booking:', error);
      toast.error('Failed to create booking');
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        if (filteredHouseId && booking.quarantine_house_id !== filteredHouseId) {
          return false;
        }
        if (!search) {
          return true;
        }
        const searchLower = search.toLowerCase();
        return (
          booking.crew_member?.first_name?.toLowerCase().includes(searchLower) ||
          booking.crew_member?.last_name?.toLowerCase().includes(searchLower) ||
          booking.quarantine_house?.name?.toLowerCase().includes(searchLower) ||
          booking.room_number?.toLowerCase().includes(searchLower)
        );
      }),
    [bookings, filteredHouseId, search],
  );

  const activeBookings = filteredBookings.filter((booking) => booking.status === 'checked_in');
  const pendingBookings = filteredBookings.filter((booking) => booking.status === 'pending' || booking.status === 'confirmed');
  const selectedHouseName = houses.find((house) => house.id === filteredHouseId)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bed className="w-6 h-6" />
            Quarantine Bookings
          </h1>
          <p className="text-muted-foreground">Manage crew quarantine accommodation bookings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/crew/admin/quarantine">Manage Houses</Link>
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Booking
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Quarantine Booking</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Crew Member *</Label>
                  <Select
                    value={newBooking.crew_member_id}
                    onValueChange={(value) => setNewBooking((prev) => ({ ...prev, crew_member_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select crew member" />
                    </SelectTrigger>
                    <SelectContent>
                      {crewMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.last_name}, {member.first_name}
                          {member.rank ? ` (${member.rank})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Quarantine House *</Label>
                  <Select
                    value={newBooking.quarantine_house_id}
                    onValueChange={(value) => setNewBooking((prev) => ({ ...prev, quarantine_house_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select house" />
                    </SelectTrigger>
                    <SelectContent>
                      {houses.map((house) => (
                        <SelectItem key={house.id} value={house.id}>
                          {house.name}
                          {house.city ? ` (${house.city})` : ''}
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
                      value={newBooking.check_in_date}
                      onChange={(event) => setNewBooking((prev) => ({ ...prev, check_in_date: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Check-out Date *</Label>
                    <Input
                      type="date"
                      value={newBooking.check_out_date}
                      onChange={(event) => setNewBooking((prev) => ({ ...prev, check_out_date: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={newBooking.status}
                    onValueChange={(value) => setNewBooking((prev) => ({ ...prev, status: value as BookingStatus }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Room Number</Label>
                  <Input
                    placeholder="e.g., Room 101"
                    value={newBooking.room_number}
                    onChange={(event) => setNewBooking((prev) => ({ ...prev, room_number: event.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Optional notes for this booking..."
                    value={newBooking.notes}
                    onChange={(event) => setNewBooking((prev) => ({ ...prev, notes: event.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={() => void handleCreateBooking()} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Booking
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filteredHouseId && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Showing bookings for{' '}
              <span className="font-medium text-foreground">{selectedHouseName || 'selected house'}</span>
            </p>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/crew/admin/quarantine/bookings">Clear filter</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeBookings.length}</p>
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
                <p className="text-2xl font-bold">{pendingBookings.length}</p>
                <p className="text-sm text-muted-foreground">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{new Set(filteredBookings.map((booking) => booking.quarantine_house_id)).size}</p>
                <p className="text-sm text-muted-foreground">Houses in Use</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{filteredBookings.length}</p>
                <p className="text-sm text-muted-foreground">Total Bookings</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, house, or room..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {BOOKING_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {toStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bed className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No quarantine bookings found</p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              Create First Booking
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBookings.map((booking) => (
            <Card key={booking.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">
                        {booking.crew_member?.first_name} {booking.crew_member?.last_name}
                      </p>
                      {booking.crew_member?.rank && <span className="text-sm text-muted-foreground">({booking.crew_member.rank})</span>}
                      <Badge className={statusColors[booking.status] || 'bg-gray-100 text-gray-700'}>{toStatusLabel(booking.status)}</Badge>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {booking.quarantine_house?.name || 'Unknown House'}
                      </span>
                      {booking.room_number && (
                        <>
                          <span>•</span>
                          <span>Room {booking.room_number}</span>
                        </>
                      )}
                      {booking.quarantine_house?.location && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {booking.quarantine_house.location}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <p className="font-medium flex items-center gap-1 justify-end">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(booking.check_in_date), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      → {format(new Date(booking.check_out_date), 'MMM d')}
                      <span className="ml-1">({Math.max(differenceInDays(new Date(booking.check_out_date), new Date(booking.check_in_date)), 1)} nights)</span>
                    </p>
                  </div>

                  {booking.status === 'confirmed' && (
                    <Button size="sm" onClick={() => void handleStatusChange(booking.id, 'checked_in')}>
                      Check In
                    </Button>
                  )}
                  {booking.status === 'checked_in' && (
                    <Button size="sm" variant="outline" onClick={() => void handleStatusChange(booking.id, 'checked_out')}>
                      Check Out
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
