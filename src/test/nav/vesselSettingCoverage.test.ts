/**
 * A nav leaf's `alsoCovers` pages are gated with it (gap/10 IA9, W4; D-63,
 * D-64; spec §5.5). One crew member's Hours of Rest month
 * (`crew/people/:crewId/hours-of-rest`) is not under the Hours of Rest leaf's
 * path, yet the `crew_hor` setting must close it, in the route gate and in
 * the vessel switch alike, because both read `vesselSettingKeysForRest`.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { vesselRouteDecision } from '@/app/nav/vesselRouteGate';
import { vesselSettingKeysForRest, vesselSwitchTarget } from '@/app/nav/vesselSwitch';
import { legacyEntryFor, resolveLegacyTarget } from '@/app/router/legacyResolve';
import { parseVesselPath } from '@/modules/vessels/lib/vesselCode';
import { resolveModuleSettings } from '@/modules/vessels/lib/moduleSettings';
import { VESSEL_MODULES } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';

/** crew_hor switched on for a date that has not come yet: off today (D-63). */
const horLater = resolveModuleSettings(
  {
    status: 'ready',
    source: 'table',
    settings: new Map([['crew_hor', { moduleKey: 'crew_hor', enabled: true, enabledFrom: '2099-01-01', labelOverride: null }]]),
  },
  '2026-11-22',
);

function findLeaf(nodes: readonly NavChild[], moduleSetting: string): NavChild | null {
  for (const node of nodes) {
    if (node.moduleSetting === moduleSetting) return node;
    const below = node.children?.length ? findLeaf(node.children, moduleSetting) : null;
    if (below) return below;
  }
  return null;
}

describe('alsoCovers: pages a leaf governs outside its own path', () => {
  it('the Hours of Rest leaf names one crew member’s month', () => {
    const crew = VESSEL_MODULES.find((m) => m.id === 'crew');
    const hor = findLeaf(crew?.children ?? [], 'crew_hor');
    expect(hor?.path).toBe('crew/hours-of-rest');
    expect(hor?.alsoCovers).toEqual(['crew/people/*/hours-of-rest']);
  });

  it('gives the per-crew page the crew_hor key, after the tab’s', () => {
    expect(vesselSettingKeysForRest('crew/people/p1/hours-of-rest')).toEqual(['crew', 'crew_hor']);
    expect(vesselSettingKeysForRest('/crew/people/p1/hours-of-rest/?year=2026')).toEqual(['crew', 'crew_hor']);
    // `*` is exactly one segment, and the pattern must match whole segments.
    expect(vesselSettingKeysForRest('crew/people/hours-of-rest')).toEqual(['crew']);
    expect(vesselSettingKeysForRest('crew/people/p1/x/hours-of-rest')).toEqual(['crew']);
  });

  it('switching to a vessel with crew_hor off lands on the Crew root, never the closed page', () => {
    expect(
      vesselSwitchTarget({
        currentPath: '/v/dra/crew/people/p1/hours-of-rest?year=2026',
        targetCode: 'hyd',
        isModuleOn: horLater.isModuleOn,
      }),
    ).toBe('/v/hyd/crew');
    // With crew_hor on, the page, query and hash are kept.
    expect(
      vesselSwitchTarget({
        currentPath: '/v/dra/crew/people/p1/hours-of-rest?year=2026#w2',
        targetCode: 'hyd',
        isModuleOn: () => true,
      }),
    ).toBe('/v/hyd/crew/people/p1/hours-of-rest?year=2026#w2');
  });

  it('the legacy /crew/work-rest/:crewId redirect lands on ModuleOff when crew_hor is off', () => {
    const entry = legacyEntryFor('/crew/work-rest/:crewId');
    expect(entry).toBeDefined();
    if (!entry) return;
    const target = resolveLegacyTarget(entry, { crewId: 'p1' }, '?year=2026', '', {
      fleetReach: false,
      allVesselsMode: false,
      lastVesselCode: 'HYD',
      vesselCodeBySlug: () => null,
      vesselCodeById: () => null,
    });
    expect(target).toBe('/v/hyd/crew/people/p1/hours-of-rest?year=2026');
    const parsed = parseVesselPath((target ?? '').split('?')[0]);
    expect(parsed?.rest).toBe('crew/people/p1/hours-of-rest');
    expect(vesselRouteDecision(parsed?.rest ?? '', horLater)).toEqual({ off: 'crew_hor' });
  });
});
