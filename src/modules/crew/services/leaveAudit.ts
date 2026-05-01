/**
 * Leave-domain audit logging.
 *
 * Wraps the generic `audit_logs` table so the leave module always writes a
 * consistent shape (entity_type, action, actor_*).
 */

import { supabase } from '@/integrations/supabase/client';

export type LeaveEntityType =
  | 'leave_request'
  | 'leave_entry'
  | 'leave_policy'
  | 'leave_balance_adjustment'
  | 'leave_calendar_lock';

export type LeaveAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'DECLINE'
  | 'CANCEL'
  | 'SUBMIT'
  | 'HOD_REVIEW'
  | 'BULK_FILL'
  | 'LOCK'
  | 'UNLOCK'
  | 'OVERRIDE';

export interface ActorInfo {
  user_id: string;
  email: string;
  role: string;
}

export interface LeaveAuditEntry {
  entityType: LeaveEntityType;
  entityId: string;
  action: LeaveAction;
  actor: ActorInfo;
  crewId?: string | null;
  vesselId?: string | null;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  note?: string;
}

/**
 * Best-effort write to audit_logs. Errors are logged but never thrown — the
 * caller's primary action should not be blocked by audit failures.
 */
export const logLeaveAudit = async (entry: LeaveAuditEntry): Promise<void> => {
  if (!entry.actor?.user_id) {
    console.warn('[leave-audit] missing actor — skipping log');
    return;
  }

  const payload = {
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    actor_user_id: entry.actor.user_id,
    actor_email: entry.actor.email,
    actor_role: entry.actor.role,
    changed_fields: diffFields(entry.oldValues, entry.newValues),
    old_values: {
      ...(entry.oldValues ?? {}),
      ...(entry.crewId ? { _crew_id: entry.crewId } : {}),
      ...(entry.vesselId ? { _vessel_id: entry.vesselId } : {}),
    },
    new_values: {
      ...(entry.newValues ?? {}),
      ...(entry.note ? { _note: entry.note } : {}),
    },
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };

  const { error } = await supabase.from('audit_logs').insert(payload);
  if (error) {
    console.error('[leave-audit] insert failed:', error.message);
  }
};

const diffFields = (
  oldVals?: Record<string, any>,
  newVals?: Record<string, any>,
): Record<string, boolean> => {
  if (!oldVals && !newVals) return {};
  const fields: Record<string, boolean> = {};
  const keys = new Set([
    ...Object.keys(oldVals ?? {}),
    ...Object.keys(newVals ?? {}),
  ]);
  for (const k of keys) {
    if ((oldVals?.[k] ?? null) !== (newVals?.[k] ?? null)) fields[k] = true;
  }
  return fields;
};
