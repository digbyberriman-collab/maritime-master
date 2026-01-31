import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Plane, ArrowLeft, MapPin, Calendar, User, Ship, Clock,
  FileText, Edit, Trash2, Loader2, Download, Plus, AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface TravelRecord {
  id: string;
  travel_type: string;
  status: string;
  departure_date: string;
  arrival_date: string | null;
  origin_city: string | null;
  origin_airport_code: string | null;
  destination_city: string | null;
  destination_airport_code: string | null;
  notes: string | null;
  cost_estimate: number | null;
  travel_agent: string | null;
  crew_member: {
    id: string;
    first_name: string;
    last_name: string;
    rank: string | null;
  } | null;
  vessel: {
    id: string;
    name: string;
  } | null;
}

interface FlightSegment {
  id: string;
  airline: string | null;
  flight_number: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  booking_reference: string | null;
  status: string;
}

interface TravelDocument {
  id: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  uploaded_at: string;
}

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-700',
  booked: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  in_transit: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function TravelRecordDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<TravelRecord | null>(null);
  const [flights, setFlights] = useState<FlightSegment[]>([]);
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadRecord();
      loadFlights();
      loadDocuments();
    }
  }, [id]);

  async function loadRecord() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('crew_travel_records')
        .select(`
          *,
          crew_member:profiles(id, first_name, last_name, rank),
          vessel:vessels(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      // Map to interface
      const mapped: TravelRecord = {
        ...(data as any),
        cost_estimate: (data as any).total_cost || null
      };
      setRecord(mapped);
    } catch (error) {
      console.error('Failed to load record:', error);
      toast.error('Failed to load travel record');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadFlights() {
    try {
      const { data, error } = await supabase
        .from('flight_bookings')
        .select('id, airline, flight_number, depart_airport, arrive_airport, depart_datetime_utc, arrive_datetime_utc, booking_reference, confirmed_at')
        .eq('flight_request_id', id)
        .order('depart_datetime_utc', { ascending: true });

      if (error) throw error;
      
      // Map to interface
      const mapped: FlightSegment[] = (data || []).map((f) => ({
        id: f.id,
        airline: f.airline || '',
        flight_number: f.flight_number || '',
        departure_airport: f.depart_airport || '',
        arrival_airport: f.arrive_airport || '',
        departure_time: f.depart_datetime_utc || '',
        arrival_time: f.arrive_datetime_utc || '',
        booking_reference: f.booking_reference || '',
        status: f.confirmed_at ? 'confirmed' : 'pending'
      }));
      setFlights(mapped);
    } catch (error) {
      console.error('Failed to load flights:', error);
    }
  }

  async function loadDocuments() {
    try {
      const { data, error } = await supabase
        .from('crew_travel_documents')
        .select('*')
        .eq('travel_record_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map to interface
      const mapped: TravelDocument[] = (data || []).map((d: any) => ({
        id: d.id,
        document_type: d.document_type,
        file_name: d.original_filename,
        file_url: d.original_file_path,
        uploaded_at: d.created_at
      }));
      setDocuments(mapped);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this travel record?')) return;

    try {
      const { error } = await supabase
        .from('crew_travel_records')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Travel record deleted');
      navigate('/crew/admin/travel');
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete travel record');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link to="/crew/admin/travel">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Travel Records
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Travel record not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/crew/admin/travel">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Travel Record</h1>
              <Badge className={statusColors[record.status]}>
                {record.status.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {record.crew_member?.first_name} {record.crew_member?.last_name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-red-600" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User className="w-4 h-4" />
              Crew Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {record.crew_member?.first_name} {record.crew_member?.last_name}
            </p>
            {record.crew_member?.rank && (
              <p className="text-sm text-muted-foreground">{record.crew_member.rank}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Route
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {record.origin_airport_code || record.origin_city || 'TBD'} → {record.destination_airport_code || record.destination_city || 'TBD'}
            </p>
            <p className="text-sm text-muted-foreground capitalize">
              {record.travel_type} travel
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {format(new Date(record.departure_date), 'MMM d, yyyy')}
            </p>
            {record.arrival_date && (
              <p className="text-sm text-muted-foreground">
                → {format(new Date(record.arrival_date), 'MMM d, yyyy')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="flights">
        <TabsList>
          <TabsTrigger value="flights">Flight Segments ({flights.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="flights" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Flight Segments</CardTitle>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Flight
              </Button>
            </CardHeader>
            <CardContent>
              {flights.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Plane className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No flight segments added yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {flights.map((flight, index) => (
                    <div key={flight.id} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">
                            {flight.airline} {flight.flight_number}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {flight.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {flight.departure_airport} → {flight.arrival_airport}
                        </p>
                        {flight.booking_reference && (
                          <p className="text-xs text-muted-foreground">
                            Ref: {flight.booking_reference}
                          </p>
                        )}
                      </div>
                      {flight.departure_time && (
                        <div className="text-right">
                          <p className="font-medium">
                            {format(new Date(flight.departure_time), 'MMM d')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(flight.departure_time), 'HH:mm')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Travel Documents</CardTitle>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Upload Document
              </Button>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No documents uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{doc.file_name || doc.document_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Additional Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Travel Type</p>
                  <p className="font-medium capitalize">{record.travel_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={statusColors[record.status]}>
                    {record.status.replace('_', ' ')}
                  </Badge>
                </div>
                {record.vessel && (
                  <div>
                    <p className="text-sm text-muted-foreground">Vessel</p>
                    <p className="font-medium">{record.vessel.name}</p>
                  </div>
                )}
                {record.travel_agent && (
                  <div>
                    <p className="text-sm text-muted-foreground">Travel Agent</p>
                    <p className="font-medium">{record.travel_agent}</p>
                  </div>
                )}
                {record.cost_estimate && (
                  <div>
                    <p className="text-sm text-muted-foreground">Cost Estimate</p>
                    <p className="font-medium">${record.cost_estimate.toLocaleString()}</p>
                  </div>
                )}
              </div>
              {record.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{record.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
