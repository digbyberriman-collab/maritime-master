# Phase 2 — Broader Dead-Code Audit (hooks, lib utilities, dependencies, duplication, comments)

Scope: dead code a component-reachability graph would not catch — unused npm dependencies, dead exported functions in `lib`/`hooks` files, orphaned tests, commented-out code, duplicate utility implementations, and stale TODO/FIXME/HACK comments. Read-only; nothing on disk was modified except this report. Does **not** re-report Phase 1's 29 dead components, dead routes, or the `react-leaflet`/`@react-leaflet/core`/`xlsx`-CVE findings already logged in `.audit-staging/phase1-*.md` — this file is additive to those.

Method: `package.json` dependency list cross-checked against `grep` import usage in `src/`; every `.ts` file under a module's `lib/` or `hooks/` directory (plus `src/lib/`) parsed for top-level named exports, each name then grepped repo-wide (word-boundary) outside its defining file; all 71 `*.test.ts(x)` files' import specifiers resolved against the filesystem; targeted greps for TODO/FIXME/HACK/XXX, large commented-line runs, and known duplicate-utility shapes (currency/date/CSV/email/debounce formatting).

---

### [DEAD-CODE] — Entire parallel `src/lib/api/` data layer (7 files, ~2,330 lines) is fully orphaned
Severity: High
Location: `src/lib/api/index.ts`, `src/lib/api/types.ts` (917 lines), `src/lib/api/hooks/index.ts`, `src/lib/api/hooks/useUsersApi.ts`, `useVesselsApi.ts`, `useFlightsApi.ts`, `useAlertsApi.ts`, `useIncidentsApi.ts`
Description: This directory implements a complete, self-contained set of TanStack Query hooks (users, vessels, flights, alerts, incidents — CRUD + query-key factories) plus a 917-line shared `types.ts`. A repo-wide grep for `@/lib/api` or `lib/api/hooks` outside the directory itself returns zero matches — the only importer of any file in the tree is another file inside the same tree (the two `index.ts` barrels re-export everything, and nothing imports either barrel). None of its ~35 named exports (e.g. `useUsersApi.useUsers`, `useVesselsApi.useVesselApi`, `useAlertsApi.useAcknowledgeAlert`, `useIncidentsApi.useCreateIncidentApi`) has a single caller anywhere in `src/`. Production code for the same domains (incidents, vessels, users, alerts) is instead served by separate, actively-used hook files inside their respective `src/modules/*/hooks/` directories (e.g. `src/modules/incidents/hooks/useIncidents.ts`, `useCorrectiveActions.ts`) — this looks like an earlier, module-agnostic API layer that was superseded by per-module hooks but never deleted.
Impact: ~2,330 lines of dead weight (bundle size if not tree-shaken cleanly, and a real maintenance/confusion risk — a developer searching for "how do I fetch vessels" will find two competing implementations, one dead). It also carries 2 of the repo's only 3 real TODO comments (see TODO finding below), meaning open work items are sitting inside code nothing runs.
Suggested fix: Delete the `src/lib/api/` directory (both `index.ts` barrels, `types.ts`, and all 5 files in `hooks/`) after a final confirmation no external tool (e.g. a script outside `src/`) imports it.

### [DEAD-CODE] — Duplicate/near-duplicate "create corrective action" hooks, one dead, in the same module
Severity: Medium
Location: `src/modules/incidents/hooks/useIncidents.ts:322` (`useCorrectiveActions`) and `:352` (`useCreateCorrectiveAction`) vs. the real, actively-used `src/modules/incidents/hooks/useCorrectiveActions.ts` (`useCorrectiveActions`, `useCreateCorrectedAction`)
Description: `useIncidents.ts` — itself a live, actively-imported file (used by `ReportIncidentModal.tsx`, `Incidents.tsx`, `InvestigationsPage.tsx`, `ERMPage.tsx`) — also defines its own `useCorrectiveActions` and `useCreateCorrectiveAction`, duplicating the real `useCorrectiveActions.ts` file's `useCorrectiveActions`/`useCreateCorrectedAction` (note the near-identical names: "Corrective" vs "Corrected"). The version inside `useIncidents.ts` is used only by `IncidentViewModal.tsx` (Phase 1's dead-component list) for the read hook, and `useCreateCorrectiveAction` there has zero callers anywhere.
Impact: Two independently-written queries against the same `corrective_actions` table, with easily-confused names, sitting in one module. Any future edit to the real corrective-action logic (e.g. a new column, a new invalidation key) is likely to only be applied to the live copy, leaving a plausible-looking but stale duplicate behind — and a developer grepping for "useCorrectiveActions" will find two hits and have to know which one the live pages actually use.
Suggested fix: Delete `useCorrectiveActions`/`useCreateCorrectiveAction` from `useIncidents.ts`; if `IncidentViewModal.tsx` is kept, repoint it at `@/modules/incidents/hooks/useCorrectiveActions`.

### [DEAD-CODE] — Shared branded-PDF hook `usePDFExport` is entirely unused; modules bypass it with ad-hoc `jsPDF` construction
Severity: Medium
Location: `src/shared/hooks/usePDFExport.ts` (59 lines, wraps `src/lib/pdf/pdfTemplate.ts`'s `createPDFTemplate` with company branding + watermark)
Description: `grep -rn "usePDFExport" src` returns only the file's own definition — zero importers. Meanwhile `createPDFTemplate` (the lower-level piece it wraps) IS used directly by `hris/lib/reviewPdf.ts`, `reportExports.ts`, `payroll/payslip.ts`, `legal/lib/pdf.ts`, and `logbooks/lib/logbookPdf.ts` — so the intended "one branded entry point" pattern is half-adopted. Separately, `src/lib/documentExport.ts`, `crew/lib/crewListPdf.ts`, `new-build/pages/Piping.tsx`, and `rotation-planner/lib/pdfExporter.ts` construct `new jsPDF()` directly, bypassing the shared template (and its branding/watermark) altogether.
Impact: The one hook meant to guarantee every exported PDF carries consistent STORM + client branding and the Inkfish watermark is dead code; four other export paths produce PDFs with no shared branding guarantee, so client-facing PDF exports are visually inconsistent across modules by construction, not by oversight.
Suggested fix: Either wire `usePDFExport` into the modules currently calling `new jsPDF()` directly, or delete it if `createPDFTemplate` is the settled lower-level API and document that as the one true entry point.

### [DEAD-CODE] — Four independent, inconsistent currency-formatting implementations
Severity: Medium
Location: `src/modules/hris/lib/format.ts:54`, `src/modules/legal/components/requests/RequestSummary.tsx:19`, `src/modules/new-build/pages/PurchaseOrders.tsx:328`, `src/modules/refit/components/ui-kit.tsx:373`
Description: No shared `formatCurrency` utility exists anywhere in `src/shared/**` or `src/lib/**` (repo-wide grep for the identifier returns nothing). Each of the four files above hand-rolls its own `Intl.NumberFormat(..., { style: 'currency', ... })` call, and they are not equivalent: HRIS's version defaults to `EUR`, treats its input as **minor units** (`minor / 100`) and locale-aware; Legal's defaults to `USD`, `en-GB`, and treats input as major units; New Build's and Refit's both default to `USD`/`en-US` with 0 fraction digits and treat input as major units.
Impact: Beyond the maintenance cost of four copies, this is a live correctness risk: if a value expressed in minor units (cents) were ever passed into the New Build or Refit formatter (or vice versa), the displayed amount would be off by 100x with no error — exactly the kind of drift independent reimplementations invite.
Suggested fix: Extract one `formatCurrency(amountMinorOrMajor, currency, opts)` utility into `src/shared/lib/` (or `src/lib/`) with an explicit, documented unit convention, and migrate the four call sites to it.

### [DEAD-CODE] — Duplicate CSV-building logic with inconsistent (in two cases, broken) escaping
Severity: Medium
Location: `src/modules/legal/lib/export.ts:5-12` (`csvEscape`/`toCsv`) vs. `src/modules/hris/lib/reports.ts:355-362` (`csvCell`/`toCsv`, functionally byte-for-byte identical logic, independently written) vs. `src/modules/crew/pages/CrewRoster.tsx:236` vs. `src/modules/settings/pages/RolesPermissionsPage.tsx:328-337`
Description: Legal's `csvEscape` and HRIS's `csvCell` both implement the same correct RFC4180-style rule (`/[",\r\n]/.test(s) ? \`"${s.replace(/"/g,'""')}"\` : s`) — a genuine duplicate, not just similar-looking code. `CrewRoster.tsx`'s CSV export instead wraps every cell in quotes unconditionally but never doubles embedded quotes (`r.map(cell => \`"${cell}"\`)`), and `RolesPermissionsPage.tsx`'s audit-log CSV export quotes only one field (`reason_text`) and escapes nothing, leaving `action_type`/`target_module_key` unquoted. At least 6 more files build CSV rows via ad hoc `.join(',')` (`hris/lib/rightToWork.ts`, `employmentHistory.ts`, `payroll/runHelpers.ts`, `gratuities.ts`, `training/components/TrainingMatrixTab.tsx`, `development/pages/CoursesRegister.tsx`, `work-rest/reports/exports.ts`).
Impact: A crew member name, incident reason, or free-text field containing a comma or a double quote will silently corrupt the CSV (misaligned columns or a broken quoted field) when exported from Crew Roster or Roles & Permissions audit log, but not from Legal or HRIS reports — an inconsistency invisible until someone's data happens to contain one of those characters.
Suggested fix: Promote `csvEscape`/`toCsv` (or `csvCell`/`toCsv`) to a single shared utility in `src/lib/` or `src/shared/lib/`, and migrate `CrewRoster.tsx` and `RolesPermissionsPage.tsx`'s exports (and, opportunistically, the other ad hoc `.join(',')` sites) to use it.

### [DEPENDENCY] — Undeclared "phantom" dependency `html2canvas` referenced directly in build config
Severity: Medium
Location: `vite.config.ts:27` (`'pdf-gen': ['jspdf', 'html2canvas']` inside `build.rollupOptions.output.manualChunks`); `package.json` (no `html2canvas` entry in `dependencies` or `devDependencies`)
Description: `html2canvas` is not a declared dependency anywhere in `package.json` — it is present in `node_modules/` only as an undeclared transitive dependency (pulled in by `jspdf`), yet the Vite build config names it explicitly for manual chunk-splitting. Nothing in `src/` imports `html2canvas` directly.
Impact: This chunk-splitting rule works today only because `jspdf`'s current version happens to depend on `html2canvas` and the package manager happens to hoist it to a resolvable location. A `jspdf` version bump that drops the `html2canvas` dependency, or a switch to a stricter package manager (pnpm's default non-hoisted `node_modules`), would silently break this manual-chunk rule (Rollup either drops the empty chunk rule or errors depending on version) with no signal at the `package.json` level.
Suggested fix: Add `html2canvas` as an explicit direct `devDependency` (or `dependency`, matching how it's actually used) pinned to a version compatible with the installed `jspdf`, or remove it from `manualChunks` if the split isn't meaningfully saving bundle size.

### [DEPENDENCY] — Unused devDependency `@tailwindcss/typography`
Severity: Low
Location: `package.json` (`@tailwindcss/typography": "^0.5.16"`); `tailwind.config.ts:2,166` (`plugins: [tailwindcssAnimate]` — typography plugin not listed)
Description: The only Tailwind plugin registered is `tailwindcss-animate`. A repo-wide grep for `@tailwindcss/typography` or the `typography` plugin/`prose` utility classes it provides turns up nothing outside the `package.json` line itself.
Impact: Dead weight in `node_modules`/install time; no functional risk.
Suggested fix: Remove the package, or add it to `tailwind.config.ts`'s `plugins` array if long-form rich-text styling (e.g. for Legal's markdown renderer) was the original intent.

### [DEPENDENCY] — Two full spreadsheet-writing libraries (`xlsx` and `exceljs`) doing overlapping work
Severity: Low
Location: `package.json` (`xlsx ^0.18.5`, `exceljs` — version not separately audited here); usage in `src/modules/rotation-planner/lib/xlsxExporter.ts`/`xlsxImporter.ts`, `src/modules/new-build/{components/import/FileUploadZone.tsx,pages/Requirements.tsx,pages/Piping.tsx}` (all `xlsx`) vs. `src/lib/documentExport.ts` (`exceljs`, workbook creation)
Description: `xlsx` (SheetJS) is used for both importing and exporting `.xlsx` workbooks in 5 files; `exceljs` is used to build a workbook from scratch in exactly one file, `src/lib/documentExport.ts`. Both libraries are general-purpose Excel workbook writers with overlapping capability (`XLSX.utils.book_new()`/`json_to_sheet` vs. `new ExcelJS.Workbook()`); nothing in `documentExport.ts` requires a feature `xlsx` lacks that would justify pulling in a second, heavier library (`exceljs` is also flagged in `vite.config.ts` as getting its own `'excel'` bundle chunk, confirming it's non-trivial in size).
Impact: Two Excel-writing dependencies increase install size, dependency-audit surface (already a live concern per Phase 1's `xlsx` CVE finding), and bundle size for a capability one library already provides elsewhere in the app.
Suggested fix: Port `documentExport.ts`'s single `exceljs` usage onto `xlsx` (or vice versa, if `exceljs`'s richer formatting API is specifically needed there) and drop the other dependency.

### [DEAD-CODE] — ~200 exported constants/functions in module `hooks`/`lib` files have zero importers outside their own file
Severity: Low/Cosmetic (systemic pattern; a handful of individual items are more significant — called out separately above/below)
Location: Concentrated in `src/modules/hris/hooks/*.ts` (~70 hits) and `src/modules/health/hooks/*.ts` (~70 hits), with smaller clusters in `src/modules/logbooks/lib/*.ts` (14), `src/modules/legal/lib/*.ts` (11), and single-digit counts in `refit`, `rotation-planner`, `compliance`, `auth`, `new-build`, `notifications`, `users-access`, `work-rest`, `development`. Full per-file list available on request (241 raw hits across 13 modules + `src/lib` + `src/shared`, verified by word-boundary grep against the rest of `src/`).
Description: The dominant shape is a React Query cache-key constant (e.g. `PAYROLL_KEY`, `RTW_EXPIRY_KEY`, `SPA_INVENTORY_TX_KEY`, `PT_PROGRAMS_KEY`) exported from a hooks file alongside the hook that uses it internally, but never imported by any other file (no cross-file cache invalidation currently relies on the exported name). A smaller number are genuine unused helper functions, e.g. `src/modules/hris/hooks/useRecruitment.ts`'s `buildCandidateCvPath`/`uploadCandidateCv`/`removeCandidateCv`, `usePerformanceReviews.ts`'s `useReviews`/`useReviewsAwaitingMe`, `useHrDashboard.ts`'s internal-only `sortAttention`/`gatherCrewData` (used within their own file, exported unnecessarily), and `src/modules/refit/lib/permissions.ts`'s `canAny`/`isReadOnly` (zero call sites at all, anywhere — consistent with Phase 1's finding that Refit's RBAC plumbing is largely disconnected).
Impact: Mostly cosmetic (an exported query-key constant costs nothing at runtime), but the ~15-20 genuinely-unused *functions* in this list (as opposed to constants) are real dead code, and the volume as a whole makes it hard to tell, file by file, which exports are load-bearing public API versus incidental.
Suggested fix: Not worth a mass cleanup pass on the query-key constants alone. Prioritize deleting the confirmed-unused functions named above; consider an eslint rule (e.g. `import/no-unused-modules`) to keep this from growing further.

### [DEAD-CODE] — Duplicate date-formatting (`fmtDate`) reimplemented per-module
Severity: Low
Location: `src/modules/legal/components/requests/RequestSummary.tsx:10`, `src/modules/crew/lib/crewListPdf.ts:25`, `src/modules/refit/components/ui-kit.tsx:383` (plus `fmtDateTime` at `:388`)
Description: Three independent, differently-signed `fmtDate` helpers (one takes a `withTime` boolean, one doesn't, one is exported and one isn't) with no shared implementation, despite `date-fns` (194 import sites) being available as the project's actual date library.
Impact: Low direct risk (date formatting is simple), but is one more instance of the same reimplementation pattern seen in currency/CSV formatting — each module's date display format can drift independently with no single place to fix a locale or format bug.
Suggested fix: Fold into a `src/shared/lib/dateFormat.ts` (or similar) alongside the currency/CSV consolidation.

### [DEAD-CODE] — Duplicate email-validation regex
Severity: Cosmetic
Location: `src/lib/csvParser.ts:137-138` and `src/shared/components/modals/AddUserModal.tsx:80-81` — identical `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
Description: The same hand-written email regex appears in two unrelated files with no shared source. Note `AddUserModal.tsx` is already on Phase 1's dead-component list, so only the `csvParser.ts` copy is live, but the duplication itself is evidence of the same reimplementation pattern rather than a one-off.
Impact: Negligible on its own (one copy is dead); flagged for completeness per the audit checklist.
Suggested fix: No action needed beyond what Phase 1 already recommends for `AddUserModal.tsx`; if a validation-utilities module is created per the findings above, fold this in too.

### [TODO/FIXME] — Only 3 TODO comments exist repo-wide; one is a genuine unfinished feature, two sit inside already-dead code
Severity: Low (informational — codebase is unusually clean of comment debt, but the one live TODO is a real gap)
Location: `src/modules/documents/pages/Documents.tsx:76-79`; `src/lib/api/hooks/useIncidentsApi.ts:250,318`
Description: A repo-wide case-insensitive grep for `TODO|FIXME|HACK|XXX` across `src/` and `supabase/functions/` (excluding false positives like the `'todo'` status string in Legal's stepper components and `xxx/xxx` placeholder text) found exactly 3 hits. `Documents.tsx`'s `handleEdit` is a stub: `// TODO: Implement edit modal` followed by `console.log('Edit document:', doc)` — the Documents page's "Edit" action currently does nothing visible to the user. The other two TODOs (`// TODO: Create investigation record when table exists`, `// TODO: Send notification via edge function`) are inside `src/lib/api/hooks/useIncidentsApi.ts`, part of the fully-orphaned `src/lib/api/` layer flagged above, so they are not blocking anything currently in production.
Impact: Clicking "Edit" on any document in the Documents module silently no-ops for the end user (no toast, no error, just a devtools-only log) — a real, user-visible incomplete feature, not just a comment-hygiene issue.
Suggested fix: Implement the edit modal (there is already a built, currently-orphaned `DocumentViewModal.tsx` per Phase 1 that may be the intended building block — worth checking before writing a new one) or disable/hide the Edit button until it exists, so the no-op isn't exposed to users. The two TODOs inside `src/lib/api/` resolve themselves if that directory is deleted per the earlier finding.

### [DEAD-CODE] — No commented-out code blocks found (positive/informational finding)
Severity: Cosmetic (informational — passed the check)
Location: N/A (repo-wide scan of `src/**/*.{ts,tsx}`)
Description: Searched for runs of 4+ consecutive `//`-commented lines repo-wide (24 candidate blocks found) and inspected every one with 4+ lines. All are prose documentation — design-rationale comments explaining *why* code is structured a certain way (e.g. `src/main.tsx`'s stale-chunk-reload-loop guard, `src/App.tsx`'s QueryClient defaults rationale, `src/modules/ism/forms/hooks/useFormSubmissions.ts`'s notes on now-server-side signature/hash logic, `src/modules/ism/forms/constants.ts`'s note that `UNDER_REVIEW`/`SUPERSEDED` statuses "used to" exist and are now rejected by a DB check constraint) — not abandoned/disabled implementation code. No `// import ...`, commented-out JSX, or dead conditional branches were found.
Impact: None — this is the one checklist item that came back clean. Worth noting as a genuine positive: several of these comments (the `useFormSubmissions.ts` and `ism/forms/constants.ts` ones especially) are themselves useful evidence of past drift-then-fix cycles, actively documenting old behavior so a future reader doesn't reintroduce it.
Suggested fix: N/A.

### [DEAD-CODE] — Orphaned tests: none found broken; only the already-known `PermissionGate.test.tsx` exercises dead code
Severity: Cosmetic (informational)
Location: All 71 `*.test.ts`/`*.test.tsx` files under `src/`; specifically `src/test/components/PermissionGate.test.tsx`
Description: Resolved every `import ... from '...'` specifier (relative and `@/`-aliased) in all 71 test files against the filesystem — zero import targets are missing, so no test in the suite is "orphaned" in the import-fails sense. Cross-referencing test imports against Phase 1's 29-item dead-component list found exactly one match: `PermissionGate.test.tsx` imports and exercises `src/modules/auth/components/PermissionGate.tsx`, which Phase 1 already confirmed has zero production callers. No other test file imports any of the other 28 dead components, and no test imports anything from the newly-identified dead `src/lib/api/` layer either (that code has no test coverage at all, dead or otherwise).
Impact: The test suite is, on the whole, exercising live code; the one exception was already flagged by Phase 1 (which noted it "may indicate work-in-progress rather than true dead code — worth a human check before deleting").
Suggested fix: No new action — resolve alongside Phase 1's `PermissionGate.tsx` recommendation (delete component + test together, or keep both if it's confirmed WIP).

---

## Summary counts
- Fully orphaned files/directories found (beyond Phase 1's 29 components): **1 directory, 7 files, ~2,330 lines** (`src/lib/api/`) + **1 shared hook file** (`usePDFExport.ts`, 59 lines).
- Unused dependencies found beyond Phase 1's `react-leaflet`/`@react-leaflet/core`: **1** (`@tailwindcss/typography`, devDependency).
- Additional dependency-hygiene issues: **1 phantom/undeclared dependency** (`html2canvas` in `vite.config.ts`), **1 redundant-library pair** (`xlsx` + `exceljs`).
- Candidate dead exports in `lib`/`hooks` files: **241 raw hits** across 15 modules + `src/lib`/`src/shared`, the large majority (~220) being unused-outside-their-file React Query key constants (cosmetic); **~15-20 genuine unused functions** called out individually above.
- Duplicate utility implementations confirmed: **currency formatting (4x)**, **CSV building/escaping (2 near-identical + 2 broken + 6 ad hoc, 10+ total)**, **date formatting (3x)**, **email regex (2x)**, **PDF generation (shared hook unused, 4 modules bypass it)**.
- TODO/FIXME/HACK/XXX comments repo-wide: **3** (1 live user-facing gap, 2 inside already-dead code).
- Large commented-out code blocks: **0** (24 candidate blocks inspected, all legitimate documentation).
- Orphaned tests: **0** with broken imports; **1** (already known to Phase 1) tests a dead component.

No files were modified to produce this report.
