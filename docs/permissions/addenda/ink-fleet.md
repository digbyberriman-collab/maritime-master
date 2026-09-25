# Addendum — Ink Fleet (Inkfish Fleet Command)

Paste this after `MASTER-PROMPT.md`.

| | |
|---|---|
| **Repo** | `digbyberriman-collab/inkfleet` (Lovable; React + Vite + TS; Supabase; ~1,160 migrations; bun) |
| **Catalogue** | `docs/permissions/catalogues/ink-fleet.json` — 222 subcategories, 802 capabilities (243 T2, 57 T3), 19 departments, 51 roles |
| **Draft workbook** | `docs/permissions/workbooks/ink-fleet-permission-matrix.xlsx` |
| **Checks** | CI (`.github/workflows/ci.yml`): `bun install --frozen-lockfile` → `npm run typecheck` → `npm run lint:ratchet` → `npm run test` → `npm run build` |
| **Lint ratchet** | `scripts/lint-ratchet.mjs` fails if error or warning counts rise above `lint-baseline.json`. If you reduce them, run it with `--update`. |
| **Branching** | `main` is the only branch and syncs to Lovable. **Work on a feature branch, never force-push, never rebase or amend pushed commits** (AGENTS.md). Main must stay deployable. |
| **Migrations** | `supabase/migrations/YYYYMMDDHHMMSS_*.sql`. Roles are added with `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS`. After any RLS change, run `scripts/generate-permissions.ts` and commit the regenerated `src/lib/permissions/generated.ts`. |

**Scope decision (owner's call).** Ink Fleet gets a **full standalone PMS build**, even though an approved Ink Fleet → STORM migration exists (`roadmap.md`, `scripts/storm-migration/`). To keep that migration a straight mapping:
- every subcategory with a STORM equivalent records it in `alignsWith` (e.g. `storm: vessel.crew.hours_of_rest`);
- it must use the same action verbs and tiers.

Don't rename STORM-aligned subcategories without updating `alignsWith`.

## 0. First step

Pull the latest `main` first. The reference screenshot (Users & Access with **Vessel Crew / Account Admins / Access Sets** tabs, List/Matrix views, Full/HOD/Custom/View presets, a 17-column matrix, "Review & save") may already have landed from Lovable. If it has:
- **build on it**, and map its columns to the `people.crew.*` capabilities below;
- note in the gap report which parts already existed.

## 1. Current state

- **Roles:**
  - Flat `public.app_role` enum, created in `20260122232819_*.sql` and extended since. Values: admin, user, super_admin, developer, medical, hr, hr_manager, legal, accounting, chef, trainer, vessel_captain, fleet_manager, dive_instructor, confidential_viewer, guest, itinerary, photographer, ichthyologist, shipping_coordinator, forecaster, forecast_approver, pbq_admin, new_builds_viewer, new_builds_requester, content_manager. The UI also lists spa_manager.
  - Assigned through `user_roles`.
  - `has_role(uuid, app_role)`, latest in `20260915220000_secure_owner_administration.sql`, where super_admin passes all except `guest`.
- **Client:** `src/contexts/AuthContext.tsx` exposes boolean flags (`isAdmin`, `isHr`, `isChef` …), which pages check directly. **Replace them with `useCan`.** Derive the flags from capabilities during the transition.
- **Role admin:** `src/components/admin/UserManagement.tsx` (`ROLE_CONFIG`, per-user role toggles).
- **Crew access today:**
  - `crew_module_access(crew_id, tier view_only|editor|admin, other_modules text[])` and `list_admins()` (`20260604215321_*.sql`).
  - UI in `src/pages/departments/vessel-management/Users.tsx`: tabs **Vessel Crew** and **Account Admins**. Crew Module Access is a single tier; Other Modules is a checkbox list (Calendar, Reports, Documents, Tracker, Vessels, Inventory).
- **Other per-feature access tables.** Fold each into PMS capabilities and overrides:
  - `vessel_role_department_defaults` (`20260609065322_*`)
  - `new_build_project_access`
  - `survey_access`
  - `xero_org_permissions`
  - `approvalmax_org_permissions`
  - `field_permission_rules` (column-level rules: keep them and link them to T2/T3 capabilities)
  - `permission_inspector_audit_log`
- **Permission Inspector:** `src/lib/permissions/{types,registry,generated}.ts`, `src/components/permissions/{Inspectable,PermissionInspectorOverlay}.tsx` and `scripts/generate-permissions.ts`. It is read-only; keep it and extend it to show PMS capability sources.
- **Navigation:**
  - `src/components/layout/navigationRegistry.ts`: `STORM_MODULES` (My STORM, Fleet, Operations, People, Projects, Business) and `OPERATIONAL_GROUPS`.
  - `src/components/layout/departmentAreas.ts`: only hr, dive, vessel-management and galley. Some use `requireRole`.
  - `src/components/departments/DepartmentSwitcher.tsx`: `DEPARTMENTS` with role gates.
  - `src/data/pageRegistry.ts`: the page catalogue.
  - Page tabs in `src/pages/departments/*.tsx` (`TabsTrigger value=…`) are subcategories too.
- **Departments:** defined five-plus times. Canonicalise to one table and constant, and delete the duplicates:
  - `src/hooks/useCrewScope.ts` (`CREW_DEPARTMENTS`)
  - `src/hooks/useAllVesselsCrew.ts` (`SHIPBOARD_DEPARTMENTS`)
  - `src/lib/development/constants.ts`
  - `src/lib/cardholderDepartments.ts`
  - `src/components/classes/departments.ts`
  - DB `vessel_departments`
- **Ranks:** no catalogue exists. `crew_directory.role`, `rank` in `vessel_onboard_snapshots` and `ism_drill_attendance`, and `cri_roles` are all free text. **Add a `ranks` table** and map free text to it, reporting unmapped values.
- **Export:** `exceljs` is used ad hoc in about seven places (e.g. `src/lib/spa/inventoryExport.ts`, `src/lib/procurement/rfqExport.ts`). Add a shared `src/lib/permissions/workbook.ts`.

## 2. Model decisions for Ink Fleet

- **New tables:** create the full PMS set from master §4: `permission_catalogue`, `departments`, `ranks`, `access_sets`, `access_set_grants`, `user_access_assignments`, `user_permission_overrides`, `permission_matrix_imports`, plus audit.
- **Keep `app_role` / `has_role` working.** Each `app_role` becomes a **default Access Set assignment**, as in the `appRole` column of the workbook's department sheets:
  - vessel_captain → Captain (Full, vessel)
  - fleet_manager → Full (fleet)
  - hr_manager → HR Manager
  - hr → HR Officer
  - medical → Doctor / Medic (T3 medical owner)
  - legal → Legal Counsel
  - accounting → Finance Manager
  - forecaster / forecast_approver → Forecaster / Forecast Approver (SOD-01)
  - chef → Head Chef / Chef
  - trainer → Trainer
  - spa_manager → Spa Manager
  - dive_instructor → Dive Manager / Instructor
  - itinerary → Expedition Leader
  - shipping_coordinator, pbq_admin, photographer, ichthyologist, content_manager → their department roles
  - new_builds_viewer / new_builds_requester → New Builds Viewer (Observer set) / Requester
  - confidential_viewer → Confidential Viewer (Observer, T2 HR read). **Confirm** whether it should see T3.
  - super_admin / developer → System admin (configures, does not operate)
  - guest → Guest (external; sees "For Guests" only)
  - admin / user → review individually in the gap report
- **Rewrite RLS gradually.** Existing policies that call `has_role(...)` stay OR-ed until the migration is signed off. Then replace them with `has_capability`, starting with T3 (medical, legal, dive medical), then T2 (HR, accounting, cards, forecasts, new-build invoices).
- **Screenshot migration.** `crew_module_access.tier` becomes an Access Set on the vessel:
  - view_only → View only
  - editor → Officer (or HOD for HODs)
  - admin → Full (vessel)
  
  Each `other_modules[]` entry becomes grants on the matching `fleet.vessel_management.*` subcategories.

## 3. "Key capabilities" matrix view: the screenshot's 17 columns

These live in `people.crew.*`. They align with STORM keys so the two apps' matrices are interchangeable.

| # | Column | Capability |
|---|---|---|
| 1 | See crew list | `people.crew.crew_list.view` |
| 2 | View profiles | `people.crew.crew_profiles.view` |
| 3 | Edit profiles | `people.crew.crew_profiles.edit` |
| 4 | Scheduling | `people.crew.scheduling.view` |
| 5 | Leave records | `people.crew.leave_records.view` |
| 6 | View medical (T3) | `people.crew.crew_medical.view` |
| 7 | Edit medical (T3) | `people.crew.crew_medical.edit` |
| 8 | Employment (T2) | `people.crew.employment.view` |
| 9 | View appraisals | `people.crew.appraisals.view` |
| 10 | Conduct appraisals | `people.crew.appraisals.create` |
| 11 | Manage checklists | `people.crew.checklists.admin` |
| 12 | Approve leave | `people.crew.leave_records.approve` |
| 13 | Approve HoR | `people.crew.hours_of_rest.approve` |
| 14 | Transfer crew (orange in screenshot) | `people.crew.crew_transfers.assign` |
| 15 | View training | `people.crew.crew_training.view` |
| 16 | Approve training (HOD) | `people.crew.crew_training.approve` |
| 17 | Final training approval | `people.crew.crew_training.final_approve` |

**Filter chips:** All · Custom only · Can view medical (#6) · Can access employment (#8) · Payroll access (`people.crew.payroll_access.view`).

**Preset chips:**
- Full → `full_vessel` (or `full_fleet` for shore)
- HOD → `hod`
- View → `view_only`
- Custom → derived

## 4. Departments

Bridge · Deck · Engineering · Interior · Galley · Dive · Medical · Wellness & Spa · AV/IT · Media · Science & Mapping · Sub Team · Expeditions & Guest Ops · Shore – Fleet & Projects · Shore – HR · Shore – Finance · Shore – Legal · Platform · Guests & Visitors. Roles and tiers are in the catalogue and workbook.

Scopes: `S` self · `D` department · `V` vessel · `F` fleet (same as STORM).

## 5. Decisions to surface

1. **Captain and medical.** The screenshot's Full preset gives Captains Edit medical. The draft gives view only (MLC 4.1). Confirm.
2. **Confidential Viewer.** Should it read T3 (medical/legal) or only T2 HR? The draft gives T2 only.
3. **super_admin.** The draft makes it a configurator (admin tier), not an operator. Today `has_role` lets super_admin pass nearly everything, so the migration diff will show large losses for super_admins. **Get explicit approval** or keep a reasoned break-glass override.
4. **Schengen Tracker** is currently under Physical Training. The draft co-owns it with Shore HR. Confirm the right home.

## 6. Ink-specific stop conditions

- The lint ratchet regresses.
- Regenerating `generated.ts` shows unexpected RLS changes.
- Any change would break the STORM iframe workspace (`src/lib/storm/workspace.ts`).
