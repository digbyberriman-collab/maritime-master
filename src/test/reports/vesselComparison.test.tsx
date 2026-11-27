/**
 * The Vessel comparison report (gap/02 R2; src/modules/reports/reports/
 * VesselComparisonReport.tsx, lib/vesselComparison.ts):
 *
 * - pure: the tab from `?tab=` (unknown = Documents); findings per tab
 *   (severe, watch; a NULL group, or a safety group with no counted part, is
 *   not covered); worst first, not covered last, then by name; the Show
 *   filter; the KPI summary (null totals when no vessel counts a metric);
 *   the export columns; Documents split by source when the server sends
 *   the split (C-1, D-381), each count linking to the report that holds it,
 *   else one combined metric per bucket that says so;
 * - the page: one read of `fleet_vessel_comparison` for the vessels shown
 *   (NULL for the default), rows worst first with a status pill, "–" for
 *   not covered (never 0), numbers linked to the report or page that holds
 *   them with its filter (plain for insurance), the tab in the
 *   URL, the Show filter applied from the URL, "This report is not set up
 *   yet" while the RPC is missing, an error with Retry, cards below 768 px,
 *   and Export enabled once the data is ready.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FleetVesselComparison } from '@/modules/dashboard/hooks/useFleetDashboard';

type Decision = { allowed: boolean; status: string; reason: string };
type RpcAnswer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  shown: null as unknown,
  wide: true,
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
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: () => state.wide,
}));
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => state.shown,
  FleetVesselsFilter: () => <button type="button">Vessels shown</button>,
}));

import VesselComparisonReport from '@/modules/reports/reports/VesselComparisonReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  COMPARISON_METRICS,
  DOCUMENTS_BY_SOURCE_METRICS,
  DOCUMENTS_COMBINED_METRICS,
  comparisonExportColumns,
  comparisonMetrics,
  documentsBySource,
  comparisonRows,
  comparisonSummary,
  findingsStatus,
  parseComparisonTab,
  sortByFindings,
  vesselFindings,
  writeComparisonTab,
} from '@/modules/reports/lib/vesselComparison';
import { buildExportTable } from '@/lib/export';

const VC = getReport('vessel-comparison', 'fleet') as ReportDefinition;

function row(name: string, code: string | null, groups: Partial<FleetVesselComparison> = {}): FleetVesselComparison {
  return {
    vessel_id: `v-${name.toLowerCase().replace(/\W+/g, '-')}`,
    vessel_name: name,
    vessel_code: code,
    documents: { value: 0, expired: 0, endorsements_overdue: 0, expiring: 0 },
    safety: { open_corrective_actions: 0, overdue_corrective_actions: 0, overdue_drills: 0 },
    technical: { open_jobs: 0, overdue_jobs: 0, pending_approval: 0 },
    insurance: { expired: 0, expiring: 0 },
    hours_of_rest: { breach_days: 0, near_threshold: 0, crew_without_entries: 0 },
    ...groups,
  };
}

const ROWS: FleetVesselComparison[] = [
  row('AURORA', 'AUR'),
  row('DRAAK', 'DRA', { documents: { value: 4, expired: 1, endorsements_overdue: 0, expiring: 3 }, safety: { open_corrective_actions: 2, overdue_corrective_actions: 1, overdue_drills: 1 } }),
  row('HYDRA', 'HYD', { documents: { value: 1, expired: 0, endorsements_overdue: 0, expiring: 1 }, hours_of_rest: null, insurance: { expired: 0, expiring: 2 } }),
  row('GAME CHANGER', 'GAM', { documents: null, safety: { open_corrective_actions: null, overdue_corrective_actions: null, overdue_drills: null } }),
  row('BRAVO', 'BRA', { documents: { value: 2, expired: 2, endorsements_overdue: 0, expiring: 0 } }),
];

describe('vessel comparison (pure)', () => {
  it('reads and writes the tab', () => {
    expect(parseComparisonTab('safety')).toBe('safety');
    expect(parseComparisonTab('hours-of-rest')).toBe('hours-of-rest');
    for (const v of [null, '', 'finance']) expect(parseComparisonTab(v)).toBe('documents');
    expect(writeComparisonTab('safety', new URLSearchParams('vessels=DRA')).toString()).toBe('vessels=DRA&tab=safety');
    expect(writeComparisonTab('documents', new URLSearchParams('tab=safety&show=findings')).toString()).toBe('show=findings');
  });

  it('counts findings per tab; a NULL group, or a safety group with nothing counted, is not covered', () => {
    const [aurora, draak, hydra, game] = ROWS;
    expect(vesselFindings(draak, 'documents')).toEqual({ covered: true, severe: 1, watch: 3 });
    expect(vesselFindings(draak, 'safety')).toEqual({ covered: true, severe: 2, watch: 2 });
    expect(vesselFindings(aurora, 'documents')).toEqual({ covered: true, severe: 0, watch: 0 });
    expect(vesselFindings(hydra, 'hours-of-rest')).toEqual({ covered: false, severe: 0, watch: 0 });
    expect(vesselFindings(game, 'documents').covered).toBe(false);
    expect(vesselFindings(game, 'safety').covered).toBe(false);
    expect(vesselFindings(row('X', 'X', { technical: { open_jobs: 7, overdue_jobs: 0, pending_approval: 0 } }), 'technical')).toEqual({ covered: true, severe: 0, watch: 0 });
    expect(findingsStatus({ covered: false, severe: 0, watch: 0 })).toEqual({ tone: 'neutral', label: 'Not covered' });
    expect(findingsStatus({ covered: true, severe: 1, watch: 0 })).toEqual({ tone: 'danger', label: 'Needs action' });
    expect(findingsStatus({ covered: true, severe: 0, watch: 4 })).toEqual({ tone: 'warn', label: 'Coming up' });
    expect(findingsStatus({ covered: true, severe: 0, watch: 0 })).toEqual({ tone: 'ok', label: 'Clear' });
  });

  it('sorts worst first: severe, then watch, then name; not covered last', () => {
    expect(sortByFindings(ROWS, 'documents').map((r) => r.vessel_name)).toEqual(['BRAVO', 'DRAAK', 'HYDRA', 'AURORA', 'GAME CHANGER']);
    expect(sortByFindings(ROWS, 'insurance').map((r) => r.vessel_name)).toEqual(['HYDRA', 'AURORA', 'BRAVO', 'DRAAK', 'GAME CHANGER']);
    expect(comparisonRows(ROWS, 'documents', 'findings').map((r) => r.vessel_name)).toEqual(['BRAVO', 'DRAAK', 'HYDRA']);
    expect(comparisonRows(ROWS, 'documents', 'all')).toHaveLength(5);
  });

  it('summarises a tab over every vessel, with null totals where nothing is counted', () => {
    expect(comparisonSummary(ROWS, 'documents')).toEqual({
      vessels: 5,
      covered: 4,
      withSevere: 2,
      withWatch: 1,
      totals: { expired: 3, endorsements_overdue: 0, expiring: 4 },
    });
    const none = comparisonSummary([row('A', 'A', { hours_of_rest: null })], 'hours-of-rest');
    expect(none.totals).toEqual({ breach_days: null, near_threshold: null, crew_without_entries: null });
    expect(none.covered).toBe(0);
  });

  it('links numbers to the report or page that holds them, with the filter; insurance plain', () => {
    const href = (tab: keyof typeof COMPARISON_METRICS, id: string) => COMPARISON_METRICS[tab].find((m) => m.id === id)?.href('DRA');
    // Without the split: the combined buckets open the certificates report on that vessel.
    expect(href('documents', 'expired')).toBe('/fleet/reports/fleet-certificates?vessels=DRA&status=expired');
    expect(href('documents', 'expiring')).toBe('/fleet/reports/fleet-certificates?vessels=DRA&status=due');
    expect(href('documents', 'endorsements_overdue')).toBe('/v/dra/certificates');
    expect(href('safety', 'overdue_drills')).toBe('/v/dra/safety/drills');
    expect(href('safety', 'open_corrective_actions')).toBe('/fleet/reports/capa-tracker?vessels=DRA&status=open');
    expect(href('safety', 'overdue_corrective_actions')).toBe('/fleet/reports/capa-tracker?vessels=DRA&status=overdue');
    expect(href('technical', 'overdue_jobs')).toBe('/v/dra/technical?tab=schedule');
    expect(href('insurance', 'expired')).toBeNull();
    expect(href('hours-of-rest', 'breach_days')).toBe('/v/dra/crew/hours-of-rest');
  });

  it('exports vessel, code, status and the tab’s numbers, blank where not covered', () => {
    const table = buildExportTable(comparisonExportColumns('documents'), sortByFindings(ROWS, 'documents'));
    expect(table.headers).toEqual(['Vessel', 'Code', 'Status', 'Expired certificates and crew items', 'Endorsements overdue', 'Certificates and crew items expiring within their window']);
    expect(table.rows[0]).toEqual(['BRAVO', 'BRA', 'Needs action', 2, 0, 0]);
    expect(table.rows[4]).toEqual(['GAME CHANGER', 'GAM', 'Not covered', null, null, null]);
  });
});

describe('vessel comparison documents by source (C-1, D-381)', () => {
  type Split = { expired_vessel_certificates: number; expired_crew_items: number; expiring_vessel_certificates: number; expiring_crew_items: number };
  const docs = (expired: [number, number], endorsements: number, expiring: [number, number]): FleetVesselComparison['documents'] & Split => ({
    value: expired[0] + expired[1] + endorsements + expiring[0] + expiring[1],
    expired: expired[0] + expired[1],
    endorsements_overdue: endorsements,
    expiring: expiring[0] + expiring[1],
    expired_vessel_certificates: expired[0],
    expired_crew_items: expired[1],
    expiring_vessel_certificates: expiring[0],
    expiring_crew_items: expiring[1],
  });
  const SPLIT: FleetVesselComparison[] = [
    row('DRAAK', 'DRA', { documents: docs([1, 2], 1, [0, 3]) }),
    row('HYDRA', 'HYD', { documents: docs([0, 0], 0, [1, 0]) }),
    row('GAME CHANGER', 'GAM', { documents: null }),
  ];
  const metric = (id: string) => DOCUMENTS_BY_SOURCE_METRICS.find((m) => m.id === id);

  it('reads the split only when the four counts are there and add up', () => {
    expect(documentsBySource(SPLIT[0])).toEqual({ expiredCertificates: 1, expiredCrewItems: 2, expiringCertificates: 0, expiringCrewItems: 3 });
    expect(documentsBySource(ROWS[1])).toBeNull();
    expect(documentsBySource(SPLIT[2])).toBeNull();
    const wrong = row('X', 'X', { documents: { ...docs([1, 1], 0, [0, 0]), expired: 5 } });
    expect(documentsBySource(wrong)).toBeNull();
  });

  it('shows the by-source metrics when every vessel with documents carries the split, else the combined ones', () => {
    expect(comparisonMetrics('documents', SPLIT)).toBe(DOCUMENTS_BY_SOURCE_METRICS);
    expect(comparisonMetrics('documents', ROWS)).toBe(DOCUMENTS_COMBINED_METRICS);
    expect(comparisonMetrics('documents', [SPLIT[0], ROWS[1]])).toBe(DOCUMENTS_COMBINED_METRICS);
    expect(comparisonMetrics('documents', [SPLIT[2]])).toBe(DOCUMENTS_COMBINED_METRICS);
    expect(comparisonMetrics('safety', SPLIT)).toBe(COMPARISON_METRICS.safety);
    expect(DOCUMENTS_BY_SOURCE_METRICS.map((m) => m.label)).toEqual([
      'Expired certificates',
      'Expired crew documents',
      'Endorsements overdue',
      'Expiring certificates',
      'Expiring crew documents',
    ]);
    expect(DOCUMENTS_COMBINED_METRICS.map((m) => m.title)).toEqual([
      'Expired certificates and crew items',
      'Endorsements overdue',
      'Certificates and crew items expiring within their window',
    ]);
  });

  it('links each source to the report that holds it, on that vessel and bucket', () => {
    expect(metric('expired_vessel_certificates')?.href('DRA')).toBe('/fleet/reports/fleet-certificates?vessels=DRA&status=expired');
    expect(metric('expired_crew_items')?.href('DRA')).toBe('/fleet/reports/crew-documents?vessels=DRA&vessel=DRA&status=expired');
    expect(metric('endorsements_overdue')?.href('DRA')).toBe('/v/dra/certificates');
    expect(metric('expiring_vessel_certificates')?.href('DRA')).toBe('/fleet/reports/fleet-certificates?vessels=DRA&status=due');
    expect(metric('expiring_crew_items')?.href('DRA')).toBe('/fleet/reports/crew-documents?vessels=DRA&vessel=DRA&status=due');
  });

  it('counts the same findings with or without the split, and exports by source', () => {
    expect(vesselFindings(SPLIT[0], 'documents')).toEqual({ covered: true, severe: 4, watch: 3 });
    expect(DOCUMENTS_BY_SOURCE_METRICS.map((m) => m.value(SPLIT[0]))).toEqual([1, 2, 1, 0, 3]);
    expect(comparisonSummary(SPLIT, 'documents').totals).toEqual({ expired: 3, endorsements_overdue: 1, expiring: 4 });
    const table = buildExportTable(comparisonExportColumns('documents', SPLIT), sortByFindings(SPLIT, 'documents'));
    expect(table.headers).toEqual([
      'Vessel',
      'Code',
      'Status',
      'Expired vessel certificates',
      'Expired crew documents and qualifications',
      'Endorsements overdue',
      'Vessel certificates expiring within their window',
      'Crew documents and qualifications expiring within their window',
    ]);
    expect(table.rows[0]).toEqual(['DRAAK', 'DRA', 'Needs action', 1, 2, 1, 0, 3]);
    expect(table.rows[2]).toEqual(['GAME CHANGER', 'GAM', 'Not covered', null, null, null, null, null]);
    // Without the answer's rows the export keeps the combined columns the table shows.
    expect(buildExportTable(comparisonExportColumns('documents'), SPLIT).headers).toHaveLength(6);
  });
});

// ─── The page ───────────────────────────────────────────────────────────

const VESSEL_IDS = ROWS.map((r) => r.vessel_id);

function shownReady(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    companyId: 'co-1',
    vessels: ROWS.map((r) => ({ id: r.vessel_id, name: r.vessel_name, code: r.vessel_code })),
    shownIds: VESSEL_IDS,
    shownVessels: ROWS.map((r) => ({ id: r.vessel_id, name: r.vessel_name, code: r.vessel_code })),
    countedIds: VESSEL_IDS,
    isDefault: true,
    source: 'default',
    droppedCodes: [],
    fleetGroups: [],
    scope: { companyId: 'co-1', vesselIds: VESSEL_IDS },
    setShown: vi.fn(),
    showAll: vi.fn(),
    ...overrides,
  };
}

function Location() {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>;
}

function renderReport(url = '/fleet/reports/vessel-comparison') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<VesselComparisonReport definition={VC} />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByTestId('location').textContent ?? '';
const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1]);
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const firstCells = () => bodyRows().map((r) => within(r).getAllByRole('cell')[0]?.textContent);

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.shown = null;
  state.wide = true;
  state.answers = {};
  state.rpc.mockClear();
});

describe('Vessel comparison page', () => {
  it('reads the comparison once for the default vessels (NULL) and lists them worst first with a status', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_comparison: { data: ROWS, error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(firstCells()).toEqual(['BRAVO', 'DRAAK', 'HYDRA', 'AURORA', 'GAME CHANGER']));
    expect(callsOf('fleet_vessel_comparison')).toHaveLength(1);
    expect(callsOf('fleet_vessel_comparison')[0]).toMatchObject({ p_vessel_ids: null });
    const game = bodyRows()[4];
    expect(within(game).getByText('Not covered')).toBeInTheDocument();
    expect(within(game).getAllByText('–')).toHaveLength(3);
    expect(within(game).queryByText('0')).toBeNull();
    const draak = bodyRows()[1];
    expect(within(draak).getByText('Needs action')).toBeInTheDocument();
    expect(within(draak).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra');
    expect(within(draak).getByRole('link', { name: 'Expired certificates and crew items on DRAAK: 1' })).toHaveAttribute(
      'href',
      '/fleet/reports/fleet-certificates?vessels=DRA&status=expired',
    );
    // A zero is a number, not a link.
    expect(within(draak).queryByRole('link', { name: /Endorsements overdue on DRAAK/ })).toBeNull();
    expect(screen.getByTestId('report-generated')).toHaveTextContent(/^Fleet · generated /);
  });

  it('shows Documents by source when the answer carries the C-1 split (the answer schema keeps it, D-381)', async () => {
    state.shown = shownReady();
    const split = ROWS.map((r) =>
      r.documents
        ? {
            ...r,
            documents: {
              ...r.documents,
              expired_vessel_certificates: r.documents.expired,
              expired_crew_items: 0,
              expiring_vessel_certificates: 0,
              expiring_crew_items: r.documents.expiring,
            },
          }
        : r,
    );
    state.answers = { fleet_vessel_comparison: { data: split, error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Expiring crew documents'));
    const draak = bodyRows().find((r) => within(r).queryByRole('link', { name: 'DRAAK' }));
    expect(draak).toBeDefined();
    expect(within(draak as HTMLElement).getByRole('link', { name: 'Expired vessel certificates on DRAAK: 1' })).toHaveAttribute(
      'href',
      '/fleet/reports/fleet-certificates?vessels=DRA&status=expired',
    );
  });

  it('sends a chosen set of vessels as their ids', async () => {
    state.shown = shownReady({ shownIds: ['v-draak'], isDefault: false, shownVessels: [{ id: 'v-draak', name: 'DRAAK', code: 'DRA' }] });
    state.answers = { fleet_vessel_comparison: { data: [ROWS[1]], error: null } };
    renderReport('/fleet/reports/vessel-comparison?vessels=DRA');
    await screen.findByRole('table');
    expect(callsOf('fleet_vessel_comparison')[0]).toMatchObject({ p_vessel_ids: ['v-draak'] });
    expect(screen.getByRole('link', { name: /All reports/ })).toHaveAttribute('href', '/fleet/reports?vessels=DRA');
  });

  it('switches tab through the URL and shows that area’s numbers and links', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_comparison: { data: ROWS, error: null } };
    renderReport('/fleet/reports/vessel-comparison?vessels=DRA');
    await screen.findByRole('table');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Safety' }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/vessel-comparison?vessels=DRA&tab=safety'));
    expect(screen.getByRole('tab', { name: 'Safety' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(firstCells()[0]).toBe('DRAAK'));
    const draak = bodyRows()[0];
    expect(within(draak).getByRole('link', { name: 'Overdue corrective actions on DRAAK: 1' })).toHaveAttribute(
      'href',
      '/fleet/reports/capa-tracker?vessels=DRA&status=overdue',
    );
    expect(within(draak).getByRole('link', { name: 'Overdue drills on DRAAK: 1' })).toHaveAttribute('href', '/v/dra/safety/drills');
    // The tab's lead KPI and its column share the short label.
    const summary = screen.getByRole('region', { name: 'Comparison summary' });
    expect(within(summary).getByText('Overdue actions')).toBeInTheDocument();
  });

  it('opens on ?tab= and applies ?show=findings from the URL', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_comparison: { data: ROWS, error: null } };
    renderReport('/fleet/reports/vessel-comparison?tab=insurance&show=findings');
    await screen.findByRole('table');
    expect(screen.getByRole('tab', { name: 'Insurance' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(firstCells()).toEqual(['HYDRA']));
    // Insurance numbers have no page yet: plain text.
    expect(within(bodyRows()[0]).queryByRole('link', { name: /policies/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/vessel-comparison?tab=insurance'));
    await waitFor(() => expect(firstCells()).toHaveLength(5));
  });

  it('says "This report is not set up yet" while the RPC is missing (D-01), and export says why', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_comparison: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_vessel_comparison' } } };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: /Export/ })).toHaveAccessibleDescription('This report is not set up yet.');
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_vessel_comparison: () => {
        calls += 1;
        return Promise.resolve(calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: ROWS, error: null });
      },
    };
    renderReport();
    const retry = await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 });
    fireEvent.click(retry);
    await screen.findByText('BRAVO');
  });

  it('folds into one card per vessel below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_vessel_comparison: { data: ROWS, error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Vessel comparison: Documents' });
    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(5);
    expect(within(cards[0]).getByText('BRAVO')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Expired')).toBeInTheDocument();
    expect(within(cards[4]).getByText('Not covered')).toBeInTheDocument();
  });

  it('enables Export once the comparison is ready', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_comparison: { data: ROWS, error: null } };
    renderReport();
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled');
  });

  it('no vessels shown: says so and reads nothing', () => {
    state.shown = shownReady({ shownIds: [] });
    renderReport();
    expect(screen.getByText('No vessels to compare')).toBeInTheDocument();
    expect(callsOf('fleet_vessel_comparison')).toEqual([]);
  });
});
