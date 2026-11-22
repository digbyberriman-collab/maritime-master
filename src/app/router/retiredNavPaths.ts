/**
 * Coming Soon URLs the old nav tree made up, retired by the target nav tree
 * (BUILD-PLAN B7; gap/10 W3 `retired`: "redirect to the replacement for one
 * release, then removed"). Data only; src/routes/index.tsx mounts one
 * <Navigate replace> per entry.
 *
 * The old Fleet and Vessel trees built placeholder paths from labels
 * (`/fleet/fleet-scheduler`, `/vessel/safety/sms-summary`,
 * `/vessel/departments/crew/bridge/handover-notes`). None of them had a page;
 * each opened Coming Soon. They now lead to the matching place in the new
 * trees: the fleet page that replaced them, or the vessel module root of the
 * current vessel (`/v/:vesselCode/…`, which the vessel scope resolves to the
 * selected or first reachable vessel). A `from` ending in `/*` covers the old
 * group and everything under it.
 *
 * The real legacy pages (`/vessel/logbooks/*`, `/vessel/:vesselSlug/*`) are
 * not here: they keep their routes and LegacyRoute redirects
 * (./legacyRedirects.ts).
 */
export interface RetiredNavRedirect {
  /** The old placeholder path or prefix (`/*`), as the router declares it. */
  from: string;
  /** Where it goes now. May use the literal `:vesselCode` for the current vessel. */
  to: string;
}

export const RETIRED_NAV_REDIRECTS: readonly RetiredNavRedirect[] = [
  // Fleet: the scheduler is folded into the Planner (gap/02, gap/07); the
  // reports placeholder is the real reports hub now.
  { from: '/fleet/fleet-scheduler', to: '/fleet/planner' },
  { from: '/fleet/fleet-reports', to: '/fleet/reports' },

  // Vessel: one entry per old group, to the module root in the current vessel.
  { from: '/vessel', to: '/v/:vesselCode' },
  { from: '/vessel/crew/*', to: '/v/:vesselCode/crew' },
  { from: '/vessel/safety/*', to: '/v/:vesselCode/safety' },
  { from: '/vessel/certificates/*', to: '/v/:vesselCode/certificates' },
  { from: '/vessel/technical/*', to: '/v/:vesselCode/technical' },
  { from: '/vessel/charter/*', to: '/v/:vesselCode/charter' },
  // `/vessel/:vesselSlug/checklists` would otherwise claim this one (a static
  // segment outranks the splat above).
  { from: '/vessel/charter/checklists', to: '/v/:vesselCode/charter/checklists' },
  { from: '/vessel/accounting/*', to: '/v/:vesselCode/finance' },
  { from: '/vessel/general/*', to: '/v/:vesselCode/vessel' },
  { from: '/vessel/departments/*', to: '/v/:vesselCode/departments' },
];
