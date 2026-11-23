/**
 * Whether an in-app favourite still opens for this viewer (gap/10 top bar
 * element 6; spec §6.4; D-93, D-04). A pin is a stored URL: the page it names
 * may since have gone out of reach (fleet reach revoked, a vessel sold or
 * unassigned, a module switched off on that vessel, a workspace closed). The
 * menu asks here before it draws a pin as a link.
 *
 * The answer mirrors what the destination route would do, scope by scope; it
 * is not a match against the visible nav (that holds one vessel's tabs and
 * nav leaves only, and would wrongly drop pins to another vessel, to a record
 * page or to an old URL):
 *
 * 1. An old URL runs through the legacy redirect table first (`LegacyRoute`).
 *    One that renders in place for this viewer is available; one that
 *    redirects is judged by where it lands.
 * 2. `/fleet/*`: unavailable without fleet reach (`FleetScope`).
 * 3. `/v/:code/*`: unavailable when the code is not a reachable vessel
 *    (unknown, out of reach, sold or archived; `VesselScopeRoute`). For a
 *    reachable vessel, that vessel's module settings decide, with the vessel
 *    route gate's own rule (`vesselRouteDecision`): waiting while they load,
 *    an error (could not check) when they failed, unavailable when a module
 *    on the way is off. A failed check is never "No longer available": the
 *    page may well open, so the menu offers no Remove for it (D-04, D-107).
 * 4. A workspace (`/hris`, `/health`, `/yard`, `/departments/legal`,
 *    `/shoreside` and below). A page the registry guards with ModuleRoute
 *    (a `module` or `capability` guard, and the planned `/hris/…` leaves,
 *    which keep the HRIS module gate) is judged by that guard, with
 *    ModuleRoute's own rule (`moduleGateDecision`, ../../moduleGate.ts):
 *    waiting while access loads, unavailable when the route would deny. So
 *    a self-service HR viewer's pin to a page they open is a link, though
 *    the HRIS Apps entry needs HR view. Any other workspace path (a `login`
 *    or `scope` guard, no registered page) is judged by the workspace's Apps
 *    entry (`useWorkspaceRootGate`, D-97), waiting until it is ready. This
 *    holds until the typed-URL workspace route gate (D-97) lands.
 * 5. Anything else (`/me`, `/inbox`, `/help`, …): available; the destination
 *    decides.
 *
 * While access loads (`useScopeAccess().ready` false) every pin is waiting.
 * The resolver is pure (`resolvePinScope`, then `finishPinAvailability`), so
 * each rule is unit-tested; `usePinAvailability` feeds it from the hooks.
 */
import { useCallback, useMemo } from 'react';
import { matchRoutes, type RouteObject } from 'react-router-dom';
import { WORKSPACE_TREES } from '@/config/navSlots';
import { PLACEHOLDER_LEAVES } from '@/config/sitemap';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { isRedirectDef, type RouteGuard } from '@/app/registry/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useAccessSnapshot } from '@/lib/permissions/useCan';
import { resolveCapability } from '@/lib/permissions/adaptor';
import { moduleGateDecision, type ModuleGateDecision, type ModuleGateGuard } from '@/shared/components/moduleGate';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings, type ModuleSettingsResolver } from '@/modules/vessels/lib/moduleSettings';
import { isVesselCodeParam, parseVesselPath } from '@/modules/vessels/lib/vesselCode';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { LEGACY_REDIRECTS, type LegacyRedirectEntry } from '@/app/router/legacyRedirects';
import { legacyEntryFor, resolveLegacyTarget, type LegacyRedirectContext } from '@/app/router/legacyResolve';
import { vesselRouteDecision } from '@/app/nav/vesselRouteGate';
import { useWorkspaceRootGate, type WorkspaceRootGate } from '@/app/nav/workspaceAccess';

/**
 * `error`: the check itself failed (the pinned vessel's module settings did
 * not load), so whether the page opens is not known; never shown as gone.
 */
export type PinAvailability = 'available' | 'unavailable' | 'waiting' | 'error';

/** What the scope step needs to know about the viewer (from `useScopeAccess` and VesselContext). */
export interface PinScopeAccess {
  /** Access has loaded; until then every pin waits. */
  ready: boolean;
  fleetReach: boolean;
  /** The selected vessel's code, else the first reachable one's (the literal `/v/:vesselCode` form opens it). */
  lastVesselCode: string | null;
  /** Input for the legacy redirect resolver. */
  legacy: LegacyRedirectContext;
  /** The id of the reachable vessel with this code (any case), else null: unknown, out of reach or sold. */
  reachableVesselId: (code: string) => string | null;
}

/** The scope step's answer: settled, or the check that still has to run. */
export type PinScopeStep =
  | { kind: 'settled'; availability: PinAvailability }
  | { kind: 'vessel'; vesselId: string; rest: string }
  | { kind: 'route'; guard: ModuleGateGuard }
  | { kind: 'workspace'; root: string };

/** What the second step reads: the pinned vessel's module settings, ModuleRoute's rule and the workspace gate. */
export interface PinChecks {
  moduleSettings: ModuleSettingsResolver;
  /** ModuleRoute's decision for a guard (`moduleGateDecision` over the viewer's access). */
  route: (guard: ModuleGateGuard) => ModuleGateDecision;
  workspace: Pick<WorkspaceRootGate, 'ready' | 'canOpen'>;
}

const settled = (availability: PinAvailability): PinScopeStep => ({ kind: 'settled', availability });
const WAITING = settled('waiting');
const AVAILABLE = settled('available');
const UNAVAILABLE = settled('unavailable');

const pathnameOf = (target: string): string => target.split(/[?#]/)[0] || '/';

/** The legacy table as routes, so an old URL is matched the way the router ranks its routes. */
const LEGACY_ROUTES: RouteObject[] = LEGACY_REDIRECTS.map((entry) => ({ path: entry.from }));

/** The legacy redirect the router would apply to this pathname, with its params; null for a URL that is not an old one. */
export function legacyEntryForPathname(
  pathname: string,
): { entry: LegacyRedirectEntry; params: Readonly<Record<string, string | undefined>> } | null {
  const matches = matchRoutes(LEGACY_ROUTES, pathname);
  const match = matches?.[matches.length - 1];
  const entry = match?.route.path ? legacyEntryFor(match.route.path) : undefined;
  return entry && match ? { entry, params: match.params } : null;
}

/** The workspace tree a pathname sits in (its root), else null. */
export function workspaceRootOf(pathname: string): string | null {
  const lower = pathname.toLowerCase();
  const tree = WORKSPACE_TREES.find((w) => {
    const root = w.path.toLowerCase();
    return lower === root || lower.startsWith(`${root}/`);
  });
  return tree?.path ?? null;
}

/** ModuleRoute's gate on a planned `/hris/…` leaf (manifestRoutes' `placeholderElement`). */
const HRIS_PLACEHOLDER_GUARD: ModuleGateGuard = { kind: 'module', moduleId: 'hris' };

/**
 * The guard on each workspace page the router mounts, by route path: the
 * registry's workspace routes (a redirect has none), then the planned leaves'
 * Coming Soon pages, as manifestRoutes.tsx builds them. Built once.
 */
const WORKSPACE_GUARDS: ReadonlyMap<string, RouteGuard | null> = (() => {
  const guards = new Map<string, RouteGuard | null>();
  for (const route of MODULE_REGISTRY.routesFor('workspace')) {
    if (!guards.has(route.fullPath)) guards.set(route.fullPath, isRedirectDef(route.def) ? null : route.def.guard);
  }
  for (const leaf of PLACEHOLDER_LEAVES) {
    const path = pathnameOf(leaf.path);
    if (guards.has(path) || !workspaceRootOf(path)) continue;
    guards.set(path, leaf.path.startsWith('/hris/') ? HRIS_PLACEHOLDER_GUARD : { kind: 'login' });
  }
  return guards;
})();

/** The workspace pages as routes, so a pin is matched the way the router ranks its routes. */
const WORKSPACE_ROUTES: RouteObject[] = Array.from(WORKSPACE_GUARDS.keys(), (path) => ({ path }));

/**
 * The ModuleRoute guard on the workspace page this pathname opens, else null
 * (a `login` or `scope` guard, a redirect, or no registered page).
 */
export function workspaceRouteGuard(pathname: string): ModuleGateGuard | null {
  const matches = matchRoutes(WORKSPACE_ROUTES, pathname);
  const path = matches?.[matches.length - 1]?.route.path;
  const guard = path ? WORKSPACE_GUARDS.get(path) : undefined;
  return guard && (guard.kind === 'module' || guard.kind === 'capability') ? guard : null;
}

const isFleetPath = (pathname: string): boolean => {
  const lower = pathname.toLowerCase();
  return lower === '/fleet' || lower.startsWith('/fleet/');
};

/** Steps 1–5 up to the checks that need a hook (module settings, a route guard, the workspace gate). */
export function resolvePinScope(target: string, access: PinScopeAccess): PinScopeStep {
  if (!access.ready) return WAITING;
  // The router matches without regard to case; so does the vessel prefix here.
  let pathname = pathnameOf(target).replace(/^\/v\//i, '/v/');

  // 1. An old URL: where it goes now for this viewer. One that renders in place opens as it always did.
  const legacy = legacyEntryForPathname(pathname);
  if (legacy) {
    const redirected = resolveLegacyTarget(legacy.entry, legacy.params, '', '', access.legacy);
    if (!redirected) return AVAILABLE;
    pathname = pathnameOf(redirected);
  }

  // 2. The Fleet scope needs fleet reach.
  if (isFleetPath(pathname)) return access.fleetReach ? AVAILABLE : UNAVAILABLE;

  // 3. The vessel scope needs a reachable vessel, then that vessel's module settings.
  const scoped = parseVesselPath(pathname);
  if (scoped) {
    let code = scoped.code;
    if (isVesselCodeParam(code)) {
      // `/v/:vesselCode/…` opens the same page on the current vessel; with no vessel there is no page.
      if (!access.lastVesselCode) return UNAVAILABLE;
      code = access.lastVesselCode;
    }
    const vesselId = access.reachableVesselId(code);
    return vesselId ? { kind: 'vessel', vesselId, rest: scoped.rest } : UNAVAILABLE;
  }

  // 4. A workspace page: its ModuleRoute guard where it has one (until the D-97 route gate), else the Apps entry.
  const root = workspaceRootOf(pathname);
  if (root) {
    const guard = workspaceRouteGuard(pathname);
    return guard ? { kind: 'route', guard } : { kind: 'workspace', root };
  }

  // 5. Anything else: the destination decides.
  return AVAILABLE;
}

/** The answer, once the pinned vessel's settings, the route guard and the workspace gate are known. */
export function finishPinAvailability(step: PinScopeStep, checks: PinChecks): PinAvailability {
  switch (step.kind) {
    case 'settled':
      return step.availability;
    case 'vessel': {
      // The vessel route gate's rule. ModuleOff is not the page; the error state is not known either way.
      const decision = vesselRouteDecision(step.rest, checks.moduleSettings);
      if (decision === 'ok') return 'available';
      if (decision === 'loading') return 'waiting';
      if (decision === 'error') return 'error';
      return 'unavailable'; // { off }
    }
    case 'route': {
      const decision = checks.route(step.guard);
      if (decision === 'loading') return 'waiting';
      return decision === 'allowed' ? 'available' : 'unavailable';
    }
    case 'workspace':
      if (!checks.workspace.ready) return 'waiting';
      return checks.workspace.canOpen(step.root) ? 'available' : 'unavailable';
  }
}

/** ModuleRoute's rule over the viewer's access, read from the same hooks the route reads. */
function useRouteGateCheck(): (guard: ModuleGateGuard) => ModuleGateDecision {
  const { canAccessModule } = useAuth();
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);
  const hr = useHrAccess();
  const payroll = usePayrollAccess();
  const medical = useMedicalAccess();
  const wellness = useWellnessAccess();
  const snapshot = useAccessSnapshot();
  return useCallback(
    (guard: ModuleGateGuard) =>
      moduleGateDecision(guard, {
        rbacInitialized,
        rbacLoading,
        canAccessModule,
        hr,
        payroll,
        medical,
        wellness,
        capability: (key) => resolveCapability(key, snapshot),
      }),
    [rbacInitialized, rbacLoading, canAccessModule, hr, payroll, medical, wellness, snapshot],
  );
}

export interface PinAvailabilityResult {
  availability: PinAvailability;
  /** Re-reads what a failed check needs (the pinned vessel's module settings); a no-op for any other pin. */
  retry: () => void;
}

const NO_RETRY = (): void => undefined;

/** Whether the pinned in-app path opens for this viewer now. Mount it only while the pin is shown. */
export function usePinAvailability(target: string): PinAvailabilityResult {
  const { ready, fleetReach, lastVesselCode, legacy } = useScopeAccess();
  const { findVesselByCode } = useVessel();
  const workspace = useWorkspaceRootGate();
  const step = useMemo(
    () =>
      resolvePinScope(target, {
        ready,
        fleetReach,
        lastVesselCode,
        legacy,
        reachableVesselId: (code) => findVesselByCode(code)?.id ?? null,
      }),
    [target, ready, fleetReach, lastVesselCode, legacy, findVesselByCode],
  );
  // The same cache entry the vessel scope's route gate reads.
  const settings = useVesselModuleSettings(step.kind === 'vessel' ? step.vesselId : null);
  const today = localIsoDate();
  const moduleSettings = useMemo(() => resolveModuleSettings(settings.state, today), [settings.state, today]);
  const route = useRouteGateCheck();
  const availability = finishPinAvailability(step, { moduleSettings, route, workspace });
  const retry = step.kind === 'vessel' ? settings.retry : NO_RETRY;
  return useMemo(() => ({ availability, retry }), [availability, retry]);
}
