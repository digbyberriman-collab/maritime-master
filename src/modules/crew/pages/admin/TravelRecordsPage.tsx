import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plane, Plus, Search, Filter, Calendar, 
  ChevronRight, Loader2, MapPin
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

type TravelStatus = 'planned' | 'booked' | 'confirmed' | 'in_transit' | 'completed' | 'cancelled';
type TravelType = 'join' | 'leave' | 'rotation' | 'training' | 'medical' | 'other';

interface TravelRecord {
  id: string;
  travel_type: TravelType;
  status: TravelStatus;
  departure_date: string;
  arrival_date: string | null;
  origin_city: string | null;
  origin_airport_code: string | null;
  destination_city: string | null;
  destination_airport_code: string | null;
  crew_member: {
    first_name: string;
    last_name: string;
  };
  vessel: {
    name: string;
  } | null;
}

const statusColors: Record<TravelStatus, string> = {
  planned: 'bg-gray-100 text-gray-700',
  booked: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  in_transit: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const typeColors: Record<TravelType, string> = {
  join: 'bg-green-100 text-green-700',
  leave: 'bg-orange-100 text-orange-700',
  rotation: 'bg-blue-100 text-blue-700',
  training: 'bg-purple-100 text-purple-700',
  medical: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function TravelRecordsPage() {
  const [records, setRecords] = useState<TravelRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    loadRecords();
  }, [statusFilter, typeFilter]);

  async function loadRecords() {
    setIsLoading(true);
    try {
      let query = supabase
        .from('crew_travel_records')
        .select(`
          *,
          crew_member:profiles(first_name, last_name),
          vessel:vessels(name)
        `)
        .order('departure_date', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('travel_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data || []) as TravelRecord[]);
    } catch (error) {
      console.error('Failed to load travel records:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredRecords = records.filter(r => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      r.crew_member?.first_name?.toLowerCase().includes(searchLower) ||
      r.crew_member?.last_name?.toLowerCase().includes(searchLower) ||
      r.origin_city?.toLowerCase().includes(searchLower) ||
      r.destination_city?.toLowerCase().includes(searchLower) ||
      r.origin_airport_code?.toLowerCase().includes(searchLower) ||
      r.destination_airport_code?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plane className="w-6 h-6" />
            Travel Records
          </h1>
          <p className="text-muted-foreground">Manage crew travel and flights</p>
        </div>
        <Button asChild>
          <Link to="/crew/admin/travel/new">
            <Plus className="w-4 h-4 mr-2" />
            New Travel Record
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, city, or airport..."
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
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="join">Join</SelectItem>
                <SelectItem value="leave">Leave</SelectItem>
                <SelectItem value="rotation">Rotation</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="medical">Medical</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Records List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredRecords.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Plane className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No travel records found</p>
            <Button asChild className="mt-4">
              <Link to="/crew/admin/travel/new">Create First Record</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record) => (
            <Link key={record.id} to={`/crew/admin/travel/${record.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plane className="w-5 h-5 text-primary" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">
                          {record.crew_member?.first_name} {record.crew_member?.last_name}
                        </p>
                        <Badge className={`text-xs ${typeColors[record.travel_type]}`}>
                          {record.travel_type}
                        </Badge>
                        <Badge className={`text-xs ${statusColors[record.status]}`}>
                          {record.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {record.origin_airport_code || record.origin_city || 'TBD'} → {record.destination_airport_code || record.destination_city || 'TBD'}
                        </span>
                        {record.vessel && (
                          <span className="hidden sm:inline">
                            Vessel: {record.vessel.name}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-medium flex items-center gap-1 justify-end">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(record.departure_date), 'MMM d, yyyy')}
                      </p>
                      {record.arrival_date && (
                        <p className="text-xs text-muted-foreground">
                          → {format(new Date(record.arrival_date), 'MMM d')}
                        </p>
                      )}
                    </div>
                    
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
