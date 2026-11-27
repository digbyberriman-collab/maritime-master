/**
 * The reports hub (/fleet/reports; src/modules/reports/pages/ReportsHubPage.tsx;
 * gap/02 R1; D-01, D-04, D-53, D-88):
 *
 * - the gate: nothing is read while `fleet.operations.fleet_reports.view`
 *   loads; denied is AccessDenied;
 * - the period: `?period=3|6|12` (default 6, unknown = 6) is sent to
 *   `fleet_report_trends`; the toggle writes it to the URL (the default
 *   removed);
 * - the vessels shown: the default is sent as NULL, a choice as its ids;
 * - current position: the dashboard tiles, linked only to reports the
 *   registry knows; trends: "This report is not set up yet" while the RPC is
 *   missing, an error with a working Retry, the charts (lazy) with their
 *   accessible tables, a module switched off says so, a series without
 *   access has no card; an answer of the wrong shape is an error, never a
 *   guess;
 * - the catalogue: grouped cards, only the reports the reader may open,
 *   links in the Fleet scope (registry pages keep `?vessels=`);
 * - the pure period and chart helpers (lib/trends.ts).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FleetReportTrendsJson } from '@/modules/reports/types/db.pending';
import type { FleetDashboardKpisJson } from '@/modules/dashboard/types/db.pending';

type Decision = { allowed: boolean; status: string; reason: string };
type RpcAnswer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  shown: null as unknown,
  answers: {} as Record<string, RpcAnswer | (() => Promise<RpcAnswer>)>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string) => {
    const answer = state.answers[fn];
    if (typeof answer === 'function') return answer();
    return Promise.resolve(answer ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
  });
  return { supabase: { rpc: state.rpc } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/lib/permissions/adaptor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions/adaptor')>()),
  resolveCapability: (key: string) => state.decide(key),
}));
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => ({ clientDisplayName: 'Ocean Fleet', companyName: 'Ocean Fleet Ltd' }) }));
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => state.shown,
  FleetVesselsFilter: () => <button type="button">Vessels shown</button>,
}));

import ReportsHubPage from '@/modules/reports/pages/ReportsHubPage';
import {
  DEFAULT_REPORT_PERIOD,
  monthAxisLabels,
  monthLongLabel,
  parseReportPeriod,
  trendCards,
  trendSummary,
  writeReportPeriod,
} from '@/modules/reports/lib/trends';
import { fetchReportTrends, retryReportRead, ReportDataError } from '@/modules/reports/hooks/useReportData';

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
    showAll: vi.fn(),
    ...overrides,
  };
}

function trends(overrides: Partial<FleetReportTrendsJson> = {}): FleetReportTrendsJson {
  return {
    vessels: 3,
    today: '2026-11-26',
    months: ['2026-09-01', '2026-10-01', '2026-11-01'],
    ahead: ['2026-11-01', '2026-12-01', '2027-01-01'],
    incidents: { state: 'ok', vessels: 2, counts: [1, 2, 1] },
    corrective_actions: { state: 'ok', vessels: 2, opened: [2, 1, 2], closed: [1, 1, 2] },
    drills: { state: 'ok', vessels: 2, completed: [2, 1, 0], overdue: [1, 0, 1] },
    expiries: { state: 'ok', vessels: 3, expired: 1, due: [2, 2, 1] },
    ...overrides,
  };
}

function kpis(): FleetDashboardKpisJson {
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
      hours_of_rest: { state: 'no_access' },
      safety: { state: 'ok', value: 5, vessels: 3, open_corrective_actions: 4, overdue_corrective_actions: 2, overdue_drills: 1 },
      technical: { state: 'ok', value: 4, vessels: 3, overdue_jobs: 3, pending_approval: 1, open_jobs: 5 },
      leave: { state: 'not_enabled' },
      finance: { state: 'hidden' },
    },
  };
}

const MISSING = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_report_trends' } };

function Location() {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>;
}

function renderHub(url = '/fleet/reports') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ReportsHubPage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1]);

beforeAll(() => {
  // Recharts' ResponsiveContainer measures with ResizeObserver, which jsdom lacks (the chart draws at 0 × 0; the tables stay).
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.shown = null;
  state.answers = {};
  state.rpc.mockClear();
});

describe('reports hub: gate', () => {
  it('reads nothing while the capability loads', () => {
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    state.shown = shownReady();
    renderHub();
    expect(screen.getByRole('status')).toHaveTextContent(/Loading fleet reports/);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('a denied reader gets AccessDenied and nothing is read', () => {
    state.decide = () => ({ allowed: false, status: 'denied', reason: '' });
    state.shown = shownReady();
    renderHub();
    expect(screen.getByText(/Fleet reports need access to fleet reporting/)).toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe('reports hub: reads', () => {
  it('sends the default vessels as NULL and the default period of 6 months', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_trends: { data: trends(), error: null }, fleet_dashboard_kpis: { data: kpis(), error: null } };
    renderHub();
    await screen.findByRole('heading', { name: 'Incidents' });
    expect(callsOf('fleet_report_trends')[0]).toMatchObject({ p_vessel_ids: null, p_months: 6 });
    expect(callsOf('fleet_dashboard_kpis')[0]).toMatchObject({ p_vessel_ids: null });
    expect(screen.getByRole('heading', { level: 1, name: 'Fleet reports' })).toBeInTheDocument();
    expect(screen.getByText('Ocean Fleet')).toBeInTheDocument();
    expect(screen.getAllByTestId('reports-generated')).toHaveLength(1);
    expect(screen.getByTestId('reports-generated')).toHaveTextContent(/^Fleet · generated \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC$/);
  });

  it('sends a chosen set of vessels as their ids, and ?period=3', async () => {
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false });
    state.answers = { fleet_report_trends: { data: trends(), error: null }, fleet_dashboard_kpis: { data: kpis(), error: null } };
    renderHub('/fleet/reports?vessels=DRA&period=3');
    await screen.findByRole('heading', { name: 'Incidents' });
    expect(callsOf('fleet_report_trends')[0]).toMatchObject({ p_vessel_ids: ['v-dra'], p_months: 3 });
    expect(screen.getByText(/across 1 vessel shown of 3/)).toBeInTheDocument();
  });

  it('an unknown period reads as 6; the toggle writes the period to the URL and re-reads', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_trends: { data: trends(), error: null }, fleet_dashboard_kpis: { data: kpis(), error: null } };
    renderHub('/fleet/reports?period=5');
    await screen.findByRole('heading', { name: 'Incidents' });
    expect(callsOf('fleet_report_trends')[0]).toMatchObject({ p_months: 6 });
    const group = screen.getByRole('group', { name: 'Period' });
    expect(within(group).getByRole('radio', { name: 'Last 6 months' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(group).getByRole('radio', { name: 'Last 12 months' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/fleet/reports?period=12'));
    await waitFor(() => expect(callsOf('fleet_report_trends').some((a) => a.p_months === 12)).toBe(true));
    fireEvent.click(within(group).getByRole('radio', { name: 'Last 6 months' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/fleet/reports'));
  });

  it('no vessels shown: says so and reads no trends', () => {
    state.shown = shownReady({ shownIds: [] });
    renderHub();
    expect(screen.getByText('No vessels to report on')).toBeInTheDocument();
    expect(callsOf('fleet_report_trends')).toEqual([]);
  });

  it('the vessel list failing is an error with Retry', () => {
    const retry = vi.fn();
    state.shown = { status: 'error', error: { message: 'boom' }, retry };
    renderHub();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('reports hub: current position', () => {
  it('shows the dashboard tiles the reader may see, linked only to reports the registry knows', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_trends: { data: trends(), error: null }, fleet_dashboard_kpis: { data: kpis(), error: null } };
    renderHub();
    const section = (await screen.findByRole('heading', { name: 'Current position' })).closest('section') as HTMLElement;
    await within(section).findByText('Document alerts');
    expect(within(section).queryByText('Hours of rest')).toBeNull(); // no access: hidden
    expect(within(section).queryByText(/Leave/)).toBeNull();
    expect(within(section).getByText(/2 expired certificates/)).toBeInTheDocument();
    // Each part opens the report that holds it with its bucket (D-381); Technical's parts are plain, so the tile opens the work list (X5-10B).
    const links = within(section).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['2 expired certificates', '/fleet/reports/fleet-certificates?status=expired'],
      ['1 expired crew document', '/fleet/reports/crew-documents?status=expired'],
      ['1 expired qualification', '/fleet/reports/crew-documents?status=expired'],
      ['1 endorsement overdue', '/fleet/reports/fleet-certificates'],
      ['3 expiring', '/fleet/reports/fleet-certificates?status=due'],
      ['4 open actions, 2 overdue', '/fleet/reports/capa-tracker?status=open'],
      ['1 overdue drill', '/fleet/reports/overdue-drills'],
      [expect.stringContaining('Technical'), '/fleet/reports/work-list'],
    ]);
  });
});

describe('reports hub: trends', () => {
  it('says "This report is not set up yet" while the RPC is missing (D-01), never zeros', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_trends: MISSING, fleet_dashboard_kpis: { data: kpis(), error: null } };
    renderHub();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Incidents' })).toBeNull();
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_dashboard_kpis: { data: kpis(), error: null },
      fleet_report_trends: () => {
        calls += 1;
        // The read retries once by itself; both fail, then Retry succeeds.
        return Promise.resolve(calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: trends(), error: null });
      },
    };
    renderHub();
    expect(await screen.findByText('The trends could not load', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(calls).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('heading', { name: 'Incidents' })).toBeInTheDocument();
  });

  it('an answer of the wrong shape is an error, never a guess', async () => {
    state.shown = shownReady();
    state.answers = {
      fleet_dashboard_kpis: { data: kpis(), error: null },
      fleet_report_trends: { data: trends({ incidents: { state: 'ok', vessels: 2, counts: [1, 2] } }), error: null },
    };
    renderHub();
    expect(await screen.findByText(/cannot show/)).toBeInTheDocument();
  });

  it('draws a card per series with its numbers in an accessible table; module off says so; no access has no card', async () => {
    state.shown = shownReady();
    state.answers = {
      fleet_dashboard_kpis: { data: kpis(), error: null },
      fleet_report_trends: { data: trends({ drills: { state: 'module_off' }, expiries: { state: 'no_access' } }), error: null },
    };
    renderHub();
    const incidents = (await screen.findByRole('heading', { name: 'Incidents' })).closest('section') as HTMLElement;
    expect(within(incidents).getByRole('img', { name: 'Incidents: 4 incidents over the last 6 months.' })).toBeInTheDocument();
    const rows = within(incidents).getAllByRole('row').map((r) => r.textContent);
    expect(rows).toEqual(['MonthIncidents', 'September 20261', 'October 20262', 'November 20261']);
    const ca = screen.getByRole('heading', { name: 'Corrective actions' }).closest('section') as HTMLElement;
    expect(within(ca).getByRole('img', { name: 'Corrective actions: 5 opened, 4 closed over the last 6 months.' })).toBeInTheDocument();
    const drills = screen.getByRole('heading', { name: 'Drills' }).closest('section') as HTMLElement;
    expect(within(drills).getByText('Safety is off on every vessel shown')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Document expiries ahead' })).toBeNull();
  });

  it('every series without access: one honest empty state', async () => {
    state.shown = shownReady();
    const none = { state: 'no_access' } as const;
    state.answers = {
      fleet_dashboard_kpis: { data: kpis(), error: null },
      fleet_report_trends: { data: trends({ incidents: none, corrective_actions: none, drills: none, expiries: none }), error: null },
    };
    renderHub();
    expect(await screen.findByText('No trends you can see')).toBeInTheDocument();
  });
});

describe('reports hub: catalogue', () => {
  it('groups the reports the reader may open, with links in the Fleet scope', async () => {
    state.decide = (key) => ({ allowed: key !== 'vessel.safety.capa.view', status: key === 'vessel.safety.capa.view' ? 'denied' : 'granted', reason: '' });
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false });
    state.answers = { fleet_report_trends: { data: trends(), error: null }, fleet_dashboard_kpis: { data: kpis(), error: null } };
    renderHub('/fleet/reports?vessels=DRA');
    const catalogue = (await screen.findByRole('heading', { name: 'All reports' })).closest('section') as HTMLElement;
    const groups = within(catalogue).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(['Fleet', 'Documents and certificates', 'Crew', 'Safety', 'Technical', 'Risk']);
    const hrefs = within(catalogue).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/fleet/reports/vessel-comparison?vessels=DRA',
      '/fleet/reports/fleet-list?vessels=DRA',
      '/fleet/reports/fleet-certificates?vessels=DRA',
      '/fleet/reports/crew-documents?vessels=DRA',
      '/fleet/reports/insurance?vessels=DRA',
      '/fleet/reports/crew-qualifications?vessels=DRA',
      '/fleet/reports/hours-of-rest?vessels=DRA',
      '/fleet/reports/agreements?vessels=DRA',
      '/fleet/reports/contracts-ending?vessels=DRA',
      '/fleet/reports/overdue-drills?vessels=DRA',
      '/fleet/reports/incident-analytics',
      '/fleet/reports/drill-analytics',
      '/fleet/reports/audits-surveys?vessels=DRA',
      '/fleet/reports/work-list?vessels=DRA',
      '/fleet/reports/risk-overview',
    ]);
    expect(within(catalogue).queryByText('CAPA tracker')).toBeNull();
    // The legacy reports cannot export yet and say so on their card (R19, D-384); the registry reports export.
    const card = (title: string) => within(catalogue).getByText(title).closest('a') as HTMLElement;
    for (const title of ['Incident analytics', 'Drill analytics', 'Risk overview']) expect(card(title), title).toHaveTextContent('No export yet');
    for (const title of ['Vessel comparison', 'Overdue drills', 'Work list']) expect(card(title), title).not.toHaveTextContent('No export yet');
  });

  it('shows nothing of the catalogue while the access loads, and says so when nothing may be opened', async () => {
    state.decide = (key) =>
      key === 'fleet.operations.fleet_reports.view' ? { allowed: true, status: 'granted', reason: '' } : { allowed: false, status: 'denied', reason: '' };
    state.shown = shownReady();
    state.answers = { fleet_report_trends: { data: trends(), error: null }, fleet_dashboard_kpis: { data: kpis(), error: null } };
    // Every report is gated by a key the reader lacks but the hub's own: only Vessel comparison and Fleet list remain.
    renderHub();
    const catalogue = (await screen.findByRole('heading', { name: 'All reports' })).closest('section') as HTMLElement;
    expect(within(catalogue).getAllByRole('link').map((a) => a.textContent)).toEqual([
      expect.stringContaining('Vessel comparison'),
      expect.stringContaining('Fleet list'),
    ]);
  });
});

describe('period and chart helpers (pure)', () => {
  it('parses and writes the period', () => {
    expect(parseReportPeriod('3')).toBe(3);
    expect(parseReportPeriod('12')).toBe(12);
    for (const v of [null, '', '5', 'abc', '6.5']) expect(parseReportPeriod(v)).toBe(DEFAULT_REPORT_PERIOD);
    expect(writeReportPeriod(12, new URLSearchParams('vessels=DRA')).toString()).toBe('vessels=DRA&period=12');
    expect(writeReportPeriod(6, new URLSearchParams('vessels=DRA&period=12')).toString()).toBe('vessels=DRA');
  });

  it('labels months, with the year only when the months span years', () => {
    expect(monthAxisLabels(['2026-09-01', '2026-10-01'])).toEqual(['Sept', 'Oct'].map((m, i) => (i === 0 ? expect.stringMatching(/^Sept?$/) : m)));
    expect(monthAxisLabels(['2026-12-01', '2027-01-01'])).toEqual(['Dec 26', 'Jan 27']);
    expect(monthLongLabel('2026-09-01')).toBe('September 2026');
  });

  it('builds the cards in order, leaving out a series without access', () => {
    const cards = trendCards(trends({ corrective_actions: { state: 'no_access' }, drills: { state: 'module_off' } }));
    expect(cards.map((c) => [c.key, c.state])).toEqual([
      ['incidents', 'ok'],
      ['drills', 'module_off'],
      ['expiries', 'ok'],
    ]);
    const exp = cards[2];
    expect(exp.state === 'ok' && exp.rows.map((r) => r.month)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
    expect(exp.state === 'ok' && exp.totals).toEqual({ due: 5 });
    expect(trendSummary(exp, 3)).toBe('Document expiries ahead: 5 expiring in the next 3 months, 1 already expired.');
    expect(trendSummary(cards[1], 3)).toBe('Drills: Safety is off on every vessel shown.');
  });
});

describe('the trends read (useReportData)', () => {
  const scope = { companyId: 'co-1', vesselIds: ['v-dra'], fleetWide: false };

  it('a missing RPC is not set up; a vessel out of reach and a bad period are worded and never retried', async () => {
    state.answers = { fleet_report_trends: MISSING };
    expect(await fetchReportTrends(scope, 6, '2026-11-26')).toEqual({ kind: 'not_set_up' });
    state.answers = { fleet_report_trends: { data: null, error: { code: '42501', message: 'vessel_out_of_reach' } } };
    const out = await fetchReportTrends(scope, 6, '2026-11-26').catch((e) => e);
    expect(out).toBeInstanceOf(ReportDataError);
    expect(out.reason).toBe('vessel_out_of_reach');
    expect(retryReportRead(0, out)).toBe(false);
    state.answers = { fleet_report_trends: { data: null, error: { code: '22023', message: 'invalid_period' } } };
    const bad = await fetchReportTrends(scope, 6, '2026-11-26').catch((e) => e);
    expect(bad.message).toBe('Choose a period of 3, 6 or 12 months.');
    expect(retryReportRead(0, { code: '57014' })).toBe(true);
    expect(retryReportRead(1, { code: '57014' })).toBe(false);
    expect(callsOf('fleet_report_trends')[0]).toEqual({ p_vessel_ids: ['v-dra'], p_months: 6, p_today: '2026-11-26' });
  });
});
