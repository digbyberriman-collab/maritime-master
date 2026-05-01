// Leave audit log helper. Best-effort — never blocks the UI on failure.

import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

export interface LeaveAuditEntry {
  companyId?: string | null;
  vesselId?: string | null;
  crewId?: string | null;
  actorId: string;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logLeaveAudit(entry: LeaveAuditEntry): Promise<void> {
  try {
    await sb.from('crew_leave_audit_log').insert({
      company_id: entry.companyId ?? null,
      vessel_id: entry.vesselId ?? null,
      crew_id: entry.crewId ?? null,
      actor_id: entry.actorId,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (e) {
    console.warn('[leave] audit log failed:', e);
  }
}

export async function listLeaveAudit(opts: {
  crewId?: string;
  vesselId?: string;
  limit?: number;
}) {
  let q = sb
    .from('crew_leave_audit_log')
    .select('*, profiles:actor_id (first_name, last_name, email)')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.crewId) q = q.eq('crew_id', opts.crewId);
  if (opts.vesselId) q = q.eq('vessel_id', opts.vesselId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
