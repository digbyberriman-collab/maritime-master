/**
 * The vessel breach review (BreachReviewPanel on the board; gap/04 C42, W6;
 * T-142; D-01; X1-08):
 *
 * - `?breaches=open` opens the panel on the board's month (Non-compliant
 *   only), `?breaches=all` shows every breach; the chips count both and go
 *   in the URL; closing the panel drops the parameter;
 * - the order is serious first, then still to review, then by day; the
 *   deficit is a numeric column; a reviewed row names the reviewer;
 * - the review form (RHF + zod): accepting needs a justification; the
 *   outcomes the server allows; work_rest_review_breach gets the outcome
 *   and the note; a correction that reopens the month says so; a refusal
 *   stays in the dialog with the server's sentence;
 * - D-01: the breach RPC missing is "not set up yet"; any other error is an
 *   error with Try again; cards below the tablet width.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  answers: {} as Record<string, (args: Record<string, unknown>) => Answer>,
  wide: true,
  notify: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lte', 'is']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => ({ allowed: true, status: 'granted', reason: 'test' }),
  useCan: () => true,
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

// ─── Answers ─────────────────────────────────────────────────────────────

const BOARD = {
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
  members: [],
};

const breach = (id: string, over: Record<string, unknown> = {}) => ({
  nc_id: id,
  profile_id: `p-${id}`,
  crew_user_id: `u-${id}`,
  first_name: 'Deckhand',
  last_name: 'Example',
  preferred_name: null,
  position_name: 'Deckhand',
  department_key: 'deck',
  department_label: 'Deck',
  submission_id: 's-1',
  month_status: 'submitted',
  breach_day: '2026-11-05',
  rule_code: 'REST_24H_MIN',
  rule_description: 'At least 10 hours of rest in any 24 hours',
  severity: 'high',
  is_serious: false,
  measured_value: '8',
  threshold_value: '10',
  deficit_hours: '2',
  window_start: '2026-11-05T00:00:00Z',
  window_end: '2026-11-06T00:00:00Z',
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

const ROWS = [
  breach('late', { breach_day: '2026-11-12', first_name: 'Late' }),
  breach('done', { breach_day: '2026-11-01', first_name: 'Reviewed', review_outcome: 'accepted', status: 'justified', review_note: 'Fire drill', reviewer_name: 'Master Example' }),
  breach('serious', { breach_day: '2026-11-09', first_name: 'Serious', is_serious: true, severity: 'critical', measured_value: '3.5', deficit_hours: '6.5' }),
  breach('corr', { breach_day: '2026-11-03', first_name: 'Correction', review_outcome: 'correction_requested', status: 'reviewed' }),
  breach('periods', { breach_day: '2026-11-07', first_name: 'Periods', rule_code: 'REST_PERIODS_MAX', measured_value: '3', threshold_value: '2', deficit_hours: null }),
];

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
const rpcCalls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args as Record<string, unknown>);

function renderPage(initial = '/v/dra/crew/hours-of-rest?month=2026-11&breaches=open') {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/v/:vesselCode/crew/hours-of-rest" element={<HoursOfRestBoardPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const panel = () => screen.findByRole('dialog', { name: 'Breaches, November 2026' });

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
  h.wide = true;
  h.answers = {
    work_rest_vessel_board: () => ({ data: BOARD, error: null }),
    work_rest_vessel_breaches: () => ({ data: ROWS, error: null }),
  };
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => (h.answers[fn] ? h.answers[fn](args) : { data: null, error: MISSING }));
  for (const f of Object.values(h.notify)) f.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  lastLocation = '';
});
afterEach(() => qc.clear());

// ─── The panel ───────────────────────────────────────────────────────────

describe('the breach panel', () => {
  it('?breaches=open opens it on the board\'s month: serious first, then still to review, by day; reviewed ones hidden', async () => {
    renderPage();
    const sheet = await panel();
    await within(sheet).findByRole('table', { name: 'Breaches' });
    expect(rpcCalls('work_rest_vessel_breaches')).toEqual([{ p_vessel_id: 'v-dra', p_from: '2026-11-01', p_to: '2026-11-30', p_only_open: false }]);
    const table = within(sheet).getByRole('table', { name: 'Breaches' });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.querySelector('td, th')?.textContent ?? '');
    expect(names.map((n) => n.split('Example')[0].trim())).toEqual(['Serious', 'Correction', 'Periods', 'Late']);
    const chips = within(sheet).getByRole('group', { name: 'Which breaches' });
    expect(within(chips).getByRole('button', { name: /^Non-compliant only 4$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByRole('button', { name: /^All breaches 5$/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('the deficit is a numeric column; what was measured is in words; serious is marked', async () => {
    renderPage();
    const sheet = await panel();
    const table = await within(sheet).findByRole('table', { name: 'Breaches' });
    expect(within(table).getByRole('columnheader', { name: /Deficit/ })).toBeInTheDocument();
    const serious = within(table).getByText('Serious Example').closest('tr') as HTMLElement;
    expect(within(serious).getByText('6.5 h')).toBeInTheDocument();
    expect(within(serious).getByText('3.5 h rest, needs 10 h')).toBeInTheDocument();
    expect(within(serious).getByText('Serious')).toBeInTheDocument();
    const periods = within(table).getByText('Periods Example').closest('tr') as HTMLElement;
    expect(within(periods).getByText('3 rest periods, at most 2')).toBeInTheDocument();
    expect(within(periods).queryByText(/ h$/)).toBeNull();
  });

  it('All breaches goes in the URL and shows the reviewed ones with their reviewer; closing drops the parameter', async () => {
    renderPage();
    const sheet = await panel();
    await within(sheet).findByRole('table', { name: 'Breaches' });
    fireEvent.click(within(sheet).getByRole('button', { name: /^All breaches/ }));
    await waitFor(() => expect(params().get('breaches')).toBe('all'));
    const table = within(sheet).getByRole('table', { name: 'Breaches' });
    const done = within(table).getByText('Reviewed Example').closest('tr') as HTMLElement;
    expect(within(done).getByText('Accepted')).toBeInTheDocument();
    expect(within(done).getByText('By Master Example')).toBeInTheDocument();
    expect(within(done).queryByRole('button', { name: /Review/ })).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close the breaches' }));
    await waitFor(() => expect(params().get('breaches')).toBeNull());
    expect(params().get('month')).toBe('2026-11');
  });

  it('the header button opens it', async () => {
    h.answers.work_rest_vessel_board = () => ({
      data: {
        ...BOARD,
        members: [],
      },
      error: null,
    });
    renderPage('/v/dra/crew/hours-of-rest?month=2026-11');
    fireEvent.click(await screen.findByRole('button', { name: 'Breaches' }));
    await waitFor(() => expect(params().get('breaches')).toBe('open'));
    expect(await panel()).toBeInTheDocument();
  });

  it('a month without breaches says so', async () => {
    h.answers.work_rest_vessel_breaches = () => ({ data: [], error: null });
    renderPage();
    expect(await within(await panel()).findByRole('heading', { name: 'No breaches this month' })).toBeInTheDocument();
  });

  it('every breach reviewed: the filtered empty state offers all of them', async () => {
    h.answers.work_rest_vessel_breaches = () => ({ data: [ROWS[1]], error: null });
    renderPage();
    const sheet = await panel();
    expect(await within(sheet).findByRole('heading', { name: 'Every breach this month is reviewed' })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(params().get('breaches')).toBe('all'));
  });

  it('cards below the tablet width', async () => {
    h.wide = false;
    renderPage();
    const sheet = await panel();
    const list = await within(sheet).findByRole('list', { name: 'Breaches' });
    expect(within(sheet).queryByRole('table')).toBeNull();
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Serious Example');
  });
});

// ─── Reviewing ───────────────────────────────────────────────────────────

const openReview = async (who: string) => {
  const sheet = await panel();
  const table = await within(sheet).findByRole('table', { name: 'Breaches' });
  const row = within(table).getByText(who).closest('tr') as HTMLElement;
  fireEvent.click(within(row).getByRole('button', { name: /^Review the breach of/ }));
  return screen.findByRole('dialog', { name: 'Review the breach' });
};

describe('reviewing a breach', () => {
  it('accepting needs a justification; then work_rest_review_breach gets the outcome and the note', async () => {
    h.answers.work_rest_review_breach = () => ({ data: { nc_id: 'serious', review_outcome: 'accepted', status: 'justified', month_status: 'submitted', reopened: false }, error: null });
    renderPage();
    const dialog = await openReview('Serious Example');
    expect(within(dialog).getByText(/Serious Example, 9 Nov: Rest in 24 h, 6.5 h short/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['accepted', 'correction_requested']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept with justification' }));
    expect(await within(dialog).findByText('Give the justification, for example an emergency or a drill.')).toBeInTheDocument();
    expect(rpcCalls('work_rest_review_breach')).toEqual([]);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Justification' }), { target: { value: 'Man overboard drill' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept with justification' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Breach accepted with your justification'));
    expect(rpcCalls('work_rest_review_breach')).toEqual([{ p_nc_id: 'serious', p_outcome: 'accepted', p_note: 'Man overboard drill' }]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review the breach' })).toBeNull());
    // The vessel's keys refresh: the breaches are asked again.
    await waitFor(() => expect(rpcCalls('work_rest_vessel_breaches').length).toBeGreaterThan(1));
  });

  it('a correction reopens the month and says so; the note is optional', async () => {
    h.answers.work_rest_review_breach = () => ({ data: { nc_id: 'late', review_outcome: 'correction_requested', status: 'reviewed', month_status: 'reopened', reopened: true }, error: null });
    renderPage();
    const dialog = await openReview('Late Example');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Request correction/ }));
    expect(within(dialog).getByRole('textbox', { name: 'What to correct (optional)' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request correction' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Correction requested'));
    expect(h.notify.info).toHaveBeenCalledWith("Late Example's month is reopened so they can correct the record.");
    expect(rpcCalls('work_rest_review_breach')).toEqual([{ p_nc_id: 'late', p_outcome: 'correction_requested', p_note: null }]);
  });

  it('a breach waiting on a correction is accepted or dismissed', async () => {
    h.answers.work_rest_review_breach = () => ({ data: { nc_id: 'corr', review_outcome: 'dismissed', status: 'dismissed', month_status: 'reopened', reopened: false }, error: null });
    renderPage();
    const dialog = await openReview('Correction Example');
    expect(within(dialog).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['accepted', 'dismissed']);
    fireEvent.click(within(dialog).getByRole('radio', { name: /Dismiss/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Breach dismissed'));
    expect(rpcCalls('work_rest_review_breach')[0]).toMatchObject({ p_nc_id: 'corr', p_outcome: 'dismissed' });
  });

  it('a refusal stays in the dialog with the server\'s sentence', async () => {
    h.answers.work_rest_review_breach = () => ({ data: null, error: { code: '22023', message: 'breach_superseded', details: 'The record was corrected and this breach no longer applies.' } });
    renderPage();
    const dialog = await openReview('Late Example');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Justification' }), { target: { value: 'Port arrival' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept with justification' }));
    expect(await within(dialog).findByText('The record was corrected and this breach no longer applies.')).toBeInTheDocument();
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('a breach the viewer may not review offers no Review', async () => {
    h.answers.work_rest_vessel_breaches = () => ({ data: [breach('own', { first_name: 'Own', can_review: false })], error: null });
    renderPage();
    const table = await within(await panel()).findByRole('table', { name: 'Breaches' });
    expect(within(table).queryByRole('button', { name: /^Review the breach/ })).toBeNull();
  });
});

// ─── D-01 and errors ─────────────────────────────────────────────────────

describe('fallback and errors', () => {
  it('the breach RPC missing: not set up yet (D-01)', async () => {
    delete h.answers.work_rest_vessel_breaches;
    renderPage();
    expect(await within(await panel()).findByRole('heading', { name: 'Breach review is not set up yet' })).toBeInTheDocument();
  });

  it('any other error is an error with Try again, which asks again', async () => {
    let calls = 0;
    h.answers.work_rest_vessel_breaches = () => {
      calls += 1;
      return calls <= 2 ? { data: null, error: { code: 'XX000', message: 'The connection dropped.' } } : { data: ROWS, error: null };
    };
    renderPage();
    const sheet = await panel();
    expect(await within(sheet).findByText('The breaches could not load')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Try again' }));
    expect(await within(sheet).findByRole('table', { name: 'Breaches' })).toBeInTheDocument();
  });

  it('the review RPC missing: the dialog says the review comes with the update', async () => {
    renderPage();
    const dialog = await openReview('Late Example');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Justification' }), { target: { value: 'Port arrival' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept with justification' }));
    expect(await within(dialog).findByText('Breach review becomes available once the hours-of-rest update is applied.')).toBeInTheDocument();
  });
});
