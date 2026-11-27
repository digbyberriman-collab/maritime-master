/**
 * Agreements (gap/02 R10, T-248; X5-10A; src/modules/reports/reports/
 * AgreementsReport.tsx, lib/crewReports.ts):
 *
 * - the agreement rule mirrors the SQL fleet_report_agreement_state /
 *   _awaiting: every case between the `agreement-cases` markers of
 *   supabase/tests/sql/fleet/report_crew_sources.test.sql is asserted here
 *   against the TS too;
 * - pure: the state filter (draft, not yet signed, awaiting the crew
 *   member, awaiting the company, signed), most to do first; the tallies;
 *   the export columns carry no wages or terms;
 * - the page: one read of `fleet_report_contracts` in mode `agreements` for
 *   the vessels shown (NULL for the default); states with who is awaited,
 *   the SEA reference and the signatures; "No current vessel"; the HR rule
 *   not covered in words; the filter from the URL; tiles linking to a
 *   state; not set up (D-01); an error with Retry; cards below 768 px.
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

import AgreementsReport from '@/modules/reports/reports/AgreementsReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  agreementAwaiting,
  agreementExportColumns,
  agreementRows,
  agreementState,
  contractVesselName,
  tallyAgreements,
} from '@/modules/reports/lib/crewReports';
import { buildExportTable } from '@/lib/export';
import type { ContractReportRow, FleetReportContractsJson } from '@/modules/reports/types/db.pending';

const DEF = getReport('agreements', 'fleet') as ReportDefinition;

const SQL_TEST = readFileSync(join(process.cwd(), 'supabase/tests/sql/fleet/report_crew_sources.test.sql'), 'utf8');

function sqlCases(marker: string): string[] {
  const start = SQL_TEST.indexOf(`-- ${marker}:start`);
  const end = SQL_TEST.indexOf(`-- ${marker}:end`);
  expect(start, marker).toBeGreaterThan(0);
  expect(end, marker).toBeGreaterThan(start);
  return SQL_TEST.slice(start, end).split('\n').filter((l) => l.trim().startsWith('('));
}

const VESSELS: FleetReportContractsJson['vessels'] = [
  { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', state: 'ok' },
  { vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD', state: 'no_access' },
];

function contract(id: string, overrides: Partial<ContractReportRow> = {}): ContractReportRow {
  return {
    contract_id: id,
    profile_id: `p-${id}`,
    person_name: `Demo ${id}`,
    position: 'Deckhand',
    department: 'deck',
    vessel_id: 'v-dra',
    contract_type: 'rotational',
    contract_number: `C-${id}`,
    sea_reference: null,
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2027-01-01',
    signed_by_crew_at: null,
    signed_by_company_at: null,
    agreement_state: 'not_signed',
    awaiting: 'both',
    days_left: 35,
    bucket: null,
    renewal_drafted: false,
    ...overrides,
  };
}

const ROWS: ContractReportRow[] = [
  contract('signed', { sea_reference: 'SEA-1', signed_by_crew_at: '2026-01-02T09:00:00Z', signed_by_company_at: '2026-01-03T09:00:00Z', agreement_state: 'signed', awaiting: null }),
  contract('draft', { status: 'draft', agreement_state: 'draft', awaiting: null, start_date: '2027-01-02' }),
  contract('crew', { signed_by_company_at: '2026-02-01T09:00:00Z', awaiting: 'crew' }),
  contract('company', { signed_by_crew_at: '2026-02-01T09:00:00Z', awaiting: 'company', position: null }),
  contract('both', { vessel_id: null, sea_reference: 'SEA-9' }),
];

const answer = (overrides: Partial<FleetReportContractsJson> = {}): FleetReportContractsJson => ({
  mode: 'agreements',
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

function renderReport(url = '/fleet/reports/agreements') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<AgreementsReport definition={DEF} />} />
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

describe('agreement rule (TS mirror of the SQL)', () => {
  it('answers every SQL case the same way', () => {
    const lines = sqlCases('agreement-cases');
    expect(lines.length).toBeGreaterThanOrEqual(9);
    const re = /^\('([a-z_]+)', '([a-z]+)', (NULL|'[^']*'), (true|false), (true|false), '([a-z_]+)', (NULL|'[a-z]+')\),?$/;
    for (const line of lines) {
      const m = re.exec(line.trim());
      expect(m, line).not.toBeNull();
      const [, key, status, sea, crew, company, wantState, wantAwaiting] = m as RegExpExecArray;
      const input = { status, seaReference: sea === 'NULL' ? null : sea.slice(1, -1), signedByCrew: crew === 'true', signedByCompany: company === 'true' };
      expect(agreementState(input), key).toBe(wantState);
      expect(agreementAwaiting(input), key).toBe(wantAwaiting === 'NULL' ? null : wantAwaiting.slice(1, -1));
    }
  });
});

describe('agreements (pure)', () => {
  it('filters by state beyond the reference, most to do first', () => {
    expect(agreementRows(ROWS, 'all').map((r) => r.contract_id)).toEqual(['both', 'company', 'crew', 'draft', 'signed']);
    expect(agreementRows(ROWS, 'awaiting-crew').map((r) => r.contract_id)).toEqual(['both', 'crew']);
    expect(agreementRows(ROWS, 'awaiting-company').map((r) => r.contract_id)).toEqual(['both', 'company']);
    expect(agreementRows(ROWS, 'draft').map((r) => r.contract_id)).toEqual(['draft']);
    expect(agreementRows(ROWS, 'signed').map((r) => r.contract_id)).toEqual(['signed']);
    expect(agreementRows([contract('old', { status: 'expired' })], 'all')).toEqual([]);
  });

  it('tallies the states and who is awaited', () => {
    expect(tallyAgreements(ROWS)).toEqual({ total: 5, draft: 1, not_signed: 3, signed: 1, awaiting_crew: 1, awaiting_company: 1, awaiting_both: 1 });
  });

  it('exports the agreement and its signatures, never wages or terms', () => {
    const table = buildExportTable(agreementExportColumns(contractVesselName(VESSELS)), [ROWS[4]]);
    expect(table.headers).toEqual([
      'Crew member', 'Position', 'Vessel', 'Agreement', 'Awaiting', 'SEA reference', 'Contract', 'Type', 'Starts', 'Ends',
      'Signed by the crew member', 'Signed by the company',
    ]);
    expect(table.rows[0].slice(0, 6)).toEqual(['Demo both', 'Deckhand', 'No current vessel', 'Not yet signed', 'Awaiting both signatures', 'SEA-9']);
    expect(table.headers.join(' ')).not.toMatch(/wage|notice|salary/i);
  });
});

describe('Agreements page', () => {
  it('reads the agreements once for the default vessels (NULL) and shows each with who is awaited', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(5));
    expect(callsOf('fleet_report_contracts')).toHaveLength(1);
    expect(callsOf('fleet_report_contracts')[0]).toMatchObject({ p_vessel_ids: null, p_mode: 'agreements' });
    const first = bodyRows()[0];
    expect(within(first).getByText('Awaiting both signatures')).toBeInTheDocument();
    expect(within(first).getByText('No current vessel')).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByText('Position not recorded')).toBeInTheDocument();
    expect(within(bodyRows()[2]).getByRole('link', { name: 'Demo crew' })).toHaveAttribute('href', '/v/dra/crew/people/p-crew');
    expect(screen.getByText(/HYDRA \(you cannot see this on this vessel\)/)).toBeInTheDocument();
    expect(screen.getByText(/listed too, under “No current vessel”/)).toBeInTheDocument();
  });

  it('counts the states in tiles that link to each state', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Agreements summary' });
    await within(summary).findByText('1 crew · 1 company · 1 both');
    expect(within(summary).getByText('Not yet signed').closest('a')).toHaveAttribute('href', '/fleet/reports/agreements?state=not-signed');
    expect(within(summary).getByText('Draft').closest('a')).toHaveAttribute('href', '/fleet/reports/agreements?state=draft');
  });

  it('applies the state filter from the URL and offers Clear filters when nothing matches', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport('/fleet/reports/agreements?state=awaiting-company');
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    cleanup();
    state.answers = { fleet_report_contracts: { data: answer({ rows: [ROWS[0]] }), error: null } };
    renderReport('/fleet/reports/agreements?state=draft');
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument();
  });

  it('no vessel covered: the tiles say so, never zeros', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer({ vessels: VESSELS.map((v) => ({ ...v, state: 'no_access' as const })), unassigned: false, rows: [] }), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Agreements summary' });
    await waitFor(() => expect(within(summary).getAllByText('Not covered on any vessel shown').length).toBe(4));
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
    expect(await screen.findByText('Demo signed')).toBeInTheDocument();
  });

  it('folds into one card per agreement below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_report_contracts: { data: answer(), error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Agreements' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(5);
    expect(within(cards[0]).getByText('SEA-9')).toBeInTheDocument();
  });
});
