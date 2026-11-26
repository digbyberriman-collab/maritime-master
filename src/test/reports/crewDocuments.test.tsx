/**
 * Crew documents (gap/02 R4; src/modules/reports/reports/
 * CrewDocumentsReport.tsx, components/ExpiryItemsReport.tsx,
 * lib/expiryReports.ts; DECISIONS D-X5-12, D-X5-21):
 *
 * - pure: the sources a Type value reads (the legacy crew sources and X1's
 *   crew documents), the Vessel filter ("No current vessel" only with
 *   fleet reach) and what each value asks for, the item type labels, the
 *   export columns;
 * - the page: Type, Status and Vessel are read from the URL and sent to
 *   `fleet_expiry_items` (sources, buckets, vessel ids, unassigned);
 *   Apply writes them to the URL; people with no current vessel are asked
 *   for and listed as the "No current vessel" group only for a reader with
 *   fleet reach, and the tiles say they are not counted; each row shows its
 *   warning window and the windows line names each type's; the report is
 *   personal data, so its export is refused while the export log is not
 *   set up, with the engine's sentence and no file.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  shown: null as unknown,
  wide: true,
  fleetReach: true,
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
    for (const m of ['select', 'eq', 'order', 'in']) chain[m] = () => chain;
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
vi.mock('@/lib/permissions/adaptor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions/adaptor')>()),
  resolveCapability: (key: string) => state.decide(key),
}));
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: () => state.wide,
}));
vi.mock('@/app/router/useMembershipReach', () => ({
  useMembershipReach: () => ({ source: 'legacy', fleetReach: state.fleetReach, reachUnknown: false }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, error: state.toastError, success: state.toastSuccess } };
});
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => state.shown,
  FleetVesselsFilter: () => <button type="button">Vessels shown</button>,
}));

import CrewDocumentsReport from '@/modules/reports/reports/CrewDocumentsReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  CREW_DOCUMENT_EXPORT_COLUMNS,
  CREW_SOURCE_KEYS,
  TYPE_FILTER,
  crewSourcesFor,
  crewVesselScope,
  itemTypeLabel,
  vesselFilterSpec,
} from '@/modules/reports/lib/expiryReports';
import { EXPORT_COPY, buildExportTable } from '@/lib/export';
import { toFleetExpiryItem } from '@/modules/fleet/hooks/useFleetExpiry';
import type { FleetExpiryItemRow } from '@/modules/fleet/types/db.pending';

const DEF = getReport('crew-documents', 'fleet') as ReportDefinition;
const VESSELS = [
  { id: 'v-dra', name: 'DRAAK', code: 'DRA' },
  { id: 'v-hyd', name: 'HYDRA', code: 'HYD' },
];

function doc(n: number, overrides: Partial<FleetExpiryItemRow> = {}): FleetExpiryItemRow {
  return {
    source_key: 'crew_certificates_legacy',
    item_type: 'crew_qualification',
    record_id: `d-${n}`,
    vessel_id: 'v-dra',
    vessel_name: 'DRAAK',
    vessel_code: 'DRA',
    profile_id: `p-${n}`,
    person_name: `Chief Stew ${n}`,
    label: `Certificate ${n}`,
    detail: null,
    expires_on: '2026-12-10',
    days_remaining: 14,
    bucket: 'expiring_soon',
    window_days: 90,
    endorsement_due_on: null,
    endorsement_state: null,
    alerts_muted: false,
    link_scope: 'vessel',
    link_rel: `crew/people/p-${n}/documents`,
    total_count: 3,
    ...overrides,
  };
}

const ROWS: FleetExpiryItemRow[] = [
  doc(1, { source_key: 'profile_identity_legacy', item_type: 'passport', record_id: 'p-1', label: 'Passport', person_name: 'Bosun', bucket: 'expiring', days_remaining: 200, window_days: 270, detail: 'Malta' }),
  doc(2, { label: 'STCW Basic Safety Training', person_name: 'Deckhand' }),
  doc(3, {
    source_key: 'medical_fitness',
    item_type: 'medical',
    label: 'ENG1 medical',
    detail: 'Fit',
    person_name: 'Chef',
    vessel_id: null,
    vessel_name: null,
    vessel_code: null,
    link_scope: 'workspace',
    link_rel: 'health',
    bucket: 'expired',
    days_remaining: -2,
  }),
];

const SUMMARY = [
  { source_key: 'profile_identity_legacy', item_type: 'passport', vessel_id: null, bucket: 'expiring', endorsement_state: null, item_count: 1, muted_count: 0 },
  { source_key: 'crew_certificates_legacy', item_type: 'crew_qualification', vessel_id: null, bucket: 'expiring_soon', endorsement_state: null, item_count: 1, muted_count: 0 },
  { source_key: 'vessel_certificates', item_type: 'vessel_certificate', vessel_id: null, bucket: 'expired', endorsement_state: null, item_count: 9, muted_count: 0 },
];

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

function renderReport(url = '/fleet/reports/crew-documents') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<CrewDocumentsReport definition={DEF} />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByTestId('location').textContent ?? '';
const callsOf = (fn: string) => state.rpc.mock.calls.filter((c) => c[0] === fn).map((c) => c[1] as Record<string, unknown>);
const lastItemsCall = () => callsOf('fleet_expiry_items').at(-1) ?? {};
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

function answerAll(rows: FleetExpiryItemRow[] = ROWS) {
  state.answers = {
    fleet_expiry_items: { data: rows, error: null },
    fleet_expiry_summary: { data: SUMMARY, error: null },
  };
  state.tables = { expiry_window_rules: { data: [], error: null } };
}

async function chooseOption(comboboxName: string, option: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: comboboxName }), { key: 'Enter' });
  fireEvent.keyDown(await screen.findByRole('option', { name: option }), { key: 'Enter' });
}

async function openVesselOptions(): Promise<string[]> {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Vessel' }), { key: 'Enter' });
  const options = (await screen.findAllByRole('option')).map((o) => o.textContent ?? '');
  fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' });
  return options;
}

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.shown = null;
  state.wide = true;
  state.fleetReach = true;
  state.answers = {};
  state.tables = {};
  state.rpc.mockClear();
  state.toastError.mockClear();
  state.toastSuccess.mockClear();
});

// ─── Pure ───────────────────────────────────────────────────────────────

describe('crew documents (pure)', () => {
  it('reads every crew source by default and one source by Type, X1’s crew documents included', () => {
    expect(CREW_SOURCE_KEYS).toEqual(['crew_documents', 'profile_identity_legacy', 'crew_certificates_legacy', 'work_authorisations', 'training_records', 'medical_fitness']);
    expect(crewSourcesFor({ type: 'all' })).toEqual(CREW_SOURCE_KEYS);
    expect(crewSourcesFor({ type: 'medical_fitness' })).toEqual(['medical_fitness']);
    expect(crewSourcesFor({ type: 'vessel_certificates' })).toEqual(CREW_SOURCE_KEYS);
    expect(TYPE_FILTER.options.map((o) => o.value)).toEqual(['all', ...CREW_SOURCE_KEYS]);
  });

  it('offers every vessel shown and each of them by code', () => {
    expect(vesselFilterSpec(VESSELS).options.map((o) => o.value)).toEqual(['all', 'DRA', 'HYD']);
    expect(vesselFilterSpec([{ code: null, name: 'Uncoded' }]).options.map((o) => o.value)).toEqual(['all']);
  });

  it('asks for the "No current vessel" group only for a reader with fleet reach, and never for one vessel', () => {
    expect(crewVesselScope('all', VESSELS, true)).toEqual({ vesselIds: ['v-dra', 'v-hyd'], includeUnassigned: true });
    expect(crewVesselScope('all', VESSELS, false)).toEqual({ vesselIds: ['v-dra', 'v-hyd'], includeUnassigned: false });
    expect(crewVesselScope('HYD', VESSELS, true)).toEqual({ vesselIds: ['v-hyd'], includeUnassigned: false });
    // A hand-edited or stale value reads as every vessel shown.
    expect(crewVesselScope('ZZZ', VESSELS, false)).toEqual({ vesselIds: ['v-dra', 'v-hyd'], includeUnassigned: false });
  });

  it('labels item types and exports the person, vessel and window, with "No current vessel"', () => {
    expect(itemTypeLabel('passport')).toBe('Passport');
    expect(itemTypeLabel('crew_qualification')).toBe('Qualification');
    expect(itemTypeLabel('something_new')).toBe('Document');
    const table = buildExportTable(CREW_DOCUMENT_EXPORT_COLUMNS, ROWS.map(toFleetExpiryItem));
    expect(table.headers).toEqual(['Person', 'Vessel', 'Code', 'Document', 'Type', 'Detail', 'Expires', 'Days left', 'Status', 'Warning window (days)', 'Alerts']);
    expect(table.rows[0]).toEqual(['Bosun', 'DRAAK', 'DRA', 'Passport', 'Passport', 'Malta', '2026-12-10', 200, 'Due ≤ window', 270, 'On']);
    expect(table.rows[2].slice(0, 3)).toEqual(['Chef', 'No current vessel', null]);
  });
});

// ─── The page ───────────────────────────────────────────────────────────

describe('Crew documents page', () => {
  it('reads every crew source for the vessels shown, with people who have no current vessel for fleet reach', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(lastItemsCall()).toMatchObject({
      p_vessel_ids: ['v-dra', 'v-hyd'],
      p_sources: [...CREW_SOURCE_KEYS].sort(),
      p_buckets: ['expired', 'expiring_soon', 'expiring'],
      p_include_unassigned: true,
      p_limit: 100,
      p_offset: 0,
    });
    const chef = bodyRows()[2];
    expect(within(chef).getByText('No current vessel')).toBeInTheDocument();
    // A workspace record opens nothing here: plain text, no dead link.
    expect(within(chef).queryByRole('link', { name: /ENG1 medical/ })).toBeNull();
    expect(within(bodyRows()[1]).getByRole('link', { name: /STCW Basic Safety Training of Deckhand/ })).toHaveAttribute('href', '/v/dra/crew/people/p-2/documents');
    expect(screen.getByText('Personal data')).toBeInTheDocument();
  });

  it('reads Type, Status and Vessel from the URL and sends them', async () => {
    state.shown = shownReady();
    answerAll([ROWS[0]]);
    renderReport('/fleet/reports/crew-documents?type=profile_identity_legacy&status=expiring&vessel=HYD');
    await screen.findByRole('table');
    await waitFor(() =>
      expect(lastItemsCall()).toMatchObject({
        p_vessel_ids: ['v-hyd'],
        p_sources: ['profile_identity_legacy'],
        p_buckets: ['expiring'],
        p_include_unassigned: false,
      }),
    );
    expect(screen.getByRole('combobox', { name: 'Document type' })).toHaveTextContent('Passports and visas');
    expect(screen.getByRole('combobox', { name: 'Vessel' })).toHaveTextContent('HYDRA');
    // The summary covers that one vessel.
    expect(callsOf('fleet_expiry_summary').at(-1)).toMatchObject({ p_vessel_ids: ['v-hyd'] });
  });

  it('writes the chosen filters to the URL on Apply and reads again', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport('/fleet/reports/crew-documents?vessels=DRA,HYD');
    await screen.findByRole('table');
    await chooseOption('Document type', 'Medical fitness');
    await chooseOption('Status', 'Expired');
    await chooseOption('Vessel', 'DRAAK');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/crew-documents?vessels=DRA%2CHYD&status=expired&type=medical_fitness&vessel=DRA'));
    await waitFor(() => expect(lastItemsCall()).toMatchObject({ p_sources: ['medical_fitness'], p_buckets: ['expired'], p_vessel_ids: ['v-dra'] }));
  });

  it('the "No current vessel" group: listed for fleet reach, and the tiles say it is not counted', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(lastItemsCall()).toMatchObject({ p_vessel_ids: ['v-dra', 'v-hyd'], p_include_unassigned: true }));
    expect(within(bodyRows()[2]).getByText('No current vessel')).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Expiry summary' });
    expect(await within(summary).findByText(/People with no current vessel are listed below as “No current vessel” but not counted here/)).toBeInTheDocument();
    expect(callsOf('fleet_expiry_summary').at(-1)).toMatchObject({ p_vessel_ids: ['v-dra', 'v-hyd'] });
  });

  it('one vessel never asks for the "No current vessel" group', async () => {
    state.shown = shownReady();
    answerAll(ROWS.slice(0, 2));
    renderReport('/fleet/reports/crew-documents?vessel=DRA');
    await screen.findByRole('table');
    await waitFor(() => expect(lastItemsCall()).toMatchObject({ p_vessel_ids: ['v-dra'], p_include_unassigned: false }));
    expect(screen.queryByText(/People with no current vessel are listed/)).toBeNull();
  });

  it('without fleet reach there is no "No current vessel" group: people with no vessel are never asked for', async () => {
    state.fleetReach = false;
    state.shown = shownReady();
    answerAll(ROWS.slice(0, 2));
    renderReport('/fleet/reports/crew-documents?vessel=none');
    await screen.findByRole('table');
    await waitFor(() => expect(lastItemsCall()).toMatchObject({ p_vessel_ids: ['v-dra', 'v-hyd'], p_include_unassigned: false }));
    expect(callsOf('fleet_expiry_items').every((c) => c.p_include_unassigned === false)).toBe(true);
    expect(screen.queryByText(/People with no current vessel are listed/)).toBeNull();
    expect(await openVesselOptions()).toEqual(['All vessels shown', 'DRAAK', 'HYDRA']);
  });

  it('shows each row’s warning window and the windows of each document type', async () => {
    state.shown = shownReady();
    answerAll();
    state.tables = {
      expiry_window_rules: { data: [{ id: 'r1', company_id: 'co-1', item_type: 'medical', certificate_type_id: null, warn_days: 60, updated_at: '2026-11-01T00:00:00Z' }], error: null },
    };
    renderReport();
    await screen.findByRole('table');
    expect(within(bodyRows()[0]).getByText('270 days')).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByText('90 days')).toBeInTheDocument();
    const windows = await screen.findByRole('list', { name: 'Warning windows' });
    expect(windows).toHaveTextContent('Passports 270 days (default)');
    expect(windows).toHaveTextContent('Medical certificates 60 days');
    expect(windows).not.toHaveTextContent('Medical certificates 60 days (default)');
    expect(windows).toHaveTextContent('Visas 90 days (default)');
  });

  it('counts only crew sources on the tiles', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport();
    const summary = await screen.findByRole('region', { name: 'Expiry summary' });
    await within(summary).findByRole('link', { name: /Due ≤ window/ });
    // Vessel certificates (9 expired) are another report's.
    expect(within(summary).queryByText('9')).toBeNull();
    expect(within(summary).queryByText('Endorsement late')).toBeNull();
    expect(within(summary).queryByText('Endorsement due')).toBeNull();
  });

  it('refuses the personal-data export while the export log is not set up, with the engine’s sentence and no file', async () => {
    state.shown = shownReady();
    answerAll();
    state.answers.log_client_export = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.log_client_export' } };
    const createUrl = vi.fn(() => 'blob:x');
    const original = URL.createObjectURL;
    URL.createObjectURL = createUrl;
    try {
      renderReport();
      await screen.findByRole('table');
      const trigger = await screen.findByRole('button', { name: /Export/ });
      await waitFor(() => expect(trigger).not.toHaveAttribute('aria-disabled'));
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
      await screen.findByRole('menu');
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'CSV' }));
      });
      await waitFor(() => expect(state.toastError).toHaveBeenCalledWith(EXPORT_COPY.logMissingPersonal, { title: 'Export not made' }));
      expect(EXPORT_COPY.logMissingPersonal).toBe('Exports that contain personal data are unavailable until the export log is set up');
      expect(callsOf('log_client_export')[0]).toMatchObject({ p_source_key: 'reports.crew-documents', p_contains_personal_data: true, p_row_count: 3 });
      expect(createUrl).not.toHaveBeenCalled();
      expect(state.toastSuccess).not.toHaveBeenCalled();
    } finally {
      URL.createObjectURL = original;
    }
  });

  it('folds into one card per document below 768 px, with the person, type and vessel', async () => {
    state.wide = false;
    state.shown = shownReady();
    answerAll();
    renderReport();
    const list = await screen.findByRole('list', { name: 'Crew documents' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText('Bosun')).toBeInTheDocument();
    expect(within(cards[0]).getAllByText('Passport').length).toBeGreaterThan(0);
    expect(within(cards[2]).getByText('No current vessel')).toBeInTheDocument();
  });
});
