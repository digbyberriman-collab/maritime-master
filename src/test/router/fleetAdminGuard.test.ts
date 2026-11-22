/**
 * The five live Fleet admin pages are gated by login + fleet reach only
 * (DECISIONS D-33), not by the leaf capability that hides them in the
 * sidebar. D-27 keeps their legacy URLs open to every signed-in user and RLS
 * is the control, so a capability gate here would only move the problem.
 *
 * This pins the current guard: FleetScope above, ProtectedRoute on the page,
 * no ModuleRoute anywhere on the way. Moving to a capability gate (D-33
 * option b, once gap/03 lands) must change this test on purpose.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RouteObject } from 'react-router-dom';

// Importing the route tree imports the guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { FleetScope } from '@/app/router/scopes';
import ModuleRoute from '@/shared/components/ModuleRoute';
import { appRouteObjects, describeElement, isLazyPage } from '@/test/router/routeHarness';

const FLEET_ADMIN_PAGES = [
  '/fleet/admin/users/crew',
  '/fleet/admin/users/people/:userId',
  '/fleet/admin/users/sets',
  '/fleet/admin/vessels',
  '/fleet/admin/notifications',
];

const join = (base: string, path: string | undefined) => {
  if (!path) return base;
  if (path.startsWith('/')) return path;
  return `${base.replace(/\/$/, '')}/${path}`;
};

/** The route objects from the root down to `pattern` (the route itself last). */
function chainTo(routes: RouteObject[], pattern: string, base = '', above: RouteObject[] = []): RouteObject[] | null {
  for (const r of routes) {
    const full = join(base, r.path);
    if (r.path && full === pattern) return [...above, r];
    if (r.children) {
      const found = chainTo(r.children, pattern, full, [...above, r]);
      if (found) return found;
    }
  }
  return null;
}

const routes = appRouteObjects();

describe('Fleet admin routes: login + fleet reach only (D-33)', () => {
  it.each(FLEET_ADMIN_PAGES)('%s', (pattern) => {
    const chain = chainTo(routes, pattern);
    expect(chain, `no route for ${pattern}`).not.toBeNull();
    const ancestors = (chain as RouteObject[]).slice(0, -1);
    const leaf = (chain as RouteObject[])[(chain as RouteObject[]).length - 1];
    const element = leaf.element as React.ReactElement;

    // Fleet reach: mounted inside the Fleet scope.
    expect(ancestors.some((r) => (r.element as React.ReactElement | undefined)?.type === FleetScope)).toBe(true);

    // Login: the page's own guard is ProtectedRoute.
    expect(isLazyPage(element)).toBe(true);
    const described = describeElement(element);
    expect(described).toContain('guard=ProtectedRoute');

    // No capability gate on the way: no ModuleRoute above or on the page.
    for (const r of chain as RouteObject[]) {
      const el = r.element as React.ReactElement | undefined;
      expect(el?.type).not.toBe(ModuleRoute);
      expect(el ? describeElement(el) : '').not.toContain('ModuleRoute');
    }
  });
});
