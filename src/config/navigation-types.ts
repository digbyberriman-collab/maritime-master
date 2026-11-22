import type { LucideIcon } from 'lucide-react';

export type NavPermissionLevel = 'view' | 'edit' | 'admin';

/**
 * Where a leaf is in its life (gap/00 W3, gap/10 W3, DECISIONS D-06).
 *
 * - `planned`: no real page yet. The route renders a placeholder so a
 *   bookmark still resolves, but the sidebar hides the leaf unless an owner
 *   or admin has "Show roadmap" on.
 * - `beta`: a real page shown with a "Beta" chip.
 * - `live`: a real page.
 */
export type NavStatus = 'planned' | 'beta' | 'live';

/** The URL scope a node belongs to (gap/00 IA table C). */
export type NavScope = 'fleet' | 'vessel' | 'workspace' | 'personal';

/**
 * - `leaf`: a link (the default when there are no children).
 * - `group`: a collapsible folder (the default when there are children).
 * - `section`: a non-interactive eyebrow heading. Its children are always
 *   shown beneath it, at the heading's own depth (gap/10 IA6).
 */
export type NavKind = 'leaf' | 'group' | 'section';

export interface NavChild {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  children?: NavChild[];
  /** Defaults to `group` with children, `leaf` without. */
  kind?: NavKind;
  /**
   * Lifecycle of a leaf. The sitemap sets it on every leaf: `live` for a leaf
   * that reaches a real page, `planned` for one that renders Coming Soon.
   * Groups and sections take their visibility from their children.
   */
  status?: NavStatus;
  /** URL scope of the page. The sitemap sets it per top-level module. */
  scope?: NavScope;
  /**
   * PMS capability key (`domain.module.subcategory.action`). When set, the
   * sidebar shows the node only if the user holds it (fail closed: hidden
   * while access is loading and for an unknown key).
   */
  capability?: string;
  /**
   * Add-on entitlement key (gap/03 add-ons, DECISIONS G4). A node whose
   * entitlement the vessel lacks stays visible with a lock and opens the
   * add-on explanation, never the page (nav visibility rule, step 6). With no
   * entitlement source yet (Phase 1), every such node is locked.
   */
  entitlement?: string;
  /** Key into the sidebar badge registry (count of items waiting). */
  badgeKey?: string;
  /**
   * `vessel_module_settings.module_key` that switches this node on or off
   * for a vessel (gap/10 IA9). Read by the nav once that table is live;
   * until then every module counts as on (DECISIONS D-01).
   */
  moduleSetting?: string;
  /**
   * RBAC module key that gates this leaf/group (e.g. `hr`). When set, the
   * sidebar hides the entry unless the user holds `minPermission` (default
   * `view`) on that module. Module-level access is still checked separately
   * by `canAccessModule`.
   */
  moduleKey?: string;
  minPermission?: NavPermissionLevel;
  /**
   * Marks a leaf a self-service user may still open, showing only their own
   * record. Used by the Health section, where crew keep "My training" and
   * their own medical record but see none of the company-wide pages.
   */
  selfServe?: boolean;
  /**
   * Marks a leaf that points at a page owned by another module. Cross-links
   * are ignored when resolving which module a URL belongs to, so a reload on
   * `/crew/leave` lands in HRIS even though Vessel also links to it.
   */
  crossLink?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  permissions: string[];
  children?: NavChild[];
  defaultOpen?: boolean;
  /** URL scope of the module's pages. */
  scope?: NavScope;
}

/**
 * One module of the Vessel view: a tab in the vessel tab row and, when it has
 * children, the sidebar under that tab (gap/10 "Vessel view", BUILD-PLAN B7).
 *
 * Paths are relative to the vessel root `/v/:vesselCode`: `''` is the vessel
 * home, `'crew'` the Crew root, `'crew/list'` a page. A child path that starts
 * with `/` is absolute: a cross-link into a workspace (Finance → HRIS payroll).
 * `buildVesselNav()` resolves the paths for one vessel.
 */
export interface VesselModule {
  /** Stable id (`crew`, `safety`, …). Never shown. */
  id: string;
  /** Default label. A vessel may rename it through `moduleSetting` (Charter → "Trip"). */
  label: string;
  icon: LucideIcon;
  /** The tab's target, relative to `/v/:vesselCode`. */
  root: string;
  /** The module's sidebar, paths relative to `/v/:vesselCode`. Empty: no sidebar. */
  children: NavChild[];
  /** `vessel_module_settings.module_key` that switches the module off. None: always on. */
  moduleSetting?: string;
  /** `planned` keeps the whole tab hidden unless "Show roadmap" (G1, G5, D-06). */
  status: NavStatus;
  /** PMS capability key the tab needs (fails closed: hidden while loading and for an unknown key). */
  capability?: string;
  /** Add-on entitlement key: without it the tab shows a lock and explains the add-on (G4). */
  entitlement?: string;
  /** Badge registry key shown on the tab. */
  badgeKey?: string;
}

/** A `VesselModule` resolved for one vessel: absolute `path`, absolute child paths. */
export interface VesselModuleNav extends Omit<VesselModule, 'children'> {
  /** Absolute path of the tab (`/v/dra/crew`, or `/v/:vesselCode/crew` for the pattern). */
  path: string;
  children: NavChild[];
}
