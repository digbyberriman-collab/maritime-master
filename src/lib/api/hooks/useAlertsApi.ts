// Alerts API Hooks (7.6)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { 
  Alert, 
  AlertSummary,
  AcknowledgeAlertRequest,
  SnoozeAlertRequest,
  ResolveAlertRequest,
  ReassignAlertRequest 
} from '../types';

// Query keys
export const alertsKeys = {
  all: ['alerts'] as const,
  list: (companyId: string) => [...alertsKeys.all, 'list', companyId] as const,
  listVessel: (vesselId: string) => [...alertsKeys.all, 'vessel', vesselId] as const,
  summary: (companyId: string) => [...alertsKeys.all, 'summary', companyId] as const,
  detail: (id: string) => [...alertsKeys.all, 'detail', id] as const,
};

// Map DB row to API type
const mapAlertFromDb = (row: any): Alert => ({
  id: row.id,
  companyId: row.company_id,
  vesselId: row.vessel_id,
  vesselName: row.vessel?.name,
  alertType: row.alert_type,
  severityColor: row.severity_color?.toLowerCase() as 'red' | 'amber' | 'green',
  title: row.title,
  description: row.description,
  dueAt: row.due_at,
  status: row.status?.toLowerCase() as Alert['status'],
  acknowledgedBy: row.acknowledged_by,
  acknowledgedAt: row.acknowledged_at,
  snoozedUntil: row.snoozed_until,
  lastSnoozeReason: row.last_snooze_reason,
  snoozeCount: row.snooze_count ?? 0,
  resolvedBy: row.resolved_by,
  resolvedAt: row.resolved_at,
  sourceModule: row.source_module,
  relatedEntityType: row.related_entity_type,
  relatedEntityId: row.related_entity_id,
  ownerUserId: row.owner_user_id,
  ownerRole: row.owner_role,
  assignedToUserId: row.assigned_to_user_id,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// GET /api/alerts - List alerts
export const useAlertsApi = (vesselId?: string) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: vesselId ? alertsKeys.listVessel(vesselId) : alertsKeys.list(profile?.company_id || ''),
    queryFn: async (): Promise<Alert[]> => {
      if (!profile?.company_id) return [];
      
      let query = supabase
        .from('alerts')
        .select(`
          *,
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .neq('status', 'RESOLVED')
        .order('created_at', { ascending: false });

      if (vesselId) {
        query = query.eq('vessel_id', vesselId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return (data || []).map(mapAlertFromDb);
    },
    enabled: !!profile?.company_id,
  });
};

// GET /api/alerts/summary - Get alert counts by severity
export const useAlertSummary = (vesselId?: string) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: [...alertsKeys.summary(profile?.company_id || ''), vesselId],
    queryFn: async (): Promise<AlertSummary> => {
      if (!profile?.company_id) return { red: 0, amber: 0, green: 0, total: 0 };
      
      let query = supabase
        .from('alerts')
        .select('severity_color')
        .eq('company_id', profile.company_id)
        .eq('status', 'OPEN');

      if (vesselId) {
        query = query.eq('vessel_id', vesselId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;

      return {
        red: data?.filter(a => a.severity_color === 'RED').length || 0,
        amber: data?.filter(a => a.severity_color === 'ORANGE' || a.severity_color === 'YELLOW').length || 0,
        green: data?.filter(a => a.severity_color === 'GREEN').length || 0,
        total: data?.length || 0,
      };
    },
    enabled: !!profile?.company_id,
  });
};

// POST /api/alerts/{id}/acknowledge - Acknowledge alert
export const useAcknowledgeAlert = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ alertId, data }: { alertId: string; data?: AcknowledgeAlertRequest }) => {
      const updateData: Record<string, unknown> = {
        status: 'ACKNOWLEDGED',
        acknowledged_by: user?.id,
        acknowledged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      if (data?.notes) {
        updateData.metadata = { acknowledgment_notes: data.notes };
      }

      const { data: result, error } = await supabase
        .from('alerts')
        .update(updateData)
        .eq('id', alertId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.all });
      toast({ title: 'Success', description: 'Alert acknowledged' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/alerts/{id}/snooze - Snooze alert
export const useSnoozeAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, data }: { alertId: string; data: SnoozeAlertRequest }) => {
      const snoozedUntil = new Date();
      snoozedUntil.setDate(snoozedUntil.getDate() + data.snoozeDays);

      // Get current snooze count first
      const { data: current } = await supabase
        .from('alerts')
        .select('snooze_count')
        .eq('id', alertId)
        .single();

      const { data: result, error } = await supabase
        .from('alerts')
        .update({
          status: 'SNOOZED',
          snoozed_until: snoozedUntil.toISOString(),
          last_snooze_reason: data.reason,
          snooze_count: (current?.snooze_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alertId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.all });
      toast({ title: 'Success', description: 'Alert snoozed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/alerts/{id}/resolve - Resolve alert
export const useResolveAlert = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ alertId, data }: { alertId: string; data?: ResolveAlertRequest }) => {
      const updateData: Record<string, unknown> = {
        status: 'RESOLVED',
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      if (data?.notes) {
        updateData.metadata = { resolution_notes: data.notes };
      }

      const { data: result, error } = await supabase
        .from('alerts')
        .update(updateData)
        .eq('id', alertId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.all });
      toast({ title: 'Success', description: 'Alert resolved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};

// POST /api/alerts/{id}/reassign - Reassign alert
export const useReassignAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, data }: { alertId: string; data: ReassignAlertRequest }) => {
      const { data: result, error } = await supabase
        .from('alerts')
        .update({
          assigned_to_user_id: data.assignToUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alertId)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsKeys.all });
      toast({ title: 'Success', description: 'Alert reassigned' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
};
