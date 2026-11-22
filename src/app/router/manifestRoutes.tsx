/**
 * Mounts module manifest routes (BUILD-PLAN B8; gap/00 A2 "AppRouter").
 *
 * The registry (src/app/registry) holds every module's routes as data; this
 * file turns them into <Route> elements, once, at module scope, so each
 * page's lazy component is created a single time:
 *
 * - `fleet`, `vessel`, `personal` routes are children of their scope's
 *   layout route in src/routes/index.tsx, at paths relative to `/fleet`,
 *   `/v/:vesselCode` and `/me`;
 * - `workspace` routes are grouped under one pathless `<WorkspaceScope>`
 *   per workspace, at their absolute paths, together with that workspace's
 *   Coming Soon placeholders (sitemap PLACEHOLDER_LEAVES), so opening a
 *   planned leaf from a workspace page keeps the one shell (D-13).
 *
 * Element shape per guard (so the route tree is the one the modules used to
 * build by hand; src/test/config/registrySnapshot.test.ts pins it):
 *
 *   login                  <Page/>, ProtectedRoute inside the page
 *   scope                  <Page/>, the scope layout guards it
 *   module | capability    <ModuleRoute …><Page/></ModuleRoute>, kept
 *                          mounted between pages of the same module
 *
 * where Page = lazyPage(loader, { guard, layout }).
 */
import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import ModuleRoute from '@/shared/components/ModuleRoute';
import { PLACEHOLDER_LEAVES, type SitemapLeaf } from '@/config/sitemap';
import { WORKSPACE_TREES } from '@/config/navSlots';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import RefitShell from '@/modules/refit/components/layout/RefitShell';
import NewBuildShell from '@/modules/new-build/components/layout/NewBuildShell';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import type { ModuleRegistry, RegisteredRoute } from '@/app/registry/registry';
import { isRedirectDef, type PageRouteDef, type RouteGuard, type RouteLayout, type RouteScope } from '@/app/registry/types';
import KeepSearchNavigate from './KeepSearchNavigate';
import { lazyPage, type PageWrapper } from './lazyPage';
import PlaceholderWrapper from './PlaceholderWrapper';
import { WorkspaceScope } from './scopes';

/** The shells a page route may name (platform-registered; see RouteLayout). */
const LAYOUTS: Readonly<Record<RouteLayout, PageWrapper>> = {
  dashboard: DashboardLayout,
  'refit-shell': RefitShell,
  'new-build-shell': NewBuildShell,
};

type ModuleRouteProps = React.ComponentProps<typeof ModuleRoute>;

/** ModuleRoute props for a module or capability guard; only the gates that are set. */
function moduleRouteProps(guard: Extract<RouteGuard, { kind: 'module' | 'capability' }>): ModuleRouteProps {
  if (guard.kind === 'capability') return { capability: guard.capability };
  const { moduleId, hrLevel, payrollLevel, medicalLevel, wellnessLevel, capability } = guard;
  return {
    moduleId,
    ...(hrLevel ? { hrLevel } : {}),
    ...(payrollLevel ? { payrollLevel } : {}),
    ...(medicalLevel ? { medicalLevel } : {}),
    ...(wellnessLevel ? { wellnessLevel } : {}),
    ...(capability ? { capability } : {}),
  };
}

/** The route element for one page definition: guard, layout and lazy page. */
function pageElement(def: PageRouteDef): React.ReactElement {
  const { guard } = def;
  const Page = lazyPage(def.page, {
    guard: guard.kind === 'login' ? ProtectedRoute : undefined,
    layout: def.layout ? LAYOUTS[def.layout] : undefined,
    label: def.label,
  });
  if (guard.kind === 'module' || guard.kind === 'capability') {
    return (
      <ModuleRoute {...moduleRouteProps(guard)}>
        <Page />
      </ModuleRoute>
    );
  }
  return <Page />;
}

function routeElement(route: RegisteredRoute): React.ReactElement {
  const { def } = route;
  // A redirect keeps the query and hash (e.g. the sidebar's ?module=).
  const element = isRedirectDef(def) ? <KeepSearchNavigate to={def.redirectTo} /> : pageElement(def);
  if (!def.path) return <Route key={route.fullPath} index element={element} />;
  return <Route key={route.fullPath} path={def.path} element={element} />;
}

/**
 * The routes of one non-workspace scope, as children for its layout route.
 * Exported for tests; the app uses the constants below.
 */
export function scopeRouteElements(registry: ModuleRegistry, scope: Exclude<RouteScope, 'workspace'>): React.ReactElement[] {
  return registry.routesFor(scope).map(routeElement);
}

/** The workspace (navSlots WORKSPACE_TREES) whose URL prefix a path sits under. */
function workspaceOfPath(path: string): string | undefined {
  const pathname = path.split('?')[0];
  return WORKSPACE_TREES.find((w) => pathname === w.path || pathname.startsWith(`${w.path}/`))?.id;
}

/**
 * A planned leaf's Coming Soon page. HRIS keeps its module gate. Inside a
 * WorkspaceScope the scope's ProtectedRoute guards the rest; a top-level
 * one (a workspace with no scope route) brings its own.
 */
export function placeholderElement(leaf: SitemapLeaf, inWorkspaceScope: boolean): React.ReactElement {
  const page = <PlaceholderWrapper title={leaf.label} />;
  if (leaf.path.startsWith('/hris/')) return <ModuleRoute moduleId="hris">{page}</ModuleRoute>;
  return inWorkspaceScope ? page : <ProtectedRoute>{page}</ProtectedRoute>;
}

/**
 * Split the planned workspace leaves: those under a workspace that has a
 * WorkspaceScope (it registers routes) go inside it; the rest (Shoreside,
 * which has no pages yet) stay top-level routes.
 */
export function splitWorkspacePlaceholders(
  registry: ModuleRegistry,
  leaves: readonly SitemapLeaf[],
): { byWorkspace: ReadonlyMap<string, SitemapLeaf[]>; topLevel: SitemapLeaf[] } {
  const scoped = new Set(registry.routesFor('workspace').map((r) => r.def.workspace as string));
  const byWorkspace = new Map<string, SitemapLeaf[]>();
  const topLevel: SitemapLeaf[] = [];
  for (const leaf of leaves) {
    const workspace = workspaceOfPath(leaf.path);
    if (workspace && scoped.has(workspace)) byWorkspace.set(workspace, [...(byWorkspace.get(workspace) ?? []), leaf]);
    else topLevel.push(leaf);
  }
  return { byWorkspace, topLevel };
}

/**
 * Workspace routes, one pathless <WorkspaceScope> per workspace, in
 * first-registered order, each with its planned leaves' placeholders.
 */
export function workspaceRouteElements(
  registry: ModuleRegistry,
  placeholders: ReadonlyMap<string, readonly SitemapLeaf[]> = new Map(),
): React.ReactElement[] {
  const groups = new Map<string, RegisteredRoute[]>();
  for (const route of registry.routesFor('workspace')) {
    const id = route.def.workspace as string;
    groups.set(id, [...(groups.get(id) ?? []), route]);
  }
  return Array.from(groups, ([workspace, routes]) => (
    <Route key={`workspace:${workspace}`} element={<WorkspaceScope workspace={workspace} />}>
      {routes.map(routeElement)}
      {(placeholders.get(workspace) ?? []).map((leaf) => (
        <Route key={`placeholder:${leaf.path}`} path={leaf.path} element={placeholderElement(leaf, true)} />
      ))}
    </Route>
  ));
}

const WORKSPACE_PLACEHOLDERS = splitWorkspacePlaceholders(MODULE_REGISTRY, PLACEHOLDER_LEAVES);

/**
 * Planned workspace leaves with no WorkspaceScope to sit in; the router
 * mounts them as top-level routes (src/routes/index.tsx).
 */
export const TOP_LEVEL_PLACEHOLDER_LEAVES: readonly SitemapLeaf[] = WORKSPACE_PLACEHOLDERS.topLevel;

/** Inside `/fleet`. */
export const fleetManifestRoutes = <>{scopeRouteElements(MODULE_REGISTRY, 'fleet')}</>;
/** Inside `/v/:vesselCode`, at paths relative to the vessel. */
export const vesselManifestRoutes = <>{scopeRouteElements(MODULE_REGISTRY, 'vessel')}</>;
/** Inside `/me`, under the shell. */
export const personalManifestRoutes = <>{scopeRouteElements(MODULE_REGISTRY, 'personal')}</>;
/** Top level: every workspace's routes inside its WorkspaceScope. */
export const workspaceManifestRoutes = <>{workspaceRouteElements(MODULE_REGISTRY, WORKSPACE_PLACEHOLDERS.byWorkspace)}</>;
