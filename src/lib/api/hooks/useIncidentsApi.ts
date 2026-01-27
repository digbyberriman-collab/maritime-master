// Incidents & Investigations API Hooks (7.8)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { 
  Incident, 
  CreateIncidentRequest, 
  UpdateIncidentRequest,
  OpenInvestigationRequest,
  NoInvestigationRequest,
  NotifyShippingMasterRequest,
  Investigation,
  UpdateInvestigationRequest 
} from '../types';

// Query keys
export const incidentsKeys = {
  all: ['incidents-api'] as const,
  list: (companyId: string) => [...incidentsKeys.all, 'list', companyId] as const,
  listVessel: (vesselId: string) => [...incidentsKeys.all, 'vessel', vesselId] as const,
  detail: (id: string) => [...incidentsKeys.all, 'detail', id] as const,
  investigation: (id: string) => [...incidentsKeys.all, 'investigation', id] as const,
};

// Map DB row to API type
const mapIncidentFromDb = (row: any): Incident => ({
  id: row.id,
  companyId: row.company_id,
  vesselId: row.vessel_id,
  vesselName: row.vessel?.name,
  incidentNumber: row.incident_number,
  incidentType: row.incident_type,
  severity: row.severity,
  title: row.title,
  description: row.description,
  incidentDate: row.incident_date,
  incidentTime: row.incident_time,
  location: row.location,
  immediateCause: row.immediate_cause,
  rootCause: row.root_cause,
  causeCategories: row.cause_categories,
  involvedCrewIds: row.involved_crew_ids,
  witnessCrewIds: row.witness_crew_ids,
  injuriesReported: row.injuries_reported ?? false,
  status: row.status,
  investigationRequired: row.investigation_required,
  investigationId: row.investigation_id,
  noInvestigationReason: row.no_investigation_reason,
  noInvestigationApprovedBy: row.no_investigation_approved_by,
  noInvestigationApprovedAt: row.no_investigation_approved_at,
  shippingMasterNotified: row.shipping_master_notified ?? false,
  shippingMasterMessage: row.shipping_master_message,
  dpaNotifiedAt: row.dpa_notified_at,
  reportedBy: row.reported_by,
  reportedAt: row.reported_at ?? row.created_at,
  updatedAt: row.updated_at,
});

const mapInvestigationFromDb = (row: any): Investigation => ({
  id: row.id,
  incidentId: row.incident_id,
  investigationNumber: row.investigation_number,
  leadInvestigatorId: row.lead_investigator_id,
  leadInvestigatorName: row.lead_investigator 
    ? `${row.lead_investigator.first_name} ${row.lead_investigator.last_name}`
    : undefined,
  teamMemberIds: row.team_member_ids,
  status: row.status,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  findings: row.findings,
  recommendations: row.recommendations,
  createdAt: row.created_at,
});

// GET /api/incidents - List incidents
export const useIncidentsApi = (vesselId?: string, anonymized?: boolean) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: vesselId ? incidentsKeys.listVessel(vesselId) : incidentsKeys.list(profile?.company_id || ''),
    queryFn: async (): Promise<Incident[]> => {
      if (!profile?.company_id) return [];
      
      let query = supabase
        .from('incidents')
        .select(`
          *,
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .order('incident_date', { ascending: false });

      if (vesselId) {
        query = query.eq('vessel_id', vesselId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const mapped = (data || []).map(mapIncidentFromDb);
      
      // Anonymize if requested (for crew view)
      if (anonymized) {
        return mapped.map(i => ({
          ...i,
          involvedCrewIds: undefined,
          witnessCrewIds: undefined,
          reportedBy: undefined,
        }));
      }

      return mapped;
    },
    enabled: !!profile?.company_id,
  });
};

// GET /api/incidents/{id} - Get incident
export const useIncidentApi = (incidentId: string) => {
  return useQuery({
    queryKey: incidentsKeys.detail(incidentId),
    queryFn: async (): Promise<Incident> => {
      const { data, error } = await supabase
        .from('incidents')
        .select(`
          *,
          vessel:vessels(name)
        `)
        .eq('id', incidentId)
        .single();
      
      if (error) throw error;
      return mapIncidentFromDb(data);
    },
    enabled: !!incidentId,
  });
};

// POST /api/incidents - Create incident
export const useCreateIncidentApi = () => {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateIncidentRequest) => {
      // Generate incident number
      const incidentNumber = `INC-${Date.now().toString(36).toUpperCase()}`;

      const insertData: Record<string, unknown> = {
        company_id: profile?.company_id,
        vessel_id: data.vesselId,
        incident_number: incidentNumber,
        incident_type: data.incidentType,
        severity: data.severity,
        title: data.title,
        description: data.description,
        incident_date: data.incidentDate,
        incident_time: data.incidentTime,
        location: data.location,
        injuries_reported: data.injuriesReported || false,
        status: 'Reported',
        reported_by: user?.id,
      };

      const { data: result, error } = await supabase
        .from('incidents')
        .insert(insertData as any)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentsKeys.all });
      toast({ title: 'Success', description: 'Incident reported successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// PATCH /api/incidents/{id} - Update incident
export const useUpdateIncidentApi = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId, data }: { incidentId: string; data: UpdateIncidentRequest }) => {
      const { data: result, error } = await supabase
        .from('incidents')
        .update({
          incident_type: data.incidentType,
          severity: data.severity,
          title: data.title,
          description: data.description,
          incident_date: data.incidentDate,
          incident_time: data.incidentTime,
          location: data.location,
          immediate_cause: data.immediateCause,
          root_cause: data.rootCause,
          cause_categories: data.causeCategories,
          involved_crew_ids: data.involvedCrewIds,
          witness_crew_ids: data.witnessCrewIds,
          injuries_reported: data.injuriesReported,
          updated_at: new Date().toISOString(),
        })
        .eq('id', incidentId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: incidentsKeys.detail(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentsKeys.all });
      toast({ title: 'Success', description: 'Incident updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/incidents/{id}/open-investigation - Open investigation
// Note: This requires an 'investigations' table which may not exist yet
export const useOpenInvestigationApi = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId, data }: { incidentId: string; data: OpenInvestigationRequest }) => {
      // Update incident to mark investigation required
      const { data: result, error } = await supabase
        .from('incidents')
        .update({
          status: 'Under Investigation',
          investigation_required: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', incidentId)
        .select()
        .single();
      
      if (error) throw error;

      // TODO: Create investigation record when table exists
      return result;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: incidentsKeys.detail(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentsKeys.all });
      toast({ title: 'Success', description: 'Investigation opened' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/incidents/{id}/no-investigation - Approve no investigation
export const useApproveNoInvestigationApi = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ incidentId, data }: { incidentId: string; data: NoInvestigationRequest }) => {
      const { data: result, error } = await supabase
        .from('incidents')
        .update({
          investigation_required: false,
          no_investigation_reason: data.reason,
          no_investigation_approved_by: user?.id,
          no_investigation_approved_at: new Date().toISOString(),
          status: 'Closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', incidentId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: incidentsKeys.detail(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentsKeys.all });
      toast({ title: 'Success', description: 'No investigation approved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/incidents/{id}/notify-shipping-master - Notify shipping master
export const useNotifyShippingMasterApi = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId, data }: { incidentId: string; data: NotifyShippingMasterRequest }) => {
      const { data: result, error } = await supabase
        .from('incidents')
        .update({
          shipping_master_notified: true,
          shipping_master_message: data.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', incidentId)
        .select()
        .single();
      
      if (error) throw error;
      
      // TODO: Send notification via edge function
      return result;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: incidentsKeys.detail(incidentId) });
      toast({ title: 'Success', description: 'Shipping master notified' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};
