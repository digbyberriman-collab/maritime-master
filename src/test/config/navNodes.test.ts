/**
 * Nav node fields (BUILD-PLAN B3, updated for the target tree in B7; gap/10
 * IA6, IA9, IA10, IA21; D-06).
 */
import { describe, expect, it } from 'vitest';
import { Shield } from 'lucide-react';
import {
  FLEET_PLACEHOLDER_LEAVES,
  NAVIGATION_ITEMS,
  PLACEHOLDER_LEAVES,
  SECTION_REDIRECTS,
  S,
  VESSEL_PLACEHOLDER_LEAVES,
  VESSEL_ROOT_REDIRECTS,
  navLeaves,
} from '@/config/sitemap';
import { vesselPatternPath } from '@/modules/vessels/lib/vesselCode';
import type { NavChild, NavItem } from '@/config/navigation-types';
import { canUseRoadmap, readShowRoadmap, writeShowRoadmap, SHOW_ROADMAP_KEY } from '@/app/nav/roadmap';
import { isNavNodeVisible, navKindOf } from '@/app/nav/visibility';

const leaves = navLeaves(NAVIGATION_ITEMS);
const module = (id: string) => NAVIGATION_ITEMS.find((m) => m.id === id) as NavItem;
const find = (items: NavChild[] | undefined, label: string): NavChild | undefined => {
  for (const it of items ?? []) {
    if (it.label === label) return it;
    const nested = find(it.children, label);
    if (nested) return nested;
  }
  return undefined;
};

describe('nav node fields', () => {
  it('every leaf has a status and a scope', () => {
    expect(leaves.filter((l) => !['planned', 'beta', 'live'].includes(l.status ?? '')).map((l) => l.path)).toEqual([]);
    expect(leaves.filter((l) => !l.scope).map((l) => l.path)).toEqual([]);
  });

  it('scopes follow the module, with per-leaf overrides', () => {
    expect(module('fleet').scope).toBe('fleet');
    expect(module('vessel').scope).toBe('vessel');
    for (const id of ['shoreside', 'health', 'yard', 'hris']) expect(module(id).scope).toBe('workspace');
    expect(find(module('fleet').children, 'Dashboard')?.scope).toBe('fleet');
    // B7: the workspace cross-links keep their own scope inside the Fleet tree.
    expect(find(module('fleet').children, 'Workspaces')?.scope).toBe('workspace');
    expect(find(module('fleet').children, 'HRIS')?.scope).toBe('workspace');
    expect(find(module('vessel').children, 'Crew List')?.scope).toBe('vessel');
    expect(find(module('vessel').children, 'Payroll')?.scope).toBe('workspace');
  });

  it('a leaf that opened Coming Soon is planned; a real page is live', () => {
    expect(find(module('vessel').children, 'Summary')?.status).toBe('planned');
    expect(find(module('fleet').children, 'Safety queue')?.status).toBe('planned');
    expect(find(module('vessel').children, 'Drills')?.status).toBe('live');
    expect(find(module('fleet').children, 'Tracker')?.status).toBe('live');
    // A rebuilt Phase 3 page goes live as beta behind its capability (X5-02A).
    expect(find(module('fleet').children, 'Dashboard')).toMatchObject({ status: 'beta', capability: 'fleet.operations.fleet_dashboard.view' });
  });

  it('every placeholder belongs to a planned leaf', () => {
    const planned = new Set(leaves.filter((l) => l.status === 'planned').map((l) => l.path));
    const all = [
      ...PLACEHOLDER_LEAVES.map((p) => p.path),
      ...FLEET_PLACEHOLDER_LEAVES.map((p) => `/fleet/${p.path}`),
      ...VESSEL_PLACEHOLDER_LEAVES.map((p) => vesselPatternPath(p.path)),
    ];
    expect(all.length).toBeGreaterThan(50);
    expect(all.filter((p) => !planned.has(p))).toEqual([]);
  });

  it('section redirects prefer a leaf with a real page', () => {
    // Inside the vessel scope (B7): Summary is planned, so Safety opens Drills.
    expect(VESSEL_ROOT_REDIRECTS.find((r) => r.from === 'safety')?.to).toBe('drills');
    // A workspace group with nothing built still redirects somewhere that resolves.
    expect(SECTION_REDIRECTS.find((r) => r.from === '/yard/refit/projects')?.to).toMatch(/^\/yard\/refit\/projects\//);
    // The Shoreside root is its own (planned) landing page (D-17), not a redirect.
    expect(SECTION_REDIRECTS.some((r) => r.from === '/shoreside')).toBe(false);
    expect(PLACEHOLDER_LEAVES.some((p) => p.path === '/shoreside')).toBe(true);
  });

  it('badges are named by key on the nodes that carry them', () => {
    const vessel = module('vessel').children;
    expect(find(vessel, 'Safety')?.badgeKey).toBe('pendingCompliance');
    expect(find(vessel, 'Technical')?.badgeKey).toBe('overdueTasks');
    expect(find(vessel, 'Communications')?.badgeKey).toBe('unreadMessages');
  });

  it('vessel modules name their vessel_module_settings key', () => {
    const groups = module('vessel').children ?? [];
    expect(groups.map((g) => g.moduleSetting ?? null)).toEqual([
      null, 'crew', 'safety', 'certificates', 'technical', 'charter', 'vessel', 'logbooks', 'finance', 'departments', null, null,
    ]);
  });

  it('S() builds a section heading that keeps its children', () => {
    const child: NavChild = { id: 'x', label: 'X', path: '/fleet/x', icon: Shield, status: 'live' };
    const section = S('Overview', '/fleet', [child]);
    expect(section.kind).toBe('section');
    expect(section.children).toEqual([child]);
    // A heading has no page: it shares its parent's path (B7).
    expect(section.path).toBe('/fleet');
    expect(navKindOf(section)).toBe('section');
    expect(navLeaves([section])).toEqual([child]);
  });

  it('navKindOf defaults to group with children and leaf without', () => {
    expect(navKindOf({ children: [leaves[0]] })).toBe('group');
    expect(navKindOf({})).toBe('leaf');
  });
});

describe('nav visibility rule', () => {
  const can = (key: string) => key === 'fleet.operations.fleet_dashboard.view';

  const reach = { fleetReach: true, vesselReach: true };

  it('hides planned nodes unless the roadmap is shown', () => {
    expect(isNavNodeVisible({ status: 'planned' }, { showPlanned: false, can, ...reach })).toBe(false);
    expect(isNavNodeVisible({ status: 'planned' }, { showPlanned: true, can, ...reach })).toBe(true);
    expect(isNavNodeVisible({ status: 'live' }, { showPlanned: false, can, ...reach })).toBe(true);
    expect(isNavNodeVisible({ status: 'beta' }, { showPlanned: false, can, ...reach })).toBe(true);
  });

  it('hides a node whose capability the user lacks (fail closed)', () => {
    expect(isNavNodeVisible({ status: 'live', capability: 'fleet.operations.fleet_dashboard.view' }, { showPlanned: false, can, ...reach })).toBe(true);
    expect(isNavNodeVisible({ status: 'live', capability: 'unknown.key.here.view' }, { showPlanned: false, can, ...reach })).toBe(false);
    expect(isNavNodeVisible({ status: 'live', capability: 'x.y.z.view' }, { showPlanned: false, can: () => false, ...reach })).toBe(false);
  });

  it('hides fleet and vessel nodes from someone who cannot open that scope (step 2)', () => {
    const none = { showPlanned: false, can, fleetReach: false, vesselReach: false };
    expect(isNavNodeVisible({ status: 'live', scope: 'fleet' }, none)).toBe(false);
    expect(isNavNodeVisible({ status: 'live', scope: 'vessel' }, none)).toBe(false);
    expect(isNavNodeVisible({ status: 'live', scope: 'workspace' }, none)).toBe(true);
    expect(isNavNodeVisible({ status: 'live', scope: 'personal' }, none)).toBe(true);
    expect(isNavNodeVisible({ status: 'live' }, none)).toBe(true);
    expect(isNavNodeVisible({ status: 'live', scope: 'fleet' }, { ...none, fleetReach: true })).toBe(true);
    expect(isNavNodeVisible({ status: 'live', scope: 'vessel' }, { ...none, vesselReach: true })).toBe(true);
  });
});

describe('Show roadmap', () => {
  it('is only for owners and admins, and never while roles load', () => {
    expect(canUseRoadmap({ ready: true, rbacRoles: ['superadmin'], legacyRole: null })).toBe(true);
    expect(canUseRoadmap({ ready: true, rbacRoles: ['dpa'], legacyRole: 'crew' })).toBe(true);
    expect(canUseRoadmap({ ready: true, rbacRoles: [], legacyRole: 'shore_management' })).toBe(true);
    expect(canUseRoadmap({ ready: true, rbacRoles: ['captain', 'crew'], legacyRole: 'master' })).toBe(false);
    expect(canUseRoadmap({ ready: false, rbacRoles: ['superadmin'], legacyRole: 'dpa' })).toBe(false);
  });

  it('persists under storm-show-roadmap and is off by default', () => {
    localStorage.clear();
    expect(readShowRoadmap()).toBe(false);
    writeShowRoadmap(true);
    expect(localStorage.getItem(SHOW_ROADMAP_KEY)).toBe('true');
    expect(readShowRoadmap()).toBe(true);
    writeShowRoadmap(false);
    expect(localStorage.getItem(SHOW_ROADMAP_KEY)).toBeNull();
    expect(readShowRoadmap()).toBe(false);
  });
});
