/**
 * Nav leaf lifecycle against the real router (BUILD-PLAN B3; gap/00 W3,
 * gap/10 W3, IA10; DECISIONS D-06).
 *
 * - A planned leaf has no real page: it opens its Coming Soon placeholder,
 *   and no real route answers its path (so no planned leaf shadows one).
 * - A live leaf opens a real page, never a placeholder.
 * - Placeholder routes exist only for planned leaves, so bookmarks resolve.
 *   Fleet and vessel placeholders sit inside their scope routes (B7).
 * - Every vessel tab opens a page or a placeholder, and the Coming Soon URLs
 *   the old trees made up still lead somewhere (retired redirects).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { matchRoutes } from 'react-router-dom';
import {
  FLEET_PLACEHOLDER_LEAVES,
  NAVIGATION_ITEMS,
  PLACEHOLDER_LEAVES,
  VESSEL_MODULES,
  VESSEL_PLACEHOLDER_LEAVES,
  navLeaves,
} from '@/config/sitemap';
import { RETIRED_NAV_REDIRECTS } from '@/app/router/retiredNavPaths';
import { vesselPatternPath } from '@/modules/vessels/lib/vesselCode';
import {
  appRouteObjects,
  flatRoutes,
  isPlaceholderElement,
  isScopeNotFound,
  resolveUrl,
  withoutPlaceholders,
} from './routeHarness';
import retiredBaseline from './retiredNavPaths.baseline.json';

const routes = appRouteObjects();
const realRoutes = withoutPlaceholders(routes);
const leaves = navLeaves(NAVIGATION_ITEMS);
const planned = leaves.filter((l) => l.status === 'planned');
const live = leaves.filter((l) => l.status !== 'planned');

/**
 * The legacy `/vessel/:vesselSlug/...` routes take any word as a vessel slug,
 * so they "match" planned paths such as `/vessel/charter/checklists`. They
 * are redirects to the vessel scope, not pages a leaf could mean.
 */
const SLUG_CATCHERS = /^\/vessel\/:vesselSlug(\/|$)/;

describe('nav leaf status', () => {
  it('every leaf declares a status', () => {
    expect(leaves.filter((l) => !l.status).map((l) => l.path)).toEqual([]);
    expect(planned.length).toBeGreaterThan(50);
    expect(live.length).toBeGreaterThan(100);
  });

  it('no planned leaf shadows a real route', () => {
    const shadowing: string[] = [];
    for (const leaf of planned) {
      const path = leaf.path.split('?')[0];
      const matches = matchRoutes(realRoutes, path) ?? [];
      const last = matches[matches.length - 1];
      if (!last) continue;
      const own = last.route.path ?? '';
      const full = matches.map((m) => m.route.path ?? '').join('/').replace(/\/+/g, '/');
      if (own === '*' || own.endsWith('/*')) continue; // catch-alls and splats
      if (SLUG_CATCHERS.test(full) || SLUG_CATCHERS.test(own)) continue;
      shadowing.push(`${leaf.label} -> ${path} (real route ${full})`);
    }
    expect(shadowing, `planned leaves sitting on a real route:\n${shadowing.join('\n')}`).toEqual([]);
  });

  it('every planned leaf opens its Coming Soon placeholder, so bookmarks resolve', () => {
    const groupPaths = new Set<string>();
    (function walk(items: typeof leaves) {
      for (const it of items) if (it.children?.length) { groupPaths.add(it.path); walk(it.children); }
    })(NAVIGATION_ITEMS.flatMap((m) => m.children ?? []));
    const wrong = planned
      .filter((l) => !groupPaths.has(l.path))
      .map((l) => ({ l, r: resolveUrl(routes, l.path) }))
      .filter(({ r }) => !isPlaceholderElement(r.element) || r.hops.length > 0)
      .map(({ l, r }) => `${l.label} -> ${l.path} (matched ${r.pattern || 'nothing'})`);
    expect(wrong, `planned leaves that do not open their placeholder:\n${wrong.join('\n')}`).toEqual([]);
  });

  it('every live leaf opens a real page, never a placeholder', () => {
    const wrong = live
      .map((l) => ({ l, r: resolveUrl(routes, l.path) }))
      .filter(({ r }) => r.pattern === '*' || isPlaceholderElement(r.element))
      .map(({ l, r }) => `${l.label} -> ${l.path} (matched ${r.pattern})`);
    expect(wrong, `live leaves without a page:\n${wrong.join('\n')}`).toEqual([]);
  });

  it('placeholders are generated for planned leaves only', () => {
    const plannedPaths = new Set(planned.map((l) => l.path));
    expect(PLACEHOLDER_LEAVES.filter((p) => !plannedPaths.has(p.path)).map((p) => p.path)).toEqual([]);
    const placeholderRoutes = routes.filter((r) => isPlaceholderElement(r.element as React.ReactElement));
    expect(placeholderRoutes).toHaveLength(PLACEHOLDER_LEAVES.length);
  });

  it('fleet and vessel placeholders sit inside their scope routes, one per planned leaf', () => {
    const nested = flatRoutes(routes).filter((f) => isPlaceholderElement(f.route.element as React.ReactElement));
    const fleet = nested.filter((f) => f.pattern.startsWith('/fleet/')).map((f) => f.pattern).sort();
    const vessel = nested.filter((f) => f.pattern.startsWith('/v/:vesselCode/')).map((f) => f.pattern).sort();
    expect(fleet).toEqual(FLEET_PLACEHOLDER_LEAVES.map((p) => `/fleet/${p.path}`).sort());
    expect(vessel).toEqual(VESSEL_PLACEHOLDER_LEAVES.map((p) => vesselPatternPath(p.path)).sort());
    expect(nested).toHaveLength(PLACEHOLDER_LEAVES.length + FLEET_PLACEHOLDER_LEAVES.length + VESSEL_PLACEHOLDER_LEAVES.length);
  });

  it('every vessel tab opens a page or its placeholder inside the scope, never not-found', () => {
    const wrong = VESSEL_MODULES.map((m) => ({ m, r: resolveUrl(routes, vesselPatternPath(m.root)) }))
      .filter(({ r }) => !r.pattern.startsWith('/v/:vesselCode') || isScopeNotFound(r.element) || !r.element)
      .map(({ m, r }) => `${m.label} -> ${m.root || '(home)'} (matched ${r.pattern})`);
    expect(wrong).toEqual([]);
    // A tab whose module is built opens a real page, not Coming Soon.
    const live = VESSEL_MODULES.filter((m) => m.status === 'live');
    expect(live.filter((m) => isPlaceholderElement(resolveUrl(routes, vesselPatternPath(m.root)).element)).map((m) => m.id)).toEqual([]);
  });

  it('an unknown fleet page stays in the Fleet scope (its own not-found)', () => {
    const r = resolveUrl(routes, '/fleet/no-such-page');
    expect(r.pattern).toBe('/fleet/*');
    expect(isScopeNotFound(r.element)).toBe(true);
  });
});

describe('retired Coming Soon URLs (B7)', () => {
  it('every Fleet and Vessel placeholder or section URL of the old tree still leads somewhere', () => {
    expect((retiredBaseline as string[]).length).toBeGreaterThan(100);
    const lost = (retiredBaseline as string[])
      .map((url) => ({ url, r: resolveUrl(routes, url) }))
      .filter(({ r }) => r.pattern === '*' || isScopeNotFound(r.element) || !r.element)
      .map(({ url, r }) => `${url} -> ${r.url} (${r.pattern})`);
    expect(lost, `old URLs that no longer resolve:\n${lost.join('\n')}`).toEqual([]);
  });

  it('lead to the replacement in the new tree', () => {
    expect(resolveUrl(routes, '/fleet/fleet-scheduler').url).toBe('/fleet/planner');
    expect(resolveUrl(routes, '/fleet/fleet-reports').url).toBe('/fleet/reports/incident-analytics');
    expect(resolveUrl(routes, '/vessel/safety/sms-summary').url).toBe('/v/:vesselCode/safety/drills');
    expect(resolveUrl(routes, '/vessel/accounting/expenses').url).toBe('/v/:vesselCode/finance');
    expect(resolveUrl(routes, '/vessel/charter/checklists').url).toBe('/v/:vesselCode/charter/checklists');
    expect(resolveUrl(routes, '/vessel/departments/crew/bridge/handover-notes').url).toBe('/v/:vesselCode/departments/bridge/handover-notes');
  });

  it('never take over a real route: each static /vessel and /fleet route still wins its own URL', () => {
    const retired = new Set(RETIRED_NAV_REDIRECTS.map((r) => r.from));
    const statics = flatRoutes(routes)
      .map((f) => f.pattern)
      .filter((p) => /^\/(vessel|fleet)\//.test(p) && !p.includes(':') && !p.includes('*') && !retired.has(p));
    expect(statics.length).toBeGreaterThan(10);
    const lost = statics.filter((p) => {
      const matches = matchRoutes(routes, p) ?? [];
      const full = matches.map((m) => m.route.path ?? '').join('/').replace(/\/+/g, '/');
      return full !== p;
    });
    expect(lost).toEqual([]);
    expect(isPlaceholderElement(resolveUrl(routes, '/vessel/logbooks').element)).toBe(false);
    expect(resolveUrl(routes, '/vessel/logbooks').pattern).toBe('/vessel/logbooks');
  });

  it('real HRIS, Health and New Build pages are live and carry no placeholder', () => {
    const placeholders = new Set(PLACEHOLDER_LEAVES.map((p) => p.path));
    for (const path of [
      '/hris/compensation/payroll',
      '/hris/recruitment/vacancies',
      '/health/medical/dashboard',
      '/health/personal-training/athlete/my-training',
      '/yard/new-build/overview/dashboard',
    ]) {
      expect(placeholders.has(path), path).toBe(false);
      expect(leaves.find((l) => l.path === path)?.status, path).toBe('live');
    }
  });
});
