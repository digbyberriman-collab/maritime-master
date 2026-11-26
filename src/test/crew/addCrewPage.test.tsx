/**
 * Add crew member page (X1-03B; gap/04 C14, C15, C55, W1; D-01):
 *
 * - the gate: while vessel.crew.crew_profiles.create loads nothing is read
 *   and no form shows; denied is AccessDenied with no request;
 * - without users-access administration the form is usable but Save is
 *   disabled and says who can save;
 * - success: the duplicate check, create-crew-member with the role the
 *   position implies, then crew_onboarding_save with the terms; "Added and
 *   invited" with a link to the profile;
 * - partial failure: the terms store missing (D-01) or refusing reads
 *   "Added. The employment details were not saved: …";
 * - refusal: create-crew-member 409 is shown at the email, nothing else runs;
 * - duplicates: a name match asks to confirm; an email match blocks; a
 *   missing check is skipped and said;
 * - D-01: without the positions catalogue the position is typed;
 * - a re-hire saves only the terms;
 * - the layout cannot overflow at 390 px.
 *
 * The client is mocked at supabase.rpc / from / functions.invoke; the real
 * hooks, schema and adminActions wrapper run.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  gate: 'granted' as 'granted' | 'loading' | 'denied',
  admin: 'granted' as 'granted' | 'loading' | 'denied',
  rpc: vi.fn(),
  invoke: vi.fn(),
  tables: {} as Record<string, Result>,
  fromCalls: [] as string[],
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const result = (): Result => h.tables[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'is', 'order', 'limit', 'neq']) chain[m] = () => chain;
    chain.maybeSingle = () => {
      const r = result();
      return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
    };
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from, functions: { invoke: (...args: unknown[]) => h.invoke(...args) } } };
});
vi.mock('@/lib/permissions/useCan', () => {
  const decision = (status: string) => ({ allowed: status === 'granted', status, reason: 'test' });
  return {
    useCapability: (key: string) => decision(key === 'admin.access.users_access.admin' ? h.admin : h.gate),
    useCan: (key: string) => (key === 'admin.access.users_access.admin' ? h.admin === 'granted' : h.gate === 'granted'),
  };
});
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import AddCrewPage, { ADMIN_NEEDED, DUPLICATES_UNAVAILABLE, NOT_SET_UP_NOTICE } from '@/modules/crew/pages/AddCrewPage';

const P_NEW = 'b0000000-0000-4000-8000-0000000000aa';
const P_OLD = 'b0000000-0000-4000-8000-000000000015';

const position = (over: Record<string, unknown>) => ({
  position_id: 'p',
  scope: 'system',
  key: 'k',
  name: 'Name',
  department_key: 'deck',
  department_label: 'Deck',
  department_sort: 20,
  rank_tier: 'rating',
  default_access_set_key: 'crew',
  stcw_capacity: null,
  base_sort_order: 40201,
  sort_order: 40201,
  is_listed: true,
  min_on_board: 0,
  max_on_board: null,
  holder_count: 0,
  ...over,
});

const POSITIONS = [
  position({ position_id: 'p-master', key: 'master', name: 'Master', department_key: 'bridge', department_label: 'Bridge', department_sort: 10, rank_tier: 'command', default_access_set_key: 'full_vessel', sort_order: 10101 }),
  position({ position_id: 'p-deckhand', key: 'deckhand', name: 'Deckhand', holder_count: 3 }),
];

type RpcHandler = (args: Record<string, unknown>) => Result;
let rpcAnswers: Record<string, RpcHandler>;
const missing = (fn: string): Result => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });

const created = (status = 201, body: unknown = { ok: true, profileId: P_NEW, invitation: { status: 'sent', invitationId: 'i-1', stored: true }, assignment: 'pending_login' }) => {
  if (status < 300) return { data: body, error: null };
  return { data: null, error: { context: { status, json: () => Promise.resolve(body) } } };
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
  h.admin = 'granted';
  h.fromCalls = [];
  h.tables = {
    departments: { data: [{ key: 'bridge', label: 'Bridge', sort_order: 10 }, { key: 'deck', label: 'Deck', sort_order: 20 }], error: null },
    contract_types: { data: [{ key: 'permanent', label: 'Permanent', company_id: null, sort_order: 10 }, { key: 'rotational', label: 'Rotational', company_id: null, sort_order: 20 }], error: null },
    vessels: { data: [{ id: 'v-dra', home_port: 'Antibes' }], error: null },
  };
  rpcAnswers = {
    crew_positions_for_vessel: () => ({ data: POSITIONS, error: null }),
    crew_vessel_unmatched_titles: () => ({ data: [], error: null }),
    crew_find_duplicates: () => ({ data: [], error: null }),
    crew_onboarding_save: (args) => ({ data: { id: 't-1', profile_id: args.p_profile_id, vessel_id: args.p_vessel_id }, error: null }),
  };
  h.rpc.mockReset();
  h.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => Promise.resolve(rpcAnswers[fn] ? rpcAnswers[fn](args) : missing(fn)));
  h.invoke.mockReset();
  h.invoke.mockImplementation(() => Promise.resolve(created()));
  for (const fn of Object.values(h.notify)) fn.mockReset();
});

afterEach(() => vi.clearAllMocks());

const renderAt = (url = '/v/dra/crew/new') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/v/:vesselCode/crew/new" element={<AddCrewPage />} />
          <Route path="/v/:vesselCode/crew/list" element={<p>The crew list</p>} />
          <Route path="/v/:vesselCode/crew/people/:profileId/:tab" element={<p>A profile</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const rpcCalls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn);

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function fillValidForm(options: { position?: string } = {}) {
  await screen.findByRole('heading', { level: 1, name: 'Add crew member' });
  type(/^First name/, 'Demo');
  type(/^Last name/, 'Deckhand');
  type(/^Email/, 'deckhand.new@example.test');
  fireEvent.click(screen.getByRole('combobox', { name: 'Position' }));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(options.position ?? 'Deckhand') }));
  type(/^Start date/, '2026-12-01');
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Add crew member' }));

describe('the gate', () => {
  it('loading: nothing is read and no form shows', () => {
    h.gate = 'loading';
    renderAt();
    expect(screen.queryByRole('form')).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('denied: AccessDenied, no request', () => {
    h.gate = 'denied';
    renderAt();
    expect(screen.getByRole('heading', { name: "You can't add crew to this vessel" })).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('without users-access administration: the form is usable, Save is disabled and says who can save', async () => {
    h.admin = 'denied';
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Add crew member' });
    expect(screen.getByText(ADMIN_NEEDED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add crew member' })).toBeDisabled();
    expect(h.invoke).not.toHaveBeenCalled();
  });
});

describe('the form', () => {
  it('shows the W1 sections, the vessel home port as the embarkation default, 30 days a year with the monthly hint', async () => {
    const { container } = renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Add crew member' });
    for (const section of ['basic', 'position', 'employment', 'embarkation', 'permissions']) {
      expect(container.querySelector(`[data-add-crew-section="${section}"]`), section).not.toBeNull();
    }
    await waitFor(() => expect(screen.getByLabelText(/^Place of embarkation/)).toHaveValue('Antibes'));
    expect(screen.getByText('= 2.50 days/month')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Send an invitation now' })).toBeChecked();
    // No password field anywhere (D-189).
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('choosing a position sets its department, the role it implies and previews its access set', async () => {
    const { container } = renderAt();
    await fillValidForm({ position: 'Master' });
    expect(screen.getByRole('combobox', { name: 'Department' })).toHaveTextContent('Bridge');
    expect(screen.getByRole('combobox', { name: 'STORM role' })).toHaveTextContent('Master');
    expect(container.querySelector('[data-add-crew-access-set="full_vessel"]')).toHaveTextContent('Full vessel access');
  });

  it('derives the status from the joining date: Pending while it is ahead', async () => {
    const { container } = renderAt();
    await fillValidForm();
    type(/^Start date/, '2020-01-01');
    expect(container.querySelector('[data-add-crew-status="on_board"]')).not.toBeNull();
    type(/^Date joining the vessel/, '2099-06-01');
    expect(container.querySelector('[data-add-crew-status="pending"]')).toHaveTextContent('Joins on 1 Jun 2099.');
  });

  it('validates before any request: names, email, start date', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Add crew member' });
    save();
    expect(await screen.findByText('Enter the first name')).toBeInTheDocument();
    expect(screen.getByText('Enter an email address')).toBeInTheDocument();
    expect(screen.getByText('Enter the start date')).toBeInTheDocument();
    expect(screen.getByText('Choose a position', { selector: 'p[id$="-form-item-message"]' })).toBeInTheDocument();
    expect(rpcCalls('crew_find_duplicates')).toHaveLength(0);
    expect(h.invoke).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('success: duplicate check, create-crew-member, then the terms; "Added and invited" with the profile link', async () => {
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByRole('heading', { name: 'Added and invited' })).toBeInTheDocument();
    expect(rpcCalls('crew_find_duplicates')[0][1]).toEqual({ p_vessel_id: 'v-dra', p_email: 'deckhand.new@example.test', p_first: 'Demo', p_last: 'Deckhand' });
    expect(h.invoke).toHaveBeenCalledTimes(1);
    const [fn, { body }] = h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fn).toBe('create-crew-member');
    expect(body).toEqual({
      email: 'deckhand.new@example.test',
      firstName: 'Demo',
      lastName: 'Deckhand',
      role: 'crew',
      vesselId: 'v-dra',
      position: 'Deckhand',
      joinDate: '2026-12-01',
      sendInvite: true,
    });
    expect(rpcCalls('crew_onboarding_save')[0][1]).toEqual({
      p_profile_id: P_NEW,
      p_vessel_id: 'v-dra',
      p_terms: {
        start_date: '2026-12-01',
        leave_method: 'days_per_year',
        leave_days_per_year: 30,
        position_id: 'p-deckhand',
        department_key: 'deck',
        place_of_embarkation: 'Antibes',
      },
    });
    expect(screen.getByText('Their employment details are saved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the profile/ })).toHaveAttribute('href', `/v/dra/crew/people/${P_NEW}/personal`);
    expect(h.notify.success).toHaveBeenCalledWith('Added and invited', expect.anything());
  });

  it('partial failure (D-01): the terms store is missing, so "Added" says the employment details were not saved', async () => {
    delete rpcAnswers.crew_onboarding_save;
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByRole('heading', { name: 'Added' })).toBeInTheDocument();
    expect(screen.getByText(/^The employment details were not saved: .*Open the profile to add them\.$/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the profile/ })).toBeInTheDocument();
    expect(h.notify.success).not.toHaveBeenCalled();
    expect(h.notify.warning).toHaveBeenCalled();
  });

  it('partial failure: a refused terms save shows its sentence', async () => {
    rpcAnswers.crew_onboarding_save = () => ({ data: null, error: { code: '42501', message: 'crew_onboarding_refused', details: 'This person is not on this vessel’s crew.' } });
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByText('The employment details were not saved: this person is not on this vessel’s crew. Open the profile to add them.')).toBeInTheDocument();
  });

  it('a terms save that returns no row is never reported as saved', async () => {
    rpcAnswers.crew_onboarding_save = () => ({ data: null, error: null });
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByRole('heading', { name: 'Added' })).toBeInTheDocument();
    expect(screen.queryByText('Their employment details are saved.')).toBeNull();
  });

  it('refusal: create-crew-member 409 is shown at the email; the terms are never sent', async () => {
    h.invoke.mockImplementation(() =>
      Promise.resolve(created(409, { error: { code: 'conflict', message: 'This email address cannot be used for a new crew member. Check the address, or find the person in the crew list.' } })),
    );
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByText(/This email address cannot be used for a new crew member/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(rpcCalls('crew_onboarding_save')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: /^Added/ })).toBeNull();
    expect(h.notify.error).toHaveBeenCalled();
  });

  it('an unreadable 2xx is "could not confirm", never added', async () => {
    h.invoke.mockImplementation(() => Promise.resolve({ data: {}, error: null }));
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByRole('heading', { name: 'STORM could not confirm this' })).toBeInTheDocument();
    expect(rpcCalls('crew_onboarding_save')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: /Open the profile/ })).toBeNull();
  });
});

describe('duplicates', () => {
  it('a name match is listed and asks to confirm; a second Save goes ahead', async () => {
    rpcAnswers.crew_find_duplicates = () => ({
      data: [{ profile_id: P_OLD, first_name: 'Demo', last_name: 'Deckhand', vessel_id: 'v-hyd', vessel_name: 'HYDRA', match_kind: 'name' }],
      error: null,
    });
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByText('This may be someone already in STORM')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Demo Deckhand' })).toHaveAttribute('href', `/v/dra/crew/people/${P_OLD}/personal`);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add crew member' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    save();
    expect(await screen.findByRole('heading', { name: 'Added and invited' })).toBeInTheDocument();
    expect(rpcCalls('crew_find_duplicates')).toHaveLength(1);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('an email match blocks Save until the email changes', async () => {
    rpcAnswers.crew_find_duplicates = () => ({
      data: [{ profile_id: P_OLD, first_name: 'Demo', last_name: 'Chief Stew', vessel_id: 'v-dra', vessel_name: 'DRAAK', match_kind: 'email' }],
      error: null,
    });
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByText(/One email belongs to one person/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add crew member' })).toBeDisabled();
    type(/^Email/, 'another.address@example.test');
    expect(screen.getByRole('button', { name: 'Add crew member' })).not.toBeDisabled();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('the check is not applied (D-01): Save goes ahead and the outcome says the check was skipped', async () => {
    delete rpcAnswers.crew_find_duplicates;
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByRole('heading', { name: 'Added and invited' })).toBeInTheDocument();
    expect(screen.getByText(DUPLICATES_UNAVAILABLE)).toBeInTheDocument();
  });

  it('the check fails otherwise: nothing is added, the error is said', async () => {
    rpcAnswers.crew_find_duplicates = () => ({ data: null, error: { code: '500', message: 'boom' } });
    renderAt();
    await fillValidForm();
    save();
    expect(await screen.findByText('The duplicate check could not run')).toBeInTheDocument();
    expect(h.invoke).not.toHaveBeenCalled();
  });
});

describe('D-01 and errors', () => {
  it('without the positions catalogue the position is typed, with the notice; no department is asked', async () => {
    delete rpcAnswers.crew_positions_for_vessel;
    delete rpcAnswers.crew_vessel_unmatched_titles;
    h.tables.departments = { data: null, error: { code: '42P01', message: 'relation "public.departments" does not exist' } };
    h.tables.contract_types = { data: null, error: { code: '42P01', message: 'relation "public.contract_types" does not exist' } };
    renderAt();
    expect(await screen.findByText(NOT_SET_UP_NOTICE)).toBeInTheDocument();
    type(/^First name/, 'Demo');
    type(/^Last name/, 'Deckhand');
    type(/^Email/, 'deckhand.new@example.test');
    type(/^Position/, 'Relief Bosun');
    type(/^Start date/, '2026-12-01');
    expect(screen.getByText('Contract types arrive with the crew update.')).toBeInTheDocument();
    save();
    expect(await screen.findByRole('heading', { name: 'Added and invited' })).toBeInTheDocument();
    const { body } = (h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }])[1];
    expect(body.position).toBe('Relief Bosun');
    const terms = rpcCalls('crew_onboarding_save')[0][1].p_terms as Record<string, unknown>;
    expect(terms).not.toHaveProperty('position_id');
    expect(terms).not.toHaveProperty('department_key');
  });

  it('any other error loading the positions is an error with Retry', async () => {
    rpcAnswers.crew_positions_for_vessel = () => ({ data: null, error: { code: '42501', message: 'crew_not_permitted' } });
    renderAt();
    // usePositions retries a real error once before it gives up.
    expect(await screen.findByRole('heading', { name: 'The positions could not load' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('re-hire (?rehire=)', () => {
  it('prefills the person and the last terms, locks the names, and saves only the terms', async () => {
    h.tables.profiles = { data: [{ id: P_OLD, first_name: 'Demo', last_name: 'Chief Stew', preferred_name: null, email: 'chief.stew@example.test', company_id: 'c-1' }], error: null };
    h.tables.crew_assignment_terms = {
      data: [{ position_id: 'p-deckhand', department_key: 'deck', contract_type_key: 'rotational', leave_method: 'ratio', leave_days_per_year: null, leave_ratio_on: 2, leave_ratio_off: 1, place_of_embarkation: 'Palma', start_date: '2025-04-01' }],
      error: null,
    };
    renderAt(`/v/dra/crew/new?rehire=${P_OLD}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Re-hire crew member' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^First name/)).toHaveValue('Demo');
    expect(screen.getByLabelText(/^First name/)).toBeDisabled();
    expect(screen.getByLabelText(/^Place of embarkation/)).toHaveValue('Palma');
    expect(screen.queryByRole('switch', { name: 'Send an invitation now' })).toBeNull();
    type(/^Start date/, '2026-12-01');
    fireEvent.click(screen.getByRole('button', { name: 'Save employment' }));
    expect(await screen.findByRole('heading', { name: 'Employment saved' })).toBeInTheDocument();
    expect(h.invoke).not.toHaveBeenCalled();
    expect(rpcCalls('crew_find_duplicates')).toHaveLength(0);
    expect(rpcCalls('crew_onboarding_save')[0][1]).toMatchObject({
      p_profile_id: P_OLD,
      p_terms: { start_date: '2026-12-01', position_id: 'p-deckhand', department_key: 'deck', contract_type_key: 'rotational', leave_method: 'ratio', leave_ratio_on: 2, leave_ratio_off: 1, place_of_embarkation: 'Palma' },
    });
  });
});

describe('layout at 390 px', () => {
  it('the page and its grid cannot grow past the viewport; the summary stacks under the form', async () => {
    const { container } = renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Add crew member' });
    const root = container.querySelector('[data-add-crew]') as HTMLElement;
    expect(root.className).toContain('min-w-0');
    const form = within(root).getByRole('form', { name: 'Add crew member' });
    expect(form.className).toMatch(/\bgrid\b/);
    expect(form.className).toContain('min-w-0');
    expect(form.className).toContain('lg:grid-cols-');
    expect(container.querySelector('aside[aria-label="Summary"]')?.className).toContain('min-w-0');
  });
});
