/**
 * Overdue drills (gap/02 R7, T-248; X5-10B; src/modules/reports/reports/
 * OverdueDrillsReport.tsx, lib/opsReports.ts):
 *
 * - the interval rule mirrors the SQL fleet_report_drill_interval_state:
 *   every case between the `drill-interval-cases` markers of
 *   supabase/tests/sql/fleet/report_ops_sources.test.sql is asserted here
 *   against the TS too (the due day itself is due soon, 0 days left);
 * - pure: the Show and Category filters keep the server's order; the
 *   tallies; the due words; the export columns;
 * - the page: one read of `fleet_report_overdue_drills` for the default
 *   vessels (NULL); overdue (missed or past the interval) by default; tiles
 *   linking to each kind; rows linking to the vessel's drills; "Not
 *   covered" named; not set up (D-01); an error with Retry; a vessel out of
 *   reach in words; cards below 768 px; Export once ready.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

import OverdueDrillsReport from '@/modules/reports/reports/OverdueDrillsReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import { addDays } from '@/modules/reports/lib/crewReports';
import {
  drillCategoryLabel,
  drillExportColumns,
  drillIntervalState,
  drillRows,
  dueText,
  frequencyText,
  tallyDrills,
  vesselLabeller,
} from '@/modules/reports/lib/opsReports';
import { buildExportTable } from '@/lib/export';
import type { FleetReportOverdueDrillsJson, OverdueDrillRow } from '@/modules/reports/types/db.pending';

const DEF = getReport('overdue-drills', 'fleet') as ReportDefinition;
const SQL_TEST = readFileSync(join(process.cwd(), 'supabase/tests/sql/fleet/report_ops_sources.test.sql'), 'utf8');

const VESSELS: FleetReportOverdueDrillsJson['vessels'] = [
  { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', state: 'ok' },
  { vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD', state: 'ok' },
  { vessel_id: 'v-gam', vessel_name: 'GAME CHANGER', vessel_code: 'GAM', state: 'module_off' },
];

function drill(kind: OverdueDrillRow['kind'], id: string, overrides: Partial<OverdueDrillRow> = {}): OverdueDrillRow {
  return {
    kind,
    vessel_id: 'v-dra',
    drill_type_id: `dt-${id}`,
    drill_type: `Drill ${id}`,
    category: 'SOLAS_Required',
    frequency_days: 7,
    solas_reference: 'SOLAS III/19',
    drill_id: kind === 'missed' ? `d-${id}` : null,
    drill_number: kind === 'missed' ? `DRILL-${id}` : null,
    status: kind === 'missed' ? 'Scheduled' : null,
    due_on: kind === 'never' ? null : '2026-11-24',
    days_overdue: kind === 'never' ? null : 3,
    last_done_on: kind === 'lapsed' || kind === 'due_soon' ? '2026-11-17' : null,
    next_scheduled_on: null,
    ...overrides,
  };
}

const ROWS: OverdueDrillRow[] = [
  drill('missed', 'vol', { category: 'Voluntary', days_overdue: 5, due_on: '2026-11-22' }),
  drill('lapsed', 'fire'),
  drill('missed', 'fire'),
  drill('due_soon', 'abandon', { vessel_id: 'v-hyd', days_overdue: -1, due_on: '2026-11-28', frequency_days: 30, next_scheduled_on: '2026-12-07' }),
  drill('never', 'collision', { category: 'Company_Required', frequency_days: 90 }),
];

const answer = (overrides: Partial<FleetReportOverdueDrillsJson> = {}): FleetReportOverdueDrillsJson => ({
  today: '2026-11-27',
  required_types: 3,
  vessels: VESSELS,
  rows: ROWS,
  ...overrides,
});

function shownReady(overrides: Record<string, unknown> = {}) {
  const vessels = VESSELS.map((v) => ({ id: v.vessel_id, name: v.vessel_name, code: v.vessel_code }));
  const ids = vessels.map((v) => v.id);
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

function renderReport(url = '/fleet/reports/overdue-drills') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<OverdueDrillsReport definition={DEF} />} />
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

describe('drill interval rule (TS mirror of the SQL)', () => {
  it('answers every SQL case the same way', () => {
    const start = SQL_TEST.indexOf('-- drill-interval-cases:start');
    const end = SQL_TEST.indexOf('-- drill-interval-cases:end');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const lines = SQL_TEST.slice(start, end).split('\n').filter((l) => l.trim().startsWith('('));
    expect(lines.length).toBeGreaterThanOrEqual(10);
    const re = /^\('([a-z0-9_]+)', (NULL|-?\d+), (NULL|-?\d+), (NULL|'[a-z_]+')\),?$/;
    for (const line of lines) {
      const m = re.exec(line.trim());
      expect(m, line).not.toBeNull();
      const [, key, off, freq, want] = m as RegExpExecArray;
      const last = off === 'NULL' ? null : addDays('2026-11-15', Number(off));
      expect(drillIntervalState(last, freq === 'NULL' ? null : Number(freq), '2026-11-15'), key).toBe(want === 'NULL' ? null : want.slice(1, -1));
    }
    expect(drillIntervalState('2026-11-01', 7, null)).toBeNull();
  });
});

describe('overdue drills (pure)', () => {
  it('filters by Show and Category in the server order', () => {
    const ids = (rows: OverdueDrillRow[]) => rows.map((r) => `${r.kind}:${r.drill_type}`);
    expect(ids(drillRows(ROWS, 'overdue', 'all'))).toEqual(['missed:Drill vol', 'lapsed:Drill fire', 'missed:Drill fire']);
    expect(ids(drillRows(ROWS, 'missed', 'all'))).toEqual(['missed:Drill vol', 'missed:Drill fire']);
    expect(ids(drillRows(ROWS, 'lapsed', 'all'))).toEqual(['lapsed:Drill fire']);
    expect(ids(drillRows(ROWS, 'due-soon', 'all'))).toEqual(['due_soon:Drill abandon']);
    expect(ids(drillRows(ROWS, 'never', 'all'))).toEqual(['never:Drill collision']);
    expect(drillRows(ROWS, 'all', 'all')).toHaveLength(5);
    expect(ids(drillRows(ROWS, 'all', 'company'))).toEqual(['never:Drill collision']);
    expect(ids(drillRows(ROWS, 'overdue', 'voluntary'))).toEqual(['missed:Drill vol']);
    expect(drillRows(ROWS, 'something-else', 'all')).toHaveLength(3);
  });

  it('tallies each kind and the vessels with something overdue', () => {
    expect(tallyDrills(ROWS)).toEqual({ missed: 2, lapsed: 1, due_soon: 1, never: 1, vessels_overdue: 1 });
    expect(tallyDrills([])).toEqual({ missed: 0, lapsed: 0, due_soon: 0, never: 0, vessels_overdue: 0 });
  });

  it('says when a drill is due and how often, in words', () => {
    expect(dueText(3)).toBe('3 days overdue');
    expect(dueText(1)).toBe('1 day overdue');
    expect(dueText(0)).toBe('Due today');
    expect(dueText(-1)).toBe('Due tomorrow');
    expect(dueText(-5)).toBe('Due in 5 days');
    expect(dueText(null)).toBeNull();
    expect(frequencyText(7)).toBe('Every 7 days');
    expect(frequencyText(1)).toBe('Every day');
    expect(drillCategoryLabel('SOLAS_Required')).toBe('SOLAS');
    expect(drillCategoryLabel('Company_Required')).toBe('Company');
    expect(drillCategoryLabel('Flag_Required')).toBe('Flag required');
  });

  it('exports the drill, the reason, the due day and days overdue', () => {
    const table = buildExportTable(drillExportColumns(vesselLabeller(VESSELS, 'Vessel')), [ROWS[1], ROWS[3]]);
    expect(table.headers).toEqual([
      'Vessel',
      'Drill',
      'Category',
      'Interval (days)',
      'Why listed',
      'Due',
      'Days overdue',
      'Last carried out',
      'Next scheduled',
      'Drill number',
      'Status',
      'Reference',
    ]);
    expect(table.rows[0]).toEqual(['DRAAK', 'Drill fire', 'SOLAS', 7, 'Past its interval', '2026-11-24', 3, '2026-11-17', null, null, null, 'SOLAS III/19']);
    expect(table.rows[1][4]).toBe('Due soon');
    expect(table.rows[1][6]).toBeNull();
  });
});

describe('Overdue drills page', () => {
  it('reads once for the default vessels (NULL) and lists the overdue rows, linking to the vessel drills', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_overdue_drills: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(callsOf('fleet_report_overdue_drills')).toEqual([expect.objectContaining({ p_vessel_ids: null })]);
    expect(within(bodyRows()[0]).getByText('Missed')).toBeInTheDocument();
    expect(within(bodyRows()[0]).getByText('5 days overdue')).toBeInTheDocument();
    expect(within(bodyRows()[0]).getByText('Still marked Scheduled')).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByText('Past its interval')).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra/safety/drills');
    expect(screen.getByText(/Not covered:/).closest('p')).toHaveTextContent('GAME CHANGER (Safety is switched off on this vessel)');
  });

  it('sends the chosen vessels as explicit ids', async () => {
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false });
    state.answers = { fleet_report_overdue_drills: { data: answer(), error: null } };
    renderReport('/fleet/reports/overdue-drills?vessels=DRA');
    await screen.findByRole('table');
    expect(callsOf('fleet_report_overdue_drills')[0]).toMatchObject({ p_vessel_ids: ['v-dra'] });
  });

  it('counts each kind in tiles that link to it', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_overdue_drills: { data: answer(), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Overdue drills summary' });
    await within(summary).findByText('Scheduled, not carried out');
    const tiles = within(summary).getAllByRole('link');
    expect(tiles.map((a) => a.getAttribute('href'))).toEqual([
      '/fleet/reports/overdue-drills?show=missed',
      '/fleet/reports/overdue-drills?show=lapsed',
      '/fleet/reports/overdue-drills?show=due-soon',
      '/fleet/reports/overdue-drills?show=never',
    ]);
    expect(tiles[0]).toHaveTextContent(/Missed\s*2/);
    expect(tiles[1]).toHaveTextContent(/Past their interval\s*1/);
    expect(within(summary).getByText('On 1 of 2 vessels')).toBeInTheDocument();
    expect(screen.getByTestId('drill-rules')).toHaveTextContent('3 active SOLAS and company drill types');
  });

  it('applies Show from the URL: due soon shows the next drill scheduled', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_overdue_drills: { data: answer(), error: null } };
    renderReport('/fleet/reports/overdue-drills?show=due-soon');
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(within(bodyRows()[0]).getByText('Due tomorrow')).toBeInTheDocument();
    expect(within(bodyRows()[0]).getByText('7 Dec 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
  });

  it('says nothing is overdue when the list is empty, never a made-up row', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_overdue_drills: { data: answer({ rows: [ROWS[4]] }), error: null } };
    renderReport();
    expect(await screen.findByText('No overdue drills')).toBeInTheDocument();
    expect(screen.getByText(/Every scheduled drill was carried out/)).toBeInTheDocument();
  });

  it('says "This report is not set up yet" while the RPC is missing (D-01)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_overdue_drills: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_report_overdue_drills' } } };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('a vessel out of reach is said in words and not retried', async () => {
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false });
    state.answers = { fleet_report_overdue_drills: { data: null, error: { code: '42501', message: 'vessel_out_of_reach' } } };
    renderReport('/fleet/reports/overdue-drills?vessels=DRA');
    expect(await screen.findByText(/no longer in your reach/i)).toBeInTheDocument();
    expect(callsOf('fleet_report_overdue_drills')).toHaveLength(1);
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_report_overdue_drills: () => {
        calls += 1;
        return calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: answer(), error: null };
      },
    };
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }));
    expect(await screen.findByText('5 days overdue')).toBeInTheDocument();
  });

  it('folds into one card per row below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_report_overdue_drills: { data: answer(), error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Overdue drills' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    // A missed drill's card says its status and when its type was last carried out.
    expect(within(cards[0]).getByText('Status')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Scheduled')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Last carried out')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Never')).toBeInTheDocument();
    expect(within(cards[0]).queryByText(/Still marked/)).toBeNull();
  });

  it('enables Export once the rows are ready', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_overdue_drills: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled'));
  });
});
