import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ComplianceAccessLog } from '@/lib/compliance/types';

interface LogAccessParams {
  module: 'hr' | 'insurance' | 'crew' | 'incidents';
  action: 'view' | 'export' | 'edit' | 'archive' | 'anonymize' | 'delete';
  entityType: string;
  entityId: string;
  accessedFields?: string[];
  isAuditMode?: boolean;
  auditSessionId?: string;
  accessGranted?: boolean;
  denialReason?: string;
}

export const useComplianceAccessLog = () => {
  const { user, profile } = useAuth();

  const logAccess = async (params: LogAccessParams) => {
    if (!user || !profile?.company_id) {
      console.warn('Cannot log compliance access: No authenticated user or company');
      return;
    }

    try {
      const { error } = await supabase.from('compliance_access_log').insert({
        company_id: profile.company_id,
        user_id: user.id,
        user_role: profile.role || 'unknown',
        module: params.module,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        accessed_fields: params.accessedFields || [],
        is_audit_mode: params.isAuditMode || false,
        audit_session_id: params.auditSessionId,
        ip_address: null, // Would need to get from server
        user_agent: navigator.userAgent,
        access_granted: params.accessGranted ?? true,
        denial_reason: params.denialReason,
      });

      if (error) {
        console.error('Failed to log compliance access:', error);
      }
    } catch (error) {
      console.error('Error logging compliance access:', error);
    }
  };

  const logHRAccess = async (
    action: LogAccessParams['action'],
    entityType: string,
    entityId: string,
    accessedFields?: string[],
    accessGranted = true,
    denialReason?: string
  ) => {
    return logAccess({
      module: 'hr',
      action,
      entityType,
      entityId,
      accessedFields,
      accessGranted,
      denialReason,
    });
  };

  const logInsuranceAccess = async (
    action: LogAccessParams['action'],
    entityType: string,
    entityId: string,
    accessedFields?: string[],
    isAuditMode = false,
    auditSessionId?: string
  ) => {
    return logAccess({
      module: 'insurance',
      action,
      entityType,
      entityId,
      accessedFields,
      isAuditMode,
      auditSessionId,
    });
  };

  return {
    logAccess,
    logHRAccess,
    logInsuranceAccess,
  };
};
