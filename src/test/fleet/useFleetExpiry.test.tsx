/**
 * The fleet expiry hooks (gap/02 X2, D3; D-01; X5-01A followups):
 *
 * - keys carry the company id and the vessel ids (sorted), so two
 *   companies or two selections never share an entry;
 * - nothing is requested until the scope is known and the gate allows it;
 *   no vessels shown answers without a request;
 * - a missing RPC or table (`isMissingRelation`) is "not set up", cached
 *   and not retried; any other error is an error with a retry; 42501
 *   `vessel_out_of_reach` gets its own sentence; rows are never invented
 *   and an unreadable answer is an error;
 * - the window rules: defaults while the table is missing, the definers
 *   for writes, the returned row checked, refusals as sentences through
 *   notify(), the company's expiry queries invalidated;
 * - ExpiryBucketSummary: counts per bucket in the expiry tones, muted and
 *   endorsements apart, an honest "None due".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@/modules/fleet/lib/fleetDb', () => ({ fleetDb: db }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, success: toast.success, error: toast.error } };
});

import { fleetKeys, vesselIdsKey } from '@/modules/fleet/hooks/keys';
import {
  FleetExpiryError,
  VESSEL_OUT_OF_REACH_MESSAGE,
  normaliseExpiryItemsFilters,
  tallyExpirySummary,
  useFleetExpiryItems,
  useFleetExpirySummary,
  type FleetExpirySummaryEntry,
} from '@/modules/fleet/hooks/useFleetExpiry';
import {
  ExpiryWindowRuleError,
  useClearExpiryWindowRule,
  useExpiryWindowRules,
  useSetExpiryWindowRule,
} from '@/modules/fleet/hooks/useExpiryWindowRules';
import { ExpiryBucketSummary } from '@/modules/fleet/components/ExpiryBucketSummary';
import type { FleetExpiryItemRow, FleetExpirySummaryRow } from '@/modules/fleet/types/db.pending';

const COMPANY = 'c-1';
const SCOPE = { companyId: COMPANY, vesselIds: ['v-hyd', 'v-dra'] };
const TODAY = '2026-11-26';

const MISSING_RPC = { code: 'PGRST202', message: 'Could not find the function public.fleet_expiry_items' };
const MISSING_TABLE = { code: '42P01', message: 'relation "public.expiry_window_rules" does not exist' };
const BROKEN = { code: 'XX000', message: 'internal error' };

function client() {
  // The app's defaults (retry 1), so "not retried" is a real assertion.
  return new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 }, mutations: { retry: 0 } } });
}

function wrap(queryClient = client()) {
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { wrapper, queryClient };
}

const itemRow = (over: Partial<FleetExpiryItemRow> = {}): FleetExpiryItemRow => ({
  source_key: 'vessel_certificates',
  item_type: 'vessel_certificate',
  record_id: 'r-1',
  vessel_id: 'v-dra',
  vessel_name: 'DRAAK',
  vessel_code: 'DRA',
  profile_id: null,
  person_name: null,
  label: 'Safety Management Certificate',
  detail: 'Flag',
  expires_on: '2026-11-20',
  days_remaining: -6,
  bucket: 'expired',
  window_days: 90,
  endorsement_due_on: null,
  endorsement_state: null,
  alerts_muted: false,
  link_scope: 'vessel',
  link_rel: 'certificates',
  total_count: 2,
  ...over,
});

const summaryRow = (over: Partial<FleetExpirySummaryRow> = {}): FleetExpirySummaryRow => ({
  source_key: 'vessel_certificates',
  item_type: 'vessel_certificate',
  vessel_id: null,
  bucket: 'expired',
  endorsement_state: null,
  item_count: 1,
  muted_count: 0,
  ...over,
});

beforeEach(() => {
  db.rpc.mockReset();
  db.from.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => vi.clearAllMocks());

// ─── Keys ─────────────────────────────────────────────────────────────────

describe('fleetKeys', () => {
  const filters = normaliseExpiryItemsFilters({ today: TODAY });

  it('every key carries the company id; list and count keys carry the vessel ids, sorted', () => {
    const items = fleetKeys.expiry.items(COMPANY, ['v-hyd', 'v-dra', 'v-hyd'], filters);
    expect(items.slice(0, 5)).toEqual(['fleet', 'company', COMPANY, 'expiry', 'items']);
    expect(items[5]).toEqual(['v-dra', 'v-hyd']);
    expect(items[6]).toEqual(filters);
    const summary = fleetKeys.expiry.summary(COMPANY, ['v-hyd', 'v-dra'], true, TODAY);
    expect(summary).toEqual(['fleet', 'company', COMPANY, 'expiry', 'summary', ['v-dra', 'v-hyd'], { byVessel: true, today: TODAY }]);
    expect(fleetKeys.expiry.windows(COMPANY)).toEqual(['fleet', 'company', COMPANY, 'expiry', 'windows']);
    expect(vesselIdsKey(['b', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('two companies or two selections never share a key; every expiry key sits under expiry.all', () => {
    expect(fleetKeys.expiry.items('c-1', ['v'], filters)).not.toEqual(fleetKeys.expiry.items('c-2', ['v'], filters));
    expect(fleetKeys.expiry.items('c-1', ['v'], filters)).not.toEqual(fleetKeys.expiry.items('c-1', ['w'], filters));
    expect(fleetKeys.expiry.summary('c-1', ['v'], false, TODAY)).not.toEqual(fleetKeys.expiry.summary('c-1', ['v'], true, TODAY));
    const prefix = fleetKeys.expiry.all(COMPANY);
    for (const key of [fleetKeys.expiry.items(COMPANY, ['v'], filters), fleetKeys.expiry.summary(COMPANY, ['v'], false, TODAY), fleetKeys.expiry.windows(COMPANY)]) {
      expect(key.slice(0, prefix.length)).toEqual([...prefix]);
    }
    expect(fleetKeys.company(null)).toEqual(['fleet', 'company', 'none']);
  });

  it('normalises filters into one stable value', () => {
    expect(
      normaliseExpiryItemsFilters({ sources: ['b', 'a', 'b'], buckets: ['expiring', 'expired', 'expired'], search: '  pass  ', limit: 9999, offset: -3, today: TODAY }),
    ).toEqual({ sources: ['a', 'b'], buckets: ['expired', 'expiring'], search: 'pass', includeUnassigned: false, limit: 500, offset: 0, today: TODAY });
    expect(normaliseExpiryItemsFilters({ sources: [], buckets: [], search: '   ', limit: 0, today: TODAY })).toMatchObject({
      sources: null,
      buckets: null,
      search: null,
      limit: 1,
    });
    expect(normaliseExpiryItemsFilters().today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── Items ────────────────────────────────────────────────────────────────

describe('useFleetExpiryItems', () => {
  it('no scope, or a gate not open: idle, nothing requested', () => {
    const { wrapper } = wrap();
    expect(renderHook(() => useFleetExpiryItems(null), { wrapper }).result.current).toEqual({ state: 'idle' });
    expect(renderHook(() => useFleetExpiryItems(SCOPE, {}, { enabled: false }), { wrapper }).result.current).toEqual({ state: 'idle' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('no vessels shown: no_vessels, nothing requested', () => {
    const { wrapper } = wrap();
    expect(renderHook(() => useFleetExpiryItems({ companyId: COMPANY, vesselIds: [] }), { wrapper }).result.current).toEqual({ state: 'no_vessels' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('sends the vessel ids and filters, maps the rows, keeps the server total', async () => {
    db.rpc.mockResolvedValue({ data: [itemRow(), itemRow({ record_id: 'r-2', bucket: 'expiring_soon', days_remaining: 4, endorsement_state: 'due', endorsement_due_on: '2026-12-01' })], error: null });
    const { wrapper, queryClient } = wrap();
    const { result } = renderHook(() => useFleetExpiryItems(SCOPE, { buckets: ['expired', 'expiring_soon'], search: 'safety', today: TODAY, limit: 50 }), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(db.rpc).toHaveBeenCalledWith('fleet_expiry_items', {
      p_vessel_ids: ['v-hyd', 'v-dra'],
      p_sources: null,
      p_buckets: ['expired', 'expiring_soon'],
      p_search: 'safety',
      p_include_unassigned: false,
      p_limit: 50,
      p_offset: 0,
      p_today: TODAY,
    });
    if (result.current.state !== 'ready') throw new Error('not ready');
    expect(result.current.data.total).toBe(2);
    expect(result.current.data.items[1]).toMatchObject({ recordId: 'r-2', bucket: 'expiring_soon', daysRemaining: 4, endorsementState: 'due', vesselCode: 'DRA', linkScope: 'vessel', linkRel: 'certificates' });
    // The cache entry is keyed by the company and the vessels.
    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toHaveLength(1);
    expect(keys[0].slice(0, 6)).toEqual(['fleet', 'company', COMPANY, 'expiry', 'items', ['v-dra', 'v-hyd']]);
  });

  it('an empty answer is an empty list, never invented rows', async () => {
    db.rpc.mockResolvedValue({ data: [], error: null });
    const { wrapper } = wrap();
    const { result } = renderHook(() => useFleetExpiryItems(SCOPE, { today: TODAY }), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current).toMatchObject({ data: { items: [], total: 0 } });
  });

  it('missing RPC: not set up, asked once (not retried)', async () => {
    db.rpc.mockResolvedValue({ data: null, error: MISSING_RPC });
    const { wrapper } = wrap();
    const { result } = renderHook(() => useFleetExpiryItems(SCOPE, { today: TODAY }), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ state: 'not_set_up' }));
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('any other error: error with a retry that asks again', async () => {
    db.rpc.mockResolvedValue({ data: null, error: BROKEN });
    const { wrapper } = wrap();
    const { result } = renderHook(() => useFleetExpiryItems(SCOPE, { today: TODAY }), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(db.rpc).toHaveBeenCalledTimes(2); // the app's one retry
    if (result.current.state !== 'error') throw new Error('not error');
    expect(result.current.error).toBe(BROKEN);
    db.rpc.mockResolvedValue({ data: [itemRow()], error: null });
    result.current.retry();
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });

  it('42501 vessel_out_of_reach: its own sentence, not retried', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'vessel_out_of_reach' } });
    const { wrapper } = wrap();
    const { result } = renderHook(() => useFleetExpiryItems(SCOPE, { today: TODAY }), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(db.rpc).toHaveBeenCalledTimes(1);
    if (result.current.state !== 'error') throw new Error('not error');
    expect(result.current.error).toBeInstanceOf(FleetExpiryError);
    expect((result.current.error as FleetExpiryError).message).toBe(VESSEL_OUT_OF_REACH_MESSAGE);
    expect((result.current.error as FleetExpiryError).reason).toBe('vessel_out_of_reach');
  });

  it('an answer this client cannot read (an unknown bucket) is an error, not a guess', async () => {
    db.rpc.mockResolvedValue({ data: [itemRow({ bucket: 'overdue' as never })], error: null });
    const { wrapper } = wrap();
    const { result } = renderHook(() => useFleetExpiryItems(SCOPE, { today: TODAY }), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('error'));
    if (result.current.state !== 'error') throw new Error('not error');
    expect((result.current.error as FleetExpiryError).reason).toBe('unknown_bucket');
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────

describe('useFleetExpirySummary', () => {
  it('sends the vessel ids, maps the counts (bigint strings included)', async () => {
    db.rpc.mockResolvedValue({ data: [summaryRow({ item_count: '3' as never, muted_count: 1 }), summaryRow({ bucket: 'expiring', endorsement_state: 'overdue', item_count: 2 })], error: null });
    const { wrapper } = wrap();
    const { result } = renderHook(() => useFleetExpirySummary(SCOPE, { byVessel: true, today: TODAY }), { wrapper });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(db.rpc).toHaveBeenCalledWith('fleet_expiry_summary', { p_vessel_ids: ['v-hyd', 'v-dra'], p_by_vessel: true, p_today: TODAY });
    if (result.current.state !== 'ready') throw new Error('not ready');
    expect(result.current.data).toEqual([
      { sourceKey: 'vessel_certificates', itemType: 'vessel_certificate', vesselId: null, bucket: 'expired', endorsementState: null, itemCount: 3, mutedCount: 1 },
      { sourceKey: 'vessel_certificates', itemType: 'vessel_certificate', vesselId: null, bucket: 'expiring', endorsementState: 'overdue', itemCount: 2, mutedCount: 0 },
    ]);
  });

  it('missing RPC: not set up; other error: error; gate closed: idle', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: MISSING_RPC });
    const first = renderHook(() => useFleetExpirySummary(SCOPE, { today: TODAY }), { wrapper: wrap().wrapper });
    await waitFor(() => expect(first.result.current).toEqual({ state: 'not_set_up' }));

    db.rpc.mockResolvedValue({ data: null, error: BROKEN });
    const second = renderHook(() => useFleetExpirySummary(SCOPE, { today: TODAY }), { wrapper: wrap().wrapper });
    await waitFor(() => expect(second.result.current.state).toBe('error'));

    db.rpc.mockClear();
    const closed = renderHook(() => useFleetExpirySummary(SCOPE, { today: TODAY }, { enabled: false }), { wrapper: wrap().wrapper });
    expect(closed.result.current).toEqual({ state: 'idle' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('tallies per bucket and endorsement, muted apart', () => {
    const entries: FleetExpirySummaryEntry[] = [
      { sourceKey: 'a', itemType: 'passport', vesselId: 'v', bucket: 'expired', endorsementState: null, itemCount: 2, mutedCount: 1 },
      { sourceKey: 'b', itemType: 'vessel_certificate', vesselId: 'v', bucket: 'valid', endorsementState: 'overdue', itemCount: 1, mutedCount: 0 },
      { sourceKey: 'b', itemType: 'vessel_certificate', vesselId: 'w', bucket: 'expiring', endorsementState: 'due', itemCount: 4, mutedCount: 2 },
    ];
    expect(tallyExpirySummary(entries)).toEqual({
      buckets: { expired: 2, expiring_soon: 0, expiring: 4, valid: 1, no_expiry: 0 },
      endorsements: { overdue: 1, due: 4 },
      muted: 3,
      total: 7,
    });
    expect(tallyExpirySummary(entries, (e) => e.vesselId === 'w').total).toBe(4);
  });
});

// ─── Window rules ─────────────────────────────────────────────────────────

/** A `from('expiry_window_rules')` chain that answers `result`. */
function rulesQuery(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  db.from.mockReturnValue(chain);
  return chain;
}

describe('useExpiryWindowRules', () => {
  it('reads only the columns it needs, for the company', async () => {
    const chain = rulesQuery({ data: [{ id: 'w1', company_id: COMPANY, item_type: 'passport', certificate_type_id: null, warn_days: 365, updated_at: '2026-11-01T00:00:00Z' }], error: null });
    const { result } = renderHook(() => useExpiryWindowRules(COMPANY), { wrapper: wrap().wrapper });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(db.from).toHaveBeenCalledWith('expiry_window_rules');
    expect(chain.select).toHaveBeenCalledWith('id, company_id, item_type, certificate_type_id, warn_days, updated_at');
    expect(chain.eq).toHaveBeenCalledWith('company_id', COMPANY);
    if (result.current.state !== 'ready') throw new Error('not ready');
    expect(result.current.windowFor({ itemType: 'passport' })).toBe(365);
    expect(result.current.windowFor({ itemType: 'visa' })).toBe(90);
  });

  it('missing table: not set up, with the default windows (passports 270, others 90)', async () => {
    rulesQuery({ data: null, error: MISSING_TABLE });
    const { result } = renderHook(() => useExpiryWindowRules(COMPANY), { wrapper: wrap().wrapper });
    await waitFor(() => expect(result.current.state).toBe('not_set_up'));
    if (result.current.state !== 'not_set_up') throw new Error('not not_set_up');
    expect(result.current.windowFor({ itemType: 'passport' })).toBe(270);
    expect(result.current.windowFor({ itemType: 'vessel_certificate' })).toBe(90);
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it('other error: error; no company: idle', async () => {
    rulesQuery({ data: null, error: BROKEN });
    const { result } = renderHook(() => useExpiryWindowRules(COMPANY), { wrapper: wrap().wrapper });
    await waitFor(() => expect(result.current.state).toBe('error'));
    db.from.mockClear();
    expect(renderHook(() => useExpiryWindowRules(null), { wrapper: wrap().wrapper }).result.current).toEqual({ state: 'idle' });
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('useSetExpiryWindowRule / useClearExpiryWindowRule', () => {
  const stored = { id: 'w1', company_id: COMPANY, item_type: 'passport', certificate_type_id: null, warn_days: 180, created_by: 'u', updated_by: 'u', created_at: 'x', updated_at: 'x' };

  it('saves through the definer, checks the stored row, toasts, invalidates the company\'s expiry queries', async () => {
    db.rpc.mockResolvedValue({ data: stored, error: null });
    const { wrapper, queryClient } = wrap();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSetExpiryWindowRule(COMPANY), { wrapper });
    await expect(result.current.mutateAsync({ itemType: 'passport', warnDays: 180 })).resolves.toEqual(stored);
    expect(db.rpc).toHaveBeenCalledWith('set_expiry_window_rule', { p_item_type: 'passport', p_certificate_type_id: null, p_warn_days: 180 });
    expect(toast.success).toHaveBeenCalledWith('Passports: warning window set to 180 days');
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: fleetKeys.expiry.all(COMPANY) }));
  });

  it('a stored row that is not what was asked is not a save', async () => {
    db.rpc.mockResolvedValue({ data: { ...stored, warn_days: 90 }, error: null });
    const { result } = renderHook(() => useSetExpiryWindowRule(COMPANY), { wrapper: wrap().wrapper });
    await expect(result.current.mutateAsync({ itemType: 'passport', warnDays: 180 })).rejects.toMatchObject({ reason: 'rule_not_saved' });
    db.rpc.mockResolvedValue({ data: null, error: null });
    await expect(result.current.mutateAsync({ itemType: 'passport', warnDays: 180 })).rejects.toBeInstanceOf(ExpiryWindowRuleError);
    db.rpc.mockResolvedValue({ data: { ...stored, company_id: 'c-other' }, error: null });
    await expect(result.current.mutateAsync({ itemType: 'passport', warnDays: 180 })).rejects.toMatchObject({ reason: 'rule_not_saved' });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(3);
  });

  it('checks the input first: no request for a bad window', async () => {
    const { result } = renderHook(() => useSetExpiryWindowRule(COMPANY), { wrapper: wrap().wrapper });
    await expect(result.current.mutateAsync({ itemType: 'passport', warnDays: 2000 })).rejects.toMatchObject({
      reason: 'invalid_warn_days',
      message: 'Enter a whole number of days from 0 to 1095.',
    });
    await expect(result.current.mutateAsync({ itemType: 'nonsense' as never, warnDays: 10 })).rejects.toMatchObject({ reason: 'invalid_item_type' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('maps the definer refusals (22023, 42501, P0002) and a missing RPC to sentences through notify()', async () => {
    const { result } = renderHook(() => useSetExpiryWindowRule(COMPANY), { wrapper: wrap().wrapper });
    const cases: [object, string][] = [
      [{ code: '22023', message: 'invalid_warn_days' }, 'Enter a whole number of days from 0 to 1095.'],
      [{ code: '42501', message: 'not_permitted' }, 'You do not have permission to change expiry windows.'],
      [{ code: 'P0002', message: 'rule_not_saved' }, 'The window was not saved. Refresh to see the current windows, then try again.'],
      [MISSING_RPC, 'Expiry windows cannot be changed yet: this part of STORM is not set up.'],
    ];
    for (const [error, sentence] of cases) {
      toast.error.mockClear();
      db.rpc.mockResolvedValue({ data: null, error });
      await expect(result.current.mutateAsync({ itemType: 'passport', warnDays: 180 })).rejects.toMatchObject({ message: sentence });
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
      expect(toast.error.mock.calls[0][0]).toMatchObject({ message: sentence });
      expect(toast.error.mock.calls[0][1]).toEqual({ title: 'Could not save the expiry window' });
    }
  });

  it('an unknown error is passed on as it is', async () => {
    db.rpc.mockResolvedValue({ data: null, error: BROKEN });
    const { result } = renderHook(() => useSetExpiryWindowRule(COMPANY), { wrapper: wrap().wrapper });
    await expect(result.current.mutateAsync({ itemType: 'passport', warnDays: 180 })).rejects.toBe(BROKEN);
  });

  it('clears through the definer; rule_not_found is a sentence', async () => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    const { wrapper, queryClient } = wrap();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useClearExpiryWindowRule(COMPANY), { wrapper });
    await result.current.mutateAsync('w1');
    expect(db.rpc).toHaveBeenCalledWith('clear_expiry_window_rule', { p_rule_id: 'w1' });
    expect(toast.success).toHaveBeenCalledWith('Warning window reset to the default');
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: fleetKeys.expiry.all(COMPANY) }));

    db.rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'rule_not_found' } });
    await expect(result.current.mutateAsync('w-gone')).rejects.toMatchObject({
      message: 'That window rule no longer exists. Refresh to see the current windows.',
    });
  });
});

// ─── ExpiryBucketSummary ──────────────────────────────────────────────────

describe('ExpiryBucketSummary', () => {
  const entries: FleetExpirySummaryEntry[] = [
    { sourceKey: 'a', itemType: 'passport', vesselId: null, bucket: 'expired', endorsementState: null, itemCount: 2, mutedCount: 1 },
    { sourceKey: 'b', itemType: 'vessel_certificate', vesselId: null, bucket: 'expiring', endorsementState: 'overdue', itemCount: 5, mutedCount: 0 },
    { sourceKey: 'b', itemType: 'vessel_certificate', vesselId: null, bucket: 'valid', endorsementState: null, itemCount: 40, mutedCount: 0 },
  ];

  const renderSummary = (ui: React.ReactElement) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>);

  it('one pill per alert bucket with items, most urgent first, in the expiry tones; endorsements and muted apart', () => {
    renderSummary(<ExpiryBucketSummary entries={entries} />);
    const list = screen.getByRole('list', { name: 'Expiry summary' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Expired · 2', 'Due ≤ window · 5', 'Endorsement overdue · 5', 'Alerts off · 1']);
    expect(items[0].querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('danger');
    expect(items[1].querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('warn');
    expect(items[2].querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('danger');
    expect(items[3].querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('neutral');
    // Valid is not an alert bucket.
    expect(list.querySelector('[data-bucket="valid"]')).toBeNull();
  });

  it('"None due" only when nothing is due (an honest zero)', () => {
    renderSummary(<ExpiryBucketSummary entries={[entries[2]]} />);
    expect(screen.getByText('None due').closest('[data-tone]')?.getAttribute('data-tone')).toBe('ok');
  });

  it('shows the buckets asked for, and links a pill to its list', () => {
    renderSummary(<ExpiryBucketSummary entries={entries} buckets={['valid', 'expired']} showEndorsements={false} showMuted={false} bucketHref={(b) => (b === 'expired' ? '/fleet/reports/fleet-certificates?bucket=expired' : null)} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Expired · 2', 'Valid · 40']);
    const link = screen.getByRole('link', { name: 'Expired: 2. Open the list' });
    expect(link.getAttribute('href')).toBe('/fleet/reports/fleet-certificates?bucket=expired');
  });
});
