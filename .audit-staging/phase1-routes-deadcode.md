# Phase 1 Discovery — Routes, pages, dead code (agent a4283ce0a2ff0af4f)

Phase 1 (read-only discovery) complete for /home/user/maritime-master. Full findings below, in the requested per-item format, followed by a factual inventory appendix. All numbers were derived by actually executing the router-building logic (`src/config/sitemap.ts` via `vite-node`) and cross-referencing it against every route file with a Python script, then double-checked with targeted `grep`/`rg` — not by reading docs or comments. No files were modified.

---

## 1. Route / page inventory

### [ROUTES] — Entire Refit sub-tree in the sidebar points at "Coming Soon" placeholders instead of the real, built pages
Severity: Critical
Location: `src/config/sitemap.ts` lines ~450-505 (the `yardRefit` array, `Overview`/`Workflow`/`Project`/`Documents`/`Finance`/`Compliance`/`Account & Admin` groups) vs. `src/modules/refit/routes.tsx`
Description: The `L(label, base, opts)` helper builds a leaf's path as `` `${base}/${slug(label)}` `` when no `existing` override is given. For every leaf in `New Build` (`src/config/sitemap.ts`, `yardNewBuild`) the `base` passed in is the group's *base* path (e.g. `nbOverview = '/yard/new-build/overview'`), so the generated path is correct (`/yard/new-build/overview/dashboard`), matching `src/modules/new-build/routes.tsx` exactly. But for `Refit`, the code instead passes the *already-suffixed* path as `base`, e.g. `L('Dashboard', \`${refitOverview}/dashboard\`, ...)` where `refitOverview` is already `/yard/refit/overview`. This produces a double-suffixed path: `/yard/refit/overview/dashboard/dashboard` instead of the real route `/yard/refit/overview/dashboard`. The same bug repeats across Overview (4 leaves), Workflow (6), Project (5), Documents (3), Finance (3), Compliance (4) and Account & Admin (7) — 32 leaves in total. Because these leaves' paths fall under the `/yard/` placeholder prefix and carry no `existing:` override, `PLACEHOLDER_LEAVES` faithfully auto-generates a "Coming Soon" placeholder route at the buggy double-suffixed path, which does exist and does render — so this is *not* a 404 and is *not* caught by the existing regression test `src/test/config/sitemapTargets.test.ts` (it only checks leaves that carry an `existing:` field; these don't, so they're silently treated as legitimate placeholders). I confirmed the test currently passes (`npx vitest run src/test/config/sitemapTargets.test.ts` → 3/3 green) even with this bug present.
Impact: All 31 fully-built Refit pages (dashboard, change orders, snags, budget, purchase orders, invoices, audit log, etc. — real components in `src/modules/refit/pages/*`) are unreachable from the sidebar. Every "Yard → Refit" nav click lands on a generic "Coming Soon" screen for a feature that is already built and shipped. The real routes (`/yard/refit/overview/dashboard`, etc.) only work if a user already knows the exact URL.
Suggested fix: In `src/config/sitemap.ts`, change each `L('X', \`${refitX}/y\`, ...)` call in `yardRefit` to `L('X', refitX, ...)` (pass the group base only, matching the New Build pattern), so the auto-slugged suffix isn't duplicated. Then extend `src/test/config/sitemapTargets.test.ts` to also assert that every generated `PLACEHOLDER_LEAVES` path that happens to coincide with (or nearly coincide with, module-prefix-wise) a route declared in a module's own `routes.tsx` file actually matches it exactly — i.e., add a check that no module-route-file path is "shadowed" by a differently-spelled placeholder for the same feature.

### [ROUTES] — `/insurance` (a real, 353-line built page) has no path in from anywhere in the app
Severity: High
Location: `src/routes/index.tsx` line 655 (`<Route path="/insurance" ...><InsurancePage /></Route>`); page at `src/modules/compliance/pages/InsurancePage.tsx`
Description: `InsurancePage` is a fully built page (tabs for Bunker Liability, audit-visibility rules, etc.). Both places in `src/config/sitemap.ts` that have an "Insurance" label (`vesselCertificates` and `vesselVessel`) leave it un-wired (no `existing:`), so they render as generic Coming-Soon placeholders under `/vessel/certificates/insurance` and `/vessel/general/insurance` instead of pointing at `/insurance`. A repo-wide grep for `/insurance` found zero `Link`/`navigate()`/`href` references anywhere in `src/` outside the route declaration itself.
Impact: The Insurance feature is completely undiscoverable in the running app; users can only reach it by typing the URL directly.
Suggested fix: Add `existing: '/insurance'` to one (or both) of the "Insurance" leaves in `src/config/sitemap.ts`.

### [ROUTES] — Several real Documents/Certificates sub-pages are wired only to already-dead placeholder files
Severity: Medium
Location: `src/routes/index.tsx` (`/documents/manuals`, `/documents/procedures`, `/documents/policies`, `/documents/drawings`, `/documents/ism-sms`, `/certificates/vessel`, `/certificates/crew`); dead files `src/shared/pages/placeholder/DocumentsPlaceholder.tsx`, `src/shared/pages/placeholder/CertificatesPlaceholder.tsx`
Description: These 7 routes have no sitemap leaf at all. Repo-wide grep shows their only string references anywhere in `src/` are inside `DocumentsPlaceholder.tsx` / `CertificatesPlaceholder.tsx` — and those two placeholder page files are themselves unreachable dead code (confirmed by full import-graph reachability from `src/main.tsx`; see finding below). So these real pages are orphaned twice over: no nav entry, and their only in-repo referrer is itself dead.
Impact: Manuals, Procedures, Policies, Drawings, ISM/SMS docs, vessel-certificates and crew-certificates sub-views are not reachable through any current UI path.
Suggested fix: Either add sitemap leaves (with `existing:`) for these, or confirm they're superseded by the tabs inside `Documents.tsx`/`Certificates.tsx` and remove the dead route + placeholder file pair.

### [ROUTES] — `/documents/search`, `/documents/reviews`, `/review-queue`, `/crew/acknowledgements`, `/crew/my-dashboard`, `/vessels/:vesselId/emergency`, `/settings/permissions` have zero references anywhere in the app
Severity: Medium
Location: `src/routes/index.tsx` (respective `<Route>` lines)
Description: Unlike the cases above, these have no referrer at all — not even a dead placeholder file. `/settings/permissions` and `/admin/roles` both render the same `RolesPermissionsPage`; `/admin/roles`'s only nav entry is itself dead (next finding), so `RolesPermissionsPage` currently has zero live entry points under any path. `/vessels/:vesselId/emergency` duplicates the reachable static route `/vessels/emergency-details` (which the sitemap does wire via `existing:`) but the dynamic variant is never constructed anywhere.
Impact: These pages/flows can only be reached by a hand-typed URL.
Suggested fix: Either wire a sitemap/in-page link to each, or remove the unreferenced route if superseded.

### [ROUTES] — `ADMIN_NAV_ITEMS` (5 admin routes) is dead code, leaving those routes unreachable
Severity: Medium
Location: `src/config/navigation.ts` lines ~13-19 (`ADMIN_NAV_ITEMS` export); routes at `/admin/roles`, `/admin/fleet-groups`, `/admin/alerts`, `/admin/integrations`, `/admin/feedback` in `src/routes/index.tsx`
Description: `navigation.ts` defines `ADMIN_NAV_ITEMS: NavChild[]` specifically to expose these 5 admin routes, but nothing in `src/` imports `ADMIN_NAV_ITEMS` (confirmed by grep — the only match is its own definition file). The sidebar (`SidebarNavigation.tsx`) instead renders `NAVIGATION_ITEMS` (from `sitemap.ts`) or, on the dashboard-root view, a separately hardcoded `DASHBOARD_LINKS` array (which *is* used — it correctly surfaces `/dashboard`, `/fleet-map`, `/notifications/center`, `/crew/calendar`, `/reports`). `ADMIN_NAV_ITEMS` was apparently meant to be a third source but was never wired in anywhere.
Impact: Roles & Permissions, Fleet Groups, Alert Configuration, API Integrations and Feedback admin screens have no nav entry point at all.
Suggested fix: Either render `ADMIN_NAV_ITEMS` somewhere (e.g. inside the Settings page/sidebar) or delete the dead export and its routes if the functionality has been superseded.

### [ROUTES] — No dead sitemap leaves beyond ones the prior audit already fixed
Severity: Cosmetic (informational)
Location: `src/config/sitemap.ts`, `src/test/config/sitemapTargets.test.ts`
Description: Running the sitemap-building code directly (via `vite-node`) and resolving all 312 `NAVIGATION_ITEMS` leaves against the router (299 explicit routes + 262 generated placeholders + 63 generated section redirects), only 2 leaves failed simple resolution: `Spa` (`/health/spa`) and `Medical` (`/health/medical`). Both are `crossLink` leaves whose path intentionally duplicates a *group* path elsewhere in the tree, and both are correctly covered by an auto-generated `SECTION_REDIRECT` — i.e., these are exactly the class of fix the prior audit already made, not new dead ends. No other `existing:`-pointing leaf is broken.
Impact: None — confirms the prior audit's dead-link fixes are holding, and that regression test `sitemapTargets.test.ts` is doing its job for that specific bug class (it does *not*, however, catch the Refit double-slug bug above, since that bug produces leaves without an `existing:` field).
Suggested fix: N/A — no action needed here; consider extending the regression test as noted in the Refit finding.

### [ROUTES] — Refit and New Build modules carry no module-level access gate, unlike every other sensitive module
Severity: Medium
Location: `src/modules/refit/routes.tsx`, `src/modules/refit/components/layout/RefitShell.tsx`; `src/modules/new-build/routes.tsx`, `src/modules/new-build/components/layout/NewBuildShell.tsx`
Description: HRIS routes (`src/modules/hris/routes.tsx`) and Health routes (`src/modules/health/routes.tsx`) both wrap every page in `<ModuleRoute moduleId="..." ...Level="...">`, gating by RBAC module + level (e.g. `payrollLevel`, `medicalLevel`), with code comments explicitly documenting the gating rationale. `/hr` also uses `ModuleRoute moduleId="hris"`. The Legal module documents an explicit, deliberate decision to use plain `ProtectedRoute` only ("any signed-in user may enter... gated in the pages by `useLegalAccess`"). Refit and New Build, by contrast, wrap every page in plain `ProtectedRoute` + a Shell component (`RefitShell`/`NewBuildShell`) that provides only session/vessel-picker context — no RBAC check, no comment explaining why, and no in-page access hook analogous to `useLegalAccess`. Yet these modules contain commercially sensitive data: Finance (Budget, Purchase Orders, Invoices), Compliance (Audit Log, Reporting), Account & Admin (Admin & Settings).
Impact: Any authenticated user, regardless of role, can view/reach every Refit and New Build page (once the routing bug above is fixed and they become reachable) — including budgets, invoices and audit logs — while comparable financial/HR data elsewhere in the app (Payroll, Compensation Settings) is explicitly permission-gated.
Suggested fix: Decide whether Refit/New Build should carry a `ModuleRoute`-style gate (consistent with HRIS/Health) or whether the current "any signed-in user" model is intentional; if intentional, document it the way Legal's routes.tsx does, and add an in-page access check for the Finance/Compliance/Account sections at minimum.

### [ROUTES] — No real 404 page is ever shown; a fully-built, on-brand `NotFound` component is dead code
Severity: High
Location: `src/routes/index.tsx` line 53 (`const NotFound = React.lazy(() => import('@/shared/pages/NotFound'));`) and line 850 (`<Route path="*" element={<Navigate to="/dashboard" replace />} />`); component at `src/shared/pages/NotFound.tsx`
Description: `NotFound.tsx` is a complete, on-brand 404 page (STORM wordmark, watermark, "404 — Oops! Page not found", link home). It is imported and lazily wrapped in `routes/index.tsx`, but the `NotFound` identifier is never referenced in any JSX — a repo-wide grep for `NotFound` shows only its `React.lazy` import and its own definition/export. The actual catch-all route silently `Navigate`s to `/dashboard` instead.
Impact: Any truly unmatched URL (typo, stale bookmark, broken external link) is silently redirected to the dashboard with no explanation — the user has no idea their URL was wrong, and the on-brand 404 UX that was clearly built for this purpose never fires. This also means `NotFound.tsx` is unused code (~30 lines) sitting in the bundle.
Suggested fix: Change the catch-all to `<Route path="*" element={<NotFound />} />` (or keep it wrapped for layout consistency), and remove the dashboard-bounce behavior — or, if the "always land somewhere useful" behavior is deliberate product policy, delete the dead `NotFound.tsx` component to stop it from misleadingly looking "wired in."

### [ROUTES] — Deep-link / refresh safety on nested & dynamic routes: verified working at the router level
Severity: Cosmetic (informational — passed the check)
Location: `src/routes/index.tsx`, `src/App.tsx` line 39 (`<BrowserRouter>`)
Description: Spot-checked `/ism/forms/submission/:submissionId`, `/vessel/:vesselSlug/dashboard`, `/crew/work-rest/:crewId`, `/crew/admin/travel/:id`. All four are explicit, fully-declared `<Route>` entries (not synthesized from any catch-all), so React Router v6's path-ranking (which scores static segments above dynamic `:param` segments regardless of declaration order) matches them correctly on a hard refresh — there is no client-side bounce to `/dashboard` for these. The code is also proactively guarded against one specific collision class: `src/config/sitemap.ts`'s `IMPLEMENTED_PREFIXES = ['/vessel/logbooks/']` exists specifically to stop the auto-generated placeholder routes from shadowing the dynamic `/vessel/logbooks/:logbookSlug` route, with a code comment explaining exactly this risk ("static placeholder paths outrank dynamic routes in React Router's ranking"). I did not find any other unguarded static/dynamic collision.
Impact: None identified for the client-side router. One caveat I could not verify from inside this repo: whether a hard refresh 404s *before* React even loads depends on the HTTP host serving `index.html` for arbitrary paths (SPA fallback). No `_redirects`, `vercel.json`, `netlify.toml`, or equivalent rewrite config exists in this repo, and there's a `.lovable/` directory indicating this project is built/hosted via Lovable's managed platform, which likely handles SPA fallback itself outside this repo's config surface — so this could not be conclusively verified as a bug or a non-issue from the codebase alone.
Suggested fix: If/when this app is deployed to a plain static host (S3, a generic Nginx box, etc.) rather than Lovable's managed hosting, confirm a SPA-fallback rewrite rule exists; no code change needed otherwise.

---

## 2. Component tree — used vs. dead

Methodology: rather than a simple "grep the filename" pass (which false-negatives on components only reachable through a barrel `index.ts` that is itself unused), I built the actual import graph for the whole `src/` tree (1,192 files, including dynamic `React.lazy(() => import(...))` calls, which this codebase uses exclusively — no `import.meta.glob` or template-literal dynamic imports exist here) and computed forward reachability by BFS from `src/main.tsx`. Of 478 files under `src/modules/**/components` and `src/shared/components`, 29 are unreachable from the app's real entry point:

### [COMPONENTS] — 29 components under `src/modules/**/components` and `src/shared/components` are unreachable from the app
Severity: Low
Location: (full list; each confirmed to have zero importers via the import graph, and independently confirmed via `rg` that the bare identifier appears nowhere outside its own file/tests)
- `src/shared/components/NavLink.tsx`
- `src/shared/components/layout/VesselToggleBar.tsx`
- `src/shared/components/layout/GlobalHeaderControls.tsx`
- `src/shared/components/layout/AdaptiveActionBar.tsx`
- `src/shared/components/layout/HeaderQuickActions.tsx`
- `src/shared/components/modals/AddFleetGroupModal.tsx`
- `src/shared/components/modals/AddUserModal.tsx`
- `src/modules/auth/components/PermissionGate.tsx` (has a dedicated test, `src/test/components/PermissionGate.test.tsx`, but zero production usage)
- `src/modules/hris/components/disciplinary/MyDisciplinaryCard.tsx`
- `src/modules/hris/components/disciplinary/AcknowledgeCard.tsx`
- `src/modules/incidents/components/IncidentViewModal.tsx`
- `src/modules/red-room/components/RedRoomAlerts.tsx`
- `src/modules/legal/components/index.ts` (barrel itself unused; see below)
- `src/modules/emergency/components/ERMEmergencyContactsSection.tsx` (only importer is `src/modules/emergency/index.ts`, which is itself unreachable — a barrel-only reference, exactly the "referenced only in an unused barrel" case)
- `src/modules/documents/components/DocumentViewModal.tsx` (same pattern — only importer is the unreachable `src/modules/documents/index.ts`)
- `src/modules/logbooks/components/LogbookEntryHistory.tsx`
- `src/modules/crew/components/EditCrewModal.tsx`
- `src/modules/crew/components/CrewAuditLog.tsx`
- `src/modules/vessels/components/VesselContextBanner.tsx`
- `src/modules/vessels/components/VesselSelector.tsx`
- `src/modules/new-build/components/interior/ContractorDemarcation.tsx`
- `src/modules/ism/components/TabPlaceholder.tsx`
- `src/modules/ism/components/ChecklistCard.tsx`
- `src/modules/itinerary/components/TripBlock.tsx`
- `src/modules/dashboard/components/VesselFilter.tsx`
- `src/modules/dashboard/components/DashboardVesselFilter.tsx`
- `src/modules/refit/components/RolePreviewSwitcher.tsx`
- `src/modules/refit/components/VesselSwitcher.tsx`
- `src/modules/refit/components/AuthBanner.tsx`

Description: Each was checked two ways — (1) full import-graph BFS reachability from `src/main.tsx`, and (2) a direct `rg` for the bare identifier repo-wide to rule out a reference my resolver might have missed. Five of these (`VesselToggleBar`, `HeaderQuickActions`, `GlobalHeaderControls`, `AdaptiveActionBar`, `NavLink`) are independently corroborated as already-known-dead by `docs/SYSTEM-AUDIT-2026-09-19.md` from a prior audit pass, which is good cross-confirmation of the method. Two of them (`DocumentViewModal.tsx`, `ERMEmergencyContactsSection.tsx`) are specifically the "referenced only in a barrel file that itself isn't imported" case flagged as a risk in the task brief — I traced both: `src/modules/documents/index.ts` and `src/modules/emergency/index.ts` re-export them, but nothing in `src/` imports either barrel.
Impact: Dead weight in the bundle/codebase; no functional risk since nothing references them.
Confidence caveat: I could not rule out that some of these are meant for near-term use (e.g. work-in-progress) or referenced from outside `src/` (e.g. a Storybook or e2e harness) — none was found in this repo, but I did not check outside the repo. `PermissionGate.tsx` specifically has real test coverage despite no production caller, which may indicate work-in-progress rather than true dead code — worth a human check before deleting.
Suggested fix: For each, confirm no near-term plan references it, then delete. Start with the 5 already corroborated by the prior audit doc (lowest risk), then the barrel-only pair, then the rest.

---

## 3 & 4. Deep-link/refresh safety and 404 page

Covered above as part of the route-inventory findings (the "No real 404 page" and "Deep-link / refresh safety" entries), to keep router-related evidence together.

---

## Factual inventory (data, not findings)

- **Total declared `<Route>` entries (static/explicit, hand-written across `src/routes/index.tsx` + the 5 module route files `new-build`, `hris`, `health`, `refit`, `legal`):** 299, plus the catch-all `*` = 300.
- **Auto-generated placeholder ("Coming Soon") routes** (from `PLACEHOLDER_LEAVES` in `src/config/sitemap.ts`): 262.
- **Auto-generated section-redirect routes** (from `SECTION_REDIRECTS`): 63.
- **Total rendered `<Route>` elements at runtime:** 299 + 1 (catch-all) + 262 + 63 = **625**.
- **Total sitemap leaf count** (`NAVIGATION_ITEMS`, leaves only, via `collectLeaves`): **312**.
- **Modules under `src/modules/`:** 33.
- **Component files scanned** (`src/modules/**/components/**` + `src/shared/components/**`, `.ts`/`.tsx`, excluding tests): 478.

**Orphaned routes (real pages/routes with no live path in from any nav, sidebar, or in-app link — verified, not the raw 160-item mechanical diff which includes many legitimate cases like `/auth`, legacy `Navigate`-only redirect stubs, and routes reached via in-page tabs/buttons rather than the sidebar):**
- All 32 leaves/paths under `/yard/refit/*` (Overview/Workflow/Project/Documents/Finance/Compliance/Account groups) — see Refit finding.
- `/insurance`
- `/documents/manuals`, `/documents/procedures`, `/documents/policies`, `/documents/drawings`, `/documents/ism-sms`
- `/documents/search`, `/documents/reviews`, `/review-queue`
- `/certificates/vessel`, `/certificates/crew`
- `/admin/roles`, `/admin/fleet-groups`, `/admin/alerts`, `/admin/integrations`, `/admin/feedback`
- `/crew/acknowledgements`, `/crew/my-dashboard`
- `/vessels/:vesselId/emergency`, `/settings/permissions`

(Note: many other paths reported by the raw router-vs-sitemap diff — e.g. `/crew/admin/*`, `/ism/forms/*`, `/development/catalogue`, `/itinerary/suggestions`, `/reports/capa-tracker`, `/maintenance/defects` — were checked individually and are in fact reachable via in-app `Link`/`navigate()` calls from other live pages, just not from the sidebar/sitemap. These are not flagged as bugs.)

**Dead-link sitemap leaves (leaf resolves to nothing at all):** 0 new ones. The only 2 the mechanical check flagged (`/health/spa`, `/health/medical`) are `crossLink` duplicates of group paths already correctly handled by `SECTION_REDIRECTS` — i.e., already fixed by the prior audit, consistent with the task's expectation.

**Unused-component candidates (zero importers, full reachability analysis from `src/main.tsx`):** 29 — full list in Finding 2 above.

---

Key files referenced (all absolute paths under `/home/user/maritime-master`):
- `src/routes/index.tsx`, `src/config/sitemap.ts`, `src/config/navigation.ts`, `src/config/navigation-types.ts`
- `src/modules/new-build/routes.tsx`, `src/modules/hris/routes.tsx`, `src/modules/hris/paths.ts`, `src/modules/health/routes.tsx`, `src/modules/health/paths.ts`, `src/modules/refit/routes.tsx`, `src/modules/legal/routes.tsx`, `src/modules/legal/paths.ts`
- `src/modules/refit/components/layout/RefitShell.tsx`, `src/modules/new-build/components/layout/NewBuildShell.tsx`
- `src/shared/pages/NotFound.tsx`, `src/App.tsx`
- `src/test/config/sitemapTargets.test.ts` (existing regression test; still passes, doesn't catch the Refit bug)
- `docs/SYSTEM-AUDIT-2026-09-19.md` (prior audit; corroborates 5 of the 29 dead components)
- `.lovable/plan/fix-the-blank-white-screen-on-refresh-2026-09-19.md` (unrelated prior fix — client-side reload-loop/blank-screen issue, not a routing/404 issue)

No files modified.
