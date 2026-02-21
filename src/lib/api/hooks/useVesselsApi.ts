// Vessels API Hooks (7.2) - Simplified version
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from '@/shared/hooks/use-toast';
import type { 
  Vessel, 
  UpdateVesselRequest, 
  UpdateEmergencyContactsRequest,
  CrewOnboardOverrideRequest 
} from '../types';

// Query keys
export const vesselsKeys = {
  all: ['vessels-api'] as const,
  list: (companyId: string) => [...vesselsKeys.all, 'list', companyId] as const,
  detail: (id: string) => [...vesselsKeys.all, 'detail', id] as const,
  crewOnboard: (id: string) => [...vesselsKeys.all, 'crew-onboard', id] as const,
};

// Map DB row to API type
const mapVesselFromDb = (row: any): Vessel => ({
  id: row.id,
  companyId: row.company_id,
  fleetGroupId: row.fleet_group_id,
  name: row.name,
  imoNumber: row.imo_number,
  mmsi: row.mmsi,
  callSign: row.call_sign,
  flagState: row.flag_state,
  classSociety: row.classification_society,
  vesselType: row.vessel_type,
  homePort: row.home_port,
  grossTonnage: row.gross_tonnage,
  lengthOverall: row.length_overall,
  beam: row.beam,
  draft: row.draft,
  yearBuilt: row.build_year,
  builder: row.builder,
  operationalStatus: row.operational_status || 'ACTIVE',
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// GET /api/vessels - List vessels
export const useVesselsApi = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: vesselsKeys.list(profile?.company_id || ''),
    queryFn: async (): Promise<Vessel[]> => {
      if (!profile?.company_id) return [];
      
      const { data, error } = await supabase
        .from('vessels')
        .select('*')
        .eq('company_id', profile.company_id)
        .neq('status', 'Sold')
        .order('name');
      
      if (error) throw error;
      return (data || []).map(mapVesselFromDb);
    },
    enabled: !!profile?.company_id,
  });
};

// GET /api/vessels/{id} - Get vessel details
export const useVesselApi = (vesselId: string) => {
  return useQuery({
    queryKey: vesselsKeys.detail(vesselId),
    queryFn: async (): Promise<Vessel> => {
      const { data, error } = await supabase
        .from('vessels')
        .select('*')
        .eq('id', vesselId)
        .single();
      
      if (error) throw error;
      return mapVesselFromDb(data);
    },
    enabled: !!vesselId,
  });
};

// PATCH /api/vessels/{id} - Update vessel
export const useUpdateVesselApi = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vesselId, data }: { vesselId: string; data: UpdateVesselRequest }) => {
      const { data: result, error } = await supabase
        .from('vessels')
        .update({
          name: data.name,
          imo_number: data.imoNumber,
          mmsi: data.mmsi,
          call_sign: data.callSign,
          flag_state: data.flagState,
          classification_society: data.classSociety,
          vessel_type: data.vesselType,
          home_port: data.homePort,
          gross_tonnage: data.grossTonnage,
          length_overall: data.lengthOverall,
          beam: data.beam,
          draft: data.draft,
          build_year: data.yearBuilt,
          builder: data.builder,
          operational_status: data.operationalStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vesselId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, { vesselId }) => {
      queryClient.invalidateQueries({ queryKey: vesselsKeys.detail(vesselId) });
      queryClient.invalidateQueries({ queryKey: vesselsKeys.all });
      toast({ title: 'Success', description: 'Vessel updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// PATCH /api/vessels/{id}/emergency-details - Update emergency contacts
export const useUpdateEmergencyContactsApi = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vesselId, data }: { vesselId: string; data: UpdateEmergencyContactsRequest }) => {
      const { data: result, error } = await supabase
        .from('vessels')
        .update({
          emergency_primary_contact_name: data.primaryContactName,
          emergency_primary_phone: data.primaryPhone,
          emergency_primary_email: data.primaryEmail,
          emergency_secondary_contact_name: data.secondaryContactName,
          emergency_secondary_phone: data.secondaryPhone,
          emergency_secondary_email: data.secondaryEmail,
          mrcc_contact_info: data.mrccContactInfo,
          flag_state_emergency_contact: data.flagStateEmergencyContact,
          class_emergency_contact: data.classEmergencyContact,
          medical_support_contact: data.medicalSupportContact,
          security_support_contact: data.securitySupportContact,
          nearest_port_agent_contact: data.nearestPortAgentContact,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vesselId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, { vesselId }) => {
      queryClient.invalidateQueries({ queryKey: vesselsKeys.detail(vesselId) });
      toast({ title: 'Success', description: 'Emergency contacts updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// GET /api/vessels/{id}/crew-onboard - Get current crew count
export const useCrewOnboardApi = (vesselId: string) => {
  return useQuery({
    queryKey: vesselsKeys.crewOnboard(vesselId),
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data: snapshot } = await supabase
        .from('daily_crew_snapshots')
        .select('*')
        .eq('vessel_id', vesselId)
        .eq('snapshot_date', today)
        .single();

      if (snapshot) {
        return {
          count: snapshot.crew_onboard_count,
          captain: snapshot.captain_name,
          isOverride: snapshot.source === 'MANUAL_OVERRIDE',
        };
      }

      const { count } = await supabase
        .from('crew_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('vessel_id', vesselId)
        .eq('is_current', true);

      return { count: count || 0, captain: null, isOverride: false };
    },
    enabled: !!vesselId,
  });
};

// POST /api/vessels/{id}/crew-onboard/override - Override crew count
export const useOverrideCrewOnboardApi = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ vesselId, data }: { vesselId: string; data: CrewOnboardOverrideRequest }) => {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: result, error } = await supabase
        .from('daily_crew_snapshots')
        .upsert({
          vessel_id: vesselId,
          snapshot_date: today,
          crew_onboard_count: data.count,
          source: 'MANUAL_OVERRIDE',
          override_reason: data.reason,
          overridden_by: user?.id,
          overridden_at: new Date().toISOString(),
        }, { onConflict: 'vessel_id,snapshot_date' })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, { vesselId }) => {
      queryClient.invalidateQueries({ queryKey: vesselsKeys.crewOnboard(vesselId) });
      toast({ title: 'Success', description: 'Crew count overridden' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};
