/**
 * The vessel crew list page (X1-02; gap/04 C3, C4, C7, C8, C9, C11; D-01,
 * D-199, D-225):
 *
 * - the gate: while vessel.crew.crew_list.view loads nothing is read and
 *   nothing shows; denied is AccessDenied, with no request;
 * - populated from crew_vessel_list: derived status with its reason, the
 *   count chips, Pending login with its explanation, travel today, the
 *   invitation column with Invite / Resend, rank order, URL state;
 * - row actions by capability; Transfer refused for a pending placement;
 * - the bulk bar: Export CSV goes through the export engine, logged and
 *   marked personal data;
 * - empty; the D-01 fallback (the RPC missing: the basic list from the
 *   legacy rows with today's day codes, the notice, Movements not set up);
 *   any other error is an error with Retry, never the fallback.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CrewVesselListRpcRow } from '@/modules/crew/types/db.pending';

const h = vi.hoisted(() => ({
  caps: { view: 'granted' as 'granted' | 'loading' | 'denied', denied: new Set<string>() },
  rpc: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  fromCalls: [] as string[],
  runExport: vi.fn(),
  inviteOne: vi.fn(),
  inviteMany: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is']) chain[m] = () => chain;
    chain.maybeSingle = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(resolve);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from, functions: { invoke: vi.fn() } } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => ({ allowed: h.caps.view === 'granted', status: h.caps.view, reason: 'test' }),
  useCan: (key: string) => h.caps.view === 'granted' && !h.caps.denied.has(key),
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({
    scope: 'vessel',
    vesselCode: 'DRA',
    vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK', imo_number: '1234567', flag_state: 'Malta', vessel_type: 'Motor yacht', gross_tonnage: 499 },
  }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-admin' }, profile: { id: 'p-admin', company_id: 'c-1', role: 'dpa' }, loading: false, profileResolved: true }),
}));
vi.mock('@/modules/auth/hooks/useAdminActions', () => ({ useAdminActions: () => ({ isConfirmed: () => false }) }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({ vessels: [{ id: 'v-dra', name: 'DRAAK' }, { id: 'v-hyd', name: 'HYDRA' }], selectedVesselId: 'v-dra' }),
}));
vi.mock('@/modules/users-access/hooks/useInvitations', () => ({
  useInvitationActions: () => ({ inviteOne: h.inviteOne, inviteMany: h.inviteMany, invitingProfileId: null, bulkPending: false }),
}));
vi.mock('@/lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export')>();
  return { ...actual, runExport: (...args: unknown[]) => h.runExport(...args), notifyExportResult: vi.fn() };
});

import CrewListPage, { BASIC_LIST_NOTICE, CREW_NUMBERS_NOTICE } from '@/modules/crew/pages/CrewListPage';
import { PENDING_LOGIN_HELP } from '@/modules/crew/components/crew-list/CrewStatusPill';
import { crewStatusDetailText, fromRpcRow } from '@/modules/crew/lib/crewListModel';
import { PENDING_TRANSFER_REASON } from '@/modules/crew/components/crew-list/CrewRowActions';

const row = (over: Partial<CrewVesselListRpcRow>): CrewVesselListRpcRow => ({
  profile_id: 'p-x',
  user_id: 'u-x',
  first_name: 'Demo',
  last_name: 'Crew',
  preferred_name: null,
  avatar_url: null,
  email: 'crew@example.test',
  position_id: 'pos-deckhand',
  position_name: 'Deckhand',
  position_text: 'Deckhand',
  department_key: 'deck',
  department_label: 'Deck',
  rank_tier: 'rating',
  sort_order: 40203,
  assignment_id: 'a-x',
  placement_kind: 'assignment',
  join_date: '2026-10-01',
  leave_date: null,
  status: 'on_board',
  status_detail: null,
  transfer_vessel_id: null,
  leave_code: null,
  travel_today: false,
  login_state: 'active',
  account_status: 'active',
  invitation_id: null,
  invitation_status: null,
  invitation_expires_at: null,
  invitation_last_sent_at: null,
  invitation_last_error_code: null,
  nationality: null,
  is_master_office: false,
  ...over,
});

const ROWS: CrewVesselListRpcRow[] = [
  row({ profile_id: 'p-master', user_id: 'u-master', last_name: 'Master', position_name: 'Master', position_text: 'Captain', department_key: 'bridge', department_label: 'Bridge', rank_tier: 'command', sort_order: 10101, is_master_office: true, travel_today: true }),
  row({ profile_id: 'p-stew', user_id: 'u-stew', last_name: 'Stew', position_name: 'Second Stew', position_text: 'Crew', department_key: 'interior', department_label: 'Interior', sort_order: 40401, status: 'on_leave', status_detail: 'leave', leave_code: 'L' }),
  row({ profile_id: 'p-joiner', user_id: 'u-joiner', last_name: 'Joiner', placement_kind: 'planned', join_date: '2026-12-06', status: 'pending', status_detail: 'planned' }),
  row({ profile_id: 'p-mover', user_id: 'u-mover', last_name: 'Mover', status: 'on_transfer', status_detail: 'transfer_in', transfer_vessel_id: 'v-hyd' }),
  row({
    profile_id: 'p-pending', user_id: null, last_name: 'Pending', assignment_id: null, placement_kind: 'pending_placement', status: 'pending',
    status_detail: 'pending_placement', login_state: 'pending_login', account_status: 'invited', join_date: '2026-12-01',
    invitation_id: 'i-1', invitation_status: 'sent', invitation_last_sent_at: '2026-11-25T08:00:00Z', invitation_expires_at: '2099-01-01T00:00:00Z',
  }),
];

let qc: QueryClient;
let lastLocation = '';

const LocationProbe: React.FC = () => {
  const loc = useLocation();
  lastLocation = `${loc.pathname}${loc.search}`;
  return null;
};

function renderPage(initial = '/v/dra/crew/list') {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <CrewListPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
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
  h.caps.denied = new Set();
  h.rpc.mockReset();
  h.rpc.mockImplementation((fn: string) => {
    if (fn === 'crew_vessel_list') return Promise.resolve({ data: ROWS, error: null });
    if (fn === 'crew_vessel_movements') return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: null, error: null });
  });
  h.tables = {};
  h.fromCalls = [];
  h.runExport.mockReset();
  h.runExport.mockResolvedValue({ status: 'ok', value: { fileName: 'DRA_CrewList_2026-11-26.csv', rowCount: 1, logged: true, jobId: 'j-1' } });
  h.inviteOne.mockReset();
  h.inviteMany.mockReset();
  h.inviteMany.mockResolvedValue(undefined);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  lastLocation = '';
});
afterEach(() => {
  qc.clear();
});

const table = () => screen.getByRole('table', { name: 'Crew list' });
/** The list has rendered its rows (not the loading skeleton). */
const loaded = async (first = 'Master, Demo') => {
  const t = await screen.findByRole('table', { name: 'Crew list' });
  await within(t).findByText(first);
  return t;
};
const rowOf = (name: RegExp) => {
  const cell = within(table()).getByText(name);
  return cell.closest('tr') as HTMLElement;
};

describe('the gate', () => {
  it('while the capability loads: a loading state, no request, no list', () => {
    h.caps.view = 'loading';
    renderPage();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Crew list' })).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('denied: AccessDenied, and nothing is read', () => {
    h.caps.view = 'denied';
    renderPage();
    expect(screen.getByRole('heading', { name: "You can't see this crew list" })).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });
});

describe('the server list', () => {
  it('reads crew_vessel_list once for the route vessel and today, nothing from the legacy tables', async () => {
    renderPage();
    await loaded();
    expect(h.rpc).toHaveBeenCalledWith('crew_vessel_list', expect.objectContaining({ p_vessel_id: 'v-dra' }));
    const args = h.rpc.mock.calls.find(([fn]) => fn === 'crew_vessel_list')?.[1] as { p_on: string };
    expect(args.p_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(h.fromCalls).not.toContain('profiles');
    expect(screen.queryByText(BASIC_LIST_NOTICE)).toBeNull();
  });

  it('shows each derived status with its reason', async () => {
    renderPage();
    await loaded();
    expect(within(rowOf(/^Stew, Demo$/)).getByText('On leave')).toBeInTheDocument();
    expect(within(rowOf(/^Stew, Demo$/)).getByText(/Leave Used \(L\)/)).toBeInTheDocument();
    expect(within(rowOf(/^Joiner, Demo$/)).getByText('Joins 6 Dec 2026')).toBeInTheDocument();
    expect(within(rowOf(/^Mover, Demo$/)).getByText('Transferring in from HYDRA')).toBeInTheDocument();
    expect(within(rowOf(/^Master, Demo$/)).getByText('On board').closest('[data-tone]')).toHaveAttribute('data-tone', 'ok');
  });

  it('counts Total and each status in the chips', async () => {
    renderPage();
    await loaded();
    const chips = screen.getByRole('group', { name: /Filter crew members/i });
    expect(within(chips).getByRole('button', { name: /Total\s*5/ })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: /Pending\s*2/ })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: /On transfer\s*1/ })).toBeInTheDocument();
  });

  it('a person without a sign-in reads Pending login, with the explanation (D-199)', async () => {
    renderPage();
    await loaded();
    const pending = rowOf(/^Pending, Demo$/);
    expect(within(pending).getByRole('button', { name: `Pending login. ${PENDING_LOGIN_HELP}` })).toBeInTheDocument();
    expect(within(pending).getByText(/once their login is linked$/)).toBeInTheDocument();
  });

  it('a pending placement names its expected day only while it is ahead', () => {
    const pending = fromRpcRow(row({ placement_kind: 'pending_placement', status: 'pending', status_detail: 'pending_placement', join_date: '2026-12-01' }));
    const noVessel = () => null;
    expect(crewStatusDetailText(pending, noVessel, '2026-11-26')).toBe('Expected 1 Dec 2026, once their login is linked');
    expect(crewStatusDetailText(pending, noVessel, '2026-12-01')).toBe('Joins once their login is linked');
    expect(crewStatusDetailText({ ...pending, joinDate: null }, noVessel, '2026-11-26')).toBe('Joins once their login is linked');
  });

  it('shows travel today and the invitation with its last send and Resend', async () => {
    renderPage();
    await loaded();
    expect(within(rowOf(/^Master, Demo$/)).getByText('Travel today')).toBeInTheDocument();
    const pending = rowOf(/^Pending, Demo$/);
    expect(within(pending).getByText('Sent')).toBeInTheDocument();
    expect(within(pending).getByText('Last sent 25 Nov 2026')).toBeInTheDocument();
    fireEvent.click(within(pending).getByRole('button', { name: 'Resend the invitation to Pending, Demo' }));
    expect(h.inviteOne).toHaveBeenCalledWith({ profileId: 'p-pending', name: 'Demo Pending', email: 'crew@example.test' });
  });

  it('lists in the vessel rank order by default, and keeps the sort and the chip in the URL', async () => {
    renderPage();
    await loaded();
    const names = within(table()).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1]?.textContent ?? '');
    expect(names[0]).toMatch(/^Master, Demo/);
    fireEvent.click(within(screen.getByRole('group', { name: /Filter crew members/i })).getByRole('button', { name: /On leave/ }));
    await waitFor(() => expect(lastLocation).toContain('status=on_leave'));
    expect(within(table()).getAllByRole('row')).toHaveLength(2);
  });

  it('reads the status, search and department from the URL', async () => {
    renderPage('/v/dra/crew/list?status=pending&dept=deck');
    await loaded('Joiner, Demo');
    const body = within(table()).getAllByRole('row').slice(1);
    expect(body).toHaveLength(2);
    expect(body.map((r) => r.textContent)).toEqual([expect.stringMatching(/Joiner/), expect.stringMatching(/Pending/)]);
  });

  it('crew numbers come from their own read (D-272): shown in the name cell, and the search finds them', async () => {
    h.tables.crew_personal_details = { data: [{ profile_id: 'p-stew', crew_number: 'DRA-0015' }, { profile_id: 'p-master', crew_number: null }], error: null };
    renderPage();
    await loaded();
    await waitFor(() => expect(within(rowOf(/^Stew, Demo$/)).getByText('DRA-0015')).toBeInTheDocument());
    expect(h.fromCalls.filter((t) => t === 'crew_personal_details')).toHaveLength(1);
    expect(rowOf(/^Master, Demo$/).querySelector('[data-crew-number]')).toBeNull();
    const search = screen.getByPlaceholderText('Search name, position or crew number');
    fireEvent.change(search, { target: { value: 'DRA-0015' } });
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(2));
    expect(within(table()).getByText('Stew, Demo')).toBeInTheDocument();
    expect(screen.queryByText(CREW_NUMBERS_NOTICE)).toBeNull();
  });

  it('crew_personal_details missing (D-01): the list stands, with no numbers and nothing said', async () => {
    h.tables.crew_personal_details = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.crew_personal_details' in the schema cache" } };
    renderPage();
    await loaded();
    await waitFor(() => expect(h.fromCalls).toContain('crew_personal_details'));
    expect(within(table()).getAllByRole('row')).toHaveLength(ROWS.length + 1);
    expect(table().querySelector('[data-crew-number]')).toBeNull();
    expect(screen.queryByText(CREW_NUMBERS_NOTICE)).toBeNull();
    expect(screen.queryByText('The crew list could not load')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Search name, position or crew number'), { target: { value: 'Stew' } });
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(2));
  });

  it('any other crew-number error leaves the numbers out with a quiet notice; the list still shows', async () => {
    h.tables.crew_personal_details = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    renderPage();
    await loaded();
    expect(await screen.findByText(CREW_NUMBERS_NOTICE)).toBeInTheDocument();
    expect(within(table()).getAllByRole('row')).toHaveLength(ROWS.length + 1);
    expect(screen.queryByText('The crew list could not load')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('Transfer is refused for a pending placement, with the reason, and offered otherwise', async () => {
    renderPage();
    await loaded();
    const pending = within(rowOf(/^Pending, Demo$/)).getByRole('button', { name: 'Transfer Pending, Demo' });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(PENDING_TRANSFER_REASON).length).toBeGreaterThan(0);
    const master = within(rowOf(/^Master, Demo$/)).getByRole('button', { name: 'Transfer Master, Demo' });
    expect(master).not.toHaveAttribute('aria-disabled');
  });

  it('hides the actions the viewer may not use (useCan)', async () => {
    h.caps.denied = new Set([
      'vessel.crew.crew_assignments.assign',
      'vessel.crew.crew_profiles.edit',
      'admin.access.users_access.admin',
      'admin.access.users_access.assign',
      'vessel.crew.crew_profiles.create',
      'vessel.crew.crew_list.export',
      'vessel.crew.hours_of_rest.view',
    ]);
    renderPage();
    await loaded();
    expect(screen.queryByRole('button', { name: /^Transfer / })).toBeNull();
    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Resend the invitation/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add crew' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Crew list report' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('link', { name: /Hours of rest/ })).toBeNull();
  });

  it('the hours-of-rest link opens the month of that person on this vessel', async () => {
    renderPage();
    await loaded();
    expect(within(rowOf(/^Stew, Demo$/)).getByRole('link', { name: 'Hours of rest: Stew, Demo' })).toHaveAttribute('href', '/v/dra/crew/people/u-stew/hours-of-rest');
  });

  it('the bulk bar exports the selected rows through the export engine, logged as personal data', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Master, Demo' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Stew, Demo' }));
    const bar = screen.getByRole('region', { name: 'Selected crew' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Export CSV' }));
    });
    expect(h.runExport).toHaveBeenCalledTimes(1);
    const options = h.runExport.mock.calls[0][0] as Record<string, unknown>;
    expect(options).toMatchObject({ format: 'csv', kind: 'Crew list', personalData: true, vesselId: 'v-dra', vesselCode: 'DRA', legacyUnlogged: true });
    expect((options.rows as unknown[]).length).toBe(2);
  });

  it('bulk Invite sends only the people who can be invited', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Master, Demo' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Pending, Demo' }));
    const bar = screen.getByRole('region', { name: 'Selected crew' });
    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Invite (1)' }));
    });
    expect(h.inviteMany).toHaveBeenCalledWith(['p-pending']);
  });

  it('the More menu holds Import CSV, Sync Airtable, Positions and the list export', async () => {
    renderPage();
    await loaded();
    fireEvent.keyDown(screen.getByRole('button', { name: 'More crew list actions' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent?.trim())).toEqual([
      'Import CSV',
      'Sync Airtable',
      'Positions',
      'Export list (CSV)',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Positions' }));
    await waitFor(() => expect(lastLocation).toContain('positions=1'));
  });
});

describe('empty, error and the D-01 fallback', () => {
  it('empty: says so, with Add crew for someone who may add', async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: [], error: null }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No crew on DRAAK yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add crew' }).length).toBeGreaterThanOrEqual(2);
  });

  it('any other error is an error with Retry, never the basic list', async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { code: '42501', message: 'crew_not_permitted', details: "You can't see the crew of this vessel." } }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'The crew list could not load' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    expect(screen.queryByText(BASIC_LIST_NOTICE)).toBeNull();
    expect(h.fromCalls).not.toContain('profiles');
    h.rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === 'crew_vessel_list' ? ROWS : [], error: null }));
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await loaded();
  });

  it('a 42883 naming another function is an error too, not the fallback', async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { code: '42883', message: 'function public.crew_position_for(uuid, uuid, text) does not exist' } }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'The crew list could not load' })).toBeInTheDocument();
  });

  describe('crew_vessel_list missing (PGRST202)', () => {
    beforeEach(() => {
      h.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.crew_vessel_list(p_on, p_vessel_id)' } }));
      h.tables = {
        profiles: {
          data: [
            { id: 'p-bosun', user_id: 'u-bosun', email: 'bosun@example.test', first_name: 'Demo', last_name: 'Bosun', rank: 'Bosun', position: null, department: 'Deck', status: 'Active', role: 'crew', created_at: '2026-01-01', account_status: 'active', is_imported: false, imported_vessel_id: null, personnel_type: 'crew' },
            { id: 'p-stew', user_id: 'u-stew', email: 'stew@example.test', first_name: 'Demo', last_name: 'Stew', rank: 'Stewardess', position: null, department: 'Interior', status: 'Active', role: 'crew', created_at: '2026-01-01', account_status: 'active', is_imported: false, imported_vessel_id: null, personnel_type: 'crew' },
            { id: 'p-new', user_id: null, email: 'new@example.test', first_name: 'Demo', last_name: 'Newcomer', rank: 'Deckhand', position: null, department: 'Deck', status: 'Pending', role: 'crew', created_at: '2026-11-20T00:00:00Z', account_status: 'not_invited', is_imported: true, imported_vessel_id: 'v-dra', joining_date: '2026-12-01', personnel_type: 'crew' },
            { id: 'p-hyd', user_id: 'u-hyd', email: 'hyd@example.test', first_name: 'Demo', last_name: 'Elsewhere', rank: 'Cook', position: null, department: 'Galley', status: 'Active', role: 'crew', created_at: '2026-01-01', account_status: 'active', is_imported: false, imported_vessel_id: null, personnel_type: 'crew' },
          ],
          error: null,
        },
        crew_assignments: {
          data: [
            { id: 'a-bosun', vessel_id: 'v-dra', user_id: 'u-bosun', position: 'Bosun', rank: 'Bosun', join_date: '2026-06-01', leave_date: null, end_date: null, vessels: { id: 'v-dra', name: 'DRAAK' } },
            { id: 'a-stew', vessel_id: 'v-dra', user_id: 'u-stew', position: 'Stewardess', rank: null, join_date: '2026-06-01', leave_date: null, end_date: null, vessels: { id: 'v-dra', name: 'DRAAK' } },
            { id: 'a-hyd', vessel_id: 'v-hyd', user_id: 'u-hyd', position: 'Cook', rank: null, join_date: '2026-06-01', leave_date: null, end_date: null, vessels: { id: 'v-hyd', name: 'HYDRA' } },
          ],
          error: null,
        },
        vessels: { data: [{ id: 'v-dra', name: 'DRAAK' }], error: null },
        crew_leave_entries: { data: [{ crew_id: 'u-stew', status_code: 'L' }], error: null },
      };
    });

    it('shows the basic list with the notice: pending placements Pending, the day code of today On leave', async () => {
      renderPage();
      expect(await screen.findByText(BASIC_LIST_NOTICE)).toBeInTheDocument();
      await loaded('Bosun, Demo');
      expect(within(rowOf(/^Bosun, Demo$/)).getByText('On board')).toBeInTheDocument();
      expect(within(rowOf(/^Stew, Demo$/)).getByText('On leave')).toBeInTheDocument();
      expect(within(rowOf(/^Newcomer, Demo$/)).getByText('Pending')).toBeInTheDocument();
      expect(within(rowOf(/^Newcomer, Demo$/)).getByRole('button', { name: /^Pending login\./ })).toBeInTheDocument();
      expect(within(table()).queryByText(/Elsewhere/)).toBeNull();
      // The invitation column waits for the server list.
      expect(within(table()).queryByRole('columnheader', { name: /Invitation/ })).toBeNull();
    });

    it('the basic list merges crew numbers too, once crew_personal_details answers', async () => {
      h.tables.crew_personal_details = { data: [{ profile_id: 'p-bosun', crew_number: 'DRA-0007' }], error: null };
      renderPage();
      await loaded('Bosun, Demo');
      await waitFor(() => expect(within(rowOf(/^Bosun, Demo$/)).getByText('DRA-0007')).toBeInTheDocument());
      fireEvent.change(screen.getByPlaceholderText('Search name, position or crew number'), { target: { value: 'DRA-0007' } });
      await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(2));
    });

    it('the Movements tab says the movements are not set up yet', async () => {
      renderPage('/v/dra/crew/list?tab=movements');
      expect(await screen.findByRole('heading', { name: 'Movements are not set up yet' })).toBeInTheDocument();
      expect(h.rpc).not.toHaveBeenCalledWith('crew_vessel_movements', expect.anything());
    });
  });
});

describe('the Movements tab', () => {
  it('reads crew_vessel_movements for the range and lists the events', async () => {
    h.rpc.mockImplementation((fn: string) => {
      if (fn === 'crew_vessel_list') return Promise.resolve({ data: ROWS, error: null });
      return Promise.resolve({
        data: [
          { movement_id: null, profile_id: 'p-master', user_id: 'u-master', first_name: 'Demo', last_name: 'Master', preferred_name: null, position_text: 'Captain', kind: 'embark', occurred_on: '2026-11-02', occurred_at: null, port: null, source: 'assignment', source_id: 'a-m', notes: null },
          { movement_id: 'm-1', profile_id: 'p-stew', user_id: 'u-stew', first_name: 'Demo', last_name: 'Stew', preferred_name: null, position_text: 'Crew', kind: 'disembark', occurred_on: '2026-11-10', occurred_at: null, port: 'Palma', source: 'manual', source_id: null, notes: null },
        ],
        error: null,
      });
    });
    renderPage('/v/dra/crew/list?tab=movements&from=2026-11-01&to=2026-11-30');
    const movements = await screen.findByRole('table', { name: 'Crew movements' });
    await within(movements).findByText('Stew, Demo');
    expect(h.rpc).toHaveBeenCalledWith('crew_vessel_movements', { p_vessel_id: 'v-dra', p_from: '2026-11-01', p_to: '2026-11-30' });
    const body = within(movements).getAllByRole('row').slice(1);
    expect(body[0].textContent).toMatch(/10 Nov 2026.*Stew, Demo.*Left.*Palma/);
    expect(body[1].textContent).toMatch(/2 Nov 2026.*Master, Demo.*Joined/);
  });

  it('an error is an error with Retry', async () => {
    h.rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'crew_vessel_list' ? { data: ROWS, error: null } : { data: null, error: { code: '22023', message: 'range_too_long' } }),
    );
    renderPage('/v/dra/crew/list?tab=movements');
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

