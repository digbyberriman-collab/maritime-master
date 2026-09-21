# STORM — Site Map (Phase 1: Discovery & Mapping)

Ground-truth factual inventory of the platform as it exists on `claude/nice-pascal-ar3hbe` (branch tip, 2026-09-21), compiled from four parallel read-only discovery passes. This document is the factual map only — findings/issues surfaced during discovery are logged in `.audit-staging/phase1-*.md` and carry forward into `AUDIT_REPORT.md` (Phase 3). No files were modified to produce this map.

Source reports:
- `.audit-staging/phase1-deps-env-roles.md` — dependencies, env vars, RBAC
- `.audit-staging/phase1-db-rls.md` — DB schema & RLS
- `.audit-staging/phase1-edge-functions-api.md` — edge functions & API surface
- `.audit-staging/phase1-routes-deadcode.md` — routes, pages, dead code

---

## 1. Platform identity

| | |
|---|---|
| Name | STORM (fleet management SaaS; `package.json` name `vite_react_shadcn_ts`) |
| Stack | React 18 + Vite 5 + TypeScript 5.8 (`strict: false`) + Tailwind/shadcn + TanStack Query 5 + Zustand 5 + React Router 6 |
| Backend | Supabase (Postgres 17.6, Lovable Cloud managed), deployed via Lovable's pipeline |
| Modules under `src/modules/` | 34 |
| Source files under `src/` | 1,192 |

## 2. Database

| Metric | Count |
|---|---|
| Tables in `types.ts` (public schema) | 261 |
| Migration files | 121 (2026-01-25 → 2026-09-19, ~8 months; 49 in Sept alone) |
| `ENABLE ROW LEVEL SECURITY` statements | 321 raw → 281 unique tables |
| `CREATE POLICY` statements | 843, across 280 unique tables |
| Unique `SECURITY DEFINER` functions | 145 (206 definitions incl. redefinitions) — **all** pin `search_path` |
| Explicit `TO anon` policies | 9, all `USING (false)` — correct deny-all guards |
| Public storage buckets | 2: `client-logos`, `avatars` (intentional) |

Domain breakdown (261 tables): Crew/HR/Payroll/Recruitment ~61, New Build (`nb_*`) 43, ISM Safety/Audits/Incidents/Drills 21, ISM Forms/SMS 17, Admin/System/Audit-trail ~19, Travel/Logistics ~18, Work/Rest Hours (MLC) 10, RBAC/Permissions 10, Vessels/Fleet ~11, Logbooks 9, Maintenance/Equipment 7, Fleet Rotation Planner (`frp_*`) 7, Company/Org/Settings 6, Legal 6, Notifications/Alerts 5, Document Control 5, Insurance 3, Certificates 2. **Health & Wellness: 0 live** (49 tables built by migration, absent from generated types — see findings).

## 3. Auth / RBAC model

Four overlapping systems coexist, confirmed still unreconciled:
1. `profiles.role` (7 values)
2. `user_roles` / `app_role` enum (14 values: superadmin, dpa, fleet_master, captain, purser, chief_officer, chief_engineer, hod, officer, crew, auditor_flag, auditor_class, travel_agent, employer_api) — the actual Postgres root of trust (`has_role()`), gating RLS writes on RBAC tables and `admin-actions`
3. `roles` / `role_permissions`
4. `modules` / `user_permission_overrides`

(3)+(4) are reached via `rbac_user_roles` / `get_user_rbac_permissions()` and are what the in-app "Roles & Permissions" / "Users & Access" UI actually manages, decoupled from (2) — granting a role in the UI does not grant `has_role()`.

Route-level enforcement: `ModuleRoute` (the only component that calls `canAccessModule()` + level resolvers) is applied to just 2 of 34 modules (HRIS, Health). A second, fully-unused parallel permission engine (`PermissionGate.tsx`) also exists, dead.

## 4. Edge functions / API surface

| Metric | Count |
|---|---|
| Edge functions on disk | 27 |
| `verify_jwt = false` in config.toml | 26 |
| No `verify_jwt` entry at all (config drift) | 1 (`pt-exercise-import`) |
| Manual in-code auth substitute | 21 of 27 |
| No auth check of any kind | 6 (`ai-route-planner`, `extract-flight-data`, `extract-form-fields`, `geocode-search`, `send-email`, `submit-form` JWT-only/no tenant check) |

## 5. Client ↔ database call surface

| Metric | Count |
|---|---|
| Distinct client-side `.rpc(...)` calls | 48 (47 match a real migration-created function; 1 dead — `next_reference`) |
| Distinct `.from('table')` references | 299 |
| `.from()` references with no matching table in `types.ts` | 84 (53 health-module, 30 refit-module, 1 `feedback_submissions`) |

## 6. Routes / pages

| Metric | Count |
|---|---|
| Explicit hand-written `<Route>` entries | 299 + 1 catch-all = 300 |
| Auto-generated placeholder ("Coming Soon") routes | 262 |
| Auto-generated section-redirect routes | 63 |
| Total rendered `<Route>` elements at runtime | 625 |
| Sitemap leaf count (`NAVIGATION_ITEMS`) | 312 |
| Component files scanned (modules + shared) | 478, of which 29 unreachable (dead) |

## 7. Dependencies & environment

Full inventory in `.audit-staging/phase1-deps-env-roles.md` (dependency list, `.env.example` vars, unused packages, 13 undocumented edge-function secrets — content preserved there verbatim, not duplicated here for length).

## 8. Design system

Verified **not established** in code: `tailwind.config.ts` uses only generic shadcn HSL CSS-variable tokens. No Abyss/Deep/Slate/Drift/Signal tokens exist anywhere in `tailwind.config.ts` or `src/index.css`. Prior mentions of those names elsewhere in the codebase are coincidental word matches only.

---

## Findings carried forward to Phase 3 (not re-derived here — see staging files for full detail)

Highest-severity items already surfaced during discovery, to be triaged and sequenced in `AUDIT_REPORT.md` / `ACTION_PLAN.md`:

- **Critical** — Cross-tenant PII leak: `crew_import` has no `company_id` and a `USING(true)` SELECT policy; any authenticated user of any tenant can read every other tenant's imported crew PII.
- **Critical** — `send-email` edge function is a fully unauthenticated relay: arbitrary `to`/`cc`/`from`/template vars, real Resend account, phishing risk.
- **Critical** — `sign-submission`'s PIN-based e-signature check is a complete no-op; never compares the submitted PIN against the stored hash.
- **Critical** — `inbound-webhook` has dead HMAC signature-verification code; real auth is a plaintext-stored shared secret compared with `===`.
- **Critical** — The entire refit module references 30 `rf_*` tables that exist in zero migrations; `src/modules/refit/lib/db.ts` casts the client to `any` to hide this. Module is non-functional at runtime while compiling clean.
- **Critical** — Entire Refit sidebar sub-tree (32 built pages) is wired to double-suffixed paths and silently falls back to "Coming Soon" placeholders instead of the real, working routes.
- **High** — Health & Wellness module: 49-53 tables built by migration are entirely absent from generated `types.ts` (ambiguous: migrations never applied vs. types never regenerated — directly explains the ~2,925 pre-existing typecheck errors in `src/modules/health/**`).
- **High** — `extract-flight-data` / `extract-form-fields` edge functions: unauthenticated PII disclosure (service-role bucket download, no ownership check) and open SSRF (unrestricted `file_url` fetch).
- **High** — `/insurance` (a real, built page) and several Documents/Certificates sub-pages are completely unreachable from any nav path.
- **High** — No real 404 page shown; a built, on-brand `NotFound` component is dead code, silently redirecting all bad URLs to `/dashboard`.
- **Medium** — Refit and New Build modules carry no RBAC/module-level access gate, unlike HRIS/Health/Legal.
- **Medium** — Client calls a non-existent `next_reference` RPC at 3 refit call sites; silently falls back to non-unique timestamp-based reference numbers.
- **Medium** — `hr-daily-sweeper` / `ais-refresh` / `idea-sync` use non-constant-time shared-secret comparison; a leaked `SYSTEM_API_KEY` bypasses company-scoping entirely.
- Full findings, severities, exploit scenarios and suggested fixes for all of the above (plus lower-severity items) are in the four `.audit-staging/phase1-*.md` files.

## Next steps (per audit protocol)

Phase 2: dispatch 9 specialist checklist sub-agents (auth-security, ui-ux-audit, data-api, workflow-logic, forms-validation, accessibility, performance, dead-code-cleanup, docs-consistency), each scoped to this site map, findings-only, no fixes.
