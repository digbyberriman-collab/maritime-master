# Vessel view: Certificates and Technical — gap analysis

> Spec for implementers. It compares the rebuild blueprint (v1.3) of the reference app with STORM as the code stands today, and states what STORM must build for the vessel **Certificates** module and the vessel **Technical** module (jobs / planned maintenance, maintenance periods, surveys, technical forms, documents and plans, deck plans, rounds, equipment, inventory, purchase orders, overview, external viewers). Requirements are written as STORM requirements in our own words. Blueprint sections are cited as `§n.n`.
>
> Depends on: `01-foundations-tenancy-roles.md` (vessel routes `/v/:vesselCode/…`, `has_capability`, `vessel_module_settings`, external membership kind, "the Company" actor), `02-fleet-view-operations.md` (`fleet_expiry_items` + `expiry_window_rules`, calendar feed, fleet reports, Forms & Checklists builder), the SMS forms / signatures doc (ordered signatures, company sign-off, corrective actions) and `04-vessel-crew.md` (positions, departments, teams).

---

## Scope

**Blueprint sections covered**

| § | Topic | Notes |
|---|---|---|
| Exec summary | Certificates and Technical module lists; expiry and signature engines; external viewers role | Build order puts certificates 4th and technical 8th |
| §1.5, §1.6 | Certificate / technical routes; identifiers `P0050` (job), `SRV-YYYY-NNN` (survey) | We use path routes per doc 01 |
| §2.4, §3.40 (AccessSet) | Module levels None / Read Only / Read & Write for Certificates and Technical | Mapped to PMS capabilities below |
| §3.8 | Vessel certificate entity | |
| §3.16, §3.17, §3.18 | Maintenance job, external viewer, survey, maintenance period, round, technical form, technical document type, deck plan, equipment | |
| §3.39 | Equipment, inventory item, purchase order, supplier, job completion, quote, maintenance period (full) | |
| §5.3 | Certificates sidebar, list layout, detail page, Add Certificate dialog, section contents | |
| §5.4.1–§5.4.12 | Technical: jobs, viewers, maintenance periods, surveys, technical forms, documents & plans, deck plans, rounds, settings, equipment, inventory, purchase orders, overview | |
| §5.8 (Certificates Report, Compliance Pack items 3–4) | Report data contract only | Report page owned by the reports doc |
| §6.2 | Expiry and endorsement buckets for certificates | Engine owned by doc 02 |
| §6.11, §6.12, §6.26, §6.28, §6.30, §6.31 | Job, technical form, period wizard, external viewer, job completion, purchase order state machines | |
| §7.1, §7.2, §7.4, §7.5, §7.7, §7.14 | Notifications, calendar sources, exports, uploads, Deck Plans add-on, external viewers | Only the parts these modules emit |
| §8.9 | Notification types: Certificates (3), Technical (12) | |
| §4.1, §4.3 (Fleet Certificates, Insurance, Audit & Survey, Work List, Vessel Comparison › Technical) | Fleet roll-ups | We define the data views; pages live in doc 02 |
| §10.1, §10.2 | Not captured: maintenance period detail, PO lines/statuses, supplier and quote forms, running a round, recurrence, running-hours thresholds, equipment Readings tab, Technical Dashboard, technical form fields, vessel logbook | We specify our own behaviour and flag it as a STORM decision |

**Screenshots / diagrams viewed:** `image8.png` (§6.11 job states), `image9.png` (§6.12 technical form states), `image36.png` (§6.26 period wizard), `image24.png` (§6.28 viewer access), `image25.png` (§6.30 completion side effects), `image26.png` (§6.31 PO). `image3.png` is indexed to §5.4.2 but is only a rendered fragment of the currency list (no page screenshot).

**Support tickets:** all 142 scanned; about 20 bear on this domain (technical forms vs checklists, sign-and-route forms, bunker forms, external maintenance system overlap, critical equipment list, isolation certificate, tablet machinery checks, certificate notifications and verification, deck plan requests, noon-report engine set-up). Themes are in "Improvements over the reference".

**STORM paths inspected (code read, not just names)**

- Certificates module: `src/modules/certificates/pages/{Certificates,CertificateAlerts,CrewCertificatesOverview}.tsx`, `components/{VesselCertificatesTab,CompanyCertificatesTab,CrewCertificatesTab,AddCertificateModal,CertificateDetailModal}.tsx`, `hooks/{useCertificates,useCrewCertificates}.ts`, `constants.ts`
- Edge function: `supabase/functions/review-certificate/index.ts`, `supabase/config.toml` (`verify_jwt = false`)
- Maintenance module: `src/modules/maintenance/pages/{Maintenance,CriticalEquipment,SpareParts,MaintenanceDefects}.tsx`, `components/{EquipmentRegisterTab,MaintenanceScheduleTab,TaskTemplatesTab,TaskTemplateModal,CreateTaskModal,DefectsTab,LogDefectModal,RunningHoursTab,SparePartsTab,AddEquipmentModal,EquipmentDetailModal}.tsx`, `hooks/useMaintenance.ts`, `constants.ts`
- Yard › Refit: `src/modules/refit/routes.tsx`, `lib/db.ts`, `components/SimpleModule.tsx`, `pages/{purchase-orders,inventory,suppliers,contractors,schedule,works,drawings}.tsx`
- Yard › New Build (reusable patterns): `src/modules/new-build/pages/{DeckPlan,PurchaseOrders,Suppliers,Equipment,Import}.tsx`, `components/import/{ColumnMapper,FileUploadZone,ImportPreview}.tsx`
- Logbooks: `src/modules/logbooks/lib/{logbookApi,catalog,templates,dagonEngineLog}.ts`, `docs/LOGBOOKS.md`
- Form engine: `src/modules/ism/forms/{constants.ts,hooks/useFormSubmissions.ts,components/SignaturePad.tsx}`, `src/modules/ism/pages/AuditsSurveysPage.tsx`, `src/modules/audits/{constants.ts,hooks/useAudits.ts}`, `src/modules/documents/pages/Drawings.tsx`, `src/modules/compliance/pages/InsurancePage.tsx`
- Navigation and routes: `src/config/sitemap.ts` (lines 152–180, 202–230, 600–680), `src/routes/index.tsx` (certificates lines 532–545, maintenance 657–666, logbooks 188–196, refit/new-build 809–818)
- Migrations: `20260125222557_*` (`certificates`, `certificate_alerts`), `20260125231938_*` + `20260125232043_*` (`equipment_categories`, `equipment`, `maintenance_task_templates`, `maintenance_tasks`, `defects`, `running_hours_log`, `spare_parts` and RLS), `20260130103423_*` / `20260130103848_*` (`get_vessel_dashboard_summary`), `20260125163105_*` (`documents` storage bucket), `20260617180527_*` + `20260919170000_nb_company_scope.sql` (`nb_*`), `20260917200100_logbook_meridian_books.sql` (logbook entry guard), `20260919210000_ism_form_workflow.sql` (form signing RPCs), `20260919220000_reference_numbers.sql` (`reference_counters`)
- Edge functions also read: `idea-sync`, `extract-form-fields` (name only), `send-email` (name only)
- Generated types (grepped): `certificates`, `certificate_alerts`, `equipment`, `equipment_categories`, `maintenance_tasks`, `maintenance_task_templates`, `defects`, `spare_parts`, `running_hours_log`, `audits`, `audit_findings`, `documents`, `document_versions`, `form_templates`, `form_submissions`, `form_signatures`, `nb_purchase_orders`, `nb_purchase_order_activity`, `nb_suppliers`, `nb_equipment`, `nb_decks`, `nb_deck_views`, `nb_deck_rooms`, `nb_drawings`, `vessels`
- Standards: `docs/permissions/catalogues/storm.json` (vessel › certificates, technical, logbooks subcategories; SoD-09), `docs/permissions/addenda/storm.md`

### Headline findings from the code

1. **The certificate register is a flat, company-wide table with the wrong shape.** `certificates` mixes vessel, crew (`user_id`) and company (`DOC`) certificates under a fixed type/category list (`constants.ts`: DOC / Statutory / Class / Crew / Equipment). There are no sections, no certificate types to configure, no endorsement dates or windows, no verified flag, no version history (only a `superseded_by` link written by a `renewCertificate` mutation that nothing in the UI calls), no related documents and no archive. `status` is computed in the browser at write time (`calculateCertificateStatus`) and stored, so it goes stale the next day.
2. **The vessel Certificates sidebar is all placeholders.** The 11 section leaves in `sitemap.ts` (Status Summary, Registration, Class / Tonnage / Loadline, …) generate Coming Soon pages; only "Fleet Certificates" points at `/certificates`. On that page the **Class** and **Flag State** tabs render the same unfiltered `VesselCertificatesTab` as **Vessel**, and **All** shows vessel certificates only. In `CertificateDetailModal.tsx` the **Edit** and **Renew** buttons have no handler and "Alert History" is a placeholder.
3. **Certificate files cannot be opened.** `uploadCertificateFile` stores into the private `documents` bucket and saves `getPublicUrl(...)`, which a private bucket refuses. The bucket also caps files at 25 MB and accepts only PDF, DOCX, XLSX, PNG and JPEG (the target is 50 MB including HEIC, WebP, DOC, XLS).
4. **`review-certificate` is an orphan with a tenancy hole.** No client calls it. It accepts any certificate id + vessel id and, with the service role, approves, renews or rejects it after checking only that the caller's legacy `profiles.role` is `dpa`. It never checks that the certificate belongs to the caller's company. It writes the audit trail into free-text `notes` and sets `status = 'Rejected'`, a value outside the status vocabulary.
5. **Expiry alerts are written but never sent.** `useCertificates` inserts `certificate_alerts` rows (90/60/30/7/0 days) from the browser; no job, trigger or edge function reads them. The vessel dashboard RPC counts certificates "expiring in 90 days" with `BETWEEN CURRENT_DATE AND …`, so expired certificates are not counted.
6. **The real PMS core is `/maintenance`, and it is not vessel-scoped.** `useMaintenance` loads every equipment item, job, defect and part in the company (RLS by company only); none of the maintenance or certificate code reads `VesselContext`. Jobs (`maintenance_tasks`) must have equipment (`equipment_id NOT NULL`, `ON DELETE CASCADE`, so deleting equipment deletes its job history) and a due date (`due_date NOT NULL`), so unscheduled jobs and jobs without equipment are impossible. `task_number` is globally `UNIQUE` and generated in the browser from the length of the loaded array (`MAINT-YYYY-NNN`), so it collides across tenants and races.
7. **Completion is a status flip.** `handleCompleteTask` sets `status = 'Completed'` and a timestamp. There is no completion dialog, no logbook entry, no stock deduction and no next occurrence. Task templates say they "automatically generate work orders", but no generator exists anywhere (no edge function, trigger or client code). `calculateNextDueDate` is never called. "Overdue" is only a badge drawn in the browser for `Pending` tasks; nothing stores or computes it server-side.
8. **The nav's Technical leaves point at mock or broken pages.** "Equipment" → `/maintenance/critical` = `CriticalEquipment.tsx`, which renders a hard-coded `mockCriticalEquipment` array. `/maintenance/defects` (`MaintenanceDefects.tsx`) is localStorage mock data. `/maintenance/spares` (`SpareParts.tsx`) orders by a non-existent column (`name`), so the query always fails and the page falls back to hard-coded parts; it also maps columns that do not exist (`quantity`, `unit`, `category`, `is_critical`). Tasks, Operational Checklists, Inventory, Purchase Orders, Maintenance Periods and Surveys are Coming Soon.
9. **Yard › Refit cannot run against STORM's database.** Its pages (purchase orders, inventory, contractors, schedule, works orders, drawings) read `rf_*`, `change_orders` and `crew_requests`, but none of those tables has a migration in this repo or appears in the generated types. Every page hits a "relation does not exist" error. Yard › New Build, by contrast, has real company-scoped tables for suppliers, purchase orders (with an activity log), equipment, deck views and deck rooms (polygon zones) and drawings. These are good patterns, but they are scoped to a project, not a vessel.
10. **Surveys do not exist.** `/ism/audits-surveys` renders the ISM `Audits` page, whose types are Internal and External Initial / Annual / Intermediate / Renewal. It has no class, flag or PSC survey types, no survey windows, no class society, no costs and no certificate link.
11. **Useful engines already exist.** (a) The **form engine** (`form_templates` / `form_submissions` / `form_signatures`), with server-side signing and rejection RPCs, vessel scoping (`vessel_scope`, `vessel_ids`), `required_signers` and `amendment_of_id`. It is the right base for technical forms, checklists and registers, but it has no "technical" area. (b) The **Logbooks** module, whose engine-room book already has a "Maintenance, defects & I/O events" section and a "Machinery rounds" section, plus a guarded insert path. (c) **`reference_counters` / `next_reference_value`** for atomic per-vessel numbering.
12. **The dashboard RPC is wrong for this domain.** As written in its migrations, `get_vessel_dashboard_summary` counts `maintenance_tasks.vessel_id`, `maintenance_tasks.company_id`, `defects.company_id` and `defects.severity`, none of which exist, and compares against lowercase `'overdue'` / `'open'` while the app writes `Overdue` / `Open`. Check the deployed definition, which is also edited outside migrations.
13. **External maintenance system stub.** `supabase/functions/idea-sync` returns mock data and upserts into `idea_defects_cache` / `idea_equipment_cache`, which do not exist. No UI calls it. It matters because the fleet already runs an external maintenance system (see tickets).

---

## Target information architecture

### Principles

- **Vessel view owns the work; Fleet view owns the catalogue and the roll-ups.** Every record in this domain belongs to one vessel (`vessel_id NOT NULL`), except account-level catalogues (certificate types, technical form templates, document types, job library, suppliers).
- **Sections are data, not code.** The certificate sidebar and the Technical Documents & Plans sections come from the database, per vessel, in the order set in Settings. `sitemap.ts` lists one dynamic "Certificates" group whose children are loaded at runtime.
- **Sub-modules can be switched off per vessel.** A vessel that runs its planned maintenance in another system turns off Jobs, Periods, Inventory and Purchase Orders. They disappear completely, not greyed out (tickets on hiding unused technical items). Equipment stays available because certificates, rounds, the critical equipment list and deck plans rely on it.
- Routes follow doc 01: `/v/:vesselCode/…`, stable English slugs, tabs and filters in query params.

### Vessel view — Certificates (`/v/:vesselCode/certificates`)

```
Certificates
├─ Status Summary                  /v/dra/certificates                         all sections, tiles + table (default)
├─ <one leaf per visible section>  /v/dra/certificates/s/:sectionSlug          same list layout, filtered to that section
│     seeded defaults (see Open question 1):
│     Registration · Class, Tonnage & Load Line · Safety (SOLAS) · Security (ISPS) · ISM · MLC ·
│     Environment (MARPOL) · Radio & Navigation · Insurance · Yacht > 300GT · Yacht > 400GT ·
│     Yacht > 500GT · Auxiliary Craft · Safety Equipment – FFE · Safety Equipment – LSA ·
│     Means of Embarkation · Medical · Lifting Equipment · Fiscal · Various · Audit & Survey Reports
├─ Certificate                     /v/dra/certificates/c/:certificateId?tab=current|versions|supporting|endorsements|supplements|activity
├─ Settings                        /v/dra/certificates/settings                 sections, types, hide/unhide, add certificate
└─ (Report)                        /v/dra/reports/vessel-certificates           page owned by reports doc; data from this doc
```

### Vessel view — Technical (`/v/:vesselCode/technical`)

```
Technical
├─ Overview                 /v/dra/technical                                   landing; KPI tiles, jobs by status/priority, upcoming periods & surveys; PDF
├─ Jobs                     /v/dra/technical/jobs?tab=calendar|hours|history&view=list|board|plan&group=…&status=…
│   ├─ New job              /v/dra/technical/jobs/new
│   ├─ Job                  /v/dra/technical/jobs/:jobRef                     e.g. /jobs/P0050
│   └─ Import               /v/dra/technical/jobs/import
├─ Maintenance Periods      /v/dra/technical/periods
│   ├─ New period (wizard)  /v/dra/technical/periods/new?step=1..5
│   └─ Period               /v/dra/technical/periods/:periodId?tab=jobs|milestones|surveys|budget|files|viewers
├─ Surveys                  /v/dra/technical/surveys, /surveys/new, /surveys/:surveyId
├─ Equipment                /v/dra/technical/equipment?view=list|plan&critical=1
│   ├─ New equipment        /v/dra/technical/equipment/new
│   ├─ Equipment            /v/dra/technical/equipment/:equipmentId?tab=overview|jobs|parts|surveys|readings
│   └─ Log readings         /v/dra/technical/equipment/readings              one sheet for all hour meters
├─ Inventory                /v/dra/technical/inventory?view=list|plan, /inventory/new, /inventory/:itemId
├─ Purchase Orders          /v/dra/technical/purchase-orders, /purchase-orders/:poId
├─ Rounds                   /v/dra/technical/rounds, /rounds/new, /rounds/:roundId, /rounds/:roundId/runs/:runId
├─ Forms & Checklists       /v/dra/technical/forms?tab=forms|checklists|registers|history, /forms/:submissionId
├─ Documents & Plans        /v/dra/technical/documents, /documents/:docTypeId
├─ Deck Plans (add-on)      /v/dra/technical/deck-plans, /deck-plans/:deckId
├─ Viewers                  /v/dra/technical/viewers                          invite / revoke / view log
└─ Settings                 /v/dra/technical/settings?tab=general|modules|documents|categories|checklists|integrations
```

The reference's "Dashboard" sub-nav item (not captured, §10.2) is merged into **Overview**. STORM's separate **Defects** list is folded into Jobs as category "Repair / Defect" (Open question 4).

### External viewer portal (outside the app shell)

```
/viewer/accept/:token     accept invitation, enrol authenticator
/viewer/sign-in           email + authenticator code
/viewer/:vesselCode/work-list[?period=:periodId]      read-only job list + job detail drawer
```

### Fleet view (this domain's entries only)

| Fleet page | Route | Owner |
|---|---|---|
| Certificate catalogue (account-wide sections and types, per-vessel applicability matrix, "apply to entire fleet") | `/fleet/admin/certificates` | **this doc** |
| Suppliers directory (shared by all vessels' purchase orders and quotes) | `/fleet/admin/suppliers` | **this doc** |
| Job library (account templates to copy into vessels) | `/fleet/admin/job-library` | **this doc** (replaces today's `TaskTemplatesTab`) |
| Technical form and checklist templates | `/fleet/forms?area=technical` | doc 02 builder; this doc defines the technical behaviour |
| Fleet Certificates, Insurance, Audit & Survey, Work List reports; Vessel Comparison › Technical | `/fleet/reports/:tab` | doc 02; data views defined here |
| External viewers across all vessels | `/fleet/admin/users/viewers` | doc 01; data defined here |

### Nav and legacy route changes

| Today | Target |
|---|---|
| `sitemap.ts` `vesselCertificates` (12 static leaves, 11 placeholders) | One dynamic group fed by `certificate_sections` for the active vessel, plus Status Summary and Settings |
| `sitemap.ts` `vesselTechnical` (8 leaves: Summary → `/maintenance/dashboard`, Equipment → `/maintenance/critical` mock, 6 placeholders) | The tree above, filtered by `vessel_module_settings` sub-module keys and capabilities |
| `/certificates`, `/certificates/vessel` | Redirect to `/v/:code/certificates` (fleet users → `/fleet/reports/fleet-certificates`) |
| `/certificates/alerts` | Redirect to Status Summary with `?status=attention` |
| `/maintenance`, `/maintenance/dashboard` | `/v/:code/technical` (`?tab=schedule` → `/jobs`) |
| `/maintenance/critical` | `/v/:code/technical/equipment?critical=1` |
| `/maintenance/spares` | `/v/:code/technical/inventory` |
| `/maintenance/defects` | `/v/:code/technical/jobs?category=repair` |
| `/ism/audits-surveys` | Stays for ISM audits; adds a link to Technical › Surveys |

---

## Feature inventory

Status values follow the brief: complete / partial / placeholder / missing.

### Certificates

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| C1 | Data-driven section register per vessel (sections, order, hide), dynamic sidebar | §5.3, §3.8, §3.35 | placeholder | `sitemap.ts` L152–167 (static leaves → Coming Soon); `constants.ts` fixed type/category lists | `certificate_sections` (account default + vessel override), dynamic nav group, default seed on vessel creation | P0 | M |
| C2 | Certificate types per section; hide / unhide per vessel; empty "Not uploaded" slots | §5.3 (Settings, Add Certificate) | missing | — | `certificate_types`, per-vessel type settings, slots shown as "Not uploaded" until a version exists | P0 | M |
| C3 | Status Summary / section list: tiles (Expired, Endorsement overdue, Expiring ≤30d, Endorsement due, Expiring ≤90d, Valid) + Not uploaded + No expiry; search; filters; "N of M"; Clear all; columns Certificate (Verified tag, status dot, ×N), Section chip, Doc No., Start, Endorsed, Next endorsement window, Expiry; sorting | §5.3, §5.8 | partial | `Certificates.tsx` (4 tiles: total / expiring / expired / next); `VesselCertificatesTab.tsx` (name, number, authority, issue, expiry, status; vessel dropdown) | Bucket tiles, endorsement columns, verified tag, instance count, section chip, sort, filters, vessel scope from route | P0 | M |
| C4 | Status computed on read, never stored; per-type windows; precedence | §6.2, §3.8 | partial | `constants.ts` `calculateCertificateStatus` stored at write time | SQL `certificate_status()` used by the list, the dashboard and `fleet_expiry_items` (doc 02) | P0 | S |
| C5 | Endorsement window: endorsed date, next window start/end, due / overdue, record an endorsement | §3.8, §5.3 | missing | only `next_survey_date` | Version fields + rule-based window per type + "Record endorsement" action | P0 | M |
| C6 | Certificate detail page: breadcrumb, section chip, countdown, status; Upload New, Archive; current file (view / download / delete); facts (Doc No., Start, Expiry, Uploaded) | §5.3 | partial | `CertificateDetailModal.tsx` (modal; Edit / Renew without handler; delete) | Routed page, tabs, working actions | P0 | M |
| C7 | Versioned uploads: Upload New makes a new current version, older ones kept read-only; instance count ×N | §5.3, exec summary | partial | `renewCertificate` mutation (`superseded_by`), not wired to UI; `review-certificate` renew branch | `vessel_certificate_versions`; Versions tab; diff of dates | P0 | M |
| C8 | Related documents tabs: Supporting, Endorsement, Supplement | §5.3 | missing | — | `vessel_certificate_documents` with kind; uploads per tab | P0 | S |
| C9 | Verification: Verified tag; verify / reject with note; edit resets to Pending; decision notification | §3.8, §8.9, tickets on verification | partial | `review-certificate` (orphan, DPA-only, no company check) | Verification columns on version, RPC with tenant and capability check, UI, reset-on-edit trigger | P0 | S |
| C10 | Archive (retire a certificate type or instance without losing history) | §5.3 | missing | hard delete only (`deleteCertificate`) | Archive state; delete limited to an uploader's unverified mistake (see W1) | P1 | S |
| C11 | Certificates Settings: sections (add, rename, reorder, hide), types (add, rename, hide, delete if unused), **Add Certificate** dialog (section, name, apply to entire fleet) | §5.3 | missing | `AddCertificateModal.tsx` is a data-entry wizard, not a type manager | Settings page + fleet catalogue page | P0 | M |
| C12 | Exports: PDF register, Excel, Download All (ZIP of current files), Full report link; Compliance Pack items "Certificates register" and "Certificate files" | §5.3, §5.8, §7.4 | missing | `jspdf`, `jspdf-autotable`, `exceljs` installed | Export service + ZIP built by an edge function | P1 | M |
| C13 | Expiry / endorsement notifications and calendar events | §7.1, §7.2, §8.9 | partial | `certificate_alerts` rows inserted from browser, never sent; `CertificateAlerts.tsx` lists from `certificates` | Scheduled sweep, three notification types, feed into the calendar | P0 | M |
| C14 | Insurance section carries policy facts (insurer, broker, policy no., cover) that drive Vessel › Insurance and the fleet Insurance report | §3.3, §5.6.3, §4.3 | placeholder | `compliance/pages/InsurancePage.tsx` (static config, no DB) | Insurance metadata on Insurance-section versions; one source of truth for policy end date | P1 | M |
| C15 | Vessel register holds vessel certificates only (crew → crew module; company DOC → fleet) | §3.7, §3.8 | partial | `certificates` mixes `vessel_id`, `user_id`, company rows; `CrewCertificatesTab`, `CompanyCertificatesTab` | Data migration; crew rows to `crew_certificates` (doc 04); company rows to a fleet "Company certificates" list | P0 | S |
| C16 | Applicability suggestions from vessel particulars (GT band, flag, commercial status) | — (STORM improvement) | missing | `vessels.gross_tonnage`, `flag_state` exist | Type rules `applies_when`; "suggested for this vessel" chips in Settings | P2 | S |
| C17 | Assisted read of an uploaded certificate (prefill number and dates for the user to confirm) | §7.10 (assisted pre-fill pattern) | missing | `ScanLine` icon imported but unused; `extract-form-fields` edge function exists | Reuse extraction; user confirms every field | P2 | M |

### Technical — Jobs (planned maintenance)

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| J1 | Vessel-scoped job register; per-vessel reference `P0001` allocated by the server | §5.4.1, §1.6 | partial | `maintenance_tasks`; `CreateTaskModal.tsx` L59 builds `MAINT-YYYY-NNN` from array length; `task_number` globally UNIQUE | `vessel_id`, `job_ref` via `next_reference_value('job:<vessel>')`, unique per vessel; keep old numbers as `legacy_ref` | P0 | S |
| J2 | New Job form: name*, description (≤1000), regulations (≤1000), tags, priority Low/**Medium**/High/Critical, schedule type Calendar/Running hours, equipment (optional), due date, assign to position / crew member / teams, location on board + place on plan, photos; More options: department, category (14), maintenance period, recurring, requires approval, cost & supplier (accounting category, duration weeks, job card scope), attachments, checklists | §5.4.1, §3.16 | partial | `CreateTaskModal.tsx` (equipment*, type*, priority Low/Normal/High/Urgent, name*, due*, scheduled, assignee, description) | All other fields; equipment and due date optional | P0 | M |
| J3 | Status machine: Unscheduled, Pending approval, Scheduled, In progress, On hold, Completed, Cancelled; Overdue and Due soon derived | §6.11, §3.16 | partial | `TASK_STATUS` (Pending, Scheduled, In_Progress, Completed, Overdue, Cancelled); no approval, no on hold; overdue drawn in browser | Server-enforced transitions (W2), CHECK constraint, derived flags | P0 | M |
| J4 | Tiles On track / Due soon (7d) / Overdue / Pending approval / Unscheduled; tabs Calendar jobs / Running hours / History with the blueprint columns | §5.4.1 | partial | `Maintenance.tsx` tiles (equipment, overdue, critical defects, due this week, low stock) | Job tiles and tabs | P0 | S |
| J5 | Toolbar: search; status filter; sort (due, ID, title, category, est. cost, status); group by (department, urgency, period, category, none); List / Board / Plan; saved views; export | §5.4.1, §7.10 | partial | `MaintenanceScheduleTab.tsx` (list, month calendar, kanban; status / type / priority filters) | Group by, sort, search, plan view (add-on), saved views per user, CSV/Excel export | P1 | M |
| J6 | Running-hours jobs: due at hours, current, remaining, overdue by hours, due-soon threshold | §5.4.1, §6.11 | partial | `due_running_hours`; `RunningHoursTab.tsx` writes `running_hours_log` + `equipment.running_hours_total` | Remaining calculation, hours-based states, Running hours tab | P0 | M |
| J7 | Recurrence: calendar interval and/or hours interval ("whichever first"), basis (from completion or fixed), next due rolled on completion | §6.11, §3.16 (rule not captured, §10.1) | partial | `maintenance_task_templates`, `TaskTemplatesTab.tsx` (no generator); `calculateNextDueDate` unused | Recurrence fields on the job + roll-forward in `complete_job` (W3) | P0 | L |
| J8 | Job detail page: Back; Follow, Export PDF, Delete, Edit, Copy, Mark Complete; chips (ID, status, priority, schedule type); facts; panels Quotes, Description, Checklists, Photos & videos, History, Reports, Notes (@mentions), Linked resources (equipment card), Required parts | §5.4.1 | missing | `EquipmentDetailModal.tsx` only lists tasks | Full page | P0 | L |
| J9 | Complete Job dialog (Completed on, prefilled today) → logbook entry, parts deducted once, next occurrence | §5.4.1, §6.30 | partial | `handleCompleteTask` sets status + timestamp | `complete_job` RPC (W3) | P0 | M |
| J10 | Requires approval before work starts | §5.4.1, §6.11 | missing | — | Flag, approver capability, approve / decline actions, notification | P1 | S |
| J11 | Quotes: add, compare side by side, accept one | §5.4.1, §3.39 | missing | — | `job_quotes` + compare view; accepted quote sets estimated cost and supplier | P2 | M |
| J12 | Required parts linked to inventory | §5.4.1, §6.30 | partial | `maintenance_tasks.spares_used` JSON; template `required_spares text[]` | `job_required_parts` with item FK and quantity; reservation display | P1 | M |
| J13 | Notes with @mentions, posted reports (text + photos), followers, history timeline | §5.4.1 | missing | — | `job_activity`, `job_followers`; notifications | P1 | M |
| J14 | Photos and videos (take a photo, ≤ 50 MB video, offline queue), location on board | §5.4.1, §5.4.9, §7.5 | missing | `attachments text[]` unused by UI | Media table, private bucket, offline upload queue | P1 | M |
| J15 | Import jobs from spreadsheet | §5.4.1, §7.5 | missing | `xlsx`; New Build `ColumnMapper`, `FileUploadZone`, `ImportPreview` | Import wizard with mapping, preview, dry run, error report | P1 | M |
| J16 | Copy job; Export job card PDF; delete rules | §5.4.1, §8.10 | missing | — | See W2 delete rules | P1 | S |
| J17 | Checklists on a job (picked from technical checklist templates, run inside the job) | §5.4.1 | missing | form engine exists | `form_submissions.job_id`; checklist panel | P1 | M |
| J18 | Assign to position and teams (not just a person) | §5.4.1 | partial | `assigned_to_id` only | `assigned_position_id`, `team_ids[]`; "My jobs" resolves through current position | P1 | S |
| J19 | Defects as jobs (STORM extra) | — | partial | `defects` table + `DefectsTab`/`LogDefectModal` real; `MaintenanceDefects.tsx` localStorage mock | Migrate rows to jobs with category Repair; "raise corrective action" link for SMS-reportable defects | P1 | S |

### Technical — Maintenance periods

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| P1 | Period list with empty state and Create Period | §5.4.2 | placeholder | `sitemap.ts` "Maintenance Periods" → Coming Soon | List page (name, type, dates, status, progress, budget) | P1 | S |
| P2 | Five-step wizard: Basics (name*, description, start*, end*, yard location, contractor, project manager, type* (10), priority); Scope & budget (summary, budget, currency (12)) + live duration; Task assignment (category filter, select all); Sequencing & milestones (name*, target date*, description); Review + attachments | §5.4.2, §6.26, §3.39 | missing | Refit `schedule.tsx` (`rf_milestones`, tables missing); `nb_milestones` (project-scoped) | Wizard with draft autosave; creates period, links jobs, orders them, stores milestones | P1 | L |
| P3 | Period detail page (not captured in the reference): header, status, progress, ordered job list, milestones timeline, budget v. committed (quotes / POs) v. actual, surveys, attachments, viewers, tender work-list export | §5.4.2, §10.1 | missing | — | STORM design (see W4) | P1 | M |
| P4 | Period statuses and linkage (jobs, surveys, viewers scoped to one period) | §6.26, §5.4.3, §6.28 | missing | — | `maintenance_periods.status`; FKs from jobs and surveys | P1 | S |

### Technical — Surveys

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| S1 | Survey register: tiles Total / Overdue / Upcoming 90d / Completed; category and status filters; columns Survey, Category, Start, End, Status, Outcome, Findings, Certificate | §5.4.3 | missing | `audits` covers ISM audits only (`audits/constants.ts`) | `vessel_surveys` + page | P1 | M |
| S2 | Schedule survey: type* (14 coded), number (auto `SRV-YYYY-NNN`), category (7), location, description; class society (14), surveying body, surveyor name/contact; start*, end* (enabled after start), window start/end, next survey date; maintenance period, previous survey; fee, budgeted cost, total cost; certificate number, valid until, report and certificate links, attachments | §5.4.3, §3.17 | missing | — | Form with validation (W5) | P1 | M |
| S3 | Outcome and findings; conditions of class counted on Overview | §5.4.3, §5.4.12 | missing | `audit_findings` pattern | `survey_findings`; a finding of type Condition of Class can raise a corrective action of that type (SMS doc) | P1 | M |
| S4 | Survey ↔ certificate: completing a survey prompts for the new certificate version or endorsement; next survey scheduled | §5.4.3, §5.3 (Audit & Survey Reports section) | missing | — | Link `certificate_id`; "Record result" flow | P1 | M |
| S5 | Read a survey report (assisted extraction of findings and dates) | §5.4.3, §7.10 | missing | `extract-form-fields` | Optional, user confirms every field | P2 | M |

### Technical — Equipment

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| E1 | Equipment register: KPIs Total / Critical / Overdue jobs / Tracking hours; category + subcategory filters; search (name, manufacturer, model, serial, location); grouped by category; columns Equipment, Serial, Open jobs, Next due; expand all; export | §5.4.9 | partial | `EquipmentRegisterTab.tsx` (company-wide category tree); nav "Equipment" points at mock `CriticalEquipment.tsx` | Vessel scope, KPIs, subcategory grouping, nav repoint | P0 | M |
| E2 | Add equipment: name*, category (pick or type), subcategory (pick or type), parent equipment, location (pick or type), critical system, tracks running hours, manufacturer, model, serial, installation / manufacture / expiry dates, attachments | §5.4.9, §3.39 | partial | `AddEquipmentModal.tsx` (vessel*, category*, code*, location, manufacturer, model, serial, installation, warranty) | Parent, free-text subcategory, tracks-hours flag, manufacture and expiry dates; code optional | P0 | S |
| E3 | Equipment page: Add sub-equipment, Edit, Print label, Delete; tabs Overview / Jobs (n open) / Spare parts / Surveys / Readings; sub-equipment; location on plan; open work; photos and videos | §5.4.9 | partial | `EquipmentDetailModal.tsx` (info, tasks, defects) | Routed page and tabs | P0 | M |
| E4 | Critical system flag and Critical Equipment List register (signed to close, reopened to amend) | §5.4.4, §5.4.9, ticket on critical equipment list | placeholder | `CriticalEquipment.tsx` mock; `equipment.criticality` real column | Register built from flagged equipment (W7) | P0 | M |
| E5 | Readings tab: running hours and other meters (the reference content was not captured) | §5.4.9, §10.2 | partial | `running_hours_log`, `RunningHoursTab.tsx` | Generic readings (type, value, unit, source), bulk "Log readings" sheet, link to logbook machinery rounds | P1 | M |
| E6 | Print labels (QR per item, sheet of n) used by rounds and stock | §5.4.9, §5.4.10 | missing | — | Label PDF; stable `label_token` | P1 | M |
| E7 | Read nameplate (photo → manufacturer, model, serial for the user to confirm) | §5.4.9 | missing | — | Optional assisted extraction | P2 | M |
| E8 | Sub-equipment tree (parent / child) | §5.4.9, §3.39 | missing | — | `parent_equipment_id` + tree view | P1 | S |

### Technical — Inventory

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| I1 | Inventory page: KPIs Total / In stock / Low / Out; filters category, subcategory, location, stock; grouped by category; columns Item, Part #, Location, Sub-location, Photo, Qty / Min, Status, Actions; print labels; export | §5.4.10 | partial | `SparePartsTab.tsx` (real CRUD on `spare_parts`); `SpareParts.tsx` always shows mock data (bad `order('name')`) | Vessel-scoped page with these columns; delete the mock page | P1 | M |
| I2 | Add item: name*, part number, category, subcategory, manufacturer, location, sub-location, unit, qty on hand, min level, cost per unit, expiry date, supplier, supplier details, attachments, photo | §5.4.10, §3.39 | partial | `spare_parts` has name, number, qty, min, cost, location, supplier, manufacturer, notes | Category, subcategory, sub-location, unit, expiry, supplier FK, photo | P1 | S |
| I3 | Stock status computed: Out (0), Low (0 < qty ≤ min), In stock | §5.4.10 | partial | `stats.lowStockParts` (qty ≤ min) | Shared SQL function; Out v. Low split | P1 | S |
| I4 | Stock movements ledger (receive, consume on job completion, adjust with reason, transfer between locations or vessels) | §6.30 | missing | `spa_inventory_transactions` (Health) as a pattern | `stock_movements`; quantity derived or kept in sync by trigger | P1 | M |
| I5 | Plan view, labels, expiry alerts for perishable stock | §5.4.10, §7.7 | missing | — | Plan view with Deck Plans; expiry feeds notifications | P2 | S |

### Technical — Purchasing

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| PO1 | Purchase order list + Create dialog: supplier* (+ Add new), PO number* (auto), link to job (optional), notes | §5.4.11 | placeholder | nav → Coming Soon; Refit `purchase-orders.tsx` targets missing `rf_purchase_orders` | Vessel page and dialog | P1 | M |
| PO2 | Lines, totals, currency, statuses from Pending through to Paid, approval with separation of duties | §6.31 (intermediate states not captured) | missing | `nb_purchase_orders` + `nb_purchase_order_activity` (project-scoped pattern); `storm.json` SoD-09 | STORM state machine (W9) | P1 | M |
| PO3 | Suppliers directory (account level) | §3.39 | missing | `nb_suppliers` (project-scoped) | `suppliers` table + fleet page + inline Add new | P1 | S |
| PO4 | Receive goods into stock; costs roll up to job and period | §6.30, §5.4.2 | missing | — | Receipt creates stock movements; committed and actual cost views | P1 | S |

### Technical — Rounds, forms, documents, deck plans, overview, viewers

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| R1 | Round builder: name*, how often (Every watch, **Daily**, Weekly, Monthly, When needed), stops (where = equipment or zone, instruction), add / move / remove | §5.4.7, §3.18 | missing | Engine-room book "Machinery rounds" section (`templates.ts`) | `technical_rounds`, `round_stops` | P2 | M |
| R2 | Run a round on a phone: scan the stop label, record OK / issue / reading / photo, raise a job from an issue, complete | §5.4.7 (not captured, §10.1), ticket on tablet machinery checks | missing | — | `round_runs`, `round_run_stops`; mobile layout | P2 | L |
| F1 | Technical Forms tab: Monthly Technical Report (Chief Engineer signs and submits; superintendent signs off), Vessel Bunker Request (submitted; management acknowledges), Fuel Bunker Loading Report | §5.4.4, §6.12 | missing | Form engine; no technical area | Templates seeded at account level + W6 flows + routing email | P1 | M |
| F2 | Technical Checklists: chips All / In progress / Never run; grouped Daily / Weekly / Monthly / Quarterly …; columns Checklist, Runs; New per row; Manage checklists | §5.4.4 | placeholder | nav "Operational Checklists" → Coming Soon; ISM `ChecklistsPage.tsx` | Filtered form-engine view (`module = technical`) | P1 | M |
| F3 | Registers: controlled registers (Critical Equipment List) signed to close, reopened to amend; status Open; View details | §5.4.4 | missing | `form_submissions.amendment_of_id` exists | Register template type + revision flow (W7) | P1 | M |
| F4 | History tab with statuses Approved, Signed off, Completed and filters | §5.4.4 | missing | `FormsArchive.tsx` (ISM) | Technical history view | P1 | S |
| F5 | Fleet-governed technical templates: which vessels see each form; changes roll out as new versions | §4.6, tickets on technical forms | partial | `form_templates.vessel_scope`, `vessel_ids`, `version`, `supersedes_template_id` | `module` / `area` columns, roll-out rules, routing emails per template | P1 | S |
| D1 | Technical Documents & Plans: sections → document types; status Not uploaded / Uploaded / n versions; versioned files | §5.4.5 | missing | `documents` + `document_versions` (company document control), `Drawings.tsx`; Refit `drawings.tsx` (missing tables) | Vessel library of typed slots + versions | P1 | M |
| D2 | Technical Settings editor: add section, rename, move, per-type Add / Fleet / Edit / Hide / Delete | §5.4.8 | missing | — | Settings tab, account defaults + vessel overrides | P1 | S |
| DP1 | Deck plans: one general arrangement image per deck; zones and frame numbers (advanced) | §5.4.6, §7.7 | missing | New Build `DeckPlan.tsx`, `nb_deck_views`, `nb_deck_rooms` (project-scoped) | Vessel decks and zones, re-using the overlay component | P2 | L |
| DP2 | Pins and plan views: jobs, equipment, stock, permits, survey findings pinned; "Place on plan"; plan view in Jobs, Equipment, Inventory | §5.4.1, §5.4.6, §5.4.9, §5.4.10 | missing | — | `deck_pins` polymorphic | P2 | M |
| DP3 | Cabin acceptance (charter and crew accommodation) | §5.4.6, §4.15 | missing | — | Zone kind "cabin" + acceptance checklist; shared with Charter doc | P2 | M |
| DP4 | Add-on gating: trial, switch off, crew request flow | §5.4.6, §7.7, ticket on Deck Plans request | missing | — | Entitlement hook from doc 03; "Request add-on" notifies owners / admins | P2 | S |
| O1 | Technical Overview: tiles Overdue jobs (of active), Equipment (critical), Low stock (out), Pending POs, Overdue surveys, Conditions of class; Jobs by status and by priority; Upcoming periods; Surveys next 90 days; Download PDF | §5.4.12 | partial | `Maintenance.tsx` 5 tiles | Page with these widgets, each linking to a filtered list | P1 | M |
| V1 | Viewers: invite (name*, email*, company, who they are (5), what they can see (whole work list or one period), show estimated and invoiced costs) → 7-day link; list; revoke; empty state | §5.4.1, §6.28, §3.16 | missing | — | `technical_viewers`, invite edge function | P1 | L |
| V2 | Viewer portal: authenticator sign-in, view-only work list and job detail, costs hidden unless allowed, every view logged, expiry | §6.28, §7.14 | missing | doc 01 F36 (membership kind `external`) | Portal routes + view log + scoped RLS (W8) | P1 | L |

### Cross-cutting

| # | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| X1 | Vessel scope and module levels (None / Read Only / Read & Write) enforced in UI, routes and RLS | §2.4, §3.40 | partial | RLS checks company only; no vessel reach; `useMaintenance` unfiltered | `has_capability` (doc 01) in RLS for every table here; queries keyed by vessel | P0 | M |
| X2 | Per-vessel sub-module switches; external maintenance system mode | §5.4 (pass 2 vessel lacked items), tickets on hiding technical items | missing | `idea-sync` stub (mock, writes to missing tables) | `vessel_module_settings` keys `technical.jobs`, `.periods`, `.inventory`, `.purchasing`, `.surveys`, `.rounds`, `.deck_plans`; read-only mirror mode | P0 | M |
| X3 | Calendar events: certificate expiry and endorsement windows, job due dates, period start/end and milestones, survey dates and windows | §7.2, §5.7 | missing | — | Rows into doc 02's `fleet_calendar_feed` | P1 | S |
| X4 | Notifications: Certificates (3 types) and Technical (12 types), per-type recipients and frequency | §8.9, §7.1 | partial | `certificate_alerts` (unsent); `useNotificationCenter.ts` reads overdue tasks | Types registered with the notifications engine; emitters listed in Workflows | P1 | M |
| X5 | Job completion logged to the vessel logbook | §5.4.1, §6.30 | missing | Logbooks engine book "Maintenance, defects & I/O events" section; `logbookApi.saveLine` | Server-side draft line written by `complete_job`; pending queue (W3) | P0 | M |
| X6 | Files: ≤ 50 MB; PDF, JPG, PNG, WebP, HEIC, DOC(X), XLS(X); short videos; private buckets with signed URLs | §7.5 | partial | `documents` bucket private, 25 MB, 5 MIME types; `getPublicUrl` bug | New buckets `vessel-certificates`, `technical-files`, `technical-media`; signed URLs | P0 | S |
| X7 | Fleet roll-up views: Fleet Certificates, Insurance, Audit & Survey, Work List, Vessel Comparison › Technical, dashboard Technical tile | §4.1, §4.3 | partial | `get_vessel_dashboard_summary` (counts on non-existent columns) | Views `technical_work_list_v`, `vessel_surveys_v`, `certificate_register_v`; fix the RPC | P1 | S |
| X8 | Nav repoint, legacy redirects, retire mock pages, decide Refit schema | — | partial | `sitemap.ts`, `routes/index.tsx`, mock pages listed in headline 8; Refit tables missing (headline 9) | See "Nav and legacy route changes" | P0 | S |
| X9 | Permission catalogue entries for every page and action here | §2.4 | partial | `storm.json` vessel › certificates (12 static subcategories), technical (8) | Add rounds, forms, documents, deck plans, viewers, settings, costs visibility; certificates become one register subcategory with section-level sensitivity | P0 | S |

---

## Workflows & state machines

Roles below are STORM roles and capabilities (doc 01). "R&W" means the person has Read & Write on the module for that vessel. "Approver" capabilities are separate keys so they can be given without R&W on everything.

### W1. Vessel certificate (record, version, status, verification)

**Objects.** A *certificate* is a slot on a vessel for one certificate type (optionally one of several instances, e.g. "Tender 1", "Tender 2"). A *version* is one uploaded issue of it. Related documents hang off a version.

**Record states**

| State | Meaning | Enters when | Leaves when |
|---|---|---|---|
| Not uploaded | Type applies to the vessel, no version yet | Type added to the vessel (Settings, fleet catalogue, vessel creation seed) | First version saved |
| Current | Has a current version | Version saved | Archived |
| Archived | Retired (equipment removed, policy lapsed by decision) | R&W + reason | Restore (admin) |

**Computed status of the current version** (never stored; one SQL function used everywhere):

1. `Not uploaded` if no version.
2. `No expiry` if the version is marked permanent (e.g. registry, tonnage).
3. `Expired` if today > expiry date.
4. `Endorsement overdue` if the type requires endorsement, a window has closed and no endorsement was recorded inside it.
5. `Expiring ≤30d` if expiry is within 30 days (window per type; default 30).
6. `Endorsement due` if today is inside an open endorsement window with no endorsement recorded yet.
7. `Expiring ≤90d` if expiry is within 90 days (per type; default 90).
8. `Valid` otherwise.

The first matching rule wins. List tiles count by this status. "Attention" filter = rules 3–7.

**Endorsement windows.** Each type can define `endorsement_rule`: none, or annual with a window of ±N months around each anniversary of the issue (or expiry) date (default ±3 months). The system computes the next window from the version's dates and the last recorded endorsement. Recording an endorsement (date*, endorsing body, optional file to the Endorsement tab) closes the current window. An endorsement dated outside its window is accepted but flagged "endorsed outside window".

**Upload New (new version)** — R&W on Certificates for this vessel.
- Fields: document number (≤100 chars), issuing authority (pick from flag states and class societies or type), issue / start date*, expiry date* unless "No expiry", endorsement rule override (optional), file (≤ 50 MB; accepted types per X6). A version without a file is allowed but shows "File missing" and cannot be verified.
- Validation: expiry ≥ start; start not more than 1 day in the future (warning, not block, for pre-issued certificates); a new version whose expiry is earlier than the current version's needs a confirmation ("This is older than the current certificate").
- Effect: the previous version becomes *superseded* (read-only, still downloadable). The list shows "×N" when the slot has several *instances*, not several versions.

**Verification**
- New or edited version → `Pending`. Verifier (capability `vessel.certificates.register.approve`; by default account owner, account admins with reach and the DPA; see Open question 2) chooses **Verify** or **Reject** (reason required).
- **Verified** shows a tag in lists and the verifier's name and time on the detail page.
- Editing number, dates or file of a verified version resets it to `Pending` and notifies verifiers. Adding a supporting document does not reset it.
- Rejected → uploader notified with the reason; the version stays visible with a red tag until replaced or deleted.

**Archive and delete**
- Archive a slot: R&W + reason; hidden from lists and counts, kept for reports and the audit trail.
- Delete a version: only its uploader, only while `Pending` and within 24 hours (mistaken upload); otherwise archive or upload a new version. Delete a type in Settings: only when no vessel has a version of it; otherwise hide.

**Notifications** (Certificates module, three types)
1. *Certificate attention* (digest, default daily): crossing into Expiring ≤90d, ≤30d, Endorsement due, Expired, Endorsement overdue. To the vessel's certificate subscribers (default: Captain, Purser or Chief Officer, fleet admins with reach).
2. *Certificate verification required* (immediate): new or reset version. To verifiers.
3. *Certificate verification decision* (immediate): to the uploader.

**Calendar**: expiry date (category Certificates) and endorsement window start/end.

### W2. Maintenance job

**States**

| State | Stored | Meaning |
|---|---|---|
| Unscheduled | yes | No due date (calendar) and no due hours |
| Pending approval | yes | Created with "requires approval before work starts" |
| Scheduled | yes | Has a due date or due hours; approved if needed |
| In progress | yes | Work started |
| On hold | yes | Paused (reason required: awaiting parts, awaiting yard, weather, other) |
| Completed | yes | Non-recurring job done (moves to History) |
| Cancelled | yes | Withdrawn (reason required) |
| Overdue | **derived** | Open (Scheduled / In progress / On hold) and due date < today, or current hours ≥ due hours |
| Due soon | **derived** | Open and due within 7 days (vessel setting) or within the hours threshold (vessel setting, default 50 h) |
| On track | **derived** | Open, not Overdue, not Due soon |

**Transitions**

| From → To | Action | Who |
|---|---|---|
| (new) → Pending approval / Scheduled / Unscheduled | Create Job | R&W Technical |
| Pending approval → Scheduled (or Unscheduled) | Approve | `vessel.technical.tasks.approve` (default: HoD of the job's department, Chief Engineer, Captain, shore technical superintendent) |
| Pending approval → Cancelled | Decline (reason) | same |
| Unscheduled → Scheduled | Set a due date / hours | R&W |
| Scheduled → In progress | Start | assignee, anyone in the assigned position or team, R&W |
| In progress ↔ On hold | Hold (reason) / Resume | same |
| Scheduled / In progress / On hold → Completed or rolled to next occurrence | Mark Complete (W3) | same |
| Completed → In progress | Reopen (reason) | HoD of department, Chief Engineer, Captain |
| any open → Cancelled | Cancel (reason) | R&W who created it, HoD, Chief Engineer, Captain |

There is no transition "into" Overdue. It is a flag, so a job that becomes overdue keeps its working state (In progress and overdue is a real case).

**Recurrence (STORM rule; not captured in the reference).** A recurring job keeps one reference (`P0050`). Fields: calendar interval (n days / weeks / months / years) and/or hours interval; basis "from completion" (default) or "fixed schedule" (from the previous due date, for statutory cycles); when both intervals are set the job is due at whichever comes first. On completion the job records a completion (History) and rolls to the next due date / hours in `Scheduled`. A non-recurring job ends in `Completed`.

**Validation**: name 1–120 chars; description and regulations ≤ 1000; Running hours type needs equipment that tracks hours and due hours > current hours; intervals > 0; maintenance period on the same vessel and not Completed or Cancelled; assignee must have reach on the vessel; cost ≥ 0 with a currency (default from vessel settings).

**Delete rules**: delete allowed only for a job that has never been started, has no completions, no posted reports and no consumed parts (creator, HoD or admin). Otherwise Cancel. Equipment deletion never cascades to jobs: equipment is archived (see Pitfalls).

**Notifications** (Technical module): job awaiting approval (approvers, immediate); job assigned to you / your position / your team (immediate); jobs due soon and overdue (daily digest to assignees and department HoD); @mention (immediate); activity on followed job (batched 15 min); job completed (followers).

### W3. Job completion, stock and logbook (one server transaction)

`complete_job(job_id, completed_on date, hours_at_completion numeric null, note text null, media ids[] null)`:

1. Check capability and state (Scheduled, In progress, On hold). `completed_on` defaults to the vessel's local today, must not be in the future, and must not be before the job's creation date.
2. Insert `job_completions` (occurrence number, due date / hours at the time, completed on, hours, by, note).
3. **Stock**: for each required part, insert one `stock_movements` row (type `consume`, negative quantity) keyed by the completion id, with a unique constraint `(completion_id, item_id)` so it can never run twice. Reopening and re-completing the **same occurrence** does not deduct again (matches "first completion only"). Shortfalls are allowed (stock may go negative only to 0; the rest is recorded as "not taken from stock") and flagged.
4. **Logbook**: choose the target book from the job's department (Engineering, Electrical, etc. → Engine room book; Deck / Bridge → Deck book; vessel setting can override) and its "Maintenance, defects & I/O events" section. If the vessel has an open volume and the completer has a writing capacity for that book, insert a **draft** line: asset = equipment name / tag, event = "Maintenance", action = job reference + title + note, status = "Completed". The completer then signs it in the logbook under the logbook's own rules. Otherwise create a `pending_logbook_links` row and show "Waiting to be logged" on the job and in Logbooks › Review, where an engineer can adopt it. Never sign on the user's behalf.
5. **Recurrence**: roll the job forward (W2) or set `Completed`.
6. Notify followers. Return the completion id.

The dialog keeps the reference's one-tap default (date prefilled) and adds optional "hours at completion" (prefilled from the equipment meter for running-hours jobs), a note and photos.

### W4. Maintenance period

**Wizard (create only).** Steps 1–5 as in §5.4.2. STORM differences: the draft is autosaved per user (the reference loses everything if you leave before step 5). **Create period** is the only step that makes the period visible to others.

**Validation**: name*, start*, end* (end ≥ start), type* (Annual (default), Special survey, Major refit, Shipyard, Paint, New build, Commissioning, Warranty, Emergency, Other), priority (default Medium). Budget ≥ 0; currency required when a budget is entered. Duration = end − start + 1 days. Step 3 lists only open jobs on this vessel. A job already in another period shows that period's name, and choosing it moves it after confirmation. Milestone name* and target date* are required, and a target date outside the period dates shows a warning. Sequencing is drag-to-order over the selected jobs and is stored as `period_sequence`.

**States**: `Planned` (created) → `In progress` (automatically on the start date, or manually) → `Completed` (manual; open jobs must be completed, cancelled or moved to another period first, via a "carry over" step) | `Cancelled` (reason; linked jobs are unlinked, not cancelled).

**Who**: create and edit, R&W Technical; complete and cancel, Chief Engineer, Captain or a shore technical role with reach. The project manager (crew pick) receives period notifications.

**Outputs**: tender work list (PDF / Excel). Jobs in sequence with scope, location, attachments and the contractor's name as printed in the reference's hint. Crew names are omitted, and costs are included only on request. The period can be shared with external viewers (W8).

### W5. Survey

**States**: `Scheduled` (start in the future) → `In progress` (start ≤ today ≤ end; automatic) → `Completed` (outcome recorded) | `Postponed` (new dates required) | `Cancelled` (reason). **Overdue** is derived: not Completed and (window end, or end date if there is no window) < today. **Upcoming 90d** is derived: Scheduled and start within 90 days.

**Record result** (R&W): outcome (Passed, Passed with findings, Conditions imposed, Failed, Detained (PSC only)), findings (each: type Condition of Class / Recommendation / Observation / Deficiency / Detainable deficiency, description, due date, linked job or corrective action), total cost, report file, certificate number and valid-until. If a certificate is linked, the flow offers "Upload new certificate version" or "Record endorsement" on that certificate (W1). Next survey date creates a Scheduled survey of the same type if chosen.

**Validation**: type*; start*; end* ≥ start (disabled until start is set, as in the reference); window start ≤ window end; next survey date > end date; costs ≥ 0; survey number auto `SRV-YYYY-NNN` per vessel, editable before completion, unique per vessel.

**Notifications**: survey window opens; survey overdue; findings due in 7 days (to Chief Engineer and Captain, plus fleet technical subscribers).

### W6. Technical forms (form engine)

Built on `form_templates` / `form_submissions` / `form_signatures` and their RPCs. Each technical template declares its signer sequence, routing emails and company step.

| Form | States | Signers and actions | Routing |
|---|---|---|---|
| Monthly Technical Report | Draft → Completed (all required fields) → Submitted (Chief Engineer signs; signing submits) → Signed off (superintendent signs; closes, read-only) | Superintendent may **Return to vessel** with a comment → Draft. Earlier signatures are kept but flagged "signed before the latest changes" and must be re-signed | On submit: email the template's routing addresses (e.g. the shore technical mailbox) + in-app to superintendents with reach. On sign-off: email the Chief Engineer |
| Vessel Bunker Request | Draft → Submitted (Chief Engineer or Captain signs) → Acknowledged (Company actor: owner / admin / technical superintendent) → Delivered (optional; link the loading report) | Fields include product lines: grade (from the vessel's configured fuel grades: MGO, ULSD, petrol, Jet A-1, urea, lube oils; plus "Other — specify"), quantity, unit, required date, port / supplier | Submit emails the routing addresses |
| Fuel Bunker Loading Report | Draft → Completed → Signed (Chief Engineer) | Grade* per line (same list as the request), quantity, density, temperature, sulphur %, supplier, delivery note no., tanks loaded, ROB before / after | Feeds ROB and the emissions report (voyage doc) |

Rules for all technical forms:
- Unsigned drafts can be deleted by their author or an admin. Signed records cannot be deleted by vessel users; an account owner or admin can delete with a reason that goes into the audit log.
- A template change is published as a new version. Open drafts stay on their version; new submissions use the new one. Vessel-specific copies show "newer fleet version available".
- History tab: every non-draft submission with status (Completed, Signed, Signed off, Acknowledged, Approved) and filters by form, status and date.
- Technical checklists use the same engine (`form_type = CHECKLIST`, `module = technical`, frequency group). A run can require approval ("Operational checklist approval required" notification).

### W7. Controlled register (Critical Equipment List)

- Rows are generated from equipment flagged **critical system** on the vessel. Each row shows equipment, system, function, consequence of failure, standby / redundancy arrangement, test or inspection routine (link to a recurring job) and last test date. Editable columns: function, consequence, standby, notes.
- States: `Open` (editable) → `Closed` (signed by Chief Engineer, then Captain; order enforced) → **Reopen to amend** (reason) creates revision n+1 in `Open`; revision n stays read-only (`form_submissions.amendment_of_id`).
- When equipment is flagged or unflagged as critical after a close, the register shows "Out of date: 2 changes since revision n" and notifies the Chief Engineer.

### W8. External viewer access

**States**: `Invited` (7-day link sent) → `Active` (first sign-in completes authenticator enrolment) | `Expired` (link unused after 7 days) → re-invite issues a new link. From `Active`: `Revoked` (by inviter, Chief Engineer, Captain or admin; immediate) or `Ended` (access end date reached; default 90 days, or period end + 30 days for a period scope).

**Invite** (R&W Technical + `vessel.technical.viewers.admin`): name*, email* (valid, unique among active viewers for the same scope), company, who they are* (Shipyard, Management company, Owner's representative, Surveyor, Other), scope* (whole work list or one maintenance period), show estimated and invoiced costs (off by default), access end date.

**What a viewer sees**: the scoped jobs (title, reference, status, priority, due, equipment, location, description, photos, attachments, checklists, reports). Costs only if allowed. Assignees are shown by position, not by name. Notes are never shown (crew chatter). Read-only everywhere: no buttons that change data, and RLS denies writes.

**Logging**: every page view and file download writes `technical_viewer_events` (viewer, scope, record, action, time). The Viewers tab shows the last access per viewer and the full log.

**Notifications**: viewer accepted, to the inviter; access ending in 7 days, to the inviter.

### W9. Purchase order

The reference only confirms "Pending" and "Paid" (§6.31). The states between them are a STORM proposal (Open question 7).

| State | Enters by | Who |
|---|---|---|
| Draft | Create (supplier*, PO number auto, optional job / period, notes, currency) | R&W Technical |
| Pending approval | Submit (needs ≥ 1 line) | raiser |
| Approved | Approve | `purchase_orders.approve`, not the raiser (SoD-09). Above the vessel's threshold, also `final_approve` (shore) |
| Ordered | Mark as sent to supplier (optional PDF to supplier email) | R&W |
| Part received / Received | Receive lines (quantities) → stock movements of type `receive` for lines linked to inventory items | R&W |
| Invoiced | Enter invoice no., amount, file | R&W or Finance role |
| Paid | Mark paid (date) | Finance role or admin |
| Cancelled | From Draft, Pending approval, Approved, Ordered (reason) | raiser, approver, admin |
| (Declined) | Approver declines → back to Draft with comment | approver |

Line fields: description*, inventory item (optional), part number, quantity* > 0, unit, unit price ≥ 0, discount %, tax %. Totals are computed. A PO number may be edited only in Draft and must be unique per vessel. Activity log on every transition (pattern: `nb_purchase_order_activity`). Notifications: PO awaiting approval (approvers), PO approved or declined (raiser).

### W10. Round run

`Not started` → `In progress` (first stop recorded) → `Completed` (every stop recorded or skipped with a reason) | `Abandoned` (reason). Each stop is OK, Issue (description, photo; offers "Create job" prefilled with equipment and location) or Reading (value + unit; also written to equipment readings). Scanning a label opens that stop. Stops can be done in any order; the order is a suggestion. "Every watch" rounds create one expected run per watch; the Overview shows rounds missed today.

### W11. Inventory stock status

`quantity_on_hand` is kept equal to the sum of movements (trigger). Status: `Out of stock` when qty = 0; `Low` when 0 < qty ≤ min; `In stock` otherwise. Expiry date within 30 days → "Expiring" tag and digest. Adjustments need a reason (count correction, damaged, expired, transferred).

---

## Data model

| Entity | Key fields | Existing STORM table(s) or NEW | Notes |
|---|---|---|---|
| Certificate section | company_id, vessel_id (null = account default), name, slug, sort_order, hidden, is_system | NEW: `certificate_sections` | Seed defaults per account; vessel rows override order / hidden |
| Certificate type | company_id, section_id, name, code, regulation reference, has_expiry, default_validity_months, endorsement_rule (none / annual ±n months anchor issue / expiry), expiring_windows (30/90 overrides), applies_when (GT band, flag, commercial), sort_order | NEW: `certificate_types` | "Apply to entire fleet" = create `vessel_certificates` slots on every counted vessel |
| Vessel × type setting | vessel_id, certificate_type_id, hidden, instance_labels[] | NEW: `vessel_certificate_type_settings` | Hide / Unhide per vessel |
| Vessel certificate (slot) | id, company_id, vessel_id, certificate_type_id, instance_label, archived_at, archived_by, archive_reason, current_version_id | NEW: `vessel_certificates` | Migrate from `certificates` where `vessel_id IS NOT NULL AND user_id IS NULL` |
| Certificate version | certificate_id, doc_number, issuing_authority, issued_on, expires_on (null = no expiry), endorsed_on, next_endorsement_window_start/end (computed, stored for indexing), file_path, file_name, file_size, uploaded_by/at, verification_status (pending / verified / rejected), verified_by/at, verification_note, superseded_at | NEW: `vessel_certificate_versions` | Status is computed by `certificate_status(version)`; never stored |
| Endorsement | version_id, endorsed_on*, endorsing_body, window_start, window_end, file_path, recorded_by | NEW: `vessel_certificate_endorsements` | Closes a window |
| Related document | version_id, kind (supporting / endorsement / supplement), title, file_path, uploaded_by/at | NEW: `vessel_certificate_documents` | |
| Insurance facts | version_id, insurer, broker, policy_no, cover_type, cover_amount, currency, claims contacts | NEW: `vessel_insurance_policies` (1:1 with Insurance-section versions) | One source for Vessel › Insurance (§5.6.3) and the fleet Insurance report |
| Certificate alert (legacy) | — | `certificate_alerts` | Stop writing from the client; keep for history; notifications engine replaces it |
| Company certificate | company_id, name, number, issuer, dates, file | `certificates` rows with no vessel → NEW: `company_certificates` (or keep in `certificates` with `scope='company'`) | DOC and similar; Fleet view list |
| Maintenance job | vessel_id*, job_ref (`P0001`), legacy_ref, name*, description, regulations, tags[], priority (low / medium / high / critical), schedule_type (calendar / running_hours), equipment_id (nullable), due_date (nullable), due_hours, recurrence_unit, recurrence_value, recurrence_hours, recurrence_basis, assigned_user_id, assigned_position_id, team_ids[], location_text, department_id, category, maintenance_period_id, period_sequence, requires_approval, approved_by/at, hold_reason, cancel_reason, est_cost, currency, accounting_category, duration_weeks, job_card_scope, supplier_id, created_by, status | `maintenance_tasks` (EXTEND) | Make `equipment_id` and `due_date` nullable; add `vessel_id` (backfill from equipment); `task_number` unique per vessel; status CHECK; map priority Normal → Medium, Urgent → Critical; map types Inspection / Service / … to category |
| Job completion | job_id, occurrence_no, due_date_at, due_hours_at, completed_on, hours_at_completion, completed_by, note, logbook_entry_id, reopened_at/by/reason | NEW: `job_completions` | History tab source |
| Job activity | job_id, kind (note / report / status / assignment / approval / system), body, mentions[], media ids[], author, created_at | NEW: `job_activity` | Also the job's audit trail |
| Job follower | job_id, user_id | NEW: `job_followers` | |
| Job quote | job_id, supplier_id, amount, currency, valid_until, file_path, status (received / accepted / declined), decided_by/at | NEW: `job_quotes` | |
| Job required part | job_id, inventory_item_id, quantity | NEW: `job_required_parts` | Replaces `spares_used` JSON and template `required_spares` |
| Media | owner_type (job / equipment / inventory / round_stop / survey), owner_id, path, kind (photo / video / file), caption, deck pin, uploaded_by, offline_client_id | NEW: `technical_media` | Bucket `technical-media` (50 MB) |
| Job library template | company_id, name, description, regulations, category, department, recurrence, checklist template ids, required part descriptions | `maintenance_task_templates` (EXTEND: add `company_id`) | Fleet "Job library"; "Add to vessel" copies into jobs. Today rows with `equipment_id IS NULL` are visible to every tenant |
| Maintenance period | vessel_id, period_ref, name*, description, starts_on*, ends_on*, yard_location, contractor, project_manager_id, period_type*, priority, scope_summary, budget, currency, status, created_by | NEW: `maintenance_periods` | |
| Period milestone | period_id, name*, target_date*, description, done_at | NEW: `maintenance_period_milestones` | |
| Survey | vessel_id, survey_ref (`SRV-YYYY-NNN`), survey_type* (14 codes), category, location, description, class_society, surveying_body, surveyor_name, surveyor_contact, starts_on*, ends_on*, window_start, window_end, next_survey_on, maintenance_period_id, previous_survey_id, fee, budgeted_cost, total_cost, currency, certificate_id, certificate_number, certificate_valid_until, report_url, certificate_url, status, outcome | NEW: `vessel_surveys` | Separate from ISM `audits` |
| Survey finding | survey_id, finding_type, description, due_on, status, job_id, corrective_action_id | NEW: `vessel_survey_findings` | Conditions of class tile counts open ones |
| Equipment | + parent_equipment_id, subcategory, critical (bool, from `criticality = 'Critical'`), tracks_hours, manufacture_date, expiry_date, label_token, archived_at | `equipment` (EXTEND) | Make `equipment_code` optional (auto); `category_id` → allow account custom categories |
| Equipment category | + company_id (null = system), parent_category_id | `equipment_categories` (EXTEND) | Today global, readable by all |
| Equipment reading | equipment_id, reading_type (hours / pressure / temperature / other), value, unit, recorded_at, recorded_by, source (manual / round / logbook / telemetry), notes | `running_hours_log` (EXTEND with `reading_type`, `unit`, `source`) | Hours readings update `equipment.running_hours_total` (trigger) |
| Inventory item | vessel_id, name*, part_number, category, subcategory, manufacturer, location, sub_location, unit, quantity_on_hand, minimum_stock, unit_cost, currency, expiry_date, supplier_id, supplier_details, photo_path, critical, archived_at | `spare_parts` (EXTEND) | Shown as "Inventory" |
| Stock movement | item_id, vessel_id, type (receive / consume / adjust / transfer_out / transfer_in), quantity (signed), reason, job_completion_id, po_line_id, created_by/at | NEW: `stock_movements` | Unique `(job_completion_id, item_id)` |
| Supplier | company_id, name*, contact_name, email, phone, address, country, tax_no, default_currency, categories[], notes, archived_at | NEW: `suppliers` | Account-level; distinct from `nb_suppliers` (project contacts) |
| Purchase order | vessel_id, po_number*, supplier_id*, job_id, maintenance_period_id, status, currency, notes, required_by, subtotal, tax, total, raised_by, approved_by/at, final_approved_by/at, ordered_at, received_at, invoice_no, invoice_amount, invoice_file, paid_on | NEW: `purchase_orders` | Decide with Yard › Refit (pitfalls) |
| PO line / activity | po_id, description*, inventory_item_id, part_number, quantity*, unit, unit_price, discount_pct, tax_pct, received_qty / po_id, from_status, to_status, comment, actor | NEW: `purchase_order_lines`, `purchase_order_activity` | |
| Round | vessel_id, name*, frequency, active / round_id, seq, equipment_id or zone_id, instruction | NEW: `technical_rounds`, `technical_round_stops` | |
| Round run | round_id, watch_slot, started_by/at, completed_at, status / run_id, stop_id, result (ok / issue / reading / skipped), value, unit, note, media ids, job_id | NEW: `technical_round_runs`, `technical_round_run_stops` | |
| Technical form / checklist / register | template: + `module` ('technical'), `area` (forms / checklists / registers), `frequency_group`, `routing_emails[]`, `company_step` | `form_templates` (EXTEND) | Submissions: + `job_id`, `equipment_id`; registers use `amendment_of_id` |
| Technical document section / type | company_id, vessel_id (null = default), name, sort_order, hidden / section_id, name, hidden, fleet_wide | NEW: `technical_doc_sections`, `technical_doc_types` | |
| Technical document (versioned) | vessel_id, doc_type_id, version_no, file_path, revision label, uploaded_by/at, superseded_at | NEW: `vessel_technical_documents` | Status: Not uploaded / Uploaded / n versions |
| Deck / zone / pin | vessel_id, name, deck_no, sort, image_path, width, height, frame_scale / deck_id, name, kind (room / zone / cabin), polygon, frame_from, frame_to / deck_id, x, y, owner_type, owner_id | NEW: `vessel_decks`, `vessel_deck_zones`, `deck_pins` | Pattern from `nb_deck_views` / `nb_deck_rooms` |
| External viewer | vessel_id, name*, email*, company, viewer_kind*, scope_type (work_list / period), period_id, show_costs, invited_by, token_hash, invited_at, link_expires_at, accepted_at, access_ends_on, revoked_at/by, auth user id | NEW: `technical_viewers` (+ doc 01 external membership) | |
| Viewer event | viewer_id, action (view_list / view_job / download), record_id, at, ip_hash | NEW: `technical_viewer_events` | Append-only |
| Technical settings | vessel_id, due_soon_days (7), due_soon_hours (50), default_currency, logbook routing per department, fuel_grades[], PO approval threshold | NEW: `vessel_technical_settings` | Sub-module on/off lives in `vessel_module_settings` (doc 01) |
| Pending logbook link | job_completion_id, vessel_id, book, section, payload, adopted_entry_id | NEW: `pending_logbook_links` | W3 step 4 |
| Reference numbers | scopes `job:<vessel>`, `survey:<vessel>:<year>`, `po:<vessel>:<year>`, `period:<vessel>:<year>` | `reference_counters` + `next_reference_value()` (existing) | Atomic |
| Roll-up views | per vessel: open / overdue / pending approval / in progress / on hold / due 30d jobs; cost by currency; surveys; certificate register rows with status | NEW views: `technical_work_list_v`, `vessel_surveys_v`, `certificate_register_v` | Consumed by doc 02 reports and `fleet_expiry_items` |

---

## Improvements over the reference

1. **Live alongside an external maintenance system** (tickets asking to remove unused technical items and maintenance planning because another maintenance system covers it). Switch Jobs, Periods, Inventory and Purchasing off per vessel; they disappear from the tab bar, dashboards, calendar and notifications (doc 01 rule). Optional "external mode" keeps a read-only mirror of open and overdue counts from an import (CSV first; API later), so fleet roll-ups stay complete without double entry. The `idea-sync` stub is either finished against real cache tables or deleted.
2. **Technical forms vs checklists is a setting, not a support request** (tickets to move forms between Checklists and Forms, to create a Technical Forms section, to rename "Report" to "Forms"). Area and frequency group are template properties an admin can change. Fleet templates choose which vessels see them. Template edits roll out as versions, and vessels see "newer version available".
3. **Sign-and-route forms** (tickets on the Chief Engineer's monthly report and the bunker request). Signing submits. Each template carries routing addresses that are emailed on submit, and the superintendent's sign-off closes the record. Nobody has to email someone to say a form is ready. Unsigned drafts can be deleted by their author, and a History tab keeps "recent forms" short.
4. **Bunker data that adds up** (tickets on missing fuel type, unused fuel types, emissions report). Each vessel lists the fuel grades it actually uses; forms offer only those plus "Other — specify". Request → delivery → loading report is one chain, and the loading report feeds ROB and the emissions report.
5. **Engine set-up comes from the equipment register** (ticket on the noon report showing one main engine). Equipment flagged "tracks running hours" (port / starboard main engines, generators 1–3, bow thruster) defines which hour meters appear on readings sheets and voyage reports. A reading entered once updates the equipment, its running-hours jobs and the logbook. Fuel can be recorded as a vessel total where engines have no individual meters.
6. **Isolation (LOTO) tied to equipment** (tickets asking for an isolation certificate with real fields and permit-level permissions). The isolation certificate is a Safety permit type with the same permissions as other permits, but it can be launched from a job or equipment page with the equipment prefilled. Open isolations show on that equipment and job, and completing the job warns while an isolation is open.
7. **A critical equipment list that stays true** (ticket asking for a critical equipment list form). Built from the equipment register's critical flag, signed to close, and flagged out of date when the critical set changes.
8. **Two-watch tablet checks** (ticket asking for a tablet-friendly daily machinery inspection at two fixed times). Rounds and checklists support per-watch columns with independent Yes / No / N/A, expandable notes per watch, large touch targets, a landscape tablet layout and dark mode. A "No" offers to create a defect job.
9. **One renderer and honest permissions** (ticket where some logins could only print forms). Every vessel uses the same form renderer. A user without Read & Write sees a read-only form with "You can view and print this. Ask your HoD for Technical Read & Write to fill it in", not a different screen.
10. **Certificate verification that cannot go stale** (tickets on verification not resetting after edits and missing upload emails; vessel certificate email bugs). Any change to number, dates or file resets verification and notifies verifiers. Upload and decision notifications have delivery status visible in Notification Management.
11. **Certificates feed other records** (ticket asking for certificate expiries in safety meeting minutes). `certificate_register_v` is the one source for HESS / Master's review agenda items, the Compliance Pack and fleet reports.
12. **Add-on requests that reach someone** (ticket generated when crew asked for Deck Plans). Crew can request an add-on. Owners and admins get an actionable notification ("Start trial"), and the requester is told the outcome.
13. **Endorsement windows computed, not typed.** Enter the rule once per type and STORM works out each year's window, so the six-bucket summary is always right.
14. **Overdue is always live.** Derived at query time from dates and hours, so no nightly batch can drift, and "Due soon" thresholds are per vessel.
15. **Completion that means something.** Still one tap by default, but it can carry hours, a note and photos. These flow into the logbook line and the job's History, which gives surveyors evidence.
16. **Viewer privacy by default.** External viewers see positions, not crew names. Notes are never shared. Access always has an end date, and every view is logged.
17. **Tender-ready work lists.** A maintenance period exports a clean work list (sequence, scope, locations, photos, contractor), with costs optional, to send to yards.

---

## Implementation notes

**Module layout.** Create `src/modules/technical/` (`pages/`, `components/`, `hooks/`, `lib/`) and move live pieces out of `src/modules/maintenance/`. Keep `maintenance/index.ts` re-exporting during the move. Split `useMaintenance.ts` (one hook loading five tables company-wide) into `useJobs(vesselId, filters)`, `useJob(ref)`, `useEquipment(vesselId)`, `useInventory(vesselId)`, `useReadings(equipmentId)`, each keyed by vessel and paginated. Certificates stay in `src/modules/certificates/` with `pages/{CertificateRegister,CertificateDetail,CertificateSettings}.tsx`. Delete `CriticalEquipment.tsx`, `MaintenanceDefects.tsx` and `SpareParts.tsx` (mock) once replacements ship.

**Reuse**
- `EquipmentRegisterTab.tsx` (category tree grouping), `RunningHoursTab.tsx` (reading dialog), `MaintenanceScheduleTab.tsx` (month calendar and board views), `SparePartsTab.tsx` (CRUD form), `LogDefectModal.tsx` (becomes "Report a defect" → job with category Repair).
- New Build: `components/import/{FileUploadZone,ColumnMapper,ImportPreview}.tsx` for job, equipment and inventory imports; `pages/DeckPlan.tsx` overlay (react-pdf page render, polygon zones, centroid pins) for Deck Plans; `nb_purchase_order_activity` pattern for the PO activity log.
- Form engine: `src/modules/ism/forms/` (`FieldRenderer`, `SignaturePad`, `useFormSubmissions`) and RPCs `form_sign_submission`, `form_reject_submission`, `form_pending_signatures` for technical forms, checklists and registers. Add `module` / `area` filters rather than a second engine.
- Logbooks: write completion lines from a SQL function that inserts into `logbook_entries` using the same columns as `logbookApi.saveLine`. The entry guard (`logbook_entries_meridian_guard`) requires an **open volume**, a **section that exists in the volume template**, **only schema field keys** (`asset`, `event`, `condition`, `action`, `status`, `evidence` for the engine "maintenance" section), `entry_at` not in the future, and an author **capacity** allowed for that book (engine book: `engineer`). Hence the pending-link fallback in W3.
- Numbering: `next_reference_value(scope)` from `20260919220000_reference_numbers.sql`, set in BEFORE INSERT triggers (as `drills_set_number` does).
- Exports: `jspdf` + `jspdf-autotable` (job card, overview, register), `exceljs` (registers and lists). Build ZIP "Download All" in an edge function that streams signed files.
- Notifications: register the types with the notifications engine (notifications doc) and emit from SQL / edge functions, not the browser. Calendar rows go through doc 02's `fleet_calendar_feed`.

**Migration order**
1. `vessel_technical_settings`, `suppliers`, storage buckets (`vessel-certificates`, `technical-files`, `technical-media`: private, 50 MB, MIME list per §7.5 plus `video/mp4`, `video/quicktime`) with RLS by vessel reach.
2. Certificates: sections, types, settings, slots, versions, endorsements, related documents, insurance; `certificate_status()`; backfill from `certificates` (vessel rows → slot + version; crew rows → `crew_certificates` per doc 04; company rows → company list); `certificate_register_v`. Leave `certificates` read-only behind a view until the dashboard RPC and doc 02 views move over.
3. Jobs: extend `maintenance_tasks` (add `vessel_id` NOT NULL after backfill, relax `equipment_id` / `due_date`, per-vessel unique ref, status CHECK and value normalisation `In_Progress` → `in_progress` etc.); rewrite its RLS to check the vessel directly (today it joins through `equipment`, which breaks for jobs without equipment); `job_completions`, `job_activity`, `job_followers`, `job_quotes`, `job_required_parts`, `technical_media`; change FKs `ON DELETE CASCADE` from equipment to `SET NULL` and add `archived_at` to equipment.
4. Inventory: extend `spare_parts`, `stock_movements` + quantity trigger; `complete_job()` and `reopen_job()` functions.
5. Periods, surveys, findings; POs, lines, activity; rounds; technical document library; deck plans; viewers and events.
6. Fix `get_vessel_dashboard_summary` to read `technical_work_list_v` and `certificate_register_v` (or replace with doc 02's KPI function).
7. Extend `form_templates` (`module`, `area`, `frequency_group`, `routing_emails`, `company_step`) and `form_submissions` (`job_id`, `equipment_id`); seed the three technical forms and the Critical Equipment List register as account templates.
8. `storm.json`: add `vessel.technical.{overview, rounds, technical_forms, technical_documents, deck_plans, viewers, settings, costs}` and `vessel.certificates.{register, settings}` (sensitivity T2 for Insurance, Fiscal and Security sections via a section flag), then rerun `scripts/permissions/check-storm-coverage.mjs`.

**Pitfalls**
- `uploadCertificateFile` uses `getPublicUrl` on a private bucket. Store the object path and create signed URLs on demand. Do not make the bucket public.
- `review-certificate`: retire it in favour of a `verify_certificate_version(version_id, decision, note)` RPC that checks `has_capability` on the version's vessel. If kept, it must at least compare `certificate.company_id` with the caller's company and stop writing `status = 'Rejected'`.
- Status vocabularies already conflict (`In_Progress` in constants, `'In Progress'` and lowercase variants in `useNotificationCenter.ts`, lowercase in the dashboard RPC). Normalise once and add CHECK constraints, as `20260919210000_ism_form_workflow.sql` did for forms.
- `maintenance_tasks.task_number` and `defects.defect_number` are globally UNIQUE. Make them unique per vessel before numbering per vessel.
- `maintenance_task_templates` category-level rows (`equipment_id IS NULL`) are readable by every tenant and have no `company_id`. Add it before exposing a job library.
- `equipment_categories` is global and readable by all. Custom categories need `company_id` and RLS.
- `sitemap.ts` turns every unbuilt leaf under `/vessel/` into a Coming Soon route that outranks dynamic routes. When the `/v/:vesselCode` tree lands (doc 01), remove the static certificate and technical leaves, and do not add new static leaves for dynamic sections.
- Yard › Refit reads tables that do not exist here. Either port its migrations and reconcile `rf_purchase_orders` with the proposed `purchase_orders` (one PO table with an optional `refit_project_id`), or hide the refit procurement pages. Do not build a third PO table.
- Running-hours meters reset or are replaced. Allow a "meter replaced" reading with an offset so totals and running-hours jobs stay right.
- Dates: `completed_on`, `expires_on` and survey dates are vessel-local calendar dates (`date`), not timestamps. Compute "today" in the vessel's time zone (vessel setting) for buckets.
- Offline: photo capture and round runs must queue uploads with a client id so a retry does not duplicate (`offline_client_id` unique).
- External viewers must not get a normal company membership. Use doc 01's `external` membership kind with a scope object, and RLS that reads only `technical_viewers` grants. Rate-limit the sign-in endpoint.

---

## Open questions

1. **Default certificate sections.** Seed regulation-based sections (Registration, Class, SOLAS, ISPS, ISM, MLC, MARPOL, Radio, Insurance, …), size-band sections (Yacht > 300GT / 400GT / 500GT, as the reference does), or both with size bands hidden by default?
2. **Who verifies vessel certificates?** The DPA only (today's edge function), any account admin with reach, or a dedicated "certificate verifier" capability given per vessel?
3. **Vessels on an external maintenance system.** Hide Jobs, Periods, Inventory and Purchasing completely (keeping Equipment), or also run the read-only mirror? If a mirror: CSV import only, or a supported integration (which system)?
4. **Defects.** Fold STORM's `defects` into Jobs (category Repair) and send SMS-reportable defects to corrective actions (types Defect / Defective Critical Equipment), or keep a separate Defects list?
5. **Recurring job model.** One reference that rolls forward with a completion history (recommended), or a new job reference per occurrence?
6. **Job approval.** Who approves jobs flagged "requires approval", and is there a cost threshold that needs shore approval?
7. **Purchase order states and thresholds.** Confirm the states between Pending and Paid, the vessel approval threshold for shore final approval, and whether payment status belongs to the Finance add-on.
8. **Logbook target and signing.** Which book and section receives completion lines per department, and should we offer an option for the line to be signed automatically by the completer, or always leave it as a draft to sign?
9. **Maintenance periods vs Yard › Refit.** Is a refit project a maintenance period of type Major Refit / Shipyard (one record, refit workspace as a richer view), or a separate object linked to a period?
10. **External viewers timing and privacy.** Build now (surveyors, yards) or with a later phase (doc 01 question 12)? May a viewer ever see crew names?
11. **Deck Plans commercial model.** Paid add-on per vessel (as in the reference) or included in STORM's base tier?
12. **Insurance source of truth.** Policy facts on the Insurance certificate (proposed), or on Vessel › Insurance with the certificate only as the document?
