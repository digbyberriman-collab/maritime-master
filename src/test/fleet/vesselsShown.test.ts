/**
 * "Vessels shown" (gap/02 D1, X3; D-123; D-X5-09, D-X5-22):
 *
 * - the pure resolution: `?vessels=` codes win over the stored choice,
 *   which wins over the default; unknown codes and ids are dropped (and the
 *   codes reported); a parameter with no known code is ignored;
 * - counted: the P1 columns where present, the D-123 rule always (and alone
 *   before P1);
 * - storage: read and written in try/catch, so a throwing accessor or a
 *   throwing getItem / setItem is ignored, never an error; the key carries
 *   the user id;
 * - the tick helpers by flag, class and fleet group;
 * - the hook: the URL and the user id drive it, a change writes the URL and
 *   the storage, the default clears both, nothing is served before this
 *   user's vessels have loaded, and a vessel-list error is an error.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  VESSELS_SHOWN_PARAM,
  countedVesselIds,
  formatVesselCodes,
  isCountedVessel,
  parseVesselCodes,
  readStoredVesselsShown,
  resolveVesselsShown,
  tickVessels,
  toShownVessels,
  toggleVessel,
  vesselTickOptions,
  vesselsShownStorageKey,
  vesselsShownSummary,
  writeStoredVesselsShown,
  type ShownVesselInput,
  type VesselsShownStorage,
} from '@/modules/fleet/lib/vesselsShown';

// ─── Fixtures ─────────────────────────────────────────────────────────────

const COMPANY = 'c-1';
const USER = 'u-1';

const row = (over: Partial<ShownVesselInput> & Pick<ShownVesselInput, 'id' | 'name' | 'code'>): ShownVesselInput => ({
  status: 'Active',
  flag_state: null,
  classification_society: null,
  fleet_group_id: null,
  ...over,
});

const DRAAK = row({ id: 'v-dra', name: 'DRAAK', code: 'DRA', flag_state: 'Cayman Islands', classification_society: "Lloyd's Register", fleet_group_id: 'g-med' });
const GAME = row({ id: 'v-gam', name: 'GAME CHANGER', code: 'GAM', flag_state: 'Marshall Islands', classification_society: 'DNV' });
const HYDRA = row({ id: 'v-hyd', name: 'HYDRA', code: 'HYD', flag_state: 'Malta', classification_society: 'DNV', fleet_group_id: 'g-med' });
const LEVI = row({ id: 'v-lev', name: 'LEVIATHAN', code: 'LEV', flag_state: 'Malta', classification_society: 'Bureau Veritas', fleet_group_id: 'g-unnamed' });
/** A demo vessel: P1 says not counted. */
const DEMO = row({ id: 'v-dem', name: 'DEMO', code: 'DEM', is_counted: false, lifecycle_status: 'active' });

const INPUT = [HYDRA, DRAAK, LEVI, GAME, DEMO];
const VESSELS = toShownVessels(INPUT);

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const target = {
    getItem: vi.fn((k: string) => (data.has(k) ? (data.get(k) as string) : null)),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    removeItem: vi.fn((k: string) => void data.delete(k)),
  };
  return { data, target, storage: (() => target) as VesselsShownStorage };
}

// ─── Counted ──────────────────────────────────────────────────────────────

describe('counted vessels (X3, D-123)', () => {
  it('before P1 (no columns): status set and not Sold', () => {
    expect(isCountedVessel({ status: 'Active' })).toBe(true);
    expect(isCountedVessel({ status: 'In Yard' })).toBe(true);
    expect(isCountedVessel({ status: 'Sold' })).toBe(false);
    expect(isCountedVessel({ status: null })).toBe(false);
  });

  it('with P1: is_counted and lifecycle active, and the D-123 rule still applies', () => {
    expect(isCountedVessel({ status: 'Active', is_counted: true, lifecycle_status: 'active' })).toBe(true);
    expect(isCountedVessel({ status: 'Active', is_counted: false, lifecycle_status: 'active' })).toBe(false);
    expect(isCountedVessel({ status: 'Active', is_counted: true, lifecycle_status: 'inactive' })).toBe(false);
    expect(isCountedVessel({ status: 'Active', is_counted: true, lifecycle_status: 'archived' })).toBe(false);
    expect(isCountedVessel({ status: 'Sold', is_counted: true, lifecycle_status: 'active' })).toBe(false);
    expect(isCountedVessel({ status: null, is_counted: true, lifecycle_status: 'active' })).toBe(false);
  });

  it('one column present is applied on its own', () => {
    expect(isCountedVessel({ status: 'Active', is_counted: false })).toBe(false);
    expect(isCountedVessel({ status: 'Active', is_counted: null })).toBe(true);
    expect(isCountedVessel({ status: 'Active', lifecycle_status: 'inactive' })).toBe(false);
  });

  it('lists vessels by name with their counted flag, codes upper case, blanks as null, ids once', () => {
    const list = toShownVessels([...INPUT, { ...DRAAK, name: 'DUPLICATE' }, row({ id: 'v-x', name: 'xiphias', code: ' xip ', flag_state: '  ' })]);
    expect(list.map((v) => v.name)).toEqual(['DEMO', 'DRAAK', 'GAME CHANGER', 'HYDRA', 'LEVIATHAN', 'xiphias']);
    expect(list.find((v) => v.id === 'v-x')).toMatchObject({ code: 'XIP', flagState: null, counted: true });
    expect(list.find((v) => v.id === 'v-dem')?.counted).toBe(false);
    expect(countedVesselIds(VESSELS)).toEqual(['v-dra', 'v-gam', 'v-hyd', 'v-lev']);
  });
});

// ─── Resolution ───────────────────────────────────────────────────────────

describe('resolveVesselsShown', () => {
  it('defaults to every counted vessel (the demo vessel is left out)', () => {
    const r = resolveVesselsShown({ vessels: VESSELS, urlParam: null, stored: null });
    expect(r).toEqual({ vesselIds: ['v-dra', 'v-gam', 'v-hyd', 'v-lev'], source: 'default', isDefault: true, countedIds: ['v-dra', 'v-gam', 'v-hyd', 'v-lev'], droppedCodes: [] });
  });

  it('the URL wins over the stored choice', () => {
    const r = resolveVesselsShown({ vessels: VESSELS, urlParam: 'hyd,dra', stored: ['v-gam'] });
    expect(r.source).toBe('url');
    expect(r.vesselIds).toEqual(['v-dra', 'v-hyd']);
    expect(r.isDefault).toBe(false);
  });

  it('drops unknown codes and reports them; a URL with no known code falls back to storage', () => {
    const r = resolveVesselsShown({ vessels: VESSELS, urlParam: 'DRA, NOPE ,zzz,DRA', stored: null });
    expect(r.vesselIds).toEqual(['v-dra']);
    expect(r.droppedCodes).toEqual(['NOPE', 'ZZZ']);
    const fallback = resolveVesselsShown({ vessels: VESSELS, urlParam: 'NOPE', stored: ['v-gam', 'v-gone'] });
    expect(fallback).toMatchObject({ source: 'storage', vesselIds: ['v-gam'], droppedCodes: ['NOPE'] });
    const blank = resolveVesselsShown({ vessels: VESSELS, urlParam: ' , ', stored: null });
    expect(blank.source).toBe('default');
  });

  it('a stored choice of unknown ids only is ignored', () => {
    expect(resolveVesselsShown({ vessels: VESSELS, urlParam: null, stored: ['v-gone'] }).source).toBe('default');
  });

  it('an explicit choice may hold a vessel that is not counted (D-X5-22)', () => {
    const r = resolveVesselsShown({ vessels: VESSELS, urlParam: 'DEM', stored: null });
    expect(r.vesselIds).toEqual(['v-dem']);
    expect(r.isDefault).toBe(false);
  });

  it('an explicit choice equal to the default reads as the default', () => {
    expect(resolveVesselsShown({ vessels: VESSELS, urlParam: 'LEV,HYD,GAM,DRA', stored: null }).isDefault).toBe(true);
  });

  it('no vessels reached: nothing shown, default', () => {
    expect(resolveVesselsShown({ vessels: [], urlParam: 'DRA', stored: ['v-dra'] })).toMatchObject({ vesselIds: [], source: 'default', droppedCodes: ['DRA'] });
  });

  it('parses and formats the parameter', () => {
    expect(parseVesselCodes('dra gam,,HYD dra')).toEqual(['DRA', 'GAM', 'HYD']);
    expect(parseVesselCodes(null)).toEqual([]);
    expect(formatVesselCodes(VESSELS, ['v-hyd', 'v-dra'])).toBe('DRA,HYD');
    expect(formatVesselCodes(toShownVessels([row({ id: 'n', name: 'NO CODE', code: null })]), ['n'])).toBeNull();
  });
});

// ─── Storage ──────────────────────────────────────────────────────────────

describe('stored choice (device-local, per user)', () => {
  it('keys by user id', () => {
    expect(vesselsShownStorageKey(USER)).toBe('storm-fleet-vessels:u-1');
  });

  it('writes, reads back and removes', () => {
    const { storage, data } = memoryStorage();
    expect(writeStoredVesselsShown(storage, USER, ['v-dra', 'v-hyd'])).toBe(true);
    expect(JSON.parse(data.get('storm-fleet-vessels:u-1') as string)).toEqual({ version: 1, vesselIds: ['v-dra', 'v-hyd'] });
    expect(readStoredVesselsShown(storage, USER)).toEqual(['v-dra', 'v-hyd']);
    expect(readStoredVesselsShown(storage, 'someone-else')).toBeNull();
    expect(writeStoredVesselsShown(storage, USER, null)).toBe(true);
    expect(data.has('storm-fleet-vessels:u-1')).toBe(false);
  });

  it('ignores malformed values', () => {
    for (const raw of ['not json', '[]', '{"version":2,"vesselIds":["v"]}', '{"version":1,"vesselIds":"v"}', '{"version":1,"vesselIds":[1,""]}', '']) {
      const { storage } = memoryStorage({ 'storm-fleet-vessels:u-1': raw });
      expect(readStoredVesselsShown(storage, USER), raw).toBeNull();
    }
  });

  it('a throwing accessor, getItem or setItem is ignored', () => {
    const throwingAccessor: VesselsShownStorage = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    expect(readStoredVesselsShown(throwingAccessor, USER)).toBeNull();
    expect(writeStoredVesselsShown(throwingAccessor, USER, ['v-dra'])).toBe(false);
    const throwingCalls: VesselsShownStorage = () => ({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readStoredVesselsShown(throwingCalls, USER)).toBeNull();
    expect(writeStoredVesselsShown(throwingCalls, USER, ['v-dra'])).toBe(false);
    expect(writeStoredVesselsShown(throwingCalls, USER, null)).toBe(false);
    expect(readStoredVesselsShown(() => null, USER)).toBeNull();
    expect(readStoredVesselsShown(memoryStorage().storage, null)).toBeNull();
    expect(writeStoredVesselsShown(memoryStorage().storage, null, ['v-dra'])).toBe(false);
  });
});

// ─── Tick helpers ─────────────────────────────────────────────────────────

describe('tick helpers (flag, class, fleet group; reused by X5-04B)', () => {
  it('groups by flag and class, sorted, in list order, vessels without the value in none', () => {
    const { flags, classes } = vesselTickOptions(VESSELS);
    expect(flags).toEqual([
      { key: 'cayman islands', label: 'Cayman Islands', vesselIds: ['v-dra'] },
      { key: 'malta', label: 'Malta', vesselIds: ['v-hyd', 'v-lev'] },
      { key: 'marshall islands', label: 'Marshall Islands', vesselIds: ['v-gam'] },
    ]);
    expect(classes.map((c) => [c.label, c.vesselIds])).toEqual([
      ['Bureau Veritas', ['v-lev']],
      ['DNV', ['v-gam', 'v-hyd']],
      ["Lloyd's Register", ['v-dra']],
    ]);
  });

  it('a flag written in another case is the same flag', () => {
    const list = toShownVessels([DRAAK, { ...HYDRA, flag_state: 'cayman islands' }]);
    expect(vesselTickOptions(list).flags).toEqual([{ key: 'cayman islands', label: 'Cayman Islands', vesselIds: ['v-dra', 'v-hyd'] }]);
  });

  it('fleet groups only by their loaded names, never an invented one', () => {
    expect(vesselTickOptions(VESSELS).fleetGroups).toEqual([]);
    const { fleetGroups } = vesselTickOptions(VESSELS, [{ id: 'g-med', name: ' Mediterranean ' }, { id: 'g-empty', name: '' }]);
    expect(fleetGroups).toEqual([{ key: 'g-med', label: 'Mediterranean', vesselIds: ['v-dra', 'v-hyd'] }]);
  });

  it('tick adds in list order; toggle flips one', () => {
    expect(tickVessels(VESSELS, ['v-lev'], ['v-hyd', 'v-dra', 'v-gone'])).toEqual(['v-dra', 'v-hyd', 'v-lev']);
    expect(toggleVessel(VESSELS, ['v-dra', 'v-hyd'], 'v-dra')).toEqual(['v-hyd']);
    expect(toggleVessel(VESSELS, ['v-hyd'], 'v-dra')).toEqual(['v-dra', 'v-hyd']);
  });

  it('summarises a selection for the button', () => {
    expect(vesselsShownSummary({ selected: 4, total: 4, counted: 4, isDefault: true })).toBe('All vessels');
    expect(vesselsShownSummary({ selected: 4, total: 5, counted: 4, isDefault: true })).toBe('All 4 counted');
    expect(vesselsShownSummary({ selected: 2, total: 5, counted: 4, isDefault: false })).toBe('2 of 5 vessels');
    expect(vesselsShownSummary({ selected: 0, total: 5, counted: 4, isDefault: false })).toBe('No vessels');
  });
});

// ─── The hook ─────────────────────────────────────────────────────────────

type VesselCtx = {
  vessels: (ShownVesselInput & { company_id: string })[];
  loading: boolean;
  loadedForUserId: string | null;
  loadError: { message: string } | null;
  retryVessels: () => Promise<void>;
  getVesselCodeById: (id: string | null | undefined) => string | null;
};

const state = vi.hoisted(() => ({
  auth: { user: { id: 'u-1' } as { id: string } | null, profile: { company_id: 'c-1', user_id: 'u-1' } as { company_id: string; user_id: string } | null },
  vessel: null as unknown,
  groups: { status: 'ready', groups: [] as { id: string; name: string }[] },
}));

vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({ useVessel: () => state.vessel }));
vi.mock('@/shared/components/layout/topbar/useFleetGroups', () => ({ useFleetGroups: () => state.groups }));

import { useFleetVesselsShown } from '@/modules/fleet/hooks/useFleetVesselsShown';

const CODES: Record<string, string> = { 'v-dra': 'DRA', 'v-gam': 'GAM', 'v-hyd': 'HYD', 'v-lev': 'LEV', 'v-dem': 'DEM' };

function vesselCtx(over: Partial<VesselCtx> = {}): VesselCtx {
  return {
    // VesselContext has no code before P1: the hook takes it from getVesselCodeById (D-03).
    vessels: [...INPUT.map((v) => ({ ...v, code: null, company_id: COMPANY })), { ...row({ id: 'v-foreign', name: 'FOREIGN', code: null }), company_id: 'c-2' }],
    loading: false,
    loadedForUserId: USER,
    loadError: null,
    retryVessels: vi.fn(async () => undefined),
    getVesselCodeById: (id) => (id ? (CODES[id] ?? null) : null),
    ...over,
  };
}

function renderShown(url: string, storage: VesselsShownStorage) {
  const location: { current: string } = { current: '' };
  const Probe = () => {
    const loc = useLocation();
    location.current = `${loc.pathname}${loc.search}`;
    return null;
  };
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(MemoryRouter, { initialEntries: [url], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, children, React.createElement(Probe));
  const hook = renderHook(() => useFleetVesselsShown({ storage }), { wrapper });
  return { ...hook, location };
}

describe('useFleetVesselsShown', () => {
  beforeEach(() => {
    state.auth = { user: { id: USER }, profile: { company_id: COMPANY, user_id: USER } };
    state.vessel = vesselCtx();
    state.groups = { status: 'ready', groups: [{ id: 'g-med', name: 'Mediterranean' }] };
  });
  afterEach(() => vi.clearAllMocks());

  it('serves the default: every counted vessel of the company, codes from D-03, scope with the company id', () => {
    const { result } = renderShown('/fleet/dashboard', memoryStorage().storage);
    const s = result.current;
    if (s.status !== 'ready') throw new Error(`expected ready, got ${s.status}`);
    expect(s.vessels.map((v) => v.id)).toEqual(['v-dem', 'v-dra', 'v-gam', 'v-hyd', 'v-lev']);
    expect(s.vessels.find((v) => v.id === 'v-dra')?.code).toBe('DRA');
    expect(s.shownIds).toEqual(['v-dra', 'v-gam', 'v-hyd', 'v-lev']);
    expect(s).toMatchObject({ source: 'default', isDefault: true, companyId: COMPANY, fleetGroups: [{ id: 'g-med', name: 'Mediterranean' }] });
    expect(s.scope).toEqual({ companyId: COMPANY, vesselIds: ['v-dra', 'v-gam', 'v-hyd', 'v-lev'] });
  });

  it('the URL wins over this user\'s stored choice', () => {
    const { storage } = memoryStorage({ 'storm-fleet-vessels:u-1': JSON.stringify({ version: 1, vesselIds: ['v-gam'] }) });
    const { result } = renderShown('/fleet/dashboard?vessels=hyd', storage);
    expect(result.current).toMatchObject({ status: 'ready', source: 'url', shownIds: ['v-hyd'] });
  });

  it('reads the stored choice of this user only', () => {
    const { storage } = memoryStorage({ 'storm-fleet-vessels:u-2': JSON.stringify({ version: 1, vesselIds: ['v-gam'] }) });
    expect(renderShown('/fleet/dashboard', storage).result.current).toMatchObject({ source: 'default' });
    state.auth = { user: { id: 'u-2' }, profile: { company_id: COMPANY, user_id: 'u-2' } };
    state.vessel = vesselCtx({ loadedForUserId: 'u-2' });
    expect(renderShown('/fleet/dashboard', storage).result.current).toMatchObject({ source: 'storage', shownIds: ['v-gam'] });
  });

  it('a throwing storage is ignored: the default is served and a change still reaches the URL', () => {
    const throwing: VesselsShownStorage = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    const { result, location } = renderShown('/fleet/dashboard', throwing);
    expect(result.current).toMatchObject({ status: 'ready', source: 'default' });
    act(() => {
      if (result.current.status === 'ready') result.current.setShown(['v-gam']);
    });
    expect(location.current).toBe('/fleet/dashboard?vessels=GAM');
    expect(result.current).toMatchObject({ source: 'url', shownIds: ['v-gam'] });
  });

  it('a change writes the URL codes and the storage; the default clears both', () => {
    const { storage, data } = memoryStorage();
    const { result, location } = renderShown('/fleet/dashboard?tab=x', storage);
    act(() => {
      if (result.current.status === 'ready') result.current.setShown(['v-hyd', 'v-dem', 'v-unknown']);
    });
    expect(location.current).toBe('/fleet/dashboard?tab=x&vessels=DEM%2CHYD');
    expect(JSON.parse(data.get('storm-fleet-vessels:u-1') as string).vesselIds).toEqual(['v-dem', 'v-hyd']);
    expect(result.current).toMatchObject({ shownIds: ['v-dem', 'v-hyd'], isDefault: false });

    act(() => {
      if (result.current.status === 'ready') result.current.showAll();
    });
    expect(location.current).toBe('/fleet/dashboard?tab=x');
    expect(data.has('storm-fleet-vessels:u-1')).toBe(false);
    expect(result.current).toMatchObject({ source: 'default', isDefault: true });
  });

  it('an empty selection is ignored', () => {
    const { storage, target } = memoryStorage();
    const { result, location } = renderShown('/fleet/dashboard', storage);
    act(() => {
      if (result.current.status === 'ready') result.current.setShown([]);
    });
    expect(location.current).toBe('/fleet/dashboard');
    expect(target.setItem).not.toHaveBeenCalled();
  });

  it('serves nothing before this user\'s vessels have loaded (D-25, D-41)', () => {
    state.vessel = vesselCtx({ loading: true });
    expect(renderShown('/fleet/dashboard', memoryStorage().storage).result.current).toEqual({ status: 'loading' });
    state.vessel = vesselCtx({ loadedForUserId: 'someone-else' });
    expect(renderShown('/fleet/dashboard', memoryStorage().storage).result.current).toEqual({ status: 'loading' });
    state.auth = { user: { id: USER }, profile: null };
    state.vessel = vesselCtx();
    expect(renderShown('/fleet/dashboard', memoryStorage().storage).result.current).toEqual({ status: 'loading' });
  });

  it('a failed vessel-list load is an error with Retry, never "no vessels"', () => {
    const retryVessels = vi.fn(async () => undefined);
    state.vessel = vesselCtx({ loadError: { message: 'Your vessels could not load.' }, retryVessels });
    const { result } = renderShown('/fleet/dashboard', memoryStorage().storage);
    const s = result.current;
    if (s.status !== 'error') throw new Error('expected error');
    expect(s.error.message).toBe('Your vessels could not load.');
    s.retry();
    expect(retryVessels).toHaveBeenCalledTimes(1);
  });

  it('uses the documented parameter name', () => {
    expect(VESSELS_SHOWN_PARAM).toBe('vessels');
  });
});
