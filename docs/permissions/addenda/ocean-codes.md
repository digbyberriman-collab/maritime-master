# Addendum — Ocean Codes (OceancOS)

Paste this after `MASTER-PROMPT.md`.

| | |
|---|---|
| **Repo** | `digbyberriman-collab/oceancos-33a83542` (TanStack Start + React 19 + Vite 7, Cloudflare Workers, Supabase Auth/Postgres/RLS, Drizzle migrations). **Ignore** the older Next.js/Prisma repo `digbyberriman-collab/OceancOS`; it is superseded. |
| **Catalogue** | `docs/permissions/catalogues/ocean-codes.json` — 49 subcategories, 145 capabilities (57 T2), 6 departments, 21 roles |
| **Draft workbook** | `docs/permissions/workbooks/ocean-codes-permission-matrix.xlsx` |
| **Checks** | `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:rls`, `bun run verify` |
| **Migrations** | Drizzle: `drizzle/schema.ts` + `drizzle/migrations/00NN_*.sql` (next is `0022_…`), on top of the legacy `supabase/migrations/` chain. Add new SQL through Drizzle; don't add to the Supabase chain. |

## 1. Current state

Ocean Codes already has the closest thing to PMS of the four apps. **Extend it; do not replace it.**

- **Roles:** `src/lib/auth.ts`.
  - 21 `AppRole` values with `ROLE_LABEL`.
  - `ROLE_GROUPS`: owner_side, vessel_side, yard_side, authority, pm, finance_approver, captain_approver, owner_approver, yard_approver, technical_approver, read_only.
  - `inGroup()`.
  - Role preview through `RolePreviewSwitcher`.
- **Permissions:** `src/lib/permissions.ts`.
  - 46 `PermissionKey`s in `module.action` form.
  - `STATIC_GRANTS` / `DEFAULT_GRANTS` with role lists.
  - `PERMISSION_LABEL`.
  - `can()` / `canAny()`, where `super_admin` always passes.
  - Runtime overrides from the `role_permissions(role, permission_key, allowed)` table via `loadPermissionOverrides()`.
- **Tenancy:**
  - `user_roles(user_id, role, vessel_id)`, where a null vessel means global.
  - `user_can_access_vessel()` and `user_can_access_project()` (`supabase/migrations/20260919090000_projects_foundation.sql`, tightened in `20260919190000_signup_unbound_role_required.sql`).
  - Yard users are scoped by `profiles.contractor_id`.
- **SQL helpers:** `has_role`, `has_any_role`, `is_owner_side`, `is_pm`, `can_approve_*`, `has_permission` and `is_super_admin` (`20260501112700_foundation_lookups_helpers.sql`, `20260919085900_live_catch_up.sql`). RLS mostly uses the role-group helpers, not `has_permission`.
- **UI:**
  - `/admin` (`src/routes/admin.tsx`), with `src/components/refit/admin/AccessSection.tsx` (users, per-vessel role assignment, invitations through `user_invitations`) and `PermissionsGrid.tsx` (the role × permission grid).
  - `/access` and `/access-check` pages.
  - The RLS test matrix in `src/tests/rls.matrix.ts`.
- **Navigation:** `src/components/AppShell.tsx`. Only Budget (`budget.view`) and POs are permission-gated; some items use `yardHidden`.
- **Export:** CSV and print-to-PDF only (`src/lib/export.ts`). **Add `exceljs`** for the PMS workbook.
- **Departments:** a seeded `departments` lookup (DECK, ENG, INT, GAL …), managed in Admin but linked to nothing. It becomes the `D` scope for vessel-side HODs.

## 2. Model decisions for Ocean Codes

- **Keys.** `PermissionKey` becomes the generated PMS `CapabilityKey`. Keep all 46 legacy keys as `legacy_key` aliases; the draft catalogue maps every one of them.
  - `can('budget.view')` keeps working through the alias until call sites are migrated.
- **Grants.** Move `STATIC_GRANTS` into the catalogue as the explicit `grants` already in the draft JSON. `super_admin` is included explicitly there.
- **Access Sets.** `role_permissions(role, permission_key, allowed)` becomes role-default Access Sets:
  - one system Access Set per `AppRole`, seeded from `STATIC_GRANTS`, with per-role scope from the role's reach and `levelCodes`;
  - existing `role_permissions` rows become Access Set grant edits, shown in the migration report.
- **Assignments.** Add per-user overrides and `user_access_assignments`, because the app currently has role-level grants only.
  - A user's `user_roles` row(s) become assignments (role → Access Set, `vessel_id` → unit; null = global).
- **Scopes:**
  - `S` self · `D` vessel department · `C` own company (`profiles.contractor_id`) · `P` project · `V` vessel · `G` global.
  - Yard-side roles remap `group → C` and `unit → P`. Authority roles remap `unit → P`.
- **The approval chain stays a chain.** Change-order approval stages are separate subcategories (`governance.change_orders.approval_captain` … `approval_class_flag`), each with a single `approve` action. Keep the stage order and the existing chain logic; PMS only decides who may act at each stage.
- **Grid UI.** `PermissionsGrid.tsx` becomes the Access Sets tab. Add the people-level Matrix and Review & save (master §7). Tabs: **People** (per vessel / project) · **Account Admins** · **Access Sets**.
- **Keep `RolePreviewSwitcher` working.** It should preview a chosen Access Set.

## 3. Departments (sheet per department)

| Department | Roles (tier) |
|---|---|
| Owner Side | Owner, Owner's Representative, Shore Management (command) · Technical Manager, Finance Controller (hod, vessel-wide) · Auditor (external) |
| Vessel Side | Captain (command) · Chief Officer, Chief Engineer, HOD (hod) · Purser (hod, vessel-wide) · Crew Member (rating) |
| Project Management | Project Manager (command) |
| Yard Side | Yard PM (hod, project) · Yard Trade Lead (officer, company) · Contractor, Supplier (rating, company) |
| Authority | Class Surveyor, Flag Surveyor (external, project, time-bounded) |
| Platform | Super Admin (command, global) · Guest (read-only) |

## 4. Draft-vs-live differences to report (not silently apply)

The draft applies PMS separation of duties to live grants that currently allow both sides:
- **SOD-01** (invoice approve vs record payment): Shore Management keeps approve and loses `payments.settle`. Finance Controller keeps settle and loses `invoices.approve`.
- **SOD-02** (PO create vs approve): Shore Management keeps approve. Finance Controller keeps create.

List both in the migration report as **proposed** changes and wait for approval.

## 5. Gaps to close

1. RLS uses role-group helpers. Move T2 tables (budget, POs, invoices, payments, quotes, contractor terms) to `has_capability` / `capability_scope`. Keep `src/tests/rls.matrix.ts` passing and extend it with PMS cases.
2. Nav gating covers only Budget and POs. Every `AppShell` item gets a `capability`.
3. Add `department` to vessel-side records where HOD scoping matters (crew requests, inventory, drawings review).
4. Add `exceljs` and the workbook export/import.
5. No T3 data today. If crew personal or medical data arrives through Crew Requests, classify it T3 and add a subcategory.

## 6. Ocean-specific stop conditions

- Any change that breaks the change-order approval chain or `user_can_access_project()` semantics.
- `bun run verify` (RLS tests + build) fails.
