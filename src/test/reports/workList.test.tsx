/**
 * Work list (gap/02 R18, T-248; X5-10B; src/modules/reports/reports/
 * WorkListReport.tsx, lib/opsReports.ts):
 *
 * - pure: the status chips (overdue, awaiting approval, then each live
 *   status; none for zero); the Vessels filter keeps vessels most overdue
 *   first, vessels not covered last; the overdue jobs' priority filter; the
 *   priority tones; the export columns ("–" never 0 for a vessel not
 *   covered);
 * - the page: one read of `fleet_report_work_list` for the default vessels
 *   (NULL); per-vessel numbers and chips; a vessel with Jobs off named in
 *   "Not covered" with no numbers; the overdue jobs most overdue first with
 *   their total; the no-cost note; tiles linking to their filter; filters
 *   from the URL; not set up (D-01); an error with Retry; cards below
 *   768 px; Export once ready.
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

import WorkListReport from '@/modules/reports/reports/WorkListReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import { isHighPriority, overdueJobRows, priorityTone, workChips, workVesselExportColumns, workVesselRows } from '@/modules/reports/lib/opsReports';
import { buildExportTable } from '@/lib/export';
import type { FleetReportWorkListJson, OverdueJobRow, WorkListVesselRow } from '@/modules/reports/types/db.pending';

const DEF = getReport('work-list', 'fleet') as ReportDefinition;

const NOT_COVERED = { open: null, overdue: null, pending_approval: null, due_30: null, high_priority: null, completed_30: null, statuses: null };

const VESSELS: WorkListVesselRow[] = [
  { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', state: 'ok', open: 6, overdue: 3, pending_approval: 1, due_30: 1, high_priority: 2, completed_30: 1, statuses: { in_progress: 1, overdue: 3, pending: 1, pending_approval: 1 } },
  { vessel_id: 'v-gam', vessel_name: 'GAME CHANGER', vessel_code: 'GAM', state: 'ok', open: 1, overdue: 1, pending_approval: 0, due_30: 0, high_priority: 0, completed_30: 0, statuses: { overdue: 1 } },
  { vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD', state: 'module_off', ...NOT_COVERED },
  { vessel_id: 'v-rox', vessel_name: 'ROCINANTE', vessel_code: 'ROC', state: 'ok', open: 0, overdue: 0, pending_approval: 0, due_30: 0, high_priority: 0, completed_30: 4, statuses: {} },
];

function job(id: string, overrides: Partial<OverdueJobRow> = {}): OverdueJobRow {
  return {
    job_id: id,
    vessel_id: 'v-dra',
    task_number: `OPS-${id}`,
    task_name: `Job ${id}`,
    equipment_name: 'Main engine',
    priority: 'Normal',
    status: 'Pending',
    due_date: '2026-11-17',
    days_overdue: 10,
    ...overrides,
  };
}

const JOBS: OverdueJobRow[] = [
  job('j1', { priority: 'High' }),
  job('j2', { days_overdue: 2, due_date: '2026-11-25', status: 'Scheduled' }),
  job('j10', { vessel_id: 'v-gam', days_overdue: 1, due_date: '2026-11-26' }),
  job('j3', { priority: 'Urgent', status: 'Overdue', days_overdue: 0, due_date: '2026-12-02' }),
];

const answer = (overrides: Partial<FleetReportWorkListJson> = {}): FleetReportWorkListJson => ({
  today: '2026-11-27',
  vessels: VESSELS,
  totals: { vessels_covered: 3, open: 7, overdue: 4, pending_approval: 1, due_30: 1, high_priority: 2, completed_30: 5 },
  overdue: { total: 4, rows: JOBS },
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

function renderReport(url = '/fleet/reports/work-list') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<WorkListReport definition={DEF} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);
const rowsOf = (name: string) => within(screen.getByRole('table', { name })).getAllByRole('row').slice(1);

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

describe('work list (pure)', () => {
  it('orders the chips overdue first, then awaiting approval, then each live status', () => {
    expect(workChips(VESSELS[0].statuses).map((c) => `${c.label} ${c.count}`)).toEqual(['Overdue 3', 'Awaiting approval 1', 'In progress 1', 'Pending 1']);
    expect(workChips({ on_hold: 2, scheduled: 1 }).map((c) => [c.label, c.tone])).toEqual([
      ['Scheduled', 'info'],
      ['On hold', 'neutral'],
    ]);
    expect(workChips({ overdue: 0 })).toEqual([]);
    expect(workChips(null)).toEqual([]);
  });

  it('keeps vessels most overdue first, vessels not covered last', () => {
    expect(workVesselRows(VESSELS, 'all').map((r) => r.vessel_name)).toEqual(['DRAAK', 'GAME CHANGER', 'ROCINANTE', 'HYDRA']);
    expect(workVesselRows(VESSELS, 'overdue').map((r) => r.vessel_name)).toEqual(['DRAAK', 'GAME CHANGER']);
    expect(workVesselRows(VESSELS, 'approval').map((r) => r.vessel_name)).toEqual(['DRAAK']);
  });

  it('filters the overdue jobs by priority and tones the priorities', () => {
    expect(overdueJobRows(JOBS, 'all').map((j) => j.job_id)).toEqual(['j1', 'j2', 'j10', 'j3']);
    expect(overdueJobRows(JOBS, 'high').map((j) => j.job_id)).toEqual(['j1', 'j3']);
    expect(isHighPriority('critical')).toBe(true);
    expect(isHighPriority('Normal')).toBe(false);
    expect(priorityTone('Urgent')).toBe('danger');
    expect(priorityTone('High')).toBe('orange');
    expect(priorityTone('Low')).toBe('neutral');
  });

  it('exports each vessel, a vessel not covered with no numbers', () => {
    const table = buildExportTable(workVesselExportColumns(), [VESSELS[0], VESSELS[2], VESSELS[3]]);
    expect(table.headers).toEqual([
      'Vessel',
      'Covered',
      'Open jobs',
      'Overdue',
      'Awaiting approval',
      'Due within 30 days',
      'High or urgent',
      'Completed in the last 30 days',
      'Open jobs by status',
    ]);
    expect(table.rows[0]).toEqual(['DRAAK', 'Yes', 6, 3, 1, 1, 2, 1, 'Overdue 3; Awaiting approval 1; In progress 1; Pending 1']);
    expect(table.rows[1]).toEqual(['HYDRA', 'Jobs switched off', null, null, null, null, null, null, null]);
    expect(table.rows[2][8]).toBe('None');
  });
});

describe('Work list page', () => {
  it('reads once for the default vessels (NULL) and lists each vessel, most overdue first', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_work_list: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table', { name: 'Work list by vessel' });
    await waitFor(() => expect(rowsOf('Work list by vessel')).toHaveLength(4));
    expect(callsOf('fleet_report_work_list')).toEqual([expect.objectContaining({ p_vessel_ids: null })]);
    const [dra, , , hyd] = rowsOf('Work list by vessel');
    expect(within(dra).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra/technical');
    expect(within(dra).getByText('Overdue 3')).toBeInTheDocument();
    expect(within(dra).getByText('Awaiting approval 1')).toBeInTheDocument();
    expect(within(hyd).getByText('HYDRA')).toBeInTheDocument();
    expect(within(hyd).queryByText('0')).toBeNull();
    const coverage = screen.getAllByRole('note').find((n) => /Not covered:/.test(n.textContent ?? ''));
    expect(coverage).toHaveTextContent('HYDRA (Technical › Jobs is switched off on this vessel)');
    expect(screen.getByText('Jobs do not record a cost yet, so this report has no cost column.')).toBeInTheDocument();
  });

  it('lists the overdue jobs most overdue first with their total', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_work_list: { data: answer({ overdue: { total: 340, rows: JOBS } }), error: null } };
    renderReport();
    await screen.findByRole('table', { name: 'Overdue jobs' });
    expect(screen.getByText('The 4 most overdue of 340.')).toBeInTheDocument();
    const rows = rowsOf('Overdue jobs');
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText('10 days overdue')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Marked overdue')).toBeInTheDocument();
    expect(within(rows[2]).getByRole('link', { name: 'GAME CHANGER' })).toHaveAttribute('href', '/v/gam/technical');
  });

  it('counts in tiles that link to their filter', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_work_list: { data: answer(), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Work list summary' });
    await within(summary).findByText('7 open in all');
    expect(within(summary).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/fleet/reports/work-list?show=overdue',
      '/fleet/reports/work-list?show=approval',
      '/fleet/reports/work-list?priority=high',
    ]);
  });

  it('applies the filters from the URL', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_work_list: { data: answer(), error: null } };
    renderReport('/fleet/reports/work-list?show=overdue&priority=high');
    await screen.findByRole('table', { name: 'Work list by vessel' });
    await waitFor(() => expect(rowsOf('Work list by vessel')).toHaveLength(2));
    expect(rowsOf('Overdue jobs')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(rowsOf('Work list by vessel')).toHaveLength(4));
  });

  it('a read with no vessel covered shows no numbers, never zeros', async () => {
    state.shown = shownReady();
    state.answers = {
      fleet_report_work_list: {
        data: answer({ vessels: VESSELS.map((v) => ({ ...v, ...NOT_COVERED, state: 'no_access' as const })), totals: null, overdue: { total: 0, rows: [] } }),
        error: null,
      },
    };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Work list summary' });
    expect(within(summary).getAllByText('Not covered on any vessel shown').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Overdue jobs' })).toBeNull();
  });

  it('says "This report is not set up yet" while the RPC is missing (D-01)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_work_list: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_report_work_list' } } };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_report_work_list: () => {
        calls += 1;
        return calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: answer(), error: null };
      },
    };
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }));
    expect(await screen.findByText('Overdue 3')).toBeInTheDocument();
  });

  it('folds into one card per vessel and per job below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_report_work_list: { data: answer(), error: null } };
    renderReport();
    const vessels = await screen.findByRole('list', { name: 'Work list by vessel' });
    expect(within(vessels).getAllByRole('listitem').filter((li) => li.parentElement === vessels)).toHaveLength(4);
    const jobs = screen.getByRole('list', { name: 'Overdue jobs' });
    expect(within(jobs).getAllByRole('listitem')).toHaveLength(4);
  });

  it('enables Export once the rows are ready', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_work_list: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table', { name: 'Work list by vessel' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled'));
  });
});
