/**
 * Familiarisation page (X1-10; gap/04 C63, C36; D-01) at crew/familiarisation:
 *
 * - the gate: loading reads nothing and shows nothing; denied is
 *   AccessDenied and reads nothing;
 * - not applied (the overview RPC is missing): the notice strip and the
 *   legacy list in its place; a refusal is AccessDenied; any other error is
 *   PageError with Retry, which asks again;
 * - ready: the KPI tiles add up the templates that apply, the templates
 *   table (scope, required positions, counts, state), the recent forms
 *   with View all (?all=1 asks for every form), Start and New template
 *   only when the server says the caller may;
 * - empty: an explained empty state, with New template only for an editor;
 * - Start: the chosen template and person go to familiarisation_start, and
 *   an answer for someone else is refused;
 * - the template editor: a blank template is checked before it is sent,
 *   the payload is the server's, a refusal lands on the field its HINT
 *   names; at 390 px the page keeps to the screen.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  caps: { view: 'granted' as 'granted' | 'loading' | 'denied' },
  rpc: vi.fn(),
  fromCalls: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from, storage: { from: () => ({}) } } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => {
    if (h.caps.view === 'loading') return { allowed: false, status: 'loading', reason: 'test' };
    const allowed = h.caps.view === 'granted';
    return { allowed, status: allowed ? 'granted' : 'denied', reason: 'test' };
  },
  useCan: () => h.caps.view === 'granted',
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/shared/components/data/useMinWidth', () => ({ TABLET_MIN_WIDTH: 768, useMinWidth: () => true }));
// The legacy list is the D-01 fallback; its own test covers it (src/test/training/familiarizationTab.test.tsx).
vi.mock('@/modules/crew/components/familiarisation/LegacyFamiliarisation', () => ({
  default: ({ notice, vesselId }: { notice: string; vesselId: string }) => (
    <div data-legacy-familiarisation={vesselId}>
      <p>{notice}</p>
    </div>
  ),
}));

import FamiliarisationPage from '@/modules/crew/pages/FamiliarisationPage';
import { FAMILIARISATION_NOT_SET_UP_NOTICE } from '@/modules/crew/hooks/useFamiliarisation';

const VESSEL = 'v-dra';
const COMPANY = 'c-1';

const SECTIONS = [
  { section_name: 'Safety', checklist_items: ['Muster station shown', 'Alarms explained'] },
  { section_name: 'Service', checklist_items: ['Pantry tour'] },
];

const template = (over: Record<string, unknown> & { id: string }) => ({
  code: 'FAM-DRA-2026-001',
  name: 'Interior familiarisation',
  description: null,
  scope: 'vessel',
  vessel_id: VESSEL,
  variant_of: null,
  due_within_days: 14,
  requires_crew_signature: true,
  requires_supervisor_signature: true,
  is_active: true,
  sections: SECTIONS,
  item_count: 3,
  position_ids: ['pos-stew'],
  applies: true,
  replaced_by_variant: false,
  completed: 1,
  in_progress: 2,
  overdue: 1,
  missing: 1,
  required: 3,
  updated_at: '2026-11-20T10:00:00Z',
  ...over,
});

const record = (over: Record<string, unknown> & { id: string }) => ({
  template_id: 'tpl-int',
  template_code: 'FAM-DRA-2026-001',
  template_name: 'Interior familiarisation',
  profile_id: 'p-stew',
  first_name: 'Sam',
  last_name: 'Stewart',
  preferred_name: null,
  has_login: true,
  status: 'in_progress',
  join_date: '2026-11-10',
  due_date: '2026-11-24',
  overdue: true,
  items_total: 3,
  items_done: 1,
  crew_signed_at: null,
  supervisor_signed_at: null,
  requires_crew_signature: true,
  requires_supervisor_signature: true,
  completed_on: null,
  created_at: '2026-11-10T08:00:00Z',
  updated_at: '2026-11-12T08:00:00Z',
  ...over,
});

const OVERVIEW = (over: Record<string, unknown> = {}) => ({
  vessel_id: VESSEL,
  company_id: COMPANY,
  today: '2026-11-27',
  can_create: true,
  can_edit_templates: true,
  can_edit_fleet_templates: false,
  templates: [
    template({ id: 'tpl-fleet', code: 'FAM-2026-001', name: 'Arrival safety (24 hours)', scope: 'fleet', vessel_id: null, due_within_days: 1, completed: 4, in_progress: 0, overdue: 0, missing: 0, required: 4 }),
    template({ id: 'tpl-int' }),
    template({ id: 'tpl-old', code: 'FAM-DRA-2026-002', name: 'Old galley list', is_active: false, applies: false, position_ids: [], completed: 9, in_progress: 0, overdue: 0, missing: 0 }),
  ],
  records: [
    record({ id: 'rec-1' }),
    record({ id: 'rec-2', profile_id: 'p-deck', first_name: 'Dana', last_name: 'Deck', template_id: 'tpl-fleet', template_name: 'Arrival safety (24 hours)', status: 'completed', overdue: false, items_done: 3, completed_on: '2026-11-11' }),
  ],
  records_total: 14,
  members: [
    { profile_id: 'p-stew', first_name: 'Sam', last_name: 'Stewart', preferred_name: null, has_login: true, placement_kind: 'assignment', join_date: '2026-11-10', position_id: 'pos-stew', position_name: 'Stewardess' },
    { profile_id: 'p-new', first_name: 'Noa', last_name: 'Newman', preferred_name: null, has_login: false, placement_kind: 'planned', join_date: '2026-12-01', position_id: 'pos-deck', position_name: 'Deckhand' },
  ],
  ...over,
});

const RECORD_DETAIL = (over: Record<string, unknown> = {}) => ({
  id: 'rec-new',
  company_id: COMPANY,
  vessel_id: VESSEL,
  vessel_name: 'DRAAK',
  template_id: 'tpl-int',
  template_code: 'FAM-DRA-2026-001',
  template_name: 'Interior familiarisation',
  template_description: null,
  template_scope: 'vessel',
  profile_id: 'p-new',
  person: { first_name: 'Noa', last_name: 'Newman', preferred_name: null, avatar_url: null, has_login: false },
  status: 'open',
  join_date: '2026-12-01',
  due_date: '2026-12-15',
  overdue: false,
  completed_on: null,
  items_total: 3,
  items_done: 0,
  requires_crew_signature: true,
  requires_supervisor_signature: true,
  crew_signed_at: null,
  crew_signed_by_name: null,
  supervisor_signed_at: null,
  supervisor_signed_by_name: null,
  reopened_at: null,
  reopened_reason: null,
  reopened_by_name: null,
  items: [],
  rights: { tick: 'ok', sign_crew: 'items_open', sign_supervisor: 'items_open', reopen: 'not_reopenable', delete: 'ok', is_own: false },
  ...over,
});

const POSITIONS = [
  { position_id: 'pos-stew', scope: 'system', key: 'stewardess', name: 'Stewardess', department_key: 'interior', department_label: 'Interior', department_sort: 40, rank_tier: 'rating', default_access_set_key: null, stcw_capacity: null, base_sort_order: 40201, sort_order: 40201, is_listed: true, min_on_board: null, max_on_board: null, holder_count: 1 },
  { position_id: 'pos-deck', scope: 'system', key: 'deckhand', name: 'Deckhand', department_key: 'deck', department_label: 'Deck', department_sort: 20, rank_tier: 'rating', default_access_set_key: null, stcw_capacity: null, base_sort_order: 30301, sort_order: 30301, is_listed: true, min_on_board: null, max_on_board: null, holder_count: 1 },
];

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

function renderPage(initial = '/v/dra/crew/familiarisation') {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/v/:vesselCode/crew/familiarisation" element={<FamiliarisationPage />} />
          <Route path="/v/:vesselCode/crew/familiarisation/:recordId" element={<p>record page</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const calls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args as Record<string, unknown>);
const ready = () => waitFor(() => expect(document.querySelector('[data-familiarisation="overview"], [data-familiarisation="all"]')).not.toBeNull());

/** Opens a Radix Select by its trigger and picks an option. */
async function choose(trigger: HTMLElement, option: string | RegExp) {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const item = await screen.findByRole('option', { name: option });
  fireEvent.keyDown(item, { key: 'Enter' });
}

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
  h.caps.view = 'granted';
  h.fromCalls = [];
  answers = {
    familiarisation_vessel_overview: () => ({ data: OVERVIEW(), error: null }),
    crew_positions_for_vessel: () => ({ data: POSITIONS, error: null }),
    crew_vessel_unmatched_titles: () => ({ data: [], error: null }),
  };
  h.rpc.mockReset();
  h.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => Promise.resolve(answers[fn] ? answers[fn](args) : missing(fn)));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  lastLocation = '';
});
afterEach(() => qc.clear());

describe('the gate', () => {
  it('while the capability loads: nothing is read and no familiarisation shows', () => {
    h.caps.view = 'loading';
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Familiarisation' })).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('denied: AccessDenied, and nothing is read', () => {
    h.caps.view = 'denied';
    renderPage();
    expect(screen.getByRole('heading', { name: "You can't see familiarisation on this vessel" })).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });
});

describe('the states', () => {
  it('not applied (D-01): the notice and the legacy list in its place, for the route vessel', async () => {
    answers.familiarisation_vessel_overview = () => missing('familiarisation_vessel_overview');
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-familiarisation="legacy"]')).not.toBeNull());
    expect(screen.getByText(FAMILIARISATION_NOT_SET_UP_NOTICE)).toBeInTheDocument();
    expect(document.querySelector('[data-legacy-familiarisation="v-dra"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Familiarisation' })).toBeInTheDocument();
  });

  it('a refusal is AccessDenied with the server sentence', async () => {
    answers.familiarisation_vessel_overview = () => ({ data: null, error: { code: '42501', message: 'crew_not_permitted', details: 'You cannot see this vessel.' } });
    renderPage();
    expect(await screen.findByRole('heading', { name: "You can't see familiarisation on this vessel" })).toBeInTheDocument();
  });

  it('any other error is PageError with Retry, which asks again', async () => {
    let failing = true;
    answers.familiarisation_vessel_overview = () =>
      failing ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: OVERVIEW(), error: null };
    renderPage();
    const retry = await screen.findByRole('button', { name: /try again/i });
    expect(screen.getByRole('heading', { name: 'Familiarisation could not be loaded' })).toBeInTheDocument();
    const before = calls('familiarisation_vessel_overview').length;
    failing = false;
    fireEvent.click(retry);
    await ready();
    expect(calls('familiarisation_vessel_overview').length).toBe(before + 1);
  });

  it('an answer that cannot be read is an error, never a blank page', async () => {
    answers.familiarisation_vessel_overview = () => ({ data: { templates: 'nope' }, error: null });
    renderPage();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('ready', () => {
  it('asks for the route vessel, recent forms only', async () => {
    renderPage();
    await ready();
    expect(calls('familiarisation_vessel_overview')[0]).toEqual({ p_vessel_id: VESSEL, p_all: false });
  });

  it('KPIs add up the templates that apply (a template not in use is left out)', async () => {
    renderPage();
    await ready();
    const kpis = document.querySelector('[data-familiarisation-kpis]') as HTMLElement;
    const values = Array.from(kpis.querySelectorAll('[data-kpi-value]')).map((el) => el.textContent);
    // Completed: fleet 4 + interior 1 (the inactive template's 9 is not counted); in progress 2; overdue 1; missing 1.
    expect(values).toEqual(['5', '2', '1', '1']);
    expect(kpis.textContent).toContain('Required by position, not completed');
  });

  it('the templates table: scope, required positions, counts and state', async () => {
    renderPage();
    await ready();
    const table = screen.getByRole('table', { name: 'Familiarisation templates' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    const fleet = rows.find((r) => r.textContent?.includes('Arrival safety (24 hours)')) as HTMLElement;
    expect(fleet.textContent).toContain('Fleet');
    expect(fleet.textContent).toContain('FAM-2026-001');
    expect(fleet.textContent).toContain('due within 1 day');
    const interior = rows.find((r) => r.textContent?.includes('Interior familiarisation')) as HTMLElement;
    expect(interior.textContent).toContain('This vessel');
    expect(interior.textContent).toContain('1 position');
    expect(interior.textContent).toContain('In use');
    const old = rows.find((r) => r.textContent?.includes('Old galley list')) as HTMLElement;
    expect(old.textContent).toContain('Not in use');
    expect(old.textContent).toContain('Started by hand');
    // Fleet templates are kept by the office: no Edit on the fleet row for a vessel editor.
    expect(within(fleet).queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(within(interior).getByRole('button', { name: 'Edit Interior familiarisation' })).toBeInTheDocument();
    // Start only on a template in use that applies.
    expect(within(interior).getByRole('button', { name: 'Start Interior familiarisation for a crew member' })).toBeInTheDocument();
    expect(within(old).queryByRole('button', { name: /^Start/ })).toBeNull();
  });

  it('recent forms: status (overdue wins), progress, and View all opens ?all=1, which asks for every form', async () => {
    renderPage();
    await ready();
    expect(screen.getByRole('heading', { name: 'Recent forms' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Recent familiarisation forms' });
    const first = within(table).getAllByRole('row')[1];
    expect(first.textContent).toContain('Sam Stewart');
    expect(first.textContent).toContain('Overdue');
    expect(first.textContent).toContain('1 of 3');
    const viewAll = screen.getByRole('link', { name: 'View all (14)' });
    expect(viewAll).toHaveAttribute('href', '/v/dra/crew/familiarisation?all=1');
    fireEvent.click(viewAll);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'All forms' })).toBeInTheDocument());
    expect(calls('familiarisation_vessel_overview').some((a) => a.p_all === true)).toBe(true);
    expect(screen.getByRole('link', { name: 'Show recent only' })).toBeInTheDocument();
  });

  it('a form opens its record page', async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('link', { name: 'Sam Stewart' }));
    await waitFor(() => expect(lastLocation).toBe('/v/dra/crew/familiarisation/rec-1'));
  });

  it('a viewer without create or edit rights gets neither Start nor New template', async () => {
    answers.familiarisation_vessel_overview = () => ({ data: OVERVIEW({ can_create: false, can_edit_templates: false, members: [] }), error: null });
    renderPage();
    await ready();
    expect(screen.queryByRole('button', { name: 'Start familiarisation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New template' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Start .* for a crew member$/ })).toBeNull();
  });
});

describe('empty', () => {
  it('no templates and no forms: explained, with New template for an editor', async () => {
    answers.familiarisation_vessel_overview = () => ({ data: OVERVIEW({ templates: [], records: [], records_total: 0 }), error: null });
    renderPage();
    await ready();
    expect(screen.getByText('No familiarisation templates yet')).toBeInTheDocument();
    expect(screen.getByText('No familiarisation forms yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New template' }).length).toBeGreaterThanOrEqual(1);
    // Nothing to start from.
    expect(screen.getByRole('button', { name: 'Start familiarisation' })).toBeDisabled();
  });

  it('for a viewer, the empty state says who adds templates and offers nothing', async () => {
    answers.familiarisation_vessel_overview = () => ({ data: OVERVIEW({ templates: [], records: [], records_total: 0, can_create: false, can_edit_templates: false }), error: null });
    renderPage();
    await ready();
    expect(screen.getByText(/ask them for one/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New template' })).toBeNull();
  });
});

describe('Start familiarisation', () => {
  it('sends the template and the person, and says so', async () => {
    answers.familiarisation_start = (args) => ({ data: RECORD_DETAIL({ template_id: args.p_template_id, profile_id: args.p_profile_id }), error: null });
    renderPage();
    await ready();
    const interior = screen.getAllByRole('row').find((r) => r.textContent?.includes('Interior familiarisation') && r.textContent?.includes('This vessel')) as HTMLElement;
    fireEvent.click(within(interior).getByRole('button', { name: 'Start Interior familiarisation for a crew member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start familiarisation' });
    expect(within(dialog).getByText(/3 items, due within 14 days of joining/)).toBeInTheDocument();
    await choose(within(dialog).getByRole('combobox', { name: 'Crew member' }), /Noa Newman/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(calls('familiarisation_start')).toHaveLength(1));
    expect(calls('familiarisation_start')[0]).toEqual({ p_template_id: 'tpl-int', p_profile_id: 'p-new', p_vessel_id: VESSEL });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Start familiarisation' })).toBeNull());
  });

  it('needs a person; an answer for someone else is refused and the dialog stays', async () => {
    answers.familiarisation_start = () => ({ data: RECORD_DETAIL({ profile_id: 'p-other' }), error: null });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start familiarisation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start familiarisation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start' }));
    expect(await within(dialog).findByText('Pick the template to start')).toBeInTheDocument();
    expect(within(dialog).getByText('Pick the crew member it is for')).toBeInTheDocument();
    expect(calls('familiarisation_start')).toHaveLength(0);
    await choose(within(dialog).getByRole('combobox', { name: 'Template' }), 'Interior familiarisation');
    await choose(within(dialog).getByRole('combobox', { name: 'Crew member' }), /Noa Newman/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start' }));
    expect(await within(dialog).findByText('The server started another record.')).toBeInTheDocument();
  });

  it('a server refusal is shown in the dialog in its own words', async () => {
    answers.familiarisation_start = () => ({ data: null, error: { code: '23505', message: 'record_exists', details: 'This person already has this familiarisation open.' } });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start familiarisation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start familiarisation' });
    await choose(within(dialog).getByRole('combobox', { name: 'Template' }), 'Interior familiarisation');
    await choose(within(dialog).getByRole('combobox', { name: 'Crew member' }), /Sam Stewart/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start' }));
    expect(await within(dialog).findByText('This person already has this familiarisation open.')).toBeInTheDocument();
  });
});

describe('the template editor', () => {
  const openNew = async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    return screen.findByRole('dialog', { name: 'New familiarisation template' });
  };

  it('a blank template is checked before anything is sent', async () => {
    const dialog = await openNew();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' }));
    expect(await within(dialog).findByText('Name the template')).toBeInTheDocument();
    expect(within(dialog).getByText('Name the section')).toBeInTheDocument();
    expect(within(dialog).getByText('Write the item')).toBeInTheDocument();
    expect(calls('familiarisation_template_save')).toHaveLength(0);
  });

  it('saves the server payload: trimmed text, the due days as a number, the scope (new) and the sections', async () => {
    answers.familiarisation_template_save = (args) => ({
      data: template({ id: 'tpl-new', name: 'Galley familiarisation', code: 'FAM-DRA-2026-003', position_ids: [] , ...(args.p_payload as object) }),
      error: null,
    });
    const dialog = await openNew();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: '  Galley familiarisation  ' } });
    fireEvent.change(within(dialog).getByLabelText('Due within (days of joining)'), { target: { value: '7' } });
    fireEvent.change(within(dialog).getByLabelText('Section 1 name'), { target: { value: 'Galley' } });
    fireEvent.change(within(dialog).getByLabelText('Section 1, item 1'), { target: { value: 'Fire blanket shown' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add item' }));
    fireEvent.change(within(dialog).getByLabelText('Section 1, item 2'), { target: { value: 'Gas shut-off shown' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(calls('familiarisation_template_save')).toHaveLength(1));
    const sent = calls('familiarisation_template_save')[0];
    expect(sent.p_vessel_id).toBe(VESSEL);
    expect(sent.p_template_id).toBeNull();
    expect(sent.p_payload).toEqual({
      name: 'Galley familiarisation',
      description: null,
      due_within_days: 7,
      requires_crew_signature: true,
      requires_supervisor_signature: true,
      sections: [{ section_name: 'Galley', checklist_items: ['Fire blanket shown', 'Gas shut-off shown'] }],
      position_ids: [],
      scope: 'vessel',
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New familiarisation template' })).toBeNull());
  });

  it('a refusal lands on the field its HINT names', async () => {
    answers.familiarisation_template_save = () => ({ data: null, error: { code: '23505', message: 'name_taken', details: 'A template on this vessel already has this name.', hint: 'name' } });
    const dialog = await openNew();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Interior familiarisation' } });
    fireEvent.change(within(dialog).getByLabelText('Section 1 name'), { target: { value: 'Safety' } });
    fireEvent.change(within(dialog).getByLabelText('Section 1, item 1'), { target: { value: 'Muster station shown' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' }));
    expect(await within(dialog).findByText('A template on this vessel already has this name.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('editing keeps the scope and sends is_active, not scope', async () => {
    answers.familiarisation_template_save = (args) => ({ data: template({ id: String(args.p_template_id) }), error: null });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Interior familiarisation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Interior familiarisation' });
    expect(within(dialog).getByText('Used on DRAAK only.')).toBeInTheDocument();
    expect((within(dialog).getByLabelText('Section 1, item 2') as HTMLInputElement).value).toBe('Alarms explained');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls('familiarisation_template_save')).toHaveLength(1));
    const sent = calls('familiarisation_template_save')[0];
    expect(sent.p_template_id).toBe('tpl-int');
    const payload = sent.p_payload as Record<string, unknown>;
    expect(payload.scope).toBeUndefined();
    expect(payload.is_active).toBe(true);
    expect(payload.position_ids).toEqual(['pos-stew']);
  });
});

describe('at 390 px', () => {
  it('the page keeps to the screen: no fixed widths wider than a phone', async () => {
    await act(async () => {
      window.innerWidth = 390;
      window.dispatchEvent(new Event('resize'));
    });
    const { container } = renderPage();
    await ready();
    const wide = Array.from(container.querySelectorAll<HTMLElement>('[class]')).filter((el) => /\b(?:w|min-w)-\[(?:[4-9]\d\d|\d{4,})px\]/.test(el.className));
    expect(wide).toEqual([]);
    expect((container.firstElementChild as HTMLElement).className).toContain('min-w-0');
  });
});
