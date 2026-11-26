/**
 * Fleet › Documents (src/modules/documents/pages/FleetDocumentsPage.tsx,
 * lib/fleetDocumentLibrary.ts; gap/02 FD1, FD2, FD4, FD5, FD10; D-01,
 * D-04, D-88):
 *
 * - gate `fleet.operations.fleet_documents.view`: nothing is read while it
 *   loads (skeleton) and a reader without it gets AccessDenied;
 * - D-01: a missing library table is "Fleet documents are not set up yet"
 *   with a link to the controlled register; any other error is PageError
 *   with Retry, never sample rows;
 * - the library: section rail with counts and "n not uploaded", the table's
 *   columns (title, type, version, date, vessels "All n" / "k of n",
 *   acknowledged as an explained dash, status), the status chips (current
 *   by default), the section, vessel and search filters from the URL, the
 *   types with nothing published (FD5);
 * - one freshness stamp; "Controlled register" always; "Library settings"
 *   only for editors, opening `?settings=1`;
 * - while the acknowledgement RPCs are missing, the Acknowledged column is
 *   an explained dash and the Acknowledgements tab says it is not set up
 *   yet (the tab itself: AcknowledgementsTab.test.tsx);
 * - below 768 px the table folds into cards.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  tables: {} as Record<string, Answer>,
  reads: [] as string[],
  wide: true,
  rail: true,
  shown: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    state.reads.push(table);
    const result = () => state.tables[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'in']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  // The acknowledgement RPCs (X5-05B) are not in this database: "not set up yet" (D-01); AcknowledgementsTab.test.tsx covers them.
  return { supabase: { from, rpc: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })) } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/modules/auth/contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/contexts/AuthContext')>()),
  useAuth: () => ({ profile: { company_id: 'co-1' }, user: { id: 'u-1' } }),
}));
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: (px: number) => (px >= 1024 ? state.rail : state.wide),
}));
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => state.shown,
}));

import FleetDocumentsPage from '@/modules/documents/pages/FleetDocumentsPage';
import {
  buildFleetDocumentLibrary,
  filterLibraryRows,
  formatDateOnly,
  formatUpdatedUtc,
  statusCounts,
  vesselForCode,
  vesselsLabel,
} from '@/modules/documents/lib/fleetDocumentLibrary';
import { fleetDocumentKeys } from '@/modules/documents/hooks/keys';

const VESSELS = [
  { id: 'v-dra', name: 'M/Y DRAAK', code: 'DRA', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
  { id: 'v-hyd', name: 'HYDRA', code: 'HYD', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
  { id: 'v-gam', name: 'GAME CHANGER', code: 'GAM', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
  { id: 'v-xip', name: 'XIPHIAS', code: 'XIP', counted: false, flagState: null, classificationSociety: null, fleetGroupId: null },
];

const shownReady = () => ({
  status: 'ready',
  companyId: 'co-1',
  vessels: VESSELS,
  shownIds: VESSELS.filter((v) => v.counted).map((v) => v.id),
  shownVessels: VESSELS.filter((v) => v.counted),
  countedIds: VESSELS.filter((v) => v.counted).map((v) => v.id),
  isDefault: true,
  source: 'default',
  droppedCodes: [],
  fleetGroups: [],
  scope: { companyId: 'co-1', vesselIds: VESSELS.filter((v) => v.counted).map((v) => v.id) },
  setShown: vi.fn(),
  showAll: vi.fn(),
});

const stamp = '2026-11-20T10:00:00Z';
const SECTIONS = [
  { id: 's-ops', company_id: 'co-1', name: 'Operations', sort_order: 2, updated_at: stamp },
  { id: 's-safety', company_id: 'co-1', name: 'Safety management', sort_order: 1, updated_at: stamp },
];
const type = (id: string, section: string, name: string, hide = false) => ({
  id,
  company_id: 'co-1',
  section_id: section,
  name,
  sort_order: 1,
  ack_required_default: true,
  ack_due_days_default: 14,
  version_kind_default: 'major',
  hide_when_empty: hide,
  updated_at: stamp,
});
const TYPES = [
  type('t-manual', 's-safety', 'Safety manual'),
  { ...type('t-policy', 's-safety', 'Policies', true), sort_order: 2 },
  type('t-proc', 's-ops', 'Procedures'),
  { ...type('t-check', 's-ops', 'Checklists'), sort_order: 2 },
];
const doc = (id: string, typeId: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  company_id: 'co-1',
  type_id: typeId,
  title,
  description: null,
  status,
  target_mode: 'selected',
  ack_required: true,
  ack_due_days: 14,
  current_version_id: null,
  published_at: null,
  withdrawn_at: null,
  withdrawn_reason: null,
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});
const DOCUMENTS = [
  doc('d-sms', 't-manual', 'Safety Management Manual', 'published', { target_mode: 'all_including_future', current_version_id: 'ver-sms-2', published_at: stamp }),
  doc('d-bunker', 't-proc', 'Bunkering procedure', 'published', { current_version_id: 'ver-bunker-1', published_at: stamp }),
  doc('d-moor', 't-proc', 'Mooring procedure', 'draft'),
  doc('d-old', 't-manual', 'Old manual', 'withdrawn', { current_version_id: 'ver-old-1', published_at: stamp, withdrawn_at: stamp, withdrawn_reason: 'Replaced by the new manual' }),
];
const version = (id: string, documentId: string, no: number, label: string, state: string, date: string) => ({
  id,
  document_id: documentId,
  version_no: no,
  version_label: label,
  version_kind: 'major',
  effective_date: date,
  state,
  file_name: `${label}.pdf`,
  published_at: state === 'draft' ? null : stamp,
});
const VERSIONS = [
  version('ver-sms-2', 'd-sms', 2, 'Rev 2', 'published', '2026-11-02'),
  version('ver-sms-3', 'd-sms', 3, 'Rev 3', 'draft', '2026-11-25'),
  version('ver-bunker-1', 'd-bunker', 1, 'v1', 'published', '2026-10-15'),
  version('ver-moor-1', 'd-moor', 1, 'v1', 'draft', '2026-11-20'),
  version('ver-old-1', 'd-old', 1, 'v1', 'published', '2025-01-01'),
];
const TARGETS = [
  { document_id: 'd-bunker', vessel_id: 'v-dra' },
  { document_id: 'd-bunker', vessel_id: 'v-hyd' },
];

function ready() {
  state.tables = {
    fleet_document_sections: { data: SECTIONS, error: null },
    fleet_document_types: { data: TYPES, error: null },
    fleet_documents: { data: DOCUMENTS, error: null },
    fleet_document_versions: { data: VERSIONS, error: null },
    fleet_document_vessel_targets: { data: TARGETS, error: null },
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(path = '/fleet/documents') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <FleetDocumentsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const table = () => screen.getByRole('table', { name: 'Fleet documents' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);
const titles = () => bodyRows().map((r) => within(r).getAllByRole('cell')[0]?.querySelector('p')?.textContent);

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.tables = {};
  state.reads = [];
  state.wide = true;
  state.rail = true;
  state.shown = shownReady();
});
state.shown = shownReady();

describe('the library model', () => {
  const library = () =>
    buildFleetDocumentLibrary({ sections: [...SECTIONS].sort((a, b) => a.sort_order - b.sort_order), types: TYPES, documents: DOCUMENTS, versions: VERSIONS, targets: TARGETS, vessels: VESSELS } as never);

  it('labels the vessels a document reaches: all counted (also future ones) or k of n', () => {
    expect(vesselsLabel('all_including_future', 0, 3)).toBe('All 3');
    expect(vesselsLabel('selected', 2, 3)).toBe('2 of 3');
    expect(vesselsLabel('selected', 0, 3)).toBe('None yet');
    expect(vesselsLabel('selected', 4, 3)).toBe('4 vessels');
    const rows = library().rows;
    expect(rows.find((r) => r.id === 'd-sms')).toMatchObject({ vesselsLabel: 'All 3', vesselCount: 3, current: { label: 'Rev 2' }, draft: { label: 'Rev 3' } });
    expect(rows.find((r) => r.id === 'd-bunker')).toMatchObject({ vesselsLabel: '2 of 3', targetVesselIds: ['v-dra', 'v-hyd'], sectionName: 'Operations' });
    expect(rows.find((r) => r.id === 'd-moor')).toMatchObject({ current: null, draft: { label: 'v1' }, vesselsLabel: 'None yet' });
  });

  it('counts current documents per section and lists the types with nothing published (FD5)', () => {
    const lib = library();
    expect(lib.sections.map((s) => [s.name, s.documentCount, s.totalCount, s.notUploaded.map((t) => t.name)])).toEqual([
      ['Safety management', 1, 2, ['Policies']],
      ['Operations', 2, 2, ['Checklists']],
    ]);
    expect(lib.notUploaded.map((t) => [t.name, t.hideWhenEmpty])).toEqual([
      ['Policies', true],
      ['Checklists', false],
    ]);
    expect(lib.countedVesselCount).toBe(3);
  });

  it('filters by section, vessel (all-vessels documents reach counted vessels only), search and status', () => {
    const { rows } = library();
    const base = { sectionId: null, vessel: null, search: '', status: 'current' as const };
    expect(filterLibraryRows(rows, base).map((r) => r.id)).toEqual(['d-bunker', 'd-moor', 'd-sms']);
    expect(filterLibraryRows(rows, { ...base, sectionId: 's-ops' }).map((r) => r.id)).toEqual(['d-bunker', 'd-moor']);
    expect(filterLibraryRows(rows, { ...base, vessel: VESSELS[2] }).map((r) => r.id)).toEqual(['d-sms']);
    expect(filterLibraryRows(rows, { ...base, vessel: VESSELS[0] }).map((r) => r.id)).toEqual(['d-bunker', 'd-sms']);
    expect(filterLibraryRows(rows, { ...base, vessel: VESSELS[3] })).toEqual([]);
    expect(filterLibraryRows(rows, { ...base, search: '  BUNKER ' }).map((r) => r.id)).toEqual(['d-bunker']);
    expect(filterLibraryRows(rows, { ...base, search: 'rev 3' }).map((r) => r.id)).toEqual(['d-sms']);
    expect(filterLibraryRows(rows, { ...base, status: 'withdrawn' }).map((r) => r.id)).toEqual(['d-old']);
    expect(statusCounts(rows, { sectionId: null, vessel: null, search: '' })).toEqual({ current: 3, published: 2, draft: 1, withdrawn: 1, all: 4 });
    expect(vesselForCode(VESSELS, 'hyd')?.id).toBe('v-hyd');
    expect(vesselForCode(VESSELS, 'nope')).toBeNull();
  });

  it('formats a date-only string without a time-zone shift, and the UTC stamp (D-88)', () => {
    expect(formatDateOnly('2026-11-02')).toBe('02 Nov 2026');
    expect(formatDateOnly('')).toBeNull();
    expect(formatDateOnly('2026-02-30')).toBeNull();
    expect(formatUpdatedUtc(Date.UTC(2026, 10, 26, 14, 5))).toBe('Updated 26 Nov 2026, 14:05 UTC');
  });

  it('keys carry the company', () => {
    expect(fleetDocumentKeys.library('co-1')).toEqual(['fleet-documents', 'company', 'co-1', 'library']);
    expect(fleetDocumentKeys.taxonomy(null)).toEqual(['fleet-documents', 'company', 'none', 'taxonomy']);
    expect(fleetDocumentKeys.libraryView('co-1', { sectionId: 's', vesselId: null, search: ' A ', status: null })).toEqual([
      'fleet-documents', 'company', 'co-1', 'library', 'view', { sectionId: 's', vesselId: null, search: 'a', status: null },
    ]);
  });
});

describe('Fleet documents page', () => {
  it('reads nothing while the access loads, and denies a reader without it', async () => {
    ready();
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    renderPage();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.getByText('Loading fleet documents')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fleet documents' })).toBeNull();
    expect(state.reads).toEqual([]);
    cleanup();
    state.decide = () => ({ allowed: false, status: 'denied', reason: '' });
    renderPage();
    expect(await screen.findByText(/needs access to fleet documents/)).toBeInTheDocument();
    expect(state.reads).toEqual([]);
  });

  it('says the library is not set up yet while its tables are missing, with a link to the register (D-01)', async () => {
    ready();
    state.tables.fleet_document_sections = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.fleet_document_sections' in the schema cache" } };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Fleet documents are not set up yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the controlled register' })).toHaveAttribute('href', '/fleet/documents/register');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: /Library settings/ })).toBeNull();
  });

  it('shows a real error with Retry, never sample rows', async () => {
    ready();
    state.tables.fleet_documents = { data: null, error: { code: '42501', message: 'permission denied for table fleet_documents' } };
    renderPage();
    expect(await screen.findByText('The fleet documents could not load')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    const before = state.reads.length;
    state.tables.fleet_documents = { data: DOCUMENTS, error: null };
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(state.reads.length).toBeGreaterThan(before));
    expect(await screen.findByRole('table', { name: 'Fleet documents' })).toBeInTheDocument();
  });

  it('lists the current documents with type, version, date, vessels, an explained acknowledged dash and status', async () => {
    ready();
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    expect(titles()).toEqual(['Bunkering procedure', 'Mooring procedure', 'Safety Management Manual']);
    const sms = bodyRows()[2];
    const cells = within(sms).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[1]).toBe('Safety manual');
    expect(cells[2]).toBe('Rev 2');
    expect(cells[3]).toBe('02 Nov 2026');
    expect(cells[4]).toContain('All 3');
    expect(within(sms).getByTitle('Every counted vessel, also ones added later')).toBeInTheDocument();
    expect(within(sms).getByText('Rev 3 in draft')).toBeInTheDocument();
    expect(within(sms).getByTitle('Acknowledgements are not set up yet')).toBeInTheDocument();
    expect(within(sms).getByText('Published')).toBeInTheDocument();
    const bunker = within(bodyRows()[0]).getAllByRole('cell').map((c) => c.textContent);
    expect(bunker[4]).toContain('2 of 3');
    const moor = within(bodyRows()[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(moor[2]).toBe('v1 (draft)');
    expect(within(bodyRows()[1]).getByText('Draft')).toBeInTheDocument();
    expect(screen.getByTestId('documents-updated')).toHaveTextContent(/^Updated \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC$/);
  });

  it('shows the sections with counts and what is not uploaded; a section narrows the list', async () => {
    ready();
    renderPage();
    const rail = await screen.findByRole('navigation', { name: 'Sections' });
    const buttons = within(rail).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['All sections2 not uploaded3', 'Safety management1 not uploaded1', 'Operations1 not uploaded2']);
    const notUploaded = screen.getByRole('region', { name: /Not uploaded/ });
    expect(within(notUploaded).getByText('Policies')).toBeInTheDocument();
    expect(within(notUploaded).getByText(/hidden on vessels/)).toBeInTheDocument();
    expect(within(notUploaded).getByText('Checklists')).toBeInTheDocument();
    fireEvent.click(within(rail).getByRole('button', { name: /^Operations/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/fleet/documents?section=s-ops'));
    expect(titles()).toEqual(['Bunkering procedure', 'Mooring procedure']);
    expect(within(rail).getByRole('button', { name: /^Operations/ })).toHaveAttribute('aria-current', 'true');
    expect(within(screen.getByRole('region', { name: /Not uploaded/ })).queryByText('Policies')).toBeNull();
  });

  it('reads the vessel from ?vessel= (a code): all-vessels documents and those targeted at it', async () => {
    ready();
    renderPage('/fleet/documents?vessel=gam');
    await screen.findByRole('table', { name: 'Fleet documents' });
    expect(titles()).toEqual(['Safety Management Manual']);
    cleanup();
    renderPage('/fleet/documents?vessel=dra');
    await screen.findByRole('table', { name: 'Fleet documents' });
    expect(titles()).toEqual(['Bunkering procedure', 'Safety Management Manual']);
  });

  it('the status chips count and filter; withdrawn documents are history, not current', async () => {
    ready();
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    const chips = screen.getByRole('group', { name: 'Filter by status' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['Current3', 'Published2', 'Drafts1', 'Withdrawn1', 'All4']);
    expect(within(chips).getByRole('button', { name: /Current/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(chips).getByRole('button', { name: /Withdrawn/ }));
    expect(titles()).toEqual(['Old manual']);
    expect(screen.getByText('Replaced by the new manual')).toBeInTheDocument();
  });

  it('searches titles, types and versions', async () => {
    ready();
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search documents' }), { target: { value: 'mooring' } });
    expect(titles()).toEqual(['Mooring procedure']);
  });

  it('links the controlled register; Library settings only for editors, opening ?settings=1', async () => {
    ready();
    state.decide = (key) => ({ allowed: key !== 'fleet.operations.fleet_documents.edit', status: key === 'fleet.operations.fleet_documents.edit' ? 'denied' : 'granted', reason: '' });
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    expect(screen.getByRole('link', { name: /Controlled register/ })).toHaveAttribute('href', '/fleet/documents/register');
    expect(screen.queryByRole('button', { name: /Library settings/ })).toBeNull();
    cleanup();
    state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    fireEvent.click(screen.getByRole('button', { name: /Library settings/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/fleet/documents?settings=1'));
    expect(await screen.findByRole('dialog', { name: 'Library settings' })).toBeInTheDocument();
  });

  it('the Acknowledgements tab says it is not set up yet', async () => {
    ready();
    renderPage('/fleet/documents?tab=acknowledgements');
    expect(await screen.findByRole('heading', { name: 'Acknowledgements are not set up yet' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Acknowledgements' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/fleet\/documents$/));
  });

  it('a company with no sections yet: editors are sent to Library settings', async () => {
    ready();
    state.tables.fleet_document_sections = { data: [], error: null };
    state.tables.fleet_document_types = { data: [], error: null };
    state.tables.fleet_documents = { data: [], error: null };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No sections yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open library settings' })).toBeInTheDocument();
  });

  it('below 768 px the table folds into cards (section picker instead of the rail)', async () => {
    ready();
    state.wide = false;
    state.rail = false;
    renderPage();
    const list = await screen.findByRole('list', { name: 'Fleet documents' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Section' })).toBeInTheDocument();
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(within(cards[2]).getByText('Safety Management Manual')).toBeInTheDocument();
    expect(within(cards[2]).getByText('Safety manual · Safety management')).toBeInTheDocument();
    expect(within(cards[2]).getByText('Rev 2')).toBeInTheDocument();
    expect(within(cards[0]).getByText(/2 of 3/)).toBeInTheDocument();
  });
});

describe('publishing from the library (X5-04B)', () => {
  const readerOnly = (key: string) => ({
    allowed: key !== 'fleet.operations.fleet_documents.edit',
    status: key === 'fleet.operations.fleet_documents.edit' ? 'denied' : 'granted',
    reason: '',
  });
  async function openMenu(title: string): Promise<HTMLElement> {
    const trigger = await screen.findByRole('button', { name: `Actions for ${title}` });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    return screen.findByRole('menu');
  }
  const items = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((i) => i.textContent);

  beforeAll(() => {
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
  });

  it('editors publish from the header and from a type with nothing published; readers do not', async () => {
    ready();
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish document' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish a document' });
    expect(within(dialog).getByLabelText('Document type')).toHaveValue('');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Publish a document' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Publish a document of type Checklists' }));
    expect(within(await screen.findByRole('dialog', { name: 'Publish a document' })).getByLabelText('Document type')).toHaveValue('t-check');
    cleanup();
    ready();
    state.decide = readerOnly;
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    expect(screen.queryByRole('button', { name: 'Publish document' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Publish a document of type/ })).toBeNull();
  });

  it('each row’s menu offers what its state allows; readers only see the history', async () => {
    ready();
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    expect(items(await openMenu('Mooring procedure'))).toEqual(['Version history', 'Finish publishing', 'Delete draft']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(items(await openMenu('Safety Management Manual'))).toEqual(['Version history', 'Finish Rev 3', 'Withdraw']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(items(await openMenu('Bunkering procedure'))).toEqual(['Version history', 'Upload a new version', 'Withdraw']);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Withdraw' }));
    expect(await screen.findByRole('dialog', { name: 'Withdraw Bunkering procedure' })).toBeInTheDocument();
    cleanup();
    ready();
    state.decide = readerOnly;
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    expect(items(await openMenu('Bunkering procedure'))).toEqual(['Version history']);
  });

  it('clicking a row opens its version history', async () => {
    ready();
    renderPage();
    await screen.findByRole('table', { name: 'Fleet documents' });
    fireEvent.click(within(bodyRows()[0]).getAllByRole('cell')[1]);
    const drawer = await screen.findByRole('dialog', { name: 'Bunkering procedure' });
    expect(within(drawer).getByText('Version history')).toBeInTheDocument();
    expect(state.reads).toContain('fleet_documents');
  });

  it('below 768 px each card opens its history and has the same menu', async () => {
    ready();
    state.wide = false;
    state.rail = false;
    renderPage();
    const list = await screen.findByRole('list', { name: 'Fleet documents' });
    expect(within(list).getByRole('button', { name: 'Actions for Mooring procedure' })).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: 'Version history of Mooring procedure' }));
    expect(await screen.findByRole('dialog', { name: 'Mooring procedure' })).toBeInTheDocument();
  });
});
