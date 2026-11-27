/**
 * Crew qualifications (gap/02 R5; X5-10A, agreement 5;
 * src/modules/reports/reports/CrewQualificationsReport.tsx,
 * lib/crewReports.ts, hooks/useCrewReports.ts):
 *
 * - pure: "Required by position" keeps people whose position requires
 *   something, "All crew" everyone; the status filter (missing or expired,
 *   …); worst first; the tallies; vessels with nothing required; names,
 *   tab pairs, the unmet list, the export columns;
 * - the page: one read of `fleet_report_crew_qualifications` for the
 *   vessels shown (NULL for the default); the RPC missing, or X1's engine
 *   missing (`state: 'not_set_up'`), is the PageEmpty "Crew qualification
 *   requirements are not set up yet", never zeros; rows with status, met
 *   of required and what is not met; "Not covered" and "No requirements
 *   set" named; filters from the URL; KPI tiles linking to a status; an
 *   error with Retry; a vessel out of reach in words; cards below 768 px;
 *   Export once ready.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

import CrewQualificationsReport from '@/modules/reports/reports/CrewQualificationsReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  CREW_QUALIFICATIONS_NOT_SET_UP,
  crewPersonName,
  issuesSummary,
  qualificationExportColumns,
  qualificationRows,
  tabPair,
  tallyQualifications,
  vesselsWithoutRequirements,
} from '@/modules/reports/lib/crewReports';
import { buildExportTable } from '@/lib/export';
import { VESSEL_OUT_OF_REACH_MESSAGE } from '@/modules/fleet';
import type { CrewQualificationRow, FleetReportCrewQualificationsJson, ReportVesselCoverage } from '@/modules/reports/types/db.pending';

const DEF = getReport('crew-qualifications', 'fleet') as ReportDefinition;

const VESSELS: ReportVesselCoverage[] = [
  { vessel_id: 'v-dag', vessel_name: 'DAGON', vessel_code: 'DAG', state: 'ok' },
  { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', state: 'ok' },
  { vessel_id: 'v-gam', vessel_name: 'GAME CHANGER', vessel_code: 'GAM', state: 'module_off' },
];

function person(vessel: string, last: string, overrides: Partial<CrewQualificationRow> = {}): CrewQualificationRow {
  return {
    vessel_id: vessel,
    profile_id: `p-${last.toLowerCase()}`,
    first_name: 'Demo',
    last_name: last,
    preferred_name: null,
    position_name: last,
    position_text: last,
    department_key: 'deck',
    rank_tier: null,
    sort_order: 10,
    placement_kind: 'assignment',
    required: 4,
    met: 4,
    expiring: 0,
    expired: 0,
    missing: 0,
    conditional: 0,
    muted: 0,
    docs_required: 1,
    docs_met: 1,
    stcw_required: 2,
    stcw_met: 2,
    quals_required: 1,
    quals_met: 1,
    fam_required: 0,
    fam_met: 0,
    status: 'complete',
    next_expiry: '2027-03-01',
    issues: [],
    ...overrides,
  };
}

const ROWS: CrewQualificationRow[] = [
  person('v-dra', 'Bosun', { met: 3, missing: 1, stcw_met: 1, status: 'missing', issues: [{ row_id: 'r1', label: 'Advanced fire fighting', tab: 'stcw', state: 'missing', reason: 'missing' }] }),
  person('v-dra', 'Master', { sort_order: 1 }),
  person('v-dra', 'Engineer', {
    met: 3,
    expired: 1,
    quals_met: 0,
    status: 'expired',
    issues: [
      { row_id: 'r2', label: 'Engine watch', tab: 'qualifications', state: 'expired', reason: 'expired' },
      { row_id: 'r3', label: 'High voltage', tab: 'qualifications', state: 'expired', reason: 'expired' },
      { row_id: 'r4', label: 'Medical care', tab: 'stcw', state: 'expired', reason: 'expired' },
    ],
  }),
  person('v-dra', 'Stew', { expiring: 1, status: 'expiring', placement_kind: 'planned' }),
  person('v-dag', 'Deckhand', { required: 0, met: 0, docs_required: 0, docs_met: 0, stcw_required: 0, stcw_met: 0, quals_required: 0, quals_met: 0 }),
];

const answer = (overrides: Partial<FleetReportCrewQualificationsJson> = {}): FleetReportCrewQualificationsJson => ({
  state: 'ok',
  today: '2026-11-27',
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

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderReport(url = '/fleet/reports/crew-qualifications') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/fleet/reports/:reportKey"
            element={
              <>
                <CrewQualificationsReport definition={DEF} />
                <Where />
              </>
            }
          />
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

describe('crew qualifications (pure)', () => {
  it('"Required by position" keeps people whose position requires something; "All crew" everyone; worst first', () => {
    expect(qualificationRows(ROWS, VESSELS, 'required', 'all').map((r) => r.last_name)).toEqual(['Engineer', 'Bosun', 'Stew', 'Master']);
    expect(qualificationRows(ROWS, VESSELS, 'all', 'all').map((r) => r.last_name)).toEqual(['Engineer', 'Bosun', 'Stew', 'Deckhand', 'Master']);
  });

  it('filters by status, with "missing or expired" beyond the reference', () => {
    expect(qualificationRows(ROWS, VESSELS, 'required', 'needs-action').map((r) => r.status)).toEqual(['expired', 'missing']);
    expect(qualificationRows(ROWS, VESSELS, 'required', 'expiring').map((r) => r.last_name)).toEqual(['Stew']);
    expect(qualificationRows(ROWS, VESSELS, 'all', 'complete').map((r) => r.last_name)).toEqual(['Deckhand', 'Master']);
  });

  it('tallies people per status and names covered vessels with nothing required', () => {
    expect(tallyQualifications(qualificationRows(ROWS, VESSELS, 'required', 'all'))).toEqual({ people: 4, complete: 1, expiring: 1, missing: 1, expired: 1 });
    expect(vesselsWithoutRequirements(ROWS, VESSELS).map((v) => v.vessel_name)).toEqual(['DAGON']);
    expect(vesselsWithoutRequirements([], VESSELS)).toEqual([]);
  });

  it('writes names, tab pairs and the unmet list', () => {
    expect(crewPersonName({ first_name: 'Demo', last_name: 'Bosun', preferred_name: 'Deck' })).toBe('Deck Bosun');
    expect(crewPersonName({ first_name: null, last_name: null, preferred_name: null })).toBe('Name not recorded');
    expect(tabPair(1, 2)).toBe('1 of 2');
    expect(tabPair(0, 0)).toBeNull();
    expect(issuesSummary(ROWS[2].issues)).toEqual({ shown: ['Engine watch', 'High voltage'], more: 1 });
  });

  it('exports the rows on screen with every tab and what is not met', () => {
    const table = buildExportTable(qualificationExportColumns((id) => VESSELS.find((v) => v.vessel_id === id)?.vessel_name ?? '?'), [ROWS[2]]);
    expect(table.headers).toEqual(['Vessel', 'Crew member', 'Position', 'Status', 'Met', 'Required', 'Documents', 'STCW', 'Qualifications', 'Familiarisation', 'Next expiry', 'Not met']);
    expect(table.rows[0]).toEqual(['DRAAK', 'Demo Engineer', 'Engineer', 'Expired', 3, 4, '1 of 1', '2 of 2', '0 of 1', null, '2027-03-01', 'Engine watch; High voltage; Medical care']);
  });
});

describe('Crew qualifications page', () => {
  it('says the requirements are not set up while the RPC is missing (D-01), never zeros', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_crew_qualifications: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_report_crew_qualifications' } } };
    renderReport();
    expect(await screen.findByRole('heading', { name: CREW_QUALIFICATIONS_NOT_SET_UP })).toBeInTheDocument();
    expect(CREW_QUALIFICATIONS_NOT_SET_UP).toBe('Crew qualification requirements are not set up yet');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Crew checked')).toBeNull();
  });

  it('says the same while X1’s requirement engine is missing on the server', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_crew_qualifications: { data: answer({ state: 'not_set_up', rows: [] }), error: null } };
    renderReport();
    expect(await screen.findByRole('heading', { name: CREW_QUALIFICATIONS_NOT_SET_UP })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: /Export/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('reads once for the default vessels (NULL) and lists the people whose position requires something, worst first', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_crew_qualifications: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(4));
    expect(callsOf('fleet_report_crew_qualifications')).toEqual([{ p_vessel_ids: null }]);
    const first = bodyRows()[0];
    expect(within(first).getByRole('link', { name: 'Demo Engineer' })).toHaveAttribute('href', '/v/dra/crew/people/p-engineer');
    expect(within(first).getByText('Expired')).toBeInTheDocument();
    expect(within(first).getByText('Engine watch, High voltage')).toBeInTheDocument();
    expect(within(first).getByText(', and 1 more')).toBeInTheDocument();
    expect(within(bodyRows()[2]).getByText('Joining')).toBeInTheDocument();
    expect(screen.getByText(/GAME CHANGER \(the crew module is switched off on this vessel\)/)).toBeInTheDocument();
    expect(screen.getByText('No requirements set:', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'DAGON' })).toHaveAttribute('href', '/v/dag/crew/compliance');
  });

  it('counts people per status in the tiles, each linking to that status', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_crew_qualifications: { data: answer(), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Crew qualifications summary' });
    await within(summary).findByText('1 missing · 1 expired');
    expect(within(summary).getByText('On 2 of 3 vessels')).toBeInTheDocument();
    expect(within(summary).getByText('Missing or expired').closest('a')).toHaveAttribute('href', '/fleet/reports/crew-qualifications?status=needs-action');
  });

  it('applies Show and Status from the URL, and Reset clears them', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_crew_qualifications: { data: answer(), error: null } };
    renderReport('/fleet/reports/crew-qualifications?show=all&status=complete');
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(within(bodyRows()[0]).getByText('Nothing required')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(4));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/fleet\/reports\/crew-qualifications$/);
  });

  it('sends a chosen set of vessels as their ids', async () => {
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false, shownVessels: [{ id: 'v-dra', name: 'DRAAK', code: 'DRA' }] });
    state.answers = { fleet_report_crew_qualifications: { data: answer({ vessels: [VESSELS[1]], rows: ROWS.slice(0, 4) }), error: null } };
    renderReport('/fleet/reports/crew-qualifications?vessels=DRA');
    await screen.findByRole('table');
    expect(callsOf('fleet_report_crew_qualifications')[0]).toEqual({ p_vessel_ids: ['v-dra'] });
  });

  it('a vessel out of reach says so in words and is not retried', async () => {
    state.shown = shownReady({ shownIds: ['v-dra'], isDefault: false });
    state.answers = { fleet_report_crew_qualifications: { data: null, error: { code: '42501', message: 'vessel_out_of_reach' } } };
    renderReport();
    expect(await screen.findByText(VESSEL_OUT_OF_REACH_MESSAGE)).toBeInTheDocument();
    expect(callsOf('fleet_report_crew_qualifications')).toHaveLength(1);
  });

  it('an answer it cannot read is an error, not a guess', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_crew_qualifications: { data: { state: 'ok', rows: 'nope' }, error: null } };
    renderReport();
    expect(await screen.findByText(/cannot show/)).toBeInTheDocument();
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_report_crew_qualifications: () => {
        calls += 1;
        return calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: answer(), error: null };
      },
    };
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }));
    expect(await screen.findByText('Demo Engineer')).toBeInTheDocument();
  });

  it('folds into one card per person below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_report_crew_qualifications: { data: answer(), error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Crew qualifications' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    expect(within(cards[0]).getByText('Qualifications')).toBeInTheDocument();
    expect(within(cards[0]).getByText('0 of 1')).toBeInTheDocument();
  });

  it('enables Export once the rows are ready', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_crew_qualifications: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled'));
  });
});
