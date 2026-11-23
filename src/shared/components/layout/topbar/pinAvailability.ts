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
 *    unavailable when they failed or a module on the way is off.
 * 4. A workspace (`/hris`, `/health`, `/yard`, `/departments/legal`,
 *    `/shoreside` and below): the workspace's Apps entry decides
 *    (`useWorkspaceRootGate`, D-97); waiting until it is ready.
 * 5. Anything else (`/me`, `/inbox`, `/help`, …): available; the destination
 *    decides.
 *
 * While access loads (`useScopeAccess().ready` false) every pin is waiting.
 * The resolver is pure (`resolvePinScope`, then `finishPinAvailability`), so
 * each rule is unit-tested; `usePinAvailability` feeds it from the hooks.
 */
import { useMemo } from 'react';
import { matchRoutes, type RouteObject } from 'react-router-dom';
import { WORKSPACE_TREES } from '@/config/navSlots';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings, type ModuleSettingsResolver } from '@/modules/vessels/lib/moduleSettings';
import { isVesselCodeParam, parseVesselPath } from '@/modules/vessels/lib/vesselCode';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { LEGACY_REDIRECTS, type LegacyRedirectEntry } from '@/app/router/legacyRedirects';
import { legacyEntryFor, resolveLegacyTarget, type LegacyRedirectContext } from '@/app/router/legacyResolve';
import { vesselRouteDecision } from '@/app/nav/vesselRouteGate';
import { useWorkspaceRootGate, type WorkspaceRootGate } from '@/app/nav/workspaceAccess';

export type PinAvailability = 'available' | 'unavailable' | 'waiting';

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
  | { kind: 'workspace'; root: string };

/** What the second step reads: the pinned vessel's module settings and the workspace gate. */
export interface PinChecks {
  moduleSettings: ModuleSettingsResolver;
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

const isFleetPath = (pathname: string): boolean => {
  const lower = pathname.toLowerCase();
  return lower === '/fleet' || lower.startsWith('/fleet/');
};

/** Steps 1–5 up to the checks that need a hook (module settings, the workspace gate). */
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

  // 4. A workspace opens when its Apps entry does.
  const root = workspaceRootOf(pathname);
  if (root) return { kind: 'workspace', root };

  // 5. Anything else: the destination decides.
  return AVAILABLE;
}

/** The answer, once the pinned vessel's settings and the workspace gate are known. */
export function finishPinAvailability(step: PinScopeStep, checks: PinChecks): PinAvailability {
  switch (step.kind) {
    case 'settled':
      return step.availability;
    case 'vessel': {
      // The vessel route gate's rule: ModuleOff and the error state are not the page.
      const decision = vesselRouteDecision(step.rest, checks.moduleSettings);
      if (decision === 'ok') return 'available';
      return decision === 'loading' ? 'waiting' : 'unavailable';
    }
    case 'workspace':
      if (!checks.workspace.ready) return 'waiting';
      return checks.workspace.canOpen(step.root) ? 'available' : 'unavailable';
  }
}

/** Whether the pinned in-app path opens for this viewer now. Mount it only while the pin is shown. */
export function usePinAvailability(target: string): PinAvailability {
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
  const { state } = useVesselModuleSettings(step.kind === 'vessel' ? step.vesselId : null);
  const today = localIsoDate();
  const moduleSettings = useMemo(() => resolveModuleSettings(state, today), [state, today]);
  return finishPinAvailability(step, { moduleSettings, workspace });
}
