import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVessel } from '@/contexts/VesselContext';
import { useToast } from '@/hooks/use-toast';
import type { AlertSeverity, AlertStatus } from '@/lib/alertConstants';
import { ALERT_RULES } from '@/lib/alertConstants';

export interface Alert {
  id: string;
  alert_type: string;
  severity_color: AlertSeverity;
  title: string;
  description: string | null;
  company_id: string;
  vessel_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  owner_user_id: string | null;
  owner_role: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
  due_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  status: AlertStatus;
  snooze_count: number;
  snoozed_until: string | null;
  last_snooze_reason: string | null;
  escalation_level: number;
  escalated_at: string | null;
  escalated_to_user_ids: string[] | null;
  source_module: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
  // Joined data
  vessel?: { name: string } | null;
}

export interface AlertCounts {
  RED: number;
  ORANGE: number;
  YELLOW: number;
  GREEN: number;
  total: number;
}

export interface CreateAlertData {
  alert_type: string;
  severity_color: AlertSeverity;
  title: string;
  description?: string;
  vessel_id?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  owner_user_id?: string;
  owner_role?: string;
  assigned_to_user_id?: string;
  due_at?: string;
  source_module?: string;
  metadata?: Record<string, unknown>;
}

export function useAlerts() {
  const { profile } = useAuth();
  const { selectedVesselId, isAllVessels } = useVessel();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all alerts for the company with optional vessel filter
  const alertsQuery = useQuery({
    queryKey: ['alerts', profile?.company_id, selectedVesselId, isAllVessels],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from('alerts')
        .select(`
          *,
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      // Filter by vessel if selected (not "all vessels" mode)
      if (!isAllVessels && selectedVesselId) {
        query = query.eq('vessel_id', selectedVesselId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Alert[];
    },
    enabled: !!profile?.company_id,
  });

  // Get alert counts by severity
  const alertCountsQuery = useQuery({
    queryKey: ['alert-counts', profile?.company_id, selectedVesselId, isAllVessels],
    queryFn: async (): Promise<AlertCounts> => {
      if (!profile?.company_id) {
        return { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0, total: 0 };
      }

      let query = supabase
        .from('alerts')
        .select('severity_color, status')
        .eq('company_id', profile.company_id)
        .in('status', ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED']);

      if (!isAllVessels && selectedVesselId) {
        query = query.eq('vessel_id', selectedVesselId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const counts: AlertCounts = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0, total: 0 };
      
      (data || []).forEach((alert) => {
        const severity = alert.severity_color as AlertSeverity;
        if (severity in counts) {
          counts[severity]++;
          counts.total++;
        }
      });

      return counts;
    },
    enabled: !!profile?.company_id,
  });

  // Create a new alert
  const createAlertMutation = useMutation({
    mutationFn: async (data: CreateAlertData) => {
      if (!profile?.company_id) throw new Error('No company ID');

      const insertData = {
        alert_type: data.alert_type,
        severity_color: data.severity_color,
        title: data.title,
        description: data.description || null,
        company_id: profile.company_id,
        vessel_id: data.vessel_id || null,
        related_entity_type: data.related_entity_type || null,
        related_entity_id: data.related_entity_id || null,
        owner_user_id: data.owner_user_id || null,
        owner_role: data.owner_role || null,
        assigned_to_user_id: data.assigned_to_user_id || null,
        due_at: data.due_at || null,
        source_module: data.source_module || null,
        metadata: data.metadata || {},
      };

      const { data: alert, error } = await supabase
        .from('alerts')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return alert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-counts'] });
    },
  });

  // Acknowledge an alert
  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('alerts')
        .update({
          status: 'ACKNOWLEDGED' as AlertStatus,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: profile.user_id,
        })
        .eq('id', alertId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-counts'] });
      toast({
        title: 'Alert Acknowledged',
        description: 'The alert has been acknowledged.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to acknowledge alert.',
        variant: 'destructive',
      });
      console.error('Acknowledge error:', error);
    },
  });

  // Snooze an alert
  const snoozeAlertMutation = useMutation({
    mutationFn: async ({ alertId, hours, reason }: { alertId: string; hours: number; reason?: string }) => {
      // First get the current alert to check snooze rules
      const { data: currentAlert, error: fetchError } = await supabase
        .from('alerts')
        .select('severity_color, snooze_count')
        .eq('id', alertId)
        .single();

      if (fetchError) throw fetchError;

      const severity = currentAlert.severity_color as AlertSeverity;
      const rules = ALERT_RULES[severity];

      if (!rules.snooze.allowed) {
        throw new Error('This alert cannot be snoozed');
      }

      if (currentAlert.snooze_count >= rules.snooze.max_snoozes) {
        throw new Error(`Maximum snoozes (${rules.snooze.max_snoozes}) reached`);
      }

      if (hours > rules.snooze.max_duration_hours) {
        throw new Error(`Maximum snooze duration is ${rules.snooze.max_duration_hours} hours`);
      }

      if (rules.snooze.requires_reason && !reason) {
        throw new Error('A reason is required to snooze this alert');
      }

      const snoozedUntil = new Date();
      snoozedUntil.setHours(snoozedUntil.getHours() + hours);

      const { data, error } = await supabase
        .from('alerts')
        .update({
          status: 'SNOOZED' as AlertStatus,
          snooze_count: currentAlert.snooze_count + 1,
          snoozed_until: snoozedUntil.toISOString(),
          last_snooze_reason: reason || null,
        })
        .eq('id', alertId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-counts'] });
      toast({
        title: 'Alert Snoozed',
        description: 'The alert has been snoozed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Cannot Snooze',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Resolve an alert
  const resolveAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('alerts')
        .update({
          status: 'RESOLVED' as AlertStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: profile.user_id,
        })
        .eq('id', alertId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-counts'] });
      toast({
        title: 'Alert Resolved',
        description: 'The alert has been resolved.',
      });
    },
  });

  // Get alerts filtered by severity
  const getAlertsBySeverity = (severity: AlertSeverity) => {
    return (alertsQuery.data || []).filter(
      (alert) => alert.severity_color === severity && 
      ['OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'ESCALATED'].includes(alert.status)
    );
  };

  return {
    alerts: alertsQuery.data || [],
    alertCounts: alertCountsQuery.data || { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0, total: 0 },
    isLoading: alertsQuery.isLoading || alertCountsQuery.isLoading,
    error: alertsQuery.error || alertCountsQuery.error,
    createAlert: createAlertMutation.mutateAsync,
    acknowledgeAlert: acknowledgeAlertMutation.mutateAsync,
    snoozeAlert: snoozeAlertMutation.mutateAsync,
    resolveAlert: resolveAlertMutation.mutateAsync,
    getAlertsBySeverity,
    refetch: () => {
      alertsQuery.refetch();
      alertCountsQuery.refetch();
    },
  };
}
