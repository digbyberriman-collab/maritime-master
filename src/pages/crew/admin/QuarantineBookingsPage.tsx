import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, Plus, Search, Filter, Calendar, User,
  Clock, CheckCircle, AlertCircle, Loader2, MapPin, Bed
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

interface QuarantineBooking {
  id: string;
  crew_member_id: string;
  quarantine_house_id: string;
  check_in_date: string;
  check_out_date: string | null;
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  room_number: string | null;
  notes: string | null;
  created_at: string;
  crew_member?: {
    first_name: string;
    last_name: string;
    rank: string | null;
  };
  quarantine_house?: {
    name: string;
    location: string | null;
  };
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  checked_in: 'bg-green-100 text-green-700',
  checked_out: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function QuarantineBookingsPage() {
  const [bookings, setBookings] = useState<QuarantineBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    loadBookings();
  }, [statusFilter]);

  async function loadBookings() {
    setIsLoading(true);
    try {
      let query = supabase
        .from('quarantine_bookings')
        .select(`
          *,
          crew_member:profiles(first_name, last_name, rank),
          quarantine_house:quarantine_houses(name, city)
        `)
        .order('check_in_date', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Map to interface
      const mapped: QuarantineBooking[] = (data || []).map((b: any) => ({
        ...b,
        quarantine_house: b.quarantine_house ? {
          name: b.quarantine_house.name,
          location: b.quarantine_house.city
        } : null
      }));
      setBookings(mapped);
    } catch (error) {
      console.error('Failed to load bookings:', error);
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      const { error } = await supabase
        .from('quarantine_bookings')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      toast.success('Status updated');
      loadBookings();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
    }
  }

  const filteredBookings = bookings.filter(b => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      b.crew_member?.first_name?.toLowerCase().includes(searchLower) ||
      b.crew_member?.last_name?.toLowerCase().includes(searchLower) ||
      b.quarantine_house?.name?.toLowerCase().includes(searchLower) ||
      b.room_number?.toLowerCase().includes(searchLower)
    );
  });

  const activeBookings = filteredBookings.filter(b => b.status === 'checked_in');
  const pendingBookings = filteredBookings.filter(b => b.status === 'pending' || b.status === 'confirmed');

  return (
    <div className="space-y-6">
      {/* Header */}
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
            <Link to="/crew/admin/quarantine">
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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Quarantine Booking</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Crew Member *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select crew member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placeholder">Select a crew member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quarantine House *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select house" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placeholder">Select a house</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Check-in Date *</Label>
                    <Input type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label>Check-out Date</Label>
                    <Input type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Room Number</Label>
                  <Input placeholder="e.g., Room 101" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  toast.success('Booking created');
                  setIsDialogOpen(false);
                }}>
                  Create Booking
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
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
                <p className="text-2xl font-bold">
                  {new Set(filteredBookings.map(b => b.quarantine_house_id)).size}
                </p>
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, house, or room..."
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
                <SelectItem value="checked_in">Checked In</SelectItem>
                <SelectItem value="checked_out">Checked Out</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bookings List */}
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
                      {booking.crew_member?.rank && (
                        <span className="text-sm text-muted-foreground">
                          ({booking.crew_member.rank})
                        </span>
                      )}
                      <Badge className={statusColors[booking.status]}>
                        {booking.status.replace('_', ' ')}
                      </Badge>
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
                    {booking.check_out_date && (
                      <p className="text-sm text-muted-foreground">
                        → {format(new Date(booking.check_out_date), 'MMM d')}
                        <span className="ml-1">
                          ({differenceInDays(new Date(booking.check_out_date), new Date(booking.check_in_date))} nights)
                        </span>
                      </p>
                    )}
                  </div>

                  {booking.status === 'confirmed' && (
                    <Button 
                      size="sm" 
                      onClick={() => handleStatusChange(booking.id, 'checked_in')}
                    >
                      Check In
                    </Button>
                  )}
                  {booking.status === 'checked_in' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleStatusChange(booking.id, 'checked_out')}
                    >
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
