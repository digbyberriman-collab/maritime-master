/**
 * The vessel's hours-of-rest report page (HoursOfRestReportPage; gap/04
 * C44, C41, C42; C45; D-01, D-X1-23, EX1, EX4; X1-08B):
 *
 * - the gate: loading reads nothing and shows nothing of the report;
 *   denied is AccessDenied with a link to the viewer's own month;
 * - populated: the four KPIs (and the board month each opens, approvers
 *   only), By month newest first with its submission summary, Open
 *   breaches, Breach reports sent (with ?report= marked), the Reminders
 *   log and the "Automatic reminders are not scheduled yet" notice;
 * - a viewer without approval: no links to the board, no breach or
 *   reminder reads, the panels say who sees them, no Create breach report;
 * - months before the Hours of Rest start date are not expected (C45);
 * - empty: a year with nobody on board; the year in the URL;
 * - D-01: the statistics RPC missing is the not-set-up page; a 42501 is no
 *   access; any other error is KPI errors and PageError with Try again;
 * - Export all months: logged first, then downloaded under the EX1 name;
 *   refused with nothing downloaded while the export log is missing;
 * - a breach report's PDF: its breaches are read, the export logged, then
 *   downloaded; ?new=1 opens the breach report dialog for the final
 *   approver only.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

type Answer = { data: unknown; error: unknown };
type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  caps: {} as Record<string, 'granted' | 'denied' | 'loading'>,
  answers: {} as Record<string, (args: Record<string, unknown>) => Answer>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  events: [] as string[],
  rpcArgs: [] as { name: string; args: Record<string, unknown> }[],
  notify: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
  wide: true,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let limit: number | null = null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => chain;
    chain.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain);
    chain.neq = (c: string, v: unknown) => (filters.push((r) => r[c] !== v), chain);
    chain.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain);
    chain.gte = (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), chain);
    chain.lte = (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), chain);
    chain.limit = (n: number) => ((limit = n), chain);
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      h.events.push(`from:${table}`);
      const answer = h.tables[table] ?? { data: [], error: null };
      const data = Array.isArray(answer.data)
        ? (answer.data as Row[]).filter((r) => filters.every((f) => f(r))).slice(0, limit ?? undefined)
        : answer.data;
      return Promise.resolve({ data, error: answer.error }).then(resolve, reject);
    };
    return chain;
  };
  return {
    supabase: {
      rpc: (name: string, args: Record<string, unknown>) => {
        h.events.push(`rpc:${name}`);
        h.rpcArgs.push({ name, args });
        return Promise.resolve(h.answers[name]?.(args) ?? { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } });
      },
      from,
    },
  };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => {
    const s = h.caps[key] ?? 'granted';
    return s === 'loading' ? { allowed: false, status: 'loading', reason: 'test' } : { allowed: s === 'granted', status: s, reason: 'test' };
  },
  useCan: (key: string) => (h.caps[key] ?? 'granted') === 'granted',
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({
  useScopedPath: () => (rel = '') => `/v/dra/${rel}`,
  useVesselScope: () => ({ vessel: { id: 'v-dra', name: 'DRAAK' }, code: 'dra' }),
}));
vi.mock('@/shared/components/data/useMinWidth', () => ({ TABLET_MIN_WIDTH: 768, useMinWidth: () => h.wide }));
vi.mock('@/lib/export/download', () => ({ downloadBlob: (_blob: Blob, name: string) => h.events.push(`download:${name}`) }));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import HoursOfRestReportPage from '@/modules/work-rest/pages/HoursOfRestReportPage';
import { CREW_CAPS } from '@/modules/crew/paths';
import { EXPORT_COPY } from '@/lib/export';
import { REPORT_NOT_SET_UP } from '@/modules/work-rest/lib/horReport';

// ─── answers ─────────────────────────────────────────────────────────────

const month = (m: number, over: Partial<Record<string, number>> = {}) => ({
  period_month: m,
  crew: 5,
  days_logged: 140,
  breach_days: 0,
  unreviewed: 0,
  serious_open: 0,
  awaiting_correction: 0,
  not_submitted: 0,
  awaiting_approval: 0,
  approved: 5,
  locked: 0,
  ...over,
});

const YEAR_2026 = [
  ...Array.from({ length: 8 }, (_, i) => month(i + 1)),
  month(9, { unreviewed: 1, serious_open: 1, breach_days: 1, approved: 4, awaiting_approval: 1 }),
  month(10, { approved: 3, not_submitted: 2, breach_days: 2, unreviewed: 2, awaiting_correction: 1 }),
  month(11, { approved: 0, awaiting_approval: 2, not_submitted: 3, days_logged: 90 }),
];

const openBreach = (id: string, over: Row = {}) => ({
  nc_id: id,
  profile_id: `p-${id}`,
  crew_user_id: `u-${id}`,
  first_name: 'Bosun',
  last_name: 'Example',
  preferred_name: null,
  position_name: 'Bosun',
  department_key: 'deck',
  department_label: 'Deck',
  submission_id: 's-1',
  month_status: 'submitted',
  breach_day: '2026-10-12',
  rule_code: 'REST_24H_MIN',
  rule_description: 'Minimum rest in any 24 hours',
  severity: 'high',
  is_serious: false,
  measured_value: 8,
  threshold_value: 10,
  deficit_hours: 2,
  window_start: null,
  window_end: null,
  status: 'open',
  review_outcome: null,
  review_note: null,
  reviewed_by: null,
  reviewer_name: null,
  reviewed_at: null,
  breach_report_id: null,
  can_review: true,
  ...over,
});

const BREACHES = [
  openBreach('nc-1'),
  openBreach('nc-2', { first_name: 'Chief', last_name: 'Engineer', is_serious: true, breach_day: '2026-09-03', deficit_hours: 5 }),
  openBreach('nc-3', { first_name: 'Deckhand', review_outcome: 'correction_requested', status: 'reviewed' }),
  openBreach('nc-4', { first_name: 'Steward', review_outcome: 'accepted', status: 'justified', review_note: 'Drill', reviewer_name: 'Demo Master' }),
];

const REPORTS = [
  {
    id: 'r-1',
    company_id: 'c-1',
    vessel_id: 'v-dra',
    reference: 'HORBR-DRA-2026-001',
    period_from: '2026-08-01',
    period_to: '2026-08-31',
    nc_ids: ['nc-4', 'nc-gone'],
    recipient_user_ids: ['u-dpa', 'u-hr'],
    file_path: null,
    notes: 'Two drills in port.',
    sent_by: 'u-master',
    sent_at: '2026-09-02T09:00:00Z',
  },
  {
    id: 'r-old',
    company_id: 'c-1',
    vessel_id: 'v-dra',
    reference: 'HORBR-DRA-2025-004',
    period_from: '2025-11-01',
    period_to: '2025-11-30',
    nc_ids: ['nc-9'],
    recipient_user_ids: ['u-dpa'],
    file_path: null,
    notes: null,
    sent_by: 'u-master',
    sent_at: '2025-12-02T09:00:00Z',
  },
];

const reminder = (id: string, over: Row = {}) => ({
  id,
  company_id: 'c-1',
  vessel_id: 'v-dra',
  profile_id: 'p-deck',
  crew_user_id: 'u-deck',
  period_year: 2026,
  period_month: 11,
  kind: 'manual',
  sent_by: 'u-co',
  sent_by_role_label: 'Chief Officer',
  sent_on: '2026-11-24',
  sent_at: '2026-11-24T07:45:00Z',
  channel: 'in_app',
  ...over,
});

const PROFILES = [
  { id: 'p-deck', user_id: 'u-deck', first_name: 'Deckhand', last_name: 'Example', preferred_name: null },
  { id: 'p-master', user_id: 'u-master', first_name: 'Demo', last_name: 'Master', preferred_name: null },
];

const ok = (data: unknown): Answer => ({ data, error: null });

beforeAll(() => {
  // Radix (checkbox, dialog) measures with ResizeObserver; jsdom has none.
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 26, 10, 0) });
  h.caps = {};
  h.wide = true;
  h.events = [];
  h.rpcArgs = [];
  h.answers = {
    work_rest_month_stats: (args) => ok(args.p_year === 2026 ? YEAR_2026 : [month(1, { crew: 0, approved: 0, days_logged: 0 })]),
    work_rest_vessel_breaches: () => ok(BREACHES),
    log_client_export: () => ok({ id: '00000000-0000-4000-8000-0000000000e1' }),
  };
  h.tables = {
    work_rest_breach_reports: ok(REPORTS),
    work_rest_reminders: ok([reminder('rm-1'), reminder('rm-2', { kind: 'manual', sent_by_role_label: 'Master', sent_on: '2026-11-20', sent_at: '2026-11-20T08:00:00Z' })]),
    profiles: ok(PROFILES),
    vessel_module_settings: ok([]),
  };
  for (const fn of Object.values(h.notify)) fn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const Where: React.FC = () => {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>;
};

function renderPage(url = '/v/dra/crew/hours-of-rest/report') {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/v/dra/crew/hours-of-rest/report"
            element={
              <>
                <HoursOfRestReportPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ready = () => waitFor(() => expect(document.querySelector('[data-hor-report="ready"]')).not.toBeNull());
const tile = (label: string) => {
  const eyebrow = screen.getAllByText(label).find((el) => el.closest('[data-hor-kpis]'));
  if (!eyebrow) throw new Error(`no tile ${label}`);
  return (eyebrow.closest('a') ?? eyebrow.parentElement?.parentElement) as HTMLElement;
};
const section = (id: string) => document.querySelector(`[data-report-section="${id}"]`) as HTMLElement;

// ─── the gate ────────────────────────────────────────────────────────────

describe('the gate', () => {
  it('while it loads, nothing is read and nothing of the report shows', async () => {
    h.caps[CREW_CAPS.horView] = 'loading';
    renderPage();
    expect(screen.getByText('Checking your access')).toBeInTheDocument();
    expect(screen.queryByText('Hours of rest report')).toBeNull();
    await act(async () => {});
    expect(h.events).toEqual([]);
  });

  it('denied: AccessDenied with a link to the own month, nothing read', async () => {
    h.caps[CREW_CAPS.horView] = 'denied';
    renderPage();
    expect(screen.getByText('The hours of rest report is not open to you')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open my hours of rest' })).toHaveAttribute('href', '/me/hours-of-rest');
    await act(async () => {});
    expect(h.events).toEqual([]);
  });
});

// ─── populated ───────────────────────────────────────────────────────────

describe('the report, as the final approver', () => {
  it('reads the year once and shows the four KPIs with the board month each opens', async () => {
    renderPage();
    await ready();
    expect(h.rpcArgs.find((c) => c.name === 'work_rest_month_stats')?.args).toEqual({ p_vessel_id: 'v-dra', p_year: 2026 });

    const unreviewed = tile('Unreviewed breaches');
    expect(within(unreviewed).getByText('3')).toBeInTheDocument();
    expect(within(unreviewed).getByText('1 more waiting on a correction')).toBeInTheDocument();
    expect(unreviewed).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-10&breaches=open');

    const serious = tile('Serious open');
    expect(within(serious).getByText('1')).toBeInTheDocument();
    expect(serious).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-09&breaches=open');

    // October's 2 (November is still running and does not count).
    const notSubmitted = tile('Not submitted');
    expect(within(notSubmitted).getByText('2')).toBeInTheDocument();
    expect(within(notSubmitted).getByText('Crew months in 1 ended month')).toBeInTheDocument();
    expect(notSubmitted).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-10&queue=waiting');

    const awaiting = tile('Awaiting approval');
    expect(within(awaiting).getByText('3')).toBeInTheDocument();
    expect(awaiting).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-11&queue=ready');
  });

  it('By month: newest first, with the submission summary and a link to the board month', async () => {
    renderPage();
    await ready();
    const table = within(section('hor-report-months')).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(11);
    expect(within(rows[0]).getByRole('link', { name: 'November' })).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-11');
    expect(within(rows[0]).getByText('In progress: 2 of 5 submitted')).toBeInTheDocument();
    expect(within(rows[1]).getByText('2 not submitted')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1 to correct')).toBeInTheDocument();
    expect(within(rows[2]).getByText('1 awaiting approval')).toBeInTheDocument();
    expect(within(rows[2]).getByText('1 serious')).toBeInTheDocument();
    expect(within(rows[3]).getByText('All 5 approved')).toBeInTheDocument();
  });

  it('at phone width (390 px) the months are cards: the month, its submissions and the figures in words', async () => {
    h.wide = false;
    renderPage();
    await ready();
    const panel = section('hor-report-months');
    expect(within(panel).queryByRole('table')).toBeNull();
    const cards = within(panel).getByRole('list', { name: 'Hours of rest by month, 2026' });
    const nov = cards.querySelector('[data-month-card="11"]') as HTMLElement;
    expect(within(nov).getByRole('link', { name: 'November' })).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-11');
    expect(within(nov).getByText('In progress: 2 of 5 submitted')).toBeInTheDocument();
    expect(within(nov).getByText('5 crew · 90 days logged')).toBeInTheDocument();
    const oct = cards.querySelector('[data-month-card="10"]') as HTMLElement;
    expect(within(oct).getByText('5 crew · 140 days logged · 2 breach days · 2 unreviewed · 1 to correct')).toBeInTheDocument();
    expect(within(oct).getByText('3 approved')).toBeInTheDocument();
  });

  it('Open breaches: the open and waiting ones, serious first, and a link to review them on the board', async () => {
    renderPage();
    await ready();
    const panel = section('hor-report-open-breaches');
    await waitFor(() => expect(within(panel).getByRole('list', { name: 'Open breaches, 2026' })).toBeInTheDocument());
    const items = within(panel).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Chief Engineer'),
      expect.stringContaining('Bosun Example'),
      expect.stringContaining('Deckhand Example'),
    ]);
    expect(within(items[0]).getByText('Serious')).toBeInTheDocument();
    expect(within(panel).queryByText(/Steward/)).toBeNull();
    expect(within(panel).getByRole('link', { name: /Review on the board/ })).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-09&breaches=open');
    expect(h.rpcArgs.find((c) => c.name === 'work_rest_vessel_breaches')?.args).toEqual({ p_vessel_id: 'v-dra', p_from: '2026-01-01', p_to: '2026-12-31', p_only_open: true });
  });

  it("Breach reports sent: the year's reports, shared in STORM, by whom, never emailed", async () => {
    renderPage();
    await ready();
    const panel = section('hor-report-sent');
    await waitFor(() => expect(within(panel).getByText('HORBR-DRA-2026-001')).toBeInTheDocument());
    expect(within(panel).queryByText('HORBR-DRA-2025-004')).toBeNull();
    expect(within(panel).getByText('2 breaches · shared in STORM with 2 people')).toBeInTheDocument();
    expect(within(panel).getByText('Sent 2 Sep 2026 by Demo Master')).toBeInTheDocument();
    expect(within(panel).getByText('Two drills in port.')).toBeInTheDocument();
    expect(panel.textContent?.toLowerCase()).not.toMatch(/e-?mail/);
  });

  it('?report= marks the report the notice linked to', async () => {
    renderPage('/v/dra/crew/hours-of-rest/report?year=2026&report=r-1');
    await ready();
    await waitFor(() => expect(document.querySelector('[data-sent-report="r-1"]')).toHaveAttribute('aria-current', 'true'));
  });

  it('Reminders: who was reminded, by whom, about which month; the notice while none was automatic', async () => {
    renderPage();
    await ready();
    const panel = section('hor-report-reminders');
    await waitFor(() => expect(within(panel).getByRole('list', { name: 'Reminders, 2026' })).toBeInTheDocument());
    expect(within(panel).getAllByText('Deckhand Example')).toHaveLength(2);
    expect(within(panel).getByText('Reminded by Chief Officer · about November 2026')).toBeInTheDocument();
    expect(within(panel).getByText('24 Nov 2026')).toBeInTheDocument();
    expect(within(panel).getByText(/Automatic reminders are not scheduled yet/)).toBeInTheDocument();
  });

  it('an automatic reminder for the vessel (any year) removes the notice', async () => {
    h.tables.work_rest_reminders = ok([reminder('rm-1'), reminder('rm-auto', { kind: 'auto_month_start', sent_by: null, sent_by_role_label: null, period_year: 2025, period_month: 12 })]);
    renderPage();
    await ready();
    const panel = section('hor-report-reminders');
    await waitFor(() => expect(within(panel).getByRole('list', { name: 'Reminders, 2026' })).toBeInTheDocument());
    expect(within(panel).queryByText(/Automatic reminders are not scheduled yet/)).toBeNull();
  });

  it('the header offers Export all months, Create breach report and the board', async () => {
    renderPage();
    await ready();
    expect(screen.getByRole('button', { name: 'Export all months' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create breach report' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/v/dra/crew/hours-of-rest');
  });
});

describe('a viewer who sees the report but does not approve', () => {
  beforeEach(() => {
    h.caps[CREW_CAPS.horApprove] = 'denied';
    h.caps[CREW_CAPS.horFinalApprove] = 'denied';
  });

  it('no board links, no breach or reminder reads, and the panels say who sees them', async () => {
    renderPage();
    await ready();
    expect(tile('Unreviewed breaches').tagName).not.toBe('A');
    expect(screen.queryByRole('link', { name: 'November' })).toBeNull();
    expect(screen.getByText("Open breaches are listed for the vessel's hours of rest approvers.")).toBeInTheDocument();
    expect(screen.getByText("The reminder log is for the vessel's hours of rest approvers.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create breach report' })).toBeNull();
    expect(screen.getByRole('link', { name: 'My hours' })).toHaveAttribute('href', '/me/hours-of-rest');
    await act(async () => {});
    expect(h.events).not.toContain('rpc:work_rest_vessel_breaches');
    expect(h.events).not.toContain('from:work_rest_reminders');
  });

  it('the reports shared with them, without a PDF button', async () => {
    renderPage();
    await ready();
    const panel = section('hor-report-sent');
    await waitFor(() => expect(within(panel).getByText('HORBR-DRA-2026-001')).toBeInTheDocument());
    expect(within(panel).getByText('The breach reports shared with you.')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /as PDF/ })).toBeNull();
  });

  it('?new=1 does not open the breach report dialog', async () => {
    renderPage('/v/dra/crew/hours-of-rest/report?new=1');
    await ready();
    await act(async () => {});
    expect(document.querySelector('[data-breach-report-dialog]')).toBeNull();
  });
});

describe('C45: months before the Hours of Rest start date', () => {
  it('are not expected: no Not submitted for them, and a note says when it started', async () => {
    h.answers.work_rest_month_stats = () => ok([month(1, { approved: 0, not_submitted: 5 }), month(2, { approved: 0, not_submitted: 5 }), month(3, { approved: 2, not_submitted: 3 }), month(4)]);
    h.tables.vessel_module_settings = ok([{ vessel_id: 'v-dra', module_key: 'crew_hor', enabled: true, enabled_from: '2026-03-01', label_override: null }]);
    renderPage();
    await ready();
    await waitFor(() => expect(screen.getByText(/Hours of rest starts on 1 Mar 2026 on DRAAK/)).toBeInTheDocument());
    expect(within(tile('Not submitted')).getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('Before hours of rest started')).toHaveLength(2);
  });
});

// ─── empty, the year ─────────────────────────────────────────────────────

describe('empty and the year in the URL', () => {
  it('a year with nobody on board', async () => {
    renderPage('/v/dra/crew/hours-of-rest/report?year=2025');
    await ready();
    expect(h.rpcArgs.find((c) => c.name === 'work_rest_month_stats')?.args).toEqual({ p_vessel_id: 'v-dra', p_year: 2025 });
    expect(screen.getByText('Nobody was on board in 2025')).toBeInTheDocument();
    expect(within(tile('Unreviewed breaches')).getByText('None to review')).toBeInTheDocument();
    expect(within(tile('Awaiting approval')).getByText('Nothing waiting')).toBeInTheDocument();
  });

  it('the year steps back and forward, never past this year', async () => {
    renderPage('/v/dra/crew/hours-of-rest/report?year=2025');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Show 2026' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/v/dra/crew/hours-of-rest/report?year=2026'));
    await ready();
    expect(screen.getByRole('button', { name: 'Next year (not started yet)' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'This year' })).toBeNull();
  });

  it('a year in the future reads as this year', async () => {
    renderPage('/v/dra/crew/hours-of-rest/report?year=2031');
    await ready();
    expect(h.rpcArgs.find((c) => c.name === 'work_rest_month_stats')?.args).toEqual({ p_vessel_id: 'v-dra', p_year: 2026 });
  });
});

// ─── D-01 and errors ─────────────────────────────────────────────────────

describe('D-01 and errors', () => {
  it('the statistics RPC missing: the report is not set up yet, and nothing else is read', async () => {
    delete h.answers.work_rest_month_stats;
    renderPage();
    await waitFor(() => expect(screen.getByText(REPORT_NOT_SET_UP)).toBeInTheDocument());
    expect(document.querySelector('[data-hor-kpis]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create breach report' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Export all months' })).toBeDisabled();
    expect(h.events).not.toContain('from:work_rest_breach_reports');
  });

  it('a 42501 from the server reads as no access', async () => {
    h.answers.work_rest_month_stats = () => ({ data: null, error: { code: '42501', message: 'crew_not_permitted', details: "You can't see the hours of rest report of this vessel." } });
    renderPage();
    await waitFor(() => expect(screen.getByText('The hours of rest report is not open to you')).toBeInTheDocument());
  });

  it('any other error: each KPI says it could not load, and the report has Try again, which asks again', async () => {
    h.answers.work_rest_month_stats = () => ({ data: null, error: { code: 'XX000', message: 'the database is unwell' } });
    renderPage();
    await waitFor(() => expect(screen.getByText('The report could not load')).toBeInTheDocument());
    expect(screen.getAllByText('Could not load')).toHaveLength(4);
    const before = h.rpcArgs.filter((c) => c.name === 'work_rest_month_stats').length;
    h.answers.work_rest_month_stats = () => ok(YEAR_2026);
    fireEvent.click(within(document.querySelector('[data-hor-report="error"]') as HTMLElement).getAllByRole('button', { name: /Try again/ }).at(-1) as HTMLElement);
    await ready();
    expect(h.rpcArgs.filter((c) => c.name === 'work_rest_month_stats').length).toBeGreaterThan(before);
  });

  it('a malformed answer is an error, never a guess', async () => {
    h.answers.work_rest_month_stats = () => ok([{ period_month: 13 }]);
    renderPage();
    await waitFor(() => expect(screen.getByText('The report could not load')).toBeInTheDocument());
  });

  it('a panel whose table is missing says so; the rest of the report stands', async () => {
    h.tables.work_rest_breach_reports = { data: null, error: { code: 'PGRST205', message: 'Could not find the table public.work_rest_breach_reports' } };
    h.tables.work_rest_reminders = { data: null, error: { code: '42P01', message: 'relation "work_rest_reminders" does not exist' } };
    delete h.answers.work_rest_vessel_breaches;
    renderPage();
    await ready();
    await waitFor(() => expect(screen.getByText('Breach reports are not set up on this database yet.')).toBeInTheDocument());
    expect(screen.getByText('Reminders are not set up on this database yet.')).toBeInTheDocument();
    expect(screen.getByText('Breach review is not set up on this database yet.')).toBeInTheDocument();
  });
});

// ─── exports ─────────────────────────────────────────────────────────────

describe('exports (EX1, EX4)', () => {
  it('Export all months is logged first, then downloaded under the EX1 name', async () => {
    renderPage();
    await ready();
    h.events = [];
    fireEvent.click(screen.getByRole('button', { name: 'Export all months' }));
    await waitFor(() => expect(h.events.some((e) => e.startsWith('download:'))).toBe(true), { timeout: 5000 });
    expect(h.events).toEqual(['rpc:log_client_export', 'download:DRA_HoursOfRestReport_2026-01-01-to-2026-11-30_2026-11-26.xlsx']);
    expect(h.rpcArgs.at(-1)?.args).toMatchObject({ p_kind: 'xlsx', p_source_key: 'work_rest.hor_report', p_contains_personal_data: true, p_vessel_id: 'v-dra', p_row_count: 11 });
    expect(h.notify.success).toHaveBeenCalledWith('Export downloaded', { description: 'DRA_HoursOfRestReport_2026-01-01-to-2026-11-30_2026-11-26.xlsx' });
  });

  it('is refused, with nothing downloaded, while the export log is missing', async () => {
    delete h.answers.log_client_export;
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Export all months' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalledWith(EXPORT_COPY.logMissingPersonal, { title: 'Export not made' }));
    expect(h.events.some((e) => e.startsWith('download:'))).toBe(false);
  });

  it("is not offered without the export capability", async () => {
    h.caps[CREW_CAPS.horExport] = 'denied';
    renderPage();
    await ready();
    expect(screen.queryByRole('button', { name: 'Export all months' })).toBeNull();
  });

  it("a report's PDF: its breaches are read, the export logged, then the PDF downloaded; a corrected breach is said", async () => {
    renderPage();
    await ready();
    const panel = section('hor-report-sent');
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Download HORBR-DRA-2026-001 as PDF' })).toBeInTheDocument());
    h.events = [];
    fireEvent.click(within(panel).getByRole('button', { name: 'Download HORBR-DRA-2026-001 as PDF' }));
    await waitFor(() => expect(h.events.some((e) => e.startsWith('download:'))).toBe(true), { timeout: 5000 });
    expect(h.events).toEqual(['rpc:work_rest_vessel_breaches', 'rpc:log_client_export', 'download:DRA_HoRBreachReport_HORBR-DRA-2026-001_2026-11-26.pdf']);
    expect(h.rpcArgs.find((c) => c.name === 'work_rest_vessel_breaches' && c.args.p_from === '2026-08-01')?.args).toEqual({ p_vessel_id: 'v-dra', p_from: '2026-08-01', p_to: '2026-08-31', p_only_open: false });
    expect(h.rpcArgs.at(-1)?.args).toMatchObject({ p_kind: 'register_pdf', p_source_key: 'work_rest.hor_breach_report', p_row_count: 1, p_params: { report_id: 'r-1' } });
    await waitFor(() => expect(h.notify.info).toHaveBeenCalledWith('1 breach of this report is no longer listed: its record was corrected.'));
  });

  it("a report whose breaches are all gone makes no PDF and says why", async () => {
    h.answers.work_rest_vessel_breaches = () => ok([]);
    renderPage();
    await ready();
    const panel = section('hor-report-sent');
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Download HORBR-DRA-2026-001 as PDF' })).toBeInTheDocument());
    h.events = [];
    fireEvent.click(within(panel).getByRole('button', { name: 'Download HORBR-DRA-2026-001 as PDF' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalled());
    expect(h.events).not.toContain('rpc:log_client_export');
    expect(h.events.some((e) => e.startsWith('download:'))).toBe(false);
  });
});

describe('the breach report dialog', () => {
  it('?new=1 opens it for the final approver; Cancel closes it and clears the URL', async () => {
    h.answers.work_rest_breach_report_recipients = () => ok([]);
    renderPage('/v/dra/crew/hours-of-rest/report?new=1');
    await ready();
    await waitFor(() => expect(document.querySelector('[data-breach-report-dialog]')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/v\/dra\/crew\/hours-of-rest\/report$/));
  });

  it('Create breach report puts ?new=1 in the URL', async () => {
    h.answers.work_rest_breach_report_recipients = () => ok([]);
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Create breach report' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('new=1'));
    await waitFor(() => expect(document.querySelector('[data-breach-report-dialog]')).not.toBeNull());
  });
});
