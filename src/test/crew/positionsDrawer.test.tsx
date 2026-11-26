/**
 * Positions drawer (X1-01; gap/04 C12, C49): the states (gate loading sends
 * no request, gate denied, not set up, other error with Retry, empty,
 * populated), the read-only view, reordering with Move up / Move down, the
 * min / max rule, the one save with its affected-count check, refusals in a
 * STORM sentence, the unmatched-title mapper, the new-position form, and
 * the 390 px layout. The client is mocked at supabase.rpc; the real hooks
 * run.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args), from: vi.fn() } }));

const caps = vi.hoisted(() => ({ view: 'granted' as string, admin: true, companyAdmin: true }));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => ({ allowed: caps.view === 'granted', status: caps.view, reason: 'test' }),
  useCan: (key: string, ctx?: { vesselId?: string }) => {
    if (caps.view !== 'granted') return false;
    if (key === 'vessel.crew.crew_compliance.admin') return ctx?.vesselId ? caps.admin : caps.companyAdmin;
    return true;
  },
}));

import PositionsDrawer from '@/modules/crew/components/PositionsDrawer';
import { notify } from '@/shared/lib/notify';

const VESSEL = { id: 'v-dra', companyId: 'c-1', name: 'DRAAK' };

const row = (over: Record<string, unknown>) => ({
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
  row({ position_id: 'p-master', key: 'master', name: 'Master', department_key: 'bridge', department_label: 'Bridge', department_sort: 10, rank_tier: 'command', default_access_set_key: 'full_vessel', sort_order: 10101, base_sort_order: 10101, min_on_board: 1, max_on_board: 1, holder_count: 1, stcw_capacity: 'STCW II/2 (Master)' }),
  row({ position_id: 'p-2o', key: 'second_officer', name: 'Second Officer', department_key: 'bridge', department_label: 'Bridge', department_sort: 10, rank_tier: 'officer', default_access_set_key: 'officer', sort_order: 30101, base_sort_order: 30101, min_on_board: 1, max_on_board: 2, holder_count: 0 }),
  row({ position_id: 'p-bosun', key: 'bosun', name: 'Bosun', rank_tier: 'officer', default_access_set_key: 'officer', sort_order: 30201, base_sort_order: 30201, holder_count: 1, scope: 'vessel' }),
  row({ position_id: 'p-deckhand', key: 'deckhand', name: 'Deckhand', sort_order: 40203, base_sort_order: 40203, min_on_board: 2, holder_count: 3 }),
  row({ position_id: 'p-cook', key: 'cook', name: 'Cook', department_key: 'galley', department_label: 'Galley', department_sort: 50, sort_order: 40501, base_sort_order: 40501, is_listed: false, holder_count: 1 }),
  row({ position_id: 'p-florist', key: 'florist', name: 'Florist', department_key: 'interior', department_label: 'Interior', department_sort: 40, sort_order: 40410, base_sort_order: 40410, is_listed: false }),
];
const UNMATCHED = [{ title: 'Underwater Welder', title_key: 'underwater_welder', holder_count: 1 }];

type RpcAnswer = { data: unknown; error: unknown };
let answers: Record<string, (args: Record<string, unknown>) => RpcAnswer>;

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
  caps.view = 'granted';
  caps.admin = true;
  caps.companyAdmin = true;
  answers = {
    crew_positions_for_vessel: () => ({ data: POSITIONS, error: null }),
    crew_vessel_unmatched_titles: () => ({ data: UNMATCHED, error: null }),
    crew_vessel_positions_save: (args) => ({ data: (args.p_rows as unknown[]).length, error: null }),
    crew_position_alias_set: (args) => ({ data: { id: 'a1', company_id: 'c-1', alias_key: 'underwater_welder', alias_label: args.p_alias, position_id: args.p_position_id, source: 'manual' }, error: null }),
    crew_position_create: (args) => ({ data: { id: 'p-new', name: args.p_name, key: 'tender_operator' }, error: null }),
  };
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    const answer = answers[fn];
    return answer ? answer(args) : { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } };
  });
  vi.spyOn(notify, 'success').mockImplementation(() => 1);
  vi.spyOn(notify, 'error').mockImplementation(() => 1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 }, mutations: { retry: false } } });
  const onOpenChange = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <PositionsDrawer open onOpenChange={onOpenChange} vessel={VESSEL} />
    </QueryClientProvider>,
  );
  return { ...view, onOpenChange };
}

const calls = (fn: string) => rpc.mock.calls.filter(([name]) => name === fn);
const drawer = () => screen.getByRole('dialog', { name: 'Positions' });

describe('states', () => {
  it('while the gate loads it sends no request and shows no positions', () => {
    caps.view = 'loading';
    renderDrawer();
    expect(rpc).not.toHaveBeenCalled();
    expect(within(drawer()).queryByText('Master')).toBeNull();
  });

  it('without crew_list.view it is AccessDenied and sends no request', () => {
    caps.view = 'denied';
    renderDrawer();
    expect(screen.getByText("You can't see this vessel's positions")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a missing RPC reads "Positions are not set up yet" (D-01), never mock rows', async () => {
    delete answers.crew_positions_for_vessel;
    renderDrawer();
    expect(await screen.findByText('Positions are not set up yet')).toBeInTheDocument();
    expect(screen.queryByText('Master')).toBeNull();
  });

  it('any other error is PageError with a working Retry', async () => {
    answers.crew_positions_for_vessel = () => ({ data: null, error: { code: 'XX000', message: 'The connection was reset' } });
    renderDrawer();
    expect(await screen.findByText('Positions could not load')).toBeInTheDocument();
    const before = calls('crew_positions_for_vessel').length;
    answers.crew_positions_for_vessel = () => ({ data: POSITIONS, error: null });
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Master')).toBeInTheDocument();
    expect(calls('crew_positions_for_vessel').length).toBeGreaterThan(before);
  });

  it('with nothing listed it says so and offers the catalogue', async () => {
    answers.crew_positions_for_vessel = () => ({ data: POSITIONS.map((p) => ({ ...p, is_listed: false, holder_count: 0 })), error: null });
    answers.crew_vessel_unmatched_titles = () => ({ data: [], error: null });
    renderDrawer();
    expect(await screen.findByText('No positions listed yet')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Add a position from the catalogue' })).toBeInTheDocument();
  });
});

describe('populated', () => {
  it('groups the listed positions by department in rank order, with manning, access and holders', async () => {
    renderDrawer();
    await screen.findByText('Master');
    const sections = Array.from(drawer().querySelectorAll('section[aria-labelledby^="dept-"]'));
    expect(sections.map((s) => s.querySelector('h3')?.textContent)).toEqual(['Bridge2', 'Deck2']);
    const rows = within(drawer()).getAllByTestId('position-row').map((r) => r.getAttribute('data-position-id'));
    expect(rows).toEqual(['p-master', 'p-2o', 'p-bosun', 'p-deckhand']);
    expect(screen.getByText(/Access: Full vessel access/)).toBeInTheDocument();
    expect(screen.getByText(/STCW II\/2 \(Master\)/)).toBeInTheDocument();
    expect(screen.getByTestId('positions-summary')).toHaveTextContent('4 positions listed · 5 on board · 1 position below the minimum');
    const officer = within(drawer()).getAllByTestId('position-row')[1];
    expect(within(officer).getByText('Below minimum')).toBeInTheDocument();
    expect(screen.getByTestId('held-unlisted')).toHaveTextContent('Cook · 1 on board');
  });

  it('is read-only without crew_compliance.admin: a note, no editing controls, no save', async () => {
    caps.admin = false;
    renderDrawer();
    await screen.findByText('Master');
    expect(screen.getByText(/Changing them needs crew compliance administration/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move .* up/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: /New position/ })).toBeNull();
    expect(screen.queryByLabelText('Min on board')).toBeNull();
    expect(screen.getAllByText(/Minimum 1 · Maximum 1/)).toHaveLength(1);
  });
});

describe('editing and the one save', () => {
  it('Move up reorders inside the department and the save permutes its rank slots', async () => {
    renderDrawer();
    await screen.findByText('Master');
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Bosun up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Deckhand up' }));
    expect(within(drawer()).getAllByTestId('position-row').map((r) => r.getAttribute('data-position-id'))).toEqual(['p-master', 'p-2o', 'p-deckhand', 'p-bosun']);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(calls('crew_vessel_positions_save')).toHaveLength(1));
    const [, args] = calls('crew_vessel_positions_save')[0];
    expect(args).toEqual({
      p_vessel_id: 'v-dra',
      p_rows: [
        { position_id: 'p-master', sort_order: 10101, is_listed: true, min_on_board: 1, max_on_board: 1 },
        { position_id: 'p-2o', sort_order: 30101, is_listed: true, min_on_board: 1, max_on_board: 2 },
        { position_id: 'p-deckhand', sort_order: 30201, is_listed: true, min_on_board: 2, max_on_board: null },
        { position_id: 'p-bosun', sort_order: 40203, is_listed: true, min_on_board: 0, max_on_board: null },
      ],
    });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Positions saved for DRAAK'));
  });

  it('a save the server wrote only partly is an error, never success', async () => {
    answers.crew_vessel_positions_save = () => ({ data: 1, error: null });
    renderDrawer();
    await screen.findByText('Master');
    fireEvent.click(screen.getByRole('button', { name: 'Move Deckhand up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(String((notify.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toMatch(/Only 1 of 4 positions were saved/);
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('a refusal shows the server\'s sentence (42501 DETAIL), never a code', async () => {
    answers.crew_vessel_positions_save = () => ({
      data: null,
      error: { code: '42501', message: 'crew_not_permitted', details: 'Only a crew compliance administrator of this vessel can change its positions and manning.' },
    });
    renderDrawer();
    await screen.findByText('Master');
    fireEvent.click(screen.getByRole('button', { name: 'Move Deckhand up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(
      'Only a crew compliance administrator of this vessel can change its positions and manning.',
      { title: 'The positions were not saved' },
    ));
  });

  it('checks the manning range at the field and blocks the save', async () => {
    renderDrawer();
    await screen.findByText('Master');
    const master = within(drawer()).getAllByTestId('position-row')[0];
    fireEvent.change(within(master).getByLabelText('Max on board'), { target: { value: '0' } });
    expect(within(master).getByRole('alert')).toHaveTextContent('The maximum cannot be lower than the minimum.');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(within(master).getByLabelText('Min on board'), { target: { value: 'two' } });
    expect(within(master).getByRole('alert')).toHaveTextContent('Use a whole number from 0 to 500.');
    fireEvent.change(within(master).getByLabelText('Min on board'), { target: { value: '0' } });
    expect(within(master).queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('takes a position off the list and lists a held one; Discard restores the server state', async () => {
    renderDrawer();
    await screen.findByText('Master');
    fireEvent.click(screen.getByRole('button', { name: "Take Bosun off this vessel's list" }));
    fireEvent.click(screen.getByRole('button', { name: 'List Cook on this vessel' }));
    expect(within(drawer()).getAllByTestId('position-row').map((r) => r.getAttribute('data-position-id'))).toEqual(['p-master', 'p-2o', 'p-deckhand', 'p-cook']);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls('crew_vessel_positions_save')).toHaveLength(1));
    const rows = (calls('crew_vessel_positions_save')[0][1] as { p_rows: { position_id: string; is_listed: boolean; sort_order: number | null }[] }).p_rows;
    expect(rows.find((r) => r.position_id === 'p-cook')).toMatchObject({ is_listed: true, sort_order: 40501 });
    expect(rows.find((r) => r.position_id === 'p-bosun')).toEqual({ position_id: 'p-bosun', sort_order: null, is_listed: false, min_on_board: 0, max_on_board: null });
  });

  it('asks before closing with unsaved changes', async () => {
    const { onOpenChange } = renderDrawer();
    await screen.findByText('Master');
    fireEvent.click(screen.getByRole('button', { name: 'Move Deckhand up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close positions' }));
    expect(await screen.findByText('Close without saving?')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' , hidden: false }));
  });
});

describe('unmatched titles and new positions', () => {
  it('lists the unmatched titles and maps one through crew_position_alias_set', async () => {
    renderDrawer();
    await screen.findByText('Master');
    const item = screen.getByTestId('unmatched-title');
    expect(item).toHaveTextContent('Underwater Welder · 1 on board');
    fireEvent.click(within(item).getByRole('combobox', { name: 'Map Underwater Welder to a position' }));
    fireEvent.click(await screen.findByRole('option', { name: /Florist/ }));
    await waitFor(() => expect(calls('crew_position_alias_set')).toHaveLength(1));
    expect(calls('crew_position_alias_set')[0][1]).toEqual({ p_vessel_id: 'v-dra', p_alias: 'Underwater Welder', p_position_id: 'p-florist' });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('"Underwater Welder" now counts as Florist'));
  });

  it('read-only: the titles are listed without a mapper', async () => {
    caps.admin = false;
    renderDrawer();
    await screen.findByText('Master');
    expect(screen.getByTestId('unmatched-title')).toHaveTextContent('Underwater Welder');
    expect(screen.queryByRole('combobox', { name: /Map Underwater Welder/ })).toBeNull();
  });

  it('refuses a duplicate name at the field without a request', async () => {
    renderDrawer();
    await screen.findByText('Master');
    fireEvent.click(screen.getByRole('button', { name: 'New position for this vessel' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'boatswain' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create position' }));
    });
    expect(await screen.findByText(/"Bosun" is already in the catalogue/)).toBeInTheDocument();
    expect(calls('crew_position_create')).toHaveLength(0);
  });

  it('asks for a department before it sends anything (no company option without the company-level key)', async () => {
    caps.companyAdmin = false;
    renderDrawer();
    await screen.findByText('Master');
    fireEvent.click(screen.getByRole('button', { name: 'New position for this vessel' }));
    expect(screen.queryByText('Where it applies')).toBeNull();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tender Operator' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create position' }));
    });
    // The placeholder and the field message both say it.
    expect(await screen.findAllByText('Choose a department')).toHaveLength(2);
    expect(calls('crew_position_create')).toHaveLength(0);
  });
});

describe('390 px', () => {
  it('the sheet is full width on a phone and caps its width from sm', async () => {
    renderDrawer();
    await screen.findByText('Master');
    expect(drawer().className).toContain('w-full');
    expect(drawer().className).toContain('sm:max-w-xl');
    expect(drawer().className).not.toMatch(/(^|\s)w-3\/4(\s|$)/);
  });
});
