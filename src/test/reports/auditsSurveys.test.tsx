/**
 * Audits and surveys (gap/02 R17, T-248; X5-10B; src/modules/reports/
 * reports/AuditsSurveysReport.tsx, lib/opsReports.ts):
 *
 * - the state rule mirrors the SQL fleet_report_audit_state: every case
 *   between the `audit-state-cases` markers of
 *   supabase/tests/sql/fleet/report_ops_sources.test.sql is asserted here
 *   against the TS too;
 * - pure: the period presets (the default is the SQL default: 365 days back
 *   to 90 ahead); the Show and Status filters keep the server's order; the
 *   tallies; the type, outcome, auditor, findings and "when" words; the
 *   export columns;
 * - the page: one read of `fleet_report_audits` with the period's days and
 *   NULL for the default vessels; rows with their state, outcome, auditor
 *   and findings; company audits under "Company"; surveys linking to the
 *   vessel's certificates; the surveys coverage note; tiles linking to each
 *   state; the period from the URL; the period refusal in words; not set up
 *   (D-01); an error with Retry; cards below 768 px; Export once ready.
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

import AuditsSurveysReport from '@/modules/reports/reports/AuditsSurveysReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import { addDays } from '@/modules/reports/lib/crewReports';
import { todayDateOnly } from '@/shared/lib/form';
import {
  auditExportColumns,
  auditOutcome,
  auditPeriodRange,
  auditRows,
  auditState,
  auditTypeLabel,
  auditWhenText,
  auditorText,
  findingsText,
  tallyAudits,
  vesselLabeller,
} from '@/modules/reports/lib/opsReports';
import { buildExportTable } from '@/lib/export';
import type { AuditSurveyRow, FleetReportAuditsJson } from '@/modules/reports/types/db.pending';

const DEF = getReport('audits-surveys', 'fleet') as ReportDefinition;
const SQL_TEST = readFileSync(join(process.cwd(), 'supabase/tests/sql/fleet/report_ops_sources.test.sql'), 'utf8');

const VESSELS: FleetReportAuditsJson['vessels'] = [
  { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', state: 'ok', surveys_state: 'ok' },
  { vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD', state: 'ok', surveys_state: 'no_access' },
  { vessel_id: 'v-gam', vessel_name: 'GAME CHANGER', vessel_code: 'GAM', state: 'module_off', surveys_state: 'ok' },
];

const FINDINGS = { total: 3, open: 2, major: 1, minor: 1, observations: 1 };

function row(id: string, overrides: Partial<AuditSurveyRow> = {}): AuditSurveyRow {
  return {
    kind: 'audit',
    id,
    vessel_id: 'v-dra',
    reference: `AUD-2026-${id}`,
    title: 'Internal',
    scope: 'Full SMS',
    status: 'Planned',
    state: 'due',
    outcome: null,
    scheduled_on: '2026-12-27',
    started_on: null,
    ended_on: null,
    on_date: '2026-12-27',
    days: 30,
    auditor_org: null,
    auditor_name: null,
    lead_auditor: null,
    findings: { total: 0, open: 0, major: 0, minor: 0, observations: 0 },
    ...overrides,
  };
}

const ROWS: AuditSurveyRow[] = [
  row('a1', { state: 'overdue', on_date: '2026-11-07', scheduled_on: '2026-11-07', days: -20 }),
  row('c3', {
    kind: 'certificate_survey',
    vessel_id: 'v-gam',
    reference: 'C-c3',
    title: 'Load Line Certificate',
    scope: 'Statutory',
    status: null,
    state: 'overdue',
    on_date: '2026-11-24',
    days: -3,
    auditor_org: 'Class',
    findings: null,
  }),
  row('a6', { title: 'External_Intermediate', status: 'In_Progress', state: 'in_progress', started_on: '2026-11-17', on_date: '2026-11-17', days: -10, auditor_org: 'Class society' }),
  row('a10', { vessel_id: null, title: 'External_Annual', on_date: '2026-12-12', days: 15, auditor_org: 'Flag' }),
  row('a3', { lead_auditor: 'Master Lead' }),
  row('a2', {
    title: 'External_Annual',
    status: 'Completed',
    state: 'done',
    outcome: 'Satisfactory_with_Observations',
    on_date: '2026-08-21',
    started_on: '2026-08-21',
    ended_on: '2026-08-22',
    days: -98,
    auditor_org: 'Class society',
    auditor_name: 'Lead surveyor',
    findings: FINDINGS,
  }),
];

const answer = (overrides: Partial<FleetReportAuditsJson> = {}): FleetReportAuditsJson => ({
  from: '2025-11-27',
  to: '2027-02-25',
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

function renderReport(url = '/fleet/reports/audits-surveys') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<AuditsSurveysReport definition={DEF} />} />
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

describe('audit state rule (TS mirror of the SQL)', () => {
  it('answers every SQL case the same way', () => {
    const start = SQL_TEST.indexOf('-- audit-state-cases:start');
    const end = SQL_TEST.indexOf('-- audit-state-cases:end');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const lines = SQL_TEST.slice(start, end).split('\n').filter((l) => l.trim().startsWith('('));
    expect(lines.length).toBeGreaterThanOrEqual(12);
    const re = /^\('([a-z0-9_]+)', (NULL|'[^']*'), (NULL|-?\d+), '([a-z_]+)'\),?$/;
    for (const line of lines) {
      const m = re.exec(line.trim());
      expect(m, line).not.toBeNull();
      const [, key, status, off, want] = m as RegExpExecArray;
      const on = off === 'NULL' ? null : addDays('2026-11-15', Number(off));
      expect(auditState(status === 'NULL' ? null : status.slice(1, -1), on, '2026-11-15'), key).toBe(want);
    }
  });
});

describe('audits and surveys (pure)', () => {
  it('turns a period preset into its days (the default is the SQL default)', () => {
    expect(auditPeriodRange('default', '2026-11-27')).toEqual({ from: '2025-11-27', to: '2027-02-25' });
    expect(auditPeriodRange('next-90', '2026-11-27')).toEqual({ from: '2026-11-27', to: '2027-02-25' });
    expect(auditPeriodRange('next-12-months', '2026-11-27')).toEqual({ from: '2026-11-27', to: '2027-11-27' });
    expect(auditPeriodRange('last-90', '2026-11-27')).toEqual({ from: '2026-08-29', to: '2026-11-27' });
    expect(auditPeriodRange('last-12-months', '2026-11-27')).toEqual({ from: '2025-11-27', to: '2026-11-27' });
    expect(auditPeriodRange('this-year', '2026-11-27')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(auditPeriodRange('last-year', '2026-11-27')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(auditPeriodRange('nonsense', '2026-11-27')).toEqual(auditPeriodRange('default', '2026-11-27'));
  });

  it('filters by Show and Status in the server order', () => {
    const ids = (rows: AuditSurveyRow[]) => rows.map((r) => r.id);
    expect(ids(auditRows(ROWS, 'all', 'all'))).toEqual(['a1', 'c3', 'a6', 'a10', 'a3', 'a2']);
    expect(ids(auditRows(ROWS, 'audits', 'all'))).toEqual(['a1', 'a6', 'a10', 'a3', 'a2']);
    expect(ids(auditRows(ROWS, 'surveys', 'all'))).toEqual(['c3']);
    expect(ids(auditRows(ROWS, 'all', 'open'))).toEqual(['a1', 'c3', 'a6', 'a10', 'a3']);
    expect(ids(auditRows(ROWS, 'all', 'overdue'))).toEqual(['a1', 'c3']);
    expect(ids(auditRows(ROWS, 'all', 'in-progress'))).toEqual(['a6']);
    expect(ids(auditRows(ROWS, 'all', 'due'))).toEqual(['a10', 'a3']);
    expect(ids(auditRows(ROWS, 'all', 'done'))).toEqual(['a2']);
    expect(ids(auditRows(ROWS, 'all', 'findings'))).toEqual(['a2']);
  });

  it('tallies the states, the surveys due and the findings', () => {
    expect(tallyAudits(ROWS)).toEqual({ overdue: 2, in_progress: 1, due: 2, done: 1, surveys_due: 1, open_findings: 2, major_findings: 1 });
  });

  it('words the type, outcome, auditor, findings and when', () => {
    expect(auditTypeLabel('External_Annual')).toBe('External audit (annual)');
    expect(auditTypeLabel('Internal')).toBe('Internal audit');
    expect(auditTypeLabel('Flag_Inspection')).toBe('Flag inspection');
    expect(auditOutcome('Major_NC')).toEqual({ label: 'Major non-conformity', tone: 'danger' });
    expect(auditOutcome('Satisfactory')).toEqual({ label: 'Satisfactory', tone: 'ok' });
    expect(auditOutcome('Some_Other')).toEqual({ label: 'Some other', tone: 'neutral' });
    expect(auditOutcome(null)).toBeNull();
    expect(auditorText(ROWS[5])).toBe('Class society · Lead surveyor');
    expect(auditorText(ROWS[4])).toBe('Master Lead (lead auditor)');
    expect(auditorText(ROWS[1])).toBe('Class');
    expect(auditorText(ROWS[0])).toBeNull();
    expect(findingsText(FINDINGS)).toBe('3, 2 open');
    expect(findingsText({ ...FINDINGS, open: 0 })).toBe('3, all closed');
    expect(findingsText({ total: 0, open: 0, major: 0, minor: 0, observations: 0 })).toBe('None');
    expect(findingsText(null)).toBeNull();
    expect(auditWhenText('overdue', -20)).toBe('20 days overdue');
    expect(auditWhenText('in_progress', -10)).toBe('Started 10 days ago');
    expect(auditWhenText('due', 0)).toBe('Today');
    expect(auditWhenText('due', 1)).toBe('Tomorrow');
    expect(auditWhenText('due', 30)).toBe('In 30 days');
    expect(auditWhenText('done', -98)).toBeNull();
  });

  it('exports the date, vessel, kind, status, outcome, auditor and findings', () => {
    const table = buildExportTable(auditExportColumns(vesselLabeller(VESSELS, 'Company')), [ROWS[5], ROWS[3], ROWS[1]]);
    expect(table.headers).toEqual([
      'Date',
      'Vessel',
      'Kind',
      'Audit or certificate',
      'Scope',
      'Reference',
      'Status',
      'Outcome',
      'Scheduled',
      'Started',
      'Ended',
      'Auditor or surveyor',
      'Findings',
      'Open findings',
      'Major non-conformities',
    ]);
    expect(table.rows[0]).toEqual([
      '2026-08-21', 'DRAAK', 'Audit', 'External audit (annual)', 'Full SMS', 'AUD-2026-a2', 'Done', 'Satisfactory with observations',
      '2026-12-27', '2026-08-21', '2026-08-22', 'Class society · Lead surveyor', 3, 2, 1,
    ]);
    expect(table.rows[1][1]).toBe('Company');
    expect(table.rows[2].slice(2, 4)).toEqual(['Certificate survey', 'Load Line Certificate']);
    expect(table.rows[2].slice(12)).toEqual([null, null, null]);
  });
});

describe('Audits and surveys page', () => {
  it('reads once for the default period and vessels, and lists each row with its state and findings', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_audits: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(6));
    const today = todayDateOnly();
    expect(callsOf('fleet_report_audits')).toEqual([
      expect.objectContaining({ p_vessel_ids: null, p_from: addDays(today, -365), p_to: addDays(today, 90), p_today: today }),
    ]);
    expect(within(bodyRows()[0]).getByText('20 days overdue')).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByRole('link', { name: 'GAME CHANGER' })).toHaveAttribute('href', '/v/gam/certificates');
    expect(within(bodyRows()[1]).getByText('Not recorded for surveys')).toBeInTheDocument();
    expect(within(bodyRows()[3]).getByText('Company')).toBeInTheDocument();
    expect(within(bodyRows()[5]).getByText('Satisfactory with observations')).toBeInTheDocument();
    expect(within(bodyRows()[5]).getByText('3, 2 open')).toBeInTheDocument();
    expect(within(bodyRows()[5]).getByText('1 major')).toBeInTheDocument();
    expect(screen.getByText(/Company audits \(no vessel\) are listed too/)).toBeInTheDocument();
    expect(screen.getByText(/Not covered:/).closest('p')).toHaveTextContent('GAME CHANGER (Safety is switched off on this vessel)');
    expect(screen.getByText(/Certificate surveys not covered:/).closest('p')).toHaveTextContent('HYDRA');
  });

  it('counts each state in tiles that link to it', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_audits: { data: answer(), error: null } };
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Audits and surveys summary' });
    await within(summary).findByText('1 major non-conformity recorded');
    expect(within(summary).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/fleet/reports/audits-surveys?state=overdue',
      '/fleet/reports/audits-surveys?state=in-progress',
      '/fleet/reports/audits-surveys?state=due',
      '/fleet/reports/audits-surveys?state=findings',
    ]);
    expect(within(summary).getByText(/Overdue and in-progress audits are listed whatever their date/)).toBeInTheDocument();
  });

  it('reads the period chosen in the URL and filters by Show and Status', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_audits: { data: answer(), error: null } };
    renderReport('/fleet/reports/audits-surveys?period=next-90&kind=audits&state=open');
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(4));
    const today = todayDateOnly();
    expect(callsOf('fleet_report_audits')[0]).toMatchObject({ p_from: today, p_to: addDays(today, 90) });
  });

  it('says a refused period in words and does not retry', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_audits: { data: null, error: { code: '22023', message: 'period_too_long' } } };
    renderReport();
    expect(await screen.findByText(/at most two years/)).toBeInTheDocument();
    expect(callsOf('fleet_report_audits')).toHaveLength(1);
  });

  it('says "This report is not set up yet" while the RPC is missing (D-01)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_audits: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_report_audits' } } };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_report_audits: () => {
        calls += 1;
        return calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: answer(), error: null };
      },
    };
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }));
    expect(await screen.findByText('20 days overdue')).toBeInTheDocument();
  });

  it('folds into one card per row below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    state.answers = { fleet_report_audits: { data: answer(), error: null } };
    renderReport();
    const list = await screen.findByRole('list', { name: 'Audits and surveys' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
  });

  it('enables Export once the rows are ready', async () => {
    state.shown = shownReady();
    state.answers = { fleet_report_audits: { data: answer(), error: null } };
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled'));
  });
});
