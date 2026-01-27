import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AuditLogEntry {
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changedFields?: Record<string, boolean>;
}

export const useAuditLog = () => {
  const { user, profile } = useAuth();

  const logAudit = async (entry: AuditLogEntry) => {
    if (!user || !profile) {
      console.error('Cannot log audit: No authenticated user');
      return;
    }

    try {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        actor_user_id: user.id,
        actor_email: profile.email,
        actor_role: profile.role,
        changed_fields: entry.changedFields || {},
        old_values: entry.oldValues || {},
        new_values: entry.newValues || {},
        user_agent: navigator.userAgent,
      });

      if (error) {
        console.error('Failed to log audit:', error);
      }
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  };

  const logProfileUpdate = async (
    userId: string,
    oldData: Record<string, any>,
    newData: Record<string, any>
  ) => {
    const changedFields: Record<string, boolean> = {};
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    Object.keys(newData).forEach((key) => {
      if (oldData[key] !== newData[key]) {
        changedFields[key] = true;
        oldValues[key] = oldData[key];
        newValues[key] = newData[key];
      }
    });

    // Only log if there are actual changes
    if (Object.keys(changedFields).length === 0) {
      return;
    }

    await logAudit({
      entityType: 'crew_profile',
      entityId: userId,
      action: 'UPDATE',
      oldValues,
      newValues,
      changedFields,
    });
  };

  return {
    logAudit,
    logProfileUpdate,
  };
};
