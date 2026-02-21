// Flights API Hooks (7.5)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from '@/shared/hooks/use-toast';
import type { 
  FlightRequest, 
  CreateFlightRequestRequest, 
  UpdateFlightRequestRequest,
  FlightBooking,
  CreateBookingRequest 
} from '../types';

// Query keys
export const flightsKeys = {
  all: ['flights'] as const,
  list: (companyId: string) => [...flightsKeys.all, 'list', companyId] as const,
  listVessel: (vesselId: string) => [...flightsKeys.all, 'vessel', vesselId] as const,
  detail: (id: string) => [...flightsKeys.all, 'detail', id] as const,
};

// Map DB row to API type
const mapFlightRequestFromDb = (row: any): FlightRequest => ({
  id: row.id,
  crewId: row.crew_id,
  crewName: row.crew ? `${row.crew.first_name} ${row.crew.last_name}` : undefined,
  vesselId: row.vessel_id,
  vesselName: row.vessel?.name,
  companyId: row.company_id,
  requestNumber: row.request_number,
  requestType: row.request_type,
  departFrom: row.depart_from,
  arriveTo: row.arrive_to,
  earliestDepartureDate: row.earliest_departure_date,
  latestDepartureDate: row.latest_departure_date,
  preferredAirline: row.preferred_airline,
  baggageNotes: row.baggage_notes,
  passportNationality: row.passport_nationality,
  visaRequirements: row.visa_requirements,
  assignedAgentId: row.assigned_agent_id,
  status: row.status,
  approvedBy: row.approved_by,
  approvedAt: row.approved_at,
  notes: row.notes,
  booking: row.booking?.[0] ? mapFlightBookingFromDb(row.booking[0]) : undefined,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapFlightBookingFromDb = (row: any): FlightBooking => ({
  id: row.id,
  flightRequestId: row.flight_request_id,
  airline: row.airline,
  flightNumber: row.flight_number,
  departAirport: row.depart_airport,
  arriveAirport: row.arrive_airport,
  departDatetimeUtc: row.depart_datetime_utc,
  arriveDatetimeUtc: row.arrive_datetime_utc,
  bookingReference: row.booking_reference,
  ticketNumber: row.ticket_number,
  seatNumber: row.seat_number,
  costAmount: row.cost_amount,
  currency: row.currency,
  bookedBy: row.booked_by,
  bookedAt: row.booked_at,
  confirmedAt: row.confirmed_at,
  itineraryFileUrl: row.itinerary_file_url,
  travelLetterFileUrl: row.travel_letter_file_url,
  createdAt: row.created_at,
});

// GET /api/flights/requests - List flight requests
export const useFlightRequests = (vesselId?: string) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: vesselId ? flightsKeys.listVessel(vesselId) : flightsKeys.list(profile?.company_id || ''),
    queryFn: async (): Promise<FlightRequest[]> => {
      if (!profile?.company_id) return [];
      
      let query = supabase
        .from('flight_requests')
        .select(`
          *,
          crew:profiles!flight_requests_crew_id_fkey(first_name, last_name),
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (vesselId) {
        query = query.eq('vessel_id', vesselId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return (data || []).map(mapFlightRequestFromDb);
    },
    enabled: !!profile?.company_id,
  });
};

// GET /api/flights/requests/{id} - Get flight request
export const useFlightRequest = (requestId: string) => {
  return useQuery({
    queryKey: flightsKeys.detail(requestId),
    queryFn: async (): Promise<FlightRequest> => {
      const { data, error } = await supabase
        .from('flight_requests')
        .select(`
          *,
          crew:profiles!flight_requests_crew_id_fkey(first_name, last_name),
          vessel:vessels(name),
          booking:flight_bookings(*)
        `)
        .eq('id', requestId)
        .single();
      
      if (error) throw error;
      return mapFlightRequestFromDb(data);
    },
    enabled: !!requestId,
  });
};

// POST /api/flights/requests - Create flight request
export const useCreateFlightRequest = () => {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateFlightRequestRequest) => {
      // Generate request number
      const requestNumber = `FR-${Date.now().toString(36).toUpperCase()}`;

      const { data: result, error } = await supabase
        .from('flight_requests')
        .insert({
          crew_id: data.crewId,
          vessel_id: data.vesselId,
          company_id: profile?.company_id,
          request_number: requestNumber,
          request_type: data.requestType,
          depart_from: data.departFrom,
          arrive_to: data.arriveTo,
          earliest_departure_date: data.earliestDepartureDate,
          latest_departure_date: data.latestDepartureDate,
          preferred_airline: data.preferredAirline,
          baggage_notes: data.baggageNotes,
          passport_nationality: data.passportNationality,
          visa_requirements: data.visaRequirements,
          notes: data.notes,
          status: 'DRAFT',
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flightsKeys.all });
      toast({ title: 'Success', description: 'Flight request created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// PATCH /api/flights/requests/{id} - Update flight request
export const useUpdateFlightRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, data }: { requestId: string; data: UpdateFlightRequestRequest }) => {
      const { data: result, error } = await supabase
        .from('flight_requests')
        .update({
          depart_from: data.departFrom,
          arrive_to: data.arriveTo,
          earliest_departure_date: data.earliestDepartureDate,
          latest_departure_date: data.latestDepartureDate,
          preferred_airline: data.preferredAirline,
          baggage_notes: data.baggageNotes,
          notes: data.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: flightsKeys.detail(requestId) });
      queryClient.invalidateQueries({ queryKey: flightsKeys.all });
      toast({ title: 'Success', description: 'Flight request updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/flights/requests/{id}/send-to-agent - Send to agent
export const useSendToAgent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, agentId }: { requestId: string; agentId?: string }) => {
      const { data: result, error } = await supabase
        .from('flight_requests')
        .update({
          status: 'SUBMITTED_TO_AGENT',
          assigned_agent_id: agentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: flightsKeys.detail(requestId) });
      queryClient.invalidateQueries({ queryKey: flightsKeys.all });
      toast({ title: 'Success', description: 'Request sent to agent' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/flights/requests/{id}/booking - Add booking
export const useAddBooking = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ requestId, data }: { requestId: string; data: CreateBookingRequest }) => {
      const { data: result, error } = await supabase
        .from('flight_bookings')
        .insert({
          flight_request_id: requestId,
          airline: data.airline,
          flight_number: data.flightNumber,
          depart_airport: data.departAirport,
          arrive_airport: data.arriveAirport,
          depart_datetime_utc: data.departDatetimeUtc,
          arrive_datetime_utc: data.arriveDatetimeUtc,
          booking_reference: data.bookingReference,
          cost_amount: data.costAmount,
          currency: data.currency,
          booked_by: user?.id,
          booked_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;

      // Update request status
      await supabase
        .from('flight_requests')
        .update({ status: 'BOOKED' })
        .eq('id', requestId);

      return result;
    },
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: flightsKeys.detail(requestId) });
      queryClient.invalidateQueries({ queryKey: flightsKeys.all });
      toast({ title: 'Success', description: 'Booking added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/flights/requests/{id}/confirm - Confirm booking
export const useConfirmBooking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      // Update booking
      const { error: bookingError } = await supabase
        .from('flight_bookings')
        .update({
          confirmed_at: new Date().toISOString(),
        })
        .eq('flight_request_id', requestId);
      
      if (bookingError) throw bookingError;

      // Update request status
      const { data: result, error } = await supabase
        .from('flight_requests')
        .update({ status: 'CONFIRMED' })
        .eq('id', requestId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, requestId) => {
      queryClient.invalidateQueries({ queryKey: flightsKeys.detail(requestId) });
      queryClient.invalidateQueries({ queryKey: flightsKeys.all });
      toast({ title: 'Success', description: 'Booking confirmed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};
