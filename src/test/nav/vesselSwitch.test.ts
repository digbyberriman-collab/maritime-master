/**
 * Where "open vessel B" lands (gap/10 W2, IA23; spec §6.1, §6.2): the
 * sub-path kept when its modules are on and its tab visible, else the tab
 * root, else the vessel home; Fleet pages open their vessel counterpart;
 * everything else opens the vessel home. Plus the counterpart table and the
 * device-local recent list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { vesselSettingKeysForRest, vesselSwitchTarget, vesselTabRootForRest } from '@/app/nav/vesselSwitch';
import { COUNTERPARTS, fleetCounterpart, vesselCounterpart } from '@/app/nav/counterparts';
import { parseRecentVessels, readRecentVessels, recentVesselsKey, recordRecentVessel } from '@/app/nav/recentVessels';
import { buildVesselTabs, vesselRestVisibilityFromTabs } from '@/app/nav/vesselNavModel';
import type { NavNodeDecision } from '@/app/nav/visibility';
import type { NavChild } from '@/config/navigation-types';

const allOn = () => true;
const off = (...keys: string[]) => (key: string) => !keys.includes(key);

describe('vesselSwitchTarget inside the vessel scope', () => {
  it('keeps the sub-path, query and hash when the module is on and visible', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra/safety/drills?x=1#top', targetCode: 'hyd', isModuleOn: allOn })).toBe(
      '/v/hyd/safety/drills?x=1#top',
    );
  });

  it('keeps the query on the vessel home', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra?tab=crew', targetCode: 'HYD', isModuleOn: allOn })).toBe('/v/hyd?tab=crew');
  });

  it('goes to the tab root when a leaf-level module is off for the target', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra/technical/jobs/42', targetCode: 'hyd', isModuleOn: off('technical.jobs') })).toBe(
      '/v/hyd/technical',
    );
  });

  it('goes to the vessel home when the whole module is off', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra/technical/jobs/42', targetCode: 'hyd', isModuleOn: off('technical') })).toBe('/v/hyd');
    expect(vesselSwitchTarget({ currentPath: '/v/dra/crew/list?x=1', targetCode: 'hyd', isModuleOn: off('crew') })).toBe('/v/hyd');
  });

  it('goes to the vessel home when the tab is not visible to the user', () => {
    expect(
      vesselSwitchTarget({ currentPath: '/v/dra/logbooks/review', targetCode: 'hyd', isModuleOn: allOn, isVisible: (rest) => rest !== 'logbooks' }),
    ).toBe('/v/hyd');
  });

  it('fails closed while the target settings are loading (every key off): the vessel home', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra/crew/list', targetCode: 'hyd', isModuleOn: () => false })).toBe('/v/hyd');
  });

  it('judges an upper-case rest like the router (D-111) and keeps it as written', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra/CREW/list', targetCode: 'hyd', isModuleOn: off('crew') })).toBe('/v/hyd');
    expect(vesselSwitchTarget({ currentPath: '/v/dra/technical/JOBS', targetCode: 'hyd', isModuleOn: off('technical.jobs') })).toBe(
      '/v/hyd/technical',
    );
    expect(vesselSwitchTarget({ currentPath: '/v/dra/CREW/list?x=1#y', targetCode: 'hyd', isModuleOn: allOn })).toBe('/v/hyd/CREW/list?x=1#y');
    expect(
      vesselSwitchTarget({ currentPath: '/v/dra/LOGBOOKS/review', targetCode: 'hyd', isModuleOn: allOn, isVisible: (rest) => rest !== 'logbooks' }),
    ).toBe('/v/hyd');
  });

  it('keeps a page outside every module (its own guard decides)', () => {
    expect(vesselSwitchTarget({ currentPath: '/v/dra/unknown/page', targetCode: 'hyd', isModuleOn: () => false })).toBe('/v/hyd/unknown/page');
  });
});

describe('vesselSwitchTarget from other scopes', () => {
  it.each([
    ['/fleet/training', 'crew/training'],
    ['/fleet/training/matrix?x=1', 'crew/training'],
    ['/fleet/planner', 'crew/planner'],
    ['/fleet/calendar', 'calendar'],
    ['/fleet/tracker', 'vessel/tracking'],
    ['/fleet/dashboard', ''],
    ['/fleet/documents', 'safety/fleet-documents'],
    ['/fleet/documents?tab=acknowledgements', 'safety/fleet-documents'],
    ['/fleet/forms/safety', 'safety/checklists'],
    ['/fleet/forms/technical', 'technical/forms'],
  ])('a Fleet page %s opens its counterpart %s', (from, rest) => {
    expect(vesselSwitchTarget({ currentPath: from, targetCode: 'HYD', isModuleOn: allOn })).toBe(rest ? `/v/hyd/${rest}` : '/v/hyd');
  });

  it('a Fleet counterpart that is off or hidden for the target opens the vessel home', () => {
    expect(vesselSwitchTarget({ currentPath: '/fleet/training', targetCode: 'HYD', isModuleOn: off('crew_training') })).toBe('/v/hyd');
    expect(vesselSwitchTarget({ currentPath: '/fleet/training', targetCode: 'HYD', isModuleOn: allOn, isVisible: () => false })).toBe('/v/hyd');
  });

  it('a Fleet page without a counterpart opens the vessel home', () => {
    expect(vesselSwitchTarget({ currentPath: '/fleet/admin/vessels', targetCode: 'HYD', isModuleOn: allOn })).toBe('/v/hyd');
    // The fleet forms overview has no single vessel page; only its areas do.
    expect(vesselSwitchTarget({ currentPath: '/fleet/forms', targetCode: 'HYD', isModuleOn: allOn })).toBe('/v/hyd');
  });

  it('a counterpart the target vessel does not show (Fleet Documents is planned) opens the vessel home', () => {
    expect(
      vesselSwitchTarget({ currentPath: '/fleet/documents', targetCode: 'HYD', isModuleOn: allOn, isVisible: (rest) => rest !== 'safety/fleet-documents' }),
    ).toBe('/v/hyd');
  });

  it.each(['/hris/people', '/me/hours-of-rest', '/ism/incidents?x=1', '/'])('%s opens the vessel home', (from) => {
    expect(vesselSwitchTarget({ currentPath: from, targetCode: 'hyd', isModuleOn: allOn })).toBe('/v/hyd');
  });
});

describe('module-setting keys of a vessel page', () => {
  it.each([
    ['crew/list', ['crew']],
    ['crew/planner/manning', ['crew', 'planner']],
    ['crew/training', ['crew', 'crew_training']],
    ['technical/jobs/7', ['technical', 'technical.jobs']],
    ['technical', ['technical']],
    ['calendar', []],
    ['', []],
    ['unknown', []],
    // Case-insensitive, like the router (D-111).
    ['CREW/List', ['crew']],
    ['Technical/JOBS/7', ['technical', 'technical.jobs']],
    ['crew/people/P1/HOURS-OF-REST', ['crew', 'crew_hor']],
  ])('%s needs %j', (rest, keys) => {
    expect(vesselSettingKeysForRest(rest)).toEqual(keys);
  });

  it('knows the tab root of a page', () => {
    expect(vesselTabRootForRest('crew/list/7')).toBe('crew');
    expect(vesselTabRootForRest('')).toBe('');
    expect(vesselTabRootForRest('nowhere')).toBeNull();
    expect(vesselTabRootForRest('CREW/list/7')).toBe('crew');
  });
});

describe('vessel page visibility in the filtered vessel nav', () => {
  const visibility = (decide: (node: NavChild) => NavNodeDecision) =>
    vesselRestVisibilityFromTabs(buildVesselTabs({ code: 'HYD', resolver: { labelFor: () => null }, decide }), 'HYD');
  const builtOnly = (node: NavChild): NavNodeDecision => (node.status === 'planned' ? 'hidden' : 'visible');

  it('the vessel home and a visible tab root are visible', () => {
    const visible = visibility(builtOnly);
    expect(visible('')).toBe(true);
    expect(visible('crew')).toBe(true);
    expect(visible('crew/training')).toBe(true);
  });

  it('a planned (hidden) child or tab is not', () => {
    const visible = visibility(builtOnly);
    // Performance Appraisals (X1 wave 2) and the whole Charter tab are planned.
    expect(visible('crew/appraisals')).toBe(false);
    expect(visible('CREW/Appraisals')).toBe(false);
    expect(visible('charter')).toBe(false);
  });

  it('a locked tab (an add-on the vessel lacks) is not', () => {
    const visible = visibility((node) => (node.id === 'vessel-technical' ? 'locked' : builtOnly(node)));
    expect(visible('technical')).toBe(false);
    expect(visible('technical/jobs')).toBe(false);
    expect(visible('crew/list')).toBe(true);
    // An as-written rest is judged like the router (D-111).
    expect(visible('Technical/JOBS')).toBe(false);
    expect(visible('CREW/List')).toBe(true);
  });

  it('fails closed with a filter that shows nothing', () => {
    const visible = visibility(() => 'hidden');
    expect(visible('crew/list')).toBe(false);
    expect(visible('crew')).toBe(false);
    expect(visible('')).toBe(true);
  });
});

describe('counterparts', () => {
  it('map each vessel page to its Fleet page, longest prefix first', () => {
    expect(fleetCounterpart('')).toBe('/fleet/dashboard');
    expect(fleetCounterpart('crew/training/records/4')).toBe('/fleet/training');
    expect(fleetCounterpart('crew/visitors')).toBe('/fleet/visits');
    expect(fleetCounterpart('safety/drills')).toBe('/fleet/safety');
    expect(fleetCounterpart('vessel/tracking')).toBe('/fleet/tracker');
    // The fleet documents and forms areas (gap/02 FD, FC) beat the Safety tab's queue.
    expect(fleetCounterpart('safety/fleet-documents')).toBe('/fleet/documents');
    expect(fleetCounterpart('safety/checklists')).toBe('/fleet/forms/safety');
    expect(fleetCounterpart('technical/forms')).toBe('/fleet/forms/technical');
    expect(fleetCounterpart('technical/jobs')).toBeNull();
    expect(fleetCounterpart('crew/list')).toBeNull();
    expect(fleetCounterpart('vessel/details')).toBeNull();
  });

  it('map back from Fleet pages', () => {
    expect(vesselCounterpart('/fleet/visits')).toBe('crew/visitors');
    expect(vesselCounterpart('/fleet/safety?tab=queue')).toBe('safety');
    expect(vesselCounterpart('/fleet/documents?tab=acknowledgements')).toBe('safety/fleet-documents');
    expect(vesselCounterpart('/fleet/forms/technical')).toBe('technical/forms');
    expect(vesselCounterpart('/fleet/forms')).toBeNull();
    expect(vesselCounterpart('/fleet/admin/users')).toBeNull();
  });

  it('are one-to-one', () => {
    for (const { vesselRest, fleetPath } of COUNTERPARTS) {
      expect(fleetCounterpart(vesselRest)).toBe(fleetPath);
      expect(vesselCounterpart(fleetPath)).toBe(vesselRest);
    }
  });
});

describe('recent vessels (device-local, per user)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the last three, newest first, without duplicates', () => {
    for (const id of ['a', 'b', 'c', 'b', 'd']) recordRecentVessel('u1', id);
    expect(readRecentVessels('u1')).toEqual(['d', 'b', 'c']);
    expect(readRecentVessels('u2')).toEqual([]);
    expect(localStorage.getItem(recentVesselsKey('u1'))).toBe(JSON.stringify(['d', 'b', 'c']));
  });

  it('ignores a missing user or vessel', () => {
    recordRecentVessel(null, 'a');
    recordRecentVessel('u1', null);
    expect(localStorage.length).toBe(0);
  });

  it('reads anything malformed as empty', () => {
    expect(parseRecentVessels('not json')).toEqual([]);
    expect(parseRecentVessels('{"a":1}')).toEqual([]);
    expect(parseRecentVessels('["a", 3, "", "a", "b"]')).toEqual(['a', 'b']);
  });

  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => recordRecentVessel('u1', 'a')).not.toThrow();
    expect(readRecentVessels('u1')).toEqual([]);
    spy.mockRestore();
    set.mockRestore();
  });
});
