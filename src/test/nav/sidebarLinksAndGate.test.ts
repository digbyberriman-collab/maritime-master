/**
 * Pure rules behind the shell nav (spec §4.4, §4.5, §5.5):
 * - the sidebar's `?module=` rule (deferred item 2 with D-45);
 * - the badge registry (unknown key or 0 → nothing);
 * - the module-off route gate (paths no key governs are never gated).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { isScopedPath, sidebarHref } from '@/app/nav/sidebarLinks';
import { NAV_BADGES, navBadgeFor } from '@/app/nav/badges';
import { moduleSettingLabel, moduleSettingsForVesselPath, vesselRouteDecision } from '@/app/nav/vesselRouteGate';
import { ALL_MODULES_ON, resolveModuleSettings, type ModuleSettingsResolver } from '@/modules/vessels/lib/moduleSettings';

describe('sidebarHref (deferred item 2, D-45)', () => {
  const hris = { moduleParam: 'hris', rootPath: '/hris' };

  it('never adds ?module= to a Fleet, vessel or personal link', () => {
    expect(sidebarHref('/me/training', hris)).toBe('/me/training');
    expect(sidebarHref('/fleet/training', hris)).toBe('/fleet/training');
    expect(sidebarHref('/v/dra/crew/list', hris)).toBe('/v/dra/crew/list');
    expect(sidebarHref('/inbox?tab=attention', hris)).toBe('/inbox?tab=attention');
  });

  it('keeps ?module= on a legacy URL and the tree’s own pages (D-45: Leave Planner stays in HRIS)', () => {
    expect(sidebarHref('/crew/leave', hris)).toBe('/crew/leave?module=hris');
    expect(sidebarHref('/crew/leave/requests?x=1#h', hris)).toBe('/crew/leave/requests?x=1&module=hris#h');
    expect(sidebarHref('/hris/employee-records/personal-details', hris)).toBe('/hris/employee-records/personal-details?module=hris');
  });

  it('never adds it to another workspace’s root (a cross-link into Health opens Health’s tree)', () => {
    expect(sidebarHref('/health/spa', { moduleParam: 'departments', rootPath: '/departments' })).toBe('/health/spa');
    expect(sidebarHref('/departments/legal', hris)).toBe('/departments/legal');
  });

  it('adds nothing for Fleet and vessel sidebars', () => {
    expect(sidebarHref('/crew/leave', { moduleParam: null, rootPath: '/fleet' })).toBe('/crew/leave');
  });

  it('knows the scoped prefixes', () => {
    expect(['/fleet', '/fleet/x', '/v/dra', '/me', '/me/a', '/inbox'].every(isScopedPath)).toBe(true);
    expect(['/fleetx', '/vessels', '/meet', '/crew/leave', '/'].some(isScopedPath)).toBe(false);
  });
});

describe('the badge registry', () => {
  const counts = { pendingCompliance: 2, unreadMessages: 1, overdueTasks: 0 };

  it('names and tones a count', () => {
    expect(navBadgeFor('pendingCompliance', counts)).toMatchObject({ count: 2, label: '2 pending compliance items', tone: 'critical', text: '2' });
    expect(navBadgeFor('unreadMessages', counts)).toMatchObject({ label: '1 unread message', tone: 'primary' });
    expect(navBadgeFor('pendingCompliance', { ...counts, pendingCompliance: 140 })?.text).toBe('99+');
  });

  it('renders nothing for 0, an unknown key or counts not loaded (never a fake number)', () => {
    expect(navBadgeFor('overdueTasks', counts)).toBeNull();
    expect(navBadgeFor('supportWaiting', counts)).toBeNull();
    expect(navBadgeFor('toString', counts)).toBeNull();
    expect(navBadgeFor('unreadMessages', undefined)).toBeNull();
    expect(navBadgeFor(undefined, counts)).toBeNull();
    expect(Object.keys(NAV_BADGES).sort()).toEqual(['overdueTasks', 'pendingCompliance', 'unreadMessages']);
  });
});

describe('the module-off route gate', () => {
  const loading = resolveModuleSettings({ status: 'loading' }, '2026-11-22');
  const failed = resolveModuleSettings({ status: 'error', message: 'x' }, '2026-11-22');
  const off = (...keys: string[]): ModuleSettingsResolver => ({ status: 'ready', isModuleOn: (k) => !keys.includes(k), labelFor: (k) => (k === 'planner' ? 'Leave' : null) });

  it('lists the keys a page needs, tab first', () => {
    expect(moduleSettingsForVesselPath('technical/jobs/123')).toEqual(['technical', 'technical.jobs']);
    expect(moduleSettingsForVesselPath('crew/hours-of-rest')).toEqual(['crew', 'crew_hor']);
    expect(moduleSettingsForVesselPath('')).toEqual([]);
    expect(moduleSettingsForVesselPath('calendar')).toEqual([]);
  });

  it('never gates the vessel home or Calendar, whatever the settings state', () => {
    for (const resolver of [loading, failed, off('crew', 'technical')]) {
      expect(vesselRouteDecision('', resolver)).toBe('ok');
      expect(vesselRouteDecision('calendar', resolver)).toBe('ok');
      expect(vesselRouteDecision('somewhere/else', resolver)).toBe('ok');
    }
  });

  it('waits while loading, fails closed on an error, names the first key that is off', () => {
    expect(vesselRouteDecision('technical', loading)).toBe('loading');
    expect(vesselRouteDecision('technical', failed)).toBe('error');
    expect(vesselRouteDecision('technical', off('technical'))).toEqual({ off: 'technical' });
    expect(vesselRouteDecision('technical/jobs/7', off('technical.jobs'))).toEqual({ off: 'technical.jobs' });
    expect(vesselRouteDecision('technical/surveys', off('technical.jobs'))).toBe('ok');
    expect(vesselRouteDecision('crew/list', ALL_MODULES_ON)).toBe('ok');
  });

  it('names an off key the way the nav does, after the vessel’s override', () => {
    expect(moduleSettingLabel('technical', () => null)).toBe('Technical');
    expect(moduleSettingLabel('technical.jobs', () => null)).toBe('Jobs');
    expect(moduleSettingLabel('planner', off().labelFor)).toBe('Leave');
    expect(moduleSettingLabel('unknown.key', () => null)).toBe('unknown.key');
  });
});
