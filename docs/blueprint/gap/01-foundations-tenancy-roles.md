# Foundations: tenancy, two-level structure, roles & permissions — gap analysis

> Spec for implementers. It compares the rebuild blueprint (v1.3) for the reference app against STORM as it is in the code today, and states what STORM must build. Requirements are written as STORM requirements, in our own words. Blueprint sections are cited as `§n.n`. Everything else in STORM (crew, SMS, certificates, technical…) sits on top of this domain, so most items here are P0.

---

## Scope

**Blueprint sections covered**

| § | Topic | Notes |
|---|---|---|
| Exec summary | Two levels, roles list, core entities, build order | Build order puts this domain first |
| §1.1–1.3 | Purpose, users, two-level structure (Fleet view / Vessel view), fleet sidebar, vessel module tabs, per-vessel module visibility | |
| §1.4 | Global top bar and footer | |
| §1.5 | URL scheme | We propose our own (path-based) scheme |
| §1.6 | Identifier formats | Engine only; each domain wires its own format |
| §2.1–2.7 | Account roles, crew presets, crew flags, other-module levels, Access Sets, account management actions, gated areas | Screenshot `image42.png` (Users & Access › Vessel Crew › Matrix) viewed |
| §3.1–3.6 | Account, fleet group, vessel, user/crew member, position, employment | Only the identity / access aspects. Crew profile fields, employment and vessel-record sub-pages belong to the crew and vessel-record gap docs |
| §3.34–3.36 | Account, vessel creation, user security (TOTP) | |
| §4.11 | Users & Access (Vessel Crew, Account Admins, Shore Staff, Access Sets) | |
| §4.16, §4.17, §4.19, §4.20 | Vessel Settings (module matrix), Vessels, Account, Security | |
| §6.24 | User invitation and access change | |
| §7.10, §7.12 | Login-as, trust device; save behaviours | |
| §7.13 | Vessel count discrepancy (active / counted flag) | |
| §7.14, §6.28 | External viewers | Access model only; the Technical viewer UI is in the technical doc |
| §8.6 | "The Company" as a workflow actor | Only *who* the Company is; the sign-off engine is in the signatures doc |

**Out of scope here (owned by other gap docs, referenced where they depend on this one):** Notification Management (§4.12, §8.9), Support Tickets (§4.13, §9), Company FAQs (§4.14), Add-ons billing (§4.15, §6.22 — we only define the entitlement hook), Fleet GDPR (§4.18, §6.21 — we only define the permission-change audit and access-review inputs), crew profile content (§3.4 fields, §5.1), signature engine (§8).

**STORM paths inspected (code read, not just names)**

- Auth and role resolution: `src/modules/auth/contexts/AuthContext.tsx`, `src/modules/auth/pages/Auth.tsx`, `src/modules/auth/store/permissionsStore.ts`, `src/modules/auth/lib/{rbacMatrix,hrAccess,medicalAccess,payrollAccess,permissions}.ts`, `src/modules/auth/components/PermissionGate.tsx`
- Users & Access: `src/modules/users-access/pages/{UsersAccessListPage,UsersAccessDetailPage}.tsx`, `lib/{presets,derivePreset,capabilityCatalog,moduleGroups}.ts`, `hooks/{useUsersWithAccess,useSavePermissionOverride,useDepartmentScope}.ts`, `components/DepartmentScopeCard.tsx`
- Settings: `src/modules/settings/pages/{Settings,RolesPermissionsPage,BrandingSettings}.tsx`, `components/sections/{SecuritySection,VesselAccessSection,PermissionsSection}.tsx`, `src/shared/utils/settingsPermissions.ts`
- Vessels and vessel context: `src/modules/vessels/contexts/VesselContext.tsx`, `components/{VesselSelector,VesselFormModal,DeleteVesselDialog}.tsx`, `pages/{Vessels,CompanyDetails,IndividualVesselDashboard}.tsx`, `hooks/useVessels.ts`, `lib/vesselSlug.ts`
- Shell: `src/shared/components/layout/{DashboardLayout,ModuleTopNav,SidebarNavigation,SidebarAccountMenu,GlobalHeaderControls,VesselToggleBar,InkfishFooter}.tsx`, `src/modules/dashboard/contexts/DashboardFilterContext.tsx`, `src/shared/components/{ProtectedRoute,ModuleRoute}.tsx`
- Config and routes: `src/config/{sitemap,navigation,navigation-types}.ts`, `src/routes/index.tsx`
- Edge functions: `supabase/functions/{send-invitation,accept-invitation,bulk-invite,admin-actions,create-crew-member}/index.ts`, `supabase/functions/_shared/invite-helpers.ts`
- Migrations: `20260125143210_*` (companies, profiles, vessels), `20260125160927_*` (tenant helper functions and policies), `20260127170354_*` (`user_roles`, `app_role`), `20260129125250_*` / `20260129125736_*` (RBAC tables and policies), `20260522163528_*` (crew flag `modules` rows), `20260610152107_*` (`has_fleet_access`), `20260917190000_hris_review_fixes.sql` (profile privileged-column guard), `20260919170100_signup_backstop.sql`, `20260919210000_ism_form_workflow.sql` (signer-role resolution), `20260919220000_reference_numbers.sql`, `20260927120000_wire_crew_flags_into_frp_access.sql`
- Generated types (grepped): `companies`, `vessels`, `profiles`, `fleet_groups`, `crew_assignments`, `user_roles`, `roles`, `modules`, `role_permissions`, `rbac_user_roles`, `user_permission_overrides`, `permission_audit_log`, `user_sessions`, `login_history`
- Standards and audits: `docs/permissions/{README,MASTER-PROMPT}.md`, `docs/permissions/addenda/storm.md`, `docs/permissions/catalogues/storm.json`, `docs/SYSTEM-AUDIT-2026-09-19.md`, `docs/STORM-STATUS-AUDIT.md`

### Headline findings from the code

1. **STORM has no real "Fleet view vs Vessel view".** Scope is a global selection held in `VesselContext` and `localStorage` (`storm_selectedVesselId`). It is changed from the sidebar account menu (`SidebarAccountMenu.tsx`, "Vessel scope"), not a top-bar switcher. Only a handful of routes carry the vessel in the URL (`/vessel/:vesselSlug/dashboard|checklists|compliance…`), and that slug is derived from the vessel name (`vesselSlug.ts`), so renaming a vessel breaks links. `VesselSelector`, `VesselToggleBar` and `GlobalHeaderControls` exist but are not mounted anywhere.
2. **Four overlapping role systems** (`profiles.role`, `user_roles`/`app_role`, RBAC `roles`/`role_permissions`/`rbac_user_roles`/`user_permission_overrides`, and `crew.*` flag rows in `modules`). The PMS standard (`docs/permissions/`) has designed the replacement but **none of it is implemented** (no `has_capability`, `access_sets`, `user_access_assignments`, `src/lib/permissions/`).
3. **Permissions are not per vessel.** `user_permission_overrides` has no `vessel_id` (or `company_id`). `permissionsStore.setCurrentVessel` is never called by the vessel context. The reference model is per vessel (§2.2–2.4).
4. **No account-level roles in the reference sense.** There is no account owner, no vessel-scoped account admin, no shore staff with assigned vessels. `VesselContext` gives *all* vessels to anyone whose legacy `profiles.role` is `dpa` or `shore_management` (`ALL_VESSELS_ROLES`); everyone else sees vessels from `crew_assignments`.
5. **Users & Access is a thin per-user editor**: a flat company-wide list (status hard-coded "active", select boxes do nothing), and a detail page that autosaves every change straight into global overrides with no audit row. No tabs, no Matrix, no Review & save, no invites, no Access Sets.
6. **Security and lifecycle gaps with direct support-ticket parallels**: invitations are marked "invited" even when the email failed; "reset password" and "resend invitation" in `admin-actions` call `generateLink`, which returns a link and sends nothing; disabling a user does not stop them signing back in; TOTP can be enrolled but is never challenged at sign-in.
7. **Tenant isolation holes in this domain**: `vessels` is writable/deletable by every member of the company; `roles`/`role_permissions` have no `company_id` (an admin in one tenant edits the matrix for all tenants); `user_permission_overrides` write policy checks "settings admin" but not that the target user is in the same company; `permission_audit_log` accepts inserts from anyone (`WITH CHECK (true)`).
8. **No per-vessel module settings** (on/off, renamed labels, "Hours of Rest on from date"). Nothing in the schema models it.

---

## Target information architecture

### Principles

- **The URL is the source of truth for scope.** Fleet pages live under `/fleet/…`; vessel pages under `/v/:vesselCode/…`. `localStorage` only remembers the *last* vessel to open by default. A deep link (email, notification, ticket) always lands in the right vessel.
- **`vesselCode` is the vessel's 3-letter code** (`dra`, `hyd`, `dag`, `lev`), unique per account, lower-case in URLs, and also the prefix in identifiers (§1.6). It never changes once records are numbered with it. We do not use a slug derived from the name.
- **Route segments are stable English slugs.** Per-vessel label overrides ("Trip" for Charter, "Leave" for Planner) change the displayed label only.
- **Path-based, not query-string-based.** The reference uses `?section=…&subsection=…`; we use real paths, so each page is code-split and guardable. Filters and tabs within a page may use query params (`?tab=`, `?view=matrix`).
- **One layout with two modes**: `scope="fleet"` shows the fleet sidebar; `scope="vessel"` shows the vessel module tab bar plus a collapsible sidebar for the active module (§1.3).

### Global top bar (both views, §1.4)

Left to right:

1. **Tenant logo** (from Account › Fleet logo; falls back to the account display name). Links to the user's home (fleet dashboard for fleet users, vessel home for vessel-only users).
2. **Scope switcher** (replaces the sidebar "Vessel scope" menu). Shows "Fleet" or the vessel icon + name + AIS state dot. The popover has a search box, an **"All vessels — Fleet overview"** entry (only for users with fleet access), vessels grouped by fleet group, and a "recent" section. It lists only vessels in the user's reach. Hidden when the user has exactly one vessel and no fleet access.
3. **Global search / command palette** (Cmd/Ctrl-K): people, vessels, records by reference (e.g. `PTW-2026-061`), pages.
4. **Favourites** (star): pin the current page; the list reuses `usePinnedShortcuts`.
5. **Help** (?) with an unread badge (help domain).
6. **Notifications bell** with badge (moves from the sidebar header to the top bar).
7. **User menu**: name, user kind and job role, My profile, My security, My signature, Appearance, Sign out. When impersonating, the whole bar turns amber with "Viewing as <name> · End".

Footer (exists, `InkfishFooter.tsx`): tenant tagline, Help, Support, Privacy, Terms, copyright.

### Fleet view (`/fleet/…`) — owner, account admins, and shore staff with fleet access

```
Fleet
├─ Operations
│  ├─ Dashboard                 /fleet/dashboard            (fleet-dashboard doc)
│  ├─ Tracker                   /fleet/tracker              (tracking doc)
│  ├─ Reports                   /fleet/reports/:tab?        (reports doc)
│  ├─ Calendar                  /fleet/calendar             (calendar doc)
│  ├─ Documents                 /fleet/documents            (documents doc)
│  ├─ Forms & Checklists        /fleet/forms                (forms doc)
│  ├─ Training                  /fleet/training             (training doc)
│  ├─ Medical                   /fleet/medical              (health doc)
│  ├─ Visits                    /fleet/visits               (crew doc)
│  └─ Employment                /fleet/employment           (HRIS doc)
├─ Workspaces (STORM extras, keep current prefixes)
│  ├─ HRIS                      /hris/…
│  ├─ Health & Wellness         /health/…
│  ├─ Yard (New Build, Refit)   /yard/…
│  └─ Shoreside                 /shoreside/…
└─ Administration                                            ← THIS DOC owns the starred items
   ├─ ★ Users & Access          /fleet/admin/users/:tab     tab ∈ crew | admins | shore | sets | viewers
   │     ├─ Vessel Crew         /fleet/admin/users/crew?vessel=dra&view=list|matrix&show=custom|hod|medical|employment|payroll|expiring
   │     ├─ Account Admins      /fleet/admin/users/admins
   │     ├─ Shore Staff         /fleet/admin/users/shore
   │     ├─ Access Sets         /fleet/admin/users/sets, /fleet/admin/users/sets/:setId
   │     ├─ External Viewers    /fleet/admin/users/viewers  (phase 2)
   │     └─ Person access       /fleet/admin/users/people/:profileId?vessel=dra
   ├─ Notification Management   /fleet/admin/notifications  (notifications doc)
   ├─ Support                   /fleet/admin/support        (support doc)
   ├─ Company FAQs              /fleet/admin/faqs           (help doc)
   ├─ Add-ons                   /fleet/admin/add-ons        (billing doc; uses the entitlement hook below)
   ├─ ★ Vessel Settings         /fleet/admin/vessel-settings, /fleet/admin/vessel-settings/:vesselCode
   ├─ ★ Vessels                 /fleet/admin/vessels, /fleet/admin/vessels/new
   ├─ ★ Fleet Groups            /fleet/admin/fleet-groups   (STORM extra; replaces the Coming Soon page)
   ├─ GDPR                      /fleet/admin/gdpr/:tab      (GDPR doc; consumes our audit + access review)
   ├─ ★ Account                 /fleet/admin/account
   └─ ★ Security                /fleet/admin/security       (account policy: MFA rules, sessions, trusted devices)
```

### Vessel view (`/v/:vesselCode/…`) — anyone with access to that vessel

```
/v/:vesselCode                       Vessel home (dashboard)
Tabs (only modules switched on for the vessel and visible to the user, in this order):
Crew · Safety · Certificates · Technical · Charter|Trip · Vessel · Logbooks · Departments · Calendar · Reports
  e.g. /v/dra/crew/list, /v/dra/crew/people/:profileId/documents, /v/dra/safety/permits/:permitId,
       /v/dra/certificates/:sectionSlug, /v/dra/technical/jobs/:jobId, /v/dra/calendar, /v/dra/reports/:slug
"← Fleet" link at the right of the tab bar for users with fleet access.
```

Each module owns its sub-tree (crew, safety, certificates… gap docs). This doc owns the **router contract**: a `VesselScopeRoute` that resolves `:vesselCode` → vessel, checks the user can reach it, checks the module is on, sets the vessel context, and renders a 403 / "module switched off" / "vessel archived" page otherwise.

### Personal area (no scope)

`/me` (profile), `/me/security` (password, authenticator, recovery codes, trusted devices, sessions), `/me/notifications` (own in-app preferences), `/me/signature` (signature doc), `/me/appearance`. These replace the state-driven sections in `src/modules/settings/pages/Settings.tsx` so each one has a URL.

### Landing rules after sign-in

| User kind | Lands on |
|---|---|
| Owner, account admin | `/fleet/dashboard` |
| Shore staff, 1 vessel | `/v/<code>` (no switcher) |
| Shore staff, several vessels | last-used vessel, else the first; the switcher lists only theirs (no Fleet entry unless granted fleet access) |
| Shore staff, no vessels | "No vessels have been assigned to you yet — contact your account admin" page |
| Crew with a current assignment | `/v/<code of current vessel>` |
| Crew with no current assignment (on leave, between contracts) | `/me` self-service (own documents, HoR, leave, payslips per their grants) |
| External viewer | the single scoped page they were invited to |

### Legacy route redirects (keep for one release)

`/dashboard` → `/fleet/dashboard` (or vessel home for vessel-only users); `/crew/list`, `/crew/work-rest`, `/ism/*`, `/certificates`, `/maintenance/*` … → `/v/<last vessel>/<module>/<page>`; `/vessel/:slug/*` → `/v/<code>/*`; `/users-access` and `/users-access/:userId` → `/fleet/admin/users/crew` and `/fleet/admin/users/people/:profileId`; `/admin/roles`, `/settings/permissions` → `/fleet/admin/users/sets`; `/vessels/list` → `/fleet/admin/vessels`; `/settings` → `/me`.

---

## Feature inventory

Status key: complete / partial / placeholder / missing (see task definitions). Effort: S < 1 day, M 1–3 days, L 3–10 days, XL > 10 days.

### A. Tenancy and account

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| F1 | Account record: name, owner, contact name, company name, phone (country code + number), address, status, registration date, fleet logo, associated fleets | §3.1, §3.34, §4.19 | partial | `companies` (name, address, phone, email, branding columns, dpa_* contacts); Account leaf → `/settings` (personal profile); `src/modules/vessels/pages/CompanyDetails.tsx` uses `mockCompanyInfo` | No owner, account status or contact name columns; no Account page (the leaf opens personal settings; Company Details is mock data). Need `/fleet/admin/account` with read-only owner, editable contact block, status + registration date (read-only), logo upload (JPEG/PNG/WebP, ≤ 5 MB) | P1 | M |
| F2 | Account Owner: exactly one per account, full access everywhere, read-only on the Account page, changeable only by the platform | §2.1, §4.19 | missing | — (closest is legacy `profiles.role = 'dpa'`) | Owner concept, `companies.owner_user_id`, protections (cannot be removed, disabled or demoted from inside the tenant), owner-transfer runbook | P0 | S |
| F3 | Platform superadmin (vendor staff), invisible to the tenant | §1.2, §2.1 | partial | `app_role` value `superadmin` in `user_roles` (tenant-scoped row); `has_fleet_access` treats it as fleet access | Superadmin is modelled as a tenant role. Need a platform-level flag outside tenant data (e.g. `platform_staff` table, not exposed by tenant RLS), a minimal platform console (provision account, transfer owner, suspend) and exclusion from tenant user lists | P1 | M |
| F4 | Tenant provisioning and sign-up | implied by §1.1 | partial | `Auth.tsx` register tab asks for company name and a self-chosen role (incl. DPA); `AuthContext.signUp` inserts `companies` + `profiles`; `20260919170100_signup_backstop.sql` now blocks both from the browser | Register UI still exists but cannot succeed (company insert denied). Remove self-registration; provision accounts through a platform edge function that creates company + owner invite in one transaction | P0 | S |
| F5 | Tenant branding: logo top-left, display name, brand colour, footer tagline, dark mode | §1.4, §4.19 | partial | `BrandingSettings.tsx`, `useBranding.ts` (`companies.client_logo_url`, `brand_color`, `client_display_name`), `canManageBranding` = legacy role dpa/shore_management | Gate on owner/admin capability instead of legacy role; wire brand colour into tokens (audit M6); add tagline; fold into Account page | P2 | S |
| F6 | Tenant isolation for this domain's tables | implied | partial | Helpers `get_user_company_id`, `user_belongs_to_company` (`20260125160927_*`) | `vessels` FOR ALL to any company member; `roles`/`role_permissions` have no `company_id`; `user_permission_overrides` write policy lacks a same-company check; `permission_audit_log` INSERT `WITH CHECK (true)`. All four need fixing before more tenants are added | P0 | M |
| F7 | Fleet groups (regions / sub-fleets), used to group vessels in switcher, tracker and dashboard | §3.2 | placeholder | `fleet_groups` table + `vessels.fleet_group_id`; `/admin/fleet-groups` renders Coming Soon; `VesselSelector.tsx` has hard-coded `FLEET_GROUPS` with zero counts | CRUD page, assignment of vessels, use in switcher and fleet filters | P2 | S |

### B. Vessels

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| F8 | Vessels list (Select / Current vessel) and Add vessel (name*, type select, flag, IMO, MMSI, call sign) | §4.17, §3.35 | partial | `/vessels/list` → `Vessels.tsx` + `VesselFormModal.tsx` (name, IMO, MMSI, call sign, type select, flag, builder, home port, GT, year, LOA, beam, draft, fleet status); `useVessels.ts` | Add/Edit/Delete buttons shown to every user and allowed by RLS for every company member; no "Select / Current vessel" action; validation of IMO (7 digits + check digit) and MMSI (9 digits) missing; move to `/fleet/admin/vessels` | P0 | S |
| F9 | Vessel codes: 3-letter (voyages, URL) and 2-letter (template codes) | §1.6, §3.3 | missing | — | `vessels.code` (3) and `vessels.short_code` (2), unique per account; suggested from name on create; locked after first numbered record | P0 | S |
| F10 | Vessel lifecycle: active / inactive (not counted in KPIs, e.g. demo or laid up) / archived (sold) | §7.13 | partial | `vessels.status` ('Sold' excluded everywhere via `.neq('status','Sold')`), `operational_status`; delete = set status 'Sold' (`useVessels.ts:154`) | Explicit `is_counted` and `is_demo` flags so every fleet count uses one vessel set; archive semantics (read-only, end vessel access, close open visits); restore by owner | P1 | S |
| F11 | Per-vessel module settings: on/off, "on from <date>" (Hours of Rest), renamable labels (Charter/Trip, Planner/Leave), MLC 2006, Crew Training, Finance, Crew Uploads, Voice | §1.3, §3.3 module settings, §4.16 | missing | — | Table + matrix page (vessels × modules, autosave) + per-vessel detail with explanations; nav, routes, notifications and capability checks all honour it | P0 | M |
| F12 | Fleet-wide module toggles (e.g. Safety Management Manual hidden on all vessels) | §4.16 | missing | — | `company_module_settings` row per module with "applies to all vessels" + per-vessel exceptions | P1 | S |
| F13 | Seed defaults on vessel creation (certificate sections and types, module defaults, numbering counters) | §4.17 | missing | — | `create_vessel()` RPC that inserts the vessel and seeds per-domain defaults in one transaction; each domain registers a seeder | P1 | M |

### C. Two-level shell

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| F14 | Fleet view vs vessel view, with vessel scope in the URL | §1.3, §1.5 | partial | `VesselContext.tsx` (global selection, localStorage), `DashboardFilterContext.tsx` (derives multi-select from it), `/vessel/:vesselSlug/*` (5 routes), `vesselSlug.ts` (name-derived) | Most pages read the global selection, so links are not shareable and two tabs cannot show two vessels. Need `/fleet/*` and `/v/:vesselCode/*` route trees, `VesselScopeRoute`, legacy redirects, and pages reading the vessel from the route | P0 | L |
| F15 | Top-bar scope switcher ("Select Vessel" / vessel name) and Fleet entry | §1.4 | partial | Switcher is inside `SidebarAccountMenu.tsx`; `VesselSelector.tsx` (searchable, unused), `VesselToggleBar.tsx`, `GlobalHeaderControls.tsx` (dead) | Mount a single switcher in the header; drive navigation (not just context); list only vessels in reach; remove dead components | P0 | M |
| F16 | Vessel module tabs + collapsible per-module sidebar | §1.3 | partial | `ModuleTopNav.tsx` shows STORM's six workspaces (Fleet, Vessel, Shoreside, Health, Yard, HRIS); vessel modules are sidebar groups in `sitemap.ts` | In vessel scope the top rail must show vessel modules (filtered by module settings + capabilities); in fleet scope the fleet sidebar | P0 | M |
| F17 | Fleet sidebar with an Administration group | §1.3 | partial | `sitemap.ts` `fleetChildren` (14 leaves); `ADMIN_NAV_ITEMS` in `navigation.ts` is never rendered | Missing leaves: Training, Medical, Visits, Employment, Company FAQs, Add-ons, Vessel Settings, GDPR, Security, Fleet Groups; "Account" points at personal settings; Roles/Integrations/Feedback reachable only by URL | P0 | S |
| F18 | Landing rules by user kind (1 vessel → straight in; several → first; none → explanation; fleet users → fleet dashboard) | §1.3, ticket #302 theme | missing | `VesselContext` defaults to first vessel; `/` → fleet dashboard for everyone | Implement the landing table above | P0 | S |
| F19 | Top-bar utilities: favourites star, help badge, notifications bell, user menu | §1.4 | partial | `NotificationBell.tsx` (in sidebar header), `usePinnedShortcuts` (floating quick actions), help pages, `SidebarAccountMenu.tsx` | Move bell and user menu to the header; add star (pin page) and help badge; voice input is out of scope (P2, separate) | P1 | S |
| F20 | Footer (tenant tagline, Help, Support, Privacy, Terms, copyright) | §1.4 | complete | `InkfishFooter.tsx` | Tagline should come from Account settings rather than code | P2 | S |
| F21 | Identifier engine (per-account / per-vessel / per-year counters, vessel-code prefixes) | §1.6 | partial | `reference_counters` + `next_reference_value()` (`20260919220000_reference_numbers.sql`) used for audits, drills, forms | Add a shared `format_reference(kind, company, vessel, date)` with the vessel-code token so every domain uses one function (voyage `DRA-20261103-037`, `PTW-YYYY-NNN`, template `DRPTW03`…) | P1 | S |

### D. Roles, people and the permission model

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| F22 | One model of user kinds: owner, account admin, shore staff, vessel crew, external viewer, plus "the Company" actor | §1.2, §2.1 | partial | Four role systems (see headline 2); `rbacMatrix.ts` `SCOPE_MATRIX`; `permissionsStore.ts` `ROLE_PRIORITY` | A single `account_memberships` record per person per account with a `kind`, feeding PMS assignments. Legacy roles become migration inputs only | P0 | L |
| F23 | Account Admins: vessel-scoped (≥ 1 vessel), chips Admin / Manages admins / DPA, Users & Access level (No Access hides page / Read Only / Read & Write), job role, module levels and crew preset like any user | §2.1, §4.11 | missing | Legacy `dpa`/`shore_management` = all vessels and every admin setting (`settingsPermissions.ts`, `VesselContext.ALL_VESSELS_ROLES`) | Membership kind `admin` with `manages_admins`, `is_dpa`, `users_access_level`, vessel reach; only admins with `manages_admins` can invite/edit/remove admins | P0 | M |
| F24 | Shore Staff: access to assigned vessels only, View Only or Custom/Access Set, no admin rights (no Settings, Users & Access, payroll, fleet admin pages) | §2.1, §4.11, ticket #302 theme | missing | `shore_management` legacy role gets all vessels and admin settings | Membership kind `shore`; per-vessel assignments; "Assign to vessel" action; no implicit fleet access | P0 | M |
| F25 | Job roles for admins/shore (DPA, Crew Manager, Fleet Manager, Fleet Operations, Managing Director, Operations Manager, Owner's Representative, Shore Purser, Superintendent, Technical Manager, Yacht Manager, Shoreside Logistics) | §2.1 | missing | PMS addendum lists shore departments/ranks; nothing in UI | Seeded `job_roles` catalogue (tenant-extendable); DPA only selectable for admins; drives notification routing (DPA receives data-protection notices) | P1 | S |
| F26 | Crew Module Access preset per vessel (View Only default, Head of Department, Full Access, Custom) with the cascade rule: Full Access → all other modules Read & Write; other presets → None; Payroll never set by a preset | §2.2, §5.1.3 | partial | `presets.ts` `PRESET_MATRIX` maps presets to four RBAC modules (`crew_roster`, `crew_certificates`, `hr`, `training`); `useApplyPreset` | Presets are global (not per vessel), map to coarse modules not the crew flags, and do not cascade to other modules. Rebuild as system Access Sets applied per vessel | P0 | M |
| F27 | Crew permission flags (23 on the edit form: HOD, In/Out Board, 8 view, 8 approval, 2 appraisal, 3 training) with dependencies and sensitive markers | §2.3, §2.5 | partial | `capabilityCatalog.ts` (17 flags, includes payroll/expense/invoice approvals), `modules` rows from `20260522163528_*`; only `crew.see_crew_list`, `view_crew_profiles`, `edit_crew_profiles`, `approve_leave`, `access_leave_records` enforced (via `frp_can_*`, `20260927120000_*`) | Missing flags: Head of Department, In/Out Board, Manage checklists, Transfer crew, View training register, Approve training (HOD), Final training approval. Dependencies not enforced. Most flags not enforced anywhere. Map all to PMS capability keys | P0 | M |
| F28 | Department scopes: appraisal scope (AVIT, Bridge, Deck, Engineering, Galley, Interior, Security, Other; empty = own department) and training scope (Bridge, Deck, Dive, Engineering, Galley, Interior, IT, Medical, Subsea, Other; empty = all) | §2.3 | partial (buggy) | `DepartmentScopeCard.tsx`, `useDepartmentScope.ts` (saves `module_key = 'crew.department_scope'`, which is not a `modules` row, so the FK rejects it); `capabilityCatalog.ts` `DEPARTMENTS` (6 values) | Two separate scopes; correct empty-set semantics (STORM's card says empty = ALL for appraisals, the reference says own department); canonical department list; store in PMS assignment/scope, not a fake module key | P1 | S |
| F29 | Other Module Access per vessel: Safety, Certificates, Technical, Vessel, Charter/Trip, Finance at None / Read Only / Read & Write, Payroll as a child of Finance, "Set all (except Payroll)" | §2.4, §5.1.3 | partial | `moduleGroups.ts` `OTHER_MODULE_GROUPS`; detail page "Set all to" | Wrong mappings (Charter → `meetings`,`reports`; "Accounting" → `insurance`,`settings`,`audits_surveys`,`documents`); offers an extra "Admin" level; no Payroll child; not per vessel; "Set all" includes everything | P0 | M |
| F30 | Access Sets: named reusable bundle (name, description, preset, flags, six module levels), usage count, edit applies to all holders, cannot delete while in use; excludes Payroll, finance approvals and department scopes | §2.5, ticket #146 theme | partial | `RolesPermissionsPage.tsx` edits a global role × module matrix (`roles`, `role_permissions`); PMS designs `access_sets` | No tenant-scoped sets; no "save these permissions as a named set"; no usage counts or delete guard | P0 | M |
| F31 | Per-vessel permission evaluation and enforcement (UI, route, edge function, RLS), failing closed | §2.2–2.4 | partial | `AuthContext.canAccessModule` (now fails closed while loading), `ModuleRoute.tsx` (HRIS/health only), `ProtectedRoute.tsx` (login only, used by `/users-access`, `/admin/roles`, `/vessels/list`); `permissionsStore` loads once, ignores vessel | Implement PMS `has_capability(user, key, vessel…)` / `get_effective_capabilities(user, vessel)`; reload on scope change; `<Can>` / `useCan`; capability on every nav leaf and route; module-switched-off and entitlement checks folded in | P0 | XL |
| F32 | Gated sensitive areas: crew Employment and Medical tabs, Compliance Pack (admins, Full Access, HOD), payroll overview | §2.7 | partial | `hrAccess.ts`, `medicalAccess.ts`, `payrollAccess.ts`, `ModuleRoute` levels | Field-level leak: medical and employment columns sit on `profiles`, readable by every company member (documented in `20260927120000_*`). Move to separate tables behind capability RLS | P0 | M |
| F33 | "The Company" actor and vessel-office resolution: who can give company sign-off (owner or admin with reach on that vessel); who is Master / HoD / Purser / SSO of vessel X today | §1.2, §8.6, ticket #78 theme | partial | `form_user_satisfies_signer_role()` (`20260919210000_ism_form_workflow.sql`) matches by role name only — a Master of one vessel satisfies the Master slot on any vessel; company sign-off checks are ad hoc per module | `is_company_actor(user, vessel)` and `vessel_office_holders(vessel, office, at)` SQL functions used by every sign-off engine, enforced server-side | P0 | M |
| F34 | Designated vessel roles shown as badges: IHM Officer, Ship Security Officer, Safety Officer, Medical Officer, Garbage Officer, Crew Representative (one per department allowed) | §3.4 role tags, ticket #147 theme | missing | — | Table + crew profile card + list badges; cleared on transfer; feed `vessel_office_holders` | P1 | S |
| F35 | Position catalogue (≈250 positions, "+ New position for this vessel") with a default Access Set per position | §3.5, ticket #40 theme | partial | `RANKS` in `src/modules/crew/constants.ts`; hard-coded `POSITIONS` in `VesselAccessSection.tsx:63`; PMS addendum §3 canonical ranks | `positions` table (account-wide + vessel-specific), department and rank tier per position, default Access Set used on Add Crew and on invite | P1 | M |
| F36 | External viewers (shipyard, management company, owner's rep, surveyor): view-only, scoped, 7-day invite, authenticator sign-in, every view logged, costs hidden unless allowed | §6.28, §7.14 | missing | `app_role` has `auditor_flag`, `auditor_class`, `travel_agent` but no flow | Membership kind `external` with mandatory `valid_until`, scope object, view log. UI lives in the technical doc; the access mechanics are built here | P2 | L |

### E. Users & Access UI (§4.11, image42)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| F37 | Vessel Crew tab, List view: fleet-wide "Find crew", vessel select, chips with live counts (All, Custom only, Heads of Department, Can view medical, Can access employment, Payroll access), columns Name (On Board/On Leave, Last active, T&C/Privacy), Position, Crew Module Access (preset/set chip or "Custom +n −n", orange sensitive chips), Other Modules (Safety, Certs, Tech, Vessel, Charter, Fin: R/W), Actions (Login as, Edit) | §4.11 | partial | `UsersAccessListPage.tsx`, `useUsersWithAccess.ts` | Lists every company profile with no vessel filter; status hard-coded "active"; checkboxes inert; no count chips; chip mapping wrong (Charter → `fleet`, "Acct" → `settings`); no last active / T&C columns | P0 | M |
| F38 | Matrix view: people × 17 key capabilities (image42 shows 17 flag columns: See crew list … Final training approval), sort by Rank or Name, sensitive columns orange, click to stage, "Nothing saves until you press Review & save" | §2.3, §4.11, §7.12, image42 | missing | — | Build per PMS §7 with the addendum's 17 default columns; staged changes; Review & save dialog | P0 | M |
| F39 | Edit person: preset/set, custom flags, scopes, other modules, "Save these permissions as a named set…", Password & Account Management expander, explicit **Save Permissions** | §4.11, §2.6 | partial | `UsersAccessDetailPage.tsx` | Autosaves every click (reference and PMS both require an explicit, reviewed save); no vessel selector; no save-as-set; no account management actions (they live separately in `admin-actions` / crew `ToggleAccessModal`) | P0 | M |
| F40 | Bulk edit: tick several crew → side panel with tri-state boxes; only changed boxes saved; pre-save summary of who gains/loses what | ticket #146 theme | missing | — | Reuse the staged changeset + Review & save | P1 | M |
| F41 | Account Admins tab: Invite Admin, role filter, rows (name, email, last active, T&C/Privacy, chips Admin / Manages admins / DPA), Manage permissions, Remove admin | §4.11 | missing | — | Whole tab and invite form (see Workflows W2) | P0 | M |
| F42 | Shore Staff tab: status and vessel filters, Invite Shore Staff, columns (name, email, vessels, access, status, last active), Manage permissions, Assign to vessel, Login as, Remove | §4.11 | missing | — | Whole tab and invite form | P0 | M |
| F43 | Access Sets tab: New set, Edit, Delete; card shows "n of 17 crew flags · n of 6 modules R&W · used by n" and orange sensitive chips | §2.5, §4.11 | partial | `RolesPermissionsPage.tsx` (global role matrix, route `/admin/roles` and `/settings/permissions`, not in nav) | Replace with tenant-scoped Access Sets editor | P0 | M |
| F44 | Effective-permission inspector ("why can / can't this person do X on Draak?": set, override, deny, module off, add-on missing) and per-person access history | PMS §7, ticket #138 theme | missing | — | Panel on the person page reading `get_effective_capabilities` with `source` + audit rows | P1 | S |
| F45 | Spreadsheet export / import of the matrix (four-eyes apply) | PMS §8 | missing | generator `scripts/permissions/build-matrix-workbooks.mjs` exists | In-app export/import per PMS §8 | P2 | L |

### F. Account lifecycle and security

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| F46 | Invitations: lifecycle, delivery status, resend, expiry, copy link | §3.4 "invitation status", §6.24, ticket themes on invites not arriving | partial (buggy) | `send-invitation`, `bulk-invite`, `_shared/invite-helpers.ts`, `accept-invitation`, `create-crew-member`; `profiles.invitation_token*`, `invited_at`, `last_invited_at`, `invitation_count`, `account_status` | `invite-helpers.ts` creates the auth user first and then calls `inviteUserByEmail`, which fails for a user that already exists; the error is only logged and the profile is still stamped `invited`. Orphan lookup only scans the first 200 auth users. Callers are gated by legacy `profiles.role`. No delivery/bounce tracking, no expiry shown, no invite for admins/shore staff | P0 | M |
| F47 | Password reset, temporary credentials, invalidate sessions, disable / enable access | §2.6 | partial (buggy) | `admin-actions` `reset_account` / `toggle_access`; crew `ToggleAccessModal.tsx` | `password_reset` and `resend_invitation` call `generateLink`, which returns a link and sends no email, yet report "email sent". `toggle_access` only sets `profiles.account_status`; nothing checks it at sign-in (`ProtectedRoute` checks the session only) and the sign-out call appears to pass a user id where the admin API expects an access token — verify. Disabled users can sign back in | P0 | S |
| F48 | Login as / view as (support impersonation) | §2.6, §7.10 | missing | Refit has a client-only `RolePreviewSwitcher.tsx` (role preview, not a person) | Audited, time-limited, read-only "view as" first (see W8) | P1 | L |
| F49 | Remove admin / remove shore staff / assign to vessel | §2.6 | missing | `VesselAccessSection.tsx` manages `crew_assignments` (employment-like), not access | Actions on the admin and shore tabs, writing memberships and assignments | P1 | S |
| F50 | Last active and T&C / Privacy acceptance per person | §4.11 | missing | `profiles.last_login_at` (never written), `user_sessions` and `login_history` tables (never written) | Write last-active on session refresh (throttled) and record versioned policy acceptance at first sign-in | P1 | S |
| F51 | "Join vessel as crew" for an admin (Add myself as crew: vessel, position, department) | §4.19 | missing | — | Small form on Account page creating a crew assignment for the admin | P2 | S |
| F52 | Authenticator app (TOTP) with enforcement, recovery, trusted device | §4.20, §3.36, §7.10 | partial | `SecuritySection.tsx` enrols / verifies / unenrols Supabase TOTP | Sign-in never challenges for the second factor (no AAL2 check anywhere), so enrolment protects nothing; no recovery codes; no "trust this device for 30 days"; no account policy to require MFA for owner/admins/sensitive-grant holders; sessions list reads an empty table | P1 | M |
| F53 | Every permission change logged (who, what, from, to, reason, when, source) and visible in GDPR Activity | §6.24, §7.6 | partial | `permission_audit_log` + `log_permission_change` RPC (used by `RolesPermissionsPage`) | Users & Access writes (`useSavePermissionOverride`, `useApplyPreset`) write no audit row; anyone can insert audit rows; need a trigger or RPC-only path | P0 | S |
| F54 | Periodic access review (who can see personal data; Download CSV; Mark review complete) | §4.18 Access tab, §6.24 | missing | — | `access_reviews` table + snapshot export; UI hosted in GDPR doc | P1 | S |
| F55 | Personal settings with URLs (profile, security, notifications, appearance) | — (STORM UX) | partial | `Settings.tsx` keeps the active section in component state | Route per section under `/me/*` | P2 | S |

**Coverage:** 55 features — complete 1, partial 31, placeholder 1, missing 22.

### How the reference model maps onto PMS v1 (STORM's designed standard)

PMS (`docs/permissions/`) is the right engine: capability keys, scopes (S/D/V/F), Access Sets, per-person overrides, deny-wins, fail-closed, audit, Review & save. The reference model is the right *vocabulary* for most users. Build PMS underneath and present the reference vocabulary on top:

| Reference concept (§2) | PMS equivalent | What to add to PMS |
|---|---|---|
| Crew Module Access preset (View Only / HOD / Full / Custom) | System Access Sets `view_only`, `hod`, `full_vessel`; Custom = overrides present | Preset cascade rule: applying Full Access sets all six module bundles to Read & Write; other presets set them to None |
| 23 crew flags | One capability each (addendum §5 legacy map + "new capabilities") | **Head of Department** is not a capability: store it as `is_head_of_department` on the vessel assignment (it sets the default appraisal scope) and have ticking it grant the four rights §2.5 attaches to it, each as its own capability: verify colleagues' credentials, silence expiry alerts, open the Compliance Pack, acknowledge fleet documents. Add a capability for the **In/Out Board**. Proposed keys (reconcile in PMS phase 0, keys are not in `storm.json` yet): `vessel.crew.crew_documents.approve`, `vessel.crew.expiry_alerts.admin`, `vessel.reports.compliance_pack.export`, `fleet.operations.fleet_documents.sign`, `vessel.crew.in_out_board.edit` |
| Module level None / Read Only / Read & Write | A **module bundle**: Read Only = every `view` + `export` capability under that vessel module; Read & Write = Read Only + `create` + `edit` + `sign` | Store bundles as generated Access Set fragments so "Simple mode" (6 dropdowns) and "Advanced mode" (capability grid) edit the same grants |
| Payroll (child of Finance), never in a preset or set | `hris.compensation.payroll.*` with `entitlement = finance` | Rule: Payroll grant requires Finance ≥ same level; excluded from Access Sets and presets by validation |
| Appraisal / training department scopes | `scope_code = 'D'` + department list on the assignment | Two named scope lists per assignment (appraisals, training) with different empty-set meanings |
| Users & Access level for admins (No Access / Read Only / Read & Write) | `admin.access.users_access.view` / `.edit` | Scope it to the admin's vessels (an admin can only see and edit people on vessels in their reach) |
| "Can manage account administrators" | — | New capability `admin.access.account_admins.edit` |
| DPA flag | DPA rank (`command`, fleet) in addendum §3 | Keep both: DPA rank for access, `is_dpa` on the admin membership for notification routing |
| Account owner | — | New membership kind `owner`, outside the matrix, always full, cannot be overridden |
| Shore staff vessels | `user_access_assignments` rows per vessel | Assignments for shore staff must not imply admin capabilities |
| Vessel module switched off | — | `has_capability` returns false when `vessel_module_settings.enabled = false` for the capability's module, before evaluating grants |
| Add-on not subscribed | `cap.entitlement` | Entitlement source = add-on subscription per vessel (billing doc) |
| Matrix default columns | Addendum §6 (17 key capabilities) | Matches image42 exactly (17 columns; the blueprint text says 16) |

---

## Workflows & state machines

### W1. Account (tenant) lifecycle — platform-operated

States: `provisioning` → `active` ⇄ `suspended` → `closed`.

| Transition | Who | Effect |
|---|---|---|
| Create account | Platform superadmin only (platform console or edge function `platform-create-account`) | Inserts `companies` row (status `provisioning`), owner membership (status `invited`), seeds defaults (job roles, system Access Sets, module defaults), sends the owner invite |
| Owner accepts invite | Owner | Account → `active`; owner must enrol an authenticator if the account policy requires it |
| Suspend / reinstate | Platform only | Suspended: sign-in blocked for everyone except the owner, who sees a read-only banner; scheduled jobs and outbound emails stop |
| Close | Platform only, after written request | Sign-in blocked; data handled under the GDPR retention rules |
| Transfer ownership | Platform only | New owner must already be an active admin; previous owner becomes an admin with `manages_admins`; both are notified; audited |

No one inside the tenant can create, close or delete an account, or change the owner (§2.1, §4.19).

### W2. Invitation (admin, shore staff, crew) — §6.24

Invitation states: `draft` → `sent` → `delivered` | `bounced` | `failed` → `accepted`; side exits `expired`, `revoked`.
Membership states: `invited` → `active` ⇄ `disabled` → `removed`.

1. **Create** (Invite Admin / Invite Shore Staff / Add Crew Member with email):
   - Who: owner; admins with Users & Access = Read & Write *on every vessel they tick*; inviting or editing an **admin** additionally needs "Can manage account administrators".
   - Required: email (valid format, not a blocked placeholder domain — reuse `isFakeEmail`), full name; for admins and shore staff at least one vessel; for crew a position, department and vessel.
   - **Access is chosen before sending** (ticket #40 theme): the invite carries the intended preset/Access Set, module levels, flags and vessels. Defaults: crew get their position's default Access Set; admins and shore staff default to View Only and **No Access** on every module — never automatic fleet-wide access.
   - Sensitive grants (medical view/edit, employment, transfers, payroll) need a confirmation and a reason.
   - If the email already belongs to an **active member of this account**, block and offer "Open their access" instead. If it belongs to a person on a vessel the inviter cannot see, say so and offer "Request transfer" (ticket #26 theme) instead of failing with "already created".
2. **Send**: our own email (via the existing `send-email` function), not the default auth template. Token is random, stored hashed, valid **7 days** (account-configurable 1–30). Record provider message id.
3. **Delivery**: provider webhook updates `delivered` / `bounced` (with reason). A bounce shows a red chip on the person row and notifies the inviter: "Invitation to … bounced: mailbox does not exist — fix email".
4. **Resend**: allowed after a 5-minute cooldown; maximum 5 per 24 h; issues a new token and revokes the old one. **Copy invite link** (for WhatsApp/Signal) is allowed for owner/admins and is logged.
5. **Accept**: set password (min 12 chars, breach check) or SSO; accept current Terms and Privacy versions; enrol authenticator if policy requires; membership → `active`; land per the landing table.
6. **Forgotten password before accepting**: the reset form detects a pending invite and re-sends the invitation instead of erroring ("needs invite first" ticket theme).
7. **Expire**: nightly job marks `expired`; row shows "Invite expired — Resend".
8. **Revoke**: inviter or admin; token invalidated; membership removed if never accepted.

Notifications: inviter in-app on accept and on bounce; DPA-flagged admins email-notified when an admin is invited. Audit: `invite.created|sent|resent|link_copied|bounced|accepted|revoked|expired`.

### W3. Access change (Edit person, Matrix, Bulk) — §2.3, §4.11, §6.24, §7.12

States of a changeset: `staged` (client only) → `reviewing` (server-validated diff shown) → `applied` | `rejected` | `discarded`.

1. Edits are **staged**; the Matrix footer shows "n changes staged · Review & save". Leaving the page with staged changes prompts.
2. **Review & save** calls `preview_access_changes(changeset)`, which returns per person × vessel: capability, from → to, scope, auto-added dependencies, blocked items with reasons.
3. **Dependency rules** (auto-corrected and shown): edit profiles ⇒ view profiles; edit medical ⇒ view medical; approve leave ⇒ access leave records; conduct appraisals ⇒ view appraisals; any approval ⇒ crew list view; module Read & Write ⇒ Read Only; Payroll ⇒ Finance at the same level or higher. Unticking a prerequisite also unticks its dependents (shown).
4. **Blocking rules**: nobody changes their own access; nobody grants a capability they do not hold on that vessel; only `manages_admins` can change admins; the owner cannot be edited; role-level separation-of-duties rules from the PMS catalogue.
5. **Sensitive grants** require a typed reason and allow an optional end date; the end date shows a "expires in n days" chip from 14 days before.
6. **Apply** = one RPC `apply_access_changes(changeset)`: writes assignments/overrides and audit rows in one transaction. Affected users' clients refetch capabilities (realtime channel on `access_changes` or on window focus).
7. **Preset or Access Set change** replaces crew flags and module levels with the set's values; Payroll, finance approvals and department scopes are untouched.
8. The person row then shows the set name, or "Custom (closest: Head of Department +1 −2)"; clicking it lists the differences with "Reset to set" and "Save as new set".

Notifications: the affected person gets "Your access on Draak changed" (in-app; email optional by account setting). DPA-flagged admins get an email when transfer, medical, employment or payroll grants change (ticket #96 theme).

### W4. Access Set lifecycle — §2.5

States: `active` (used by n) → `archived`; system sets are read-only (duplicate to customise).

- Create from scratch or "Save these permissions as a named set…" from a person. Name unique per account (≤ 60 chars); description optional (≤ 200).
- Validation: no Payroll, no finance approvals, no department scopes in a set.
- Edit: the save dialog lists every holder and what they gain/lose; options "Apply to all n holders" (default) or "Apply only to people given this set from now on" (holders are converted to Custom with their old values). Audited per holder.
- Delete: only when `used_by = 0`; otherwise the dialog requires choosing a replacement set for each holder first.

### W5. Vessel lifecycle — §4.17, §7.13

States: `active` (counted) ⇄ `inactive` (not counted: demo, laid up, in yard without crew) → `archived` (sold / left management) → `active` (restore, owner only).

| Transition | Who | Rules / effects |
|---|---|---|
| Create | Owner; admins with `fleet.operations.vessels.create` | Name required (unique per account, ≤ 80 chars); type from list; IMO 7 digits with check digit; MMSI 9 digits; call sign 3–7 alphanumerics; code suggested from name, unique, editable until first numbered record. Runs `create_vessel()` which seeds defaults from each domain |
| Mark inactive / demo | Owner, admins | Excluded from every fleet KPI, count and "Showing n of n vessels" text; still selectable |
| Archive | Owner, admins with `manages_admins` | Typed confirmation of vessel name; vessel becomes read-only; hidden from switchers (available under "Archived" filter); all vessel access assignments end-dated today (crew keep self-service view of their own records); open visits closed; scheduled reminders stop; audited |
| Restore | Owner | Reverses archive; access is not restored automatically |
| Hard delete | Owner, only within 24 h of creation and only if the vessel holds no records | Otherwise archive |

### W6. Vessel module setting change — §4.16

- Matrix cell edits **autosave** (toast "Saved · Undo"), owner and admins only, audited.
- Switching a module **off**: its tab, sidebar, dashboard widgets, calendar events, notifications and capability checks disappear for that vessel; data is retained; deep links show "Charter is switched off for Draak. An account admin can switch it on in Vessel Settings."
- **Hours of Rest** "on from <date>": breaches and missing-day reminders count only from that date.
- **Label override** (Charter ↔ Trip, Planner ↔ Leave): display only.
- Fleet-wide toggle (e.g. Safety Management Manual) sets a default with per-vessel exceptions shown as "Hidden on 10 of 10 vessels".

### W7. Disable, enable, remove, reset

| Action | Who | Effect |
|---|---|---|
| Disable access | Owner; admins with U&A RW on all the person's vessels (admins need `manages_admins`) | Membership `disabled`; auth user banned (`ban_duration`); all sessions revoked; sign-in shows "Your access has been disabled by your account administrator"; reason required |
| Enable | Same | Ban lifted; membership `active` |
| Remove admin / shore staff | Same | Membership `removed`, assignments end-dated, profile retained for retention rules |
| Crew leaves vessel | Crew domain (end employment / transfer) | Vessel access assignment end-dated on the sign-off date automatically; self-service access to own records stays (MLC `view_own`) |
| Send password reset | Same | Our email with a recovery link (not `generateLink` alone); logged |
| Temporary credentials | Owner only | Generates a one-time password shown once; forces change at next sign-in; logged with reason |
| Invalidate sessions | Same as disable | Revokes refresh tokens |

Guards: cannot act on yourself; cannot act on the owner; the last admin with `manages_admins` cannot be removed or disabled.

### W8. View as / Login as — §2.6, §7.10

States: `requested` → `active` (≤ 30 min) → `ended` | `expired`.

- Who: owner; admins with `manages_admins` (capability `admin.access.users_access.impersonate`). Target must be in the actor's reach and must not be the owner or an admin with `manages_admins`.
- Reason required. Phase 1 is **read-only**: every write RPC and RLS write policy rejects when the JWT carries an impersonation claim. Phase 2 (decision) may allow writes with a second confirmation; every write then records both identities.
- UI: amber top bar "Viewing as <name> · 24:13 left · End". All page views logged to `impersonation_events`.
- The target sees "An administrator viewed your account on <date> (reason)" in their security log.

### W9. Authenticator (TOTP) and sign-in assurance — §4.20, §3.36

Personal factor states: `not_set` → `pending_verification` → `active` → `not_set` (removed by self, or reset by admin with reason).

- Enrol: QR + secret, confirm a 6-digit code, then show **10 one-time recovery codes** (download / copy; regenerate invalidates old ones).
- Sign-in: email + password → if a verified factor exists, challenge (AAL2). If the account policy requires MFA for this person and none is enrolled → forced enrolment before any page renders.
- "Trust this device for 30 days" (account-configurable 0–30): device record stored; re-challenge after expiry or when the IP country changes.
- Account policy (Security page): require MFA for owner/admins (default **on**), for shore staff, for anyone holding a T2/T3 grant, or for everyone.
- Admin reset of another person's factor: owner or `manages_admins`; reason; audited; person notified by email.

### W10. Who is "the Company", and who holds a vessel office — §8.6

- `is_company_actor(user, vessel)` = user is the owner, **or** an active admin whose reach includes that vessel. Shore staff are never the Company. Used by every company acknowledgement / sign-off / close / return-to-vessel action (risk assessments, corrective actions, HESS minutes, incidents, medical cases) and enforced in the RPC and RLS, not just the UI (ticket #78 theme).
- `vessel_office_holders(vessel, office, at timestamptz default now())` returns the people holding an office on that vessel at that time, from current crew assignments + position mapping (Master, Chief Officer, Chief Engineer, Purser, HoD of department X) and designated roles (SSO, Safety Officer, IHM, Medical, Garbage, Crew Rep). The signature engine uses it so a Master of Hydra cannot fill the Master slot on a Draak form.

### W11. Access review — §4.18, §6.24

States: `due` → `in_progress` → `completed`. Default cycle 90 days (account setting). Owner or DPA-flagged admin downloads the CSV snapshot (person, kind, reach, personal details / medical / employment / payroll levels, last active), marks complete with optional notes; the snapshot file is stored with the review. Reminder email when due. (UI in the GDPR doc.)

---

## Data model

All changes are additive (PMS non-negotiable 1). Names follow STORM conventions (`snake_case`, `company_id`, `vessel_id`, `created_by`, timestamps).

| Entity | Key fields | Existing STORM table(s) or NEW | Notes |
|---|---|---|---|
| Account | id, name, display_name, logo_url, brand_color, tagline, contact_name, phone_country_code, phone, address, owner_user_id, account_status (`provisioning`/`active`/`suspended`/`closed`), registered_at, settings jsonb (invite_expiry_days, trusted_device_days, mfa_policy, access_review_days) | `companies` + new columns | `created_at` can backfill `registered_at`. Owner backfill is an open question |
| Platform staff | user_id, role (`support`/`engineer`/`admin`), granted_by | NEW `platform_staff` | Not readable by tenant RLS; replaces tenant-row `superadmin` for platform powers |
| Account membership | id, company_id, user_id, profile_id, kind (`owner`/`admin`/`shore`/`crew`/`external`), job_role_key, manages_admins bool, is_dpa bool, users_access_level (`none`/`read`/`write`), status (`invited`/`active`/`disabled`/`removed`), invited_by, invited_at, accepted_at, disabled_at, disabled_reason, removed_at, last_active_at, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at | NEW `account_memberships` | Unique (company_id, user_id). One owner per company (partial unique index). `profiles.role` becomes display-only after migration |
| Job role | key, label, allowed_kinds (admin/shore), is_system, company_id nullable | NEW `job_roles` | Seed the 12 values from §2.1; DPA allowed for admins only |
| Fleet group | id, company_id, name, color_hex, sort_order | `fleet_groups` (exists) | Vessel link stays `vessels.fleet_group_id` unless m2m is needed (open question) |
| Vessel (tenancy fields) | code char(3), short_code char(2), is_counted bool default true, is_demo bool default false, lifecycle_status (`active`/`inactive`/`archived`), archived_at, archived_by, archive_reason | `vessels` + new columns | Unique (company_id, code) and (company_id, short_code); check `code ~ '^[A-Z][A-Z0-9]{2}$'` (DECISIONS D-25, amending C20's three letters); trigger blocks code change once `reference_counters` has a scope containing the vessel id. Keep `status` for back-compat; map 'Sold' → archived |
| Vessel module setting | vessel_id, module_key (`crew_hor`, `crew_training`, `charter`, `finance`, `planner`, `mlc2006`, `crew_uploads`, `voice`, `safety_manual`, …), enabled bool, enabled_from date, label_override text, settings jsonb, updated_by, updated_at | NEW `vessel_module_settings` | PK (vessel_id, module_key). Missing row = module default from `module_defaults`. RLS: read by anyone with vessel reach; write owner/admin |
| Account module default | company_id, module_key, enabled, label_override | NEW `company_module_settings` | Fleet-wide toggles and defaults for new vessels |
| Department | key, label, sort_order, is_active | NEW `departments` (PMS §4) | Canonical list; replaces the nine duplicates named in the PMS addendum §3 |
| Rank / position | id, company_id, vessel_id nullable, name, department_key, rank_tier (`command`/`hod`/`officer`/`rating`/`trainee`), default_access_set_id, is_active | NEW `positions` (+ PMS `ranks`) | Seed a STORM-authored position list owned by `gap/04` (DECISIONS C22), mapped to department, rank tier and default Access Set; "+ New position for this vessel" writes a vessel-specific row |
| Capability catalogue | key, domain, module_group, subcategory, action, sensitivity, owner_departments, department_scoped, legacy_key, route, entitlement, vessel_module_key | `modules` + PMS columns (addendum §2) | Add `vessel_module_key` so a switched-off module disables its capabilities |
| Access Set | id, company_id nullable (null = system), key, label, description, preset_kind (`view_only`/`hod`/`full`/`custom`), is_system, archived_at | NEW `access_sets` (PMS) | System sets: View Only, Head of Department, Full Access, plus PMS sets |
| Access Set grant | access_set_id, capability_key, scope_code | NEW `access_set_grants` (PMS) | Module-level bundles materialised as grants |
| Access assignment | id, company_id, user_id, vessel_id nullable (null = account-wide for owner/admin fleet capabilities), access_set_id, department_key, position_id, appraisal_departments text[], training_departments text[], valid_from, valid_until, created_by | `rbac_user_roles` → extend, or NEW `user_access_assignments` + compatibility view (PMS) | One active assignment per (user, vessel). External kind requires `valid_until` |
| Permission override | id, company_id, user_id, vessel_id nullable, capability_key, effect (`grant`/`deny`), scope_code, reason (required for T2/T3), valid_from, valid_until, created_by | `user_permission_overrides` + new columns | Add `company_id` (backfill from profile) and `vessel_id`; replace unique (user_id, module_key, permission) with (user_id, vessel_id, capability_key, effect) |
| Access changeset | id, company_id, created_by, status (`reviewing`/`applied`/`rejected`), diff jsonb, applied_at | NEW `access_changesets` | Makes Review & save auditable and replayable |
| Permission audit | actor, actor_kind, source (`ui`/`matrix`/`bulk`/`import`/`migration`/`invite`), target_user_id, vessel_id, capability_key, scope_from, scope_to, reason, changeset_id, impersonator_id | `permission_audit_log` + columns | INSERT only through SECURITY DEFINER functions; drop `WITH CHECK (true)` |
| Invitation | id, company_id, email, profile_id, membership_id, kind, intended_access jsonb, token_hash, status, expires_at, send_count, last_sent_at, provider_message_id, delivery_status, delivery_error, accepted_at, revoked_at, created_by | NEW `user_invitations` | Replaces `profiles.invitation_token*`, `invited_at`, `last_invited_at`, `invitation_count` (keep columns, stop writing) |
| Impersonation session | id, company_id, actor_user_id, target_user_id, reason, mode (`read`/`write`), started_at, ends_at, ended_at | NEW `impersonation_sessions` + `impersonation_events` (page, at) | Claim added to JWT via custom access-token hook |
| MFA support | user_id, code_hash, used_at (recovery codes); user_id, device_hash, label, trusted_until, last_ip_country (trusted devices) | NEW `mfa_recovery_codes`, `trusted_devices` | Factors themselves stay in Supabase Auth |
| Sessions / last active | user_id, last_active_at, device, ip_country, revoked_at | `user_sessions`, `login_history` (exist, unused) | Writer: auth hook or throttled RPC `touch_last_active()` |
| Designated vessel role | id, vessel_id, profile_id, role_key (`ihm`/`sso`/`safety_officer`/`medical_officer`/`garbage_officer`/`crew_rep`), department_key (crew rep only), assigned_by, assigned_at, ended_at | NEW `vessel_role_assignments` (+ `vessel_role_types`) | Ended automatically on transfer / sign-off |
| Access review | id, company_id, reviewed_by, started_at, completed_at, snapshot_path, notes | NEW `access_reviews` | Shared with the GDPR doc |
| Reference counters | scope, next_value | `reference_counters` (exists) | Add `format_reference()` helper |

**Key SQL functions (all `SECURITY DEFINER`, `STABLE`, `search_path = public`)**

- `current_membership(company uuid) → account_memberships`
- `user_vessel_reach(user uuid) → setof uuid` (owner → all non-archived vessels; admin/shore → assigned; crew → current assignment; external → scoped vessel)
- `has_capability(user, key, vessel, department, subject)` — PMS §3.8 plus: owner short-circuit (true), module-switched-off check, entitlement check, impersonation read-only check for write actions
- `get_effective_capabilities(user, vessel) → (capability_key, scope_code, source)`
- `is_company_actor(user, vessel)`, `vessel_office_holders(vessel, office, at)`
- `preview_access_changes(changeset jsonb)`, `apply_access_changes(changeset jsonb)`
- `create_vessel(payload jsonb)`, `archive_vessel(vessel, reason)`
- `format_reference(kind text, company uuid, vessel uuid, at date)`

---

## Improvements over the reference

Each item is tied to a support-ticket theme from the reference app's export where one exists (ticket numbers are the reference app's own; no personal data).

1. **Invitations that report what actually happened** (six tickets: invites not received, "email address does not exist", password reset impossible until an invite is sent, account locked). Delivery and bounce status on the person row, expiry shown, resend with cooldown, "copy invite link" fallback, and a forgotten-password flow that re-sends the invite automatically. STORM's own code has the same failure mode today (F46, F47), so fixing it is doubly important.
2. **Access correct at first sign-in** (ticket #40). Crew get their position's default Access Set when added; admins and shore staff must have vessels and modules chosen before the invite can be sent; nobody gets fleet-wide access by default.
3. **"Custom" explains itself, sensitive access is visible, bulk edit works** (ticket #146, a paid change in the reference). Ship it from day one: closest-set diff chip, orange sensitive chips and filters with counts, tri-state bulk panel, staged Matrix with a gains/losses summary.
4. **Transfer is its own permission and the DPA hears about it** (tickets #96, #121). `vessel.crew.crew_assignments.assign` separate from employment access; DPA-flagged admins notified on every transfer and on grants of that permission.
5. **Restrict alert silencing to officers and HoDs** (ticket #160). "Silence expiry alerts" is an explicit capability included in the HOD and Full sets only.
6. **Switch modules off instead of paying to hide them** (tickets #10, #12, #14: requests to remove Leave, unused technical items and maintenance templates). Per-vessel module switches with hide-not-delete semantics, plus label overrides, cover these without bespoke work.
7. **No dead end when a person already exists on another vessel** (ticket #26). Detect the existing profile across the account and offer "Request transfer to this vessel", routed to someone who can see both vessels.
8. **"Why can't I see this?"** (ticket #138: access lost overnight with no visible change). Effective-permission inspector with sources and a per-person access history; access denials show who to ask and a "Request access" button that creates a task for admins.
9. **Read-only is obvious** (ticket #51: forms opened as print-only for a Chief Engineer). When a user has Read Only on a module, forms open with a clear "Read only — you can view and print" banner and the request-access button, instead of a different-looking screen.
10. **Company sign-off is one server-side rule** (ticket #78). `is_company_actor()` used by every module, so no form can be "Completed" on the Master's signature alone.
11. **Designated vessel roles are first-class** (ticket #147). Badges on the crew list, multiple holders allowed, one Crew Rep per department, cleared on transfer, and they feed signature-slot resolution.
12. **Tenant branding and dark mode are built in** (ticket #136, paid in the reference). STORM already has branding; finish wiring brand colour into tokens.
13. **One vessel count everywhere** (§7.13). `is_counted` drives every "n vessels" label and KPI, so the dashboard and the add-ons page never disagree.
14. **Stable deep links** (ticket #252: email buttons landing on a list instead of the record). `/v/:code/...` URLs with record ids; every notification links to the exact record in the right vessel scope.
15. **Approvers can correct and send back with an audit trail** (ticket #200). Make "return with comment" part of every `approve` capability rather than a per-module feature.
16. **Security that actually protects**: enforced second factor for admins, recovery codes, trusted-device window, session list, and disabled accounts that really cannot sign in.
17. **Better Matrix ergonomics than image42**: sticky header and first column, column groups (View / Approvals / Appraisals / Training), keyboard navigation (arrows + space), department grouping with collapsible sections, per-column "tick all in view", scope dropdown cells where a capability supports D vs V, and an "expiring in 14 days" chip.

---

## Implementation notes

### Build order inside this domain

1. **Security fixes first (S–M, no UI dependency)**: F6 RLS (vessels write → owner/admin capability; overrides same-company check + `company_id`; audit insert via definer only; `roles`/`role_permissions` tenant column or freeze as system-only), F47 (send real emails, ban on disable, check membership status in `ProtectedRoute`), F46 invite helper fix, F4 remove the register tab.
2. **Tenancy core**: `account_memberships`, owner, job roles, vessel codes and lifecycle flags, `vessel_module_settings`, migration/backfill.
3. **PMS phases 0–3** (catalogue, schema, `has_capability`, enforcement) with the additions listed under "How the reference model maps onto PMS v1".
4. **Shell**: `/fleet` and `/v/:vesselCode` route trees, top-bar switcher, landing rules, legacy redirects.
5. **Users & Access UI** (PMS phase 4) with the four tabs, invite forms, Matrix, Review & save.
6. MFA enforcement, view-as, access review, external viewers.

### Files to reuse or extend

- **Vessel scope**: keep `src/modules/vessels/contexts/VesselContext.tsx` but make the URL drive it — add `src/shared/components/routing/VesselScopeRoute.tsx` that reads `:vesselCode`, calls `setSelectedVessel`, and renders 403 / module-off / archived pages. Replace `ALL_VESSELS_ROLES` with `user_vessel_reach()` via an RPC. Have `DashboardFilterContext` become a page-level fleet filter only (it exists to fake multi-select scope).
- **Switcher**: promote `src/modules/vessels/components/VesselSelector.tsx` (already has search) into the header; delete its placeholder `FLEET_GROUPS`, severity filters (move to fleet pages), and the dead `VesselToggleBar.tsx`, `GlobalHeaderControls.tsx`. Remove the "Vessel scope" block from `SidebarAccountMenu.tsx`.
- **Layout**: extend `src/shared/components/layout/DashboardLayout.tsx` with `scope: 'fleet' | 'vessel'`; `ModuleTopNav.tsx` renders workspaces in fleet scope and vessel modules (filtered by `vessel_module_settings` + `useCan`) in vessel scope. `SidebarNavigation.tsx` already filters by `moduleKey`; switch it to `capability` per the PMS addendum.
- **Navigation config**: split `src/config/sitemap.ts` into `fleetNav` and `vesselNav(vesselCode)`; keep the `L()`/`G()` helpers; add `capability` and `vesselModuleKey` to `NavChild` in `navigation-types.ts`. `PLACEHOLDER_LEAVES` and `SECTION_REDIRECTS` must generate under the new prefixes. Run `node scripts/permissions/check-storm-coverage.mjs` and keep it at 100%.
- **Routes**: in `src/routes/index.tsx` the static `/vessel/...` placeholder paths outrank `/vessel/:vesselSlug`, so a vessel named "crew" or "safety" collides today; the `/v/:vesselCode` prefix avoids it. Group the 40+ inline `React.lazy` route elements into `fleetRoutes` and `vesselRoutes` arrays like `hrisRoutes`.
- **Users & Access**: keep `src/modules/users-access/` as the module. Reuse `derivePreset.ts` (make it compare against Access Set grants and return closest set + diff), `PresetBadge.tsx`, `ModulePermChip.tsx`. Replace `capabilityCatalog.ts`, `presets.ts`, `moduleGroups.ts` with generated imports from `src/lib/permissions/catalogue.ts`. Replace `useSavePermissionOverride`/`useApplyPreset` (immediate writes, no audit) with `usePreviewAccessChanges` / `useApplyAccessChanges` calling the RPCs. Fix `useDepartmentScope` by moving scopes onto the assignment. Retire `RolesPermissionsPage.tsx` into the Access Sets tab and redirect its routes.
- **Auth**: `AuthContext.tsx` — remove `signUp`, `ROLE_PERMISSIONS`, `MODULE_ACCESS` once `useCan` covers every caller; add membership + AAL to context; `ProtectedRoute.tsx` checks membership status (`disabled` → sign-out page) and AAL requirement. `permissionsStore.ts` loads `get_effective_capabilities(user, vessel)` and reloads on scope change (call `setCurrentVessel` from the scope route). `PermissionGate.tsx` becomes `<Can>`.
- **Edge functions**: `_shared/invite-helpers.ts` — when no auth user exists use `inviteUserByEmail` directly (it creates the user); when one exists but is unconfirmed, `generateLink({type:'invite'|'magiclink'})` and send it through `send-email`; page through `listUsers` or look up by email via a definer RPC; write `user_invitations` and only stamp `invited` on a successful send. `admin-actions` — `password_reset` and `resend_invitation` must send the generated link via `send-email`; `toggle_access` must call `auth.admin.updateUserById(id, { ban_duration })` and revoke sessions; replace the legacy `profiles.role` / `user_roles` checks in `send-invitation`, `bulk-invite`, `create-crew-member`, `admin-actions` with `assertCapability()` (`update-crew-assignment` is retired instead, DECISIONS D-191). `create-crew-member` accepts `role` from the request body unchecked — derive it from the position instead. Add `accept-invitation` rate limiting.
- **Identifiers**: build `format_reference()` on top of `next_reference_value()` from `20260919220000_reference_numbers.sql`; counters scoped by vessel id, not code, so a code fix-up never collides.
- **Signer resolution**: replace `form_user_satisfies_signer_role()` (`20260919210000_ism_form_workflow.sql`) with a vessel-aware version that calls `vessel_office_holders()` and `is_company_actor()`.
- **Sensitive columns**: follow the plan noted in `20260927120000_wire_crew_flags_into_frp_access.sql`: move medical and employment fields off `profiles` into `crew_medical_profiles` / `crew_employment_details` with capability RLS, and expose a safe `profiles_public` view for lists.
- **Security page**: keep `SecuritySection.tsx` enrolment UI; add the AAL2 challenge at sign-in in `Auth.tsx` (`mfa.getAuthenticatorAssuranceLevel()` → challenge screen), recovery codes, trusted devices; account-level policy on `/fleet/admin/security`.
- **Tests**: extend `src/test/store/permissionsStore.test.ts` (per-vessel reload, fail closed), reuse the RLS harness pattern in `src/test/hris/harness.tsx` for memberships, vessels write policy and overrides; add router tests for `VesselScopeRoute` (unknown code → 404, no reach → 403, module off → module-off page).

### Migration notes

- **Backfill memberships** from current data (snapshot effective access first, PMS §9): `profiles.role = dpa` → admin with `is_dpa`, `manages_admins`, all vessels; `shore_management` → admin with all vessels (not shore staff, to avoid silent access loss; review afterwards); `master`/`chief_*`/`crew` → crew with assignments from `crew_assignments.is_current`; `user_roles.superadmin` → `platform_staff` (and removed from tenant lists); imported profiles with `user_id IS NULL` → crew membership without login (status `invited` only once an invite is sent).
- **Owner**: one existing admin must be designated (open question 1); enforce with a partial unique index after backfill.
- **Vessel codes**: generate from the first three letters of the name (strip M/Y, S/Y, R/V), resolve clashes manually, then lock.
- **Overrides**: add `company_id` (from target profile) and `vessel_id` (null = all vessels, preserving today's global behaviour), then migrate per PMS §9 with the before/after diff report.
- Regenerate `src/integrations/supabase/types.ts` after each migration (do not hand-edit; grep, don't open).

### Pitfalls

- `profiles.id` vs `profiles.user_id` duality: memberships must store both; imported crew have no `user_id` until invited.
- The Lovable auth flow (`@/integrations/lovable` Google sign-in in `Auth.tsx`) must still land on a membership; an OAuth user with no membership sees "Your email isn't linked to an account — ask your administrator for an invite", never an empty app.
- Do not let `DashboardFilterContext` subsets leak into vessel scope again (it currently collapses a 2+ subset to the first vessel silently).
- `localStorage` access must stay in try/catch (pattern already used in `DashboardLayout.tsx`).
- Keep legacy enforcement OR-ed in until the migration diff is signed off (PMS non-negotiable 1).
- Settings for module toggles autosave; access changes never autosave. Do not mix the two save behaviours on one page (§7.12).

---

## Open questions

1. **Who becomes the Account Owner** of the existing tenant? Only one is allowed, and only the platform can change it later.
2. **Existing `shore_management` users**: migrate as account admins (no access lost, then review) or as shore staff (reference semantics, some lose admin pages)?
3. **Company sign-off reach**: is any admin with that vessel in reach "the Company", or should it also require the admin to hold Safety Read & Write (or a specific "company sign-off" capability) on that vessel?
4. **STORM's extra workspaces** (HRIS, Health & Wellness, Yard, Shoreside): keep them as fleet-level sections inside the Fleet sidebar (proposed), or keep them as separate top-level workspaces beside Fleet / Vessel?
5. **Login as**: is read-only "view as" enough, or is full write impersonation required (the reference allows it)? Should the person be told afterwards?
6. **MFA policy defaults**: require an authenticator for owner and admins from launch? For holders of medical / employment / payroll access?
7. **System presets**: may a tenant edit View Only / Head of Department / Full Access, or only duplicate them into their own sets?
8. **Vessel codes**: who sets them (admin on create vs platform), and may they ever change once records exist?
9. **Fleet groups**: single group per vessel (current schema), or many-to-many (the blueprint shows both map regions and East/West fleets)?
10. **Finance and Payroll levels**: STORM's compensation and payroll live in HRIS (fleet level). Do vessel-level Finance / Payroll levels (§2.4) gate the HRIS compensation pages for that vessel's crew, or only the vessel Accounting module?
11. **Crew after sign-off**: how long do former crew keep self-service access to their own records (payslips, HoR, documents) once their vessel access ends?
12. **External viewers**: build in this phase (needed for surveyors and yards) or defer with the Technical add-on?
