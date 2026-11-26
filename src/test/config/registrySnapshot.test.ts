/**
 * Moving routes and nav into module manifests changed nothing (BUILD-PLAN
 * B8; gap/00 F0.3 "sitemap output identical (snapshot test)").
 *
 * The baselines were first written from the router and site map as they
 * stood before the registry existed:
 *
 * - registry.routes.baseline.json: every route of <AppRoutes/>, with its
 *   full pattern, the pathless layout above it, and what its element does
 *   (page module, guard, layout, redirect target).
 * - sitemap.snapshot.baseline.json: every node of every nav tree with every
 *   field, and the placeholder and redirect lists built from them.
 *
 * Since platform-prep PP2 the lines of the Phase 3 stream modules
 * (`STREAM_BASELINE_MODULES`) live in each module's own
 * `src/test/<module>/registry.baseline.json` instead (navSnapshot.ts says
 * which line belongs to whom). Together the files are the whole snapshot.
 *
 * A change that is meant (a new route, a moved leaf) updates the baselines
 * in the same commit:
 *
 *   UPDATE_REGISTRY_BASELINE=1 npx vitest run <this file>           every file
 *   UPDATE_REGISTRY_BASELINE=crew,fleet npx vitest run <this file>  only those modules' files
 *
 * A stream slice uses the second form, so it never rewrites a platform file;
 * if a platform line changes too, the test still fails and names it.
 */
import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Importing the route tree imports the guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { MODULE_REGISTRY } from '@/app/registry/modules';
import { L } from '@/config/navBuilders';
import { appRouteObjects, describeRouteTree } from '@/test/router/routeHarness';
import {
  STREAM_BASELINE_MODULES,
  moduleBaselineJson,
  moduleBaselinePath,
  parseBaselineUpdate,
  parseModuleBaseline,
  partitionSnapshot,
  routeLinePath,
  sitemapSnapshot,
  treeLineId,
  type ModuleBaseline,
  type OwnershipSource,
} from './navSnapshot';
import routesBaseline from './registry.routes.baseline.json';
import sitemapBaseline from './sitemap.snapshot.baseline.json';

const ROOT = process.cwd();
const HERE = join(ROOT, 'src/test/config');
const update = parseBaselineUpdate(process.env.UPDATE_REGISTRY_BASELINE);

const readModuleBaseline = (moduleId: string, lists: readonly string[]): ModuleBaseline => {
  const file = join(ROOT, moduleBaselinePath(moduleId));
  if (!existsSync(file)) return { routes: [], nav: {} };
  return parseModuleBaseline(JSON.parse(readFileSync(file, 'utf8')), moduleBaselinePath(moduleId), lists);
};

describe('route set and site map are unchanged by the registry', () => {
  const routes = describeRouteTree(appRouteObjects());
  const nav = sitemapSnapshot();
  const lists = Object.keys(nav);
  const parts = partitionSnapshot({ routes, nav }, MODULE_REGISTRY);

  if (update.platform) {
    writeFileSync(join(HERE, 'registry.routes.baseline.json'), `${JSON.stringify(parts.platform.routes, null, 2)}\n`);
    writeFileSync(join(HERE, 'sitemap.snapshot.baseline.json'), `${JSON.stringify(parts.platform.nav, null, 2)}\n`);
  }
  for (const moduleId of update.modules) {
    const baseline = parts.modules[moduleId];
    const file = join(ROOT, moduleBaselinePath(moduleId));
    const empty = !baseline.routes.length && !Object.keys(baseline.nav).length;
    // A module with nothing to own gets no file; one that had a file keeps an empty one.
    if (!empty || existsSync(file)) writeFileSync(file, moduleBaselineJson(baseline, lists));
  }

  it('describes a full route tree', () => {
    expect(routes.length).toBeGreaterThan(300);
  });

  it('ownership is unambiguous', () => {
    expect(parts.problems).toEqual([]);
  });

  it('every platform route has the same pattern, layout, page, guard and redirect as before', () => {
    expect(parts.platform.routes).toEqual(routesBaseline);
  });

  it('every platform nav tree and generated list is identical', () => {
    for (const key of Object.keys(sitemapBaseline) as (keyof typeof sitemapBaseline)[]) {
      expect(parts.platform.nav[key], key).toEqual(sitemapBaseline[key]);
    }
    expect(Object.keys(parts.platform.nav).sort()).toEqual(Object.keys(sitemapBaseline).sort());
  });

  it.each([...STREAM_BASELINE_MODULES])('%s: its routes and nav lines match src/test/%s/registry.baseline.json', (moduleId) => {
    const expected = readModuleBaseline(moduleId, lists);
    const actual = parts.modules[moduleId];
    expect(actual.routes, `${moduleId} routes`).toEqual(expected.routes);
    for (const list of lists) expect(actual.nav[list] ?? [], `${moduleId} ${list}`).toEqual(expected.nav[list] ?? []);
  });

  it('only the stream modules have a registry baseline of their own', () => {
    const stray = readdirSync(join(ROOT, 'src/test'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'src/test', d.name, 'registry.baseline.json')))
      .map((d) => d.name)
      .filter((name) => !(STREAM_BASELINE_MODULES as readonly string[]).includes(name));
    expect(stray).toEqual([]);
  });

  it('the parts add up to the whole snapshot', () => {
    const moduleRoutes = Object.values(parts.modules).flatMap((m) => m.routes);
    expect([...parts.platform.routes, ...moduleRoutes].sort()).toEqual([...routes].sort());
    for (const list of lists) {
      const owned = Object.values(parts.modules).flatMap((m) => m.nav[list] ?? []);
      expect(parts.platform.nav[list].length + owned.length, list).toBe(nav[list].length);
    }
  });
});

// ─── The partition, on fixtures ───────────────────────────────────────────

describe('partition rules (fixtures)', () => {
  const crewList = L('Crew List', 'crew', { slug: 'list' });
  const medical = L('Crew Medical', 'crew', { slug: 'medical' });
  const fleetMedical = L('Medical', '/fleet', { slug: 'medical' });
  const myDocs = L('Documents', '/me', { slug: 'documents' });
  const hrisLeaf = L('Records', '/hris', { slug: 'records' });
  const source: OwnershipSource = {
    routes: [
      { moduleId: 'crew', fullPath: '/v/:vesselCode/crew/list' },
      { moduleId: 'hris', fullPath: '/hris/records' },
    ],
    nav: [
      { moduleId: 'crew', slot: 'vessel.crew', node: crewList },
      { moduleId: 'fleet', slot: 'vessel.crew', node: medical },
      { moduleId: 'fleet', slot: 'fleet.people', node: fleetMedical },
      { moduleId: 'crew', slot: 'personal.my_work', node: myDocs },
      { moduleId: 'hris', slot: 'workspace.hris', node: hrisLeaf },
    ],
  };
  const tree = (indent: number, id: string, extra = '') => `${'  '.repeat(indent)}Users {"id":"${id}"${extra}}`;
  const snapshot = {
    routes: [
      '/fleet/medical :: <PlaceholderWrapper{title="Medical"}>',
      '/fleet/reports :: page(/src/modules/dashboard/pages/FleetReportsIndex.tsx) guard=ProtectedRoute layout=-',
      '/fleet/old-medical :: redirect(/fleet/medical)',
      '/hris/records [<WorkspaceScope{workspace="hris"}>] :: page(/src/modules/hris/pages/X.tsx) guard=ProtectedRoute layout=-',
      '/me/documents :: <PlaceholderWrapper{title="Documents"}>',
      '/v/:vesselCode/crew :: redirect(list)',
      '/v/:vesselCode/crew/list :: page(/src/modules/crew/pages/CrewList.tsx) guard=ProtectedRoute layout=-',
      '/v/:vesselCode/crew/medical :: <PlaceholderWrapper{title="Crew Medical"}>',
      '/v/:vesselCode/crew/medical/legacy :: legacy(/x) > redirect(..)',
    ],
    nav: {
      NAVIGATION_ITEMS: [
        tree(0, 'fleet'),
        tree(1, 'fleet-people'),
        tree(2, 'fleet-medical'),
        tree(2, 'fleet-visits'),
        tree(1, 'vessel-crew'),
        tree(2, 'vessel-crew-list'),
        tree(2, 'vessel-crew-medical'),
        tree(1, 'me-documents'),
        tree(1, 'hris-records'),
      ],
      VESSEL_MODULES: [tree(0, 'crew'), tree(1, 'crew-list'), tree(1, 'crew-medical'), tree(1, 'crew-roster')],
      buildVesselNav: [tree(0, 'crew'), tree(1, 'vessel-crew-list'), tree(1, 'vessel-crew-medical')],
      PLACEHOLDER_LEAVES: ['/shoreside Shoreside'],
      FLEET_PLACEHOLDER_LEAVES: ['medical Medical', 'visits Visits'],
      VESSEL_PLACEHOLDER_LEAVES: ['crew/medical Crew Medical', 'crew/roster Crew Roster'],
      PERSONAL_PLACEHOLDER_LEAVES: ['documents Documents', 'leave Leave'],
      VESSEL_ROOT_REDIRECTS: ['crew -> list', 'safety -> drills'],
      SECTION_REDIRECTS: ['/hris -> /hris/records?module=hris'],
    },
  };
  const parts = partitionSnapshot(snapshot, source);

  it('a route line belongs to the module that registers its full path', () => {
    expect(parts.modules.crew.routes).toContain('/v/:vesselCode/crew/list :: page(/src/modules/crew/pages/CrewList.tsx) guard=ProtectedRoute layout=-');
    // hris is not a stream module: its lines stay with the platform.
    expect(parts.platform.routes.some((l) => l.startsWith('/hris/records'))).toBe(true);
    expect(parts.platform.routes).toContain('/fleet/reports :: page(/src/modules/dashboard/pages/FleetReportsIndex.tsx) guard=ProtectedRoute layout=-');
  });

  it('a nav line belongs to the fragment that contributed the node, vessel- ids included', () => {
    expect(parts.modules.crew.nav.NAVIGATION_ITEMS).toEqual([tree(2, 'vessel-crew-list'), tree(1, 'me-documents')]);
    expect(parts.modules.crew.nav.VESSEL_MODULES).toEqual([tree(1, 'crew-list')]);
    expect(parts.modules.crew.nav.buildVesselNav).toEqual([tree(1, 'vessel-crew-list')]);
    expect(parts.modules.fleet.nav.NAVIGATION_ITEMS).toEqual([tree(2, 'fleet-medical'), tree(2, 'vessel-crew-medical')]);
    expect(parts.platform.nav.NAVIGATION_ITEMS).toEqual([
      tree(0, 'fleet'), tree(1, 'fleet-people'), tree(2, 'fleet-visits'), tree(1, 'vessel-crew'), tree(1, 'hris-records'),
    ]);
    expect(parts.platform.nav.VESSEL_MODULES).toEqual([tree(0, 'crew'), tree(1, 'crew-roster')]);
  });

  it('a generated entry, and the route mounted for it, belong to the owner of its leaf', () => {
    expect(parts.modules.fleet.nav.FLEET_PLACEHOLDER_LEAVES).toEqual(['medical Medical']);
    expect(parts.modules.fleet.nav.VESSEL_PLACEHOLDER_LEAVES).toEqual(['crew/medical Crew Medical']);
    expect(parts.modules.crew.nav.PERSONAL_PLACEHOLDER_LEAVES).toEqual(['documents Documents']);
    expect(parts.modules.crew.nav.VESSEL_ROOT_REDIRECTS).toEqual(['crew -> list']);
    expect(parts.platform.nav.VESSEL_ROOT_REDIRECTS).toEqual(['safety -> drills']);
    expect(parts.platform.nav.SECTION_REDIRECTS).toEqual(['/hris -> /hris/records?module=hris']);
    expect(parts.modules.fleet.routes).toEqual([
      '/fleet/medical :: <PlaceholderWrapper{title="Medical"}>',
      '/v/:vesselCode/crew/medical :: <PlaceholderWrapper{title="Crew Medical"}>',
    ]);
    expect(parts.modules.crew.routes).toEqual([
      '/me/documents :: <PlaceholderWrapper{title="Documents"}>',
      '/v/:vesselCode/crew :: redirect(list)',
      '/v/:vesselCode/crew/list :: page(/src/modules/crew/pages/CrewList.tsx) guard=ProtectedRoute layout=-',
    ]);
    // A platform redirect that only points at an owned leaf stays with the platform.
    expect(parts.platform.routes).toContain('/fleet/old-medical :: redirect(/fleet/medical)');
    expect(parts.platform.routes).toContain('/v/:vesselCode/crew/medical/legacy :: legacy(/x) > redirect(..)');
  });

  it('every listed module has a part, the parts add up, and order is kept', () => {
    expect(Object.keys(parts.modules)).toEqual([...STREAM_BASELINE_MODULES]);
    expect(parts.modules.reports).toEqual({ routes: [], nav: {} });
    expect(parts.problems).toEqual([]);
    const owned = Object.values(parts.modules).flatMap((m) => m.routes);
    expect([...parts.platform.routes, ...owned].sort()).toEqual([...snapshot.routes].sort());
  });

  it('two modules claiming one node or path is a problem, and so is one id on two lines', () => {
    const twice = partitionSnapshot(
      { routes: [], nav: {} },
      {
        routes: [{ moduleId: 'crew', fullPath: '/x' }, { moduleId: 'fleet', fullPath: '/x' }],
        nav: [...source.nav, { moduleId: 'forms', slot: 'vessel.crew', node: crewList }],
      },
    );
    expect(twice.problems).toEqual([
      'route /x is claimed by both crew and fleet',
      'nav node crew-list is claimed by both crew and forms',
      'nav node vessel-crew-list is claimed by both crew and forms',
      'nav leaf /v/:vesselCode/crew/list is claimed by both crew and forms',
    ]);
    const dup = partitionSnapshot({ routes: [], nav: { NAVIGATION_ITEMS: [tree(1, 'vessel-crew-list'), tree(2, 'vessel-crew-list')] } }, source);
    expect(dup.problems).toEqual(['nav node vessel-crew-list matches 2 lines in NAVIGATION_ITEMS; node ids must be unique']);
  });

  it('only the modules asked for are split out', () => {
    const only = partitionSnapshot(snapshot, source, ['crew']);
    expect(Object.keys(only.modules)).toEqual(['crew']);
    expect(only.platform.routes).toContain('/fleet/medical :: <PlaceholderWrapper{title="Medical"}>');
  });

  it('reads line paths and node ids', () => {
    expect(routeLinePath('/fleet (index) :: redirect(/fleet/dashboard)')).toBe('/fleet');
    expect(routeLinePath('/hris/x [<WorkspaceScope>] :: y')).toBe('/hris/x');
    expect(treeLineId('    Clock {"alsoCovers":["crew/people/*/hours-of-rest"],"id":"vessel-crew-hours-of-rest"}')).toBe('vessel-crew-hours-of-rest');
    expect(treeLineId('not a node')).toBeNull();
  });
});

describe('baseline files and the update switch', () => {
  const lists = ['NAVIGATION_ITEMS', 'VESSEL_MODULES'];

  it('writes lists in snapshot order and leaves empty ones out', () => {
    const json = moduleBaselineJson({ routes: ['/a :: x'], nav: { VESSEL_MODULES: ['b'], NAVIGATION_ITEMS: ['a'], buildVesselNav: [] } }, [...lists, 'buildVesselNav']);
    expect(json).toBe(`${JSON.stringify({ routes: ['/a :: x'], nav: { NAVIGATION_ITEMS: ['a'], VESSEL_MODULES: ['b'] } }, null, 2)}\n`);
    expect(parseModuleBaseline(JSON.parse(json), 'f', lists)).toEqual({ routes: ['/a :: x'], nav: { NAVIGATION_ITEMS: ['a'], VESSEL_MODULES: ['b'] } });
  });

  it('a malformed module file fails with its name', () => {
    expect(() => parseModuleBaseline([], 'src/test/crew/registry.baseline.json', lists)).toThrow('src/test/crew/registry.baseline.json');
    expect(() => parseModuleBaseline({ routes: [1] }, 'f', lists)).toThrow('routes must be a list of strings');
    expect(() => parseModuleBaseline({ nav: { NOPE: [] } }, 'f', lists)).toThrow('unknown nav list NOPE');
    expect(() => parseModuleBaseline({ routes: [], extra: 1 }, 'f', lists)).toThrow('unknown keys extra');
    expect(parseModuleBaseline({}, 'f', lists)).toEqual({ routes: [], nav: {} });
  });

  it('UPDATE_REGISTRY_BASELINE: 1 writes everything, a module list writes only those modules', () => {
    expect(parseBaselineUpdate(undefined)).toEqual({ platform: false, modules: [] });
    expect(parseBaselineUpdate('')).toEqual({ platform: false, modules: [] });
    expect(parseBaselineUpdate('1')).toEqual({ platform: true, modules: [...STREAM_BASELINE_MODULES] });
    expect(parseBaselineUpdate('all')).toEqual({ platform: true, modules: [...STREAM_BASELINE_MODULES] });
    expect(parseBaselineUpdate('fleet, crew')).toEqual({ platform: false, modules: ['crew', 'fleet'] });
    expect(() => parseBaselineUpdate('crew,crw')).toThrow('UPDATE_REGISTRY_BASELINE names crw');
    expect(() => parseBaselineUpdate('hris')).toThrow('hris');
  });
});
