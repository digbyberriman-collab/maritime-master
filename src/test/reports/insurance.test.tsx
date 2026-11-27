/**
 * Insurance (gap/02 R13, T-248; X5-10B; src/modules/reports/reports/
 * InsuranceReport.tsx, lib/opsReports.ts):
 *
 * - pure: the kind of cover a free-text policy type belongs to; the Status
 *   and Cover filters keep the server's order; the tallies; the cover
 *   matrix (the policy ending last per vessel and kind, the fleet's policy
 *   when a vessel has none, "none" otherwise) and the vessels with no P&I,
 *   hull or crew policy; the export columns (no amounts, contacts or notes);
 * - the page: one read of `fleet_report_insurance` for the default vessels
 *   (NULL); most urgent first with the engine's bucket; fleet policies
 *   listed as "Fleet policy" and only when the server lists them; the cover
 *   matrix and the "No policy recorded" note; tiles linking to their
 *   bucket; filters from the URL; not set up (D-01); an error with Retry;
 *   cards below 768 px; Export once ready.
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

import InsuranceReport from '@/modules/reports/reports/InsuranceReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  FLEET_COVER_ROW,
  coverMatrix,
  insuranceExportColumns,
  insuranceRows,
  missingCover,
  policyClass,
  policyClassNote,
  policyStatusLabel,
  tallyInsurance,
  vesselLabeller,
} from '@/modules/reports/lib/opsReports';
import { buildExportTable } from '@/lib/export';
import type { FleetReportInsuranceJson, InsurancePolicyRow } from '@/modules/reports/types/db.pending';

const DEF = getReport('insurance', 'fleet') as ReportDefinition;

const VESSELS: FleetReportInsuranceJson['vessels'] = [
  { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', state: 'ok' },
  { vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD', state: 'ok' },
  { vessel_id: 'v-lev', vessel_name: 'LEVIATHAN', vessel_code: 'LEV', state: 'no_access' },
];

function policy(id: string, overrides: Partial<InsurancePolicyRow> = {}): InsurancePolicyRow {
  return {
    policy_id: id,
    vessel_id: 'v-dra',
    policy_type: 'P&I',
    insurer: 'Mutual Club',
    policy_number: `POL-${id}`,
    coverage_start: '2026-01-01',
    coverage_end: '2027-01-01',
    days_remaining: 35,
    bucket: 'expiring',
    window_days: 90,
    status: 'active',
    certificate_on_file: false,
    ...overrides,
  };
}

const ROWS: InsurancePolicyRow[] = [
  policy('p1', { bucket: 'expired', days_remaining: -5, coverage_end: '2026-11-22', certificate_on_file: true }),
  policy('p2', { policy_type: 'Hull & Machinery', insurer: 'Insurer One', bucket: 'expiring_soon', days_remaining: 20, coverage_end: '2026-12-17', status: 'pending_renewal' }),
  policy('p5', { vessel_id: null, policy_type: 'Crew Medical', insurer: 'Insurer Three', days_remaining: 45, coverage_end: '2027-01-11' }),
  policy('p4', { vessel_id: 'v-hyd', policy_type: 'Hull & Machinery', bucket: 'valid', days_remaining: 400, coverage_end: '2027-12-31' }),
  policy('p6', { policy_type: 'War risks', bucket: 'valid', days_remaining: 200, coverage_end: '2027-06-15' }),
];

const answer = (overrides: Partial<FleetReportInsuranceJson> = {}): FleetReportInsuranceJson => ({
  today: '2026-11-27',
  vessels: VESSELS,
  fleet_level: true,
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

function renderReport(url = '/fleet/reports/insurance') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<InsuranceReport definition={DEF} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);
const policyRows = () => within(screen.getByRole('table', { name: 'Insurance policies' })).getAllByRole('row').slice(1);

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

describe('insurance (pure)', () => {
  it('sorts a free-text policy type into its kind of cover', () => {
    const cases: Array<[string | null, string]> = [
      ['P&I', 'pi'],
      ['P & I', 'pi'],
      ['Protection & Indemnity', 'pi'],
      ['P and I club entry', 'pi'],
      ['Hull & Machinery', 'hull'],
      ['H&M', 'hull'],
      ['Hull', 'hull'],
      ['Crew Medical', 'crew'],
      ["Crew & Employer's Liability", 'crew'],
      ['War risks', 'war'],
      ['War & Piracy', 'war'],
      ['Kidnap and ransom', 'war'],
      ['Pollution Liability', 'pollution'],
      ['Oil pollution (CLC)', 'pollution'],
      ['Wreck Removal', 'other'],
      ['Hullabaloo', 'other'],
      [null, 'other'],
    ];
    for (const [type, want] of cases) expect(policyClass(type), String(type)).toBe(want);
  });

  it('notes the kind of cover under a policy type only when the type does not already say it', () => {
    expect(policyClassNote('P&I')).toBeNull();
    expect(policyClassNote('Hull & Machinery')).toBeNull();
    expect(policyClassNote('Crew Medical')).toBeNull();
    expect(policyClassNote('War risks')).toBe('War and piracy');
    expect(policyClassNote('Loss of hire')).toBe('Other cover');
    expect(policyClassNote(null)).toBe('Other cover');
  });

  it('filters by Status and Cover in the server order', () => {
    const ids = (rows: InsurancePolicyRow[]) => rows.map((r) => r.policy_id);
    expect(ids(insuranceRows(ROWS, 'all', 'all'))).toEqual(['p1', 'p2', 'p5', 'p4', 'p6']);
    expect(ids(insuranceRows(ROWS, 'due', 'all'))).toEqual(['p1', 'p2', 'p5']);
    expect(ids(insuranceRows(ROWS, 'expired', 'all'))).toEqual(['p1']);
    expect(ids(insuranceRows(ROWS, 'expiring_soon', 'all'))).toEqual(['p2']);
    expect(ids(insuranceRows(ROWS, 'expiring', 'all'))).toEqual(['p5']);
    expect(ids(insuranceRows(ROWS, 'valid', 'all'))).toEqual(['p4', 'p6']);
    expect(ids(insuranceRows(ROWS, 'all', 'hull'))).toEqual(['p2', 'p4']);
    expect(ids(insuranceRows(ROWS, 'valid', 'war'))).toEqual(['p6']);
    expect(ids(insuranceRows(ROWS, 'all', 'unknown'))).toEqual(['p1', 'p2', 'p5', 'p4', 'p6']);
  });

  it('tallies the buckets and the fleet policies', () => {
    expect(tallyInsurance(ROWS)).toEqual({ total: 5, expired: 1, expiring_soon: 1, expiring: 1, valid: 2, fleet: 1 });
  });

  it('builds the cover matrix: the policy ending last, the fleet one when a vessel has none, else none', () => {
    const later = policy('p1b', { coverage_end: '2027-11-22', bucket: 'valid', days_remaining: 360 });
    const m = coverMatrix([...ROWS, later], VESSELS, true);
    expect(m.rows.map((r) => r.id)).toEqual(['v-dra', 'v-hyd', FLEET_COVER_ROW]);
    expect(m.classes).toEqual(['pi', 'hull', 'crew', 'war']);
    const dra = m.cell('v-dra', 'pi');
    expect(dra).toMatchObject({ kind: 'vessel', count: 2 });
    expect(dra.kind !== 'none' && dra.policy.policy_id).toBe('p1b');
    expect(m.cell('v-hyd', 'pi')).toEqual({ kind: 'none' });
    expect(m.cell('v-hyd', 'crew')).toMatchObject({ kind: 'fleet', count: 1 });
    expect(m.cell(FLEET_COVER_ROW, 'crew')).toMatchObject({ kind: 'fleet' });
    expect(m.cell(FLEET_COVER_ROW, 'pi')).toEqual({ kind: 'none' });
    expect(missingCover(m)).toEqual([{ vessel: 'HYDRA', cover: 'P&I' }]);
    // Without fleet reach there is no fleet row and no fleet fallback is listed by the server.
    const own = coverMatrix(ROWS.filter((r) => r.vessel_id), VESSELS, false);
    expect(own.rows.map((r) => r.id)).toEqual(['v-dra', 'v-hyd']);
    expect(missingCover(own)).toEqual([
      { vessel: 'DRAAK', cover: 'Crew and medical' },
      { vessel: 'HYDRA', cover: 'P&I' },
      { vessel: 'HYDRA', cover: 'Crew and medical' },
    ]);
  });

  it('exports the policy, its cover dates and expiry, never amounts or contacts', () => {
    const table = buildExportTable(insuranceExportColumns(vesselLabeller(VESSELS, 'Fleet policy')), [ROWS[1], ROWS[2]]);
    expect(table.headers).toEqual([
      'Vessel',
      'Cover',
      'Policy type',
      'Insurer',
      'Policy number',
      'Cover from',
      'Cover ends',
      'Days left',
      'Expiry',
      'Warning window (days)',
      'Status',
      'Certificate on file',
    ]);
    expect(table.rows[0]).toEqual(['DRAAK', 'Hull and machinery', 'Hull & Machinery', 'Insurer One', 'POL-p2', '2026-01-01', '2026-12-17', 20, 'Within 30 days', 90, 'Renewal pending', 'No']);
    expect(table.rows[1][0]).toBe('Fleet policy');
    expect(policyStatusLabel('active')).toBe('Active');
    expect(policyStatusLabel(null)).toBeNull();
  });
});

describe('Insurance page', () => {
  it('reads once for the default vessels (NULL) and lists the policies most urgent first', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table', { name: 'Insurance policies' });
    await waitFor(() => expect(policyRows()).toHaveLength(5));
    expect(callsOf('fleet_report_insurance')).toEqual([expect.objectContaining({ p_vessel_ids: null })]);
    expect(within(policyRows()[0]).getByText('POL-p1')).toBeInTheDocument();
    expect(within(policyRows()[0]).getByText('On file')).toBeInTheDocument();
    expect(within(policyRows()[2]).getByText('Fleet policy')).toBeInTheDocument();
    expect(screen.getByText(/Fleet policies \(no vessel\) are listed too/)).toBeInTheDocument();
    expect(screen.getByText(/Not covered:/).closest('p')).toHaveTextContent('LEVIATHAN (you cannot see this on this vessel)');
  });

  it('shows cover by vessel and names the vessels with no core policy', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: answer(), error: null } };
    renderReport();
    const grid = await screen.findByRole('table', { name: 'Cover by vessel' });
    expect(within(grid).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['P&I', 'Hull and machinery', 'Crew and medical', 'War and piracy']),
    );
    expect(within(grid).getByText('HYDRA, P&I: No policy')).toBeInTheDocument();
    expect(within(grid).getByText(/HYDRA, Crew and medical: Fleet policy, ends 11 Jan 2027/)).toBeInTheDocument();
    const note = screen.getByText(/No policy recorded:/).closest('p') as HTMLElement;
    // DRAAK and HYDRA are covered for crew by the fleet policy; only HYDRA's P&I is missing.
    expect(note).toHaveTextContent('No policy recorded: HYDRA (P&I).');
    expect(note).not.toHaveTextContent('Crew and medical');
  });

  it('counts each bucket in tiles that link to it', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: answer(), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Insurance summary' });
    await within(summary).findByText('Warning window 90 days');
    expect(within(summary).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/fleet/reports/insurance?status=expired',
      '/fleet/reports/insurance?status=expiring_soon',
      '/fleet/reports/insurance?status=expiring',
      '/fleet/reports/insurance?status=valid',
    ]);
    expect(within(summary).getByText('5 policies in all')).toBeInTheDocument();
  });

  it('applies the filters from the URL', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: answer(), error: null } };
    renderReport('/fleet/reports/insurance?status=valid&type=hull');
    await screen.findByRole('table', { name: 'Insurance policies' });
    await waitFor(() => expect(policyRows()).toHaveLength(1));
    expect(within(policyRows()[0]).getByText('POL-p4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(policyRows()).toHaveLength(5));
  });

  it('lists no fleet policy and no fleet row when the server does not (no fleet reach)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: answer({ fleet_level: false, rows: ROWS.filter((r) => r.vessel_id) }), error: null } };
    renderReport();
    const grid = await screen.findByRole('table', { name: 'Cover by vessel' });
    expect(within(grid).queryByText('Fleet policies')).toBeNull();
    expect(screen.queryByText(/Fleet policies \(no vessel\)/)).toBeNull();
  });

  it('says "This report is not set up yet" while the RPC is missing (D-01)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_report_insurance' } } };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('an answer it cannot read is an error, never a guess', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: { ...answer(), rows: [{ policy_id: 'x', bucket: 'nearly' }] }, error: null } };
    renderReport();
    expect(await screen.findByText(/cannot show/)).toBeInTheDocument();
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_report_insurance: () => {
        calls += 1;
        return calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: answer(), error: null };
      },
    };
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }));
    expect(await screen.findByText('POL-p1')).toBeInTheDocument();
  });

  it('folds into one card per policy below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: answer(), error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Insurance policies' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });

  it('enables Export once the rows are ready', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_insurance: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table', { name: 'Insurance policies' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled'));
  });
});
