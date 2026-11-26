/**
 * Module manifest types (gap/00 A2, §4 "Manifest"; BUILD-PLAN B8).
 *
 * Every module registers itself with one `src/modules/<module>/module.ts`
 * whose default export is a `ModuleManifest`. The registry
 * (./modules.ts) collects them with `import.meta.glob`, and from it:
 *
 * - the router mounts each module's routes under their scope
 *   (src/app/router/manifestRoutes.tsx);
 * - the site map merges each module's nav fragments into its slots
 *   (src/config/sitemap.ts, src/config/navSlots.ts);
 * - the registry tests check the invariants (src/test/config/registry.test.tsxx).
 *
 * Manifests are loaded eagerly, so they hold data only: no JSX, no page or
 * shell imports, no heavy libraries. A page is a `() => import('./pages/X')`
 * loader, fetched when the route is first opened.
 */
import type { ComponentType } from 'react';
import type { NavChild } from '@/config/navigation-types';
import type { NavSlotId } from '@/config/navSlots';
import type { CapabilityKey } from '@/lib/permissions/types';
import type { RecordKindDefinition } from '@/lib/records/registry';

/**
 * Where a route mounts (gap/00 IA table C).
 *
 * - `fleet`, `vessel`, `personal`: inside the scope's layout route
 *   (`FleetScope` at `/fleet`, `VesselScopeRoute` at `/v/:vesselCode`,
 *   `PersonalScope` at `/me`). The path is **relative** to that root
 *   (`crew/list`), so a vessel page never hard-codes a vessel code.
 * - `workspace`: inside `WorkspaceScope` for the route's `workspace`, at an
 *   **absolute** path under the workspace's own prefix (D-09).
 */
export type RouteScope = 'fleet' | 'vessel' | 'personal' | 'workspace';

export type AccessLevel = 'view' | 'edit' | 'admin';

/** What a lazily loaded page module resolves to. */
export type ManifestPageLoader = () => Promise<{ default: ComponentType<object> }>;

/**
 * The access check on a page route. Required on every page route (gap/00
 * B8): there is no unguarded page.
 *
 * - `login`: signed in (`ProtectedRoute`).
 * - `scope`: the scope layout's own check is the guard: fleet reach for
 *   `/fleet`, reach to the vessel for `/v/:vesselCode`, login for `/me` and
 *   the workspaces. Use it only where that check is enough.
 * - `module`: `ModuleRoute` with the navigation module and its level gates
 *   (the interim per-domain props, gap/00 C1), optionally with a capability.
 * - `capability`: `ModuleRoute` with a PMS capability key only (`useCan`,
 *   fails closed). The generic guard for new pages (D-04).
 */
export type RouteGuard =
  | { kind: 'login' }
  | { kind: 'scope' }
  | {
      kind: 'module';
      moduleId: string;
      hrLevel?: AccessLevel;
      payrollLevel?: AccessLevel;
      medicalLevel?: AccessLevel;
      wellnessLevel?: AccessLevel;
      capability?: CapabilityKey;
    }
  | { kind: 'capability'; capability: CapabilityKey };

export type RouteGuardKind = RouteGuard['kind'];

/**
 * The shell a page renders inside, for pages that do not render one
 * themselves. Inside a scope the shell is already mounted and
 * `DashboardLayout` passes through (ShellContext, D-13). Workspace shells
 * are platform-registered (src/app/router/manifestRoutes.tsx).
 */
export type RouteLayout = 'dashboard' | 'refit-shell' | 'new-build-shell';

interface RouteDefBase {
  scope: RouteScope;
  /** The `WorkspaceScope` the route mounts under. Required for, and only for, scope `workspace`. */
  workspace?: string;
  /** Absolute for `workspace`; relative to the scope root otherwise (no leading `/`). */
  path: string;
}

/** A route that renders a page. */
export interface PageRouteDef extends RouteDefBase {
  page: ManifestPageLoader;
  guard: RouteGuard;
  layout?: RouteLayout;
  /** Names the page in the error fallback. */
  label?: string;
  redirectTo?: never;
}

/** A route that redirects. `redirectTo` is absolute, or relative to the route. */
export interface RedirectRouteDef extends RouteDefBase {
  redirectTo: string;
  page?: never;
  guard?: never;
  layout?: never;
}

export type RouteDef = PageRouteDef | RedirectRouteDef;

export const isRedirectDef = (def: RouteDef): def is RedirectRouteDef =>
  typeof (def as RedirectRouteDef).redirectTo === 'string';

/** A node a module adds to a nav slot (src/config/navSlots.ts). */
export interface NavFragment {
  slot: NavSlotId;
  /** Position in the slot; lower first. The platform's own nodes sit at 10, 20, 30, … */
  order: number;
  node: NavChild;
}

/** The alert fields a deep link is built from (gap/00 G5). */
export interface AlertLike {
  related_entity_type: string | null;
  related_entity_id: string | null;
  vessel_id?: string | null;
  source_module?: string | null;
}

/**
 * Where a notification about one entity type opens (gap/00 G5; replaces the
 * two hand-kept deep-link maps). `scoped` builds a path inside the alert's
 * vessel (`scoped('safety/permits/…')` → `/v/dra/safety/permits/…`).
 */
export interface AlertRoute {
  entityType: string;
  to: (alert: AlertLike, scoped: (rel: string) => string) => string;
}

/** The scope a badge count is asked for. */
export interface BadgeContext {
  companyId: string | null;
  vesselId: string | null;
}

/**
 * A sidebar badge count (gap/00 G6, gap/10 IA21). Nav nodes name it by
 * `badgeKey`. `count` should import its query lazily so the manifest stays
 * light: `count: async (ctx) => (await import('./lib/badges')).countOpen(ctx)`.
 */
export interface BadgeProvider {
  key: string;
  count: (ctx: BadgeContext) => Promise<number>;
}

/**
 * A record kind the module owns (gap/08 REG1, DECISIONS G7): the full
 * definition, registered with the record-kind registry in src/lib/records.
 */
export type RecordKindRef = RecordKindDefinition;

/**
 * Whether a notification type the module owns has a live emitter yet
 * (D-238). `deferred` types show "Not available yet" in place of a switch;
 * `live` ones are real in-app switches. Both are engine types: in-app only,
 * no email subscription (D-249).
 */
export type NotificationTypeStatus = 'deferred' | 'live';

/**
 * A notification type the module owns (platform-prep PP4). The row itself
 * is seeded by a platform migration (20261124030100 for Phase 3 wave 1);
 * the module declares whether its emitter exists, naming it. A stream
 * flips `status` to `live` in the slice that lands the emitter, and that
 * slice's SQL test proves the emitter sends the key (D-238).
 */
export interface ManifestNotificationType {
  /** The `notification_types.key`, snake_case. */
  key: string;
  status: NotificationTypeStatus;
  /** The SQL function or trigger that sends it (today, or once it is built). */
  emitter: string;
}

export interface ModuleManifest {
  /** The module folder name (`src/modules/<id>/module.ts`). */
  id: string;
  label: string;
  /** Every scope the module's routes mount in. */
  scopes: readonly RouteScope[];
  routes?: readonly RouteDef[];
  nav?: readonly NavFragment[];
  alertRoutes?: readonly AlertRoute[];
  badges?: readonly BadgeProvider[];
  recordKinds?: readonly RecordKindRef[];
  /** PMS keys the module's pages and actions use (gap/00 W6 "proposed"). */
  capabilities?: readonly CapabilityKey[];
  /** Notification types the module sends, live or deferred (D-238; keys unique across manifests). */
  notificationTypes?: readonly ManifestNotificationType[];
}
