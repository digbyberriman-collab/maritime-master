/**
 * Fleet › Medical (src/modules/fleet/pages/FleetMedicalPage.tsx,
 * components/MedicalSettingsDrawer.tsx; gap/02 M1, X1; X5-08):
 *
 * - the gate: nothing is read and nothing shown while the access check
 *   loads; denied is AccessDenied; allowed renders the grid;
 * - not set up (D-01): the RPC missing is "Fleet medical status is not set
 *   up yet";
 * - "Medical settings" only for medical admins; the drawer saves through
 *   `fleet_medical_settings_save` only, with every list and the updated_at
 *   it read; a stale save is refused in words; the defaults are read-only
 *   while the settings table is missing; validation before any request.
 */
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  shown: null as unknown,
  answers: {} as Record<string, Answer | ((args: Record<string, unknown>) => Answer)>,
  tables: {} as Record<string, Answer>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    const answer = state.answers[fn];
    const value = typeof answer === 'function' ? answer(args) : answer;
    return Promise.resolve(value ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
  });
  const from = (table: string) => {
    const result = () => state.tables[table] ?? { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'in', 'maybeSingle']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  return { supabase: { rpc: state.rpc, from } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' }, profile: { company_id: 'co-1' } }) }));
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: () => true,
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, error: state.toastError, success: state.toastSuccess } };
});
vi.mock('@/modules/fleet/hooks/useFleetVesselsShown', () => ({ useFleetVesselsShown: () => state.shown }));
vi.mock('@/modules/fleet/components/FleetVesselsFilter', () => ({ FleetVesselsFilter: () => <button type="button">Vessels shown</button> }));

import FleetMedicalPage from '@/modules/fleet/pages/FleetMedicalPage';
import { FLEET_CAPS } from '@/modules/fleet/paths';
import {
  ENG1_TYPE_REQUIRED,
  VACCINE_DUPLICATE,
  addVaccine,
  formToSettings,
  medicalSettingsRefusal,
  settingsFromRow,
  settingsToForm,
  toSavePayload,
} from '@/modules/fleet/lib/medicalSettingsSchema';

const GRANTED: Decision = { allowed: true, status: 'granted', reason: '' };
const DENIED: Decision = { allowed: false, status: 'denied', reason: 'no' };
const LOADING: Decision = { allowed: false, status: 'loading', reason: '' };

const VESSELS = [{ id: 'v-dra', name: 'DRAAK', code: 'DRA' }];
const shownReady = () => ({
  status: 'ready',
  companyId: 'co-1',
  vessels: VESSELS,
  shownIds: ['v-dra'],
  shownVessels: VESSELS,
  countedIds: ['v-dra'],
  isDefault: true,
  source: 'default',
  droppedCodes: [],
  fleetGroups: [],
  scope: { companyId: 'co-1', vesselIds: ['v-dra'] },
  setShown: vi.fn(),
  showAll: vi.fn(),
});

const ROW = {
  profile_id: 'p-1', person_name: 'Bosun', vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', position: 'Bosun', department: 'Deck',
  is_planned: false, join_date: null, has_health_record: true, eng1_state: 'valid', eng1_expires_on: '2027-12-01', eng1_is_equivalent: false,
  vaccines_valid: 1, vaccines_expired: 0, vaccines_missing: 0, boosters_due: 0, rest_tracked: true, rest_noncompliant_30d: 0, serious_rest_breach_30d: 0,
  occ_health_state: 'ok', occ_health_due_on: null, condition_flag: false, allergy_flag: false, status: 'ok', reasons: [],
};
const SETTINGS_ROW = { company_id: 'co-1', eng1_assessment_types: ['eng1'], eng1_equivalent_types: [], required_vaccines: ['Yellow fever'], updated_at: '2026-11-20T10:00:00Z' };

const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/fleet/medical']}>
        <Routes>
          <Route path="/fleet/medical" element={<FleetMedicalPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.decide = () => GRANTED;
  state.shown = null;
  state.answers = {};
  state.tables = {};
  state.rpc.mockClear();
  state.toastError.mockClear();
  state.toastSuccess.mockClear();
});

describe('the settings rules (pure)', () => {
  it('needs one ENG1 type, never a type twice, and each vaccine once', () => {
    const form = settingsToForm({ eng1Types: ['eng1'], equivalentTypes: ['ml5'], requiredVaccines: ['Yellow fever'] });
    expect(form.roles).toMatchObject({ eng1: 'eng1', ml5: 'equivalent', company: 'none' });
    expect(formToSettings(form)).toEqual({ eng1Types: ['eng1'], equivalentTypes: ['ml5'], requiredVaccines: ['Yellow fever'] });
    expect(formToSettings({ ...form, roles: { ...form.roles, eng1: 'none' } })).toBeNull();
    expect(formToSettings({ ...form, requiredVaccines: ['Yellow fever', 'yellow  FEVER'] })).toBeNull();
    expect(addVaccine(['Yellow fever'], ' yellow fever ')).toEqual({ list: ['Yellow fever'], error: VACCINE_DUPLICATE });
    expect(addVaccine([], '  Typhoid   booster ')).toEqual({ list: ['Typhoid booster'], error: null });
    expect(addVaccine([], '   ').error).toBe('Enter the vaccine name');
    expect(addVaccine([], 'x'.repeat(81)).error).toMatch(/80 characters/);
    expect(addVaccine(Array.from({ length: 40 }, (_, i) => `V${i}`), 'Another').error).toMatch(/40 vaccines/);
    expect(ENG1_TYPE_REQUIRED).toMatch(/at least one/);
  });

  it('reads a stored row, sends every list with the updated_at read, and words the refusals', () => {
    expect(settingsFromRow({ eng1_assessment_types: ['ml5', 'eng1', 'unknown'], eng1_equivalent_types: ['company'], required_vaccines: ['A'] })).toEqual({
      eng1Types: ['eng1', 'ml5'],
      equivalentTypes: ['company'],
      requiredVaccines: ['A'],
    });
    expect(toSavePayload({ eng1Types: ['eng1'], equivalentTypes: [], requiredVaccines: [] }, null)).toEqual({
      eng1_assessment_types: ['eng1'],
      eng1_equivalent_types: [],
      required_vaccines: [],
      expected_updated_at: null,
    });
    expect(medicalSettingsRefusal('stale_settings')).toMatch(/changed the medical settings/);
    expect(medicalSettingsRefusal('not_permitted')).toMatch(/medical admins/);
    expect(medicalSettingsRefusal('something_else')).toBeNull();
  });
});

describe('the page gate', () => {
  it('reads and shows nothing while the access check loads', async () => {
    state.decide = () => LOADING;
    state.shown = shownReady();
    state.answers = { fleet_crew_medical_status: { data: [ROW], error: null } };
    renderPage();
    expect(screen.getByText('Loading fleet medical')).toBeInTheDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Medical' })).toBeNull();
  });

  it('denied is AccessDenied, with no read', async () => {
    state.decide = (key) => (key === FLEET_CAPS.medicalView ? DENIED : GRANTED);
    state.shown = shownReady();
    renderPage();
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('allowed renders the grid; not set up says so (D-01)', async () => {
    state.shown = shownReady();
    state.answers = { fleet_crew_medical_status: { data: [ROW], error: null } };
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Medical' })).toBeInTheDocument();
    await screen.findByRole('table');
    cleanup();
    state.answers = { fleet_crew_medical_status: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fleet_crew_medical_status' } } };
    renderPage();
    expect(await screen.findByText('Fleet medical status is not set up yet')).toBeInTheDocument();
  });
});

describe('medical settings', () => {
  it('are offered to medical admins only', async () => {
    state.shown = shownReady();
    state.answers = { fleet_crew_medical_status: { data: [ROW], error: null } };
    state.decide = (key) => (key === FLEET_CAPS.medicalAdmin ? DENIED : GRANTED);
    renderPage();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Medical settings' })).toBeNull();
  });

  it('save every list with the updated_at read, through the definer only', async () => {
    state.shown = shownReady();
    state.tables = { fleet_medical_settings: { data: SETTINGS_ROW, error: null }, expiry_window_rules: { data: [], error: null } };
    state.answers = {
      fleet_crew_medical_status: { data: [ROW], error: null },
      fleet_medical_settings_save: { data: { ...SETTINGS_ROW, required_vaccines: ['Yellow fever', 'Typhoid'], updated_at: '2026-11-26T10:00:00Z' }, error: null },
    };
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Medical settings' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Yellow fever');
    expect(within(dialog).getByText(/medical alert window: 90 days/)).toBeInTheDocument();
    const save = within(dialog).getByRole('button', { name: 'Save settings' });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByPlaceholderText(/Add a vaccine/), { target: { value: 'Typhoid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(save).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(callsOf('fleet_medical_settings_save')).toHaveLength(1));
    expect(callsOf('fleet_medical_settings_save')[0]).toEqual({
      p_settings: {
        eng1_assessment_types: ['eng1'],
        eng1_equivalent_types: [],
        required_vaccines: ['Yellow fever', 'Typhoid'],
        expected_updated_at: '2026-11-20T10:00:00Z',
      },
    });
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith('Medical settings saved'));
  });

  it('refuse a stale save in words, never as saved', async () => {
    state.shown = shownReady();
    state.tables = { fleet_medical_settings: { data: SETTINGS_ROW, error: null }, expiry_window_rules: { data: [], error: null } };
    state.answers = {
      fleet_crew_medical_status: { data: [ROW], error: null },
      fleet_medical_settings_save: { data: null, error: { code: '22023', message: 'stale_settings' } },
    };
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Medical settings' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Yellow fever');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Yellow fever' }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save settings' }));
    });
    expect(await within(dialog).findByText(/Someone changed the medical settings/)).toBeInTheDocument();
    expect(state.toastSuccess).not.toHaveBeenCalled();
  });

  it('refuse a returned row of another company as not saved', async () => {
    state.shown = shownReady();
    state.tables = { fleet_medical_settings: { data: SETTINGS_ROW, error: null }, expiry_window_rules: { data: [], error: null } };
    state.answers = {
      fleet_crew_medical_status: { data: [ROW], error: null },
      fleet_medical_settings_save: { data: { ...SETTINGS_ROW, company_id: 'co-2' }, error: null },
    };
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Medical settings' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Yellow fever');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Yellow fever' }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save settings' }));
    });
    expect(await within(dialog).findByText('The settings were not saved. Try again.')).toBeInTheDocument();
    expect(state.toastSuccess).not.toHaveBeenCalled();
  });

  it('show the defaults read-only while the settings table is missing (D-01)', async () => {
    state.shown = shownReady();
    state.tables = { expiry_window_rules: { data: [], error: null } };
    state.answers = { fleet_crew_medical_status: { data: [ROW], error: null } };
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Medical settings' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/can be changed once this part of STORM is set up/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save settings' })).toBeDisabled();
    expect(within(dialog).getByPlaceholderText(/Add a vaccine/)).toBeDisabled();
    expect(callsOf('fleet_medical_settings_save')).toHaveLength(0);
  });
});
