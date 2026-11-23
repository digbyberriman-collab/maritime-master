# STORM architecture, conventions and build constraints — gap analysis

> Doc 00 of the blueprint gap series. Docs 01–10 say **what** STORM must build. This doc says **how** to build it in this repository without breaking it, and how to split the work so that several engineers or agents can build in parallel without colliding. Every claim below was checked against the code on branch `claude/funny-edison-b5z8b1` (22 Nov 2026). Where a fact comes from an earlier audit and could not be re-verified from the repo alone, it is marked *(audit, unverified now)*.

---

## Scope

### Blueprint sections covered

- **Executive summary** (lines 1–94): the two-level operating model (Fleet view for oversight, Vessel view for on-board work), the module list, the roles (account owner, account admins, shore staff, vessel crew with presets, "the Company" as a workflow actor, external viewers), the core entity list, the eight cross-cutting engines (expiry buckets, ordered signatures, company status threads, per-module permission checks, PDF/CSV/Excel exports, file uploads up to 50 MB, activity notifications, calendar feed) and the suggested build order.
- Section numbers cited from the blueprint heading index only, where the engineering contract depends on them: §1.3 two-level structure, §1.5 URL scheme, §1.6 identifier formats, §2 roles and permissions, §7.4 exports, §7.5 file uploads, §7.12 save behaviours, §8 signatures and audit trail, §9 support tickets, §10 known gaps. The domain detail behind those sections is owned by docs 01–10; this doc only fixes the mechanism.

### Relationship to the other gap docs

| Doc | Owns | This doc gives it |
|---|---|---|
| 01 Foundations, tenancy, roles | Router contract (`/fleet`, `/v/:vesselCode`, `/me`), `VesselScopeRoute`, vessel code, PMS v1 adoption | The module manifest and layout-route mechanism the contract plugs into; RLS and helper naming rules |
| 08 Cross-cutting engines | Record registry, envelope, transitions, signatures, PDF templates, notifications emit | Where engine code lives, how modules register record kinds without editing shared files |
| 10 Design system and IA | Tokens, AppShell, status-tone registry, nav node fields | Nav fragment and status-lifecycle mechanics; which shell files are hotspots |
| 02–07, 09 Domain docs | Domain features | Module anatomy, migration, test and PR conventions to follow |

### STORM paths inspected (read, not just listed)

- **Composition root:** `src/main.tsx`, `src/App.tsx`, `src/routes/index.tsx` (855 lines), `src/modules/{hris,health,legal,refit,new-build}/routes.tsx`, `src/modules/{hris,health,legal}/paths.ts`.
- **Navigation:** `src/config/sitemap.ts` (733 lines), `src/config/navigation.ts`, `src/config/navigation-types.ts`, `src/shared/lib/moduleNavigation.ts`, `src/shared/components/layout/{DashboardLayout,SidebarNavigation,ModuleTopNav}.tsx`.
- **Guards and access:** `src/shared/components/{ProtectedRoute,ModuleRoute,ErrorBoundary}.tsx`, `src/modules/auth/contexts/AuthContext.tsx`, `src/modules/auth/store/permissionsStore.ts`, `src/modules/auth/components/PermissionGate.tsx`, `src/modules/auth/lib/{hrAccess,medicalAccess,wellnessAccess,payrollAccess,legalAccess,rbacMatrix,permissionsIndex}.ts`, `docs/permissions/{README,MASTER-PROMPT}.md`, `docs/permissions/addenda/storm.md`.
- **Context providers:** `src/modules/vessels/contexts/VesselContext.tsx`, `src/modules/vessels/hooks/useVesselFilter.ts`, `src/modules/dashboard/contexts/DashboardFilterContext.tsx`, `src/shared/contexts/BrandingContext.tsx`.
- **Mature module anatomy:** HRIS (`src/modules/hris/**`, 210 files), Health & Wellness (`src/modules/health/**`, 115 files), Legal (`src/modules/legal/**`), Work & Rest (`src/modules/work-rest/**`), Crew (`src/modules/crew/hooks/useCrew.ts`), Refit (`src/modules/refit/lib/db.ts`).
- **Data layer:** `src/integrations/supabase/{client,types,previewAuthStorage}.ts`, `src/integrations/lovable/index.ts`, 129 files in `supabase/migrations/`, `supabase/config.toml`, 27 entries in `supabase/functions/` (26 functions + `_shared`).
- **Exports and files:** `src/lib/pdf/pdfTemplate.ts`, `src/lib/documentExport.ts`, `src/lib/storage/crewDocuments.ts`, `src/modules/work-rest/reports/exports.ts`, `src/shared/hooks/usePDFExport.ts`.
- **Quality and delivery:** `package.json`, `eslint.config.js`, `tsconfig*.json`, `vitest.config.ts`, `src/test/**` (harnesses, wiring, sitemap and smoke tests), `.github/workflows/ci.yml`, `.lovable/**`, `README.md`, `roadmap.md`, `scripts/permissions/*.mjs`.
- **Audits read and reconciled:** `AUDIT-REPORT.md`, `HEALTH-AUDIT.md`, `HRIS-AUDIT.md`, `MIGRATION-PLAN.md`, `DEMO-SCRIPT.md`, `docs/SYSTEM-AUDIT-2026-09-19.md`, `docs/STORM-STATUS-AUDIT.md`, `docs/HEALTH.md`, `docs/HRIS.md`.
- **Support tickets:** the 142-ticket export, filtered for platform themes (errors losing work, sync and import robustness, template propagation, uploads and previews, notifications, permissions surprises, device layout). Cited as `T-<ticket number>` to match doc 09.

### Baseline measured today (22 Nov 2026)

| Check | Result |
|---|---|
| `npm ci` | Passes (649 packages). Two lockfiles present: `bun.lock` (Lovable) and `package-lock.json` (CI). |
| `npm run lint` | **0 errors**, 839 warnings: 745 `no-explicit-any`, 61 `react-hooks/exhaustive-deps`, 33 `react-refresh/only-export-components`. No `--max-warnings`, no ratchet. |
| `npm run typecheck` | Passes. Needs `--max-old-space-size=8192` (set in `package.json`) because `types.ts` is 25,299 lines with 319 table/view row types. |
| `npm test` | 72 files, 938 tests, all pass in about 23 s. |
| `npm run build` | Passes in about 29 s. Four chunks over 500 kB: `excel` 938 kB, `index` 664 kB, `pdf-gen` 591 kB, plus `xlsx` 424 kB and `charts` 422 kB close behind. |
| `node scripts/permissions/check-storm-coverage.mjs` | 246 of 246 sitemap leaf labels map to a PMS catalogue subcategory (not run in CI). |
| Size | 34 modules under `src/modules`, about 1,200 source files, 163 `<Route>` elements in `src/routes/index.tsx` plus 133 in module route files. |

### Headline findings

1. **The repo already contains a good pattern; it just is not the default.** HRIS, Health and Legal each have `paths.ts` + `routes.tsx` + a `page()` helper that hoists `React.lazy`, wraps a guard and a layout, and tests that pin the sitemap to the router (`src/test/config/sitemap.test.ts`, `src/test/hris/wiring.test.ts`). The 28 older modules register routes inline in `src/routes/index.tsx`, 42 of them with `React.createElement(React.lazy(...))` inside the element (recreated on every render), with three different Suspense fallbacks.
2. **Two files are touched by every feature: `src/routes/index.tsx` and `src/config/sitemap.ts`.** With ten parallel workstreams these will conflict on every merge. They must become thin assemblers that read per-module manifests before the build-out starts.
3. **There is no URL scope.** The selected vessel lives in `localStorage` (`storm_selectedVesselId`) inside `VesselContext`, which decides "all vessels" from the legacy `profiles.role` (`dpa`, `shore_management`) and ignores RBAC roles such as `superadmin` and `fleet_master`. `permissionsStore.setCurrentVessel` exists and is never called, so client permissions are never vessel-scoped. Vessels have no `code` column. The blueprint's operating model needs `/fleet/…` and `/v/:vesselCode/…` (doc 01).
4. **Guards are inconsistent.** `ProtectedRoute` checks login only and wraps most routes. `ModuleRoute` (login + module + per-domain level props `hrLevel`, `payrollLevel`, `medicalLevel`, `wellnessLevel`) is used by HRIS, Health and `/hr` only. Each new sensitive domain has so far added a new prop to `ModuleRoute`, a new branch to `SidebarNavigation.canShow`, a new resolver in `src/modules/auth/lib/` and a new special case in `AuthContext.canAccessModule`: four shared files per domain. `canAccessModule` now fails closed (fixed 27 Sep, commit `edb48d1`), but `SidebarNavigation.canShow` still returns `true` for generic `moduleKey` leaves while RBAC is loading.
5. **Generated types are a minefield when hand-edited.** Lovable regenerates `src/integrations/supabase/types.ts` from the live database and commits it to `main`. Hand-patching it for not-yet-applied tables (the Health approach) collided with a later Lovable resync and produced a duplicate property inside `form_signatures`, which made `tsc` run out of memory for 15–30 minutes locally and in CI (commits `dc7a417`, `5a4085b`). The other pattern in use, `supabase as any` (51 casts in 13 files) and `.from('<table>' as any)` (82 calls, almost all Refit `rf_*`), loses all type safety and is never cleaned up: `workRestService.ts` still casts the client to `any` although all nine `work_rest_*` tables are now in `types.ts`.
6. **Hand-written migrations do not reach production by themselves.** Lovable applies only SQL it runs itself, and when someone pastes a repo migration into Lovable it commits its own copy under a UUID name (Health phases 1–5 reappear as `20260922094012_…` to `20260924062303_…`; reference numbers as `20260925192821_…`). Nothing records which hand-written files are live. Two repo security fixes (`20260919170000_nb_company_scope.sql`, `20260919170100_signup_backstop.sql`) have no applied copy and no ledger entry, so their live state is unknown. `roadmap.md` still lists the Health tables as unapplied although `types.ts` now contains them.
7. **Migration hygiene has one live defect and one structural one.** Two files share version `20260919120000` (`health_phase3_wellness` and `legal_module`), which the Supabase CLI treats as one version. And the migration set does not replay on an empty database (HRIS follow-up policies compare uuid to text, per `docs/HEALTH.md`), so no CI job can stand up a fresh database to test RLS.
8. **RLS conventions are strong in the new modules and absent as a rule.** HRIS, Health, Legal and the ISM form workflow use SECURITY DEFINER helpers (`<domain>_can_view/edit/admin`), `user_belongs_to_company`, `WITH CHECK` on writes, server-owned status transitions and append-only signatures. Nothing stops a new migration using `USING (true)` (the New Build mistake). There is no SQL helper for "can this user reach this vessel", so most tables are company-scoped only: a Draak crew member can read Hydra rows wherever the policy checks company alone.
9. **Edge functions have no shared auth.** All 26 configured functions run with `verify_jwt = false`; each re-implements CORS, the service-role client and caller lookup, and at least ten authorise by literal lists of legacy `profiles.role` values. `_shared/` holds only invite helpers. `pt-exercise-import` is missing from `config.toml`. Four functions invoked by New Build do not exist.
10. **CI is green but unguarded.** Lint, typecheck, test and build all pass, but there is no warning ratchet, no strictness for new code (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`), no DB/RLS tests, no bundle budget, and the Lovable bot still commits straight to `main` (latest 6 Nov 2026: `types.ts`, `previewAuthStorage.ts`, `AuthContext.tsx`, New Build pages, `index.html`) despite the 19 Sep decision that Lovable is for prototyping only.
11. **Shared UI infrastructure is duplicated.** Two toast systems are mounted (`use-toast` in 150 files, `sonner` in 38); react-hook-form is used in 44 files but zod resolvers in only 10 (all HRIS); page loading, error and empty states exist only inside Health (`HealthStates.tsx`); a searchable person picker exists only inside Health; two notification deep-link maps disagree (`notifications/lib/notificationLinks.ts` and `NotificationBell.tsx`).
12. **Mocked pages are still linked from the sidebar.** `ism/pages/PermitsToWorkPage.tsx` (linked from Vessel › Safety › Permit to Work), `ObservationsPage.tsx`, `maintenance/pages/CriticalEquipment.tsx`, `documents/pages/{Manuals,Policies,Procedures}.tsx`, `vessels/pages/CompanyDetails.tsx`, `settings/pages/APIIntegrations.tsx` and `drills/components/EquipmentReadinessTab.tsx` hold hard-coded records. The Refit sidebar still builds double-slug paths (`/yard/refit/overview/dashboard/dashboard`), so all Refit leaves show "Coming Soon" although 32 real routes exist.

---

## Target information architecture

This doc's "IA" is the code architecture: where things live, how routes and navigation are assembled, and which scope each route belongs to. The navigation **contents** (which leaves, in which order) are owned by docs 01 and 10.

### A. Layers

```
src/
  main.tsx                     boot, stale-chunk recovery (keep as is)
  App.tsx                      providers (QueryClient, Tooltip, Auth, Branding, Vessel); edit only in platform PRs
  app/                         NEW: composition root, edited in platform PRs only
    registry/
      types.ts                 ModuleManifest, RouteDef, NavFragment, AlertRoute, BadgeProvider, RecordKindRef
      modules.ts               collects every src/modules/*/module.ts with import.meta.glob (eager, manifests are light)
    router/
      AppRouter.tsx            builds <Routes> once from the registry; replaces the body of src/routes/index.tsx
      lazyPage.tsx             the single lazy + Suspense + guard + error boundary helper
      scopes.tsx               layout routes: FleetScope, VesselScopeRoute (doc 01), WorkspaceScope, PersonalScope, PublicScope
      legacyRedirects.ts       old URL -> new URL table (one release), data only
      placeholders.ts          Coming-Soon routes generated only for nav leaves with status 'planned'
  config/
    navSlots.ts                NEW: fixed slot order for the shell (Fleet groups, Vessel tab order, workspaces) — doc 10 owns
    sitemap.ts                 becomes an assembler: slots + module nav fragments + shared builders L()/G()
    navigation-types.ts        NavChild gains capability, status, scope, badgeKey, moduleSetting (doc 10)
  modules/<module>/            one folder per bounded module, see B
  shared/                      primitives used by 3+ modules (layout, states, pickers, notify, form helpers)
  lib/                         framework-free engines: pdf/, export/, storage/, records/ (doc 08), permissions/ (PMS)
  integrations/supabase/       client.ts, types.ts, previewAuthStorage.ts: generated, never hand-edited
                               pending.ts: NEW, hand-written, the typed shim for tables not yet in types.ts
  test/
    harness/                   NEW: promoted from src/test/hris/{state,supabaseMock,harness}
    config/                    sitemap, registry, pending-table and migration invariants
    <module>/                  page smoke tests and wiring tests per module
supabase/
  migrations/                  <YYYYMMDDHHMMSS>_<module>_<topic>.sql, see Data model and W1
  MIGRATIONS-LEDGER.md         NEW: which hand-written files are applied where, and their Lovable copies
  functions/_shared/           NEW helpers: cors.ts, json.ts, auth.ts (caller + company + capability), errors.ts
  functions/<module>-<verb>/   one folder per function
docs/
  <MODULE>.md                  per-module map, access model, go-live checklist (pattern: docs/HRIS.md, docs/HEALTH.md)
  blueprint/gap/               this series
```

### B. Module anatomy (every new or rebuilt module)

```
src/modules/<module>/
  module.ts          manifest: id, scopes, routes (data), nav fragments, alert routes, badge providers,
                     record kinds (doc 08), calendar sources, dashboard tiles. No JSX, no page imports.
  paths.ts           path constants and builders; relative to the scope root for vessel modules
  index.ts           public API: the only file other modules may import from
  types/
    domain.ts        status unions, view models
    db.pending.ts    row/insert/update types for tables not yet in types.ts (deleted after regen)
  lib/               pure logic: zod schemas, state machines, calculators, formatters; *.test.ts colocated
  services/          optional: multi-step Supabase or edge-function calls with no React
  hooks/             React Query hooks; one file per entity; exports a key factory
  components/        module components; nothing shared by 3+ modules (promote to src/shared)
  pages/             route components; never render DashboardLayout themselves
```

### C. Route scopes

| Scope | Prefix | Layout route | Guard | Who reaches it | Owner |
|---|---|---|---|---|---|
| Public | `/auth`, `/reset-password`, `/accept-invite/:token` | none | none | anyone | doc 01 |
| External viewer | `/x/:token/…` | minimal shell | token + authenticator | invited viewer | docs 01, 06 |
| Personal | `/me/…` | `PersonalScope` | login | every user | doc 01 |
| Fleet | `/fleet/…` | `FleetScope` → `AppShell scope="fleet"` | login + fleet reach + leaf capability (except the five live `/fleet/admin` pages, which stay login + fleet reach until doc 03 lands: DECISIONS D-33) | owner, admins, shore staff with fleet access | docs 01, 02, 03 |
| Vessel | `/v/:vesselCode/…` | `VesselScopeRoute` → `AppShell scope="vessel"` | login + vessel reach + module on for vessel + leaf capability | anyone assigned to or with reach over that vessel | docs 01, 04–07 |
| Workspaces | `/hris/…`, `/health/…`, `/yard/…`, `/shoreside/…`, `/departments/legal/…` | `WorkspaceScope` (existing shells kept: `RefitShell`, `NewBuildShell`, `LegalShell`) | login + module capability | per module | existing modules |

Rules:

- Vessel-module routes are declared **relative** (`crew/list`, `safety/permits/:permitId`) and mounted under `/v/:vesselCode`. Links are built with `useScopedPath()` (NEW, `src/app/router/scopes.tsx`) so a page never hard-codes a vessel code.
- The layout route renders the shell once per scope and an `<Outlet/>` for the page. Today every HRIS and Health page mounts its own `DashboardLayout`, so the shell remounts on every navigation; every legacy page also renders `DashboardLayout` inside itself (about 90 page files). Make `DashboardLayout` idempotent during the transition: if a `ShellContext` is already present it returns `children` only, so legacy pages can move under layout routes without editing them.
- Placeholder routes are generated only for nav leaves whose `status` is `planned` and whose path no registered route pattern matches. This retires the `IMPLEMENTED_PREFIXES` workaround in `sitemap.ts` (static placeholder paths outranking dynamic routes).
- Legacy URLs (`/crew/list`, `/ism/*`, `/certificates`, `/vessel/:slug/*`, `/users-access` …) redirect for one release via `legacyRedirects.ts`; the target table is in doc 01.

### D. Registration flow (how a module plugs in without touching shared files)

```
src/modules/crew/module.ts ──┐
src/modules/safety/module.ts ─┼─ import.meta.glob ─► app/registry/modules.ts ─┬─► app/router/AppRouter.tsx   (routes)
src/modules/<m>/module.ts ────┘                                              ├─► config/sitemap.ts           (nav fragments into navSlots)
                                                                             ├─► lib/records/registry.ts      (record kinds, doc 08)
                                                                             ├─► notifications deep links     (one map)
                                                                             ├─► sidebar badge counts         (one registry)
                                                                             └─► test/config/registry.test.ts (invariants)
```

Adding a module after Phase 0 means adding a folder. No shared file changes, except the one-time slot definition in `navSlots.ts` if the module needs a brand-new slot.

---

## Feature inventory

Status here describes the platform capability, not a domain feature. "Blueprint §" points at the exec-summary item or section the capability serves.

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| **A** | **Repository and module anatomy** | | | | | | |
| A1 | Standard module anatomy (manifest, paths, routes, types, lib, hooks, components, pages, docs) | Exec (module list) | partial | HRIS, Health, Legal follow most of it (`paths.ts`, `routes.tsx`, colocated `lib/*.test.ts`); 28 older modules do not | Written standard (this doc) applied to every new module and to any module a stream rebuilds; scaffold script `scripts/new-module.mjs` | P0 | S |
| A2 | Module manifest and auto-registration | Exec (build order) | missing | Routes in `src/routes/index.tsx` + 5 module route files; nav in `src/config/sitemap.ts` | `module.ts` per module; `src/app/registry/modules.ts` via `import.meta.glob`; `AppRouter`, sitemap, notification links and badges read the registry | P0 | M |
| A3 | Module import boundaries | — | partial | 23 `index.ts` barrels, unenforced; 231 files import `auth`, 75 import `vessels`, 22 import `crew` | ESLint `no-restricted-imports` blocking deep imports into another module (`@/modules/x/*` except `@/modules/x` and `@/modules/x/paths`); allow-list for `auth` and `vessels` until doc 01 lands | P2 | S |
| A4 | Module documentation and go-live checklist | — | partial | `docs/HRIS.md`, `docs/HEALTH.md`, `docs/LEGAL.md`, `docs/LOGBOOKS.md` | `docs/<MODULE>.md` per module with routes, access model, tables, engines, go-live steps; linked from README | P1 | S per module |
| A5 | Dead code removed | — | partial | `pages/`, `routes/` at repo root (prose, lint-ignored); `src/lib/api/**` (no importers); unused `VesselToggleBar`, `HeaderQuickActions`, `GlobalHeaderControls`, `AdaptiveActionBar`, `shared/components/NavLink`, `components/ui/sidebar`, `usePDFExport`; `_unused_legacy` in `navigation.ts`; `sign-submission` edge function on dead `sms_*` tables | Delete in one platform PR before streams start, so nobody extends dead code | P2 | S |
| **B** | **Routing, scope and shell** | | | | | | |
| B1 | One lazy-page helper; lazies hoisted | — | partial | `page()` helpers in `hris/routes.tsx`, `health/routes.tsx`, `legal/routes.tsx`; 42 inline `React.createElement(React.lazy())` and three fallback styles in `src/routes/index.tsx` | `src/app/router/lazyPage.tsx` (lazy created once at module scope, `LazyLoader` fallback, per-route `ErrorBoundary` keyed on path, optional guard); migrate the 42 inline lazies | P1 | S |
| B2 | Layout routes: shell mounted once per scope | §1.3 | missing | Each page or route wraps `DashboardLayout`; `DashboardFilterProvider` lives inside `DashboardLayout` | Scope layout routes with `<Outlet/>`; `ShellContext` makes `DashboardLayout` a no-op when nested; move `DashboardFilterProvider` to the scope layout | P0 | M |
| B3 | Scope routes `/fleet`, `/v/:vesselCode`, `/me`, workspaces | §1.3, §1.5 | missing | `/vessel/:vesselSlug/*` (5 routes, slug from name); vessel from `localStorage` | `scopes.tsx` with the guards in IA table C; contract and redirects in doc 01 | P0 | L |
| B4 | Vessel code and scoped path builders | §1.6 | missing | `vessels` has no `code`; `vessels/lib/vesselSlug.ts` derives a slug from the name | `vessels.code` (doc 01 migration); `useScopedPath()`, `vesselPath(code, rel)`; pages never build vessel URLs by hand | P0 | S |
| B5 | Legacy redirect table | §1.5 | partial | About 20 `<Navigate>` routes scattered in `src/routes/index.tsx` | `legacyRedirects.ts` (data), with a test that every old sitemap `existing` path still resolves | P1 | S |
| B6 | Nav leaf lifecycle and placeholder policy | Exec | partial | `PLACEHOLDER_LEAVES` turns every unbuilt leaf under six prefixes into Coming Soon; 167 placeholders reachable (doc 10) | `status: 'planned' \| 'beta' \| 'live'` on `NavChild`; planned leaves hidden from non-admins or shown with a chip (doc 10 decides); tests enforce W3 | P1 | S |
| B7 | Refit nav paths fixed | — | partial (bug) | `sitemap.ts` `yardRefit` calls ``L('Dashboard', `${refitOverview}/dashboard`)``, producing `/yard/refit/overview/dashboard/dashboard` | Pass `existing` (or slug-less base) for all 32 leaves; add a test rejecting repeated consecutive path segments | P0 | S |
| B8 | Route/nav invariants tests on the registry | — | partial | `src/test/config/sitemap.test.ts`, `sitemapTargets.test.ts` (regex over `path="…"` in route files), module wiring tests | Rewrite to import the registry: every live leaf resolves to a registered route; no planned leaf has one; no duplicate paths; every route declares a guard | P1 | S |
| **C** | **Access control plumbing** | | | | | | |
| C1 | Route guard by capability | Exec engine 4, §2 | partial | `ModuleRoute` (HRIS, Health, `/hr` only) with one prop per domain; most routes `ProtectedRoute` (login only) | Generic guard: `RouteDef.capability` (PMS key) or interim `{ moduleKey, level }`; deny renders `AccessDenied` (exists in `ModuleRoute.tsx`); no new props per domain | P0 | M |
| C2 | Nav gating fails closed | Exec engine 4 | partial (bug) | `SidebarNavigation.canShow`: `if (!rbacInitialized) return true` for generic `moduleKey` leaves | Return `false` while loading, matching `canAccessModule` | P1 | S |
| C3 | Capability runtime (PMS v1: `useCan`, `<Can>`, `has_capability`) | §2, §2.5 | missing | Catalogue drafted (`docs/permissions/catalogues/storm.json`, 1,431 capabilities); five resolvers in `src/modules/auth/lib/`; client-only `rbacMatrix.ts` used by `useUserRoles` | Built by doc 01. Platform contract here: an interim `useCan(key)` adaptor that maps catalogue keys to today's `moduleKey`/level so domain streams code against the final API now | P0 | XL (S for adaptor) |
| C4 | Vessel-scoped permissions in the client | §2.2 | partial | `permissionsStore.currentVesselId` never set; `VesselContext` decides all-vessel access from `profiles.role` only | `VesselScopeRoute` calls `setCurrentVessel` and reloads capabilities per vessel; replace `ALL_VESSELS_ROLES` with a fleet-reach capability (doc 01) | P0 | M |
| C5 | SQL helper for vessel reach | §2 | missing | `has_role_on_vessel`, `has_fleet_access`, `user_belongs_to_company`; no assignment-based reach helper | `user_can_reach_vessel(_user uuid, _vessel uuid)` (fleet access, current assignment or membership); every vessel-view table policy uses it (doc 01 owns the membership model) | P0 | M |
| C6 | Edge function authorisation helper | Exec engine 4 | partial | Each unmigrated function calls `auth.getUser(token)` or `getClaims(token)`, then checks literal `profiles.role` lists (`generate-travel-letter`, `update-familiarization`, `review-certificate`, …). `send-invitation`, `bulk-invite`, `admin-actions`, `create-crew-member`, `accept-invitation` and `send-email` are migrated to the shared helpers (D-130: `getAuthContext` and `assertCapability` where a user calls). `parse-crew-csv` and `update-crew-assignment` are retired, not migrated (D-191) | `_shared/auth.ts`: `getCaller(req)`, `assertCompanyMember`, `assertCapability(caller, key, ctx)` calling the SQL helper with the caller's JWT | P1 | M |
| **D** | **Data access and types** | | | | | | |
| D1 | Generated types as the single source; regeneration owner and procedure | — | partial | Lovable regenerates `types.ts` from live; hand-patches collided (TS OOM, commits `dc7a417`, `5a4085b`) | W2 below: one owner, regen-only PRs, never hand-edit, never resolve a `types.ts` conflict by hand | P0 | S |
| D2 | Typed shim for pending tables, with a ratchet | — | missing | `refit/lib/db.ts` (`supabase as unknown as any` + hand-written rows); `work-rest/services/workRestService.ts` (`sb = supabase as any`); 82 `.from('x' as any)` | `src/integrations/supabase/pending.ts` + per-module `types/db.pending.ts`; test fails when a pending table appears in `types.ts` (shim must be deleted) or when `as any` on the client appears outside a pending module | P0 | S |
| D3 | Stale `any` casts removed where tables are now typed | — | partial | `workRestService.ts`, `MyWorkRestMonth.tsx`, `useLeavePolicy.ts`, `useCrewLeave.ts`, `rotation-planner/hooks/usePlannerData.ts` (12), `ImportDialog.tsx` (8), `settings/components/sections/*` (24) | Replace with `Tables<'…'>`; part of the stream that owns each module | P1 | M |
| D4 | React Query conventions | — | partial | Used in 136 module files; `staleTime` set locally in 120 places; work-rest uses `useState` + services; no key-factory standard | Key factory per module (`crewKeys.list(vesselId)`), scope ids always in the key, invalidate by prefix, global defaults kept (30 s stale, 1 retry) | P1 | S |
| D5 | Form conventions and drafts | §7.12 | partial | RHF in 44 files, `zodResolver` in 10 (HRIS only); `blankToNull` re-implemented per module; no autosave | RHF + zod schema in `lib/<entity>Schema.ts`; shared field helpers in `src/shared/lib/form.ts`; `useDraft(recordKey)` autosave (local, then server draft for workflow records, doc 08) | P1 | M |
| D6 | Person identity rule | Exec (core entities) | partial | `profiles.id` vs nullable `profiles.user_id` both used as FKs; 543 of 557 profiles have no login *(audit)* | Subjects (the person a record is about) key on `profile_id → profiles.id`; actors (`created_by`, `signed_by`) key on `profiles.user_id` / `auth.uid()`; health subjects on `hw_people.id`. Review checklist item | P0 | S |
| D7 | Shared page states; no mock fallbacks | — | partial | `health/components/HealthStates.tsx` (Loading, Error, Empty, ClinicalNotice); `Drawings.tsx` substitutes mock rows on error *(audit)* | Promote to `src/shared/components/states/` (`PageLoading`, `PageError`, `PageEmpty`, `AccessDenied`, `ModuleOff`, `VesselArchived`); lint rule or test banning mock constants in `pages/` | P1 | S |
| **E** | **Database conventions** | | | | | | |
| E1 | Migration naming, unique versions, idempotency, CI check | — | partial | Two naming styles; duplicate version `20260919120000`; hand-written files mostly idempotent | `<ts>_<module>_<topic>.sql`; per-stream timestamp blocks (Implementation notes); CI test: unique 14-digit prefix, name pattern, no `USING (true)` / `WITH CHECK (true)` for `authenticated`, `ENABLE ROW LEVEL SECURITY` after every `CREATE TABLE` | P0 | S |
| E2 | Applied-migrations ledger and a staging database | — | missing | Live state known only from ad hoc SQL; nb/sign-up fixes unverified live | `supabase/MIGRATIONS-LEDGER.md` (file, status per environment, Lovable copy name, applied by, date); a staging Supabase project or branch where every migration lands first | P0 | M |
| E3 | RLS template and helper naming | Exec engine 4 | partial | `<domain>_can_view/edit/admin`, `user_belongs_to_company`, `my_profile_id`, `WITH CHECK` in HRIS/Health/Legal; New Build shipped `USING (true)` (repo fix `20260919170000`) | Template in Implementation notes; TS mirror of every helper in `src/modules/auth/lib/<domain>Access.ts` with tests (pattern exists) until PMS replaces them | P0 | S |
| E4 | Server-owned workflow pattern | Exec engines 2–3, §8 | partial | `20260919210000_ism_form_workflow.sql` (BEFORE trigger owns status, numbering, hash, lock; `form_sign_submission`/`form_reject_submission` RPCs; signatures append-only); `20260919220000_reference_numbers.sql` (`next_reference_value(scope)`) | Generalised by doc 08 (`record_transition`); every new workflow table follows it: client names the action, the database decides the state | P0 | (doc 08) |
| E5 | Fresh replay and DB test job | — | missing | Replay fails on the HRIS uuid/text `audit_logs` policy (`docs/HEALTH.md`); Health engines were proven on a local PostgreSQL by hand | Fix the two HRIS files with a new forward-only migration plus a guarded fix; CI job: start Postgres, apply all migrations, run SQL assertion files `supabase/tests/*.sql` (RLS matrix per T2/T3 table, two companies) | P1 | L |
| E6 | Table prefix registry | — | partial | Prefixes in use: `hr_`, `hw_`, `med_`, `spa_`, `nut_`, `physio_`, `pt_`, `legal_`, `logbook_`, `nb_`, `rf_`, `frp_`, `work_rest_`, `form_`; dead `sms_*` | Registry table in this doc; new domains pick a prefix before writing SQL; never reuse `sms_` | P2 | S |
| **F** | **Edge functions** | | | | | | |
| F1 | `_shared` helpers | Exec engines 4, 7 | partial | `_shared/invite-helpers.ts` only; CORS and JSON helpers copied in each function | `cors.ts`, `json.ts`, `auth.ts`, `errors.ts`, `rateLimit.ts` (token flows like `accept-invitation`) | P1 | S |
| F2 | `verify_jwt` policy and per-function auth checklist | — | partial | 26 functions `verify_jwt = false`; `pt-exercise-import` absent from `config.toml` (gateway default applies); `send-email` does not authenticate the caller (doc 08) | Default `verify_jwt = true` for every new user-called function (no `config.toml` entry needed); `false` only for webhooks, token flows and sweepers, each listed with its own check | P1 | S |
| F3 | Scheduled jobs registry | Exec engines 1, 7 | partial | `legal-generate-alerts` on pg_cron *(audit)*; `hr_generate_alerts`, `hw_generate_alerts`; `hr-daily-sweeper` HTTP function; HR cron jobs declared but unscheduled *(audit)* | `docs/JOBS.md` + one migration that schedules all sweepers; every engine that needs a sweep registers here (expiry, notifications, retention) | P1 | S |
| **G** | **Shared UI infrastructure** | | | | | | |
| G1 | One toast system | — | partial | Both `Toaster` and `Sonner` mounted in `App.tsx`; 150 vs 38 files | `src/shared/lib/notify.ts` wrapper used by all new code; migrate opportunistically; choose backend (Open questions) | P2 | M |
| G2 | Shared pickers (person, vessel, position) | — | partial | `health/components/PersonPicker.tsx`; crew pickers elsewhere unsorted (T-166) | Promote to `src/shared/components/pickers/`: searchable, sorted by rank then name, filters by vessel and status | P1 | S |
| G3 | Status tone registry and `StatusPill` | Exec engine 1, §6 | missing | 25 local colour helpers (doc 10) | Doc 10 DS12 (`src/shared/design/statusTone.ts`); modules register their status vocabularies in the manifest | P0 | (doc 10) |
| G4 | Client error capture | — | partial | Three error-boundary layers (`App.tsx`, routes, `ProtectedRoute` keyed on path); `componentDidCatch` logs to console only | Report to a store with error id, route, build, browser (scrubbed); fallback keeps unsaved input (D5) and offers "Report this" (doc 09 SUP7, T-92) | P1 | M |
| G5 | One notification deep-link map | Exec engine 7 | partial | `notifications/lib/notificationLinks.ts` (keyword routes) vs `NotificationBell.tsx` (second map) | Registry fed by manifests `alertRoutes` (entity type → path builder using vessel code); delete both maps | P1 | S |
| G6 | Badge-count registry | §1.3 | partial | `shared/hooks/useSidebarBadgeCounts.ts` (3 keys) | Manifests register `badgeKey → count query`; nav nodes reference `badgeKey` (doc 10 IA21) | P2 | S |
| **H** | **Exports and files** | | | | | | |
| H1 | Record PDF builder | Exec engine 5, §7.4, §8.8 | partial | `src/lib/pdf/pdfTemplate.ts` (header, branding, footer watermark) used by HRIS, Legal, Logbooks, Work & Rest, rotation planner, New Build; `documentExport.ts` separate | Doc 08 EX2 (`src/lib/pdf/templates/` per record kind, signature blocks, vessel seal, page x of y); keep `jspdf` + `jspdf-autotable`, lazy-loaded | P0 | (doc 08) |
| H2 | Tabular export standard | Exec engine 5, §7.4 | partial | `exceljs` (1 file), SheetJS `xlsx` 0.18 (2 files), `papaparse` (4 files) | `src/lib/export/` with `toCsv`, `toXlsx` (exceljs only, dynamic import so the 938 kB chunk loads on click), filename convention `<vesselCode>-<kind>-<yyyymmdd>` | P2 | M |
| H3 | Upload standard | Exec engine 6, §7.5 | partial | `lib/storage/crewDocuments.ts` (bucket, path builder, 1 h signed URLs) is the best pattern; client limits 2 MB (branding), 5 MB (CSV), 10 MB (incident), 25 MB (documents); New Build buckets 50 MB server-side | `src/lib/storage/upload.ts` + `FileDropzone`: 50 MB limit enforced client and bucket side, mime allow-list per bucket, path `<company_id>/<vessel_id|fleet>/<module>/<record_id>/<uuid>-<name>`, image/PDF preview with thumbnail (T-107) | P1 | M |
| **I** | **Quality gates** | | | | | | |
| I1 | CI runs lint, typecheck, test, build | — | complete | `.github/workflows/ci.yml` (`check` job + Python preflight job), green today | Keep; add the gates below | — | — |
| I2 | Lint warning ratchet | — | missing | 839 warnings, `no-explicit-any` is a warning, `no-unused-vars` off | `scripts/lint-ratchet.mjs` comparing per-rule counts to `lint-baseline.json`; fails if any rule grows; `no-explicit-any` as error for files under new modules | P1 | S |
| I3 | Strict TypeScript for new code | — | missing | `strict: false`, `noImplicitAny: false`, `strictNullChecks: false` | `tsconfig.strict.json` including new and rebuilt modules (start with `hris`, `legal`, `health` which have no `as any`); CI step with `--incremental` cache to keep the 8 GB, multi-minute run affordable | P1 | S |
| I4 | Shared test harness and templates | — | partial | `src/test/hris/state.ts` (mock proxy that avoids the vi.mock deadlock), `supabaseMock.ts`, `harness.tsx`; Health harness reuses HRIS state | Promote to `src/test/harness/`; templates: `wiring.test.ts` (nav → routes → pages → tables/RPCs/buckets/functions exist in migrations), `pages.smoke.test.tsx` (empty and populated fixtures per role) | P1 | S |
| I5 | PMS coverage and registry checks in CI | §2 | partial | `check-storm-coverage.mjs` passes 246/246 but is not in CI | Add to `npm run check`; extend to route capabilities once C3 lands | P2 | S |
| I6 | Bundle budget | — | missing | `excel` 938 kB, `index` 664 kB, `pdf-gen` 591 kB | Size check on build output (fail if entry chunk grows >10 %); `exceljs`, `jspdf`, `recharts`, `leaflet` only via dynamic import | P2 | S |
| I7 | Browser smoke tests for top journeys | — | missing | None | Playwright against a seeded staging project: sign in, switch vessel, open each module home, submit and sign one form | P2 | M |
| **J** | **Delivery, environments and Lovable** | | | | | | |
| J1 | Lovable sync guard, branch protection, CODEOWNERS | — | partial | Decision of 19 Sep: CI-driven deploy, Lovable for prototyping; the bot still commits to `main` (6 Nov) and once overwrote merged PR files *(audit)* | Lovable works on its own branch merged by PR; branch protection requiring the `check` job; `.github/CODEOWNERS` assigning hotspot files (Implementation notes) | P0 | S |
| J2 | Lockfile policy | — | partial | `bun.lock` and `package-lock.json` both present; CI uses `npm ci`; drift broke installs before (HRIS-AUDIT 4.7) | Dependency changes only in platform PRs; update both lockfiles in the same commit, or drop one (Open questions) | P2 | S |
| J3 | README and contributor guide | — | missing | README is Lovable boilerplate (`REPLACE_WITH_PROJECT_ID`) | Setup, environments, module map, how a migration reaches production, Lovable rules, link to this doc | P1 | S |
| J4 | Beta flags and per-vessel module toggles | §1.3 | missing | None (T-10 asked for leave screens to be hidden per vessel) | Nav `status: 'beta'` + capability for incremental release; per-vessel module settings owned by doc 03 | P1 | M |
| J5 | Resilience basics (boundaries, query defaults, stale-chunk recovery) | — | complete (fixed in the Phase 0 audit) | `App.tsx` (boundaries, `staleTime` 30 s, `retry` 1), `main.tsx` (reload loop guard and recovery panel), `src/app/router/lazyPage.tsx`. The Phase 0 audit found the `main.tsx` reload guard was reset at every boot, so its cap never tripped, and that a lazy page never retried a failed chunk. The fix bounds automatic reloads (`MAX_RELOADS` within a time window, then the recovery panel) and lets Try again or a navigation retry the page chunk | Keep; add error reporting (G4) | — | — |
| **K** | **No fabricated data** | | | | | | |
| K1 | Mocked pages removed or replaced | — | placeholder | `ism/pages/PermitsToWorkPage.tsx` (`mockPermits`, sidebar-linked), `ObservationsPage.tsx`, `maintenance/pages/CriticalEquipment.tsx`, `documents/pages/{Manuals,Policies,Procedures}.tsx`, `vessels/pages/CompanyDetails.tsx`, `settings/pages/APIIntegrations.tsx`, `drills/components/EquipmentReadinessTab.tsx` | Owning domain stream replaces each with the real page or `status: 'planned'`; test bans `const mock*`/`SAMPLE_*` in `src/modules/*/pages` | P0 | S per page |

---

## Workflows & state machines

These are the engineering workflows every stream follows. "Who can act" uses roles in the build team, not product roles.

### W1. Schema change (migration) lifecycle

States: `drafted` → `reviewed` → `merged` → `applied_staging` → `verified` → `applied_live` → `types_regenerated` → `shim_removed`.

| Transition | Who | Rule |
|---|---|---|
| drafted → reviewed | stream engineer opens PR; DB owner reviews | File name `<ts>_<module>_<topic>.sql` inside the stream's timestamp block; idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING`); RLS enabled and at least one policy per table; no `USING (true)`; header comment states purpose, tables, helpers, and the TS mirror file. CI migration checks pass (E1). |
| reviewed → merged | DB owner approves; CODEOWNERS for `supabase/migrations/**` | Pending types added in the same PR (`types/db.pending.ts`), never in `types.ts`. |
| merged → applied_staging | integrator, during the integration train | Applied in version order with the CLI or SQL editor; ledger row added. |
| applied_staging → verified | stream engineer | SQL assertion file (`supabase/tests/<module>.sql`) passes for two companies and each role; app smoke run against staging. |
| verified → applied_live | DB owner with product-owner approval for anything touching personal data or existing rows | Ledger updated with date and any Lovable copy file name that appears. |
| applied_live → types_regenerated | types owner (W2) | Regen-only PR. |
| types_regenerated → shim_removed | stream engineer | The pending-table test fails until the shim entry is deleted. |

Delete and edit rules: a migration is never edited or deleted once `applied_staging`; corrections are new forward-only migrations. A Lovable copy of an applied hand-written file is kept (deleting it desynchronises Lovable's history) and recorded in the ledger. Notifications: the PR check list is the notification; the ledger is the record.

### W2. Generated types regeneration

States: `stale` (a migration is live but not in `types.ts`) → `regen_pr_open` → `merged`.

- Trigger: any `applied_live` event, or a Lovable sync that touched `types.ts`.
- Who: one named types owner per week (rotating among platform engineers).
- How: `supabase gen types typescript --project-id <project-id> > src/integrations/supabase/types.ts` against live (or let Lovable's sync land it on its branch), in a PR that changes nothing else.
- Merge conflicts on `types.ts` are never resolved by hand: take `main`'s version and regenerate. Hand edits are rejected in review (CODEOWNERS on the file).
- After merge, the pending-table ratchet (D2) turns red in every module whose shim is now redundant; those streams remove it.

### W3. Navigation leaf and page lifecycle

States: `planned` → `beta` → `live` → `deprecated` → `removed`.

| State | Route | Nav | Test rule |
|---|---|---|---|
| planned | generated placeholder | hidden from non-admins, or shown with a "Planned" chip (doc 10) | must **not** have a registered real route |
| beta | real page | visible only to holders of the beta capability or to listed vessels | must resolve to a registered route with a guard |
| live | real page | visible per capability | must resolve; must not resolve to a placeholder |
| deprecated | redirect in `legacyRedirects.ts` | removed from nav | redirect target must resolve |
| removed | 404 | none | path absent from nav and redirects |

Who: the owning stream moves its own leaves; the platform shell owner only changes slots. Moving to `live` requires the module's wiring and smoke tests to pass and no mock constants in its pages.

### W4. Change flow (branches, PRs, Lovable)

States: `branch` → `pr_open` → `checks_green` → `approved` → `merged` → `deployed`.

- Branch per stream task: `stream/<doc>-<topic>` (for example `stream/05-permits`). One PR touches one module folder, its migrations, its tests and at most a registration line; anything else needs the hotspot owner's review.
- Checks: lint (and ratchet), typecheck (and strict config), tests, build, migration checks, registry invariants.
- Approvals: one reviewer from the stream; plus CODEOWNERS for any hotspot file.
- Lovable: edits happen on a `lovable` branch and arrive by PR like any other change. If Lovable must stay on `main`, the build-out streams pause merges while a Lovable session is active and rebase immediately after (Open questions).
- Rebase onto `main` at least daily; never merge `main` into a stream branch with a `types.ts` conflict (W2 rule).

### W5. Edge function lifecycle

States: `authored` → `configured` → `deployed_staging` → `secrets_set` → `deployed_live`.

- authored: folder `supabase/functions/<module>-<verb>/index.ts` using `_shared/{cors,json,auth,errors}.ts`; the header comment states caller type (user JWT, service, webhook, token), required capability and side effects.
- configured: no `config.toml` entry when the gateway should verify the JWT (default). An entry with `verify_jwt = false` only for webhooks, token flows and sweepers, each of which must authenticate itself (shared secret, signed token, or service key) and is listed in `docs/JOBS.md` or the function header.
- deployed / secrets: secret names only in `.env.example`-style docs, values never in the repo. The ledger lists deployments per environment.
- Delete rule: a function invoked from the client is never deleted while a call site exists (wiring test checks `functions.invoke('<name>')` against the functions directory).

### W6. Capability lifecycle (bridging to PMS v1)

States: `proposed` → `catalogued` → `seeded` → `enforced_ui` → `enforced_db` → `signed_off`.

- proposed: the stream lists the capabilities its pages and actions need in `module.ts` (`capabilities` array using PMS key syntax `domain.module.subcategory.action`).
- catalogued: added to the module's fragment of the catalogue (`docs/permissions/catalogues/storm/<module>.json`, split from `storm.json` in Phase 0 so streams do not edit one large JSON file); `build-matrix-workbooks.mjs --check` passes.
- seeded: generated seed migration (never hand-edited, per the PMS master prompt).
- enforced_ui: route `capability`, nav `capability`, `<Can>` on actions. Until doc 01 ships the runtime, the interim `useCan` adaptor maps keys to `moduleKey`/level.
- enforced_db: RLS uses the domain helper (today) or `has_capability` (after PMS); UI gating alone is never the control.
- signed_off: product owner reviews the regenerated workbook.

### W7. Release and rollback

States: `main_green` → `staging_deployed` → `smoke_passed` → `production_deployed`; failure path `rollback`.

- Release from a tagged `main` commit. Front-end rollback: redeploy the previous tag (or Lovable version history while Lovable hosts). Database rollback: forward-fix migration only; never drop live data to roll back.
- A release that includes migrations is only cut after those migrations are `applied_live` and types regenerated, so the front end never ships ahead of its schema.

### W8. Integration train (weekly, for parallel streams)

1. Freeze stream merges for the train window (about two hours).
2. Integrator applies all newly merged migrations to staging in version order; runs SQL assertions.
3. Types owner regenerates against staging and opens the regen PR; streams remove redundant shims.
4. Smoke and Playwright journeys on staging.
5. DB owner applies the same set live; ledger updated; release cut per W7.
6. Unfreeze.

---

## Data model

Platform-level entities only; domain entities are in docs 01–10.

| Entity | Key fields | Existing STORM table(s) | Notes |
|---|---|---|---|
| Tenant (account) | id, name, display name, branding (logo URL, brand colour) | `companies` | Root of every predicate. Only service role may insert since `20260919170100_signup_backstop.sql` (live state unverified). |
| Vessel | id, company_id, name, **code (NEW)**, imo_number, mmsi, flag_state, status, operational_status, fleet_group_id, particulars (jsonb) | `vessels` | `code`: 3 lower-case letters, unique per company, immutable once records are numbered with it (doc 01). Two organisational pseudo-vessels exist in live data *(audit)*; pickers must filter them by a flag, not by name. |
| Person | id (subject key), user_id (nullable login), company_id, role (legacy, display only after PMS), rank, department | `profiles` | Rule D6: subjects key on `profiles.id`; actors on `profiles.user_id`. |
| Vessel reach | user_id, vessel_id, is_current, valid dates | `crew_assignments`; NEW membership model in doc 01 | Feeds `user_can_reach_vessel` (C5, NEW function). |
| RBAC registry | key, name, route, sort_order, is_active (+ PMS columns: domain, module_group, subcategory, action, sensitivity, …) | `modules`, `roles`, `role_permissions`, `rbac_user_roles`, `user_permission_overrides`, `permission_audit_log` | PMS extends `modules` rather than adding a catalogue table (addendum). Fine-grained flags are `modules` rows such as `crew.*`, `medical.*`, `finance.*`. |
| Access set / assignment | access_set_id, grants (capability, scope), user, unit, department, rank, validity | NEW: `access_sets`, `access_set_grants`, `user_access_assignments` | Doc 01 (PMS v1). |
| Reference counter | scope (text), next_value | `reference_counters` + `next_reference_value(scope)`; `form_submission_counters` | Use for every human-readable reference (`DRA-PTW-2026-061` style per §1.6, format owned by doc 08). Never compute numbers in the browser. |
| Record kind / envelope | kind key, module, prefix, status vocabulary, signature template, delete rule; envelope per record | NEW: `record_kinds`, `record_envelopes` (doc 08) | TS side seeded from module manifests (`recordKinds`). |
| Alert / notification | company_id, vessel_id, source_module, related_entity_type, related_entity_id, severity, status | `alerts`, `notification_types`, `notification_subscriptions`, `user_notification_preferences`, `notification_logs` (written, never read) | Generators: `hr_generate_alerts`, `hw_generate_alerts`, `legal_generate_alerts`. Emit contract in docs 03 and 08. |
| Audit trail | actor, action, entity, before/after, at | `audit_logs`, `admin_action_log`, `permission_audit_log`, `hr_record_access_log`, `hw_record_access_log`, `activity_log` (unused) | Fragmented; doc 08 F defines the per-record trail. |
| Retention registration | record type, record id, retention policy, archive due | `data_retention_policies`, `hr_record_metadata` via `hr_register_record` | Health already registers clinical records here; every personal-data table should. |
| File object | bucket, path, size, mime, owner record | Storage buckets (10+ live *(audit)*, more in migrations) | Path convention in H3; bucket per domain; private by default. |
| Client error event | error id, fingerprint, route, build, browser, user, scrubbed message, created_at | NEW: `client_error_events` (doc 09 SUP7) | Feeds G4. Insert-only for authenticated; readable by platform admins. |
| Beta/feature flag | company_id, key, enabled, audience (vessels, capability) | NEW: `feature_flags` (or reuse doc 03 vessel module settings) | Supports W3 `beta`. Keep tiny; do not build a flag platform. |
| Pending table shim (code) | table name, Row/Insert/Update types | NEW: `src/integrations/supabase/pending.ts`, `src/modules/<m>/types/db.pending.ts` | Deleted per table after regen (D2). |
| Module manifest (code) | id, scopes, routes, nav, capabilities, recordKinds, alertRoutes, badges, calendarSources, dashboardTiles | NEW: `src/modules/<m>/module.ts` | The single registration point per module. |
| Migration ledger (file) | file, version, env, applied at, applied by, Lovable copy | NEW: `supabase/MIGRATIONS-LEDGER.md` | Answers "is this live?" without querying production. |

### Table prefix registry

| Prefix | Module | Status |
|---|---|---|
| `hr_` | HRIS | live |
| `hw_`, `med_`, `spa_`, `nut_`, `physio_`, `pt_` | Health & Wellness | in `types.ts` (Lovable copies present) |
| `legal_` | Legal | live |
| `logbook_` | Electronic logbooks | live |
| `nb_` | New Build | live; company-scope fix pending verification |
| `rf_` | Refit | **no schema anywhere**; import decided 19 Sep |
| `frp_` | Rotation planner | live |
| `work_rest_`, `vessel_work_rest_settings` | Hours of work and rest | in `types.ts` |
| `form_` | ISM forms engine | live |
| `sms_` | dead parallel forms schema | do not reuse; drop is a separate decision |
| New domains | pick before writing SQL, record here: e.g. `safety_` (doc 05), `vcert_` or extend `certificates` (doc 06), `voyage_`, `charter_` (doc 07), `record_` (doc 08), `support_` (doc 09) | proposed |

---

## Improvements over the reference

Each item is a platform behaviour that removes a class of tickets the fleet raised against the reference app.

1. **Errors never throw away work (T-92).** Users were bounced to an error page mid-task and had to start again. STORM: per-route error boundaries already contain a failing page; add `useDraft` autosave on every form (local first, server draft for workflow records), so the fallback screen offers "Restore what you typed", and report the error with an id (G4).
2. **"Save" never needs a detour (T-33, T-11, T-58).** Approving with a comment required saving as draft and reopening; a pass-through checklist had no draft; a pop-up covered Save. STORM: actions commit pending edits and the transition in one server call (doc 08 `record_transition`); every form autosaves; the sticky action bar is never covered (doc 08).
3. **Fleet template changes reach vessels predictably (T-25, T-14).** A fleet fix to a monthly report did not appear on vessels; unused templates could only be hidden. STORM: templates are versioned; publishing creates a version; vessel instances show "update available" and adopt explicitly; archive is distinct from delete. The platform part here is the record-kind and migration discipline that keeps template data and code in step.
4. **Integrations are idempotent and respect human decisions (T-275, T-222, T-213, T-187, T-145, T-316, T-228).** Crew-document syncs created duplicates, filed certificates in the wrong slot, ignored expiry filters and raised fears of overwriting manual verifications; a sheet import broke when a tab was reformatted. STORM rule for every import or sync: an `(company_id, source, external_id)` unique key, upsert not insert, never overwrite a field a person has verified (provenance columns `source`, `verified_by`, `verified_at`), schema-validated input (zod) that fails loudly with a row-level report, a dry-run diff before apply, and a sync log table.
5. **Uploads always preview (T-107).** A JPEG medical certificate showed only its file name. STORM: one upload component with mime allow-lists, server-side size limit of 50 MB per the exec summary, thumbnails for images, inline PDF view via the existing `react-pdf`, and a clear message for unsupported types (H3).
6. **People are always findable (T-166).** Attendance pickers were unsorted and unsearchable. STORM: one shared person picker, sorted by rank order then name, searchable by name, rank and department (G2).
7. **Access changes are explainable (T-138, T-160).** A user lost access "with no changes made"; crew could press an officers-only button. STORM: capability checks on actions (`<Can>`), fail-closed loading (C2), every grant change written to `permission_audit_log`, and an access inspector (doc 01) that answers "why can't I see this".
8. **Notifications are observable (T-163, T-79).** Expected emails did not arrive. STORM: one emit contract and a delivery log readable by admins (docs 03 and 08); the platform part is the single deep-link registry so every alert opens the right vessel and record (G5).
9. **Modules can be switched off per vessel without code (T-10).** Leave screens had to be removed from the UI by ticket. STORM: per-vessel module settings (doc 03) and nav `status`/capability gating (J4, W3).
10. **Works the same on every device a vessel uses (T-174, T-51).** Checklists needed an iPad-friendly build; one vessel's screen could print forms but not open them. STORM: one form renderer, layout rules from doc 10, and a Playwright viewport matrix (phone, tablet, desktop) on the top journeys (I7).
11. **Regressions are caught before users report them (T-170).** Autocomplete for issuing authority silently stopped working. STORM: every shared field helper and picker has unit tests; smoke tests render each page with fixtures; the lint and type ratchets stop quality sliding.
12. **Deep links always land in the right vessel.** The reference passes section and vessel in query strings. STORM: path-based scope (`/v/:vesselCode/…`) so a link in an email, notification or ticket opens the right vessel and page, and each page is code-split and guardable (B3).

---

## Implementation notes

### 1. Phase 0: the foundation PRs (serial, before streams fork)

One platform engineer, about 6–9 working days, landed as small PRs in this order. Nothing here changes product behaviour.

| # | PR | Files touched | Done when |
|---|---|---|---|
| F0.1 | Dead code removal (A5) and Refit nav fix (B7) | root `pages/`, `routes/`; `src/lib/api/**`; unused shell components; `sitemap.ts` `yardRefit`; `navigation.ts` | Lint ignore list loses `pages`, `routes`; Refit leaves open real pages; new test rejects repeated path segments |
| F0.2 | `lazyPage` + hoisted lazies (B1) | `src/app/router/lazyPage.tsx`, `src/routes/index.tsx` | `grep -c "React.createElement(React.lazy" src/routes/index.tsx` = 0 |
| F0.3 | Registry and manifests (A2), `AppRouter`, sitemap assembler, `navSlots.ts`, registry tests (B8) | `src/app/registry/**`, `src/app/router/AppRouter.tsx`, `src/config/{sitemap,navSlots,navigation-types}.ts`, `src/test/config/registry.test.ts` | HRIS, Health, Legal, Refit, New Build converted to `module.ts`; legacy routes moved to a `legacy` manifest; sitemap output identical (snapshot test) |
| F0.4 | Layout routes + idempotent `DashboardLayout` (B2) | `src/app/router/scopes.tsx`, `DashboardLayout.tsx` (`ShellContext`), `DashboardFilterContext` placement | Navigating between two HRIS pages does not remount the sidebar (test) |
| F0.5 | Generic route guard + interim `useCan` (C1, C2, C3 adaptor) | `ModuleRoute.tsx` (accept `capability` / `gate`), `SidebarNavigation.tsx`, `src/lib/permissions/useCan.ts` | No new domain needs a new `ModuleRoute` prop; nav fails closed |
| F0.6 | Pending-table shim and ratchet (D2) | `src/integrations/supabase/pending.ts`, `refit/types/db.pending.ts` (from `refit/lib/db.ts`), `src/test/config/pendingTables.test.ts` | Refit compiles against the shim; test passes |
| F0.7 | Migration conventions: ledger, CI checks, duplicate version note (E1, E2) | `supabase/MIGRATIONS-LEDGER.md`, `src/test/config/migrations.test.ts` | Test lists the one known duplicate (`20260919120000`) as an accepted legacy exception and fails on any new one |
| F0.8 | Edge `_shared` helpers (F1) and `verify_jwt` policy (F2) | `supabase/functions/_shared/*`, `supabase/config.toml` (comment block), `pt-exercise-import` entry decision | New functions need no `config.toml` edit |
| F0.9 | Shared UI basics (D5, D7, G1, G2, G5) | `src/shared/components/states/*`, `src/shared/components/pickers/*`, `src/shared/lib/{notify,form}.ts`, alert deep-link registry | Health uses the promoted components; both old link maps deleted |
| F0.10 | Quality gates (I2, I3, I4, I5) and delivery guard (J1, J3) | `scripts/lint-ratchet.mjs`, `lint-baseline.json`, `tsconfig.strict.json`, `src/test/harness/**`, `.github/workflows/ci.yml`, `.github/CODEOWNERS`, `README.md` | CI runs ratchet, strict typecheck and coverage; CODEOWNERS active; README replaced |
| F0.11 | Split the PMS catalogue into module fragments | `docs/permissions/catalogues/storm/*.json`, `scripts/permissions/*.mjs` | `build-matrix-workbooks.mjs --check` passes on the fragments |

### 2. Merge-conflict hotspots and how each is defused

| Shared file | Why it is hot | Owner after Phase 0 | Rule for streams |
|---|---|---|---|
| `src/routes/index.tsx` | Every route today | Platform shell | Do not edit. Register routes in `module.ts`. |
| `src/config/sitemap.ts` | Every nav leaf today | Platform shell | Do not edit. Ship `nav` fragments in `module.ts`. |
| `src/config/navigation-types.ts`, `src/config/navSlots.ts` | Node fields and slot order | Platform shell (doc 10) | Request new fields or slots by issue. |
| `src/shared/components/layout/*` (`DashboardLayout`, `SidebarNavigation`, `ModuleTopNav`, `NotificationBell`, `PageLocationHeader`, `SidebarAccountMenu`) | Shell rework (doc 10) plus per-domain gating branches | Platform shell | Never add domain branches; use capability on nodes. |
| `src/App.tsx` | Providers | Platform shell | No new global providers from streams; put providers in scope layouts. |
| `src/modules/auth/**` (`AuthContext.tsx`, `permissionsStore.ts`, `PermissionGate.tsx`, `lib/*Access.ts`) | Every gate; Lovable also edits `AuthContext.tsx` | Platform access (doc 01) | Streams call `useCan`; new resolvers only via the access owner. |
| `src/shared/components/{ModuleRoute,ProtectedRoute}.tsx` | One prop per domain so far | Platform access | Generic `capability` prop only. |
| `src/modules/vessels/contexts/VesselContext.tsx`, `dashboard/contexts/DashboardFilterContext.tsx`, `vessels/lib/vesselSlug.ts` | Scope source of truth (47 files read it) | Platform access (doc 01) | Read via `useVesselScope()`; never write `localStorage` keys directly. |
| `src/integrations/supabase/types.ts` | Every schema change; Lovable regenerates it | Types owner (W2) | Never edit; use `db.pending.ts`. |
| `src/integrations/supabase/{client,previewAuthStorage}.ts`, `src/integrations/lovable/index.ts` | Lovable-generated ("do not edit") | Lovable | Never edit. |
| `supabase/migrations/*` (filenames) | Timestamp collisions | Each stream within its block | Use the block table below; CI rejects duplicates. |
| DDL on shared tables (`profiles`, `vessels`, `companies`, `crew_assignments`, `alerts`, `modules`, `role_permissions`, `storage.buckets` policies) | Ordering bugs when two streams alter the same table | Platform access (one PR queue) | Request columns by issue; do not ALTER shared tables in a stream migration. |
| `supabase/config.toml` | One entry per function | Platform | New user-called functions need no entry (default JWT verification). |
| `supabase/functions/_shared/*` | Shared helpers | Platform engines | Extend by PR to the owner. |
| `src/lib/pdf/*`, `src/lib/records/*`, `src/lib/storage/*`, `src/lib/export/*` | Engines used by all streams | Platform engines (doc 08) | Register templates and record kinds from the module; do not fork. |
| `src/modules/notifications/lib/notificationLinks.ts`, `shared/hooks/useSidebarBadgeCounts.ts` | Per-entity maps | Platform engines | Replaced by manifest `alertRoutes` and `badges`. |
| `src/index.css`, `tailwind.config.ts`, `src/components/ui/*` | Tokens and primitives (doc 10) | Platform shell | No raw colours in modules; use tokens and `StatusPill`. |
| `src/modules/dashboard/**` (fleet KPIs) | Every domain wants a tile | Doc 02 stream | Contribute tiles through manifest `dashboardTiles`. |
| `src/modules/crew/hooks/useCrew.ts`, crew components reused by HRIS and training | Person directory | Doc 04 stream | Consume through `@/modules/crew` public API. |
| `docs/permissions/catalogues/storm.json` | 1,431 capabilities in one file | Platform access | Edit your module fragment only (F0.11). |
| `package.json`, `package-lock.json`, `bun.lock` | Dependency changes | Platform | Batch dependency requests; both lockfiles in the same commit. |
| `.github/workflows/ci.yml`, `.github/CODEOWNERS` | Gates | Platform | By PR to the owner. |
| `src/test/config/*.test.ts`, `src/test/harness/**` | Invariants and harness | Platform | Add module tests under `src/test/<module>/`. |

Proposed `.github/CODEOWNERS` entries (team handles to be created; not personal accounts): the composition root, shell, auth, vessel context, integrations, shared libs, `supabase/config.toml`, `supabase/functions/_shared/`, shared-table migrations and CI files each map to the owning platform team; every `src/modules/<m>/` maps to its stream.

### 3. Migration timestamp blocks (avoid version collisions)

Supabase versions are the 14-digit prefix. Give each stream an hour block so two streams writing on the same day cannot collide:

| Stream | HH block | Example |
|---|---|---|
| Platform (00, 01, 08, 10) | `00`–`03` | `20261124010000_platform_vessel_code.sql` |
| 02 Fleet operations | `04` | `20261124040000_fleet_calendar_events.sql` |
| 03 Fleet administration | `05` | `20261124050000_admin_vessel_module_settings.sql` |
| 04 Crew | `06` | `20261124060000_crew_position_qualifications.sql` |
| 05 Safety / SMS | `07` | `20261124070000_safety_permits.sql` |
| 06 Certificates and technical | `08` | `20261124080000_technical_jobs.sql` |
| 07 Voyage, charter, calendar, reports | `09` | `20261124090000_voyage_movement_reports.sql` |
| 09 Support | `10` | `20261124100000_support_threads.sql` |
| Refit import | `11` | `20261124110000_refit_core.sql` |
| Fixes and seeds | `12`–`13` | `20261124120000_fix_hris_replay.sql` |

Within a block use minutes and seconds for ordering (`…060100`, `…060200`). Lovable's UUID-named copies fall wherever Lovable puts them; they are recorded, not renamed.

### 4. Conventions with skeletons

**Manifest** (shape; field names to be finalised in F0.3):

```ts
// src/modules/<m>/module.ts
import type { ModuleManifest } from '@/app/registry/types';
import { SAFETY } from './paths';

const manifest: ModuleManifest = {
  id: 'safety',
  scopes: ['vessel'],
  routes: [
    { scope: 'vessel', path: SAFETY.permits, page: () => import('./pages/PermitsPage'), capability: 'vessel.safety.permits.view' },
    { scope: 'vessel', path: SAFETY.permit(':permitId'), page: () => import('./pages/PermitPage'), capability: 'vessel.safety.permits.view' },
  ],
  nav: [{ slot: 'vessel.safety', order: 30, node: { id: 'safety-permits', label: 'Permits to work', path: SAFETY.permits, capability: 'vessel.safety.permits.view', status: 'beta' } }],
  alertRoutes: [{ entityType: 'permit', to: (a, scoped) => scoped(SAFETY.permit(a.related_entity_id)) }],
  capabilities: ['vessel.safety.permits.view', 'vessel.safety.permits.create', 'vessel.safety.permits.approve'],
};
export default manifest;
```

Keep manifests free of page imports and heavy libraries: they are loaded eagerly by `import.meta.glob`.

**Pending-table shim** (replace `as any`):

```ts
// src/integrations/supabase/pending.ts  (hand-written; the only non-generated file in this folder)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { supabase } from './client';

type TableShape = { Row: object; Insert: object; Update: object; Relationships: [] };
export type WithPending<T extends Record<string, TableShape>> = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & { Tables: Database['public']['Tables'] & T };
};
/** Typed client for a module whose tables are merged but not yet in types.ts. */
export const pendingClient = <T extends Record<string, TableShape>>() =>
  supabase as unknown as SupabaseClient<WithPending<T>>;
```

Each module lists its pending tables in `types/db.pending.ts` and exports `const db = pendingClient<SafetyPendingTables>()`. Measure `tsc` time when introducing it; if the intersection is too slow, fall back to `.from(name as never)` with `.overrideTypes<Row[], { merge: false }>()` (available in the installed postgrest-js 2.93). The ratchet test reads every `db.pending.ts`, fails if any listed table now exists in `Database['public']['Tables']`, and fails on `supabase as any` or `.from('…' as any)` outside files that import `pending.ts`.

**Hooks and query keys:**

```ts
export const permitKeys = {
  all: ['safety', 'permits'] as const,
  list: (vesselId: string, filters: PermitFilters) => [...permitKeys.all, vesselId, filters] as const,
  detail: (id: string) => [...permitKeys.all, 'detail', id] as const,
};
```

Queries: `enabled` only when scope ids are known; throw Supabase errors; select only needed columns; no client-side numbering; no mock fallback. Mutations: call an RPC for any status change (E4), invalidate by `permitKeys.all`, toast through `notify`.

**Forms:** zod schema in `lib/permitSchema.ts` with unit tests; RHF with `zodResolver`; blank strings normalised to `null` by the shared helper; dates as `yyyy-MM-dd` strings in local time (Health's `fixes.test.ts` shows why: UTC conversion bugs that only appear outside UTC); `useDraft` for autosave.

**Migration skeleton:**

```sql
-- =================================================================
-- <MODULE> <phase>: <purpose>
-- Tables: …   Helpers: …   TS mirror: src/modules/auth/lib/<domain>Access.ts
-- =================================================================
CREATE TABLE IF NOT EXISTS public.<prefix>_<entity> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE RESTRICT,      -- null only for fleet-level rows
  subject_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reference text,                                                       -- set by trigger via next_reference_value
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', …)),
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_<prefix>_<entity>_scope ON public.<prefix>_<entity>(company_id, vessel_id, status);
ALTER TABLE public.<prefix>_<entity> ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "<prefix>_<entity>_select" ON public.<prefix>_<entity>;
CREATE POLICY "<prefix>_<entity>_select" ON public.<prefix>_<entity> FOR SELECT USING (
  public.user_belongs_to_company(auth.uid(), company_id)
  AND (vessel_id IS NULL OR public.user_can_reach_vessel(auth.uid(), vessel_id))   -- NEW helper (C5)
  AND public.<domain>_can_view(auth.uid())
);
-- write policies: separate INSERT/UPDATE/DELETE, each with WITH CHECK; status changes only through RPCs
CREATE TRIGGER trg_<prefix>_<entity>_updated_at BEFORE UPDATE ON public.<prefix>_<entity>
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMENT ON TABLE public.<prefix>_<entity> IS '…';
```

Helpers are `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`, named `<domain>_can_<view|edit|admin>(_user_id uuid)`, documented with `COMMENT ON FUNCTION`, and mirrored in TypeScript with tests (pattern: `hr_can_*` ↔ `hrAccess.ts` ↔ `src/test/lib/hrAccess.test.ts`). RBAC module rows and default grants are seeded with `ON CONFLICT DO NOTHING`. Counters, digests and signatures follow `20260919210000_ism_form_workflow.sql`.

**Edge function skeleton:**

```ts
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { handleOptions, json } from '../_shared/json.ts';
import { getCaller, assertCapability } from '../_shared/auth.ts';

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  const caller = await getCaller(req);                    // 401 if no valid JWT
  await assertCapability(caller, 'vessel.safety.permits.approve', { vesselId });   // 403 otherwise
  // … work with caller.client (RLS as the user) unless the service role is genuinely needed
  return json({ ok: true });
});
```

Pin the same Deno std and supabase-js versions used today (`std@0.190.0`, `supabase-js@2.49.2`) until a platform PR upgrades all functions together.

**Tests per module (minimum before a leaf goes `live`):** `lib/*.test.ts` for every state machine and schema; `src/test/<module>/wiring.test.ts` (nav → routes → pages → tables/RPCs/buckets/functions exist in migrations, copied from `src/test/hris/wiring.test.ts`); `src/test/<module>/pages.smoke.test.tsx` (each page with empty and populated fixtures for each role, copied from `src/test/health/pages.smoke.test.tsx`); TS access-resolver tests for any new helper; once E5 lands, `supabase/tests/<module>.sql` RLS assertions.

### 5. Known debts that affect a large build-out

| Debt | Source | Status today | Effect on the build-out | Action |
|---|---|---|---|---|
| Cross-tenant `nb_*` policies | System audit C1 | Repo fix `20260919170000_nb_company_scope.sql`; live unverified | Any shared-table work must not assume isolation is live | Verify live; ledger (E2) |
| Open self-registration with self-chosen role | C3 | Repo backstop `20260919170100_signup_backstop.sql`; decision invite-only; live unverified | Invitation flows (doc 01) depend on it | Verify live; ledger |
| Leaked credential in docs/history | C2 | No token pattern in the working tree today; history and revocation status unknown | None for code; hygiene | Confirm revocation (product owner) |
| Work & Rest tables | C4 | Tables in `types.ts`; service still `as any` | Doc 04 hours-of-rest work starts from a typed base | D3 |
| Refit schema | C5 | No `rf_*` migration; nav bug present | A full stream (XL) if import proceeds | B7 now; import as its own stream |
| CI never protected `main`; Lovable overwrote merged work | C6 | CI green; Lovable still commits to `main` | Highest merge-risk factor for parallel streams | J1 before streams fork |
| Mocked pages presented as real | H1/H2 | Several remain (K1) | Demo risk; streams must replace, not extend | K1 per owning stream |
| Hand-written migrations not applied by Lovable | H3 | Unchanged process | Silent drift between repo and live | W1, W8, ledger |
| Type safety off | H4 | Unchanged; 745 `any` warnings | New code inherits laxness unless gated | I2, I3 |
| Module gating | H7 | `canAccessModule` fails closed; most routes still login-only | Every new page must declare a guard | C1, B8 |
| `verify_jwt = false` everywhere | H10 | Unchanged | Each new function is a new attack surface | F1, F2 |
| Inline lazies, mixed fallbacks | M4 | 42 inline lazies | Remounts and refetches on provider re-render | B1 |
| Notification fragmentation | M2, M12 | Two deep-link maps; `notification_logs` unread | Every module adds alerts | G5; docs 03, 08 |
| Unscheduled HR sweepers | M8 | Unverified | Expiry engine (doc 08) depends on sweeps | F3 |
| Migration replay fails from scratch | `docs/HEALTH.md` | Unchanged | No fresh-DB CI, no ephemeral test databases | E5 |
| Duplicate migration version | this doc | `20260919120000` twice | CLI-based apply or reset breaks | Note in ledger; never repeat (E1) |
| Stale status docs | `roadmap.md`, `docs/STORM-STATUS-AUDIT.md` | Health shown unapplied; Work & Rest called production-ready | Planning decisions on wrong facts | Ledger becomes the source; roadmap links to it |
| Four role systems plus module-local vocabularies | M1, PMS addendum | Unchanged; Refit and New Build have their own | Every gate is ambiguous until PMS | C3 (doc 01) |
| Two lockfiles | HRIS-AUDIT 4.7 | `npm ci` passes today | Dependency adds can break CI or Lovable | J2 |

### 6. Recommended structure for parallel work

1. **Phase 0 (serial):** F0.1–F0.11 above. Until F0.3 lands, streams may start only in their module folders and in `lib/` pure logic and tests; they must not register routes or nav.
2. **Wave 1 (parallel, platform):** three platform streams with disjoint file ownership:
   - *Access and scope* (doc 01): `vessels.code`, memberships, `user_can_reach_vessel`, `VesselScopeRoute`, `FleetScope`, PMS runtime, Users & Access. Owns `auth/**`, `vessels/contexts/**`, shared-table DDL.
   - *Shell and design system* (doc 10): tokens, `AppShell`, top bar, tab bar, `StatusPill`, nav node fields. Owns `layout/**`, `components/ui/**`, `index.css`, `tailwind.config.ts`, `navSlots.ts`.
   - *Engines* (doc 08): record registry, envelope and transitions, signatures, company sign-off, threads, expiry, PDF templates, notifications emit, calendar feed. Owns `src/lib/{records,pdf,export,storage}/**`, `supabase/functions/_shared/**`, engine migrations.
3. **Wave 2 (parallel, domains):** docs 02–07 and 09 streams, each owning `src/modules/<module>/**`, its migration block and its tests, consuming platform APIs. Streams may begin in Wave 1 against interfaces published early (manifest types, `useCan` adaptor, `pendingClient`, engine TypeScript interfaces with stub implementations) so they are not blocked on full engine delivery.
4. **Order inside Wave 2** follows the blueprint's suggested build order: crew and documents with the expiry engine, then certificates, then the SMS forms framework, drills, permits and risk assessments, then voyages and tracking, technical, charter, calendar and reports, then fleet admin, add-ons and GDPR.
5. **Integration train weekly (W8)**; types owner rotates; ledger updated at every apply.
6. **Feature visibility:** merge early behind `status: 'beta'` and capability gating rather than keeping long-lived branches.

### 7. Pitfalls (each has bitten this repo before)

- **Editing `types.ts` by hand.** A duplicate property after a Lovable resync made `tsc` exhaust 8 GB for 30 minutes. Use `db.pending.ts`.
- **Assuming a repo migration is live.** Lovable applies only what it runs; check the ledger, not the file list.
- **Non-idempotent SQL.** Lovable re-applies pasted migrations as UUID copies, and a non-idempotent file then fails or double-seeds.
- **Joining on the wrong person id.** Most profiles have no `user_id`; subject rows must key on `profiles.id`.
- **Company-only predicates on vessel data.** Without `user_can_reach_vessel`, every crew member reads every vessel's records.
- **Status columns without CHECK constraints.** The ISM forms had four vocabularies at once and two pages that could never show data.
- **Browser-side numbering.** `max()+1` or `array.length + 1` collides; use `next_reference_value`.
- **Static placeholder paths outranking real dynamic routes** in React Router (the logbooks workaround). Generate placeholders only for `planned` leaves not matched by a registered pattern.
- **Shell remounts.** A page that renders `DashboardLayout` itself under a layout route renders two shells; use the idempotent wrapper during transition.
- **Root-relative links inside module shells.** New Build had 23 links that bounced to the dashboard *(audit)*; use path builders from `paths.ts`.
- **Fake success.** Timed "Export completed" toasts and mock rows on error hid real failures; render real errors.
- **Lovable-generated files.** `client.ts`, `previewAuthStorage.ts`, `src/integrations/lovable/index.ts` are overwritten on sync; the ESLint ignore for `previewAuthStorage.ts` exists for this reason.
- **Two lockfiles.** Update both or CI and Lovable disagree on the install.
- **Typecheck cost.** The full check needs an 8 GB heap and several minutes; a second strict pass should use `--incremental` with a cached build-info file in CI.
- **Polling at sea.** Slow links multiply refetch cost; keep the 30 s default staleness, avoid N+1 loops (crew document upload and New Build piping import both had them *(audit)*), batch imports in one request.

---

## Open questions

1. **Lovable's role during the build-out.** The 19 Sep decision was "Lovable for prototyping only", but the bot still commits to `main`. Should Lovable move to its own branch (merged by PR), or should parallel streams pause while a Lovable session is active?
2. **Staging environment.** Is a second Supabase project (or Supabase branching) approved for staging? W1 and W8 depend on it; without it every migration is tested only on a developer's local database and then applied live.
3. **URL scope cut-over.** Move to `/fleet` and `/v/:vesselCode` in one release with redirects, or module by module (old and new URL schemes coexisting for several releases)? The registry supports either; mixed schemes cost more in nav and test complexity.
4. **PMS v1 timing.** Should domain streams wait for the PMS runtime (doc 01) or ship against the interim `useCan` adaptor and convert later? The adaptor is recommended; it needs a product-owner decision because interim gates will be coarser than the signed-off matrix.
5. **Client error monitoring.** Use a third-party monitoring service (a data sub-processor that must appear in the GDPR hosting list) or the in-house `client_error_events` table (doc 09)?
6. **Toast standard.** Standardise on `sonner` or on the shadcn toast? The `notify` wrapper makes either cheap; the choice affects doc 10's styling work.
7. **Offline at sea.** The exec summary does not require offline use, and the demo script calls it future work. Is any part of the Vessel view (hours of rest, rounds, checklists) required to work offline in the first release? It changes the data-access conventions (local queue, conflict rules) for those modules.
8. **Lockfile.** Keep both `bun.lock` and `package-lock.json`, or make one canonical (which forces Lovable or CI to change its installer)?
