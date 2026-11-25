/**
 * Module registry invariants (BUILD-PLAN B8; gap/00 A2, B8, W3).
 *
 * Against the real registry (every src/modules/<m>/module.ts) and the real
 * router built from it:
 *
 * - the manifests load with no problems, one per folder;
 * - every page route declares a guard, and the router applies it;
 * - no route path is declared twice anywhere in the app;
 * - every live nav leaf a manifest contributes reaches a real page, and no
 *   planned leaf anywhere has a registered route (W3);
 * - every nav fragment lands in its slot of the assembled site map;
 * - manifests stay data: no static import of a page, shell or component.
 *
 * And against fixture manifests, the mechanism itself: vessel routes mount
 * relative to /v/:vesselCode, slots merge by order, a leaf goes live by
 * registering its route, and malformed manifests are reported, not thrown.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Importing the route tree imports the guards, which import the client.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { Route, createRoutesFromChildren, matchRoutes } from 'react-router-dom';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { buildRegistry, fullRoutePath } from '@/app/registry/registry';
import { createRecordKindRegistry, recordKinds, type RecordKindDefinition } from '@/lib/records/registry';
import { isRedirectDef, type ModuleManifest, type RouteDef } from '@/app/registry/types';
import { scopeRouteElements, workspaceRouteElements } from '@/app/router/manifestRoutes';
import ModuleRoute from '@/shared/components/ModuleRoute';
import { NAVIGATION_ITEMS, VESSEL_MODULES, navLeaves } from '@/config/sitemap';
import { L, mergeSlot, resolveNavStatus } from '@/config/navBuilders';
import { NAV_SLOTS, VESSEL_SLOTS, WORKSPACE_TREES } from '@/config/navSlots';
import type { NavChild } from '@/config/navigation-types';
import {
  appRouteObjects,
  describeRouteTree,
  isPlaceholderElement,
  isScopeNotFound,
  loaderTarget,
  resolveUrl,
} from '@/test/router/routeHarness';

const ROOT = process.cwd();
const CONVERTED = ['health', 'hris', 'legal', 'new-build', 'refit'];

const appRoutes = appRouteObjects();
const appLines = describeRouteTree(appRoutes);
const patternOf = (line: string) => line.split(' :: ')[0].replace(/ \[.*\]$/, '');

const page = () => Promise.resolve({ default: () => null });

const walk = (items: readonly NavChild[], visit: (n: NavChild) => void) => {
  for (const item of items) {
    visit(item);
    if (item.children) walk(item.children, visit);
  }
};

/** Every leaf of the assembled site map with its full path (vessel leaves on the pattern). */
const allLeaves: NavChild[] = navLeaves(NAVIGATION_ITEMS);

describe('module registry', () => {
  it('loads every manifest with no problems', () => {
    expect(MODULE_REGISTRY.problems).toEqual([]);
    const ids = MODULE_REGISTRY.manifests.map((m) => m.id);
    for (const id of CONVERTED) expect(ids, id).toContain(id);
  });

  it('has one manifest per src/modules/<m>/module.ts, named after its folder', () => {
    const folders = readdirSync(join(ROOT, 'src/modules')).filter((d) => existsSync(join(ROOT, 'src/modules', d, 'module.ts')));
    expect(MODULE_REGISTRY.manifests.map((m) => m.id).sort()).toEqual(folders.sort());
  });

  it('the five converted modules register every one of their routes', () => {
    const count = (id: string) => MODULE_REGISTRY.routes.filter((r) => r.moduleId === id).length;
    expect(count('hris')).toBe(20);
    expect(count('health')).toBe(51);
    expect(count('legal')).toBe(11);
    expect(count('refit')).toBeGreaterThanOrEqual(42);
    expect(count('new-build')).toBeGreaterThanOrEqual(25);
  });
});

describe('route invariants', () => {
  it('every page route declares a guard', () => {
    const unguarded = MODULE_REGISTRY.routes
      .filter((r) => !isRedirectDef(r.def))
      .filter((r) => !['login', 'scope', 'module', 'capability'].includes((r.def as { guard?: { kind?: string } }).guard?.kind ?? ''))
      .map((r) => r.fullPath);
    expect(unguarded).toEqual([]);
  });

  it('the router applies each page guard: ProtectedRoute, ModuleRoute, or the scope layout', () => {
    const byPattern = new Map(appLines.map((line) => [patternOf(line), line]));
    const wrong: string[] = [];
    for (const r of MODULE_REGISTRY.routes) {
      const line = byPattern.get(r.fullPath);
      if (!line) {
        wrong.push(`${r.fullPath}: not mounted`);
        continue;
      }
      if (isRedirectDef(r.def)) {
        if (!line.includes(`:: redirect(${r.def.redirectTo})`)) wrong.push(`${r.fullPath}: not a redirect to ${r.def.redirectTo}`);
        continue;
      }
      const kind = r.def.guard.kind;
      if (kind === 'login' && !line.includes('guard=ProtectedRoute')) wrong.push(`${r.fullPath}: no ProtectedRoute`);
      if ((kind === 'module' || kind === 'capability') && !line.includes(':: <ModuleRoute')) wrong.push(`${r.fullPath}: no ModuleRoute`);
      if (kind === 'module' && !line.includes(`moduleId=${JSON.stringify(r.def.guard.moduleId)}`)) wrong.push(`${r.fullPath}: wrong module`);
    }
    expect(wrong).toEqual([]);
  });

  it('mounts each workspace route inside its own WorkspaceScope', () => {
    const wrong = MODULE_REGISTRY.routesFor('workspace')
      .filter((r) => !appLines.some((line) => line.startsWith(`${r.fullPath} [<WorkspaceScope{workspace=${JSON.stringify(r.def.workspace)}}>] :: `)))
      .map((r) => `${r.fullPath} (${r.def.workspace})`);
    expect(wrong).toEqual([]);
  });

  it('no route path is declared twice anywhere in the app', () => {
    const seen = new Map<string, number>();
    for (const line of appLines) {
      const key = patternOf(line) + (line.includes(' (index)') ? '#index' : '');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect(Array.from(seen).filter(([, n]) => n > 1)).toEqual([]);
  });

  it('every registered route has a path its scope can mount', () => {
    const bad = MODULE_REGISTRY.routes
      .filter((r) => (r.def.scope === 'workspace' ? !r.def.path.startsWith('/') : r.def.path.startsWith('/')))
      .map((r) => r.fullPath);
    expect(bad).toEqual([]);
  });
});

describe('nav invariants', () => {
  it('every live leaf a manifest contributes reaches a real page', () => {
    // Statuses are settled by the assembler, so read each fragment's leaves
    // as they appear in the assembled site map.
    const assembled = new Map<string, NavChild>();
    walk(NAVIGATION_ITEMS.flatMap((m) => m.children ?? []), (n) => assembled.set(n.id, n));
    const broken: string[] = [];
    let checked = 0;
    for (const fragment of MODULE_REGISTRY.nav) {
      walk([assembled.get(fragment.node.id) ?? fragment.node], (n) => {
        if (n.children?.length || n.status !== 'live') return;
        checked += 1;
        if (MODULE_REGISTRY.hasPage(n.path)) return;
        const r = resolveUrl(appRoutes, n.path);
        if (r.pattern === '*' || !r.element || isPlaceholderElement(r.element) || isScopeNotFound(r.element)) {
          broken.push(`${fragment.moduleId}: ${n.label} -> ${n.path}`);
        }
      });
    }
    expect(checked).toBeGreaterThan(100);
    expect(broken).toEqual([]);
  });

  it('no planned leaf has a registered route (gap/00 W3)', () => {
    const vesselPlanned = VESSEL_MODULES.flatMap((m) => navLeaves(m.children))
      .filter((l) => l.status === 'planned' && !l.path.startsWith('/'))
      .map((l) => fullRoutePath({ scope: 'vessel', path: l.path }));
    const planned = [
      ...allLeaves.filter((l) => l.status === 'planned').map((l) => l.path.split('?')[0]),
      ...vesselPlanned,
    ];
    expect(planned.length).toBeGreaterThan(50);
    expect(planned.filter((p) => MODULE_REGISTRY.hasPage(p))).toEqual([]);
  });

  it('every leaf of the assembled site map has a status', () => {
    expect(allLeaves.filter((l) => !l.status).map((l) => l.path)).toEqual([]);
    const vessel = VESSEL_MODULES.flatMap((m) => navLeaves(m.children));
    expect(vessel.filter((l) => !l.status).map((l) => l.path)).toEqual([]);
  });

  it('every nav fragment lands in the assembled site map', () => {
    const ids = new Set<string>();
    walk(NAVIGATION_ITEMS.flatMap((m) => m.children ?? []), (n) => ids.add(n.id));
    const missing = MODULE_REGISTRY.nav.filter((f) => !ids.has(f.node.id)).map((f) => `${f.moduleId}: ${f.node.id} (${f.slot})`);
    expect(MODULE_REGISTRY.nav.length).toBeGreaterThanOrEqual(10);
    expect(missing).toEqual([]);
  });

  it('the slots match the shell: one vessel slot per tab, one tree per workspace module', () => {
    expect(VESSEL_SLOTS.map((s) => s.slice('vessel.'.length))).toEqual(VESSEL_MODULES.map((m) => m.id));
    // Fleet, Vessel, the workspace trees, then the personal tree (spec §8).
    expect(NAVIGATION_ITEMS.slice(2, -1).map((m) => m.id)).toEqual(WORKSPACE_TREES.map((w) => w.id));
    expect(NAVIGATION_ITEMS[NAVIGATION_ITEMS.length - 1]?.id).toBe('personal');
    expect(new Set(NAV_SLOTS).size).toBe(NAV_SLOTS.length);
  });
});

describe('manifests are data', () => {
  /** Static, non-type imports of a source file. */
  const runtimeImports = (source: string) =>
    Array.from(source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)).map((m) => m[1]);

  const ALLOWED = [/^lucide-react$/, /^@\/config\/navBuilders$/, /^@\/config\/navSlots$/, /^\.\/(paths|routes)$/, /^@\/modules\/[\w-]+\/paths$/];

  it.each(CONVERTED)('%s: module.ts and routes.tsx import no page, shell or component', (id) => {
    for (const file of ['module.ts', 'routes.tsx']) {
      const source = readFileSync(join(ROOT, 'src/modules', id, file), 'utf8');
      const stray = runtimeImports(source).filter((spec) => !ALLOWED.some((re) => re.test(spec)));
      expect(stray, `${id}/${file}`).toEqual([]);
      expect(source, `${id}/${file} holds JSX`).not.toMatch(/<[A-Z][\w.]*[\s/>]/);
    }
  });

  it('every page is a lazy loader: () => import(...)', () => {
    const notLazy = MODULE_REGISTRY.routes
      .filter((r) => !isRedirectDef(r.def))
      .filter((r) => {
        const loader = (r.def as { page: unknown }).page;
        return typeof loader !== 'function' || loader.length !== 0 || !loaderTarget(loader).startsWith('/src/modules/');
      })
      .map((r) => r.fullPath);
    expect(notLazy).toEqual([]);
  });
});

// ─── The mechanism, on fixtures ───────────────────────────────────────────

const fixture = (overrides: Partial<ModuleManifest> = {}): ModuleManifest => ({
  id: 'safety-fixture',
  label: 'Safety (fixture)',
  scopes: ['vessel', 'fleet'],
  routes: [
    { scope: 'vessel', path: 'safety/permits', page, guard: { kind: 'capability', capability: 'vessel.safety.permit_to_work.view' } },
    { scope: 'vessel', path: 'safety/permits/:permitId', page, guard: { kind: 'scope' } },
    { scope: 'vessel', path: 'safety/old-permits', redirectTo: '../permits' },
    { scope: 'fleet', path: 'safety', page, guard: { kind: 'login' } },
  ],
  nav: [
    { slot: 'vessel.safety', order: 25, node: L('Permits to work', 'safety', { slug: 'permits' }) },
    { slot: 'vessel.safety', order: 5, node: L('Planned thing', 'safety', { slug: 'later' }) },
  ],
  ...overrides,
});

describe('registry mechanism (fixtures)', () => {
  it('mounts vessel routes relative to /v/:vesselCode', () => {
    const registry = buildRegistry([fixture()]);
    expect(registry.problems).toEqual([]);
    expect(registry.routesFor('vessel').map((r) => r.fullPath)).toEqual([
      '/v/:vesselCode/safety/permits',
      '/v/:vesselCode/safety/permits/:permitId',
      '/v/:vesselCode/safety/old-permits',
    ]);
    const tree = createRoutesFromChildren(
      <Route path="/v/:vesselCode" element={<div />}>
        {scopeRouteElements(registry, 'vessel')}
      </Route>,
    );
    const matched = matchRoutes(tree, '/v/dra/safety/permits/PTW-DRA-2026-061');
    expect(matched?.map((m) => m.route.path)).toEqual(['/v/:vesselCode', 'safety/permits/:permitId']);
    expect(matched?.[1].params).toEqual({ vesselCode: 'dra', permitId: 'PTW-DRA-2026-061' });
  });

  it('wraps a capability guard in ModuleRoute', () => {
    const registry = buildRegistry([fixture()]);
    const first = scopeRouteElements(registry, 'vessel')[0] as React.ReactElement<{ element: React.ReactElement<{ capability?: string }> }>;
    expect(first.props.element.type).toBe(ModuleRoute);
    expect(first.props.element.props.capability).toBe('vessel.safety.permit_to_work.view');
  });

  it('the app builds each manifest page once, at module scope', () => {
    // Two renders of <AppRoutes/> give the same page component for a route,
    // so navigating within a module never remounts a page because the
    // route tree was rebuilt.
    const typeAt = (url: string) => resolveUrl(appRouteObjects(), url).element?.type;
    for (const url of ['/departments/legal/requests', '/hris/performance/objectives-and-pdps', '/yard/refit/overview/dashboard']) {
      expect(typeAt(url), url).toBeTruthy();
      expect(typeAt(url), url).toBe(typeAt(url));
    }
  });

  it('groups workspace routes under one WorkspaceScope per workspace', () => {
    const ws = (id: string, workspace: string, path: string): ModuleManifest => ({
      id, label: id, scopes: ['workspace'],
      routes: [{ scope: 'workspace', workspace, path, page, guard: { kind: 'login' } }],
    });
    const registry = buildRegistry([ws('a', 'yard', '/yard/a/x'), ws('b', 'yard', '/yard/b/x'), ws('c', 'hris', '/hris/c')]);
    const groups = workspaceRouteElements(registry) as React.ReactElement<{ element: React.ReactElement<{ workspace: string }>; children: React.ReactNode[] }>[];
    expect(groups.map((g) => [g.props.element.props.workspace, React.Children.count(g.props.children)])).toEqual([
      ['yard', 2],
      ['hris', 1],
    ]);
    const tree = createRoutesFromChildren(groups);
    expect(matchRoutes(tree, '/yard/b/x')?.map((m) => m.route.path)).toEqual([undefined, '/yard/b/x']);
  });

  it('merges fragments into a slot by order, and a leaf goes live by registering its route', () => {
    const registry = buildRegistry([fixture()]);
    const base = [L('Summary', 'safety'), L('Drills', 'safety', { status: 'live' }), L('Forms', 'safety', { slug: 'forms' })];
    const merged = mergeSlot(base, registry.fragmentsFor('vessel.safety'));
    expect(merged.map((n) => n.label)).toEqual(['Planned thing', 'Summary', 'Drills', 'Permits to work', 'Forms']);
    const resolved = resolveNavStatus(merged, (rel) => registry.hasPage(fullRoutePath({ scope: 'vessel', path: rel })));
    expect(Object.fromEntries(resolved.map((n) => [n.label, n.status]))).toEqual({
      'Planned thing': 'planned',
      Summary: 'planned',
      Drills: 'live',
      'Permits to work': 'live',
      Forms: 'planned',
    });
  });

  it('matches parameterised routes when settling a leaf', () => {
    const registry = buildRegistry([fixture()]);
    expect(registry.hasPage('/v/:vesselCode/safety/permits/abc')).toBe(true);
    expect(registry.hasPage('/v/:vesselCode/safety/old-permits')).toBe(false); // a redirect is not a page
    expect(registry.hasPage('/fleet/safety?tab=x')).toBe(true);
    expect(registry.hasPage('/fleet/safety/more')).toBe(false);
  });

  it('reports malformed manifests instead of throwing', () => {
    const bad: RouteDef[] = [
      { scope: 'vessel', path: '/v/dra/crew', page, guard: { kind: 'login' } },
      { scope: 'workspace', path: '/hris/x', page, guard: { kind: 'login' } },
      { scope: 'fleet', path: 'x', page } as unknown as RouteDef,
      { scope: 'personal', path: 'y', page, guard: { kind: 'login' } },
      { scope: 'fleet', path: 'safety', page, guard: { kind: 'login' } },
    ];
    const registry = buildRegistry({
      '../../modules/safety-fixture/module.ts': fixture(),
      '../../modules/other/module.ts': fixture({ id: 'mismatch', scopes: ['vessel', 'fleet', 'workspace'], routes: bad, nav: [{ slot: 'fleet.nowhere' as never, order: 1, node: L('X', '/fleet') }] }),
      '../../modules/twin/module.ts': fixture(),
    });
    const text = registry.problems.join('\n');
    expect(text).toContain('other: manifest id "mismatch" does not match its folder');
    expect(text).toContain('must be relative to /v/:vesselCode');
    expect(text).toContain('is a workspace route with no workspace');
    expect(text).toContain('declares no guard');
    expect(text).toContain('is in scope personal, which the manifest does not list');
    expect(text).toContain('safety-fixture: route /fleet/safety is already registered by mismatch');
    expect(text).toContain('names unknown slot "fleet.nowhere"');
    expect(text).toContain('twin: manifest id "safety-fixture" does not match its folder');
    expect(text).toContain('safety-fixture: two manifests share this id');
    // Sound routes still register and broken ones are skipped; of two
    // manifests claiming one path, the first in id order keeps it.
    expect(registry.routes.filter((r) => r.moduleId === 'mismatch').map((r) => r.fullPath)).toEqual(['/fleet/safety']);
    expect(registry.routes.filter((r) => r.moduleId === 'safety-fixture')).toHaveLength(3);
  });

  it('validates manifest record kinds: bad and duplicate reference prefixes are problems, not throws', () => {
    const kind = (key: string, refPrefix: string): RecordKindDefinition => ({
      key,
      moduleKey: 'safety',
      label: key,
      refPrefix,
      scope: 'vessel',
      capabilityPath: 'vessel.safety.capa',
      enveloped: true,
      companyStep: 'sign_off',
      editAfterSign: 'allow_with_flag',
      deleteRule: 'draft_only',
      slotTemplate: [],
    });
    // Record-kind keys are snake_case "<module>.<kind>", so the fixture module is "safety".
    const safety = fixture({
      id: 'safety',
      routes: [],
      nav: [],
      recordKinds: [
        kind('safety.corrective_action', 'CA'),
        kind('safety.near_miss', 'CA'),
        kind('safety.bad_prefix', 'ca'),
        { ...kind('safety.bogus_step', 'BOG'), companyStep: 'bogus' as never },
      ],
    });
    const kinds = createRecordKindRegistry();
    let registry: ReturnType<typeof buildRegistry> | undefined;
    expect(() => (registry = buildRegistry([safety], { recordKindRegistry: kinds }))).not.toThrow();
    const text = registry?.problems.join('\n') ?? '';
    expect(text).toContain('safety: Reference prefix "CA" is already used by "safety.corrective_action"');
    expect(text).toContain('safety: Record kind "safety.bad_prefix": refPrefix must be 1–8 upper-case letters or digits');
    expect(text).toContain('safety: Record kind "safety.bogus_step": unknown companyStep "bogus"');
    // Only the sound kind registers, in the manifest registry and the record-kind registry alike.
    expect(registry?.recordKinds.map((k) => k.key)).toEqual(['safety.corrective_action']);
    expect(kinds.list().map((k) => k.key)).toEqual(['safety.corrective_action']);
    expect(kinds.byRefPrefix('CA')?.key).toBe('safety.corrective_action');
  });

  it('builds a fresh record-kind registry when none is injected (pure)', () => {
    const safety = fixture({ id: 'safety', routes: [], nav: [], recordKinds: [] });
    expect(buildRegistry([safety]).problems).toEqual([]);
    expect(recordKinds.list().map((k) => k.key)).toEqual(MODULE_REGISTRY.recordKinds.map((k) => k.key));
  });
});
