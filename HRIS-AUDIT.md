# HRIS Section Audit

**Date:** 2026-09-16
**Branch:** `claude/eloquent-goodall-mk8hwj` (HEAD `b5f2057`)
**Scope:** Every leaf under the HRIS module in `src/config/sitemap.ts`, plus the access-control, GDPR, navigation and tooling substrate they depend on. Audit and report only. No code was changed.
**Method:** Static review of routes, pages, hooks, migrations, RLS policies and edge functions; baseline lint/typecheck/test/build run on a clean checkout; module resolver executed against real HRIS paths. Every finding cites a file and line. Sub-agent findings were spot-verified; two were corrected (see Appendix).

Decisions taken before this audit (from the owner) and used to shape the build order:
- HRIS "employee" = the existing `profiles` row. No separate employee entity.
- Compensation is to be a calculation engine (pro-rata pay from days onboard, gratuity split, payslips), not a ledger.
- Priority: Employee Records, then Compensation, then Performance, then Recruitment / Right to Work / Reporting.

---

## 1. Executive summary

The HRIS section does not work as a system today, and it cannot be made to work by fixing bugs, because most of it has never been built.

- Of 23 HRIS navigation leaves, **3 land on working pages** (Leave & Rotation, Training & Development, and the HR Dashboard shell), **6 land on a data-less UI shell** (`/hr` tabs), and **13 land on auto-generated "Coming Soon" placeholders**.
- **No HR tables exist.** There is no table for contracts, salaries, payroll, gratuities, pay reviews, evaluations, reviews, objectives, rotation catch-ups, disciplinary records, next of kin, vacancies or candidates. Only a generic `hr_record_metadata` pointer table and GDPR/retention scaffolding exist, and nothing writes to them.
- **HRIS has no access control.** Every logged-in user, including `crew`, `auditor_flag` and `travel_agent`, can open `/hr` and every `/hris/*` route. The red "Restricted Access" banner on the HR page describes a policy implemented nowhere.
- **The one live HRIS data path, Leave & Rotation, is at risk** because the generated Supabase types are stale and three hand-written migrations (leave upgrade, work/rest, feedback) may not be applied to the live project. This needs checking against the live database before anything is built on it.
- **Existing crew data that HRIS will reuse has silent-failure bugs.** Admin edits to other people's profiles are RLS no-ops that still show a success toast. Certificate and attachment uploads are written to storage paths the bucket policy denies. A familiarisation edge function writes columns that do not exist.

The section is therefore a navigation skeleton plus a design intent (the `hr_record_type` enum, retention defaults, RBAC capability keys and HR page field lists all agree on what was meant to exist). The build order in section 7 turns that intent into a working system, in the priority order chosen.

---

## 2. Baseline checks

Run on a clean checkout of the branch.

| Check | Result | Notes |
|---|---|---|
| `npm ci` | **FAIL** | `package-lock.json` is out of sync with `package.json`: missing `@tanstack/react-virtual`, `jspdf-autotable`, `xlsx`, `@testing-library/dom` and transitives. `bun.lock` is current and authoritative. |
| `npm install` | PASS | 649 packages. Lockfile restored afterwards. |
| `tsc -p tsconfig.app.json --noEmit` | PASS | |
| `vitest run` | PASS | 17 files, 319 tests. Only one HRIS-adjacent test file: `src/modules/crew/services/leaveCalculator.test.ts`. |
| `vite build` | PASS | 4 chunks over 500 kB (xlsx, index, pdf-gen, excel). |
| `eslint .` | **FAIL** | 11 errors, 854 warnings. HRIS-adjacent error: `src/modules/crew/services/leaveCalculator.ts:374` (`prefer-const`). |
| CI | **None** | `.github/` does not exist. Nothing runs lint, typecheck or tests. |
| Generated types | **Stale** | `src/integrations/supabase/types.ts` is missing 13 tables and at least 9 `profiles` columns that migrations add (section 6.4). |

---

## 3. Leaf-by-leaf status

Status key: **Real** = working page on Supabase data. **Shell** = renders, but no data hook, no table, buttons disabled. **Placeholder** = generated "Coming Soon" page from `PLACEHOLDER_LEAVES` (`src/routes/index.tsx:795`).

| # | Group / Leaf | Path | Status | Backing data | Notes |
|---|---|---|---|---|---|
| 1 | HR Dashboard | `/hr` | Shell | none | `src/modules/compliance/pages/HRPage.tsx`. 7 tabs, "0 Records", all Add/Upload/Export buttons disabled, `isAuditMode` hardcoded false at `:266`. |
| 2 | Employee Records › Personal Details | `/hris/employee-records/personal-details` | Placeholder | `profiles` (exists) | Data and an editor exist elsewhere (`FullCrewEditModal`, reachable from `/crew/roster`), but admin saves are RLS no-ops (4.1). |
| 3 | Employee Records › Contracts & Employment | `/hr?tab=contracts-employment` | Shell | `profiles.contract_start/end_date` only | No contract table, no SEA records, no expiry alert. MLC tab shows fabricated SEA rows (`MLCTab.tsx:407-449`). |
| 4 | Employee Records › Documents & Certificates | `/hris/employee-records/documents-and-certificates` | Placeholder | `crew_certificates`, `crew_attachments`, `crew_travel_documents` (exist) | Full CRUD components exist but are never rendered by any page, and uploads are denied by bucket policy (4.2). |
| 5 | Employee Records › Next of Kin / Emergency | `/hris/employee-records/next-of-kin-emergency` | Placeholder | `profiles.emergency_contact_name/phone` | Single contact, editable in one modal, never displayed read-only anywhere. No NOK table. |
| 6 | Employee Records › Employment History | `/hris/employee-records/employment-history` | Placeholder | `crew_assignments` (exists) | History is assembled by `useCrewMember` (`useCrew.ts:574-619`) which has zero call sites. Two competing end-date columns (5.1). |
| 7 | Compensation › Salaries & Compensation | `/hr?tab=salaries-compensation` | Shell | none | No salary, bank or tax columns anywhere. Redaction rules protect columns that do not exist (5.2). |
| 8 | Compensation › Payroll | `/hris/compensation/payroll` | Placeholder | none | `frp_payroll_vessel_transfers` exists, is read by the planner, and is never written. |
| 9 | Compensation › Gratuities | `/hris/compensation/gratuities` | Placeholder | none | No rank/pay-grade table to split by. |
| 10 | Compensation › Pay Reviews | `/hr?tab=pay-reviews` | Shell | none | |
| 11 | Performance › Annual Evaluations | `/hr?tab=annual-evaluations` | Shell | none | RBAC capabilities `crew.view_appraisals` / `crew.conduct_appraisals` are seeded and grantable, enforced nowhere. |
| 12 | Performance › Annual Reviews | `/hr?tab=annual-reviews` | Shell | none | |
| 13 | Performance › Objectives & PDPs | `/hris/performance/objectives-and-pdps` | Placeholder | none | `development_applications` approval-chain shape is the best template. |
| 14 | Performance › End of Rotation | `/hr?tab=end-of-rotation` | Shell | none | |
| (14b) | Disciplinary Matters | `/hr?tab=disciplinary-matters` | Shell | none | Exists as a tab on `/hr` but is **not linked from the HRIS nav**. |
| 15 | Recruitment › Vacancies | `/hris/recruitment/vacancies` | Placeholder | none | Nothing reusable. |
| 16 | Recruitment › Candidates | `/hris/recruitment/candidates` | Placeholder | none | No applicant entity; `profiles` requires a company member. |
| 17 | Recruitment › Onboarding | `/hris/recruitment/onboarding` | Placeholder | `crew_import`, invite functions, `pre_departure_checklists`, `familiarization_*` | Three working but disconnected halves of a joiner flow already exist. Familiarisation completion is broken (4.3). |
| 18 | Recruitment › Crewing & Recruitment | `/hris/recruitment/crewing-and-recruitment` | Placeholder | none | Duplicates the group name. |
| 19 | Leave & Rotation | `/crew/leave` | **Real** | `crew_leave_*`, `crew_leave_policies` | `LeavePlannerPage`, fully Supabase-backed. Sub-routes `/requests` and `/calculator` are not in the sitemap. Resolves to the Vessel module, not HRIS (6.3). Depends on unapplied-or-untyped migration (6.4). |
| 20 | Training & Development | `/development` | **Real** | `development_*`, `program_settings` | Six-page module, Supabase-backed, no TODOs. Only one HRIS link into it. |
| 21 | Compliance & Right to Work | `/hris/compliance-and-right-to-work` | Placeholder | `profiles.passport_expiry`, `visa_status`, `medical_expiry` | No alert rule, no dashboard, no sweeper for any of these. `visa_status` is free text. |
| 22 | Reporting & Analytics | `/hris/reporting-and-analytics` | Placeholder | none | `src/modules/analytics` is incidents and CAPA only. |

---

## 4. Blocking defects

These break behaviour that exists today or would break the first thing built on top. Ranked by impact.

### 4.1 Admin profile edits are silent no-ops
`profiles` has exactly one UPDATE policy, "Users can update their own profile", `USING (user_id = auth.uid())` (`supabase/migrations/20260125143210_…sql:73-75`). No admin or role policy was ever added. When a DPA saves `FullCrewEditModal`, `useCrew.updateCrewMember` (`src/modules/crew/hooks/useCrew.ts:339-344`) updates zero rows, PostgREST returns no error, and the UI toasts "Crew member updated successfully". Imported crew have `user_id = NULL`, so `.eq('user_id', null)` matches nothing regardless. **Reusing `profiles` as the HRIS employee is blocked until this policy is rewritten and the write key becomes `profiles.id`.**

### 4.2 Certificate and attachment uploads are denied by storage policy
Every policy on the `documents` bucket requires the first path folder to equal the user's `company_id` (`20260125163105_…sql:181-226`). `useCrewCertificates.ts:359` uploads to `certificates/<userId>/…` and `useCrewAttachments.ts:97` to `attachments/<userId>/…`. Both are denied. Both then call `getPublicUrl` on a private bucket, so any stored `file_url` is unusable. `DocumentUploadPage.tsx:88` has the same problem on `crew-travel-documents` (`temp/<id>/…` vs the company-folder policy in `20260610104821_…sql:46-73`).

### 4.3 Familiarisation completion writes non-existent columns
`supabase/functions/update-familiarization/index.ts:100-108` updates `familiarization_records` with `checklist_progress`, `completed_at` and `signed_off_by`. The table has none of these (only `actual_completion_date`, `completion_percentage`, `status`, `supervisor_id`). Completing a familiarisation record fails.

### 4.4 HRIS is open to every authenticated user
`src/shared/components/ProtectedRoute.tsx:10-31` checks login only. `NavItem.permissions` is set to `['all']` on every module and read nowhere. `PermissionGate` has zero production call sites. `canAccessModule` (`AuthContext.tsx:158-212`) returns true while RBAC is loading, maps both `hris` and `health` to the same `hr` key, and the legacy fallback allows unknown modules by default. The RBAC seed also grants `crew` an `hr` view with `scope='self'` (`20260129125736_…sql:449`) and nothing honours scope. Net: crew, auditors and travel agents can open every HRIS route.

### 4.5 Changing an HR tab ejects the user from the HRIS module
`HRPage.tsx:326` calls `setSearchParams({ tab: v })`, replacing the whole query string and dropping `module=hris`. `DashboardLayout` then falls back to `resolveModuleForPath('/hr')`, which returns **`vessel`** (verified by execution: Vessel › Departments › Management › HR links to the same `/hr?tab=` paths and Vessel is earlier in `NAVIGATION_ITEMS`). The top slider and sidebar silently switch to Vessel. `/crew/leave` resolves to `vessel` too, so any reload or deep link to Leave & Rotation leaves HRIS.

### 4.6 Stale generated types and possibly unapplied migrations
`src/integrations/supabase/types.ts` lacks `crew_leave_policies`, `crew_leave_balance_adjustments`, `feedback_submissions`, `vessel_work_rest_settings` and all eight `work_rest_*` tables, plus `profiles.employment_start_date`, `annual_leave_entitlement`, `leave_accrual_method`, `rotation_pattern`, `joining_date`, `leaving_date`, `employment_status`, `hod_user_id`, `watch_pattern`. All of these come from the three hand-named migrations (`20260501100000_work_rest_module.sql`, `20260501210000_leave_management_upgrade.sql`, `20260228120000_create_feedback_submissions.sql`) rather than Lovable-generated ones. Either the types were never regenerated, or those migrations were never applied to the live project. If the latter, `useCrewLeave.ts:108` selects `employment_start_date` and Leave & Rotation fails at runtime. Every leave-policy and planner query is cast through `(supabase as any)` to get around this.

### 4.7 Broken dependency install
`npm ci` fails on lockfile drift (section 2). `bun.lock` is authoritative. With no CI this has gone unnoticed.

---

## 5. Findings by group

### 5.1 Employee Records (priority 1)

**What exists and is reusable**
- Editor: `src/modules/crew/components/FullCrewEditModal.tsx` (zod schema `:46-90`, tabs `:311-818`) covers name, preferred name, DOB, gender, nationality, phone, emergency contact, rank, department, status, contract dates, rotation, cabin, medical/passport/visa, notes. Field-level write gating via `canEditField` (`src/modules/auth/lib/permissions.ts:164-189`).
- Roster: `src/modules/crew/pages/CrewRoster.tsx` (routes `/crew`, `/crew/roster`) with 14 columns and modal wiring `:783-834`. `CrewList.tsx` is a 36-line "Coming soon" stub.
- Certificates: `CrewCertificates.tsx` (604 lines, full CRUD, audit-logged) and `useCrewCertificates.ts`. Attachments: `CrewAttachments.tsx` and `useCrewAttachments.ts` with typed attachment kinds including Contract, CV, Performance Review, Bank Details. Travel documents: `DocumentUploadPage.tsx`, `TravelDocumentsPage.tsx` with OCR extraction and verification columns.
- Assignments: `crew_assignments` has the shape for employment history. Transfer, sign-off and deactivate mutations exist in `useCrew.ts:380-476`.

**Gaps**
- No dedicated Personal Details page. No crew self-service edit path: `ProfileSection.tsx:16-18` is a stub whose save only fires a toast. No avatar upload anywhere.
- Profile columns never surfaced: `probation_end_date`, `profiles.position`, `avatar_url`. UI "position" edits `crew_assignments.position`, a different column.
- No contract table. One contract period per person via two date columns. No SEA record, no signature, no versioning, no contract-expiry alert (`src/modules/alerts/constants.ts` has no contract rule).
- `CrewCertificates` and `CrewAttachments` are re-exported (`src/modules/crew/index.ts:62,64`) but never rendered. `CrewProfileModal` Certificates tab is hardcoded "Coming in next phase" (`:167-183`).
- Next of kin: one name and phone on `profiles`, write-only in practice. `crew_import` carries richer NOK data that the sync flattens. No relationship, address, secondary contact or consent record. Readable by every company member (see RLS below).
- Employment history: no page, no timeline. Sign-off reason/notes and transfer notes are collected in the UI and discarded (`CrewRoster.tsx:208-212`).
- Dead code: `EditCrewModal.tsx`, `useUsersApi.ts`, `useCrewMember`, `LeaveManagement.tsx` all have zero call sites.

**Defects**
- 4.1 and 4.2 above.
- Two conventions for "assignment ended": `useCrew` sets `leave_date`, `VesselAccessSection.tsx:365,401` sets `end_date`. History queries will disagree depending on which path created the row.
- `crew_assignments` RLS is `FOR ALL … USING` with no `WITH CHECK` (`20260125160927_…sql:113-121`): any company member can insert or reassign anyone's vessel assignment.
- `crew_certificates` and `crew_attachments` RLS allow any company member to insert, update or delete anyone's records, while the UI gates on `EDIT_CREW_CERTIFICATES`. The DB is looser than the UI.
- `profiles` SELECT is row-level only: `passport_number`, DOB, medical expiry, NOK, notes are readable by every authenticated colleague, including `crew`. `select('*')` is used throughout.
- Certificate `status` is denormalised at write time and never refreshed; `CrewDocuments.tsx:125` reads the stale column.
- Three different upload size limits claimed (10 MB in UI text, 25 MB in hook, 26,214,400 bytes in bucket).
- `crew_change_dates` SELECT is `auth.uid() IS NOT NULL`, leaking across companies (unused table, so latent).

### 5.2 Compensation (priority 2, calculation engine)

**Input data that exists for a calculation engine**
- Day-grain sources: `frp_rotation_assignments` (interval, `rotation_type` onboard/leave/travel/standby/yard/…, `20260617195850_…sql:105-134`) and `crew_leave_entries` (one row per crew per day, `status_code` F/Q = onboard, `20260215080527_…sql:7-17`). Code-to-type map at `src/modules/rotation-planner/constants.ts:54-66`.
- Pro-rata month maths already exists and is tested: `calculateAccruedDays` in `leaveCalculator.ts:167-229`. Policy resolution vessel → company → default: `useLeavePolicy.ts:46-69`. Period lock pattern: `crew_leave_locked_months`. Pay-cutoff precedent: `vessel_work_rest_settings.cutoff_day_of_month` + `timezone`.
- Settings/engine template: `program_settings` (one row per company, typed numeric knobs) + `useProgramSettings` + `rulesEngine.calculateCosts` in `src/modules/development/services/rulesEngine.ts:74`.
- Multi-currency precedent: `development_applications.application_currency`, `exchange_rate_to_usd` (`20260611052722_…sql:26-35`). Only worked example in the repo.
- Branded PDF: `src/lib/pdf/pdfTemplate.ts` `createPDFTemplate` + `src/shared/hooks/usePDFExport.ts`. Payroll CSV precedent: `src/modules/work-rest/reports/exports.ts:179`.
- `frp_payroll_vessel_transfers` models a payroll cost-centre switching on a different date from the physical move. Nothing writes it.

**Gaps**
- No per-crew, per-vessel, per-month days-onboard aggregation anywhere. Two unreconciled day sources; `linked_leave_entry_id` is a bare UUID never populated.
- No pay-grade or rank table. `RANKS` (`src/modules/crew/constants.ts:1-21`) is 20 flat strings that do not cover the fleet vocabulary. Four incompatible department lists (`leaveConstants.ts:28`, `seedData.ts:15`, `capabilityCatalog.ts:31`, `VesselAccessSection.tsx:63`). The graded `DEC 10 / EGR 5 / INT 5.1` scheme exists only in a seed file.
- No money representation: all floats, no minor units, no shared formatter (two duplicated `fmtMoney` helpers with `maximumFractionDigits: 0`, which would hide cents on a payslip). No FX table. No company default currency.
- No bank, IBAN, tax ID or payment-frequency storage anywhere. Confirmed by search.
- No pay-period, gratuity policy or payroll calendar table. No payslip storage. All PDF generation is client-side, so no immutable stored artefact.
- No `finance` or `payroll` RBAC module key. `crew.approve_payroll` (`20260522163528_…sql:123`) exists as a grantable capability with no view capability and no enforcement. Compensation pages would inherit the coarse `hr` module level, so "can see HR dashboard" would mean "can see salaries".
- `jspdf-autotable` is declared but never imported. Three export stacks coexist (jsPDF, xlsx, exceljs).

**Defects**
- Redaction rules protect columns and tables that do not exist: `profiles.salary`, `profiles.bank_details`, `crew_contracts.salary`, `salary_records.*` (`src/modules/auth/lib/auditModeRules.ts:44-46`, `src/modules/compliance/lib/auditModeExtensions.ts:34-44`). Tests lock this in (`auditModeRules.test.ts:49`). When real tables land under other names, auditor redaction will not apply. **Highest-risk finding in this workstream.**
- `leaveCalculator.ts:274-277`: `monthlyAccrualDays` ternary returns the same value in both branches. Per-crew `annual_leave_entitlement` has no effect under monthly or rotation accrual.
- `leaveCalculator.ts:299-313`: an approved request straddling `asOf` has its remaining future days counted neither as taken nor booked.
- `LeaveRequestsPage.tsx:255-292`: approval deletes then inserts `crew_leave_entries` non-transactionally and silently skips locked months while marking the request fully approved.
- `usePlannerData.ts:70-90`: travel and payroll queries put the date window in the query key but apply no date filter. Unbounded `select('*')`.
- `crew_leave_entries` RLS is company-membership only: any member can delete anyone's leave day.
- Two parallel leave-request tables (`leave_requests` used by the orphaned `LeaveManagement.tsx`, `crew_leave_requests` used by the live pages).
- Dead tables with zero `src` references: `planner_periods`, `crew_change_dates`.

### 5.3 Performance (priority 3)

**What exists**
- Intent is fully specified: `hr_record_type` enum values `annual_review`, `performance_evaluation`, `rotation_catchup`, `disciplinary_minor/serious`, `welfare_note` (`20260129113801_…sql:25-37`); retention defaults auto-seeded per company (`:330-393`); capabilities `crew.view_appraisals`, `crew.conduct_appraisals` with department-scoped appraiser UI (`DepartmentScopeCard.tsx:21`); field lists in `HRPage.tsx:22-102`.
- The only existing rating-on-a-person is `drill_participants.performance_rating` (1 to 5).
- **Form engine is the highest-leverage reuse.** `form_templates` / `form_submissions` / `form_signatures` / `form_schedules` (`20260127210031_…sql`) provide dynamic schema, versioning with immutable snapshots, multi-party sequential or parallel signatures with IP/device audit, lock and content hash, amendments, attachments, and recurrence scheduling. Builder UI at `src/modules/ism/forms/`. Edge functions `submit-form`, `sign-submission`.
- `development_applications` (`20260214184755_…sql:30-100`) has a three-stage reviewer chain, comments, audit log and documents. Best structural template for Objectives & PDPs, with a PDP goal linking to a course application as the natural integration point.
- `training_matrix` gap = training need input for Annual Reviews.

**Gaps**
- No evaluation, review, objective or catch-up table. No rating scale or competency framework. No review cycle scheduler per employee anniversary. No self-assessment or subject acknowledgement. No "next due" tracking.
- `form_submissions` has **no subject-person column** (scoped to company, vessel, creator only) and company-wide SELECT RLS. Both must change before an appraisal can be a form submission.
- Two overlapping form engines (`form_*` and `sms_*`). Pick one before building on it.
- Disciplinary: `incidents.persons_involved` is unstructured JSONB, so "all incidents involving X" is unanswerable. No disciplinary table despite the 2-year vs 7-year retention split implying minor/serious severity.
- Competing nav entries: Vessel › Crew › Performance Appraisals (`sitemap.ts:98`) vs the HRIS Performance group.

### 5.4 Recruitment and Onboarding (priority 4)

**Onboarding: substantially reusable, disconnected**
- Account creation: `crew_import` staging table (with NOK, home airport, rotational partner), CSV parser, `create-crew-member`, `send-invitation`, `bulk-invite`, `accept-invitation` edge functions with a shared `invite-helpers.ts`.
- Pre-arrival readiness: `pre_departure_checklists` (`20260129131533_…sql:226+`) with medical, vaccination, passport, visa, seaman's book, ticket fields FK'd to `crew_travel_documents`.
- Post-arrival: `familiarization_templates` / `records` / `checklist_items` with supervisor sign-off, overdue status and a `familiarization_not_completed` notification type. UI at `/training` only; the sitemap's "Familiarisation Forms" leaf is a placeholder.
- The Onboarding leaf is mostly a stitching job: one per-joiner view across these three, plus HR-side induction items that do not exist (policy acknowledgement, payroll setup, NOK capture).

**Vacancies and Candidates: nothing**
- No requisition, applicant, pipeline, interview or offer concept. `profiles` cannot hold a candidate (company-scoped, auth-linked). New entity required.

**Defects**
- 4.3 above (familiarisation completion broken).
- `probation_end_date` exists, is read only by training eligibility, and has no probation review anywhere.

### 5.5 Leave & Rotation (real)
Works, Supabase-backed, well-factored, with the repo's only feature-module test. Risks are 4.5 (resolves to Vessel), 4.6 (types/migrations), and the calculator defects in 5.2. Sub-routes `/crew/leave/requests` and `/crew/leave/calculator` are missing from the sitemap.

### 5.6 Training & Development (real)
Works, Supabase-backed, no TODOs or console errors. HRIS offers one link into a six-page module. `/development` redirects to `/development/my` and drops `?module=hris`; it happens to resolve back to `hris` only because HRIS is the sole owner of that path.

### 5.7 Compliance & Right to Work
`passport_expiry`, `medical_expiry` and `visa_status` are shown as roster columns (visa is not even shown) and nothing else. `ALERT_RULES` (`src/modules/alerts/constants.ts:33-108`) has no passport, visa, medical or contract trigger. `certificate_alerts` are generated client-side only when a human edits a certificate, so a certificate that simply ages out produces nothing. No server-side expiry sweeper exists in `supabase/functions/`. Notification types for contract expiry, probation end, review due and document expiry do not exist, though `crew_certificate_expiries` and `familiarization_not_completed` prove the pattern.

### 5.8 Reporting & Analytics
`src/modules/analytics` is incidents and CAPA only. Nothing reports on headcount, turnover, leave balances, certificate or document expiry. Sidebar dashboard links `Fleet Reports` → `/analytics` and `Fleet Calendar` → `/calendar` (`SidebarNavigation.tsx:20`) are not registered routes and bounce to `/dashboard`.

---

## 6. Cross-cutting

### 6.1 Access control
See 4.4. Additional facts: the DB does define an `hr` module and per-role grants with `restrictions` JSON (`exclude_salaries`, `contracts_rotation_only`, `summary_only`, `self`) in `20260129125444_…sql` and `20260129125736_…sql`, but `getRestrictions` in `permissionsStore.ts:24-31` has zero call sites. `NavChild` has no permission field, so leaf-level gating is not expressible. Two RBAC systems coexist with overlapping table names (`role_permissions` in both `20260127182112` and `20260129125250`); the legacy `permissions(module, action)` table is never seeded.

### 6.2 GDPR, retention and audit mode
Built but unplugged. No audit-mode provider or hook exists; `HRPage.tsx:266` hardcodes `isAuditMode = false`, so `RedactedField` and `transformForAuditView` can never fire on HR. `hr_audit_access_grants` has zero `src` references. `useComplianceAccessLog` has zero consumers. Nothing writes `hr_record_metadata`, so `RetentionStatusBadge` (hardcoded `status="active"`) is cosmetic. No DB function, trigger, cron or edge function archives or anonymises anything; `data_retention_policies.auto_archive` is a column with no implementation. HR page "Export Data (GDPR)" and "Anonymise Expired" are disabled. The retention periods hardcoded in `HRPage.tsx` already disagree with the DB defaults (page says annual evaluations "3-5 years", DB says 3 years for `performance_evaluation` and 5 for `annual_review`). `hr_record_metadata` SELECT is any company member, not DPA-only. `useDataRetention` and `useGDPRRequests` are wired only to Settings sections.

### 6.3 Navigation
- Every real HRIS destination is duplicated at the same path under Vessel: six `/hr?tab=` leaves under Vessel › Departments › Management › HR (`sitemap.ts:268-274`) and `/crew/leave` under Vessel › Crew (`:92`). Vessel wins every resolver tie (verified: `/hr` → `vessel`, `/crew/leave` → `vessel`).
- Same concepts on different placeholder paths: Payroll, Crewing & Recruitment, Employment History, Documents & Certificates, Crew Compliance / Right to Work, Performance Appraisals each have a Vessel-side twin.
- `/hris` and the four group paths have no route and fall to the `*` catch-all → `/dashboard`.
- Disciplinary Matters tab is unreachable from the nav. "Crewing & Recruitment" leaf duplicates its group.
- `TopModuleNav.tsx` is dead code with a stale map of `accounting` → `/hr`.
- No duplicate nav ids (verified by executing the tree).

### 6.4 Types drift
See 4.6. Action: regenerate `types.ts` from the live project and confirm all three hand-named migrations are applied. Until then, no type safety on leave, work/rest or planner code, and a compensation engine built on those tables inherits `(supabase as any)` everywhere.

### 6.5 Tooling
No CI. `vitest.config.ts:15-20` coverage globs point at pre-refactor paths (`src/lib`, `src/store`, `src/contexts`, `src/components/auth`) so coverage measures almost nothing. No `typecheck` script. Zero tests for any HRIS page, hook, the sitemap invariants, or the module resolver.

---

## 7. Build order

Sequenced to the chosen priorities, with the substrate work that each phase cannot proceed without. Each phase leaves the system working.

### Phase 0: substrate (prerequisite for everything)
1. Confirm on the live Supabase project whether `20260501100000`, `20260501210000` and `20260228120000` are applied. Apply if not. Regenerate `types.ts`. Remove `(supabase as any)` casts in leave and planner hooks.
2. Rewrite `profiles` RLS: keep self-update; add UPDATE for `dpa`, `shore_management`, `fleet_master` within company; consider `captain`/HOD limited via column-restricted RPC. Switch write key to `profiles.id`. Move `passport_number`, DOB, NOK and medical into a masked view or a sensitive-columns table with narrower SELECT.
3. Fix storage paths to `<company_id>/…` in `useCrewCertificates`, `useCrewAttachments`, `DocumentUploadPage`; use signed URLs, not `getPublicUrl`.
4. Fix `update-familiarization` to write the columns that exist.
5. Access control: gate `/hr` and `/hris/*` behind a route wrapper that reads the RBAC `hr` module level; honour `scope='self'` and the `restrictions` JSON; remove the `health` → `hr` collision; make `canAccessModule` fail closed once RBAC has loaded. Add a `moduleKey` to `NavChild` and filter leaves in `SidebarNavigation`.
6. Navigation: `setSearchParams(prev => …)` in `HRPage`; make the resolver prefer the module carried in `?module=`; remove the six `/hr?tab=` and `/crew/leave` duplicates from Vessel (or make HRIS the sole owner); add routes for `/hris` and group paths; link Disciplinary Matters; add leave sub-routes to the sitemap.
7. Tooling: delete `package-lock.json` or regenerate it, declare `@testing-library/dom`, add a `typecheck` script, fix the 11 lint errors, fix coverage globs, add a minimal CI workflow (lint, typecheck, test, build).

### Phase 1: Employee Records
1. Personal Details page at `/hris/employee-records/personal-details` reusing `FullCrewEditModal` fields as a full page; expose `probation_end_date`, `profiles.position`, avatar upload; crew self-service using `OWN_PROFILE_FIELDS`.
2. `crew_contracts` table (one row per contract/SEA: type, start, end, vessel, wage reference, document, signed status, superseded_by) registered in `hr_record_metadata` as `employment_contract`. Contract-expiry and probation-end notification types and alert rules.
3. Documents & Certificates page rendering the existing `CrewCertificates` and `CrewAttachments` components plus travel documents; add a nightly status refresh so stored certificate status is not stale.
4. `crew_next_of_kin` table (multiple contacts, relationship, address, email, primary flag, consent date); migrate the two `profiles` columns and the `crew_import` NOK fields; read-only ICE view for master/DPA; extend redaction to cover the name.
5. Employment History page from `crew_assignments`: pick one end-date column, backfill the other, add `reason`/`notes` columns and persist what the sign-off and transfer dialogs already collect; rank-change history via an audit-derived timeline.

### Phase 2: Compensation (calculation engine)
1. Foundations: `pay_grades` table (rank/grade/step keyed to a canonical rank list, replacing the four department lists with one), money as integer minor units with a shared formatter and rounding policy, `fx_rates` table, company default currency.
2. `crew_compensation` (base salary, currency, allowances, frequency, effective ranges) and `crew_bank_details` (encrypted at rest, DPA/purser-only RLS), both registered as `salary_compensation`; rewrite redaction rules to the real table and column names and update their tests.
3. `pay_periods` per company/vessel (reusing the `crew_leave_locked_months` lock pattern and `cutoff_day_of_month`) and `gratuity_policies` (split method by rank/days, eligibility rules).
4. Days-onboard aggregation service: intersect `frp_rotation_assignments` and `crew_leave_entries` per crew, vessel and pay period; wire `frp_payroll_vessel_transfers` as the cost-centre switch; write a reconciliation report for the two day sources.
5. Engine: `payroll_runs` / `payroll_lines` with pro-rata from days onboard and `pay_grades`, gratuity distribution runs, approval via `crew.approve_payroll`; new `finance` RBAC module key with view/run/approve capabilities.
6. Payslips: server-side generation (edge function) with `createPDFTemplate` branding and `jspdf-autotable` tables, stored in a private bucket with content hash and a `payslips` table.
7. Pay Reviews table registered as `pay_review`, linked to `crew_compensation` effective ranges.

### Phase 3: Performance
1. Choose `form_*` over `sms_*`. Add `subject_user_id` to `form_submissions`, index it, and add record-level RLS (subject, evaluator, DPA, department-scoped appraiser).
2. Annual Evaluation and End-of-Rotation as `form_templates` with signature chains; register submissions in `hr_record_metadata`; per-employee anniversary scheduling via `form_schedules` plus a generator for `next_due_date`; `review_due` notification type.
3. `crew_objectives` / PDPs modelled on `development_applications` with goals linking to course applications.
4. `disciplinary_records` with minor/serious severity and expiry; normalise `incidents.persons_involved` into a join table so incident evidence can be attached.

### Phase 4: Recruitment, Right to Work, Reporting
1. Onboarding: single per-joiner page stitching `crew_import` → invite → `pre_departure_checklists` → `familiarization_records`, plus an HR induction checklist template using the familiarisation section-explosion pattern.
2. `vacancies` and `candidates` (non-auth person entity) with pipeline stages and conversion to `profiles` on hire.
3. Right to Work: convert `visa_status` to typed visa records with expiry; add passport, visa, medical and contract expiry to `ALERT_RULES`; a scheduled edge function that sweeps expiries daily (replacing edit-time client generation of `certificate_alerts`); a compliance dashboard at the placeholder path.
4. Reporting: headcount, turnover, leave liability, expiry and payroll cost views in `src/modules/analytics`; fix the dead `/analytics` and `/calendar` links.

### Phase 5: GDPR and retention wiring
Audit-mode provider reading `audit_mode_sessions` and `hr_audit_access_grants`; `transformForAuditView` applied on HR reads; `compliance_access_log` inserts on every HR read; a scheduled function implementing `auto_archive` and anonymisation from `hr_record_metadata`; GDPR export producer for `gdpr_requests.export_file_url`; enable the two disabled buttons on the HR page; single source of truth for retention periods.

---

## Appendix: verification notes and corrections

- **Corrected:** a sub-agent reported `employment_start_date` as never added by any migration. It is added by `supabase/migrations/20260501210000_leave_management_upgrade.sql:11`. The real defect is stale generated types and possibly unapplied migrations (4.6).
- **Verified by execution:** `resolveModuleForPath('/hr')` → `vessel`; `'/crew/leave'` → `vessel`; `'/development'`, `'/development/my'`, `'/hris'`, `'/hris/employee-records'` → `hris`.
- **Verified by reading:** `profiles` UPDATE policy (4.1), `documents` bucket policy vs upload paths (4.2), `update-familiarization` column names vs table (4.3), `ProtectedRoute` auth-only (4.4), `HRPage.tsx:326` `setSearchParams` (4.5), leave calculator ternary and straddle logic (5.2).
- Sub-agent line references were spot-checked, not exhaustively re-verified. Treat any single line number as approximate to within a few lines; file names and claims were confirmed.
