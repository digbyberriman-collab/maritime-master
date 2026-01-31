import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Plane, Plus, Search, Filter, Calendar, MapPin, Clock,
  ChevronRight, Loader2, ArrowRight, AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, isAfter, isBefore, addDays } from 'date-fns';

interface FlightBooking {
  id: string;
  airline: string | null;
  flight_number: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  booking_reference: string | null;
  status: string;
  travel_record: {
    id: string;
    travel_type: string;
    crew_member: {
      first_name: string;
      last_name: string;
    };
  } | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-gray-100 text-gray-700',
};

export default function FlightsTravel() {
  const [bookings, setBookings] = useState<FlightBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadBookings();
  }, [statusFilter]);

  async function loadBookings() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('flight_bookings')
        .select('id, airline, flight_number, depart_airport, arrive_airport, depart_datetime_utc, arrive_datetime_utc, booking_reference, confirmed_at')
        .order('depart_datetime_utc', { ascending: true });

      if (error) throw error;
      
      // Map database fields to interface
      const mappedBookings: FlightBooking[] = (data || []).map((b) => ({
        id: b.id,
        airline: b.airline || '',
        flight_number: b.flight_number || '',
        departure_airport: b.depart_airport || '',
        arrival_airport: b.arrive_airport || '',
        departure_time: b.depart_datetime_utc || '',
        arrival_time: b.arrive_datetime_utc || '',
        booking_reference: b.booking_reference || '',
        status: b.confirmed_at ? 'confirmed' : 'pending',
        travel_record: null
      }));
      
      // Apply status filter
      const filtered = statusFilter !== 'all' 
        ? mappedBookings.filter(b => b.status === statusFilter)
        : mappedBookings;
      setBookings(filtered);
    } catch (error) {
      console.error('Failed to load bookings:', error);
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredBookings = bookings.filter(b => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      b.flight_number?.toLowerCase().includes(searchLower) ||
      b.airline?.toLowerCase().includes(searchLower) ||
      b.booking_reference?.toLowerCase().includes(searchLower) ||
      b.travel_record?.crew_member?.first_name?.toLowerCase().includes(searchLower) ||
      b.travel_record?.crew_member?.last_name?.toLowerCase().includes(searchLower)
    );
  });

  const upcomingFlights = filteredBookings.filter(b => 
    b.departure_time && isAfter(new Date(b.departure_time), new Date())
  );
  const todayFlights = filteredBookings.filter(b => {
    if (!b.departure_time) return false;
    const depDate = new Date(b.departure_time);
    const today = new Date();
    return depDate.toDateString() === today.toDateString();
  });
  const urgentFlights = upcomingFlights.filter(b => 
    b.departure_time && isBefore(new Date(b.departure_time), addDays(new Date(), 3))
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Plane className="w-6 h-6" />
              Flights & Travel
            </h1>
            <p className="text-muted-foreground">Manage crew flight bookings and travel arrangements</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/crew/admin/travel">
                View All Travel Records
              </Link>
            </Button>
            <Button asChild>
              <Link to="/crew/admin/travel/new">
                <Plus className="w-4 h-4 mr-2" />
                New Booking
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Plane className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{upcomingFlights.length}</p>
                  <p className="text-sm text-muted-foreground">Upcoming Flights</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{todayFlights.length}</p>
                  <p className="text-sm text-muted-foreground">Today's Flights</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{urgentFlights.length}</p>
                  <p className="text-sm text-muted-foreground">Next 72 Hours</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {bookings.filter(b => b.status === 'pending').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Pending Confirmation</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, flight number, or reference..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Bookings List */}
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcomingFlights.length})</TabsTrigger>
            <TabsTrigger value="today">Today ({todayFlights.length})</TabsTrigger>
            <TabsTrigger value="all">All Bookings ({filteredBookings.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            <BookingsList bookings={upcomingFlights} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="today" className="mt-4">
            <BookingsList bookings={todayFlights} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            <BookingsList bookings={filteredBookings} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function BookingsList({ bookings, isLoading }: { bookings: FlightBooking[], isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Plane className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No flight bookings found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <Card key={booking.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plane className="w-6 h-6 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium">
                    {booking.travel_record?.crew_member?.first_name} {booking.travel_record?.crew_member?.last_name}
                  </p>
                  <Badge className={statusColors[booking.status] || 'bg-gray-100'}>
                    {booking.status}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-medium">
                    {booking.airline} {booking.flight_number}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {booking.departure_airport}
                    <ArrowRight className="w-3 h-3" />
                    {booking.arrival_airport}
                  </span>
                </div>
                
                {booking.booking_reference && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Ref: {booking.booking_reference}
                  </p>
                )}
              </div>
              
              <div className="flex-shrink-0 text-right">
                {booking.departure_time && (
                  <>
                    <p className="font-medium">
                      {format(new Date(booking.departure_time), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(booking.departure_time), 'HH:mm')}
                    </p>
                  </>
                )}
              </div>
              
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
