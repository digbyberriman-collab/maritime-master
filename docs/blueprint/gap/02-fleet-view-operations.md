# Fleet view operations — gap analysis

Domain: the Fleet (shore-side oversight) view of STORM — Dashboard, Tracker, Reports, Calendar, Documents, Forms & Checklists, Training, Medical, Visits and Employment.

This is the build spec for that domain. It compares the rebuild blueprint (v1.3) of the reference app with what STORM actually does today (verified by reading pages, hooks, queries and migrations, not file names). Requirements are written as STORM requirements; blueprint sections are cited as `§n.n`. Support-ticket references (`T-nnn`) point to the fleet's ticket export from the reference app and are used only as evidence of pain points.

> **Phase 3 wave 1 status (27 Nov 2026).** A *STORM status* of `complete (P3W1)` or `partial (P3W1)` was set at the wave-1 merge where the code built in Phase 3 wave 1 made the earlier status false. These pages are live as `beta` behind their capabilities; their migrations are written, ledgered and verified on the DB harness but not applied (D-01), so until the owner applies them each page shows its documented not-set-up state. The *STORM location(s)* and *Gap* columns still describe the code before the wave, except R19 and X4, whose Gap cell says what remained after review round 1; BUILD-PLAN's Phase status says what remains.

---

## Scope

**Blueprint sections covered**

| Area | Sections |
|---|---|
| Fleet view pages | §4.1 Dashboard, §4.2 Tracker, §4.3 Reports, §4.4 Calendar, §4.5 Documents, §4.6 Forms & Checklists, §4.7 Training, §4.8 Medical, §4.9 Visits, §4.10 Employment |
| Workflows | §6.13 Training application approval, §6.18 Fleet document publish and acknowledge, §6.19 Checklist template lifecycle, §6.23 Recruitment hiring need, §6.27 Medical case |
| Data model | §3.22 Calendar event, §3.25 Fleet document and acknowledgement, §3.26 Checklist template, §3.27 Training, §3.28 Visit / person, §3.29 Recruitment, §3.30 Employing company; also §3.21 (crew medical summary, visitor), §3.40 (Vacancy, HiringNeed, Course, FleetDocumentSection) |
| Context read | Exec summary (lines 1–94), §2 roles and permission flags, §5.1.11 Visitors, §5.1.13 Crew medical / training, §5.2.14 vessel Fleet Documents menu, §5.7 vessel calendar, §7.1–7.4 notifications / calendar sources / reports / exports, §7.12 save behaviours, §7.13 vessel count discrepancy, §10 known gaps |
| Screenshots viewed | image38 (fleet dashboard), image40 (vessel comparison report), image39 (new checklist builder), image29 / image30 / image10 / image34 (state diagrams for §6.18, §6.19, §6.13, §6.23). image1 / image2 are formula fragments from §3.27 policy settings only. |

**STORM paths inspected**

| Area | Paths |
|---|---|
| Navigation | `src/config/sitemap.ts` (Fleet section lines 80–97), `src/config/navigation.ts`, `src/routes/index.tsx` |
| Dashboard | `src/modules/dashboard/pages/Dashboard.tsx`, `src/modules/dashboard/components/FleetDashboardView.tsx`, `components/fleet/{FleetSubNav,RegionMapCard,FleetKPITiles,VesselHealthMatrix,regionUtils}.tsx/ts`, `src/modules/vessels/pages/VesselDashboard.tsx`, RPC `get_vessel_dashboard_summary` (latest in `supabase/migrations/20260919210000_ism_form_workflow.sql` lineage) |
| Tracker | `src/modules/dashboard/pages/FleetMap.tsx`, `supabase/functions/ais-refresh/index.ts`, table `ais_snapshots`, table `fleet_groups`, `vessels.fleet_group_id` |
| Reports | `src/modules/analytics/*`, `src/modules/incidents/pages/{IncidentAnalytics,CAPATracker}.tsx`, `src/modules/drills/pages/DrillAnalytics.tsx`, `src/modules/certificates/pages/{CertificateAlerts,CrewCertificatesOverview}.tsx`, `src/modules/hris/pages/ReportingPage.tsx`, `src/modules/compliance/pages/InsurancePage.tsx`, view `hr_expiry_items` |
| Calendar | `src/modules/itinerary/pages/FleetTimelinePage.tsx`, `src/modules/crew/pages/VesselCalendar.tsx` |
| Documents | `src/modules/documents/{pages,components,hooks}`, `src/modules/crew/pages/{AcknowledgmentTracking,DocumentAcknowledgementsPage}.tsx`, `src/modules/auth/hooks/useAcknowledgments.ts`, tables `documents`, `document_categories`, `document_versions`, `document_acknowledgments` |
| Forms & checklists | `src/modules/ism/pages/ChecklistsPage.tsx`, `src/modules/ism/forms/{pages,hooks,components,constants.ts}`, tables `form_templates`, `form_schedules`, `form_submissions`, `form_categories` |
| Training | `src/modules/development/*` (applications, catalogue, admin), `src/modules/training/*` (records, familiarisation, matrix), tables `development_courses`, `development_applications`, `development_expenses`, `development_repayments`, `program_settings`, `training_courses`, `training_records`, `training_matrix` |
| Medical | `src/modules/health/{routes.tsx,pages/medical,hooks}`, `docs/HEALTH.md`, tables `med_fitness_assessments`, `med_vaccinations`, `med_screening_*`, `med_consultations`, `medical_reports`, `hw_people`, edge function `notify-shipping-master` |
| Visits | `hw_people` (`person_type = visitor`), `src/modules/logbooks/lib/catalog.ts` (visitor log book) |
| Employment | `src/modules/hris/{routes.tsx,pages/VacanciesPage,CandidatesPage,OnboardingPage,PayrollPage,RightToWorkPage}.tsx`, `src/modules/hris/hooks/useRecruitment.ts`, `src/modules/hris/lib/recruitment.ts`, tables `vacancies`, `candidates`, `candidate_applications`, `interviews`, `crew_contracts`, `companies` |
| Alerts / notifications | `src/modules/alerts/hooks/useAlerts.ts` (table `alerts`), `hr_generate_alerts()`, `supabase/functions/send-email` (not called from `src/` today) |
| Permissions | `docs/permissions/catalogues/storm.json` (domain `fleet`), `docs/permissions/addenda/storm.md` |

---

## Target information architecture

The Fleet view is the shore-side operating surface across all vessels the user can reach. Each page must honour a global **Vessels shown** filter (persisted per user) and the user's vessel reach. Vessel-view counterparts are listed so implementers wire the cross-links; they are specified in the vessel-domain gap docs.

```
Fleet  (Fleet view)
├── Overview
│   ├── Fleet Dashboard ............ /fleet/dashboard
│   ├── Fleet Tracker .............. /fleet/tracker?group=<fleetGroupId>
│   ├── Fleet Reports .............. /fleet/reports              (overview)
│   │                                 /fleet/reports/:reportKey  (one page per report, filters in query string)
│   └── Fleet Calendar ............. /fleet/calendar?view=list|month|week&vessels=..&cats=..
├── Compliance
│   ├── Fleet Documents ............ /fleet/documents?tab=documents|acknowledgements&section=..
│   │                                 settings as a right-hand drawer (?settings=1)
│   └── Forms & Checklists ......... /fleet/forms                   (overview by area)
│                                     /fleet/forms/:area             (safety|technical|movement|charter|crew|ptw|familiarisation|sms|technical-forms)
│                                     /fleet/forms/new?area=..
│                                     /fleet/forms/:templateId/edit | /preview
├── People
│   ├── Fleet Training ............. /fleet/training/:tab
│   │                                 tabs: overview|by-vessel|applications|courses|monthly|catalogue|settings|clawback
│   ├── Fleet Medical .............. /fleet/medical?vessel=..&status=..
│   ├── Fleet Visits ............... /fleet/visits/:tab            (people|today|periods)
│   │                                 /fleet/visits/people/:personId
│   └── Fleet Employment ........... /fleet/employment/:tab        (recruitment|employers|compliance|payroll)
│                                     /fleet/employment/recruitment/:sub (vacancies|hiring-needs|candidates)
│                                     /fleet/employment/vacancies/new?vessel=..  /fleet/employment/vacancies/:id
├── Planning (cross-links, owned by crew-planning domain)
│   └── Fleet Rotation Planner ..... /crew/rotation-planner (crossLink)
└── Administration (owned by the fleet-admin gap doc)
    Users & Access, Notification Management, Support Tickets, Company FAQs, Add-ons,
    Vessel Settings, Vessels, GDPR, Account, Security
```

**Vessel-view counterparts (link targets, not specified here)**

| Fleet page | Vessel view counterpart |
|---|---|
| Dashboard tiles / panels | Vessel dashboard `/vessel/:vesselSlug/dashboard` (every count deep-links to the filtered vessel list) |
| Fleet Documents | Vessel › Safety › Fleet Documents (read + acknowledge), grouped by the same sections |
| Forms & Checklists | Vessel › Safety › Checklists, Technical › Technical Checklists, Vessel › Movement Checklists, Charter › Checklists, Crew › Familiarisation, Safety › SMS Forms / PTW |
| Fleet Training | Vessel › Crew › Crew Training (`/development/crew-training`) and crew self-serve `/development/my` |
| Fleet Medical | Vessel › Crew › Crew Medical (same grid filtered to one vessel) and Health › Medical |
| Fleet Visits | Vessel › Crew › Visitors & Occasional Workers |
| Fleet Calendar | Vessel › Calendar (same feed, one vessel, plus Add Event) |
| Fleet Employment | Vessel › Owner and Employer page (picks the employing company); Crew › Employment History |

**Changes to the current Fleet nav (`src/config/sitemap.ts` lines 82–97)**

| Today | Target |
|---|---|
| `Fleet Dashboard` → `/dashboard` (generic widget grid, not fleet-specific) | `/fleet/dashboard` rendering the fleet dashboard; `/dashboard` stays the role-based landing and redirects shore roles to it |
| `Fleet Scheduler` → placeholder | Remove from Fleet (not in the blueprint), or fold into Calendar. See Open questions |
| `Fleet Tracker` → `/fleet-map` | `/fleet/tracker`; `/fleet-map` redirects |
| `Fleet Reports` → placeholder `/fleet/fleet-reports` | `/fleet/reports` (real) |
| `Fleet Calendar` → `/itinerary/timeline` (trip Gantt) | `/fleet/calendar` (compliance + operations calendar). Itinerary Gantt stays reachable from Charter / Planning |
| `Fleet Documents` → `/documents` (document control library) | `/fleet/documents` (publish-and-acknowledge library). `/documents` remains the controlled-document register |
| `Fleet Checklists` → `/ism/checklists` (crossLink) | `Forms & Checklists` → `/fleet/forms` |
| — | Add `Fleet Training`, `Fleet Medical`, `Fleet Visits`, `Fleet Employment` |
| `Vessels`, `Users & Access`, `Notification …`, `Support Tickets`, `Account` | Move under an "Administration" group (other gap doc) |

---

## Feature inventory

Status keys: **complete**, **partial**, **placeholder**, **missing** (definitions in the task brief). Priority P0–P2, effort S/M/L/XL.

### Dashboard (§4.1)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| D1 | Fleet dashboard page shell, header "account · n vessels", **Vessels shown** filter | §4.1 | complete (P3W1) | `FleetDashboardView.tsx` (only rendered inside `VesselDashboard.tsx` at `/vessels/dashboard?view=fleet`); `/dashboard` renders a generic widget grid (`Dashboard.tsx`) | No fleet route; no vessels-shown filter (uses all vessels from `useVessels`); `FleetSubNav.tsx` duplicates the sidebar and links to `/analytics` and `/calendar`, which have no routes | P0 | M |
| D2 | Region mini-maps per fleet group with "Open full tracker" | §4.1, §3.2 | partial (P3W1) | `components/fleet/RegionMapCard.tsx`, `regionUtils.ts` | Region is guessed from flag state; vessel markers use hashed pseudo-coordinates (`vesselCoord`). Must group by `fleet_groups` and plot latest real position | P1 | M |
| D3 | KPI tile: Document alerts (expired vessel certs + expired crew docs + expired crew quals + endorsements overdue + expiring) | §4.1 | complete (P3W1) | `FleetDashboardView.tsx` `kpi.documentAlerts`; RPC `get_vessel_dashboard_summary.certs_expiring_90d` | Counts only vessel certs expiring in the next 90 days; **expired items are excluded** (`BETWEEN CURRENT_DATE AND +90`); crew documents and crew quals not counted; no endorsement buckets; no breakdown sub-text | P0 | M |
| D4 | KPI tile: Hours of rest (breaches, near threshold, no entries, vessels with HoR on) | §4.1 | complete (P3W1) | `FleetDashboardView.tsx` hard-codes `{ value: 0, sub: 'All compliant' }` | Compute from `work_rest_compliance_checks` / `work_rest_monthly_submissions` | P0 | S |
| D5 | KPI tile: Leave overdue (crew past MLC limits) | §4.1 | placeholder | hard-coded `{ value: 0 }` | Compute from `crew_assignments` + `crew_leave_*`; account toggle (leave hidden for some operators, T-10) | P1 | M |
| D6 | KPI tile: Safety (open corrective actions + overdue drills) | §4.1 | complete (P3W1) | `kpi.safety` = red alerts + open CAPAs | Overdue drills not included (RPC has `overdue_drills_count` but tile ignores it); red alerts are not in the reference definition | P0 | S |
| D7 | KPI tile: Technical (overdue jobs, pending approval) | §4.1 | complete (P3W1) | `kpi.technical` = overdue maintenance + critical defects | Align with Work List definitions once Technical domain lands | P1 | S |
| D8 | KPI tile: Finance (add-on) | §4.1 | placeholder | hard-coded `'0 overdue invoices'` | Hide unless Finance enabled; real count from invoices | P2 | S |
| D9 | "Documents & Certificates" panels: vessel certs, crew documents, crew quals (top 5 most overdue, "N of M", view all) | §4.1 | complete (P3W1) | `VesselHealthMatrix.tsx` shows per-vessel counts only | Build three ranked lists from a unified expiry feed; deep-link to filtered reports | P0 | M |
| D10 | "Safety & Compliance" panels: open CAs, overdue drills, HESS meetings due | §4.1 | partial (P3W1) | Dashboard `overdue-capas` widget (count only) | Ranked lists with severity, vessel, status, days overdue; HESS 42-day cycle | P0 | M |
| D11 | Leave & MLC panel: MLC warnings, pending leave requests | §4.1 | missing | `crew_leave_requests` exists | Collapsible card with both lists | P1 | S |
| D12 | Insurance & surveys (next 90 days) | §4.1 | complete (P3W1) | `insurance_policies` table exists but **no UI reads it** (`InsurancePage.tsx` is static copy); audits/surveys in `/ism/audits-surveys` | Expiring policies (type, vessel, policy no., date) + upcoming surveys | P1 | M |
| D13 | Work list per vessel (open / overdue / pending approval) | §4.1 | complete (P3W1) | `maintenance_tasks` | Small table, links to vessel job list | P1 | S |
| D14 | Activity: recent movements, new crew (30 days) | §4.1 | partial | `Dashboard.tsx` `crew-changes` widget (`useRecentCrewChanges`) | Movements need voyage reports (vessel/voyage domain); new-crew list is close | P2 | S |
| D15 | "Compare all vessels" link + vessel health matrix | §4.1, §4.3 | complete (P3W1) | `VesselHealthMatrix.tsx` | Keep as preview; link to Vessel Comparison report | P1 | S |

### Tracker (§4.2)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| T1 | Live vessel positions from AIS | §4.2, §7.8 | placeholder | `FleetMap.tsx` (`hashToCoord` fake lat/lon, random status, fake crew count); `ais-refresh` edge function returns `generateMockAISData`; `ais_snapshots` table exists but is unused by the map | Real provider, scheduled refresh writing `ais_snapshots`, latest-position view, "Updated n ago" + manual refresh | P1 | L |
| T2 | Fleet status cards per vessel: status dot, Moored/Underway, last port, destination, draught, position, "last AIS fix n d ago" | §4.2 | placeholder | popup only, values faked | Cards grid under the map; stale-fix warning | P1 | M |
| T3 | One map per fleet group, base/overlay layers (street, light, bathymetry, nautical) | §4.2 | partial | single map, CARTO dark tiles, port markers hard-coded | Group maps from `fleet_groups`; layer switcher; "n underway" chip | P2 | M |
| T4 | Fleet groups admin | §3.2 | placeholder | `/admin/fleet-groups` renders ComingSoon; `fleet_groups` table + `vessels.fleet_group_id` exist | CRUD + assign vessels (admin gap doc owns the page; this domain consumes it) | P1 | S |

### Reports (§4.3)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| R1 | Reports hub: overview with period (3/6/12 months), current-position tiles, trend charts, grouped catalogue, report pages with back link, module chip, description, **Switch report** | §4.3 | complete (P3W1) | `/fleet/fleet-reports` is a sitemap placeholder; scattered report pages at `/reports/*` | Build hub + registry-driven report pages (see Implementation notes) | P0 | L |
| R2 | Vessel Comparison (tabs Documents / Safety / Technical / Insurance / HoR; sort by findings; click-through; "–" = not covered) | §4.3, image40 | complete (P3W1) | `VesselHealthMatrix.tsx`; `analytics/components/VesselComparisonTable.tsx` is incidents-only | Tabbed comparison backed by one RPC; numbers link to the vessel's filtered records | P0 | M |
| R3 | Fleet Certificates (section filter, show-valid toggle, buckets: expired / endorsement overdue / ≤30 / endorsement due / ≤90 / valid, verification column, export) | §4.3 | partial | `/certificates`, `CertificateAlerts.tsx` | Endorsement windows and verification status (certificates gap doc), fleet-wide table + export | P0 | M |
| R4 | Crew Documents (passports ≤9 months, other docs ≤3 months; type/status filters; export) | §4.3, §3.39 | complete (P3W1) | view `hr_expiry_items`; `ReportingPage.tsx` "document expiry forecast" | Vessel attribution is `NULL` for passport/visa/medical/certificate rows in `hr_expiry_items`; per-type alert windows; filters | P0 | M |
| R5 | Crew Qualifications ("Required by position" default vs All) | §4.3 | complete (P3W1) | `CrewCertificatesOverview.tsx`, `training_matrix` | Requirement-driven view using the vessel's crew compliance config (crew-compliance gap doc) | P0 | M |
| R6 | SMS Forms (KPIs, reports by month stacked, vessel × type matrix, root causes, repeat occurrences) | §4.3 | partial | `IncidentAnalytics.tsx`, `CAPATracker.tsx`, `useIncidentAnalytics.ts`, `useCAPAAnalytics.ts` | Include all SMS form types, avg days to close, open medical cases, click-to-filter matrix | P1 | M |
| R7 | Overdue Drills (vessel, category, frequency, due, days overdue, status) | §4.3 | complete (P3W1) | `DrillAnalytics.tsx` | Fleet table + export | P1 | S |
| R8 | HESS Forms (awaiting company sign-off, vessels overdue on 42-day cycle, no meeting on record, all minutes) | §4.3 | missing | `/ism/meetings` exists (vessel) | Fleet report; cycle length configurable | P1 | M |
| R9 | Hours of Rest (unreviewed breaches, serious breach days, not submitted, vessels logging, emerging issues, heat-map, per-vessel table) | §4.3 | complete (P3W1) | `/crew/work-rest/overview` (`WorkRestOverview`) | Fleet aggregation, heat-map, per-100-days rate, export (T-292) | P0 | M |
| R10 | Agreements (SEA by status) | §4.3, §3.39 | complete (P3W1) | `crew_contracts` (`sea_reference`, `signed_by_company_at`, `signed_by_crew_at`) | Report page with status chips (Draft / Not yet signed / Signed) | P1 | S |
| R11 | Contracts Ending (30/60/90 days) | §4.3 | complete (P3W1) | `hr_expiry_items` (`contract`), HRIS Reporting "contract expiry forecast" | Fleet report page + export; feeds hiring needs (E3) | P1 | S |
| R12 | External crew-document register sync status | §4.3 | missing | — | Only if an equivalent integration is adopted (Open questions) | P2 | L |
| R13 | Insurance (P&I, H&M, Crew Medical per vessel: broker, underwriter, expiry; grouped by management type) | §4.3 | partial (P3W1) | `insurance_policies` unused | Report page; expiry linked to the insurance certificate | P1 | M |
| R14 | Fleet List (type, flag, class, IMO, LOA, builder, year, cert health) | §4.3 | complete (P3W1) | `/vessels/list` (`Vessels.tsx`) | Cert-health badge column, active crew count, export | P1 | S |
| R15 | Movements (arrival / departure / noon by voyage) | §4.3 | missing | no voyage/movement tables | Depends on voyage domain; build page once data exists | P1 | M |
| R16 | Emissions & Fuel | §4.3 | missing | — | Depends on voyage + fuel data (T-232) | P2 | XL |
| R17 | Audit & Survey | §4.3 | complete (P3W1) | `/ism/audits-surveys` | Fleet table: type, status, outcome, dates, surveyor, findings | P1 | S |
| R18 | Work List (status chips, cost by vessel per currency) | §4.3 | partial | maintenance pages | Fleet report page | P1 | S |
| R19 | Export (CSV / Excel / PDF) on every report | §4.3, §7.4 | partial (P3W1) | CSV builders duplicated in `hris/lib/reports.ts`, `development/pages/CoursesRegister.tsx`, `training/components/TrainingMatrixTab.tsx`; `usePDFExport` | Shared export helper; every report exports what is on screen. Remaining after P3W1: the 11 registry reports export CSV, XLSX and PDF through ReportShell and ExportMenu; the four legacy href reports (incident analytics, CAPA tracker, drill analytics, risk overview) do not export yet and show Export disabled with the reason (D-384; X2 with R6, X5 wave 2) | P0 | M |

### Calendar (§4.4, §3.22, §7.2)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C1 | Generated events across sources (cert / insurance expiry, drills due, crew embark/disembark, technical due, charter, vessel movements, form schedules) | §4.4, §7.2 | partial | `VesselCalendar.tsx` (`/crew/calendar`) reads `crew_travel_records`, `audits`, `drills` for one vessel; Fleet nav points to the itinerary Gantt | One server-side feed for all sources, all reachable vessels | P1 | L |
| C2 | Vessel checklist panel with counts, "only vessels with events in view", category filter with fixed colours | §4.4 | missing | — | Left panel + category chips | P1 | M |
| C3 | Month / Week / List views (List default: Today / Tomorrow / Later), status tags Due soon / Overdue / Completed, "+N more" | §4.4 | partial | `VesselCalendar.tsx` has Month + List | Week view, status tags, grouping | P1 | M |
| C4 | "n items need attention — x overdue · y due soon — Show these" banner | §4.4 | missing | — | Banner + one-click filter | P1 | S |
| C5 | Custom events (title*, description, location, category controls visibility, start*, single-day, all-day, end, times) | §3.22, §5.7 | missing | no `calendar_events` table | Table + create/edit/delete on vessel and fleet calendars | P1 | M |
| C6 | Export / subscribe | §4.4, §7.4 | missing | — | CSV export of view; per-user ICS feed (improvement) | P2 | M |

### Documents (§4.5, §3.25, §6.18)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| FD1 | Company-scoped **sections → document types** taxonomy driving each vessel's Safety › Fleet Documents menu | §4.5, §3.40 | complete (P3W1) | `document_categories` (global seed: Policies, Procedures, Forms, Records, Manuals, Certificates — no `company_id`) | Company-owned sections and types; section appears on a vessel once a document in it is published there | P0 | M |
| FD2 | Library list: category counts, search, vessel filter, columns title / type / version / date / vessels / acknowledged | §4.5 | complete (P3W1) | `Documents.tsx`, `DocumentTable.tsx`, `useDocuments.ts` | Type column, vessels-targeted column ("All n" / "k of n"), ack progress column, "n not uploaded" | P0 | M |
| FD3 | Publish dialog: type, crew-facing title, file, **targets: all vessels incl. future, or ticked vessels; helpers "tick a flag", "tick a class"** | §4.5 | complete (P3W1) | `UploadDocumentModal.tsx` (company-wide **or one** vessel) | Multi-vessel targets, flag/class helpers, future-vessel inheritance | P0 | M |
| FD4 | Version and date per document, new version supersedes | §3.25 | complete (P3W1) | `documents.revision`, `document_versions`, `SafetyDocumentVersioning.tsx` | Tie acknowledgements to a version; choose whether a new version needs re-acknowledgement | P0 | S |
| FD5 | Empty type slots ("n not uploaded") | §4.5, §6.18 | complete (P3W1) | — | Show types with no published document | P2 | S |
| FD6 | Acknowledgements tab: per-vessel acknowledged / needs (overdue, blocked, pending) / can sign; per-person bar; expandable rows | §4.5 | complete (P3W1) | `AcknowledgmentTracking.tsx` (`/acknowledgments`), `useAcknowledgmentStats` | Denominator is **every active profile in the company**, not the targeted crew; "overdue" is a `<50%` heuristic; no vessel grouping; no due dates | P0 | M |
| FD7 | Reminders: per vessel, per person, "Remind all outstanding" | §4.5, §7.1 | partial (P3W1) | Reminder dialog's Send button only closes the dialog | Real in-app + email reminders, logged | P0 | S |
| FD8 | "Choose who can sign" (signer eligibility per vessel) | §4.5, §6.18 | complete (P3W1) | — | Eligibility rule per vessel / document type; drives blocked state | P0 | M |
| FD9 | Crew acknowledge on the vessel side | §5.2.14 | complete (P3W1) | `DocumentAcknowledgementsPage.tsx` (`/crew/acknowledgements`); dashboard "pending-docs" widget | Group by section; version-aware; vessel-scoped | P0 | S |
| FD10 | Settings drawer: add / rename / reorder / delete sections; add types; hide empty types; per-type counts | §4.5 | complete (P3W1) | — | Drawer UI + tables | P1 | M |
| FD11 | Bulk upload of many documents into types | T-132 | missing | — | Multi-file drop with type mapping | P2 | M |

### Forms & checklists (§4.6, §3.26, §6.19)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| FC1 | Overview "what your crews see, by where they see it": area cards (Charter/Trip, Safety, Technical, Movement, Permits, Familiarisation, SMS forms, Technical forms) with counts shown / customised / hidden; "Showing: whole fleet or one vessel" | §4.6, image39 | complete (P3W1) | `ChecklistsPage.tsx` lists templates by a name/category heuristic; "Completed today" and "Scheduled" tiles are hard-coded `0` | Area model + overview | P0 | M |
| FC2 | Area page: "Crew find these in …", n of n shown, Available / Hidden tabs, order on vessels, row = name, origin chip, on k of n vessels, cadence, last run, Customise, menu (restore, change where hidden) | §4.6 | complete (P3W1) | — | Build page | P0 | M |
| FC3 | Builder: name, area/category, description, cadence, requires signature on completion, version (auto if blank), apply to all vessels incl. future / selected vessels, sections and items (item type, Required, Comment box, Attachments), Add several, Preview, Save draft, Create | §4.6, image39 | complete (P3W1) | `ism/forms/pages/CreateTemplate.tsx`, `FieldEditor.tsx`, `constants.ts` (14 field types, FLEET / VESSEL_SPECIFIC scope, DRAFT / PUBLISHED, version) | Area mapping; cadence lives separately in `form_schedules`; per-item comment and attachment toggles; bulk "add several"; signature-on-completion flag; block publish with an empty section | P0 | M |
| FC4 | Per-vessel visibility (hide / restore) and order | §4.6, §6.19 | complete (P3W1) | `form_templates.vessel_ids` only scopes, cannot hide a fleet template on one vessel | `form_template_vessel_settings` table + UI | P0 | M |
| FC5 | Standard library + **Customise** (copy) | §4.6, §6.19 | complete (P3W1) | `form_templates.supersedes_template_id` | Origin flag (platform standard vs company), copy-and-hide flow | P1 | M |
| FC6 | Run tracking per vessel (last run, runs, compliance against cadence) | §6.19 | complete (P3W1) | `form_submissions` | Aggregate per template × vessel; "no recorded runs" | P1 | M |
| FC7 | Permits offered per fleet (titles, checklists, which permits are offered) | §4.6 | complete (P3W1) | `form_templates.form_type = PERMIT_TO_WORK` | Area card linking to the PTW configuration (safety gap doc) | P1 | S |
| FC8 | Visibility diagnostics ("why can't this crew member open this form") | T-51 | missing | — | Improvement; see below | P2 | S |

### Training (§4.7, §3.27, §6.13)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| TR1 | Overview: yearly budget with Set budget (committed vs actual), group-training opportunities, awaiting approval > 7 days (with approver level), KPIs, breakdowns by vessel / department / category, pipeline | §4.7 | partial | `DevelopmentAdmin.tsx` (`/development/admin`): KPIs, category pie, status bar, pipeline table | No budget, no group-training cohorts, no stale list, no department breakdown | P1 | M |
| TR2 | By vessel (awaiting, approved, completed, spend) | §4.7 | complete (P3W1) | derivable from `development_applications` | Table | P1 | S |
| TR3 | Applications register (filters vessel / category / status / clawback active; CSV) | §4.7 | complete (P3W1) | `CoursesRegister.tsx` (CSV), `DevelopmentAdmin` pipeline | Single fleet register with all filters | P1 | S |
| TR4 | Approval chain HOD → final (Captain / Purser) with department scopes | §6.13, §2.3 | complete (P3W1) | `useDevelopmentMutations.ts` `useReviewApplication` (HOD → parallel Captain + Purser; returned; discretionary) | Transitions are client-side `update`s (no server state machine); no distinct **rejected**; department scope not enforced in code | P0 | M |
| TR5 | Approver can edit / comment, crew notified, auditable; send back | T-200 | complete (P3W1) | `*_comments` columns, `returned` status | Event log with field diffs; crew notification | P1 | S |
| TR6 | Void / hide an application entered in error (Captain, Purser, fleet admin) | T-201 | complete (P3W1) | — | Soft delete with reason | P1 | S |
| TR7 | Course catalogue CRUD with rules: name, category I–IV, department grouping, duration, pathway, **valid for (months)**, **renew from (months before expiry)**, applies to departments / positions, mandatory, renewal note, notes, active | §4.7, §3.27 | complete (P3W1) | `CourseCatalogue.tsx` is read-only; `development_courses` lacks rule fields; a second catalogue `training_courses` holds `validity_period_months`, `applicable_ranks`, `is_mandatory` | One catalogue with rules, editable by admins (T-149) | P0 | M |
| TR8 | Crew-proposed courses → Add to catalogue | §4.7 | complete (P3W1) | `development_applications.is_custom_course` | List of proposals with promote action | P1 | S |
| TR9 | Completion sets the qualification expiry | §6.13 | complete (P3W1) | `completion_certificate_url` stored; no write to `training_records` / `crew_certificates` | On completion create/renew the crew qualification with expiry = completion + valid-for | P0 | M |
| TR10 | Policy settings (accommodation cap, per diem, mileage per mile/km, upfront split threshold, online hours per neutral day, clawback window, FX overrides) | §3.27 | complete (P3W1) | `program_settings`; duplicated constants in `development/constants.ts` | Mileage rates, FX overrides; remove hard-coded constants | P1 | S |
| TR11 | Clawback watch (reimbursed Professional / Extracurricular courses inside the window; pro-rata recoverable; Required / Mandatory exempt) | §4.7, §6.13 | partial | `development_repayments` table + crew-side "Repayment obligations" in `MyDevelopment.tsx` | **No code creates repayment rows**; no fleet tab; no trigger on employment end | P1 | M |
| TR12 | Monthly report + "Mark month as reported" | §4.7 | partial | `development_applications.reported_to_fleet_at` (unused) | Month view, CSV, lock | P1 | S |
| TR13 | Courses tab: group-training cohorts with cohort CSV; cost benchmarking (taken, avg, min, max, rating) | §4.7 | missing | — | Two tables | P2 | S |

### Medical (§4.8, §3.21, §6.27)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| M1 | Fleet medical compliance grid: per crew ENG1, vaccinations (valid / expired / missing), boosters, rest (30 d), occupational health, condition / allergy tag, status Critical / At risk / Incomplete / OK; KPI tiles; vessel + status filters; CSV; most severe first | §4.8, §5.1.13 | complete (P3W1) | Data exists: `med_fitness_assessments` (`FitnessToWorkPage.tsx`), `med_vaccinations` (`VaccinationsPage.tsx`), `med_screening_records`, `work_rest_compliance_checks`; `MedicalDashboardPage.tsx` gives fleet totals | No per-crew rolled-up status, no grid, not in Fleet nav, status rules undefined | P0 | M |
| M2 | Occupational health checks (dental, hearing, annual health check, spirometry, dive medical, submersible medical, occupational health review) with due dates and automated crew reminders; standard vaccine list | T-8 | partial | C.H.E.K. screening (`useScreening.ts`) has `due_on` / campaigns | Fixed check types with intervals; reminder schedule | P1 | M |
| M3 | Medical case record: fitness-for-duty and time-off bands drive company review and flag-notification prompts; Master/MPIC signature; company closure | §6.27, T-42 | partial | `med_consultations` (`fit_for_duty`, `days_off_work`, `incident_id`); `medical_reports` (unused); `notify-shipping-master` (incidents only) | SMS-form wrapper with triggers, notifications log and sign-off (owned by SMS-forms gap doc; fleet view lists open cases) | P1 | L |

### Visits (§4.9, §3.28, §5.1.11)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| V1 | Person register for visitors / occasional workers (created once, reused per visit; optionally shared across the fleet) | §3.28, §5.1.11 | missing | `hw_people` with `person_type = visitor` serves the medic only; visitor log book is a logbook template | Dedicated people register | P1 | M |
| V2 | Visit periods per vessel: function, embarkation, disembarkation, status, declaration, readiness, classification (occasional worker / passenger / pending review) | §3.21, §4.9 | missing | — | Table + workflow | P1 | M |
| V3 | Fleet Visits page: People (name, details-missing chip, category, company, status, last visit, visits), Today, Periods (date range, vessel, Excel export); Add fleet visit (vessel → pick admin / shore staff or create person) | §4.9 | missing | — | Page | P1 | M |
| V4 | Occasional workers on the onboard list and crew-list export, flagged, and **excluded** from crew compliance matrix, SEA, crew medical, HoR, manning | T-32 | missing | — | Compliance exclusions + export flag | P1 | M |
| V5 | Declaration / familiarisation form linked to the visit | T-13, T-32 | missing | familiarisation templates exist (`training` module) | Link form submission to visit; drives readiness | P1 | S |

### Employment (§4.10, §3.29, §3.30, §6.23)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| E1 | Vacancies list (vessel, search, status default Active) | §4.10 | partial | `VacanciesPage.tsx`, `useRecruitment.ts` (draft / open / on_hold / filled / cancelled) | Fleet-level placement; vessel filter | P1 | S |
| E2 | New vacancy wizard: vessel first; 1 role & terms (title, position, department, employment type, start, end for fixed-term, salary + currency + per, salary visibility, region, port hidden when identity hidden, offer approver); 2 requirements from the vessel's crew-compliance config; 3 review & publish | §4.10, §3.40 | partial | `vacancies` has title, rank, department, contract_type, start/end, salary min/max + currency, required_certificates[], rotation_pattern, vessel_id | Wizard; salary period + visibility; region/port + hide identity; offer approver rule; requirement auto-fill; publish targets | P1 | M |
| E3 | Upcoming hiring needs (from contracts ending, rotation planner, scheduled transfers, manning minimums) with View suggested candidate, Create draft vacancy, Remind me later, Dismiss | §4.10, §6.23 | missing | sources exist: `crew_contracts`, rotation planner, `vessels.minimum_safe_manning` | Suggestion engine + list | P1 | L |
| E4 | Candidates | §4.10 | partial | `CandidatesPage.tsx`, `candidates`, `candidate_applications`, `interviews`, `application_events` | Link to vacancy wizard and offer approval | P1 | S |
| E5 | Employing companies (legal employer on contracts, agreements, payslips; chosen per vessel) | §3.30, §4.10 | missing | no table; `companies` is the tenant | Entity, CRUD, vessel link, contract / payroll link | P1 | M |
| E6 | Employment compliance ("what needs attention today") | §4.10 | partial | `RightToWorkPage.tsx` compliance matrix; `hr_expiry_items` | Fleet roll-up: contracts unsigned / ending, probation ending, right-to-work gaps | P1 | M |
| E7 | Payroll overview per currency, never converted, drafts excluded, gated on payroll access | §4.10, §2.7 | partial | `PayrollCostOverview.tsx`, `PayrollPage.tsx` (gated `payrollLevel`) | Fleet tab view reusing the component | P1 | S |

### Navigation and cross-cutting

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| X1 | Fleet nav matches the target IA | §4 | complete (P3W1) | `sitemap.ts` lines 82–97 | Add Training / Medical / Visits / Employment; repoint Dashboard, Reports, Calendar, Documents, Forms; drop Scheduler | P0 | S |
| X2 | Unified expiry engine (expired / ≤30 / ≤90 / endorsement due / overdue; per-type windows; vessel attribution) | Exec summary §1, §6.2 | complete (P3W1) | `hr_expiry_items` view; `hr_generate_alerts()`; certificate hooks | One fleet view across vessel certs, crew docs, crew quals, insurance with vessel_id resolved via current assignment. Boundary and null rules: DECISIONS D-31 (valid through the expiry date, so the expiry day is "≤ 30 d" with 0 days and the next day is Expired; a null date is "no expiry", and crew-document callers flag a missing date upstream). The TS engine and SQL `expiry_bucket()` share the boundary fixture in `src/test/lib/records/expiry.test.ts` | P0 | M |
| X3 | Vessel "counted" flag (demo / inactive vessels excluded from fleet totals) | §7.13 | complete (P3W1) | `vessels.status`, `operational_status` (`FleetMap` excludes `Sold`) | Explicit rule used by every fleet query | P1 | S |
| X4 | Activity notifications + email with deep links | §7.1, T-252 | partial (P3W1) | `alerts`, `notification_types`, `send-email` (unused from `src/`) | W1 and W3 in-app done (W3 completion also to HR viewers, D-383); W2 form-template publish and overdue notices open for X5 wave 2 (D-383); email waits for C3 (D-249) | P0 | M |
| X5 | Permission keys for the new fleet pages | §2 | complete (P3W1) | `storm.json` domain `fleet` has dashboard, scheduler, tracker, reports, calendar, documents, checklists | Add training, medical (T3), visits (T2), employment (recruitment, employers, payroll T3) | P0 | S |

---

## Workflows & state machines

All transitions below are enforced **server-side** (Postgres function or edge function), never by a client `update` of a `status` column. Every transition writes an event row (actor, from, to, comment, timestamp) and emits a notification event.

### W1. Fleet document publish and acknowledge (§6.18, image29)

**Document states**

| State | Meaning | Enter by |
|---|---|---|
| Empty slot | A document type exists in a section with nothing published | Type created in Settings |
| Draft | File uploaded, not yet visible to crew | Upload → Save draft |
| Published (vN) | Visible in each targeted vessel's Safety › Fleet Documents | Publish |
| Superseded | Replaced by a newer version; kept read-only with its acknowledgements | Publishing vN+1 |
| Withdrawn | Removed from vessel menus; kept for audit | Withdraw (with reason) |

**Acknowledgement states** (one row per person × document version × vessel)

| State | Rule (STORM definition) |
|---|---|
| Pending | Person is a current member of a targeted vessel and is eligible to sign |
| Overdue | Pending and `now > due_at`. `due_at` = later of (publish time, person's join date on that vessel) + `ack_due_days` (default 14, set per document type, overridable per document) |
| Blocked | Person is targeted but cannot sign: no app login, not in the vessel's signer set, or account suspended. The UI must say which |
| Acknowledged | Person confirmed they read it (self), or it was recorded on a shared device witnessed by an eligible officer |
| Not required | Person left the vessel before acknowledging, or the version was marked "minor — no re-acknowledgement" |

**Transitions**: Pending → Acknowledged; Pending → Overdue (time); Overdue → Acknowledged; Pending/Overdue → Blocked (eligibility change); Blocked → Pending (fixed via "Choose who can sign" or login created); any open state → Not required (person leaves vessel, or document withdrawn). Publishing a new **major** version creates fresh Pending rows; a **minor** version carries existing acknowledgements forward.

**Who can act**

| Action | Who |
|---|---|
| Create sections / types, publish, withdraw, version | Fleet admins with `fleet.operations.fleet_documents` edit |
| Choose who can sign (per vessel) | Fleet admins; vessel Master for their vessel |
| Acknowledge (self) | Any targeted, eligible crew member |
| Record a witnessed acknowledgement | Master, HOD (HOD preset includes "acknowledge fleet documents", §2.2) for their own department, on a shared device; records the witness |
| Remind | Fleet admins (any vessel), Master / HOD (own vessel / department) |

**Notifications**: on publish → in-app item to every Pending person (email digest daily, not one per document); at `due_at − 3 days` → reminder; on Overdue → person + their HOD; weekly digest to fleet admins listing overdue by vessel. Manual reminders (person / vessel / all outstanding) are logged with sender and time and rate-limited to one per person per 24 h.

**Delete rules**: drafts can be deleted. A published document with any acknowledgement can only be withdrawn. Sections can only be deleted when they hold no types with documents; types only when empty.

### W2. Checklist / form template lifecycle (§6.19, image30)

| State | Meaning |
|---|---|
| Draft | Saved, not offered to crew. A template with an empty section or no items cannot leave Draft |
| Published (vN) | Offered on its target vessels. Version auto-increments if left blank; the admin may type a controlled-document number instead |
| Hidden on vessel X | Published but switched off for one vessel (per-vessel setting, not a template state) |
| Superseded | An older version; existing runs stay attached to the version they used |
| Archived | No longer offered anywhere; runs remain readable |

**Transitions**: Draft → Published (Create / Publish); Published → Draft vN+1 (Edit creates a new draft version; the live version keeps running); Draft vN+1 → Published (supersedes vN); Published → Archived; per vessel Shown ↔ Hidden (Restore visibility). **Customise** on a platform-standard template creates a company copy (Draft, `origin = company`, `source_template_id` set) and, on publish, hides the standard on the same vessels.

**Targets**: "All vessels (including future)" stores one account-wide template that new vessels inherit; "Selected vessels" stores explicit vessel ids and new vessels do not inherit.

**Who can act**: fleet admins with `fleet_checklists` admin manage templates fleet-wide; crew with "Can manage vessel checklists" (§2.3) may hide / restore and reorder on their own vessel; crew with module Read & Write run them.

**Runs**: a run records template version, vessel, who completed it, answers, comments, attachments; if "requires a signature on completion" is on, the run cannot complete without the completer's signature. Cadence (daily … five-yearly) generates due dates feeding the calendar and the overdue counts.

**Notifications**: new or changed template published to a vessel → vessel's HODs; run overdue against cadence → assigned role.

**Delete rules**: drafts deletable; any template with runs can only be archived.

### W3. Training application (§6.13, image10)

STORM keeps its richer model and maps the reference statuses onto it.

| STORM state | Reference equivalent | Notes |
|---|---|---|
| Draft | — | Crew saves without submitting |
| Submitted | submitted | Eligibility checks run (`useEligibility.ts`, `rulesEngine.ts`) |
| HOD review | submitted (awaiting HOD) | Approver must hold "approve as HOD" and the applicant's department must be in their training scope (empty scope = all) |
| Final review | hod approved | Captain and/or Purser (policy decides parallel-both vs either-one; Open questions) |
| Approved / Approved (discretionary) | approved | Discretionary requires justification text |
| Enrolled | — | Booking confirmed |
| Completed | completed | Evidence uploaded; creates/renews the crew qualification (expiry = completion + course "valid for" months) |
| Reimbursed | (reimbursement no longer "Pending completion") | Expense claim paid; starts the clawback window for Professional / Extracurricular |
| Closed | closed | Month marked reported, or nothing further due |
| Returned | — | Sent back for changes with a mandatory comment; applicant edits and resubmits → Submitted |
| Rejected | rejected | Final; reason required |
| Cancelled | cancelled | By applicant before approval; by final approver after approval (reason required) |
| Voided | — | Entered in error; hidden from registers and totals; Captain / Purser / fleet admin only; reason required (T-201) |

**Edits by approvers** (T-200): HOD, final approvers, HR and fleet admins can correct fields at any open stage; each change writes a diff to the application event log and notifies the applicant.

**Stale applications**: anything waiting more than 7 days at one stage appears in "Awaiting approval > 7 days" with the approver level, and the fleet training admin gets a weekly digest.

**Clawback**: when a person's employment ends with an end date inside `clawback_months` of a reimbursement for a Professional or Extracurricular course, a clawback is raised automatically: amount = reimbursed × (months remaining in window ÷ window months). Company-required and Mandatory categories are exempt. Fleet admins can settle or waive (reason required).

**Monthly report**: per month, list applications and totals; "Mark as reported" stamps the month and its applications; later edits to a reported month raise a "changed after reporting" flag.

**Notifications**: each transition notifies the next actor and the applicant; completion notifies HR; clawback raised notifies HR and finance.

**Delete rules**: Draft deletable by the applicant; everything else Voided, never hard-deleted.

### W4. Recruitment: hiring need → vacancy (§6.23, image34)

**Hiring need suggestion**

| State | Enter by |
|---|---|
| Suggested | Nightly job finds a gap: contract ends with no successor, rotation planner slot unfilled, scheduled transfer out, or projected on-board count below the position's minimum |
| Snoozed | "Remind me later" (pick 7 / 14 / 30 days); reappears after |
| Dismissed | "Dismiss" with reason; the same source event is not suggested again |
| Converted | "Create draft vacancy" (pre-filled with vessel, position, from-date) |

**Vacancy** (existing STORM statuses): Draft → Open (publish) → On hold ↔ Open → Filled | Cancelled. Only Draft can be deleted (already enforced in `useRecruitment.ts`). Requirements are copied from the vessel's crew-compliance configuration at creation and can be edited before publishing. Offers need approval per the vacancy's rule: none, or Purser (Captain if the vessel has no Purser). Vessel identity can be hidden in published adverts; the port is then suppressed.

**Who can act**: HR / crewing (HR edit), fleet admins; Captain / Purser for offer approval on their vessel.

**Notifications**: new suggestions in a weekly crewing digest; offer awaiting approval → approver; vacancy filled → vessel HOD.

### W5. Medical case (§6.27) — fleet-view slice only

The case form itself belongs to the SMS-forms gap doc. The Fleet view must list open cases and enforce these triggers (STORM rules, from T-42):

| Fitness for duty | Time off | Trigger |
|---|---|---|
| Fit | — | none |
| Not fit | < 24 h | none |
| Not fit | 24–72 h | "Company review required" flag on the case |
| Not fit | > 72 h, or signed off on medical leave | "Flag-state notification may be required" prompt; company records whether sent, date, by whom, response, attachments |

States: Open → Under treatment (append-only treatment log) → Outcome recorded → Notifications done (if triggered) → Signed by Master / MPIC → Company reviewed → Closed. Health data is special-category data: only medical access (see `docs/HEALTH.md` access model) sees clinical detail; the fleet list shows case number, vessel, status, fitness flag and days open only.

### W6. Visit (new, §3.28 / §5.1.11 / T-32)

| State | Meaning |
|---|---|
| Planned | Visit created with expected embarkation |
| Onboard | Embarkation recorded |
| Disembarked | Disembarkation recorded |
| Cancelled | Did not happen |

Classification is separate: Pending review → Occasional worker | Passenger | Supernumerary. Readiness = all of: passport on file and valid for the visit, declaration / familiarisation form completed, classification decided. A person "Available to the fleet" can be found and given visits by any vessel; otherwise only the creating vessel sees them. Who: vessel crew with Crew Read & Write add visits; fleet admins add fleet visits. Notifications: visit starting tomorrow with readiness incomplete → Master and Safety Officer. Delete: Planned visits can be deleted; others cancelled. Person records with past visits cannot be deleted, only anonymised through GDPR.

### W7. Calendar events (§3.22, §5.7)

Generated events are read-only projections of their source and link to it; their status (Due soon ≤ 30 days / Overdue / Completed) comes from the source. Custom events: create / edit / delete by their creator or anyone with Read & Write on the event's category module; a custom event with category "None" is visible to everyone on that vessel (or fleet-wide if no vessel). Category decides visibility through module permissions.

### W8. Fleet medical status computation (§4.8, rules not captured — STORM defines them)

Per current crew member (assignment `is_current = true`), evaluated nightly and on change; thresholds stored in a company setting.

| Status | Any of |
|---|---|
| Critical | ENG1 (or accepted equivalent) expired or missing; a vaccine marked required for the vessel expired; ≥ 1 serious rest breach in the last 30 days (< 4 h in 24 h or < 50 h in 7 days, §6.14) |
| At risk | ENG1 expires ≤ 30 days; booster due ≤ 90 days; any rest non-compliance in 30 days; an occupational health check overdue |
| Incomplete | No vaccination record at all; no occupational health record; ENG1 on file without expiry date |
| OK | none of the above |

The grid shows the reasons as chips so the status is explainable. Non-ENG1 medical certificates recognised as equivalent (T-185) count toward ENG1.

### W9. Dashboard KPI definitions

| Tile | Value | Sub-text parts | Red when |
|---|---|---|---|
| Document alerts | expired vessel certs + expired crew documents + expired crew qualifications + endorsements overdue + items expiring (vessel certs ≤ 90 d, passports ≤ 9 months, other crew documents ≤ 3 months, crew quals ≤ 90 d) | each count separately | any expired or overdue |
| Hours of rest | breach days across vessels with HoR switched on | breaches, near threshold, crew with no entries, vessel count | any breach |
| Leave overdue | crew beyond the MLC leave limit (company setting; default 11 months continuous on board) | — | > 0 |
| Safety | open corrective actions + overdue drills | each count | any overdue |
| Technical | overdue jobs + jobs pending approval | each count | any overdue |
| Finance | overdue invoices (only with Finance enabled) | — | > 0 |

Every number is a link to the matching report with the filter applied.

---

## Data model

| Entity | Key fields | Existing STORM table(s) | Notes |
|---|---|---|---|
| Fleet group | name, colour, description, vessels | `fleet_groups`, `vessels.fleet_group_id` | Admin page is a placeholder today |
| Vessel counted flag | `is_counted_in_fleet` (bool, default true) | `vessels` (add column) | Excludes demo / inactive vessels from fleet totals (§7.13) |
| Vessel position | vessel_id, timestamp_utc, lat, lon, sog, cog, heading, nav_status, **destination, eta, draught, last_port**, source | `ais_snapshots` (add the bold columns) + NEW view `vessel_latest_position` | Written by a scheduled `ais-refresh` with a real provider |
| Fleet KPIs | per tile: value + component counts | NEW RPC `fleet_dashboard_kpis(p_vessel_ids uuid[])` | Replaces client sums in `FleetDashboardView`; respects vessel reach via RLS / security invoker |
| Expiry item | source (vessel_cert, crew_document, crew_qualification, insurance, contract…), record_id, vessel_id, person_id, label, expiry_date, endorsement_due_date, bucket, days | `hr_expiry_items` (crew only, vessel_id often NULL) | NEW view `fleet_expiry_items` unioning certificates, crew docs/quals (vessel via current `crew_assignments`), insurance; per-type windows from a settings table |
| Expiry window rule | item type, warn_days | NEW `expiry_window_rules` (company_id, item_type, warn_days) | Seed: passport 270, other crew docs 90, certs 90, quals 90 |
| Report definition | key, group, title, description, module chip, permission key, component | code registry `src/modules/fleet/reports/registry.ts` | No table needed |
| Calendar event (custom) | company_id, vessel_id (null = fleet), category (none, certificates, safety, crew, technical, charter, vessel), title*, description, location, starts_on*, ends_on, all_day (default true), start_time, end_time, timezone, created_by | NEW `calendar_events` | RLS by category → module permission |
| Calendar feed | source_type, source_id, vessel_id, category, title, date, status, link | NEW view / RPC `fleet_calendar_feed(from, to, vessel_ids, categories)` | Unions certs, insurance, drills, crew joins / leaves (`crew_assignments`), travel, maintenance due, audits / surveys, itinerary / charter, form schedules, training course dates, custom events |
| Fleet document section | company_id, name, sort_order | NEW `fleet_document_sections` | Replaces use of global `document_categories` for fleet documents |
| Fleet document type | section_id, name, sort_order, ack_required_default, ack_due_days_default, hide_when_empty | NEW `fleet_document_types` | Seed from §4.5 sections, renamed generically |
| Fleet document | type_id, crew-facing title, file, version_label, version_kind (major / minor), effective_date, target_mode (all_including_future / selected), ack_required, ack_due_days, status (draft / published / superseded / withdrawn), published_at, withdrawn_reason | `documents` (+ new columns), `document_versions` | Keep `documents` as the store; fleet documents identified by `type_id IS NOT NULL` |
| Document vessel target | document_id, vessel_id | NEW `document_vessel_targets` | Empty + `target_mode = all_including_future` means every counted vessel |
| Acknowledgement | document_id, document_version_id, vessel_id, user_id, acknowledged_at, method (self / witnessed), witnessed_by, ip_address | `document_acknowledgments` (+ vessel_id, version, method, witness) | Unique (document_version_id, vessel_id, user_id) |
| Acknowledgement status | person × version × vessel → pending / overdue / blocked / acknowledged / not_required, due_at, blocked_reason | NEW view `document_ack_status` | Basis for the Acknowledgements tab and dashboard counts |
| Signer rule | vessel_id, document_type_id (nullable), rule (all_crew_with_login / hod_and_above / positions / named_users), positions[], user_ids[] | NEW `document_ack_signer_rules` | "Choose who can sign" |
| Reminder log | document_id, vessel_id, user_id (null = all outstanding), sent_by, sent_at, channel | NEW `document_ack_reminders` | Rate limiting + audit |
| Checklist template | name, area, category, description, cadence, requires_signature_on_completion, version, target scope, sections / items (item: type, label, required, allow_comment, allow_attachments), status, origin (platform / company), source_template_id | `form_templates` (+ `area`, `cadence`, `requires_completion_signature`, `origin`, `source_template_id`), `form_schema` JSON for items | `form_schedules` stays for assignment-based schedules |
| Template vessel setting | template_id, vessel_id, visibility (shown / hidden), sort_order, hidden_by, hidden_at, reason | NEW `form_template_vessel_settings` | Drives "On k of n vessels" |
| Checklist run | template_id, template_version, vessel_id, status, completed_by, completed_at, signature | `form_submissions` | Aggregate per template × vessel for last-run and overdue |
| Course (catalogue) | name, category (required / mandatory / professional / extracurricular), department grouping, duration, pathway, valid_for_months, renew_from_months, applies_to_departments[], applies_to_positions[], is_mandatory, renewal_note, notes, is_active, origin (catalogue / proposed), proposed_by | `development_courses` (+ rule columns) and `training_courses` | Merge into one catalogue (Open questions) |
| Training application | existing fields + `rejected_at`, `rejection_reason`, `voided_at`, `void_reason`, `cancel_reason` | `development_applications` | Add `rejected` and `voided` statuses |
| Application event | application_id, actor, action, from_status, to_status, comment, field_diff jsonb, created_at | NEW `development_application_events` | Audit + notifications source |
| Training budget | company_id, year, amount, currency, vessel_id (nullable), department (nullable), set_by, set_at | NEW `training_budgets` | Committed = approved not yet completed; actual = reimbursed |
| Policy settings | accommodation cap, per diem, mileage per mile / km, upfront split threshold, online hours per neutral day, clawback months, FX overrides | `program_settings` (+ mileage, fx_overrides jsonb) | Delete hard-coded constants in `development/constants.ts` |
| Clawback | application_id, crew_member_id, reimbursed, window end, remaining obligation, triggered, settled / waived | `development_repayments` | Created on reimbursement; triggered by employment end |
| Monthly report | company_id, month, application_count, total_usd, reported_by, reported_at | NEW `training_monthly_reports` (or reuse `reported_to_fleet_at` per application) | Locks the month |
| Crew medical status | profile_id, vessel_id, eng1_status, eng1_expiry, vaccines_valid / expired / missing, boosters_due_90d, rest_noncompliant_30d, occ_health_overdue, has_condition, has_allergy, status, reasons[] | NEW view or nightly table `crew_medical_status` over `med_fitness_assessments`, `med_vaccinations`, `med_health_checks`, `work_rest_compliance_checks`, `med_conditions`, `med_allergies` | Expose only status / dates to non-clinical fleet roles |
| Occupational health check | person_id, check_type (dental, hearing, annual_health, spirometry, dive_medical, submersible_medical, occ_health_review), last_done_on, interval_months, next_due_on, optional, provider, notes | NEW `med_health_checks` | Reminder schedule per type |
| Medical case | case number per vessel and year, fitness for duty, time-off band, triggers, notifications, signatures, closure | `med_consultations` (+ SMS-form wrapper); `medical_reports` (unused; retire or merge) | Owned by SMS-forms gap doc |
| Visitor person | company_id, full_name*, category*, category_other, employer, nationality, passport number / country / issue / expiry, phone code + number, email, notes, available_to_fleet, home_vessel_id, profile_id (when the person is an admin / shore staff user), photo_path, passport_scan_path | NEW `visitor_people` | Passport fields are sensitive (T2); profile link reuses existing users |
| Visit | person_id, vessel_id, function, embark_at, disembark_at, status, classification, declaration_submission_id, familiarisation_submission_id, readiness (computed), created_by | NEW `vessel_visits` | Excluded from crew compliance, HoR and manning |
| Vacancy | existing + salary_period, salary_visibility (hidden / figures / range), region, port, hide_vessel_identity, offer_approver_rule (none / purser_else_captain), requirements_snapshot jsonb, publish_targets[] | `vacancies` | `contract_type` maps to employment type (permanent, rotational, temporary, relief, day work, plus operator-specific types, T-52) |
| Hiring need | vessel_id, position, needed_from, source (contract_end / rotation / transfer / manning_minimum), source_ref, suggested_candidate_ids[], status, snoozed_until, dismissed_reason, vacancy_id, dedupe_key | NEW `hiring_need_suggestions` | Generated nightly |
| Candidate / application | existing | `candidates`, `candidate_applications`, `interviews`, `application_events` | — |
| Employing company | company_id, legal_name*, trading_name, registration_number, country, registered_address, tax_id, payroll_reference, contact_email, signatory role, logo_path, is_active | NEW `employing_companies` | `vessels.employing_company_id`, `crew_contracts.employing_company_id`, payroll runs carry it |
| Payroll overview | per currency: gross, net, headcount; drafts excluded | existing payroll tables + `PayrollCostOverview` | Never convert currencies |

---

## Improvements over the reference

1. **Acknowledgements that actually get done** (T-79: the reference showed only a handful of acknowledgements recorded against hundreds outstanding). Must-read inbox on the crew home and the vessel dashboard, one-tap acknowledge on mobile, automatic reminders (not only manual), witnessed acknowledgement on a shared device for crew without logins, and re-acknowledgement only for major versions.
2. **Visible rules.** The reference never shows what makes an acknowledgement "overdue" or "blocked", or how medical status is computed (§10). STORM shows the due date, the blocked reason and the medical status reasons inline.
3. **Deep links everywhere** (T-252). Every notification email and every dashboard number opens the exact record or the pre-filtered report, with a short excerpt in the email.
4. **Correct alert counting.** Today STORM's tile ignores expired items; the reference counts expired, endorsement and expiring separately. STORM will count all and split them in the sub-text, using per-type windows (passport 9 months) that admins can change.
5. **Fast reports.** The reference's report pages take 10–20 s and the medical page 25–40 s (§4.3, §4.8). STORM computes report data in SQL functions / nightly tables, uses skeletons, and caches per filter.
6. **Editable training catalogue** (T-149) with rules that drive expiry and requirement matrices, and one catalogue instead of STORM's two.
7. **Approver corrections with audit** (T-200), **void entered-in-error applications** (T-201), and a soft nudge to HODs before final approval (pattern from T-148).
8. **Clawback that runs itself.** Raised automatically on employment end, instead of a manual watch list.
9. **Medical rigour** (T-8, T-42, T-185): a standard vaccine list with boosters, occupational health checks with automated crew reminders, ENG1-equivalent certificates counted correctly, and fitness-for-duty bands that prompt company review and flag notification.
10. **Occasional workers as their own person type** (T-32, T-13): on the onboard list and exports, clearly labelled, excluded from crew compliance, HoR, SEA and manning, with the declaration form linked to the visit.
11. **Forms hygiene** (T-14, T-12, T-134, T-112, T-51, T-4): hide unused templates fleet-wide, vessel-specific variants, move a template between areas without rebuilding it, a "why can't this person see this form" diagnostic, and a built-in document change request form linked to HESS.
12. **Real tracker.** Real positions with a stale-fix warning instead of the hashed demo coordinates STORM shows today.
13. **Calendar you can subscribe to.** Per-user ICS feed, "Show these" quick filter, leave events hidden when the account has leave switched off (T-10).
14. **Hours of rest report** (T-292) and **forecast crew list** (T-306) as first-class fleet reports; more status options in report filters (T-248).
15. **Bulk document upload** (T-132) into the section / type taxonomy.
16. **Design**: STORM's own visual language (pastel KPI tiles already in `FleetKPITiles.tsx`, cards, dark-mode-ready tokens). Do not copy the reference's layout pixel for pixel; keep its information hierarchy (tiles → ranked lists → activity).

---

## Implementation notes

**Module and routes**

- Create `src/modules/fleet/` with `pages/` (FleetDashboardPage, FleetTrackerPage, FleetReportsPage, FleetReportPage, FleetCalendarPage, FleetDocumentsPage, FleetFormsPage, FleetFormsAreaPage, FleetTrainingPage, FleetMedicalPage, FleetVisitsPage, FleetEmploymentPage), `components/`, `hooks/`, `reports/registry.ts`, and `routes.tsx` exporting `fleetRoutes`.
- Register `{fleetRoutes}` in `src/routes/index.tsx` **before** `PLACEHOLDER_LEAVES` (same pattern as `hrisRoutes`). Add `'/fleet/'` to `IMPLEMENTED_PREFIXES` in `sitemap.ts` once the pages exist, otherwise a static placeholder can outrank a dynamic route (comment at `sitemap.ts` lines 659–662).
- Update the Fleet children in `sitemap.ts` and run `node scripts/permissions/check-storm-coverage.mjs`. Add catalogue subcategories `fleet_training`, `fleet_medical` (T3), `fleet_visits` (T2), `fleet_employment` (`recruitment`, `employers`, `payroll` T3) to `docs/permissions/catalogues/storm.json` and regenerate workbooks.
- Redirect legacy paths: `/fleet-map` → `/fleet/tracker`; `/vessels/dashboard?view=fleet` → `/fleet/dashboard`. Delete `FleetSubNav.tsx` (it duplicates the sidebar and links to non-existent `/analytics` and `/calendar`).

**Reuse**

| Need | Reuse |
|---|---|
| Fleet dashboard tiles / matrix | `FleetKPITiles.tsx`, `VesselHealthMatrix.tsx`, `RegionMapCard.tsx` (swap `vesselCoord` for real positions) |
| Vessels and vessel reach | `useVessels`, `VesselContext` (`isAllVessels`, `canAccessAllVessels`), `useVesselFilter` |
| Expiry | `hr_expiry_items` + `hr_generate_alerts()` pattern; certificate hooks in `src/modules/certificates/hooks` |
| Alerts / notifications | `alerts` table + `useAlerts.ts`; `notification_types`; `send-email` edge function (wire it up — nothing in `src/` calls it today) |
| Charts | Recharts patterns in `DevelopmentAdmin.tsx`, `analytics/components/*` |
| Report card + CSV | `hris/components/reporting/ReportCard.tsx`, `hris/lib/reports.ts`; extract a shared `src/shared/lib/csv.ts` and replace the three copies |
| PDF | `src/shared/hooks/usePDFExport.ts`, `src/lib/documentExport.ts` |
| Forms builder | `ism/forms/pages/CreateTemplate.tsx`, `FieldEditor.tsx`, `FieldRenderer.tsx`, `SignaturePad.tsx`, `useFormTemplates.ts`, `useFormSubmissions.ts`, RPCs `form_sign_submission` / `form_pending_signatures` |
| Documents | `UploadDocumentModal.tsx` (extend scope radio to multi-select), `DocumentTable.tsx`, `DocumentViewerModal.tsx`, `useAcknowledgments.ts`, `DocumentAcknowledgementsPage.tsx` |
| Training | everything in `src/modules/development`; `ApplicationDetailModal.tsx` for review; `program_settings` via `useProgramSettings.ts` |
| Medical | `useFitnessStatus`, `VaccinationsPage.tsx` data hooks, `useScreening.ts`, `PersonClinicalBanner.tsx`; access via `resolveMedicalAccess` / `med_fitness_can_view` |
| Recruitment | `useRecruitment.ts`, `VacanciesPage.tsx`, `CandidatesPage.tsx`, `CrewPicker.tsx`; payroll via `PayrollCostOverview.tsx` |
| Calendar | grid logic in `crew/pages/VesselCalendar.tsx` (generalise to multi-vessel + week view) |

**Migrations (new files, never edit applied ones)**

1. `fleet_expiry_items` view + `expiry_window_rules`; fix `get_vessel_dashboard_summary` (or add `fleet_dashboard_kpis`) so expired items count.
2. `calendar_events` + `fleet_calendar_feed` RPC.
3. `fleet_document_sections`, `fleet_document_types`, `document_vessel_targets`, `document_ack_signer_rules`, `document_ack_reminders`; columns on `documents` and `document_acknowledgments`; `document_ack_status` view; functions `publish_fleet_document`, `acknowledge_fleet_document`, `remind_fleet_document`.
4. `form_templates` columns + `form_template_vessel_settings`.
5. `development_courses` rule columns (or merge with `training_courses`), `development_application_events`, `training_budgets`, `training_monthly_reports`; function `development_transition(application_id, action, payload)` replacing client-side status updates; trigger to create `development_repayments` on reimbursement and raise clawback on employment end.
6. `med_health_checks`; `crew_medical_status` view.
7. `visitor_people`, `vessel_visits`.
8. `employing_companies`; `vessels.employing_company_id`; `crew_contracts.employing_company_id`; `hiring_need_suggestions` + nightly job; vacancy columns.
9. `vessels.is_counted_in_fleet`; `ais_snapshots` columns; `vessel_latest_position` view.
10. Regenerate `src/integrations/supabase/types.ts` after each.

**Pitfalls**

- `get_vessel_dashboard_summary.certs_expiring_90d` uses `BETWEEN CURRENT_DATE AND CURRENT_DATE + 90` — expired certificates are silently dropped. Do not reuse it for Document alerts.
- `hr_expiry_items` returns `vessel_id = NULL` for passports, visas, medicals and crew certificates; resolve vessel through the current `crew_assignments` row or fleet reports will not filter by vessel.
- `useAcknowledgmentStats` divides by every active profile in the company, so shore staff and crew of untargeted vessels inflate "pending". Base it on targeted vessels' current crew.
- `document_categories` has no `company_id`; adding company sections there would leak across tenants. Use new tables.
- Training status changes are plain client `update`s in `useDevelopmentMutations.ts`; RLS alone cannot enforce order or department scope. Move to a SECURITY DEFINER transition function and restrict direct `status` updates.
- Two course catalogues (`development_courses`, `training_courses`) will drift; pick one before building TR7.
- `development/constants.ts` hard-codes policy numbers and an operator-specific category label; read from `program_settings` / a label setting.
- Medical grid must not expose clinical fields to fleet roles that only hold fitness access (`docs/HEALTH.md`); show status and dates only, and only condition / allergy *flags* where consent allows.
- Visitor passport data shared "to the fleet" is visible to every vessel; default it off and log access (GDPR gap doc).
- Fleet pages must exclude vessels with `is_counted_in_fleet = false` consistently (§7.13) — put the filter in the SQL functions, not in each component.
- Large fleet reports: paginate server-side; do not pull whole tables to the client as `CrewCertificatesOverview.tsx` does today.

**Build order inside this domain**: X1/X5 nav + permissions → X2 expiry engine → D1–D10 dashboard → FD1–FD9 documents → R1/R2/R4/R9 reports → FC1–FC4 forms → TR4/TR7/TR9 training core → M1 medical grid → C1–C5 calendar → V1–V5 visits → E2/E3/E5 employment → tracker (T1–T3, needs provider decision) → remaining P1/P2.

---

## Open questions

1. **Acknowledgement rules**: default due period (14 days proposed) and whether it runs from publish or from the person joining; should crew without app logins acknowledge via a witnessed shared device, or be "blocked" until they have a login?
2. **Major vs minor versions**: who decides whether a new document version needs re-acknowledgement — the publisher per upload, or a per-type default?
3. **One training catalogue**: merge `training_courses` (STCW / certification) and `development_courses` (crew development) into one catalogue, or keep two with a shared rule model?
4. **Final training approval**: keep STORM's parallel Captain **and** Purser approval, or adopt "either Captain or Purser" as in the reference?
5. **Counted vessels**: which vessels are excluded from fleet totals (demo, laid-up, sold, under build)?
6. **AIS provider** and refresh frequency (cost per vessel), and whether region maps group by admin-defined fleet groups or by live position.
7. **Leave**: the operator hid leave features (T-10). Should the Leave Overdue tile and leave calendar events be an account-level toggle, and what MLC limit should drive "overdue"?
8. **External crew-document register** (the reference's crew-pass-style sync): in scope, and with which provider?
9. **Emissions & Fuel**: in scope for STORM v1, given it needs voyage and fuel data first?
10. **Medical status thresholds**: who owns them (fleet doctor / DPA), and which vaccines are required per vessel or itinerary?
11. **Visitor data sharing**: should "available to the fleet" be allowed to share passport details, or only name and category?
12. **Employing companies**: is the signatory a named person or a role; are payslips issued per employing company?
13. **Fleet Scheduler**: remove it from the Fleet nav, or define what it is (it has no counterpart in the blueprint)?
14. **Training category labels**: keep four fixed categories with account-editable labels, or let accounts add categories (affects clawback exemptions)?
