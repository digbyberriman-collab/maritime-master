/**
 * Fleet › Dashboard (/fleet/dashboard; gap/02 D1, D3, D4, D6, D7, W9;
 * X5-02A): pages/FleetDashboardPage.tsx over the three dashboard RPCs.
 *
 * - The gate: nothing is read (no RPC) while the capability loads, and a
 *   denied caller gets AccessDenied.
 * - The KPI row: skeletons while the RPC runs, real zeros, the server's
 *   numbers with the W9 red rule, "Not set up yet" while the RPC is missing
 *   (D-01), "Could not load" with a working Retry, hidden tiles without
 *   access, links only for report keys the registry knows.
 * - The vessels shown: the default is sent as NULL (fleet-wide), a chosen
 *   set as its ids; a vessel out of reach says so and offers all vessels.
 * - The header (company eyebrow, "Fleet dashboard", n vessels, one
 *   freshness stamp) and the ranked lists ("n of m", PageEmpty when not set
 *   up, an error with Retry).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FleetDashboardKpisJson, FleetDashboardPanelsJson } from '@/modules/dashboard/types/db.pending';

type RpcAnswer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  access: { allowed: true, status: 'granted', reason: '' } as { allowed: boolean; status: string; reason: string },
  shown: null as unknown,
  answers: {} as Record<string, RpcAnswer | (() => Promise<RpcAnswer>)>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
  showAll: vi.fn(),
  alerts: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string) => {
    const answer = state.answers[fn];
    if (typeof answer === 'function') return answer();
    return Promise.resolve(answer ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
  });
  return { supabase: { rpc: state.rpc } };
});
vi.mock('@/lib/permissions/useCan', () => ({ useCapability: () => state.access, useCan: () => state.access.allowed }));
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => ({ clientDisplayName: 'Ocean Fleet', companyName: 'Ocean Fleet Ltd' }) }));
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => state.shown,
  FleetVesselsFilter: () => <button type="button">Vessels shown</button>,
}));
vi.mock('@/modules/dashboard/hooks/useOpenAlertCounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/dashboard/hooks/useOpenAlertCounts')>()),
  useOpenAlertCounts: () => state.alerts,
}));
vi.mock('@/modules/crew/hooks/useCrew', () => ({
  useRecentCrewChanges: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn(async () => undefined) }),
}));
// The caller's own "To acknowledge" tile (X5-05A) has its own test (src/test/documents/PendingFleetDocumentsCard.test.tsx).
vi.mock('@/modules/documents/components/PendingFleetDocumentsCard', () => ({
  PendingFleetDocumentsCard: (props: { variant: string; vesselId: string | null }) => (
    <div data-testid="to-acknowledge-tile" data-variant={props.variant} data-vessel={String(props.vesselId)} />
  ),
}));

import FleetDashboardPage from '@/modules/dashboard/pages/FleetDashboardPage';

const VESSELS = ['v-dra', 'v-hyd', 'v-gam'];

function shownReady(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    companyId: 'co-1',
    vessels: VESSELS.map((id, i) => ({ id, name: ['DRAAK', 'HYDRA', 'GAME CHANGER'][i], code: ['DRA', 'HYD', 'GAM'][i] })),
    shownIds: VESSELS,
    shownVessels: [],
    countedIds: VESSELS,
    isDefault: true,
    source: 'default',
    droppedCodes: [],
    fleetGroups: [],
    scope: { companyId: 'co-1', vesselIds: VESSELS },
    setShown: vi.fn(),
    showAll: state.showAll,
    ...overrides,
  };
}

function kpis(overrides: Partial<FleetDashboardKpisJson['tiles']> = {}): FleetDashboardKpisJson {
  return {
    vessels: 3,
    today: '2026-11-26',
    tiles: {
      documents: {
        state: 'ok',
        value: 8,
        vessels: 3,
        parts: { expired_vessel_certificates: 2, expired_crew_documents: 1, expired_crew_qualifications: 1, endorsements_overdue: 1, expiring: 3 },
      },
      hours_of_rest: { state: 'ok', value: 4, breach_days: 4, near_threshold: 1, crew_without_entries: 1, vessels_logging: 2, vessels_off: 1 },
      safety: { state: 'ok', value: 5, vessels: 3, open_corrective_actions: 4, overdue_corrective_actions: 2, overdue_drills: 1 },
      technical: { state: 'ok', value: 4, vessels: 3, overdue_jobs: 3, pending_approval: 1, open_jobs: 5 },
      leave: { state: 'not_enabled' },
      finance: { state: 'hidden' },
      ...overrides,
    },
  };
}

const ZERO_PARTS = { expired_vessel_certificates: 0, expired_crew_documents: 0, expired_crew_qualifications: 0, endorsements_overdue: 0, expiring: 0 };

function panels(): FleetDashboardPanelsJson {
  const vessel = { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA' };
  const item = {
    ...vessel,
    source_key: 'vessel_certificates',
    item_type: 'vessel_certificate',
    record_id: 'cert-1',
    person_name: null,
    label: 'Safety Management Certificate',
    detail: 'DRA-1 · Flag',
    expires_on: '2026-11-21',
    days_remaining: -5,
    bucket: 'expired',
    endorsement_due_on: null,
    endorsement_state: null,
    link_scope: 'vessel' as const,
    link_rel: 'certificates',
  };
  return {
    vessels: 3,
    today: '2026-11-26',
    expiry: {
      state: 'ok',
      groups: {
        vessel_certificates: { total: 4, items: [item] },
        crew_documents: { total: 0, items: [] },
        crew_qualifications: { total: 0, items: [] },
      },
    },
    corrective_actions: {
      state: 'ok',
      total: 1,
      overdue: 1,
      items: [{ ...vessel, id: 'ca-1', action_number: 'CA-1', description: 'Fix the rail', action_type: 'Corrective', status: 'Open', due_date: '2026-11-23', days_overdue: 3, source: 'incident', source_id: 'inc-1' }],
    },
    overdue_drills: { state: 'module_off' },
    hess: { state: 'not_tracked' },
    insurance: { state: 'no_access' },
    surveys: { state: 'ok', total: 0, items: [] },
    work_list: { state: 'ok', vessels: [{ vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', open: 2, overdue: 2, pending_approval: 0 }] },
  };
}

const ok = (data: unknown): RpcAnswer => ({ data, error: null });
const MISSING = (fn: string): RpcAnswer => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` } });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/fleet/dashboard']}>
        <FleetDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The KPI tile whose eyebrow label is `label`. */
function tile(label: string): HTMLElement {
  const indicators = screen.getByRole('region', { name: 'Fleet indicators' });
  const eyebrow = within(indicators).getByText(label);
  const el = eyebrow.closest<HTMLElement>('[data-state]');
  if (!el) throw new Error(`no tile for ${label}`);
  return el;
}

const callsOf = (fn: string) => state.rpc.mock.calls.filter((c: unknown[]) => c[0] === fn);

beforeEach(() => {
  state.access = { allowed: true, status: 'granted', reason: '' };
  state.shown = shownReady();
  state.answers = { fleet_dashboard_kpis: ok(kpis()), fleet_dashboard_panels: ok(panels()) };
  state.alerts = { status: 'ready', counts: { RED: 1, ORANGE: 0, YELLOW: 2, GREEN: 0, total: 3 }, retry: vi.fn() };
  state.rpc.mockClear();
  state.showAll.mockClear();
});

describe('the gate', () => {
  it('denies while the capability loads: a skeleton, no RPC fired, no tile', async () => {
    state.access = { allowed: false, status: 'loading', reason: 'rbac loading' };
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading the fleet dashboard');
    expect(screen.queryByRole('region', { name: 'Fleet indicators' })).toBeNull();
    await act(async () => undefined);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('a denied caller gets AccessDenied and nothing is read', async () => {
    state.access = { allowed: false, status: 'denied', reason: 'no rbac' };
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("You don't have access to this page");
    await act(async () => undefined);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe('the header', () => {
  it('is one PageHeader: company eyebrow, "Fleet dashboard", the vessels shown, one freshness stamp', async () => {
    const { container } = renderPage();
    const headers = container.querySelectorAll('[data-page-heading]');
    expect(headers).toHaveLength(1);
    expect(within(headers[0] as HTMLElement).getByRole('heading', { level: 1 })).toHaveTextContent('Fleet dashboard');
    expect(headers[0]).toHaveTextContent('Ocean Fleet');
    expect(headers[0]).toHaveTextContent('3 vessels');
    expect(await screen.findByTestId('fleet-dashboard-updated')).toHaveTextContent(/^Updated \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC$/);
    expect(screen.getAllByText(/^Updated /)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Vessels shown' })).toBeInTheDocument();
  });

  it('says how many of how many vessels are shown for a chosen set', () => {
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false });
    renderPage();
    expect(document.querySelector('[data-page-heading]')).toHaveTextContent('1 vessel shown of 3');
  });

  it('carries the caller\'s own "To acknowledge" tile across their vessels, after the KPI row (X5-05A)', () => {
    renderPage();
    const tileEl = screen.getByTestId('to-acknowledge-tile');
    expect(tileEl).toHaveAttribute('data-variant', 'fleet');
    expect(tileEl).toHaveAttribute('data-vessel', 'null');
    const lists = screen.getByRole('heading', { name: 'Needs attention' });
    expect(tileEl.compareDocumentPosition(lists) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the KPI row', () => {
  it('shows skeletons while the RPC runs, never a 0', () => {
    state.answers.fleet_dashboard_kpis = () => new Promise(() => undefined);
    renderPage();
    for (const label of ['Document alerts', 'Hours of rest', 'Safety', 'Technical']) {
      expect(tile(label)).toHaveAttribute('data-state', 'loading');
      expect(tile(label).querySelector('[data-kpi-value]')).toBeNull();
    }
  });

  it('shows the server numbers, the parts and the W9 red rule', async () => {
    renderPage();
    await waitFor(() => expect(tile('Document alerts')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Document alerts')).toHaveTextContent('8');
    expect(tile('Document alerts')).toHaveTextContent('2 expired certificates · 1 expired crew document · 1 expired qualification · 1 endorsement overdue · 3 expiring');
    expect(tile('Document alerts')).toHaveAttribute('data-tone', 'danger');
    expect(tile('Hours of rest')).toHaveTextContent('4 breach days · 1 near the limit · 1 with no entries · 2 vessels logging');
    expect(tile('Safety')).toHaveTextContent('4 open actions, 2 overdue · 1 overdue drill');
    expect(tile('Technical')).toHaveTextContent('3 jobs overdue · 1 awaiting approval');
    expect(tile('Leave overdue')).toHaveAttribute('data-state', 'not-enabled');
    expect(screen.queryByText('Finance')).toBeNull();
    expect(tile('Open alerts')).toHaveTextContent('1 red · 0 orange · 2 yellow');
  });

  it('a real zero is the zero state', async () => {
    state.answers.fleet_dashboard_kpis = ok(
      kpis({
        documents: { state: 'ok', value: 0, vessels: 3, parts: ZERO_PARTS },
        safety: { state: 'ok', value: 0, vessels: 3, open_corrective_actions: 0, overdue_corrective_actions: 0, overdue_drills: 0 },
      }),
    );
    renderPage();
    await waitFor(() => expect(tile('Document alerts')).toHaveAttribute('data-state', 'zero'));
    expect(tile('Document alerts')).toHaveTextContent('All documents in date');
    expect(tile('Safety')).toHaveAttribute('data-state', 'zero');
  });

  it('not set up (the RPCs are missing): "Not set up yet" on the tiles and a PageEmpty for the lists, never zeros', async () => {
    state.answers = { fleet_dashboard_kpis: MISSING('fleet_dashboard_kpis'), fleet_dashboard_panels: MISSING('fleet_dashboard_panels') };
    renderPage();
    await waitFor(() => expect(tile('Document alerts')).toHaveAttribute('data-state', 'not-enabled'));
    for (const label of ['Document alerts', 'Hours of rest', 'Safety', 'Technical']) {
      expect(tile(label)).toHaveTextContent('Not set up yet');
      expect(tile(label)).not.toHaveTextContent('Could not load');
    }
    expect(await screen.findByText('The ranked lists are not set up yet')).toBeInTheDocument();
    expect(callsOf('fleet_dashboard_kpis')).toHaveLength(1);
  });

  it('a failed read says so with a Retry that reads again', async () => {
    let fail = true;
    state.answers.fleet_dashboard_kpis = async () => (fail ? { data: null, error: { code: 'XX000', message: 'boom' } } : ok(kpis()));
    renderPage();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'error'), { timeout: 3000 });
    expect(tile('Safety')).toHaveTextContent('Could not load');
    expect(tile('Safety')).not.toHaveTextContent('0');
    fail = false;
    fireEvent.click(within(tile('Safety')).getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Safety')).toHaveTextContent('5');
  });

  it('an answer it cannot read is an error, not a guess', async () => {
    state.answers.fleet_dashboard_kpis = ok({ vessels: 3, tiles: { documents: { state: 'weird' } } });
    renderPage();
    await waitFor(() => expect(tile('Document alerts')).toHaveAttribute('data-state', 'error'));
  });

  it('hides a tile the caller has no access to', async () => {
    state.answers.fleet_dashboard_kpis = ok(kpis({ documents: { state: 'no_access' }, technical: { state: 'no_access' } }));
    renderPage();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    const indicators = screen.getByRole('region', { name: 'Fleet indicators' });
    expect(within(indicators).queryByText('Document alerts')).toBeNull();
    expect(within(indicators).queryByText('Technical')).toBeNull();
    expect(tile('Leave overdue')).toBeInTheDocument();
  });

  it('links a number only when the report registry knows its key', async () => {
    renderPage();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Safety').closest('a')).toHaveAttribute('href', '/fleet/reports/capa-tracker');
    // Fleet certificates (X5-03B), hours of rest (X5-10A) and the work list (X5-10B) are registered.
    expect(tile('Document alerts').closest('a')).toHaveAttribute('href', '/fleet/reports/fleet-certificates');
    expect(tile('Hours of rest').closest('a')).toHaveAttribute('href', '/fleet/reports/hours-of-rest');
    expect(tile('Technical').closest('a')).toHaveAttribute('href', '/fleet/reports/work-list');
  });
});

describe('the vessels shown', () => {
  it('the default is read fleet-wide (NULL ids, fleet-level items included)', async () => {
    renderPage();
    await waitFor(() => expect(callsOf('fleet_dashboard_kpis')).toHaveLength(1));
    expect(callsOf('fleet_dashboard_kpis')[0][1]).toMatchObject({ p_vessel_ids: null });
    expect(callsOf('fleet_dashboard_panels')[0][1]).toMatchObject({ p_vessel_ids: null, p_limit: 5 });
  });

  it('a chosen set is sent as its ids', async () => {
    state.shown = shownReady({ shownIds: ['v-hyd', 'v-dra'], isDefault: false });
    renderPage();
    await waitFor(() => expect(callsOf('fleet_dashboard_kpis')).toHaveLength(1));
    expect(callsOf('fleet_dashboard_kpis')[0][1]).toMatchObject({ p_vessel_ids: ['v-hyd', 'v-dra'] });
  });

  it('a vessel out of reach says so and offers every vessel again, without retrying', async () => {
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false });
    state.answers.fleet_dashboard_kpis = { data: null, error: { code: '42501', message: 'vessel_out_of_reach' } };
    renderPage();
    expect(await screen.findByText('Some vessels shown are out of reach')).toBeInTheDocument();
    expect(screen.getAllByText(/no longer in your reach/).length).toBeGreaterThan(0);
    expect(callsOf('fleet_dashboard_kpis')).toHaveLength(1);
    const alert = screen.getByText('Some vessels shown are out of reach').closest('[role="alert"]') as HTMLElement;
    fireEvent.click(within(alert).getByRole('button', { name: /try again/i }));
    expect(state.showAll).toHaveBeenCalledTimes(1);
  });

  it('no vessel to show: an empty state, nothing read', async () => {
    state.shown = shownReady({ shownIds: [], countedIds: [], vessels: [] });
    renderPage();
    expect(screen.getByText('No vessels to show')).toBeInTheDocument();
    await act(async () => undefined);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('a vessel list that failed to load is an error with Retry', () => {
    const retry = vi.fn();
    state.shown = { status: 'error', error: { message: 'Vessels could not load' }, retry };
    renderPage();
    expect(screen.getByText('Your vessels could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('the ranked lists', () => {
  it('show "n of m", hide lists without access and say when a module is off or a source is not tracked', async () => {
    renderPage();
    const lists = await screen.findByTestId('fleet-dashboard-lists');
    const certs = within(lists).getByRole('region', { name: 'Vessel certificates' });
    expect(within(certs).getByTestId('list-count')).toHaveTextContent('1 of 4');
    expect(within(certs).getByRole('link', { name: /Safety Management Certificate/ })).toHaveAttribute('href', '/v/dra/certificates');
    expect(within(lists).getByRole('region', { name: 'Corrective actions' })).toHaveTextContent('3 d overdue');
    expect(within(lists).getByRole('region', { name: 'Overdue drills' })).toHaveTextContent('Safety is off on every vessel shown.');
    expect(within(lists).getByRole('region', { name: 'HESS meetings' })).toHaveTextContent('Not tracked yet.');
    expect(within(lists).queryByRole('region', { name: /Insurance/ })).toBeNull();
    expect(within(lists).getByRole('region', { name: 'Audits and surveys' })).toHaveTextContent('No audit or survey in the next 90 days.');
    expect(within(lists).getByRole('region', { name: 'Work list' })).toHaveTextContent('2 overdue');
  });

  it('a failed read of the lists is an error with Retry, the tiles unaffected', async () => {
    state.answers.fleet_dashboard_panels = { data: null, error: { code: '22023', message: 'invalid_limit' } };
    renderPage();
    expect(await screen.findByText('The ranked lists could not load')).toBeInTheDocument();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
  });
});

describe('tokens', () => {
  it('uses no raw palette colours', async () => {
    const { container } = renderPage();
    await screen.findByTestId('fleet-dashboard-lists');
    expect(container.innerHTML).not.toMatch(/(bg|text|border)-(amber|sky|emerald|rose|slate|violet|red|green|yellow|blue|orange|gray|zinc)-\d/);
    expect(container.innerHTML).not.toMatch(/\bdark:/);
  });
});

describe('Refresh', () => {
  it('reads the dashboard again, a "not set up yet" answer too', async () => {
    state.answers = { fleet_dashboard_kpis: MISSING('fleet_dashboard_kpis'), fleet_dashboard_panels: MISSING('fleet_dashboard_panels') };
    renderPage();
    await waitFor(() => expect(tile('Safety')).toHaveTextContent('Not set up yet'));
    state.answers = { fleet_dashboard_kpis: ok(kpis()), fleet_dashboard_panels: ok(panels()) };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(callsOf('fleet_dashboard_kpis')).toHaveLength(2);
    expect((state.alerts as { retry: ReturnType<typeof vi.fn> }).retry).toHaveBeenCalled();
  });
});
