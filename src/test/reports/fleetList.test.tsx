/**
 * Fleet list (gap/02 R14; src/modules/reports/reports/FleetListReport.tsx,
 * lib/expiryReports.ts):
 *
 * - pure: certificate health (expired first, then due, all valid, none
 *   recorded, not covered for NULL counts, never 0), the Show filter, the
 *   KPI totals that leave out what the reader cannot count, the length,
 *   the export columns;
 * - the page: one read of `fleet_vessel_list` for the vessels shown (NULL
 *   for the default, ids for a choice), one row per vessel with its
 *   particulars, "–" for a count not covered, certificate health linking to
 *   the vessel's certificates, "Not counted" for a vessel outside fleet
 *   totals, Show from the URL, KPIs with their coverage, not set up
 *   (D-01), an error with Retry, cards below 768 px, Export once ready.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  shown: null as unknown,
  wide: true,
  answers: {} as Record<string, Answer | (() => Answer)>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string) => {
    const answer = state.answers[fn];
    const value = typeof answer === 'function' ? answer() : answer;
    return Promise.resolve(value ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
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

import FleetListReport from '@/modules/reports/reports/FleetListReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  FLEET_LIST_EXPORT_COLUMNS,
  certificateHealth,
  fleetListRows,
  fleetListSummary,
  lengthText,
} from '@/modules/reports/lib/expiryReports';
import { buildExportTable } from '@/lib/export';
import type { FleetVesselListRow } from '@/modules/reports/types/db.pending';

const DEF = getReport('fleet-list', 'fleet') as ReportDefinition;

function vessel(name: string, code: string, overrides: Partial<FleetVesselListRow> = {}): FleetVesselListRow {
  return {
    vessel_id: `v-${code.toLowerCase()}`,
    vessel_name: name,
    vessel_code: code,
    vessel_type: 'Motor yacht',
    flag_state: 'Malta',
    classification_society: 'Bureau Veritas',
    imo_number: '9800001',
    length_overall: 58.24,
    builder: 'Northern Yard',
    build_year: 2016,
    fleet_group_id: 'g-1',
    fleet_group_name: 'Mediterranean',
    is_counted: true,
    active_crew: 14,
    certificates_total: 22,
    certificates_expired: 0,
    certificates_expiring: 0,
    ...overrides,
  };
}

const ROWS: FleetVesselListRow[] = [
  vessel('DAGON', 'DAG', { certificates_expiring: 1 }),
  vessel('DRAAK', 'DRA', { certificates_expired: 2, certificates_expiring: 1, active_crew: 21 }),
  vessel('ROCINANTE', 'ROC', { active_crew: null, certificates_total: null, certificates_expired: null, certificates_expiring: null, fleet_group_name: null }),
  vessel('XIPHIAS', 'XIP', { is_counted: false, certificates_total: 0, active_crew: 0, length_overall: null, build_year: null }),
];

function shownReady(overrides: Record<string, unknown> = {}) {
  const ids = ROWS.map((r) => r.vessel_id);
  const vessels = ROWS.map((r) => ({ id: r.vessel_id, name: r.vessel_name, code: r.vessel_code }));
  return {
    status: 'ready',
    companyId: 'co-1',
    vessels,
    shownIds: ids,
    shownVessels: vessels,
    countedIds: ids,
    isDefault: true,
    source: 'default',
    droppedCodes: [],
    fleetGroups: [],
    scope: { companyId: 'co-1', vesselIds: ids },
    setShown: vi.fn(),
    showAll: vi.fn(),
    ...overrides,
  };
}

function renderReport(url = '/fleet/reports/fleet-list') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<FleetListReport definition={DEF} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

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

describe('fleet list (pure)', () => {
  it('rates certificate health: expired first, then due, all valid, none recorded, not covered', () => {
    expect(certificateHealth(ROWS[1])).toEqual({ tone: 'danger', label: '2 expired · 1 due', covered: true, findings: true });
    expect(certificateHealth({ certificates_total: 5, certificates_expired: 1, certificates_expiring: 0 }).label).toBe('1 expired');
    expect(certificateHealth(ROWS[0])).toEqual({ tone: 'warn', label: '1 due', covered: true, findings: true });
    expect(certificateHealth(vessel('A', 'A'))).toEqual({ tone: 'ok', label: 'All valid', covered: true, findings: false });
    expect(certificateHealth(ROWS[3])).toEqual({ tone: 'neutral', label: 'None recorded', covered: true, findings: false });
    expect(certificateHealth(ROWS[2])).toEqual({ tone: 'neutral', label: 'Not covered', covered: false, findings: false });
    expect(certificateHealth({ certificates_total: 3, certificates_expired: null, certificates_expiring: 0 }).covered).toBe(false);
  });

  it('filters to vessels with certificates expired or due, keeping the order', () => {
    expect(fleetListRows(ROWS, 'findings').map((r) => r.vessel_code)).toEqual(['DAG', 'DRA']);
    expect(fleetListRows(ROWS, 'all')).toHaveLength(4);
  });

  it('totals only what the reader can count, and says null when nothing is counted', () => {
    expect(fleetListSummary(ROWS)).toEqual({ vessels: 4, crew: 35, crewCovered: 3, expired: 2, expiring: 2, certificatesCovered: 3 });
    expect(fleetListSummary([ROWS[2]])).toMatchObject({ crew: null, expired: null, expiring: null, certificatesCovered: 0 });
    expect(fleetListSummary([])).toMatchObject({ vessels: 0, crew: null });
  });

  it('writes lengths in metres and exports every column, blank where not covered', () => {
    expect(lengthText(58.24)).toBe('58.2 m');
    expect(lengthText(52)).toBe('52 m');
    expect(lengthText(null)).toBeNull();
    const table = buildExportTable(FLEET_LIST_EXPORT_COLUMNS, ROWS);
    expect(table.headers).toEqual([
      'Vessel', 'Code', 'Type', 'Flag', 'Class', 'IMO', 'LOA (m)', 'Builder', 'Year', 'Fleet group', 'Counted in fleet totals',
      'Crew on board', 'Certificates', 'Certificates expired', 'Certificates due', 'Certificate health',
    ]);
    expect(table.rows[2].slice(-5)).toEqual([null, null, null, null, 'Not covered']);
    expect(table.rows[3][10]).toBe('No');
  });
});

describe('Fleet list page', () => {
  it('reads the list once for the default vessels (NULL) and shows each vessel’s particulars', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_list: { data: ROWS, error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(4));
    expect(callsOf('fleet_vessel_list')).toHaveLength(1);
    expect(callsOf('fleet_vessel_list')[0]).toMatchObject({ p_vessel_ids: null });
    const draak = bodyRows()[1];
    expect(within(draak).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra');
    expect(within(draak).getByRole('link', { name: 'Certificates on DRAAK: 2 expired · 1 due' })).toHaveAttribute('href', '/v/dra/certificates');
    expect(within(draak).getByText('58.2 m')).toBeInTheDocument();
    const roc = bodyRows()[2];
    expect(within(roc).getByText('Certificates: not covered')).toBeInTheDocument();
    expect(within(roc).getByText('Crew on board: not covered')).toBeInTheDocument();
    expect(within(roc).queryByText('0')).toBeNull();
    const xip = bodyRows()[3];
    expect(within(xip).getByText('Not counted')).toBeInTheDocument();
    expect(within(xip).getByText('None recorded')).toBeInTheDocument();
    expect(screen.getByTestId('report-generated')).toHaveTextContent(/^Fleet · generated /);
  });

  it('sends a chosen set of vessels as their ids', async () => {
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false, shownVessels: [{ id: 'v-dra', name: 'DRAAK', code: 'DRA' }] });
    state.answers = { fleet_vessel_list: { data: [ROWS[1]], error: null } };
    renderReport('/fleet/reports/fleet-list?vessels=DRA');
    await screen.findByRole('table');
    expect(callsOf('fleet_vessel_list')[0]).toMatchObject({ p_vessel_ids: ['v-dra'] });
  });

  it('totals crew and certificates with their coverage', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_list: { data: ROWS, error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Fleet list summary' });
    await within(summary).findByText('35');
    expect(within(summary).getByText('Vessels')).toBeInTheDocument();
    expect(within(summary).getAllByText('On 3 of 4 vessels').length).toBeGreaterThanOrEqual(1);
  });

  it('applies Show from the URL: vessels with certificates expired or due', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_list: { data: ROWS, error: null } };
    renderReport('/fleet/reports/fleet-list?show=findings');
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(4));
  });

  it('says "This report is not set up yet" while the RPC is missing (D-01)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_list: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_vessel_list' } } };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_vessel_list: () => {
        calls += 1;
        return calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: ROWS, error: null };
      },
    };
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }));
    expect(await screen.findByText('DRAAK')).toBeInTheDocument();
  });

  it('folds into one card per vessel below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_vessel_list: { data: ROWS, error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Fleet list' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    expect(within(cards[1]).getByText('DRAAK')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Bureau Veritas')).toBeInTheDocument();
  });

  it('enables Export once the list is ready', async () => {
    state.shown = shownReady();
    state.answers = { fleet_vessel_list: { data: ROWS, error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled'));
  });
});
