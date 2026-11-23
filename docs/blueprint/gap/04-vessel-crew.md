# Vessel view: Crew — gap analysis

> Spec for implementers. It compares the rebuild blueprint (v1.3) for the reference app against STORM as it is in the code today, and states what STORM must build for the **Crew** module of the **Vessel view**: crew list, profile, documents, planner, compliance matrix, hours of rest, familiarisation, appraisals, visitors and occasional workers, employment history, medical and training. Requirements are written as STORM requirements, in our own words. Blueprint sections are cited as `§n.n`; support-ticket themes from the reference app's export are cited as `T-<ticket number>` (no personal data).
>
> Depends on: `01-foundations-tenancy-roles.md` (vessel-scoped routes, `positions`, `departments`, capabilities, Access Sets, designated vessel roles, `vessel_module_settings`) and `02-fleet-view-operations.md` (expiry engine, fleet medical status, visitor tables, training catalogue, hiring needs). The signature engine (§8) is owned by the signatures gap doc; this doc only states where crew workflows call it.

---

## Scope

**Blueprint sections covered**

| § | Topic | Notes |
|---|---|---|
| Exec summary | Crew module list, core entities, expiry and signature engines | Crew is item 3 in the suggested build order |
| §2.2–2.3, §2.7 | Crew Module Access presets, crew flags, gated tabs | Only how they gate crew pages; the model itself is in doc 01 |
| §3.4–3.7 | User / crew member, position, employment record, crew document / STCW / qualification, document-type categories, vaccinations | |
| §3.20–3.21 | Hours of rest; leave period, rotation, position manning, required qualification, familiarisation template, appraisal, visitor / visit, crew medical summary, training plan item, checklist | |
| §5.1.1–5.1.13 | Crew dashboard, crew list, add crew member, crew profile (all tabs and edit form), add-document dialog, planner, crew compliance, hours of rest (+ report), familiarisation, checklists, appraisals, visitors & occasional workers, employment history, crew medical, crew training | |
| §6.1, §6.2, §6.3 | Onboarding, compliance and expiry alerts, document verification | State diagrams `image47.png`, `image14.png` viewed |
| §6.14, §6.15 | Hours of rest; leave, planner, rotation and employment | State diagrams `image11.png`, `image12.png` viewed |
| §6.25, §6.29 | Performance appraisal; crew compliance configuration | State diagram `image35.png` viewed |
| Appendices A–C | Position list (248), nationality list (219 demonyms; separate 219-country list), language list (53) | Sizes and storage only |

Screenshots viewed: `image41.png` (crew list: tabs Crew/Movements, counters, On/Off toggle, On Transfer badge, travel icon, role chips, two compliance dots, three row actions), `image44.png` (hours of rest board: month navigation, department tabs, queue chips with counts, legend, one card per crew with mini calendar, month status menu, Remind with "Reminded <date> by <role>", "Former crew" badge, "On leave all month" collapsed card).

Support tickets: 46 of the 142 tickets relate to this domain (document verification and mis-filing, requirement equivalences, hours-of-rest workflow and reminders, planner usability and sync, transfers, occasional workers, familiarisation forms, role badges, permissions matrix).

**Out of scope here** (owned elsewhere, referenced where they meet this module): fleet medical page, fleet visits page and fleet training catalogue/applications (doc 02); Users & Access, Access Sets, capability engine, positions/departments tables, designated vessel roles (doc 01); medical case record SMS form (SMS-forms doc); signature capture and PDF stamping (signatures doc); HRIS payroll/compensation (stays in `/hris`).

**STORM paths inspected (code read, not just names)**

- Crew module: `src/modules/crew/pages/{CrewList,CrewRoster,CrewDashboard,CrewDocuments,LeavePlannerPage,LeaveRequestsPage,LeaveCalculatorPage,LeaveManagement}.tsx`, `components/{CrewFormModal,CrewProfileModal,FullCrewEditModal,EditCrewModal,TransferCrewModal,SignOffDialog,ImportCrewCSVModal,OfficialCrewListDialog,PersonnelRecordDialog,CrewCertificates,CrewAuditLog,ReallocateVesselModal}.tsx`, `hooks/{useCrew,useCrewLeave,useLeavePolicy}.ts`, `constants.ts`, `leaveConstants.ts`, `lib/crewListPdf.ts`, `services/leaveCalculator.ts`
- HRIS: `src/modules/hris/{paths.ts,routes.tsx}`, `lib/{reviews,profileForm,onboarding,employmentHistory,rightToWork}.ts`, `components/personal/PersonalDetailsForm.tsx`, `components/documents/requiredDocuments.ts`, `components/history/AssignmentsTable.tsx`, `pages/DocumentsPage.tsx`; `docs/HRIS.md`, `HRIS-AUDIT.md`
- Hours of rest: `src/modules/work-rest/{types/index.ts,lib/complianceEngine.ts,services/workRestService.ts,pages/WorkRestOverview.tsx,pages/MyWorkRestMonth.tsx,components/SignOffPanel.tsx,components/NonConformityList.tsx,reports/exports.ts}`
- Planner: `src/modules/rotation-planner/{types.ts,constants.ts,hooks/usePlannerData.ts,lib/conflicts.ts,lib/xlsxImporter.ts,pages/RotationPlannerPage.tsx,components/Toolbar.tsx}`
- Training / familiarisation: `src/modules/training/{pages/Training.tsx,hooks/useTraining.ts,components/TrainingMatrixTab.tsx,components/FamiliarizationTab.tsx,components/ComplianceOverviewTab.tsx}`; `src/modules/development/pages/CrewTraining.tsx`
- Certificates: `src/modules/certificates/hooks/useCrewCertificates.ts` (`MARITIME_CERTIFICATE_TYPES`), `pages/CrewCertificatesOverview.tsx`
- Health (crew medical data): types for `med_patient_records`, `med_vaccinations`, `med_fitness_assessments`, `med_allergies`, `med_conditions`, `hw_people`
- Navigation and routes: `src/config/sitemap.ts` (`vesselCrew`, lines 102–115; HRIS leave group, lines 599–605), `src/routes/index.tsx` (crew routes, lines 223–415)
- Edge functions: `supabase/functions/{create-crew-member,update-familiarization}/index.ts`, `extract-flight-data` (AI extraction pattern). `parse-crew-csv` and `update-crew-assignment` are retired (DECISIONS D-191): the CSV import calls `create-crew-member` once per row, and a vessel move goes through `admin-actions` `reallocate_vessel` until the `transfer_crew` RPC (C58) lands
- Migrations / types (grepped): `crew_assignments`, `crew_certificates`, `crew_attachments`, `crew_travel_documents`, `crew_contracts`, `crew_next_of_kin`, `crew_work_authorisations`, `crew_leave_*`, `frp_*`, `training_*`, `familiarization_*`, `work_rest_*`, `vessel_work_rest_settings`, `performance_*`, `crew_import` (`20260428170231_*`), `20260917130000_hris_phase3_performance.sql`, `20260917110000_hris_phase1_employee_records.sql` (`hr_expiry_items`)
- Permissions: `docs/permissions/catalogues/storm.json` (`vessel.crew.*`, `hris.*` keys)

### Headline findings from the code

1. **There is no vessel-scoped Crew module.** The vessel "Crew" sidebar (`sitemap.ts` 107–115) has 7 leaves, 4 of which are cross-links to company-wide pages (`/crew/leave`, `/crew/rotation-planner`, `/development/crew-training`, `/training`). Every crew page loads the whole company and filters by vessel in the browser (`useCrew.ts` selects `profiles.*` for the company, then filters `current_assignment` client-side).
2. **Two crew lists, no crew profile page.** `/crew/list` (`CrewList.tsx`, "every person on the books": crew, contractors, shoreside) and `/crew/roster` (`CrewRoster.tsx`, 15-column admin table with Airtable sync, CSV import, invite actions) overlap. The profile is spread across `CrewProfileModal` (4 tabs), `FullCrewEditModal` (4 tabs) and six HRIS pages that each pick a person with `CrewPicker`. Nothing has a URL per crew member.
3. **No document catalogue and no requirement engine.** `crew_certificates.certificate_type` is free text picked from ~40 hard-coded names (`MARITIME_CERTIFICATE_TYPES`). "Required documents" is a 7-item keyword match (`requiredDocuments.ts`). `training_matrix` (rank → courses) exists but no UI writes it; the Training Matrix tab uses `training_courses.is_mandatory` for everyone. Nothing models positions × required qualifications, equivalents or "missing for role" (§5.1.7, §6.29).
4. **No verification on crew documents.** `crew_certificates` has no verification fields; only `crew_travel_documents.verified` (boolean) exists. Certificate `status` is computed at write time and stored, so it goes stale.
5. **Hours of rest has a good engine but the wrong workflow surface.** Daily timeline, rule sets, non-conformities, monthly submissions with crew/HoD/Captain signatures and an audit log are real. Missing: leave awareness, "warning" and "serious" breach classes, reminders, the department board with queue chips, submit-on-behalf for leavers, breach review / breach report, the report page. The overview's three export buttons have no handlers.
6. **Planner exists twice.** `crew_leave_entries` (one status code per crew per day, feeds the leave calculator and the payroll days-onboard engine) and `frp_rotation_assignments` (bars on lanes, zoom, conflicts, XLSX import). Neither has position manning minimums, manning gaps or a rotation builder.
7. **HRIS already solves much of employment and appraisal** (`crew_contracts`, `crew_next_of_kin`, employment history, `performance_reviews` with self-assessment, sign-off, acknowledgement and PDF). It is keyed on `profiles.id`, while older crew tables key on `user_id`, which is null for imported crew.
8. **Visitors / occasional workers, crew dashboard, compliance matrix, position manning, controlled transfer and In/Out board are missing.**
9. **Public-repo hygiene**: `src/modules/crew/leaveConstants.ts` exports `CREW_SEED_DATA`, an unused array of named crew members with positions and leave balances (re-exported from `src/modules/crew/index.ts`). It must be deleted. `crew_import` (`20260428170231_*`) grants SELECT to every authenticated user with `using (true)`: crew personal data readable across tenants.

---

## Target information architecture

Conventions from doc 01: vessel pages live under `/v/:vesselCode/…` (3-letter code, e.g. `dra`, `hyd`, `dag`, `lev`); tabs and filters inside a page use query params; per-vessel module settings can rename or hide items (Planner ↔ "Leave", Hours of Rest on from a date, Crew Training off). Every page reads the vessel from the route, never from `localStorage`.

### Vessel view › Crew (`/v/:vesselCode/crew/…`)

```
Crew  (vessel module tab; sidebar below, collapsible)
├─ Dashboard ........................ /v/:vc/crew                                  §5.1.1
├─ Crew List ........................ /v/:vc/crew/list?tab=crew|movements&q=&dept=&status=&sort=rank&dir=asc
│   ├─ Add Crew Member .............. /v/:vc/crew/new                              §5.1.3
│   ├─ Positions (drawer) ........... /v/:vc/crew/list?positions=1                 §5.1.2
│   ├─ Crew List Report ............. dialog (FAL 5, crew list as at date, biographies)
│   └─ In / Out Board ............... /v/:vc/crew/in-out  (kiosk layout)           §5.1.2, §2.3
├─ Crew profile ..................... /v/:vc/crew/people/:profileId/:tab          §5.1.4
│     tab ∈ personal | contact | documents | stcw | qualifications | training |
│           hours-of-rest | employment | medical | activity
│     employment sub-tab: ?sub=details|transfers|appraisals|familiarisation
│     hours-of-rest: ?month=2026-11 (month view default) &day=2026-11-21 (day editor)
├─ Planner (label "Leave" per vessel setting)
│     /v/:vc/crew/planner/:tab        tab ∈ timeline | manning | requests | configuration   §5.1.6
├─ Crew Compliance .................. /v/:vc/crew/compliance/:tab  tab ∈ status | configuration
│     status: ?view=overview|gaps|documents|stcw|qualifications|familiarisation&show=all|onboard&group=dept|flat&layout=matrix|cards
├─ Hours of Rest .................... /v/:vc/crew/hours-of-rest?month=2026-11&dept=bridge&queue=ready|waiting|approved|leave
│   └─ HoR Report ................... /v/:vc/crew/hours-of-rest/report?year=2026   §5.1.8
├─ Crew Medical ..................... /v/:vc/crew/medical?status=critical|at_risk|incomplete|ok   §5.1.13
├─ Crew Training .................... /v/:vc/crew/training                          §5.1.13
├─ Familiarisation .................. /v/:vc/crew/familiarisation                   §5.1.9
│     /v/:vc/crew/familiarisation/:recordId, ?all=1 (View all)
├─ Checklists ....................... /v/:vc/crew/checklists?tab=recent|templates|history   §5.1.10
├─ Performance Appraisals ........... /v/:vc/crew/appraisals?status=&dept=
│     /v/:vc/crew/appraisals/new, /v/:vc/crew/appraisals/:reviewId               §5.1.10
├─ Visitors & Occasional Workers .... /v/:vc/crew/visitors?tab=today|current|onboard|disembarked|all
│     /v/:vc/crew/visitors/visits/:visitId, /v/:vc/crew/visitors/people/:personId  §5.1.11
└─ Employment History ............... /v/:vc/crew/employment-history?dept=        §5.1.12
```

Visibility rules (all server-checked through `has_capability`, doc 01):

| Item | Shown when |
|---|---|
| Dashboard, Crew List | `vessel.crew.crew_list.view` |
| Profile personal/contact/documents/stcw/qualifications | `vessel.crew.crew_profiles.view` (own profile always) |
| Profile Employment tab, Employment History | employment-records capability (sensitive, §2.7) |
| Profile Medical tab, Crew Medical | medical view capability (sensitive) |
| Planner | scheduling view; module "planner" on for the vessel; label from `vessel_module_settings.label_override` |
| Planner › Requests approve | leave approve capability |
| Hours of Rest | module "crew_hor" on, and the vessel date ≥ `enabled_from`; board needs HoR approve; crew see only their own month |
| Crew Training | module "crew_training" on; register needs training register view |
| Appraisals | appraisal view; create needs conduct; department scope applies |
| Checklists › Manage | manage vessel checklists capability |
| Compliance › Configuration | owner/admin, or crew with Full Access |
| Visitors | `vessel.crew.crew_list.view`; add needs Crew Read & Write |

### Fleet view counterparts (owned elsewhere unless marked)

| Fleet page | Relation |
|---|---|
| `/fleet/planner` (**owned here**) | Same planner component with vessel lanes stacked; replaces the `/crew/rotation-planner` cross-link in the Fleet sidebar |
| `/fleet/medical` (doc 02) | Same grid as vessel Crew Medical, all reachable vessels |
| `/fleet/visits` (doc 02) | Person register and fleet visits; vessel Visitors writes to the same tables |
| `/fleet/training` (doc 02) | Catalogue, applications, budgets; vessel Crew Training is the filtered register |
| `/fleet/reports/crew-qualifications`, `/fleet/reports/hours-of-rest` (doc 02) | Read the compliance and HoR views defined here |
| `/hris/…` | Stays the shore HR workspace (contracts, compensation, payroll, disciplinary, recruitment). The vessel profile reuses its components; HRIS person pages link to `/v/:vc/crew/people/:id` |

### Personal area (crew self-service, doc 01 owns the shell)

`/me/documents` (own documents, upload when "Crew Uploads" is on), `/me/hours-of-rest`, `/me/leave` (request leave, see balance), `/me/appraisals`, `/me/training`, `/me/familiarisation`. These render the same tab components as the profile, locked to the signed-in person.

### Legacy route redirects (keep one release)

`/crew`, `/crew/roster`, `/crew/list` → `/v/<code>/crew/list`; `/crew/my-dashboard` → `/me`; `/crew/certificates` → `/v/<code>/crew/compliance/status?view=documents`; `/crew/work-rest`, `/crew/hours-of-rest` → `/me/hours-of-rest`; `/crew/work-rest/overview` → `/v/<code>/crew/hours-of-rest`; `/crew/work-rest/:crewId` → `/v/<code>/crew/people/:profileId/hours-of-rest`; `/crew/leave` → `/v/<code>/crew/planner/manning`; `/crew/leave/requests` → `/v/<code>/crew/planner/requests`; `/crew/rotation-planner` → `/v/<code>/crew/planner/timeline` (or `/fleet/planner` for fleet users); `/training` → `/v/<code>/crew/familiarisation`; `/development/crew-training` → `/v/<code>/crew/training`; `/hris/performance/*` keeps working but its rows link to the vessel appraisal page.

---

## Feature inventory

Status key: complete / partial / placeholder / missing. Effort: S < 1 day, M 1–3 days, L 3–10 days, XL > 10 days.

### A. Module shell and dashboard

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C1 | Vessel Crew sidebar (13 items), filtered by vessel module settings and capabilities, labels overridable | §5.1, §3.3 module settings | partial | `sitemap.ts` `vesselCrew` (Crew List, Crew Roster, Leave↗, Rotation Planner↗, Hours of Rest, Crew Training↗, Familiarisation↗) | Rebuild under `/v/:vc/crew/*`; add Dashboard, Compliance, Medical, Checklists, Appraisals, Visitors, Employment History; drop Crew Roster as a separate item; honour module on/off and "Planner"/"Leave" label | P0 | S |
| C2 | Crew dashboard: KPI tiles Crewing (on board / total), Compliance (compliant / total), Onboarding (open joiners), Documents (expired + expiring), Hours of Rest (open breaches + unsubmitted); "Action required" banner; cards Onboarding (familiarisation per recent joiner), Hours of Rest, Documents & Certificates grouped by person with "Full report" | §5.1.1 | missing | `CrewDashboard.tsx` is a personal "My Dashboard" (tasks, forms, own certs); vessel dashboard (`IndividualVesselDashboard.tsx`) redirects to the generic dashboard | New page reading the compliance, HoR and familiarisation views below; every number deep-links to the filtered list | P1 | M |

### B. Crew list

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C3 | One vessel crew list: search by name, position, crew number; Filters; Sort (Rank default, Name, Join date) asc/desc; counters Total / On board / Ashore / On leave / Pending / On transfer | §5.1.2 | partial | `CrewList.tsx` (all personnel, search, vessel/department/status selects, CSV), `CrewRoster.tsx` (admin table, pagination, Airtable sync, CSV import) | Merge into one page scoped by route vessel; query server-side (view `vessel_crew_list`); rank sort needs `positions.sort_order`; crew number field; counters by derived status; saved filters in URL | P0 | M |
| C4 | Derived crew status per vessel (On board, Ashore, On leave, Pending, On transfer) + On/Off quick toggle + travel icon when a travel movement is today | §5.1.2, §3.4 | partial | `profiles.status` free text ('Active', 'Pending', 'Inactive'…); `crew_assignments.is_current`; `frp_travel_movements` | Status computed from assignment + today's planner period + transfer + In/Out board (see W3); toggle writes a movement and a planner period; never edit a free-text status | P0 | M |
| C5 | Compliance dots per row (documents; STCW/qualifications) green/amber/red with tooltip listing reasons | §5.1.2, §3.4 | missing | — | Read from `crew_compliance_summary` (W5) | P0 | S |
| C6 | Role tag chips on the name (IHM, Safety, SSO, Medical, Garbage, Crew Rep) | §5.1.2, T-147 | missing | — | Uses `vessel_role_assignments` (doc 01 F34) | P1 | S |
| C7 | Invitation column (not invited / invited / accepted / bounced / disabled, last sent) with Invite / Resend | §5.1.2 | partial | `CrewRoster.tsx` account-status badges + invite / reset / toggle-access modals | Read from `user_invitations` (doc 01); show delivery status; inline invite | P1 | S |
| C8 | Row actions: Hours of rest, Transfer, View profile; multi-select with bulk Export / Invite / Crew list report | §5.1.2 | partial | Roster dropdown (edit, transfer, sign off, reset, toggle access, reallocate); checkboxes absent | Three primary icon actions + overflow menu; bulk bar on selection | P0 | S |
| C9 | Movements tab: embark / disembark / transfer events with date, port, source | §5.1.2 | partial | HRIS `RecentMovementsTable.tsx`, `employmentHistory.ts` (`MovementRow` join/leave/transfer from assignments) | Vessel-scoped list from NEW `crew_movements`; filter by date range; export | P1 | S |
| C10 | In / Out Board (shared device at the gangway; crew tap in/out; shows who is ashore) | §5.1.2, §2.3 | missing | — | Kiosk page, PIN or badge tap, NEW `crew_in_out_events`, capability `vessel.crew.in_out_board.edit` (doc 01) | P2 | M |
| C11 | Crew List Report: official crew list (IMO FAL 5), crew list **as at a future date** (T-306), crew biographies (guest-facing) | §5.1.2, §5.1.4, T-306 | partial | `OfficialCrewListDialog.tsx`, `crewListPdf.ts` (FAL 5 PDF + CSV) | "As at date" uses planner periods; include occasional workers in a separate flagged section (T-32); biographies PDF | P1 | M |
| C12 | Positions drawer: positions used on this vessel, rank order (drag), department, default Access Set, manning min/max, "+ New position for this vessel" | §5.1.2, §3.5, T-135 | missing | `RANKS` (20 values, `crew/constants.ts`), free-text `profiles.rank` / `position` / `job_title`, `crew_assignments.position` | Uses doc 01 `positions`; vessel overrides (sort, min/max) in `position_manning`; backfill from distinct strings | P0 | M |
| C13 | Bulk CSV import of crew | not in blueprint (STORM extra) | partial | `ImportCrewCSVModal.tsx` calling `create-crew-member` once per row with honest per-row outcomes (D-180, D-184, D-189); the server-side `parse-crew-csv` is retired (D-191) | Map to positions and departments; create assignments with pending status; keep | P2 | S |

### C. Add crew member

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C14 | Add Crew Member page (sections Basic, Position & Department, Employment, Embarkation, Permissions; field list in W1) | §5.1.3, §3.6 | partial | `CrewFormModal.tsx` (first, last, **email required**, phone, nationality, rank, vessel, position, join date, **system role**, initial password, welcome email) → `create-crew-member` | Email optional (no email = no login); position from catalogue with auto department; status On board / Pending; start date, date joining vessel, review date, contract type, leave method + allowance, place of embarkation; no admin-typed password; duplicate check | P0 | M |
| C15 | Permissions at creation: Access preset / set + other module levels + payroll, saved with the person | §5.1.3, §2.2 | partial | "System Role" select (legacy `app_role`) | Default from the position's Access Set (doc 01); Payroll needs Finance; cascade rule | P0 | S |

### D. Crew profile

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C16 | Profile page with URL, header (name, position, status badge, department chip, crew switcher prev/next), actions Rotation schedule, Import documents, Edit profile; 9 tabs | §5.1.4 | partial | `CrewProfileModal.tsx` (Overview, Certificates, Training, Activity), `FullCrewEditModal.tsx` (Personal, Contact, Employment, Documents); HRIS pages per person | New routed page composing existing components; inline edit per tab with Cancel / Save | P0 | L |
| C17 | Personal tab and edit form: username (personal email), work email, title, first/middle/last, DOB, place of birth, sex, nationality, dual nationality, residency, place of embarkation, height, weight, marital status, has children, mother tongue + 2nd–4th language with proficiency, biography | §5.1.4, §3.4 | partial | `profiles` has first/last/preferred name, DOB, gender, nationality (text), place_of_birth, embarkation_port; `PersonalDetailsForm.tsx` | Add the missing fields (NEW `crew_personal_details`), country/language codes from reference tables, validation in W1 | P0 | M |
| C18 | Onboarding progress (8 checks: photo, signature, personal details, contact, passport, medical/ENG1, STCW basic, employment contract) | §5.1.4, §6.1 | partial | HRIS `onboarding.ts` readiness (contract, documents, NOK, pay, bank, invitation, pre-departure, familiarisation) | One checklist definition shared by profile and dashboard; each item deep-links to the fix | P1 | S |
| C19 | Digital signature on the profile ("Add signature"), used by every sign-off | §5.1.4, §8.1 | missing | `SignaturePad.tsx` exists only inside ISM forms | Store via the signature engine; profile shows status and lets the owner redraw | P0 | S |
| C20 | Contact & NOK tab: address (6 fields + repatriation airport), telephone, mobile; NOK full name, relationship, language, address, telephone, mobile, email | §5.1.4 | partial | `crew_next_of_kin` (full name, relationship, language, address, phones, email, consent, primary/ICE); `profiles.phone`, `emergency_contact_*` | Person address + repatriation airport; phone as dial code + national number (fixes T-68 double "+"); several NOK allowed, one primary | P1 | S |
| C21 | Current Employment card, Vessel Roles card, Biography | §5.1.4 | missing | — | Cards on Personal tab; biography feeds the biographies report | P1 | S |
| C22 | Activity tab (field-level audit of profile, documents, access) | STORM extra | partial | `CrewAuditLog.tsx`, HRIS `ProfileAuditTrail.tsx` | Merge into one tab | P2 | S |

### E. Documents, STCW and qualifications

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C23 | Document-type catalogue (≈210 types in ≈35 categories; name, code/abbreviation, STCW regulation, which profile tab, field schema, default validity, searchable) | §3.7, §5.1.5 | missing | `MARITIME_CERTIFICATE_TYPES` (≈40 strings), `crew_certificates.certificate_type` free text | NEW `crew_document_categories` + `crew_document_types` (system rows + tenant additions); seed; map existing strings | P0 | L |
| C24 | Documents / STCW / Qualifications tabs: groups with counts and "+ Add", legend (Valid, Expiring, Expired, Missing, Alerts off, Not uploaded), "Show empty slots", "Missing required (n)" block, row (status dot, name, number, issuing country, expiry or "No expiry", verification badge, View, Edit, reviewed by/on) | §5.1.4 | partial | `CrewCertificates.tsx`, HRIS `DocumentsPage.tsx` (certificates, attachments, travel documents), `CrewDocuments.tsx` (upload button is "coming soon") | Rebuild on catalogue + requirement engine; tab decided by type (fixes T-185 non-ENG1 medical filed under qualifications) | P0 | M |
| C25 | Add-document dialog: step 1 picker (search by name/code/abbreviation, categories with counts, "Missing for current role" quick-add, "Added" tiles); step 2 type-specific form + file (PDF, JPG, PNG, WebP, HEIC, DOC(X), XLS(X), ≤ 50 MB) with preview | §5.1.5 | partial | `CrewCertificates.tsx` single form with grouped select; `src/lib/storage/crewDocuments.ts` (no size or type check) | Two-step dialog; field schema per type; client and storage-policy size/MIME limits; suggestions for issuing authority from earlier entries (T-170) | P0 | M |
| C26 | Passport specifics: issuing country*, office, number, issue date*, expiry or no expiry, "Use this passport in crew report" (one per person) | §5.1.5, §3.7 | partial | `profiles.passport_number / passport_expiry / passport_country`; `crew_travel_documents` | Passports become documents; a trigger keeps the `profiles` passport columns in sync from the flagged one for back-compat | P0 | S |
| C27 | Verification: Verified / Conditionally approved / Rejected, with note; "Reviewed by <name> on <date>"; any edit to a verified record resets it to Unverified and notifies verifiers (T-139, T-163); applies to every category incl. passport, ENG1, visa, SDB (T-31) | §6.3 | missing | Only `crew_travel_documents.verified` boolean | Fields + RPC + notifications; see W4 | P0 | M |
| C28 | Alerts off per document (who, when, reason), restricted to HoD / officers / admins (T-160) | §3.7, §2.2 | missing | — | Columns + capability (doc 01 `vessel.crew.expiry_alerts.admin`) | P1 | S |
| C29 | Expiry state engine for crew documents (valid, expiring ≤ 90 d, ≤ 30 d, expired, missing, not uploaded, alerts off; endorsement due / overdue where a type has endorsements) | §6.2 | partial | `crew_certificates.status` written once at save; `hr_expiry_items` view; `get_expiring_certificates` | Compute at read in a view; per-type windows from `expiry_window_rules` (doc 02); passports 9 months | P0 | M |
| C30 | Renewal keeps history (old version kept, new becomes current) | STORM extra (blueprint "versioned uploads" for certificates) | missing | Edits overwrite | NEW `crew_document_versions` | P1 | S |
| C31 | Import Documents: bulk upload with AI extraction of type, number, dates; review queue before save | §5.1.4, T-46 | missing | `extract-flight-data` edge function (AI extraction pattern), `DocumentUploadPage.tsx` | New edge function `extract-crew-document`; review table; nothing saved without a human confirm | P2 | L |
| C32 | External crew-document registry sync (notice "not found on registry") | §5.1.4, T-45, T-141, T-222, T-215, T-157, T-145, T-275 | missing | — | Only if adopted (Open questions). Design rules in Improvements #4 | P2 | XL |

### F. Crew compliance

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C33 | Configuration › Required qualifications matrix: rows (requirement groups) × columns (positions on the vessel); tick to require; row shows "N options · held by X" with clear all / require all; equivalents (any option satisfies); "Add qualification"; "Add STCW basic set (all positions)"; "Passenger ship?" toggle adding the STCW V set | §5.1.7, §6.29 | missing | `training_matrix` (vessel × rank → `required_courses` jsonb) has a save hook but no UI; `TrainingMatrixTab.tsx` uses global `is_mandatory` | NEW requirement tables (Data model); editor UI; seeds | P0 | L |
| C34 | Supersession and combined certificates: a higher certificate satisfies a lower requirement (T-53, e.g. SSO covers PDSD); a combined STCW basic certificate satisfies its components (T-159); equivalents must not show "missing" (T-326) | §5.1.7 "equivalents count" | missing | — | NEW `crew_document_type_satisfies`; engine treats satisfiers as options; profile shows "satisfied by <document>" | P1 | M |
| C35 | Current Status: KPIs Total / Compliant / Expiring / Expired / Missing; sub-tabs Overview, Gaps, Documents, STCW, Qualifications, Familiarisation; Show all / on board; group by department / flat; Matrix / Cards; columns Crew, Met x/y, Documents x/y + next expiring, STCW x/y, Qualifications x/y, Familiarisation x/y, Status, Next expiry | §5.1.7 | partial | `TrainingMatrixTab.tsx`, HRIS `right-to-work/ComplianceMatrix.tsx`, `CrewCertificatesOverview.tsx`, `ComplianceOverviewTab.tsx` (charts) | One requirement-driven page over `crew_requirement_status`; retire the three partial matrices (keep chart components) | P0 | L |
| C36 | Familiarisation as a requirement (per position, per vessel) counted in Met | §5.1.7 | missing | — | `familiarization_template_positions`; engine counts completed records | P1 | S |

### G. Hours of rest

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C37 | Daily entry: 24 h timeline drag to mark rest/work, logged periods list, Add rest period, Day / Week toggle, Fill (copy a template day or previous day), "Rest still needed today" | §5.1.4 | partial | `DayTimeline.tsx`, `MonthCalendar.tsx`, `MyWorkRestMonth.tsx`, `upsertDayRecord` | Add Week view, Fill, rest-still-needed; open on month view by default (T-143); keyboard entry | P0 | S |
| C38 | Day states: Not entered, Entered, Submitted, Approved, Leave, Breach, Warning | §5.1.4, §6.14, image11 | partial | Records + `is_compliant`; NCs; no leave, no warning | Leave from the planner; warning (near threshold) and serious breach classes (W6) | P0 | M |
| C39 | Month submission and approval chain with signatures; reopen with reason; lock | §6.14 | partial | `work_rest_monthly_submissions` (draft → submitted → crew_signed → hod_signed → captain_reviewed → locked / reopened), `SignOffPanel.tsx` (roles resolved from legacy role names) | Capability-based actors; HoD step as soft nudge (T-148); approver department scope; call signature engine | P0 | M |
| C40 | Vessel HoR board: month navigation (« ‹ Current month › »), department tabs, chips Ready for you / Waiting on crew / Approved / On leave with counts, legend, "Show all calendars", one card per crew (mini calendar, month status menu, Remind, last-reminded line, "Former crew" badge, "Has left the vessel — submit on their behalf", "On leave all month" collapsed) | §5.1.8, image44 | partial | `WorkRestOverview.tsx` (table: crew, status Compliant / Review / Non-compliant / No data; dead export buttons) | Rebuild as board; membership = anyone assigned to the vessel on any day of the month (fixes T-144) | P0 | M |
| C41 | Reminders: automatic on the 1st for last month not submitted, on the sign-off day, and N days before cutoff; manual Remind with log | §5.1.8, T-286, T-133 | missing | `vessel_work_rest_settings.reminder_days_before_lock` (unused) | NEW `work_rest_reminders`; scheduled job; notification + email | P1 | M |
| C42 | Breach review: deficit column (hours short), non-compliant-only filter, per-breach Accept with justification / Flag for correction, serious breaches escalate at once, consolidated breach report per vessel sent by an authorised person (not auto), "breach reports sent" log | §5.1.8, §6.14, T-142 | partial | `work_rest_non_conformities` (open, reviewed, justified, corrected, accepted_by_captain, dismissed), `NonConformityList.tsx` | Serious flag, deficit, review outcome; NEW `work_rest_breach_reports` | P0 | M |
| C43 | Submit on behalf of a leaver; company sign-off for departed crew recording who and why | §5.1.8, T-142 | missing | — | `submitted_on_behalf_by`, reason; company actor check (doc 01 `is_company_actor`) | P1 | S |
| C44 | HoR Report: KPIs Unreviewed breaches, Serious open, Not submitted, Awaiting approval; By month table (month, crew, days logged, breach days, unreviewed, submission); panels Open breaches, Breach reports sent; Export all months (Excel) | §5.1.8, T-292 | partial | `reports/exports.ts` (per-crew PDF/CSV) | Report page over SQL view `work_rest_month_stats`; XLSX via existing exporter | P0 | M |
| C45 | HoR on per vessel "from <date>"; days before that are not expected | §3.3 module settings, §6.14 | missing | `vessel_work_rest_settings` (rule set, cutoff day, timezone, reminder days) | `vessel_module_settings('crew_hor').enabled_from` (doc 01) read by board, reminders and KPIs | P1 | S |
| C46 | Rule sets (MLC 2006 / STCW A-VIII/1 defaults: 10 h in any 24 h, 77 h in any 7 days, ≤ 2 periods with one ≥ 6 h, ≤ 14 h between rest periods) with exceptions | §6.14 | complete | `work_rest_rule_sets`, `DEFAULT_RULE_SET`, `complianceEngine.ts` | Add warning margin and serious thresholds (< 4 h in 24 h, < 50 h in 7 days, configurable) | P2 | S |

### H. Planner, leave, rotation and manning

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C47 | Timeline: Year / Month zoom, department filter, legend, collapsible Vessel Movements lane, Manning Gaps rows per position ("Captain needs 1 on board −1"), bar labels type + duration in weeks + days | §5.1.6, T-27 | partial | `RotationPlannerPage.tsx`, `PlannerGrid.tsx`, `LocationLane.tsx` (vessel locations), `Toolbar.tsx` (six zoom levels, undo/redo, copy/paste, import/export), `conflicts.ts` (overlaps) | Manning gaps rows; vessel movements from voyages when the voyage module lands (keep `frp_vessel_locations` meanwhile); "5w 6d" duration format; weekend shading; remembered zoom | P0 | M |
| C48 | Manning grid: one grid per department, a row per crew member, a column per day, leave-type colours, "On board" total row coloured Critical / At minimum / Normal / Overmanned, "qualified / aboard" row per position; Today; Refresh | §5.1.6 | partial | `LeavePlannerPage.tsx` (month grid of day codes per crew, department filter, lock month, bulk paint, counts) | Totals vs `position_manning`; qualified count uses the compliance engine (T-20); read from periods (W7) | P0 | M |
| C49 | Configuration › Position manning: "Required on board" per position grouped by department; optional maximum; positions with nobody aboard listed separately | §5.1.6, §3.21 | missing | `vessels.minimum_safe_manning` jsonb (unused); alert type `safe_manning` in `alerts/constants.ts` (no producer) | NEW `position_manning`; seed from the safe-manning document; feeds hiring needs (doc 02) | P0 | S |
| C50 | Add Leave dialog: crew member, one or more periods (type, start, end or "End unknown"), note; each period its own bar (T-71) | §5.1.6, T-71 | partial | `LeaveRequestsPage.tsx` (single period request), planner "New" block | Multi-period dialog; admin-added leave can be pre-approved (Open question 3) | P0 | S |
| C51 | Leave types: Rotation, Holiday (annual), Medical / Sick, Sick on board, Emergency, Crew development / Training, Paid parental, Compassionate, Unpaid, Travel, Neutral, PBQ, Other; Pending as a status, not a type | §5.1.6, §3.21, T-71 | partial | `LEAVE_STATUS_CODES` (F, Q, L, T, CD, M, PPL, CL, N, U, R) | Add Emergency, Sick on board, Other; one mapping table (W7) so dialog and legend agree (the reference's do not) | P1 | S |
| C52 | Leave approval: Pending → Approved / Declined / Cancelled; HoD step then final approver; balance check | §6.15 | partial | `crew_leave_requests` (+ `hod_reviewed_*`), `LeaveRequestsPage.tsx` approve / decline / cancel with audit, writes day codes | Approval creates a planner period (not day codes directly); department-scoped HoD; notifications | P1 | S |
| C53 | Build rotation: Person A (on board first), Person B (relief), pattern 2:2 / 3:3 / 6:6 / custom stint (weeks or months, default 2), anchor (default today), plan until (default +1 year), handover overlap days (default 0); replaces rotation leave for both in range | §5.1.6, §6.15 | missing | — | Generator + preview diff + undo (W7) | P1 | M |
| C54 | External rotation spreadsheet: import with column mapping, unmatched-names resolution, sync status banner | §5.1.6, T-316, T-228 | partial | `xlsxImporter.ts`, `ImportDialog.tsx`, `crew_name_raw` on assignments | Make STORM the source of truth; import is a reviewed one-shot; optional scheduled pull with schema check and clear error (see Improvements #9) | P2 | M |
| C55 | Leave allowance: days per year (default 30, hint "2.50 days/month") or ratio; accrual and balance | §5.1.3, §3.6 | complete | `crew_leave_policies`, `leaveCalculator.ts` (+ tests), `LeaveCalculatorPage.tsx`, `profiles.annual_leave_entitlement`, `leave_accrual_method` | Wire to Add Crew and to the assignment; show balance on profile | P1 | S |
| C56 | Leave can be switched off per vessel / account (hide leave UI, reports, calendar events, notifications) | §3.3, T-10 | missing | — | `vessel_module_settings('planner').settings.leave_enabled` (doc 01) | P2 | S |

### I. Employment, transfers and history

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C57 | Employment tab: timeline, current record, Edit, End employment; sub-tabs Details, Transfers, Appraisals, Familiarisation; fields position, department, contract type, vessel, probation period, notice during probation, notice after probation, start, end, notes | §5.1.4, §3.6 | partial | `crew_contracts` (type, position, rank, department, vessel, start/end, probation_end_date, notice_period_days, status lifecycle, signed document), HRIS `ContractCard`, `history/Timeline.tsx`, `SignOffDialog.tsx` (reasons) | Two notice periods; probation length; review date; date joining vessel; sub-tabs in the vessel profile; gated by employment capability | P0 | M |
| C58 | Controlled transfer between vessels: same or new position; receiving-vessel compliance re-check; pre-transfer review of open medical cases, restrictions, recent appraisals, HoR breaches / fatigue, incomplete familiarisation / training; approval; notification to fleet HR / DPA; audit record | §5.1.2, T-39, T-121, T-96, T-133 | partial | `TransferCrewModal.tsx` (vessel, position, date, notes) → `useCrew.transferCrew` closes and opens assignments; `admin-actions` `reallocate_vessel` (capability-checked, audited); the legacy `update-crew-assignment` reassign is retired (D-191) | Wizard + RPC `transfer_crew`, NEW `crew_transfers` (W9) | P0 | M |
| C59 | Employment History page: counters past crew / records; department filter; columns crew, position, department, period, duration, reason, actions View / Re-hire | §5.1.12 | partial | HRIS `EmploymentHistoryPage.tsx` (one person at a time), `AssignmentsTable.tsx` (end reasons) | Vessel-level list of ended assignments; Re-hire prefilled (W8) | P1 | S |

### J. Medical

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C60 | Profile Medical tab: blood group, allergies, medication, pre-existing conditions; medical reports list with "Raise a new case" link; vaccinations table (vaccine, date given, expiry, booster, status) | §5.1.4, §3.7 | partial | Health module per-person pages: `med_patient_records` (blood group…), `med_allergies`, `med_conditions`, `med_medications`, `med_vaccinations`, `med_consultations`; `hw_people.profile_id` link | Read-only summary tab in the crew profile with edit deep-links to Health; standard vaccine list (17) with boosters; medical-capability gate | P0 | M |
| C61 | Vessel Crew Medical grid (ENG1, vaccinations, boosters, rest 30 d, occupational health, status Critical / At risk / Incomplete / OK, reasons, CSV) | §5.1.13 | missing | Data in `med_*`, `work_rest_*` | Same component as doc 02 M1, vessel-filtered; rules doc 02 W8 | P0 | S |

### K. Training, familiarisation, checklists, appraisals

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C62 | Crew Training (vessel): register of crew × course × dates × cost × status (Planned with target month); "Manage courses" → fleet catalogue; profile Training tab with a training plan and "See courses" | §5.1.13, §5.1.4, §3.21 | partial | `development/pages/CrewTraining.tsx` (fleet-wide `development_applications`, vessel filter by name, phases) | Vessel filter by route; NEW `crew_training_plan_items` (from appraisal plans and requirement gaps); profile tab | P1 | M |
| C63 | Familiarisation: templates (code like `DRFC001`, name, description, completed / missing counts, New); records Open → Completed with signatures; Recent forms; View all; vessel-specific variants (T-134); fleet-wide 24-hour and 2-week forms (T-15); required per position | §5.1.9, §6.1, T-15, T-134 | partial | `familiarization_templates` (sections jsonb, applicable_ranks), `familiarization_records`, `familiarization_checklist_items`, `FamiliarizationTab.tsx`, `update-familiarization` | **Bug:** starting a record ignores the chosen template and always copies `DEFAULT_FAMILIARIZATION_SECTIONS`. Add codes, descriptions, crew + supervisor signatures, due dates, position requirements, counts | P0 | M |
| C64 | Crew checklists: Manage (capability), Templates, History, Recent | §5.1.10 | partial | Forms engine (`form_templates`, `/ism/checklists`) | Vessel page filtered to area "crew" (doc 02 forms) | P2 | S |
| C65 | Appraisals list (filters status, department; New; columns crew, position, department, type, review period, status, rating, last updated) and New Appraisal (crew*, type*, period start*/end*) | §5.1.10 | partial | `performance_reviews`, `performance_review_cycles`, HRIS `ReviewsPage.tsx` (`/hris/performance/*`), `reviews.ts` | Vessel-scoped list and route; type "End of contract"; department scope for HoD | P1 | S |
| C66 | Appraisal detail: 14 criteria in 3 groups with Self and Appraiser scores (1 Fails … 5 Far exceeds); text sections (crew comments, objectives, appraiser comments, training & development plan); recommendations (fit for promotion, fit for re-engagement, general); attachments; progress sidebar; ordered signatures (appraiser, then crew) | §5.1.10, §6.25, image35 | partial | `ratings` / `self_ratings` jsonb, 8 seeded competencies, `strengths`, `development_areas`, `training_needs`, `reviewer_comments`, `employee_comments`, `recommend_promotion`, `retain`, `reviewer_signed_at`, `employee_acknowledged_at`, `reviewPdf.ts` | Seed the 14-criterion framework with groups; objectives and plan fields; tri-state recommendations; real signatures; plan items flow to C62 | P1 | S |

### L. Visitors and occasional workers

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C67 | Visitors & Occasional Workers page: guidance text; Add myself; Add visitor or occasional worker; tabs Today, Current, Onboard, Disembarked, All; columns Status, Name, Category / function, Company, Embarkation, Disembarkation, Declaration, Readiness | §5.1.11 | missing | `hw_people` (`person_type = visitor`) serves the medic only | Page over `visitor_people` / `vessel_visits` (doc 02 V1–V2) | P1 | M |
| C68 | Add flow: step 1 search existing people (admins, shore staff, earlier visitors) or create; step 2 visit details; person fields full name*, category* (11, default Other), company, category (other), nationality, passport number / issuing country / issue / expiry, phone (dial code + number), email, notes, available to the fleet | §5.1.11 | missing | — | Two-step dialog; visit-details fields defined in W10 | P1 | M |
| C69 | Occasional workers on the onboard list, crew list export and POB headcount, clearly labelled, with "no emergency duties assigned"; excluded from compliance matrix, crew medical, HoR, SEA and manning; declaration / familiarisation form linked to the visit | §5.1.11, T-32, T-13 | missing | — | Flags in exports and views; readiness uses the form | P1 | S |

### M. Reference data (Appendices A–C)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C70 | Positions (248 in the reference list), departments (8 + Dive, Medical seen on HoR tabs) | App. A, §3.4 | partial | `RANKS` (20), six different department lists (`crew/leaveConstants.ts`, `auth/lib/permissions.ts`, `development/constants.ts`, `audits/constants.ts`, `logbooks/lib/catalog.ts`, `users-access/lib/capabilityCatalog.ts`) | Seed `positions` and `departments` (doc 01); our own list derived from industry usage, not a verbatim copy; one import everywhere | P0 | S |
| C71 | Countries (≈219) with demonym (nationality), ISO codes, dial code and flag; languages (53) with proficiency scale Basic / Conversational / Advanced / Fluent | App. B, App. C | partial | `NATIONALITIES` (short list in `crew/constants.ts`); no country or language list | NEW global reference tables `ref_countries`, `ref_languages` (ISO 3166 / ISO 639) seeded by migration | P0 | S |

---

## Workflows & state machines

All transitions are executed by SECURITY DEFINER RPCs that check `has_capability` and write an audit row; the UI never updates status columns directly.

### W1. Onboarding a crew member (§6.1, §5.1.3)

**Add Crew Member** (`/v/:vc/crew/new`). Field rules:

| Section | Field | Rule |
|---|---|---|
| Basic | First name*, Last name* | 1–50 chars, trimmed |
| | Email | Optional. Valid format; unique per account; rejected if it belongs to another account's active user. Help text: without an email the person cannot sign in or receive invitations |
| Position & Department | Position* | From `positions` for this vessel (account-wide + vessel-specific); "+ New position for this vessel" opens an inline create (name, department, rank tier) |
| | Department* | Defaults from the position; editable |
| | Status* | On board (default) / Pending (joining later) |
| Employment | Start date* | Contract / agreement start |
| | Date joining vessel | Only when the person steps aboard after the start date; must be ≥ start date |
| | Review date | Optional; ≥ start date; creates a calendar reminder and a probation/annual appraisal suggestion |
| | Contract type | Permanent / Rotational / Temporary plus tenant-defined types (T-52) |
| | Leave allowance | Method: Days per year (default 30, shows "= x.xx days/month") / Ratio (e.g. 1:1 on:off) / None |
| Embarkation | Place of embarkation | Port picker with free text; defaults to the vessel's home port |
| Permissions | Access set / preset | Defaults to the position's default Access Set (doc 01); other module levels; Payroll only if Finance ≥ Read |

Duplicate check before save: same email in the account, or same first + last name + date of birth when DOB is later entered (profile edit warns). On save, one RPC `create_crew_member` (replacing the `create-crew-member` edge function's direct inserts) creates: `profiles` row (no auth user unless invited), `crew_personal_details`, `crew_assignments` (status `pending` or `active`), a draft `crew_contracts` row, the access assignment (doc 01), a planner period "On board" from the joining date (status On board) and, if email is present and "Send invite now" is ticked, an invitation. It also starts the familiarisation records required for the position on this vessel (W11) and the onboarding checklist.

**Onboarding progress** (profile Personal tab and dashboard "Onboarding" card): 8 checks, each a link: photo, signature, personal details (title, DOB, nationality, place of birth complete), contact (address + one phone + one NOK), passport (valid document flagged for crew report), medical (valid ENG1 or accepted equivalent), STCW basic (all four VI/1 elements satisfied), employment contract (active `crew_contracts`). Percentage = passed / 8. A joiner leaves the "Onboarding" KPI when all 8 pass and required familiarisations are completed.

**Assignment status** (`crew_assignments.status`): `pending` → `active` (joining date reached or manual "Mark joined") → `ended` (end employment or transfer out). `pending` assignments count in "Pending", not in crewing.

### W2. Crew status on the vessel (derived, §5.1.2)

Computed per person per vessel per day, in this order (first match wins):

| Status | Condition |
|---|---|
| On transfer | A `crew_transfers` row is `approved` and today is between the from-vessel sign-off and to-vessel sign-on |
| Pending | Assignment `pending` |
| On leave | Today's confirmed planner period is a leave type (any except On board, Sick on board, Travel-to-join) |
| Ashore | On board by planner, and the latest In/Out board event today is "out" |
| On board | Assignment active, and today's period is On board / Sick on board, or there is no period at all |

The **On/Off toggle** in the list: Off → opens a mini dialog (leave type default Rotation, start today, end date or End unknown) and writes a planner period; On → ends the current leave period yesterday and writes an embark `crew_movements` row. Travel icon shows when a `frp_travel_movements` row is dated today.

### W3. Document lifecycle and expiry (§6.2, image47)

States (computed in view `crew_document_status`, never stored):

| State | Rule |
|---|---|
| Not uploaded | Record exists (metadata) but no file |
| Valid | Expiry is null with "No expiry" ticked, or expiry > today + warn window |
| Expiring | today ≤ expiry ≤ today + warn window (per type: passports 270 d, others 90 d by default, from `expiry_window_rules`); the 30-day sub-bucket is shown in red-amber, and the expiry day itself is in it with 0 days left (DECISIONS D-31) |
| Expired | expiry < today: a document is valid through its expiry date (DECISIONS D-31) |
| Endorsement due / overdue | Types with an endorsement interval (e.g. flag endorsements, some CoCs): due when inside the window before `endorsement_due_date`; overdue after |
| Alerts off | Muted by an authorised user; still shows its real state in a tooltip and in audits, but raises no alert and is excluded from KPI counts |
| Missing | Computed per requirement, not per document: required for the role and no satisfying valid document |

**Missing expiry date** (DECISIONS D-31): the shared expiry engine reads a null expiry as "no expiry". Crew-document and passport callers therefore pass `noExpiry` from the "No expiry" tick, and treat a date that is missing without the tick as missing data: `<ExpiryPill>` gets `undefined` ("Expiry unknown") and the document is flagged as incomplete upstream, never shown as Valid.

Transitions: renew (upload a new version: old version kept, state recomputed) → Valid; delete (only the uploader within 24 h, or anyone with crew document edit; soft delete, kept in versions); mute / unmute (reason required).

**Expiry notifications** (STORM definition; the reference's is not captured): daily job; first notice when entering the warn window, again at 30 d, 7 d and on expiry; recipients the crew member, their HoD and users with crew document approve on that vessel; one digest per recipient per day; nothing for muted documents or for people whose assignment ended.

### W4. Document verification (§6.3, image14, T-31, T-139, T-163)

| State | Who can set | Notes |
|---|---|---|
| Unverified | System on upload and on any edit of a verified document's number, dates, issuing country, type or file | Edit by the owner of a verified document shows a warning first ("this will need re-verification") |
| Verified | Users with `vessel.crew.crew_documents.approve` on the vessel (HoD for own department, Captain, Purser, fleet HR) | Cannot verify own documents |
| Conditionally approved | Same | Note required (what condition, until when) |
| Rejected | Same | Note required; owner notified with the note; does not satisfy any requirement |

Every change writes reviewer + timestamp + note ("Reviewed by <name> on <date>" on the row). Notifications: on upload or edit → in-app + email digest to verifiers for that vessel and department, deduplicated; on decision → owner. Report filters in documents reports include Rejected and Conditionally approved (T-248). Conditionally approved satisfies requirements but shows amber in the matrix.

### W5. Crew compliance computation (§5.1.7, §6.29)

1. **Configuration** (admins and Full Access): requirement **rows** per vessel, each in a group (STCW VI basic, survival craft, advanced training, medical, security, STCW V passenger, CoC/GMDSS, deck and engineering certificates, navigation and safety, documents, familiarisation, custom). Each row has one or more **options** (document types; any one satisfies) and ticked **positions**. Bulk actions: "Add STCW basic set (all positions)" creates the four VI/1 rows (PST, FPFF, EFA, PSSR) ticked for every position; "Passenger ship?" toggles the vessel flag and adds / removes the STCW V rows (crowd management, crisis management and human behaviour, passenger safety) for all positions; row "require all" / "clear all".
2. **Satisfaction** for (person, row): the person holds a non-rejected document whose type is an option, or a type that `satisfies` an option (supersedes or combined), and that document is not expired. Best document = latest expiry. Row state = met / expiring / expired (only expired satisfiers) / missing.
3. **Familiarisation rows** are satisfied by a completed familiarisation record of the template on this vessel.
4. **Per-person summary**: Met = met rows / required rows; Documents, STCW, Qualifications, Familiarisation = same ratio per tab; Status = "Complete" if all met and none expiring; else the worst of Expired documents > Missing > Expiring; Next expiry = earliest expiry among satisfiers. KPIs count people by status. Compliance dots: documents dot from the Documents tab rows, second dot from STCW + Qualifications.
5. Changes to configuration recompute immediately (the views are live); the profile "Missing for role" block and the add-document "Missing for current role" quick-add read the same view. Occasional workers and visitors are never evaluated.

### W6. Hours of rest (§6.14, image11, T-142, T-143, T-148, T-286)

**Day state** (per person per date, computed): Leave (a planner leave period covers the day; entry optional) → Not entered → Entered (has blocks) → Submitted / Approved (from the month) ; overlays Breach (any non-conformity whose window ends that day) and Warning (rest within the warning margin of a threshold, default 1 h for 24 h and 3 h for 7 days). Days before the vessel's HoR start date or outside the person's assignment are greyed and not expected.

**Month submission** (`work_rest_monthly_submissions.status`):

| From | Action | To | Who |
|---|---|---|---|
| draft (Open) | Submit + sign ("I confirm these records are accurate") | submitted | The crew member; or an approver "on behalf" for a person who has left the vessel, with reason |
| submitted | HoD review + sign (optional step; a nudge reminds the HoD before the Captain approves, T-148) | hod_signed | HoD of the person's department |
| submitted / hod_signed | Approve + sign | captain_reviewed (Approved) | Users with HoR final approve (Captain or delegate) |
| captain_reviewed | Lock (automatic on cutoff day + N, or manual) | locked | Approver / system |
| any but draft | Reopen with reason | reopened → behaves as draft | Approver; reason mandatory; signatures kept as history and marked stale |

Breaches must all be reviewed before Approve is enabled; unreviewed breaches block approval (warning, not error, for "low").

**Breach review** (`work_rest_non_conformities`): open → reviewed with outcome `accepted` (justification required: e.g. emergency, drill, safety of ship) or `correction_requested` (record reopened for the crew member) or `dismissed` (data error, after correction). Serious = < 4 h rest in any 24 h or < 50 h in any 7 days (configurable on the rule set); serious breaches notify the Captain and fleet HR immediately. **Breach report**: the approver selects reviewed breaches for a period and sends one consolidated report per vessel (PDF + list) to the configured recipients (fleet HR / DPA); STORM never sends it automatically (T-142); each report is logged and the breaches flagged "reported".

**Reminders**: automatic (1st of month for any person with last month not submitted; on the person's sign-off day for the current month; N days before cutoff), and manual "Remind" (per card or bulk) with log "Reminded <date> by <role>". Rate limit one manual reminder per person per day.

**Computed values**: rest still needed today = max(0, 10 h − rest logged in the 24 h ending at end of today, and also the shortfall to 77 h over the last 7 days); deficit per breach = threshold − measured.

**Transfers and leavers**: unsubmitted months stay on the origin vessel's board with a "Former crew" badge and "submit on their behalf" until approved (T-133).

### W7. Planner, leave and rotation (§6.15, image12, T-71, T-20)

**One period store**: `frp_rotation_assignments` holds bars (person, vessel, type, start, end or end-unknown, status). A trigger materialises **confirmed** periods into `crew_leave_entries` day codes so the leave calculator, `hr_days_onboard` and payroll keep working unchanged.

Type mapping (dialog = legend; STORM code):

| Planner type | Day code | Balance effect |
|---|---|---|
| On board | F | accrues |
| Sick on board | F (+ flag) | accrues |
| Rotation leave | R | neutral (rotational contracts) / per policy |
| Holiday (annual leave) | L | deducts |
| Medical / Sick | M | per `sick_affects_balance` |
| Emergency | E (new) | per policy |
| Crew development / Training | CD | per `training_affects_balance` |
| Paid parental | PPL | neutral |
| Compassionate | CL | neutral |
| Unpaid | U | per `unpaid_affects_balance` |
| Travel | T | neutral |
| Neutral | N | neutral |
| PBQ (pre-boarding quarantine) | Q | accrues |
| Other | O (new) | neutral |

**Leave request** (crew self-service or admin): Pending → Approved (creates confirmed periods) / Declined (reason) / Cancelled (by requester while pending, or by approver after approval: confirmed periods removed and day codes reversed). HoD step optional per vessel. Admin "Add Leave" can be saved as approved directly if the actor holds leave approve (Open question 3). Overlap with an existing confirmed period is blocked unless "replace" is chosen.

**Build rotation**: inputs A, B, pattern, stint length + unit, anchor, plan until, overlap days. Generation: starting at anchor, alternate stints; A on board / B rotation leave in the first stint, swapped next; the incoming person's On board bar starts `overlap` days before the swap. Preview shows bars to be added and **rotation-leave bars to be replaced** for both people in the range; other leave types are never touched; conflicts listed. Apply in one transaction stores a `rotation_plans` row and tags generated periods with its id so "Remove this rotation" is one click.

**Manning check** (function `vessel_manning_by_day(vessel, from, to)`): for each day and position, aboard = people with an On board / Sick on board period (or active assignment without a period); qualified = aboard who are compliant for that position (W5). Band: Critical if qualified < min; At minimum if = min; Overmanned if aboard > max (when max set); else Normal. Timeline "Manning gaps" rows list Critical spans per position; each Critical span ≥ 1 day in the next 120 days emits a hiring-need suggestion (doc 02, source `manning_minimum`).

### W8. Employment end and re-hire (§6.15, §5.1.12)

End employment (employment capability): end date*, reason* (Contract end, Resignation, Dismissal, Medical, End of temporary contract, Transfer to another employer, Retirement, Other + text), notes. Effects in one RPC: assignment `ended`, active contract `terminated` (or `expired`), access assignment ended, designated vessel roles ended, planner periods after the end date deleted, final HoR month flagged for submission, clawback evaluation triggered (doc 02), notification to fleet HR. The person keeps documents and history. **Re-hire** from Employment History: opens Add Crew prefilled (person, last position, department, contract type), creates a new assignment and contract; documents and history carry over; access set re-applied from the position.

### W9. Controlled transfer (T-39, T-121, T-96)

| State | Meaning | Who |
|---|---|---|
| Draft | Wizard started: to-vessel, same or new position (picker), effective date (sign-off origin), sign-on date at destination | Users with `vessel.crew.crew_assignments.assign` on the origin vessel (Captain, Purser, Chief Officer, Chief Engineer per T-96) |
| Review | System shows: receiving-vessel requirement gaps for the new position; open medical cases and restrictions; last appraisal; HoR breaches in the last 30 days and whether the person joins directly from another vessel (no rest gap); open familiarisation / training. Each item must be acknowledged (tick + optional note); none blocks by default | Same |
| Pending approval | Only if the account setting requires fleet approval for transfers | Fleet HR / owner / admin |
| Scheduled | Approved; status "On transfer" between dates | System |
| Completed | Origin assignment ended (reason transfer), destination assignment active, planner periods moved, designated roles ended, required familiarisation records opened on destination, access assignment for destination from the position's default set | System on sign-on date |
| Cancelled | Before completion | Initiator or approver |

Notification on submit and completion to fleet HR / DPA (T-96). The `crew_transfers` record stores every field T-39 lists (origin, destination, dates, positions, same/new role, approver, gaps found, items reviewed, date compliant on destination — set when W5 first shows the person compliant there).

### W10. Visit (vessel side of doc 02 W6; §5.1.11, T-32, T-13)

Visit states Planned → Onboard → Disembarked, or Cancelled; classification Pending review → Occasional worker / Passenger / Supernumerary. **Visit details step** (STORM definition, the reference's was not captured): purpose / function*, expected embarkation date* (+ time, port), expected disembarkation date, berth / cabin, host crew member, classification, "No emergency duties assigned" confirmation (required for Occasional worker), declaration form (linked familiarisation template "Occasional worker declaration"), notes. **Readiness** = passport on file and valid through disembarkation + declaration completed + classification decided; shown as a checklist chip. Embark / disembark actions record actual times (and feed POB). A person can be Onboard on only one vessel at a time (T-39). "Add myself" pre-selects the signed-in admin / shore person. Delete only Planned visits; others are cancelled.

### W11. Familiarisation (§5.1.9, §6.1, T-15, T-134)

Template (fleet or vessel; code `<vessel short code>FC<nnn>` e.g. `DRFC001`, name, description, sections and items, due within N days of joining, positions it is required for, signatures required: crew + supervisor). Record: Open (created automatically on joining / transfer for required templates, or manually "New") → In progress (first item ticked) → Awaiting signatures (all items done) → Completed (crew member and supervisor/HoD signed via the signature engine) ; Overdue is a computed flag (past due and not completed). Re-open by HoD with reason. Delete: only Open records with no ticked items. Counts per template: completed, missing (required and not completed for current crew).

### W12. Appraisal (§6.25, image35)

Mapped onto `performance_reviews.status`:

| Reference step | STORM status | Who acts | Notifications |
|---|---|---|---|
| New Appraisal | `self_assessment` (skips `draft` when the crew member has a login) or `draft` (no login: appraiser fills both sides or uploads a paper self-assessment) | Appraiser with conduct appraisals in scope | Crew member: "Self-assessment requested", due date |
| Self-assessment submitted | `in_review` | Crew member (own scores, comments) | Appraiser |
| Appraiser scores and signs when sending | `awaiting_acknowledgement` | Appraiser (all 14 appraiser scores required, comments, objectives, plan, recommendations) | Crew member |
| Crew signs the finished appraisal | `completed` | Crew member (may add comments; cannot change scores) | Appraiser, HoD, fleet HR |
| Started by mistake | delete (only in `draft` / `self_assessment` with no scores) | Creator | — |

Overall rating = mean of appraiser scores (one decimal; existing `computeOverallRating`). Self vs appraiser delta highlighted. HoD scope = own department unless a department scope is set (doc 01). Training & development plan items create `crew_training_plan_items` on completion.

---

## Data model

Additive changes only. New tables key people on `profiles.id` (`profile_id`), not `user_id`. All tables carry `company_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, RLS by company and vessel reach (doc 01 `user_vessel_reach`) plus capability checks.

| Entity | Key fields | Existing STORM table(s) or NEW | Notes |
|---|---|---|---|
| Crew person (core) | first, last, email (login), avatar, status, crew_number | `profiles` | Add `crew_number` (unique per company, format open question). Stop writing free-text `status` for crew; keep for back-compat |
| Crew personal details | profile_id (PK), title (Mr, Mrs, Ms, Miss, Dr, Capt, Mx), middle_name, work_email, sex (male / female / other / undisclosed), date_of_birth, place_of_birth, nationality_code, dual_nationality_code, residency_country_code, place_of_embarkation, height_cm (100–250), weight_kg (30–250), marital_status (single, married, living with partner, divorced, widowed, separated, domestic partnership, undisclosed), has_children (yes / no / undisclosed), biography (≤ 2,000 chars), address_line1, address_line2, city, region, postal_code, country_code, repatriation_airport (IATA, 3 letters), phone_dial_code, phone_number, mobile_dial_code, mobile_number | NEW `crew_personal_details` | Separate table so the widened field set does not extend the `profiles` read leak (doc 01 F32). Back-fill DOB, place of birth, nationality, phone from `profiles` |
| Crew language | profile_id, slot (1 = mother tongue … 4), language_code, proficiency (basic / conversational / advanced / fluent; null for slot 1) | NEW `crew_languages` | Unique (profile_id, slot) and (profile_id, language_code) |
| Next of kin | full_name, relationship, language, address, phones, email, is_primary | `crew_next_of_kin` | Add `phone_dial_code`, `mobile_dial_code`, `country_code`; store national number without "+" (T-68) |
| Position / department | — | `positions`, `departments` (doc 01) | Add `positions.sort_order` (rank order) and `stcw_capacity` (optional) |
| Vessel assignment (employment on a vessel) | profile_id, vessel_id, position_id, department_key, status (pending / active / ended), start_date, date_joining_vessel, review_date, contract_type_key, leave_method (days_per_year / ratio / none), leave_days_per_year, leave_ratio_on, leave_ratio_off, place_of_embarkation, end_date, end_reason, end_notes | `crew_assignments` (+ columns; add `profile_id`, backfill from `user_id`) | `is_current` becomes derived (`status = 'active'`) |
| Contract / employment record | contract_type, probation_months, probation_end_date, notice_during_probation_days, notice_after_probation_days, start, end, notes, employing company | `crew_contracts` (+ `probation_months`, two notice columns) | `notice_period_days` → `notice_after_probation_days` |
| Contract type | key, label, is_system, company_id | NEW `contract_types` | Seeds Permanent, Rotational, Temporary; tenant can add (T-52) |
| Crew movement | profile_id, vessel_id, kind (embark / disembark / transfer_out / transfer_in), occurred_at, port, source (manual / planner / transfer / toggle), notes | NEW `crew_movements` | Movements tab, FAL lists, calendar events |
| In / Out event | profile_id, vessel_id, direction (in / out), occurred_at, device_label, recorded_by | NEW `crew_in_out_events` | P2 |
| Transfer | from_vessel_id, to_vessel_id, profile_id, from_position_id, to_position_id, same_role, sign_off_date, sign_on_date, status, review_items jsonb (item, acknowledged_by, note), gaps_snapshot jsonb, approved_by, approved_at, compliant_on_destination_at, cancelled_reason | NEW `crew_transfers` | W9 |
| Designated vessel role | — | `vessel_role_assignments` (doc 01) | Role chips, Vessel Roles card |
| Document category | key, label, tab (documents / stcw / qualifications), sort_order | NEW `crew_document_categories` | ≈35 categories incl. passports, seaman's books, medical certificates, visas & permits, licences, merchant and yacht CoCs, GMDSS, flag endorsements, STCW VI/1–VI/6 and V, DP, diving tiers, culinary, other |
| Document type | company_id (null = system), category_key, name, code / abbreviation, stcw_reference, field_schema jsonb (which optional fields show: issuing office, endorsement date, capacity, limitations, visa type / entries), default_validity_months, endorsement_interval_months, is_identity (passport-like), is_active | NEW `crew_document_types` | Seed ≈210 system types; tenant types need admin; searchable by name, code, abbreviation |
| Satisfaction rule | type_id, satisfies_type_id, kind (supersedes / component / equivalent) | NEW `crew_document_type_satisfies` | T-53, T-159, T-326 |
| Crew document | profile_id, document_type_id, file path / name / size / mime, issuing_country_code, issuing_office, number, issue_date, no_expiry, expiry_date, endorsement_due_date, use_in_crew_report (partial unique per profile where true), verification_status (unverified / verified / conditionally_approved / rejected), verified_by, verified_at, verification_note, alerts_muted, muted_by, muted_at, muted_reason, notes, source (manual / import / registry), external_ref, deleted_at | `crew_certificates` (+ all these columns; add `profile_id`; keep `certificate_type` / `certificate_name` as legacy, back-filled into `document_type_id` via a mapping table) | `status` column ignored; state from view `crew_document_status`. Check: expiry ≥ issue; `no_expiry` ⇒ expiry null. Passport data moves here; trigger mirrors the crew-report passport into `profiles.passport_*` |
| Document version | crew_document_id, version_no, file path, number, issue_date, expiry_date, replaced_at, replaced_by | NEW `crew_document_versions` | Written on renew or file replace |
| Document state | per document: state, days_to_expiry, bucket | NEW view `crew_document_status` | Uses `expiry_window_rules` (doc 02) |
| Requirement row | vessel_id, group_key, label, sort_order, kind (document / familiarisation) | NEW `crew_requirement_rows` | |
| Requirement option | row_id, document_type_id or familiarization_template_id | NEW `crew_requirement_options` | Any option satisfies |
| Requirement position | row_id, position_id | NEW `crew_requirement_positions` | Ticked cells |
| Vessel crew settings | is_passenger_ship | `vessels.is_passenger_ship` (new column) or `vessel_module_settings('crew').settings` | Toggle in Compliance › Configuration |
| Requirement status | profile_id, vessel_id, row_id, state (met / expiring / expired / missing), satisfying_document_id, next_expiry | NEW view `crew_requirement_status` | Active and pending assignments only |
| Compliance summary | profile_id, vessel_id, met, required, docs_met/req, stcw_met/req, quals_met/req, fam_met/req, status, next_expiry, dot_documents, dot_qualifications | NEW view `crew_compliance_summary` | List dots, KPIs, dashboard, fleet report |
| Hours-of-rest day / blocks | — | `work_rest_records`, `work_rest_blocks` | Unchanged |
| Hours-of-rest month | + submitted_on_behalf_by, on_behalf_reason, approved_by, company_signed_by, company_sign_reason | `work_rest_monthly_submissions` | Signatures stay in `work_rest_signatures` via the signature engine |
| Non-conformity | + is_serious, deficit_hours, review_outcome (accepted / correction_requested / dismissed), review_note, breach_report_id | `work_rest_non_conformities` | |
| HoR settings | + warning_margin_24h_h (1), warning_margin_7d_h (3), serious_24h_h (4), serious_7d_h (50), auto_reminders bool, hod_step (off / nudge / required) | `vessel_work_rest_settings` / `work_rest_rule_sets` | Start date from `vessel_module_settings` |
| HoR reminder | profile_id, vessel_id, period, kind (auto_month_start / sign_off / pre_cutoff / manual), sent_by, sent_at, channel | NEW `work_rest_reminders` | |
| Breach report | vessel_id, period_from, period_to, nc_ids uuid[], recipients, file_path, sent_by, sent_at | NEW `work_rest_breach_reports` | |
| HoR month stats | vessel, month, crew, days_logged, breach_days, unreviewed, serious_open, submission counts | NEW view `work_rest_month_stats` | HoR report, fleet report |
| Planner period | + leave_type_key, end_unknown, request_id, rotation_plan_id, approved_by, approved_at, profile_id | `frp_rotation_assignments` | Canonical period store; trigger to `crew_leave_entries` for confirmed |
| Day ledger | — | `crew_leave_entries` | Derived for confirmed periods; manual day painting in Manning grid writes periods, not codes |
| Leave type | key, label, day_code, colour, balance_effect, is_system | NEW `leave_types` | Replaces `LEAVE_STATUS_CODES` constant; one mapping for dialog and legend |
| Leave request | + periods (child rows) | `crew_leave_requests` + NEW `crew_leave_request_periods` (request_id, leave_type_key, start, end, end_unknown) | T-71 |
| Rotation plan | vessel_id, person_a, person_b, stint_length, stint_unit (weeks / months), pattern_label, anchor_date, plan_until, overlap_days | NEW `rotation_plans` | Default plan until = anchor + 1 year |
| Position manning | vessel_id, position_id, min_on_board (≥ 0), max_on_board (null or ≥ min) | NEW `position_manning` | Unique (vessel_id, position_id) |
| Manning by day | date, position_id, aboard, qualified, min, max, band | NEW SQL function `vessel_manning_by_day` | |
| Familiarisation template | + code, description, due_within_days, requires_crew_signature, requires_supervisor_signature, scope (fleet / vessel), form_template_id | `familiarization_templates` | Code unique per company |
| Template positions | template_id, position_id, vessel_id | NEW `familiarization_template_positions` | Required-for list |
| Familiarisation record | + status awaiting_signatures, crew_signed_at, supervisor_signed_at, due_date | `familiarization_records`, `familiarization_checklist_items` | Items copied from the template's sections |
| Appraisal | + review_type `end_of_contract`, objectives text, development_plan text, fit_for_promotion / fit_for_reengagement (not_assessed / yes / no / with_conditions), general_recommendations, attachments | `performance_reviews` | |
| Appraisal criterion | + group_key (general / initiative_teamwork / managerial), applies_to (all / officers) | `performance_competencies` | Seed the 14-criterion framework (our wording) |
| Training plan item | profile_id, vessel_id, course_id, target_month, est_cost_minor, currency, status (planned / applied / completed / cancelled), source (appraisal / gap / manual), application_id | NEW `crew_training_plan_items` | Register and profile Training tab |
| Visitor person / visit | — | `visitor_people`, `vessel_visits` (doc 02) | Add `host_profile_id`, `berth`, `no_emergency_duties_confirmed`, `embark_port` on visits |
| Crew medical status | — | view `crew_medical_status` (doc 02) | Vessel grid filters it |
| Countries | iso2 (PK), iso3, name, demonym, dial_code, flag_emoji, sort_name | NEW `ref_countries` (global, read-only) | ≈219 rows covering the reference's 219 demonyms and 219 countries; nationality fields store iso2, display demonym (avoids ambiguous demonyms) |
| Languages | code (ISO 639-1/3), name, sort | NEW `ref_languages` (global) | ≥ 53 rows |

---

## Improvements over the reference

Each item is tied to a support-ticket theme where one exists.

1. **Requirements that understand equivalence** (T-326, T-159, T-53, T-190, T-135). Equivalents, "higher certificate supersedes lower" and "combined certificate covers its components" are explicit rules in the catalogue, not ticket-driven fixes. Every "missing" cell explains itself ("needs PST: none held; nearest: combined basic safety certificate — not linked") and every "met" cell says which document satisfied it. Mandatory items such as the seaman's book are configuration, and tenants can add positions themselves.
2. **Verification that cannot go stale** (T-139, T-163, T-31, T-248). Any material edit resets verification, verifiers are notified reliably per vessel and department (the reference missed notifications for some vessels), all document categories share one verification model with comments, and reports filter on every verification state.
3. **Documents land in the right place** (T-185, T-222, T-215, T-157, T-145, T-275). The tab is a property of the document type. Imports never create a second document of the same type for the same person when the number matches (idempotent upsert on type + number + external ref); unclear mappings go to a review queue instead of being filed silently.
4. **External registry, if adopted, is a source not an owner** (T-45, T-141, T-145, T-275). Expired documents arrive flagged, not hidden; "updated" notices update, never insert; a re-classification upstream is applied as a type change with an audit row.
5. **Hours of rest you can act on** (T-142, T-144, T-143, T-286, T-148, T-133). Deficit column, non-compliant filter, accept / request-correction per breach, serious escalation, one consolidated breach report sent by a person, submit-on-behalf with recorded reason, automatic and manual reminders, a soft HoD nudge before final approval, month view by default, and board membership based on who was assigned during the month.
6. **Rest-aware planning**: the planner warns when a period puts someone on board straight from another vessel without a rest gap, and the transfer review shows recent breaches (T-39).
7. **Controlled transfers** (T-39, T-121, T-96). A wizard that rechecks the receiving vessel's requirements, surfaces medical / appraisal / HoR / familiarisation items, notifies fleet HR, and records the date the person became compliant on the new vessel. Vessel officers can run it without office involvement when the account allows.
8. **Multi-period leave in one step** (T-71), PBQ and emergency leave as first-class types, and one leave-type list for the dialog and the legend (the reference's two lists disagree, §5.1.6).
9. **STORM is the planner of record** (T-316, T-228). Spreadsheets are imported through a mapping preview with unmatched-name resolution, not a fragile background sync that breaks when a tab's layout changes. If scheduled pulls are kept, a schema check fails loudly with the exact column that moved.
10. **Planner readability** (T-27): durations in weeks + days, month zoom with weekend shading, Today button, remembered zoom, bar labels with type and duration, manning gaps in the same view (T-20).
11. **Occasional workers done properly** (T-32, T-13): own person type, on the onboard list and exports with "no emergency duties", excluded from crew compliance, HoR, SEA, medical and manning; readiness shows declaration status; one active visit per person across the fleet.
12. **Familiarisation per vessel and per position** (T-134, T-15, T-121): vessel-specific variants, fleet-wide 24-hour and 2-week templates, required-for-position mapping, two signatures, and counts that feed compliance.
13. **Searchable, alphabetical crew pickers everywhere** (T-166): one shared picker (name, position, crew number) with on-board-first ordering.
14. **Phone numbers stored correctly** (T-68): dial code and national number in separate fields, rendered once.
15. **Bulk document import with AI extraction** (T-46): drag a folder of scans, STORM proposes type, number and dates per file, a person confirms. Reuses the existing extraction pattern.
16. **Forecast crew list** (T-306): "crew list as at <date>" from the planner, including expected joiners and occasional workers.
17. **Profile with a URL**: every person, tab and HoR day has a deep link usable in emails and notifications; the reference's query-string pages (`section=…&subsection=…`) cannot be bookmarked per person.
18. **Aesthetic**: STORM's design tokens and shadcn components; dense tables with sticky headers and first columns, status as colour + icon + text (never colour alone), mobile-first layouts for the crew self-service pages (HoR entry, documents upload, leave request), skeleton loaders, and the kiosk-style In/Out board.

---

## Implementation notes

**Routing and shell**
- Add the `/v/:vesselCode/crew/*` subtree inside the `VesselScopeRoute` from doc 01. Until that lands, mount the same pages at `/vessel/:vesselSlug/crew/*` and read the vessel from the route param, never from `useVessel().selectedVesselId`.
- Replace `vesselCrew` in `src/config/sitemap.ts` (lines 107–115) with the tree above; remove `crossLink` entries for Leave, Rotation Planner, Crew Training and Familiarisation; move the HRIS "Leave & Rotation" leaves (lines 599–605) to link into the vessel planner.
- Add the legacy redirects listed in the IA to `src/routes/index.tsx` (crew block, lines 223–415).

**Crew list and profile**
- Merge `src/modules/crew/pages/CrewList.tsx` and `CrewRoster.tsx` into `CrewListPage.tsx`. Keep `OfficialCrewListDialog.tsx` and `lib/crewListPdf.ts` (add the as-at-date and occasional-worker section). Move Airtable sync, invite, reset and access toggles into the row overflow menu, gated by capabilities (doc 01) instead of `canManageCrew`.
- Rewrite `useCrew.ts`: query a SQL view `vessel_crew_list(vessel_id)` returning one row per person with assignment, position, sort order, derived status, compliance dots, role tags and invitation state. Do not `select('*')` from `profiles` for the whole company.
- New `CrewProfilePage.tsx` composing: HRIS `components/personal/{PersonalDetailsForm,AvatarUploader,ProfileAuditTrail}.tsx`, `components/next-of-kin/{NextOfKinCard,NextOfKinFormDialog}.tsx`, `components/contracts/{ContractCard,ContractHistoryTable,TerminateContractDialog}.tsx`, `components/history/{Timeline,AssignmentsTable,ServiceSummary}.tsx`, `components/reviews/*`, Health `components/medical/PersonClinicalBanner.tsx` with `usePatientRecord`, and the work-rest `MonthCalendar` / `DayTimeline`. Retire `CrewProfileModal`, `FullCrewEditModal`, `EditCrewModal` and `PersonnelRecordDialog` once the page ships.
- Replace `CrewFormModal.tsx` with the Add Crew page and an RPC `create_crew_member`; reduce the `create-crew-member` edge function to sending the invitation (it currently trusts `role` from the request body and requires an admin-typed password).

**Documents and compliance**
- Replace `MARITIME_CERTIFICATE_TYPES` (`certificates/hooks/useCrewCertificates.ts`) and `hris/components/documents/requiredDocuments.ts` keyword matching with the catalogue and `crew_requirement_status`. Write a TypeScript mirror of the engine in `src/modules/crew/lib/compliance.ts` with unit tests (pattern: `src/modules/hris/lib/*.test.ts`), used for optimistic UI and the add-document "missing for role" list.
- Stop writing `crew_certificates.status` (`useCrewCertificates.ts` lines ~137–229 compute it on save); read state from `crew_document_status`.
- `src/lib/storage/crewDocuments.ts`: enforce 50 MB and the MIME allow-list client-side and in the `documents` bucket policy; keep the `<company_id>/crew/<id>/<kind>/…` layout but key on `profile_id`.
- Migration order: (1) reference tables and catalogue seeds; (2) new columns on `crew_certificates` + `profile_id` backfill via `profiles.user_id`; (3) mapping table from distinct `certificate_type` / `certificate_name` strings to `document_type_id` (manual review CSV for the long tail); (4) passports from `profiles.passport_*` and `crew_travel_documents` into documents; (5) requirement tables; seed each vessel from `training_matrix` rows where present, else the STCW basic set; (6) views.
- Retire `training/components/TrainingMatrixTab.tsx` and HRIS `right-to-work/ComplianceMatrix.tsx` as compliance sources; keep HRIS right-to-work for visas / work authorisations, which become document types.

**Hours of rest**
- Extend `work-rest/lib/complianceEngine.ts`: add `is_serious`, `deficit_hours`, warning detection and the 7-day severity by margin (today every 7-day breach is `critical`); keep its tests green.
- `SignOffPanel.tsx`: resolve actors with `has_capability('vessel.crew.hours_of_rest.approve' | '.final_approve', vessel, department)` instead of the hard-coded `Role` union; call the signature engine.
- `WorkRestOverview.tsx` → `HoursOfRestBoard.tsx`; wire the three dead export buttons to `reports/exports.ts`; change `workRestService.listVesselMonthMatrix` to select assignments overlapping the month (not `is_current`), which fixes the T-144 class of bug.
- `MyWorkRestMonth.tsx` opens on the month view; leave days come from planner periods.
- Reminders: a scheduled edge function (pattern: `hr-daily-sweeper`) writing `work_rest_reminders` and sending through `send-email`.

**Planner**
- Make `frp_rotation_assignments` the period store; add the trigger to `crew_leave_entries`; change `LeaveRequestsPage.tsx` approval to create periods; keep `leaveCalculator.ts` untouched (it reads day codes).
- `RotationPlannerPage.tsx` gains tabs Timeline / Manning / Requests / Configuration. Reuse `PlannerGrid`, `RotationBlock`, `LocationLane`, `Toolbar`, `usePlannerHistory`; port the month grid from `LeavePlannerPage.tsx` into the Manning tab and add totals rows; add manning-gap items to `lib/conflicts.ts`.
- Replace `LEAVE_STATUS_CODES` with `leave_types`; **delete `CREW_SEED_DATA` from `leaveConstants.ts` and its export from `crew/index.ts`** (named people in a public repo).

**Employment, transfers, appraisals, familiarisation**
- `TransferCrewModal.tsx` → `TransferWizard.tsx` calling RPC `transfer_crew`. The `reassign` action of `update-crew-assignment` is already retired with the whole function (D-191); until the RPC exists, a vessel move goes through `admin-actions` `reallocate_vessel`.
- Appraisals: reuse `hris/lib/reviews.ts` (`NEXT_STATUS`, `computeOverallRating`, `ratingDelta`, `seedRatings`), `SelfAssessmentForm.tsx`, `ReviewRatingsGrid.tsx`, `ReviewSignaturesTab.tsx`, `reviewPdf.ts`; add `end_of_contract` to the `review_type` check constraint and `REVIEW_TYPES`.
- Familiarisation: fix `FamiliarizationTab.tsx` `handleStartFamiliarization` to copy the selected template's `sections` (it always uses `DEFAULT_FAMILIARIZATION_SECTIONS`); route sign-off through the signature engine; keep `update-familiarization` for item ticks but replace its legacy role list with capabilities.

**Medical, visitors, training**
- Crew Medical and the profile Medical tab read doc 02's `crew_medical_status` and the `med_*` tables via `hw_people.profile_id`; never expose clinical detail without `medicalAccess.ts` clearance.
- Visitors reuse doc 02's `visitor_people` / `vessel_visits`; keep `hw_people` for clinical use and link by `visitor_person_id` if the medic treats a visitor.
- Crew Training: filter `development_applications` by `vessel_id` from the route (today it filters by vessel *name* client-side).

**Pitfalls**
- **Keys**: `crew_assignments`, `crew_certificates`, `crew_attachments`, `crew_leave_entries`, `frp_*` key on `user_id`, which is null for imported crew; HRIS keys on `profiles.id`. Every new table uses `profile_id`; add `profile_id` to the old ones before building on them.
- **Departments**: six divergent lists today; use doc 01's `departments` only. HoR department tabs in the reference include Dive and Medical; ours come from the vessel's positions.
- **Stale generated types**: `src/integrations/supabase/types.ts` is hand-patched (`docs/HRIS.md` go-live step 2). Regenerate after these migrations; several hooks use `(supabase as any)` for `frp_*`.
- **Tenant leak**: fix `crew_import` / `vessels_import` SELECT policies (`using (true)`) before adding more crew data.
- **Computed vs stored state**: certificate status, `is_current`, compliance and crew status must be computed in views; caching, if needed, goes into nightly tables with a `computed_at`.
- **Performance**: the compliance and manning views join people × rows × documents; index `crew_certificates(profile_id, document_type_id)`, `crew_requirement_positions(position_id)`, `frp_rotation_assignments(vessel_id, start_date, end_date)`.
- **Signatures**: do not invent per-module signature storage; HoR, appraisal and familiarisation all call the shared engine and get the stale-signature warning on later edits for free.

---

## Open questions

1. **Course completions vs qualifications**: should a completed training course (`training_records`, `development_applications`) automatically create or renew the matching crew document, or stay separate with a link? (Recommended: create / renew, doc 02 TR9.)
2. **External crew-document registry**: do we integrate one (which provider, which direction), or rely on STORM uploads plus AI import?
3. **Admin-added leave**: does leave added by an approver go straight to Approved (as the reference appears to), or always through Pending?
4. **Rotation leave and balances**: does rotation leave deduct from the annual allowance for rotational contracts, or is it neutral with balances tracked as time-for-time?
5. **Manning maximum**: is a per-position maximum wanted at all (the reference shows "Overmanned" but its source was not seen), and should overmanning raise an alert or only a colour?
6. **HoD step in HoR approval**: off, soft nudge (T-148) or mandatory, per vessel?
7. **Breach report recipients**: fleet HR, DPA, or flag state contacts? Should a serious breach notify the DPA immediately?
8. **Crew without a login**: may the appraiser record a paper self-assessment and the crew signature as "witnessed", or is a login mandatory for appraisals?
9. **Crew number**: format and whether it is account-wide (e.g. `C-0001`) or per vessel; does it come from HR / payroll?
10. **Transfer approval**: should fleet approval be required for every transfer, only for position changes, or never (vessel officers decide, office notified)?
11. **Occasional worker classification**: who decides Occasional worker vs Passenger (Master only, or also the Safety Officer), and is "Supernumerary" needed for our flags?
12. **Biographies**: are crew biographies guest-facing outputs we want (charter guests, owners), and who approves the text before it is published?
13. **Leave module per account**: confirm that accounts which do not track leave (T-10) still want the planner for rotations and manning, with leave types reduced to On board / Off / Travel.
