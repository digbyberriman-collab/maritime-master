/**
 * The vessel crew dashboard (X1-10B; gap/04 C2, C18; D-01) at /v/:vc/crew,
 * and the profile's Onboarding card:
 *
 * - the gate: loading reads nothing and shows nothing; denied is
 *   AccessDenied and reads nothing; a 42501 from the server is AccessDenied;
 * - not applied (the RPCs are missing): every tile says it turns on with the
 *   crew update (never 0) and every card says so; the page never blanks;
 * - any other error: each tile's error with Try again, which asks again;
 * - ready: the five tiles with their numbers and links, Action required,
 *   the cards' people; a hidden source hides its tile and card, a malformed
 *   section is that tile's error only, hours of rest off says so;
 * - a tile's anchor link moves to its card;
 * - the Onboarding card: read only for crew list viewers or the person,
 *   never for someone not on the vessel's crew; the eight checks with
 *   their fixes (the signature only for the person), the answer kept to the
 *   person asked for, not applied / error / refused / no row states;
 * - at 390 px nothing is wider than a phone.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

type Cap = 'granted' | 'denied' | 'loading';

const h = vi.hoisted(() => ({
  gate: 'granted' as 'granted' | 'denied' | 'loading',
  caps: {} as Record<string, boolean>,
  rpc: vi.fn(),
  vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } as { id: string; company_id: string; name: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from: () => ({}), storage: { from: () => ({}) } },
}));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => {
    if (h.gate === 'loading') return { allowed: false, status: 'loading', reason: 'test' };
    const allowed = h.gate === 'granted';
    return { allowed, status: allowed ? 'granted' : 'denied', reason: 'test' };
  },
  useCan: (key: string) => h.caps[key] ?? false,
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => (h.vessel ? { scope: 'vessel', vesselCode: 'DRA', vessel: h.vessel } : { scope: 'fleet' }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));

import CrewDashboardPage from '@/modules/crew/pages/CrewDashboardPage';
import { OnboardingProgressCard } from '@/modules/crew/components/profile/OnboardingProgressCard';
import { CREW_CAPS } from '@/modules/crew/paths';
import { NOT_SET_UP_REASON } from '@/modules/crew/lib/dashboardModel';
import { ONBOARDING_NOT_SET_UP_NOTICE } from '@/modules/crew/hooks/useOnboardingProgress';
import { ONBOARDING_CHECK_KEYS } from '@/modules/crew/lib/onboarding';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';

const ALL_CAPS: Cap = 'granted';
const grantAll = () => {
  h.caps = {
    [CREW_CAPS.crewListView]: true,
    [CREW_CAPS.complianceView]: true,
    [CREW_CAPS.documentsView]: true,
    [CREW_CAPS.horView]: true,
    [CREW_CAPS.horApprove]: true,
    [CREW_CAPS.famView]: true,
    [CREW_CAPS.profilesView]: true,
    [CREW_CAPS.profilesCreate]: true,
    [CREW_CAPS.profilesViewOwn]: true,
  };
};

const DASHBOARD = (over: Record<string, unknown> = {}) => ({
  vessel_id: 'v-dra',
  today: '2026-11-27',
  crewing: { allowed: true, total: 13, on_board: 8, on_leave: 1, pending: 2, on_transfer: 1, ashore: 1 },
  compliance: { allowed: true, total: 13, complete: 8, expiring: 2, missing: 2, expired: 1 },
  onboarding: {
    allowed: true,
    joiners: 3,
    open: 2,
    people: [
      { profile_id: 'p36', first_name: 'Demo', last_name: 'Purser', position_name: 'Purser', placement_kind: 'assignment', join_date: '2026-11-07', percent: 71, passed: 5, known: 7, fam_required: 2, fam_completed: 1, familiarisation: [{ record_id: 'f2', status: 'in_progress', overdue: true }] },
    ],
  },
  documents: {
    allowed: true,
    expired: 2,
    expiring: 3,
    people: [
      { profile_id: 'p13', first_name: 'Demo', last_name: 'Chief Engineer', expired: 1, expiring: 1, next_expiry: '2026-11-03' },
      { profile_id: 'p15', first_name: 'Demo', last_name: 'Chief Stew', expired: 1, expiring: 2, next_expiry: '2026-11-20' },
    ],
  },
  hours_of_rest: {
    allowed: true,
    enabled: true,
    open_breaches: 3,
    unsubmitted: 1,
    month: '2026-10',
    people: [
      { profile_id: 'p14', first_name: 'Demo', last_name: 'Bosun', open_breaches: 3, unsubmitted: false },
      { profile_id: 'p12', first_name: 'Demo', last_name: 'Chief Officer', open_breaches: 0, unsubmitted: true },
    ],
  },
  ...over,
});

const checks = (states: string[]) =>
  ONBOARDING_CHECK_KEYS.map((key, i) =>
    key === 'signature' && states[i] === 'unknown'
      ? { key, state: 'unknown', detail: 'not_set_up' }
      : key === 'stcw_basic'
        ? { key, state: states[i], detail: '3 of 4' }
        : { key, state: states[i] },
  );

const JOINER = (over: Record<string, unknown> = {}) => ({
  profile_id: 'p36',
  user_id: 'u36',
  first_name: 'Demo',
  last_name: 'Purser',
  preferred_name: null,
  avatar_url: null,
  position_name: 'Purser',
  department_key: 'purser_office',
  placement_kind: 'assignment',
  join_date: '2026-11-07',
  checks: checks(['pass', 'unknown', 'pass', 'fail', 'pass', 'fail', 'fail', 'pass']),
  passed: 4,
  known: 7,
  percent: 57,
  fam_required: 2,
  fam_completed: 1,
  familiarisation: [
    { record_id: 'f1', template_id: 't1', template_name: 'Arrival safety (24 hours)', status: 'completed', due_date: '2026-11-08', overdue: false },
    { record_id: 'f2', template_id: 't2', template_name: 'Purser office handover', status: 'in_progress', due_date: '2026-11-21', overdue: true },
  ],
  is_open: true,
  ...over,
});

const ALL_PASS = ONBOARDING_CHECK_KEYS.map(() => 'pass');

type RpcAnswer = { data: unknown; error: unknown };
let answers: Record<string, (args: Record<string, unknown>) => RpcAnswer>;
const missing = (fn: string): RpcAnswer => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });
const calls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args as Record<string, unknown>);

let qc: QueryClient;

function renderPage(initial = '/v/dra/crew') {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/v/:vesselCode/crew" element={<CrewDashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tileByLabel = (label: string): HTMLElement => {
  const el = Array.from(document.querySelectorAll<HTMLElement>('[data-crew-dashboard-tiles] > [data-state]')).find((t) => t.textContent?.startsWith(label));
  if (!el) throw new Error(`no tile ${label}`);
  return el;
};
const shownTiles = () => Array.from(document.querySelectorAll<HTMLElement>('[data-crew-dashboard-tiles] > [data-state]'));

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  h.gate = ALL_CAPS;
  grantAll();
  h.vessel = { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' };
  h.rpc.mockReset();
  answers = {
    crew_vessel_dashboard: () => ({ data: DASHBOARD(), error: null }),
    crew_onboarding_progress: () => ({
      data: [JOINER(), JOINER({ profile_id: 'p34', first_name: 'Demo', last_name: 'Junior Stew', checks: checks(ALL_PASS), fam_required: 0, fam_completed: 0, familiarisation: [], is_open: false })],
      error: null,
    }),
  };
  h.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => Promise.resolve(answers[fn] ? answers[fn](args) : missing(fn)));
  qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
});

describe('the gate', () => {
  it('while access loads: reads nothing, shows only the loading state', () => {
    h.gate = 'loading';
    renderPage();
    expect(screen.getByText('Checking your access')).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(document.querySelector('[data-crew-dashboard]')).toBeNull();
  });

  it('denied: AccessDenied, nothing read', () => {
    h.gate = 'denied';
    renderPage();
    expect(screen.getByText("You can't see this vessel's crew")).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('outside a vessel: asks to choose one, nothing read', () => {
    h.vessel = null;
    renderPage();
    expect(screen.getByText('Choose a vessel')).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('the server refuses (42501): AccessDenied', async () => {
    answers.crew_vessel_dashboard = () => ({ data: null, error: { code: '42501', message: 'crew_not_permitted', details: 'The crew dashboard needs crew list access on this vessel.' } });
    renderPage();
    expect(await screen.findByText("You can't see this vessel's crew")).toBeInTheDocument();
    expect(calls('crew_vessel_dashboard')).toHaveLength(1);
  });
});

describe('not applied yet (D-01)', () => {
  it('every tile says it turns on with the crew update, never 0; every card says so; the page is there', async () => {
    answers = {};
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="not_set_up"]')).not.toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Crew dashboard' })).toBeInTheDocument();
    const tiles = shownTiles();
    expect(tiles.map((t) => t.getAttribute('data-state'))).toEqual(['not-enabled', 'not-enabled', 'not-enabled', 'not-enabled', 'not-enabled']);
    for (const t of tiles) {
      expect(t).toHaveTextContent(NOT_SET_UP_REASON);
      expect(within(t).queryByText('0')).toBeNull();
      expect(t.tagName).not.toBe('A');
    }
    await waitFor(() => expect(document.querySelector('[data-dashboard-card="onboarding"] [data-card-note="not-set-up"]')).not.toBeNull());
    expect(screen.getByText(ONBOARDING_NOT_SET_UP_NOTICE)).toBeInTheDocument();
    expect(document.querySelector('[data-dashboard-card="hours-of-rest"] [data-card-note="not-set-up"]')).not.toBeNull();
    expect(document.querySelector('[data-dashboard-card="documents"] [data-card-note="not-set-up"]')).not.toBeNull();
    expect(document.querySelector('[data-action-required]')).toBeNull();
    // Missing is final: no retry of the call.
    expect(calls('crew_vessel_dashboard')).toHaveLength(1);
  });

  it('a tile the viewer could not see stays hidden even before the answer', async () => {
    answers = {};
    h.caps[CREW_CAPS.complianceView] = false;
    h.caps[CREW_CAPS.horView] = false;
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="not_set_up"]')).not.toBeNull());
    expect(shownTiles().map((t) => t.textContent?.split(/[^A-Za-z ]/)[0])).toEqual(['Crewing', 'Onboarding', 'Documents']);
    expect(document.querySelector('[data-dashboard-card="hours-of-rest"]')).toBeNull();
  });
});

describe('any other error', () => {
  it('each tile shows its error with Try again, which asks again', async () => {
    let n = 0;
    answers.crew_vessel_dashboard = () => {
      n++;
      return n <= 2 ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: DASHBOARD(), error: null };
    };
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="error"]')).not.toBeNull());
    const tiles = shownTiles();
    expect(tiles).toHaveLength(5);
    for (const t of tiles) {
      expect(t.getAttribute('data-state')).toBe('error');
      expect(within(t).getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    }
    // One automatic retry, then the error.
    expect(calls('crew_vessel_dashboard')).toHaveLength(2);
    fireEvent.click(within(tileByLabel('Documents')).getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="ready"]')).not.toBeNull());
    expect(tileByLabel('Documents').getAttribute('data-state')).toBe('ready');
  });

  it('an answer that is not the contract is an error, not a guess', async () => {
    answers.crew_vessel_dashboard = () => ({ data: { tiles: [] }, error: null });
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="error"]')).not.toBeNull());
    expect(shownTiles().every((t) => t.getAttribute('data-state') === 'error')).toBe(true);
    expect(calls('crew_vessel_dashboard')).toHaveLength(1);
  });
});

describe('ready', () => {
  it('shows the five tiles, each number linking to its list', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="ready"]')).not.toBeNull());
    expect(calls('crew_vessel_dashboard')).toEqual([{ p_vessel_id: 'v-dra' }]);
    const crewing = tileByLabel('Crewing');
    expect(crewing).toHaveTextContent('8');
    expect(crewing).toHaveTextContent('/ 13');
    expect(crewing).toHaveTextContent('2 pending · 1 on leave · 1 on transfer · 1 ashore');
    expect(crewing).toHaveAttribute('href', '/v/dra/crew/list?status=on_board');
    expect(tileByLabel('Compliance')).toHaveAttribute('href', '/v/dra/crew/compliance/status?status=expired');
    expect(tileByLabel('Compliance')).toHaveAttribute('data-tone', 'danger');
    expect(tileByLabel('Onboarding')).toHaveAttribute('href', '/v/dra/crew#crew-dashboard-onboarding');
    expect(tileByLabel('Onboarding')).toHaveTextContent('of 3 recent joiners · 1 familiarisation overdue');
    expect(tileByLabel('Documents')).toHaveAttribute('href', '/v/dra/crew/compliance/status?view=documents&status=expired');
    expect(tileByLabel('Documents')).toHaveTextContent('2 expired · 3 expiring');
    expect(tileByLabel('Hours of rest')).toHaveAttribute('href', '/v/dra/crew/hours-of-rest/report?year=2026');
    expect(tileByLabel('Hours of rest')).toHaveTextContent('3 open breaches · 1 unsubmitted for Oct');
  });

  it('lists the actions required, most urgent first, each a link', async () => {
    renderPage();
    const region = await screen.findByRole('region', { name: 'Action required' });
    const links = within(region).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      '2 documents expired',
      '2 crew members missing something their position requires',
      '3 hours-of-rest breaches to review',
      '1 familiarisation overdue',
      '1 crew member yet to submit October 2026',
      '3 documents expiring soon',
    ]);
    expect(links[4]).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-10&queue=waiting');
  });

  it('says nothing needs action only when every source answered calmly', async () => {
    answers.crew_vessel_dashboard = () => ({
      data: DASHBOARD({
        compliance: { allowed: true, total: 3, complete: 3, expiring: 0, missing: 0, expired: 0 },
        documents: { allowed: true, expired: 0, expiring: 0, people: [] },
        onboarding: { allowed: true, joiners: 0, open: 0, people: [] },
        hours_of_rest: { allowed: true, enabled: true, open_breaches: 0, unsubmitted: 0, month: '2026-10', people: [] },
      }),
      error: null,
    });
    answers.crew_onboarding_progress = () => ({ data: [], error: null });
    renderPage();
    expect(await screen.findByText('Nothing needs action on DRAAK’s crew today.')).toBeInTheDocument();
    expect(tileByLabel('Documents').getAttribute('data-state')).toBe('zero');
    expect(tileByLabel('Documents')).toHaveTextContent('Nothing expired or expiring');
    expect(tileByLabel('Hours of rest')).toHaveTextContent('No open breaches · Oct submitted');
    expect(await screen.findByText('No one joined DRAAK in the last 90 days, and no one is due to join.')).toBeInTheDocument();
    expect(screen.getByText('No crew document has expired or is due.')).toBeInTheDocument();
    expect(screen.getByText('No open breaches, and everyone has submitted October 2026.')).toBeInTheDocument();
  });

  it('hides a source the server does not answer for the viewer, and its card', async () => {
    answers.crew_vessel_dashboard = () => ({ data: DASHBOARD({ documents: { allowed: false }, hours_of_rest: { allowed: false } }), error: null });
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="ready"]')).not.toBeNull());
    expect(shownTiles()).toHaveLength(3);
    expect(document.querySelector('[data-dashboard-card="documents"]')).toBeNull();
    expect(document.querySelector('[data-dashboard-card="hours-of-rest"]')).toBeNull();
    expect(screen.queryByText(/Nothing needs action/)).toBeNull();
  });

  it('a malformed section is that tile\'s error only; hours of rest switched off says so', async () => {
    answers.crew_vessel_dashboard = () => ({ data: DASHBOARD({ compliance: { allowed: true, total: 'many' }, hours_of_rest: { allowed: true, enabled: false } }), error: null });
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="ready"]')).not.toBeNull());
    expect(tileByLabel('Compliance').getAttribute('data-state')).toBe('error');
    expect(tileByLabel('Compliance')).toHaveTextContent('This figure could not be read');
    expect(tileByLabel('Crewing').getAttribute('data-state')).toBe('ready');
    expect(tileByLabel('Hours of rest').getAttribute('data-state')).toBe('not-enabled');
    expect(tileByLabel('Hours of rest')).toHaveTextContent('Hours of rest is off on this vessel');
    expect(screen.getByText('Hours of rest is off on this vessel.')).toBeInTheDocument();
    // The documents report needs the compliance view the server could not give: the tile opens the card instead.
    expect(tileByLabel('Documents')).toHaveAttribute('href', '/v/dra/crew#crew-dashboard-documents');
    expect(within(screen.getByRole('region', { name: 'Documents & certificates' })).queryByRole('link', { name: /Full report/ })).toBeNull();
  });

  it('the cards list the people behind the numbers, with links the viewer may open', async () => {
    renderPage();
    const onboarding = await screen.findByRole('region', { name: 'Onboarding' });
    await within(onboarding).findByText('Demo Purser');
    expect(within(onboarding).getByRole('link', { name: 'Demo Purser' })).toHaveAttribute('href', '/v/dra/crew/people/p36/personal');
    expect(onboarding).toHaveTextContent('Purser · Joined 7 Nov 2026');
    expect(onboarding).toHaveTextContent('To do: Contact, Medical fitness and 1 more');
    expect(onboarding).toHaveTextContent('1 of 2 required familiarisations completed');
    expect(within(onboarding).getByRole('link', { name: 'Purser office handover' })).toHaveAttribute('href', '/v/dra/crew/familiarisation/f2');
    expect(within(onboarding).getByText('Overdue')).toBeInTheDocument();
    expect(onboarding).toHaveTextContent('1 more recent joiner is fully onboarded.');
    expect(calls('crew_onboarding_progress')).toEqual([{ p_vessel_id: 'v-dra', p_profile_id: null, p_days: 90 }]);

    const docs = screen.getByRole('region', { name: 'Documents & certificates' });
    expect(within(docs).getByRole('link', { name: 'Demo Chief Engineer' })).toHaveAttribute('href', '/v/dra/crew/people/p13/documents');
    expect(docs).toHaveTextContent('Expired 3 Nov 2026');
    expect(within(docs).getByRole('link', { name: /Full report/ })).toHaveAttribute('href', '/v/dra/crew/compliance/status?view=documents');

    const hor = screen.getByRole('region', { name: 'Hours of rest' });
    expect(within(hor).getByRole('link', { name: 'Demo Bosun' })).toHaveAttribute('href', '/v/dra/crew/people/p14/hours-of-rest?month=2026-10');
    expect(hor).toHaveTextContent('3 open breaches');
    expect(hor).toHaveTextContent('Not submitted');
    expect(within(hor).getByRole('link', { name: /Open the board/ })).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-10');
  });

  it('without profile, board or familiarisation access: names are text and those links go', async () => {
    h.caps[CREW_CAPS.profilesView] = false;
    h.caps[CREW_CAPS.horApprove] = false;
    h.caps[CREW_CAPS.famView] = false;
    h.caps[CREW_CAPS.profilesCreate] = false;
    renderPage();
    const hor = await screen.findByRole('region', { name: 'Hours of rest' });
    await waitFor(() => expect(within(hor).getByText('Demo Bosun')).toBeInTheDocument());
    expect(within(hor).queryByRole('link', { name: 'Demo Bosun' })).toBeNull();
    expect(within(hor).queryByRole('link', { name: /Open the board/ })).toBeNull();
    expect(within(hor).getByRole('link', { name: /Report/ })).toBeInTheDocument();
    const onboarding = screen.getByRole('region', { name: 'Onboarding' });
    await within(onboarding).findByText('Purser office handover');
    expect(within(onboarding).queryByRole('link', { name: 'Purser office handover' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Add crew/ })).toBeNull();
    const region = screen.getByRole('region', { name: 'Action required' });
    expect(within(region).getByRole('link', { name: '1 crew member yet to submit October 2026' })).toHaveAttribute('href', '/v/dra/crew/hours-of-rest/report?year=2026');
  });

  it('the Onboarding card has its own error with Try again', async () => {
    let n = 0;
    answers.crew_onboarding_progress = () => {
      n++;
      return n <= 2 ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: [JOINER()], error: null };
    };
    renderPage();
    const onboarding = await screen.findByRole('region', { name: 'Onboarding' });
    const retry = await within(onboarding).findByRole('button', { name: /Try again/ });
    expect(tileByLabel('Crewing').getAttribute('data-state')).toBe('ready');
    fireEvent.click(retry);
    expect(await within(onboarding).findByText('Demo Purser')).toBeInTheDocument();
  });

  it('a tile pointing at a card moves focus to it', async () => {
    renderPage('/v/dra/crew#crew-dashboard-onboarding');
    const card = await screen.findByRole('region', { name: 'Onboarding' });
    await waitFor(() => expect(document.activeElement).toBe(card));
  });
});

describe('at 390 px', () => {
  it('nothing is wider than a phone and the page shrinks with the screen', async () => {
    await act(async () => {
      window.innerWidth = 390;
      window.dispatchEvent(new Event('resize'));
    });
    const { container } = renderPage();
    await waitFor(() => expect(document.querySelector('[data-crew-dashboard="ready"]')).not.toBeNull());
    const wide = Array.from(container.querySelectorAll<HTMLElement>('[class]')).filter((el) => /\b(?:w|min-w)-\[(?:[4-9]\d\d|\d{4,})px\]/.test(el.className));
    expect(wide).toEqual([]);
    expect((container.firstElementChild as HTMLElement).className).toContain('min-w-0');
  });
});

// ---------------------------------------------------------------- the profile's Onboarding card

const PROFILE = (over: Partial<CrewProfileSummary> = {}): CrewProfileSummary => ({
  profileId: 'p36',
  userId: 'u36',
  firstName: 'Demo',
  lastName: 'Purser',
  preferredName: null,
  displayName: 'Demo Purser',
  avatarUrl: null,
  crewNumber: null,
  positionName: 'Purser',
  positionText: 'Purser',
  departmentKey: 'purser_office',
  departmentLabel: 'Purser office',
  rankTier: 'hod',
  onVessel: true,
  placementKind: 'assignment',
  assignmentId: 'a36',
  joinDate: '2026-11-07',
  leaveDate: null,
  status: 'on_board',
  statusDetail: null,
  transferVesselId: null,
  leaveCode: null,
  loginState: 'active',
  prev: null,
  next: null,
  memberIndex: 1,
  memberCount: 13,
  isOwn: false,
  canEdit: true,
  canEditSelf: true,
  tabs: null,
  source: 'server',
  ...over,
});

const VESSEL = { id: 'v-dra', companyId: 'c-1', name: 'DRAAK' };

function renderCard(profile: CrewProfileSummary) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OnboardingProgressCard vessel={VESSEL} profile={profile} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const cardReady = () => waitFor(() => expect(document.querySelector('[data-profile-card="onboarding"][data-onboarding-state="ready"]')).not.toBeNull());

describe('the profile\'s Onboarding card', () => {
  it('shows the eight checks for the person, the percentage of the known ones, and the fixes', async () => {
    renderCard(PROFILE());
    await cardReady();
    expect(calls('crew_onboarding_progress')).toEqual([{ p_vessel_id: 'v-dra', p_profile_id: 'p36', p_days: 90 }]);
    const rows = Array.from(document.querySelectorAll('[data-onboarding-check]'));
    expect(rows.map((r) => [r.getAttribute('data-onboarding-check'), r.getAttribute('data-check-state')])).toEqual([
      ['photo', 'pass'],
      ['signature', 'unknown'],
      ['personal', 'pass'],
      ['contact', 'fail'],
      ['passport', 'pass'],
      ['medical', 'fail'],
      ['stcw_basic', 'fail'],
      ['contract', 'pass'],
    ]);
    expect(document.querySelector('[data-onboarding-percent]')).toHaveTextContent('57%');
    expect(screen.getByText('4 of 7 checks · 1 not checked yet')).toBeInTheDocument();
    expect(screen.getByText('Checked once stored signatures are switched on.')).toBeInTheDocument();
    const fixes = Object.fromEntries(Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-onboarding-fix]')).map((a) => [a.dataset.onboardingFix, a.getAttribute('href')]));
    expect(fixes).toEqual({
      contact: '/v/dra/crew/people/p36/contact',
      medical: '/v/dra/crew/people/p36/documents',
      stcw_basic: '/v/dra/crew/people/p36/stcw',
    });
    expect(screen.getByText('1 of 2 required familiarisations completed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Purser office handover' })).toHaveAttribute('href', '/v/dra/crew/familiarisation/f2');
  });

  it('keeps to the person asked for, whatever else the answer holds', async () => {
    answers.crew_onboarding_progress = () => ({ data: [JOINER({ profile_id: 'p99', first_name: 'Someone', last_name: 'Else', checks: checks(ALL_PASS) }), JOINER()], error: null });
    renderCard(PROFILE());
    await cardReady();
    expect(document.querySelector('[data-onboarding-percent]')).toHaveTextContent('57%');
  });

  it('the signature fix is the person\'s own: a link for them, a note for anyone else', async () => {
    answers.crew_onboarding_progress = () => ({ data: [JOINER({ checks: ONBOARDING_CHECK_KEYS.map((key) => ({ key, state: key === 'signature' ? 'fail' : 'pass' })) })], error: null });
    const { unmount } = renderCard(PROFILE({ isOwn: true }));
    await cardReady();
    expect(document.querySelector('[data-onboarding-fix="signature"]')).toHaveAttribute('href', '/me/signature');
    unmount();
    qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    renderCard(PROFILE({ isOwn: false }));
    await cardReady();
    expect(document.querySelector('[data-onboarding-fix="signature"]')).toBeNull();
    expect(screen.getByText('Only the crew member can store their signature, from their own profile.')).toBeInTheDocument();
  });

  it('reads nothing for a viewer without crew list access who is not the person, nor for someone not on the crew', () => {
    h.caps[CREW_CAPS.crewListView] = false;
    const { container, unmount } = renderCard(PROFILE({ isOwn: false }));
    expect(container).toBeEmptyDOMElement();
    unmount();
    grantAll();
    const off = renderCard(PROFILE({ onVessel: false }));
    expect(off.container).toBeEmptyDOMElement();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('the person sees their own with view_own', async () => {
    h.caps = { [CREW_CAPS.profilesViewOwn]: true };
    renderCard(PROFILE({ isOwn: true }));
    await cardReady();
    expect(calls('crew_onboarding_progress')).toHaveLength(1);
  });

  it('not applied: says onboarding arrives with the crew update', async () => {
    answers = {};
    renderCard(PROFILE());
    expect(await screen.findByText(ONBOARDING_NOT_SET_UP_NOTICE)).toBeInTheDocument();
    expect(calls('crew_onboarding_progress')).toHaveLength(1);
  });

  it('any other error: an inline error with Try again that asks again', async () => {
    let n = 0;
    answers.crew_onboarding_progress = () => {
      n++;
      return n <= 2 ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: [JOINER()], error: null };
    };
    renderCard(PROFILE());
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }));
    await cardReady();
  });

  it('refused by the server (42501): the card is not shown', async () => {
    answers.crew_onboarding_progress = () => ({ data: null, error: { code: '42501', message: 'crew_not_permitted' } });
    const { container } = renderCard(PROFILE());
    await waitFor(() => expect(calls('crew_onboarding_progress')).toHaveLength(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('no row for the person on this vessel: says why', async () => {
    answers.crew_onboarding_progress = () => ({ data: [], error: null });
    renderCard(PROFILE());
    expect(await screen.findByText("Onboarding is checked for DRAAK’s crew, and Demo Purser is not on it today.")).toBeInTheDocument();
  });

  it('every check passed: says so, with no fix links', async () => {
    answers.crew_onboarding_progress = () => ({ data: [JOINER({ checks: checks(ALL_PASS), fam_required: 0, fam_completed: 0, familiarisation: [] })], error: null });
    renderCard(PROFILE());
    await cardReady();
    expect(screen.getByText('Every check is done')).toBeInTheDocument();
    expect(document.querySelector('[data-onboarding-percent]')).toHaveTextContent('100%');
    expect(document.querySelectorAll('[data-onboarding-fix]')).toHaveLength(0);
    expect(document.querySelector('[data-onboarding-familiarisation]')).toBeNull();
  });
});
