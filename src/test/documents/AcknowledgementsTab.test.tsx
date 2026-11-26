/**
 * Fleet › Documents › Acknowledgements (`/fleet/documents?tab=acknowledgements`;
 * components/AcknowledgementsTab.tsx, the library's Acknowledged column,
 * lib/ackAdmin.ts counts; gap/02 FD6, FD7; D-01, D-04, D-249; X5-05B):
 *
 * - deny while loading: nothing (library or acknowledgements) is read while
 *   the page's capability loads, and a denied reader reads nothing;
 * - D-01: the summary RPC missing is "Acknowledgements are not set up yet";
 *   any other error is an error with Retry; a count the client does not
 *   know is an error, never a guess;
 * - the counts: fleet totals, the documents most overdue first with "n of m
 *   acknowledged", the chosen document's vessels (acknowledged, still to
 *   acknowledge by kind, can sign now), a targeted vessel without crew
 *   rows says so; `?doc=` picks a document and choosing one writes it;
 * - expand: a vessel row opens into its people from one status read for the
 *   document (not one per vessel): state, due date, the blocked reason
 *   inline, how an acknowledgement was recorded, Remind per person;
 * - Remind: editors only; all outstanding sends no vessel and no person;
 * - the library's Acknowledged column: "n of m" with the overdue count and
 *   a link to the tab; an explained dash for drafts and documents without
 *   acknowledgement.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string; details?: string | null } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  tables: {} as Record<string, Answer>,
  rpcs: {} as Record<string, Answer>,
  reads: [] as string[],
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  wide: true,
  rail: true,
  shown: null as unknown,
  notify: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    state.reads.push(table);
    const result = () => state.tables[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'in', 'gte', 'limit']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    state.calls.push({ fn, args });
    return Promise.resolve(state.rpcs[fn] ?? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
  };
  return { supabase: { from, rpc } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/modules/auth/contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/contexts/AuthContext')>()),
  useAuth: () => ({ profile: { id: 'p-manager', company_id: 'co-1' }, user: { id: 'u-1' } }),
}));
vi.mock('@/shared/components/data/useMinWidth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/components/data/useMinWidth')>()),
  useMinWidth: (px: number) => (px >= 1024 ? state.rail : state.wide),
}));
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => state.shown,
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/notify')>()),
  notify: state.notify,
}));

import FleetDocumentsPage from '@/modules/documents/pages/FleetDocumentsPage';
import {
  acknowledgedLabel,
  compareByNeed,
  countsFromRows,
  countsFromSummary,
  countsSentence,
  perPersonCells,
  summariseByDocument,
} from '@/modules/documents/lib/ackAdmin';
import { fleetDocumentAckKeys } from '@/modules/documents/hooks/useFleetDocumentAcks';

const VESSELS = [
  { id: 'v-dra', name: 'DRAAK', code: 'DRA', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
  { id: 'v-gam', name: 'GAME CHANGER', code: 'GAM', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
  { id: 'v-hyd', name: 'HYDRA', code: 'HYD', counted: true, flagState: null, classificationSociety: null, fleetGroupId: null },
];
const shownReady = () => ({
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
});

const stamp = '2026-11-20T10:00:00Z';
const SECTIONS = [{ id: 's-safety', company_id: 'co-1', name: 'Safety management', sort_order: 1, updated_at: stamp }];
const TYPES = [
  { id: 't-proc', company_id: 'co-1', section_id: 's-safety', name: 'Procedures', sort_order: 1, ack_required_default: true, ack_due_days_default: 14, version_kind_default: 'major', hide_when_empty: false, updated_at: stamp },
];
const doc = (id: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  company_id: 'co-1',
  type_id: 't-proc',
  title,
  description: null,
  status,
  target_mode: 'selected',
  ack_required: true,
  ack_due_days: 14,
  current_version_id: null,
  published_at: stamp,
  withdrawn_at: null,
  withdrawn_reason: null,
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});
const DOCUMENTS = [
  doc('d-fire', 'Fire response', 'published', { current_version_id: 'ver-fire' }),
  doc('d-sms', 'Safety manual', 'published', { target_mode: 'all_including_future', current_version_id: 'ver-sms' }),
  doc('d-garbage', 'Garbage plan', 'published', { target_mode: 'all_including_future', current_version_id: 'ver-garbage', ack_required: false }),
  doc('d-draft', 'Mooring draft', 'draft'),
];
const version = (id: string, documentId: string, label: string, state = 'published') => ({
  id,
  document_id: documentId,
  version_no: 1,
  version_label: label,
  version_kind: 'major',
  effective_date: '2026-11-01',
  state,
  file_name: `${label}.pdf`,
  published_at: stamp,
});
const VERSIONS = [
  version('ver-fire', 'd-fire', 'v3'),
  version('ver-sms', 'd-sms', 'Rev 4'),
  version('ver-garbage', 'd-garbage', 'Issue 1'),
  version('ver-draft', 'd-draft', 'v1', 'draft'),
];
// Fire response targets DRAAK, GAME CHANGER and HYDRA; HYDRA has nobody on its crew list (no summary row).
const TARGETS = [
  { document_id: 'd-fire', vessel_id: 'v-dra' },
  { document_id: 'd-fire', vessel_id: 'v-gam' },
  { document_id: 'd-fire', vessel_id: 'v-hyd' },
];
const sum = (documentId: string, versionId: string, vesselId: string, a: number, p: number, o: number, b: number) => ({
  document_id: documentId,
  version_id: versionId,
  vessel_id: vesselId,
  acknowledged: a,
  pending: p,
  overdue: o,
  blocked: b,
  can_sign: p + o,
});
const SUMMARY = [
  sum('d-fire', 'ver-fire', 'v-dra', 2, 1, 2, 1),
  sum('d-fire', 'ver-fire', 'v-gam', 1, 0, 1, 0),
  sum('d-sms', 'ver-sms', 'v-dra', 6, 0, 0, 0),
  sum('d-sms', 'ver-sms', 'v-gam', 3, 1, 0, 0),
];
const person = (profileId: string, name: string, vesselId: string, s: string, extra: Record<string, unknown> = {}) => ({
  document_id: 'd-fire',
  version_id: 'ver-fire',
  vessel_id: vesselId,
  profile_id: profileId,
  person_name: name,
  position: 'Deckhand',
  department: 'Deck',
  has_login: true,
  on_crew: true,
  is_planned: false,
  join_date: '2026-01-01',
  state: s,
  due_at: '2026-11-19T10:00:00Z',
  blocked_reason: null,
  acknowledged_at: null,
  method: null,
  ...extra,
});
const STATUS = [
  person('p-bosun', 'Demo Bosun', 'v-dra', 'overdue'),
  person('p-junior', 'Demo Junior Deckhand', 'v-dra', 'blocked', { has_login: false, blocked_reason: 'no_login' }),
  person('p-co', 'Demo Chief Officer', 'v-dra', 'acknowledged', { acknowledged_at: '2026-11-03T10:00:00Z', method: 'witnessed' }),
  person('p-manager', 'Demo Fleet Manager', 'v-dra', 'pending'),
  person('p-gam', 'Demo Master', 'v-gam', 'overdue'),
  // History (left the vessel): never listed as crew.
  person('p-left', 'Demo Former Deckhand', 'v-dra', 'not_required', { on_crew: false }),
  // Another document's row the mock answers too: dropped (not asked for).
  { ...person('p-x', 'Demo Stew', 'v-dra', 'pending'), document_id: 'd-sms', version_id: 'ver-sms' },
];

function ready() {
  state.tables = {
    fleet_document_sections: { data: SECTIONS, error: null },
    fleet_document_types: { data: TYPES, error: null },
    fleet_documents: { data: DOCUMENTS, error: null },
    fleet_document_versions: { data: VERSIONS, error: null },
    fleet_document_vessel_targets: { data: TARGETS, error: null },
  };
  state.rpcs = {
    fleet_document_summary: { data: SUMMARY, error: null },
    fleet_document_ack_status: { data: STATUS, error: null },
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(path = '/fleet/documents?tab=acknowledgements') {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <FleetDocumentsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const callsOf = (fn: string) => state.calls.filter((c) => c.fn === fn);

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
beforeEach(() => {
  state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
  state.reads = [];
  state.calls = [];
  state.wide = true;
  state.rail = true;
  state.shown = shownReady();
  for (const fn of Object.values(state.notify)) fn.mockReset();
  ready();
});
afterEach(() => cleanup());

describe('counts (lib/ackAdmin.ts)', () => {
  it('reads summary rows as counts; can sign is pending plus overdue; history is not counted', () => {
    expect(countsFromSummary(SUMMARY[0])).toEqual({ acknowledged: 2, pending: 1, overdue: 2, blocked: 1, canSign: 3, total: 6 });
    expect(countsFromSummary({ acknowledged: -1, pending: Number.NaN, overdue: 2.7, blocked: 0, can_sign: 2 })).toEqual({
      acknowledged: 0,
      pending: 0,
      overdue: 2,
      blocked: 0,
      canSign: 2,
      total: 2,
    });
    expect(countsFromRows(STATUS.filter((r) => r.document_id === 'd-fire') as never)).toEqual({ acknowledged: 1, pending: 1, overdue: 2, blocked: 1, canSign: 3, total: 5 });
    expect(acknowledgedLabel(countsFromSummary(SUMMARY[0]))).toBe('2 of 6 acknowledged');
    expect(countsSentence(countsFromSummary(SUMMARY[0]))).toBe('2 acknowledged, 1 to acknowledge, 2 overdue, 1 unable to acknowledge');
    expect(countsSentence(countsFromRows([]))).toBe('Nobody to acknowledge');
  });

  it('sums a document over its vessels, never mixing versions', () => {
    const byDoc = summariseByDocument(SUMMARY as never, new Map([['d-fire', 'ver-fire'], ['d-sms', 'ver-sms']]));
    expect(byDoc.get('d-fire')?.counts).toEqual({ acknowledged: 3, pending: 1, overdue: 3, blocked: 1, canSign: 4, total: 8 });
    expect(byDoc.get('d-fire')?.vessels.map((v) => v.vesselId)).toEqual(['v-dra', 'v-gam']);
    // A newer version published since the summary was read: its old counts are not shown as the new one's.
    expect(summariseByDocument(SUMMARY as never, new Map([['d-fire', 'ver-fire-2']])).get('d-fire')).toBeUndefined();
    const mixed = summariseByDocument([sum('d-x', 'v1', 'v-dra', 1, 0, 0, 0), sum('d-x', 'v2', 'v-gam', 5, 0, 0, 0)] as never);
    expect(mixed.get('d-x')?.counts.total).toBe(1);
  });

  it('orders by need and draws one bar cell per person up to 40', () => {
    const a = { name: 'A', counts: countsFromSummary(sum('a', 'v', 'x', 1, 5, 0, 0)) };
    const b = { name: 'B', counts: countsFromSummary(sum('b', 'v', 'x', 1, 0, 1, 0)) };
    const c = { name: 'C', counts: countsFromSummary(sum('c', 'v', 'x', 1, 0, 1, 2)) };
    expect([a, b, c].sort(compareByNeed).map((x) => x.name)).toEqual(['C', 'B', 'A']);
    expect(perPersonCells(countsFromSummary(SUMMARY[0]))).toEqual(['acknowledged', 'acknowledged', 'pending', 'overdue', 'overdue', 'blocked']);
    expect(perPersonCells(countsFromSummary(sum('d', 'v', 'x', 41, 0, 0, 0)))).toBeNull();
    expect(perPersonCells(countsFromRows([]))).toBeNull();
  });

  it('keys carry the company and the scope', () => {
    expect(fleetDocumentAckKeys.summary('co-1', null)).toEqual(['fleet-documents', 'company', 'co-1', 'acks', 'summary', 'all']);
    expect(fleetDocumentAckKeys.status('co-1', 'd-fire', ['v-gam', 'v-dra'])).toEqual(['fleet-documents', 'company', 'co-1', 'acks', 'status', 'd-fire', 'v-dra,v-gam']);
    expect(fleetDocumentAckKeys.signerRules('co-1', 'v-dra')).toEqual(['fleet-documents', 'company', 'co-1', 'acks', 'signer-rules', 'v-dra']);
  });
});

describe('the gate and the states', () => {
  it('reads nothing while the access loads, and nothing when denied', async () => {
    state.decide = () => ({ allowed: false, status: 'loading', reason: '' });
    renderPage();
    expect(screen.getByText('Loading fleet documents')).toBeInTheDocument();
    expect(state.reads).toEqual([]);
    expect(state.calls).toEqual([]);
    cleanup();
    state.decide = () => ({ allowed: false, status: 'denied', reason: '' });
    renderPage();
    expect(await screen.findByText(/needs access to fleet documents/)).toBeInTheDocument();
    expect(state.reads).toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it('says acknowledgements are not set up yet while the RPC is missing (D-01)', async () => {
    state.rpcs = {};
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Acknowledgements are not set up yet' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Vessels' })).toBeNull();
  });

  it('shows any other error with Retry, never zeros', async () => {
    state.rpcs.fleet_document_summary = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    renderPage();
    expect(await screen.findByText('The acknowledgements could not load')).toBeInTheDocument();
    expect(screen.queryByText('Acknowledged')).toBeNull();
    const before = callsOf('fleet_document_summary').length;
    state.rpcs.fleet_document_summary = { data: SUMMARY, error: null };
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(callsOf('fleet_document_summary').length).toBeGreaterThan(before));
    expect(await screen.findByRole('table', { name: 'Vessels' })).toBeInTheDocument();
  });

  it('a count it does not know is an error, never a guess', async () => {
    state.rpcs.fleet_document_summary = { data: [{ ...SUMMARY[0], overdue: 'many' }], error: null };
    renderPage();
    expect(await screen.findByText('The acknowledgements could not load')).toBeInTheDocument();
  });

  it('nothing to acknowledge yet: an empty state, not zeros', async () => {
    state.tables.fleet_documents = { data: [DOCUMENTS[2], DOCUMENTS[3]], error: null };
    state.rpcs.fleet_document_summary = { data: [], error: null };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Nothing to acknowledge yet' })).toBeInTheDocument();
  });
});

describe('the tab', () => {
  it('reads the counts once for the whole fleet and shows the totals', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Vessels' });
    expect(callsOf('fleet_document_summary')).toEqual([{ fn: 'fleet_document_summary', args: { p_vessel_ids: null } }]);
    const tile = (label: string) => screen.getByText(label, { selector: 'p, span, div' }).closest('div[class*="rounded"]') as HTMLElement;
    expect(within(tile('Overdue')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Unable to acknowledge')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('of 18 across 2 documents')).toBeInTheDocument();
  });

  it('lists the documents that need an acknowledgement, most overdue first, and picks the first', async () => {
    renderPage();
    const rail = await screen.findByRole('navigation', { name: 'Documents to acknowledge' });
    const items = within(rail).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual([expect.stringMatching(/^Fire response.*3 of 8 acknowledged3 overdue$/), expect.stringMatching(/^Safety manual.*9 of 10 acknowledged$/)]);
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    // The document without an acknowledgement and the draft are not listed.
    expect(within(rail).queryByText('Garbage plan')).toBeNull();
    expect(within(rail).queryByText('Mooring draft')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Fire response' })).toBeInTheDocument();
  });

  it('per vessel: acknowledged, still to acknowledge by kind, can sign now; a targeted vessel without crew says so', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Vessels' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/DRAAK.*DRA2 of 62 overdue · 1 unable · 1 to acknowledge3Remind$/),
      expect.stringMatching(/GAME CHANGER.*GAM1 of 21 overdue1Remind$/),
      expect.stringMatching(/HYDRA.*HYD–Nobody on the crew list–$/),
    ]);
    expect(within(rows[0]).getByRole('img', { name: '2 acknowledged, 1 to acknowledge, 2 overdue, 1 unable to acknowledge' })).toBeInTheDocument();
  });

  it('?doc= picks the document; choosing another writes it', async () => {
    renderPage('/fleet/documents?tab=acknowledgements&doc=d-sms');
    expect(await screen.findByRole('heading', { name: 'Safety manual' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Documents to acknowledge' })).getByRole('button', { name: /^Fire response/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/fleet/documents?tab=acknowledgements&doc=d-fire'));
    expect(screen.getByRole('heading', { name: 'Fire response' })).toBeInTheDocument();
  });

  it('a vessel row opens into its people from one read for the document, with the blocked reason inline', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Vessels' });
    await waitFor(() => expect(callsOf('fleet_document_ack_status')).toHaveLength(1));
    expect(callsOf('fleet_document_ack_status')[0].args).toEqual({ p_document_id: 'd-fire', p_vessel_ids: null });
    fireEvent.click(screen.getByRole('button', { name: 'Show the people on DRAAK' }));
    const list = await screen.findByRole('list', { name: 'People on DRAAK' });
    const people = within(list).getAllByTestId('ack-person');
    // Overdue first, then unable, then to acknowledge, then acknowledged; history and other documents left out.
    expect(people.map((p) => within(p).getByText(/^Demo /).textContent)).toEqual(['Demo Bosun', 'Demo Junior Deckhand', 'Demo Fleet Manager', 'Demo Chief Officer']);
    expect(within(people[1]).getByText('No app login')).toBeInTheDocument();
    expect(within(people[0]).getByText('since 19 Nov 2026')).toBeInTheDocument();
    expect(within(people[3]).getByText('Recorded on a shared device, with a witness')).toBeInTheDocument();
    // Remind per person: the outstanding with a login, never the caller.
    expect(within(people[0]).getByRole('button', { name: 'Remind Demo Bosun' })).toBeInTheDocument();
    expect(within(people[1]).queryByRole('button', { name: /Remind/ })).toBeNull();
    expect(within(people[2]).queryByRole('button', { name: /Remind/ })).toBeNull();
    // Opening the second vessel reads nothing more.
    fireEvent.click(screen.getByRole('button', { name: 'Show the people on GAME CHANGER' }));
    expect(await screen.findByRole('list', { name: 'People on GAME CHANGER' })).toBeInTheDocument();
    expect(callsOf('fleet_document_ack_status')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Hide the people on DRAAK' }));
    expect(screen.queryByRole('list', { name: 'People on DRAAK' })).toBeNull();
  });

  it('the people read failing is an error with Retry inside the row', async () => {
    state.rpcs.fleet_document_ack_status = { data: null, error: { code: 'XX000', message: 'boom' } };
    renderPage();
    await screen.findByRole('table', { name: 'Vessels' });
    fireEvent.click(screen.getByRole('button', { name: 'Show the people on DRAAK' }));
    expect(await screen.findByText('The people could not load')).toBeInTheDocument();
  });

  it('Remind is for editors only; all outstanding sends no vessel and no person, with the 24-hour rule beside it', async () => {
    state.decide = (key) => ({ allowed: key !== 'fleet.operations.fleet_documents.edit', status: 'granted', reason: '' });
    renderPage();
    await screen.findByRole('table', { name: 'Vessels' });
    expect(screen.queryByRole('button', { name: /Remind/ })).toBeNull();
    cleanup();
    state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
    state.rpcs.fleet_document_remind = { data: { reminder_id: 'r-1', sent: 1, skipped: 1, failed: 0, vessels: 1 }, error: null };
    renderPage();
    await screen.findByRole('table', { name: 'Vessels' });
    expect(screen.getByTestId('ack-remind-rule')).toHaveTextContent('anyone reminded in the last 24 hours is skipped');
    fireEvent.click(screen.getByRole('button', { name: /Remind all outstanding/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Remind about Fire response' });
    // The Bosun and GAME CHANGER's Master; the caller (pending themselves) and the crew member without a login are not counted.
    await waitFor(() => expect(within(dialog).getByTestId('remind-reach')).toHaveTextContent('2 people still to acknowledge with an app login.'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Remind 2 people/ }));
    await waitFor(() => expect(callsOf('fleet_document_remind')).toHaveLength(1));
    expect(callsOf('fleet_document_remind')[0].args).toEqual({ p_document_id: 'd-fire', p_vessel_id: null, p_profile_id: null });
    await waitFor(() => expect(state.notify.success).toHaveBeenCalledWith('1 person reminded', { description: 'It is in their STORM notifications. 1 person skipped: reminded in the last 24 hours.' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('folds the vessels into cards below 768 px', async () => {
    state.wide = false;
    state.rail = false;
    renderPage();
    const cards = await screen.findAllByTestId('ack-vessel-card');
    expect(cards).toHaveLength(3);
    expect(screen.queryByRole('table', { name: 'Vessels' })).toBeNull();
    expect(within(cards[0]).getByText('3 can sign now')).toBeInTheDocument();
    expect(within(cards[2]).getByText('Nobody on the crew list')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Document' })).toBeInTheDocument();
  });
});

describe('the library’s Acknowledged column', () => {
  it('shows n of m with the overdue count and opens the document on the tab; drafts and documents without one are an explained dash', async () => {
    renderPage('/fleet/documents');
    const table = await screen.findByRole('table', { name: 'Fleet documents' });
    const row = (title: string) => within(table).getAllByRole('row').find((r) => r.textContent?.includes(title)) as HTMLElement;
    const fire = within(row('Fire response')).getByRole('button', { name: 'Acknowledgements of Fire response: 3 of 8 acknowledged, 3 overdue' });
    expect(fire).toHaveTextContent('3 of 83 overdue');
    expect(within(row('Garbage plan')).getByTitle('No acknowledgement needed')).toBeInTheDocument();
    expect(within(row('Mooring draft')).getByTitle('Not published yet')).toBeInTheDocument();
    fireEvent.click(fire);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/fleet/documents?tab=acknowledgements&doc=d-fire'));
    expect(await screen.findByRole('heading', { name: 'Fire response' })).toBeInTheDocument();
  });

  it('while acknowledgements are not set up, the column says so', async () => {
    state.rpcs = {};
    renderPage('/fleet/documents');
    const table = await screen.findByRole('table', { name: 'Fleet documents' });
    const row = within(table).getAllByRole('row').find((r) => r.textContent?.includes('Fire response')) as HTMLElement;
    expect(await within(row).findByTitle('Acknowledgements are not set up yet')).toBeInTheDocument();
  });
});
