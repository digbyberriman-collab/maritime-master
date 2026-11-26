/**
 * Crew Compliance (X1-06B; gap/04 C35, C33, C34, C5, C24, C25; D-01):
 *
 * - the page: the gate (loading: nothing read, nothing shown; denied:
 *   AccessDenied, nothing read), an unknown tab lands on Status;
 * - Status: KPIs, department groups, the overview cells (icon, word,
 *   tooltip sentence), the views (Gaps, a tab), the status chip and on
 *   board filters in the URL, cards below 768 px; empty; not applied
 *   (D-01) is PageEmpty with the notice; a refusal is AccessDenied; any
 *   other error is PageError with Retry, which asks again;
 * - Configuration: read only without crew_compliance.admin (a notice,
 *   no ticks, no Add); with it: staged ticks, Review & save sends only the
 *   changed cells and refuses an answer that does not confirm them all;
 *   Require all / Remove ask first; the vessel settings write and confirm;
 * - the integrations: the crew list's dots (two icons and the reasons, a
 *   dash that says why otherwise), the profile tab's "Missing required (n)"
 *   and "Show empty slots", and the add dialog's "Missing for current
 *   role" quick-add.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CrewComplianceSummaryDbRow, CrewRequirementStatusDbRow } from '@/modules/crew/types/db.pending';

const h = vi.hoisted(() => ({
  caps: { view: 'granted' as 'granted' | 'loading' | 'denied', denied: new Set<string>() },
  rpc: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  fromCalls: [] as string[],
  wide: true,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(resolve, reject);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from, storage: { from: () => ({}) } } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string) => {
    if (h.caps.view === 'loading') return { allowed: false, status: 'loading', reason: 'test' };
    const allowed = h.caps.view === 'granted' && !h.caps.denied.has(key);
    return { allowed, status: allowed ? 'granted' : 'denied', reason: 'test' };
  },
  useCan: (key: string) => h.caps.view === 'granted' && !h.caps.denied.has(key),
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-dra', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/shared/components/data/useMinWidth', () => ({ TABLET_MIN_WIDTH: 768, useMinWidth: () => h.wide }));

import CrewCompliancePage from '@/modules/crew/pages/CrewCompliancePage';
import { COMPLIANCE_NOT_SET_UP_NOTICE } from '@/modules/crew/lib/compliance';
import { CONFIG_READ_ONLY_NOTICE } from '@/modules/crew/components/compliance/ComplianceConfigTab';
import { ComplianceDotsCell } from '@/modules/crew/components/compliance/ComplianceDots';
import { dotsSentence } from '@/modules/crew/components/compliance/cellLook';
import type { CrewListComplianceState } from '@/modules/crew/components/compliance/crewListCompliance';
import { parseComplianceSummaryRow } from '@/modules/crew/hooks/useVesselCompliance';
import { MissingRequiredBlock } from '@/modules/crew/components/compliance/MissingRequiredBlock';
import { withEmptySlots, REQUIRED_GROUP_KEY } from '@/modules/crew/components/compliance/emptySlots';
import AddDocumentDialog from '@/modules/crew/components/documents/AddDocumentDialog';
import type { DocumentCatalogue, DocumentType } from '@/modules/crew/hooks/useDocumentTypes';

const VESSEL = 'v-dra';
const COMPANY = 'c-1';

const summary = (over: Partial<CrewComplianceSummaryDbRow> & { profile_id: string }): CrewComplianceSummaryDbRow => ({
  company_id: COMPANY,
  vessel_id: VESSEL,
  user_id: null,
  first_name: 'Demo',
  last_name: 'Crew',
  preferred_name: null,
  position_id: 'pos-deckhand',
  position_name: 'Deckhand',
  position_text: 'Deckhand',
  department_key: 'deck',
  rank_tier: 'rating',
  sort_order: 40203,
  placement_kind: 'assignment',
  required: 2,
  met: 2,
  expiring: 0,
  expired: 0,
  missing: 0,
  conditional: 0,
  muted: 0,
  docs_required: 1,
  docs_met: 1,
  stcw_required: 1,
  stcw_met: 1,
  quals_required: 0,
  quals_met: 0,
  fam_required: 0,
  fam_met: 0,
  status: 'complete',
  next_expiry: '2027-06-01',
  dot_documents: 'ok',
  dot_qualifications: 'ok',
  issues: [],
  ...over,
});

const status = (over: Partial<CrewRequirementStatusDbRow> & { profile_id: string; row_id: string }): CrewRequirementStatusDbRow => ({
  company_id: COMPANY,
  vessel_id: VESSEL,
  user_id: null,
  position_id: 'pos-deckhand',
  placement_kind: 'assignment',
  group_key: 'stcw_basic',
  row_label: 'Personal survival techniques',
  row_kind: 'document',
  tab: 'stcw',
  row_sort: 21,
  state: 'met',
  satisfying_document_id: 'd-1',
  satisfying_record_id: null,
  satisfying_type_id: 't-pst',
  satisfying_name: 'Personal survival techniques',
  satisfied_via: 'option',
  via_option_type_id: 't-pst',
  next_expiry: '2027-06-01',
  no_expiry: false,
  bucket: 'valid',
  days_remaining: 400,
  verification_status: 'verified',
  is_conditional: false,
  is_muted: false,
  missing_date: false,
  has_file: true,
  gap_reason: null,
  nearest_document_id: null,
  nearest_record_id: null,
  nearest_type_id: null,
  nearest_name: null,
  ...over,
});

const SUMMARIES: CrewComplianceSummaryDbRow[] = [
  summary({ profile_id: 'p-master', last_name: 'Master', position_name: 'Master', position_text: 'Master', department_key: 'bridge', sort_order: 10101 }),
  summary({
    profile_id: 'p-bosun',
    last_name: 'Bosun',
    position_name: 'Bosun',
    sort_order: 30201,
    status: 'missing',
    met: 1,
    missing: 1,
    stcw_met: 0,
    dot_qualifications: 'danger',
    issues: [{ row_id: 'r-pst', label: 'Personal survival techniques', tab: 'stcw', state: 'missing', reason: 'missing' }],
  }),
  summary({
    profile_id: 'p-stew',
    last_name: 'Stew',
    position_name: 'Chief Stew',
    department_key: 'interior',
    sort_order: 40101,
    status: 'expired',
    met: 1,
    expired: 1,
    docs_met: 0,
    dot_documents: 'danger',
    issues: [{ row_id: 'r-pp', label: 'Passport', tab: 'documents', state: 'expired', reason: 'expired' }],
  }),
  summary({ profile_id: 'p-joiner', last_name: 'Joiner', placement_kind: 'planned', required: 0, met: 0, docs_required: 0, docs_met: 0, stcw_required: 0, stcw_met: 0, next_expiry: null, dot_documents: 'none', dot_qualifications: 'none' }),
];

const STATUSES: CrewRequirementStatusDbRow[] = [
  status({ profile_id: 'p-master', row_id: 'r-pst' }),
  status({ profile_id: 'p-master', row_id: 'r-pp', group_key: 'documents', row_label: 'Passport', tab: 'documents', row_sort: 5, satisfying_name: 'Passport' }),
  status({
    profile_id: 'p-bosun',
    row_id: 'r-pst',
    state: 'missing',
    satisfying_document_id: null,
    satisfying_type_id: null,
    satisfying_name: null,
    satisfied_via: null,
    via_option_type_id: null,
    next_expiry: null,
    bucket: null,
    days_remaining: null,
    verification_status: null,
    has_file: null,
    gap_reason: 'not_linked',
    nearest_name: 'Basic safety refresher',
  }),
  status({ profile_id: 'p-bosun', row_id: 'r-pp', group_key: 'documents', row_label: 'Passport', tab: 'documents', row_sort: 5, satisfying_name: 'Passport' }),
  status({ profile_id: 'p-stew', row_id: 'r-pst' }),
  status({
    profile_id: 'p-stew',
    row_id: 'r-pp',
    group_key: 'documents',
    row_label: 'Passport',
    tab: 'documents',
    row_sort: 5,
    state: 'expired',
    satisfying_name: 'Passport',
    next_expiry: '2026-01-10',
    bucket: 'expired',
    days_remaining: -320,
  }),
];

const position = (id: string, name: string, dept: string, label: string, sort: number, sortOrder: number, listed = true) => ({
  position_id: id,
  key: id,
  name,
  department_key: dept,
  department_label: label,
  department_sort: sort,
  rank_tier: 'rating',
  sort_order: sortOrder,
  is_listed: listed,
});

const CONFIG = (over: Record<string, unknown> = {}) => ({
  vessel_id: VESSEL,
  company_id: COMPANY,
  can_admin: true,
  can_admin_company: true,
  settings: { is_passenger_ship: false, crew_uploads_enabled: true, transfer_requires_fleet_approval: false, requirements_seeded_at: null, updated_at: null },
  positions: [position('pos-master', 'Master', 'bridge', 'Bridge', 10, 10101), position('pos-bosun', 'Bosun', 'deck', 'Deck', 20, 30201)],
  rows: [
    {
      id: 'r-pst',
      group_key: 'stcw_basic',
      label: 'Personal survival techniques',
      kind: 'document',
      sort_order: 21,
      seed_key: 'stcw_basic.pst',
      tab: 'stcw',
      options: [{ id: 'o-1', document_type_id: 't-pst', familiarization_template_id: null, sort_order: 0, name: 'Personal survival techniques', code: 'PST', abbreviation: 'PST', category_key: 'stcw_basic', tab: 'stcw', is_company_type: false }],
      position_ids: ['pos-master'],
      held_by: 1,
    },
  ],
  templates: [],
  ...over,
});

const DEPARTMENTS = [
  { key: 'bridge', label: 'Bridge', sort_order: 10 },
  { key: 'deck', label: 'Deck', sort_order: 20 },
  { key: 'interior', label: 'Interior', sort_order: 40 },
];

type RpcAnswer = { data: unknown; error: unknown };
let answers: Record<string, () => RpcAnswer>;

let qc: QueryClient;
let lastLocation = '';
const LocationProbe: React.FC = () => {
  const loc = useLocation();
  lastLocation = `${loc.pathname}${loc.search}`;
  return null;
};

function renderPage(initial = '/v/dra/crew/compliance/status') {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/v/:vesselCode/crew/compliance/:tab" element={<CrewCompliancePage />} />
        </Routes>
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
  h.wide = true;
  h.tables = { departments: { data: DEPARTMENTS, error: null } };
  h.fromCalls = [];
  answers = {
    crew_vessel_compliance: () => ({ data: SUMMARIES, error: null }),
    crew_vessel_requirement_status: () => ({ data: STATUSES, error: null }),
    crew_vessel_list: () => ({ data: [], error: null }),
    crew_requirements_config: () => ({ data: CONFIG(), error: null }),
  };
  h.rpc.mockReset();
  h.rpc.mockImplementation((fn: string) =>
    Promise.resolve(answers[fn] ? answers[fn]() : { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } }),
  );
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  lastLocation = '';
});
afterEach(() => qc.clear());

const rpcNames = () => h.rpc.mock.calls.map(([fn]) => fn as string);

describe('the gate', () => {
  it('while the capability loads: nothing is read and no compliance shows', () => {
    h.caps.view = 'loading';
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Crew compliance' })).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('denied: AccessDenied, and nothing is read', () => {
    h.caps.view = 'denied';
    renderPage();
    expect(screen.getByRole('heading', { name: "You can't see crew compliance on this vessel" })).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('an unknown tab lands on Status, the query kept', async () => {
    renderPage('/v/dra/crew/compliance/matrix?view=gaps');
    await waitFor(() => expect(lastLocation).toBe('/v/dra/crew/compliance/status?view=gaps'));
  });
});

describe('Status', () => {
  it('reads the vessel\'s summaries and status rows once, and shows the KPIs by status', async () => {
    renderPage();
    const kpis = await screen.findByText('Total');
    const grid = kpis.closest('[data-compliance-kpis]') as HTMLElement;
    const value = (label: string) => within(grid).getByText(label).closest('[data-state]')?.querySelector('[data-kpi-value]')?.textContent;
    expect(value('Total')).toBe('4');
    expect(value('Compliant')).toBe('2');
    expect(value('Expired')).toBe('1');
    expect(value('Missing')).toBe('1');
    expect(within(grid).getByText('Includes 1 with nothing required')).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith('crew_vessel_compliance', { p_vessel_id: VESSEL });
    expect(h.rpc).toHaveBeenCalledWith('crew_vessel_requirement_status', { p_vessel_id: VESSEL, p_profile_id: null });
    expect(rpcNames().filter((n) => n === 'crew_vessel_compliance')).toHaveLength(1);
  });

  it('groups by department in department order, each cell an icon and a word with its sentence', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Crew compliance, Bridge' });
    const groups = [...document.querySelectorAll('[data-compliance-group]')].map((g) => g.getAttribute('data-compliance-group'));
    expect(groups).toEqual(['bridge', 'deck', 'interior']);
    const deck = screen.getByRole('table', { name: 'Crew compliance, Deck' });
    const bosun = within(deck).getByRole('rowheader', { name: /Bosun, Demo/ }).closest('tr')!;
    const stcw = within(bosun).getByRole('button', { name: /Bosun, Demo, STCW/ });
    expect(stcw).toHaveTextContent('0/1');
    expect(stcw.getAttribute('aria-label')).toContain('Needs a look: Personal survival techniques.');
    expect(within(bosun).getByText('Missing')).toBeInTheDocument();
    // The planned joiner with nothing required.
    expect(within(deck).getByRole('rowheader', { name: /Joiner, Demo/ })).toHaveTextContent('Joining');
    expect(within(deck).getByText('Nothing required')).toBeInTheDocument();
  });

  it('the Gaps view: only crew with a gap, and the requirements someone has a gap in, each explaining itself', async () => {
    renderPage('/v/dra/crew/compliance/status?view=gaps');
    const deck = await screen.findByRole('table', { name: 'Crew compliance, Deck' });
    expect(within(deck).getAllByRole('rowheader').map((r) => r.textContent)).toEqual([expect.stringContaining('Bosun')]);
    expect(screen.queryByRole('table', { name: 'Crew compliance, Bridge' })).toBeNull();
    const cell = within(deck).getByRole('button', { name: /Bosun, Demo, Personal survival techniques/ });
    expect(cell.getAttribute('aria-label')).toContain('Nearest held: Basic safety refresher, which does not count for this requirement.');
    // Passport is met by the Bosun but expired for the Chief Stew: a column; the met cell reads Met.
    expect(within(deck).getByRole('button', { name: /Bosun, Demo, Passport: Met/ })).toBeInTheDocument();
  });

  it('a tab view shows that tab\'s requirements; the chips and tabs write the URL', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Crew compliance, Bridge' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Documents' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));
    await waitFor(() => expect(lastLocation).toBe('/v/dra/crew/compliance/status?view=documents'));
    const interior = await screen.findByRole('table', { name: 'Crew compliance, Interior' });
    expect(within(interior).getByRole('columnheader', { name: /Passport/ })).toBeInTheDocument();
    expect(within(interior).getByRole('button', { name: /Stew, Demo, Passport: Expired/ })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: /Expired/ }));
    await waitFor(() => expect(lastLocation).toBe('/v/dra/crew/compliance/status?view=documents&status=expired'));
    expect(screen.queryByRole('table', { name: 'Crew compliance, Deck' })).toBeNull();
  });

  it('on board uses the crew list\'s status; one list puts everyone in one table', async () => {
    answers.crew_vessel_list = () => ({
      data: [
        { profile_id: 'p-master', status: 'on_board' },
        { profile_id: 'p-bosun', status: 'on_leave' },
      ].map((r) => ({ ...LIST_ROW, ...r })),
      error: null,
    });
    renderPage('/v/dra/crew/compliance/status?show=onboard&group=flat');
    const table = await screen.findByRole('table', { name: 'Crew compliance' });
    // Master on board; Bosun on leave; Chief Stew on a current placement (not in the list's answer); the joiner is not on board yet.
    await waitFor(() => expect(within(table).getAllByRole('rowheader').map((r) => r.textContent?.split(',')[0])).toEqual(['Master', 'Stew']));
  });

  it('cards below 768 px, whatever the URL asks', async () => {
    h.wide = false;
    renderPage('/v/dra/crew/compliance/status?layout=matrix');
    const cards = await screen.findAllByRole('list', { name: /Crew compliance/ });
    expect(cards.length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.querySelector('[data-compliance-card="p-bosun"]')).toHaveTextContent('Personal survival techniques: missing');
    expect(screen.queryByRole('group', { name: 'Layout' })).toBeNull();
  });

  it('empty: says there is no crew yet', async () => {
    answers.crew_vessel_compliance = () => ({ data: [], error: null });
    answers.crew_vessel_requirement_status = () => ({ data: [], error: null });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No crew on DRAAK yet' })).toBeInTheDocument();
  });

  it('not applied (D-01): PageEmpty with the notice, never mock rows', async () => {
    delete answers.crew_vessel_compliance;
    delete answers.crew_vessel_requirement_status;
    renderPage();
    expect(await screen.findByText(COMPLIANCE_NOT_SET_UP_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('a refusal from the server is AccessDenied with its sentence', async () => {
    answers.crew_vessel_compliance = () => ({ data: null, error: { code: '42501', message: 'not_permitted', details: 'External viewers cannot see crew compliance.' } });
    renderPage();
    expect(await screen.findByText('External viewers cannot see crew compliance.')).toBeInTheDocument();
  });

  it('any other error is PageError with Retry, which asks again', async () => {
    answers.crew_vessel_compliance = () => ({ data: null, error: { code: '08006', message: 'connection failure' } });
    renderPage();
    const retry = await screen.findByRole('button', { name: /Try again/ });
    answers.crew_vessel_compliance = () => ({ data: SUMMARIES, error: null });
    fireEvent.click(retry);
    expect(await screen.findByRole('table', { name: 'Crew compliance, Bridge' })).toBeInTheDocument();
  });
});

const LIST_ROW = {
  user_id: null,
  first_name: 'Demo',
  last_name: 'Crew',
  preferred_name: null,
  avatar_url: null,
  email: null,
  position_id: null,
  position_name: null,
  position_text: null,
  department_key: null,
  department_label: null,
  rank_tier: null,
  sort_order: null,
  assignment_id: null,
  placement_kind: 'assignment',
  join_date: null,
  leave_date: null,
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
};

describe('Configuration', () => {
  it('read only without crew compliance administration: the notice, no ticks to change, no Add', async () => {
    h.caps.denied = new Set(['vessel.crew.crew_compliance.admin']);
    renderPage('/v/dra/crew/compliance/configuration');
    expect(await screen.findByText(CONFIG_READ_ONLY_NOTICE)).toBeInTheDocument();
    const matrix = await screen.findByRole('table', { name: 'Required qualifications' });
    for (const box of within(matrix).getAllByRole('checkbox')) expect(box).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add requirement' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Passenger ship' })).toBeDisabled();
  });

  it('the server\'s answer counts too: can_admin false is read only even with the capability', async () => {
    answers.crew_requirements_config = () => ({ data: CONFIG({ can_admin: false }), error: null });
    renderPage('/v/dra/crew/compliance/configuration');
    expect(await screen.findByText(CONFIG_READ_ONLY_NOTICE)).toBeInTheDocument();
  });

  it('shows the rows with "N options · held by X" and the positions by department', async () => {
    renderPage('/v/dra/crew/compliance/configuration');
    const matrix = await screen.findByRole('table', { name: 'Required qualifications' });
    expect(within(matrix).getByText(/1 option · held by 1/)).toBeInTheDocument();
    expect(within(matrix).getByRole('columnheader', { name: 'Bridge' })).toBeInTheDocument();
    expect(within(matrix).getByRole('checkbox', { name: 'Personal survival techniques, Master' })).toHaveAttribute('aria-checked', 'true');
    expect(within(matrix).getByRole('checkbox', { name: 'Personal survival techniques, Bosun' })).toHaveAttribute('aria-checked', 'false');
  });

  it('stages ticks and saves only the changed cells after Review & save', async () => {
    answers.crew_requirement_cell_set = () => ({ data: 1, error: null });
    renderPage('/v/dra/crew/compliance/configuration');
    const matrix = await screen.findByRole('table', { name: 'Required qualifications' });
    const bosun = within(matrix).getByRole('checkbox', { name: 'Personal survival techniques, Bosun' });
    fireEvent.click(bosun);
    expect(rpcNames()).not.toContain('crew_requirement_cell_set');
    fireEvent.click(screen.getByRole('button', { name: 'Review & save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review changes' });
    expect(within(dialog).getByText('Not required')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save 1 change' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('crew_requirement_cell_set', {
        p_vessel_id: VESSEL,
        p_cells: [{ row_id: 'r-pst', position_id: 'pos-bosun', required: true }],
      }),
    );
  });

  it('an answer that does not confirm every cell keeps the edits and says so', async () => {
    answers.crew_requirement_cell_set = () => ({ data: 0, error: null });
    renderPage('/v/dra/crew/compliance/configuration');
    const matrix = await screen.findByRole('table', { name: 'Required qualifications' });
    fireEvent.click(within(matrix).getByRole('checkbox', { name: 'Personal survival techniques, Bosun' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review & save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review changes' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save 1 change' }));
    expect(await within(dialog).findByText('Not every change was saved. Review the matrix and try again.')).toBeInTheDocument();
  });

  it('Remove asks first, then removes the row', async () => {
    answers.crew_requirement_row_delete = () => ({ data: 'r-pst', error: null });
    renderPage('/v/dra/crew/compliance/configuration');
    await screen.findByRole('table', { name: 'Required qualifications' });
    const trigger = screen.getByRole('button', { name: 'Actions for Personal survival techniques' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Remove the requirement/ }));
    const confirm = await screen.findByRole('alertdialog');
    expect(rpcNames()).not.toContain('crew_requirement_row_delete');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('crew_requirement_row_delete', { p_vessel_id: VESSEL, p_row_id: 'r-pst' }));
  });

  it('Add requirement: a familiarisation for every listed position, the name from the option, the server answers with the row', async () => {
    answers.crew_requirements_config = () => ({ data: CONFIG({ templates: [{ id: 'f-1', name: 'Vessel familiarisation', is_active: true }] }), error: null });
    answers.crew_requirement_row_save = () => ({
      data: { id: 'r-new', company_id: COMPANY, vessel_id: VESSEL, group_key: 'familiarisation', label: 'Vessel familiarisation', kind: 'familiarisation', sort_order: 30, seed_key: null },
      error: null,
    });
    renderPage('/v/dra/crew/compliance/configuration');
    await screen.findByRole('table', { name: 'Required qualifications' });
    fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a requirement' });
    // Nothing chosen: the form says what is missing and sends nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add requirement' }));
    expect(await within(dialog).findByText('Choose at least one document or familiarisation that satisfies it.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'A familiarisation' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Vessel familiarisation' }));
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Vessel familiarisation');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add requirement' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('crew_requirement_row_save', {
        p_vessel_id: VESSEL,
        p_row_id: null,
        p_payload: {
          kind: 'familiarisation',
          group_key: 'familiarisation',
          label: 'Vessel familiarisation',
          options: [{ familiarization_template_id: 'f-1' }],
          position_ids: ['pos-master', 'pos-bosun'],
        },
      }),
    );
  });

  it('a vessel setting writes and confirms the value', async () => {
    answers.crew_vessel_settings_save = () => ({
      data: { vessel_id: VESSEL, company_id: COMPANY, is_passenger_ship: false, crew_uploads_enabled: true, transfer_requires_fleet_approval: true },
      error: null,
    });
    renderPage('/v/dra/crew/compliance/configuration');
    const toggle = await screen.findByRole('switch', { name: 'Transfers need fleet approval' });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('crew_vessel_settings_save', { p_vessel_id: VESSEL, p_patch: { transfer_requires_fleet_approval: true } }),
    );
  });

  it('not applied (D-01): PageEmpty with the notice', async () => {
    delete answers.crew_requirements_config;
    renderPage('/v/dra/crew/compliance/configuration');
    expect(await screen.findByText(COMPLIANCE_NOT_SET_UP_NOTICE)).toBeInTheDocument();
  });
});

describe('the crew list dots (C5)', () => {
  const ready = (rows: CrewComplianceSummaryDbRow[]): CrewListComplianceState => ({
    status: 'ready',
    byProfile: new Map(rows.map((r) => [r.profile_id, parseComplianceSummaryRow(r)])),
    profileHref: (id) => `/v/dra/crew/people/${id}/documents`,
  });
  const renderDots = (state: CrewListComplianceState, profileId = 'p-stew') =>
    render(
      <MemoryRouter>
        <ComplianceDotsCell profileId={profileId} name="Stew, Demo" state={state} />
      </MemoryRouter>,
    );

  it('two dots, each its own icon, the reasons in words, a link to the person\'s documents', () => {
    renderDots(ready(SUMMARIES));
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/v/dra/crew/people/p-stew/documents');
    expect(link).toHaveAttribute('data-dots', 'danger:ok');
    expect(link.getAttribute('aria-label')).toBe(
      'Stew, Demo, compliance. Documents: missing or expired (Passport: expired). STCW and qualifications: all held. Open their documents.',
    );
  });

  it('says why there are no dots: not set up, no access, not on the crew, still loading', () => {
    const { rerender } = renderDots({ status: 'off', reason: COMPLIANCE_NOT_SET_UP_NOTICE });
    expect(screen.getByLabelText(/not shown/)).toHaveAttribute('title', COMPLIANCE_NOT_SET_UP_NOTICE);
    rerender(
      <MemoryRouter>
        <ComplianceDotsCell profileId="p-x" name="X" state={ready(SUMMARIES)} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/not on the vessel's crew today/)).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ComplianceDotsCell profileId="p-x" name="X" state={{ status: 'loading' }} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/checking/)).toHaveAttribute('aria-busy', 'true');
  });

  it('words the dots sentence with nothing required', () => {
    expect(dotsSentence(parseComplianceSummaryRow(SUMMARIES[3]))).toBe('Documents: nothing required. STCW and qualifications: nothing required.');
  });
});

describe('the profile documents tab (C24)', () => {
  const item = { rowId: 'r-pst', label: 'Personal survival techniques', state: 'missing' as const, sentence: 'Missing: nothing held counts for this requirement.', optionTypeIds: ['t-pst'] };

  it('"Missing required (n)" lists each with why and + Add', () => {
    const onAdd = vi.fn();
    render(<MissingRequiredBlock items={[item]} positionLabel="Deckhand" onAdd={onAdd} allHeld />);
    expect(screen.getByText('Missing required (1)')).toBeInTheDocument();
    expect(screen.getByText('for a Deckhand on this vessel')).toBeInTheDocument();
    expect(screen.getByText(item.sentence)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Personal survival techniques' }));
    expect(onAdd).toHaveBeenCalledWith(item);
  });

  it('says everything is held, offers no Add without the right, and retries a failed check', () => {
    const { rerender } = render(<MissingRequiredBlock items={[]} positionLabel="Deckhand" onAdd={null} allHeld />);
    expect(screen.getByText('Everything a Deckhand needs on this tab is held.')).toBeInTheDocument();
    rerender(<MissingRequiredBlock items={[item]} positionLabel={null} onAdd={null} />);
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull();
    const retry = vi.fn();
    rerender(<MissingRequiredBlock items={[]} positionLabel={null} onAdd={null} error={{ retry }} />);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retry).toHaveBeenCalled();
  });

  it('"Show empty slots" puts each missing requirement in its option\'s category, else "Required, not held"', () => {
    const catalogue = CATALOGUE;
    const groups = withEmptySlots(
      [{ key: 'passports', label: 'Passports', documents: [] }],
      [item, { ...item, rowId: 'r-x', label: 'Custom', optionTypeIds: [] }],
      catalogue,
      '__unclassified__',
    );
    expect(groups.map((g) => [g.key, (g.slots ?? []).map((s) => s.rowId)])).toEqual([
      ['passports', []],
      ['stcw_basic', ['r-pst']],
      [REQUIRED_GROUP_KEY, ['r-x']],
    ]);
  });
});

const type = (over: Partial<DocumentType> & { id: string; name: string; categoryKey: string }): DocumentType => ({
  companyId: null,
  tab: 'stcw',
  key: over.id,
  code: null,
  abbreviation: null,
  stcwReference: null,
  fieldSchema: {},
  defaultValidityMonths: null,
  endorsementIntervalMonths: null,
  itemType: 'crew_qualification',
  isIdentity: false,
  isMedicalFitness: false,
  isActive: true,
  sortOrder: 10,
  ...over,
});
const TYPES = [
  type({ id: 't-pp', name: 'Passport', categoryKey: 'passports', tab: 'documents', itemType: 'passport' }),
  type({ id: 't-pst', name: 'Personal survival techniques', categoryKey: 'stcw_basic', abbreviation: 'PST' }),
  type({ id: 't-basic', name: 'Basic safety training (combined certificate)', categoryKey: 'stcw_basic' }),
];
const CATALOGUE: DocumentCatalogue = {
  categories: [
    { key: 'passports', label: 'Passports', tab: 'documents', sortOrder: 10, isActive: true },
    { key: 'stcw_basic', label: 'STCW basic training', tab: 'stcw', sortOrder: 100, isActive: true },
  ],
  types: TYPES,
  byId: new Map(TYPES.map((t) => [t.id, t])),
};

describe('the add dialog\'s "Missing for current role" (C25)', () => {
  const renderDialog = (mode: React.ComponentProps<typeof AddDocumentDialog>['mode'], missing = [
    { rowId: 'r-pst', label: 'Personal survival techniques', tab: 'stcw' as const, state: 'missing' as const, optionTypeIds: ['t-pst', 't-basic'] },
    { rowId: 'r-pp', label: 'Passport', tab: 'documents' as const, state: 'expired' as const, optionTypeIds: [] },
  ]) =>
    render(
      <QueryClientProvider client={qc}>
        <AddDocumentDialog
          mode={mode}
          profileId="p-bosun"
          companyId={COMPANY}
          catalogue={CATALOGUE}
          documents={[]}
          uploadsReady
          missingForRole={missing}
          onOpenChange={() => undefined}
        />
      </QueryClientProvider>,
    );

  it('lists what the role still needs first, each with the types that satisfy it; picking one opens its form', async () => {
    renderDialog({ kind: 'add', tab: 'stcw' });
    const section = screen.getByRole('region', { name: /Missing for current role/ });
    expect(section.querySelector('[data-missing-for-role-row="r-pst"]')).toHaveTextContent('Personal survival techniquesMissing');
    expect(within(section).getByText('Find the document in the list below.')).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Add Basic safety training (combined certificate)' }));
    expect(await screen.findByRole('heading', { name: 'Add Basic safety training (combined certificate)' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-step', 'details');
  });

  it('a requirement with one option opens straight on its form (typeId)', () => {
    renderDialog({ kind: 'add', tab: 'stcw', typeId: 't-pst' });
    expect(screen.getByRole('heading', { name: 'Add Personal survival techniques' })).toBeInTheDocument();
  });

  it('no quick-add when nothing is missing', () => {
    renderDialog({ kind: 'add', tab: 'stcw' }, []);
    expect(screen.queryByRole('region', { name: /Missing for current role/ })).toBeNull();
  });
});

// Keep the act import used for React 18 warnings in fake-timer-free tests.
void act;
