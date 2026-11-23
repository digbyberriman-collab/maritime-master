/**
 * Whether a favourite still opens (D-93, D-04; spec §6.4): the pure resolver
 * behind the favourites menu. Each in-app pin is judged the way its
 * destination route would judge it: an old URL by where it redirects for this
 * viewer (one that renders in place opens), `/fleet/*` by fleet reach,
 * `/v/:code/*` by vessel reach and then that vessel's module settings (the
 * vessel route gate's rule; a failed settings read is "could not check",
 * never "gone"), a workspace page by its ModuleRoute guard where it has one
 * (ModuleRoute's own rule, D-107) and otherwise by the workspace's Apps
 * entry, anything else by its destination. Everything waits while access
 * loads.
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
import { moduleGateDecision, type ModuleGateAccess, type ModuleGateGuard } from '@/shared/components/moduleGate';
import { resolveHrAccess } from '@/modules/auth/lib/hrAccess';
import { resolvePayrollAccess } from '@/modules/auth/lib/payrollAccess';
import { NO_MEDICAL_ACCESS } from '@/modules/auth/lib/medicalAccess';
import { NO_WELLNESS_ACCESS } from '@/modules/auth/lib/wellnessAccess';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { HEALTH_PATHS } from '@/modules/health/paths';

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
  route: () => 'allowed',
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
    // A failed read is not known either way: "could not check", never "no longer available" (D-04, D-107).
    expect(availability('/v/dra/technical', access(), checks({ moduleSettings: settings('error') }))).toBe('error');
    expect(availability('/v/dra/technical', access(), checks({ moduleSettings: off('technical') }))).toBe('unavailable');
    // A leaf key closes that leaf only.
    expect(availability('/v/dra/technical/jobs', access(), checks({ moduleSettings: off('technical.jobs') }))).toBe('unavailable');
    expect(availability('/v/dra/technical/surveys', access(), checks({ moduleSettings: off('technical.jobs') }))).toBe('available');
    // Another module off leaves this one open.
    expect(availability('/v/dra/crew/list', access(), checks({ moduleSettings: off('technical') }))).toBe('available');
  });

  it('an upper-case path after the code is judged like the router judges it (D-111)', () => {
    expect(availability('/v/dra/CREW/list', access(), checks({ moduleSettings: off('crew') }))).toBe('unavailable');
    expect(availability('/v/dra/CREW/list', access(), checks({ moduleSettings: settings('loading') }))).toBe('waiting');
    expect(availability('/v/dra/CREW/list', access(), checks({ moduleSettings: settings('error') }))).toBe('error');
    expect(availability('/v/dra/technical/JOBS', access(), checks({ moduleSettings: off('technical.jobs') }))).toBe('unavailable');
    expect(availability('/V/DRA/Technical', access(), checks({ moduleSettings: off('technical') }))).toBe('unavailable');
    expect(availability('/v/dra/CREW/list', access(), checks({ moduleSettings: ALL_MODULES_ON }))).toBe('available');
    expect(availability('/v/dra/CALENDAR', access(), checks({ moduleSettings: settings('loading') }))).toBe('available');
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

  it('a path with no ModuleRoute page opens when the Apps entry does; waits until the gate is ready', () => {
    const step: PinScopeStep = resolvePinScope('/hris/salaries?tab=2', access());
    expect(step).toEqual({ kind: 'workspace', root: '/hris' });
    expect(finishPinAvailability(step, checks({ workspace: { ready: true, canOpen: (root) => root === '/hris' } }))).toBe('available');
    expect(finishPinAvailability(step, checks({ workspace: { ready: true, canOpen: () => false } }))).toBe('unavailable');
    expect(finishPinAvailability(step, checks({ workspace: { ready: false, canOpen: () => true } }))).toBe('waiting');
    // A login-guarded workspace page (Yard, Legal) is the Apps entry's call too.
    expect(resolvePinScope('/yard/refit/overview/dashboard', access())).toEqual({ kind: 'workspace', root: '/yard' });
  });

  it('a page ModuleRoute guards is judged by its guard (the registry route, until the D-97 gate)', () => {
    expect(resolvePinScope(`${HRIS_PATHS.personalDetails}?module=hris&crew=p-1`, access())).toEqual({
      kind: 'route',
      guard: { kind: 'module', moduleId: 'hris' },
    });
    expect(resolvePinScope(HRIS_PATHS.disciplinary, access())).toEqual({
      kind: 'route',
      guard: { kind: 'module', moduleId: 'hris', hrLevel: 'edit' },
    });
    expect(resolvePinScope(HEALTH_PATHS.medicalDashboard, access())).toEqual({
      kind: 'route',
      guard: { kind: 'module', moduleId: 'health', medicalLevel: 'view' },
    });
    const step = resolvePinScope(HRIS_PATHS.payroll, access());
    expect(finishPinAvailability(step, checks({ route: () => 'allowed' }))).toBe('available');
    expect(finishPinAvailability(step, checks({ route: () => 'denied' }))).toBe('unavailable');
    expect(finishPinAvailability(step, checks({ route: () => 'loading' }))).toBe('waiting');
  });
});

describe('a self-service HR viewer (crew; D-107)', () => {
  const selfHr = resolveHrAccess({ rbacInitialized: true, rbacRoles: [], hrPermission: null, legacyRole: 'crew' });
  const gateAccess = (patch: Partial<ModuleGateAccess> = {}): ModuleGateAccess => ({
    rbacInitialized: true,
    rbacLoading: false,
    // AuthContext's rule for HRIS: any HR level but none.
    canAccessModule: (moduleId) => moduleId === 'hris' && selfHr.level !== 'none',
    hr: { ...selfHr, loading: false },
    payroll: { ...resolvePayrollAccess({ rbacRoles: [], financePermission: null, legacyRole: 'crew' }), loading: false },
    medical: { ...NO_MEDICAL_ACCESS, loading: false },
    wellness: { ...NO_WELLNESS_ACCESS, loading: false },
    capability: () => ({ allowed: false, status: 'denied' }),
    ...patch,
  });
  // The HRIS Apps entry needs HR view, which a self-service viewer does not have.
  const crewChecks = (patch: Partial<ModuleGateAccess> = {}) =>
    checks({ route: (guard: ModuleGateGuard) => moduleGateDecision(guard, gateAccess(patch)), workspace: { ready: true, canOpen: () => false } });

  it('has self access, and the HRIS Apps entry stays closed to them', () => {
    expect(selfHr.level).toBe('self');
  });

  it('a page they open (no HR level on the route) is available, though Apps offers no HRIS', () => {
    expect(availability(`${HRIS_PATHS.personalDetails}?module=hris&crew=p-1`, access(), crewChecks())).toBe('available');
  });

  it('a page that needs an HR level is unavailable', () => {
    expect(availability(HRIS_PATHS.disciplinary, access(), crewChecks())).toBe('unavailable');
    expect(availability(HRIS_PATHS.reporting, access(), crewChecks())).toBe('unavailable');
  });

  it('a page that needs a finance level is unavailable', () => {
    expect(availability(HRIS_PATHS.payroll, access(), crewChecks())).toBe('unavailable');
    expect(availability(HRIS_PATHS.compensationSettings, access(), crewChecks())).toBe('unavailable');
  });

  it('waits while the route checks load', () => {
    expect(availability(HRIS_PATHS.personalDetails, access(), crewChecks({ rbacInitialized: false }))).toBe('waiting');
    expect(availability(HRIS_PATHS.personalDetails, access(), crewChecks({ hr: { ...selfHr, loading: true } }))).toBe('waiting');
  });

  it('a capability-guarded page follows the capability: denied is unavailable, loading waits', () => {
    const step: PinScopeStep = { kind: 'route', guard: { kind: 'capability', capability: 'vessel.safety.drills.view' } };
    expect(finishPinAvailability(step, crewChecks())).toBe('unavailable');
    expect(finishPinAvailability(step, crewChecks({ capability: () => ({ allowed: false, status: 'unknown' }) }))).toBe('unavailable');
    expect(finishPinAvailability(step, crewChecks({ capability: () => ({ allowed: false, status: 'loading' }) }))).toBe('waiting');
    expect(finishPinAvailability(step, crewChecks({ capability: () => ({ allowed: true, status: 'granted' }) }))).toBe('available');
  });

  it('a workspace path with no registered page is still the Apps entry’s call', () => {
    expect(resolvePinScope('/hris/salaries', access())).toEqual({ kind: 'workspace', root: '/hris' });
    expect(availability('/hris/salaries', access(), crewChecks())).toBe('unavailable');
  });
});

describe('anything else: the destination decides', () => {
  it.each(['/me', '/me/security', '/inbox', '/help/support', '/legal/terms-of-service', '/'])('%s is available', (target) => {
    expect(availability(target, access({ fleetReach: false, lastVesselCode: null }))).toBe('available');
  });
});
