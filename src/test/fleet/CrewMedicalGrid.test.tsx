/**
 * The crew medical grid (src/modules/fleet/components/CrewMedicalGrid.tsx,
 * hooks/useFleetMedicalStatus.ts; gap/02 M1, W8; gap/04 C61; X5-08):
 *
 * - the read: the fleet grid sends no vessel ids for the default "Vessels
 *   shown" (the server counts the caller's counted vessels) and the shown
 *   ids otherwise; the vessel grid sends its one vessel; `?vessel=<code>`
 *   becomes `?vessels=<code>`; the key carries company, vessels, status
 *   filter and day;
 * - KPI tiles per status that link to the filtered list and back; the
 *   status filter in the URL; the search; most severe first;
 * - the cells: ENG1 (equivalent, unfit, none on file, not known),
 *   vaccinations, rest (not tracked), health checks, the flags (not shared
 *   when NULL), the reason chips with the level's tone;
 * - cards below 768 px;
 * - Export: CSV through the export engine with personal data, refused in
 *   words while the export log is not set up (no file), disabled with a
 *   reason without the export key; vessel-scoped on the vessel grid;
 * - D-01: not set up, an error with Retry, a vessel out of reach in words,
 *   an unknown status is an error; the rules panel with the settings and
 *   windows.
 */
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  shown: null as unknown,
  wide: true,
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
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' }, profile: { company_id: 'co-1' } }) }));
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: () => state.wide,
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, error: state.toastError, success: state.toastSuccess } };
});
vi.mock('@/modules/fleet/hooks/useFleetVesselsShown', () => ({ useFleetVesselsShown: () => state.shown }));
vi.mock('@/modules/fleet/components/FleetVesselsFilter', () => ({ FleetVesselsFilter: () => <button type="button">Vessels shown</button> }));

import { CrewMedicalGrid } from '@/modules/fleet/components/CrewMedicalGrid';
import { MEDICAL_EXPORT_COLUMNS, fleetMedicalKeys, normaliseStatusFilter, toCrewMedicalRow } from '@/modules/fleet/hooks/useFleetMedicalStatus';
import type { FleetCrewMedicalStatusRow } from '@/modules/fleet/types/db.pending';
import { EXPORT_COPY, buildExportTable } from '@/lib/export';
import { VESSEL_OUT_OF_REACH_MESSAGE } from '@/modules/fleet';

const VESSELS = [
  { id: 'v-dra', name: 'DRAAK', code: 'DRA' },
  { id: 'v-hyd', name: 'HYDRA', code: 'HYD' },
];

function person(n: number, over: Partial<FleetCrewMedicalStatusRow> = {}): FleetCrewMedicalStatusRow {
  return {
    profile_id: `p-${n}`,
    person_name: `Crew member ${n}`,
    vessel_id: 'v-dra',
    vessel_name: 'DRAAK',
    vessel_code: 'DRA',
    position: 'Deckhand',
    department: 'Deck',
    is_planned: false,
    join_date: '2026-10-01',
    has_health_record: true,
    eng1_state: 'valid',
    eng1_expires_on: '2027-12-01',
    eng1_is_equivalent: false,
    vaccines_valid: 2,
    vaccines_expired: 0,
    vaccines_missing: 0,
    boosters_due: 0,
    rest_tracked: true,
    rest_noncompliant_30d: 0,
    serious_rest_breach_30d: 0,
    occ_health_state: 'ok',
    occ_health_due_on: null,
    condition_flag: false,
    allergy_flag: false,
    status: 'ok',
    reasons: [],
    ...over,
  };
}

// The server's order: most severe first.
const ROWS: FleetCrewMedicalStatusRow[] = [
  person(1, { person_name: 'Bosun', status: 'critical', reasons: ['eng1_expired', 'serious_rest_breach'], eng1_state: 'expired', eng1_expires_on: '2026-11-01', rest_noncompliant_30d: 2, serious_rest_breach_30d: 1 }),
  person(2, { person_name: 'Chief Stew', status: 'critical', reasons: ['eng1_unfit'], eng1_state: 'unfit', eng1_expires_on: null, eng1_is_equivalent: null, vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD' }),
  person(3, { person_name: 'Deckhand', status: 'at_risk', reasons: ['booster_due'], boosters_due: 1, condition_flag: null, allergy_flag: null }),
  person(4, { person_name: 'Engineer', status: 'incomplete', reasons: ['no_health_record'], has_health_record: false, eng1_state: 'missing', eng1_expires_on: null, eng1_is_equivalent: null, vaccines_valid: null, vaccines_expired: null, vaccines_missing: null, boosters_due: null, occ_health_state: null, condition_flag: null, allergy_flag: null }),
  person(5, { person_name: 'Joining Cook', status: 'ok', is_planned: true, join_date: '2026-12-10', rest_tracked: false, rest_noncompliant_30d: null, serious_rest_breach_30d: null, eng1_is_equivalent: true, allergy_flag: true }),
];

const MISSING_RPC = (fn: string): Answer => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });

function shownReady(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    companyId: 'co-1',
    vessels: VESSELS,
    shownIds: VESSELS.map((v) => v.id),
    shownVessels: VESSELS,
    countedIds: VESSELS.map((v) => v.id),
    isDefault: true,
    source: 'default',
    droppedCodes: [],
    fleetGroups: [],
    scope: { companyId: 'co-1', vesselIds: VESSELS.map((v) => v.id) },
    setShown: vi.fn(),
    showAll: vi.fn(),
    ...overrides,
  };
}

function Location() {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>;
}

function renderGrid(url = '/fleet/medical', props: Partial<React.ComponentProps<typeof CrewMedicalGrid>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={<CrewMedicalGrid header={{ title: 'Medical', eyebrow: 'Fleet' }} canExport {...props} />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByTestId('location').textContent ?? '';
const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

function answerAll(rows: FleetCrewMedicalStatusRow[] = ROWS) {
  state.answers = { fleet_crew_medical_status: { data: rows, error: null } };
  state.tables = {
    fleet_medical_settings: {
      data: { company_id: 'co-1', eng1_assessment_types: ['eng1'], eng1_equivalent_types: ['ml5'], required_vaccines: ['Yellow fever'], updated_at: '2026-11-20T10:00:00Z' },
      error: null,
    },
    expiry_window_rules: { data: [{ id: 'r1', company_id: 'co-1', item_type: 'medical', certificate_type_id: null, warn_days: 20, created_by: null, updated_by: null, created_at: '', updated_at: '' }], error: null },
  };
}

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.shown = null;
  state.wide = true;
  state.answers = {};
  state.tables = {};
  state.rpc.mockClear();
  state.toastError.mockClear();
  state.toastSuccess.mockClear();
});

describe('the medical read (pure)', () => {
  it('keys by company, vessels (sorted; counted for the default), status filter and day', () => {
    expect(fleetMedicalKeys.status('co-1', ['v-b', 'v-a'], ['ok', 'critical'], '2026-11-26')).toEqual([
      'fleet', 'company', 'co-1', 'medical', 'status', ['v-a', 'v-b'], { status: ['critical', 'ok'], today: '2026-11-26' },
    ]);
    expect(fleetMedicalKeys.status('co-1', null, null, '2026-11-26')[5]).toBe('counted');
    expect(fleetMedicalKeys.status('co-2', null, null, '2026-11-26')).not.toEqual(fleetMedicalKeys.status('co-1', null, null, '2026-11-26'));
    expect(normaliseStatusFilter([])).toBeNull();
    expect(fleetMedicalKeys.settings('co-1')).toEqual(['fleet', 'company', 'co-1', 'medical', 'settings']);
  });

  it('maps a row and refuses a status, reason or state it does not know', () => {
    expect(toCrewMedicalRow(ROWS[0])).toMatchObject({ profileId: 'p-1', status: 'critical', reasons: ['eng1_expired', 'serious_rest_breach'], seriousRestBreach30d: 1 });
    expect(toCrewMedicalRow(ROWS[3]).vaccinesValid).toBeNull();
    expect(() => toCrewMedicalRow(person(9, { status: 'urgent' as never }))).toThrow(/cannot show/);
    expect(() => toCrewMedicalRow(person(9, { reasons: ['eng1_lost' as never] }))).toThrow(/cannot show/);
    expect(() => toCrewMedicalRow(person(9, { eng1_state: 'lapsed' as never }))).toThrow(/cannot show/);
    expect(() => toCrewMedicalRow(person(9, { occ_health_state: 'late' as never }))).toThrow(/cannot show/);
  });

  it('exports dates and states only, the reasons as words', () => {
    const table = buildExportTable(MEDICAL_EXPORT_COLUMNS, ROWS.map(toCrewMedicalRow));
    expect(table.headers).toContain('Reasons');
    expect(table.rows[0][table.headers.indexOf('Reasons')]).toBe('ENG1 expired; Serious rest breach');
    expect(table.rows[3][table.headers.indexOf('ENG1')]).toBe('Not known');
    expect(table.rows[4][table.headers.indexOf('Joining on')]).toBe('2026-12-10');
  });
});

describe('the fleet grid', () => {
  it('reads the counted vessels by default (no ids) and lists most severe first', async () => {
    state.shown = shownReady();
    answerAll();
    renderGrid();
    await screen.findByRole('table');
    expect(callsOf('fleet_crew_medical_status')[0]).toMatchObject({ p_vessel_ids: null, p_status: null });
    const names = bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent ?? '');
    expect(names[0]).toMatch(/^Bosun/);
    expect(names[1]).toMatch(/^Chief Stew/);
    expect(names.at(-1)).toMatch(/^Joining Cook/);
    expect(screen.getByTestId('medical-updated').textContent).toMatch(/^Updated .* UTC$/);
  });

  it('sends the shown ids when the choice is not the default', async () => {
    state.shown = shownReady({ isDefault: false, shownIds: ['v-hyd'], shownVessels: [VESSELS[1]] });
    answerAll();
    renderGrid('/fleet/medical?vessels=hyd');
    await screen.findByRole('table');
    expect(callsOf('fleet_crew_medical_status')[0]).toMatchObject({ p_vessel_ids: ['v-hyd'] });
  });

  it('turns a ?vessel= link into the Vessels shown choice', async () => {
    state.shown = shownReady();
    answerAll();
    renderGrid('/fleet/medical?vessel=DRA&status=critical');
    await waitFor(() => expect(location()).toBe('/fleet/medical?status=critical&vessels=dra'));
  });

  it('counts per status in the tiles, which filter the list and back', async () => {
    state.shown = shownReady();
    answerAll();
    renderGrid();
    await screen.findByRole('table');
    const tiles = screen.getByRole('group', { name: 'Crew by medical status' });
    const critical = within(tiles).getByRole('link', { name: /Critical/ });
    expect(critical.textContent).toMatch(/2/);
    expect(within(tiles).getByRole('link', { name: /At risk/ }).textContent).toMatch(/1/);
    expect(within(tiles).getByRole('link', { name: /Incomplete/ }).textContent).toMatch(/1/);
    expect(within(tiles).getByRole('link', { name: /Up to date/ }).textContent).toMatch(/1/);
    fireEvent.click(critical);
    await waitFor(() => expect(location()).toBe('/fleet/medical?status=critical'));
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(within(tiles).getByRole('link', { name: /Critical/ }).textContent).toMatch(/Shown below/);
    fireEvent.click(within(tiles).getByRole('link', { name: /Critical/ }));
    await waitFor(() => expect(location()).toBe('/fleet/medical'));
    await waitFor(() => expect(bodyRows()).toHaveLength(5));
  });

  it('filters by status from the URL and by search', async () => {
    state.shown = shownReady();
    answerAll();
    renderGrid('/fleet/medical?status=at_risk');
    await screen.findByRole('table');
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].textContent).toMatch(/Deckhand/);
    cleanup();
    renderGrid('/fleet/medical');
    await screen.findByRole('table');
    fireEvent.change(screen.getByPlaceholderText('Search name, position or reason'), { target: { value: 'unfit' } });
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(bodyRows()[0].textContent).toMatch(/Chief Stew/);
  });

  it('explains every cell: reasons with their level, ENG1, rest and flags', async () => {
    state.shown = shownReady();
    answerAll();
    renderGrid();
    await screen.findByRole('table');
    const [bosun, stew, deckhand, engineer, cook] = bodyRows();
    const chip = within(bosun).getByText('Serious rest breach').closest('[data-reason]');
    expect(chip?.getAttribute('data-tone')).toBe('danger');
    expect(within(bosun).getByText('1 serious breach')).toBeInTheDocument();
    expect(within(bosun).getByText('2 breach days')).toBeInTheDocument();
    expect(within(stew).getByText('Unfit')).toBeInTheDocument();
    expect(within(stew).getByText('Assessed unfit').closest('[data-reason]')).not.toBeNull();
    expect(within(deckhand).getByText('Booster due').closest('[data-reason]')?.getAttribute('data-tone')).toBe('warn');
    expect(within(deckhand).getByText('Not shared')).toBeInTheDocument();
    expect(within(engineer).getByText('Not known')).toBeInTheDocument();
    expect(within(engineer).getAllByText('No health record').length).toBeGreaterThan(0);
    expect(within(cook).getByText('Joining 10 Dec 2026')).toBeInTheDocument();
    expect(within(cook).getByText('Not tracked')).toBeInTheDocument();
    expect(within(cook).getByText('Accepted equivalent')).toBeInTheDocument();
    expect(within(cook).getByText('Allergy')).toBeInTheDocument();
    // The name opens the crew profile on the person's vessel.
    expect(within(stew).getByRole('link', { name: 'Chief Stew' }).getAttribute('href')).toBe('/v/hyd/crew/people/p-2');
  });

  it('shows the rules with the company settings and the alert windows', async () => {
    state.shown = shownReady();
    answerAll();
    renderGrid();
    await screen.findByRole('table');
    const rules = screen.getByTestId('medical-rules');
    await waitFor(() => expect(within(rules).getByText('Yellow fever')).toBeInTheDocument());
    expect(within(rules).getByText('ML5 medical')).toBeInTheDocument();
    expect(within(rules).getByText(/ENG1 at risk within 20 days/)).toBeInTheDocument();
    // Each level is its pill then "when" (the heading never repeats a word of the label).
    for (const [name, pill] of [['Critical when', 'Critical'], ['At risk when', 'At risk'], ['Incomplete when', 'Incomplete']] as const) {
      const heading = within(within(rules).getByRole('region', { name })).getByRole('heading', { level: 3 });
      expect(heading.textContent).toBe(`${pill}when`);
    }
  });

  it('folds into cards below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    answerAll();
    renderGrid();
    const list = await screen.findByRole('list', { name: 'Crew medical status' });
    const cards = within(list).getAllByRole('listitem').filter((li) => li.parentElement === list);
    expect(cards).toHaveLength(5);
    expect(cards[0].textContent).toMatch(/Bosun/);
    expect(within(cards[0]).getByText('ENG1 expired')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('5 people of 5')).toBeInTheDocument();
  });

  it('refuses the personal-data export while the export log is not set up, in words and with no file', async () => {
    state.shown = shownReady();
    answerAll();
    state.answers.log_client_export = MISSING_RPC('log_client_export');
    const createUrl = vi.fn(() => 'blob:x');
    const original = URL.createObjectURL;
    URL.createObjectURL = createUrl;
    try {
      renderGrid();
      await screen.findByRole('table');
      const trigger = await screen.findByRole('button', { name: /Export/ });
      await waitFor(() => expect(trigger).not.toHaveAttribute('aria-disabled'));
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
      await screen.findByRole('menu');
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'CSV' }));
      });
      await waitFor(() => expect(state.toastError).toHaveBeenCalledWith(EXPORT_COPY.logMissingPersonal, { title: 'Export not made' }));
      expect(callsOf('log_client_export')[0]).toMatchObject({
        p_source_key: 'fleet.crew_medical_status',
        p_contains_personal_data: true,
        p_row_count: 5,
        p_kind: 'csv',
      });
      expect(callsOf('log_client_export')[0].p_vessel_id).toBeUndefined();
      expect(createUrl).not.toHaveBeenCalled();
      expect(state.toastSuccess).not.toHaveBeenCalled();
    } finally {
      URL.createObjectURL = original;
    }
  });

  it('disables Export with a reason without the export key', async () => {
    state.shown = shownReady();
    answerAll();
    renderGrid('/fleet/medical', { canExport: false });
    await screen.findByRole('table');
    const trigger = screen.getByRole('button', { name: /Export/ });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Exporting needs medical export access')).toBeInTheDocument();
  });

  it('says it is not set up while the RPC is missing (D-01), never zeros', async () => {
    state.shown = shownReady();
    answerAll();
    state.answers.fleet_crew_medical_status = MISSING_RPC('fleet_crew_medical_status');
    renderGrid();
    expect(await screen.findByText('Fleet medical status is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Crew by medical status' })).toBeNull();
  });

  it('shows an error with Retry, and a vessel out of reach in words', async () => {
    state.shown = shownReady();
    answerAll();
    state.answers.fleet_crew_medical_status = { data: null, error: { code: 'XX000', message: 'boom' } };
    renderGrid();
    // One retry for a plain failure (the app's rule), then the error.
    expect(await screen.findByText('The medical status could not be loaded', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
    cleanup();
    state.answers.fleet_crew_medical_status = { data: null, error: { code: '42501', message: 'vessel_out_of_reach' } };
    renderGrid();
    expect(await screen.findByText(VESSEL_OUT_OF_REACH_MESSAGE)).toBeInTheDocument();
  });

  it('treats an unknown status as an error, never a guess', async () => {
    state.shown = shownReady();
    answerAll([person(1, { status: 'urgent' as never })]);
    renderGrid();
    expect(await screen.findByText('The medical status could not be loaded')).toBeInTheDocument();
  });

  it('sends nothing until the vessels are known, and says when they could not load', async () => {
    state.shown = { status: 'loading' };
    answerAll();
    renderGrid();
    await screen.findByText('Loading the medical status');
    expect(callsOf('fleet_crew_medical_status')).toHaveLength(0);
    cleanup();
    state.shown = { status: 'error', error: { message: 'vessels failed' }, retry: vi.fn() };
    renderGrid();
    expect(await screen.findByText('Your vessels could not be loaded')).toBeInTheDocument();
    expect(callsOf('fleet_crew_medical_status')).toHaveLength(0);
  });
});

describe('the vessel grid', () => {
  it('reads its one vessel, without the vessel filter, and exports vessel-scoped', async () => {
    answerAll(ROWS.filter((r) => r.vessel_id === 'v-dra'));
    state.answers.log_client_export = MISSING_RPC('log_client_export');
    renderGrid('/v/dra/crew/medical', { vesselId: 'v-dra', vesselCode: 'dra', vesselName: 'DRAAK', header: { title: 'Crew Medical', eyebrow: 'DRAAK' } });
    await screen.findByRole('table');
    expect(callsOf('fleet_crew_medical_status')[0]).toMatchObject({ p_vessel_ids: ['v-dra'] });
    expect(screen.queryByRole('button', { name: 'Vessels shown' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Vessel/ })).toBeNull();
    expect(within(bodyRows()[0]).getByRole('link', { name: 'Bosun' }).getAttribute('href')).toBe('/v/dra/crew/people/p-1');
    const trigger = screen.getByRole('button', { name: /Export/ });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    await screen.findByRole('menu');
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'CSV' }));
    });
    await waitFor(() => expect(callsOf('log_client_export')[0]).toMatchObject({ p_vessel_id: 'v-dra', p_contains_personal_data: true }));
  });

  it('says when nobody is on the crew list', async () => {
    answerAll([]);
    renderGrid('/v/dra/crew/medical', { vesselId: 'v-dra', vesselCode: 'dra', vesselName: 'DRAAK' });
    expect(await screen.findByText("Nobody is on DRAAK's crew list")).toBeInTheDocument();
  });
});
