/**
 * The vessel hours-of-rest board page (HoursOfRestBoardPage; gap/04 C40,
 * C41, C43, C45; D-01; X1-08):
 *
 * - the gate: loading reads nothing and shows nothing of the board; denied
 *   is AccessDenied with a link to the viewer's own month, nothing read;
 * - the board: department groups and tabs, the queue chips with counts
 *   (in the URL; ?queue=ready opens filtered), the cards (status, Former
 *   crew, submit on their behalf, on leave all month collapsed, Remind and
 *   the last-reminded line), the status menu's steps through
 *   work_rest_month_transition, Remind all waiting, Show all calendars;
 * - month navigation in the URL; a month before the start date (C45);
 * - D-01: the board RPC missing shows the legacy overview under an info
 *   strip; a 42501 is no access; any other error is PageError with Try
 *   again, which asks again.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  gate: 'granted' as 'granted' | 'loading' | 'denied',
  rpc: vi.fn(),
  answers: {} as Record<string, (args: Record<string, unknown>) => Answer>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  wide: true,
  notify: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lte', 'is']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(resolve, reject);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () =>
    h.gate === 'loading' ? { allowed: false, status: 'loading', reason: 'test' } : { allowed: h.gate === 'granted', status: h.gate, reason: 'test' },
  useCan: () => h.gate === 'granted',
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'dra', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({
  useScopedPath: () => (rel = '') => `/v/dra/${rel}`,
  useVesselScope: () => ({ vessel: { id: 'v-dra', name: 'DRAAK' }, code: 'dra' }),
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-master' } }) }));
vi.mock('@/shared/components/data/useMinWidth', () => ({ TABLET_MIN_WIDTH: 768, useMinWidth: () => h.wide }));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import HoursOfRestBoardPage from '@/modules/work-rest/pages/HoursOfRestBoardPage';

// ─── The board's answer ──────────────────────────────────────────────────

const month = (status: string | null, over: Record<string, unknown> = {}) => ({
  submission_id: status ? `s-${status}` : null,
  status,
  submitted_at: null,
  on_behalf: false,
  hod_signed: false,
  approved_at: null,
  locked_at: null,
  ...over,
});
const counts = (over: Record<string, number> = {}) => ({
  expected: 20,
  logged: 20,
  missing: 0,
  breach_days: 0,
  unreviewed: 0,
  blocking_unreviewed: 0,
  low_unreviewed: 0,
  awaiting_correction: 0,
  serious_open: 0,
  ...over,
});
const member = (userId: string, first: string, last: string, over: Record<string, unknown> = {}) => ({
  profile_id: `p-${userId}`,
  user_id: userId,
  first_name: first,
  last_name: last,
  preferred_name: null,
  avatar_url: null,
  position_name: 'Deckhand',
  position_text: null,
  department_key: 'deck',
  department_label: 'Deck',
  sort_order: 10,
  assignments: [{ from: '2026-10-01', to: null }],
  month: month(null),
  days: { records: [1, 2, 3, 4, 5], leave: [], breach: [], warning: [] },
  counts: counts({ logged: 5, missing: 15 }),
  still_aboard: true,
  former_crew: false,
  on_leave_all_month: false,
  last_reminder: null,
  reminded_today: false,
  ...over,
});

const MEMBERS = [
  member('u-bosun', 'Bosun', 'Example', { position_name: 'Bosun', month: month('submitted'), counts: counts() }),
  member('u-deck', 'Deckhand', 'Example', {
    last_reminder: { kind: 'manual', sent_on: '2026-11-18', sent_at: '2026-11-18T09:00:00Z', by_label: 'Chief Officer' },
  }),
  member('u-gone', 'Leaver', 'Example', { still_aboard: false, former_crew: true, assignments: [{ from: '2026-10-01', to: '2026-11-10' }] }),
  member('u-stew', 'Steward', 'Example', { department_key: 'interior', department_label: 'Interior', position_name: 'Steward', month: month('approved'), counts: counts() }),
  member('u-leave', 'Leave', 'Example', { department_key: 'interior', department_label: 'Interior', on_leave_all_month: true, days: { records: [], leave: [1, 2], breach: [], warning: [] } }),
  member('u-eng', 'Engineer', 'Example', {
    department_key: 'engine',
    department_label: 'Engine',
    position_name: 'Second Engineer',
    month: month('submitted'),
    days: { records: [1, 2, 3], leave: [], breach: [2], warning: [3] },
    counts: counts({ breach_days: 1, unreviewed: 1, blocking_unreviewed: 1, serious_open: 1 }),
  }),
];

const boardAnswer = (over: Record<string, unknown> = {}) => ({
  vessel_id: 'v-dra',
  year: 2026,
  month: 11,
  today: '2026-11-20',
  first_day: '2026-11-01',
  last_day: '2026-11-30',
  hor: { off: false, from: null },
  hod_step: 'nudge',
  can_final_approve: true,
  my_department_key: 'deck',
  members: MEMBERS,
  ...over,
});

const MISSING = { code: 'PGRST202', message: 'Could not find the function in the schema cache' };

// ─── Harness ─────────────────────────────────────────────────────────────

let qc: QueryClient;
let lastLocation = '';
const LocationProbe: React.FC = () => {
  const loc = useLocation();
  lastLocation = `${loc.pathname}${loc.search}`;
  return null;
};
const params = () => new URLSearchParams(lastLocation.split('?')[1] ?? '');

function renderPage(initial = '/v/dra/crew/hours-of-rest?month=2026-11') {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/v/:vesselCode/crew/hours-of-rest" element={<HoursOfRestBoardPage />} />
          <Route path="*" element={<p>Elsewhere</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rpcCalls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args as Record<string, unknown>);
const card = (name: string) => {
  const heading = screen.getByRole('heading', { name, level: 3 });
  const article = heading.closest('article');
  if (!article) throw new Error(`no card for ${name}`);
  return article as HTMLElement;
};
const openMenu = async (name: string) => {
  const trigger = within(card(name)).getByRole('button', { name: `Month actions for ${name}` });
  act(() => {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
  });
  return screen.findByRole('menu');
};

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  h.gate = 'granted';
  h.wide = true;
  h.tables = {};
  h.answers = {
    work_rest_vessel_board: () => ({ data: boardAnswer(), error: null }),
    work_rest_vessel_breaches: () => ({ data: [], error: null }),
  };
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => (h.answers[fn] ? h.answers[fn](args) : { data: null, error: MISSING }));
  for (const f of Object.values(h.notify)) f.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  lastLocation = '';
});
afterEach(() => qc.clear());

// ─── The gate ────────────────────────────────────────────────────────────

describe('the gate', () => {
  it('while the capability loads: nothing is read and no board shows', () => {
    h.gate = 'loading';
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Hours of rest', level: 1 })).toBeNull();
    expect(screen.getByText('Checking your access')).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('denied: the board is for approvers, with a link to the own month; nothing is read', () => {
    h.gate = 'denied';
    renderPage();
    expect(screen.getByRole('heading', { name: 'The hours of rest board is for approvers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open my hours of rest' })).toHaveAttribute('href', '/me/hours-of-rest');
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

// ─── The board ───────────────────────────────────────────────────────────

describe('the board', () => {
  it('asks for the vessel and month and shows one card per person, grouped by department', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Bosun Example', level: 3 })).toBeInTheDocument();
    expect(rpcCalls('work_rest_vessel_board')).toEqual([{ p_vessel_id: 'v-dra', p_year: 2026, p_month: 11 }]);
    expect(screen.getByRole('heading', { name: 'Hours of rest', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'November 2026', level: 2 })).toBeInTheDocument();
    const groups = [...document.querySelectorAll('[data-dept-group]')].map((g) => g.getAttribute('data-dept-group'));
    expect(groups).toEqual(['deck', 'interior', 'engine']);
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(within(card('Bosun Example')).getByText('Submitted')).toBeInTheDocument();
    expect(within(card('Steward Example')).getByText('Approved')).toBeInTheDocument();
  });

  it('the queue chips count the department; a chip filters and goes in the URL; again goes back to All', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    const chips = screen.getByRole('group', { name: 'Months by whose move' });
    const chip = (name: RegExp) => within(chips).getByRole('button', { name });
    expect(chip(/^All 6$/)).toHaveAttribute('aria-pressed', 'true');
    expect(chip(/^Ready for you 2$/)).toBeInTheDocument();
    expect(chip(/^Waiting on crew 2$/)).toBeInTheDocument();
    expect(chip(/^Approved 1$/)).toBeInTheDocument();
    expect(chip(/^On leave 1$/)).toBeInTheDocument();
    fireEvent.click(chip(/^Ready for you/));
    await waitFor(() => expect(params().get('queue')).toBe('ready'));
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('data-member'))).toEqual(['u-bosun', 'u-eng']);
    fireEvent.click(chip(/^Ready for you/));
    await waitFor(() => expect(params().get('queue')).toBeNull());
    expect(screen.getAllByRole('article')).toHaveLength(6);
  });

  it('?queue=ready opens filtered; the department tabs filter too and keep the month', async () => {
    renderPage('/v/dra/crew/hours-of-rest?month=2026-11&queue=ready');
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    expect(screen.getAllByRole('article')).toHaveLength(2);
    const tabs = screen.getByRole('group', { name: 'Departments' });
    fireEvent.click(within(tabs).getByRole('button', { name: /^Engine/ }));
    await waitFor(() => expect(params().get('dept')).toBe('engine'));
    expect(params().get('month')).toBe('2026-11');
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('data-member'))).toEqual(['u-eng']);
    expect(within(screen.getByRole('group', { name: 'Months by whose move' })).getByRole('button', { name: /^All 1$/ })).toBeInTheDocument();
  });

  it('an empty queue says so and clears the filters', async () => {
    renderPage('/v/dra/crew/hours-of-rest?month=2026-11&dept=interior&queue=ready');
    expect(await screen.findByRole('heading', { name: 'Nobody here' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(params().get('queue')).toBeNull());
    expect(params().get('dept')).toBeNull();
  });

  it('the cards: Former crew with submit on their behalf, a serious breach, on leave all month collapsed, the last reminder', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    const gone = card('Leaver Example');
    expect(within(gone).getByText('Former crew')).toBeInTheDocument();
    expect(within(gone).getByText('Has left the vessel.')).toBeInTheDocument();
    expect(within(gone).getByRole('button', { name: 'Submit on their behalf' })).toBeInTheDocument();
    expect(within(gone).queryByRole('button', { name: 'Remind' })).toBeNull();
    expect(within(card('Engineer Example')).getByText('Serious breach')).toBeInTheDocument();
    expect(within(card('Engineer Example')).getByRole('button', { name: 'Review 1 breach' })).toBeInTheDocument();
    const leave = card('Leave Example');
    expect(leave).toHaveAttribute('data-collapsed');
    expect(within(leave).getByText('On leave all month')).toBeInTheDocument();
    fireEvent.click(within(leave).getByRole('button', { name: "Show Leave Example's month" }));
    expect(card('Leave Example')).not.toHaveAttribute('data-collapsed');
    expect(within(card('Deckhand Example')).getByText('Reminded 18 Nov by Chief Officer')).toBeInTheDocument();
    expect(within(card('Deckhand Example')).getByText(/5 of 20 days logged · 15 not entered/)).toBeInTheDocument();
    expect(within(card('Bosun Example')).getByRole('link', { name: 'Bosun Example' })).toHaveAttribute('href', '/v/dra/crew/people/p-u-bosun/hours-of-rest?month=2026-11');
  });

  it('Show all calendars opens every card\'s month in the URL; each day links to that day', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    expect(document.querySelectorAll('[data-mini-calendar]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-day-strip]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('switch', { name: 'Show all calendars' }));
    await waitFor(() => expect(params().get('all')).toBe('1'));
    expect(document.querySelectorAll('[data-mini-calendar]').length).toBe(5);
    const day = within(card('Engineer Example')).getByRole('link', { name: 'Monday 2 November: Submitted, breach' });
    expect(day).toHaveAttribute('href', '/v/dra/crew/people/p-u-eng/hours-of-rest?month=2026-11&day=2026-11-02');
    expect(within(card('Engineer Example')).getByRole('link', { name: 'Tuesday 3 November: Submitted, near the limit' })).toBeInTheDocument();
  });

  it('a card opens its own calendar', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    fireEvent.click(within(card('Bosun Example')).getByRole('button', { name: 'Show calendar' }));
    expect(within(card('Bosun Example')).getByRole('list', { name: 'Days of Bosun Example, November 2026' })).toBeInTheDocument();
    expect(within(card('Bosun Example')).getByRole('button', { name: 'Hide calendar' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('Remind sends one reminder and says so; reminded today is disabled', async () => {
    h.answers.work_rest_remind = () => ({ data: { sent: 1, sent_to: ['u-deck'], skipped: [], sent_on: '2026-11-20', by_label: 'Master' }, error: null });
    h.answers.work_rest_vessel_board = () => ({
      data: boardAnswer({ members: [...MEMBERS, member('u-twice', 'Twice', 'Example', { reminded_today: true })] }),
      error: null,
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    expect(within(card('Twice Example')).getByRole('button', { name: 'Remind' })).toBeDisabled();
    fireEvent.click(within(card('Deckhand Example')).getByRole('button', { name: 'Remind' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Reminder sent to Deckhand Example'));
    expect(rpcCalls('work_rest_remind')).toEqual([{ p_vessel_id: 'v-dra', p_crew_user_ids: ['u-deck'], p_year: 2026, p_month: 11 }]);
    // The vessel's keys refresh: the board is asked again.
    await waitFor(() => expect(rpcCalls('work_rest_vessel_board').length).toBeGreaterThan(1));
  });

  it('a refused reminder shows the server sentence', async () => {
    h.answers.work_rest_remind = () => ({ data: null, error: { code: '22023', message: 'reminder_rate_limited', details: 'Already reminded today.' } });
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    fireEvent.click(within(card('Deckhand Example')).getByRole('button', { name: 'Remind' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalledWith('Already reminded today.', { title: 'The reminder was not sent' }));
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('Remind all waiting (on the Waiting chip) sends to the waiting crew who can be reminded', async () => {
    h.answers.work_rest_remind = (args) => ({
      data: { sent: (args.p_crew_user_ids as string[]).length, sent_to: args.p_crew_user_ids, skipped: [], sent_on: '2026-11-20', by_label: 'Master' },
      error: null,
    });
    renderPage('/v/dra/crew/hours-of-rest?month=2026-11&queue=waiting');
    fireEvent.click(await screen.findByRole('button', { name: 'Remind all waiting (2)' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Reminders sent to 2 crew members'));
    expect(rpcCalls('work_rest_remind')[0].p_crew_user_ids).toEqual(['u-deck', 'u-gone']);
  });

  it('the status menu: approve goes through work_rest_month_transition; a blocked step is disabled with its reason', async () => {
    h.answers.work_rest_month_transition = () => ({ data: { submission_id: 's-1', status: 'approved', warnings: ['hod_not_signed'] }, error: null });
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    const menu = await openMenu('Bosun Example');
    expect(within(menu).getByRole('menuitem', { name: 'Open the month' })).toHaveAttribute('href', '/v/dra/crew/people/p-u-bosun/hours-of-rest?month=2026-11');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Approve month' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve the month' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and sign' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith("Bosun Example's month is approved"));
    expect(rpcCalls('work_rest_month_transition')).toEqual([
      { p_vessel_id: 'v-dra', p_crew_user_id: 'u-bosun', p_year: 2026, p_month: 11, p_action: 'approve', p_reason: null, p_signature_text: null },
    ]);
    expect(h.notify.warning).toHaveBeenCalled();

    const engine = await openMenu('Engineer Example');
    const approve = within(engine).getByRole('menuitem', { name: /Approve month/ });
    expect(approve).toHaveAttribute('data-disabled');
    expect(within(approve).getByText('Review every breach before approving the month.')).toBeInTheDocument();
  });

  it('reopen needs a reason; a refusal stays in the dialog', async () => {
    h.answers.work_rest_month_transition = () => ({ data: null, error: { code: '42501', message: 'not_permitted', details: "You don't have permission to do that for this month." } });
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    fireEvent.click(within(await openMenu('Steward Example')).getByRole('menuitem', { name: 'Reopen month' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reopen the month' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    expect(await within(dialog).findByText('Give the reason for reopening.')).toBeInTheDocument();
    expect(rpcCalls('work_rest_month_transition')).toEqual([]);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Day 12 belongs to another vessel' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    expect(await within(dialog).findByText("You don't have permission to do that for this month.")).toBeInTheDocument();
    expect(rpcCalls('work_rest_month_transition')[0]).toMatchObject({ p_action: 'reopen', p_reason: 'Day 12 belongs to another vessel', p_crew_user_id: 'u-stew' });
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('submit on their behalf asks for the reason and sends it (C43)', async () => {
    h.answers.work_rest_month_transition = () => ({ data: { submission_id: 's-1', status: 'submitted', warnings: [] }, error: null });
    renderPage();
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    fireEvent.click(within(card('Leaver Example')).getByRole('button', { name: 'Submit on their behalf' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit on their behalf' });
    expect(within(dialog).getByText(/Leaver Example has left DRAAK/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Signed off in port before the cut-off' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for them' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith("Leaver Example's month is submitted on their behalf"));
    expect(rpcCalls('work_rest_month_transition')[0]).toMatchObject({ p_action: 'submit_on_behalf', p_reason: 'Signed off in port before the cut-off', p_crew_user_id: 'u-gone' });
  });
});

// ─── Months ──────────────────────────────────────────────────────────────

describe('months', () => {
  it('the next month is not offered past the vessel\'s current one; previous goes in the URL; the legacy ?year=&month= reads', async () => {
    // The server echoes the month asked.
    h.answers.work_rest_vessel_board = (args) => ({ data: boardAnswer({ year: args.p_year, month: args.p_month }), error: null });
    renderPage('/v/dra/crew/hours-of-rest?year=2026&month=11');
    await screen.findByRole('heading', { name: 'Bosun Example', level: 3 });
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Current month' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(params().get('month')).toBe('2026-10'));
    expect(params().get('year')).toBeNull();
    await waitFor(() => expect(rpcCalls('work_rest_vessel_board').at(-1)).toEqual({ p_vessel_id: 'v-dra', p_year: 2026, p_month: 10 }));
    expect(await screen.findByRole('heading', { name: 'October 2026', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'A year earlier' }));
    await waitFor(() => expect(params().get('month')).toBe('2025-10'));
  });

  it('the month on screen is the one the server answered for', async () => {
    renderPage('/v/dra/crew/hours-of-rest');
    expect(await screen.findByRole('heading', { name: 'November 2026', level: 2 })).toBeInTheDocument();
  });

  it('a month wholly before the start date says when Hours of Rest starts (C45)', async () => {
    h.answers.work_rest_vessel_board = () => ({ data: boardAnswer({ hor: { off: false, from: '2026-12-01' } }), error: null });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Hours of rest starts on 1 December 2026' })).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('a start inside the month is a note above the board', async () => {
    h.answers.work_rest_vessel_board = () => ({ data: boardAnswer({ hor: { off: false, from: '2026-11-15' } }), error: null });
    renderPage();
    expect(await screen.findByText('Hours of rest starts on 15 November 2026. Days before it are not expected.')).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
  });

  it('a month the vessel has not reached offers the one before', async () => {
    h.answers.work_rest_vessel_board = () => ({ data: null, error: { code: '22023', message: 'month_in_future', details: 'That month has not started on board yet.' } });
    renderPage('/v/dra/crew/hours-of-rest?month=2026-12');
    expect(await screen.findByRole('heading', { name: 'December 2026 has not started on board yet' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show November 2026' }));
    await waitFor(() => expect(params().get('month')).toBe('2026-11'));
  });
});

// ─── D-01 and errors ─────────────────────────────────────────────────────

describe('fallback and errors', () => {
  it('the board RPC missing: the legacy overview under an info strip, its rows linking the month', async () => {
    delete h.answers.work_rest_vessel_board;
    h.tables = {
      crew_assignments: { data: [{ user_id: 'u-deck', position: 'Deckhand', join_date: '2026-01-01', start_date: null, leave_date: null, end_date: null, is_current: true }], error: null },
      profiles: { data: [{ user_id: 'u-deck', first_name: 'Deckhand', last_name: 'Example', rank: 'Deckhand', department: 'Deck' }], error: null },
      work_rest_records: { data: [{ crew_id: 'u-deck', record_date: '2026-11-02', total_rest_minutes: 600, is_compliant: true }], error: null },
    };
    renderPage();
    expect(await screen.findByText(/The new hours of rest board is not set up on this database yet/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Deckhand Example/ })).toHaveAttribute('href', '/v/dra/crew/people/u-deck/hours-of-rest?month=2026-11');
    expect(document.querySelector('[data-hor-board="fallback"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Breaches/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'My hours' })).toHaveAttribute('href', '/me/hours-of-rest');
    // Nothing that does nothing: the old export buttons are gone.
    expect(screen.queryByRole('button', { name: /Summary PDF|Summary Excel|Export All Crew/ })).toBeNull();
  });

  it('a 42501 from the server reads as no access', async () => {
    h.answers.work_rest_vessel_board = () => ({ data: null, error: { code: '42501', message: 'not_permitted', details: 'You do not approve hours of rest on this vessel.' } });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'The hours of rest board is for approvers' })).toBeInTheDocument();
  });

  it('any other error is an error with Try again, which asks again', async () => {
    let calls = 0;
    h.answers.work_rest_vessel_board = () => {
      calls += 1;
      return calls <= 2 ? { data: null, error: { code: 'XX000', message: 'The connection dropped.' } } : { data: boardAnswer(), error: null };
    };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'The board could not load' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Bosun Example', level: 3 })).toBeInTheDocument();
  });

  it('an answer in an unexpected shape is an error, not a guess', async () => {
    h.answers.work_rest_vessel_board = () => ({ data: { vessel_id: 'v-dra', members: 'nobody' }, error: null });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'The board could not load' })).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
