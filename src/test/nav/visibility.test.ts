/**
 * The nav visibility rule (gap/10 "Nav visibility rule"; spec §4.1): status →
 * scope → vessel module setting → capability → (legacy gates) → entitlement
 * lock, one function for every surface. Fails closed.
 */
import { describe, expect, it } from 'vitest';
import { Circle } from 'lucide-react';
import { isNavNodeVisible, navNodeDecision, type NavVisibilityContext } from '@/app/nav/visibility';
import { tabNode } from '@/app/nav/vesselNavModel';
import type { NavChild } from '@/config/navigation-types';

const ctx = (patch: Partial<NavVisibilityContext> = {}): NavVisibilityContext => ({
  showPlanned: false,
  can: () => true,
  fleetReach: true,
  vesselReach: true,
  ...patch,
});

const node = (patch: Partial<NavChild> = {}): NavChild => ({ id: 'n', label: 'Node', path: '/x', icon: Circle, status: 'live', ...patch });

describe('navNodeDecision', () => {
  it('step 1: a planned node is hidden unless the roadmap shows', () => {
    expect(navNodeDecision(node({ status: 'planned' }), ctx())).toBe('hidden');
    expect(navNodeDecision(node({ status: 'planned' }), ctx({ showPlanned: true }))).toBe('visible');
    expect(navNodeDecision(node({ status: 'beta' }), ctx())).toBe('visible');
    expect(navNodeDecision(node({ status: undefined }), ctx())).toBe('visible');
  });

  it('step 2: fleet nodes need fleet reach, vessel nodes vessel reach; workspace and personal pass', () => {
    expect(navNodeDecision(node({ scope: 'fleet' }), ctx({ fleetReach: false }))).toBe('hidden');
    expect(navNodeDecision(node({ scope: 'vessel' }), ctx({ vesselReach: false }))).toBe('hidden');
    expect(navNodeDecision(node({ scope: 'workspace' }), ctx({ fleetReach: false, vesselReach: false }))).toBe('visible');
    expect(navNodeDecision(node({ scope: 'personal' }), ctx({ fleetReach: false, vesselReach: false }))).toBe('visible');
  });

  it('step 3: a vessel module setting that is off hides the node, only where settings are given', () => {
    const off = (key: string) => key !== 'technical.jobs';
    expect(navNodeDecision(node({ moduleSetting: 'technical.jobs' }), ctx({ isModuleOn: off }))).toBe('hidden');
    expect(navNodeDecision(node({ moduleSetting: 'technical.surveys' }), ctx({ isModuleOn: off }))).toBe('visible');
    // Without a vessel's settings (the Fleet tree, the static tree) the setting is not consulted.
    expect(navNodeDecision(node({ moduleSetting: 'technical.jobs' }), ctx())).toBe('visible');
  });

  it('step 4: a capability the viewer lacks hides the node (an unknown key fails closed)', () => {
    const can = (key: string) => key === 'fleet.operations.vessels.view';
    expect(navNodeDecision(node({ capability: 'fleet.operations.vessels.view' }), ctx({ can }))).toBe('visible');
    expect(navNodeDecision(node({ capability: 'no.such.key' }), ctx({ can }))).toBe('hidden');
  });

  it('step 6: an add-on without its entitlement is locked, and absent entitlements mean locked', () => {
    expect(navNodeDecision(node({ entitlement: 'deck_plans' }), ctx())).toBe('locked');
    expect(navNodeDecision(node({ entitlement: 'deck_plans' }), ctx({ isEntitled: () => false }))).toBe('locked');
    expect(navNodeDecision(node({ entitlement: 'deck_plans' }), ctx({ isEntitled: (k) => k === 'deck_plans' }))).toBe('visible');
  });

  it('applies the steps in order: an earlier hidden wins over a later lock', () => {
    // Planned and an add-on: hidden without the roadmap, locked with it.
    const addOn = node({ status: 'planned', entitlement: 'deck_plans', moduleSetting: 'technical.deck_plans' });
    expect(navNodeDecision(addOn, ctx())).toBe('hidden');
    expect(navNodeDecision(addOn, ctx({ showPlanned: true }))).toBe('locked');
    // Switched off for the vessel: hidden even with the roadmap (off beats the lock).
    expect(navNodeDecision(addOn, ctx({ showPlanned: true, isModuleOn: () => false }))).toBe('hidden');
    // No capability: hidden, never shown as a lock.
    expect(navNodeDecision(node({ capability: 'x.y', entitlement: 'deck_plans' }), ctx({ can: () => false }))).toBe('hidden');
  });

  it('isNavNodeVisible is decision !== hidden (a locked add-on renders)', () => {
    expect(isNavNodeVisible(node({ entitlement: 'deck_plans' }), ctx())).toBe(true);
    expect(isNavNodeVisible(node({ status: 'planned' }), ctx())).toBe(false);
  });
});

describe('a vessel tab is judged on its own fields', () => {
  const module = { id: 'reports', label: 'Reports', path: '/v/dra/reports', icon: Circle, status: 'live' as const };

  it('a tab with an unknown capability key is hidden', () => {
    const tab = tabNode({ ...module, capability: 'vessel.reports.unknown.view' });
    expect(navNodeDecision(tab, ctx({ can: (key) => key === 'vessel.reports.known.view' }))).toBe('hidden');
  });

  it('a tab whose module setting is off is hidden; an add-on tab is locked', () => {
    expect(navNodeDecision(tabNode({ ...module, moduleSetting: 'reports' }), ctx({ isModuleOn: () => false }))).toBe('hidden');
    expect(navNodeDecision(tabNode({ ...module, entitlement: 'reports_addon' }), ctx())).toBe('locked');
  });

  it('carries the vessel scope, so it needs vessel reach', () => {
    expect(tabNode(module).scope).toBe('vessel');
    expect(navNodeDecision(tabNode(module), ctx({ vesselReach: false }))).toBe('hidden');
  });
});
