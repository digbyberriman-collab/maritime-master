# Phase 1 Discovery — Dependencies, env vars, role matrix (agent adc3cfce621e1d2b6)

## FACTUAL DATA SUMMARY
- Total dependencies: 87 (66 dependencies + 21 devDependencies)
- Unused dependencies: 2 — `react-leaflet` (^4.2.1), `@react-leaflet/core` (^2.1.0). App uses raw `leaflet` directly in FleetMap.tsx, RegionMapCard.tsx, HeatMapTab.tsx.
- Undocumented-but-used env vars (13): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM, LOVABLE_API_KEY, AIS_API_KEY, AIS_PROVIDER, HR_SWEEPER_SECRET, IDEA_API_KEY, IDEA_BASE_URL, SYSTEM_API_KEY, and oddly-named "Airtable".
- Documented-but-unused env vars: none (all 3 in .env.example are used).
- RBAC one-paragraph summary: Of four authorization systems, (c) roles/role_permissions and (d) modules/user_permission_overrides are genuinely live (drive get_user_rbac_permissions -> usePermissionsStore -> sidebar + HRIS/Health gating). (a) profiles.role is also live (read as userRole in AuthContext, fallback in resolvers). (b) user_roles/app_role enum is the odd one out: the React RBAC store never reads it — but it IS the table Postgres has_role() checks, and has_role() gates every RLS write-policy on roles/role_permissions/rbac_user_roles/user_permission_overrides plus the admin-actions edge function. So user_roles/app_role is the real root of trust for privileged writes/admin actions while being functionally disconnected from the in-app "Roles & Permissions"/"Users & Access" screens that manage the other three systems.

## 1. DEPENDENCY AUDIT

### DEPENDENCY — Two unused Leaflet React wrapper packages
Severity: Low
Location: package.json (react-leaflet ^4.2.1, @react-leaflet/core ^2.1.0)
Description: Zero import matches in src/ or supabase/functions/ for react-leaflet. All map rendering uses raw `leaflet` directly.
Impact: Dead weight in node_modules/bundle analysis; no functional risk.
Suggested fix: Remove both packages unless a near-term feature needs them.

### DEPENDENCY — xlsx pinned to a version with known unpatched registry CVEs
Severity: Medium
Location: package.json (xlsx ^0.18.5)
Description: SheetJS's xlsx has been stuck at 0.18.5 on npm since 2022; maintainers moved security fixes to their own CDN, never published to npm. Real usage confirmed: rotation-planner/lib/xlsxImporter.ts, xlsxExporter.ts, New Build import/Requirements/Piping pages — all parse user-supplied spreadsheet files.
Impact: Untrusted spreadsheet uploads parsed with a library version carrying known, npm-unpatched vulnerabilities.
Suggested fix: Switch to SheetJS's CDN-hosted patched build, or migrate to an actively maintained alternative for these flows.

### DEPENDENCY — Several packages a major version behind current
Severity: Low/Cosmetic
Location: package.json
Description: tailwindcss ^3.4.17 (v4 exists), react-router-dom ^6.30.1 (v7 exists), zod ^3.25.76 (v4 exists), sonner ^1.7.4 (v2 exists), recharts ^2.15.4 (v3 exists), vite ^5.4.21 (v6/v7 exist). date-fns ^3.6.0 + react-day-picker ^8.10.1 are deliberately paired, not stale.
Impact: None immediate (still-supported majors), but each is a deliberate breaking upgrade, not a patch bump.
Suggested fix: Backlog item for a dedicated major-upgrade pass per package.

## 2. ENVIRONMENT VARIABLE AUDIT

### ENV — Frontend env vars fully and correctly documented (positive finding)
No action needed — all 3 VITE_* vars used and documented, nothing documented-but-unused.

### ENV — 13 Supabase edge-function secrets exist with no example/manifest file anywhere
Severity: Medium
Location: supabase/functions/* (12 functions read via Deno.env.get); no supabase/functions/.env.example exists
Description: 13 secrets read across edge functions (listed above), none declared in any manifest (by design they're not in the client .env.example, but no equivalent inventory exists either). docs/SYSTEM-AUDIT-2026-09-19.md documents most in prose, not machine-usable.
Impact: Standing up a new environment requires grepping every edge function to reconstruct the required secret list; functions do non-null assertions on Deno.env.get, so a missing secret fails at request time, not deploy time.
Suggested fix: Add supabase/functions/.env.example (or a section in .env.example) enumerating all secrets, marked "set via supabase secrets set, never committed."

### ENV — Inconsistently-named secret: Deno.env.get("Airtable")
Severity: Low
Location: supabase/functions/airtable-sync/index.ts:51
Description: Every other secret is SCREAMING_SNAKE_CASE; this one is literally "Airtable". Already flagged in docs/SYSTEM-AUDIT-2026-09-19.md (L4), corroborating it's known and unfixed.
Impact: Easy to typo/collide with unrelated config in the Supabase dashboard.
Suggested fix: Rename to AIRTABLE_API_KEY (coordinated deploy).

### ENV/CONFIG — Every edge function has verify_jwt = false
Severity: Medium (corroborates prior doc)
Location: supabase/config.toml (all 26 [functions.*] blocks)
Description: All 26 functions disable platform-level JWT verification. admin-actions (most privileged: password resets, enabling/disabling access, vessel reassignment) does its own bearer-token check via supabase.auth.getUser(), but authorizes against legacy user_roles/profiles.role, not the newer RBAC tables.
Impact: Safety net is "every function must remember to verify auth itself"; a future function omitting this check is anonymous by default.
Suggested fix: Confirm every function does an equivalent auth check (start with inbound-webhook, external-api, geocode-search, ais-refresh); consider re-enabling verify_jwt=true where not needed.

## 3. ROLE/PERMISSION MATRIX — THE CENTRAL FINDING

### RBAC — Route-level authorization applied to 2 of ~26 modules; everything else is login-only
Severity: Critical
Location: src/routes/index.tsx (144 ProtectedRoute wrappers vs 2 ModuleRoute wrappers); src/shared/components/ProtectedRoute.tsx; src/shared/components/ModuleRoute.tsx; src/modules/hris/routes.tsx; src/modules/health/routes.tsx
Description: ProtectedRoute only checks `if (!user) return <Navigate to="/auth">` — a login gate, nothing else. ModuleRoute is the only component calling canAccessModule(moduleId) + level resolvers before rendering. Only hrisRoutes and healthRoutes wrap pages in ModuleRoute. Every other module (crew roster, crew admin, vessels, ISM, certificates, maintenance, alerts, fleet-map, settings, insurance, new-build, refit, legal, logbooks) has zero role/permission check at the route level. canAccessModule() is still read but only to decide sidebar visibility, never to decide whether to render the page.
Impact: Any authenticated user (plain crew, or a misconfigured role) navigating directly to /crew/admin, /settings/permissions, /admin/roles, /maintenance, /insurance etc. gets the full page rendered client-side; sidebar merely hides the link. Only remaining enforcement is whatever RLS policy protects the underlying query — inconsistent module to module, and wide open for several tables (see below).
Suggested fix: Add ModuleRoute moduleId="..." wrapper for each currently-bare-ProtectedRoute module (moduleKeyMap already exists in AuthContext.tsx:271-295).

### RBAC — Settings > Roles & Permissions and Users & Access have no route guard at all, and underlying tables are world-readable
Severity: Critical
Location: src/routes/index.tsx:676-696, :688-689; src/modules/settings/pages/RolesPermissionsPage.tsx; supabase/migrations/20260129125250_...sql (RLS "Roles/Modules/Role permissions are readable by authenticated users", each USING (true))
Description: /settings/permissions, /admin/roles, /users-access, /users-access/:userId wrapped only in ProtectedRoute. RolesPermissionsPage.tsx has zero internal role check (grep for userRole|hasRole|canAccessModule|AccessDenied|isDPA|superadmin returns nothing) — only computes canEdit to enable/disable Save. roles/modules/role_permissions all carry USING (true) SELECT policies, so any logged-in crew member can load /settings/permissions and see the full role->permission matrix (can't save, write RLS does require admin). /users-access/:userId is better protected at the data layer (user_id = auth.uid() or has_role superadmin/dpa) but the page still fully renders for anyone.
Impact: Information disclosure of the company's authorization scheme to any employee; no defense-in-depth if a write RLS policy ever regresses.
Suggested fix: Wrap in ModuleRoute moduleId="settings" with explicit admin-only check; add in-component guard rendering AccessDenied when !canEdit.

### RBAC — Postgres root of trust (has_role()/user_roles/app_role) decoupled from the RBAC tables the admin UI actually manages
Severity: Critical
Location: supabase/migrations/20260127170354_...sql (user_roles, app_role enum, has_role()); supabase/migrations/20260129125250_...sql (roles, role_permissions, rbac_user_roles, user_permission_overrides + write RLS via has_role(...,'superadmin'/'dpa')); supabase/functions/admin-actions/index.ts:78-97 (checks user_roles/profiles.role, not rbac_user_roles); src/modules/auth/hooks/useUserRoles.ts (writes user_roles, unused); src/modules/auth/store/permissionsStore.ts (reads rbac_user_roles, never user_roles)
Description: Two separate "who has what role" tables. user_roles (14-value app_role enum) is what has_role() reads — gates every write policy on roles/role_permissions/rbac_user_roles/user_permission_overrides, and admin-actions' own auth check (password resets, enabling/disabling users, vessel reassignment). rbac_user_roles (joined to roles/role_permissions) is a DIFFERENT table the in-app "Roles & Permissions"/"Users & Access" screens actually manage and that usePermissionsStore/get_user_rbac_permissions reads for almost every app permission decision. Per prior audit: user_roles has only 6 live rows (4 superadmin, 2 dpa) company-wide, while newer tables have 402 role_permissions + 258 user_permission_overrides — the "real" app-visible model is actively used/maintained while the table Postgres itself trusts for privileged writes has essentially nobody in it beyond bootstrap accounts.
Impact: Granting someone "dpa" via Users & Access gives app-visible access (sidebar, HRIS, Health) but NOT has_role(...,'dpa') — they still can't pass RLS on roles/role_permissions/rbac_user_roles/user_permission_overrides writes or use admin-actions for other users. Revoking access in the new UI does nothing to a legacy user_roles row that might still grant raw DB/edge-function admin power.
Suggested fix: Pick one root of trust. Prior audit (item 3.1) recommends collapsing to rbac_user_roles + module RBAC, retiring user_roles/app_role/has_role() — or if user_roles is kept as source of truth, rewrite admin-actions and roles/role_permissions RLS to check rbac_user_roles, migrate the 6 legacy rows.

### RBAC — The two role vocabularies have already diverged
Severity: High
Location: supabase/migrations/20260127170354_...sql:2-16 (app_role enum, 14 values) vs supabase/migrations/20260129125250_...sql:44-53 (roles table seed, 11 rows)
Description: roles table (assigned via rbac_user_roles) seeds only 11 roles — no superadmin or travel_agent row, collapses auditor_flag/auditor_class into one "auditor". superadmin cannot be assigned through the in-app UI at all — no roles row for rbac_user_roles.role_id to reference.
Impact: A superadmin can only ever be created via direct DB access into the old user_roles table; in-app tooling has no path to produce one or to manage travel_agent/auditor_flag/auditor_class distinctly.
Suggested fix: Add missing rows to roles (superadmin, travel_agent, split auditor), or make enum + table contents the single source of truth for both.

### RBAC — user_permission_overrides' deny capability is dead code on both read and write side
Severity: High
Location: supabase/migrations/20260129125250_...sql:330-403 (get_user_rbac_permissions only unions is_granted=true; user_has_module_access is the only function honoring is_granted=false); src/modules/users-access/hooks/useSavePermissionOverride.ts (only inserts is_granted:true or deletes — never inserts is_granted:false)
Description: Schema supports explicit per-user denial overrides (is_granted=false) but get_user_rbac_permissions (what the frontend actually calls) silently ignores denial rows. user_has_module_access (the one function that checks is_granted=false) has zero callers anywhere. UI's own save path never writes a deny row — "remove access" just deletes any existing grant override.
Impact: An admin cannot use Users & Access to deny something a role would otherwise grant; "remove" only removes a grant override, role-based grant stays fully intact. Feature implies a capability that doesn't work.
Suggested fix: Wire get_user_rbac_permissions to apply denial rows (subtract from unioned grants) and add a deny control to the UI, or remove is_granted/dead SQL function and document overrides as additive-only.

### RBAC — A second, parallel permission engine and gating component set are essentially unused
Severity: Medium
Location: src/modules/auth/hooks/useUserRoles.ts (PERMISSION_MATRIX/AUDIT_MODE_RULES checkPermission, usePermissions, useHasPermission, useAssignRole, useRevokeRole, useCompanyRoles); src/modules/auth/components/PermissionGate.tsx (PermissionGate, its own ProtectedRoute, RequireRole, useCanAccess); src/modules/auth/index.ts, src/modules/auth/lib/rbac.ts
Description: Zero files import from @/modules/auth or @/modules/auth/lib/rbac barrels — PermissionGate/its bundled ProtectedRoute/RequireRole/useCanAccess gate nothing in the running app (only referenced by their own test). Of useUserRoles.ts exports, only useActiveRoles has a real caller (MyWorkRestMonth.tsx, a local business rule, not access control). useAssignRole/useRevokeRole (write legacy user_roles) have zero callers.
Impact: Low direct risk, high maintenance-confusion risk — a developer reading modules/auth/index.ts would assume PermissionGate/RequireRole are the real route guards; the real one (ModuleRoute.tsx) isn't even exported from auth's public API.
Suggested fix: Delete unused PermissionGate.tsx/rbac.ts/useUserRoles.ts exports (or mark deprecated pointing to ModuleRoute/canAccessModule), remove the corresponding test file if code removed.

### RBAC — Ported modules (refit, new-build, ISM forms, logbooks) query legacy user_roles with incompatible role vocabularies
Severity: Medium
Location: src/modules/refit/lib/auth.ts (AppRole type incl. owner, owner_rep, yard_pm, crew_member, guest — none exist in Postgres app_role enum), reads .from("user_roles"); src/modules/refit/pages/admin.tsx (inserts/deletes user_roles rows with this vocabulary); src/modules/logbooks/lib/logbookApi.ts:311; src/modules/ism/forms/pages/FormTemplates.tsx:165; src/modules/new-build/pages/DeckPlan.tsx:203
Description: refit module ("ported from Ship Shape Command") defines its own 19-value AppRole union, most not members of the real app_role enum. No migration extends app_role with these values.
Impact: Inserting a role like "owner"/"yard_pm" into user_roles.role would fail at the DB (invalid enum value); any refit permission check keyed on those names can never match a real row — refit's RBAC is likely non-functional (fails closed at best).
Suggested fix: Confirm at runtime whether refit's user_roles writes actually succeed; if broken, give refit its own roles table or map its vocabulary onto the real app_role enum.

### RBAC — Three concrete default-allow fallbacks worth naming explicitly
Severity: High
Location: src/modules/auth/contexts/AuthContext.tsx:260-262, :307-308; src/shared/components/layout/SidebarNavigation.tsx:57
Description:
1. canAccessModule(): `if (!rbacInitialized || rbacLoading) return true;` — while RBAC store is loading, every module except hris/health is allowed through.
2. canAccessModule() legacy fallback: `if (!allowedRoles) return true;` — any moduleId not in the hardcoded MODULE_ACCESS map (insurance, reports, development, itinerary, flights-travel, new-build, refit, legal) defaults to allow for every role.
3. SidebarNavigation.canShow(): `if (!item.moduleKey) return true;` — of 276 leaf nav entries in sitemap.ts, only 23 declare a moduleKey (hr, finance, medical, wellness); the other ~253 (~92%) show to every authenticated user regardless of role.
Impact: Combined with the route-level gating gap above, the large majority of the app's surface has no role-awareness anywhere in the frontend — visibility and access both default to "everyone."
Suggested fix: Change both AuthContext fallbacks to default-deny once RBAC is source of truth; extend moduleKey coverage in sitemap.ts to every leaf that should be role-restricted.

## 4. MODULE -> ROLE COVERAGE SPOT CHECK
- Health "Medical Screening": explicitly not gated (own-record, RLS-only) — documented intent, Low risk if RLS actually enforces "own record only" (needs confirming).
- HRIS "Disciplinary": explicit hrLevel:'edit' -> fleet_master/captain/purser or legacy master. No gap.
- HRIS "Compensation Settings": explicit payrollLevel:'admin' -> superadmin/dpa or legacy dpa/shore_management only, deliberately excludes captains/HODs. No gap.
- Crew Roster & Crew Admin: bare ProtectedRoute, no moduleId check at all — the un-hardened norm, not an exception.
- Health & Wellness overall: mixed — company-wide clinical pages have explicit medicalLevel/wellnessLevel gates; ~half the pages (Fitness to Work, Vaccinations, Allergies/Conditions, Medications, Medical Certificates, Next of Kin, Treatment History) have no level at all, same RLS-only pattern.
- Settings/admin module: LEAST gated of all — /settings/permissions, /admin/roles, /users-access(/:userId) have no route-level gate whatsoever — the single most sensitive module has strictly weaker route protection than Health or HRIS.

## Cross-validation
docs/SYSTEM-AUDIT-2026-09-19.md (2 days prior) independently reached the same headline conclusion (line ~227): "Client-side gates (canAccessModule, ModuleRoute) mirror them for HRIS only; every other route is login-only, and canAccessModule returns true for module ids missing from its legacy map." Live row counts used above (user_roles: 6, role_permissions: 402, user_permission_overrides: 258) are from that same document.

No files were modified during this investigation.
