/**
 * Scope layout routes (gap/00 B2, B3; gap/01 F14; DECISIONS D-02, D-13).
 *
 *   /fleet/*            FleetScope        login + fleet reach
 *   /v/:vesselCode/*    VesselScopeRoute  login + reach to that vessel
 *   /me/*, /inbox        PersonalScope     login
 *   /hris, /health, …   WorkspaceScope    login (pages keep their module gates)
 *
 * Outermost, before sign-in and every gate, each scope puts its URL prefix
 * in canonical (lower) case (D-111): the router matches without regard to
 * case, but the nav tree, breadcrumbs, tabs, favourites and the vessel route
 * gate read the path as written, so `/V/dra/crew/list` and `/FLEET/…`
 * redirect to `/v/dra/crew/list` and `/fleet/…` (query, hash and state kept).
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
  canonicalVesselPathname,
  isVesselCodeParam,
  normaliseVesselCode,
  parseVesselPath,
  vesselPath,
} from '@/modules/vessels/lib/vesselCode';
import { WORKSPACE_TREES } from '@/config/navSlots';
import { ModuleOff, PageError } from '@/shared/components/states';
import { usePageLocationOverride, type PageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { useVesselNav, type VesselNavModel } from '@/app/nav/useVesselNav';
import { cancelPendingVesselSwitch, useVesselSwitch } from '@/app/nav/useVesselSwitch';
import { moduleSettingLabel, vesselRouteDecision } from '@/app/nav/vesselRouteGate';
import { useVesselSettingsAccess, vesselSettingsHref } from '@/app/nav/vesselSettingsLink';
import { RouteErrorBoundary, RouteSuspense } from './RouteBoundary';
import { ScopeContext, useScope, type ScopeValue } from './scopeContext';
import { useScopeAccess } from './useScopeAccess';
import { legacyEntryFor, resolveLegacyTarget, targetKind, withSearch, type LegacyTargetKind } from './legacyResolve';
import {
  FullPageLoading,
  FullPageVesselListError,
  NoVesselState,
  ScopeAccessDenied,
  ScopeLoading,
  ScopePageNotFound,
  VesselArchivedState,
  VesselListError,
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

// ─── Canonical scope prefixes (D-111) ─────────────────────────────────────

/**
 * `pathname` with the first of `prefixes` it sits under (`/me`, `/me/…`;
 * matched without regard to case) written as given, the rest exactly as it
 * was; null when it is already so, or under none of them. Prefixes are
 * lower case.
 */
function canonicalPrefixPath(pathname: string, prefixes: readonly string[]): string | null {
  for (const prefix of prefixes) {
    const head = pathname.slice(0, prefix.length);
    const next = pathname.charAt(prefix.length);
    if (head.toLowerCase() !== prefix || (next !== '' && next !== '/')) continue;
    return head === prefix ? null : `${prefix}${pathname.slice(prefix.length)}`;
  }
  return null;
}

const FLEET_PREFIXES: readonly string[] = ['/fleet'];
// PersonalScope is pathless: its routes sit under these three roots.
const PERSONAL_PREFIXES: readonly string[] = ['/me', '/inbox', '/help'];
const NO_PREFIXES: readonly string[] = [];

const canonicalFleetPath = (pathname: string) => canonicalPrefixPath(pathname, FLEET_PREFIXES);
const canonicalPersonalPath = (pathname: string) => canonicalPrefixPath(pathname, PERSONAL_PREFIXES);

/**
 * Outermost in every scope layout, before sign-in and any gate (D-111): a
 * URL whose scope prefix is not in canonical form is replaced by the same
 * URL with only the prefix (and a vessel code) lower-cased, keeping the
 * rest of the path, the query, the hash and the history state. Every path
 * consumer below (header, sidebar, tabs, favourites, the vessel route gate)
 * then reads one form.
 */
const CanonicalScopePath: React.FC<{ canonical: (pathname: string) => string | null; children: React.ReactNode }> = ({
  canonical,
  children,
}) => {
  const location = useLocation();
  const target = canonical(location.pathname);
  if (target === null) return <>{children}</>;
  return <Navigate replace state={location.state} to={withSearch(target, location.search, location.hash)} />;
};

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
  <CanonicalScopePath canonical={canonicalFleetPath}>
    <ProtectedRoute>
      <FleetScopeBody />
    </ProtectedRoute>
  </CanonicalScopePath>
);

// ─── Vessel ───────────────────────────────────────────────────────────────

/**
 * Names the gate's state to the page header (spec §7); the shared states in
 * `@/shared/components/states` do not know about the shell, so the gate does.
 */
const GateLocation: React.FC<PageLocationOverride> = ({ title, crumbs }) => {
  usePageLocationOverride({ title, crumbs });
  return null;
};

/**
 * Pages of a module switched off for this vessel do not open (BUILD-PLAN S4;
 * gap/10 W4; spec §5.5): ModuleOff inside the shell, for everyone, admins
 * included (the cog and this state's button lead to Vessel Settings). Paths
 * no setting governs (the vessel home, Calendar) never wait for the settings.
 * The page exists, so ModuleOff keeps its crumbs; only the title changes.
 */
const VesselRouteGate: React.FC<{ nav: VesselNavModel; rest: string; vesselName: string; code: string }> = ({
  nav,
  rest,
  vesselName,
  code,
}) => {
  const canEnable = useVesselSettingsAccess();
  const decision = vesselRouteDecision(rest, nav.resolver);
  if (decision === 'ok') return <ScopeOutlet />;
  if (decision === 'loading') return <ScopeLoading label={`Opening ${vesselName}…`} />;
  if (decision === 'error') {
    const title = "This vessel's modules could not load";
    return (
      <>
        <GateLocation title={title} />
        <PageError title={title} error={nav.errorMessage ?? undefined} onRetry={nav.retry} headingLevel={1} treatMissingAsOff={false} />
      </>
    );
  }
  const moduleName = moduleSettingLabel(decision.off, nav.resolver.labelFor);
  return (
    <>
      <GateLocation title={`${moduleName} is switched off`} crumbs="page" />
      <ModuleOff
        moduleName={moduleName}
        vesselName={vesselName}
        canEnable={canEnable}
        settingsHref={vesselSettingsHref(code)}
        headingLevel={1}
      />
    </>
  );
};

/**
 * Opens the vessel an in-page picker selected (IA23, D-71) through the vessel
 * switch, as the top bar does: the page is kept only where it is on and
 * visible for that vessel, else its tab root, else its home, and a failed
 * settings read opens its home (D-64, gap/10 W2; spec §6.1). Mounted only
 * while the pick waits (so the scope needs no query client until a pick);
 * unmounting (the switch landed, the user moved on, or picked the URL's
 * vessel again) abandons a switch still in flight.
 */
const PickedVesselSwitch: React.FC<{ id: string; code: string }> = ({ id, code }) => {
  const switchTo = useVesselSwitch();
  // Once per pick: a new location or gate gives `switchTo` a new identity, never a second switch.
  const latest = useRef(switchTo);
  latest.current = switchTo;
  useEffect(() => {
    latest.current({ id, code });
    return () => cancelPendingVesselSwitch();
  }, [id, code]);
  return null;
};

const VesselScopeBody: React.FC = () => {
  const { vesselCode: rawCode = '' } = useParams<{ vesselCode: string }>();
  // `/v/:vesselCode/…` taken literally: a link from the static nav tree
  // (src/config/sitemap.ts), meaning the current vessel.
  const currentVesselLink = isVesselCodeParam(rawCode);
  const code = currentVesselLink ? '' : normaliseVesselCode(rawCode);
  const access = useScopeAccess();
  const {
    vessels,
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
  //   the account menu): open that vessel through the vessel switch (IA23,
  //   D-71), which keeps the page only where it is on and visible for that
  //   vessel, else its tab root, else its home (D-64, gap/10 W2), or go to
  //   the fleet dashboard when "All vessels" was picked.
  const syncedCode = useRef<string | null>(null);
  // Our own pending selection: `from` is the selection we asked to replace.
  // Once the selection moves off `from`, the request has landed.
  const pending = useRef<{ from: string | null } | null>(null);
  // The in-page pick the vessel switch is opening (PickedVesselSwitch), and
  // where the user was when it was made. A new URL vessel starts afresh.
  const requested = useRef<{ id: string; locationKey: string } | null>(null);
  useEffect(() => {
    requested.current = null;
  }, [code]);
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
      // An in-page pick: PickedVesselSwitch (in the body) opens it.
      const known = requested.current?.id === selectedVesselId;
      if (getVesselCodeById(selectedVesselId) && !known) {
        requested.current = { id: selectedVesselId, locationKey: location.key };
      } else if (!known || location.key !== requested.current?.locationKey) {
        // The pick names no vessel we can open, or the user went elsewhere
        // before the switch landed (the switch is abandoned): the URL wins,
        // so the selection goes back to its vessel. While a pick waits the
        // body is ScopeLoading, so only the shell (tabs, sidebar, top bar)
        // can have moved the user.
        requested.current = null;
        pending.current = { from: selectedVesselId };
        setSelectedVessel(vessel);
      }
    } else {
      requested.current = null;
    }
  }, [vessel, code, selectedVesselId, isAllVessels, setSelectedVessel, getVesselCodeById, navigate, location.key, access.fleetReach]);

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

  // The vessel's module settings, for the route gate (the shell reads the same cache).
  const navTarget = useMemo(() => (vessel ? { id: vessel.id, code, name: vessel.name } : null), [vessel, code]);
  const nav = useVesselNav(navTarget);

  let body: React.ReactNode;
  if (!access.ready) {
    body = <ScopeLoading />;
  } else if (currentVesselLink) {
    // The selected vessel, else the first reachable one; same page, same query.
    // A parse miss (never expected: the router and the parser both ignore the
    // prefix's case, D-111) waits rather than opening the vessel home.
    const parsed = parseVesselPath(location.pathname);
    body = !parsed ? (
      <ScopeLoading />
    ) : access.lastVesselCode ? (
      <Navigate
        to={withSearch(vesselPath(access.lastVesselCode, parsed.rest), location.search, location.hash)}
        replace
        state={location.state}
      />
    ) : access.vesselsError ? (
      // No vessel because the list failed, not because none is assigned.
      <VesselListError error={access.vesselsError.message} onRetry={access.retryVessels} />
    ) : (
      <NoVesselState homePath={access.homePath} />
    );
  } else if (!vessel) {
    if (access.vesselsError) {
      // A code missing from a list that failed to load (or to refresh) is
      // not known to be wrong: an error with Retry, never "not found", "no
      // access" or "archived" (D-04, gap/10 A.12). A retry that lands finds
      // the vessel, and the effects above select it.
      body = <VesselListError error={access.vesselsError.message} onRetry={access.retryVessels} />;
    } else if (unreachable && unreachable.status === 'Sold') {
      body = <VesselArchivedState name={unreachable.name} homePath={access.homePath} />;
    } else if (unreachable) {
      body = <ScopeAccessDenied homePath={access.homePath} />;
    } else {
      body = <VesselNotFound code={code} homePath={access.homePath} />;
    }
  } else if (selectedVesselId !== vessel.id) {
    // One render while VesselContext catches up with the URL, so a page never
    // runs its queries against the previous vessel; or, after an in-page pick
    // (the selection moved while the URL did not), until the vessel switch
    // opens the picked vessel, named here.
    const pickedId = syncedCode.current === code && !pending.current ? selectedVesselId : null;
    const pickedCode = pickedId ? getVesselCodeById(pickedId) : null;
    const picked = pickedId ? vessels.find((v) => v.id === pickedId) : undefined;
    body = (
      <>
        {pickedId && pickedCode && <PickedVesselSwitch id={pickedId} code={pickedCode} />}
        <ScopeLoading label={`Opening ${(picked ?? vessel).name}…`} />
      </>
    );
  } else {
    // Fail closed (D-04, D-111): a parse miss keeps the loading state. The
    // gate reads '' as the always-open vessel home, so it never gets one.
    const parsed = parseVesselPath(location.pathname);
    body = parsed ? (
      <VesselRouteGate nav={nav} rest={parsed.rest} vesselName={vessel.name} code={code} />
    ) : (
      <ScopeLoading label={`Opening ${vessel.name}…`} />
    );
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
 * sold vessel renders "archived", all inside the shell. While the vessel
 * list has failed to load, a code it does not hold renders the load error
 * with Retry instead, since none of those is known then (D-04, gap/10 A.12).
 *
 * The literal param (`/v/:vesselCode/crew/list`, the form the static nav tree
 * links to) opens the same page on the current vessel: the selected one, else
 * the first reachable one. With no vessel at all it says so, or, when the
 * list failed to load, shows that error with Retry.
 */
export const VesselScopeRoute: React.FC = () => (
  <CanonicalScopePath canonical={canonicalVesselPathname}>
    <ProtectedRoute>
      <VesselScopeBody />
    </ProtectedRoute>
  </CanonicalScopePath>
);

// ─── Personal and workspaces ──────────────────────────────────────────────

/**
 * `/me/*` and `/inbox`: the user's own area (spec §8). The shell (scope
 * `personal`, with the personal sidebar) is rendered once around every child
 * route, so moving between the profile, the settings sections, hours of
 * rest, training and the inbox never remounts it. Each section has its own
 * URL (`/me/security`); the old `?tab=` form redirects (personalRoutes.tsx).
 */
export const PersonalScope: React.FC = () => (
  <CanonicalScopePath canonical={canonicalPersonalPath}>
    <ProtectedRoute>
      <ScopeContext.Provider value={PERSONAL_SCOPE}>
        <ScopeShell />
      </ScopeContext.Provider>
    </ProtectedRoute>
  </CanonicalScopePath>
);

/**
 * A STORM workspace (HRIS, Health & Wellness, Yard, Legal) under its existing
 * URL prefix (D-09). Pages keep their own module gates and shells; only the
 * DashboardLayout moves up here, so it is not remounted between pages.
 */
export const WorkspaceScope: React.FC<{ workspace: string }> = ({ workspace }) => {
  const value = useMemo<ScopeValue>(() => ({ scope: 'workspace', workspace }), [workspace]);
  // The workspace's tree root (`/hris`, `/departments/legal`). Its other
  // routes (old URLs that redirect in) are left as they are.
  const canonical = useMemo(() => {
    const root = WORKSPACE_TREES.find((w) => w.id === workspace)?.path;
    const prefixes = root ? [root] : NO_PREFIXES;
    return (pathname: string) => canonicalPrefixPath(pathname, prefixes);
  }, [workspace]);
  return (
    <CanonicalScopePath canonical={canonical}>
      <ProtectedRoute>
        <ScopeContext.Provider value={value}>
          <ScopeShell />
        </ScopeContext.Provider>
      </ProtectedRoute>
    </CanonicalScopePath>
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
  // Without fleet reach, home depends on the list: wait here with Retry
  // rather than land a vessel user on `/me` (D-04). No navigation, so a
  // retry that lands redirects from here.
  if (access.vesselsError && !access.fleetReach && !access.lastVesselCode) {
    return <FullPageVesselListError error={access.vesselsError.message} onRetry={access.retryVessels} />;
  }
  return <Navigate to={withSearch(access.homePath, location.search, location.hash)} replace />;
};

/**
 * `/`, `/index` and `/dashboard`: send the user to their home (gap/01
 * landing rules). Fleet users land on `/fleet/dashboard`, vessel users on
 * `/v/<code>` (selected vessel, else the first), anyone with no vessel on `/me`.
 * A failed vessel-list load is not "no vessel": without fleet reach (which
 * comes from the role, not the list) the user stays here on the error with
 * Retry, never on `/me` (D-04, gap/10 A.12).
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
 * A vessel target missed because the vessel list failed to load is not that
 * case: the load error with Retry renders instead (D-04).
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
  // Only a vessel target hangs on the list; a fleet target missed for want
  // of reach renders the old page as before.
  if (!target && needsAccess && kind === 'vessel' && access.vesselsError) {
    return <FullPageVesselListError error={access.vesselsError.message} onRetry={access.retryVessels} />;
  }
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
