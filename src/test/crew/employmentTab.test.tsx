/**
 * The crew profile's Employment tab (X1-11B; gap/04 C57, C58, W8):
 *
 * - the gate (hris.employee_records.contracts_employment.view): loading and
 *   denied read nothing;
 * - the sub-tabs (`?sub=details|transfers|appraisals|familiarisation`);
 * - Details: the terms on the vessel with the contract's probation and two
 *   notice periods (and the D-01 legacy notice), Edit terms and End
 *   employment by capability, the pending placement (D-225);
 * - End employment outcomes: success effect by effect as the server
 *   answered, a refusal on its field (HINT), a 42501 sentence (D-207), the
 *   form's own refusals with the server's sentences, D-01 (the RPC missing:
 *   the legacy sign-off with the notice), an unreadable answer;
 * - Edit terms: every key sent through crew_onboarding_save's terms path;
 * - Transfers (crew_transfers_for_profile: missing, ready with Open),
 *   Appraisals (gate, read-only list linking to HR) and Familiarisation.
 *
 * The client is mocked at supabase.rpc / supabase.from; the HRIS reads and
 * the profile's current employment read are replaced by fixed answers.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

type Result = { data: unknown; error: unknown };
type Query = { table: string; select: string; filters: [string, string, unknown][]; op: 'select' | 'update' | 'insert'; payload?: unknown };

const h = vi.hoisted(() => ({
  caps: {} as Record<string, 'granted' | 'denied' | 'loading'>,
  rpc: vi.fn(),
  queries: [] as Query[],
  answer: (() => ({ data: [], error: null })) as (q: Query) => Result,
  employment: { status: 'ready' } as Record<string, unknown>,
  contracts: [] as Record<string, unknown>[],
  signOff: vi.fn(),
  scope: 'vessel' as 'vessel' | 'fleet',
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), promise: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const q: Query = { table, select: '', filters: [], op: 'select' };
    h.queries.push(q);
    const chain: Record<string, unknown> = {};
    chain.select = (columns: string) => {
      q.select = columns;
      return chain;
    };
    chain.update = (payload: unknown) => {
      q.op = 'update';
      q.payload = payload;
      return chain;
    };
    chain.insert = (payload: unknown) => {
      q.op = 'insert';
      q.payload = payload;
      return chain;
    };
    for (const m of ['eq', 'in', 'order', 'limit', 'is', 'or']) {
      chain[m] = (col: string, value: unknown) => {
        q.filters.push([m, col, value]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(h.answer(q)).then(resolve);
    return chain;
  };
  return { supabase: { from, rpc: (...args: unknown[]) => h.rpc(...args) } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => {
    const status = h.caps[key] ?? 'denied';
    return { allowed: status === 'granted', status, reason: 'test' };
  },
  useCan: (key: string) => h.caps[key] === 'granted',
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-hr', email: 'hr@example.test' }, profile: { id: 'p-hr', role: 'shore_management', company_id: 'c-1' } }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (path: string) => `/v/dra/${path}` }));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () =>
    h.scope === 'vessel'
      ? { scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }
      : { scope: 'fleet', vesselCode: null, vessel: null },
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});
vi.mock('@/modules/hris', () => ({
  ContractCard: ({ contract }: { contract: { contract_number: string | null } }) => <div data-testid="contract-card">{contract.contract_number}</div>,
  Timeline: ({ events }: { events: unknown[] }) => <div data-testid="timeline">{events.length} events</div>,
  useCrewContracts: () => ({ contracts: h.contracts, isLoading: false, error: null, refetch: vi.fn() }),
  useEmploymentHistory: () => ({ timeline: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/modules/crew/hooks/useCrewProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/crew/hooks/useCrewProfile')>();
  return { ...actual, useCrewEmployment: () => h.employment };
});
vi.mock('@/modules/crew/hooks/useCrew', () => ({
  useCrew: () => ({ signOffCrew: { mutateAsync: (...args: unknown[]) => h.signOff(...args), isPending: false } }),
}));
vi.mock('@/modules/crew/hooks/useReferenceData', () => ({
  useDepartments: () => ({ status: 'ready', items: [{ key: 'interior', label: 'Interior', sort_order: 1 }] }),
}));
vi.mock('@/modules/crew/hooks/usePositions', () => ({
  usePositions: () => ({ status: 'not-set-up' }),
}));
vi.mock('@/modules/crew/hooks/useAddCrew', () => ({
  useContractTypes: () => ({ status: 'ready', items: [{ key: 'rotational', label: 'Rotational' }] }),
}));

import EmploymentTab, { EMPLOYMENT_DENIED_TITLE } from '@/modules/crew/components/profile/EmploymentTab';
import EndEmploymentDialog from '@/modules/crew/components/profile/EndEmploymentDialog';
import SignOffDialog from '@/modules/crew/components/SignOffDialog';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import { END_EMPLOYMENT_UNAVAILABLE, UNREADABLE_ANSWER } from '@/modules/crew/hooks/useEmployment';
import { CREW_CAPS } from '@/modules/crew/paths';
import { END_EMPLOYMENT_PENDING_MESSAGE, END_EMPLOYMENT_SENTENCES, addDaysTo } from '@/modules/crew/lib/employment';
import { todayDateOnly } from '@/shared/lib/form';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';

const PROFILE = 'b0000000-0000-4000-8000-000000000015';
const USER = 'a0000000-0000-4000-8000-000000000015';
const VESSEL = { id: 'v-dra', companyId: 'c-1', name: 'DRAAK' };
const TODAY = todayDateOnly();

const profile = (over: Partial<CrewProfileSummary> = {}): CrewProfileSummary =>
  ({
    profileId: PROFILE,
    userId: USER,
    firstName: 'Demo',
    lastName: 'Chief Stew',
    preferredName: null,
    displayName: 'Demo Chief Stew',
    positionName: 'Chief Stew',
    departmentLabel: 'Interior',
    isOwn: false,
    onVessel: true,
    placementKind: 'assignment',
    tabs: ['personal', 'employment'],
    source: 'server',
    ...over,
  }) as CrewProfileSummary;

const TERMS = {
  id: 't-1',
  company_id: 'c-1',
  profile_id: PROFILE,
  vessel_id: 'v-dra',
  assignment_id: 'a-1',
  position_id: 'pos-cs',
  department_key: 'interior',
  start_date: '2026-03-01',
  date_joining_vessel: '2026-03-05',
  review_date: '2026-09-01',
  contract_type_key: 'rotational',
  leave_method: 'days_per_year',
  leave_days_per_year: 30,
  leave_ratio_on: null,
  leave_ratio_off: null,
  place_of_embarkation: 'Palma',
  end_date: null,
  end_reason: null,
  end_notes: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
};

const onVessel = (over: Record<string, unknown> = {}) => ({
  status: 'ready',
  employment: {
    assignment: { id: 'a-1', vesselId: 'v-dra', position: 'Chief Stew', rank: 'Chief Stew', department: 'Interior', joinDate: '2026-03-05', startDate: '2026-03-01', leaveDate: null },
    placement: null,
    terms: TERMS,
    termsMissing: false,
    contractTypeLabels: new Map([['rotational', 'Rotational']]),
    ...over,
  },
});

const CONTRACT = {
  id: 'c-1',
  status: 'active',
  vessel_id: 'v-dra',
  contract_number: 'SEA-2026-014',
  start_date: '2026-03-01',
  end_date: null,
  probation_end_date: '2026-06-01',
  notice_period_days: 30,
  probation_months: 3,
  notice_during_probation_days: 7,
  notice_after_probation_days: 30,
};

const transferJson = (over: Record<string, unknown> = {}) => ({
  id: 'tr-1',
  status: 'completed',
  profile_id: PROFILE,
  user_id: USER,
  person: { first_name: 'Demo', last_name: 'Chief Stew' },
  from_vessel: { id: 'v-gam', name: 'GAMMA', code: 'GAM' },
  to_vessel: { id: 'v-dra', name: 'DRAAK', code: 'DRA' },
  from_position: { id: 'pos-cs', name: 'Chief Stew' },
  to_position: { id: 'pos-cs', name: 'Chief Stew' },
  same_role: true,
  sign_off_date: '2026-02-28',
  sign_on_date: '2026-03-01',
  requires_approval: false,
  review: null,
  acknowledgements: [],
  acknowledged: true,
  notes: null,
  created_at: '2026-02-10T08:00:00Z',
  created_by_name: 'Demo Master',
  completed_at: '2026-03-01T06:00:00Z',
  rights: {},
  ...over,
});

const renderTab = (url = `/v/dra/crew/people/${PROFILE}/employment`, p = profile()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <EmploymentTab profile={p} vessel={VESSEL} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeAll(() => {
  // Radix Select and Dialog in jsdom.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  h.caps = { [CREW_CAPS.employmentView]: 'granted' };
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: [], error: null });
  h.queries = [];
  h.answer = () => ({ data: [], error: null });
  h.employment = onVessel();
  h.contracts = [CONTRACT];
  h.signOff.mockReset();
  h.signOff.mockResolvedValue(undefined);
  h.scope = 'vessel';
  for (const f of Object.values(h.notify)) f.mockReset();
});

describe('the gate', () => {
  it('loading: a skeleton and no request', () => {
    h.caps = { [CREW_CAPS.employmentView]: 'loading' };
    renderTab();
    expect(screen.getByLabelText('Loading employment')).toBeInTheDocument();
    expect(h.queries).toEqual([]);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('denied: says who keeps it, and reads nothing', () => {
    h.caps = {};
    renderTab();
    expect(screen.getByRole('heading', { name: EMPLOYMENT_DENIED_TITLE })).toBeInTheDocument();
    expect(screen.queryByTestId('timeline')).toBeNull();
    expect(h.queries).toEqual([]);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('the sub-tabs', () => {
  it('opens on Details; each sub-tab is a link that keeps the other parameters', () => {
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?foo=1`);
    const nav = screen.getByRole('navigation', { name: 'Employment sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Details', 'Transfers', 'Appraisals', 'Familiarisation']);
    expect(within(nav).getByRole('link', { name: 'Details' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Transfers' }).getAttribute('href')).toContain('foo=1');
    expect(within(nav).getByRole('link', { name: 'Transfers' }).getAttribute('href')).toContain('sub=transfers');
    expect(document.querySelector('[data-employment-tab="details"]')).not.toBeNull();
  });

  it('an unknown sub-tab is Details', () => {
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?sub=nonsense`);
    expect(document.querySelector('[data-employment-tab="details"]')).not.toBeNull();
  });
});

describe('Details', () => {
  it('shows the terms with the contract’s probation and two notice periods, the contract and the timeline', () => {
    renderTab();
    const card = document.querySelector('[data-profile-card="employment-terms"]') as HTMLElement;
    expect(within(card).getByText('Employment on DRAAK')).toBeInTheDocument();
    expect(within(card).getByText('Rotational')).toBeInTheDocument();
    expect(within(card).getByText('30 days a year (2.50 a month)')).toBeInTheDocument();
    expect(within(card).getByText('Palma')).toBeInTheDocument();
    expect(card.querySelector('[data-fact="probation"] dd')).toHaveTextContent('3 months');
    expect(card.querySelector('[data-fact="notice-during"] dd')).toHaveTextContent('7 days');
    expect(card.querySelector('[data-fact="notice-after"] dd')).toHaveTextContent('30 days');
    expect(screen.getByTestId('contract-card')).toHaveTextContent('SEA-2026-014');
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
  });

  it('D-01: without the 061100 columns the one legacy notice stands in, and says so', () => {
    const { probation_months: _p, notice_during_probation_days: _d, notice_after_probation_days: _a, ...legacy } = CONTRACT;
    h.contracts = [legacy];
    renderTab();
    const card = document.querySelector('[data-profile-card="employment-terms"]') as HTMLElement;
    expect(card.querySelector('[data-fact="notice-after"] dd')).toHaveTextContent('30 days');
    expect(card.querySelector('[data-fact="notice-during"] dd')).toHaveTextContent('Not recorded');
    expect(card.querySelector('[data-employment-contract="legacy"]')).not.toBeNull();
  });

  it('without an active contract it says where the periods live', () => {
    h.contracts = [];
    renderTab();
    expect(document.querySelector('[data-employment-contract="none"]')).not.toBeNull();
    expect(screen.getByText('No contract on record')).toBeInTheDocument();
  });

  it('Edit terms and End employment show by capability; neither for an HR viewer', () => {
    renderTab();
    expect(screen.queryByRole('button', { name: /edit terms/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /end employment/i })).toBeNull();
  });

  it('a terms writer gets Edit terms; an employment editor gets End employment', () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted', [CREW_CAPS.employmentEdit]: 'granted' };
    renderTab();
    expect(screen.getByRole('button', { name: /edit terms/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end employment/i })).toBeInTheDocument();
  });

  it('D-01: with the terms table missing, Edit terms is unavailable with the reason', () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted' };
    h.employment = onVessel({ terms: null, termsMissing: true });
    renderTab();
    expect(screen.getByRole('button', { name: /edit terms/i })).toHaveAttribute('aria-disabled', 'true');
    expect(document.querySelector('[data-employment-terms="not-set-up"]')).not.toBeNull();
  });

  it('someone not on this vessel’s crew: no actions, and says so', () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted', [CREW_CAPS.employmentEdit]: 'granted' };
    h.employment = onVessel({ assignment: null, terms: null });
    renderTab();
    expect(screen.getByText(/Not on DRAAK’s crew at the moment/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /end employment/i })).toBeNull();
  });

  it('a pending placement (D-225): the sentence, and End employment refuses before anything is sent', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.employmentEdit]: 'granted' };
    h.employment = onVessel({ assignment: null, placement: { vesselId: 'v-dra', position: 'Deckhand', joinDate: '2026-12-01' } });
    renderTab();
    expect(screen.getAllByText(END_EMPLOYMENT_PENDING_MESSAGE).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /end employment/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(END_EMPLOYMENT_PENDING_MESSAGE)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'End employment' })).toBeNull();
    expect(h.rpc).not.toHaveBeenCalledWith('crew_end_employment', expect.anything());
  });
});

// ---------------------------------------------------------------- End employment outcomes

const renderEnd = (renderFallback = (notice: string) => <div data-testid="legacy">{notice}</div>) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EndEmploymentDialog
          open
          onOpenChange={() => undefined}
          vessel={VESSEL}
          // Relative to today: the form checks the end date against a ±365-day window from the real today.
          person={{ profileId: PROFILE, displayName: 'Demo Chief Stew', joinDate: addDaysTo(TODAY, -30) }}
          renderFallback={renderFallback}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const chooseReason = async (label: string) => {
  fireEvent.click(screen.getByRole('combobox', { name: 'Reason' }));
  fireEvent.click(await screen.findByRole('option', { name: label }));
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'End employment' }));

const endAnswer = (over: Record<string, unknown> = {}) => ({
  assignment_id: 'a-1',
  end_date: TODAY,
  reason: 'resignation',
  terms_ended: 1,
  contract: { id: 'c-1', status: 'terminated' },
  periods_removed: 2,
  periods_trimmed: 0,
  final_hor_month: { year: Number(TODAY.slice(0, 4)), month: Number(TODAY.slice(5, 7)), submission_status: 'draft' },
  ...over,
});

describe('End employment', () => {
  it('sends crew_end_employment and shows each effect as the server answered it', async () => {
    h.rpc.mockResolvedValue({ data: endAnswer(), error: null });
    renderEnd();
    await chooseReason('Resignation');
    expect(screen.getByText('The active contract is marked terminated with this reason.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: '  Moving ashore  ' } });
    submit();
    await waitFor(() => expect(document.querySelector('[data-end-employment="done"]')).not.toBeNull());
    expect(h.rpc).toHaveBeenCalledWith('crew_end_employment', {
      p_profile_id: PROFILE,
      p_vessel_id: 'v-dra',
      p_end_date: TODAY,
      p_reason: 'resignation',
      p_notes: 'Moving ashore',
    });
    const outcome = document.querySelector('[data-end-employment-outcome]') as HTMLElement;
    expect(outcome).toHaveTextContent('Demo Chief Stew leaves DRAAK on');
    expect(outcome).toHaveTextContent('The active contract is marked terminated.');
    expect(outcome).toHaveTextContent('2 planner periods after that day were removed.');
    expect(outcome).toHaveTextContent('not submitted yet');
    expect(outcome).toHaveTextContent('Fleet HR is told in STORM.');
  });

  it('refuses in the form first, with the server’s sentences, and sends nothing', async () => {
    renderEnd();
    submit();
    expect(await screen.findByText(END_EMPLOYMENT_SENTENCES.reason)).toBeInTheDocument();
    await chooseReason('Other');
    submit();
    expect(await screen.findByText(END_EMPLOYMENT_SENTENCES.notesRequired)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Last day of employment'), { target: { value: addDaysTo(TODAY, -31) } });
    submit();
    expect(await screen.findByText(END_EMPLOYMENT_SENTENCES.beforeJoin)).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('a 22023 refusal naming a field lands on it; one naming none shows above the buttons', async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'end_date_out_of_range', details: 'Choose an end date within a year of today.', hint: 'end_date' } });
    renderEnd();
    await chooseReason('Contract end');
    submit();
    expect(await screen.findByText('Choose an end date within a year of today.')).toBeInTheDocument();
    expect(screen.getByLabelText('Last day of employment')).toHaveAttribute('aria-invalid', 'true');

    h.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'transfer_open', details: 'Cancel the open transfer of this person first.' } });
    submit();
    const alert = await screen.findByText('Cancel the open transfer of this person first.');
    expect(alert.closest('[data-end-employment-error]')).not.toBeNull();
    expect(document.querySelector('[data-end-employment="form"]')).not.toBeNull();
  });

  it('a 42501 shows the STORM sentence as is (D-207), never a code', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'out_of_reach', details: 'You can only do this for people on the vessels you administer.' } });
    renderEnd();
    await chooseReason('Dismissal');
    submit();
    expect(await screen.findByText('You can only do this for people on the vessels you administer.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('out_of_reach');
  });

  it('D-01: the RPC missing shows the legacy sign-off with the notice, carrying the entries', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_end_employment' } });
    const fallback = vi.fn((notice: string) => <div data-testid="legacy">{notice}</div>);
    renderEnd(fallback);
    await chooseReason('Dismissal');
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: 'Gross misconduct' } });
    submit();
    expect(await screen.findByTestId('legacy')).toHaveTextContent(END_EMPLOYMENT_UNAVAILABLE);
    expect(fallback).toHaveBeenLastCalledWith(END_EMPLOYMENT_UNAVAILABLE, { endDate: TODAY, reason: 'dismissal', notes: 'Gross misconduct' });
  });

  it('an answer it cannot read is an error, never a success', async () => {
    h.rpc.mockResolvedValue({ data: { assignment_id: 'a-1' }, error: null });
    renderEnd();
    await chooseReason('Retirement');
    submit();
    expect(await screen.findByText(UNREADABLE_ANSWER)).toBeInTheDocument();
    expect(document.querySelector('[data-end-employment="done"]')).toBeNull();
  });

  it('through the tab: the legacy sign-off ends the assignment while the RPC is missing', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.employmentEdit]: 'granted' };
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_end_employment' } });
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /end employment/i }));
    await screen.findByRole('dialog');
    await chooseReason('Contract end');
    submit();
    expect(await screen.findByText(END_EMPLOYMENT_UNAVAILABLE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign off' }));
    await waitFor(() => expect(h.signOff).toHaveBeenCalledTimes(1));
    expect(h.signOff.mock.calls[0][0]).toMatchObject({ assignmentId: 'a-1', reason: 'contract_end' });
  });
});

describe('Edit terms', () => {
  it('saves every key through crew_onboarding_save’s terms path, and the contract’s periods on the contract', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted', [CREW_CAPS.employmentEdit]: 'granted' };
    h.rpc.mockImplementation(async (fn: string, args: { p_terms: { start_date: string } }) =>
      fn === 'crew_onboarding_save' ? { data: { ...TERMS, start_date: args.p_terms.start_date }, error: null } : { data: [], error: null },
    );
    h.answer = (q) => {
      if (q.table === 'crew_contracts' && q.op === 'update') return { data: [{ id: 'c-1' }], error: null };
      return { data: [], error: null };
    };
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /edit terms/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Review date'), { target: { value: '2026-10-01' } });
    fireEvent.change(within(dialog).getByLabelText('Notice after probation (days)'), { target: { value: '60' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Employment terms and contract saved'));
    expect(h.rpc).toHaveBeenCalledWith('crew_onboarding_save', {
      p_profile_id: PROFILE,
      p_vessel_id: 'v-dra',
      p_terms: {
        start_date: '2026-03-01',
        department_key: 'interior',
        date_joining_vessel: '2026-03-05',
        review_date: '2026-10-01',
        contract_type_key: 'rotational',
        place_of_embarkation: 'Palma',
        leave_method: 'days_per_year',
        leave_days_per_year: 30,
      },
    });
    // The contract's periods, with the legacy readers' columns kept in step, checked by the rows it changed.
    const update = h.queries.find((q) => q.table === 'crew_contracts' && q.op === 'update');
    expect(update?.payload).toEqual({
      probation_months: 3,
      notice_during_probation_days: 7,
      notice_after_probation_days: 60,
      notice_period_days: 60,
      probation_end_date: '2026-06-01',
      updated_by: 'u-hr',
    });
    expect(update?.filters).toContainEqual(['eq', 'id', 'c-1']);
    expect(h.queries.find((q) => q.table === 'audit_logs' && q.op === 'insert')?.payload).toMatchObject({ entity_type: 'crew_contract', entity_id: 'c-1' });
  });

  it('a contract part refused after the terms saved reads Partly saved and keeps the dialog open', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted', [CREW_CAPS.employmentEdit]: 'granted' };
    h.rpc.mockImplementation(async (fn: string, args: { p_terms: { start_date: string } }) =>
      fn === 'crew_onboarding_save' ? { data: { ...TERMS, start_date: args.p_terms.start_date }, error: null } : { data: [], error: null },
    );
    h.answer = () => ({ data: [], error: null }); // the contract update changes no row
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /edit terms/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Review date'), { target: { value: '2026-10-01' } });
    fireEvent.change(within(dialog).getByLabelText('Probation (months)'), { target: { value: '6' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Partly saved')).toBeInTheDocument();
    expect(within(dialog).getByText(/The employment terms were saved\. The probation and notice periods were not saved/)).toBeInTheDocument();
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('a refusal naming a field lands on it, and nothing reads as saved', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted' };
    h.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'field_invalid', details: 'The review date cannot be before the start date.', hint: 'review_date' } });
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /edit terms/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Place of embarkation'), { target: { value: 'Antibes' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('The review date cannot be before the start date.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Review date')).toHaveAttribute('aria-invalid', 'true');
    expect(h.notify.success).not.toHaveBeenCalled();
    // Without HR edit the contract's periods are read-only.
    expect(within(dialog).getByLabelText('Probation (months)')).toBeDisabled();
  });
});

// ---------------------------------------------------------------- the other sub-tabs

describe('Transfers', () => {
  it('lists the person’s transfers; Open sets ?transfer=', async () => {
    h.rpc.mockImplementation(async (fn: string) => (fn === 'crew_transfers_for_profile' ? { data: [transferJson()], error: null } : { data: null, error: null }));
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?sub=transfers`);
    const row = await screen.findByText('GAMMA');
    const li = row.closest('[data-transfer-row]') as HTMLElement;
    expect(within(li).getByText('DRAAK')).toBeInTheDocument();
    expect(within(li).getByText('Completed')).toBeInTheDocument();
    expect(within(li).getByText('Same position: Chief Stew')).toBeInTheDocument();
    expect(within(li).getByRole('link', { name: 'Open the transfer to DRAAK' }).getAttribute('href')).toContain('transfer=tr-1');
    expect(h.rpc).toHaveBeenCalledWith('crew_transfers_for_profile', { p_profile_id: PROFILE });
  });

  it('D-01: the RPC missing says transfers are not set up, never "no transfers"', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_transfers_for_profile' } });
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?sub=transfers`);
    expect(await screen.findByText('Transfers are not set up yet')).toBeInTheDocument();
    expect(screen.queryByText('No transfers')).toBeNull();
  });

  it('another error is an error with Try again', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?sub=transfers`);
    expect(await screen.findByText('The transfers could not load', undefined, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe('Appraisals', () => {
  it('without the appraisal key: says who sees them, and reads nothing', () => {
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?sub=appraisals`);
    expect(screen.getByText('Appraisals are not shown to you')).toBeInTheDocument();
    expect(h.queries.filter((q) => q.table === 'performance_reviews')).toEqual([]);
  });

  it('lists the person’s appraisals read-only, each opening in HR', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.appraisalsView]: 'granted' };
    h.answer = (q) =>
      q.table === 'performance_reviews'
        ? {
            data: [
              { id: 'r-1', review_type: 'end_of_rotation', status: 'completed', period_start: '2026-03-01', period_end: '2026-06-01', due_date: null, completed_at: '2026-06-03T10:00:00Z', overall_rating: 4.2, vessel_id: 'v-dra', created_at: '2026-06-01T00:00:00Z' },
            ],
            error: null,
          }
        : { data: [], error: null };
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?sub=appraisals`);
    const row = (await screen.findByText('End of rotation')).closest('[data-appraisal-row]') as HTMLElement;
    expect(within(row).getByText('Completed')).toBeInTheDocument();
    expect(within(row).getByText('Overall rating 4.2')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /open in hr/i }).getAttribute('href')).toBe(`/hris/performance/end-of-rotation?crew=${PROFILE}&review=r-1`);
    const q = h.queries.find((x) => x.table === 'performance_reviews');
    expect(q?.filters).toContainEqual(['eq', 'profile_id', PROFILE]);
    expect(q?.select).not.toContain('ratings');
    expect(q?.select).not.toContain('comments');
  });
});

describe('Familiarisation', () => {
  it('lists the person’s forms on every vessel; Open only for this vessel’s', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.famView]: 'granted' };
    h.answer = (q) =>
      q.table === 'familiarization_records'
        ? {
            data: [
              { id: 'f-1', vessel_id: 'v-dra', status: 'in_progress', join_date: '2026-03-05', target_completion_date: '2099-03-19', due_date: '2099-03-19', completion_percentage: 40, actual_completion_date: null, crew_signed_at: null, supervisor_signed_at: null, familiarization_templates: { name: '24-hour safety' }, vessels: { name: 'DRAAK' } },
              { id: 'f-2', vessel_id: 'v-gam', status: 'completed', join_date: '2025-01-05', target_completion_date: '2025-01-19', due_date: null, completion_percentage: 100, actual_completion_date: '2025-01-15', crew_signed_at: '2025-01-15T00:00:00Z', supervisor_signed_at: '2025-01-15T00:00:00Z', familiarization_templates: { name: 'Two-week vessel familiarisation' }, vessels: { name: 'GAMMA' } },
            ],
            error: null,
          }
        : { data: [], error: null };
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?sub=familiarisation`);
    const here = (await screen.findByText('24-hour safety')).closest('[data-fam-row]') as HTMLElement;
    expect(within(here).getByText('In progress')).toBeInTheDocument();
    expect(within(here).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/v/dra/crew/familiarisation/f-1');
    const there = screen.getByText('Two-week vessel familiarisation').closest('[data-fam-row]') as HTMLElement;
    expect(within(there).queryByRole('link', { name: 'Open' })).toBeNull();
    expect(within(there).getByText(/crew signed · supervisor signed/)).toBeInTheDocument();
    expect(h.queries.find((x) => x.table === 'familiarization_records')?.filters).toContainEqual(['eq', 'profile_id', PROFILE]);
  });

  it('D-01: without the profile column, the legacy forms of their login', async () => {
    let n = 0;
    h.answer = (q) => {
      if (q.table !== 'familiarization_records') return { data: [], error: null };
      n += 1;
      return n === 1 ? { data: null, error: { code: '42703', message: 'column familiarization_records.profile_id does not exist' } } : { data: [], error: null };
    };
    renderTab(`/v/dra/crew/people/${PROFILE}/employment?sub=familiarisation`);
    await waitFor(() => expect(h.queries.filter((q) => q.table === 'familiarization_records')).toHaveLength(2));
    expect(h.queries.filter((q) => q.table === 'familiarization_records')[1].filters).toContainEqual(['eq', 'user_id', USER]);
    expect(await screen.findByText('Familiarisation forms are not shown to you')).toBeInTheDocument();
  });
});

describe('Sign off from the crew list (SignOffDialog keeps its props)', () => {
  const member = {
    id: PROFILE,
    user_id: USER,
    first_name: 'Demo',
    last_name: 'Chief Stew',
    current_assignment: { id: 'a-1', vessel_id: 'v-dra', vessel_name: 'DRAAK', position: 'Chief Stew', join_date: '2026-03-05' },
  } as unknown as CrewMember;
  const renderSignOff = (onConfirm = vi.fn().mockResolvedValue(undefined)) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SignOffDialog isOpen onClose={() => undefined} crewMember={member} onConfirm={onConfirm} isLoading={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return onConfirm;
  };

  it('on a vessel it is End employment (crew_end_employment)', async () => {
    h.rpc.mockResolvedValue({ data: endAnswer({ reason: 'contract_end', contract: { id: 'c-1', status: 'expired' } }), error: null });
    const onConfirm = renderSignOff();
    expect(await screen.findByRole('heading', { name: 'End employment' })).toBeInTheDocument();
    await chooseReason('Contract end');
    submit();
    await waitFor(() => expect(document.querySelector('[data-end-employment="done"]')).not.toBeNull());
    expect(h.rpc).toHaveBeenCalledWith('crew_end_employment', expect.objectContaining({ p_profile_id: PROFILE, p_vessel_id: 'v-dra', p_reason: 'contract_end' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('D-01 on a vessel: the legacy sign-off with the notice, through the list’s own writer', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_end_employment' } });
    const onConfirm = renderSignOff();
    await screen.findByRole('heading', { name: 'End employment' });
    await chooseReason('Resignation');
    submit();
    expect(await screen.findByText(END_EMPLOYMENT_UNAVAILABLE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign off' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: 'a-1', reason: 'resignation' })));
  });

  it('outside a vessel it is the legacy sign-off, without the notice', () => {
    h.scope = 'fleet';
    renderSignOff();
    expect(screen.getByRole('heading', { name: 'Sign off crew member' })).toBeInTheDocument();
    expect(document.querySelector('[data-sign-off-fallback]')).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
