import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import {
  categoryMix,
  expiryForecast,
  headcountTrend,
  joinersLeavers,
  leaveByMonth,
  monthRange,
  nextMonths,
  reviewCompletion,
  statusCounts,
  tenureDistribution,
  turnoverRate,
  type AssignmentLike,
  type ForecastPoint,
  type HeadcountPoint,
  type LeavePoint,
  type MixPoint,
  type MonthBucket,
  type MovementPoint,
  type ReviewCompletionPoint,
  type TenurePoint,
  type TurnoverPoint,
} from '@/modules/hris/lib/reports';

export const HR_REPORTS_KEY = ['hris', 'reports'] as const;

export interface ReportFilters {
  vesselId: string | null;
  department: string | null;
  /** `yyyy-MM-dd` */
  from: string;
  /** `yyyy-MM-dd` */
  to: string;
}

export const defaultReportFilters = (today = new Date()): ReportFilters => ({
  vesselId: null,
  department: null,
  from: format(startOfMonth(subMonths(today, 11)), 'yyyy-MM-dd'),
  to: format(today, 'yyyy-MM-dd'),
});

export const ONBOARDING_STATUS_ORDER = ['Not_Started', 'In_Progress', 'Completed', 'Overdue'];

interface AssignmentRow extends AssignmentLike {
  department: string | null;
}

interface ExpiryRow {
  item_type: string;
  due_date: string;
  profile_id: string | null;
  vessel_id: string | null;
}

interface ReviewRow {
  review_type: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  profile_id: string;
  vessel_id: string | null;
}

interface LeaveRow {
  start_date: string;
  status: string;
  crew_id: string;
  vessel_id: string | null;
}

interface OnboardingRow {
  status: string;
  user_id: string;
  vessel_id: string;
}

export interface HrReportData {
  months: MonthBucket[];
  forecastMonths: MonthBucket[];
  headcount: HeadcountPoint[];
  movement: MovementPoint[];
  turnover: TurnoverPoint[];
  tenure: TenurePoint[];
  contractForecast: ForecastPoint[];
  documentForecast: ForecastPoint[];
  nationality: MixPoint[];
  departments: MixPoint[];
  reviews: ReviewCompletionPoint[];
  leave: LeavePoint[];
  onboarding: MixPoint[];
  /** Headline numbers for the summary table. */
  kpis: { label: string; value: string }[];
}

/**
 * Raw HR rows for the Reporting page (one fetch per source, company scoped)
 * plus every aggregation, with the vessel / department / date filters applied
 * client-side so changing a filter never refetches.
 */
export function useHrReports(filters: ReportFilters, today = new Date()) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const ready = Boolean(companyId) && !access.loading && access.canView;

  const directory = useHrCrewDirectory({ includeInactive: true });
  const vessels = useCompanyVessels();

  const assignments = useQuery({
    queryKey: [...HR_REPORTS_KEY, 'assignments', companyId],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from('crew_assignments')
        .select('user_id, vessel_id, join_date, leave_date, department, vessels!inner(company_id)')
        .eq('vessels.company_id', companyId as string)
        .order('join_date')
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((r) => ({ user_id: r.user_id, vessel_id: r.vessel_id, join_date: r.join_date, leave_date: r.leave_date, department: r.department }));
    },
  });

  const expiry = useQuery({
    queryKey: [...HR_REPORTS_KEY, 'expiry', companyId, format(today, 'yyyy-MM')],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExpiryRow[]> => {
      const from = format(startOfMonth(today), 'yyyy-MM-dd');
      const to = format(endOfMonth(addMonths(today, 5)), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('hr_expiry_items')
        .select('item_type, due_date, profile_id, vessel_id')
        .eq('company_id', companyId as string)
        .gte('due_date', from)
        .lte('due_date', to)
        .limit(5000);
      if (error) throw error;
      return (data ?? []).flatMap((r) => (r.item_type && r.due_date ? [{ item_type: r.item_type, due_date: r.due_date, profile_id: r.profile_id, vessel_id: r.vessel_id }] : []));
    },
  });

  const reviews = useQuery({
    queryKey: [...HR_REPORTS_KEY, 'reviews', companyId],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data, error } = await supabase
        .from('performance_reviews')
        .select('review_type, status, due_date, completed_at, profile_id, vessel_id')
        .eq('company_id', companyId as string)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const leave = useQuery({
    queryKey: [...HR_REPORTS_KEY, 'leave', companyId, filters.from, filters.to],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LeaveRow[]> => {
      const { data, error } = await supabase
        .from('crew_leave_requests')
        .select('start_date, status, crew_id, vessel_id')
        .eq('company_id', companyId as string)
        .gte('start_date', format(startOfMonth(parseISO(filters.from)), 'yyyy-MM-dd'))
        .lte('start_date', format(endOfMonth(parseISO(filters.to)), 'yyyy-MM-dd'))
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const onboarding = useQuery({
    queryKey: [...HR_REPORTS_KEY, 'onboarding', companyId],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OnboardingRow[]> => {
      const { data, error } = await supabase
        .from('familiarization_records')
        .select('status, user_id, vessel_id, vessels!inner(company_id)')
        .eq('vessels.company_id', companyId as string)
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((r) => ({ status: r.status, user_id: r.user_id, vessel_id: r.vessel_id }));
    },
  });

  const departments = useMemo(
    () => Array.from(new Set(directory.all.map((e) => e.department?.trim()).filter((d): d is string => Boolean(d)))).sort(),
    [directory.all],
  );

  const data = useMemo<HrReportData | null>(() => {
    if (!ready || assignments.isLoading || expiry.isLoading || reviews.isLoading || leave.isLoading || onboarding.isLoading || directory.isLoading) return null;

    const byProfile = new Map(directory.all.map((e) => [e.id, e]));
    const byUser = new Map(directory.all.filter((e) => e.user_id).map((e) => [e.user_id as string, e]));
    const wantVessel = filters.vesselId;
    const wantDept = filters.department;

    const deptOk = (dept: string | null | undefined) => !wantDept || (dept ?? '').trim() === wantDept;
    const vesselOk = (vessel: string | null | undefined) => !wantVessel || vessel === wantVessel;

    const crew = directory.all.filter((e) => vesselOk(e.vessel_id) && deptOk(e.department));
    const activeCrew = crew.filter((e) => (e.status ?? 'active') !== 'inactive' && e.account_status !== 'deactivated');

    const assignmentRows = (assignments.data ?? []).filter((a) => vesselOk(a.vessel_id) && deptOk(a.department ?? byUser.get(a.user_id)?.department));
    const expiryRows = (expiry.data ?? []).filter((r) => {
      const p = r.profile_id ? byProfile.get(r.profile_id) : undefined;
      return vesselOk(r.vessel_id ?? p?.vessel_id) && deptOk(p?.department);
    });
    const reviewRows = (reviews.data ?? []).filter((r) => {
      const p = byProfile.get(r.profile_id);
      return vesselOk(r.vessel_id ?? p?.vessel_id) && deptOk(p?.department);
    });
    const leaveRows = (leave.data ?? []).filter((r) => {
      const p = byUser.get(r.crew_id);
      return vesselOk(r.vessel_id ?? p?.vessel_id) && deptOk(p?.department);
    });
    const onboardingRows = (onboarding.data ?? []).filter((r) => vesselOk(r.vessel_id) && deptOk(byUser.get(r.user_id)?.department));

    const months = monthRange(parseISO(filters.from), parseISO(filters.to));
    const forecastMonths = nextMonths(today, 6);

    const headcount = headcountTrend(assignmentRows, months);
    const movement = joinersLeavers(assignmentRows, months);
    const turnover = turnoverRate(assignmentRows, months);
    const tenure = tenureDistribution(assignmentRows, today);
    const contractForecast = expiryForecast(expiryRows.filter((r) => r.item_type === 'contract' || r.item_type === 'probation'), forecastMonths);
    const documentForecast = expiryForecast(expiryRows.filter((r) => r.item_type !== 'contract' && r.item_type !== 'probation'), forecastMonths);
    const nationality = categoryMix(activeCrew, (e) => e.nationality, { top: 10 });
    const departmentsMix = categoryMix(activeCrew, (e) => e.department, { unknownLabel: 'No department' });
    const reviewPoints = reviewCompletion(reviewRows, today.getFullYear(), today);
    const leavePoints = leaveByMonth(leaveRows, months);
    const onboardingPoints = statusCounts(onboardingRows, ONBOARDING_STATUS_ORDER);

    const latestTurnover = turnover[turnover.length - 1];
    const joiners = movement.reduce((s, p) => s + p.joiners, 0);
    const leavers = movement.reduce((s, p) => s + p.leavers, 0);
    const reviewsCompleted = reviewPoints.reduce((s, p) => s + p.completed, 0);
    const reviewsOutstanding = reviewPoints.reduce((s, p) => s + p.outstanding, 0);

    const kpis = [
      { label: 'Active crew profiles', value: String(activeCrew.length) },
      { label: 'Onboard on 1st of this month', value: String(headcount[headcount.length - 1]?.headcount ?? 0) },
      { label: `Joiners (${months[0]?.label} – ${months[months.length - 1]?.label})`, value: String(joiners) },
      { label: `Leavers (${months[0]?.label} – ${months[months.length - 1]?.label})`, value: String(leavers) },
      { label: 'Turnover, rolling 12 months', value: latestTurnover ? `${latestTurnover.ratePct}%` : '0%' },
      { label: 'Contracts / probations ending in 6 months', value: String(contractForecast.reduce((s, p) => s + p.total, 0)) },
      { label: 'Documents & certificates expiring in 6 months', value: String(documentForecast.reduce((s, p) => s + p.total, 0)) },
      { label: `Reviews completed / outstanding (${today.getFullYear()})`, value: `${reviewsCompleted} / ${reviewsOutstanding}` },
      { label: 'Leave requests in range', value: String(leaveRows.length) },
      { label: 'Onboarding records', value: String(onboardingRows.length) },
    ];

    return {
      months,
      forecastMonths,
      headcount,
      movement,
      turnover,
      tenure,
      contractForecast,
      documentForecast,
      nationality,
      departments: departmentsMix,
      reviews: reviewPoints,
      leave: leavePoints,
      onboarding: onboardingPoints,
      kpis,
    };
  }, [ready, assignments.isLoading, assignments.data, expiry.isLoading, expiry.data, reviews.isLoading, reviews.data, leave.isLoading, leave.data, onboarding.isLoading, onboarding.data, directory.isLoading, directory.all, filters, today]);

  const error = assignments.error ?? expiry.error ?? reviews.error ?? leave.error ?? onboarding.error ?? directory.error ?? null;

  return {
    ready,
    access,
    data,
    isLoading: ready && data === null && !error,
    error,
    vessels: vessels.vessels,
    vesselName: vessels.vesselName,
    departments,
  };
}
