/**
 * The routed crew profile (X1-03; gap/04 C16, C17, C19, C20, C21; D-01,
 * D-X1-19):
 *
 * - the gate: while vessel.crew.crew_profiles.view loads nothing is read and
 *   nothing shows; denied is AccessDenied with no request; the person's own
 *   profile opens without the capability;
 * - a legacy login id in the URL is resolved to profiles.id and the URL
 *   replaced; an unknown tab lands on Personal; an invisible person (P0002)
 *   reads "can't be shown";
 * - populated: the header (name, crew number, position, department, status
 *   with its reason, the switcher in rank order), the tab row, the Personal
 *   facts, the Contact phones rendered once with their dial code, next of
 *   kin shown only to HR and the person;
 * - saving: only changed fields go to crew_personal_details_save; a refused
 *   field is shown at the field; the person's own identity fields are
 *   read-only;
 * - D-01: without the crew update the header comes from profiles (no
 *   switcher) and the tabs are read-only with the notice; any other error
 *   is an error with Retry.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CrewProfileSummaryRpcRow } from '@/modules/crew/types/db.pending';

const P_BOSUN = 'b0000000-0000-4000-8000-000000000014';
const U_BOSUN = 'a0000000-0000-4000-8000-000000000014';
const P_ME = 'b0000000-0000-4000-8000-000000000001';
const U_ME = 'a0000000-0000-4000-8000-000000000001';
const P_PREV = 'b0000000-0000-4000-8000-000000000012';
const P_NEXT = 'b0000000-0000-4000-8000-000000000015';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  caps: { status: 'granted' as 'granted' | 'loading' | 'denied', denied: new Set<string>() },
  me: { userId: 'a0000000-0000-4000-8000-000000000001', profileId: 'b0000000-0000-4000-8000-000000000001' },
  hr: { canView: false, canEdit: false },
  rpc: vi.fn(),
  tables: {} as Record<string, Result>,
  fromCalls: [] as string[],
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const result = (): Result => h.tables[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'is', 'order', 'limit', 'neq', 'insert', 'update', 'delete']) chain[m] = () => chain;
    chain.maybeSingle = () => {
      const r = result();
      return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
    };
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from, functions: { invoke: vi.fn() } } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => ({ allowed: h.caps.status === 'granted', status: h.caps.status, reason: 'test' }),
  useCan: (key: string) => h.caps.status === 'granted' && !h.caps.denied.has(key),
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: h.me.userId, email: 'me@example.test' },
    profile: { id: h.me.profileId, company_id: 'c-1', role: 'crew' },
    loading: false,
  }),
}));
vi.mock('@/modules/auth/hooks/useHrAccess', () => ({ useHrAccess: () => ({ loading: false, ...h.hr }) }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({ vessels: [{ id: 'v-dra', name: 'DRAAK' }, { id: 'v-hyd', name: 'HYDRA' }], selectedVesselId: 'v-dra' }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: h.notify };
});

import CrewProfilePage from '@/modules/crew/pages/CrewProfilePage';
import { SAVE_UNAVAILABLE } from '@/modules/crew/lib/personalDetailsSchema';
import { NOK_RESTRICTED } from '@/modules/crew/components/profile/ContactTab';

const summaryRow = (over: Partial<CrewProfileSummaryRpcRow> = {}): CrewProfileSummaryRpcRow => ({
  profile_id: P_BOSUN,
  user_id: U_BOSUN,
  first_name: 'Demo',
  last_name: 'Bosun',
  preferred_name: null,
  avatar_url: null,
  crew_number: 'DRA-0042',
  position_id: 'pos-bosun',
  position_name: 'Bosun',
  position_text: 'Bosun',
  department_key: 'deck',
  department_label: 'Deck',
  rank_tier: 'officer',
  on_vessel: true,
  placement_kind: 'assignment',
  assignment_id: 'a-bosun',
  join_date: '2026-10-01',
  leave_date: null,
  status: 'on_board',
  status_detail: null,
  transfer_vessel_id: null,
  leave_code: null,
  login_state: 'active',
  prev_profile_id: P_PREV,
  prev_name: 'Demo Chief Officer',
  next_profile_id: P_NEXT,
  next_name: 'Demo Chief Stew',
  member_index: 3,
  member_count: 7,
  is_own: false,
  can_edit: true,
  can_edit_self: true,
  tabs: ['personal', 'contact', 'documents', 'stcw', 'qualifications', 'training', 'activity'],
  ...over,
});

const detailsRow = {
  profile_id: P_BOSUN,
  company_id: 'c-1',
  crew_number: 'DRA-0042',
  title: 'mr',
  middle_name: null,
  work_email: null,
  sex: 'male',
  date_of_birth: '1990-04-12',
  place_of_birth: 'Valletta',
  nationality_code: 'GB',
  dual_nationality_code: null,
  residency_country_code: null,
  place_of_embarkation: 'Palma',
  height_cm: 182,
  weight_kg: null,
  marital_status: null,
  has_children: null,
  biography: 'Ten seasons on deck.',
  address_line1: 'Harbour Road 1',
  address_line2: null,
  city: 'Antibes',
  region: null,
  postal_code: '06600',
  country_code: 'FR',
  repatriation_airport: 'NCE',
  phone_dial_code: '44',
  phone_number: '7700 900123',
  mobile_dial_code: null,
  mobile_number: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

const COUNTRIES = [
  { iso2: 'GB', iso3: 'GBR', name: 'United Kingdom', demonym: 'British', dial_code: '44', flag_emoji: null, sort_name: 'United Kingdom' },
  { iso2: 'FR', iso3: 'FRA', name: 'France', demonym: 'French', dial_code: '33', flag_emoji: null, sort_name: 'France' },
];

/** Every RPC the page calls, by name; a function per name, or a fixed result. */
let rpcAnswers: Record<string, (args: Record<string, unknown>) => Result>;

const serverWorld = () => {
  rpcAnswers = {
    crew_profile_resolve: (args) => ({ data: args.p_ref === U_BOSUN ? P_BOSUN : args.p_ref, error: null }),
    crew_profile_summary: () => ({ data: [summaryRow()], error: null }),
    crew_personal_details_save: (args) => ({ data: { ...detailsRow, ...(args.p_payload as object) }, error: null }),
    crew_languages_save: () => ({ data: [], error: null }),
  };
  h.tables = {
    crew_personal_details: { data: [detailsRow], error: null },
    crew_languages: { data: [{ slot: 1, language_code: 'en', proficiency: null }], error: null },
    profiles: { data: [{ id: P_BOSUN, email: 'bosun@demo-fleet.example', first_name: 'Demo', last_name: 'Bosun', preferred_name: null }], error: null },
    ref_countries: { data: COUNTRIES, error: null },
    ref_languages: { data: [{ code: 'en', name: 'English', sort_order: 1 }], error: null },
    crew_assignments: { data: [{ id: 'a-bosun', vessel_id: 'v-dra', position: 'Bosun', rank: null, department: 'Deck', join_date: '2026-10-01', start_date: '2026-10-01', leave_date: null, end_date: null }], error: null },
    crew_assignment_terms: { data: [], error: null },
    user_signature_images: { data: null, error: { code: 'PGRST205', message: 'Could not find the table public.user_signature_images' } },
    crew_next_of_kin: { data: [], error: null },
  };
};

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/v/:vesselCode/crew/people/:profileId/:tab"
            element={
              <>
                <CrewProfilePage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.caps.status = 'granted';
  h.caps.denied = new Set();
  h.me = { userId: U_ME, profileId: P_ME };
  h.hr = { canView: false, canEdit: false };
  h.fromCalls = [];
  for (const fn of Object.values(h.notify)) fn.mockReset();
  serverWorld();
  h.rpc.mockReset();
  h.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => Promise.resolve(rpcAnswers[fn]?.(args) ?? { data: null, error: null }));
});
afterEach(() => vi.clearAllMocks());

const rpcNames = () => h.rpc.mock.calls.map((c) => c[0]);

describe('the gate', () => {
  it('while crew_profiles.view loads, nothing is read and nothing shows', () => {
    h.caps.status = 'loading';
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('denied: AccessDenied, with no request', () => {
    h.caps.status = 'denied';
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    expect(screen.getByText("You can't see this crew profile")).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('the person opens their own profile without the capability (by profile id or login id)', async () => {
    h.caps.status = 'denied';
    h.me = { userId: U_BOSUN, profileId: P_BOSUN };
    rpcAnswers.crew_profile_summary = () => ({ data: [summaryRow({ is_own: true, can_edit: false, can_edit_self: true })], error: null });
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    expect(await screen.findByRole('heading', { level: 1, name: /Demo Bosun/ })).toBeInTheDocument();
  });

  it('an invisible or unknown person (P0002) reads "can\'t be shown", not an error', async () => {
    rpcAnswers.crew_profile_resolve = () => ({ data: null, error: { code: 'P0002', message: 'profile_not_found', details: 'This crew member could not be found.' } });
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    expect(await screen.findByText('This crew member can’t be shown')).toBeInTheDocument();
    expect(rpcNames()).not.toContain('crew_profile_summary');
  });

  it('a URL id that is not an id at all asks the server nothing', async () => {
    renderAt('/v/dra/crew/people/not-an-id/personal');
    expect(await screen.findByText('This crew member can’t be shown')).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('the URL', () => {
  it('a legacy login id is resolved and replaced by the profiles.id (D-X1-19), the query kept', async () => {
    renderAt(`/v/dra/crew/people/${U_BOSUN}/contact?from=list`);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/v/dra/crew/people/${P_BOSUN}/contact?from=list`));
    expect(h.rpc).toHaveBeenCalledWith('crew_profile_resolve', { p_vessel_id: 'v-dra', p_ref: U_BOSUN });
    expect(await screen.findByRole('heading', { level: 1, name: /Demo Bosun/ })).toBeInTheDocument();
  });

  it('an unknown tab lands on Personal', async () => {
    renderAt(`/v/dra/crew/people/${P_BOSUN}/nonsense`);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/v/dra/crew/people/${P_BOSUN}/personal`));
  });

  it('a tab a later slice builds (documents) lands on Personal too', async () => {
    renderAt(`/v/dra/crew/people/${P_BOSUN}/documents`);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/v/dra/crew/people/${P_BOSUN}/personal`));
  });
});

describe('populated', () => {
  it('the header: name, crew number, position, department, status, the switcher and the actions', async () => {
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    const h1 = await screen.findByRole('heading', { level: 1, name: /Demo Bosun/ });
    expect(h1).toBeInTheDocument();
    const header = h1.closest('header') as HTMLElement;
    expect(within(header).getByText('DRA-0042')).toBeInTheDocument();
    expect(within(header).getByText('Bosun')).toBeInTheDocument();
    expect(within(header).getByText('Deck')).toBeInTheDocument();
    expect(within(header).getByText('On board')).toBeInTheDocument();
    expect(within(header).getByText('3 of 7')).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Previous: Demo Chief Officer' })).toHaveAttribute('href', `/v/dra/crew/people/${P_PREV}/personal`);
    expect(within(header).getByRole('link', { name: 'Next: Demo Chief Stew' })).toHaveAttribute('href', `/v/dra/crew/people/${P_NEXT}/personal`);
    expect(within(header).getByRole('link', { name: /Rotation schedule/ })).toHaveAttribute('href', `/v/dra/crew/planner/timeline?crew=${P_BOSUN}`);
    expect(within(header).getByRole('link', { name: /Edit profile/ })).toHaveAttribute('href', `/v/dra/crew/people/${P_BOSUN}/personal?edit=1`);
  });

  it('the tab row: the built tabs the server opens, the active one marked', async () => {
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    const nav = await screen.findByRole('navigation', { name: 'Profile sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Personal', 'Contact']);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links[1]).toHaveAttribute('href', `/v/dra/crew/people/${P_BOSUN}/contact`);
    expect(nav.querySelector('ul')?.className).toMatch(/overflow-x-auto/);
  });

  it('the status reason is in words (a planned joiner)', async () => {
    rpcAnswers.crew_profile_summary = () => ({ data: [summaryRow({ status: 'pending', status_detail: 'planned', placement_kind: 'planned', join_date: '2099-12-06' })], error: null });
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    expect(await screen.findByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Joins 6 Dec 2099')).toBeInTheDocument();
  });

  it('the Personal tab shows the stored facts, the languages, employment and biography', async () => {
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    expect(await screen.findByText('British')).toBeInTheDocument();
    expect(screen.getByText('Mr Demo Bosun')).toBeInTheDocument();
    expect(screen.getByText('182 cm')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Ten seasons on deck.')).toBeInTheDocument();
    expect(await screen.findByText('Current employment')).toBeInTheDocument();
    // The signature store does not exist yet (PR-X1-I): no card at all.
    expect(screen.queryByText('Signature')).toBeNull();
  });

  it('the Contact tab renders phones once with their dial code and keeps next of kin to HR and the person', async () => {
    renderAt(`/v/dra/crew/people/${P_BOSUN}/contact`);
    expect(await screen.findByRole('link', { name: /\+44 7700 900123/ })).toHaveAttribute('href', 'tel:+447700900123');
    expect(screen.getByText('NCE')).toBeInTheDocument();
    expect(screen.getByText('Harbour Road 1')).toBeInTheDocument();
    expect(screen.getByText(NOK_RESTRICTED)).toBeInTheDocument();
    expect(h.fromCalls).not.toContain('crew_next_of_kin');
  });

  it('HR sees the next of kin', async () => {
    h.hr = { canView: true, canEdit: true };
    h.tables.crew_next_of_kin = {
      data: [{ id: 'nok-1', full_name: 'Next Of Kin', relationship: 'Parent', is_primary: true, is_emergency_contact: true, phone_primary: null, phone_secondary: null, email: 'nok@example.test', created_at: '2026-01-01' }],
      error: null,
    };
    renderAt(`/v/dra/crew/people/${P_BOSUN}/contact`);
    expect(await screen.findByText('Next Of Kin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add next of kin/ })).toBeInTheDocument();
  });
});

describe('saving the Personal tab', () => {
  it('sends only the changed field and closes the form', async () => {
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal?edit=1`);
    const height = await screen.findByLabelText('Height (cm)');
    fireEvent.change(height, { target: { value: '185' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('crew_personal_details_save', { p_profile_id: P_BOSUN, p_payload: { height_cm: 185 } }));
    expect(rpcNames()).not.toContain('crew_languages_save');
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Personal details saved'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/v/dra/crew/people/${P_BOSUN}/personal`));
    expect(screen.getByTestId('location').textContent).not.toContain('edit=1');
  });

  it('a refused field is shown at the field (the server names it in HINT)', async () => {
    rpcAnswers.crew_personal_details_save = () => ({
      data: null,
      error: { code: '22023', message: 'crew_number_taken', details: 'Another crew member of this company already has this crew number.', hint: 'crew_number' },
    });
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal?edit=1`);
    fireEvent.change(await screen.findByLabelText('Crew number'), { target: { value: 'DRA-0001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Another crew member of this company already has this crew number.')).toBeInTheDocument();
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('a save that comes back without the row is an error, never a success', async () => {
    rpcAnswers.crew_personal_details_save = () => ({ data: null, error: null });
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal?edit=1`);
    fireEvent.change(await screen.findByLabelText('Height (cm)'), { target: { value: '186' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalled());
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('the person themselves: identity fields are read-only, self fields editable', async () => {
    h.me = { userId: U_BOSUN, profileId: P_BOSUN };
    rpcAnswers.crew_profile_summary = () => ({ data: [summaryRow({ is_own: true, can_edit: false, can_edit_self: true })], error: null });
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal?edit=1`);
    expect(await screen.findByLabelText('First name')).toBeDisabled();
    expect(screen.getByLabelText('Height (cm)')).not.toBeDisabled();
    expect(screen.getByText(/changed by HR or a crew editor/)).toBeInTheDocument();
  });

  it('a viewer without edit rights sees no Edit at all', async () => {
    rpcAnswers.crew_profile_summary = () => ({ data: [summaryRow({ can_edit: false, can_edit_self: false })], error: null });
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal?edit=1`);
    expect(await screen.findByText('British')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Edit profile/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

describe('D-01 and errors', () => {
  const missingFn = (fn: string) => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });

  it('without the crew update: header from profiles (no switcher), the Personal tab read-only with the notice', async () => {
    rpcAnswers.crew_profile_resolve = () => missingFn('crew_profile_resolve');
    rpcAnswers.crew_profile_summary = () => missingFn('crew_profile_summary');
    h.tables.crew_personal_details = { data: null, error: { code: 'PGRST205', message: 'Could not find the table public.crew_personal_details' } };
    h.tables.profiles = {
      data: [{ id: P_BOSUN, user_id: U_BOSUN, email: 'bosun@demo-fleet.example', first_name: 'Demo', last_name: 'Bosun', preferred_name: null, avatar_url: null, position: 'Bosun', rank: null, department: 'Deck', account_status: 'active', date_of_birth: null, place_of_birth: 'Valletta', nationality: 'British', gender: null, embarkation_port: null, phone: '+44 7700 900123' }],
      error: null,
    };
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    expect(await screen.findByRole('heading', { level: 1, name: /Demo Bosun/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Move through the crew' })).toBeNull();
    expect(await screen.findByText(SAVE_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText('Valletta')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Edit profile/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Edit profile/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('any other error is an error with Retry, never the fallback', async () => {
    rpcAnswers.crew_profile_summary = () => ({ data: null, error: { code: 'XX000', message: 'Upstream is down' } });
    renderAt(`/v/dra/crew/people/${P_BOSUN}/personal`);
    const retry = await screen.findByRole('button', { name: /Try again/ });
    expect(screen.getByText('This profile could not load')).toBeInTheDocument();
    expect(screen.queryByText(SAVE_UNAVAILABLE)).toBeNull();
    const before = rpcNames().filter((n) => n === 'crew_profile_summary').length;
    rpcAnswers.crew_profile_summary = () => ({ data: [summaryRow()], error: null });
    fireEvent.click(retry);
    expect(await screen.findByRole('heading', { level: 1, name: /Demo Bosun/ })).toBeInTheDocument();
    expect(rpcNames().filter((n) => n === 'crew_profile_summary').length).toBeGreaterThan(before);
  });
});
