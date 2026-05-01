// Data layer for the Hours of Work and Rest module.
// Wraps Supabase access for monthly submissions, daily records, blocks,
// non-conformities, signatures, notes and audit log entries.
//
// All new tables created in 20260501100000_work_rest_module.sql.
// We use `as any` casts in places because the generated supabase types
// have not yet been regenerated for the new tables — they will refresh
// on the next type-gen pass.

import { supabase } from '@/integrations/supabase/client';
import {
  DailyRecord,
  NonConformity,
  RuleSet,
  SubmissionStatus,
  WorkRestBlock,
  DEFAULT_RULE_SET,
} from '../types';

const sb = supabase as any;

// ---------- Submissions ----------

export interface MonthlySubmission {
  id: string;
  crew_id: string;
  vessel_id: string;
  period_year: number;
  period_month: number;
  status: SubmissionStatus;
  rule_set_id?: string | null;
  total_work_hours?: number;
  total_rest_hours?: number;
  open_non_conformities?: number;
  is_compliant?: boolean | null;
  submitted_at?: string | null;
  crew_signed_at?: string | null;
  hod_signed_at?: string | null;
  captain_reviewed_at?: string | null;
  locked_at?: string | null;
  reopened_at?: string | null;
  reopened_by?: string | null;
  reopen_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function getOrCreateSubmission(opts: {
  crewId: string;
  vesselId: string;
  year: number;
  month: number;
}): Promise<MonthlySubmission> {
  const { data: existing, error: fetchErr } = await sb
    .from('work_rest_monthly_submissions')
    .select('*')
    .eq('crew_id', opts.crewId)
    .eq('period_year', opts.year)
    .eq('period_month', opts.month)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (existing) return existing as MonthlySubmission;

  const { data: created, error: insertErr } = await sb
    .from('work_rest_monthly_submissions')
    .insert({
      crew_id: opts.crewId,
      vessel_id: opts.vesselId,
      period_year: opts.year,
      period_month: opts.month,
      status: 'draft',
    })
    .select()
    .single();
  if (insertErr) throw insertErr;
  return created as MonthlySubmission;
}

export async function listVesselSubmissions(opts: {
  vesselId: string;
  year: number;
  month: number;
  department?: string | null;
}) {
  let q = sb
    .from('work_rest_monthly_submissions')
    .select(
      `*, profiles:crew_id (first_name, last_name, rank, department, hod_user_id, employment_status)`
    )
    .eq('vessel_id', opts.vesselId)
    .eq('period_year', opts.year)
    .eq('period_month', opts.month);
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data || []) as any[];
  if (opts.department) {
    rows = rows.filter((r) => r.profiles?.department === opts.department);
  }
  return rows;
}

export async function updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus,
  patch: Partial<MonthlySubmission> = {}
) {
  const { data, error } = await sb
    .from('work_rest_monthly_submissions')
    .update({ status, ...patch })
    .eq('id', submissionId)
    .select()
    .single();
  if (error) throw error;
  return data as MonthlySubmission;
}

// ---------- Records & blocks ----------

export async function loadMonthRecords(crewId: string, year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).getDate(); // last day
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`;

  const { data: records, error: e1 } = await sb
    .from('work_rest_records')
    .select('*')
    .eq('crew_id', crewId)
    .gte('record_date', start)
    .lte('record_date', end);
  if (e1) throw e1;

  const recordIds = (records || []).map((r: any) => r.id);
  let blocks: any[] = [];
  if (recordIds.length) {
    const { data, error } = await sb
      .from('work_rest_blocks')
      .select('*')
      .in('record_id', recordIds);
    if (error) throw error;
    blocks = data || [];
  }

  const merged: DailyRecord[] = (records || []).map((r: any) => ({
    id: r.id,
    submission_id: r.submission_id,
    crew_id: r.crew_id,
    vessel_id: r.vessel_id,
    record_date: r.record_date,
    notes: r.notes,
    total_work_minutes: r.total_work_minutes,
    total_rest_minutes: r.total_rest_minutes,
    longest_rest_minutes: r.longest_rest_minutes,
    rest_period_count: r.rest_period_count,
    is_compliant: r.is_compliant,
    blocks: blocks
      .filter((b) => b.record_id === r.id)
      .map((b) => ({
        id: b.id,
        record_id: b.record_id,
        crew_id: b.crew_id,
        block_type: b.block_type,
        category: b.category,
        start_minute: b.start_minute,
        end_minute: b.end_minute,
        notes: b.notes,
      })),
  }));
  return merged;
}

export async function upsertDayRecord(opts: {
  submissionId: string;
  crewId: string;
  vesselId: string;
  date: string;
  blocks: WorkRestBlock[];
  notes?: string | null;
  summary: {
    work_minutes: number;
    rest_minutes: number;
    longest_rest_minutes: number;
    rest_period_count: number;
    is_compliant: boolean;
  };
}) {
  // Upsert record
  const { data: existing } = await sb
    .from('work_rest_records')
    .select('id')
    .eq('crew_id', opts.crewId)
    .eq('record_date', opts.date)
    .maybeSingle();

  let recordId: string;
  if (existing?.id) {
    recordId = existing.id;
    const { error } = await sb
      .from('work_rest_records')
      .update({
        submission_id: opts.submissionId,
        vessel_id: opts.vesselId,
        notes: opts.notes ?? null,
        total_work_minutes: opts.summary.work_minutes,
        total_rest_minutes: opts.summary.rest_minutes,
        longest_rest_minutes: opts.summary.longest_rest_minutes,
        rest_period_count: opts.summary.rest_period_count,
        is_compliant: opts.summary.is_compliant,
      })
      .eq('id', recordId);
    if (error) throw error;
  } else {
    const { data, error } = await sb
      .from('work_rest_records')
      .insert({
        submission_id: opts.submissionId,
        crew_id: opts.crewId,
        vessel_id: opts.vesselId,
        record_date: opts.date,
        notes: opts.notes ?? null,
        total_work_minutes: opts.summary.work_minutes,
        total_rest_minutes: opts.summary.rest_minutes,
        longest_rest_minutes: opts.summary.longest_rest_minutes,
        rest_period_count: opts.summary.rest_period_count,
        is_compliant: opts.summary.is_compliant,
      })
      .select()
      .single();
    if (error) throw error;
    recordId = data.id;
  }

  // Replace blocks
  await sb.from('work_rest_blocks').delete().eq('record_id', recordId);
  if (opts.blocks.length) {
    const rows = opts.blocks.map((b) => ({
      record_id: recordId,
      crew_id: opts.crewId,
      block_type: b.block_type,
      category: b.category ?? null,
      start_minute: Math.round(b.start_minute),
      end_minute: Math.round(b.end_minute),
      notes: b.notes ?? null,
    }));
    const { error } = await sb.from('work_rest_blocks').insert(rows);
    if (error) throw error;
  }
  return recordId;
}

// ---------- Non-conformities ----------

export async function replaceMonthNonConformities(
  submissionId: string,
  crewId: string,
  ncs: NonConformity[]
) {
  await sb
    .from('work_rest_non_conformities')
    .delete()
    .eq('submission_id', submissionId)
    .eq('status', 'open');

  if (ncs.length === 0) return [];
  const rows = ncs.map((n) => ({
    submission_id: submissionId,
    crew_id: crewId,
    rule_code: n.rule_code,
    rule_description: n.rule_description,
    severity: n.severity,
    window_start: n.window_start,
    window_end: n.window_end,
    measured_value: n.measured_value,
    threshold_value: n.threshold_value,
    suggested_correction: n.suggested_correction ?? null,
    status: 'open',
  }));
  const { data, error } = await sb
    .from('work_rest_non_conformities')
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

export async function listNonConformities(submissionId: string) {
  const { data, error } = await sb
    .from('work_rest_non_conformities')
    .select('*')
    .eq('submission_id', submissionId)
    .order('window_start', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function updateNonConformity(id: string, patch: any) {
  const { data, error } = await sb
    .from('work_rest_non_conformities')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Signatures ----------

export async function signSubmission(opts: {
  submissionId: string;
  signerId: string;
  signerRole: 'crew' | 'hod' | 'captain' | 'purser' | 'dpa';
  payload?: Record<string, unknown>;
}) {
  const { data, error } = await sb
    .from('work_rest_signatures')
    .insert({
      submission_id: opts.submissionId,
      signer_id: opts.signerId,
      signer_role: opts.signerRole,
      signature_method: 'electronic',
      signature_payload: opts.payload ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listSignatures(submissionId: string) {
  const { data, error } = await sb
    .from('work_rest_signatures')
    .select('*, profiles:signer_id (first_name, last_name, email, rank)')
    .eq('submission_id', submissionId)
    .order('signed_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ---------- Notes ----------

export async function addNote(opts: {
  submissionId?: string | null;
  recordId?: string | null;
  blockId?: string | null;
  authorId: string;
  body: string;
}) {
  const { data, error } = await sb
    .from('work_rest_notes')
    .insert({
      submission_id: opts.submissionId ?? null,
      record_id: opts.recordId ?? null,
      block_id: opts.blockId ?? null,
      author_id: opts.authorId,
      body: opts.body,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Audit log ----------

export async function logAudit(entry: {
  submissionId?: string | null;
  crewId?: string | null;
  actorId: string;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}) {
  // Best-effort — never block UI on audit failures.
  try {
    await sb.from('work_rest_audit_log').insert({
      submission_id: entry.submissionId ?? null,
      crew_id: entry.crewId ?? null,
      actor_id: entry.actorId,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (e) {
    console.warn('[work-rest] audit log failed:', e);
  }
}

export async function listAuditLog(submissionId: string) {
  const { data, error } = await sb
    .from('work_rest_audit_log')
    .select('*, profiles:actor_id (first_name, last_name, email)')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ---------- Rule sets / vessel settings ----------

export async function loadEffectiveRuleSet(vesselId: string): Promise<RuleSet> {
  // Try vessel-specific rule set first
  const { data: vs } = await sb
    .from('vessel_work_rest_settings')
    .select('rule_set_id')
    .eq('vessel_id', vesselId)
    .maybeSingle();

  if (vs?.rule_set_id) {
    const { data: rs } = await sb
      .from('work_rest_rule_sets')
      .select('*')
      .eq('id', vs.rule_set_id)
      .maybeSingle();
    if (rs) {
      return {
        id: rs.id,
        name: rs.name,
        min_rest_per_24h: Number(rs.min_rest_per_24h),
        min_rest_per_7d: Number(rs.min_rest_per_7d),
        max_rest_periods_per_24h: rs.max_rest_periods_per_24h,
        min_long_rest_block: Number(rs.min_long_rest_block),
        max_interval_between_rest: Number(rs.max_interval_between_rest),
      };
    }
  }

  // Fallback: default rule set
  const { data: defaults } = await sb
    .from('work_rest_rule_sets')
    .select('*')
    .eq('is_default', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (defaults) {
    return {
      id: defaults.id,
      name: defaults.name,
      min_rest_per_24h: Number(defaults.min_rest_per_24h),
      min_rest_per_7d: Number(defaults.min_rest_per_7d),
      max_rest_periods_per_24h: defaults.max_rest_periods_per_24h,
      min_long_rest_block: Number(defaults.min_long_rest_block),
      max_interval_between_rest: Number(defaults.max_interval_between_rest),
    };
  }

  return DEFAULT_RULE_SET;
}
