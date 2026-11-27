/**
 * The scoped route trees in the real router (BUILD-PLAN B5; gap/01 Target
 * IA; gap/10 route tables) and the reach and landing rules behind them.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { matchRoutes, type RouteObject } from 'react-router-dom';
import { FleetScope, HomeRedirect, PersonalScope, VesselScopeRoute, WorkspaceScope } from '@/app/router/scopes';
import { FLEET_RBAC_ROLES, hasFleetReach, landingPath } from '@/app/router/reach';
import { PersonalIndexRedirect } from '@/app/router/personalRoutes';
import { appRouteObjects, describeElement, flatRoutes, isLazyPage, resolveUrl } from './routeHarness';

const routes = appRouteObjects();
const flat = flatRoutes(routes);

/** The B5 minimum, as URLs a user would type. */
const FLEET_PAGES = [
  '/fleet/dashboard',
  '/fleet/tracker',
  '/fleet/calendar',
  '/fleet/planner',
  '/fleet/documents',
  '/fleet/training',
  '/fleet/reports',
  '/fleet/reports/incident-analytics',
  '/fleet/reports/capa-tracker',
  '/fleet/reports/drill-analytics',
  '/fleet/reports/risk-overview',
  '/fleet/admin/users/crew',
  '/fleet/admin/users/people/some-user',
  '/fleet/admin/users/sets',
  '/fleet/admin/vessels',
  '/fleet/admin/notifications',
];
const VESSEL_PAGES = [
  '/v/dra/crew/list',
  '/v/dra/crew/roster',
  '/v/dra/crew/compliance/status',
  '/v/dra/crew/hours-of-rest',
  '/v/dra/crew/people/p1/hours-of-rest',
  '/v/dra/crew/planner/timeline',
  '/v/dra/crew/planner/manning',
  '/v/dra/crew/planner/requests',
  '/v/dra/crew/training',
  '/v/dra/crew/familiarisation',
  '/v/dra/safety/drills',
  '/v/dra/safety/forms',
  '/v/dra/safety/checklists',
  '/v/dra/safety/risk-assessments',
  '/v/dra/safety/risk-assessments/new',
  '/v/dra/certificates',
  '/v/dra/technical',
  '/v/dra/vessel/emergency',
  '/v/dra/logbooks',
  '/v/dra/logbooks/registry',
  '/v/dra/logbooks/review',
  '/v/dra/logbooks/records',
  '/v/dra/logbooks/connections',
  '/v/dra/logbooks/assurance',
  '/v/dra/logbooks/engine-log',
  '/v/dra/calendar',
];
const PERSONAL_PAGES = [
  '/me/profile',
  '/me/security',
  '/me/appearance',
  '/me/shortcuts',
  '/me/permissions',
  '/me/hours-of-rest',
  '/me/training',
  '/me/notifications',
  '/me/notifications/channels',
  '/inbox',
];

/** The scope layout elements on the way to a URL (pathless layouts included). */
const layoutsOf = (url: string) =>
  (matchRoutes(routes, resolveUrl(routes, url).url) ?? []).map((m) => (m.route.element as React.ReactElement | undefined)?.type);

const layoutOf = (url: string) => {
  const r = resolveUrl(routes, url);
  return flat.find((f) => r.pattern.startsWith(f.pattern) && f.route.children?.length && f.pattern !== '/')?.route.element as
    | React.ReactElement
    | undefined;
};

describe('scoped route trees', () => {
  it.each(FLEET_PAGES)('%s opens an existing page inside FleetScope', (url) => {
    const r = resolveUrl(routes, url);
    expect(r.pattern.startsWith('/fleet/'), r.pattern).toBe(true);
    expect(r.element).not.toBeNull();
    expect(layoutOf(url)?.type).toBe(FleetScope);
  });

  it.each(VESSEL_PAGES)('%s opens an existing page inside VesselScopeRoute', (url) => {
    const r = resolveUrl(routes, url);
    expect(r.pattern.startsWith('/v/:vesselCode/'), r.pattern).toBe(true);
    expect(isLazyPage(r.element), r.pattern).toBe(true);
    expect(layoutOf(url)?.type).toBe(VesselScopeRoute);
  });

  it('the vessel home is the vessel dashboard', () => {
    const r = resolveUrl(routes, '/v/dra');
    expect(r.pattern).toBe('/v/:vesselCode');
    expect(isLazyPage(r.element)).toBe(true);
  });

  it('module roots inside a vessel redirect to a page of that module, or are one', () => {
    // The crew root is the crew dashboard (X1-10B, gap/04 C2), a page of its own.
    const crew = resolveUrl(routes, '/v/dra/crew');
    expect(crew.url).toBe('/v/dra/crew');
    expect(isLazyPage(crew.element)).toBe(true);
    expect(describeElement(crew.element)).toContain('page(/src/modules/crew/pages/CrewDashboardPage.tsx)');
    expect(resolveUrl(routes, '/v/dra/safety').url).toBe('/v/dra/safety/drills');
    expect(resolveUrl(routes, '/v/dra/vessel').url).toBe('/v/dra/vessel/emergency');
    expect(resolveUrl(routes, '/v/dra/crew/planner').url).toBe('/v/dra/crew/planner/timeline');
  });

  it('an unknown page inside a vessel stays in the scope (its own not-found)', () => {
    const r = resolveUrl(routes, '/v/dra/no-such-page');
    expect(r.pattern).toBe('/v/:vesselCode/*');
  });

  it.each(PERSONAL_PAGES)('%s opens an existing page inside PersonalScope', (url) => {
    const r = resolveUrl(routes, url);
    expect(r.hops, url).toEqual([]);
    expect(isLazyPage(r.element), r.pattern).toBe(true);
    expect(layoutsOf(url)).toContain(PersonalScope);
  });

  it('/me and the old settings URLs land on their /me section, inside PersonalScope', () => {
    // `/me` reads ?tab= / ?section= first (src/test/router/meRoutes.test.tsx renders it).
    expect(resolveUrl(routes, '/me').element?.type).toBe(PersonalIndexRedirect);
    expect(layoutsOf('/me')).toContain(PersonalScope);
    expect(resolveUrl(routes, '/me/no-such-section').url).toBe('/me/profile');
    expect(resolveUrl(routes, '/settings/whatever/deeper').url).toBe('/me/profile');
  });

  it('/fleet and /fleet/admin land on a page', () => {
    expect(resolveUrl(routes, '/fleet').url).toBe('/fleet/dashboard');
    expect(resolveUrl(routes, '/fleet/admin').url).toBe('/fleet/admin/users/crew');
    // The reports overview is a page of its own (gap/02), linking every report.
    expect(resolveUrl(routes, '/fleet/reports').url).toBe('/fleet/reports');
    expect(isLazyPage(resolveUrl(routes, '/fleet/reports').element)).toBe(true);
  });

  it('/, /index and /dashboard go through the landing redirect', () => {
    for (const url of ['/', '/index', '/dashboard']) {
      expect(resolveUrl(routes, url).element?.type, url).toBe(HomeRedirect);
    }
  });

  it('the workspaces render inside WorkspaceScope', () => {
    // Workspace layouts are pathless, so walk every route object.
    const all: RouteObject[] = [];
    (function walk(items: RouteObject[]) {
      for (const r of items) {
        all.push(r);
        if (r.children) walk(r.children);
      }
    })(routes);
    const workspaces = all
      .filter((r) => (r.element as React.ReactElement | undefined)?.type === WorkspaceScope)
      .map((r) => (r.element as React.ReactElement<{ workspace: string }>).props.workspace)
      .sort();
    expect(workspaces).toEqual(['health', 'hris', 'legal', 'yard']);
    for (const url of ['/hris/compensation/payroll', '/health/medical/dashboard', '/yard/refit/overview', '/departments/legal/dashboard']) {
      const r = resolveUrl(routes, url);
      expect(r.pattern, url).not.toBe('*');
    }
  });
});

describe('reach and landing', () => {
  it('fleet reach: legacy all-vessels roles, fleet-wide RBAC roles, or a fleet RBAC role', () => {
    expect(hasFleetReach({ canAccessAllVessels: true, hasFleetWideRole: false, rbacRoles: [] })).toBe(true);
    expect(hasFleetReach({ canAccessAllVessels: false, hasFleetWideRole: true, rbacRoles: [] })).toBe(true);
    for (const role of FLEET_RBAC_ROLES) {
      expect(hasFleetReach({ canAccessAllVessels: false, hasFleetWideRole: false, rbacRoles: [role] })).toBe(true);
    }
    expect(hasFleetReach({ canAccessAllVessels: false, hasFleetWideRole: false, rbacRoles: ['captain', 'crew', null] })).toBe(false);
  });

  it('landing follows gap/01: fleet → fleet dashboard, vessel → vessel home, none → /me', () => {
    expect(landingPath({ fleetReach: true, lastVesselCode: 'DRA' })).toBe('/fleet/dashboard');
    expect(landingPath({ fleetReach: false, lastVesselCode: 'DRA' })).toBe('/v/dra');
    expect(landingPath({ fleetReach: false, lastVesselCode: null })).toBe('/me');
  });
});
