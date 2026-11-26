/**
 * Legacy URL → scoped URL, for one release (DECISIONS D-02, gap/00 B5,
 * gap/01 "Legacy route redirects", R3, R8). Data only: the resolver is in
 * ./legacyResolve.ts and the route element in ./scopes.tsx (`LegacyRoute`).
 *
 * How an entry is applied:
 * - `to` with `:vesselCode` needs a vessel. By default that is the user's
 *   selected (last) vessel. `vessel.slugParam` or `vessel.idParam` takes it
 *   from the old URL instead. While a fleet user is in "All vessels" mode
 *   there is no single vessel, so the old page renders where it is.
 * - `to` under `/fleet` needs fleet reach. Without it the old page renders
 *   where it is, so nobody loses a page they could open before.
 * - `fleetTo`, when set, is used instead of `to` for users with fleet reach.
 * - Any other `to` (the personal area, `/me`) always applies.
 * - Other `:params` in `to` come from the matching `:params` in `from`. The
 *   query string and hash are kept; a query in `to` is added to them.
 * - `pendingTarget`, when set, arms the entry ahead of its page: the entry
 *   applies only once a module manifest registers a page at that route
 *   pattern (`MODULE_REGISTRY.hasPage`). Until then the old page renders
 *   where it is, as for a user the target is not for (D-27). A stream turns
 *   the redirect on by registering the page, with no edit here; it registers
 *   the route only together with a working page (platform-prep plan risk 5).
 *
 * `from` must be the exact pattern the router declares, so
 * src/test/router/legacyRedirects.test.tsx can check that each one is wired
 * and that every target resolves to a real route. The nav tree links to the
 * scoped URLs themselves (BUILD-PLAN B7), so nothing maps a target back to
 * its old URL any more.
 *
 * Handled by their own route element, not this table:
 * - `/notifications/center` opens the inbox's Attention tab
 *   (`/inbox?tab=attention`, D-62) through
 *   src/modules/notifications/components/NotificationCenterRedirect.tsx: its
 *   old `?tab=compliance|messages|tasks` becomes `?view=`, a rename this
 *   table cannot express (it only copies the query). `/alerts` goes straight
 *   to `/inbox?tab=attention`.
 *
 * Not redirected yet, on purpose:
 * - `/admin/feedback` stays. R3 sends it to `/fleet/admin/support?source=quick`,
 *   but that page is not built (gap/03), so the inbox stays where it works.
 * - Pages that hold sample data (`/ism/permits-to-work`,
 *   `/ism/observations`, `/maintenance/critical`, `/maintenance/defects`,
 *   `/maintenance/spares`, `/vessels/company-details`, `/admin/integrations`)
 *   are not moved into the new scopes (gap/00 K1).
 * - Pages whose target in the domain docs is a tab of a page that is not
 *   built yet (incidents, corrective actions, non-conformities,
 *   investigations, audits, meetings, certificate alerts, leave calculator,
 *   crew self-service dashboard) keep their old URLs until that page lands.
 */

export interface LegacyRedirectEntry {
  /** The old route pattern, exactly as declared in the router. */
  from: string;
  /** The new path. May contain `:vesselCode`, other `:params` of `from`, and a query. */
  to: string;
  /** The fleet counterpart, used instead of `to` for users with fleet reach. */
  fleetTo?: string;
  /** Take the vessel from the old URL rather than the selected vessel. */
  vessel?: { slugParam: string } | { idParam: string };
  /**
   * A full route pattern (`/fleet/training/:tab`, `/v/:vesselCode/safety/fleet-documents`)
   * that a module page must serve before the entry applies; until then the
   * old page renders where it is.
   */
  pendingTarget?: string;
}

export const LEGACY_REDIRECTS: readonly LegacyRedirectEntry[] = [
  // ─── Fleet (gap/01, gap/02, gap/03) ──────────────────────────────────────
  // The DPA view is the fleet dashboard (D-90: its alert tiles count the
  // viewer's alert scope, never the vessel selection).
  { from: '/dpa-dashboard', to: '/fleet/dashboard' },
  { from: '/fleet-map', to: '/fleet/tracker' },
  { from: '/itinerary/timeline', to: '/fleet/calendar' },
  // The controlled register; the fleet documents page becomes its own (gap/02 FD).
  { from: '/documents', to: '/fleet/documents/register' },
  { from: '/reports', to: '/fleet/reports/incident-analytics' },
  { from: '/reports/incident-analytics', to: '/fleet/reports/incident-analytics' },
  { from: '/reports/capa-tracker', to: '/fleet/reports/capa-tracker' },
  { from: '/reports/drill-analytics', to: '/fleet/reports/drill-analytics' },
  // gap/05: the ERM page is a fleet risk dashboard.
  { from: '/ism/erm', to: '/fleet/reports/risk-overview' },
  { from: '/users-access', to: '/fleet/admin/users/crew' },
  { from: '/users-access/:userId', to: '/fleet/admin/users/people/:userId' },
  { from: '/settings/permissions', to: '/fleet/admin/users/sets' },
  { from: '/admin/roles', to: '/fleet/admin/users/sets' },
  { from: '/vessels/list', to: '/fleet/admin/vessels' },
  { from: '/settings/notifications', to: '/fleet/admin/notifications' },
  // The development admin pages become the tabs of Fleet › Training (gap/02
  // TR). Armed: each applies once the training module routes its tabs.
  { from: '/development/admin', to: '/fleet/training/overview', pendingTarget: '/fleet/training/:tab' },
  { from: '/development/catalogue', to: '/fleet/training/catalogue', pendingTarget: '/fleet/training/:tab' },
  { from: '/development/applications', to: '/fleet/training/applications', pendingTarget: '/fleet/training/:tab' },
  { from: '/development/courses-register', to: '/fleet/training/applications', pendingTarget: '/fleet/training/:tab' },
  // Form templates become Fleet › Forms & Checklists (gap/02 FC). Armed.
  { from: '/ism/forms/templates', to: '/fleet/forms', pendingTarget: '/fleet/forms' },

  // ─── Vessel (gap/01, gap/04–07) ──────────────────────────────────────────
  { from: '/vessels/dashboard', to: '/v/:vesselCode' },
  { from: '/vessel/:vesselSlug', to: '/v/:vesselCode', vessel: { slugParam: 'vesselSlug' } },
  { from: '/vessel/:vesselSlug/dashboard', to: '/v/:vesselCode', vessel: { slugParam: 'vesselSlug' } },
  { from: '/crew/list', to: '/v/:vesselCode/crew/list' },
  // gap/04: one crew list. The roster folds into it, so both old URLs open it.
  { from: '/crew/roster', to: '/v/:vesselCode/crew/list' },
  { from: '/crew', to: '/v/:vesselCode/crew/list' },
  { from: '/crew/certificates', to: '/v/:vesselCode/crew/compliance/status?view=documents' },
  { from: '/crew/work-rest/overview', to: '/v/:vesselCode/crew/hours-of-rest' },
  { from: '/crew/work-rest/:crewId', to: '/v/:vesselCode/crew/people/:crewId/hours-of-rest' },
  { from: '/crew/rotation-planner', to: '/v/:vesselCode/crew/planner/timeline', fleetTo: '/fleet/planner' },
  { from: '/crew/leave', to: '/v/:vesselCode/crew/planner/manning' },
  { from: '/crew/leave/requests', to: '/v/:vesselCode/crew/planner/requests' },
  { from: '/development/crew-training', to: '/v/:vesselCode/crew/training' },
  { from: '/training', to: '/v/:vesselCode/crew/familiarisation' },
  { from: '/crew/calendar', to: '/v/:vesselCode/calendar' },
  // Document acknowledgements are the fleet documents page's tab for the
  // office and the vessel's Safety › Fleet Documents on board (gap/02 FD,
  // gap/05). Armed: they apply once the vessel page is routed.
  {
    from: '/acknowledgments',
    to: '/v/:vesselCode/safety/fleet-documents',
    fleetTo: '/fleet/documents?tab=acknowledgements',
    pendingTarget: '/v/:vesselCode/safety/fleet-documents',
  },
  { from: '/crew/acknowledgements', to: '/v/:vesselCode/safety/fleet-documents', pendingTarget: '/v/:vesselCode/safety/fleet-documents' },
  { from: '/ism/drills', to: '/v/:vesselCode/safety/drills' },
  { from: '/drills', to: '/v/:vesselCode/safety/drills' },
  { from: '/ism/miscellaneous', to: '/v/:vesselCode/safety/forms' },
  { from: '/ism/checklists', to: '/v/:vesselCode/safety/checklists' },
  { from: '/checklists', to: '/v/:vesselCode/safety/checklists' },
  { from: '/vessel/:vesselSlug/checklists', to: '/v/:vesselCode/safety/checklists', vessel: { slugParam: 'vesselSlug' } },
  { from: '/ism/risk-assessments', to: '/v/:vesselCode/safety/risk-assessments' },
  { from: '/risk-assessments', to: '/v/:vesselCode/safety/risk-assessments' },
  { from: '/risk-assessments/new', to: '/v/:vesselCode/safety/risk-assessments/new' },
  { from: '/certificates', to: '/v/:vesselCode/certificates' },
  { from: '/certificates/vessel', to: '/v/:vesselCode/certificates' },
  { from: '/maintenance/dashboard', to: '/v/:vesselCode/technical' },
  { from: '/maintenance', to: '/v/:vesselCode/technical' },
  { from: '/vessels/emergency-details', to: '/v/:vesselCode/vessel/emergency' },
  { from: '/vessels/:vesselId/emergency', to: '/v/:vesselCode/vessel/emergency', vessel: { idParam: 'vesselId' } },
  { from: '/vessel/logbooks', to: '/v/:vesselCode/logbooks' },
  { from: '/vessel/logbooks/registry', to: '/v/:vesselCode/logbooks/registry' },
  { from: '/vessel/logbooks/review', to: '/v/:vesselCode/logbooks/review' },
  { from: '/vessel/logbooks/records', to: '/v/:vesselCode/logbooks/records' },
  { from: '/vessel/logbooks/connections', to: '/v/:vesselCode/logbooks/connections' },
  { from: '/vessel/logbooks/assurance', to: '/v/:vesselCode/logbooks/assurance' },
  { from: '/vessel/logbooks/:logbookSlug', to: '/v/:vesselCode/logbooks/:logbookSlug' },

  // ─── Personal (gap/01, gap/03, R8) ───────────────────────────────────────
  { from: '/settings', to: '/me' },
  { from: '/crew/work-rest', to: '/me/hours-of-rest' },
  { from: '/crew/hours-of-rest', to: '/me/hours-of-rest' },
  { from: '/development/my', to: '/me/training' },
  { from: '/notifications', to: '/me/notifications' },
];
