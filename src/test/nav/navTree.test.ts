/**
 * Filtering a nav tree (spec §4.2; gap/10 rule steps 7 and 8): hidden nodes
 * dropped, locked add-ons kept without their pages, empty groups and
 * sections dropped, badges hoisted to the nearest group, saved order, labels
 * last; where a tab opens; the vessel tab model built on it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { Circle } from 'lucide-react';
import { applyLabelOverrides, filterNavTree, filteredLeaves, firstVisibleLeafPath, type FilteredNavNode } from '@/app/nav/navTree';
import { navNodeDecision, type NavNodeDecision } from '@/app/nav/visibility';
import { buildVesselTabs, vesselRestVisibilityFromTabs } from '@/app/nav/vesselNavModel';
import type { NavChild } from '@/config/navigation-types';

const leaf = (id: string, extra: Partial<NavChild> = {}): NavChild => ({ id, label: id, path: `/t/${id}`, icon: Circle, kind: 'leaf', status: 'live', ...extra });
const group = (id: string, children: NavChild[], extra: Partial<NavChild> = {}): NavChild => ({ id, label: id, path: `/t/${id}`, icon: Circle, kind: 'group', children, ...extra });
const section = (id: string, children: NavChild[]): NavChild => ({ id, label: id, path: '/t', icon: Circle, kind: 'section', children });

const live = (n: NavChild): NavNodeDecision => navNodeDecision(n, { showPlanned: false, can: () => true, fleetReach: true, vesselReach: true });
const ids = (nodes: readonly FilteredNavNode[]): unknown[] => nodes.map((n) => (n.children?.length ? [n.id, ids(n.children)] : n.id));

describe('filterNavTree', () => {
  it('drops hidden nodes and groups or sections left empty', () => {
    const tree = [
      section('overview', [leaf('dash'), leaf('queue', { status: 'planned' })]),
      section('config', [leaf('addons', { status: 'planned' })]),
      group('docs', [leaf('a', { status: 'planned' }), leaf('b', { status: 'planned' })]),
      leaf('home'),
    ];
    expect(ids(filterNavTree(tree, live))).toEqual([['overview', ['dash']], 'home']);
  });

  it('marks a locked add-on and keeps none of its pages', () => {
    const tree = [group('technical', [leaf('jobs'), group('deck', [leaf('plans')], { entitlement: 'deck_plans' })])];
    const out = filterNavTree(tree, live);
    const deck = out[0].children?.[1];
    expect(deck).toMatchObject({ id: 'deck', locked: true });
    expect(deck?.children).toBeUndefined();
  });

  it('a locked node alone keeps its group visible (step 7 counts locked children)', () => {
    const out = filterNavTree([section('s', [leaf('plans', { entitlement: 'deck_plans' })])], live);
    expect(out).toHaveLength(1);
    expect(out[0].children?.[0].locked).toBe(true);
  });

  it('moves a hidden leaf’s badge to its group, skipping a section heading', () => {
    const tree = [group('vessel', [section('record', [leaf('comms', { status: 'planned', badgeKey: 'unreadMessages' }), leaf('emergency')])])];
    const out = filterNavTree(tree, live);
    expect(out[0].badgeKey).toBe('unreadMessages');
    expect(out[0].children?.[0].badgeKey).toBeUndefined();
  });

  it('leaves the badge on a visible leaf (the group takes none)', () => {
    const tree = [group('vessel', [leaf('comms', { badgeKey: 'unreadMessages' })])];
    const out = filterNavTree(tree, live);
    expect(out[0].badgeKey).toBeUndefined();
    expect(out[0].children?.[0].badgeKey).toBe('unreadMessages');
  });

  it('applies the saved order per parent', () => {
    const order = <T extends NavChild>(items: T[], parent: string): T[] => (parent === 'g' ? [...items].reverse() : items);
    expect(ids(filterNavTree([group('g', [leaf('a'), leaf('b')])], live, order))).toEqual([['g', ['b', 'a']]]);
  });

  it('keeps a node whose data-driven children are loading, with no children', () => {
    const out = filterNavTree([{ ...section('docs', [leaf('stale')]), childrenPending: true }], live);
    expect(out[0]).toMatchObject({ id: 'docs', childrenPending: true, kind: 'section' });
    expect(out[0].children).toEqual([]);
  });
});

describe('applyLabelOverrides', () => {
  it('relabels nodes by their module setting, after filtering, at any depth', () => {
    const tree = filterNavTree([group('crew', [leaf('planner', { moduleSetting: 'planner' }), leaf('list')], { moduleSetting: 'crew' })], live);
    const out = applyLabelOverrides(tree, (key) => (key === 'planner' ? 'Leave' : null));
    expect(out[0].label).toBe('crew');
    expect(out[0].children?.map((n) => n.label)).toEqual(['Leave', 'list']);
  });
});

describe('firstVisibleLeafPath', () => {
  it('is the first own, unlocked leaf, preferring a built page over a planned one', () => {
    const tree: FilteredNavNode[] = [
      { ...leaf('cross', { crossLink: true }) },
      { ...leaf('addon'), locked: true },
      { ...leaf('soon', { status: 'planned' }) },
      { ...section('s', [leaf('real')]), children: [leaf('real')] },
    ];
    expect(firstVisibleLeafPath(tree)).toBe('/t/real');
    expect(firstVisibleLeafPath([leaf('soon', { status: 'planned' })])).toBe('/t/soon');
    expect(firstVisibleLeafPath([])).toBeNull();
  });

  it('lists every leaf with filteredLeaves', () => {
    expect(filteredLeaves([group('g', [leaf('a'), leaf('b')]), leaf('c')]).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('buildVesselTabs (the real vessel tree)', () => {
  const resolver = { labelFor: (key: string) => (key === 'charter' ? 'Trip' : key === 'planner' ? 'Leave' : null) };
  const decide = (isModuleOn: (k: string) => boolean, showPlanned = false) => (n: NavChild) =>
    navNodeDecision(n, { showPlanned, can: () => true, fleetReach: true, vesselReach: true, isModuleOn });

  it('lists the live tabs in tab order with real paths, Home first', () => {
    const tabs = buildVesselTabs({ code: 'DRA', resolver, decide: decide(() => true) });
    expect(tabs.map((t) => t.id)).toEqual(['home', 'crew', 'safety', 'certificates', 'technical', 'vessel', 'logbooks', 'calendar']);
    expect(tabs[0]).toMatchObject({ path: '/v/dra', href: '/v/dra' });
    // The crew root is the crew dashboard (X1-10B), so the tab opens it.
    expect(tabs.find((t) => t.id === 'crew')?.href).toBe('/v/dra/crew');
  });

  it('shows the planned tabs with the roadmap and applies the labels last (Charter → Trip, Planner → Leave)', () => {
    const tabs = buildVesselTabs({ code: 'DRA', resolver, decide: decide(() => true, true) });
    expect(tabs.map((t) => t.label)).toEqual(
      expect.arrayContaining(['Trip', 'Finance', 'Departments', 'Reports']),
    );
    const crew = tabs.find((t) => t.id === 'crew');
    expect(filteredLeaves(crew?.children ?? []).find((n) => n.moduleSetting === 'planner')?.label).toBe('Leave');
  });

  it('hides a tab whose module is off, and a tab whose sidebar is left empty', () => {
    const tabs = buildVesselTabs({ code: 'HYD', resolver, decide: decide((k) => k !== 'technical') });
    expect(tabs.map((t) => t.id)).not.toContain('technical');
    // Certificates shows only its live Status Summary without the roadmap; hide that and nothing is left.
    const noCerts = buildVesselTabs({ code: 'HYD', resolver, decide: (n) => (n.path === '/v/hyd/certificates' && n.kind === 'leaf' ? 'hidden' : decide(() => true)(n)) });
    expect(noCerts.map((t) => t.id)).not.toContain('certificates');
  });

  it('carries the module badge, else the first badge under the tab', () => {
    const tabs = buildVesselTabs({ code: 'DRA', resolver, decide: decide(() => true) });
    expect(tabs.find((t) => t.id === 'safety')?.badgeKey).toBe('pendingCompliance');
    expect(tabs.find((t) => t.id === 'vessel')?.badgeKey).toBe('unreadMessages');
  });

  it('answers visibility for the switch from the filtered tabs', () => {
    const tabs = buildVesselTabs({ code: 'HYD', resolver, decide: decide((k) => k !== 'technical.jobs' && k !== 'logbooks') });
    const visible = vesselRestVisibilityFromTabs(tabs, 'HYD');
    expect(visible('')).toBe(true);
    expect(visible('crew')).toBe(true);
    expect(visible('crew/list/12')).toBe(true);
    expect(visible('logbooks')).toBe(false);
    expect(visible('technical/jobs/9')).toBe(false);
    // A planned leaf (hidden without the roadmap) is not visible either (Performance Appraisals, X1 wave 2).
    expect(visible('crew/appraisals')).toBe(false);
  });
});
