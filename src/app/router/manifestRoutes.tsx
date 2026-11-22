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
 *   per workspace, at their absolute paths.
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
import { Navigate, Route } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import ModuleRoute from '@/shared/components/ModuleRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import RefitShell from '@/modules/refit/components/layout/RefitShell';
import NewBuildShell from '@/modules/new-build/components/layout/NewBuildShell';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import type { ModuleRegistry, RegisteredRoute } from '@/app/registry/registry';
import { isRedirectDef, type PageRouteDef, type RouteGuard, type RouteLayout, type RouteScope } from '@/app/registry/types';
import { lazyPage, type PageWrapper } from './lazyPage';
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
  const element = isRedirectDef(def) ? <Navigate to={def.redirectTo} replace /> : pageElement(def);
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

/** Workspace routes, one pathless <WorkspaceScope> per workspace, in first-registered order. */
export function workspaceRouteElements(registry: ModuleRegistry): React.ReactElement[] {
  const groups = new Map<string, RegisteredRoute[]>();
  for (const route of registry.routesFor('workspace')) {
    const id = route.def.workspace as string;
    groups.set(id, [...(groups.get(id) ?? []), route]);
  }
  return Array.from(groups, ([workspace, routes]) => (
    <Route key={`workspace:${workspace}`} element={<WorkspaceScope workspace={workspace} />}>
      {routes.map(routeElement)}
    </Route>
  ));
}

/** Inside `/fleet`. */
export const fleetManifestRoutes = <>{scopeRouteElements(MODULE_REGISTRY, 'fleet')}</>;
/** Inside `/v/:vesselCode`, at paths relative to the vessel. */
export const vesselManifestRoutes = <>{scopeRouteElements(MODULE_REGISTRY, 'vessel')}</>;
/** Inside `/me`, under the shell. */
export const personalManifestRoutes = <>{scopeRouteElements(MODULE_REGISTRY, 'personal')}</>;
/** Top level: every workspace's routes inside its WorkspaceScope. */
export const workspaceManifestRoutes = <>{workspaceRouteElements(MODULE_REGISTRY)}</>;
