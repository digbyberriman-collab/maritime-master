/**
 * The vessel's Employment History page (X1-11B; gap/04 C59, W8) at
 * crew/employment-history?dept=:
 *
 * - the gate (hris.employee_records.contracts_employment.view on the route
 *   vessel): loading and denied read nothing;
 * - D-01: crew_vessel_employment_history missing says the history is not set
 *   up (never an empty history); any other error is PageError with Retry;
 *   a 42501 is no access;
 * - the counters (past crew, records), the columns (crew, position,
 *   department, period, duration, reason), the department filter (?dept=,
 *   sent to the server), View (the person's Employment tab);
 * - Re-hire: for holders of crew profile creation; someone on a crew today
 *   is stopped with the reason; otherwise crew_rehire_prefill is read and
 *   Add crew opens with ?rehire= (also while that RPC is missing).
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  caps: {} as Record<string, 'granted' | 'denied' | 'loading'>,
  rpc: vi.fn(),
  vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } as { id: string; company_id: string; name: string } | null,
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), promise: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from: vi.fn() } }));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => {
    const status = h.caps[key] ?? 'denied';
    return { allowed: status === 'granted', status, reason: 'test' };
  },
  useCan: (key: string) => h.caps[key] === 'granted',
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => (h.vessel ? { scope: 'vessel', vesselCode: 'DRA', vessel: h.vessel } : { scope: 'fleet', vesselCode: null, vessel: null }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (path: string) => `/v/dra/${path}` }));
vi.mock('@/modules/crew/hooks/useReferenceData', () => ({
  useDepartments: () => ({
    status: 'ready',
    items: [
      { key: 'deck', label: 'Deck', sort_order: 1 },
      { key: 'interior', label: 'Interior', sort_order: 2 },
    ],
  }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import EmploymentHistoryPage from '@/modules/crew/pages/EmploymentHistoryPage';
import { HISTORY_NOT_SET_UP } from '@/modules/crew/hooks/useEmploymentHistory';
import { CREW_CAPS } from '@/modules/crew/paths';

const row = (over: Record<string, unknown> = {}) => ({
  assignment_id: 'a-1',
  profile_id: 'p-bosun',
  user_id: 'u-bosun',
  first_name: 'Demo',
  last_name: 'Bosun',
  preferred_name: null,
  position_text: 'Bosun',
  position_id: 'pos-bosun',
  position_name: 'Bosun',
  department_key: 'deck',
  department_label: 'Deck',
  join_date: '2024-03-01',
  leave_date: '2026-05-13',
  duration_days: 803,
  end_reason: 'contract_end',
  end_notes: 'Completed two seasons',
  current_vessel_id: null,
  current_vessel_name: null,
  ...over,
});

const ROWS = [
  row(),
  row({ assignment_id: 'a-2', profile_id: 'p-stew', user_id: 'u-stew', first_name: 'Demo', last_name: 'Stew', position_name: 'Second Stew', position_text: 'Stew', department_key: 'interior', department_label: 'Interior', join_date: '2025-06-01', leave_date: '2025-09-15', duration_days: 106, end_reason: 'resignation', end_notes: null, current_vessel_id: 'v-gam', current_vessel_name: 'GAMMA' }),
  row({ assignment_id: 'a-3', join_date: '2022-01-10', leave_date: '2024-02-28', duration_days: 779, end_reason: 'promotion', end_notes: null }),
];

const Where: React.FC = () => {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
};

const renderPage = (url = '/v/dra/crew/employment-history') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/v/dra/crew/employment-history" element={<EmploymentHistoryPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const answer = (data: unknown) => ({ data, error: null });

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
  h.caps = { [CREW_CAPS.employmentView]: 'granted' };
  h.vessel = { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' };
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (fn: string) => (fn === 'crew_vessel_employment_history' ? answer(ROWS) : answer(null)));
  for (const f of Object.values(h.notify)) f.mockReset();
});

describe('the gate and the states', () => {
  it('no vessel: asks for one', () => {
    h.vessel = null;
    renderPage();
    expect(screen.getByText('Choose a vessel')).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('loading: no request', () => {
    h.caps = { [CREW_CAPS.employmentView]: 'loading' };
    renderPage();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('denied: no access, and no request', () => {
    h.caps = {};
    renderPage();
    expect(screen.getByText("You can't see this vessel's employment history")).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('D-01: the RPC missing says the history is not set up yet, never an empty history', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_vessel_employment_history' } });
    renderPage();
    expect(await screen.findByText('Employment history is not set up yet')).toBeInTheDocument();
    expect(screen.getByText(HISTORY_NOT_SET_UP)).toBeInTheDocument();
    expect(screen.queryByText(/No one has left/)).toBeNull();
  });

  it('a 42501 is no access', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'crew_not_permitted', details: 'You can’t see the employment history of this vessel.' } });
    renderPage();
    expect(await screen.findByText('You can’t see the employment history of this vessel.')).toBeInTheDocument();
  });

  it('any other error is PageError with Retry, which reads again', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    renderPage();
    expect(await screen.findByText('The employment history could not load', undefined, { timeout: 4000 })).toBeInTheDocument();
    const calls = h.rpc.mock.calls.length;
    h.rpc.mockImplementation(async () => answer(ROWS));
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    await waitFor(() => expect(h.rpc.mock.calls.length).toBeGreaterThan(calls));
    expect(await screen.findByText('Records')).toBeInTheDocument();
  });

  it('empty: says no one has left yet', async () => {
    h.rpc.mockResolvedValue(answer([]));
    renderPage();
    expect(await screen.findByText('No one has left this vessel’s crew yet')).toBeInTheDocument();
  });
});

describe('the history', () => {
  it('counts past crew (people) and records (ended assignments)', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Demo Bosun');
    const counters = container.querySelector('[data-history-counters]') as HTMLElement;
    const [past, records] = Array.from(counters.children) as HTMLElement[];
    expect(past.textContent).toContain('Past crew');
    expect(past.textContent).toContain('2');
    expect(records.textContent).toContain('Records');
    expect(records.textContent).toContain('3');
    expect(h.rpc).toHaveBeenCalledWith('crew_vessel_employment_history', { p_vessel_id: 'v-dra', p_department_key: null });
  });

  it('shows crew, position, department, period, duration and reason (legacy reasons humanised)', async () => {
    renderPage();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const first = rows[0];
    expect(within(first).getByRole('link', { name: 'Demo Bosun' })).toHaveAttribute('href', '/v/dra/crew/people/p-bosun/employment?sub=details');
    expect(first.textContent).toContain('Bosun');
    expect(first.textContent).toContain('Deck');
    expect(first.textContent).toContain('1 Mar 2024 to 13 May 2026');
    expect(first.textContent).toContain('2 yr 2 mo');
    expect(within(first).getByText('2 years 2 months')).toHaveClass('sr-only');
    expect(first.textContent).toContain('Contract end');
    expect(first.textContent).toContain('Completed two seasons');
    expect(rows[2].textContent).toContain('Promotion');
    expect(rows[1].textContent).toContain('Now on GAMMA');
  });

  it('?dept= narrows it on the server, and the filter changes it', async () => {
    renderPage('/v/dra/crew/employment-history?dept=interior');
    await screen.findAllByText('Demo Stew');
    expect(h.rpc).toHaveBeenCalledWith('crew_vessel_employment_history', { p_vessel_id: 'v-dra', p_department_key: 'interior' });
    expect(screen.getByText('People who have left in Interior')).toBeInTheDocument();
    // Only that department's rows show, and the counters count them, whatever the answer held.
    expect(screen.queryByText('Demo Bosun')).toBeNull();
    const counters = document.querySelector('[data-history-counters]');
    expect(counters?.textContent).toMatch(/Past crew\s*1/i);
    fireEvent.click(screen.getByRole('combobox', { name: 'Department' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Deck' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('crew_vessel_employment_history', { p_vessel_id: 'v-dra', p_department_key: 'deck' }));
  });

  it('the page and the table may shrink at phone width (no page overflow at 390 px)', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Demo Bosun');
    expect(container.querySelector('[data-employment-history="ready"]')).toHaveClass('min-w-0');
  });
});

describe('Re-hire', () => {
  it('is offered only to holders of crew profile creation', async () => {
    renderPage();
    await screen.findAllByText('Demo Bosun');
    expect(screen.queryByRole('button', { name: /^Re-hire/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /^View / }).length).toBe(3);
  });

  it('someone on a crew today is stopped with the reason', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted' };
    renderPage();
    const blocked = await screen.findByRole('button', { name: 'Re-hire Demo Stew: On GAMMA’s crew now. Transfer them instead.' });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(blocked);
    expect(h.rpc).not.toHaveBeenCalledWith('crew_rehire_prefill', expect.anything());
  });

  it('reads crew_rehire_prefill, then opens Add crew with ?rehire=', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted' };
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'crew_vessel_employment_history') return answer(ROWS);
      if (fn === 'crew_rehire_prefill') return answer({ profile_id: 'p-bosun', first_name: 'Demo', last_name: 'Bosun', has_login: true, current: null, terms: { position_id: 'pos-bosun' } });
      return answer(null);
    });
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Re-hire Demo Bosun' });
    fireEvent.click(buttons[0]);
    expect(await screen.findByTestId('where')).toHaveTextContent('/v/dra/crew/new?rehire=p-bosun');
    expect(h.rpc).toHaveBeenCalledWith('crew_rehire_prefill', { p_profile_id: 'p-bosun', p_vessel_id: 'v-dra' });
  });

  it('the server naming a current crew stops it with the reason', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted' };
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'crew_vessel_employment_history') return answer(ROWS);
      if (fn === 'crew_rehire_prefill') return answer({ profile_id: 'p-bosun', first_name: 'Demo', last_name: 'Bosun', has_login: true, current: { vessel_id: 'v-hyd', vessel_name: 'HYDRA' } });
      return answer(null);
    });
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Re-hire Demo Bosun' }))[0]);
    await waitFor(() => expect(h.notify.warning).toHaveBeenCalledWith('Not re-hired', { description: 'Demo Bosun is on HYDRA’s crew now. Transfer them instead of re-hiring.' }));
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('a refusal stops it with the STORM sentence', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted' };
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'crew_vessel_employment_history') return answer(ROWS);
      return { data: null, error: { code: '42501', message: 'crew_not_permitted', details: 'You can’t add crew to this vessel.' } };
    });
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Re-hire Demo Bosun' }))[0]);
    await waitFor(() => expect(h.notify.warning).toHaveBeenCalledWith('Not re-hired', { description: 'You can’t add crew to this vessel.' }));
  });

  it('D-01: with the prefill RPC missing, Add crew still opens (it reads the legacy prefill itself)', async () => {
    h.caps = { [CREW_CAPS.employmentView]: 'granted', [CREW_CAPS.profilesCreate]: 'granted' };
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'crew_vessel_employment_history') return answer(ROWS);
      return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } };
    });
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Re-hire Demo Bosun' }))[0]);
    expect(await screen.findByTestId('where')).toHaveTextContent('/v/dra/crew/new?rehire=p-bosun');
  });
});
