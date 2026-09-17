import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { useHrCrewDirectory, type HrCrewDirectoryEntry } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { categoryMix, downloadTextFile, fileSlug, isoDay, type MixPoint } from '@/modules/hris/lib/reports';

export const HR_DASHBOARD_KEY = ['hris', 'dashboard'] as const;

// ---------------------------------------------------------------------------
// Needs-attention items (hr_expiry_items ∪ hr_performance_due_items)
// ---------------------------------------------------------------------------

export type AttentionKind = 'expiry' | 'performance';
export type AttentionItemType = 'contract' | 'probation' | 'passport' | 'visa' | 'medical' | 'certificate' | 'review' | 'objective' | 'warning';

export const EXPIRY_ITEM_TYPES: readonly AttentionItemType[] = ['contract', 'probation', 'passport', 'visa', 'medical', 'certificate'];
export const DOCUMENT_ITEM_TYPES: readonly AttentionItemType[] = ['passport', 'visa', 'medical', 'certificate'];
export const PERFORMANCE_ITEM_TYPES: readonly AttentionItemType[] = ['review', 'objective', 'warning'];

export interface AttentionItem {
  kind: AttentionKind;
  item_type: AttentionItemType;
  record_id: string;
  profile_id: string;
  user_id: string | null;
  crew_name: string;
  vessel_id: string | null;
  label: string;
  due_date: string;
  days_remaining: number;
  status: string | null;
}

const isAttentionType = (value: string | null): value is AttentionItemType =>
  value !== null && ([...EXPIRY_ITEM_TYPES, ...PERFORMANCE_ITEM_TYPES] as string[]).includes(value);

type ExpiryRow = Tables<'hr_expiry_items'>;
type PerformanceRow = Tables<'hr_performance_due_items'>;

const toAttention = (row: ExpiryRow | PerformanceRow, kind: AttentionKind): AttentionItem | null => {
  if (!isAttentionType(row.item_type) || !row.record_id || !row.profile_id || !row.due_date) return null;
  return {
    kind,
    item_type: row.item_type,
    record_id: row.record_id,
    profile_id: row.profile_id,
    user_id: row.user_id,
    crew_name: row.crew_name ?? 'Unknown crew',
    vessel_id: row.vessel_id,
    label: row.label ?? row.item_type,
    due_date: row.due_date,
    days_remaining: row.days_remaining ?? 0,
    status: 'status' in row ? row.status : null,
  };
};

/** Overdue first, then soonest. */
export const sortAttention = (items: AttentionItem[]): AttentionItem[] =>
  [...items].sort((a, b) => a.days_remaining - b.days_remaining || a.crew_name.localeCompare(b.crew_name));

/** HRIS page that owns an attention item. */
export const attentionPath = (item: Pick<AttentionItem, 'item_type' | 'label'>): string => {
  switch (item.item_type) {
    case 'contract':
    case 'probation':
      return HRIS_PATHS.contracts;
    case 'passport':
    case 'visa':
    case 'medical':
    case 'certificate':
      return HRIS_PATHS.documents;
    case 'review':
      if (item.label === 'annual_review') return HRIS_PATHS.annualReviews;
      if (item.label === 'end_of_rotation') return HRIS_PATHS.endOfRotation;
      return HRIS_PATHS.annualEvaluations;
    case 'objective':
      return HRIS_PATHS.objectives;
    case 'warning':
      return HRIS_PATHS.disciplinary;
    default:
      return HRIS_PATHS.personalDetails;
  }
};

/** Builds `path?module=hris&crew=…`, preserving the module the layout is showing. */
export const hrisLink = (path: string, options: { module?: string | null; crew?: string | null; extra?: Record<string, string> } = {}): string => {
  const params = new URLSearchParams();
  params.set('module', options.module || 'hris');
  if (options.crew) params.set('crew', options.crew);
  for (const [k, v] of Object.entries(options.extra ?? {})) params.set(k, v);
  return `${path}?${params.toString()}`;
};

// ---------------------------------------------------------------------------
// Company-wide dashboard data
// ---------------------------------------------------------------------------

export interface HrKpis {
  headcount: number;
  onboardNow: number;
  joiners30d: number;
  leavers30d: number;
  contractsExpiring90d: number;
  documentsExpiring90d: number;
  reviewsDue14d: number;
  reviewsOverdue: number;
  openDisciplinary: number | null;
  missingContract: number;
  missingNextOfKin: number;
  payrollAwaitingApproval: number | null;
}

export interface HrActivityRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_email: string | null;
  actor_role: string | null;
  timestamp: string | null;
  changed_fields: string[];
}

export const HR_AUDIT_ENTITY_TYPES = [
  'crew_profile',
  'crew_contract',
  'crew_next_of_kin',
  'crew_assignment',
  'performance_review',
  'crew_objective',
  'disciplinary_record',
  'crew_compensation',
  'payroll_run',
] as const;

interface MovementRow {
  user_id: string;
  join_date: string;
  leave_date: string | null;
}

export function useHrDashboard() {
  const { profile } = useAuth();
  const access = useHrAccess();
  const payroll = usePayrollAccess();
  const companyId = profile?.company_id ?? null;
  const ready = Boolean(companyId) && !access.loading && access.canView;

  const directory = useHrCrewDirectory({ includeInactive: true });
  const { vesselName, isLoading: vesselsLoading } = useCompanyVessels();

  const attention = useQuery({
    queryKey: [...HR_DASHBOARD_KEY, 'attention', companyId],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async (): Promise<AttentionItem[]> => {
      const [expiry, perf] = await Promise.all([
        supabase.from('hr_expiry_items').select('*').eq('company_id', companyId as string).lte('days_remaining', 90).order('due_date').limit(2000),
        supabase.from('hr_performance_due_items').select('*').eq('company_id', companyId as string).lte('days_remaining', 30).order('due_date').limit(2000),
      ]);
      if (expiry.error) throw expiry.error;
      if (perf.error) throw perf.error;
      const items: AttentionItem[] = [];
      for (const row of expiry.data ?? []) {
        const it = toAttention(row, 'expiry');
        if (it) items.push(it);
      }
      for (const row of perf.data ?? []) {
        const it = toAttention(row, 'performance');
        if (it) items.push(it);
      }
      return sortAttention(items);
    },
  });

  const movements = useQuery({
    queryKey: [...HR_DASHBOARD_KEY, 'movements', companyId],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async (): Promise<MovementRow[]> => {
      const since = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('crew_assignments')
        .select('user_id, join_date, leave_date, vessels!inner(company_id)')
        .eq('vessels.company_id', companyId as string)
        .or(`join_date.gte.${since},leave_date.gte.${since}`);
      if (error) throw error;
      return (data ?? []).map((r) => ({ user_id: r.user_id, join_date: r.join_date, leave_date: r.leave_date }));
    },
  });

  const coverage = useQuery({
    queryKey: [...HR_DASHBOARD_KEY, 'coverage', companyId],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async (): Promise<{ contracted: string[]; withNextOfKin: string[] }> => {
      const [contracts, nok] = await Promise.all([
        supabase.from('crew_contracts').select('profile_id').eq('company_id', companyId as string).eq('status', 'active'),
        supabase.from('crew_next_of_kin').select('profile_id').eq('company_id', companyId as string),
      ]);
      if (contracts.error) throw contracts.error;
      if (nok.error) throw nok.error;
      return {
        contracted: (contracts.data ?? []).map((r) => r.profile_id),
        withNextOfKin: (nok.data ?? []).map((r) => r.profile_id),
      };
    },
  });

  const disciplinary = useQuery({
    queryKey: [...HR_DASHBOARD_KEY, 'open-disciplinary', companyId],
    enabled: ready && access.canEdit,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('disciplinary_records')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId as string)
        .eq('status', 'open');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const payrollPending = useQuery({
    queryKey: [...HR_DASHBOARD_KEY, 'payroll-pending', companyId],
    enabled: ready && !payroll.loading && payroll.canView,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('payroll_runs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId as string)
        .eq('status', 'pending_approval');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const activity = useQuery({
    queryKey: [...HR_DASHBOARD_KEY, 'activity', companyId],
    enabled: ready,
    staleTime: 30_000,
    queryFn: async (): Promise<HrActivityRow[]> => {
      // RLS on audit_logs may hide rows (or the whole table) for some roles; an
      // empty feed is a valid outcome rather than an error state.
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, entity_type, entity_id, action, actor_email, actor_role, timestamp, changed_fields')
        .in('entity_type', [...HR_AUDIT_ENTITY_TYPES])
        .order('timestamp', { ascending: false })
        .limit(20);
      if (error) {
        console.warn('HR activity feed unavailable', error);
        return [];
      }
      return (data ?? []).map((r) => ({
        id: r.id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        action: r.action,
        actor_email: r.actor_email,
        actor_role: r.actor_role,
        timestamp: r.timestamp,
        changed_fields: Array.isArray(r.changed_fields) ? r.changed_fields.filter((f): f is string => typeof f === 'string') : [],
      }));
    },
  });

  const activeCrew = useMemo(
    () => directory.all.filter((e) => (e.status ?? 'active') !== 'inactive' && e.account_status !== 'deactivated'),
    [directory.all],
  );

  const kpis = useMemo<HrKpis | null>(() => {
    if (directory.isLoading || attention.isLoading || movements.isLoading || coverage.isLoading) return null;
    const items = attention.data ?? [];
    const contracted = new Set(coverage.data?.contracted ?? []);
    const withNok = new Set(coverage.data?.withNextOfKin ?? []);
    const reviews = items.filter((i) => i.item_type === 'review');
    return {
      headcount: activeCrew.length,
      onboardNow: activeCrew.filter((e) => Boolean(e.vessel_id)).length,
      joiners30d: (movements.data ?? []).filter((m) => m.join_date >= format(subDays(new Date(), 30), 'yyyy-MM-dd')).length,
      leavers30d: (movements.data ?? []).filter((m) => m.leave_date && m.leave_date >= format(subDays(new Date(), 30), 'yyyy-MM-dd')).length,
      contractsExpiring90d: items.filter((i) => i.item_type === 'contract').length,
      documentsExpiring90d: items.filter((i) => DOCUMENT_ITEM_TYPES.includes(i.item_type)).length,
      reviewsDue14d: reviews.filter((i) => i.days_remaining >= 0 && i.days_remaining <= 14).length,
      reviewsOverdue: reviews.filter((i) => i.days_remaining < 0).length,
      openDisciplinary: access.canEdit ? disciplinary.data ?? 0 : null,
      missingContract: activeCrew.filter((e) => !contracted.has(e.id)).length,
      missingNextOfKin: activeCrew.filter((e) => !withNok.has(e.id)).length,
      payrollAwaitingApproval: payroll.canView ? payrollPending.data ?? 0 : null,
    };
  }, [directory.isLoading, attention.isLoading, attention.data, movements.isLoading, movements.data, coverage.isLoading, coverage.data, activeCrew, access.canEdit, disciplinary.data, payroll.canView, payrollPending.data]);

  const breakdown = useMemo(() => {
    const byVessel: MixPoint[] = categoryMix(activeCrew, (e) => e.vessel_name ?? (e.vessel_id ? vesselName(e.vessel_id) : null), { unknownLabel: 'Not onboard' });
    const byDepartment: MixPoint[] = categoryMix(activeCrew, (e) => e.department, { unknownLabel: 'No department' });
    const byNationality: MixPoint[] = categoryMix(activeCrew, (e) => e.nationality, { top: 8 });
    return { byVessel, byDepartment, byNationality };
  }, [activeCrew, vesselName]);

  return {
    ready,
    access,
    payroll,
    directory,
    vesselName,
    kpis,
    attention: attention.data ?? [],
    attentionLoading: attention.isLoading || vesselsLoading,
    attentionError: attention.error,
    breakdown,
    breakdownLoading: directory.isLoading,
    activity: activity.data ?? [],
    activityLoading: activity.isLoading,
  };
}

// ---------------------------------------------------------------------------
// Data governance (retention policies, record metadata, GDPR export)
// ---------------------------------------------------------------------------

export type RetentionPolicyRow = Tables<'data_retention_policies'>;

export interface RecordTypeGovernance {
  record_type: string;
  policy: RetentionPolicyRow | null;
  active: number;
  archived: number;
  anonymized: number;
  /** Active / pending rows whose retention_end_date is today or earlier. */
  dueForArchive: number;
  total: number;
}

interface MetadataRow {
  record_type: string;
  lifecycle_status: string | null;
  retention_end_date: string;
}

export const summariseGovernance = (policies: RetentionPolicyRow[], metadata: MetadataRow[], today: string): RecordTypeGovernance[] => {
  const map = new Map<string, RecordTypeGovernance>();
  const get = (t: string): RecordTypeGovernance => {
    const existing = map.get(t);
    if (existing) return existing;
    const created: RecordTypeGovernance = { record_type: t, policy: null, active: 0, archived: 0, anonymized: 0, dueForArchive: 0, total: 0 };
    map.set(t, created);
    return created;
  };
  for (const p of policies) get(p.record_type).policy = p;
  for (const m of metadata) {
    const g = get(m.record_type);
    g.total += 1;
    const status = m.lifecycle_status ?? 'active';
    if (status === 'archived') g.archived += 1;
    else if (status === 'anonymized') g.anonymized += 1;
    else if (status === 'pending_deletion') g.archived += 1;
    else {
      g.active += 1;
      if (m.retention_end_date <= today) g.dueForArchive += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.record_type.localeCompare(b.record_type));
};

export const GOVERNANCE_KEY = [...HR_DASHBOARD_KEY, 'governance'] as const;

export function useHrGovernance() {
  const { profile, user } = useAuth();
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;
  const ready = Boolean(companyId) && !access.loading && access.canView;

  const policies = useQuery({
    queryKey: [...GOVERNANCE_KEY, 'policies', companyId],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RetentionPolicyRow[]> => {
      const { data, error } = await supabase.from('data_retention_policies').select('*').eq('company_id', companyId as string).order('record_type');
      if (error) throw error;
      return data ?? [];
    },
  });

  const metadata = useQuery({
    queryKey: [...GOVERNANCE_KEY, 'metadata', companyId],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async (): Promise<MetadataRow[]> => {
      const { data, error } = await supabase
        .from('hr_record_metadata')
        .select('record_type, lifecycle_status, retention_end_date')
        .eq('company_id', companyId as string)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(
    () => summariseGovernance(policies.data ?? [], metadata.data ?? [], format(new Date(), 'yyyy-MM-dd')),
    [policies.data, metadata.data],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: GOVERNANCE_KEY });
    void queryClient.invalidateQueries({ queryKey: ['pending-archive-records', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['gdpr-requests', companyId] });
  }, [queryClient, companyId]);

  /** Archives every active/pending record past its retention end date (DPA only; RLS enforces). */
  const archiveDue = useMutation({
    mutationFn: async (): Promise<number> => {
      if (!companyId || !user?.id) throw new Error('Not authenticated');
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('hr_record_metadata')
        .update({ lifecycle_status: 'archived', archived_at: new Date().toISOString(), archived_by: user.id, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .in('lifecycle_status', ['active', 'pending_archive'])
        .lte('retention_end_date', today)
        .select('id');
      if (error) throw error;
      const n = data?.length ?? 0;
      if (n > 0) {
        const { error: auditError } = await supabase.from('audit_logs').insert({
          entity_type: 'hr_record_metadata',
          entity_id: companyId,
          action: 'ARCHIVE',
          actor_user_id: user.id,
          actor_email: user.email ?? null,
          actor_role: profile?.role ?? null,
          new_values: { archived: n, retention_end_date_lte: today },
        });
        if (auditError) console.warn('hr_record_metadata archive audit log failed', auditError);
      }
      return n;
    },
    onSuccess: (n) => {
      invalidate();
      toast({ title: n === 0 ? 'Nothing to archive' : `${n} record${n === 1 ? '' : 's'} archived`, description: n === 0 ? 'No records have passed their retention end date.' : 'Lifecycle status set to archived.' });
    },
    onError: (error: Error) => toast({ title: 'Archive failed', description: error.message, variant: 'destructive' }),
  });

  const exportCrew = useMutation({
    mutationFn: async (entry: HrCrewDirectoryEntry): Promise<{ fileName: string; sections: number; logged: boolean }> => {
      if (!companyId || !user?.id) throw new Error('Not authenticated');
      const bundle = await gatherCrewData(entry, companyId);
      const fileName = `gdpr-export-${fileSlug(entry.fullName)}-${format(new Date(), 'yyyyMMdd-HHmm')}.json`;
      downloadTextFile(JSON.stringify(bundle, null, 2), fileName, 'application/json;charset=utf-8');

      // gdpr_requests.subject_user_id references profiles.user_id, so imported
      // crew without a login cannot be logged there.
      let logged = false;
      if (entry.user_id) {
        const now = new Date().toISOString();
        const { error } = await supabase.from('gdpr_requests').insert({
          company_id: companyId,
          subject_user_id: entry.user_id,
          request_type: 'portability',
          status: 'completed',
          requested_by: user.id,
          processed_by: user.id,
          processed_at: now,
          deadline_date: format(new Date(), 'yyyy-MM-dd'),
          response_notes: `Data export generated from the HR dashboard (${bundle.sections.length} sections, file ${fileName}).`,
        });
        if (error) throw error;
        logged = true;
      }
      return { fileName, sections: bundle.sections.length, logged };
    },
    onSuccess: ({ fileName, logged }) => {
      invalidate();
      toast({
        title: 'Crew data exported',
        description: logged ? `${fileName} downloaded and logged as a completed GDPR request.` : `${fileName} downloaded. Not logged: this crew member has no login (imported profile).`,
      });
    },
    onError: (error: Error) => toast({ title: 'Export failed', description: error.message, variant: 'destructive' }),
  });

  return {
    ready,
    access,
    policies: policies.data ?? [],
    summary,
    isLoading: policies.isLoading || metadata.isLoading,
    error: policies.error ?? metadata.error,
    archiveDue,
    exportCrew,
  };
}

interface ExportSection {
  name: string;
  source: string;
  rows: unknown[];
  error?: string;
}

interface CrewDataBundle {
  generated_at: string;
  subject: { profile_id: string; user_id: string | null; name: string; email: string };
  sections: ExportSection[];
}

type SectionQuery = () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

const runSection = async (name: string, source: string, query: SectionQuery): Promise<ExportSection> => {
  try {
    const { data, error } = await query();
    if (error) return { name, source, rows: [], error: error.message };
    return { name, source, rows: data ?? [] };
  } catch (err) {
    return { name, source, rows: [], error: err instanceof Error ? err.message : 'Unexpected error' };
  }
};

/** Everything the system holds about one crew member, one section per table. */
export const gatherCrewData = async (entry: HrCrewDirectoryEntry, companyId: string): Promise<CrewDataBundle> => {
  const pid = entry.id;
  const uid = entry.user_id;
  const byUser = <T>(query: T): T | null => (uid ? query : null);

  const sections = await Promise.all([
    runSection('Profile', 'profiles', () => supabase.from('profiles').select('*').eq('id', pid)),
    runSection('Contracts', 'crew_contracts', () => supabase.from('crew_contracts').select('*').eq('profile_id', pid).order('start_date', { ascending: false })),
    runSection('Next of kin', 'crew_next_of_kin', () => supabase.from('crew_next_of_kin').select('*').eq('profile_id', pid)),
    runSection('Assignments', 'crew_assignments', () =>
      byUser(supabase.from('crew_assignments').select('*').eq('user_id', uid as string).order('join_date', { ascending: false })) ?? Promise.resolve({ data: [], error: null }),
    ),
    runSection('Certificates', 'crew_certificates', () =>
      byUser(supabase.from('crew_certificates').select('*').eq('user_id', uid as string)) ?? Promise.resolve({ data: [], error: null }),
    ),
    runSection('Attachments (metadata)', 'crew_attachments', () =>
      byUser(supabase.from('crew_attachments').select('id, attachment_type, file_name, file_size, mime_type, description, created_at').eq('user_id', uid as string)) ??
      Promise.resolve({ data: [], error: null }),
    ),
    runSection('Performance reviews', 'performance_reviews', () => supabase.from('performance_reviews').select('*').eq('profile_id', pid)),
    runSection('Objectives', 'crew_objectives', () => supabase.from('crew_objectives').select('*').eq('profile_id', pid)),
    runSection('Disciplinary records', 'disciplinary_records_self', () => supabase.from('disciplinary_records_self').select('*').eq('profile_id', pid)),
    runSection('Compensation', 'crew_compensation', () => supabase.from('crew_compensation').select('*').eq('profile_id', pid).eq('company_id', companyId)),
    runSection('Payroll lines (paid)', 'payroll_lines', () => supabase.from('payroll_lines').select('*').eq('profile_id', pid).eq('status', 'paid')),
    runSection('Gratuity distributions', 'gratuity_distributions', () => supabase.from('gratuity_distributions').select('*').eq('profile_id', pid)),
  ]);

  return {
    generated_at: new Date().toISOString(),
    subject: { profile_id: pid, user_id: uid, name: entry.fullName, email: entry.email },
    sections,
  };
};

// ---------------------------------------------------------------------------
// Self-service "My HR"
// ---------------------------------------------------------------------------

export interface MyHrData {
  expiry: AttentionItem[];
  performance: AttentionItem[];
  reviewsAwaitingMe: { id: string; review_type: string; status: string; due_date: string | null }[];
  objectives: { id: string; title: string; status: string; target_date: string | null; progress_pct: number }[];
  paidPayslips: number;
}

export function useMyHr() {
  const { profile } = useAuth();
  const access = useHrAccess();
  const profileId = profile?.id ?? null;
  const ready = Boolean(profileId) && !access.loading && access.selfOnly;

  const query = useQuery({
    queryKey: [...HR_DASHBOARD_KEY, 'my-hr', profileId],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async (): Promise<MyHrData> => {
      const pid = profileId as string;
      const [expiry, perf, reviews, objectives, payslips] = await Promise.all([
        supabase.from('hr_expiry_items').select('*').eq('profile_id', pid).lte('days_remaining', 180).order('due_date'),
        supabase.from('hr_performance_due_items').select('*').eq('profile_id', pid).order('due_date'),
        supabase.from('performance_reviews').select('id, review_type, status, due_date').eq('profile_id', pid).in('status', ['self_assessment', 'awaiting_acknowledgement']),
        supabase.from('crew_objectives').select('id, title, status, target_date, progress_pct').eq('profile_id', pid).in('status', ['not_started', 'in_progress']).order('target_date'),
        supabase.from('payroll_lines').select('id', { count: 'exact', head: true }).eq('profile_id', pid).eq('status', 'paid'),
      ]);
      const collect = (rows: (ExpiryRow | PerformanceRow)[] | null, kind: AttentionKind) =>
        sortAttention((rows ?? []).map((r) => toAttention(r, kind)).filter((r): r is AttentionItem => r !== null));
      return {
        expiry: expiry.error ? [] : collect(expiry.data, 'expiry'),
        performance: perf.error ? [] : collect(perf.data, 'performance'),
        reviewsAwaitingMe: reviews.error ? [] : reviews.data ?? [],
        objectives: objectives.error ? [] : objectives.data ?? [],
        paidPayslips: payslips.error ? 0 : payslips.count ?? 0,
      };
    },
  });

  return { ...query, data: query.data, profileId, today: isoDay(new Date()) };
}
