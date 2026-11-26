/**
 * Fleet certificates (gap/02 R3; src/modules/reports/reports/
 * FleetCertificatesReport.tsx, components/ExpiryItemsReport.tsx,
 * lib/expiryReports.ts):
 *
 * - pure: the buckets a Status and the show-valid toggle ask for, the tile
 *   links, the page in the URL and where a page sits ("Showing 101–200 of
 *   250"), the search, safe item links, the export columns (no person);
 * - the page: one page of `fleet_expiry_items` for the vessel certificates
 *   source over the vessels shown (explicit ids, 100 a page, the due
 *   buckets by default), show-valid asks for every bucket, Status for one,
 *   the search applies with Enter and goes back to page 1, Next and
 *   Previous move through the server's pages, an empty page past the end
 *   says so; tiles per bucket and endorsement from the summary (this
 *   source only) linking to the filtered list; Verified "—" until the
 *   certificate register's source; not set up (D-01); an error with
 *   Retry; cards below 768 px; the warning window line and "Alert
 *   windows" only for admins; Export of the rows on screen.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('@/modules/fleet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/fleet')>()),
  useFleetVesselsShown: () => state.shown,
  FleetVesselsFilter: () => <button type="button">Vessels shown</button>,
}));

import FleetCertificatesReport from '@/modules/reports/reports/FleetCertificatesReport';
import { getReport, type ReportDefinition } from '@/modules/reports/registry';
import {
  CERTIFICATE_EXPORT_COLUMNS,
  EXPIRY_REPORT_PAGE_SIZE,
  bucketTileParams,
  bucketsFor,
  expiryItemHref,
  isSafeRelativePath,
  pageInfo,
  pageSummaryText,
  parsePage,
  readSearch,
  writeSearchAndPage,
} from '@/modules/reports/lib/expiryReports';
import { buildExportTable } from '@/lib/export';
import { toFleetExpiryItem } from '@/modules/fleet/hooks/useFleetExpiry';
import type { FleetExpiryItemRow } from '@/modules/fleet/types/db.pending';

const DEF = getReport('fleet-certificates', 'fleet') as ReportDefinition;
const VESSELS = [
  { id: 'v-dra', name: 'DRAAK', code: 'DRA' },
  { id: 'v-gam', name: 'GAME CHANGER', code: 'GAM' },
];

function cert(n: number, overrides: Partial<FleetExpiryItemRow> = {}): FleetExpiryItemRow {
  return {
    source_key: 'vessel_certificates',
    item_type: 'vessel_certificate',
    record_id: `c-${n}`,
    vessel_id: 'v-dra',
    vessel_name: 'DRAAK',
    vessel_code: 'DRA',
    profile_id: null,
    person_name: null,
    label: `Certificate ${n}`,
    detail: `No ${n} · Flag administration`,
    expires_on: '2026-12-01',
    days_remaining: 5,
    bucket: 'expiring_soon',
    window_days: 90,
    endorsement_due_on: null,
    endorsement_state: null,
    alerts_muted: false,
    link_scope: 'vessel',
    link_rel: 'certificates',
    total_count: 3,
    ...overrides,
  };
}

const ROWS: FleetExpiryItemRow[] = [
  cert(1, { label: 'International Oil Pollution Prevention Certificate', vessel_id: 'v-gam', vessel_name: 'GAME CHANGER', vessel_code: 'GAM', bucket: 'expired', days_remaining: -3, expires_on: '2026-11-23' }),
  cert(2, { label: 'Safety Management Certificate', endorsement_due_on: '2026-11-20', endorsement_state: 'overdue' }),
  cert(3, { label: 'Maritime Labour Certificate', bucket: 'expiring', days_remaining: 60, expires_on: '2027-01-25', alerts_muted: true }),
];

const SUMMARY = [
  { source_key: 'vessel_certificates', item_type: 'vessel_certificate', vessel_id: null, bucket: 'expired', endorsement_state: null, item_count: 1, muted_count: 0 },
  { source_key: 'vessel_certificates', item_type: 'vessel_certificate', vessel_id: null, bucket: 'expiring_soon', endorsement_state: 'overdue', item_count: 1, muted_count: 0 },
  { source_key: 'vessel_certificates', item_type: 'vessel_certificate', vessel_id: null, bucket: 'expiring', endorsement_state: null, item_count: 0, muted_count: 1 },
  { source_key: 'vessel_certificates', item_type: 'vessel_certificate', vessel_id: null, bucket: 'valid', endorsement_state: null, item_count: 12, muted_count: 0 },
  // Another source's counts never reach this report's tiles.
  { source_key: 'crew_certificates_legacy', item_type: 'crew_qualification', vessel_id: null, bucket: 'expired', endorsement_state: null, item_count: 40, muted_count: 0 },
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

function renderReport(url = '/fleet/reports/fleet-certificates') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/fleet/reports/:reportKey" element={<FleetCertificatesReport definition={DEF} />} />
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
});

// ─── Pure ───────────────────────────────────────────────────────────────

describe('fleet certificates (pure)', () => {
  it('asks for the due buckets by default, one bucket by Status, and adds valid items with the toggle', () => {
    expect(bucketsFor({ status: 'due', valid: 'hidden' })).toEqual(['expired', 'expiring_soon', 'expiring']);
    expect(bucketsFor({ status: 'due', valid: 'shown' })).toBeNull();
    expect(bucketsFor({ status: 'expired', valid: 'hidden' })).toEqual(['expired']);
    expect(bucketsFor({ status: 'expiring', valid: 'shown' })).toEqual(['expiring', 'valid', 'no_expiry']);
    // A hand-edited value reads as every due bucket.
    expect(bucketsFor({ status: 'valid', valid: 'nope' })).toEqual(['expired', 'expiring_soon', 'expiring']);
  });

  it('builds a tile link that filters to its bucket and goes back to page 1', () => {
    const base = new URLSearchParams('vessels=DRA&page=3&q=load');
    expect(bucketTileParams(base, 'expired').toString()).toBe('vessels=DRA&q=load&status=expired');
    expect(bucketTileParams(new URLSearchParams('status=expired&valid=hidden'), 'expiring').toString()).toBe('status=expiring');
    expect(bucketTileParams(new URLSearchParams('status=expired'), 'valid').toString()).toBe('valid=shown');
  });

  it('reads the page and the search from the URL and writes them back', () => {
    expect(parsePage('3')).toBe(3);
    for (const v of [null, '', '0', '-2', '1.5', 'x', '01']) expect(parsePage(v)).toBe(1);
    expect(readSearch('  load line  ')).toBe('load line');
    expect(readSearch('x'.repeat(300))).toHaveLength(200);
    expect(writeSearchAndPage(new URLSearchParams('vessels=DRA'), ' smc ', 2).toString()).toBe('vessels=DRA&q=smc&page=2');
    expect(writeSearchAndPage(new URLSearchParams('q=smc&page=2'), '', 1).toString()).toBe('');
    expect(writeSearchAndPage(new URLSearchParams('q=smc&page=2'), null, 3).toString()).toBe('q=smc&page=3');
  });

  it('places a page in the list, and an empty page after the first is past the end', () => {
    expect(EXPIRY_REPORT_PAGE_SIZE).toBe(100);
    const first = pageInfo(1, 100, 250);
    expect(first).toMatchObject({ from: 1, to: 100, pages: 3, hasPrevious: false, hasNext: true, pastEnd: false });
    expect(pageSummaryText(first, { one: 'certificate', other: 'certificates' })).toBe('Showing 1–100 of 250 certificates');
    const last = pageInfo(3, 50, 250);
    expect(last).toMatchObject({ from: 201, to: 250, hasNext: false, hasPrevious: true });
    expect(pageSummaryText(pageInfo(1, 1, 1), { one: 'certificate', other: 'certificates' })).toBe('Showing 1 of 1 certificate');
    expect(pageInfo(4, 0, 0)).toMatchObject({ pastEnd: true, hasNext: false, hasPrevious: true });
    expect(pageInfo(1, 0, 0)).toMatchObject({ pastEnd: false, hasNext: false, hasPrevious: false });
  });

  it('links an item inside its scope only, never with an unsafe path', () => {
    const item = toFleetExpiryItem(ROWS[0]);
    expect(expiryItemHref(item)).toBe('/v/gam/certificates');
    expect(expiryItemHref({ ...item, linkScope: 'fleet', linkRel: 'reports/insurance' })).toBe('/fleet/reports/insurance');
    expect(expiryItemHref({ ...item, linkScope: 'workspace', linkRel: 'hris/employee-records' })).toBeNull();
    expect(expiryItemHref({ ...item, vesselCode: null })).toBeNull();
    for (const bad of ['/certificates', '../x', 'a//b', 'javascript:alert(1)', 'a\\b', '%2e%2e/x', 'a b', '']) expect(isSafeRelativePath(bad), bad).toBe(false);
    expect(isSafeRelativePath('crew/people/p-1/documents')).toBe(true);
  });

  it('exports vessel, certificate and dates with no person on them', () => {
    const table = buildExportTable(CERTIFICATE_EXPORT_COLUMNS, ROWS.map(toFleetExpiryItem));
    expect(table.headers).toEqual([
      'Vessel', 'Code', 'Certificate', 'Number and authority', 'Expires', 'Days left', 'Status', 'Warning window (days)', 'Endorsement due', 'Endorsement', 'Alerts',
    ]);
    expect(table.rows[1]).toEqual(['DRAAK', 'DRA', 'Safety Management Certificate', 'No 2 · Flag administration', '2026-12-01', 5, '≤ 30 d', 90, '2026-11-20', 'Endorsement overdue', 'On']);
    expect(table.rows[2].at(-1)).toBe('Off');
    expect(table.headers.join(' ')).not.toMatch(/Person|Name of/);
  });
});

// ─── The page ───────────────────────────────────────────────────────────

describe('Fleet certificates page', () => {
  it('reads one page of the vessel certificates source for the vessels shown, due buckets first', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(lastItemsCall()).toMatchObject({
      p_vessel_ids: ['v-dra', 'v-gam'],
      p_sources: ['vessel_certificates'],
      p_buckets: ['expired', 'expiring_soon', 'expiring'],
      p_search: null,
      p_include_unassigned: false,
      p_limit: 100,
      p_offset: 0,
    });
    const first = bodyRows()[0];
    expect(within(first).getByRole('link', { name: 'GAME CHANGER' })).toHaveAttribute('href', '/v/gam');
    expect(within(first).getByRole('link', { name: /International Oil Pollution Prevention Certificate on GAME CHANGER/ })).toHaveAttribute('href', '/v/gam/certificates');
    expect(within(first).getByText('Expired')).toBeInTheDocument();
    expect(within(bodyRows()[1]).getByText('Endorsement overdue')).toBeInTheDocument();
    expect(within(bodyRows()[2]).getByText('Alerts off')).toBeInTheDocument();
    // Verified waits for the certificate register's own source: the explained dash.
    expect(screen.getByRole('columnheader', { name: /Verified/ })).toBeInTheDocument();
    expect(screen.getByText('Showing 1–3 of 3 certificates')).toBeInTheDocument();
    expect(screen.getByTestId('report-generated')).toHaveTextContent(/^Fleet · generated /);
    // No person column in a report without personal data.
    expect(screen.queryByRole('columnheader', { name: /Person/ })).toBeNull();
  });

  it('shows bucket and endorsement tiles from this source’s counts, each bucket linking to its filtered list', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport('/fleet/reports/fleet-certificates?vessels=DRA');
    const summary = await screen.findByRole('region', { name: 'Expiry summary' });
    await within(summary).findByRole('link', { name: /Expired/ });
    const labels = ['Expired', 'Endorsement late', 'Expiring ≤ 30 d', 'Endorsement due', 'Due ≤ window', 'Valid'];
    for (const label of labels) expect(within(summary).getByText(label)).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: /Expired/ })).toHaveAttribute('href', '/fleet/reports/fleet-certificates?vessels=DRA&status=expired');
    expect(within(summary).getByRole('link', { name: /Valid/ })).toHaveAttribute('href', '/fleet/reports/fleet-certificates?vessels=DRA&valid=shown');
    // 40 crew items of another source are not counted here.
    expect(within(summary).queryByText('40')).toBeNull();
    expect(within(summary).getByText('12')).toBeInTheDocument();
    expect(within(summary).getByText(/1 item has alerts switched off/)).toBeInTheDocument();
  });

  it('show valid asks for every bucket; Status for one; both from the URL', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport('/fleet/reports/fleet-certificates?valid=shown');
    await screen.findByRole('table');
    expect(lastItemsCall()).toMatchObject({ p_buckets: null });
    cleanup();
    state.rpc.mockClear();
    renderReport('/fleet/reports/fleet-certificates?status=expired');
    await screen.findByRole('table');
    await waitFor(() => expect(lastItemsCall()).toMatchObject({ p_buckets: ['expired'] }));
  });

  it('applies the search with Enter and goes back to page 1, keeping the other parameters', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport('/fleet/reports/fleet-certificates?vessels=DRA&page=2');
    await screen.findByRole('search', { name: 'Report filters' });
    const box = screen.getByRole('searchbox', { name: 'Certificate' });
    fireEvent.change(box, { target: { value: 'load line' } });
    expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
    fireEvent.submit(screen.getByRole('search', { name: 'Report filters' }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/fleet-certificates?vessels=DRA&q=load+line'));
    await waitFor(() => expect(lastItemsCall()).toMatchObject({ p_search: 'load line', p_offset: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/fleet-certificates?vessels=DRA'));
  });

  it('pages through the server’s list with Next and Previous', async () => {
    state.shown = shownReady();
    state.answers = {
      fleet_expiry_items: (args) => {
        const offset = Number(args.p_offset);
        const count = offset >= 200 ? 50 : 100;
        return { data: Array.from({ length: count }, (_, i) => cert(offset + i + 1, { total_count: 250 })), error: null };
      },
      fleet_expiry_summary: { data: SUMMARY, error: null },
    };
    state.tables = { expiry_window_rules: { data: [], error: null } };
    renderReport();
    await screen.findByText('Showing 1–100 of 250 certificates');
    const pages = screen.getByRole('navigation', { name: 'Fleet certificates pages' });
    expect(within(pages).getByText('Page 1 of 3')).toBeInTheDocument();
    expect(within(pages).getByRole('button', { name: /Previous/ })).toBeDisabled();
    fireEvent.click(within(pages).getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/fleet-certificates?page=2'));
    await screen.findByText('Showing 101–200 of 250 certificates');
    expect(lastItemsCall()).toMatchObject({ p_offset: 100, p_limit: 100 });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Fleet certificates pages' })).getByRole('button', { name: /Next/ }));
    await screen.findByText('Showing 201–250 of 250 certificates');
    expect(within(screen.getByRole('navigation', { name: 'Fleet certificates pages' })).getByRole('button', { name: /Next/ })).toBeDisabled();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Fleet certificates pages' })).getByRole('button', { name: /Previous/ }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/fleet-certificates?page=2'));
  });

  it('an empty page past the end says so, never "nothing due", and offers the first page', async () => {
    state.shown = shownReady();
    answerAll([]);
    renderReport('/fleet/reports/fleet-certificates?page=9');
    expect(await screen.findByText('This page is past the end of the list')).toBeInTheDocument();
    expect(screen.queryByText('No certificates due')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'First page' }));
    await waitFor(() => expect(location()).toBe('/fleet/reports/fleet-certificates'));
  });

  it('says "No certificates due" for an empty first page with the default filters', async () => {
    state.shown = shownReady();
    answerAll([]);
    renderReport();
    expect(await screen.findByText('No certificates due')).toBeInTheDocument();
  });

  it('says "This report is not set up yet" while the engine is missing (D-01), never sample rows', async () => {
    state.shown = shownReady();
    state.answers = { fleet_expiry_items: MISSING_RPC('fleet_expiry_items'), fleet_expiry_summary: MISSING_RPC('fleet_expiry_summary') };
    renderReport();
    expect(await screen.findByText('This report is not set up yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: /Export/ })).toHaveAccessibleDescription('This report is not set up yet.');
  });

  it('an error says so with a Retry that reads again', async () => {
    state.shown = shownReady();
    let calls = 0;
    state.answers = {
      fleet_expiry_items: () => {
        calls += 1;
        return calls <= 2 ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: ROWS, error: null };
      },
      fleet_expiry_summary: { data: SUMMARY, error: null },
    };
    state.tables = { expiry_window_rules: { data: [], error: null } };
    renderReport();
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }));
    expect(await screen.findByText('Safety Management Certificate')).toBeInTheDocument();
  });

  it('a vessel out of reach gets its own sentence and is not retried', async () => {
    state.shown = shownReady();
    state.answers = {
      fleet_expiry_items: { data: null, error: { code: '42501', message: 'vessel_out_of_reach' } },
      fleet_expiry_summary: { data: SUMMARY, error: null },
    };
    state.tables = { expiry_window_rules: { data: [], error: null } };
    renderReport();
    expect(await screen.findByText(/no longer in your reach/)).toBeInTheDocument();
    expect(callsOf('fleet_expiry_items')).toHaveLength(1);
  });

  it('folds into one card per certificate below 768 px', async () => {
    state.wide = false;
    state.shown = shownReady();
    answerAll();
    renderReport();
    const list = await screen.findByRole('list', { name: 'Fleet certificates' });
    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText('GAME CHANGER')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Endorsement overdue')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–3 of 3 certificates')).toBeInTheDocument();
  });

  it('shows the vessel certificates warning window, and Alert windows only to admins', async () => {
    state.shown = shownReady();
    answerAll();
    state.decide = (key) => (key === 'fleet.operations.fleet_reports.admin' ? { allowed: false, status: 'denied', reason: '' } : { allowed: true, status: 'granted', reason: '' });
    renderReport();
    const windows = await screen.findByRole('list', { name: 'Warning windows' });
    expect(windows).toHaveTextContent('Vessel certificates 90 days (default)');
    expect(screen.queryByRole('button', { name: /Alert windows/ })).toBeNull();
    cleanup();
    state.decide = () => ({ allowed: true, status: 'granted', reason: '' });
    state.tables = {
      expiry_window_rules: { data: [{ id: 'r1', company_id: 'co-1', item_type: 'vessel_certificate', certificate_type_id: null, warn_days: 120, updated_at: '2026-11-01T00:00:00Z' }], error: null },
    };
    renderReport();
    expect(await screen.findByRole('list', { name: 'Warning windows' })).toHaveTextContent('Vessel certificates 120 days');
    fireEvent.click(screen.getByRole('button', { name: /Alert windows/ }));
    expect(await screen.findByRole('dialog', { name: 'Alert windows' })).toBeInTheDocument();
  });

  it('exports the rows on screen through the engine once they are ready', async () => {
    state.shown = shownReady();
    answerAll();
    renderReport();
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).not.toHaveAttribute('aria-disabled'));
  });
});
