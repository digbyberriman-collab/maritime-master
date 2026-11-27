/**
 * One familiarisation record (X1-10; gap/04 C63, W11) at
 * crew/familiarisation/:recordId:
 *
 * - the gate in the page (the route guard is the scope only): loading reads
 *   nothing; neither familiarisation.view nor view_own is AccessDenied and
 *   reads nothing; view_own alone reads (the server answers only for the
 *   caller's own record) and shows no way back to the vessel list;
 * - not found (P0002), not applied (D-01) and other errors (Try again);
 * - the checklist by section, who ticked what, due and overdue, progress;
 *   a tick goes to familiarisation_tick and an answer that does not
 *   confirm it is an error; a closed tick says why;
 * - the sign-off: Sign only when the server says so (p_as crew or
 *   supervisor), the reason otherwise; reopen asks for a reason and sends
 *   it trimmed; delete asks first and goes back to the list;
 * - at 390 px nothing is wider than the screen.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

type CapState = 'granted' | 'loading' | 'denied';
const h = vi.hoisted(() => ({
  caps: {} as Record<string, 'granted' | 'loading' | 'denied'>,
  rpc: vi.fn(),
  fromCalls: [] as string[],
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from, storage: { from: () => ({}) } } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => {
    const state = h.caps[key] ?? 'denied';
    if (state === 'loading') return { allowed: false, status: 'loading', reason: 'test' };
    return { allowed: state === 'granted', status: state, reason: 'test' };
  },
  useCan: (key: string) => h.caps[key] === 'granted',
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return {
    ...actual,
    notify: { ...actual.notify, success: (...a: unknown[]) => h.notifySuccess(...a), error: (...a: unknown[]) => h.notifyError(...a) },
  };
});

import FamiliarisationRecordPage from '@/modules/crew/pages/FamiliarisationRecordPage';
import { FAMILIARISATION_NOT_SET_UP_NOTICE } from '@/modules/crew/hooks/useFamiliarisation';

const VIEW = 'vessel.crew.familiarisation.view';
const VIEW_OWN = 'vessel.crew.familiarisation.view_own';

const item = (id: string, section: string, order: number, text: string, done = false, by: string | null = null) => ({
  id,
  section_name: section,
  item_text: text,
  item_order: order,
  completed: done,
  completed_date: done ? '2026-11-12' : null,
  completed_by_name: by,
  notes: null,
});

const DETAIL = (over: Record<string, unknown> = {}) => ({
  id: 'rec-1',
  company_id: 'c-1',
  vessel_id: 'v-dra',
  vessel_name: 'DRAAK',
  template_id: 'tpl-int',
  template_code: 'FAM-DRA-2026-001',
  template_name: 'Interior familiarisation',
  template_description: 'For everyone joining the interior team.',
  template_scope: 'vessel',
  profile_id: 'p-stew',
  person: { first_name: 'Sam', last_name: 'Stewart', preferred_name: null, avatar_url: null, has_login: true },
  status: 'in_progress',
  join_date: '2026-11-10',
  due_date: '2026-11-24',
  overdue: true,
  completed_on: null,
  items_total: 3,
  items_done: 1,
  requires_crew_signature: true,
  requires_supervisor_signature: true,
  crew_signed_at: null,
  crew_signed_by_name: null,
  supervisor_signed_at: null,
  supervisor_signed_by_name: null,
  reopened_at: null,
  reopened_reason: null,
  reopened_by_name: null,
  items: [
    item('i-3', 'Service', 2001, 'Pantry tour'),
    item('i-1', 'Safety', 1001, 'Muster station shown', true, 'Chris Chief'),
    item('i-2', 'Safety', 1002, 'Alarms explained'),
  ],
  rights: { tick: 'ok', sign_crew: 'items_open', sign_supervisor: 'items_open', reopen: 'not_reopenable', delete: 'not_deletable', is_own: false },
  ...over,
});

type RpcAnswer = { data: unknown; error: unknown };
let answers: Record<string, (args: Record<string, unknown>) => RpcAnswer>;
const missing = (fn: string): RpcAnswer => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });

let qc: QueryClient;
let lastLocation = '';
const LocationProbe: React.FC = () => {
  const loc = useLocation();
  lastLocation = `${loc.pathname}${loc.search}`;
  return null;
};

function renderPage(initial = '/v/dra/crew/familiarisation/rec-1') {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/v/:vesselCode/crew/familiarisation/:recordId" element={<FamiliarisationRecordPage />} />
          <Route path="/v/:vesselCode/crew/familiarisation" element={<p>the list</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const calls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args as Record<string, unknown>);
const ready = () => waitFor(() => expect(document.querySelector('[data-familiarisation-record]')).not.toBeNull());
const setCaps = (view: CapState, own: CapState) => {
  h.caps = { [VIEW]: view, [VIEW_OWN]: own };
};

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  setCaps('granted', 'granted');
  h.fromCalls = [];
  h.notifySuccess.mockReset();
  h.notifyError.mockReset();
  answers = { familiarisation_record_detail: () => ({ data: DETAIL(), error: null }) };
  h.rpc.mockReset();
  h.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => Promise.resolve(answers[fn] ? answers[fn](args) : missing(fn)));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  lastLocation = '';
});
afterEach(() => qc.clear());

describe('the gate', () => {
  it('while the capabilities load: nothing is read', () => {
    setCaps('loading', 'granted');
    renderPage();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(document.querySelector('[data-familiarisation-record]')).toBeNull();
  });

  it('neither view nor view_own: AccessDenied, nothing read', () => {
    setCaps('denied', 'denied');
    renderPage();
    expect(screen.getByRole('heading', { name: "You can't see this familiarisation" })).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('view_own alone: the record is read for its id, with no way back to the vessel list', async () => {
    setCaps('denied', 'granted');
    answers.familiarisation_record_detail = () => ({
      data: DETAIL({ rights: { tick: 'not_permitted', sign_crew: 'items_open', sign_supervisor: 'own_record', reopen: 'not_permitted', delete: 'not_permitted', is_own: true } }),
      error: null,
    });
    renderPage();
    await ready();
    expect(calls('familiarisation_record_detail')[0]).toEqual({ p_record_id: 'rec-1' });
    expect(screen.queryByRole('link', { name: 'Familiarisation' })).toBeNull();
  });
});

describe('the states', () => {
  it('not found (P0002): explained, with the way back', async () => {
    answers.familiarisation_record_detail = () => ({ data: null, error: { code: 'P0002', message: 'record_not_found', details: 'This familiarisation record could not be found.' } });
    renderPage();
    expect(await screen.findByText('This familiarisation could not be found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Familiarisation' })).toHaveAttribute('href', '/v/dra/crew/familiarisation');
  });

  it('not applied (D-01): the notice', async () => {
    answers.familiarisation_record_detail = () => missing('familiarisation_record_detail');
    renderPage();
    expect(await screen.findByText(FAMILIARISATION_NOT_SET_UP_NOTICE)).toBeInTheDocument();
  });

  it('any other error: PageError with Try again', async () => {
    let failing = true;
    answers.familiarisation_record_detail = () => (failing ? { data: null, error: { code: '57014', message: 'timeout' } } : { data: DETAIL(), error: null });
    renderPage();
    const retry = await screen.findByRole('button', { name: /try again/i });
    failing = false;
    fireEvent.click(retry);
    await ready();
  });
});

describe('the checklist', () => {
  it('sections in item order, who ticked what, due and overdue, progress', async () => {
    renderPage();
    await ready();
    expect(screen.getByRole('heading', { name: 'Sam Stewart · Interior familiarisation' })).toBeInTheDocument();
    const sections = Array.from(document.querySelectorAll('[data-section]')).map((el) => el.getAttribute('data-section'));
    expect(sections).toEqual(['Safety', 'Service']);
    const safety = document.querySelector('[data-section="Safety"]') as HTMLElement;
    expect(within(safety).getByText('1 of 2')).toBeInTheDocument();
    expect(within(safety).getByText(/Ticked 12 Nov 2026 by Chris Chief/)).toBeInTheDocument();
    expect(screen.getByText(/Overdue by \d+ days? \(due 24 Nov 2026\)/)).toBeInTheDocument();
    expect(screen.getByText('1 of 3 items ticked')).toBeInTheDocument();
    expect(document.querySelector('[data-status="overdue"]')).not.toBeNull();
  });

  it('a tick goes to familiarisation_tick; the answer must confirm it', async () => {
    // The server is stateful: the refetch after the write sees the tick.
    let current: Record<string, unknown> = DETAIL();
    answers.familiarisation_record_detail = () => ({ data: current, error: null });
    answers.familiarisation_tick = (args) => {
      current = DETAIL({ items_done: 2, items: DETAIL().items.map((i) => (i.id === args.p_item_id ? { ...i, completed: true, completed_by_name: 'Chris Chief', completed_date: '2026-11-27' } : i)) });
      return { data: current, error: null };
    };
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: /Alarms explained/ }));
    await waitFor(() => expect(calls('familiarisation_tick')).toHaveLength(1));
    expect(calls('familiarisation_tick')[0]).toEqual({ p_item_id: 'i-2', p_done: true, p_note: null });
    await waitFor(() => expect(screen.getByText('2 of 3 items ticked')).toBeInTheDocument());
    expect(h.notifyError).not.toHaveBeenCalled();
  });

  it('an answer that does not hold the tick is an error, not a success', async () => {
    answers.familiarisation_tick = () => ({ data: DETAIL(), error: null });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: /Alarms explained/ }));
    await waitFor(() => expect(h.notifyError).toHaveBeenCalled());
    expect(String((h.notifyError.mock.calls[0][0] as Error).message)).toBe('The item was not changed.');
  });

  it('a closed tick says why (signed), and the boxes are disabled', async () => {
    answers.familiarisation_record_detail = () => ({
      data: DETAIL({ status: 'awaiting_signatures', items_done: 3, overdue: false, crew_signed_at: '2026-11-20T09:00:00Z', crew_signed_by_name: 'Sam Stewart', rights: { tick: 'record_signed', sign_crew: 'already_signed', sign_supervisor: 'ok', reopen: 'ok', delete: 'not_deletable', is_own: false } }),
      error: null,
    });
    renderPage();
    await ready();
    expect(screen.getByText('This familiarisation has a signature. Reopen it to change the checklist.')).toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
  });
});

describe('the sign-off', () => {
  it('Sign only when allowed; the reason otherwise', async () => {
    renderPage();
    await ready();
    const crew = document.querySelector('[data-signature="crew"]') as HTMLElement;
    expect(within(crew).queryByRole('button', { name: 'Sign' })).toBeNull();
    expect(within(crew).getByText('Sam Stewart signs once every item is ticked.')).toBeInTheDocument();
  });

  it('a reason that is not about the ticks is shown under the waiting line (own record, no sign-in)', async () => {
    answers.familiarisation_record_detail = () => ({
      data: DETAIL({ status: 'awaiting_signatures', items_done: 3, overdue: false, rights: { tick: 'ok', sign_crew: 'no_login', sign_supervisor: 'own_record', reopen: 'not_reopenable', delete: 'not_deletable', is_own: false } }),
      error: null,
    });
    renderPage();
    await ready();
    expect(within(document.querySelector('[data-signature="crew"]') as HTMLElement).getByText('The crew member signs once they have a sign-in.')).toBeInTheDocument();
    expect(within(document.querySelector('[data-signature="supervisor"]') as HTMLElement).getByText('You cannot supervise your own familiarisation.')).toBeInTheDocument();
  });

  it('signing as supervisor sends p_as supervisor and checks the answer', async () => {
    let current: Record<string, unknown> = DETAIL({ status: 'awaiting_signatures', items_done: 3, overdue: false, rights: { tick: 'ok', sign_crew: 'not_permitted', sign_supervisor: 'ok', reopen: 'not_reopenable', delete: 'not_deletable', is_own: false } });
    answers.familiarisation_record_detail = () => ({ data: current, error: null });
    answers.familiarisation_sign = () => {
      current = DETAIL({ status: 'awaiting_signatures', supervisor_signed_at: '2026-11-27T10:00:00Z', supervisor_signed_by_name: 'Chris Chief' });
      return { data: current, error: null };
    };
    renderPage();
    await ready();
    const sup = document.querySelector('[data-signature="supervisor"]') as HTMLElement;
    fireEvent.click(within(sup).getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(calls('familiarisation_sign')).toHaveLength(1));
    expect(calls('familiarisation_sign')[0]).toEqual({ p_record_id: 'rec-1', p_as: 'supervisor' });
    await waitFor(() => expect(within(document.querySelector('[data-signature="supervisor"]') as HTMLElement).getByText(/Signed by Chris Chief/)).toBeInTheDocument());
    expect(h.notifySuccess).toHaveBeenCalledWith('Signed as supervisor.');
  });

  it('a template that needs no signatures says so', async () => {
    answers.familiarisation_record_detail = () => ({ data: DETAIL({ requires_crew_signature: false, requires_supervisor_signature: false }), error: null });
    renderPage();
    await ready();
    expect(screen.getByText(/needs no signatures/)).toBeInTheDocument();
  });
});

describe('reopen and delete', () => {
  it('reopen asks for a reason and sends it trimmed', async () => {
    const completed = DETAIL({ status: 'completed', items_done: 3, overdue: false, completed_on: '2026-11-21', crew_signed_at: '2026-11-20T09:00:00Z', supervisor_signed_at: '2026-11-21T09:00:00Z', rights: { tick: 'record_completed', sign_crew: 'already_signed', sign_supervisor: 'already_signed', reopen: 'ok', delete: 'not_deletable', is_own: false } });
    let current: Record<string, unknown> = completed;
    answers.familiarisation_record_detail = () => ({ data: current, error: null });
    answers.familiarisation_reopen = (args) => {
      current = { ...completed, status: 'awaiting_signatures', crew_signed_at: null, supervisor_signed_at: null, reopened_at: '2026-11-27T11:00:00Z', reopened_reason: args.p_reason, reopened_by_name: 'Chris Chief' };
      return { data: current, error: null };
    };
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reopen familiarisation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    expect(await within(dialog).findByText('Say why it is reopened')).toBeInTheDocument();
    expect(calls('familiarisation_reopen')).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: '  Missed the lifejacket donning  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(calls('familiarisation_reopen')).toHaveLength(1));
    expect(calls('familiarisation_reopen')[0]).toEqual({ p_record_id: 'rec-1', p_reason: 'Missed the lifejacket donning' });
    expect(await screen.findByText(/Reopened .* by Chris Chief: Missed the lifejacket donning/)).toBeInTheDocument();
  });

  it('no Reopen or Delete without the right', async () => {
    renderPage();
    await ready();
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('delete asks first, then deletes and goes back to the list', async () => {
    answers.familiarisation_record_detail = () => ({ data: DETAIL({ items_done: 0, items: DETAIL().items.map((i) => ({ ...i, completed: false })), rights: { ...DETAIL().rights, delete: 'ok' } }), error: null });
    answers.familiarisation_delete = (args) => ({ data: args.p_record_id, error: null });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete this familiarisation?' });
    expect(calls('familiarisation_delete')).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('familiarisation_delete')).toEqual([{ p_record_id: 'rec-1' }]));
    await waitFor(() => expect(lastLocation).toBe('/v/dra/crew/familiarisation'));
  });

  it('a delete the server did not confirm stays on the page with an error', async () => {
    answers.familiarisation_record_detail = () => ({ data: DETAIL({ rights: { ...DETAIL().rights, delete: 'ok' } }), error: null });
    answers.familiarisation_delete = () => ({ data: 'someone-else', error: null });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete this familiarisation?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(h.notifyError).toHaveBeenCalled());
    expect(lastLocation).toBe('/v/dra/crew/familiarisation/rec-1');
  });
});

describe('at 390 px', () => {
  it('nothing is wider than the screen', async () => {
    window.innerWidth = 390;
    const { container } = renderPage();
    await ready();
    const wide = Array.from(container.querySelectorAll<HTMLElement>('[class]')).filter((el) => /\b(?:w|min-w)-\[(?:[4-9]\d\d|\d{4,})px\]/.test(el.className));
    expect(wide).toEqual([]);
    expect((document.querySelector('[data-familiarisation-record]') as HTMLElement).className).toContain('min-w-0');
  });
});
