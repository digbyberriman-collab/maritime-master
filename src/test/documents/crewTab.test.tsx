/**
 * The Master / head of department crew view of a vessel's fleet documents
 * (`/v/:vesselCode/safety/fleet-documents?view=crew`;
 * components/CrewAcknowledgementsTab.tsx, WitnessedAcknowledgementDialog.tsx,
 * hooks/useFleetDocumentAcks.ts useVesselAckCapacity, lib/ackAdmin.ts
 * crewCapacity; gap/02 FD6, FD8, W1; D-04, D-X5-04; X5-05B):
 *
 * - who sees it: the Master (a Master's role on this vessel, or the legacy
 *   Master role on its crew), a head of department, a documents viewer
 *   with fleet reach; plain crew do not, and `?view=crew` then shows their
 *   own documents; nothing is read for the crew view until the caller's
 *   roles are known (fail closed);
 * - the Master: everyone, Record witnessed acknowledgement, Choose who can
 *   sign; a head of department: their department, witness for it, no
 *   signer rules;
 * - per person: what is outstanding, the blocked reason inline; a person
 *   opens into their documents with Witness / Remind where allowed (never
 *   for the caller; never witness someone outside the signer list);
 * - witnessed acknowledgement: confirm on the shared device first; the
 *   returned row is checked (version, vessel, person, method, witness);
 *   refusals name the person; the reads are refreshed.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Decision = { allowed: boolean; status: string; reason: string };
type Answer = { data: unknown; error: { code?: string; message: string; details?: string | null } | null };

const state = vi.hoisted(() => ({
  decide: (() => ({ allowed: true, status: 'granted', reason: '' })) as (key: string) => Decision,
  rpcs: {} as Record<string, Answer>,
  tables: {} as Record<string, Answer>,
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  reads: [] as string[],
  auth: { profile: { id: 'p-master', company_id: 'co-1', role: 'master' }, user: { id: 'u-master' } } as {
    profile: { id: string; company_id: string; role: string };
    user: { id: string };
  },
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
  return { supabase: { from, rpc, storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: { message: 'no' } }) }) } } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => state.decide(key),
  useCan: (key: string) => state.decide(key).allowed,
  useAccessSnapshot: () => ({}),
}));
vi.mock('@/modules/auth/contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/contexts/AuthContext')>()),
  useAuth: () => state.auth,
}));
vi.mock('@/app/router/scopes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/router/scopes')>()),
  useVesselScope: () => ({ vessel: { id: 'v-dra', name: 'DRAAK', company_id: 'co-1' }, code: 'dra' }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/notify')>()),
  notify: state.notify,
}));

import VesselFleetDocumentsPage from '@/modules/documents/pages/VesselFleetDocumentsPage';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import {
  canBeWitnessed,
  coversDepartment,
  crewCapacity,
  groupCrew,
  mayRemindRow,
  mayWitnessRow,
  witnessRefusal,
  worstState,
  type CrewCapacityInput,
} from '@/modules/documents/lib/ackAdmin';
import type { FleetDocumentAckStatusRow, FleetDocumentVesselDocumentRow } from '@/modules/documents/types/db.pending';

// ─── Data ───────────────────────────────────────────────────────────────

const vdoc = (id: string, title: string, versionId: string, extra: Partial<FleetDocumentVesselDocumentRow> = {}): FleetDocumentVesselDocumentRow => ({
  document_id: id,
  section_id: 's-safety',
  section_name: 'Safety management',
  section_order: 1,
  type_id: 't-proc',
  type_name: 'Procedures',
  type_order: 1,
  title,
  description: null,
  ack_required: true,
  ack_due_days: 14,
  version_id: versionId,
  version_no: 3,
  version_label: 'v3',
  version_kind: 'major',
  effective_date: '2026-11-01',
  published_at: '2026-11-01T10:00:00Z',
  change_summary: null,
  file_name: 'fire.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1024,
  storage_path: `co-1/fleet/documents/fleet_document/${id}/f.pdf`,
  caller_on_crew: true,
  state: 'pending',
  due_at: '2026-12-01T10:00:00Z',
  blocked_reason: null,
  acknowledged_at: null,
  method: null,
  ...extra,
});
const DOCS = [
  vdoc('d-fire', 'Fire response', 'ver-fire'),
  vdoc('d-sms', 'Safety manual', 'ver-sms', { type_id: 't-manual', type_name: 'Manuals', version_label: 'Rev 4' }),
  vdoc('d-garbage', 'Garbage plan', 'ver-garbage', { ack_required: false, state: null }),
];

const row = (profileId: string, name: string, department: string, s: FleetDocumentAckStatusRow['state'], extra: Partial<FleetDocumentAckStatusRow> = {}): FleetDocumentAckStatusRow => ({
  document_id: 'd-fire',
  version_id: 'ver-fire',
  vessel_id: 'v-dra',
  profile_id: profileId,
  person_name: name,
  position: name.replace('Demo ', ''),
  department,
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
const STATUS: FleetDocumentAckStatusRow[] = [
  row('p-master', 'Demo Master', 'Deck', 'pending'),
  row('p-bosun', 'Demo Bosun', 'Deck', 'overdue'),
  row('p-junior', 'Demo Junior Deckhand', 'Deck', 'blocked', { has_login: false, blocked_reason: 'no_login' }),
  row('p-ce', 'Demo Chief Engineer', 'Engineering', 'pending'),
  row('p-stew', 'Demo Chief Stew', 'Interior', 'blocked', { blocked_reason: 'not_in_signer_set' }),
  row('p-co', 'Demo Chief Officer', 'Deck', 'acknowledged', { acknowledged_at: '2026-11-03T10:00:00Z', method: 'self' }),
  row('p-bosun', 'Demo Bosun', 'Deck', 'acknowledged', { document_id: 'd-sms', version_id: 'ver-sms', acknowledged_at: '2026-11-02T10:00:00Z', method: 'self' }),
  row('p-junior', 'Demo Junior Deckhand', 'Deck', 'blocked', { document_id: 'd-sms', version_id: 'ver-sms', has_login: false, blocked_reason: 'no_login' }),
  // A superseded version's row (a stale read) and a history row: never shown as the crew's.
  row('p-ce', 'Demo Chief Engineer', 'Engineering', 'pending', { version_id: 'ver-fire-old' }),
  row('p-left', 'Demo Former Deckhand', 'Deck', 'not_required', { on_crew: false }),
];
const RULES = [
  { id: 'r-all', vessel_id: 'v-dra', type_id: null, rule: 'hod_and_above', positions: [], profile_ids: [], updated_at: '2026-11-01T10:00:00Z' },
  { id: 'r-proc', vessel_id: 'v-dra', type_id: 't-proc', rule: 'positions', positions: ['Master', 'Bosun'], profile_ids: [], updated_at: '2026-11-01T10:00:00Z' },
];

type Persona = 'master' | 'hod' | 'crew' | 'loading';
function as(persona: Persona) {
  const base = { userRoles: [] as unknown[], loadedFor: 'u-x' as string | null, isInitialized: true };
  if (persona === 'master') {
    state.auth = { profile: { id: 'p-master', company_id: 'co-1', role: 'master' }, user: { id: 'u-master' } };
    usePermissionsStore.setState({ ...base, loadedFor: 'u-master', userRoles: [{ role_id: 'r', role_name: 'captain', role_display_name: 'Captain', vessel_id: 'v-dra', vessel_name: 'DRAAK', department: null, is_fleet_wide: false }] } as never);
  } else if (persona === 'hod') {
    state.auth = { profile: { id: 'p-co', company_id: 'co-1', role: 'chief_officer' }, user: { id: 'u-co' } };
    usePermissionsStore.setState({ ...base, loadedFor: 'u-co', userRoles: [{ role_id: 'r', role_name: 'hod', role_display_name: 'Head of department', vessel_id: 'v-dra', vessel_name: 'DRAAK', department: 'Deck', is_fleet_wide: false }] } as never);
  } else if (persona === 'crew') {
    state.auth = { profile: { id: 'p-bosun', company_id: 'co-1', role: 'crew' }, user: { id: 'u-bosun' } };
    usePermissionsStore.setState({ ...base, loadedFor: 'u-bosun' } as never);
  } else {
    state.auth = { profile: { id: 'p-master', company_id: 'co-1', role: 'crew' }, user: { id: 'u-master' } };
    usePermissionsStore.setState({ userRoles: [], loadedFor: null, isInitialized: false } as never);
  }
}

function renderPage(path = '/v/dra/safety/fleet-documents?view=crew') {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <VesselFleetDocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const callsOf = (fn: string) => state.calls.filter((c) => c.fn === fn);
const personRow = (name: string) => screen.getAllByTestId('crew-ack-person').find((el) => within(el).queryByText(name, { exact: true })) as HTMLElement;

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});
beforeEach(() => {
  state.decide = (key) => ({ allowed: key.startsWith('vessel.safety.fleet_documents'), status: 'granted', reason: '' });
  state.rpcs = {
    fleet_document_vessel_documents: { data: DOCS, error: null },
    fleet_document_ack_status: { data: STATUS, error: null },
  };
  state.tables = { fleet_document_signer_rules: { data: RULES, error: null } };
  state.calls = [];
  state.reads = [];
  for (const fn of Object.values(state.notify)) fn.mockReset();
  as('master');
});
afterEach(() => cleanup());

// ─── Who may do what (pure) ─────────────────────────────────────────────

describe('crewCapacity (who may act; the definers decide)', () => {
  const input = (over: Partial<CrewCapacityInput> = {}): CrewCapacityInput => ({
    vesselId: 'v-dra',
    roles: [],
    rolesKnown: true,
    legacyRole: 'crew',
    onCrew: true,
    fleetReach: false,
    documentsView: false,
    documentsEdit: false,
    documentsAdmin: false,
    ...over,
  });
  const captain = (vessel: string | null) => ({ role_name: 'captain', vessel_id: vessel, department: null });

  it('the Master: a Master role on this vessel, or the legacy Master role while on its crew', () => {
    expect(crewCapacity(input({ roles: [captain('v-dra')] }))).toMatchObject({ isMaster: true, readsCrew: true, canWitness: true, canRemind: true, canChooseSigners: true });
    expect(crewCapacity(input({ roles: [captain('v-gam')] })).isMaster).toBe(false);
    expect(crewCapacity(input({ roles: [captain(null)] })).isMaster).toBe(false);
    expect(crewCapacity(input({ legacyRole: 'master' })).isMaster).toBe(true);
    expect(crewCapacity(input({ legacyRole: 'master', onCrew: false })).isMaster).toBe(false);
  });

  it('a head of department: this vessel or company-wide, their departments (none named: every department); no signer rules', () => {
    const hod = crewCapacity(input({ roles: [{ role_name: 'hod', vessel_id: 'v-dra', department: 'Deck' }] }));
    expect(hod).toMatchObject({ isHod: true, hodDepartments: ['deck'], readsCrew: true, canWitness: true, canRemind: true, canChooseSigners: false });
    expect(coversDepartment(hod, 'DECK')).toBe(true);
    expect(coversDepartment(hod, 'Engineering')).toBe(false);
    expect(coversDepartment(hod, null)).toBe(false);
    const all = crewCapacity(input({ roles: [{ role_name: 'HOD', vessel_id: null, department: null }] }));
    expect(all.hodDepartments).toBeNull();
    expect(coversDepartment(all, 'Engineering')).toBe(true);
    expect(crewCapacity(input({ roles: [{ role_name: 'hod', vessel_id: 'v-gam', department: 'Deck' }] })).isHod).toBe(false);
  });

  it('fleet library holders need fleet reach: viewers read, editors remind, admins choose who can sign; none witness', () => {
    const fleet = crewCapacity(input({ fleetReach: true, documentsView: true, documentsEdit: true, documentsAdmin: true }));
    expect(fleet).toMatchObject({ readsCrew: true, isFleetReader: true, isFleetEditor: true, canWitness: false, canRemind: true, canChooseSigners: true });
    expect(crewCapacity(input({ documentsView: true, documentsEdit: true, documentsAdmin: true }))).toMatchObject({ readsCrew: false, canRemind: false, canChooseSigners: false });
  });

  it('plain crew get nothing, and nothing is offered until the roles are known (fail closed)', () => {
    expect(crewCapacity(input())).toMatchObject({ readsCrew: false, canWitness: false, canRemind: false, canChooseSigners: false });
    expect(crewCapacity(input({ rolesKnown: false, roles: [captain('v-dra')], legacyRole: 'master' }))).toMatchObject({ known: false, readsCrew: false, isMaster: false, canWitness: false });
  });

  it('row rules: witness pending, overdue or a login reason; never the signer list, the caller, history or another department', () => {
    const master = crewCapacity(input({ roles: [captain('v-dra')] }));
    const hod = crewCapacity(input({ roles: [{ role_name: 'hod', vessel_id: 'v-dra', department: 'Deck' }] }));
    const r = (profileId: string) => STATUS.find((x) => x.profile_id === profileId) as FleetDocumentAckStatusRow;
    expect(canBeWitnessed(r('p-junior'))).toBe(true);
    expect(canBeWitnessed({ ...r('p-junior'), blocked_reason: 'suspended' })).toBe(true);
    expect(canBeWitnessed(r('p-stew'))).toBe(false);
    expect(canBeWitnessed(r('p-co'))).toBe(false);
    expect(canBeWitnessed(r('p-left'))).toBe(false);
    expect(mayWitnessRow(master, r('p-junior'), 'p-master')).toBe(true);
    expect(mayWitnessRow(master, r('p-master'), 'p-master')).toBe(false);
    expect(mayWitnessRow(hod, r('p-ce'), 'p-co')).toBe(false);
    expect(mayWitnessRow(hod, r('p-bosun'), 'p-co')).toBe(true);
    expect(mayRemindRow(master, r('p-bosun'), 'p-master')).toBe(true);
    expect(mayRemindRow(master, r('p-junior'), 'p-master')).toBe(false);
    expect(mayRemindRow(master, r('p-master'), 'p-master')).toBe(false);
    expect(mayRemindRow(hod, r('p-ce'), 'p-co')).toBe(false);
  });

  it('groups the crew by person (history left out) and words a refusal with the person', () => {
    const crew = groupCrew(STATUS, { vesselId: 'v-dra' });
    expect(crew.map((p) => p.name)).toEqual(['Demo Bosun', 'Demo Chief Engineer', 'Demo Chief Officer', 'Demo Chief Stew', 'Demo Junior Deckhand', 'Demo Master']);
    expect(crew.find((p) => p.profileId === 'p-bosun')?.counts).toMatchObject({ acknowledged: 1, overdue: 1, total: 2 });
    expect(worstState(crew[0])).toBe('overdue');
    expect(groupCrew(STATUS, { vesselId: 'v-dra', documentId: 'd-sms' }).map((p) => p.profileId)).toEqual(['p-bosun', 'p-junior']);
    expect(witnessRefusal('blocked', 'not_in_signer_set', 'Demo Chief Stew')).toBe('Demo Chief Stew is not on the list of people who sign for this vessel. Change who can sign first.');
    expect(witnessRefusal('already_acknowledged', null, 'Demo Bosun')).toMatch(/^Demo Bosun has already acknowledged/);
    expect(witnessRefusal('nope', null, 'X')).toBeNull();
  });
});

// ─── Who sees the crew view ─────────────────────────────────────────────

describe('who sees the crew view', () => {
  it('plain crew: no Crew tab, ?view=crew shows their own documents, and nobody else’s rows are read', async () => {
    as('crew');
    renderPage();
    expect(await screen.findByText('Fire response')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Fleet documents views' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Crew acknowledgements' })).toBeNull();
    expect(callsOf('fleet_document_ack_status')).toEqual([]);
    expect(state.reads).not.toContain('fleet_document_signer_rules');
  });

  it('roles not loaded yet: no Crew tab and no crew reads (fail closed)', async () => {
    as('loading');
    renderPage();
    expect(await screen.findByText('Fire response')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crew' })).toBeNull();
    expect(callsOf('fleet_document_ack_status')).toEqual([]);
  });

  it('the Master: the Crew tab, everyone on the crew list, witness and who can sign; one read for the vessel', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Crew acknowledgements' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crew' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('crew-ack-scope')).toHaveTextContent('Everyone on DRAAK’s crew list.');
    expect(screen.getByTestId('crew-ack-signers')).toHaveTextContent('Who can sign: Heads of department and above · 1 document type with its own rule');
    expect(screen.getByRole('button', { name: /Record witnessed acknowledgement/ })).toBeEnabled();
    expect(await screen.findByRole('button', { name: /Choose who can sign/ })).toBeEnabled();
    expect(callsOf('fleet_document_ack_status')).toEqual([{ fn: 'fleet_document_ack_status', args: { p_document_id: null, p_vessel_ids: ['v-dra'] } }]);
    // Still to acknowledge (the default): everyone but the Chief Officer, who is up to date.
    const names = screen.getAllByTestId('crew-ack-person').map((el) => el.querySelector('p')?.firstChild?.textContent);
    expect(names).toEqual(['Demo Bosun', 'Demo Chief Engineer', 'Demo Chief Stew', 'Demo Junior Deckhand', 'Demo Master']);
    expect(within(personRow('Demo Junior Deckhand')).getByText('No app login')).toBeInTheDocument();
    expect(within(personRow('Demo Chief Stew')).getByText('Not on the signer list')).toBeInTheDocument();
    expect(within(personRow('Demo Master')).getByText('You')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Everyone/ }));
    expect(within(personRow('Demo Chief Officer')).getByText('Up to date')).toBeInTheDocument();
  });

  it('a person opens into their documents with Witness and Remind only where allowed', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Crew acknowledgements' });
    fireEvent.click(screen.getByRole('button', { name: 'Show Demo Junior Deckhand’s documents' }));
    const junior = screen.getByRole('list', { name: 'Demo Junior Deckhand’s documents' });
    expect(within(junior).getAllByRole('button', { name: 'Record a witnessed acknowledgement for Demo Junior Deckhand' })).toHaveLength(2);
    expect(within(junior).queryByRole('button', { name: /^Remind/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show Demo Bosun’s documents' }));
    const bosun = screen.getByRole('list', { name: 'Demo Bosun’s documents' });
    expect(within(bosun).getByRole('button', { name: 'Remind Demo Bosun' })).toBeInTheDocument();
    expect(within(bosun).getByText('since 19 Nov 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Demo Chief Stew’s documents' }));
    const stew = screen.getByRole('list', { name: 'Demo Chief Stew’s documents' });
    expect(within(stew).queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show Demo Master’s documents' }));
    expect(within(screen.getByRole('list', { name: 'Demo Master’s documents' })).queryByRole('button')).toBeNull();
  });

  it('a head of department: their department only for witnessing, and no signer rules', async () => {
    as('hod');
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Crew acknowledgements' })).toBeInTheDocument();
    expect(screen.getByTestId('crew-ack-scope')).toHaveTextContent('Your department on DRAAK: Deck.');
    expect(screen.queryByRole('button', { name: /Choose who can sign/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Record witnessed acknowledgement/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Demo Chief Engineer’s documents' }));
    expect(within(screen.getByRole('list', { name: 'Demo Chief Engineer’s documents' })).queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show Demo Bosun’s documents' }));
    expect(within(screen.getByRole('list', { name: 'Demo Bosun’s documents' })).getByRole('button', { name: /Record a witnessed acknowledgement for Demo Bosun/ })).toBeInTheDocument();
  });

  it('the crew read missing is "not set up yet"; another error has Retry', async () => {
    delete state.rpcs.fleet_document_ack_status;
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Acknowledgements are not set up yet' })).toBeInTheDocument();
    cleanup();
    state.rpcs.fleet_document_ack_status = { data: null, error: { code: 'XX000', message: 'boom' } };
    renderPage();
    expect(await screen.findByText('The crew’s acknowledgements could not load')).toBeInTheDocument();
  });
});

// ─── Witnessed acknowledgement ──────────────────────────────────────────

describe('witnessed acknowledgement', () => {
  const witnessed = (over: Record<string, unknown> = {}) => ({
    id: 'ack-1',
    company_id: 'co-1',
    document_id: 'd-fire',
    version_id: 'ver-fire',
    vessel_id: 'v-dra',
    profile_id: 'p-junior',
    user_id: null,
    method: 'witnessed',
    witnessed_by_profile_id: 'p-master',
    carried_from_version_id: null,
    recorded_by: 'u-master',
    acknowledged_at: '2026-11-26T10:00:00Z',
    request_meta: {},
    created_at: '2026-11-26T10:00:00Z',
    ...over,
  });

  async function openFor(name: string) {
    renderPage();
    await screen.findByRole('heading', { name: 'Crew acknowledgements' });
    fireEvent.click(screen.getByRole('button', { name: `Show ${name}’s documents` }));
    const list = screen.getByRole('list', { name: `${name}’s documents` });
    fireEvent.click(within(list).getAllByRole('button', { name: `Record a witnessed acknowledgement for ${name}` })[0]);
    return screen.findByRole('dialog', { name: 'Record a witnessed acknowledgement' });
  }

  it('asks the witness to confirm on this device first, then records it and checks the row', async () => {
    state.rpcs.fleet_document_acknowledge_witnessed = { data: witnessed(), error: null };
    const dialog = await openFor('Demo Junior Deckhand');
    expect(within(dialog).getByText(/Hand this device to Demo Junior Deckhand/)).toBeInTheDocument();
    expect(within(dialog).getByText('Fire response, version v3')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Record acknowledgement/ }));
    expect(await within(dialog).findByText('Confirm that you watched them read and acknowledge it')).toBeInTheDocument();
    expect(callsOf('fleet_document_acknowledge_witnessed')).toEqual([]);
    fireEvent.click(within(dialog).getByRole('checkbox'));
    const before = callsOf('fleet_document_ack_status').length;
    fireEvent.click(within(dialog).getByRole('button', { name: /Record acknowledgement/ }));
    await waitFor(() => expect(callsOf('fleet_document_acknowledge_witnessed')).toHaveLength(1));
    expect(callsOf('fleet_document_acknowledge_witnessed')[0].args).toEqual({ p_version_id: 'ver-fire', p_vessel_id: 'v-dra', p_profile_id: 'p-junior' });
    await waitFor(() =>
      expect(state.notify.success).toHaveBeenCalledWith('Recorded for Demo Junior Deckhand', {
        description: 'Fire response, version v3: acknowledged on a shared device, with you as the witness.',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(callsOf('fleet_document_ack_status').length).toBeGreaterThan(before));
  });

  it('a row for another person, or not witnessed, is not a success', async () => {
    state.rpcs.fleet_document_acknowledge_witnessed = { data: witnessed({ profile_id: 'p-bosun' }), error: null };
    const dialog = await openFor('Demo Junior Deckhand');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Record acknowledgement/ }));
    expect(await within(dialog).findByText('The witnessed acknowledgement was not recorded. Refresh the list and try again.')).toBeInTheDocument();
    expect(state.notify.success).not.toHaveBeenCalled();
  });

  it('a refusal names the person', async () => {
    state.rpcs.fleet_document_acknowledge_witnessed = { data: null, error: { code: '22023', message: 'already_acknowledged' } };
    const dialog = await openFor('Demo Junior Deckhand');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Record acknowledgement/ }));
    expect(await within(dialog).findByText('Demo Junior Deckhand has already acknowledged this version. The list has been refreshed.')).toBeInTheDocument();
    expect(within(dialog).getByText('Nothing was recorded')).toBeInTheDocument();
  });

  it('the RPC missing says nothing was recorded (D-01)', async () => {
    const dialog = await openFor('Demo Junior Deckhand');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Record acknowledgement/ }));
    expect(await within(dialog).findByText('Acknowledgements are not set up yet, so nothing was recorded.')).toBeInTheDocument();
  });

  it('from the header: pick first; Next needs a document and a person; only people the caller may witness are offered', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Crew acknowledgements' });
    fireEvent.click(screen.getByRole('button', { name: /Record witnessed acknowledgement/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Record a witnessed acknowledgement' });
    expect(within(dialog).getByText(/mostly people without an app login/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Next: confirm on this device/ }));
    expect(await within(dialog).findByText('Choose the document')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose the person')).toBeInTheDocument();
    // Open the document picker: both documents with someone to witness, not the one without acknowledgement.
    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Document' }), { key: 'Enter' });
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Fire response · v3', 'Safety manual · Rev 4']);
    fireEvent.keyDown(options[1], { key: 'Enter' });
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0));
    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Crew member' }), { key: 'Enter' });
    // Safety manual: only the Junior Deckhand (the Bosun has acknowledged it).
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Demo Junior Deckhand · Junior Deckhand · No app login']);
  });
});
