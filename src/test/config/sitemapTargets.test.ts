/**
 * Every sidebar leaf that claims a real page must reach one.
 *
 * `/account` and `/admin/notifications` sat in the sidebar for months with no
 * route behind them: clicking either fell through the catch-all to the
 * dashboard, with no error. This test asserts that each leaf with a real
 * target (every leaf that is not a Coming Soon placeholder) resolves to a
 * declared route.
 *
 * Since the target nav tree (BUILD-PLAN B7), fleet and vessel pages are
 * nested routes under `/fleet` and `/v/:vesselCode`, which a scan of
 * `path="…"` literals cannot join. So the check runs on the route tree React
 * Router itself builds from <AppRoutes/> (src/test/router/routeHarness.ts),
 * matched with the router's own ranking and with redirects followed.
 */
import { describe, expect, it, vi } from 'vitest';

// Importing the route tree imports the guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import {
  appRouteObjects,
  isPlaceholderElement,
  isScopeNotFound,
  resolveUrl,
} from '@/test/router/routeHarness';

const routes = appRouteObjects();

const leaves: NavChild[] = [];
(function walk(items: NavChild[]) {
  for (const item of items) {
    if (item.children?.length) walk(item.children);
    else leaves.push(item);
  }
})(NAVIGATION_ITEMS.flatMap((m) => m.children ?? []));

const explicitLeaves = leaves.filter((l) => l.status !== 'planned');
const target = (label: string, module: string) =>
  (() => {
    const found: NavChild[] = [];
    (function walk(items: NavChild[]) {
      for (const item of items) {
        if (item.children?.length) walk(item.children);
        else if (item.label === label) found.push(item);
      }
    })(NAVIGATION_ITEMS.find((m) => m.id === module)?.children ?? []);
    return found[0]?.path;
  })();

describe('sitemap targets', () => {
  it('has leaves to check', () => {
    expect(leaves.length).toBeGreaterThan(100);
    expect(explicitLeaves.length).toBeGreaterThan(20);
  });

  it('every leaf with a real target resolves to a declared route', () => {
    const broken = explicitLeaves
      .map((l) => ({ l, r: resolveUrl(routes, l.path) }))
      .filter(({ r }) => r.pattern === '*' || isScopeNotFound(r.element) || isPlaceholderElement(r.element) || !r.element)
      .map(({ l, r }) => `${l.label} -> ${l.path} (matched ${r.pattern || 'nothing'})`);
    expect(broken, `sidebar leaves with no route:\n${broken.join('\n')}`).toEqual([]);
  });

  it('keeps the leaves that were once dead pointed at real pages, now in their scopes (B7)', () => {
    expect(target('Notifications', 'fleet')).toBe('/fleet/admin/notifications');
    expect(target('Users & Access', 'fleet')).toBe('/fleet/admin/users');
    expect(target('Planner', 'fleet')).toBe('/fleet/planner');
    // Support and the company Account page are planned in the Fleet tree; the
    // personal settings and the support form stay reachable from the account
    // menu and the footer, not the fleet sidebar.
    expect(target('Account', 'fleet')).toBe('/fleet/admin/account');
    expect(target('Support', 'fleet')).toBe('/fleet/admin/support');
  });
});
