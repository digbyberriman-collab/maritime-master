/**
 * The planner page (X1-09B; gap/04 C47, C48, C49, C50, C52, C4, W7;
 * DECISIONS R2, D-01, D-X1-10):
 *
 * - the model: tabs, the remembered zoom (a storage that throws), windows,
 *   day and month columns, bar geometry and drags, crew rows, manning gap
 *   rows, day types, what may be changed; the forms (Add leave, a period,
 *   the toggle) and their refusals;
 * - the page: the gate (loading: nothing read; denied: AccessDenied),
 *   the vessel's label ("Leave"), an unknown tab lands on the timeline;
 *   the engine missing (D-01): the legacy bodies under the notice, no
 *   Configuration; any other error: PageError with Retry;
 * - Timeline: bars "type · length", manning gap rows, a period refusal,
 *   Add leave sending planner_add_leave; Manning: the On board total, a
 *   person's day codes, "qualified / aboard" per position; Requests: the
 *   decisions an approver may take and crew_leave_request_decide with a
 *   reason; Configuration: read only without the admin key, a save that
 *   sends only the changed position and refuses an incomplete write;
 * - the fleet planner: one read per vessel lane, a denied vessel says so.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LEAVE_TYPES } from '@/modules/rotation-planner/lib/leaveTypes';
import { addDays } from '@/modules/rotation-planner/lib/duration';

const TODAY = '2026-11-27';
const COMPANY = 'c-1';
const VESSEL = 'v-dra';

const h = vi.hoisted(() => ({
  caps: { mode: 'granted' as 'granted' | 'loading' | 'denied', denied: new Set<string>(), deniedVessels: new Set<string>() },
  rpc: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  fromCalls: [] as string[],
  scope: { scope: 'vessel' } as Record<string, unknown>,
  label: null as string | null,
  crewRows: [] as unknown[],
  vessels: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is', 'lte', 'gte']) chain[m] = () => chain;
    const result = () => h.tables[table] ?? { data: [], error: null };
    chain.maybeSingle = () => {
      const r = result();
      return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
    };
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => h.rpc(...args), from, channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }), removeChannel: () => undefined } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: (key: string, ctx?: { vesselId?: string | null }) => {
    if (h.caps.mode === 'loading') return { allowed: false, status: 'loading', reason: 'test' };
    const allowed = h.caps.mode === 'granted' && !h.caps.denied.has(key) && !(ctx?.vesselId && h.caps.deniedVessels.has(ctx.vesselId));
    return { allowed, status: allowed ? 'granted' : 'denied', reason: 'test' };
  },
  useCan: (key: string, ctx?: { vesselId?: string | null }) =>
    h.caps.mode === 'granted' && !h.caps.denied.has(key) && !(ctx?.vesselId && h.caps.deniedVessels.has(ctx.vesselId)),
}));
vi.mock('@/app/router/scopeContext', () => ({ useScope: () => h.scope }));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/app/router/useScopeAccess', () => ({ useScopeAccess: () => ({ fleetReach: false }) }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-master' }, profile: { id: 'p-master', company_id: COMPANY } }) }));
vi.mock('@/modules/vessels/hooks/useVesselModuleSettings', () => ({
  useVesselModuleSettings: () => ({
    state: { status: 'ready', settings: new Map(h.label ? [['planner', { moduleKey: 'planner', enabled: true, enabledFrom: null, labelOverride: h.label }]] : []) },
    fetching: false,
    retry: () => undefined,
  }),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({ vessels: h.vessels, loading: false, getVesselCodeById: (id: string) => (id === VESSEL ? 'DRA' : 'HYD') }),
}));
vi.mock('@/modules/crew/hooks/useVesselCrewList', () => ({
  useVesselCrewList: (_v: unknown, _d: string, o: { enabled?: boolean }) =>
    o?.enabled === false ? { status: 'idle' } : { status: 'ready', rows: h.crewRows, refreshing: false, refetch: () => undefined },
}));
vi.mock('@/shared/components/data/useMinWidth', () => ({ TABLET_MIN_WIDTH: 768, useMinWidth: () => true }));
vi.mock('@/modules/rotation-planner/components/planner/legacyBodies', () => ({
  LegacyRotationPlanner: ({ lockedVesselId }: { lockedVesselId?: string }) => <div data-testid="legacy-timeline">{lockedVesselId ?? 'all'}</div>,
  LegacyLeavePlanner: () => <div data-testid="legacy-manning" />,
  LegacyLeaveRequests: () => <div data-testid="legacy-requests" />,
}));
vi.mock('@/modules/rotation-planner/lib/duration', async (orig) => {
  const real = await orig<typeof import('@/modules/rotation-planner/lib/duration')>();
  return { ...real, localToday: () => TODAY };
});

import PlannerPage from '@/modules/rotation-planner/pages/PlannerPage';
import {
  OTHER_GROUP,
  addMonths,
  barSpan,
  buildPlannerRows,
  dayColumns,
  dayTypes,
  departmentOptions,
  draggedRange,
  manningGapRows,
  monthEnd,
  monthSegments,
  paintRange,
  parsePlannerTab,
  periodLockReason,
  readStoredZoom,
  shiftAnchor,
  shownEnd,
  storeZoom,
  timelineWindow,
  visiblePlannerTabs,
  ZOOM_STORAGE_KEY,
} from '@/modules/rotation-planner/components/planner/plannerModel';
import { addLeaveSchema, periodEditSchema, toggleSchema } from '@/modules/rotation-planner/components/planner/plannerSchemas';
import type { PlannerPeriod } from '@/modules/rotation-planner/lib/periods';
import { PLANNER_NOT_SET_UP_NOTICE } from '@/modules/rotation-planner/lib/periods';
import { MANNING_READ_ONLY } from '@/modules/rotation-planner/components/planner/ConfigurationTab';

// ---------------------------------------------------------------- fixtures

const leaveTypeRows = LEAVE_TYPES.map((t) => ({
  key: t.key,
  label: t.label,
  day_code: t.dayCode,
  tone_key: t.toneKey,
  balance_effect: t.balanceEffect,
  policy_flag: t.policyFlag,
  counts_on_board: t.countsOnBoard,
  is_leave: t.isLeave,
  needs_approval: t.needsApproval,
  is_system: true,
  is_active: true,
  sort_order: t.sortOrder,
}));

const period = (over: Partial<PlannerPeriod> = {}): PlannerPeriod => ({
  id: 'per-1',
  vesselId: VESSEL,
  profileId: 'p-bosun',
  crewUserId: 'u-bosun',
  crewName: 'Demo Bosun',
  leaveTypeKey: 'rotation',
  status: 'confirmed',
  start: '2026-11-20',
  end: '2026-12-03',
  endUnknown: false,
  effectiveEnd: null,
  requestId: null,
  approvedBy: null,
  approvedAt: null,
  isSickOnBoard: false,
  notes: null,
  version: 1,
  updatedAt: '2026-11-01T00:00:00Z',
  ...over,
});

const periodRow = (over: Record<string, unknown> = {}) => ({
  id: 'per-1',
  vessel_id: VESSEL,
  profile_id: 'p-bosun',
  crew_user_id: 'u-bosun',
  crew_name_raw: null,
  first_name: 'Demo',
  last_name: 'Bosun',
  preferred_name: null,
  leave_type_key: 'rotation',
  status: 'confirmed',
  start_date: '2026-11-20',
  end_date: '2026-12-03',
  end_unknown: false,
  effective_end: null,
  request_id: null,
  approved_by: null,
  approved_at: null,
  is_sick_on_board: false,
  notes: null,
  version: 3,
  updated_at: '2026-11-01T00:00:00Z',
  ...over,
});

const crewRow = (over: Record<string, unknown>) => ({
  profileId: 'p-bosun',
  userId: 'u-bosun',
  firstName: 'Demo',
  lastName: 'Bosun',
  preferredName: null,
  displayName: 'Bosun, Demo',
  email: null,
  positionId: 'pos-bosun',
  positionName: 'Bosun',
  positionText: 'Bosun',
  departmentKey: 'deck',
  departmentLabel: 'Deck',
  rankTier: 'rating',
  sortOrder: 300,
  assignmentId: 'a-1',
  placementKind: 'assignment',
  joinDate: '2026-01-01',
  leaveDate: null,
  status: 'on_board',
  statusDetail: null,
  transferVesselId: null,
  leaveCode: null,
  travelToday: false,
  loginState: 'active',
  accountStatus: 'active',
  invitation: null,
  nationality: null,
  isMasterOffice: false,
  crewNumber: null,
  source: 'server',
  ...over,
});

const manningRow = (day: string, over: Record<string, unknown> = {}) => ({
  day,
  position_id: 'pos-master',
  position_key: 'master',
  position_name: 'Master',
  department_key: 'bridge',
  sort_order: 10,
  aboard: 0,
  qualified: 0,
  min_on_board: 1,
  max_on_board: null,
  short_by: 1,
  band: 'critical',
  ...over,
});

type RpcAnswer = { data: unknown; error: unknown };
let rpcAnswers: Record<string, RpcAnswer | ((args: Record<string, unknown>) => RpcAnswer)>;

function setEngine() {
  h.tables.leave_types = { data: leaveTypeRows, error: null };
}

function renderAt(url: string, element: React.ReactElement = <PlannerPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Where = () => <output data-testid="where">{`${useLocation().pathname}${useLocation().search}`}</output>;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/v/dra/crew/planner/:tab" element={<>{element}<Where /></>} />
          <Route path="/fleet/planner" element={<>{element}<Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

/** A read that fails is retried once by the planner hooks (about a second later). */
const SLOW = { timeout: 4000 };

beforeEach(() => {
  h.caps.mode = 'granted';
  h.caps.denied = new Set();
  h.caps.deniedVessels = new Set();
  h.tables = {};
  h.fromCalls = [];
  h.scope = { scope: 'vessel', vesselCode: 'DRA', vessel: { id: VESSEL, company_id: COMPANY, name: 'DRAAK' } };
  h.label = null;
  h.crewRows = [
    crewRow({}),
    crewRow({ profileId: 'p-master', userId: 'u-master', firstName: 'Demo', lastName: 'Master', displayName: 'Master, Demo', positionId: 'pos-master', positionName: 'Master', positionText: 'Master', departmentKey: 'bridge', departmentLabel: 'Bridge', rankTier: 'command', sortOrder: 10, isMasterOffice: true }),
  ];
  h.vessels = [];
  rpcAnswers = {
    planner_vessel_periods: { data: [periodRow()], error: null },
    vessel_manning_by_day: { data: [manningRow('2026-11-27'), manningRow('2026-11-28')], error: null },
  };
  h.rpc.mockReset();
  h.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    const a = rpcAnswers[fn];
    if (!a) return Promise.resolve({ data: null, error: null });
    return Promise.resolve(typeof a === 'function' ? a(args) : a);
  });
  try {
    window.localStorage.removeItem(ZOOM_STORAGE_KEY);
  } catch {
    /* jsdom storage */
  }
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------- the model

describe('plannerModel', () => {
  it('reads the tabs and hides Configuration without the engine', () => {
    for (const t of ['timeline', 'manning', 'requests', 'configuration']) expect(parsePlannerTab(t)).toBe(t);
    for (const t of [undefined, null, '', 'season', 'TIMELINE']) expect(parsePlannerTab(t)).toBeNull();
    expect(visiblePlannerTabs(true)).toEqual(['timeline', 'manning', 'requests', 'configuration']);
    expect(visiblePlannerTabs(false)).toEqual(['timeline', 'manning', 'requests']);
  });

  it('remembers the zoom, and survives a storage that is missing or throws', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readStoredZoom(storage)).toBe('month');
    storeZoom(storage, 'year');
    expect(readStoredZoom(storage)).toBe('year');
    store.set(ZOOM_STORAGE_KEY, 'decade');
    expect(readStoredZoom(storage)).toBe('month');
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStoredZoom(throwing)).toBe('month');
    expect(() => storeZoom(throwing, 'year')).not.toThrow();
    expect(readStoredZoom(null)).toBe('month');
  });

  it('computes months and windows across year ends', () => {
    expect(addMonths('2026-11-27', 1)).toBe('2026-12-01');
    expect(addMonths('2026-11-27', 2)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
    expect(addMonths('2026-03-15', -14)).toBe('2025-01-01');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(timelineWindow('2026-11-27', 'month')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(timelineWindow('2026-11-27', 'year')).toEqual({ from: '2026-09-01', to: '2027-08-31' });
    expect(shiftAnchor('2026-11-27', 'month', 1)).toBe('2026-12-01');
    expect(shiftAnchor('2026-11-27', 'year', -1)).toBe('2026-08-01');
    expect(() => addMonths('2026-11-27', 1.5)).toThrow(RangeError);
  });

  it('lays out day columns with weekends and today, and month segments', () => {
    const cols = dayColumns('2026-11-27', '2026-12-02', TODAY);
    expect(cols.map((c) => c.date)).toEqual(['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(cols.map((c) => c.weekend)).toEqual([false, true, true, false, false, false]);
    expect(cols.map((c) => c.today)).toEqual([true, false, false, false, false, false]);
    expect(cols[4].monthStart).toBe(true);
    expect(monthSegments('2026-11-27', '2026-12-02')).toEqual([
      { start: '2026-11-27', end: '2026-11-30', offset: 0, days: 4, label: 'Nov 2026' },
      { start: '2026-12-01', end: '2026-12-02', offset: 4, days: 2, label: 'Dec 2026' },
    ]);
  });

  it('places bars in the window, cutting them at its edges', () => {
    expect(barSpan('2026-11-20', '2026-12-03', '2026-11-01', '2026-11-30')).toEqual({ offset: 19, length: 11, cutStart: false, cutEnd: true });
    expect(barSpan('2026-10-20', '2026-11-03', '2026-11-01', '2026-11-30')).toEqual({ offset: 0, length: 3, cutStart: true, cutEnd: false });
    expect(barSpan('2026-12-01', '2026-12-03', '2026-11-01', '2026-11-30')).toBeNull();
    expect(barSpan('2026-10-01', '2026-10-31', '2026-11-01', '2026-11-30')).toBeNull();
    expect(barSpan('2026-11-05', '2026-11-04', '2026-11-01', '2026-11-30')).toBeNull();
    expect(shownEnd(period(), '2026-12-31')).toBe('2026-12-03');
    expect(shownEnd(period({ endUnknown: true, end: '2026-12-27', effectiveEnd: null }), '2026-12-31')).toBe('2026-12-31');
    expect(shownEnd(period({ endUnknown: true, end: '2026-12-27', effectiveEnd: '2026-12-10' }), '2026-12-31')).toBe('2026-12-10');
  });

  it('moves and resizes by whole days, never past the other edge', () => {
    expect(draggedRange({ start: '2026-11-20', end: '2026-11-30' }, 'move', 3)).toEqual({ start: '2026-11-23', end: '2026-12-03' });
    expect(draggedRange({ start: '2026-11-20', end: null }, 'move', -2)).toEqual({ start: '2026-11-18', end: null });
    expect(draggedRange({ start: '2026-11-20', end: '2026-11-30' }, 'start', 20)).toEqual({ start: '2026-11-30', end: '2026-11-30' });
    expect(draggedRange({ start: '2026-11-20', end: '2026-11-30' }, 'end', -20)).toEqual({ start: '2026-11-20', end: '2026-11-20' });
    expect(draggedRange({ start: '2026-11-20', end: null }, 'end', 5)).toEqual({ start: '2026-11-20', end: null });
    expect(() => draggedRange({ start: '2026-11-20', end: null }, 'move', 0.5)).toThrow(RangeError);
  });

  it('builds department groups in rank order, with people off the list last', () => {
    const crew = [
      { profileId: 'p-b', userId: 'u-b', name: 'Bea', positionLabel: 'Deckhand', departmentKey: 'deck', departmentLabel: 'Deck', sortOrder: 400 },
      { profileId: 'p-m', userId: 'u-m', name: 'Max', positionLabel: 'Master', departmentKey: 'bridge', departmentLabel: 'Bridge', sortOrder: 10 },
      { profileId: 'p-a', userId: 'u-a', name: 'Ada', positionLabel: 'Bosun', departmentKey: 'deck', departmentLabel: 'Deck', sortOrder: 300 },
    ];
    const ps = [
      period({ id: 'x2', profileId: 'p-a', start: '2026-11-25' }),
      period({ id: 'x1', profileId: 'p-a', start: '2026-11-01' }),
      period({ id: 'x3', profileId: 'p-gone', crewName: 'Former Cook', start: '2026-11-03' }),
      period({ id: 'x4', profileId: null, crewName: 'Imported name' }),
    ];
    const groups = buildPlannerRows(crew, ps, null);
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.name)])).toEqual([
      ['bridge', ['Max']],
      ['deck', ['Ada', 'Bea']],
      [OTHER_GROUP, ['Former Cook']],
    ]);
    expect(groups[1].rows[0].periods.map((p) => p.id)).toEqual(['x1', 'x2']);
    expect(groups[2].rows[0].onList).toBe(false);
    expect(buildPlannerRows(crew, ps, 'deck').map((g) => g.key)).toEqual(['deck']);
    expect(buildPlannerRows(crew, ps, OTHER_GROUP).map((g) => g.key)).toEqual([OTHER_GROUP]);
    expect(departmentOptions(crew)).toEqual([
      { key: 'bridge', label: 'Bridge' },
      { key: 'deck', label: 'Deck' },
    ]);
  });

  it('groups manning gaps by position, filtered by department', () => {
    const gaps = [
      { key: 'g1', kind: 'manning_gap' as const, severity: 'hard' as const, positionId: 'pos-m', positionName: 'Master', departmentKey: 'bridge', reason: 'Master needs 1 on board, short by 1', start: '2026-11-01', end: '2026-11-03', days: 3, min: 1, shortBy: 1 },
      { key: 'g2', kind: 'manning_gap' as const, severity: 'hard' as const, positionId: 'pos-m', positionName: 'Master', departmentKey: 'bridge', reason: 'x', start: '2026-11-10', end: '2026-11-11', days: 2, min: 1, shortBy: 1 },
      { key: 'g3', kind: 'manning_gap' as const, severity: 'hard' as const, positionId: null, positionName: null, departmentKey: null, reason: 'y', start: '2026-11-05', end: '2026-11-05', days: 1, min: 1, shortBy: 1 },
    ];
    const rows = manningGapRows(gaps, null);
    expect(rows.map((r) => [r.key, r.positionName, r.spans.length])).toEqual([
      ['pos-m', 'Master', 2],
      ['unmatched', 'Unmatched titles', 1],
    ]);
    expect(manningGapRows(gaps, 'deck')).toEqual([]);
  });

  it('reads the governing type of each day from confirmed periods only', () => {
    const ps = [
      period({ id: 'a', leaveTypeKey: 'on_board', start: '2026-11-01', end: '2026-11-10' }),
      period({ id: 'b', leaveTypeKey: 'holiday', start: '2026-11-05', end: '2026-11-06' }),
      period({ id: 'c', leaveTypeKey: 'medical', start: '2026-11-08', end: '2026-11-08', status: 'pending_approval' }),
    ];
    expect(dayTypes(ps, ['2026-11-04', '2026-11-05', '2026-11-08', '2026-11-11']).map((d) => d.typeKey)).toEqual(['on_board', 'holiday', 'on_board', null]);
    expect(paintRange('2026-11-09', '2026-11-03')).toEqual({ start: '2026-11-03', end: '2026-11-09' });
  });

  it('says why a period opens read only', () => {
    expect(periodLockReason(period(), LEAVE_TYPES, true, false)).toBeNull();
    expect(periodLockReason(null, LEAVE_TYPES, true, false)).toBeNull();
    expect(periodLockReason(period(), LEAVE_TYPES, false, true)).toMatch(/can't change it/);
    expect(periodLockReason(period({ requestId: 'r-1' }), LEAVE_TYPES, true, true)).toMatch(/leave request/);
    expect(periodLockReason(period({ status: 'pending_approval' }), LEAVE_TYPES, true, true)).toMatch(/waiting for a decision/);
    expect(periodLockReason(period({ leaveTypeKey: null }), LEAVE_TYPES, true, true)).toMatch(/without a leave type/);
    expect(periodLockReason(period({ leaveTypeKey: 'holiday' }), LEAVE_TYPES, true, false)).toMatch(/leave approver/);
    expect(periodLockReason(period({ leaveTypeKey: 'holiday' }), LEAVE_TYPES, true, true)).toBeNull();
  });
});

describe('the planner forms', () => {
  const add = addLeaveSchema(TODAY);
  const ok = { profileId: 'p-1', note: '', replace: false };

  it('accepts several periods with an end or End unknown', () => {
    const r = add.safeParse({
      ...ok,
      periods: [
        { leaveTypeKey: 'holiday', start: '2026-12-01', end: '2026-12-05', endUnknown: false },
        { leaveTypeKey: 'rotation', start: '2026-12-10', end: '', endUnknown: true },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('refuses a missing person, no period, an end before the start, a missing end, overlaps and far dates', () => {
    const issue = (v: unknown) => {
      const r = add.safeParse(v);
      return r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    };
    expect(issue({ ...ok, profileId: '', periods: [{ leaveTypeKey: 'holiday', start: TODAY, end: TODAY, endUnknown: false }] })).toEqual(['profileId: Choose a crew member.']);
    expect(issue({ ...ok, periods: [] })?.[0]).toMatch(/at least one period/);
    expect(issue({ ...ok, periods: [{ leaveTypeKey: 'holiday', start: '2026-12-05', end: '2026-12-01', endUnknown: false }] })).toEqual(['periods.0.end: The end is before the start.']);
    expect(issue({ ...ok, periods: [{ leaveTypeKey: 'holiday', start: '2026-12-05', end: '', endUnknown: false }] })?.[0]).toMatch(/periods.0.end: Choose the last day/);
    expect(
      issue({
        ...ok,
        periods: [
          { leaveTypeKey: 'holiday', start: '2026-12-01', end: '2026-12-05', endUnknown: false },
          { leaveTypeKey: 'medical', start: '2026-12-05', end: '2026-12-06', endUnknown: false },
        ],
      }),
    ).toEqual(['periods.1.start: Two of these periods overlap.']);
    expect(issue({ ...ok, periods: [{ leaveTypeKey: 'holiday', start: addDays(TODAY, 800), end: '', endUnknown: true }] })?.[0]).toMatch(/two years/);
    expect(issue({ ...ok, periods: [{ leaveTypeKey: '', start: TODAY, end: TODAY, endUnknown: false }] })?.[0]).toMatch(/leave type/i);
    expect(issue({ ...ok, note: 'x'.repeat(2001), periods: [{ leaveTypeKey: 'holiday', start: TODAY, end: TODAY, endUnknown: false }] })?.[0]).toMatch(/^note:/);
  });

  it('checks one period and the toggle', () => {
    const p = periodEditSchema(TODAY);
    expect(p.safeParse({ leaveTypeKey: 'rotation', start: TODAY, end: '', endUnknown: true, notes: '', replace: false }).success).toBe(true);
    expect(p.safeParse({ leaveTypeKey: 'rotation', start: '', end: TODAY, endUnknown: false, notes: '', replace: false }).success).toBe(false);
    const t = toggleSchema(TODAY);
    expect(t.safeParse({ direction: 'off', leaveTypeKey: 'rotation', start: TODAY, end: '', endUnknown: true }).success).toBe(true);
    expect(t.safeParse({ direction: 'on', leaveTypeKey: '', start: TODAY, end: '', endUnknown: false }).success).toBe(true);
    expect(t.safeParse({ direction: 'off', leaveTypeKey: 'rotation', start: addDays(TODAY, 40), end: '', endUnknown: true }).success).toBe(false);
    expect(t.safeParse({ direction: 'off', leaveTypeKey: 'rotation', start: TODAY, end: '', endUnknown: false }).success).toBe(false);
    expect(t.safeParse({ direction: 'off', leaveTypeKey: '', start: TODAY, end: '', endUnknown: true }).success).toBe(false);
    expect(t.safeParse({ direction: 'off', leaveTypeKey: 'rotation', start: TODAY, end: addDays(TODAY, -1), endUnknown: false }).success).toBe(false);
  });
});

// ---------------------------------------------------------------- the page

describe('the vessel planner: gate, label, tabs', () => {
  it('reads nothing and shows a loader while the gate loads', () => {
    h.caps.mode = 'loading';
    renderAt('/v/dra/crew/planner/timeline');
    expect(screen.getByText('Checking your access')).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('shows AccessDenied and reads nothing when the gate is denied', () => {
    h.caps.mode = 'denied';
    renderAt('/v/dra/crew/planner/timeline');
    expect(screen.getByText("You can't see the planner of this vessel")).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fromCalls).toEqual([]);
  });

  it('lands an unknown tab on the timeline, query kept', async () => {
    setEngine();
    renderAt('/v/dra/crew/planner/season?crew=p-bosun');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/v/dra/crew/planner/timeline?crew=p-bosun'));
  });

  it("uses the vessel's label for the module", async () => {
    setEngine();
    h.label = 'Leave';
    renderAt('/v/dra/crew/planner/timeline');
    expect(await screen.findByRole('heading', { name: 'Leave' })).toBeInTheDocument();
  });

  it('D-01: without the engine, keeps the legacy bodies under the notice and hides Configuration', async () => {
    h.tables.leave_types = { data: null, error: { code: 'PGRST205', message: 'Could not find the table public.leave_types' } };
    const { unmount } = renderAt('/v/dra/crew/planner/timeline');
    expect(await screen.findByTestId('legacy-timeline')).toHaveTextContent(VESSEL);
    expect(screen.getByText(PLANNER_NOT_SET_UP_NOTICE)).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Planner sections' });
    expect(within(tabs).getAllByRole('link').map((a) => a.textContent)).toEqual(['Timeline', 'Manning', 'Requests']);
    expect(h.rpc).not.toHaveBeenCalled();
    unmount();
    renderAt('/v/dra/crew/planner/manning');
    expect(await screen.findByTestId('legacy-manning')).toBeInTheDocument();
  });

  it('D-01: Configuration without the engine lands on the timeline', async () => {
    h.tables.leave_types = { data: null, error: { code: '42P01', message: 'relation "public.leave_types" does not exist' } };
    renderAt('/v/dra/crew/planner/configuration');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/v/dra/crew/planner/timeline'));
  });

  it('shows PageError with Retry for any other error of the first read', async () => {
    h.tables.leave_types = { data: null, error: { code: '500', message: 'boom' } };
    renderAt('/v/dra/crew/planner/timeline');
    expect(await screen.findByText('The planner could not load', {}, SLOW)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('the timeline', () => {
  beforeEach(() => setEngine());

  it('draws each period as a bar with its type and length, and the manning gaps', async () => {
    renderAt('/v/dra/crew/planner/timeline');
    const bar = await screen.findByRole('button', { name: /Demo Bosun: Rotation leave · 2w, 20 Nov 2026 to 3 Dec 2026/ });
    expect(bar).toHaveAttribute('data-leave-type', 'rotation');
    expect(screen.getByRole('note', { name: /Master needs 1 on board, short by 1/ })).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith('planner_vessel_periods', { p_vessel_id: VESSEL, p_from: '2026-10-01', p_to: '2026-12-31' });
    expect(screen.getByRole('navigation', { name: 'Planner sections' })).toHaveTextContent('Configuration');
  });

  it('remembers the Year zoom', async () => {
    renderAt('/v/dra/crew/planner/timeline');
    await screen.findByRole('button', { name: /Demo Bosun: Rotation leave/ });
    fireEvent.click(screen.getByRole('button', { name: 'Year' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('planner_vessel_periods', { p_vessel_id: VESSEL, p_from: '2026-09-01', p_to: '2027-08-31' }));
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe('year');
  });

  it('opens a period and shows the server refusal when a save is refused', async () => {
    rpcAnswers.planner_period_upsert = { data: null, error: { code: '22023', message: 'period_overlap', details: 'This period overlaps Holiday from 1 Dec.', hint: 'per-9' } };
    renderAt('/v/dra/crew/planner/timeline');
    fireEvent.click(await screen.findByRole('button', { name: /Demo Bosun: Rotation leave/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('This period overlaps Holiday from 1 Dec.')).toBeInTheDocument();
    expect(within(dialog).getByText('Replace rotation leave')).toBeInTheDocument();
    const call = h.rpc.mock.calls.find((c) => c[0] === 'planner_period_upsert');
    expect(call?.[1]).toMatchObject({ p_id: 'per-1', p_profile_id: 'p-bosun', p_leave_type_key: 'rotation', p_start: '2026-11-20', p_end: '2026-12-03', p_expected_version: 3 });
  });

  it('opens a request-born period read only', async () => {
    rpcAnswers.planner_vessel_periods = { data: [periodRow({ request_id: 'r-1', leave_type_key: 'holiday' })], error: null };
    renderAt('/v/dra/crew/planner/timeline');
    fireEvent.click(await screen.findByRole('button', { name: /Demo Bosun: Holiday/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/comes from an approved leave request/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('adds leave with several periods through planner_add_leave', async () => {
    rpcAnswers.planner_add_leave = { data: [{ request_id: 'r-9', status: 'approved', period_ids: ['n-1', 'n-2'] }], error: null };
    renderAt('/v/dra/crew/planner/timeline?crew=p-bosun');
    fireEvent.click(await screen.findByRole('button', { name: 'Add leave' }));
    const dialog = await screen.findByRole('dialog', {}, SLOW);
    fireEvent.change(within(dialog).getByLabelText('Last day'), { target: { value: '2026-12-04' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add another period' }));
    const lastDays = within(dialog).getAllByLabelText('Last day');
    const firstDays = within(dialog).getAllByLabelText('First day');
    fireEvent.change(firstDays[1], { target: { value: '2026-12-10' } });
    fireEvent.click(within(dialog).getAllByRole('checkbox', { name: 'End unknown' })[1]);
    expect(lastDays).toHaveLength(2);
    expect(within(dialog).getByText(/Saved approved/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add leave' }));
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[0] === 'planner_add_leave')).toBe(true));
    const call = h.rpc.mock.calls.find((c) => c[0] === 'planner_add_leave');
    expect(call?.[1]).toEqual({
      p_vessel_id: VESSEL,
      p_profile_id: 'p-bosun',
      p_periods: [
        { leave_type_key: 'holiday', start_date: TODAY, end_date: '2026-12-04', end_unknown: false },
        { leave_type_key: 'holiday', start_date: '2026-12-10', end_date: null, end_unknown: true },
      ],
      p_note: null,
      p_replace: false,
    });
  });

  it('D-01 inside the tab: a missing periods RPC keeps the legacy timeline', async () => {
    rpcAnswers.planner_vessel_periods = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.planner_vessel_periods' } };
    renderAt('/v/dra/crew/planner/timeline');
    expect(await screen.findByTestId('legacy-timeline')).toBeInTheDocument();
  });

  it('shows PageError with Retry when the periods fail, and asks again', async () => {
    rpcAnswers.planner_vessel_periods = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    renderAt('/v/dra/crew/planner/timeline');
    expect(await screen.findByText('The planner could not load', {}, SLOW)).toBeInTheDocument();
    const before = h.rpc.mock.calls.filter((c) => c[0] === 'planner_vessel_periods').length;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(h.rpc.mock.calls.filter((c) => c[0] === 'planner_vessel_periods').length).toBeGreaterThan(before));
  });
});

describe('the manning grid', () => {
  beforeEach(() => setEngine());

  it('shows the On board total, the day codes and qualified / aboard per position', async () => {
    rpcAnswers.vessel_manning_by_day = {
      data: [manningRow('2026-11-27', { aboard: 1, qualified: 0, short_by: 1, band: 'critical' }), manningRow('2026-11-28', { aboard: 1, qualified: 1, short_by: 0, band: 'at_minimum' })],
      error: null,
    };
    renderAt('/v/dra/crew/planner/manning');
    const total = await screen.findByRole('row', { name: /On board/ });
    expect(within(total).getByLabelText(/27 Nov 2026: 1 on board, 0 qualified, minimum 1\. Below minimum/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demo Bosun, 27 Nov 2026: Rotation leave' })).toHaveTextContent('R');
    expect(screen.getByLabelText(/Master, 28 Nov 2026: 1 qualified of 1 aboard, minimum 1\. At minimum/)).toHaveTextContent('1/1');
    expect(h.rpc).toHaveBeenCalledWith('vessel_manning_by_day', { p_vessel_id: VESSEL, p_from: '2026-11-01', p_to: '2026-11-30' });
  });

  it('paints a new period from a day without a period (never a day code)', async () => {
    rpcAnswers.planner_period_upsert = { data: { id: 'n-1', version: 1 }, error: null };
    renderAt('/v/dra/crew/planner/manning');
    fireEvent.click(await screen.findByRole('button', { name: 'Demo Master, 12 Nov 2026: no period' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('New period')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[0] === 'planner_period_upsert')).toBe(true));
    expect(h.rpc.mock.calls.find((c) => c[0] === 'planner_period_upsert')?.[1]).toMatchObject({ p_id: null, p_profile_id: 'p-master', p_start: '2026-11-12', p_end: '2026-11-12' });
    expect(h.fromCalls).not.toContain('crew_leave_entries');
  });
});

describe('the requests', () => {
  beforeEach(() => {
    setEngine();
    h.tables.crew_leave_requests = {
      data: [
        {
          id: 'r-1',
          company_id: COMPANY,
          vessel_id: VESSEL,
          crew_id: 'u-bosun',
          profile_id: 'p-bosun',
          leave_type: 'L',
          start_date: '2026-12-10',
          end_date: '2026-12-20',
          status: 'pending',
          notes: 'Family',
          submitted_at: '2026-11-20T10:00:00Z',
          hod_reviewed_at: null,
          hod_reviewed_by: null,
          reviewed_at: null,
          reviewed_by: null,
          cancellation_reason: null,
        },
      ],
      error: null,
    };
    h.tables.crew_leave_request_periods = {
      data: [{ id: 'rp-1', request_id: 'r-1', leave_type_key: 'holiday', start_date: '2026-12-10', end_date: '2026-12-20', end_unknown: false, sort_order: 0 }],
      error: null,
    };
    h.tables.crew_leave_settings = { data: [], error: null };
  });

  it("lists pending requests with the approver's decisions and decides with a reason", async () => {
    rpcAnswers.crew_leave_request_decide = { data: { id: 'r-1', status: 'declined' }, error: null };
    renderAt('/v/dra/crew/planner/requests');
    expect(await screen.findByText(/Holiday \(annual leave\) · 10 Dec 2026 to 20 Dec 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve: Demo Bosun' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Decline: Demo Bosun' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));
    expect(await within(dialog).findByText('Give a reason.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Crew change that week' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('crew_leave_request_decide', { p_request_id: 'r-1', p_decision: 'decline', p_reason: 'Crew change that week', p_replace: false }),
    );
  });

  it('offers no decision without leave approval', async () => {
    h.caps.denied = new Set(['hris.leave_rotation.leave_requests.approve']);
    renderAt('/v/dra/crew/planner/requests');
    expect(await screen.findByText(/Holiday \(annual leave\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve:/ })).toBeNull();
  });

  it('D-01: a missing periods table keeps the legacy requests page', async () => {
    h.tables.crew_leave_request_periods = { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } };
    renderAt('/v/dra/crew/planner/requests');
    expect(await screen.findByTestId('legacy-requests')).toBeInTheDocument();
  });
});

describe('the configuration', () => {
  const position = (over: Record<string, unknown>) => ({
    position_id: 'pos-master',
    scope: 'system',
    key: 'master',
    name: 'Master',
    department_key: 'bridge',
    department_label: 'Bridge',
    department_sort: 10,
    rank_tier: 'command',
    default_access_set_key: 'full_vessel',
    stcw_capacity: null,
    base_sort_order: 10,
    sort_order: 10,
    is_listed: true,
    min_on_board: 1,
    max_on_board: null,
    holder_count: 1,
    ...over,
  });

  beforeEach(() => {
    setEngine();
    rpcAnswers.crew_positions_for_vessel = {
      data: [position({}), position({ position_id: 'pos-chef', key: 'chef', name: 'Chef', department_key: 'galley', department_label: 'Galley', department_sort: 60, sort_order: 600, base_sort_order: 600, holder_count: 0, min_on_board: 0 })],
      error: null,
    };
    rpcAnswers.crew_vessel_unmatched_titles = { data: [], error: null };
    rpcAnswers.vessel_manning_by_day = { data: [manningRow(TODAY, { aboard: 1, qualified: 1, short_by: 0, band: 'at_minimum' })], error: null };
  });

  it('is read only without crew compliance administration, and lists positions with nobody aboard apart', async () => {
    h.caps.denied = new Set(['vessel.crew.crew_compliance.admin']);
    renderAt('/v/dra/crew/planner/configuration');
    expect(await screen.findByText(MANNING_READ_ONLY)).toBeInTheDocument();
    expect(await screen.findByLabelText('Required on board: Master')).toBeDisabled();
    expect(screen.getByText('Nobody aboard (1)')).toBeInTheDocument();
    expect(await screen.findByText('1 qualified of 1 aboard today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save manning' })).toBeNull();
  });

  it('saves only the changed position and refuses an incomplete write', async () => {
    rpcAnswers.crew_vessel_positions_save = { data: 0, error: null };
    renderAt('/v/dra/crew/planner/configuration');
    const input = await screen.findByLabelText('Required on board: Chef');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Maximum on board: Chef'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save manning' }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('crew_vessel_positions_save', {
        p_vessel_id: VESSEL,
        p_rows: [{ position_id: 'pos-chef', sort_order: 600, is_listed: true, min_on_board: 1, max_on_board: 2 }],
      }),
    );
    // The server wrote nothing: the change stays staged, never reported saved.
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
  });

  it('refuses a maximum below the minimum before sending', async () => {
    renderAt('/v/dra/crew/planner/configuration');
    fireEvent.change(await screen.findByLabelText('Maximum on board: Master'), { target: { value: '0' } });
    expect(screen.getByText('The maximum cannot be lower than the minimum.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save manning' })).toBeDisabled();
  });
});

describe('the fleet planner', () => {
  beforeEach(() => {
    setEngine();
    h.scope = { scope: 'fleet' };
    h.vessels = [
      { id: VESSEL, company_id: COMPANY, name: 'DRAAK', lifecycle_status: 'active' },
      { id: 'v-hyd', company_id: COMPANY, name: 'HYDRA', lifecycle_status: 'active' },
      { id: 'v-old', company_id: COMPANY, name: 'OLD', lifecycle_status: 'archived' },
    ];
  });

  it('stacks one lane per reachable vessel, one read each, and says when a vessel is not yours to see', async () => {
    h.caps.deniedVessels = new Set(['v-hyd']);
    renderAt('/fleet/planner');
    expect(await screen.findByRole('heading', { name: 'Planner' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/fleet/planner?tab=crew'));
    expect(await screen.findByRole('button', { name: /Demo Bosun: Rotation leave/ })).toBeInTheDocument();
    expect(screen.getByText("You don't see the planner of HYDRA.")).toBeInTheDocument();
    expect(screen.queryByText('OLD')).toBeNull();
    const reads = h.rpc.mock.calls.filter((c) => c[0] === 'planner_vessel_periods').map((c) => (c[1] as { p_vessel_id: string }).p_vessel_id);
    expect(new Set(reads)).toEqual(new Set([VESSEL]));
    expect(screen.getByRole('link', { name: 'Open the planner of DRAAK' })).toHaveAttribute('href', '/v/dra/crew/planner/timeline');
  });
});

describe('the legacy URLs', () => {
  it('render the legacy body of their tab with links to the others', async () => {
    h.scope = { scope: 'legacy' };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/crew/leave']}>
          <PlannerPage tab="manning" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('legacy-manning')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Planner sections' });
    expect(within(nav).getByRole('link', { name: 'Timeline' })).toHaveAttribute('href', '/crew/rotation-planner');
    expect(within(nav).getByRole('link', { name: 'Requests' })).toHaveAttribute('href', '/crew/leave/requests');
    await act(async () => undefined);
  });
});
