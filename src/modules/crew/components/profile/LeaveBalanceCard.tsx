import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/shared/components/states';
import { supabase } from '@/integrations/supabase/client';
import { isMissingRelation, pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { todayDateOnly } from '@/shared/lib/form';
import { useCan } from '@/lib/permissions/useCan';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_CAPS } from '@/modules/crew/paths';
import { crewKeys } from '@/modules/crew/hooks/crewKeys';
import { useCrewEmployment, type CrewProfileSummary, type ProfileVessel } from '@/modules/crew/hooks/useCrewProfile';
import {
  DEFAULT_LEAVE_POLICY,
  calculateLeaveBreakdown,
  type AccrualBreakdown,
  type AccrualMethod,
  type LeavePolicy,
  type RoundingMethod,
} from '@/modules/crew/services/leaveCalculator';
import {
  allowanceFromTerms,
  allowanceSourceText,
  calendarYear,
  daysText,
  termsBalance,
  type LeaveAllowance,
  type PendingPeriod,
  type TermsBalance,
} from '@/modules/crew/lib/leaveAllowance';
import { leaveTypeForDayCode } from '@/modules/rotation-planner/lib/leaveTypes';
import type { PlannerPendingColumns, PlannerPendingFunctions, PlannerPendingTables } from '@/modules/rotation-planner/types/db.pending';
import { Fact, FactGrid } from './CurrentEmploymentCard';

/**
 * Leave balance (gap/04 C55; X1-09B) on the profile's Personal tab. The
 * allowance comes from the person's employment terms (days a year, or a
 * ratio on:off counted time for time; crew/lib/leaveAllowance.ts), and,
 * when the terms name none, from the vessel's leave policy through the
 * leave calculator (unchanged). The card always says which.
 *
 * Who sees it: the person, and viewers with the vessel's planner, leave
 * approval or HR employment access; nothing is read for anyone else.
 * Balances are counted from the day codes, which exist only for crew with
 * a login; a person without one gets a sentence, never a zero.
 */

/** The leave year's figures, whichever path computed them. */
type BalanceFigures =
  | { path: 'terms'; allowance: Extract<LeaveAllowance, { kind: 'days_per_year' | 'ratio' }>; balance: TermsBalance }
  | { path: 'none' }
  | { path: 'policy'; allowance: Extract<LeaveAllowance, { kind: 'policy' }>; policySource: 'vessel' | 'company' | 'default'; breakdown: AccrualBreakdown };

type BalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no_login' }
  | { status: 'error'; error: unknown; retry: () => void }
  /** `termsNotSetUp`: crew_assignment_terms is not applied yet (D-01), so the policy applies. */
  | { status: 'ready'; figures: BalanceFigures; year: string; termsNotSetUp: boolean };

/** The planner's pending tables (060900): the periods of a leave request. */
const plannerDb = pendingClient<PlannerPendingTables, NoPending, PlannerPendingFunctions, PlannerPendingColumns>();

const ACCRUAL_METHODS: readonly AccrualMethod[] = ['monthly', 'daily', 'rotation', 'contract'];
const ROUNDINGS: readonly RoundingMethod[] = ['none', 'half', 'whole'];

const POLICY_COLUMNS =
  'vessel_id, default_annual_entitlement, accrual_method, monthly_accrual_days, pro_rata, rounding, booked_deducts, sick_affects_balance, training_affects_balance, unpaid_affects_balance, default_rotation';

interface BalanceQueryInput {
  companyId: string;
  vesselId: string;
  profileId: string;
  userId: string;
  allowance: LeaveAllowance;
  termsStart: string | null;
  termsEnd: string | null;
  today: string;
}

/** The vessel's policy row, else the company's, else STORM's default (as the leave calculator reads it). */
async function fetchPolicy(companyId: string, vesselId: string): Promise<{ policy: LeavePolicy; source: 'vessel' | 'company' | 'default' }> {
  const { data, error } = await supabase.from('crew_leave_policies').select(POLICY_COLUMNS).eq('company_id', companyId);
  if (error) throw error;
  const rows = data ?? [];
  const row = rows.find((r) => r.vessel_id === vesselId) ?? rows.find((r) => r.vessel_id === null) ?? null;
  if (!row) return { policy: DEFAULT_LEAVE_POLICY, source: 'default' };
  return {
    source: row.vessel_id ? 'vessel' : 'company',
    policy: {
      defaultAnnualEntitlement: Number(row.default_annual_entitlement) || DEFAULT_LEAVE_POLICY.defaultAnnualEntitlement,
      accrualMethod: (ACCRUAL_METHODS as readonly string[]).includes(row.accrual_method) ? (row.accrual_method as AccrualMethod) : DEFAULT_LEAVE_POLICY.accrualMethod,
      monthlyAccrualDays: Number(row.monthly_accrual_days) || DEFAULT_LEAVE_POLICY.monthlyAccrualDays,
      proRata: row.pro_rata,
      rounding: (ROUNDINGS as readonly string[]).includes(row.rounding) ? (row.rounding as RoundingMethod) : DEFAULT_LEAVE_POLICY.rounding,
      bookedDeducts: row.booked_deducts,
      sickAffectsBalance: row.sick_affects_balance,
      trainingAffectsBalance: row.training_affects_balance,
      unpaidAffectsBalance: row.unpaid_affects_balance,
      defaultRotation: row.default_rotation,
    },
  };
}

/** The person's pending requests touching the year, as periods (a legacy request is its own range). */
async function fetchPendingPeriods(userId: string, year: { start: string; end: string }): Promise<PendingPeriod[]> {
  const { data: requests, error } = await supabase
    .from('crew_leave_requests')
    .select('id, leave_type, start_date, end_date')
    .eq('crew_id', userId)
    .eq('status', 'pending')
    .gte('end_date', year.start)
    .lte('start_date', year.end);
  if (error) throw error;
  const list = requests ?? [];
  if (list.length === 0) return [];
  const { data: periods, error: periodsError } = await plannerDb
    .from('crew_leave_request_periods')
    .select('request_id, leave_type_key, start_date, end_date')
    .in('request_id', list.map((r) => r.id));
  const byRequest = new Map<string, PendingPeriod[]>();
  if (periodsError) {
    // D-01: before 060900 a request has no period rows; its own range is its one period.
    if (!isMissingRelation(periodsError)) throw periodsError;
  } else {
    for (const p of periods ?? []) {
      const entry: PendingPeriod = { leaveTypeKey: p.leave_type_key, start: p.start_date, end: p.end_date };
      byRequest.set(p.request_id, [...(byRequest.get(p.request_id) ?? []), entry]);
    }
  }
  return list.flatMap((r) => {
    const own = byRequest.get(r.id);
    if (own && own.length > 0) return own;
    const type = leaveTypeForDayCode(r.leave_type);
    return type ? [{ leaveTypeKey: type.key, start: r.start_date, end: r.end_date }] : [];
  });
}

async function fetchBalance(input: BalanceQueryInput): Promise<BalanceFigures> {
  const { allowance } = input;
  if (allowance.kind === 'none') return { path: 'none' };
  const year = calendarYear(input.today);
  const [{ policy, source }, entriesResult] = await Promise.all([
    fetchPolicy(input.companyId, input.vesselId),
    supabase.from('crew_leave_entries').select('date, status_code').eq('crew_id', input.userId).gte('date', year.start).lte('date', year.end),
  ]);
  if (entriesResult.error) throw entriesResult.error;
  const entries = (entriesResult.data ?? []).map((e) => ({ date: e.date, code: e.status_code }));
  const flags = {
    sickAffectsBalance: policy.sickAffectsBalance,
    trainingAffectsBalance: policy.trainingAffectsBalance,
    unpaidAffectsBalance: policy.unpaidAffectsBalance,
  };

  if (allowance.kind === 'days_per_year' || allowance.kind === 'ratio') {
    const pending = await fetchPendingPeriods(input.userId, year);
    return {
      path: 'terms',
      allowance,
      balance: termsBalance({ allowance, termsStart: input.termsStart, termsEnd: input.termsEnd, entries, pending, today: input.today, policy: flags }),
    };
  }

  // The vessel's policy, through the leave calculator exactly as the leave planner computes it.
  const [profileResult, carryResult, adjustResult, requestsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, contract_start_date, contract_end_date, employment_start_date, annual_leave_entitlement, leave_accrual_method, rotation_pattern')
      .eq('id', input.profileId)
      .maybeSingle(),
    supabase.from('crew_leave_carryover').select('carryover_days').eq('crew_id', input.userId).eq('year', Number(input.today.slice(0, 4))).maybeSingle(),
    supabase.from('crew_leave_balance_adjustments').select('adjustment_days, effective_date').eq('crew_id', input.userId),
    supabase.from('crew_leave_requests').select('start_date, end_date, status, leave_type').eq('crew_id', input.userId).gte('end_date', year.start),
  ]);
  for (const r of [profileResult, carryResult, adjustResult, requestsResult]) if (r.error) throw r.error;
  const p = profileResult.data;
  const method = p?.leave_accrual_method && (ACCRUAL_METHODS as readonly string[]).includes(p.leave_accrual_method) ? (p.leave_accrual_method as AccrualMethod) : null;
  const breakdown = calculateLeaveBreakdown({
    profile: {
      user_id: input.userId,
      contract_start_date: p?.contract_start_date ?? null,
      contract_end_date: p?.contract_end_date ?? null,
      employment_start_date: p?.employment_start_date ?? null,
      annual_leave_entitlement: p?.annual_leave_entitlement ?? null,
      leave_accrual_method: method,
      rotation_pattern: p?.rotation_pattern ?? null,
    },
    policy,
    entries: entries.map((e) => ({ date: e.date, status_code: e.code })),
    requests: requestsResult.data ?? [],
    carryover: Number(carryResult.data?.carryover_days ?? 0),
    adjustments: (adjustResult.data ?? []).map((a) => ({ adjustment_days: Number(a.adjustment_days), effective_date: a.effective_date })),
    asOf: new Date(),
    fallbackJoinDate: input.termsStart,
  });
  return { path: 'policy', allowance, policySource: source, breakdown };
}

function useLeaveBalance(vessel: ProfileVessel, profile: CrewProfileSummary, enabled: boolean): BalanceState {
  const employment = useCrewEmployment(enabled ? vessel : null, enabled ? profile : null);
  const today = todayDateOnly();
  const terms = employment.status === 'ready' ? employment.employment.terms : null;
  const termsMissing = employment.status === 'ready' && employment.employment.termsMissing;
  const allowance = allowanceFromTerms(terms);
  const ready = enabled && employment.status === 'ready' && Boolean(profile.userId);
  const query = useQuery({
    queryKey: [
      ...crewKeys.vessel(vessel.companyId, vessel.id),
      'profile',
      profile.profileId,
      'leave-balance',
      today,
      terms?.id ?? 'no-terms',
      terms?.updated_at ?? '',
    ] as const,
    queryFn: () =>
      fetchBalance({
        companyId: vessel.companyId,
        vesselId: vessel.id,
        profileId: profile.profileId,
        userId: profile.userId as string,
        allowance,
        termsStart: terms?.start_date ?? null,
        termsEnd: terms?.end_date ?? null,
        today,
      }),
    enabled: ready,
    retry: 1,
    staleTime: 60_000,
  });

  if (!enabled) return { status: 'idle' };
  if (employment.status === 'idle' || employment.status === 'loading') return { status: 'loading' };
  if (employment.status === 'error') return { status: 'error', error: employment.error, retry: employment.retry };
  if (!profile.userId) return { status: 'no_login' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', figures: query.data, year: today.slice(0, 4), termsNotSetUp: termsMissing };
}

/** The viewer may see the person's leave balance on this vessel. */
function useMaySeeBalance(vesselId: string, profile: CrewProfileSummary): boolean {
  const scheduling = useCan(CREW_CAPS.schedulingView, { vesselId });
  const approve = useCan(CREW_CAPS.leaveApprove, { vesselId });
  const employment = useCan(CREW_CAPS.employmentView, { vesselId });
  return profile.isOwn || scheduling || approve || employment;
}

export interface LeaveBalanceCardProps {
  vessel: ProfileVessel & { name: string };
  profile: CrewProfileSummary;
}

export const LeaveBalanceCard: React.FC<LeaveBalanceCardProps> = ({ vessel, profile }) => {
  const maySee = useMaySeeBalance(vessel.id, profile);
  const canPlan = useCan(CREW_CAPS.schedulingView, { vesselId: vessel.id });
  const state = useLeaveBalance(vessel, profile, maySee);
  const scopedPath = useScopedPath();
  if (!maySee) return null;
  return (
    <Card data-profile-card="leave-balance">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
        <CardTitle className="type-subtitle">Leave balance</CardTitle>
        {state.status === 'ready' ? <span className="ml-auto type-caption text-muted-foreground">{state.year}</span> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {state.status === 'idle' || state.status === 'loading' ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the leave balance">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : state.status === 'error' ? (
          <PageError variant="inline" error={state.error} onRetry={state.retry} title="The leave balance could not load" treatMissingAsOff={false} />
        ) : state.status === 'no_login' ? (
          <p className="type-body text-muted-foreground" data-leave-balance="no-login">
            Leave is counted from the planner&rsquo;s days, which are kept against a sign-in. This crew member has none yet, so no balance is counted.
          </p>
        ) : (
          <BalanceBody figures={state.figures} termsNotSetUp={state.termsNotSetUp} />
        )}
        {canPlan && profile.onVessel ? (
          <Link
            to={`${scopedPath('crew/planner/timeline')}?crew=${encodeURIComponent(profile.profileId)}`}
            className="inline-flex min-h-8 items-center type-body-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
          >
            Open in the planner
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
};

const POLICY_SOURCE_TEXT: Record<'vessel' | 'company' | 'default', string> = {
  vessel: 'Vessel leave policy',
  company: 'Company leave policy',
  default: "STORM's default policy (no leave policy is set)",
};

const BalanceBody: React.FC<{ figures: BalanceFigures; termsNotSetUp: boolean }> = ({ figures, termsNotSetUp }) => {
  if (figures.path === 'none') {
    return (
      <p className="type-body text-muted-foreground" data-leave-balance="none">
        {allowanceSourceText({ kind: 'none' })}. Nothing accrues and no balance is counted.
      </p>
    );
  }
  if (figures.path === 'terms') {
    const b = figures.balance;
    return (
      <div className="space-y-3" data-leave-balance="terms" data-leave-method={b.method}>
        <Remaining days={b.remaining} />
        {b.outsideTerms ? (
          <p className="type-body-sm text-muted-foreground">The employment terms do not cover this year, so nothing is counted.</p>
        ) : null}
        <FactGrid>
          <Fact label={b.method === 'ratio' ? 'Earned to date' : 'Accrued to date'}>{daysText(b.accrued)}</Fact>
          <Fact label="Taken">{daysText(b.taken)}</Fact>
          <Fact label="Booked ahead">{daysText(b.booked)}</Fact>
          <Fact label="Awaiting a decision">{b.pending > 0 ? `${daysText(b.pending)}${b.pendingOpenEnded ? ', one with no end yet' : ''}` : 'None'}</Fact>
          <Fact label="Whole-year allowance">{daysText(b.yearAllowance)}</Fact>
          {b.method === 'ratio' ? <Fact label="Days on board this year">{daysText(b.onBoardDays)}</Fact> : null}
        </FactGrid>
        <Source text={allowanceSourceText(figures.allowance)} />
      </div>
    );
  }
  const d = figures.breakdown;
  return (
    <div className="space-y-3" data-leave-balance="policy" data-policy-source={figures.policySource}>
      <Remaining days={d.remaining} />
      <FactGrid>
        <Fact label="Accrued to date">{daysText(d.accrued)}</Fact>
        <Fact label="Taken">{daysText(d.taken)}</Fact>
        <Fact label="Booked ahead">{daysText(d.booked)}</Fact>
        <Fact label="Awaiting a decision">{d.pending > 0 ? daysText(d.pending) : 'None'}</Fact>
        {d.carryover !== 0 ? <Fact label="Carried over">{daysText(d.carryover)}</Fact> : null}
        {d.adjustments !== 0 ? <Fact label="Adjustments">{daysText(d.adjustments)}</Fact> : null}
        <Fact label="Annual entitlement">{daysText(d.annualEntitlement)}</Fact>
      </FactGrid>
      <Source
        text={
          termsNotSetUp
            ? `${POLICY_SOURCE_TEXT[figures.policySource]}, ${daysText(d.monthlyAccrualDays)} a month. Allowances from the employment terms apply once the crew update is applied.`
            : `${allowanceSourceText(figures.allowance)}: ${POLICY_SOURCE_TEXT[figures.policySource]}, ${daysText(d.monthlyAccrualDays)} a month.`
        }
      />
      {d.notes.length > 0 ? (
        <ul className="space-y-1 type-caption text-muted-foreground">
          {d.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const Remaining: React.FC<{ days: number }> = ({ days }) => (
  <div>
    <p className="type-caption text-muted-foreground">Remaining</p>
    <p className={days < 0 ? 'type-title text-critical' : 'type-title text-foreground'} data-leave-remaining={days}>
      {daysText(days)}
    </p>
  </div>
);

const Source: React.FC<{ text: string }> = ({ text }) => (
  <p className="flex items-start gap-1.5 type-caption text-muted-foreground" data-leave-source="">
    <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
    <span>{text}</span>
  </p>
);

export default LeaveBalanceCard;
