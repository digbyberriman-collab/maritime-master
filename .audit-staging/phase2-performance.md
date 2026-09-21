# Phase 2 — Performance Audit

Read-only specialist pass over the STORM fleet-management SaaS repo. Scope: route-level code splitting, bundle-affecting dependencies, unmemoized list renders, context provider scope, query over-fetching, and large synchronous computations. Sampled representative files rather than reading all 1,192 source files. Cross-referenced against `.audit-staging/phase1-deps-env-roles.md` (unused leaflet packages and outdated xlsx already logged there — not repeated below).

---

### [PERF] — AuthContext provider value is a brand-new object every render, fanning out to 228 consumers
Severity: High
Location: src/modules/auth/contexts/AuthContext.tsx:429-447 (`<AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, resetPassword, hasPermission, canAccessModule, userRole, practitionerDisciplines, practitionerDisciplinesLoaded }}>`)
Description: The context value passed to `AuthContext.Provider` is an inline object literal, never wrapped in `useMemo`. `signIn`, `signUp`, `signOut`, and `resetPassword` are also plain function expressions redefined on every render (not even `useCallback`) — only `hasPermission` and `canAccessModule` use `useCallback`. `AuthProvider` sits near the root of the app (`src/App.tsx`: `AuthProvider > BrandingProvider > VesselProvider > AppRoutes`), and 228 files call `useAuth()`.
Impact: Every re-render of `AuthProvider` (auth state polling, `onAuthStateChange` firing, any state update inside the 449-line provider) produces a new context value reference, which forces every one of the 228 `useAuth()` consumers across the app to re-render — regardless of whether the fields they actually read changed. It also invalidates any child `useEffect`/`useCallback`/`useMemo` dependency arrays that list `signIn`/`signOut`/etc., since those function identities are not stable either.
Suggested fix: Wrap the provider value in `useMemo` keyed on its actual fields, and wrap `signIn`/`signUp`/`signOut`/`resetPassword` in `useCallback` so the memo can have a stable, minimal dependency list.

### [PERF] — VesselContext provider value also recreated every render (missing useMemo)
Severity: Medium
Location: src/modules/vessels/contexts/VesselContext.tsx:187-200 (`const value: VesselContextType = { selectedVessel, selectedVesselId, vessels, isAllVessels, setSelectedVessel, setSelectedVesselById, setAllVessels, loading, refreshVessels, canAccessAllVessels }; return <VesselContext.Provider value={value}>`)
Description: Same pattern as AuthContext: the setter functions are wrapped in `useCallback` (good), but the `value` object itself is a fresh literal on every render, never memoized. 43 files call `useVessel()`, including vessel pickers, `FleetMap`, crew/roster pages, and dashboard widgets that read `selectedVessel`/`isAllVessels` on nearly every page.
Impact: Any re-render of `VesselProvider` (e.g. triggered by a re-render of its parent `AuthProvider`/`BrandingProvider`, not just an actual vessel-selection change) forces every vessel-context consumer in the tree to re-render, cascading down through layout-level components that are mounted on almost every route.
Suggested fix: Wrap `value` in `useMemo` with `[selectedVessel, vessels, isAllVessels, loading, canAccessAllVessels, setSelectedVessel, setSelectedVesselById, setAllVessels, refreshVessels]` as deps.

### [PERF] — List/table row components are not memoized; parent-only state changes re-render entire lists
Severity: Medium
Location: src/modules/documents/components/DocumentTable.tsx:32-146 (rendered from src/modules/documents/pages/Documents.tsx:207); src/modules/crew/pages/CrewList.tsx:233-264
Description: Only 4 files in the whole codebase use `React.memo` (out of 815 `.tsx` component files), yet 505 files contain list-rendering `.map()` calls. `DocumentTable` renders every row inline (`documents.map((document) => <TableRow onClick={() => onView(document)}>...)`) and is not itself wrapped in `React.memo`; its parent `Documents.tsx` holds several independent pieces of state (`viewModalOpen`, `deleteDialogOpen`, `selectedDocument`, `uploadModalOpen`) alongside the memoized `sortedDocuments` array. Because `sortedDocuments` is a stable reference (correctly memoized on `[documents, sortBy]`), wrapping `DocumentTable` in `React.memo` would skip re-rendering it entirely when only modal/selection state changes — but it isn't, so it re-renders (and re-maps every row) whenever `Documents.tsx` re-renders for any reason, e.g. opening the view/delete modal for a single row. `CrewList.tsx` has the same shape: filtering/derived arrays (`filtered`, `departments`, `statuses`, `counts`) are correctly memoized, but each row's action button uses an inline arrow (`onClick={() => setRecordPerson(person)}`) and rows are not extracted into a memoized child, so selecting one crew member to view a record re-renders the full roster table.
Impact: On a real fleet-wide document list or crew roster (hundreds of rows across all vessels, matching the "select `*`" over-fetch pattern below), every modal open/close, filter keystroke, or unrelated local state change re-renders and re-diffs every row rather than the one row whose state changed. This scales linearly with list size for every unrelated interaction.
Suggested fix: Extract row rendering into a `React.memo`-wrapped `DocumentRow`/`CrewRow` component with stable primitive/`useCallback`-derived props, and wrap `DocumentTable` itself in `React.memo` since its `documents` prop reference is already stable from the parent's `useMemo`.

### [PERF] — Dashboard maintenance widget recomputes filter/sort/aggregate over full fleet arrays every render, with no memoization
Severity: Medium
Location: src/modules/dashboard/components/MaintenanceWidgets.tsx:26-49
Description: `upcomingTasks` (filter + date-sort + slice over `tasks`), `criticalDefects` (filter over `defects`), `lowStockParts` (filter over `spareParts`), and `operationalEquipment`/`equipmentHealthPercent` (filter + length over `equipment`) are all recomputed inline in the component body on every render, with zero `useMemo`. This is inconsistent with the sibling component `src/modules/dashboard/components/FleetDashboardView.tsx`, which memoizes equivalent aggregations (`summaryByVessel`, `kpi`, `matrixRows` via `useMemo`) in the same module.
Impact: `MaintenanceWidgets` is rendered on the main post-login dashboard — the highest-traffic page in the app. Every unrelated re-render of the dashboard (query refetch of a sibling widget, a parent state change, React Query background revalidation) re-runs three `.filter()`/`.sort()` passes over the full fleet's task/defect/spare-parts arrays instead of only when the underlying data actually changes.
Suggested fix: Wrap each derived array (`upcomingTasks`, `criticalDefects`, `lowStockParts`, `equipmentHealthPercent`) in `useMemo` keyed on `tasks`/`defects`/`spareParts`/`equipment` respectively, matching the pattern already used in `FleetDashboardView.tsx`.

### [PERF] — 35% of Supabase `.select()` calls fetch every column (`select('*')`) on wide tables where list views show only a handful of fields
Severity: Low
Location: src/modules/hris/hooks/useRecruitment.ts:464 (`supabase.from('candidates').select('*').eq('company_id', companyId).order('last_name').order('first_name')`, feeding the candidates list page) and 340 other `.select('*')` call sites (341 of 967 total `.select(` calls repo-wide, sampled across src/modules/hris, src/modules/certificates)
Description: The `candidates` table alone has ~29 columns including `notes` (free text), `cv_path`, `linkedin_url`, GDPR consent timestamps, salary fields, etc. `CandidatesPage` (the talent-pool list view) only displays name/rank/status/source-type fields, yet the query pulls every column for every candidate row. This pattern (list/read queries on wide tables using `select('*')` instead of the handful of columns actually rendered) repeats across roughly a third of all `.select()` call sites in the codebase.
Impact: Larger response payloads than necessary on every list load (worse over the vessel-network links the codebase's own `queryClient` staleTime comment specifically calls out as slow), and any future column added to a wide table silently increases payload size for existing list views with no code change needed to catch it in review.
Suggested fix: Replace `select('*')` with explicit column lists on read/list queries (a `select('*')` after an `.update()`/`.insert()` returning the just-written row is lower priority since the payload there is one row, not a list).

### [PERF] — Route-level code splitting is applied consistently (positive finding, no action needed)
Severity: Cosmetic
Location: src/routes/index.tsx (129 `React.lazy()` calls); src/modules/new-build/routes.tsx, src/modules/hris/routes.tsx, src/modules/health/routes.tsx, src/modules/refit/routes.tsx, src/modules/legal/routes.tsx (all 5 module route files define a shared `lazyPage`/`page` helper that wraps every route's page import in `React.lazy` + `React.Suspense`)
Description: All 5 module route files use `React.lazy()` for 100% of their page routes via a shared helper (new-build: 23 routes, refit: 31, hris: 19, legal: 8, health: sampled and confirmed same pattern). The main `src/routes/index.tsx` has 129 `React.lazy()` calls covering essentially all non-module routes. Only 3 components are imported eagerly at the top of `routes/index.tsx`: `Auth`, `ResetPassword`, and `Dashboard`, explicitly commented as "Keep critical path pages sync, lazy load the rest" — a deliberate, reasonable choice (auth/dashboard are needed immediately on load; everything else is code-split).
Impact: None — this is one of the stronger areas of the codebase from a bundle-size perspective. No route file was found eagerly importing full page components in bulk.
Suggested fix: No action needed. Worth preserving as a pattern when new modules are added.

### [PERF] — lucide-react icons are imported as scoped named imports, not the full library (positive finding)
Severity: Cosmetic
Location: 580 files importing `from 'lucide-react'`, all via named imports (`import { Ship, Users, ... } from 'lucide-react'`); zero `import * as Icons from 'lucide-react'` matches repo-wide
Description: Despite lucide-react being used in 580 files, every import site uses named/tree-shakeable imports rather than a namespace/wildcard import, so Vite/Rollup can tree-shake unused icons.
Impact: None — icon bundling is already handled correctly. (Note: `xlsx` version/CVE and unused `react-leaflet`/`@react-leaflet/core` packages are already flagged in `.audit-staging/phase1-deps-env-roles.md` and are not re-reported here.)
Suggested fix: No action needed.

### [PERF] — Roles & Permissions matrix recomputes module groupings with nested `.filter()` on every render
Severity: Low
Location: src/modules/settings/pages/RolesPermissionsPage.tsx:129 (`const topLevelModules = modules.filter(m => !m.parent_key);`), :231 (`const subs = modules.filter(m => m.parent_key === module.key);` — run once per top-level module inside the render loop)
Description: `topLevelModules` is recalculated on every render without `useMemo`, and for each top-level module the render loop performs a fresh `.filter()` over the entire `modules` array to find its children — an O(n²) scan across the module list every render, plus a `hasPermission()` linear lookup called per role×module×level cell.
Impact: Low in absolute terms since the modules dataset is small (dozens of rows, not fleet-scale), but it re-executes on every keystroke/selection state change on this settings page, and the pattern would become a real cost if the module list grows.
Suggested fix: Memoize `topLevelModules` and a `Map<parent_key, Module[]>` grouping of children with `useMemo` keyed on `modules`, and look children up by key instead of filtering repeatedly.

---

## Summary

| # | Finding | Severity |
|---|---|---|
| 1 | AuthContext provider value not memoized — 228 consumers re-render on every provider re-render | High |
| 2 | VesselContext provider value not memoized — 43 consumers affected | Medium |
| 3 | DocumentTable / CrewList rows not extracted/memoized — full-list re-render on unrelated state change | Medium |
| 4 | MaintenanceWidgets dashboard aggregation unmemoized (inconsistent with sibling FleetDashboardView) | Medium |
| 5 | ~35% of `.select()` calls use `select('*')` on wide tables for list views | Low |
| 6 | Route-level code splitting is consistent across all 5 module route files + main router | Cosmetic (positive) |
| 7 | lucide-react imports are correctly scoped/tree-shaken | Cosmetic (positive) |
| 8 | RolesPermissionsPage nested `.filter()` recomputation | Low |

No files were modified during this investigation.
