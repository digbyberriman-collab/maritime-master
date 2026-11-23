/**
 * Whether a favourite still opens (D-93, D-04; spec §6.4): the pure resolver
 * behind the favourites menu. Each in-app pin is judged the way its
 * destination route would judge it: an old URL by where it redirects for this
 * viewer (one that renders in place opens), `/fleet/*` by fleet reach,
 * `/v/:code/*` by vessel reach and then that vessel's module settings (the
 * vessel route gate's rule), a workspace by its Apps entry, anything else by
 * its destination. Everything waits while access loads.
 */
import { describe, expect, it, vi } from 'vitest';

// The module's hook reads access through stores that import the client; the resolver itself reads nothing.
vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);

import {
  finishPinAvailability,
  legacyEntryForPathname,
  resolvePinScope,
  workspaceRootOf,
  type PinChecks,
  type PinScopeAccess,
  type PinScopeStep,
} from '@/shared/components/layout/topbar/pinAvailability';
import { ALL_MODULES_ON, resolveModuleSettings, type ModuleSettingsResolver } from '@/modules/vessels/lib/moduleSettings';

const REACHABLE: Readonly<Record<string, string>> = { DRA: 'v-dra', HYD: 'v-hyd' };

function access(patch: Partial<PinScopeAccess> = {}, legacyPatch: Partial<PinScopeAccess['legacy']> = {}): PinScopeAccess {
  const fleetReach = patch.fleetReach ?? true;
  const lastVesselCode = patch.lastVesselCode === undefined ? 'DRA' : patch.lastVesselCode;
  return {
    ready: true,
    fleetReach,
    lastVesselCode,
    reachableVesselId: (code) => REACHABLE[code.toUpperCase()] ?? null,
    ...patch,
    legacy: {
      fleetReach,
      allVesselsMode: false,
      lastVesselCode,
      vesselCodeBySlug: () => null,
      vesselCodeById: () => null,
      ...legacyPatch,
    },
  };
}

const settings = (status: 'loading' | 'error'): ModuleSettingsResolver => resolveModuleSettings(status === 'loading' ? { status } : { status, message: 'timeout' }, '2026-11-23');
const off = (...keys: string[]): ModuleSettingsResolver =>
  resolveModuleSettings(
    {
      status: 'ready',
      source: 'table',
      settings: new Map(keys.map((moduleKey) => [moduleKey, { moduleKey, enabled: false, enabledFrom: null, labelOverride: null }])),
    },
    '2026-11-23',
  );

const checks = (patch: Partial<PinChecks> = {}): PinChecks => ({
  moduleSettings: ALL_MODULES_ON,
  workspace: { ready: true, canOpen: () => true },
  ...patch,
});

/** Both steps, as the hook runs them. */
const availability = (target: string, viewer = access(), with_ = checks()) => finishPinAvailability(resolvePinScope(target, viewer), with_);

describe('while access loads', () => {
  it.each(['/fleet/dashboard', '/v/dra/crew/list', '/hris/salaries', '/me', '/inbox', '/crew', '/help/support'])('%s waits', (target) => {
    expect(resolvePinScope(target, access({ ready: false }))).toEqual({ kind: 'settled', availability: 'waiting' });
  });
});

describe('the Fleet scope', () => {
  it('opens with fleet reach', () => {
    expect(availability('/fleet/admin/users')).toBe('available');
    expect(availability('/fleet?x=1')).toBe('available');
  });

  it('is unavailable without it, whatever the case of the URL', () => {
    const vesselOnly = access({ fleetReach: false });
    expect(availability('/fleet/admin/users', vesselOnly)).toBe('unavailable');
    expect(availability('/fleet', vesselOnly)).toBe('unavailable');
    expect(availability('/Fleet/Dashboard?tab=1', vesselOnly)).toBe('unavailable');
  });

  it('does not take a lookalike prefix for the Fleet scope', () => {
    expect(availability('/fleetwide', access({ fleetReach: false }))).toBe('available');
  });
});

describe('the vessel scope', () => {
  it('a reachable vessel goes on to its module settings, with the path after the code', () => {
    expect(resolvePinScope('/v/dra/technical/jobs?id=1', access())).toEqual({ kind: 'vessel', vesselId: 'v-dra', rest: 'technical/jobs' });
    expect(resolvePinScope('/V/HYD/crew/list', access())).toEqual({ kind: 'vessel', vesselId: 'v-hyd', rest: 'crew/list' });
  });

  it('an unknown, unreached or sold vessel is unavailable (only reachable vessels count)', () => {
    expect(availability('/v/xip/technical')).toBe('unavailable');
    expect(availability('/v/zzz')).toBe('unavailable');
  });

  it('the module settings decide as the route gate does: on, loading, failed, off', () => {
    expect(availability('/v/dra/technical', access(), checks({ moduleSettings: ALL_MODULES_ON }))).toBe('available');
    expect(availability('/v/dra/technical', access(), checks({ moduleSettings: settings('loading') }))).toBe('waiting');
    expect(availability('/v/dra/technical', access(), checks({ moduleSettings: settings('error') }))).toBe('unavailable');
    expect(availability('/v/dra/technical', access(), checks({ moduleSettings: off('technical') }))).toBe('unavailable');
    // A leaf key closes that leaf only.
    expect(availability('/v/dra/technical/jobs', access(), checks({ moduleSettings: off('technical.jobs') }))).toBe('unavailable');
    expect(availability('/v/dra/technical/surveys', access(), checks({ moduleSettings: off('technical.jobs') }))).toBe('available');
    // Another module off leaves this one open.
    expect(availability('/v/dra/crew/list', access(), checks({ moduleSettings: off('technical') }))).toBe('available');
  });

  it('paths no setting governs (the vessel home, Calendar) never wait for the settings', () => {
    expect(availability('/v/dra', access(), checks({ moduleSettings: settings('loading') }))).toBe('available');
    expect(availability('/v/dra/calendar', access(), checks({ moduleSettings: settings('error') }))).toBe('available');
  });

  it('the literal /v/:vesselCode form opens the current vessel; with no vessel there is no page', () => {
    expect(resolvePinScope('/v/:vesselCode/crew/list', access())).toEqual({ kind: 'vessel', vesselId: 'v-dra', rest: 'crew/list' });
    expect(availability('/v/:vesselCode/crew/list', access({ lastVesselCode: null }))).toBe('unavailable');
  });
});

describe('old URLs (the legacy redirect table)', () => {
  it('matches an old URL the way the router ranks its routes: a static segment beats a param', () => {
    expect(legacyEntryForPathname('/vessel/logbooks')?.entry.from).toBe('/vessel/logbooks');
    expect(legacyEntryForPathname('/vessel/logbooks/registry')?.entry.from).toBe('/vessel/logbooks/registry');
    expect(legacyEntryForPathname('/vessel/draak')?.entry.from).toBe('/vessel/:vesselSlug');
    expect(legacyEntryForPathname('/users-access/u-7')?.params).toEqual({ userId: 'u-7' });
    expect(legacyEntryForPathname('/fleet/dashboard')).toBeNull();
    expect(legacyEntryForPathname('/documents/master-index')).toBeNull();
  });

  it('a redirect is judged by where it lands: /crew opens the current vessel’s roster', () => {
    expect(resolvePinScope('/crew', access())).toEqual({ kind: 'vessel', vesselId: 'v-dra', rest: 'crew/roster' });
    expect(availability('/crew')).toBe('available');
    expect(availability('/crew', access(), checks({ moduleSettings: off('crew') }))).toBe('unavailable');
    expect(availability('/crew', access(), checks({ moduleSettings: settings('loading') }))).toBe('waiting');
  });

  it('an old page that renders in place for this viewer is available', () => {
    // No vessel to scope to.
    expect(availability('/crew', access({ lastVesselCode: null }))).toBe('available');
    // A fleet user in "All vessels" mode.
    expect(availability('/certificates', access({}, { allVesselsMode: true }))).toBe('available');
    // A fleet target without fleet reach.
    expect(availability('/documents', access({ fleetReach: false }))).toBe('available');
    // A slug that names no reachable vessel.
    expect(availability('/vessel/nowhere')).toBe('available');
  });

  it('a fleet redirect needs fleet reach like any fleet page, and a personal one always opens', () => {
    expect(resolvePinScope('/documents', access())).toEqual({ kind: 'settled', availability: 'available' });
    expect(availability('/settings', access({ fleetReach: false }))).toBe('available');
    expect(availability('/notifications', access({ fleetReach: false }))).toBe('available');
  });
});

describe('workspaces', () => {
  it('finds the workspace a path sits in (the Legal workspace keeps its department URL)', () => {
    expect(workspaceRootOf('/hris/salaries')).toBe('/hris');
    expect(workspaceRootOf('/health')).toBe('/health');
    expect(workspaceRootOf('/yard/projects')).toBe('/yard');
    expect(workspaceRootOf('/shoreside/x')).toBe('/shoreside');
    expect(workspaceRootOf('/departments/legal/contracts')).toBe('/departments/legal');
    expect(workspaceRootOf('/legal/privacy-policy')).toBeNull();
    expect(workspaceRootOf('/hrisx')).toBeNull();
  });

  it('opens when the Apps entry does; waits until the gate is ready', () => {
    const step: PinScopeStep = resolvePinScope('/hris/salaries?tab=2', access());
    expect(step).toEqual({ kind: 'workspace', root: '/hris' });
    expect(finishPinAvailability(step, checks({ workspace: { ready: true, canOpen: (root) => root === '/hris' } }))).toBe('available');
    expect(finishPinAvailability(step, checks({ workspace: { ready: true, canOpen: () => false } }))).toBe('unavailable');
    expect(finishPinAvailability(step, checks({ workspace: { ready: false, canOpen: () => true } }))).toBe('waiting');
  });
});

describe('anything else: the destination decides', () => {
  it.each(['/me', '/me/security', '/inbox', '/help/support', '/legal/terms-of-service', '/'])('%s is available', (target) => {
    expect(availability(target, access({ fleetReach: false, lastVesselCode: null }))).toBe('available');
  });
});
