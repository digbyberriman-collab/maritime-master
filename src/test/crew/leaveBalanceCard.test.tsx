/**
 * The profile's Leave balance card (gap/04 C55; X1-09B):
 *
 * - who sees it: the person, and planner, leave approval or HR employment
 *   viewers; anyone else gets nothing and nothing is read;
 * - the allowance from the employment terms: days a year (accrued with
 *   time, deducting days taken and booked, pending apart) or a ratio (time
 *   for time from days on board), or none; the card names its source;
 * - without terms (and with the terms table missing, D-01) the vessel's
 *   leave policy through the leave calculator, unchanged;
 * - a person without a login gets a sentence, never a zero; a failed read
 *   is an error with Retry; the planner link carries ?crew=.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { addDays } from '@/modules/rotation-planner/lib/duration';

const TODAY = '2026-11-27';

const h = vi.hoisted(() => ({
  caps: new Set<string>(),
  employment: { status: 'ready' } as Record<string, unknown>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  fromCalls: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'is', 'lte', 'gte']) chain[m] = () => chain;
    const result = () => h.tables[table] ?? { data: [], error: null };
    chain.maybeSingle = () => {
      const r = result();
      return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
    };
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  return { supabase: { from } };
});
vi.mock('@/lib/permissions/useCan', () => ({ useCan: (key: string) => h.caps.has(key) }));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/shared/lib/form', async (orig) => {
  const real = await orig<typeof import('@/shared/lib/form')>();
  return { ...real, todayDateOnly: () => TODAY };
});
vi.mock('@/modules/crew/hooks/useCrewProfile', async (orig) => {
  const real = await orig<typeof import('@/modules/crew/hooks/useCrewProfile')>();
  return { ...real, useCrewEmployment: (vessel: unknown) => (vessel ? h.employment : { status: 'idle' }) };
});

import { LeaveBalanceCard } from '@/modules/crew/components/profile/LeaveBalanceCard';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';
import { calculateLeaveBreakdown, DEFAULT_LEAVE_POLICY } from '@/modules/crew/services/leaveCalculator';

const vessel = { id: 'v-dra', companyId: 'c-1', name: 'DRAAK' };

const profile = (over: Partial<CrewProfileSummary> = {}): CrewProfileSummary => ({
  profileId: 'p-bosun',
  userId: 'u-bosun',
  firstName: 'Demo',
  lastName: 'Bosun',
  preferredName: null,
  displayName: 'Demo Bosun',
  avatarUrl: null,
  crewNumber: null,
  positionName: 'Bosun',
  positionText: 'Bosun',
  departmentKey: 'deck',
  departmentLabel: 'Deck',
  rankTier: 'rating',
  onVessel: true,
  placementKind: 'assignment',
  assignmentId: 'a-1',
  joinDate: '2026-01-01',
  leaveDate: null,
  status: 'on_board',
  statusDetail: null,
  transferVesselId: null,
  leaveCode: null,
  loginState: 'active',
  prev: null,
  next: null,
  memberIndex: 1,
  memberCount: 2,
  isOwn: true,
  canEdit: false,
  canEditSelf: true,
  tabs: null,
  source: 'server',
  ...over,
});

const terms = (over: Record<string, unknown> = {}) => ({
  id: 't-1',
  company_id: 'c-1',
  profile_id: 'p-bosun',
  vessel_id: 'v-dra',
  assignment_id: 'a-1',
  position_id: null,
  department_key: 'deck',
  start_date: '2026-01-01',
  date_joining_vessel: null,
  review_date: null,
  contract_type_key: null,
  leave_method: 'days_per_year',
  leave_days_per_year: 30,
  leave_ratio_on: null,
  leave_ratio_off: null,
  place_of_embarkation: null,
  end_date: null,
  end_reason: null,
  end_notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

const employmentWith = (t: unknown, termsMissing = false) => ({
  status: 'ready',
  employment: { assignment: null, placement: null, terms: t, termsMissing, contractTypeLabels: new Map() },
});

const codes = (start: string, days: number, code: string) => Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), status_code: code }));

const policyRow = {
  vessel_id: 'v-dra',
  default_annual_entitlement: 40,
  accrual_method: 'monthly',
  monthly_accrual_days: 3,
  pro_rata: true,
  rounding: 'half',
  booked_deducts: true,
  sick_affects_balance: false,
  training_affects_balance: false,
  unpaid_affects_balance: false,
  default_rotation: null,
};

const renderCard = (p: CrewProfileSummary = profile()) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LeaveBalanceCard vessel={vessel} profile={p} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-27T12:00:00'));
  h.caps = new Set();
  h.fromCalls = [];
  h.employment = employmentWith(terms());
  h.tables = {
    crew_leave_policies: { data: [], error: null },
    crew_leave_entries: { data: [...codes('2026-03-02', 5, 'L'), ...codes('2026-12-01', 2, 'L'), ...codes('2026-04-01', 10, 'R')], error: null },
    crew_leave_requests: { data: [{ id: 'r-1', leave_type: 'L', start_date: '2026-12-20', end_date: '2026-12-24', status: 'pending' }], error: null },
    crew_leave_request_periods: { data: [], error: null },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('who sees the card', () => {
  it('shows nothing and reads nothing for a viewer who is not the person and holds no planner, leave or HR access', () => {
    const { container } = renderCard(profile({ isOwn: false }));
    expect(container).toBeEmptyDOMElement();
    expect(h.fromCalls).toEqual([]);
  });

  it('shows the card to a planner viewer of the vessel, with the planner link', async () => {
    h.caps = new Set(['vessel.crew.crew_scheduling.view']);
    renderCard(profile({ isOwn: false }));
    expect(await screen.findByText('Leave balance')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in the planner' })).toHaveAttribute('href', '/v/dra/crew/planner/timeline?crew=p-bosun');
  });
});

describe('the allowance from the employment terms', () => {
  it('days a year: accrued with time, taken and booked days deducted, pending apart, the source named', async () => {
    renderCard();
    const remaining = await screen.findByText(/^20\.21 days$/);
    expect(remaining).toHaveAttribute('data-leave-remaining', '20.21');
    // 331 of 365 days of 30 days; 5 days of holiday taken, 2 booked; rotation leave uses nothing.
    expect(screen.getByText('27.21 days')).toBeInTheDocument();
    expect(screen.getByText('2 days')).toBeInTheDocument();
    expect(screen.getByText('Employment terms: 30 days a year (2.50 a month)')).toBeInTheDocument();
    // Taken, and the pending request (20 to 24 December, never deducted).
    expect(screen.getAllByText('5 days')).toHaveLength(2);
  });

  it('ratio: time for time from the days on board', async () => {
    h.employment = employmentWith(terms({ leave_method: 'ratio', leave_days_per_year: null, leave_ratio_on: 2, leave_ratio_off: 1 }));
    h.tables.crew_leave_entries = { data: [...codes('2026-10-01', 20, 'F'), ...codes('2026-10-21', 4, 'R')], error: null };
    h.tables.crew_leave_requests = { data: [], error: null };
    renderCard();
    expect(await screen.findByText(/^6 days$/)).toHaveAttribute('data-leave-remaining', '6');
    expect(screen.getByText('20 days')).toBeInTheDocument();
    expect(screen.getByText('Employment terms: 2:1 on/off rotation, time for time')).toBeInTheDocument();
  });

  it('none: says so and counts nothing', async () => {
    h.employment = employmentWith(terms({ leave_method: 'none', leave_days_per_year: null }));
    renderCard();
    expect(await screen.findByText(/Employment terms: no leave allowance/)).toBeInTheDocument();
    expect(h.fromCalls).not.toContain('crew_leave_entries');
  });
});

describe("the vessel's leave policy", () => {
  it('without terms: the leave calculator on the vessel policy, named as its source', async () => {
    h.employment = employmentWith(null);
    h.tables.crew_leave_policies = { data: [{ ...policyRow, vessel_id: null, default_annual_entitlement: 20 }, policyRow], error: null };
    h.tables.profiles = { data: [{ user_id: 'u-bosun', contract_start_date: null, contract_end_date: null, employment_start_date: '2026-01-01', annual_leave_entitlement: null, leave_accrual_method: null, rotation_pattern: null }], error: null };
    h.tables.crew_leave_carryover = { data: [{ carryover_days: 2 }], error: null };
    h.tables.crew_leave_balance_adjustments = { data: [], error: null };
    const entries = h.tables.crew_leave_entries.data as Array<{ date: string; status_code: string }>;
    const expected = calculateLeaveBreakdown({
      profile: { user_id: 'u-bosun', employment_start_date: '2026-01-01' },
      policy: { ...DEFAULT_LEAVE_POLICY, defaultAnnualEntitlement: 40, monthlyAccrualDays: 3 },
      entries,
      requests: [{ start_date: '2026-12-20', end_date: '2026-12-24', status: 'pending', leave_type: 'L' }],
      carryover: 2,
      adjustments: [],
      asOf: new Date(),
      fallbackJoinDate: null,
    });
    h.tables.crew_leave_requests = { data: [{ start_date: '2026-12-20', end_date: '2026-12-24', status: 'pending', leave_type: 'L' }], error: null };
    renderCard();
    const remaining = await screen.findByText((_, el) => el?.getAttribute('data-leave-remaining') === String(expected.remaining));
    expect(remaining).toBeInTheDocument();
    expect(document.querySelector('[data-policy-source="vessel"]')).not.toBeNull();
    expect(screen.getByText(/Vessel leave policy, 3 days a month/)).toBeInTheDocument();
  });

  it('D-01: with the terms table missing, the policy applies and the card says the terms come later', async () => {
    h.employment = employmentWith(null, true);
    renderCard();
    expect(await screen.findByText(/Allowances from the employment terms apply once the crew update is applied/)).toBeInTheDocument();
    expect(document.querySelector('[data-policy-source="default"]')).not.toBeNull();
  });
});

describe('the other states', () => {
  it('a person without a login gets a sentence, and no day codes are read', async () => {
    renderCard(profile({ userId: null }));
    expect(await screen.findByText(/kept against a sign-in/)).toBeInTheDocument();
    expect(h.fromCalls).not.toContain('crew_leave_entries');
  });

  it('a failed read is an error with Retry, which reads again', async () => {
    h.tables.crew_leave_entries = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    renderCard();
    // The card's read retries once before it gives up.
    expect(await screen.findByText('The leave balance could not load', undefined, { timeout: 4000 })).toBeInTheDocument();
    const before = h.fromCalls.filter((t) => t === 'crew_leave_entries').length;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(h.fromCalls.filter((t) => t === 'crew_leave_entries').length).toBeGreaterThan(before));
  });

  it('the employment read failing is an error too', async () => {
    h.employment = { status: 'error', error: new Error('boom'), retry: vi.fn() };
    renderCard();
    expect(await screen.findByText('The leave balance could not load')).toBeInTheDocument();
  });
});
