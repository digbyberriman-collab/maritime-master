# Addendum — STORM (Maritime Master)

Paste this after `MASTER-PROMPT.md`.

| | |
|---|---|
| **Repo** | `digbyberriman-collab/maritime-master` (Lovable-synced; Supabase; React 18 + Vite + TS) |
| **Catalogue** | `docs/permissions/catalogues/storm.json` — 314 subcategories, 1,431 capabilities (320 T2, 82 T3), 17 departments, 56 roles |
| **Draft workbook** | `docs/permissions/workbooks/storm-permission-matrix.xlsx` |
| **Checks** | `npm run check` (lint + typecheck + vitest); CI `.github/workflows/ci.yml` |
| **Coverage check** | `node scripts/permissions/check-storm-coverage.mjs` (sitemap leaves → catalogue; currently 246/246) |
| **Regenerate** | `node scripts/permissions/build-matrix-workbooks.mjs storm` |

## 1. Current state: what exists and what to reuse

**Four overlapping role and permission systems.** PMS unifies them; retire the legacy ones only after the migration diff (§9) is signed off.

1. **`profiles.role`**: legacy text values (`dpa`, `shore_management`, `master` …). Still read by these edge functions:
   - `update-crew-assignment` (lines ~65, 144)
   - `bulk-invite` (~56)
   - `send-invitation` (~58)
2. **`user_roles` + enum `app_role`** (`supabase/migrations/20260127170354_*.sql`):
   - Values: superadmin, dpa, fleet_master, captain, purser, chief_officer, chief_engineer, hod, officer, crew, auditor_flag, auditor_class, travel_agent, employer_api.
   - Helpers: `has_role`, `has_role_in_company`, `has_role_on_vessel`, `has_any_role`, `has_fleet_access`.
   - Queried directly by `admin-actions/index.ts:81` and `create-crew-member/index.ts:57`.
3. **RBAC** (`20260129125250_*.sql`, `20260129125736_*.sql`) — the **canonical base for PMS**:
   - Tables: `roles`, `modules`, `role_permissions`, `rbac_user_roles`, `user_permission_overrides` (unique `(user_id, module_key, permission)`, FK `module_key → modules.key`) and `permission_audit_log`.
   - Functions: `get_user_rbac_permissions`, `user_has_module_access` (deny wins), `user_has_permission`, `get_user_permissions_full` and `get_user_roles_full`.
4. **Fine-grained flags stored as `modules` rows**: `crew.*` (`20260522163528_*.sql:108`), `finance.*` (`20260917180124_*.sql`, `20260917120000_*.sql`), `medical.*` / `wellness.*` (`20260919100000_*`, `20260922094012_*`) and `legal.*` (`20260919120000_*`).
   - **None of these are enforced anywhere.** They are stored and shown, never checked.

**Frontend:**
- **Where the frontend enforces today** (each needs changing):
  - `src/modules/auth/contexts/AuthContext.tsx`: `MODULE_ACCESS` (l.68), `SENSITIVE_MODULES` (l.84) and `canAccessModule` (l.217–300). **It fails open while RBAC loads** (returns true for non-sensitive modules). Fix this.
  - `src/shared/components/ProtectedRoute.tsx` checks login only, and is used by most routes including `/users-access`.
  - Per-area resolvers in `src/modules/auth/lib/`: `hrAccess.ts`, `payrollAccess.ts`, `medicalAccess.ts`, `wellnessAccess.ts`, `legalAccess.ts`.
- **Reuse; extend rather than replace:**
  - `src/modules/auth/store/permissionsStore.ts` (Zustand) and `src/modules/auth/hooks/useRBACPermissions.ts`: rebuild them on `get_effective_capabilities`.
  - `src/modules/auth/components/PermissionGate.tsx` (`PermissionGate`, `useCanAccess`, `RequireRole`): barely used today. Rebuild it as `<Can>` and adopt it everywhere.
  - `src/shared/components/ModuleRoute.tsx`: becomes the capability route guard.

**Users & Access** lives in `src/modules/users-access/`:
- **Pages:** `UsersAccessListPage.tsx` (flat list, preset badge, six module chips) and `UsersAccessDetailPage.tsx` (crew preset, other modules, `CustomPermissionsCard`, `DepartmentScopeCard`).
- **Library (`lib/`):**
  - `presets.ts`: `AccessPreset`, `PRESET_MATRIX` and `CHIP_GROUPS`. These become system Access Sets.
  - `derivePreset.ts`: reuse it for the "Custom" chip.
  - `capabilityCatalog.ts`: 17 flags. Replace it with generated catalogue imports.
  - `moduleGroups.ts`.
- **Hooks:** `useUsersWithAccess`, `useUserAccessDetail`, `useSavePermissionOverride` (plus `useApplyPreset`) and `useDepartmentScope`.
- **Known bug:** `useDepartmentScope` saves `module_key = 'crew.department_scope'`, which is **not a `modules` row**, so the FK rejects it. Department scope moves to `user_access_assignments.department` / `scope_code`.
- **`src/modules/settings/pages/RolesPermissionsPage.tsx`** (role × module matrix + history): becomes the Access Sets tab.

**Navigation:** `src/config/sitemap.ts` → `NAVIGATION_ITEMS` (l.611). Leaves use `L(label, base, { existing, moduleKey, minPermission, selfServe, crossLink })`. Replace `moduleKey` / `minPermission` / `selfServe` with `capability` (the `view` or `view_own` key).
- Cross-link leaves (`crossLink: true`) take their target's capability.
- `src/config/navigation.ts:13` (`ADMIN_NAV_ITEMS`) maps to the `admin.*` domain.

**Existing xlsx tooling:** `exceljs` (`src/lib/documentExport.ts`) and `xlsx` (`src/modules/rotation-planner/lib/xlsxExporter.ts`). Use `exceljs` for the PMS workbook; it supports data validation, conditional formatting and outlines.

## 2. Model decisions for STORM

- **Catalogue table.** Don't create `permission_catalogue`. Instead **extend `public.modules`** with `domain, module_group, subcategory, action, sensitivity, owner_departments, department_scoped, legacy_key, aligns_with, route`. Insert one row per capability, keyed by the PMS key. That keeps `user_permission_overrides.module_key` and `role_permissions.module_key` foreign keys valid.
  - The existing parent rows (`crew_roster`, `hr`, `ism` …) stay as module-level parents, with `parent_key` pointing at them.
- **`permission` column.** `user_permission_overrides.permission` (`view|edit|admin`) becomes legacy. For PMS capability rows, store `permission = 'view'` and put the scope in a new `scope_code` column. The capability key itself carries the action.
- **Canonical role table.** `rbac_user_roles` becomes `user_access_assignments`: add `access_set_id`, `rank`, `department` and `scope_code` columns, or create the new table and a compatibility view.
- **Legacy role sources.** Keep `app_role` / `user_roles` as legacy inputs to the migration mapping only. `profiles.role` is display-only after migration.
- **`has_capability`.** It can wrap `user_has_permission` during transition, but must implement §3.8 of the master prompt (deny wins, scope predicates, time bounds).
- **Units** are vessels (`vessel_id`); `company_id` bounds the fleet scope.

## 3. Departments and ranks

These are canonical; replace every other list.
- **Lists to delete** (import the canonical constant instead):
  - `src/modules/auth/lib/permissions.ts:201`
  - `src/modules/users-access/lib/capabilityCatalog.ts:31`
  - `src/modules/crew/leaveConstants.ts:27` (`LEAVE_DEPARTMENTS`)
  - `src/modules/development/constants.ts:35`
  - `src/modules/audits/constants.ts:16`
  - `src/modules/legal/lib/constants.ts:112,173`
  - `src/modules/logbooks/lib/catalog.ts:151`
  - `src/modules/hris/components/onboarding/TemplateEditorDialog.tsx:34`
  - `POSITIONS` in `src/modules/settings/components/sections/VesselAccessSection.tsx:63`
- **Ranks:** `RANKS` in `src/modules/crew/constants.ts:1` maps onto the canonical ranks below.

| Department | Ranks (tier) |
|---|---|
| Bridge | Master (command, vessel), Staff Captain (hod), 2nd Officer (officer), 3rd Officer (officer), Deck Cadet (trainee) |
| Deck | Chief Officer (hod), Bosun (officer), Lead Deckhand / AB / Deckhand (rating), OS (trainee) |
| Engineering | Chief Engineer (hod), 2nd / 3rd Engineer, ETO (officer), Motorman, Oiler (rating), Engine Cadet (trainee) |
| Interior | Chief Steward/ess (hod), Head of Housekeeping, Head of Service (officer), Steward/ess, Laundry (rating) |
| Purser's Office | Purser (hod, vessel-wide), Admin Assistant (officer) |
| Galley | Head Chef (hod), Sous Chef, Crew Chef (officer), Cook (rating), Galley Hand (trainee) |
| Medical | Ship's Doctor (hod), Medic / Nurse (officer) |
| Dive | Dive Manager / DSO (hod), Dive Instructor (officer), Divemaster (rating) |
| Media | Media Lead (hod), Photographer / Videographer (rating) |
| IT & AV | AV/IT Officer (hod), AV/IT Technician (rating) |
| Spa & Wellness | Spa Manager (hod), Physiotherapist, Personal Trainer (officer), Therapist (rating) |
| Shore – Fleet Ops & DPA | DPA (command, fleet), Fleet Manager (command, fleet), Technical Superintendent (hod, fleet) |
| Shore – HR & Crewing | HR Manager (hod, fleet), Crewing Coordinator (officer, fleet) |
| Shore – Finance & Procurement | Finance Controller (hod, fleet), Procurement Officer (officer, fleet) |
| Shore – Legal | Legal Counsel (hod, fleet) |
| Platform | System Administrator (admin) |
| External | Flag State Auditor, Class Surveyor, Travel Agent, Employer API (external, time-bounded) |

## 4. Scopes

`S` self · `D` department · `V` vessel · `F` fleet. `levels: { self: S, group: D, unit: V, all: F }`.

## 5. Legacy mapping (for §9 migration)

| Legacy | PMS |
|---|---|
| `crew.see_crew_list` | `vessel.crew.crew_list.view` |
| `crew.view_crew_profiles` / `crew.edit_crew_profiles` | `vessel.crew.crew_profiles.view` / `.edit` |
| `crew.view_scheduling` | `vessel.crew.crew_scheduling.view` |
| `crew.access_leave_records` | `hris.leave_rotation.leave_planner.view` |
| `crew.view_medical` / `crew.edit_medical` | `health.personnel_medical.crew_medical_records.view` / `.edit` |
| `crew.access_employment_records` | `hris.employee_records.contracts_employment.view` |
| `crew.view_appraisals` / `crew.conduct_appraisals` | `hris.performance.annual_evaluations.view` / `.create` |
| `crew.approve_leave` | `hris.leave_rotation.leave_requests.approve` |
| `crew.approve_hours_of_rest` | `vessel.crew.hours_of_rest.approve` |
| `crew.approve_payroll` | `hris.compensation.payroll.approve` |
| `crew.approve_expenses` / `crew.mark_expenses_paid` | `vessel.accounting.expenses.approve` / `.settle` |
| `crew.approve_invoices` / `crew.record_invoice_payments` | `vessel.accounting.invoices.approve` / `.settle` |
| `finance.view_compensation` / `finance.edit_compensation` / `finance.run_payroll` | `hris.compensation.salaries_compensation.view` / `.edit`, `hris.compensation.payroll.create` |
| `Permission.TRANSFER_CREW` (`src/modules/auth/lib/permissions.ts:12`) | `vessel.crew.crew_assignments.assign` |
| Preset `view_only` / `department_head` / `full_access` / `custom` | Access Set `view_only` / `hod` / `full_vessel` (or `full_fleet` for shore) / overrides |
| `app_role` captain → Master · chief_officer / chief_engineer → HOD of Deck / Engineering · purser → Purser · hod → HOD of the crew member's department · officer → Officer · crew → Crew · dpa → DPA · fleet_master → Fleet Manager · superadmin → System Administrator · auditor_* / travel_agent / employer_api → External | Access Set + rank |
| `role_permissions` module-level (`view`/`edit`/`admin` on `ism`, `hr`, `maintenance` …) | Expand to every capability under that module: `view` → view/export, `edit` → + create/edit/sign, `admin` → + delete/admin. **List every expansion in the migration report.** |

**New capabilities.** These screenshot columns had no flag before:
- Manage checklists → `vessel.safety.checklists.admin`
- Transfer crew → `vessel.crew.crew_assignments.assign`
- View training → `hris.training_development.crew_training.view`
- Approve training (HOD) → `...crew_training.approve`
- Final training approval → `...crew_training.final_approve`

## 6. "Key capabilities" matrix view (default Matrix columns)

Reproduce the screenshot's 17 columns, in this order, as the default column set. Orange = T2/T3.

1. `vessel.crew.crew_list.view` (See crew list)
2. `vessel.crew.crew_profiles.view` (View profiles)
3. `vessel.crew.crew_profiles.edit` (Edit profiles)
4. `vessel.crew.crew_scheduling.view` (Scheduling)
5. `hris.leave_rotation.leave_planner.view` (Leave records)
6. `health.personnel_medical.crew_medical_records.view` (View medical, T3)
7. `health.personnel_medical.crew_medical_records.edit` (Edit medical, T3)
8. `hris.employee_records.contracts_employment.view` (Employment, T2)
9. `hris.performance.annual_evaluations.view` (View appraisals)
10. `hris.performance.annual_evaluations.create` (Conduct appraisals)
11. `vessel.safety.checklists.admin` (Manage checklists)
12. `hris.leave_rotation.leave_requests.approve` (Approve leave)
13. `vessel.crew.hours_of_rest.approve` (Approve HoR)
14. `vessel.crew.crew_assignments.assign` (Transfer crew)
15. `hris.training_development.crew_training.view` (View training)
16. `hris.training_development.crew_training.approve` (Approve training (HOD))
17. `hris.training_development.crew_training.final_approve` (Final training approval)

**Filter chips:** Custom only · Can view medical (#6) · Can access employment (#8) · Payroll access (`hris.compensation.payroll.view`).

## 7. Decisions to surface (don't decide silently)

1. **Master and medical.**
   - The current "Full" preset lets Captains **edit** medical. The draft gives the Master **view** only (`t3Holders`), following MLC Reg. 4.1 confidentiality.
   - If the owner wants Master edit, grant it as a reasoned override, not in the preset.
2. **HOD visibility of HR data.** The draft shows HODs their own department's T2 employee records (`hodVisible`) but **not** contracts or employment history. Confirm.
3. **Payroll SoD.** The draft keeps Master and DPA as approvers and the Purser and Finance Controller as runners. Confirm, then check whether any single-person vessel needs a reasoned exception.
4. **Shoreside ventures** (Embrace, Lungfish … Dark Ocean) are catalogued as placeholders with shore-ops ownership. Confirm whether they need their own departments.

## 8. STORM-specific stop conditions

- Any RLS change on `crew_*`, `hr_*`, `medical_*`, `payroll_*` or `legal_*` tables that would deny a currently permitted legitimate workflow.
- Coverage falls below 246/246 sitemap leaves.
- The migration touches `profiles.role` semantics used by the Lovable auth flow (`@lovable.dev/cloud-auth-js`).
