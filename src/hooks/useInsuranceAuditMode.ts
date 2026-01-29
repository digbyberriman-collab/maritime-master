import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { InsuranceAuditSession, InsurancePolicy } from '@/lib/compliance/types';
import { 
  isAuditSessionActive, 
  generateAuditAccessToken,
  transformInsurancePolicyForAudit 
} from '@/lib/compliance/auditModeExtensions';

export const useInsuranceAuditMode = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;

  // Fetch active insurance audit sessions
  const { data: auditSessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['insurance-audit-sessions', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from('insurance_audit_sessions')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as InsuranceAuditSession[];
    },
    enabled: !!companyId,
  });

  // Get currently active session
  const activeSession = auditSessions?.find(isAuditSessionActive);

  // Create new insurance audit session
  const createAuditSession = useMutation({
    mutationFn: async (params: {
      audit_party: string;
      auditor_name?: string;
      auditor_email?: string;
      vessel_id?: string;
      start_datetime: string;
      end_datetime: string;
    }) => {
      if (!companyId || !user?.id) throw new Error('Not authenticated');
      
      const accessToken = generateAuditAccessToken();
      const tokenExpiry = new Date(params.end_datetime);
      
      const { data, error } = await supabase
        .from('insurance_audit_sessions')
        .insert({
          company_id: companyId,
          vessel_id: params.vessel_id,
          audit_party: params.audit_party,
          auditor_name: params.auditor_name,
          auditor_email: params.auditor_email,
          start_datetime: params.start_datetime,
          end_datetime: params.end_datetime,
          is_active: true,
          access_token: accessToken,
          access_token_expires_at: tokenExpiry.toISOString(),
          created_by: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance-audit-sessions', companyId] });
      toast({
        title: 'Audit Session Created',
        description: 'Insurance audit mode session has been created.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Creation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Revoke/deactivate audit session
  const revokeAuditSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase
        .from('insurance_audit_sessions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance-audit-sessions', companyId] });
      toast({
        title: 'Session Revoked',
        description: 'Insurance audit session has been deactivated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Revocation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Transform insurance data for audit view
  const getAuditSafeInsuranceData = <T extends Record<string, unknown>>(
    policies: T[]
  ): Partial<T>[] => {
    return policies.map(transformInsurancePolicyForAudit);
  };

  // Check if current user is in audit mode
  const isInAuditMode = (): boolean => {
    return !!activeSession;
  };

  return {
    auditSessions,
    activeSession,
    sessionsLoading,
    createAuditSession,
    revokeAuditSession,
    getAuditSafeInsuranceData,
    isInAuditMode,
  };
};
