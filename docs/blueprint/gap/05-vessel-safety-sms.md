# Vessel view: Safety / SMS — gap analysis

> Spec for implementers. It compares the rebuild blueprint (v1.3) for the reference app against STORM as it is in the code today, and states what STORM must build for the **Safety** module of the **Vessel view**: SMS summary, Safety Management Manual, SMS forms (incident, corrective action, medical case, HESS meeting, handovers and the other template forms), drills, permits to work, risk assessments, emergency, safety documents and safety settings. Requirements are written as STORM requirements, in our own words. Blueprint sections are cited as `§n.n`; support-ticket themes from the reference app's export are cited as `T-<ticket number>` (no personal data).
>
> Depends on: `01-foundations-tenancy-roles.md` (vessel-scoped routes `/v/:vesselCode/…`, capabilities, Access Sets, designated vessel roles such as Safety Officer / SSO / Medical, `is_company_actor()`, `vessel_office_holders()`, `format_reference()`), `02-fleet-view-operations.md` (fleet document sections and acknowledgement, Forms & Checklists builder, fleet reports, fleet medical list, calendar events) and `04-vessel-crew.md` (crew list, onboard status, crew medical data). The **signature engine** (§8: signature store, Verified / Witnessed / on-behalf methods, PDF stamping) is owned by the signatures gap doc; this doc defines **which slots each safety record has, in what order, and what each signature triggers**.

---

## Scope

**Blueprint sections covered**

| § | Topic | Notes |
|---|---|---|
| Exec summary | Safety (SMS) module list, cross-cutting engines (ordered signatures, company status threads) | SMS forms framework is item 5 in the suggested build order; drills, PTW and RA are item 6 |
| §5.2.1 | SMS Summary | Screenshot `image43.png` viewed |
| §5.2.2 | Safety Management Manual | |
| §5.2.3 | SMS Forms list, template groups, reference formats, statuses | Screenshot `image46.png` viewed (form list + corrective-action type menu) |
| §5.2.4 | Incident ("Accident & Dangerous Occurrences Investigation Report"), 52 contributing-factor codes, injury block, reporting & notifications | |
| §5.2.5 | Corrective action (7 types, 6 sections, ordered sign-off) | |
| §5.2.6 | Drills matrix, ad-hoc drill, completion drawer, cell dialog, full record | |
| §5.2.7 | Permit to work (list, type catalogue, Hot Work, Enclosed Space Entry, Working Aloft / Outboard) | |
| §5.2.8 | Risk assessments (list, detail, hazard sub-forms, control areas, sign-offs) | |
| §5.2.9 | Emergency (form not captured) | Supplemented by T-5 / T-6 |
| §5.2.10 | Safety Settings (Safety Documents tab, Drills tab) | |
| §5.2.11–5.2.13 | Medical case record, HESS meeting report, Master's handover checklist | |
| §5.2.14–5.2.15 | Vessel Documents / Fleet Documents sub-menus; what was not captured | |
| §3.9–3.14, §3.38, §3.40 | Drill type / record, SMS form submission, incident, corrective action, permit, risk assessment, medical case, HESS, handover, RiskHazard / ControlArea, DrillTypeConfig, permit operation type | |
| §6.4–6.9 | Incident, corrective action, other SMS forms (HESS, handovers), PTW, drills, risk assessments | State / sequence diagrams `image15`–`image23`, `image4` viewed (renders of the mermaid source in the blueprint) |
| §6.27, §6.32 | Medical case; enclosed space entry permit | `image37.png` viewed |
| §1.6, §7.2, §7.3, §8.2–8.10, §8.9 | Identifier formats; calendar sources; safety reports list; signature order, auto-submit, removal, edits after signing, company sign-off, PDF anatomy, safety notification types, delete rules | Only how safety records consume them |

**Support tickets:** 38 of the 142 tickets touch this domain. Themes: incident workflow rework and company close gate (T-69, T-78, T-97, T-153, T-150), stalled forms and chasing (T-131), email deep links (T-252), medical case numbering / fit-for-duty / flag notification drafts (T-42), drill matrix scheduling, backdating and a fuller drill report (T-44, T-261, T-43), PTW content changes, new permit types, extension and a richer overview (T-100, T-101, T-103, T-111, T-151, T-242, T-289, T-294, T-301, T-51), RA rejection status and approval friction (T-33, T-34), HESS content, export size and corrections after signing (T-70, T-290, T-314), handover and SMS form templates (T-3, T-73, T-122, T-165, T-254, T-258), SMS amendment / document change workflow (T-4, T-80), safety observation reporting for all crew (T-287), emergency initial notification and SITREP (T-5, T-6), searchable crew pickers (T-166), familiarisation feeding HESS (T-15).

**Out of scope here** (owned elsewhere; referenced where they meet this module): signature capture, signature store, PDF stamping and hashes (signatures doc); fleet Forms & Checklists builder and checklist template lifecycle (doc 02, §4.6 / §6.19); fleet document publishing and acknowledgement (doc 02, §4.5 / §6.18); fleet reports pages (doc 02 / reports doc); Notification Management UI (§8.9, notifications doc); capability engine and Access Sets (doc 01); clinical medical records in Health & Wellness (`docs/HEALTH.md`); ISM audits & surveys and DPA management reviews (stay fleet-side, `src/modules/audits`).

**STORM paths inspected (code read, not just names)**

- Navigation and routes: `src/config/sitemap.ts` (vessel Safety, lines 117–150; placeholder generator, lines 630–676), `src/routes/index.tsx` (ISM routes 422–530, legacy safety routes 712–748, compliance 750–803), `src/shared/components/layout/SidebarNavigation.tsx` (safety badge, line 146)
- ISM: `src/modules/ism/pages/{MiscellaneousPage,PermitsToWorkPage,ObservationsPage,CorrectiveActionsPage,NonConformitiesPage,InvestigationsPage,MeetingsPage,ERMPage,ChecklistsPage,SOPsPage,DrillsPage,IncidentsPage,RiskAssessmentsPage,AuditsSurveysPage}.tsx`, `components/TabPlaceholder.tsx`
- ISM forms engine: `src/modules/ism/forms/{constants.ts,hooks/useFormSubmissions.ts,hooks/useFormTemplates.ts,components/{FieldRenderer,SignaturePad,FormProgressBar}.tsx,pages/*}`; migration `supabase/migrations/20260919210000_ism_form_workflow.sql`; numbering `20260919220000_reference_numbers.sql`
- Incidents / CAPA: `src/modules/incidents/{constants.ts,hooks/{useIncidents,useCorrectiveActions,useInvestigation,useIncidentTimeline}.ts,components/{ReportIncidentModal,IncidentDetailView,IncidentViewModal}.tsx,components/tabs/*,components/modals/*,pages/{Incidents,IncidentAnalytics,CAPATracker}.tsx}`; `src/lib/api/hooks/useIncidentsApi.ts`; migrations `20260125220549_*.sql` (incidents, corrective_actions, incident_investigation), `20260127170858_*.sql`, `20260917180528_*.sql` (`incident_involved_persons`)
- Drills: `src/modules/drills/{hooks/useDrills.ts,pages/{Drills,DrillsAnnualGrid,DrillAnalytics}.tsx,components/{DrillScheduleTab,DrillHistoryTab,DrillDetailModal,ScheduleDrillModal,EquipmentReadinessTab,EmergencyProceduresTab,EmergencyContactsModal}.tsx}`; migration `20260125224405_*.sql` (drill tables, 12 seeded drill types)
- Risk assessments / permits: `src/modules/risk-assessments/{constants.ts,hooks/useRiskAssessments.ts,pages/{RiskAssessments,RiskAssessmentForm}.tsx,components/{RiskAssessmentsTab,CreateRiskAssessmentModal,RiskAssessmentDetailModal,RiskMatrix,WorkPermitsTab,CreateWorkPermitModal,WorkPermitDetailModal,RATemplatesTab}.tsx}`; migration `20260125233724_*.sql` (risk_assessments, hazards, templates, work_permits, permit_extensions)
- Emergency: `src/modules/emergency/{store/emergencyContactsStore.ts,types.ts,components/*}`, `src/modules/vessels/pages/VesselEmergencyDetailsPage.tsx`
- Documents: `src/modules/documents/pages/{ISM_SMS,SafetyDocumentVersioning,Procedures,Manuals}.tsx`, `hooks/useDocuments.ts`
- Compliance / audits / red room: `src/modules/compliance/pages/CompliancePage.tsx`, `src/modules/audits/{hooks/useAudits.ts,constants.ts}`, `src/modules/red-room/{store/redRoomStore.ts,types.ts}`
- Health (medical case inputs): `src/modules/health/hooks/{usePatientRecord,useConsultations}.ts`; types for `med_consultations`, `med_patient_records`, `medical_reports`, `hw_people`; `docs/HEALTH.md` access model
- Edge functions: `supabase/functions/{submit-form,sign-submission,complete-drill,extract-form-fields,notify-shipping-master}/index.ts`
- Types (grepped): `incidents`, `corrective_actions`, `incident_investigation`, `drills`, `drill_types`, `drill_participants`, `risk_assessments`, `risk_assessment_hazards`, `work_permits`, `emergency_*`, `form_templates`, `form_submissions`, `form_signatures`, `sms_templates`, `sms_submissions`, `sms_signatures`, `sms_attachments`, `sms_amendments`, `notification_subscriptions`, `notification_logs`, `vessels`
- Permissions: `docs/permissions/catalogues/storm.json` (`vessel.safety.*`, SOD-12); audits `docs/STORM-STATUS-AUDIT.md`, `docs/SYSTEM-AUDIT-2026-09-19.md` (H1, H5)

### Headline findings from the code

1. **The Safety sidebar is mostly a façade.** `sitemap.ts` 117–150 defines 24 leaves. 18 are generated "Coming Soon" placeholders (SMS Summary, Safety Management Manual, Vessel Specific Manuals, Crew Duties, both Standing Orders, Muster List, Safety Documents, six SOP leaves, Pollution, Flag Policy, Agent Information, NTVRP / OPA 90). The other 6 jump to company-wide `/ism/*` pages; none is vessel-scoped.
2. **Three of those six links land on fake or wrong pages.** "SMS Forms" → `/ism/miscellaneous` (`MiscellaneousPage.tsx`: six hard-coded categories with count 0, buttons with no handlers). "Permit to Work" → `PermitsToWorkPage.tsx`, which renders `mockPermits` (three invented permits; SYSTEM-AUDIT H1). "Emergency Response" → `ERMPage.tsx`, an enterprise-risk score dashboard over RAs / incidents / CAPAs, not an emergency page.
3. **The real safety code is orphaned.** Incidents (`/incidents`, `/ism/incidents`), corrective actions (`/ism/corrective-actions`), investigations, non-conformities, observations, meetings and audits all have routes but no sidebar leaf. The real permit implementation (`work_permits`, `permit_extensions`) is a tab inside `/risk-assessments`, not the PTW leaf.
4. **Nothing is vessel-scoped.** `useDrills` loads every drill in the company; `useIncidents` has an optional vessel filter that no safety page sets; no safety page calls `useVessel()`.
5. **The ISM forms engine is the strongest piece, but stops at "signed".** `20260919210000_ism_form_workflow.sql` gives server-owned numbering, sha256 content hash, ordered append-only signatures (`form_sign_submission`), lock and amendment cycles. It has no Company actor (submit / acknowledge / return / sign off / close / reopen), no status-update thread, no "whose move", no follow-up dates, and signer roles are matched by role name only (a Master of one vessel can fill a Master slot on another; doc 01 F33).
6. **Incident model is generic, not ISM-shaped.** `incidents` has 6 types, severity 1–5 actual/potential and status Open / Under Investigation / Closed. Missing: classification, coded effects (actual / potential), the 52 coded contributing factors, UTC offset, company submit / acknowledge / close-as / reopen, submitted snapshot, flag reporting. Numbers are generated in the browser (`useIncidents.ts` 242). RLS lets any company member update or delete any incident (`20260125220549_*.sql` 85–91), the opposite of "no delete once submitted".
7. **Corrective actions are a to-do list.** `corrective_actions.action_type` is Immediate / Corrective / Preventive; status Open / In Progress / Verification / Closed. No type (7), category, related-to, priority, severity, plan confirmation, ordered sign-off or company sign-off. Numbers are client-side.
8. **Drills cannot be completed from the UI.** `complete-drill` exists but nothing calls it; it also never checks that the drill belongs to the caller's company and uses legacy `profiles.role` values. `drill_types` is a global 12-row table (frequency in days, no company, no checklist, no per-vessel config). The annual matrix (`DrillsAnnualGrid.tsx`) and Equipment Readiness tab are hard-coded.
9. **Risk assessments store hazards with L × S, but bands and sign-off are wrong.** `getRiskLevel()` bands Low ≤ 6, Medium ≤ 12, High > 12 (blueprint: Low 1–3, Medium 4–9, High 10–15, Critical 16–25). No type, category, at-risk, legislation, control areas, residual acceptance, assessor / HoD-Captain / Company sign-offs. `/risk-assessments/new` (`RiskAssessmentForm.tsx`) is a static page with no save.
10. **Permits record the requester as approver.** `WorkPermitsTab.handleApprove` sets `approved_by_id = permit.requested_by_id` ("In real app, use current user"). That falsifies the record and defeats SOD-12 ("issuer cannot authorise their own permit"). No per-type checklists, CP / AO signatures, gas readings, isolations, validity cap, handover or withdrawal.
11. **HESS meetings, handovers, medical case records, safety observations, live emergencies, safety settings and the SMS summary do not exist.** `MeetingsPage.tsx` lists fleet `management_reviews`; `ObservationsPage.tsx` is mock data; clinical consultations (`med_consultations`, with `fit_for_duty`, `days_off_work`, `incident_id`) exist in Health but there is no SMS case wrapper.
12. **Dead parallel schema.** Edge functions `submit-form` and `sign-submission` write to the empty `sms_*` tables and are called from nowhere (`submit-form` also computes a 32-bit "content hash"). The status audit's "incidents / drills production-ready" claim does not survive a code read.
13. **The live database holds zero incidents, drills and form submissions** (SYSTEM-AUDIT §live data). The safety schema can be reshaped now without data migration.

---

## Target information architecture

### Principles

- Everything in this module lives under the vessel scope `/v/:vesselCode/safety/…` (router contract from doc 01). Every query filters by vessel and every RLS policy checks vessel reach.
- **Filing structure follows the reference** (summary, manual, drills, permits, SMS forms, checklists, risk assessments, emergency, vessel documents, fleet documents, settings), so crews moving between systems find things where they expect. STORM adds **Observations** (T-287) and a **Report** quick action.
- **One record = one URL**, addressable by its reference (`/v/dra/safety/forms/INC-DRA-2026-009`), so emails, notifications, HESS imports and global search deep-link straight to it (T-252).
- **Whose move is always visible.** Every list row and record header shows a "Waiting on vessel / Waiting on company / Closed" chip and the age, not just a status.
- Wide data-dense pages (matrix, registers) are desktop-first; record pages (permit, drill completion, observation, handover) are **tablet-first**, built for use on deck and in the engine room.

### Vessel view — Safety module

```
Vessel › Safety                                   /v/:vesselCode/safety → redirects to Summary
│   Header actions on every Safety page: [Report ▾] → Safety observation (all crew) · Incident / near miss · Emergency
├─ Summary                       /v/:vc/safety/summary?month=2026-11
├─ Safety Management Manual      /v/:vc/safety/manual                         (hidden when switched off for the vessel)
│   └─ document                  /v/:vc/safety/manual/:documentId
├─ Drills                        /v/:vc/safety/drills?view=matrix|schedule|participation&year=2026&category=&attention=1
│   └─ drill record              /v/:vc/safety/drills/:drillRef               (?complete=1 opens the completion drawer)
├─ Permits to Work               /v/:vc/safety/permits?tab=open|types|log
│   ├─ new                       /v/:vc/safety/permits/new/:permitTypeCode
│   └─ permit                    /v/:vc/safety/permits/:permitRef            (PTW-DRA-2026-061)
├─ SMS Forms                     /v/:vc/safety/forms?tab=forms|register|actions&kind=&status=&waiting=vessel|company
│   ├─ new                       /v/:vc/safety/forms/new/:templateKey         (incident, near-miss, corrective-action?type=defect,
│   │                                                                          medical-case, hess, handover-<code>, <template code>)
│   └─ record                    /v/:vc/safety/forms/:reference              (INC-…, CA-…, CASE-…, HESS-…, SMS-…)
├─ Observations                  /v/:vc/safety/observations, /new, /:reference   (STORM addition; every crew member)
├─ Checklists                    /v/:vc/safety/checklists                     (safety-area checklists; builder is fleet Forms & Checklists, doc 02)
├─ Risk Assessments              /v/:vc/safety/risk-assessments?status=&type=&category=
│   ├─ new                       /v/:vc/safety/risk-assessments/new/:raType   (generic | task-based | dynamic | emergency-response)
│   └─ assessment                /v/:vc/safety/risk-assessments/:raRef
├─ Emergency                     /v/:vc/safety/emergency, /v/:vc/safety/emergency/:emergencyRef
├─ Vessel Documents ▸            /v/:vc/safety/vessel-documents/:sectionSlug  (one child per vessel document section, built from data)
├─ Fleet Documents ▸             /v/:vc/safety/fleet-documents/:sectionSlug   (one child per fleet section published to this vessel; doc 02)
└─ Settings                      /v/:vc/safety/settings?tab=documents|drills|permits|forms|reporting   (safety admin capability)
```

**SMS Forms tabs.** *Forms* (template groups with New, open items and completed history, §5.2.3); *Register* (every record in a sortable table: reference, kind, title, status, whose move, follow-up due, age, last update); *Actions* (the corrective-action tracker: CA reference, type, opened, category, description, due, status, overdue flag). The "Non-conformities" and "Investigations" pages collapse into filters of these tabs.

**Template groups on the Forms tab** (fleet-configurable; STORM defaults per DECISIONS §7, capability-filtered): **Events** (incident, near miss); **Health** (medical case, shown only with the medical capability); **Actions** (corrective and preventive action); **Reviews & inspections** (annual SMS review, HSE inspection, pre-task briefing, safety committee meeting); **People** (role handovers for command, engineering, deck, security and medical roles; drill and training debrief); **Document changes** (SMS change request).

### Fleet view surfaces this domain needs (to add to doc 02's tree)

```
Fleet › Operations › Safety queue      /fleet/safety?tab=awaiting-company|follow-ups|stalled|permits|drills
```
The company actor's inbox across vessels: records awaiting acknowledgement or company sign-off, follow-up dates due, vessel forms stalled (open more than N days with no activity, T-131), permits expired awaiting closure, overdue drills. Each row opens the vessel record. Doc 02's dashboard "Safety & Compliance" panels (D6, D10) and fleet SMS / HESS reports read from the same RPCs.

### Legacy route redirects (keep for one release)

| Old | New |
|---|---|
| `/ism/drills`, `/drills`, `/drills/annual-grid` | `/v/:last/safety/drills` |
| `/ism/permits-to-work` | `/v/:last/safety/permits` |
| `/ism/miscellaneous` | `/v/:last/safety/forms` |
| `/incidents`, `/ism/incidents`, `/ism/investigations` | `/v/:last/safety/forms?tab=register&kind=incident` |
| `/ism/corrective-actions`, `/ism/capa`, `/ism/non-conformities` | `/v/:last/safety/forms?tab=actions` |
| `/ism/observations` | `/v/:last/safety/observations` |
| `/ism/risk-assessments`, `/risk-assessments`, `/risk-assessments/new` | `/v/:last/safety/risk-assessments` |
| `/ism/erm` | `/fleet/reports/risk-overview` (rename; it is a fleet risk dashboard) |
| `/ism/meetings` | stays fleet-side as "Management reviews" (DPA), not HESS |

`:last` = the user's last vessel (doc 01 landing rules).

---

## Feature inventory

Status: **complete** / **partial** / **placeholder** / **missing** as defined in the brief. Priority P0–P2, effort S–XL.

### Summary (§5.2.1)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap (what's missing) | Priority | Effort |
|---|---|---|---|---|---|---|---|
| SUM1 | Vessel SMS Summary page: month / year stepper, Export PDF | §5.2.1, image43 | placeholder | `sitemap.ts` 122 → generated `/vessel/safety/sms-summary` Coming Soon | Whole page, vessel-scoped, one RPC `safety_summary(vessel, month)` | P0 | M |
| SUM2 | Action Required banner (urgent CAs open, permits expired awaiting closure, missed drills, records waiting on vessel, follow-ups due) with deep links | §5.2.1 | missing | `red-room` (`get_red_room_items`) is a generic alert triage | Computed list from safety data; each line links to the filtered list or record | P0 | S |
| SUM3 | KPI tiles: Drills done / due this month + trend; Permits active + expired awaiting closure; SMS forms opened + trend; Urgent actions open + closed this month + trend | §5.2.1 | missing | `Drills.tsx` tiles are company-wide and count "Scheduled" | Computations as §5.2.1, compared with previous month | P0 | M |
| SUM4 | SMS forms by type (form type, count in month) | §5.2.1 | missing | — | Click a row → register filtered by kind and month | P1 | S |
| SUM5 | Corrective action tracker panel (CA ref, type, opened, category, description, due, status) | §5.2.1, image43 | partial | `CAPATracker.tsx`, `CorrectiveActionsPage.tsx` (company-wide, no types) | Vessel-scoped open CAs, overdue first, row opens the record | P0 | S |

### Safety Management Manual and document menus (§5.2.2, §5.2.10, §5.2.14)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| DOC1 | SMM viewer: fleet-managed documents, version, upload date, "managed at fleet level", preview | §5.2.2 | placeholder | `sitemap.ts` 135 Coming Soon; `ISM_SMS.tsx` (company `documents` with a mock fallback list); `SafetyDocumentVersioning.tsx` (hard-coded versions) | Read-only list of the SMM section of fleet documents published to this vessel, inline PDF preview, acknowledgement where the document requires it (doc 02) | P0 | M |
| DOC2 | Vessel Documents sub-menu built from vessel document sections and types (vessel-specific uploads, version, Edit / Hide / Delete) | §5.2.10, §5.2.14 | placeholder | `sitemap.ts` 128–144: 12 Coming Soon leaves; `SOPsPage.tsx` (company documents by category, not linked) | Dynamic sidebar children from data; section page lists document types with current file and history | P0 | M |
| DOC3 | Fleet Documents sub-menu (sections published to this vessel; read and acknowledge) | §5.2.14 | placeholder | `sitemap.ts` 145–149 Coming Soon; "Emergency Response" points at `ERMPage.tsx` | Dynamic children from doc 02's fleet sections; UI only here | P0 | S |
| DOC4 | "Sections every vessel gets": add a section to all vessels now and later; each vessel keeps its own uploads | §5.2.10 | missing | — | Fleet default sections copied on vessel creation | P1 | S |

### SMS forms framework (§5.2.3, §3.10, §8)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| FRM1 | SMS Forms page: template groups; per template New, open records (status chip + age), "N completed · last …" expanding by month | §5.2.3, image46 | placeholder | `sitemap.ts` 125 → `MiscellaneousPage.tsx` (static, counts 0) | Page over `safety_records` + templates; counts from the database (the reference's counts were unreliable, §8.11) | P0 | M |
| FRM2 | Common record envelope: reference, title, vessel, started by, opened at, status, whose move, last update, follow-up due, age, completion meter, left-hand section outline | §3.10, §5.2.4–5.2.5 | partial | `form_submissions` (number, status, lock, hash, `linked_incident_id` / `linked_capa_id`) for template forms only | NEW `safety_records` envelope shared by every kind (incident, CA, medical case, HESS, handover, template form, observation) | P0 | L |
| FRM3 | Company actor workflow: submit to company, acknowledge, return to vessel ("further information required"), awaiting company sign-off, sign off & close, reopen | §6.4–6.6, §8.6, T-78 | missing | `form_submissions` ends at `SIGNED`; incidents close on any user's click | Status machine in SQL; company actions require `is_company_actor()` (doc 01) | P0 | L |
| FRM4 | Status-update thread: company posts update / request with follow-up date; vessel replies; Mark done / Change date / Cancel request; closing blocked while a request is open | §5.2.4, §6.4 | missing | `incident_investigation.timeline` (jsonb), `TimelineTab.tsx` (derived) | NEW `safety_record_updates` (append-only), drives whose move and follow-up due | P0 | M |
| FRM5 | Ordered signature slots per record kind; Sign as / Someone else signing? / Pass to / Remove (reverse order); auto-submit on the last vessel slot | §8.2–8.4 | partial | `form_sign_submission()` (ordered, append-only), `SignaturePad.tsx` (typed / drawn); no witness, no pass-to, no company slot | Slots defined per kind (Workflows § "Signature slots"); engine from signatures doc | P0 | M |
| FRM6 | Snapshot on submit ("view as submitted"); closed review version id | §6.4, §8.11 | partial | `form_submissions.content_hash` (sha256), amendment cycles | NEW `safety_record_snapshots` (json + sha256 per submit / close / reopen), side-by-side "as submitted" view | P0 | S |
| FRM7 | Linked records (incident ↔ CA ↔ medical case ↔ RA ↔ drill ↔ audit finding ↔ observation) with "Link existing" / "Raise new" | §5.2.4–5.2.5, §5.2.11 | partial | `corrective_actions.incident_id/finding_id`, `form_submissions.linked_*`, `med_consultations.incident_id`, `drill_deficiencies.corrective_action_id` | NEW `safety_record_links`; link panel on every record | P1 | M |
| FRM8 | Attachments ≤ 50 MB (PDF, images incl. HEIC/HEIF, Office); vessel vs company attachments | §7.5, §5.2.11 | partial | bucket `incident-attachments`, `form_attachments` | One `safety-records` bucket, path `company/vessel/record`; `audience` (vessel / company-only) | P1 | S |
| FRM9 | References per vessel and year (`INC-DRA-2026-009`, `CA-…`, `CASE-…`, `HESS-…`, `SMS-…`) | §1.6, T-42, T-69 | partial | `next_reference_value()` for forms / drills / audits; incidents and CAs numbered in the browser (`useIncidents.ts` 242, `useCorrectiveActions.ts` 111) | All kinds through `format_reference()` (doc 01) in a BEFORE INSERT trigger | P0 | S |
| FRM10 | Export PDF per record (header: vessel, flag, IMO, logos; signatures; content hash; vessel seal) | §8.8 | partial | `usePDFExport`, `src/lib/pdf`; incident export "coming soon" (SYSTEM-AUDIT) | Per-kind templates; hash and seal on every safety PDF | P1 | M |
| FRM11 | Delete rules per kind, server-enforced | §8.10 | partial | RLS on incidents, CAs, RAs, permits and drills lets any company member delete | Rules in Workflows § "Delete rules"; void-with-reason instead of delete after submission | P0 | S |
| FRM12 | Confidentiality: legal-privilege notice on incidents; Article 9 notice and medical-only access on medical cases | §5.2.4, §5.2.11, §7.6 | missing | Catalogue marks `vessel.safety.incidents` T2; nothing enforces | RLS by capability tier; access logging for medical cases (`hw_record_access_log`) | P0 | M |
| FRM13 | Chase stalled forms: "Nudge" from company, automatic reminders at follow-up due, stalled list in fleet Safety queue | T-131 | missing | — | Reminder job + nudge action that posts a thread entry and emails | P1 | S |
| FRM14 | Notification emails link to the exact record and carry a short excerpt | T-252, §8.9 | missing | `send-email` exists, not called from `src/` | Templates per safety notification type (Workflows § "Notifications") | P1 | S |

### Incident (§5.2.4, §3.11, §6.4)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| INC1 | Incident record page: privilege notice, header (vessel, safety officer, opened, status block), report sub-type (accident & dangerous occurrence / near miss / hazardous occurrence), title | §5.2.4 | partial | `ReportIncidentModal.tsx` (4-step modal: vessel, date-time, 6 types, 17 fixed locations, description ≥ 50 chars, persons, witnesses, immediate action, severity 1–5 ×2) | Full page on the envelope; sub-type; Safety Officer defaults to the vessel's designated Safety Officer | P0 | M |
| INC2 | Classification* (near miss, minor, serious, critical) | §5.2.4 | missing | `severity_actual` / `severity_potential` 1–5 | New field; keep potential severity as an optional STORM extra | P0 | S |
| INC3 | Event / effect*: multi-add from a coded list (22 entries, E01…), each tagged actual or potential, "other" with text | §5.2.4 | missing | `incident_type` single value | NEW `incident_effects` | P0 | S |
| INC4 | Contributing factors*: multi-add from the 52 coded factors (F01–F52, "other" last); "Suggest causes" | §5.2.4 | partial | `contributing_factors text[]`, `cause_categories text[]` (free text) | NEW `safety_codes` reference list (fleet-editable labels, stable codes); suggestion is P2 | P0 | S |
| INC5 | Date*, time*, position / location of vessel*, UTC offset* (default +00:00) | §5.2.4 | partial | `incident_date` (timestamptz), `location` (area on board) | Add vessel position text (prefill from AIS), area on board, offset; store instant + offset | P0 | S |
| INC6 | Narrative* (chain of events) + repeaters after first save: immediate actions, root causes, corrective actions, preventive actions | §5.2.4 | partial | `immediate_action`, `root_cause`, `incident_investigation` (method, findings, recommendations) | Repeaters; corrective / preventive rows can raise linked CAs | P0 | M |
| INC7 | Injury & casualty: personal injury (derived), results, involved persons (crew pick or free name, role, person category, injured, outcome, "Open medical case"), witnesses | §5.2.4, T-69 | partial | `persons_involved` / `witnesses` jsonb, `involved_crew_ids`, `incident_involved_persons` (HR table) | Structured `incident_persons`; medical link shows only case ref + open / closed (T-69) | P0 | M |
| INC8 | Reporting & notifications: flag-specific duty text and categories; notification log (who, when, recipient, method, response); never sends by itself | §5.2.4, T-69 | partial | `dpa_notified*`, `shipping_master_notified/message`, `notify-shipping-master` (sets a flag, logs "sent", sends nothing) | Flag reporting profiles (SET4) + `safety_record_notifications` log | P0 | M |
| INC9 | Submit panel with missing-items checklist; "Submit initial report to company" | §5.2.4, T-69 | missing | — | Validation list mirrors required fields; submit freezes initial details | P0 | S |
| INC10 | Company actions: acknowledge, post updates / requests, record root cause (locked once saved), close as (closed after review / raised in error / duplicate of), close on behalf of the company, reopen | §6.4 | missing | `incidents.status`, any company user | Company-only RPCs; close blocked by open requests | P0 | M |
| INC11 | Vessel final review (immediate cause, root causes, lessons learned, safety committee reviewed, evidence complete) signed Safety Officer / HoD → Master before company close | T-69, T-78 | missing | `incident_investigation.approved_by/date` | New section + slots; Master slot moves the record to awaiting company close | P0 | M |
| INC12 | Near-miss quick report (short form, same envelope) | §5.2.3 | partial | type "Near Miss" in the generic modal | Sub-type with a reduced required set | P1 | S |
| INC13 | Incident register / annual summary for flag returns | §7.3 | partial | `IncidentAnalytics.tsx` (company-wide) | Vessel filter; classification and effect counts | P2 | M |

### Corrective action (§5.2.5, §3.12, §6.5)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| CA1 | New → type menu (condition of class, observation, deficiency, defect, security defect, defective critical equipment, non-conformity) with one-line explanations; type locked after first save | §5.2.5, image46 | missing | `action_type` Immediate / Corrective / Preventive | New field + locked trigger | P0 | S |
| CA2 | Details: category (machinery, structural, operational, compliance), related to (11 sources), priority (urgent / major / minor, suggested from type) | §5.2.5 | missing | — | Fields + default mapping (SET3) | P0 | S |
| CA3 | Description & analysis: description*, location / area, equipment affected (link to equipment register when present), root cause analysis, severity* (low / medium / high / critical), contributing factors (12), additional detail | §5.2.5 | partial | `description`, `completion_notes` | Fields | P0 | S |
| CA4 | Corrective action plan: action text, corrective vs preventive, raised from (4), responsible person, plan due by*, target completion, "Confirm plan" stamp | §5.2.5 | partial | `assigned_to`, `due_date`, `action_type` | Fields + confirm stamp (who, when) | P0 | S |
| CA5 | Company assistance required (no / 5 kinds) and authorities to notify (flag, class, P&I, DPA, management company, owner) | §5.2.5 | missing | — | Recorded; notification log entries when actually sent | P1 | S |
| CA6 | Verification & closure: method, verified by, date, effectiveness review (yes — in N months / no), preventive actions implemented | §5.2.5 | partial | `verified_by`, `verified_date`, `verification_notes` | Fields; effectiveness review creates a dated follow-up | P0 | S |
| CA7 | Ordered sign-off: Safety Officer / HoD → Master (auto-submits) → company acknowledge → sign off & close; remove company signature; return to vessel | §6.5 | missing | `CAPADetailModal.tsx` status buttons for anyone | Slots + company actions | P0 | M |
| CA8 | Actions tab / tracker: open and overdue chips, latest update line, filters by type, priority, status | image46, §5.2.1 | partial | `CorrectiveActionsPage.tsx`, `CAPATracker.tsx`, `NonConformitiesPage.tsx` (filters CAs by heuristic) | Vessel-scoped; NC page becomes a type filter | P0 | S |
| CA9 | Raise a CA from an incident, audit finding, drill action item, HESS item, observation or RA control | §5.2.5 | partial | from incidents (`AddCAPAModal.tsx`), from drill deficiencies (`complete-drill`, unused) | One "Raise corrective action" action that pre-fills related-to and links both ways | P1 | S |

### Medical case record (§5.2.11, §3.38, §6.27)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| MED1 | Case shell: `CASE-<VSL>-<YYYY>-<nnn>`, optional title, patient, person category (crew, seafarer, occasional worker, passenger), recorded by, Article 9 notice | §5.2.11, T-42 | partial | `med_consultations` (Health, clinical), `medical_reports` (unused) | NEW `medical_cases` on the envelope; patient = `hw_people.id` | P0 | M |
| MED2 | Patient panel read live from the person's record (name, position, date of birth, blood group, allergies, medication, conditions, next of kin) | §5.2.11 | partial | `usePatientRecord.ts` (`med_patient_records`, `med_allergies`, `med_medications`, `med_conditions`), `crew_next_of_kin` | Read-only panel, medical capability only; access logged | P0 | S |
| MED3 | Onset & initial assessment: onset date / time, location, fit for duty (yes / no / restricted), time-off band (4), notifiable or occupational disease flag, nature, initial assessment | §5.2.11, T-42 | partial | `med_consultations.fit_for_duty`, `days_off_work`, `occurred_at`, `presenting_complaint`, `assessment` | Case-level fields; band drives triggers | P0 | S |
| MED4 | Treatment log, append-only | §5.2.11 | partial | consultations can chain (`parent_consultation_id`) but are editable and deletable | NEW `medical_case_entries` (append-only; correction = new entry referencing the old) | P0 | S |
| MED5 | Outcome (resolved on board, evacuated, hospitalised, repatriated, other + detail); severity (5); classification (8); DPA notified on; statutory reports filed | §5.2.11 | missing | `med_consultations.outcome` (free) | Fields | P0 | S |
| MED6 | Case update log (vessel update, company update, flag / shipping master communication, supporting document) | §5.2.11 | missing | — | Entries in `medical_case_entries` with `entry_type` | P1 | S |
| MED7 | Flag notification action: reporting triggers, recipient, "include the person's name" (off by default), draft (copy), response, close notification; never auto-sent | §5.2.11, T-42 | partial | `notify-shipping-master` (incidents only) | Shared `safety_record_notifications` with a draft generator | P0 | M |
| MED8 | Master or MPIC signature; company review & closure checklist; vessel and company attachments | §5.2.11, §6.27 | missing | — | Slots + checklist (SET5) | P0 | M |
| MED9 | Open from an incident's involved person, or link an existing case | §5.2.4 | partial | `med_consultations.incident_id` | Action on INC7 rows | P0 | S |

### HESS meeting report (§5.2.12, §3.38, §6.6)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| HES1 | Meeting header: chairman, secretary, date, time, location, meeting number (automatic), attendees (no apologies list, T-70); "at a glance" panel; section index with counts | §5.2.12 | missing | `MeetingsPage.tsx` shows fleet `management_reviews` (DPA reviews) | NEW `hess_meetings` | P0 | L |
| HES2 | Twelve sections, mostly imported: matters arising (open items from last meeting), incidents / near misses with CA cards and SMS amendment requests, health & wellbeing, inspections & observations, environmental, security, certificate expiries (vessel and crew, T-70), drills & training (title + date, expandable, T-70), Master's review, company communications (fleet notices, T-70), matters for company response, AOB as structured items (T-70) | §5.2.12, T-70 | missing | Sources exist (incidents, CAs, drills, certificates, documents) | Import on create and "Refresh imports" until first signature; items stay editable | P0 | L |
| HES3 | Action items with owner and due date, carried forward to the next meeting's "matters arising" | §5.2.12, T-70 | missing | — | NEW `hess_meeting_items` with `carried_from_item_id` | P0 | M |
| HES4 | Signatures Secretary → Chairman (auto-submit); company comments, sign off & close, return to vessel | §6.6 | missing | — | Slots must be the people named in the header (fixes §6.6 observation) | P0 | M |
| HES5 | Monthly due / overdue reminders; company sign-off cycle (42 days) for fleet reporting | §6.6, §8.9 | missing | — | Schedule per vessel (SET1) | P1 | S |
| HES6 | Condensed PDF (summary first, imported tables collapsed), content hash | T-70, §8.8 | missing | — | PDF template | P1 | M |
| HES7 | Correct a submitted meeting before company close: move an item between sections keeping its details and actions | T-314 | missing | — | "Withdraw to edit" (vessel, before company acknowledgement) or company "Return to vessel"; new signing cycle | P1 | S |

### Handovers and other template forms (§5.2.3, §5.2.13, §6.6)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| OTH1 | Handover checklists (Master, Chief Engineer, Chief Officer, SSO, Safety Officer, Medical person in charge): header (port, handover date-time, summary), grouped items with done / N/A / comment, remarks, incoming person contact and acceptance, outgoing signature, approval | §5.2.13, T-73, T-122, T-258 | partial | Forms engine: checklist templates, `yes_no_na` fields, signatures, `HANDOVER` form type; no handover templates seeded | Fleet templates (seed content: Master's handover groups in §5.2.13; others authored by the fleet); structured header; slots (W6) | P0 | M |
| OTH2 | Other SMS templates: Master's review of the SMS (T-254), safety & environmental health inspection, toolbox talk / pre-job briefing with sub-talks (T-165), drill / training report, SMS amendment / document change request (T-4, T-80) | §5.2.3 | partial | Forms engine + `CreateTemplate.tsx` (incl. AI field extraction via `extract-form-fields`) | Seed templates; per-template workflow config (OTH3) | P1 | M |
| OTH3 | Template workflow config: signature slots by vessel office, company sign-off required (yes / no), conditional stages (e.g. hard-copy confirmation only when copies exist, T-80), "raise CA / incident" actions | T-80 | partial | `form_templates.required_signers` (role names), `allow_parallel_signing`, `can_trigger_capa/incident/nc` | Office-based slots, `company_signoff` flag, conditional stage rules | P1 | M |
| OTH4 | Safety Checklists leaf: vessel's safety-area checklists (start, continue, history) | §5.2 sidebar | partial | `/ism/checklists` (`ChecklistsPage.tsx`, all company templates; tiles hard-coded 0) | Vessel-scoped list filtered to the safety area (doc 02 owns the builder) | P1 | S |
| OTH5 | Searchable, alphabetical crew pickers (name / position) everywhere a crew member is chosen | T-166 | partial | Varies per form | One shared `CrewPicker` with onboard filter and search | P1 | S |

### Safety observations (STORM addition, T-287)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| OBS1 | Observation report open to every crew member (own capability, separate from incident access): category (unsafe act, unsafe condition, positive, near miss, other), when, where / department, title, description, potential consequence, immediate action, suggested action, photos, confidential option | T-287 | placeholder | `ObservationsPage.tsx` (`/ism/observations`, `mockObservations`, not in nav); catalogue `vessel.safety.observations` with `view_own` | NEW `safety_observations` on the envelope; mobile-first | P1 | M |
| OBS2 | Review: Safety Officer reviews, assigns actions (CA), escalates to an incident, closes; reporter sees status of own reports | T-287 | missing | — | W8 | P1 | S |

### Drills (§5.2.6, §5.2.10 Drills tab, §3.9, §3.40, §6.8)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| DRL1 | Planning matrix per vessel and year: rows grouped by category, frequency, next due, Jan–Dec cells (completion date, "×2" for repeats, amber = missed, "+" to record); filters (category, needs attention); export | §5.2.6 | placeholder | `DrillsAnnualGrid.tsx` (`/drills/annual-grid`, hard-coded `GROUPS`) | Real matrix from the schedule | P0 | M |
| DRL2 | Schedule view (list / calendar of due drills) | §5.2.6 | partial | `DrillScheduleTab.tsx` (company-wide) | Vessel scope; due rows from the engine | P1 | S |
| DRL3 | Add ad-hoc drill (creates a custom type and one due row) | §5.2.6 | missing | `ScheduleDrillModal.tsx` schedules an existing type only | Small dialog | P1 | S |
| DRL4 | Completion drawer (made larger, T-44): follow-ups from last drill, date*, duration, location, scenario (+ suggestion, P2), guidance checklist (not blocking), participating crew (onboard only, T-44), performance rating, debrief*, action items; Not applicable…, Save draft, Complete | §5.2.6, T-44 | missing | `complete-drill` edge function (unused); no UI action | RPC `drill_complete`; drawer; evidence upload | P0 | M |
| DRL5 | One report satisfies several drill types (e.g. fire + muster + medical) | T-44 | missing | — | `drill_record_types` link; each satisfied due row closes | P1 | S |
| DRL6 | Cell dialog (status, date, location, officer, number; attended / checklist / evidence tiles; exceptions; notes; action items; add attachment, open record, record another) and full record page (details, crew, evidence ≤ 50 MB, history, edit completion, archive) | §5.2.6 | partial | `DrillDetailModal.tsx` (participants, evaluations, deficiencies, equipment), `DrillHistoryTab.tsx` | Dialog + page; history collapsed to one line per drill (T-44) | P0 | M |
| DRL7 | Crew drill participation (crew × drill type, month) | §5.2.6, §7.3 | missing | `drill_participants` data exists | View + report | P1 | S |
| DRL8 | Fleet drill catalogue: SOLAS mandatory / operational / security / custom; default frequency (weekly … annual); regulation reference; requirement checklist; optional flag (lifeboat / rescue boat launch off until switched on) | §5.2.10, §3.40 | partial | `drill_types` (12 global rows, frequency in days, `solas_reference`, no checklist, no company) | Company-scoped catalogue seeded from §5.2.6 / §5.2.10 | P0 | M |
| DRL9 | Per-vessel drill configuration: enable, applicable from (month or date; may be in the past, T-44), frequency override, requirements override, "N of M enabled" | §5.2.10, T-44 | missing | — | NEW `vessel_drill_configs` | P0 | M |
| DRL10 | Schedule engine: next due = one interval after last completion (rolling) or fixed calendar periods (per type, T-44); "due any time in the month"; rebuild from a start month (keeps earlier unfinished rows; only the owner removes them); backdating with reason and audit | §6.8, T-44 | missing | — | SQL functions + nightly job | P0 | M |
| DRL11 | Missed / overdue detection feeding Summary, fleet overdue panel and calendar | §6.8, §7.2 | partial | `Drills.tsx` "overdue" = scheduled before today (company-wide) | Status `missed` set by job; calendar events | P0 | S |
| DRL12 | Remove mock tabs: Equipment Readiness (`mockEquipment`); move emergency procedures / contacts to Emergency | — | placeholder | `EquipmentReadinessTab.tsx`, `EmergencyProceduresTab.tsx` | Delete / move | P1 | S |

### Permits to work (§5.2.7, §3.13, §6.7, §6.32)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| PTW1 | Permits page: search; open permits as cards (status, type code + name, number, location, description, AO, validity with countdown, T-151); "Open new permit" menu; type cards (issued, last, Closed (n) toggle → closed table, New); "Other permits" group for types no longer offered | §5.2.7, T-151 | placeholder | `sitemap.ts` 124 → `PermitsToWorkPage.tsx` (`mockPermits`); real `WorkPermitsTab.tsx` hidden under `/risk-assessments` | Page over `work_permits` | P0 | M |
| PTW2 | Fleet permit type catalogue: code (e.g. DRPTW03), name, description, content version, section schema (checklists, isolations, gas readings, rescue plan, operation types), max validity, extension rule; offered per vessel; edited by the fleet without vendor tickets | §3.13, T-100, T-101, T-103, T-111, T-242, T-289, T-301 | missing | `PERMIT_TYPE_OPTIONS` constant (6), `form_templates.form_type = PERMIT_TO_WORK` | NEW `permit_types`, `vessel_permit_types`; seed hot work, enclosed space entry, working aloft / outboard, hazardous work, lift shaft, diving, bunkering (T-289), isolation / LOTO certificate (T-301) | P0 | L |
| PTW3 | Permit details: type (locked after first signature), number (auto), date, location, third party (yes / no + company, supervisor), description, AO (with rank), CP, additional CPs, person in charge (crew or named outsider), work team, operation type (working aloft) | §5.2.7 | partial | `work_permits` (type text, location, description, requester, approver, workers jsonb, start / end) | Fields | P0 | M |
| PTW4 | Checklists per type (preliminary, pre-work, post-work, type-specific sections that can be marked "section N/A"); each row checked (AO) / N/A, some with a text answer | §5.2.7 | partial | `safety_precautions_required` jsonb, `precautions_verified` bool | Schema-driven answers; all rows answered before closing | P0 | M |
| PTW5 | Fire detection isolation table (up to 10: type, location, head / system address, isolated at, reinstated at) + other isolations | §5.2.7 | partial | `equipment_isolated` bool | NEW `work_permit_isolations`; closing blocked while any isolation is not reinstated | P0 | S |
| PTW6 | Gas readings as inline rows (space, time, O₂ %, LEL / HC, H₂S ppm, CO ppm, CO₂, verified by) checked against limits; atmosphere test equipment (make, model, serial, calibration due) | §5.2.7, §6.32 | partial | `atmosphere_tested`, `atmosphere_results` jsonb | NEW `work_permit_gas_readings`, `work_permit_gas_equipment`; limits from the type; out-of-limit and expired calibration flagged | P0 | M |
| PTW7 | Enclosed-space extras: breathing apparatus decision block, rescue team checklist, rescue plan (access points, comms, equipment yes / no, method, team members) | §5.2.7, §6.32 | missing | — | Sections in the type schema; rescue team = crew multi-select | P0 | M |
| PTW8 | Notification to other parties (Master, OOW, EOOW, area HoD, other) | §5.2.7 | missing | — | Checklist section | P0 | S |
| PTW9 | Opening: valid from / to (≤ type max, default 24 h or end of working day), CP declaration(s) + signature(s), AO declaration + signature → active | §6.7 | partial | status Pending → Approved → Active; `handleApprove` records the requester as approver | Signature slots; AO ≠ CP ≠ creator (SOD-12) enforced server-side | P0 | M |
| PTW10 | Extension within the type's rule (e.g. once, up to 12 h, T-294), with fresh readings where gas applies | T-294, §6.7 pass 7 | partial | `permit_extensions` table + hook, no UI | Rule + AO signature | P1 | S |
| PTW11 | Handover of authorising officer (incoming AO, time, signature) | §5.2.7 | missing | — | Slot; current AO changes | P1 | S |
| PTW12 | Post-work checklist; closure (work status + AO closing declaration and signature) → closed, read-only | §5.2.7 | partial | `actual_end`, `completion_notes`, status Completed | Slot + validation | P0 | S |
| PTW13 | Withdrawal (outstanding work, worksite safe, remaining isolations, operating restrictions, AO signature) → withdrawn | §5.2.7 | partial | `cancellation_reason` | Section + slot | P0 | S |
| PTW14 | Automatic "expired — awaiting closure" when valid-to passes; overdue alerts every 2 h | §6.7, §8.9 | missing | status `Expired` set by hand | Job every 15 min | P0 | S |
| PTW15 | Conflict check: other permits in force on the vessel shown and recorded in the "no conflict" row | §5.2.7 | missing | — | Query + auto-filled list | P1 | S |
| PTW16 | Links to risk assessment and toolbox talk | §5.2.7 | partial | `risk_assessment_id` | Toolbox talk link via `safety_record_links` | P1 | S |
| PTW17 | Permit log report and 3-page permit PDF with signature lines | §7.3, §8.8 | missing | — | Report + PDF | P1 | M |

### Risk assessments (§5.2.8, §3.14, §3.40, §6.9)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| RA1 | Register: status filter, export all (PDF), four "New" cards (generic, task-based, dynamic, emergency response) each with history; columns status, assessment, type, category, date, valid until, review | §5.2.8 | partial | `RiskAssessmentsTab.tsx` (status Draft / Approved / Under_Review / Expired), `RATemplatesTab.tsx` | Vessel scope, types, categories, register filters incl. awaiting HoD / Captain, awaiting company, review due | P0 | M |
| RA2 | Header: reference, title, date, type, category (14), task description, at risk (people / environment / vessel), valid until (computed by type, overridable with reason), review date (from highest residual), legislation (9 + free text), content version | §5.2.8 | partial | `task_name`, `task_description`, `task_location`, `assessment_date`, `review_date`, `task_date` | Fields + computations | P0 | S |
| RA3 | Hazard card: description, hazard types (19, multi), what could go wrong, when (7, multi), likelihood × severity before with 5 × 5 matrix, control areas, likelihood × severity after, accept residual (yes / further controls / reject activity), ALARP flag | §5.2.8, §3.40 | partial | `risk_assessment_hazards` (description, consequences, `controls text[]`, L / S before and after, responsible) | Fields | P0 | M |
| RA4 | Control areas: existing safeguards, hierarchy of controls (5 levels, most to least effective), measures, PPE (12), training, competency (6), PTW required, emergency equipment (6), responsible, implementation date, verification method | §3.40 | missing | `controls text[]` | NEW `risk_assessment_controls` | P0 | M |
| RA5 | Summary: hazards assessed n / n; initial and residual average, highest, total; risk reduction %; residual profile by band (Low 1–3, Medium 4–9, High 10–15, Critical 16–25) | §5.2.8 | partial (wrong bands) | `getRiskLevel()` Low ≤ 6, Medium ≤ 12, High > 12; `RiskMatrix.tsx` | One shared banding function (SQL + TS), add Critical | P0 | S |
| RA6 | Lock: summary, signatures and attachments unlock after at least one hazard has residual scores | §5.2.8 | missing | — | UI + server check on first signature | P0 | S |
| RA7 | Decision and sign-off: overall decision (approved — ALARP / conditional / requires additional controls / rejected), restrictions, special precautions; assessed by (competency + signature) → HoD or Captain → company decision (approved / with conditions / not approved + comments, one action, T-33) | §6.9, T-33 | missing | `approved_by_id` only, no UI | Slots + company decision RPC | P0 | M |
| RA8 | Rejection visible: status "Rejected" with company comment in the summary; approvals listed newest first (T-34) | T-34 | missing | — | Status + approval history panel | P0 | S |
| RA9 | Review cycle: initiate review (new revision), re-sign, re-approve; expiry and review-due states | §6.9, §8.5 | missing | status option `Under_Review` | Revision model (W10) | P1 | M |
| RA10 | Hazard suggestions from past assessments, "Add all", "Draft with AI" | §5.2.8 | partial | `COMMON_HAZARDS` constant, `risk_assessment_templates` | Suggest from the fleet's own library first; AI drafting is P2 | P2 | M |
| RA11 | Condensed on-board PDF ("controlling document held in STORM") and register report | §8.8, §7.3 | missing | — | PDF + report | P1 | M |
| RA12 | Remove the static `/risk-assessments/new` page | — | placeholder | `RiskAssessmentForm.tsx` (no save) | Delete; route redirects | P1 | S |

### Emergency (§5.2.9, T-5, T-6)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| EMG1 | Emergency page: live emergencies for the vessel, red "Report new emergency" (with a confirm step and a "this is a drill" option), empty state, history | §5.2.9 | missing | `ERMPage.tsx` (risk dashboard) under the "Emergency Response" label | NEW `emergency_incidents` | P1 | L |
| EMG2 | Initial notification form (type, time, position from AIS, persons on board, injuries, assistance needed, actions taken) sent at once to the company emergency team and DPA | T-5 | missing | `emergency_team_members`, `fleet_emergency_team_defaults`, `get_vessel_emergency_contacts()` | Form + immediate notifications | P1 | M |
| EMG3 | SITREP updates on a timer (reminder every N minutes), stand down (Master), close (company) with a pre-filled incident draft | T-6 | missing | — | NEW `emergency_sitreps` | P1 | M |
| EMG4 | Emergency contacts for the vessel, with history | — | complete | `src/modules/emergency/*`, `VesselEmergencyDetailsPage.tsx` | Show on the Emergency page; retire the second contacts system (`emergency_contacts` in drills) | P2 | S |

### Safety settings (§5.2.10)

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| SET1 | Safety settings page: tabs Documents (vessel sections and types), Drills (schedule options, rebuild, type management), Permits (types offered), Forms (templates offered, CA priority defaults, HESS cadence), Reporting (flag profile, safety subscribers) | §5.2.10 | missing | — | Page; safety admin capability | P0 | M |
| SET2 | Vessel safety notification subscribers ("everyone subscribed to this vessel's safety notifications") | §3.10, §8.9 | missing | `notification_subscriptions` table exists | Subscriber list per vessel (UI may live in Notification Management) | P0 | S |
| SET3 | CA priority suggested from type (fleet default, editable) | §5.2.5 | missing | — | Settings row per type | P1 | S |
| SET4 | Flag reporting profiles: per flag state, guidance reference, reporting categories with triggers, deadlines and recipients; not hard-coded to one flag (T-69) | §5.2.4, T-69 | missing | `vessels.flag_state` | NEW `flag_reporting_profiles` (fleet-maintained) | P1 | M |
| SET5 | Company closure checklists per kind (medical case, incident) | §5.2.11 | missing | — | Checklist items per kind | P1 | S |
| SET6 | SMM visible on vessels (fleet-wide or per vessel) | §5.2.2 | missing | — | Vessel module setting (doc 01 `vessel_module_settings`) | P2 | S |

### Navigation, scope, calendar and reports

| ID | Feature | Blueprint § | STORM status | STORM location(s) | Gap | Priority | Effort |
|---|---|---|---|---|---|---|---|
| NAV1 | Vessel-scoped Safety sidebar with real routes (tree above), dynamic document children, legacy redirects | §5.2 | partial | `sitemap.ts` 117–150 (6 company-wide links, 18 placeholders) | Rewrite `vesselSafety`; register routes | P0 | S |
| NAV2 | Every safety query vessel-scoped; RLS by vessel reach and capability | §2 | missing | `useDrills` company-wide; incident filter optional; RLS = "user belongs to company" | Hooks take `vesselId`; policies use doc 01 helpers | P0 | M |
| NAV3 | Fleet Safety queue for the company actor | §6.4–6.6, T-131 | missing | — | Page + RPC (see IA) | P0 | M |
| NAV4 | Calendar feed: drill due dates, permit validity, RA review dates, HESS due, CA plan due dates | §7.2 | missing | — | Events from doc 02's calendar source contract | P1 | S |
| NAV5 | Safety reports data contracts: drill compliance, drill participation, NC & CA register, PTW log, incident report, annual incident summary, RA register, overdue actions, observation trends; Compliance Pack inclusion | §7.3 | partial | `IncidentAnalytics.tsx`, `CAPATracker.tsx`, `DrillAnalytics.tsx` (company-wide) | Report pages owned by the reports doc; this doc owns the SQL views | P1 | L |

---

## Workflows & state machines

### Common rules for every safety record (envelope `safety_records`)

**Status vocabulary** (stored as keys; labels in the UI):

| Key | Label | Whose move | Meaning |
|---|---|---|---|
| `open` | Open | vessel | Created and saved; vessel is completing it. Autosaves. |
| `in_review` | In review | vessel | Vessel sign-off chain has started (first vessel signature placed). |
| `submitted` | Submitted to company | company | Vessel sent it ashore (incident initial report, CA / HESS / medical case after the last vessel signature). |
| `acknowledged` | Acknowledged | thread-derived | Company has acknowledged; investigation / follow-up continues. |
| `info_requested` | Further information required | vessel | Company returned it to the vessel with a reason. |
| `awaiting_company_close` | Awaiting company sign-off | company | Vessel has completed and signed; only the company can close. |
| `closed` | Closed | — | Final. Read-only except company "Reopen" (where the kind allows) and new links. |
| `void` | Voided | — | Replaces delete after submission: reason required, company actor only, record kept (per kind delete rule, DECISIONS D-32). |

Not every kind uses every state (see each workflow). The transition table and its guards live in one SQL function (`safety_record_transition(record_id, action, payload)`), in the style of `form_submissions_before_write()`: identity, company, vessel, status, timestamps and actor are set by the server; the client only names the action.

**Whose move** is computed, not stored by the client:
- `company` when status ∈ {`submitted`, `awaiting_company_close`}, or the newest thread entry is a vessel reply to a still-open company request;
- `vessel` when status ∈ {`open`, `in_review`, `info_requested`}, or a company request is open without a vessel reply;
- otherwise the side that did not post last; `none` when closed or void.

**Follow-up due** = earliest due date of open requests. **Age** = days since opened (list) and days since last activity (stalled check).

**Status thread** (`safety_record_updates`, append-only): entry types `update` (free text, optional follow-up date), `request` (company asks the vessel for something by a date), `reply` (vessel answer to a request), `system` (status changes, nudges, signature events). On a request, the company can **Mark done**, **Change date** (reason) or **Cancel request**; the vessel can **Reply**. A record cannot be closed while a request is open. Edits are new entries that reference the old one. Every entry emails the vessel's safety subscribers and the company safety recipients (batched 15 min), with the record link and a 200-character excerpt (T-252).

**Snapshots.** Submitting, closing and reopening each write a `safety_record_snapshots` row (full JSON of the record and its children + sha256). "View as submitted" shows snapshot 1; PDFs print the hash of the snapshot they were rendered from.

**Company actor.** Every company action requires `is_company_actor(auth.uid(), vessel_id)` (owner, or admin whose reach includes the vessel; doc 01 W10), checked in the RPC, never only in the UI (T-78). Shore staff can read and post updates but cannot acknowledge, sign off or close.

**Nudge** (T-131): the company can nudge any record waiting on the vessel for more than 2 days; it posts a `system` entry and emails the assignee / current signer. Automatic reminder emails go out the day a follow-up date falls due and every 3 days after while it stays open.

### Signature slots

The signature engine (signatures doc) provides Sign as / Someone else signing? / Pass to / witnessed pad / Remove. This table defines the slots, who can fill them (resolved with `vessel_office_holders()` for the record's vessel at signing time) and what the last slot triggers. Order is enforced; removal is reverse order only; a vessel slot cannot be removed after the company has acknowledged unless the company first returns the record.

| Record | Slots in order | Eligible signer | Triggered by the slot |
|---|---|---|---|
| Incident — vessel final review | 1 Safety Officer or HoD of the area · 2 Master | Designated Safety Officer / HoD on board; Master of this vessel | Slot 2 → `awaiting_company_close` |
| Incident — company | Close on behalf of the company (with close-as and root cause) | Company actor | → `closed` |
| Corrective action | 1 Completed by Safety Officer / HoD · 2 Reviewed by Master · 3 Company sign-off | as named; company actor for 3 | 1 → `in_review`; 2 → `awaiting_company_close` (auto-submit); 3 → `closed` |
| Medical case | 1 Master or Medical person in charge · 2 Company closure | Master / designated Medical role (medical capability); company actor with medical access | 1 → `awaiting_company_close`; 2 → `closed` |
| HESS meeting | 1 Secretary · 2 Chairman · 3 Company sign-off | **The people named in the header** (a different signer must use the witnessed method and is recorded as such) | 2 → `awaiting_company_close`; 3 → `closed` |
| Handover checklist | 1 Outgoing officer · 2 Incoming officer (acceptance) · 3 Master approval | Named outgoing / incoming person; Master. For the Master's handover, slot 3 is skipped (incoming Master's acceptance is the approval) | Last slot → `closed` (or `awaiting_company_close` if the template requires company acknowledgement) |
| Template form (generic) | As configured on the template (vessel offices) + optional company sign-off | Office holders | Last vessel slot → `closed` or `awaiting_company_close` |
| Permit — opening | CP (+ each additional CP), then AO | AO ≠ any CP ≠ creator (SOD-12); AO must hold the AO competency (crew flag) | AO slot → `active`, valid-from stamped if empty |
| Permit — handover | Incoming AO | Not the outgoing AO | Current AO switches |
| Permit — closing / withdrawal | Current AO | Current AO | → `closed` / `withdrawn` |
| Risk assessment | 1 Assessed by (+ competency text) · 2 HoD or Captain · 3 Company decision | Assessor = any crew with RA write; HoD of the activity's department or the Master; company actor | 1 → `awaiting_hod_captain`; 2 → `awaiting_company`; 3 → `completed` / `rejected` |
| Drill record | Completed by (officer in charge) | Crew with drills write | → `completed` |
| Emergency | Stand down by Master | Master on board | → `stood_down` |

### W1. Incident (§6.4, T-69, T-78)

```
open ──Submit initial report (checklist clear)──▶ submitted ──Acknowledge (company)──▶ acknowledged
  │                                                │                                     │  vessel completes final review
  │ Delete (only here)                             │ Close as "raised in error" /        │  SO/HoD signs → Master signs
  ▼                                                │ "duplicate" (company)               ▼
 (gone)                                            └────────────────▶ closed ◀── Close (company) ── awaiting_company_close
                                                                       │ Reopen (company, reason) ─▶ acknowledged
              submitted / acknowledged / awaiting_company_close ── Return to vessel (reason) ─▶ info_requested ── vessel re-signs ─▶ awaiting_company_close   (DECISIONS D-30)
```

- **Create**: anyone with `vessel.safety.incidents.create` (crew can report; T-287 observations are the lighter path). Safety Officer defaults to the designated holder.
- **Submit initial report** requires: classification, at least one effect, at least one contributing factor, date, time, UTC offset, position, narrative; if any involved person is marked injured, an outcome for that person. The submit panel lists what is missing. Submitting freezes the initial-details section (snapshot 1); later facts go into the update thread, the repeaters and the final review (T-69: "add updates, don't overwrite"). Posts "Initial incident report submitted to the company" in the thread. Notifies company safety recipients immediately.
- **Acknowledge**: company actor; stamps "Acknowledged by the company — name, time".
- **Vessel final review** (section unlocks after acknowledgement): immediate cause, root / underlying causes, contributing factors confirmed, corrective and preventive actions (each a linked CA or "no action, because…"), lessons learned, reviewed by the vessel safety committee (yes / no + HESS link), "all evidence attached" confirmation. Then slots SO / HoD → Master. Master's signature moves it to `awaiting_company_close`.
- **Close** (company actor): root cause confirmed (saved against the closer's name, then locked), close-as ∈ {closed after review, raised in error — no incident, duplicate of `<reference>` (link required)}. Blocked while a status request is open. "Closed after review" needs the vessel final review signed, so it is offered only from `awaiting_company_close`; "Raised in error" and "duplicate" may close straight from `submitted` or `acknowledged` without vessel signatures (DECISIONS D-30). Closing writes snapshot n ("closed review version").
- **Return to vessel** (company actor, reason): from `submitted`, `acknowledged` or `awaiting_company_close`; the cycle's vessel signatures are superseded and the record comes back through the vessel signature chain to `awaiting_company_close`, not to the previous state (DECISIONS D-30).
- **Reopen** (company actor, reason): back to `acknowledged`; vessel final-review signatures are invalidated (new signing cycle); a new closed version is produced on the next close.
- **Linked CAs**: closing with open linked CAs is allowed but shows a warning list (open question Q1).
- **Reporting & notifications block**: shows the vessel flag's reporting profile (SET4): which categories this incident may fall under (derived from classification, effects and injuries), deadlines counted from the incident time, recipients. The company records each notification made (recipient, method, sent at, by, reference, response, attachments). STORM never sends to an authority by itself; it can prepare a draft (T-69).
- **Delete**: only while `open`, by the creator or a safety editor. After submission: no delete; company can `void` with a reason (kept, hidden from KPIs); the vessel never voids an incident (`delete_rule = never_after_submit`, DECISIONS D-32).
- **Notifications**: submitted → company safety recipients (immediately); acknowledged / returned / closed / reopened → vessel safety subscribers (immediately); thread entries (batched 15 min); follow-up due (daily); flag-reporting deadline approaching (1 h and 24 h before, company).

### W2. Corrective action (§6.5)

```
open (type chosen; type locked on first save)
  ├─ plan confirmed (stamp, not a status: action text + plan due by + responsible person required)
  ├─ verification section completed (method, verified by, date, effectiveness review choice)
  └─ SO/HoD signs ─▶ in_review ─ Master signs (auto-submit) ─▶ awaiting_company_close
        awaiting_company_close ─ Acknowledge (company, optional stamp) ─ Sign off & close ─▶ closed
        awaiting_company_close ─ Return to vessel (reason) ─▶ info_requested ─ vessel edits & re-signs ─▶ awaiting_company_close
        closed ─ Remove company signature (company, reason) ─▶ awaiting_company_close
```

- The first vessel signature requires: description, severity, plan due by, confirmed plan, verification method / by / date and the effectiveness-review choice. Banner text explains the order ("Waiting for the Master's signature — sign-off steps are completed in order").
- Priority is pre-selected from type (SET3 default: condition of class and defective critical equipment → urgent; non-conformity, deficiency, security defect → major; defect, observation → minor) and stays editable before the first signature. Urgent CAs feed the Summary banner and the Urgent Actions tile.
- **Overdue** = plan due by passed and not closed; shown as a chip; "Corrective action overdue" digest (daily) to the responsible person and vessel subscribers.
- **Effectiveness review = yes, in N months**: on close, create a dated follow-up (calendar + reminder to the Safety Officer). Answer "effective / not effective"; "not effective" raises a new CA linked to this one.
- **Company assistance / notify authorities**: recorded on the form; ticking an authority adds a pending row in the notification log for the company to complete.
- **Delete**: only while `open` and unsigned (creator or safety editor). Afterwards `void` (company actor, reason).
- **Notifications**: CA activity (batched 15 min) to vessel subscribers; awaiting company sign-off → company (immediately); returned / closed → responsible person and subscribers.

### W3. Medical case (§6.27, T-42)

```
open ─ treatment log entries (append-only) ─ outcome recorded ─ notifications done (if triggered)
     ─ Master / MPIC signs ─▶ awaiting_company_close ─ company closure checklist + sign ─▶ closed
     company can Return to vessel (reason) ─▶ info_requested
```

- **Open** from SMS Forms or from an incident's involved person (pre-fills patient, onset and incident link). Reference `CASE-<VSL>-<YYYY>-<nnn>` plus an optional title (T-42).
- **Triggers** (shared with doc 02 W5): not fit for duty 24–72 h → "Company review required" flag; not fit > 72 h or signed off on medical leave, or severity serious / life-threatening / fatal, or notifiable disease → "Flag notification may be required" prompt with the flag profile's categories and deadline. The company drafts the communication from neutral case facts; **the person's name is excluded unless the company ticks "include name"**; STORM never sends it. The action is closed by recording sent date, sender, recipient, reference and any response.
- **Treatment log** entries are append-only (author, time, text, optional attachment); corrections are new entries that point to the corrected one.
- **Access**: case and patient panel need `medical` capability (T3, `medical_can_view`); every open of the record writes `hw_record_access_log`. An incident shows only "Medical case CASE-… · open / closed" to users without medical access (T-69).
- **Close**: company actor with medical access completes the closure checklist (SET5) and signs.
- **Delete**: only `open` with no log entries; otherwise `void` by a medical admin with reason.
- **Notifications**: other SMS form activity (batched 15 min) limited to medical-capable recipients; trigger prompts → company medical recipients immediately; email bodies never contain clinical text, only the case link.

### W4. HESS meeting (§6.6, T-70, T-314)

```
open (imports run on create; "Refresh imports" until first signature)
 ─ Secretary signs ─▶ in_review ─ Chairman signs (auto-submit) ─▶ awaiting_company_close
 ─ company comments + Sign off & close ─▶ closed
 awaiting_company_close ─ Return to vessel (reason) ─▶ info_requested (signatures cleared, new cycle)
 in_review / awaiting_company_close (before acknowledgement) ─ vessel "Withdraw to edit" (reason) ─▶ open (new cycle)
```

- **Header**: meeting number automatic per vessel and year; chairman and secretary chosen from onboard crew (defaults: Master, Safety Officer); attendees multi-select of onboard crew plus free-text guests; no apologies list (T-70).
- **Imports** (each item keeps a link to its source): open action items from the previous meeting (matters arising); incidents, near misses and observations since the last meeting with their CA cards; open SMS amendment requests; certificate and crew document expiries in the next 90 days; drills done and missed (title and date, expand for detail); fleet documents and circulars published since the last meeting; open "matters requiring company response" from last time.
- **Items**: numbered per section, department tag, raised by, action text, owner (person), due date, status (open / in progress / done / carried forward). Items can be moved between sections while the record is editable (T-314).
- **Closing a meeting** carries every not-done item into the next meeting's matters arising.
- **Cadence**: one meeting per calendar month per vessel (SET1); "HESS meeting due / overdue" weekly digest (Mon); company sign-off expected within 42 days of the meeting date (fleet report column).
- **Delete**: only `open` and unsigned. **Notifications**: awaiting company sign-off → company (immediately); returned / closed → secretary and chairman.

### W5. Handover checklist (§5.2.13, §6.6)

- Open (by outgoing officer, from SMS Forms or prompted by a planned crew change of that position) → items answered (done / N/A / comment; comment required on N/A for items the template marks critical) → outgoing signs → incoming signs acceptance (contact details captured from the incoming person's profile, editable) → Master approves (skipped for the Master's own handover) → `closed`. Templates may require company acknowledgement (then `awaiting_company_close` → `closed`).
- Delete: `open` and unsigned only. Notifications: "crew handover activity" (batched) to the Master and the incoming officer.

### W6. Template-driven SMS forms (Master's review, inspection, toolbox talk, drill / training report, document change request)

- Use the existing forms engine for content (`form_submissions`), wrapped in a `safety_records` envelope for status, thread, whose move and company steps.
- Per template: signature slots by vessel office, `company_signoff` (yes / no), `raise_ca` / `raise_incident` actions, and conditional stages.
- **Document change request** (T-80, T-4): vessel submits (request type new / amend / delete, element type, document, current revision auto-filled from the library, proposed revision, marked-up file, hard copies on board yes / no + count and locations, approver) → Master or chosen responsible person approves / returns / rejects → company acknowledges and assigns an action owner (DPA, technical superintendent or operations) → company uploads / amends / withdraws the document in the library → **only if hard copies exist**, a vessel task "new copies placed, superseded copies withdrawn" must be completed → company sign-off → closed. Open requests are imported into HESS.

### W7. Safety observation (T-287)

```
submitted ─ Safety Officer reviews ─▶ under_review ─ action needed ─▶ action_required (CA raised / assigned) ─ actions verified ─▶ closed
submitted / under_review ─ Escalate to incident ─▶ closed (escalated, link to the new incident draft)
submitted / under_review ─ No action needed (reason) ─▶ closed
```

- Any crew member on the vessel can submit (capability `vessel.safety.observations.create`, granted to every crew Access Set, independent of incident access). The reporter sees their own observations and status (`view_own`); the Safety Officer and Master see all; the company sees all for vessels in reach.
- **Confidential option**: the reporter's identity is stored but hidden from everyone except the reporter (no role can reveal it in the UI; see Q5).
- Delete: none after submit; Safety Officer can close as duplicate.
- Notifications: new observation → Safety Officer and Master (immediately); status changes → reporter.

### W8. Permit to work (§6.7, §6.32, T-294)

```
draft ─ checklists, isolations, readings, notifications complete ─ CP(s) sign ─ AO signs ─▶ active
active ─ Extend (AO, within type rule, fresh readings where required) ─▶ active (valid-to moved, extension logged)
active ─ AO handover (incoming AO signs) ─▶ active
active ─ post-work checklist + closure statement + AO signs ─▶ closed
active ─ valid-to passes (job) ─▶ expired_awaiting_closure ─ closure + AO signs ─▶ closed
active / expired_awaiting_closure ─ Withdraw (outstanding work, safe-condition, remaining isolations, restrictions, AO signs) ─▶ withdrawn
draft ─ Delete ─▶ (gone)
```

- **Before the first CP signature**: every preliminary and pre-work row answered (checked or N/A; N/A not allowed on rows the type marks mandatory), every section either filled or marked "section N/A" where the type allows, notifications to other parties answered, valid-from / valid-to set and `valid_to − valid_from ≤ type.max_validity` (default 24 h; end-of-working-day option), at least one gas reading for types with gas, every reading within limits and every gas meter in calibration (Q2: block or AO override with reason).
- **Type is locked** after the first signature ("withdraw it and raise a new one").
- **SOD-12**: the AO cannot be the creator or any CP; enforced in the signing RPC.
- **Conflict check**: the "no conflict with other permits" row lists permits active on the vessel at sign time; the CP confirms.
- **Extension** (T-294): only while `active`; type rule (default: one extension, up to 12 h, reason required, gas types need a reading taken within the last 30 minutes); AO signature; recorded in `permit_extensions`.
- **Closing**: all post-work rows answered, every isolation reinstated (time recorded), closure statement, AO signature. Closed permits are read-only.
- **Expiry job** every 15 min sets `expired_awaiting_closure`; "Permit to work overdue" every 2 h to AO and Master until closed or withdrawn.
- **Withdrawal** text states that withdrawal does not authorise removing isolations or returning to service; a new permit is needed to restart work.
- **Delete**: `draft` only (creator or safety editor). Signed permits can only be withdrawn.
- **Notifications**: active / closed / withdrawn → Master, OOW / EOOW group, area HoD (immediately); expiring in 60 min → AO; overdue every 2 h.

### W9. Risk assessment (§6.9, §8.5, T-33, T-34)

```
draft (no validation; "Untitled") ─ Save ─▶ open ─ ≥1 hazard with residual scores + decision + assessor signs ─▶ awaiting_hod_captain
awaiting_hod_captain ─ HoD or Captain signs ─▶ awaiting_company
awaiting_company ─ Company: Approved / Approved with conditions (+comments, one click, T-33) ─▶ completed
awaiting_company ─ Company: Not approved (+comments required) ─▶ rejected (visible as status, comment shown in summary, T-34)
rejected ─ vessel revises ─▶ open (new revision, signatures cleared)
completed ─ valid-until passes (job) ─▶ expired
completed ─ review date reached (job) ─▶ review_due
completed / review_due / expired ─ Initiate review ─▶ in_review (revision n+1 draft; revision n stays current until n+1 completes)
in_review ─ re-sign chain ─▶ completed (revision n+1 current; n superseded)
```

- **Computations**: initial / residual score = L × S; bands Low 1–3, Medium 4–9, High 10–15, Critical 16–25. Valid until: generic +12 months; task-based = task completion date; dynamic = end of the shift (date-time); emergency response +12 months (assumed; editable). Review date from the highest residual band: High / Critical +3 months, Medium +6, Low +12. Overrides need a reason and are logged.
- **Unlock rule**: summary, decision, signatures and attachments unlock when at least one hazard has residual L and S. Any hazard with "reject activity" forces the overall decision to "rejected".
- **Edits after signing (STORM decision, see Q11)**: a signed revision is locked; changes go through "Initiate review", which copies it to a new revision. This replaces the reference's "edit anyway, signature flagged stale" (§8.5).
- **Delete**: `draft` / `open` with no signatures. Completed and superseded revisions are kept.
- **Notifications**: "Risk assessment approval required" → eligible HoD / Master (immediately) and then company (immediately); decisions → assessor; review due / expiring in 30 days → assessor and Master (weekly digest).

### W10. Drills (§6.8, §5.2.10, T-44)

```
(schedule engine) ─▶ due ─ Save draft ─▶ draft ─ Complete ─▶ completed ─ Archive ─▶ archived
due ─ Complete ─▶ completed            due ─ Not applicable (reason) ─▶ not_applicable
due ─ period ends (job) ─▶ missed ─ Complete late (reason, actual date) ─▶ completed (late)
```

- **Schedule engine** per vessel drill configuration: `rolling` = next due one interval after the last completion; `calendar` = one requirement per period (month, 2 months, quarter…) from the applicable-from date. "Due any time in the month" makes monthly-or-rarer drills due at month end; weekly / fortnightly keep exact dates.
- **Rebuild schedule** (year + start month): replaces unfinished due rows from the start month; earlier unfinished rows stay and only the account owner can remove them.
- **Backdating** (T-44): setting applicable-from in the past generates past periods as `due`; each can be completed late with evidence, marked not applicable with reason, or left `missed`. Every backdate writes who / when / why to the drill audit.
- **Completion**: date and debrief required; participants limited to crew on board on that date (doc 04 onboard status); checklist ticks are guidance only; action items carry forward into the next record's "follow-ups from last drill"; each action item can be converted into a CA (T-44). One record may satisfy several drill types (multi-select); each satisfied due row closes.
- **Delete**: due rows are never deleted (N/A with reason instead); completed records archive; owner can remove unfinished rows only through a rebuild.
- **Notifications**: monthly drill reminder (first working day) to the Safety Officer; missed drill → Master and Safety Officer; feeds fleet overdue drills.

### W11. Emergency (§5.2.9, T-5, T-6)

```
Report new emergency (confirm; "this is a drill" toggle) ─▶ active ─ SITREPs (timer) ─ Master stands down ─▶ stood_down ─ company closes ─▶ closed
```

- **Initial notification** fields: emergency type (fire, flooding, collision, grounding, person overboard, medical, security, pollution, abandonment, other), time (UTC + offset), position (latest AIS, editable), weather / sea state, persons on board, injured / missing, assistance required, actions taken, next update due. Submitting notifies the company emergency team and DPA at once (email now; SMS / push when a provider exists).
- **SITREP**: append-only updates with the same headings; a reminder fires when the next update is due (default 60 min).
- **Drill mode** labels everything "EXERCISE", sends only to the drill recipients, and links to the drill record.
- **Close**: company actor; offers "Create incident report" pre-filled from the emergency (never automatic).
- **Delete**: never.

### Delete rules (STORM; stricter than the reference, §8.10)

| Record | May be deleted | After that point |
|---|---|---|
| Incident | `open` only (never submitted) | `void` by company actor with reason |
| Corrective action | `open` and unsigned | `void` by company actor |
| Medical case | `open` with no log entries | `void` by medical admin |
| HESS meeting | `open` and unsigned | `void` by company actor |
| Handover / template form | `DRAFT` / `IN_PROGRESS` (existing rule in `useDeleteSubmission`) | amendment or `void` |
| Observation | never after submit | close as duplicate |
| Permit to work | `draft` only | withdraw |
| Risk assessment | `draft` / `open` with no signatures | superseded by review; never deleted |
| Drill | due rows never; records archive | owner removes unfinished rows via rebuild |
| Emergency | never | — |

The reference allows deleting closed RAs, CAs, permits and HESS minutes. STORM keeps them as ISM records (Q4).

### Notifications (maps to the safety types in §8.9; configured in Notification Management)

| Event | Recipients (default) | Frequency |
|---|---|---|
| Incident submitted / awaiting company close | Company safety recipients | Immediately |
| Incident acknowledged / returned / closed / reopened | Vessel safety subscribers | Immediately |
| Status update, request, reply, nudge (any kind) | Vessel safety subscribers + company recipients | Batched 15 min |
| Follow-up due / overdue | Side whose move it is | Daily |
| CA activity; CA overdue | Responsible person, subscribers | Batched 15 min; daily |
| CA / HESS / medical case / template form awaiting company sign-off | Company recipients (medical-capable only for cases) | Immediately |
| Risk assessment approval required | Eligible HoD / Master, then company | Immediately |
| RA review due / expiring | Assessor, Master | Weekly (Mon) |
| Permit active / closed / withdrawn | Master, OOW / EOOW group, area HoD | Immediately |
| Permit overdue (expired awaiting closure) | AO, Master | Every 2 h |
| Drill missed; monthly drill reminder | Master, Safety Officer | Daily; monthly |
| HESS meeting due / overdue | Master, Safety Officer | Weekly (Mon) |
| New observation | Safety Officer, Master | Immediately |
| Emergency initial notification / SITREP | Company emergency team, DPA | Immediately |
| Flag reporting deadline approaching | Company recipients | 24 h and 1 h before |

---

## Data model

Existing tables are extended where they already hold the right concept; the live database has no incident, drill or form-submission rows, so columns and CHECK constraints can change without data migration.

| Entity | Key fields | Existing STORM table(s) or NEW | Notes |
|---|---|---|---|
| Safety record (envelope) | id, company_id, vessel_id, kind (`incident`, `corrective_action`, `medical_case`, `hess`, `handover`, `template_form`, `observation`), template_id (null for typed kinds), reference, title, status, sub_status, whose_move (generated), follow_up_due (generated), opened_by, opened_at, submitted_at / by, acknowledged_at / by, closed_at / by, close_outcome, close_reason, void_reason, last_activity_at, signing_cycle, confidential (bool) | NEW: `safety_records` | One row per record of any kind; numbering trigger via `format_reference()`; replaces the dead `sms_*` tables (drop them) |
| Status thread entry | id, record_id, author_id, side (`vessel` / `company` / `system`), entry_type (`update`, `request`, `reply`, `system`), body, follow_up_due, request_state (`open`, `done`, `cancelled`), parent_id, supersedes_id, created_at | NEW: `safety_record_updates` | Append-only (REVOKE UPDATE / DELETE; corrections reference `supersedes_id`) |
| Record event (audit) | record_id, actor_id, action, from_status, to_status, payload, at | NEW: `safety_record_events` | Written by trigger, like `legal_request_events` |
| Snapshot | record_id, seq, reason (`submitted`, `closed`, `reopened`), body jsonb, sha256, created_at | NEW: `safety_record_snapshots` | "View as submitted", "closed review version" |
| Record link | from_record_id / from_type+id, to_type, to_id, relation (`raised_from`, `related`, `duplicate_of`, `medical_case_of`, `escalated_to`) | NEW: `safety_record_links` | Covers links to RAs, permits, drills, audit findings, equipment |
| Attachment | record_id, storage_path, file_name, mime, size (≤ 50 MB), audience (`vessel`, `company`), uploaded_by, at | NEW: `safety_record_attachments` (+ bucket `safety-records`) | Retire bucket `incident-attachments` after copy |
| External notification log | record_id, category_key, recipient (`flag_registry`, `shipping_master`, `class`, `p_and_i`, `dpa`, `owner`, `other`), method, include_name, draft_body, sent_at, sent_by, external_ref, response, closed_at | NEW: `safety_record_notifications` | Replaces `incidents.shipping_master_*`, `dpa_notified*`; `notify-shipping-master` becomes a writer to this table (no send) |
| Code list | list (`incident_effect`, `contributing_factor`, `ca_contributing_factor`, `hazard_type`, …), code (E01, F01…), label, sort, active, company_id (null = STORM default) | NEW: `safety_codes` | Stable codes; fleet may relabel / hide |
| Incident | record_id, report_subtype (`accident`, `near_miss`, `hazardous_occurrence`), safety_officer_id, classification (`near_miss`, `minor`, `serious`, `critical`), occurred_at, utc_offset_minutes, vessel_position, area_on_board, narrative, personal_injury (generated), results_of_accident, root_cause_final, root_cause_by / at, final-review fields (immediate_cause, lessons_learned, committee_reviewed, evidence_complete), flag_profile_id | `incidents` (extend; drop `incident_type` CHECK, keep `severity_potential` as optional) | Number from envelope; `status` column retired in favour of envelope status |
| Incident effect | incident_id, code, actual_or_potential, other_text | NEW: `incident_effects` | |
| Incident factor | incident_id, code, other_text | NEW: `incident_factors` (or `incidents.contributing_factors` as code array) | Prefer a table for reporting |
| Incident repeater rows | incident_id, kind (`immediate_action`, `root_cause`, `corrective`, `preventive`), text, linked_ca_id, author, at | NEW: `incident_actions` | |
| Incident person | incident_id, person_id (`hw_people`), free_name, role_text, person_category, involvement (`involved`, `witness`), injured, outcome, medical_case_id | `incident_involved_persons` (extend; today keyed on `profiles.id` and HR-only write) or NEW `incident_persons` | Witness statements as attachments |
| Corrective action | record_id, ca_type (7), category, related_to, priority, severity, description, location_area, equipment_id / text, rca, contributing_factors (codes), additional_detail, action_text, corrective_or_preventive, raised_from, responsible_id, plan_due_by, target_completion, plan_confirmed_by / at, company_assistance, notify_authorities[], verification_method, verified_by, verified_at, effectiveness_review_months, effectiveness_result, preventive_actions_implemented | `corrective_actions` (extend; replace `action_type` / `status` CHECKs; `incident_id` / `finding_id` move to links) | Tracker number `CA-<VSL>-<YYYY>-<nnn>` |
| Medical case | record_id, patient_person_id (`hw_people`), person_category, onset_at, onset_location, fit_for_duty (`yes`, `no`, `restricted`), time_off_band (4), notifiable_disease, nature, initial_assessment, outcome, outcome_detail, severity (5), classification (8), dpa_notified_on, statutory_reports_text, closure_checklist jsonb | NEW: `medical_cases` | Clinical visits stay in `med_consultations` (link by `consultation.medical_case_id`, NEW column); retire unused `medical_reports` |
| Medical case entry | case_id, entry_type (`treatment`, `vessel_update`, `company_update`, `authority_comms`, `document`), body, author_id, at, corrects_entry_id | NEW: `medical_case_entries` | Append-only |
| HESS meeting | record_id, meeting_no, chairman_id, secretary_id, meeting_date, start_time, location, attendees (person ids + guest names), next_meeting_date, imports_refreshed_at | NEW: `hess_meetings` | |
| HESS item | meeting_id, section_key (12), item_no, text, department, raised_by, action_text, owner_id, due_date, status, source_type / source_id, carried_from_item_id | NEW: `hess_meeting_items` | |
| Handover / template form content | template_id, form_data, signatures | `form_templates`, `form_submissions`, `form_signatures` (extend: `form_submissions.safety_record_id`, template `company_signoff`, `office_slots` jsonb, `area`) | Handover header fields (port, handover at, incoming person, contact) as template header schema |
| Safety observation | record_id, category, observed_at, area / department, title, description, potential_consequence, immediate_action, suggested_action, reporter_hidden (bool), review_outcome | NEW: `safety_observations` | Reporter stored in envelope `opened_by`; masked in a view when hidden |
| Drill type (catalogue) | id, company_id (null = STORM seed), code, name, category (`solas`, `operational`, `security`, `custom`), default_frequency (`weekly`, `fortnightly`, `monthly`, `2_monthly`, `quarterly`, `4_monthly`, `6_monthly`, `annual`), schedule_mode default, regulation_ref, requirements jsonb (checklist items), optional, active | `drill_types` (extend; convert `minimum_frequency` days → enum; `category` values change) | Seed the 43 types the reference catalogue implies, starting with §5.2.6 / §5.2.10 rows |
| Vessel drill config | vessel_id, drill_type_id, enabled, applicable_from (date), frequency_override, schedule_mode_override, requirements_override, updated_by / at | NEW: `vessel_drill_configs` | Backdating audited in `safety_record_events`-style `drill_config_events` |
| Vessel drill schedule settings | vessel_id, due_any_time_in_month, last_rebuild_year, last_rebuild_from, rebuilt_by / at | NEW: columns on `vessel_safety_settings` | |
| Drill (due row + record) | vessel_id, drill_type_id, drill_number, period_start, period_end, due_date, status (`due`, `draft`, `completed`, `not_applicable`, `missed`, `archived`), na_reason, completed_at, completed_by, duration_minutes, location, scenario, checklist_answers jsonb, performance_rating, debrief, late_reason | `drills` (extend; rename semantics of `drill_date_scheduled` → `due_date`) | `DRILL-YYYY-NNN` numbering exists per vessel; switch to `format_reference()` |
| Drill record ↔ types satisfied | drill_id, drill_type_id, due_row_id | NEW: `drill_record_types` | Multi-type reports (T-44) |
| Drill action item | drill_id, text, owner_id, carried_to_drill_id, converted_ca_record_id, done_at | NEW: `drill_action_items` (replaces `drill_deficiencies`) | |
| Drill participant | drill_id, person_id, attended, role / station, comments | `drill_participants` (keep) | Key on `hw_people` / `profiles.id`, not `user_id` (imported crew have no login) |
| Permit type | id, company_id, code, name, description, content_version, schema jsonb (sections, rows, mandatory flags, N/A rules, text answers), has_gas, gas_limits jsonb, has_isolations, has_rescue_plan, operation_types[], max_validity_minutes, end_of_workday_allowed, extension_rule jsonb, active | NEW: `permit_types` | Versioned: a permit stores the `content_version` it was opened with |
| Vessel permit offering | vessel_id, permit_type_id, offered, local_code | NEW: `vessel_permit_types` | "Other permits" = types with permits but no longer offered |
| Permit | vessel_id, permit_type_id, content_version, permit_number, status (`draft`, `active`, `expired_awaiting_closure`, `closed`, `withdrawn`), work_date, location, third_party, third_party_details, third_party_supervisor, description, ao_id, cp_id, additional_cps jsonb, person_in_charge_id / name, work_team[], operation_type, answers jsonb, notifications jsonb, valid_from, valid_to, local_offset_minutes, closure_statement, withdrawal (outstanding_work, site_safe, remaining_isolations, restrictions), feedback, created_by | `work_permits` (extend heavily; drop Pending / Approved; `approved_by_id` → `ao_id`) | Signatures through the engine |
| Permit isolation | permit_id, detector_type, location, head_address, isolated_at / by, reinstated_at / by | NEW: `work_permit_isolations` | ≤ 10 per permit (CHECK via trigger) |
| Gas reading | permit_id, space, taken_at, o2_pct, lel_pct, h2s_ppm, co_ppm, co2_value, hc_value, verified_by, within_limits (generated against type limits) | NEW: `work_permit_gas_readings` | |
| Gas meter | permit_id, make, model, serial, calibration_due | NEW: `work_permit_gas_equipment` | Calibration past due flags the row |
| AO handover | permit_id, outgoing_ao_id, incoming_ao_id, handed_over_at | NEW: `work_permit_handovers` | |
| Permit extension | permit_id, from_valid_to, to_valid_to, reason, extended_by, readings_confirmed | `permit_extensions` (reuse) | |
| Risk assessment | vessel_id, reference / code, revision, supersedes_id, ra_type, category, title, assessment_date, task_description, at_risk[], valid_until, valid_until_overridden_reason, review_date, legislation[], legislation_other, content_version, status (`draft`, `open`, `awaiting_hod_captain`, `awaiting_company`, `completed`, `rejected`, `expired`, `review_due`, `in_review`, `superseded`), overall_decision, restrictions, special_precautions, company_decision, company_comments, assessor_competency | `risk_assessments` (extend) | |
| Hazard | risk_assessment_id, seq, description, hazard_types[], what_could_go_wrong, when[], likelihood_before, severity_before, likelihood_after, severity_after, residual_acceptance, alarp (generated) | `risk_assessment_hazards` (extend; `controls text[]` migrates into control areas) | Scores generated columns |
| Control area | hazard_id, seq, existing_safeguards, elimination, substitution, engineering, administrative, ppe_text, measures, ppe[], training_required, competency[], ptw_required, emergency_equipment[], responsible, implementation_date, verification_method | NEW: `risk_assessment_controls` | Hierarchy as five text fields (pass 5b), see §10.3 note |
| RA template / library | name, category, hazards jsonb | `risk_assessment_templates` (reuse) | Feeds "suggestions from past assessments" |
| Emergency | vessel_id, reference, is_exercise, emergency_type, started_at, utc_offset, position, pob, injured, missing, assistance_required, actions_taken, status (`active`, `stood_down`, `closed`), next_update_due, stood_down_by / at, closed_by / at, incident_record_id, drill_id | NEW: `emergency_incidents` | |
| SITREP | emergency_id, seq, body jsonb, author_id, at | NEW: `emergency_sitreps` | Append-only |
| Vessel safety settings | vessel_id, smm_visible, drill_due_any_time_in_month, hess_cadence, hess_company_days (42), stalled_after_days, default_permit_max_minutes | NEW: `vessel_safety_settings` | |
| Safety subscribers | vessel_id, person_id / email, side (`vessel`, `company`), kinds[] | `notification_subscriptions` (reuse if it fits; else NEW `vessel_safety_subscribers`) | Notifications doc owns the UI |
| Flag reporting profile | company_id, flag_state, guidance_ref, categories jsonb ({key, label, triggers, deadline_hours, recipients, note}), active_from | NEW: `flag_reporting_profiles` | Maintained by the fleet (DPA); not hard-coded |
| CA priority defaults / closure checklists | company_id, kind, config jsonb | NEW: `safety_form_settings` | |
| Vessel document sections / types | section, order, vessel_id (null = every vessel), types (name, current document, hidden) | doc 02's section / type tables with a vessel scope | Drives the Vessel Documents menu |

---

## Improvements over the reference

1. **No record stalls silently** (T-131). Every list shows whose move and age; the company can nudge; reminders fire on follow-up dates; the fleet Safety queue has a "stalled" tab (no activity for N days, default 5).
2. **Emails take you to the record** (T-252): direct link plus a short excerpt and the current whose-move, instead of landing on the forms list.
3. **The initial incident report is preserved** (T-69): submission freezes the initial facts and later information is added as dated updates, with a side-by-side "as submitted" view; the reference let the original be overwritten.
4. **Company sign-off is a hard gate, enforced in the database** (T-78): no SMS record reads as complete after a Master's signature alone; the status says "Awaiting company sign-off" until the company closes it.
5. **Flag reporting is configurable per flag and logged** (T-69, T-42): STORM prompts with the right categories and deadlines for the vessel's flag, drafts neutral wording without the person's name by default, and records what was actually sent. It never sends on its own.
6. **Medical privacy by design** (T-42, T-69): the incident shows only that a case exists and whether it is open; clinical text never appears in emails; every view of a case is logged.
7. **References are unique across the fleet** (T-42, T-69): `INC-DRA-2026-009` instead of a bare `INC-2026-009`, sequential per vessel and year, generated by the server.
8. **Everyone can raise a safety observation** (T-287), on a phone, optionally confidential, with its own permission, so crew report hazards without being given access to investigations.
9. **A drill matrix you can trust for audit** (T-44, T-261, T-43): calendar or rolling schedules per type, applicable-from dates (including past ones) with an audit trail, one report counting for several drills, only onboard crew selectable, action items that become corrective actions, and a one-line history.
10. **Permits match how vessels work** (T-294, T-151, T-289, T-301, T-100, T-103, T-111, T-101, T-242): controlled extension, open-permit cards that show location, task, AO and time left, bunkering and isolation (LOTO) certificates as permit types, and a fleet-editable permit catalogue so wording changes do not need a vendor ticket. The approver can never be the requester (fixes STORM's own bug and SOD-12).
11. **Risk assessments are honest about rejection and quick to approve** (T-34, T-33): "Rejected" is a status with the company comment visible, and the company decision is a single action.
12. **Signed means signed.** Instead of allowing edits after signing and flagging the signature as stale (§8.5), STORM locks signed revisions and changes go through a review that creates a new revision. Auditors see one clean chain.
13. **The signer is the person named on the form.** HESS signatures must come from the chairman and secretary named in the header; anyone else signs as witnessed and is recorded as such (fixes the §6.6 observation).
14. **HESS minutes that people read** (T-70, T-290, T-314): imports for certificate expiries and fleet circulars, compact drill lines, items assigned to people with due dates and carried forward, structured AOB, a condensed PDF, and a correction path before company close.
15. **Integrity on every export**: every safety PDF carries the content hash of the snapshot it came from and the vessel seal (the reference printed hashes only on HESS and never the seal, §8.7–8.8).
16. **Records are kept, not deleted**: closed and signed records cannot be deleted; voiding keeps the record with a reason (the reference allowed deleting closed RAs, CAs, permits and HESS minutes).
17. **Counts come from the database**: the reference's SMS Forms list could show "No submissions yet" next to existing records (§8.11).
18. **Fast crew pickers** (T-166): one searchable, alphabetical picker filtered to crew on board, used in every form.
19. **Document change requests follow the real process** (T-80, T-4): hard-copy confirmation appears only when the vessel holds copies, and open requests flow into HESS.
20. **Emergency is a live, two-way log** (T-5, T-6): initial notification and timed SITREPs with immediate company alerts, plus an exercise mode that doubles as a drill.

---

## Implementation notes

### Build order inside this domain

1. **Clean the surface (S–M).** Rewrite `vesselSafety` in `sitemap.ts` to the target tree; point PTW at the real `work_permits` page as a stop-gap; delete or unroute the mocks (`PermitsToWorkPage.tsx`, `MiscellaneousPage.tsx`, `ObservationsPage.tsx` mock data, `DrillsAnnualGrid.tsx` data, `EquipmentReadinessTab.tsx`, `SafetyDocumentVersioning.tsx` versions, `RiskAssessmentForm.tsx`, `ISM_SMS.tsx` mock fallback); fix `WorkPermitsTab.handleApprove`; drop the incidents / CAs / RAs / permits / drills DELETE policies; delete edge functions `submit-form` and `sign-submission`.
2. **Envelope engine**: `safety_records`, thread, events, snapshots, links, attachments, transition RPC, numbering, company actor checks, whose move, Safety queue RPC. Build it once and test it on corrective actions (smallest form).
3. **Incident** and **Summary** (demo-critical), then **medical case**.
4. **Drills** (catalogue, vessel config, schedule engine, matrix, completion).
5. **Permits** (type catalogue + Hot Work, ESE, Working Aloft seeds; signatures; expiry job).
6. **Risk assessments** (fields, control areas, sign-off, revisions).
7. **HESS**, **handovers / template forms**, **observations**.
8. **Emergency**, **settings**, report views, calendar feed.

### Files to reuse or extend

- `supabase/migrations/20260919210000_ism_form_workflow.sql`: copy its pattern for `safety_record_transition()` (BEFORE trigger owns identity, company, status and timestamps; RPCs are the only write path; REVOKE direct writes; CHECK-constrained vocabularies; signing cycles).
- `supabase/migrations/20260919220000_reference_numbers.sql`: `next_reference_value()` behind doc 01's `format_reference()` for INC / CA / CASE / HESS / SMS / PTW / RA / DRL / EMG.
- `src/modules/ism/forms/{components/FieldRenderer.tsx,components/FormProgressBar.tsx,hooks/useFormSubmissions.ts}`: render template forms (handovers, toolbox talk, Master's review) and the schema-driven permit checklists; `FormProgressBar` becomes the completion meter.
- `src/modules/ism/forms/components/SignaturePad.tsx`: keep only until the signatures doc's component lands.
- `src/modules/incidents/components/ReportIncidentModal.tsx`: reuse the persons / witnesses / attachments blocks inside the new incident page; `hooks/useIncidents.ts` and `useCorrectiveActions.ts`: keep query shapes, add `vesselId`, remove client numbering; `pages/IncidentAnalytics.tsx`, `CAPATracker.tsx`: feed reports.
- `src/modules/drills/hooks/useDrills.ts`, `components/{DrillScheduleTab,DrillHistoryTab,DrillDetailModal}.tsx`: vessel-scope and reuse; replace `complete-drill` with an RPC `drill_complete(drill_id, payload)` (and fix its missing company check if kept even briefly).
- `src/modules/risk-assessments/components/RiskMatrix.tsx` (fix bands, add Critical), `hooks/useRiskAssessments.ts` (permits and extensions queries), `constants.ts` (`COMMON_HAZARDS` → seed `risk_assessment_templates`).
- `src/modules/emergency/*` (contacts store, `emergency_team_members`, `fleet_emergency_team_defaults`) for emergency recipients.
- `src/modules/health/hooks/{usePatientRecord,useConsultations}.ts` and `hw_record_access_log` for the medical case patient panel and access logging.
- `src/modules/legal`: thread + event-trigger pattern (`legal_request_comments`, `legal_request_events`) for the status thread UI.
- `src/modules/red-room`: optional sink for "urgent" safety items (urgent CA, emergency active) so the global red room and the Safety banner agree.
- `src/shared/hooks/usePDFExport.ts`, `src/lib/pdf`: safety PDF templates.
- `src/modules/vessels/contexts/VesselContext.tsx` (`useVessel()`): until doc 01's `VesselScopeRoute` exists, every safety hook takes the selected vessel id.
- `supabase/functions/notify-shipping-master`: turn into a writer of `safety_record_notifications` rows (it currently marks "sent" without sending anything).
- `supabase/functions/hr-daily-sweeper`: pattern for a `safety-sweeper` job (permit expiry every 15 min; drills missed, follow-ups, RA expiry / review due daily).

### Migration notes

- One migration per step above. Drop `sms_templates`, `sms_submissions`, `sms_signatures`, `sms_attachments`, `sms_amendments` (empty, unreferenced; SYSTEM-AUDIT §2.5) in step 2 together with the two dead edge functions.
- `incidents`: drop the `incident_type` and `status` CHECKs, add the new columns, add `safety_record_id NOT NULL` (no rows exist). Same pattern for `corrective_actions`, `work_permits`, `risk_assessments`, `drills`.
- `drill_types`: add `company_id` (nullable = STORM seed), `code`, `default_frequency` enum, `requirements`, `optional`; convert the 12 seeded rows; replace `category` values (`SOLAS_Required` → `solas`, `Company_Required` → `operational`).
- RLS: replace every "Users can … in their company" policy on safety tables with capability + vessel-reach checks from doc 01 (`has_capability(uid, 'vessel.safety.<sub>.<action>', vessel_id)`). No DELETE policies except where the delete rules allow, enforced in the RPC.
- Permission catalogue (`docs/permissions/catalogues/storm.json`): add subcategories `vessel.safety.medical_cases` (T3), `vessel.safety.hess` (or reuse `safety_meetings`), `vessel.safety.handovers`, `vessel.safety.emergency` (live), `vessel.safety.settings`; give `vessel.safety.observations.create` / `view_own` to every crew Access Set; add a company tier action `company_signoff` on incidents, CAPA, medical cases, HESS, RAs; add SoD rows "RA assessor cannot be the HoD / Captain approver" and "permit CP cannot be AO".
- Jobs: permit expiry every 15 min; drills missed, follow-up reminders, RA expiry and review due, HESS due daily; flag deadline reminders every 15 min while open.
- Storage: new private bucket `safety-records` with policies keyed on the record's vessel reach; copy then retire `incident-attachments`.

### Pitfalls

- `complete-drill` updates any drill id without checking its company (cross-tenant write) and gates on legacy `profiles.role`; do not wire the UI to it as is.
- `WorkPermitsTab.handleApprove` writes the requester as approver; any data created through it is invalid evidence.
- Two risk bandings in the code (`getRiskLevel()` and the blueprint); centralise one function in SQL and TS and test the boundaries 3/4, 9/10, 15/16.
- `drills.minimum_frequency` is in days and `drill_participants.user_id` keys on logins; imported crew have no login (doc 04 finding 7). Key participation on `profiles.id` / `hw_people.id`.
- Time: incidents need the instant **and** the vessel's UTC offset at the time; permits display local validity (store instant + offset, as `form_submissions.vessel_local_offset_minutes` already does). Never compute "end of working day" in the browser's time zone.
- `form_user_satisfies_signer_role()` matches by role name across the company; safety slots must use `vessel_office_holders()` for the record's vessel (doc 01 F33).
- The forms engine locks submissions on SIGNED; when a template form sits inside an envelope that goes to the company, keep the content lock and drive company steps on the envelope only, so the two status machines do not fight.
- Seed content: write checklist and code-list labels in the fleet's own words (the fleet edits them later); do not copy the reference app's wording verbatim. Do not seed named people anywhere (the mocks being deleted contain invented names).
- Medical: never join clinical fields into list RPCs used by non-medical users; build a masked view for the incident panel.
- Summary KPIs and fleet panels must call the same RPCs, or the numbers drift (the reference showed different vessel counts in different views, §7.13).

---

## Open questions

1. **Incident close with open linked CAs**: block closing, or allow with a warning list (proposed: allow with warning, because CAs often outlive the investigation)?
2. **Out-of-limit gas readings or an out-of-calibration meter**: hard block on the AO opening signature, or allow an AO override with a recorded reason?
3. **Permit extension rule default**: one extension of up to 12 h (T-294), or several extensions up to a maximum total validity? Per type?
4. **Deletion**: should the account owner keep any hard-delete for closed safety records (the reference allows it), or is void-only final? What retention period applies to SMS records and medical cases?
5. **Confidential observations**: is a reporter's identity hidden from everyone including the company, and is there ever a route to reveal it (e.g. for a serious allegation)?
6. **HESS cadence and company deadline**: confirm monthly meetings per vessel and the 42-day company sign-off target; do any vessels run a different cadence?
7. **Handovers needing company acknowledgement**: should the Master's handover (and Chief Engineer's) also require company acknowledgement?
8. **Drill schedule default**: rolling from last completion (reference) or calendar periods (T-44) as the default for SOLAS drills?
9. **Master's access to medical detail**: can the Master read clinical case content by default, and edit it (this is also listed in the permissions addendum's decisions)?
10. **Flag profiles at launch**: Cayman (guidance referenced in T-42 / T-69) is confirmed; which other flags in the fleet need a profile on day one?
11. **Risk assessment edits after signing**: confirm STORM's lock-and-revise model instead of the reference's edit-and-flag model.
12. **CA priority defaults by type**: confirm the proposed mapping (condition of class and defective critical equipment urgent; non-conformity, deficiency, security defect major; defect, observation minor).
13. **Emergency triggering and channels**: who may raise a live emergency (any crew, or officers only), and is an SMS / push provider in scope for the first release?
