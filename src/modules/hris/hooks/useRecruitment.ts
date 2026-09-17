import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { HR_CREW_DIRECTORY_KEY } from '@/modules/hris/hooks/useHrCrewDirectory';
import { formatDate, formatMinor } from '@/modules/hris/lib/format';
import {
  VACANCY_STATUSES,
  combineDateTime,
  filterCandidates,
  filterVacancies,
  scorecardToJson,
  stageCounts,
  toAuditJson,
  vacancyProgress,
  type ApplicationEventRow,
  type ApplicationEventType,
  type ApplicationRow,
  type CandidateFilters,
  type CandidateRow,
  type CandidateStatus,
  type CandidateWritePayload,
  type InterviewFormValues,
  type InterviewOutcome,
  type InterviewRow,
  type PipelineStage,
  type ScorecardRow,
  type StageCounts,
  type VacancyFilters,
  type VacancyProgress,
  type VacancyRow,
  type VacancyStatus,
  type VacancyWritePayload,
} from '@/modules/hris/lib/recruitment';

// ---------------------------------------------------------------------------
// Keys & shared types
// ---------------------------------------------------------------------------

export const RECRUITMENT_KEY = ['hris', 'recruitment'] as const;
const VACANCIES_KEY = [...RECRUITMENT_KEY, 'vacancies'] as const;
const CANDIDATES_KEY = [...RECRUITMENT_KEY, 'candidates'] as const;
const APPLICATIONS_KEY = [...RECRUITMENT_KEY, 'applications'] as const;
const INTERVIEWS_KEY = [...RECRUITMENT_KEY, 'interviews'] as const;
const PAY_GRADES_KEY = [...RECRUITMENT_KEY, 'pay-grades'] as const;

type VesselJoin = { name: string } | null;

export interface VacancyWithVessel extends VacancyRow {
  vessel_name: string | null;
}

/** Row for the vacancies table: counts per stage aggregated client-side. */
export interface VacancyListItem extends VacancyWithVessel {
  counts: StageCounts;
  applications: ApplicationRow[];
  progress: VacancyProgress;
}

export interface ApplicationWithCandidate extends ApplicationRow {
  candidate: CandidateRow;
}

export interface ApplicationWithVacancy extends ApplicationRow {
  vacancy: VacancyWithVessel;
}

export interface PayGradeOption {
  id: string;
  code: string;
  name: string;
  rank: string | null;
  department: string | null;
  currency: string;
  monthly_base_minor: number;
  is_active: boolean;
}

export interface VacancyDetailData {
  vacancy: VacancyWithVessel & { pay_grade: PayGradeOption | null };
  applications: ApplicationWithCandidate[];
  /** Scheduled interviews for the vacancy's applications (for the board cards). */
  interviews: InterviewRow[];
}

export interface CandidateListItem extends CandidateRow {
  applications_count: number;
  active_applications: number;
}

export interface CandidateDetailData {
  candidate: CandidateRow;
  applications: ApplicationWithVacancy[];
  events: ApplicationEventRow[];
  interviews: InterviewRow[];
}

export interface ApplicationDetailData {
  application: ApplicationRow & { candidate: CandidateRow; vacancy: VacancyWithVessel };
  events: ApplicationEventRow[];
}

export interface MyInterview extends InterviewRow {
  candidate_name: string;
  vacancy_id: string;
  vacancy_title: string;
}

const withVessel = <T extends VacancyRow>(row: T & { vessels?: VesselJoin }): T & { vessel_name: string | null } => {
  const { vessels, ...rest } = row;
  return { ...(rest as T), vessel_name: vessels?.name ?? null };
};

const ACTIVE = new Set<string>(['applied', 'screening', 'interview', 'reference_check', 'offer', 'accepted']);

// ---------------------------------------------------------------------------
// CV storage (candidates are not crew, so they live under <company>/recruitment/)
// ---------------------------------------------------------------------------

const DOCUMENTS_BUCKET = 'documents';
const SIGNED_URL_TTL = 60 * 60;

const safeFileName = (name: string): string => name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'cv';

export const buildCandidateCvPath = (companyId: string, candidateId: string, fileName: string): string =>
  `${companyId}/recruitment/${candidateId}/${Date.now()}-${safeFileName(fileName)}`;

export const uploadCandidateCv = async (companyId: string, candidateId: string, file: File): Promise<{ path: string; name: string }> => {
  if (!companyId) throw new Error('Cannot upload a CV without a company');
  const path = buildCandidateCvPath(companyId, candidateId, file.name);
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return { path, name: file.name };
};

export const getCandidateCvUrl = async (path: string | null | undefined, download?: string): Promise<string | null> => {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
};

export const removeCandidateCv = async (path: string | null | undefined): Promise<void> => {
  if (!path) return;
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
  if (error) throw error;
};

export const downloadCandidateCv = async (path: string | null | undefined, fileName: string): Promise<void> => {
  const url = await getCandidateCvUrl(path, fileName);
  if (!url) throw new Error('No CV on file');
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/** Pay grades for the vacancy form (read-only; managed under Compensation settings). */
export function usePayGradeOptions() {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...PAY_GRADES_KEY, companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PayGradeOption[]> => {
      const { data, error } = await supabase
        .from('pay_grades')
        .select('id, code, name, rank, department, currency, monthly_base_minor, is_active')
        .eq('company_id', companyId as string)
        .order('code');
      if (error) throw error;
      return data ?? [];
    },
  });
  const grades = useMemo(() => (query.data ?? []).filter((g) => g.is_active), [query.data]);
  return { ...query, grades, all: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// Vacancies
// ---------------------------------------------------------------------------

/**
 * All vacancies for the company with their applications aggregated per
 * stage. The full list is fetched once (it feeds the KPI tiles) and the
 * filters are applied client-side.
 */
export function useVacancies(filters: VacancyFilters) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...VACANCIES_KEY, 'list', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<VacancyListItem[]> => {
      const { data, error } = await supabase
        .from('vacancies')
        .select('*, vessels(name)')
        .eq('company_id', companyId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const vacancies = ((data ?? []) as unknown as (VacancyRow & { vessels: VesselJoin })[]).map(withVessel);
      const ids = vacancies.map((v) => v.id);
      let applications: ApplicationRow[] = [];
      if (ids.length) {
        const { data: apps, error: aErr } = await supabase.from('candidate_applications').select('*').in('vacancy_id', ids);
        if (aErr) throw aErr;
        applications = apps ?? [];
      }
      const byVacancy = new Map<string, ApplicationRow[]>();
      for (const a of applications) byVacancy.set(a.vacancy_id, [...(byVacancy.get(a.vacancy_id) ?? []), a]);
      return vacancies.map((v) => {
        const apps = byVacancy.get(v.id) ?? [];
        return { ...v, applications: apps, counts: stageCounts(apps), progress: vacancyProgress(v, apps) };
      });
    },
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const vacancies = useMemo(() => filterVacancies(all, filters), [all, filters]);
  const allApplications = useMemo(() => all.flatMap((v) => v.applications), [all]);
  return { ...query, all, vacancies, allApplications };
}

/** One vacancy with its applications (joined to candidates) and scheduled interviews. */
export function useVacancy(vacancyId: string | null) {
  const access = useHrAccess();
  const query = useQuery({
    queryKey: [...VACANCIES_KEY, 'detail', vacancyId],
    enabled: Boolean(vacancyId) && !access.loading && access.canView,
    queryFn: async (): Promise<VacancyDetailData | null> => {
      const { data, error } = await supabase
        .from('vacancies')
        .select('*, vessels(name), pay_grades(id, code, name, rank, department, currency, monthly_base_minor, is_active)')
        .eq('id', vacancyId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const raw = data as unknown as VacancyRow & { vessels: VesselJoin; pay_grades: PayGradeOption | null };
      const { pay_grades, ...rest } = raw;
      const vacancy = { ...withVessel(rest), pay_grade: pay_grades ?? null };

      const { data: apps, error: aErr } = await supabase
        .from('candidate_applications')
        .select('*, candidates(*)')
        .eq('vacancy_id', vacancyId as string)
        .order('stage_changed_at', { ascending: false });
      if (aErr) throw aErr;
      const applications = ((apps ?? []) as unknown as (ApplicationRow & { candidates: CandidateRow })[]).map((row) => {
        const { candidates, ...app } = row;
        return { ...app, candidate: candidates };
      });

      let interviews: InterviewRow[] = [];
      if (applications.length) {
        const { data: ivs, error: iErr } = await supabase
          .from('interviews')
          .select('*')
          .in('application_id', applications.map((a) => a.id))
          .order('scheduled_at', { ascending: true });
        if (iErr) throw iErr;
        interviews = ivs ?? [];
      }
      return { vacancy, applications, interviews };
    },
  });
  return { ...query, detail: query.data ?? null };
}

export interface UpdateVacancyArgs {
  vacancy: VacancyRow;
  payload: Partial<VacancyWritePayload>;
}

export interface SetVacancyStatusArgs {
  vacancy: VacancyRow;
  status: VacancyStatus;
}

type AuditEntity = 'vacancy' | 'candidate' | 'candidate_application';
type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

/** Shared plumbing for the recruitment mutation hooks. */
function useRecruitmentMutationSupport() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;

  const audit = useCallback(
    async (entityType: AuditEntity, action: AuditAction, entityId: string, oldValues: object | null, newValues: object | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: toAuditJson(oldValues),
        new_values: toAuditJson(newValues),
      });
      if (error) console.warn(`${entityType} audit log failed`, error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(
    (...extra: readonly (readonly string[])[]) => {
      void queryClient.invalidateQueries({ queryKey: RECRUITMENT_KEY });
      for (const key of extra) void queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient],
  );

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' });
    },
    [toast],
  );

  const requireCompany = useCallback((): string => {
    if (!companyId) throw new Error('No company on the current profile');
    return companyId;
  }, [companyId]);

  return { companyId, userId, audit, invalidate, fail, toast, requireCompany };
}

const statusStamps = (status: VacancyStatus, vacancy: VacancyRow, now: string): TablesUpdate<'vacancies'> => {
  switch (status) {
    case 'open':
      return { status, opened_at: vacancy.opened_at ?? now, filled_at: null, closed_at: null };
    case 'filled':
      return { status, filled_at: now };
    case 'cancelled':
      return { status, closed_at: now };
    default:
      return { status };
  }
};

export function useVacancyMutations() {
  const { userId, audit, invalidate, fail, toast, requireCompany } = useRecruitmentMutationSupport();

  const updateRow = useCallback(
    async (id: string, patch: TablesUpdate<'vacancies'>): Promise<VacancyRow> => {
      const { data, error } = await supabase.from('vacancies').update({ ...patch, updated_by: userId }).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    [userId],
  );

  const create = useMutation({
    mutationFn: async (payload: VacancyWritePayload): Promise<VacancyRow> => {
      const company_id = requireCompany();
      const { data, error } = await supabase
        .from('vacancies')
        .insert({
          ...payload,
          company_id,
          opened_at: payload.status === 'open' ? new Date().toISOString() : null,
          created_by: userId,
          updated_by: userId,
        })
        .select('*')
        .single();
      if (error) throw error;
      await audit('vacancy', 'CREATE', data.id, null, data);
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast({ title: data.status === 'open' ? 'Vacancy opened' : 'Vacancy saved as draft' });
    },
    onError: fail('Could not create vacancy'),
  });

  const update = useMutation({
    mutationFn: async ({ vacancy, payload }: UpdateVacancyArgs): Promise<VacancyRow> => {
      const patch: TablesUpdate<'vacancies'> = { ...payload };
      if (payload.status && payload.status !== vacancy.status && (VACANCY_STATUSES as readonly string[]).includes(payload.status)) {
        Object.assign(patch, statusStamps(payload.status as VacancyStatus, vacancy, new Date().toISOString()));
      }
      const data = await updateRow(vacancy.id, patch);
      await audit('vacancy', 'UPDATE', vacancy.id, vacancy, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Vacancy updated' });
    },
    onError: fail('Could not update vacancy'),
  });

  const setStatus = useMutation({
    mutationFn: async ({ vacancy, status }: SetVacancyStatusArgs): Promise<VacancyRow> => {
      const data = await updateRow(vacancy.id, statusStamps(status, vacancy, new Date().toISOString()));
      await audit('vacancy', 'UPDATE', vacancy.id, { status: vacancy.status }, { status: data.status });
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      const label: Record<string, string> = {
        open: 'Vacancy opened',
        on_hold: 'Vacancy put on hold',
        filled: 'Vacancy marked as filled',
        cancelled: 'Vacancy cancelled',
        draft: 'Vacancy returned to draft',
      };
      toast({ title: label[data.status] ?? 'Vacancy updated' });
    },
    onError: fail('Could not change vacancy status'),
  });

  const remove = useMutation({
    mutationFn: async (vacancy: VacancyRow): Promise<void> => {
      if (vacancy.status !== 'draft') throw new Error('Only draft vacancies can be deleted. Cancel it instead.');
      const { error } = await supabase.from('vacancies').delete().eq('id', vacancy.id);
      if (error) throw error;
      await audit('vacancy', 'DELETE', vacancy.id, vacancy, null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Draft vacancy deleted' });
    },
    onError: fail('Could not delete vacancy'),
  });

  return { create, update, setStatus, remove };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export function useCandidates(filters: CandidateFilters) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...CANDIDATES_KEY, 'list', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<CandidateListItem[]> => {
      const [{ data, error }, { data: apps, error: aErr }] = await Promise.all([
        supabase.from('candidates').select('*').eq('company_id', companyId as string).order('last_name').order('first_name'),
        supabase.from('candidate_applications').select('id, candidate_id, stage').eq('company_id', companyId as string),
      ]);
      if (error) throw error;
      if (aErr) throw aErr;
      const counts = new Map<string, { total: number; active: number }>();
      for (const a of apps ?? []) {
        const c = counts.get(a.candidate_id) ?? { total: 0, active: 0 };
        c.total += 1;
        if (ACTIVE.has(a.stage)) c.active += 1;
        counts.set(a.candidate_id, c);
      }
      return (data ?? []).map((c) => ({
        ...c,
        applications_count: counts.get(c.id)?.total ?? 0,
        active_applications: counts.get(c.id)?.active ?? 0,
      }));
    },
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const candidates = useMemo(() => filterCandidates(all, filters), [all, filters]);
  return { ...query, all, candidates };
}

export function useCandidate(candidateId: string | null) {
  const access = useHrAccess();
  const query = useQuery({
    queryKey: [...CANDIDATES_KEY, 'detail', candidateId],
    enabled: Boolean(candidateId) && !access.loading && access.canView,
    queryFn: async (): Promise<CandidateDetailData | null> => {
      const { data, error } = await supabase.from('candidates').select('*').eq('id', candidateId as string).maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { data: apps, error: aErr } = await supabase
        .from('candidate_applications')
        .select('*, vacancies(*, vessels(name))')
        .eq('candidate_id', candidateId as string)
        .order('applied_at', { ascending: false });
      if (aErr) throw aErr;
      const applications = ((apps ?? []) as unknown as (ApplicationRow & { vacancies: VacancyRow & { vessels: VesselJoin } })[]).map((row) => {
        const { vacancies, ...app } = row;
        return { ...app, vacancy: withVessel(vacancies) };
      });

      let events: ApplicationEventRow[] = [];
      let interviews: InterviewRow[] = [];
      if (applications.length) {
        const ids = applications.map((a) => a.id);
        const [{ data: evs, error: eErr }, { data: ivs, error: iErr }] = await Promise.all([
          supabase.from('application_events').select('*').in('application_id', ids).order('created_at', { ascending: false }),
          supabase.from('interviews').select('*').in('application_id', ids).order('scheduled_at', { ascending: false }),
        ]);
        if (eErr) throw eErr;
        if (iErr) throw iErr;
        events = evs ?? [];
        interviews = ivs ?? [];
      }
      return { candidate: data, applications, events, interviews };
    },
  });
  return { ...query, detail: query.data ?? null };
}

export interface UpdateCandidateArgs {
  candidate: CandidateRow;
  payload: Partial<CandidateWritePayload>;
}

export interface UploadCvArgs {
  candidate: CandidateRow;
  file: File;
}

export function useCandidateMutations() {
  const { userId, audit, invalidate, fail, toast, requireCompany } = useRecruitmentMutationSupport();

  const updateRow = useCallback(
    async (id: string, patch: TablesUpdate<'candidates'>): Promise<CandidateRow> => {
      const { data, error } = await supabase.from('candidates').update({ ...patch, updated_by: userId }).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    [userId],
  );

  const setStatus = useCallback(
    async (candidate: CandidateRow, status: CandidateStatus): Promise<CandidateRow> => {
      const data = await updateRow(candidate.id, { status });
      await audit('candidate', 'UPDATE', candidate.id, { status: candidate.status }, { status });
      return data;
    },
    [audit, updateRow],
  );

  const create = useMutation({
    mutationFn: async (payload: CandidateWritePayload): Promise<CandidateRow> => {
      const company_id = requireCompany();
      const { data, error } = await supabase
        .from('candidates')
        .insert({ ...payload, company_id, created_by: userId, updated_by: userId })
        .select('*')
        .single();
      if (error) throw error;
      await audit('candidate', 'CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Candidate added' });
    },
    onError: fail('Could not add candidate'),
  });

  const update = useMutation({
    mutationFn: async ({ candidate, payload }: UpdateCandidateArgs): Promise<CandidateRow> => {
      const data = await updateRow(candidate.id, payload);
      await audit('candidate', 'UPDATE', candidate.id, candidate, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Candidate updated' });
    },
    onError: fail('Could not update candidate'),
  });

  const archive = useMutation({
    mutationFn: (candidate: CandidateRow) => setStatus(candidate, 'archived'),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Candidate archived' });
    },
    onError: fail('Could not archive candidate'),
  });

  const markDoNotRehire = useMutation({
    mutationFn: (candidate: CandidateRow) => setStatus(candidate, 'do_not_rehire'),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Marked as do not rehire' });
    },
    onError: fail('Could not update candidate'),
  });

  const reactivate = useMutation({
    mutationFn: (candidate: CandidateRow) => setStatus(candidate, 'active'),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Candidate reactivated' });
    },
    onError: fail('Could not reactivate candidate'),
  });

  const uploadCv = useMutation({
    mutationFn: async ({ candidate, file }: UploadCvArgs): Promise<CandidateRow> => {
      const company_id = requireCompany();
      const uploaded = await uploadCandidateCv(company_id, candidate.id, file);
      const data = await updateRow(candidate.id, { cv_path: uploaded.path, cv_name: uploaded.name });
      if (candidate.cv_path && candidate.cv_path !== uploaded.path) {
        await removeCandidateCv(candidate.cv_path).catch((err: unknown) => console.warn('old CV not removed', err));
      }
      await audit('candidate', 'UPDATE', candidate.id, { cv_path: candidate.cv_path }, { cv_path: uploaded.path, cv_name: uploaded.name });
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'CV uploaded' });
    },
    onError: fail('Could not upload CV'),
  });

  const remove = useMutation({
    mutationFn: async (candidate: CandidateRow): Promise<void> => {
      const { count, error: cErr } = await supabase
        .from('candidate_applications')
        .select('id', { count: 'exact', head: true })
        .eq('candidate_id', candidate.id);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) throw new Error('This candidate has applications. Archive them instead so the pipeline history stays intact.');
      const { error } = await supabase.from('candidates').delete().eq('id', candidate.id);
      if (error) throw error;
      await removeCandidateCv(candidate.cv_path).catch((err: unknown) => console.warn('CV not removed', err));
      await audit('candidate', 'DELETE', candidate.id, candidate, null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Candidate deleted' });
    },
    onError: fail('Could not delete candidate'),
  });

  return { create, update, archive, markDoNotRehire, reactivate, uploadCv, remove };
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/** One application with its candidate, vacancy and full event timeline (for the drawer). */
export function useApplicationDetail(applicationId: string | null) {
  const access = useHrAccess();
  const query = useQuery({
    queryKey: [...APPLICATIONS_KEY, 'detail', applicationId],
    enabled: Boolean(applicationId) && !access.loading && access.canView,
    queryFn: async (): Promise<ApplicationDetailData | null> => {
      const { data, error } = await supabase
        .from('candidate_applications')
        .select('*, candidates(*), vacancies(*, vessels(name))')
        .eq('id', applicationId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const raw = data as unknown as ApplicationRow & { candidates: CandidateRow; vacancies: VacancyRow & { vessels: VesselJoin } };
      const { candidates, vacancies, ...app } = raw;
      const { data: events, error: eErr } = await supabase
        .from('application_events')
        .select('*')
        .eq('application_id', applicationId as string)
        .order('created_at', { ascending: false });
      if (eErr) throw eErr;
      return { application: { ...app, candidate: candidates, vacancy: withVessel(vacancies) }, events: events ?? [] };
    },
  });
  return { ...query, detail: query.data ?? null };
}

export interface ApplyArgs {
  vacancyId: string;
  candidateId: string;
  notes?: string | null;
}

export interface OfferDetails {
  offer_currency: string;
  offer_base_minor: number;
  offer_start_date: string;
}

export interface MoveStageArgs {
  application: ApplicationRow;
  stage: PipelineStage;
  rejection_reason?: string | null;
  /** Required when `stage` is `offer`. */
  offer?: OfferDetails;
}

export interface AddEventArgs {
  applicationId: string;
  event_type: ApplicationEventType;
  body: string;
}

export interface RateApplicationArgs {
  application: ApplicationRow;
  rating: number | null;
}

export interface UpdateApplicationNotesArgs {
  application: ApplicationRow;
  notes: string | null;
}

export interface HireArgs {
  application: ApplicationRow;
  startDate: string;
  vesselId: string | null;
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';

export function useApplicationMutations() {
  const { userId, audit, invalidate, fail, toast, requireCompany } = useRecruitmentMutationSupport();

  const insertEvent = useCallback(
    async (applicationId: string, event_type: ApplicationEventType, body: string): Promise<ApplicationEventRow> => {
      const company_id = requireCompany();
      const { data, error } = await supabase
        .from('application_events')
        .insert({ application_id: applicationId, company_id, event_type, body, created_by: userId })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    [requireCompany, userId],
  );

  const updateRow = useCallback(
    async (id: string, patch: TablesUpdate<'candidate_applications'>): Promise<ApplicationRow> => {
      const { data, error } = await supabase
        .from('candidate_applications')
        .update({ ...patch, updated_by: userId })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    [userId],
  );

  const apply = useMutation({
    mutationFn: async ({ vacancyId, candidateId, notes }: ApplyArgs): Promise<ApplicationRow> => {
      const company_id = requireCompany();
      const { data, error } = await supabase
        .from('candidate_applications')
        .insert({ company_id, vacancy_id: vacancyId, candidate_id: candidateId, notes: notes ?? null, created_by: userId, updated_by: userId })
        .select('*')
        .single();
      if (error) throw isUniqueViolation(error) ? new Error('This candidate has already applied to that vacancy.') : error;
      await audit('candidate_application', 'CREATE', data.id, null, data);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Candidate added to the pipeline' });
    },
    onError: fail('Could not add candidate to vacancy'),
  });

  const moveStage = useMutation({
    mutationFn: async ({ application, stage, rejection_reason, offer }: MoveStageArgs): Promise<ApplicationRow> => {
      if (stage === 'hired') throw new Error('Use the Hire action to hire a candidate.');
      if (stage === 'offer' && !offer) throw new Error('Offer details are required to move to the offer stage.');
      const patch: TablesUpdate<'candidate_applications'> = { stage };
      if (stage === 'rejected') patch.rejection_reason = rejection_reason?.trim() || null;
      if (stage === 'offer' && offer) Object.assign(patch, offer);
      if (stage === 'applied') {
        // Reopening: clear the previous outcome.
        patch.rejection_reason = null;
      }
      const data = await updateRow(application.id, patch);
      if (stage === 'offer' && offer) {
        await insertEvent(
          application.id,
          'offer',
          `Offer sent: ${formatMinor(offer.offer_base_minor, offer.offer_currency)}/month, starting ${formatDate(offer.offer_start_date)}`,
        );
      }
      if (stage === 'rejected' && patch.rejection_reason) {
        await insertEvent(application.id, 'note', `Rejected: ${patch.rejection_reason}`);
      }
      await audit('candidate_application', 'UPDATE', application.id, { stage: application.stage }, { stage, ...(offer ?? {}), rejection_reason: patch.rejection_reason ?? null });
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      const titles: Partial<Record<PipelineStage, string>> = {
        offer: 'Offer recorded',
        accepted: 'Offer accepted',
        rejected: 'Application rejected',
        withdrawn: 'Application withdrawn',
        applied: 'Application reopened',
      };
      toast({ title: titles[data.stage as PipelineStage] ?? 'Stage updated' });
    },
    onError: fail('Could not move application'),
  });

  const addEvent = useMutation({
    mutationFn: ({ applicationId, event_type, body }: AddEventArgs) => insertEvent(applicationId, event_type, body.trim()),
    onSuccess: () => {
      invalidate();
    },
    onError: fail('Could not add to the timeline'),
  });

  const rate = useMutation({
    mutationFn: async ({ application, rating }: RateApplicationArgs): Promise<ApplicationRow> => {
      const data = await updateRow(application.id, { rating });
      await audit('candidate_application', 'UPDATE', application.id, { rating: application.rating }, { rating });
      return data;
    },
    onSuccess: () => invalidate(),
    onError: fail('Could not save rating'),
  });

  const updateNotes = useMutation({
    mutationFn: async ({ application, notes }: UpdateApplicationNotesArgs): Promise<ApplicationRow> => {
      const data = await updateRow(application.id, { notes: notes?.trim() || null });
      await audit('candidate_application', 'UPDATE', application.id, { notes: application.notes }, { notes: data.notes });
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Notes saved' });
    },
    onError: fail('Could not save notes'),
  });

  const hire = useMutation({
    mutationFn: async ({ application, startDate, vesselId }: HireArgs): Promise<string> => {
      if (application.stage !== 'accepted') throw new Error('Only applications with an accepted offer can be hired.');
      const { data, error } = await supabase.rpc('recruitment_hire_candidate', {
        p_application_id: application.id,
        p_start_date: startDate,
        p_vessel_id: vesselId,
      });
      if (error) throw error;
      if (!data) throw new Error('Hire did not return a crew profile');
      await audit('candidate_application', 'UPDATE', application.id, { stage: application.stage }, { stage: 'hired', hired_profile_id: data, start_date: startDate, vessel_id: vesselId });
      return data;
    },
    onSuccess: () => {
      invalidate(HR_CREW_DIRECTORY_KEY, ['hris', 'contracts'], ['hris', 'onboarding']);
    },
    onError: fail('Could not hire candidate'),
  });

  return { apply, moveStage, addEvent, rate, updateNotes, hire };
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export function useInterviews(applicationId: string | null) {
  const access = useHrAccess();
  const query = useQuery({
    queryKey: [...INTERVIEWS_KEY, 'application', applicationId],
    enabled: Boolean(applicationId) && !access.loading,
    queryFn: async (): Promise<InterviewRow[]> => {
      const { data, error } = await supabase
        .from('interviews')
        .select('*')
        .eq('application_id', applicationId as string)
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, interviews: query.data ?? [] };
}

export interface ScheduleInterviewArgs {
  applicationId: string;
  values: InterviewFormValues;
}

export interface CompleteInterviewArgs {
  interview: InterviewRow;
  status: 'completed' | 'no_show';
  outcome: InterviewOutcome | null;
  scorecard: ScorecardRow[];
  feedback: string;
}

export function useInterviewMutations() {
  const { userId, invalidate, fail, toast, requireCompany } = useRecruitmentMutationSupport();

  const logEvent = useCallback(
    async (applicationId: string, body: string) => {
      const company_id = requireCompany();
      const { error } = await supabase
        .from('application_events')
        .insert({ application_id: applicationId, company_id, event_type: 'interview', body, created_by: userId });
      if (error) console.warn('interview event not logged', error);
    },
    [requireCompany, userId],
  );

  const schedule = useMutation({
    mutationFn: async ({ applicationId, values }: ScheduleInterviewArgs): Promise<InterviewRow> => {
      const company_id = requireCompany();
      const scheduled_at = combineDateTime(values.scheduled_date, values.scheduled_time);
      const { data, error } = await supabase
        .from('interviews')
        .insert({
          application_id: applicationId,
          company_id,
          scheduled_at,
          duration_minutes: values.duration_minutes,
          format: values.format,
          location: values.location?.trim() || null,
          interviewer_profile_ids: values.interviewer_profile_ids,
          status: 'scheduled',
          scorecard: [] as Json,
          created_by: userId,
        })
        .select('*')
        .single();
      if (error) throw error;
      await logEvent(applicationId, `Interview scheduled (${values.format.replace('_', ' ')}) for ${formatDate(scheduled_at, 'dd MMM yyyy HH:mm')}`);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Interview scheduled' });
    },
    onError: fail('Could not schedule interview'),
  });

  const complete = useMutation({
    mutationFn: async ({ interview, status, outcome, scorecard, feedback }: CompleteInterviewArgs): Promise<InterviewRow> => {
      const { data, error } = await supabase
        .from('interviews')
        .update({ status, outcome, scorecard: scorecardToJson(scorecard), feedback: feedback.trim() || null })
        .eq('id', interview.id)
        .select('*')
        .single();
      if (error) throw error;
      await logEvent(
        interview.application_id,
        status === 'no_show' ? 'Interview: candidate did not show' : `Interview completed${outcome ? ` — outcome: ${outcome.replace('_', ' ')}` : ''}`,
      );
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Interview recorded' });
    },
    onError: fail('Could not record interview'),
  });

  const cancel = useMutation({
    mutationFn: async (interview: InterviewRow): Promise<InterviewRow> => {
      const { data, error } = await supabase.from('interviews').update({ status: 'cancelled' }).eq('id', interview.id).select('*').single();
      if (error) throw error;
      await logEvent(interview.application_id, `Interview on ${formatDate(interview.scheduled_at, 'dd MMM yyyy HH:mm')} cancelled`);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Interview cancelled' });
    },
    onError: fail('Could not cancel interview'),
  });

  return { schedule, complete, cancel };
}

/** Upcoming interviews where the current user is an interviewer. */
export function useMyInterviews() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;
  const query = useQuery({
    queryKey: [...INTERVIEWS_KEY, 'mine', profileId],
    enabled: Boolean(profileId),
    staleTime: 60_000,
    queryFn: async (): Promise<MyInterview[]> => {
      const { data, error } = await supabase
        .from('interviews')
        .select('*, candidate_applications(vacancy_id, candidates(first_name, last_name, preferred_name), vacancies(title))')
        .contains('interviewer_profile_ids', [profileId as string])
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      type Joined = InterviewRow & {
        candidate_applications: {
          vacancy_id: string;
          candidates: { first_name: string; last_name: string; preferred_name: string | null } | null;
          vacancies: { title: string } | null;
        } | null;
      };
      return ((data ?? []) as unknown as Joined[]).map((row) => {
        const { candidate_applications: app, ...rest } = row;
        const c = app?.candidates;
        return {
          ...rest,
          candidate_name: c ? `${c.preferred_name || c.first_name} ${c.last_name}`.trim() : 'Unknown candidate',
          vacancy_id: app?.vacancy_id ?? '',
          vacancy_title: app?.vacancies?.title ?? 'Vacancy',
        };
      });
    },
  });
  return { ...query, interviews: query.data ?? [] };
}
