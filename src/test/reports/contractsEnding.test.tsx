/**
 * Contracts ending (gap/02 R11, T-248; X5-10A; src/modules/reports/reports/
 * ContractsEndingReport.tsx, lib/crewReports.ts):
 *
 * - the bucket rule mirrors the SQL fleet_report_contract_bucket: every
 *   case between the `bucket-cases` markers of
 *   supabase/tests/sql/fleet/report_crew_sources.test.sql is asserted here
 *   against the TS too (the end day counts as 0 days);
 * - pure: the Ending and Renewal filters, soonest first; the tallies; the
 *   "Ends in" words; the export columns;
 * - the page: one read of `fleet_report_contracts` in mode `ending`; ended
 *   contracts first with how long ago; the renewal drafted; filters from
 *   the URL; the tiles linking to a window; not set up (D-01); an error
 *   with Retry; cards below 768 px; Export once ready.
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

import ContractsEndingReport from '@/modules/reports/reports/ContractsEndingReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import { addDays, contractBucket, contractVesselName, endingExportColumns, endingRows, endsText, tallyEnding } from '@/modules/reports/lib/crewReports';
import { buildExportTable } from '@/lib/export';
import type { ContractReportRow, FleetReportContractsJson } from '@/modules/reports/types/db.pending';

const DEF = getReport('contracts-ending', 'fleet') as ReportDefinition;

const SQL_TEST = readFileSync(join(process.cwd(), 'supabase/tests/sql/fleet/report_crew_sources.test.sql'), 'utf8');

const VESSELS: FleetReportContractsJson['vessels'] = [
  { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', state: 'ok' },
  { vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD', state: 'ok' },
];

function contract(id: string, days: number, overrides: Partial<ContractReportRow> = {}): ContractReportRow {
  return {
    contract_id: id,
    profile_id: `p-${id}`,
    person_name: `Demo ${id}`,
    position: 'Deckhand',
    department: 'deck',
    vessel_id: 'v-dra',
    contract_type: 'fixed_term',
    contract_number: `C-${id}`,
    sea_reference: 'SEA-1',
    status: 'active',
    start_date: '2026-01-01',
    end_date: addDays('2026-11-27', days),
    signed_by_crew_at: '2026-01-02T09:00:00Z',
    signed_by_company_at: '2026-01-02T09:00:00Z',
    agreement_state: 'signed',
    awaiting: null,
    days_left: days,
    bucket: contractBucket(addDays('2026-11-27', days), '2026-11-27'),
    renewal_drafted: false,
    ...overrides,
  };
}

const ROWS: ContractReportRow[] = [
  contract('d45', 45, { vessel_id: 'v-hyd' }),
  contract('ended', -3),
  contract('d20', 20, { renewal_drafted: true }),
  contract('d80', 80),
  contract('today', 0, { vessel_id: null }),
];

const answer = (overrides: Partial<FleetReportContractsJson> = {}): FleetReportContractsJson => ({
  mode: 'ending',
  today: '2026-11-27',
  vessels: VESSELS,
  unassigned: true,
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

function renderReport(url = '/fleet/reports/contracts-ending') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<ContractsEndingReport definition={DEF} />} />
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

describe('contract bucket rule (TS mirror of the SQL)', () => {
  it('answers every SQL case the same way', () => {
    const start = SQL_TEST.indexOf('-- bucket-cases:start');
    const end = SQL_TEST.indexOf('-- bucket-cases:end');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const lines = SQL_TEST.slice(start, end).split('\n').filter((l) => l.trim().startsWith('('));
    expect(lines.length).toBeGreaterThanOrEqual(10);
    const re = /^\('([a-z0-9_]+)', (NULL|-?\d+), (NULL|'[a-z0-9]+')\),?$/;
    for (const line of lines) {
      const m = re.exec(line.trim());
      expect(m, line).not.toBeNull();
      const [, key, days, want] = m as RegExpExecArray;
      const endDate = days === 'NULL' ? null : addDays('2026-11-15', Number(days));
      expect(contractBucket(endDate, '2026-11-15'), key).toBe(want === 'NULL' ? null : want.slice(1, -1));
    }
    expect(contractBucket('2026-11-15', null)).toBeNull();
  });
});

describe('contracts ending (pure)', () => {
  it('filters by window and renewal, soonest first', () => {
    expect(endingRows(ROWS, 'all', 'all').map((r) => r.contract_id)).toEqual(['ended', 'today', 'd20', 'd45', 'd80']);
    expect(endingRows(ROWS, 'ended', 'all').map((r) => r.contract_id)).toEqual(['ended']);
    expect(endingRows(ROWS, 'd30', 'all').map((r) => r.contract_id)).toEqual(['today', 'd20']);
    expect(endingRows(ROWS, 'd60', 'all').map((r) => r.contract_id)).toEqual(['today', 'd20', 'd45']);
    expect(endingRows(ROWS, 'd90', 'none').map((r) => r.contract_id)).toEqual(['today', 'd45', 'd80']);
    expect(endingRows(ROWS, 'all', 'drafted').map((r) => r.contract_id)).toEqual(['d20']);
    expect(endingRows([contract('draft', 10, { status: 'draft' })], 'all', 'all')).toEqual([]);
  });

  it('tallies the buckets and the renewals', () => {
    expect(tallyEnding(ROWS)).toEqual({ total: 5, ended: 1, d30: 2, d60: 1, d90: 1, renewals: 1 });
  });

  it('says when a contract ends, in words', () => {
    expect(endsText(-3)).toBe('Ended 3 days ago');
    expect(endsText(-1)).toBe('Ended 1 day ago');
    expect(endsText(0)).toBe('Ends today');
    expect(endsText(1)).toBe('Ends tomorrow');
    expect(endsText(20)).toBe('Ends in 20 days');
    expect(endsText(null)).toBeNull();
  });

  it('exports the end date, the window and the renewal', () => {
    const table = buildExportTable(endingExportColumns(contractVesselName(VESSELS)), [ROWS[2], ROWS[4]]);
    expect(table.headers).toEqual(['Crew member', 'Position', 'Vessel', 'Ends', 'Days left', 'Window', 'Renewal drafted', 'Contract', 'Type', 'Agreement']);
    expect(table.rows[0]).toEqual(['Demo d20', 'Deckhand', 'DRAAK', '2026-12-17', 20, 'Within 30 days', 'Yes', 'C-d20', 'Fixed term', 'Signed']);
    expect(table.rows[1][2]).toBe('No current vessel');
  });
});

describe('Contracts ending page', () => {
  it('reads the ending contracts once for the default vessels (NULL), ended first', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(5));
    expect(callsOf('fleet_report_contracts')).toEqual([expect.objectContaining({ p_vessel_ids: null, p_mode: 'ending' })]);
    expect(within(bodyRows()[0]).getByText('Ended 3 days ago')).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByText('No current vessel')).toBeInTheDocument();
    expect(within(bodyRows()[2]).getByText('Renewal drafted')).toBeInTheDocument();
    expect(within(bodyRows()[3]).getByRole('link', { name: 'Demo d45' })).toHaveAttribute('href', '/v/hyd/crew/people/p-d45');
  });

  it('counts the windows in tiles; Ended and Within 30 days link to their window', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Contracts ending summary' });
    await within(summary).findByText('1 of 5 contracts have a renewal drafted.');
    expect(within(summary).getByText('Ended, still active').closest('a')).toHaveAttribute('href', '/fleet/reports/contracts-ending?window=ended');
    expect(within(summary).getByText('Within 30 days').closest('a')).toHaveAttribute('href', '/fleet/reports/contracts-ending?window=d30');
  });

  it('applies the filters from the URL', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport('/fleet/reports/contracts-ending?window=d60&renewal=none');
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(5));
  });

  it('says "This report is not set up yet" while the RPC is missing (D-01)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_report_contracts' } } };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_report_contracts: () => {
        calls += 1;
        return calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: answer(), error: null };
      },
    };
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }));
    expect(await screen.findByText('Demo ended')).toBeInTheDocument();
  });

  it('folds into one card per contract below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Contracts ending' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });

  it('enables Export once the rows are ready', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled'));
  });
});
