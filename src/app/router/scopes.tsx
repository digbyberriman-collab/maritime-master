/**
 * Scope layout routes (gap/00 B2, B3; gap/01 F14; DECISIONS D-02, D-13).
 *
 *   /fleet/*            FleetScope        login + fleet reach
 *   /v/:vesselCode/*    VesselScopeRoute  login + reach to that vessel
 *   /me/*               PersonalScope     login
 *   /hris, /health, …   WorkspaceScope    login (pages keep their module gates)
 *
 * Each renders the shell (DashboardLayout) once around an <Outlet/>. Pages
 * that still wrap themselves in DashboardLayout get the idempotent version
 * (ShellContext), so they are mounted here unchanged and moving between two
 * pages of one scope never remounts the shell.
 *
 * Also here: the landing redirect for `/` and `/dashboard` (gap/01 landing
 * rules), `LegacyRoute` (old URL → scoped URL, ./legacyRedirects.ts), and the
 * `useScopedPath()` link builder.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import {
  isVesselCodeParam,
  normaliseVesselCode,
  parseVesselPath,
  switchVesselInPath,
  vesselPath,
} from '@/modules/vessels/lib/vesselCode';
import { RouteErrorBoundary, RouteSuspense } from './RouteBoundary';
import { ScopeContext, useScope, type ScopeValue } from './scopeContext';
import { useScopeAccess } from './useScopeAccess';
import { legacyEntryFor, resolveLegacyTarget, targetKind, withSearch, type LegacyTargetKind } from './legacyResolve';
import {
  FullPageLoading,
  NoVesselState,
  ScopeAccessDenied,
  ScopeLoading,
  ScopePageNotFound,
  VesselArchivedState,
  VesselNotFound,
} from './ScopeStates';

const FLEET_SCOPE: ScopeValue = { scope: 'fleet' };
const PERSONAL_SCOPE: ScopeValue = { scope: 'personal' };

/**
 * The matched child route, with the shared error boundary and fallback. Pages
 * made with lazyPage() carry their own; this covers any that are not, so a
 * page that throws never takes the shell down with it.
 */
const ScopeOutlet: React.FC = () => (
  <RouteErrorBoundary>
    <RouteSuspense>
      <Outlet />
    </RouteSuspense>
  </RouteErrorBoundary>
);

/** The shell once, around the matched child route. */
export const ScopeShell: React.FC = () => (
  <DashboardLayout>
    <ScopeOutlet />
  </DashboardLayout>
);

// ─── Fleet ────────────────────────────────────────────────────────────────

const FleetScopeBody: React.FC = () => {
  const access = useScopeAccess();
  const { isAllVessels, canAccessAllVessels, setAllVessels } = useVessel();

  // The Fleet view is oversight across every reachable vessel (gap/10
  // principle 1). Opening a vessel page selected that one vessel (see
  // VesselScopeBody), and the legacy fleet pages read the selection, so on
  // entering the Fleet scope go back to "All vessels". Once per entry: the
  // scope stays mounted across fleet pages, so a single vessel picked while
  // here (the account menu) is left alone.
  // Fleet-reach users without the legacy dpa / shore_management role cannot
  // enter All-vessels mode (setAllVessels is guarded and VesselContext loads
  // only their assigned vessels); they keep their selection until vessel
  // memberships land (BUILD-PLAN P2 `account_memberships`, D-26).
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current || !access.ready) return;
    entered.current = true;
    if (access.fleetReach && canAccessAllVessels && !isAllVessels) setAllVessels();
  }, [access.ready, access.fleetReach, canAccessAllVessels, isAllVessels, setAllVessels]);

  let body: React.ReactNode;
  if (!access.ready) {
    body = <ScopeLoading />;
  } else if (!access.fleetReach) {
    body = (
      <ScopeAccessDenied
        title="The Fleet view is not available to you"
        detail="Your account works with the vessels assigned to you. Ask your account admin if you need fleet-wide access."
        homePath={access.homePath}
      />
    );
  } else {
    body = <ScopeOutlet />;
  }
  return (
    <ScopeContext.Provider value={FLEET_SCOPE}>
      <DashboardLayout>{body}</DashboardLayout>
    </ScopeContext.Provider>
  );
};

/** `/fleet/*`: oversight across every vessel the user can reach. */
export const FleetScope: React.FC = () => (
  <ProtectedRoute>
    <FleetScopeBody />
  </ProtectedRoute>
);

// ─── Vessel ───────────────────────────────────────────────────────────────

const VesselScopeBody: React.FC = () => {
  const { vesselCode: rawCode = '' } = useParams<{ vesselCode: string }>();
  // `/v/:vesselCode/…` taken literally: a link from the static nav tree
  // (src/config/sitemap.ts), meaning the current vessel.
  const currentVesselLink = isVesselCodeParam(rawCode);
  const code = currentVesselLink ? '' : normaliseVesselCode(rawCode);
  const access = useScopeAccess();
  const {
    selectedVesselId,
    isAllVessels,
    setSelectedVessel,
    findVesselByCode,
    getVesselCodeById,
    companyVessels,
    vesselCodes,
  } = useVessel();
  const setCurrentVessel = usePermissionsStore((s) => s.setCurrentVessel);
  const navigate = useNavigate();
  const location = useLocation();

  const vessel = access.ready ? findVesselByCode(code) : undefined;
  const unreachable = useMemo(
    () => (access.ready && !vessel ? companyVessels.find((v) => vesselCodes.get(v.id) === code) : undefined),
    [access.ready, vessel, companyVessels, vesselCodes, code],
  );

  // The URL is the source of truth for the vessel (gap/01). Two directions:
  // - the URL changed: select its vessel in VesselContext, so the legacy
  //   pages that read the selection show this vessel;
  // - the selection changed while the URL did not (an in-page vessel picker,
  //   the account menu): move to the same page on that vessel (IA23), or to
  //   the fleet dashboard when "All vessels" was picked.
  const syncedCode = useRef<string | null>(null);
  // Our own pending selection: `from` is the selection we asked to replace.
  // Once the selection moves off `from`, the request has landed.
  const pending = useRef<{ from: string | null } | null>(null);
  useEffect(() => {
    if (!vessel) return;
    if (pending.current && selectedVesselId !== pending.current.from) pending.current = null;
    if (syncedCode.current !== code) {
      syncedCode.current = code;
      if (selectedVesselId !== vessel.id) {
        pending.current = { from: selectedVesselId };
        setSelectedVessel(vessel);
      }
      return;
    }
    // Still waiting for our own selection to land.
    if (pending.current) return;
    if (isAllVessels) {
      if (access.fleetReach) navigate('/fleet/dashboard');
      return;
    }
    if (selectedVesselId && selectedVesselId !== vessel.id) {
      const next = getVesselCodeById(selectedVesselId);
      if (next) navigate(switchVesselInPath(`${location.pathname}${location.search}${location.hash}`, next));
    }
  }, [
    vessel,
    code,
    selectedVesselId,
    isAllVessels,
    setSelectedVessel,
    getVesselCodeById,
    navigate,
    location.pathname,
    location.search,
    location.hash,
    access.fleetReach,
  ]);

  // Client permissions follow the vessel in scope (gap/00 C4).
  const vesselId = vessel?.id ?? null;
  useEffect(() => {
    setCurrentVessel?.(vesselId);
  }, [vesselId, setCurrentVessel]);
  useEffect(() => () => setCurrentVessel?.(null), [setCurrentVessel]);

  const scopeValue = useMemo<ScopeValue>(
    () => ({ scope: 'vessel', vessel, vesselCode: vessel ? code : undefined }),
    [vessel, code],
  );

  let body: React.ReactNode;
  if (!access.ready) {
    body = <ScopeLoading />;
  } else if (currentVesselLink) {
    // The selected vessel, else the first reachable one; same page, same query.
    const rest = parseVesselPath(location.pathname)?.rest ?? '';
    body = access.lastVesselCode ? (
      <Navigate
        to={withSearch(vesselPath(access.lastVesselCode, rest), location.search, location.hash)}
        replace
        state={location.state}
      />
    ) : (
      <NoVesselState homePath={access.homePath} />
    );
  } else if (!vessel) {
    if (unreachable && unreachable.status === 'Sold') {
      body = <VesselArchivedState name={unreachable.name} homePath={access.homePath} />;
    } else if (unreachable) {
      body = <ScopeAccessDenied homePath={access.homePath} />;
    } else {
      body = <VesselNotFound code={code} homePath={access.homePath} />;
    }
  } else if (selectedVesselId !== vessel.id) {
    // One render while VesselContext catches up with the URL, so a page never
    // runs its queries against the previous vessel.
    body = <ScopeLoading label={`Opening ${vessel.name}…`} />;
  } else {
    body = <ScopeOutlet />;
  }

  return (
    <ScopeContext.Provider value={scopeValue}>
      <DashboardLayout>{body}</DashboardLayout>
    </ScopeContext.Provider>
  );
};

/**
 * `/v/:vesselCode/*`: one vessel. The code is matched without regard to case
 * against the vessels the user can reach (VesselContext). An unknown code
 * renders a 404, a vessel outside the user's reach renders "no access", and a
 * sold vessel renders "archived", all inside the shell.
 *
 * The literal param (`/v/:vesselCode/crew/list`, the form the static nav tree
 * links to) opens the same page on the current vessel: the selected one, else
 * the first reachable one. With no vessel at all it says so.
 */
export const VesselScopeRoute: React.FC = () => (
  <ProtectedRoute>
    <VesselScopeBody />
  </ProtectedRoute>
);

// ─── Personal and workspaces ──────────────────────────────────────────────

/**
 * `/me/*`: the user's own area. No shell of its own: `/me` itself (profile
 * and settings) brings its own chrome, and child routes that want the shell
 * sit under a `ScopeShell` route.
 */
export const PersonalScope: React.FC = () => (
  <ProtectedRoute>
    <ScopeContext.Provider value={PERSONAL_SCOPE}>
      <Outlet />
    </ScopeContext.Provider>
  </ProtectedRoute>
);

/**
 * A STORM workspace (HRIS, Health & Wellness, Yard, Legal) under its existing
 * URL prefix (D-09). Pages keep their own module gates and shells; only the
 * DashboardLayout moves up here, so it is not remounted between pages.
 */
export const WorkspaceScope: React.FC<{ workspace: string }> = ({ workspace }) => {
  const value = useMemo<ScopeValue>(() => ({ scope: 'workspace', workspace }), [workspace]);
  return (
    <ProtectedRoute>
      <ScopeContext.Provider value={value}>
        <ScopeShell />
      </ScopeContext.Provider>
    </ProtectedRoute>
  );
};

/** Inside a scope: a path no page answers. */
export const ScopeNotFound: React.FC = () => {
  const access = useScopeAccess();
  return <ScopePageNotFound homePath={access.homePath} />;
};

// ─── Landing and legacy URLs ──────────────────────────────────────────────

const HomeRedirectBody: React.FC = () => {
  const access = useScopeAccess();
  const location = useLocation();
  if (!access.ready) return <FullPageLoading />;
  return <Navigate to={withSearch(access.homePath, location.search, location.hash)} replace />;
};

/**
 * `/`, `/index` and `/dashboard`: send the user to their home (gap/01
 * landing rules). Fleet users land on `/fleet/dashboard`, vessel users on
 * `/v/<code>` (selected vessel, else the first), anyone with no vessel on `/me`.
 */
export const HomeRedirect: React.FC = () => (
  <ProtectedRoute>
    <HomeRedirectBody />
  </ProtectedRoute>
);

const SCOPE_KINDS: ReadonlySet<LegacyTargetKind> = new Set<LegacyTargetKind>(['vessel', 'fleet', 'personal']);

/** The query string without its `module` parameter. */
function withoutModuleParam(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (!params.has('module')) return search;
  params.delete('module');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/**
 * An old route that now redirects into a scope (B6). `from` is the route's
 * own pattern; the target comes from `LEGACY_REDIRECTS`. When there is no
 * target for this user (no vessel to scope to, no fleet reach, or a fleet user
 * in "All vessels" mode for a vessel page), the old page renders where it is.
 */
export const LegacyRoute: React.FC<{ from: string; children: React.ReactNode }> = ({ from, children }) => {
  const entry = legacyEntryFor(from);
  const params = useParams();
  const location = useLocation();
  const access = useScopeAccess();

  if (!entry) {
    if (import.meta.env.DEV) console.warn(`LegacyRoute: no legacy redirect for ${from}`);
    return <>{children}</>;
  }
  // Signed out: the old page's own guard sends the user to sign in.
  if (access.signedOut) return <>{children}</>;

  const needsAccess = Boolean(entry.fleetTo) || targetKind(entry.to) !== 'personal';
  if (needsAccess && !access.ready) return <FullPageLoading />;

  // The Fleet, vessel and personal scopes pick their sidebar from the path,
  // so a workspace's `?module=` (an HRIS leaf linking an old crew URL) is not
  // carried into them: it would show that workspace's sidebar there (B7, D-09).
  const kind = targetKind(entry.fleetTo && access.legacy.fleetReach ? entry.fleetTo : entry.to);
  const search = SCOPE_KINDS.has(kind) ? withoutModuleParam(location.search) : location.search;
  const target = resolveLegacyTarget(entry, params, search, location.hash, access.legacy);
  if (!target) return <>{children}</>;
  return <Navigate to={target} replace state={location.state} />;
};

// ─── Link builders ────────────────────────────────────────────────────────

/**
 * Builds links into the vessel scope, so a page never hard-codes a vessel
 * code (gap/00 B4): `const scoped = useScopedPath(); scoped('crew/list')` →
 * `/v/dra/crew/list`. Inside the vessel scope it uses the URL's vessel;
 * elsewhere the selected vessel, else the first reachable one. With no
 * vessel at all it returns `/`, which lands the user on their home.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with the scopes it reads
export function useScopedPath(): (rel?: string) => string {
  const scope = useScope();
  const { selectedVesselId, vessels, getVesselCodeById } = useVessel();
  const code =
    (scope.scope === 'vessel' ? scope.vesselCode : undefined) ??
    getVesselCodeById(selectedVesselId) ??
    (vessels[0] ? getVesselCodeById(vessels[0].id) : null);
  return useCallback((rel = '') => (code ? vesselPath(code, rel) : '/'), [code]);
}

/** The vessel the vessel scope is showing, or null outside it. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with the scopes it reads
export function useVesselScope(): { vessel: NonNullable<ScopeValue['vessel']>; code: string } | null {
  const scope = useScope();
  return scope.scope === 'vessel' && scope.vessel && scope.vesselCode
    ? { vessel: scope.vessel, code: scope.vesselCode }
    : null;
}
