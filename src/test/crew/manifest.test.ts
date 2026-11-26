/**
 * The crew manifest (X1-01; gap/04 C1; X1 spec §4; platform-prep PP3):
 *
 * - every crew page route is a lazy loader under /src/modules/ with a
 *   guard, and no path is declared twice;
 * - the moved pages are exactly today's (a pure move), except the crew list
 *   that X1-02 rebuilt (CrewListPage behind vessel.crew.crew_list.view, the
 *   roster folded into it as a redirect), and every vessel crew URL of
 *   today resolves to its page through the real route tree;
 * - nav orders are unique in each slot, 60 and 70 stay X5's (Crew Medical,
 *   Crew Training), and crew/training and crew/medical are never routed
 *   here;
 * - no planned leaf has a route; moved leaves keep `live` and today's gates
 *   (no capability yet, D-X1-25); planned leaves carry their capability;
 * - manifest.capabilities lists the X1 spec §5 keys, all in the catalogue.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import KeepSearchNavigate from '@/app/router/KeepSearchNavigate';

// The route tree imports the guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import manifest from '@/modules/crew/module';
import { CREW_ROUTES } from '@/modules/crew/routes';
import { CREW_CAPABILITIES, CREW_CAPS, CREW_FLEET_PATHS, CREW_PATHS } from '@/modules/crew/paths';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { isRedirectDef, type PageRouteDef } from '@/app/registry/types';
import { listCatalogueCapabilities } from '@/lib/permissions/catalogue';
import type { NavChild } from '@/config/navigation-types';
import { appRouteObjects, describeElement, loaderTarget, resolveUrl } from '@/test/router/routeHarness';

const pages = CREW_ROUTES.filter((r): r is PageRouteDef => !isRedirectDef(r));
const catalogue = new Set(listCatalogueCapabilities());

/** Today's page for each crew path (PP3's pure move; X1-02 rebuilt the list and folded the roster in). */
const TODAY: Record<string, string> = {
  [`vessel ${CREW_PATHS.list}`]: '/src/modules/crew/pages/CrewListPage.tsx',
  [`vessel ${CREW_PATHS.complianceStatus}`]: '/src/modules/crew/pages/CrewDocuments.tsx',
  [`vessel ${CREW_PATHS.hoursOfRest}`]: '/src/modules/work-rest/pages/WorkRestOverview.tsx',
  [`vessel ${CREW_PATHS.personHoursOfRest}`]: '/src/modules/work-rest/pages/MyWorkRestMonth.tsx',
  [`vessel ${CREW_PATHS.plannerTimeline}`]: '/src/modules/rotation-planner/pages/RotationPlannerPage.tsx',
  [`vessel ${CREW_PATHS.plannerManning}`]: '/src/modules/crew/pages/LeavePlannerPage.tsx',
  [`vessel ${CREW_PATHS.plannerRequests}`]: '/src/modules/crew/pages/LeaveRequestsPage.tsx',
  [`vessel ${CREW_PATHS.familiarisation}`]: '/src/modules/training/pages/Training.tsx',
  [`fleet ${CREW_FLEET_PATHS.planner}`]: '/src/modules/rotation-planner/pages/RotationPlannerPage.tsx',
};

describe('crew routes', () => {
  it('every page route is a lazy loader of a page under /src/modules/, with a guard', () => {
    for (const r of pages) {
      expect(typeof r.page, r.path).toBe('function');
      expect(r.page.length, `${r.path} loader takes no argument`).toBe(0);
      expect(loaderTarget(r.page), r.path).toMatch(/^\/src\/modules\/[\w-]+\/pages\/\w+\.tsx$/);
      expect(r.guard?.kind, `${r.path} declares a guard`).toBeTruthy();
    }
  });

  it('serves exactly today\'s pages at today\'s paths (a pure move)', () => {
    const got = Object.fromEntries(pages.map((r) => [`${r.scope} ${r.path}`, loaderTarget(r.page)]));
    expect(got).toEqual(TODAY);
  });

  it('keeps today\'s guard on every moved page (ProtectedRoute, as the old protectedPage); the rebuilt list is behind its capability', () => {
    for (const r of pages) {
      if (r.path === CREW_PATHS.list) expect(r.guard, r.path).toEqual({ kind: 'capability', capability: CREW_CAPS.crewListView });
      else expect(r.guard, r.path).toEqual({ kind: 'login' });
    }
  });

  it('redirects the two section roots as before, and the roster to the list (X1-02)', () => {
    const redirects = Object.fromEntries(CREW_ROUTES.filter(isRedirectDef).map((r) => [r.path, r.redirectTo]));
    expect(redirects).toEqual({ [CREW_PATHS.roster]: './../list', [CREW_PATHS.compliance]: 'status', [CREW_PATHS.planner]: 'timeline' });
  });

  it('the roster redirect lands on the crew list in React Router itself, query kept (route-relative resolution)', () => {
    const target = CREW_ROUTES.filter(isRedirectDef).find((r) => r.path === CREW_PATHS.roster)?.redirectTo ?? '';
    const Where = () => createElement('output', null, `${useLocation().pathname}${useLocation().search}`);
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/v/dra/crew/roster?q=bosun'] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { path: '/v/:vesselCode' },
            createElement(Route, { path: CREW_PATHS.roster, element: createElement(KeepSearchNavigate, { to: target }) }),
            createElement(Route, { path: CREW_PATHS.list, element: createElement(Where) }),
          ),
        ),
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('/v/dra/crew/list?q=bosun');
  });

  it('declares no path twice, in the module or across the registry', () => {
    const own = CREW_ROUTES.map((r) => `${r.scope} ${r.path}`);
    expect(own.filter((p, i) => own.indexOf(p) !== i)).toEqual([]);
    const all = MODULE_REGISTRY.routes.map((r) => r.fullPath);
    expect(all.filter((p, i) => all.indexOf(p) !== i)).toEqual([]);
    expect(MODULE_REGISTRY.problems).toEqual([]);
  });

  it('never routes crew/training or crew/medical (X5 owns them, platform-prep plan §1)', () => {
    for (const r of CREW_ROUTES) expect(r.path).not.toMatch(/^crew\/(training|medical)(\/|$)/);
  });
});

describe('every vessel crew URL of today resolves to its page', () => {
  const routes = appRouteObjects();
  it.each([
    ['/v/dra/crew', 'crew/pages/CrewListPage.tsx'],
    ['/v/dra/crew/list', 'crew/pages/CrewListPage.tsx'],
    ['/v/dra/crew/list?positions=1', 'crew/pages/CrewListPage.tsx'],
    ['/v/dra/crew/list?tab=movements', 'crew/pages/CrewListPage.tsx'],
    ['/v/dra/crew/roster', 'crew/pages/CrewListPage.tsx'],
    ['/v/dra/crew/compliance', 'crew/pages/CrewDocuments.tsx'],
    ['/v/dra/crew/compliance/status', 'crew/pages/CrewDocuments.tsx'],
    ['/v/dra/crew/hours-of-rest', 'work-rest/pages/WorkRestOverview.tsx'],
    ['/v/dra/crew/people/a0000000-0000-4000-8000-000000000011/hours-of-rest', 'work-rest/pages/MyWorkRestMonth.tsx'],
    ['/v/dra/crew/planner', 'rotation-planner/pages/RotationPlannerPage.tsx'],
    ['/v/dra/crew/planner/timeline', 'rotation-planner/pages/RotationPlannerPage.tsx'],
    ['/v/dra/crew/planner/manning', 'crew/pages/LeavePlannerPage.tsx'],
    ['/v/dra/crew/planner/requests', 'crew/pages/LeaveRequestsPage.tsx'],
    ['/v/dra/crew/training', 'development/pages/CrewTraining.tsx'],
    ['/v/dra/crew/familiarisation', 'training/pages/Training.tsx'],
    ['/fleet/planner', 'rotation-planner/pages/RotationPlannerPage.tsx'],
  ])('%s -> %s', (url, page) => {
    const resolved = resolveUrl(routes, url);
    expect(describeElement(resolved.element)).toContain(`page(/src/modules/${page})`);
  });
});

// ---------------------------------------------------------------- nav

const fragments = manifest.nav ?? [];
const crewLeaves = fragments.filter((f) => f.slot === 'vessel.crew');
const byLabel = (label: string): NavChild => {
  const f = fragments.find((x) => x.node.label === label);
  if (!f) throw new Error(`no leaf ${label}`);
  return f.node;
};

describe('crew nav', () => {
  it('sits at the X1 spec §4 orders (the roster folded into the Crew List by X1-02)', () => {
    expect(crewLeaves.map((f) => [f.order, f.node.label])).toEqual([
      [10, 'Crew List'],
      [20, 'Planner'],
      [30, 'Crew Compliance'],
      [40, 'Hours of Rest'],
      [80, 'Familiarisation'],
      [90, 'Checklists'],
      [100, 'Performance Appraisals'],
      [110, 'Visitors & Occasional Workers'],
      [120, 'Employment History'],
    ]);
  });

  it('keeps nav orders unique in each slot, and leaves 60 and 70 of vessel.crew to X5', () => {
    for (const slot of new Set(fragments.map((f) => f.slot))) {
      const orders = fragments.filter((f) => f.slot === slot).map((f) => f.order);
      expect(orders.filter((o, i) => orders.indexOf(o) !== i), slot).toEqual([]);
    }
    expect(crewLeaves.map((f) => f.order)).not.toContain(60);
    expect(crewLeaves.map((f) => f.order)).not.toContain(70);
    const all = MODULE_REGISTRY.nav.filter((f) => f.slot === 'vessel.crew').map((f) => f.order);
    expect(all.filter((o, i) => all.indexOf(o) !== i)).toEqual([]);
  });

  it('has no Dashboard leaf at the module root yet (crew still redirects to the list, X1-10B adds it)', () => {
    expect(fragments.some((f) => f.node.path === 'crew' || f.node.label === 'Dashboard')).toBe(false);
    expect(describeElement(resolveUrl(appRouteObjects(), '/v/dra/crew').element)).toContain('CrewListPage.tsx');
  });

  it('the rebuilt Crew List is beta behind vessel.crew.crew_list.view (X1-02); no Crew Roster leaf', () => {
    expect(byLabel('Crew List').status).toBe('beta');
    expect(byLabel('Crew List').capability).toBe(CREW_CAPS.crewListView);
    expect(fragments.some((f) => f.node.label === 'Crew Roster')).toBe(false);
  });

  it('moved leaves keep live and today\'s gates (no capability until their page is rebuilt, D-X1-25)', () => {
    for (const label of ['Planner', 'Crew Compliance', 'Hours of Rest', 'Familiarisation']) {
      const node = byLabel(label);
      expect(node.status, label).toBe('live');
      expect(node.capability, label).toBeUndefined();
    }
    expect(byLabel('Planner').moduleSetting).toBe('planner');
    expect(byLabel('Hours of Rest').moduleSetting).toBe('crew_hor');
    expect(byLabel('Hours of Rest').alsoCovers).toEqual(['crew/people/*/hours-of-rest']);
  });

  it('planned leaves have no route and carry the capability their page will need', () => {
    const routed = new Set(CREW_ROUTES.map((r) => r.path));
    const planned = crewLeaves.filter((f) => f.node.status !== 'live' && f.node.status !== 'beta');
    expect(planned.map((f) => f.node.label)).toEqual(['Checklists', 'Performance Appraisals', 'Visitors & Occasional Workers', 'Employment History']);
    for (const f of planned) {
      expect(routed.has(f.node.path), f.node.path).toBe(false);
      expect(MODULE_REGISTRY.hasPage(`/v/:vesselCode/${f.node.path}`), f.node.path).toBe(false);
    }
    expect(byLabel('Performance Appraisals').capability).toBe(CREW_CAPS.appraisalsView);
    expect(byLabel('Visitors & Occasional Workers').capability).toBe(CREW_CAPS.crewListView);
    expect(byLabel('Employment History').capability).toBe(CREW_CAPS.employmentView);
    for (const f of planned) if (f.node.capability) expect(catalogue.has(f.node.capability), f.node.capability).toBe(true);
  });

  it('every live or beta leaf reaches a page of the registry', () => {
    for (const f of crewLeaves.filter((x) => x.node.status === 'live' || x.node.status === 'beta')) {
      const url = `/v/dra/${f.node.path}`;
      expect(describeElement(resolveUrl(appRouteObjects(), url).element), url).toMatch(/(^|> )page\(/);
    }
  });
});

describe('crew capabilities', () => {
  it('lists the X1 spec §5 keys, once each, every one in the PMS catalogue', () => {
    expect(manifest.capabilities).toEqual(CREW_CAPABILITIES);
    expect(new Set(CREW_CAPABILITIES).size).toBe(CREW_CAPABILITIES.length);
    for (const key of CREW_CAPABILITIES) expect(catalogue.has(key), key).toBe(true);
    for (const key of [CREW_CAPS.crewListView, CREW_CAPS.complianceAdmin, CREW_CAPS.horFinalApprove, CREW_CAPS.famSign, CREW_CAPS.leaveApprove]) {
      expect(CREW_CAPABILITIES).toContain(key);
    }
  });

  it('leaves the crew medical key to fleet operations (X5)', () => {
    expect(CREW_CAPABILITIES.some((k) => k.startsWith('vessel.crew.crew_medical.') || k === 'health.personnel_medical.fitness_to_work.view')).toBe(false);
  });
});
